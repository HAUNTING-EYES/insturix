import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMusitronDb } from '@/lib/musitron-mongo';
import { MusitronTask } from '@/schemas/Musitron';
import { PubSub } from '@google-cloud/pubsub';
import { getServiceConfig } from '@/lib/config/services';

const gcpCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
  : null;

if (!gcpCredentials) {
  console.error('GOOGLE_CLOUD_CREDENTIALS environment variable is not configured or invalid.');
}

const pubsub = new PubSub({
  projectId: gcpCredentials?.project_id,
  credentials: gcpCredentials,
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { title, instrumental, songDescription, style, lyrics, duration } = body;

  // Validate required fields
  if (!title || typeof instrumental !== 'boolean') {
    return new NextResponse('Missing required fields', { status: 400 });
  }
  if (!instrumental && !lyrics) {
    return new NextResponse('Missing required fields: lyrics required if not instrumental', { status: 400 });
  }
  if (!style) {
    return new NextResponse('Missing required fields: style', { status: 400 });
  }

  // Usage check (Musitron-specific)
  const { checkMusitronLimits, incrementMusitronUsage } = await import('@/lib/middleware/services/musitron');
  const limitResult = await checkMusitronLimits({ userId });
  if (!limitResult.hasAccess) {
    return new NextResponse('Usage limit exceeded', { status: 403 });
  }

  await getMusitronDb();

  // Count tasks for title generation
  const taskCount = await MusitronTask.countDocuments({ userId });
  const generatedTitle = title || `Music #${taskCount + 1}`;

  let newTask;
  try {
    newTask = new MusitronTask({
      clerkUserId: userId,
      title: generatedTitle,
      status: 'listed',
      createdAt: new Date(),
      instrumental_only: instrumental,
      style,
      lyrics: lyrics || "",
      // Optionally include songDescription if your schema supports it
      ...(songDescription && { songDescription }),
    });
    await newTask.save();
  } catch (saveError: any) {
    console.error('Error saving Musitron task:', saveError);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  // Increment usage after task creation
  const usageResult = await incrementMusitronUsage({ userId });
  if (!usageResult.success) {
    console.error('Failed to increment musitron usage:', usageResult.error);
    // Don't fail the request, just log for monitoring
  }

  // Call monolithic backend directly
  try {
    const monolithicUrl = process.env.MONOLITHIC_BACKEND_URL;
    if (!monolithicUrl) {
      console.error('MONOLITHIC_BACKEND_URL environment variable is not set.');
      return new NextResponse('Server configuration error', { status: 500 });
    }
    const response = await fetch(`${monolithicUrl}/musitron/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskId: newTask._id.toString(),
        userId,
        options: {
          title: newTask.title,
          instrumental: newTask.instrumental_only,
          style: newTask.style,
          lyrics: newTask.lyrics,
          ...(duration && { duration })
        }
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error from monolithic backend:', errorText);
      await MusitronTask.findByIdAndUpdate(newTask._id, {
        status: 'failed',
        error_message: 'Failed to process task in monolithic backend. Please try again later.',
      });
      return new NextResponse('Task processing failed', { status: 500 });
    }
  } catch (monolithError: any) {
    console.error('Error calling monolithic backend:', monolithError);
    await MusitronTask.findByIdAndUpdate(newTask._id, {
      status: 'failed',
      error_message: 'Failed to process task due to an internal error. Please try again later.',
    });
    return new NextResponse('Task processing failed', { status: 500 });
  }

  return NextResponse.json({ taskId: newTask._id.toString() });
}