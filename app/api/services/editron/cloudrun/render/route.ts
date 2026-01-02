import { NextResponse } from 'next/server';
import { renderMediaOnLambda } from '@remotion/lambda/client';
import { auth } from '@clerk/nextjs/server';
import { createJob } from '@/lib/editron/services/render-job-service';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { type: 'error', message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { inputProps, compositionId, projectId } = body;

    // AWS Lambda configuration from environment
    const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
    const serveUrl = process.env.REMOTION_LAMBDA_SERVE_URL;
    const region = (process.env.REMOTION_AWS_REGION || 'us-east-1') as 
      'us-east-1' | 'us-east-2' | 'us-west-1' | 'us-west-2' | 
      'eu-central-1' | 'eu-west-1' | 'eu-west-2' | 'ap-south-1' | 
      'ap-southeast-1' | 'ap-southeast-2' | 'ap-northeast-1';

    if (!functionName) {
      throw new Error('REMOTION_LAMBDA_FUNCTION_NAME is not defined');
    }
    if (!serveUrl) {
      throw new Error('REMOTION_LAMBDA_SERVE_URL is not defined');
    }

    // Set AWS credentials for the Lambda client
    process.env.AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID;
    process.env.AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;

    console.log('Triggering distributed render on Lambda:', functionName);
    console.log('Composition:', compositionId || 'TestComponent');
    console.log('Region:', region);

    // Start the render on Lambda
    const { bucketName, renderId } = await renderMediaOnLambda({
      region,
      functionName,
      serveUrl,
      composition: compositionId || 'TestComponent',
      inputProps: inputProps || {},
      codec: 'h264',
      privacy: 'public', // Make the video publicly accessible
      // Distributed rendering settings
      framesPerLambda: 600, // High value to use only ~3 Lambdas (AWS new account limit is 10)
      timeoutInMilliseconds: 240000, // 4 minutes
    });

    console.log('Lambda render started:', { renderId, bucketName });

    // Save job to database for persistence (wrapped in try-catch)
    try {
      await createJob(renderId, userId, projectId || 'unknown', bucketName);
      console.log('Render job saved to database:', renderId);
    } catch (dbError) {
      console.error('Failed to save render job to DB:', dbError);
      // Don't fail the request, just log the error
    }

    // Return the render ID and bucket info
    return NextResponse.json({
      type: 'success',
      data: {
        renderId,
        bucketName,
        region,
        functionName,
        // Progress endpoint for polling
        progressUrl: `/api/services/editron/cloudrun/progress?renderId=${renderId}&bucketName=${bucketName}&region=${region}`,
      }
    });
  } catch (error: any) {
    console.error('Lambda render error:', error);
    return NextResponse.json(
      { 
        type: 'error', 
        message: error.message || 'Failed to trigger render' 
      },
      { status: 500 }
    );
  }
}
