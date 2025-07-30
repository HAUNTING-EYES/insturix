import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkMusitronLimits, incrementMusitronUsage } from '@/lib/middleware/services/musitron';

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
  const limitResult = await checkMusitronLimits({ userId });
  if (!limitResult.hasAccess) {
    return new NextResponse('Usage limit exceeded', { status: 403 });
  }

  // Increment usage BEFORE calling monolithic backend to ensure proper limit enforcement
  const usageResult = await incrementMusitronUsage({ userId });
  if (!usageResult.success) {
    console.error('Failed to increment musitron usage:', usageResult.error);
    // Don't start the task if usage increment fails
    return new NextResponse('Unable to process request. Please try again later.', { status: 403 });
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
        'Authorization': `Bearer ${process.env.MONOLITHIC_BACKEND_SECRET}`,
      },
      body: JSON.stringify({
        clerkUserId: userId,
        title,
        style,
        instrumental_only: instrumental,
        lyrics: lyrics || "",
        ...(duration && { duration }),
        ...(songDescription && { songDescription })
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error from monolithic backend:', errorText);
      return new NextResponse('Task processing failed', { status: 500 });
    }
  } catch (monolithError: any) {
    console.error('Error calling monolithic backend:', monolithError);
    
    // Refund usage if task processing failed
    const refundResult = await incrementMusitronUsage({ userId });
    if (!refundResult.success) {
      console.error('Failed to refund musitron usage:', refundResult.error);
    }
    
    return new NextResponse('Task processing failed', { status: 500 });
  }

  return NextResponse.json({ 
    taskId: new Date().getTime().toString() 
  });
}