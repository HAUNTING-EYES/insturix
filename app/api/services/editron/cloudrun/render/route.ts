import { NextResponse } from 'next/server';
import { renderMediaOnLambda } from '@remotion/lambda/client';
import { auth } from '@clerk/nextjs/server';
import { createJob } from '@/lib/editron/services/render-job-service';
import { assetResolver } from '@/lib/editron/services/asset-resolver';

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

    // Phase D W5: Use STS AssumeRole for short-lived credentials
    // Falls back to env var credentials if STS fails (backward compat)
    const { setAWSCredentials } = await import('@/lib/editron/utils/aws-credentials');
    await setAWSCredentials();

    console.log('Triggering distributed render on Lambda:', functionName);
    console.log('Composition:', compositionId || 'TestComponent');
    console.log('Region:', region);

    // Resolve asset URLs before sending to Lambda.
    // CRITICAL: Lambda needs GCS signed URLs, NOT CDN proxy URLs.
    // The Cloudflare Worker proxy doesn't support Content-Length or Range headers,
    // which Remotion's FFmpeg requires to seek into video files.
    // GCS signed URLs support both → Lambda can render properly.
    //
    // We temporarily unset CDN_WORKER_URL so the resolver falls through to GCS signed URLs.
    let resolvedProps = inputProps || {};
    if (resolvedProps.overlays?.length > 0) {
      try {
        const savedCdnUrl = process.env.CDN_WORKER_URL;
        process.env.CDN_WORKER_URL = ''; // Force GCS signed URL path
        const resolvedOverlays = await assetResolver.resolveProjectAssets(resolvedProps.overlays);
        process.env.CDN_WORKER_URL = savedCdnUrl; // Restore for other requests
        resolvedProps = { ...resolvedProps, overlays: resolvedOverlays };
        console.log(`[Render] Resolved ${resolvedOverlays.length} overlay URLs for Lambda (GCS signed, not CDN proxy)`);
      } catch (err: any) {
        console.warn('[Render] Asset URL resolution failed, using raw props:', err.message);
      }
    }

    // Phase D W6: Auto-detect long videos and use chapter-based rendering
    const totalFrames = resolvedProps.durationInFrames || 0;
    const { shouldUseChapterRendering, startChapterRender } = await import('@/lib/editron/services/chapter-renderer');

    if (shouldUseChapterRendering(totalFrames)) {
      console.log(`[Render] Long video detected (${totalFrames} frames). Using chapter-based rendering.`);
      const fps = resolvedProps.fps || 30;
      const width = resolvedProps.width || 1920;
      const height = resolvedProps.height || 1080;

      const { jobId, chapters } = await startChapterRender(
        projectId || 'unknown',
        userId,
        resolvedProps.overlays || [],
        totalFrames,
        fps,
        width,
        height,
        serveUrl,
        functionName,
      );

      // Save job reference
      try {
        await createJob(jobId, userId, projectId || 'unknown', 'chapter-render');
      } catch {}

      return NextResponse.json({
        type: 'success',
        renderId: jobId,
        bucketName: 'chapter-render',
        region,
        isChapterRender: true,
        chapters,
        message: `Split into ${chapters} chapters for parallel rendering`,
      });
    }

    // Standard single-Lambda render (videos under 3 minutes)
    const { bucketName, renderId } = await renderMediaOnLambda({
      region,
      functionName,
      serveUrl,
      composition: compositionId || 'TestComponent',
      inputProps: resolvedProps,
      codec: 'h264',
      audioCodec: 'mp3', // Faster audio processing than AAC
      privacy: 'public', // Make the video publicly accessible
      // Distributed rendering settings
      // Set to 200 to use ~5-8 concurrent Lambdas (safe for new AWS accounts with limit 10)
      framesPerLambda: 200,
      timeoutInMilliseconds: 600000, // 10 minutes — AI videos need longer download time
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
