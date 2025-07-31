import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkMusitronLimits, incrementMusitronUsage } from '@/lib/middleware/services/musitron';

interface MusitronGenerateRequest {
  clerkUserId: string;
  title: string;
  style: string;
  instrumental_only: boolean;
  lyrics: string;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { title, instrumental, songDescription, style, lyrics, duration } = body;

  // Validate required fields
  if (!title) {
    return NextResponse.json(
      { error: 'Missing required field: title' },
      { status: 400 }
    );
  }
  if (typeof instrumental !== 'boolean') {
    return NextResponse.json(
      { error: 'Missing required field: instrumental must be a boolean' },
      { status: 400 }
    );
  }
  if (!style) {
    return NextResponse.json(
      { error: 'Missing required field: style' },
      { status: 400 }
    );
  }
  if (!instrumental && !lyrics) {
    return NextResponse.json(
      { error: 'Missing required field: lyrics required if not instrumental' },
      { status: 400 }
    );
  }

  // Usage check (Musitron-specific)
  const limitResult = await checkMusitronLimits({ userId });
  if (!limitResult.hasAccess) {
    return NextResponse.json(
      { error: 'Usage limit exceeded' },
      { status: 403 }
    );
  }

  // Increment usage BEFORE calling monolithic backend to ensure proper limit enforcement
  const usageResult = await incrementMusitronUsage({ userId });
  if (!usageResult.success) {
    console.error('Failed to increment musitron usage:', usageResult.error);
    // Don't start the task if usage increment fails
    return NextResponse.json(
      {
        error: 'Unable to process request. Please try again later.',
        success: false
      },
      { status: 403 }
    );
  }

  // Call monolithic backend directly
  let backendData: any;
  
  try {
    const monolithicUrl = process.env.MONOLITHIC_BACKEND_URL;
    if (!monolithicUrl) {
      console.error('MONOLITHIC_BACKEND_URL environment variable is not set.');
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }
    
    // Create properly typed request body using the interface
    const generateRequest: MusitronGenerateRequest = {
      clerkUserId: userId,
      title,
      style,
      instrumental_only: instrumental,
      lyrics: lyrics || "",
    };
    
    const response = await fetch(`${monolithicUrl}/musitron/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MONOLITHIC_BACKEND_SECRET}`,
      },
      body: JSON.stringify(generateRequest),
    });
    backendData = await response.json();
    
    if (!response.ok || !backendData.success) {
      const errorType = backendData.error?.type || 'UNKNOWN_ERROR';
      const errorMessage = backendData.error?.message || 'Task processing failed';
      console.error('Error from monolithic backend:', backendData);
      
      // Refund usage if task processing failed
      const refundResult = await incrementMusitronUsage({ userId });
      if (!refundResult.success) {
        console.error('Failed to refund musitron usage:', refundResult.error);
      }
      
      return NextResponse.json({
        success: false,
        error: {
          type: errorType,
          message: errorMessage
        }
      }, { status: 500 });
    }
  } catch (monolithError: any) {
    console.error('Error calling monolithic backend:', monolithError);
    
    // Refund usage if task processing failed
    const refundResult = await incrementMusitronUsage({ userId });
    if (!refundResult.success) {
      console.error('Failed to refund musitron usage:', refundResult.error);
    }
    
    return NextResponse.json({
      success: false,
      error: {
        type: 'MONOLITHIC_BACKEND_ERROR',
        message: 'Task processing failed'
      }
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    taskId: backendData.taskId
  });
}