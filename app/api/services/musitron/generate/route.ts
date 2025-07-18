import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMusitronDb } from '@/lib/musitron-mongo';
import { MusitronTask, IMusitronTask } from '@/schemas/Musitron';
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

const musitronConfig = getServiceConfig('musitron');

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { customMode, title, instrumental, songDescription, style, lyrics } = body;

  // Validate required fields
  if (!title || typeof instrumental !== 'boolean' || typeof customMode !== 'boolean') {
    return new NextResponse('Missing required fields', { status: 400 });
  }
  if (customMode && (!style || !lyrics)) {
    return new NextResponse('Missing required fields for custom mode', { status: 400 });
  }
  if (!customMode && !songDescription) {
    return new NextResponse('Missing required fields for simple mode', { status: 400 });
  }

  // Usage check (replace with Musitron-specific limit check if available)
  // If you have a Musitron-specific limit check, use it here. Otherwise, skip for now.

  await getMusitronDb();

  // Count tasks for title generation
  const taskCount = await MusitronTask.countDocuments({ userId });
  const generatedTitle = title || `Music #${taskCount + 1}`;

  let newTask;
  try {
    newTask = new MusitronTask({
      userId,
      title: generatedTitle,
      status: 'queued',
      createdAt: new Date(),
      options: {
        customMode,
        title: generatedTitle,
        instrumental,
        ...(songDescription && { songDescription }),
        ...(style && { style }),
        ...(lyrics && { lyrics }),
      },
    });
    await newTask.save();
  } catch (saveError: any) {
    console.error('Error saving Musitron task:', saveError);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  // Prepare PubSub message
  const pubsubMessage = {
    taskId: newTask._id.toString(),
    userId,
    options: newTask.options,
  };

  // Publish to local worker or PubSub
  try {
    if (process.env.MUSITRON_LOCAL_WORKER) {
      const data = Buffer.from(JSON.stringify(pubsubMessage)).toString('base64');
      await fetch(process.env.MUSITRON_LOCAL_WORKER, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            data: data,
            attributes: {}
          },
          subscription: 'projects/test/subscriptions/test-sub'
        }),
      });
    } else {
      if (!musitronConfig.pubsubTopic) {
        console.error('Missing Musitron Pub/Sub topic ID in service configuration');
        return new NextResponse('Server configuration error', { status: 500 });
      }
      await pubsub.topic(musitronConfig.pubsubTopic).publishMessage({ json: pubsubMessage });
    }
  } catch (pubsubError: any) {
    console.error('Error publishing Musitron task:', pubsubError);
    // Optionally update task status to failed
    await MusitronTask.findByIdAndUpdate(newTask._id, {
      status: 'failed',
      error_message: 'Failed to process task due to an internal error. Please try again later.',
    });
    return new NextResponse('Task processing failed', { status: 500 });
  }

  return NextResponse.json({ taskId: newTask._id.toString() });
}