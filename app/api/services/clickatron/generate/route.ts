import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkClickatronLimits, incrementClickatronUsage, createClickatronLimitResponse } from '@/lib/middleware/services/clickatron';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  console.log('Received body:', JSON.stringify(body, null, 2));

  const { details } = body;

  if (
    !details ||
    (typeof details === 'string' && details.trim().length === 0) ||
    (typeof details === 'object' && Object.keys(details).length === 0)
  ) {
    return new NextResponse('Missing or empty details', { status: 400 });
  }

  // Robust string conversion with sanitization
  let detailsString: string;
  
  try {
    if (typeof details === 'string') {
      detailsString = details;
    } else if (typeof details === 'object') {
      detailsString = JSON.stringify(details);
    } else {
      detailsString = String(details);
    }
    
    // Additional sanitization to ensure it's a valid string
    detailsString = detailsString.replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
    
    console.log('Final detailsString:', detailsString);
  } catch (error) {
    console.error('Error processing details:', error);
    return new NextResponse('Invalid details format', { status: 400 });
  }

  const limitResult = await checkClickatronLimits({ userId });
  if (!limitResult.hasAccess) {
    return createClickatronLimitResponse(limitResult);
  }

  // Increment usage BEFORE calling monolithic backend to ensure proper limit enforcement
  const usageResult = await incrementClickatronUsage({ userId });
  if (!usageResult.success) {
    console.error('Failed to increment clickatron usage:', usageResult.error);
    // Don't start the task if usage increment fails
    return new NextResponse('Unable to process request. Please try again later.', { status: 403 });
  }

  // New try-catch block for post-save operations
  let backendData: any;
  
  try {
    // Call monolithic backend directly
    try {
      const monolithicUrl = process.env.MONOLITHIC_BACKEND_URL;
      if (!monolithicUrl) {
        console.error('MONOLITHIC_BACKEND_URL environment variable is not set.');
        return new NextResponse('Server configuration error', { status: 500 });
      }
      const response = await fetch(`${monolithicUrl}/clickatron/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MONOLITHIC_BACKEND_SECRET}`,
        },
        body: JSON.stringify({
          taskId: new Date().getTime().toString(),
          userId,
          details: detailsString,
        }),
      });
      backendData = await response.json();
      
      if (!response.ok || !backendData.success) {
        const errorType = backendData.error?.type || 'UNKNOWN_ERROR';
        const errorMessage = backendData.error?.message || 'Task processing failed';
        console.error('Error from monolithic backend:', backendData);
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
      return NextResponse.json({
        success: false,
        error: {
          type: 'MONOLITHIC_BACKEND_ERROR',
          message: 'Task processing failed'
        }
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, taskId: backendData.taskId });

  } catch (processingError: any) {
    console.error('Error during task processing (Monolithic Backend/Usage Increment):', processingError);
    return new NextResponse('Task processing failed', { status: 500 });
  }
}