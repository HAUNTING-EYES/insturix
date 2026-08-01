import { auth } from '@clerk/nextjs/server';
import { getRenderProgress } from '@remotion/lambda/client';
import { NextResponse } from 'next/server';

import type { RenderJob } from '@/lib/editron/schemas/render-job';
import { beginRenderFinalization } from '@/lib/editron/services/render-finalization-dispatch';
import {
  claimRenderCompletionEffects,
  completeRenderCompletionEffects,
  failJob,
  getJob,
  releaseRenderCompletionEffects,
  updateJobProgress,
} from '@/lib/editron/services/render-job-service';
import { addVideoToLink } from '@/lib/shared/project-links';

type RenderRegion =
  | 'us-east-1' | 'us-east-2' | 'us-west-1' | 'us-west-2'
  | 'eu-central-1' | 'eu-west-1' | 'eu-west-2' | 'ap-south-1'
  | 'ap-southeast-1' | 'ap-southeast-2' | 'ap-northeast-1';

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ type: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const renderId = searchParams.get('renderId');
    const bucketName = searchParams.get('bucketName');
    const region = searchParams.get('region') as RenderRegion;
    if (!renderId || !bucketName || !region) {
      return NextResponse.json(
        { type: 'error', message: 'Missing required parameters: renderId, bucketName, region' },
        { status: 400 },
      );
    }

    const persistedJob = await getJob(renderId);
    if (!persistedJob || persistedJob.userId !== userId) {
      return NextResponse.json({ type: 'error', message: 'Render job not found' }, { status: 404 });
    }
    if (persistedJob.status === 'done') {
      return completedRenderResponse(persistedJob, renderId, bucketName);
    }
    if (persistedJob.status === 'error') {
      return NextResponse.json(
        { type: 'error', message: persistedJob.error || 'Render failed' },
        { status: 500 },
      );
    }
    if (persistedJob.status === 'finalizing') {
      return finalizingResponse(persistedJob, renderId, bucketName);
    }

    const { setAWSCredentials } = await import('@/lib/editron/utils/aws-credentials');
    await setAWSCredentials();
    const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
    if (!functionName) throw new Error('REMOTION_LAMBDA_FUNCTION_NAME is not defined');

    if (bucketName === 'chapter-render' || renderId.startsWith('chr_')) {
      return chapterRenderProgress({ persistedJob, renderId, bucketName });
    }

    const progress = await getRenderProgress({ renderId, bucketName, functionName, region });
    if (progress.done) {
      if (!progress.outputFile) throw new Error('Completed Remotion render has no output URL');
      await beginRenderFinalization({
        renderId,
        providerRenderId: persistedJob.providerRenderId ?? renderId,
        bucketName,
        sourceOutputUrl: progress.outputFile,
        sourceOutputSize: progress.outputSizeInBytes || 0,
      });
      return finalizingResponse(persistedJob, renderId, bucketName, progress.chunks || 0);
    }
    if (progress.fatalErrorEncountered) {
      const errorMessage = progress.errors?.[0]?.message || 'Render failed with unknown error';
      await failJob(renderId, errorMessage);
      await transitionRenderFailure(persistedJob, errorMessage);
      console.error('Render fatal error:', JSON.stringify(progress.errors, null, 2));
      return NextResponse.json(
        { type: 'error', message: errorMessage, errors: progress.errors },
        { status: 500 },
      );
    }

    try {
      await updateJobProgress(renderId, progress.overallProgress);
    } catch (dbError) {
      console.error('Failed to update job progress in DB:', dbError);
    }
    return NextResponse.json({
      type: 'success',
      data: {
        done: false,
        progress: progress.overallProgress,
        deliveryManifest: persistedJob.deliveryManifest,
        renderedFrames: progress.framesRendered || 0,
        encodedFrames: progress.encodingStatus?.framesEncoded || 0,
        lambdasInvoked: progress.lambdasInvoked,
        renderMetadata: {
          estimatedTotalLambdaInvokations:
            progress.renderMetadata?.estimatedTotalLambdaInvokations || 0,
          renderBucketName: bucketName,
          renderId,
        },
      },
    });
  } catch (error) {
    console.error('Lambda progress error:', error);
    return NextResponse.json(
      { type: 'error', message: errorMessage(error) || 'Failed to get render progress' },
      { status: 500 },
    );
  }
}

async function chapterRenderProgress(input: {
  persistedJob: RenderJob;
  renderId: string;
  bucketName: string;
}) {
  const { getChapterRenderProgress } = await import('@/lib/editron/services/chapter-renderer');
  const progress = await getChapterRenderProgress(input.renderId);
  if (!progress) {
    return NextResponse.json(
      { type: 'error', message: 'Chapter render job not found' },
      { status: 404 },
    );
  }

  const failedChapter = progress.chapters.find((chapter) => chapter.status === 'failed');
  if (progress.status === 'failed' || failedChapter) {
    const message = progress.error || failedChapter?.error || 'Chapter render failed';
    await failJob(input.renderId, message);
    await transitionRenderFailure(input.persistedJob, message);
    return NextResponse.json(
      { type: 'error', message, chapters: progress.chapters },
      { status: 500 },
    );
  }
  if (progress.status === 'completed' && progress.outputUrl) {
    await beginRenderFinalization({
      renderId: input.renderId,
      providerRenderId: input.persistedJob.providerRenderId ?? input.renderId,
      bucketName: input.bucketName,
      sourceOutputUrl: progress.outputUrl,
      sourceOutputSize: 0,
    });
    return finalizingResponse(
      input.persistedJob,
      input.renderId,
      input.bucketName,
      progress.chapters.length,
    );
  }

  try {
    await updateJobProgress(input.renderId, progress.overallProgress);
  } catch (dbError) {
    console.error('Failed to update chapter render progress in DB:', dbError);
  }
  return NextResponse.json({
    type: 'success',
    data: {
      done: false,
      progress: progress.overallProgress,
      deliveryManifest: input.persistedJob.deliveryManifest,
      renderedFrames: 0,
      encodedFrames: 0,
      lambdasInvoked: progress.chapters.length,
      renderMetadata: {
        estimatedTotalLambdaInvokations: progress.chapters.length,
        renderBucketName: input.bucketName,
        renderId: input.renderId,
      },
    },
  });
}

async function completedRenderResponse(job: RenderJob, renderId: string, bucketName: string) {
  if (
    !job.outputUrl
    || job.finalization?.state !== 'done'
    || !job.finalization.receipt
    || job.finalization.outputUrl !== job.outputUrl
  ) {
    return NextResponse.json(
      {
        type: 'error',
        code: 'RENDER_FINALIZATION_RECEIPT_MISSING',
        message: 'Render completion is missing verified finalization evidence.',
      },
      { status: 409 },
    );
  }
  await runVerifiedCompletionEffects(renderId);
  return NextResponse.json({
    type: 'success',
    data: {
      done: true,
      progress: 1,
      outputUrl: job.outputUrl,
      outputFile: job.outputUrl,
      outputSize: job.outputSize ?? 0,
      deliveryManifest: job.deliveryManifest,
      renderMetadata: {
        estimatedTotalLambdaInvokations: 0,
        actualLambdaInvokations: 0,
        renderBucketName: bucketName,
        renderId,
      },
    },
  });
}

function finalizingResponse(
  job: RenderJob,
  renderId: string,
  bucketName: string,
  actualLambdaInvokations = 0,
) {
  return NextResponse.json({
    type: 'success',
    data: {
      done: false,
      progress: 0.99,
      finalizing: true,
      deliveryManifest: job.deliveryManifest,
      renderMetadata: {
        estimatedTotalLambdaInvokations: actualLambdaInvokations,
        actualLambdaInvokations,
        renderBucketName: bucketName,
        renderId,
      },
    },
  });
}

async function runVerifiedCompletionEffects(renderId: string): Promise<void> {
  const claim = await claimRenderCompletionEffects({ renderId });
  if (!claim) return;
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const { emitBrandEvent } = await import('@/lib/shared/brand-events');
    const { transitionProjectStatus } = await import('@/lib/shared/project-status');
    const db = await getDatabase();
    const project = await db.collection('projects').findOne(
      { projectId: claim.projectId, userId: claim.userId },
      { projection: { brandId: 1, name: 1, qualityScore: 1, sourceSessionId: 1 } },
    );
    const brandId = cleanString(project?.brandId);
    const sessionId = cleanString(project?.sourceSessionId);
    const projectName = cleanString(project?.name);
    const qualityScore = typeof project?.qualityScore === 'number' ? project.qualityScore : undefined;
    const deliveredRenderId = claim.providerRenderId ?? claim.jobId;

    await transitionProjectStatus(claim.projectId, claim.userId, 'rendered', 'render_complete');
    await addVideoToLink(claim.userId, claim.projectId, deliveredRenderId);
    await emitBrandEvent({
      userId: claim.userId,
      projectId: claim.projectId,
      brandId,
      service: 'editron',
      type: 'video_rendered',
      payload: {
        outputSize: claim.outputSize,
        renderId: deliveredRenderId,
        ...(qualityScore !== undefined ? { qualityScore } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(projectName ? { projectName } : {}),
      },
    });
    const completed = await completeRenderCompletionEffects({
      jobId: claim.jobId,
      claimToken: claim.claimToken,
    });
    if (!completed) throw new Error('Completion-effects lease changed before commit.');
  } catch (error) {
    await releaseRenderCompletionEffects({
      jobId: claim.jobId,
      claimToken: claim.claimToken,
    }).catch(() => false);
    console.warn(`[RenderProgress] Verified completion effects failed: ${errorMessage(error)}`);
  }
}

async function transitionRenderFailure(job: RenderJob, message: string): Promise<void> {
  try {
    const { transitionProjectStatus } = await import('@/lib/shared/project-status');
    await transitionProjectStatus(
      job.projectId,
      job.userId,
      'failed',
      'render_error',
      { message, service: 'editron' },
    );
  } catch (error) {
    console.warn(`[RenderProgress] Brand failure wiring failed: ${errorMessage(error)}`);
  }
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
