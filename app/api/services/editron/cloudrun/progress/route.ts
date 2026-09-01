import { auth } from '@clerk/nextjs/server';
import { getRenderProgress } from '@remotion/lambda/client';
import { NextResponse } from 'next/server';

import type { RenderJob } from '@/lib/editron/schemas/render-job';
import {
  beginProjectRenderFinalizationV1,
  beginRenderFinalization,
} from '@/lib/editron/services/render-finalization-dispatch';
import { projectService } from '@/lib/editron/services/project-service';
import {
  claimRenderCompletionEffects,
  completeRenderCompletionEffects,
  failJob,
  getCurrentProjectRenderJobV1,
  getProjectRenderJobAuthorizationByAdmissionV1,
  getRenderJobByAdmissionOrProviderIdV1,
  releaseRenderCompletionEffects,
  updateJobProgress,
  type ProjectRenderJobAuthorizationV1,
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

    const locatedJob = await getRenderJobByAdmissionOrProviderIdV1({ renderId });
    if (!locatedJob) {
      return NextResponse.json({ type: 'error', message: 'Render job not found' }, { status: 404 });
    }
    let persistedJob = locatedJob;
    let strictAuthorization: ProjectRenderJobAuthorizationV1 | undefined;
    if (locatedJob.projectRenderSnapshotBinding) {
      if (locatedJob.requestedByUserId !== userId) {
        return NextResponse.json({ type: 'error', message: 'Render job not found' }, { status: 404 });
      }
      if (
        locatedJob.providerRenderId !== renderId
        || locatedJob.bucketName !== bucketName
        || locatedJob.region !== region
      ) {
        return projectRenderNotCurrentResponse();
      }
      const authorization = await getProjectRenderJobAuthorizationByAdmissionV1({
        jobId: locatedJob._id,
        expectedBindingHash: locatedJob.projectRenderSnapshotBinding.bindingHash,
      });
      if (!authorization.ok) return projectRenderNotCurrentResponse();
      const current = await readCurrentProjectRenderJob(authorization.authorization);
      if (!current) return projectRenderNotCurrentResponse();
      persistedJob = current;
      strictAuthorization = authorization.authorization;
    } else {
      if (locatedJob.artifactBinding || locatedJob.userId !== userId) {
        return locatedJob.userId !== userId
          ? NextResponse.json(
              { type: 'error', message: 'Render job not found' },
              { status: 404 },
            )
          : projectRenderNotCurrentResponse();
      }
    }
    if (persistedJob.status === 'done') {
      return completedRenderResponse(
        persistedJob,
        renderId,
        bucketName,
        strictAuthorization,
      );
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
      return chapterRenderProgress({
        persistedJob,
        renderId,
        bucketName,
        region,
        strictAuthorization,
      });
    }

    const progress = await getRenderProgress({ renderId, bucketName, functionName, region });
    if (progress.done) {
      if (!progress.outputFile) throw new Error('Completed Remotion render has no output URL');
      const finalizationInput = {
        providerRenderId: persistedJob.providerRenderId ?? renderId,
        bucketName,
        sourceOutputUrl: progress.outputFile,
        sourceOutputSize: progress.outputSizeInBytes || 0,
      };
      if (strictAuthorization) {
        const result = await beginProjectRenderFinalizationV1({
          authorization: strictAuthorization,
          ...finalizationInput,
        });
        if ('ok' in result && !result.ok) {
          const current = await readCurrentProjectRenderJob(strictAuthorization);
          return current?.status === 'finalizing'
            ? finalizingResponse(current, renderId, bucketName, progress.chunks || 0)
            : projectRenderNotCurrentResponse();
        }
      } else {
        await beginRenderFinalization({ renderId, ...finalizationInput });
      }
      return finalizingResponse(persistedJob, renderId, bucketName, progress.chunks || 0);
    }
    if (progress.fatalErrorEncountered) {
      const errorMessage = progress.errors?.[0]?.message || 'Render failed with unknown error';
      if (strictAuthorization) {
        const failed = await projectService.failProjectRenderJobFromProviderTransactionV1({
          authorization: strictAuthorization,
          providerRenderId: renderId,
          bucketName,
          error: errorMessage,
        });
        if (!failed.ok) return projectRenderNotCurrentResponse();
      } else {
        await failJob(renderId, errorMessage);
      }
      await transitionRenderFailure(persistedJob, errorMessage);
      console.error('Render fatal error:', JSON.stringify(progress.errors, null, 2));
      return NextResponse.json(
        { type: 'error', message: errorMessage, errors: progress.errors },
        { status: 500 },
      );
    }

    if (strictAuthorization) {
      const updated = await projectService.updateProjectRenderJobProgressTransactionV1({
        authorization: strictAuthorization,
        providerRenderId: renderId,
        bucketName,
        region,
        progress: progress.overallProgress,
      });
      if (!updated.ok) return projectRenderNotCurrentResponse();
    } else {
      try {
        await updateJobProgress(renderId, progress.overallProgress);
      } catch (dbError) {
        console.error('Failed to update job progress in DB:', dbError);
      }
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
  region: RenderRegion;
  strictAuthorization?: ProjectRenderJobAuthorizationV1;
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
    if (input.strictAuthorization) {
      const failed = await projectService.failProjectRenderJobFromProviderTransactionV1({
        authorization: input.strictAuthorization,
        providerRenderId: input.renderId,
        bucketName: input.bucketName,
        error: message,
      });
      if (!failed.ok) return projectRenderNotCurrentResponse();
    } else {
      await failJob(input.renderId, message);
    }
    await transitionRenderFailure(input.persistedJob, message);
    return NextResponse.json(
      { type: 'error', message, chapters: progress.chapters },
      { status: 500 },
    );
  }
  if (progress.status === 'completed' && progress.outputUrl) {
    const finalizationInput = {
      providerRenderId: input.persistedJob.providerRenderId ?? input.renderId,
      bucketName: input.bucketName,
      sourceOutputUrl: progress.outputUrl,
      sourceOutputSize: 0,
    };
    if (input.strictAuthorization) {
      const result = await beginProjectRenderFinalizationV1({
        authorization: input.strictAuthorization,
        ...finalizationInput,
      });
      if ('ok' in result && !result.ok) {
        const current = await readCurrentProjectRenderJob(input.strictAuthorization);
        return current?.status === 'finalizing'
          ? finalizingResponse(
              current,
              input.renderId,
              input.bucketName,
              progress.chapters.length,
            )
          : projectRenderNotCurrentResponse();
      }
    } else {
      await beginRenderFinalization({ renderId: input.renderId, ...finalizationInput });
    }
    return finalizingResponse(
      input.persistedJob,
      input.renderId,
      input.bucketName,
      progress.chapters.length,
    );
  }

  if (input.strictAuthorization) {
    const updated = await projectService.updateProjectRenderJobProgressTransactionV1({
      authorization: input.strictAuthorization,
      providerRenderId: input.renderId,
      bucketName: input.bucketName,
      region: input.region,
      progress: progress.overallProgress,
    });
    if (!updated.ok) return projectRenderNotCurrentResponse();
  } else {
    try {
      await updateJobProgress(input.renderId, progress.overallProgress);
    } catch (dbError) {
      console.error('Failed to update chapter render progress in DB:', dbError);
    }
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

async function completedRenderResponse(
  job: RenderJob,
  renderId: string,
  bucketName: string,
  strictAuthorization?: ProjectRenderJobAuthorizationV1,
) {
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
  await runVerifiedCompletionEffects(renderId, strictAuthorization);
  if (strictAuthorization && !await readCurrentProjectRenderJob(strictAuthorization)) {
    return projectRenderNotCurrentResponse();
  }
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

async function runVerifiedCompletionEffects(
  renderId: string,
  strictAuthorization?: ProjectRenderJobAuthorizationV1,
): Promise<void> {
  const claim = strictAuthorization
    ? await projectService.claimProjectRenderCompletionEffectsTransactionV1({
        authorization: strictAuthorization,
      })
    : await claimRenderCompletionEffects({ renderId });
  if (!claim || !('jobId' in claim)) return;
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
    if (strictAuthorization) {
      const completed = await projectService.completeProjectRenderCompletionEffectsTransactionV1({
        authorization: strictAuthorization,
        claimToken: claim.claimToken,
      });
      if (!completed.ok) throw new Error('Completion-effects lease changed before commit.');
    } else {
      const completed = await completeRenderCompletionEffects({
        jobId: claim.jobId,
        claimToken: claim.claimToken,
      });
      if (!completed) throw new Error('Completion-effects lease changed before commit.');
    }
  } catch (error) {
    if (strictAuthorization) {
      await projectService.releaseProjectRenderCompletionEffectsTransactionV1({
        authorization: strictAuthorization,
        claimToken: claim.claimToken,
      }).catch(() => ({ ok: false }));
    } else {
      await releaseRenderCompletionEffects({
        jobId: claim.jobId,
        claimToken: claim.claimToken,
      }).catch(() => false);
    }
    console.warn(`[RenderProgress] Verified completion effects failed: ${errorMessage(error)}`);
  }
}

async function readCurrentProjectRenderJob(
  authorization: ProjectRenderJobAuthorizationV1,
): Promise<RenderJob | null> {
  const snapshot = await projectService.loadProjectForRenderSnapshot(
    authorization.requestedByUserId,
    authorization.projectId,
  );
  if (!snapshot || snapshot.ownerId !== authorization.ownerId) return null;
  const current = await getCurrentProjectRenderJobV1({
    authorization,
    currentProjectRevision: snapshot.revision,
  });
  return current.ok ? current.job : null;
}

function projectRenderNotCurrentResponse() {
  return NextResponse.json(
    {
      type: 'error',
      code: 'PROJECT_ARTIFACT_NOT_CURRENT',
      message: 'The render no longer belongs to the current project revision.',
    },
    { status: 409 },
  );
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
