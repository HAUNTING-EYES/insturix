import { NextResponse } from 'next/server';
import { getRenderProgress } from '@remotion/lambda/client';
import { 
  updateJobProgress, 
  completeJob, 
  failJob 
} from '@/lib/editron/services/render-job-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const renderId = searchParams.get('renderId');
    const bucketName = searchParams.get('bucketName');
    const region = searchParams.get('region') as 
      'us-east-1' | 'us-east-2' | 'us-west-1' | 'us-west-2' | 
      'eu-central-1' | 'eu-west-1' | 'eu-west-2' | 'ap-south-1' | 
      'ap-southeast-1' | 'ap-southeast-2' | 'ap-northeast-1';

    if (!renderId || !bucketName || !region) {
      return NextResponse.json(
        { type: 'error', message: 'Missing required parameters: renderId, bucketName, region' },
        { status: 400 }
      );
    }

    // Phase D W5: Use STS AssumeRole for short-lived credentials
    const { setAWSCredentials } = await import('@/lib/editron/utils/aws-credentials');
    await setAWSCredentials();

    const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
    if (!functionName) {
      throw new Error('REMOTION_LAMBDA_FUNCTION_NAME is not defined');
    }

    // Get render progress from Lambda
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName,
      region,
    });

    // Return progress info
    if (progress.done) {
      // Update database with completion status
      await completeJob(
        renderId,
        progress.outputFile || '',
        progress.outputSizeInBytes || 0
      );

      // Brand Intelligence: emit video_rendered + transition status
      try {
        const { getDatabase } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        const renderJob = await db.collection('editron_render_jobs').findOne({ _id: renderId } as any);
        if (renderJob?.userId && renderJob?.projectId) {
          const { emitBrandEvent } = await import('@/lib/shared/brand-events');
          const { transitionProjectStatus } = await import('@/lib/shared/project-status');

          await transitionProjectStatus(renderJob.projectId, renderJob.userId, 'rendered', 'render_complete');

          emitBrandEvent({
            userId: renderJob.userId,
            projectId: renderJob.projectId,
            service: 'editron',
            type: 'video_rendered',
            payload: {
              outputSize: progress.outputSizeInBytes || 0,
              renderId,
            },
          }).catch((e) => console.warn('[RenderProgress] Brand event failed:', e));
        }
      } catch (brandErr: any) {
        console.warn(`[RenderProgress] Brand intelligence wiring failed: ${brandErr.message}`);
      }

      return NextResponse.json({
        type: 'success',
        data: {
          done: true,
          progress: 1,
          outputUrl: progress.outputFile,
          outputFile: progress.outputFile,
          outputSize: progress.outputSizeInBytes,
          renderMetadata: {
            estimatedTotalLambdaInvokations: progress.renderMetadata?.estimatedTotalLambdaInvokations || 0,
            actualLambdaInvokations: progress.chunks || 0,
            renderBucketName: bucketName,
            renderId,
          }
        }
      });
    }

    // Check for errors
    if (progress.fatalErrorEncountered) {
      const errorMessage = progress.errors?.[0]?.message || 'Render failed with unknown error';
      
      // Update database with error status
      await failJob(renderId, errorMessage);

      // Brand Intelligence: transition to failed
      try {
        const { getDatabase } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        const renderJob = await db.collection('editron_render_jobs').findOne({ _id: renderId } as any);
        if (renderJob?.userId && renderJob?.projectId) {
          const { transitionProjectStatus } = await import('@/lib/shared/project-status');
          await transitionProjectStatus(
            renderJob.projectId, renderJob.userId, 'failed', 'render_error',
            { message: errorMessage, service: 'editron' },
          );
        }
      } catch (brandErr: any) {
        console.warn(`[RenderProgress] Brand failure wiring failed: ${brandErr.message}`);
      }

      console.error('Render fatal error:', JSON.stringify(progress.errors, null, 2));
      return NextResponse.json({
        type: 'error',
        message: errorMessage,
        errors: progress.errors,
      }, { status: 500 });
    }

    // Update database with progress (wrapped in try-catch to not break polling)
    try {
      await updateJobProgress(renderId, progress.overallProgress);
    } catch (dbError) {
      console.error('Failed to update job progress in DB:', dbError);
    }



    // Return in-progress status
    return NextResponse.json({
      type: 'success',
      data: {
        done: false,
        progress: progress.overallProgress, // This should be 0-1
        renderedFrames: progress.framesRendered || 0,
        encodedFrames: progress.encodingStatus?.framesEncoded || 0,
        lambdasInvoked: progress.lambdasInvoked,
        renderMetadata: {
          estimatedTotalLambdaInvokations: progress.renderMetadata?.estimatedTotalLambdaInvokations || 0,
          renderBucketName: bucketName,
          renderId,
        }
      }
    });
  } catch (error: any) {
    console.error('Lambda progress error:', error);
    return NextResponse.json(
      { 
        type: 'error', 
        message: error.message || 'Failed to get render progress' 
      },
      { status: 500 }
    );
  }
}
