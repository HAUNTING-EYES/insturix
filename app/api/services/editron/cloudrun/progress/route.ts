import { auth } from '@clerk/nextjs/server';
import { getRenderProgress } from '@remotion/lambda/client';
import { NextResponse } from 'next/server';

import {
  RenderJobChapterOrchestrationSchema,
  type RenderJob,
  type RenderJobChapterOrchestrationStateV1,
  type RenderJobChapterOrchestrationV1,
} from '@/lib/editron/schemas/render-job';
import { CHAPTER_ORCHESTRATION_EXECUTION_KIND } from '@/lib/editron/shared/render-request-payload';
import {
  beginChapterParentOrchestrationConcatenatingV1,
  beginChapterParentOrchestrationFinalizingV1,
  failChapterParentOrchestrationV1,
  markChapterParentOrchestrationReadyForFinalizationV1,
  updateChapterParentOrchestrationProgressV1,
} from '@/lib/editron/services/chapter-parent-orchestration-v1';
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

const CHAPTER_ORCHESTRATION_ID = /^chr_[A-Za-z0-9_-]{12}$/;
const RENDER_REGIONS: readonly RenderRegion[] = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-central-1', 'eu-west-1', 'eu-west-2', 'ap-south-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
];

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ type: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const executionKind = searchParams.get('executionKind');
    const requestedOrchestrationId = cleanString(searchParams.get('orchestrationId'));
    const requestedRenderId = cleanString(searchParams.get('renderId'));
    const requestedBucketName = cleanString(searchParams.get('bucketName'));
    const requestedRegion = searchParams.get('region');
    const isChapterOrchestrationRequest = executionKind !== null
      || searchParams.has('orchestrationId');

    let renderId: string;
    let bucketName: string | undefined;
    let region: RenderRegion;
    if (isChapterOrchestrationRequest) {
      const chapterRegion = normalizeRenderRegion(requestedRegion);
      if (
        executionKind !== CHAPTER_ORCHESTRATION_EXECUTION_KIND
        || !requestedOrchestrationId
        || !CHAPTER_ORCHESTRATION_ID.test(requestedOrchestrationId)
        || requestedRenderId !== undefined
        || requestedBucketName !== undefined
        || !chapterRegion
      ) {
        return NextResponse.json(
          {
            type: 'error',
            code: 'CHAPTER_ORCHESTRATION_IDENTITY_INVALID',
            message: 'Chapter progress requires executionKind, orchestrationId, and region without provider identity.',
          },
          { status: 400 },
        );
      }
      renderId = requestedOrchestrationId;
      region = chapterRegion;
    } else {
      if (!requestedRenderId || !requestedBucketName || !requestedRegion) {
        return NextResponse.json(
          { type: 'error', message: 'Missing required parameters: renderId, bucketName, region' },
          { status: 400 },
        );
      }
      renderId = requestedRenderId;
      bucketName = requestedBucketName;
      region = requestedRegion as RenderRegion;
    }

    const locatedJob = await getRenderJobByAdmissionOrProviderIdV1({ renderId });
    if (!locatedJob) {
      return NextResponse.json({ type: 'error', message: 'Render job not found' }, { status: 404 });
    }
    let persistedJob = locatedJob;
    let strictAuthorization: ProjectRenderJobAuthorizationV1 | undefined;
    let strictChapterOrchestration: RenderJobChapterOrchestrationV1 | undefined;
    if (isChapterOrchestrationRequest) {
      if (!isStrictChapterParentCandidate(locatedJob, renderId, region, userId)) {
        return locatedJob.requestedByUserId !== userId
          ? NextResponse.json({ type: 'error', message: 'Render job not found' }, { status: 404 })
          : chapterOrchestrationNotCurrentResponse();
      }
      const binding = locatedJob.projectRenderSnapshotBinding;
      if (!binding) return chapterOrchestrationNotCurrentResponse();
      const authorization = await getProjectRenderJobAuthorizationByAdmissionV1({
        jobId: locatedJob._id,
        expectedBindingHash: binding.bindingHash,
      });
      if (!authorization.ok) return projectRenderNotCurrentResponse();
      const current = await readCurrentProjectRenderJob(authorization.authorization);
      if (!current) return projectRenderNotCurrentResponse();
      const orchestration = readStrictChapterOrchestration(
        current,
        renderId,
        region,
        authorization.authorization,
      );
      if (!orchestration) return chapterOrchestrationNotCurrentResponse();
      persistedJob = current;
      strictAuthorization = authorization.authorization;
      strictChapterOrchestration = orchestration;
    } else if (locatedJob.projectRenderSnapshotBinding) {
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
      if (isChapterOrchestrationRequest && strictChapterOrchestration?.failure) {
        return chapterOrchestrationStateResponse(renderId, strictChapterOrchestration);
      }
      return NextResponse.json(
        { type: 'error', message: persistedJob.error || 'Render failed' },
        { status: 500 },
      );
    }
    if (persistedJob.status === 'finalizing') {
      return finalizingResponse(persistedJob, renderId, bucketName);
    }

    if (isChapterOrchestrationRequest) {
      return chapterRenderProgress({
        persistedJob,
        renderId,
        region,
        strictAuthorization,
      });
    }

    const { setAWSCredentials } = await import('@/lib/editron/utils/aws-credentials');
    await setAWSCredentials();
    const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
    if (!functionName) throw new Error('REMOTION_LAMBDA_FUNCTION_NAME is not defined');

    if (bucketName === 'chapter-render' || renderId.startsWith('chr_')) {
      return chapterRenderProgress({
        persistedJob,
        renderId,
        bucketName: bucketName!,
        region,
        strictAuthorization,
      });
    }

    const progress = await getRenderProgress({
      renderId,
      bucketName: bucketName!,
      functionName,
      region,
    });
    if (progress.done) {
      if (!progress.outputFile) throw new Error('Completed Remotion render has no output URL');
      const finalizationInput = {
        providerRenderId: persistedJob.providerRenderId ?? renderId,
        bucketName: bucketName!,
        sourceOutputUrl: progress.outputFile,
        sourceOutputSize: progress.outputSizeInBytes || 0,
      };
      if (strictAuthorization) {
        const result = await beginProjectRenderFinalizationV1({
          authorization: strictAuthorization,
          region,
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
          bucketName: bucketName!,
          region,
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
        bucketName: bucketName!,
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
          renderBucketName: bucketName!,
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

type ChapterProgressSnapshot = {
  status: string;
  overallProgress: number;
  chapters: Array<{
    index: number;
    status: string;
    progress: number;
    outputUrl?: string;
    outputSize?: unknown;
    error?: string;
  }>;
  outputUrl?: string;
  outputSize?: unknown;
  error?: string;
  [key: string]: unknown;
};

async function chapterRenderProgress(input: {
  persistedJob: RenderJob;
  renderId: string;
  bucketName?: string;
  region: RenderRegion;
  strictAuthorization?: ProjectRenderJobAuthorizationV1;
}) {
  if (input.strictAuthorization && input.bucketName === undefined) {
    return strictChapterRenderProgress({
      persistedJob: input.persistedJob,
      renderId: input.renderId,
      region: input.region,
      strictAuthorization: input.strictAuthorization,
    });
  }
  return legacyChapterRenderProgress({
    persistedJob: input.persistedJob,
    renderId: input.renderId,
    bucketName: input.bucketName ?? 'chapter-render',
    region: input.region,
    strictAuthorization: input.strictAuthorization,
  });
}

async function strictChapterRenderProgress(input: {
  persistedJob: RenderJob;
  renderId: string;
  region: RenderRegion;
  strictAuthorization: ProjectRenderJobAuthorizationV1;
}) {
  const orchestration = readStrictChapterOrchestration(
    input.persistedJob,
    input.renderId,
    input.region,
    input.strictAuthorization,
  );
  if (!orchestration) return chapterOrchestrationNotCurrentResponse();
  const chapterCount = orchestration.chapterCount;
  const chapterLayoutManifestHash = orchestration.chapterLayoutManifestHash;
  if (chapterCount === undefined || chapterLayoutManifestHash === undefined) {
    return chapterProgressContractResponse(
      new Error('CHAPTER_RENDER_PROGRESS_LAYOUT_IDENTITY_MISSING'),
    );
  }
  if (
    orchestration.state === 'READY_FOR_FINALIZATION'
    || orchestration.state === 'FINALIZING'
  ) {
    return dispatchStrictChapterFinalization(input, orchestration);
  }
  if (orchestration.state !== 'RUNNING' && orchestration.state !== 'CONCATENATING') {
    return chapterOrchestrationStateResponse(input.renderId, orchestration);
  }

  let progress: ChapterProgressSnapshot | null;
  try {
    const { getChapterRenderProgress } = await import('@/lib/editron/services/chapter-renderer');
    progress = await getChapterRenderProgress(input.renderId, {
      authorization: input.strictAuthorization,
      selectedRegion: input.region,
      chapterCount,
      chapterLayoutManifestHash,
      parentState: orchestration.state,
    });
  } catch (error: unknown) {
    return chapterProgressContractResponse(error);
  }
  if (!progress) {
    return NextResponse.json(
      { type: 'error', message: 'Chapter render job not found' },
      { status: 404 },
    );
  }

  const failedChapter = progress.chapters.find((chapter) => chapter.status === 'failed');
  if (progress.status === 'failed' || failedChapter) {
    const message = progress.error || failedChapter?.error || 'Chapter render failed';
    const failed = await failChapterParentOrchestrationV1({
      authorization: input.strictAuthorization,
      currentProjectRevision: input.strictAuthorization.projectRevision,
      selectedRegion: input.region,
      chapterCount,
      chapterLayoutManifestHash,
      error: message,
    });
    if (!failed.ok) return projectRenderNotCurrentResponse();
    await transitionRenderFailure(input.persistedJob, message);
    return NextResponse.json(
      { type: 'error', message, chapters: progress.chapters },
      { status: 500 },
    );
  }

  const completedChapterCount = progress.chapters.filter(
    (chapter) => chapter.status === 'completed',
  ).length;
  const allCompleted = progress.chapters.length === chapterCount
    && completedChapterCount === chapterCount
    && progress.chapters.every((chapter) => chapter.status === 'completed');
  const progressValue = allCompleted
    ? 1
    : Math.min(1, Math.max(0, progress.overallProgress));

  if (orchestration.state === 'RUNNING') {
    const updated = await updateChapterParentOrchestrationProgressV1({
      authorization: input.strictAuthorization,
      currentProjectRevision: input.strictAuthorization.projectRevision,
      selectedRegion: input.region,
      chapterCount,
      chapterLayoutManifestHash,
      completedChapterCount,
      progress: progressValue,
    });
    if (!updated.ok) return projectRenderNotCurrentResponse();
  }

  let parentState: RenderJobChapterOrchestrationStateV1 = orchestration.state;
  if (allCompleted && orchestration.state === 'RUNNING') {
    const concatenating = await beginChapterParentOrchestrationConcatenatingV1({
      authorization: input.strictAuthorization,
      currentProjectRevision: input.strictAuthorization.projectRevision,
      selectedRegion: input.region,
      chapterCount,
      chapterLayoutManifestHash,
    });
    if (!concatenating.ok) return projectRenderNotCurrentResponse();
    parentState = 'CONCATENATING';
  }

  if (allCompleted && progress.status === 'completed' && progress.outputUrl) {
    const outputSize = progress.outputSize === undefined
      ? await readChapterFinalizationOutputSize(input.renderId, progress)
      : progress.outputSize;
    if (
      !isHttpsChapterOutputUrl(progress.outputUrl)
      || !Number.isSafeInteger(outputSize)
      || (outputSize as number) <= 0
    ) {
      return NextResponse.json(
        {
          type: 'error',
          code: 'CHAPTER_RENDER_OUTPUT_IDENTITY_MISSING',
          message: 'Chapter completion is missing a positive persisted output size.',
        },
        { status: 409 },
      );
    }
    const aggregateOutput = {
      url: progress.outputUrl,
      sizeBytes: outputSize as number,
    };
    if (parentState === 'CONCATENATING') {
      const ready = await markChapterParentOrchestrationReadyForFinalizationV1({
        authorization: input.strictAuthorization,
        currentProjectRevision: input.strictAuthorization.projectRevision,
        selectedRegion: input.region,
        chapterCount,
        chapterLayoutManifestHash,
        completedChapterCount: chapterCount,
        aggregateOutput,
      });
      if (!ready.ok) return projectRenderNotCurrentResponse();
      return dispatchStrictChapterFinalization(input, orchestration, {
        state: 'READY_FOR_FINALIZATION',
        aggregateOutput,
      });
    }
  }

  return strictChapterProgressResponse(input, progress, parentState);
}

async function dispatchStrictChapterFinalization(
  input: {
    persistedJob: RenderJob;
    renderId: string;
    region: RenderRegion;
    strictAuthorization: ProjectRenderJobAuthorizationV1;
  },
  orchestration: RenderJobChapterOrchestrationV1,
  override?: {
    state: 'READY_FOR_FINALIZATION' | 'FINALIZING';
    aggregateOutput: { url: string; sizeBytes: number };
  },
) {
  const chapterCount = orchestration.chapterCount;
  const chapterLayoutManifestHash = orchestration.chapterLayoutManifestHash;
  const aggregateOutput = override?.aggregateOutput ?? orchestration.aggregateOutput;
  const state = override?.state ?? orchestration.state;
  if (
    chapterCount === undefined
    || chapterLayoutManifestHash === undefined
    || !aggregateOutput
  ) {
    return chapterProgressContractResponse(
      new Error('CHAPTER_RENDER_PROGRESS_LAYOUT_IDENTITY_MISSING'),
    );
  }
  if (state === 'READY_FOR_FINALIZATION') {
    const finalizing = await beginChapterParentOrchestrationFinalizingV1({
      authorization: input.strictAuthorization,
      currentProjectRevision: input.strictAuthorization.projectRevision,
      selectedRegion: input.region,
      chapterCount,
      chapterLayoutManifestHash,
      aggregateOutput,
    });
    if (!finalizing.ok) return projectRenderNotCurrentResponse();
  } else if (state !== 'FINALIZING') {
    return chapterOrchestrationStateResponse(input.renderId, orchestration);
  }

  const result = await beginProjectRenderFinalizationV1({
    authorization: input.strictAuthorization,
    sourceOutputUrl: aggregateOutput.url,
    sourceOutputSize: aggregateOutput.sizeBytes,
  });
  if ('ok' in result && !result.ok) {
    const current = await readCurrentProjectRenderJob(input.strictAuthorization);
    return current?.status === 'finalizing'
      ? finalizingResponse(current, input.renderId, undefined, chapterCount)
      : projectRenderNotCurrentResponse();
  }
  return finalizingResponse(input.persistedJob, input.renderId, undefined, chapterCount);
}

function strictChapterProgressResponse(
  input: {
    persistedJob: RenderJob;
    renderId: string;
  },
  progress: ChapterProgressSnapshot,
  _parentState: RenderJobChapterOrchestrationStateV1,
) {
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
        renderId: input.renderId,
      },
    },
  });
}

function normalizeRenderRegion(value: string | null): RenderRegion | null {
  const normalized = value?.trim();
  return normalized && RENDER_REGIONS.includes(normalized as RenderRegion)
    ? normalized as RenderRegion
    : null;
}

function isStrictChapterParentCandidate(
  job: RenderJob,
  renderId: string,
  region: RenderRegion,
  userId: string,
): boolean {
  return job.requestedByUserId === userId
    && readStrictChapterOrchestration(job, renderId, region) !== null;
}

function readStrictChapterOrchestration(
  job: RenderJob,
  renderId: string,
  region: RenderRegion,
  authorization?: ProjectRenderJobAuthorizationV1,
): RenderJobChapterOrchestrationV1 | null {
  const parsedOrchestration = RenderJobChapterOrchestrationSchema.safeParse(
    job.chapterOrchestration,
  );
  const binding = job.projectRenderSnapshotBinding;
  const dispatch = job.dispatch;
  if (!parsedOrchestration.success || !binding) return null;
  if (
    job._id !== renderId
    || job.region !== region
    || job.artifactState !== 'ACTIVE'
    || job.artifactInvalidation !== undefined
    || job.artifactBinding !== undefined
    || binding.scope !== 'PROJECT_SNAPSHOT'
    || binding.artifactId !== renderId
    || parsedOrchestration.data.aggregateJobId !== renderId
    || parsedOrchestration.data.bindingHash !== binding.bindingHash
    || parsedOrchestration.data.selectedRegion !== region
    || job.providerRenderId !== undefined
    || job.bucketName !== undefined
    || !dispatch
    || dispatch.phase !== 'NOT_ATTEMPTED'
    || dispatch.providerRenderId !== undefined
    || dispatch.providerBucketName !== undefined
    || dispatch.providerRegion !== undefined
    || dispatch.providerBoundAt !== undefined
    || job.deliveryManifest?.primaryArtifact.renderId !== renderId
  ) {
    return null;
  }
  if (
    authorization
    && (
      job.userId !== authorization.ownerId
      || job.requestedByUserId !== authorization.requestedByUserId
      || job.projectId !== authorization.projectId
      || binding.ownerId !== authorization.ownerId
      || binding.projectId !== authorization.projectId
      || binding.bindingHash !== authorization.bindingHash
      || binding.projectRevision.schemaVersion !== authorization.projectRevision.schemaVersion
      || binding.projectRevision.value !== authorization.projectRevision.value
      || binding.projectRevision.compatibilityUpdatedAt
        !== authorization.projectRevision.compatibilityUpdatedAt
    )
  ) {
    return null;
  }
  return parsedOrchestration.data;
}

function chapterOrchestrationNotCurrentResponse() {
  return NextResponse.json(
    {
      type: 'error',
      code: 'CHAPTER_ORCHESTRATION_NOT_CURRENT',
      message: 'The chapter orchestration no longer belongs to the current project revision.',
    },
    { status: 409 },
  );
}

function chapterOrchestrationStateResponse(
  renderId: string,
  orchestration: RenderJobChapterOrchestrationV1,
) {
  const terminal = orchestration.state === 'FAILED'
    || orchestration.state === 'STALE'
    || orchestration.state === 'UNKNOWN';
  return NextResponse.json(
    {
      type: 'error',
      code: `CHAPTER_ORCHESTRATION_${orchestration.state}`,
      message: orchestration.failure?.message
        || `Chapter orchestration ${renderId} is ${orchestration.state}.`,
    },
    { status: orchestration.state === 'FAILED' ? 500 : terminal ? 409 : 409 },
  );
}

function chapterProgressContractResponse(error: unknown) {
  const rawMessage = errorMessage(error).trim();
  const code = rawMessage.match(/^((?:CHAPTER|EDITRON_CHAPTER)_[A-Z0-9_]+)(?::.*)?$/)?.[1]
    || 'CHAPTER_RENDER_PROGRESS_CONTRACT_INVALID';
  const message = code === 'CHAPTER_RENDER_PROGRESS_CONTRACT_INVALID'
    ? 'Chapter progress contract validation failed.'
    : code;
  return NextResponse.json(
    { type: 'error', code, message },
    { status: 409 },
  );
}

function isHttpsChapterOutputUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

async function legacyChapterRenderProgress(input: {
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
        region: input.region,
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
    const persistedOutputSize = await readChapterFinalizationOutputSize(
      input.renderId,
      progress,
    );
    if (persistedOutputSize === undefined && input.strictAuthorization) {
      return NextResponse.json(
        {
          type: 'error',
          code: 'CHAPTER_RENDER_OUTPUT_IDENTITY_MISSING',
          message: 'Chapter completion is missing a positive persisted output size.',
        },
        { status: 409 },
      );
    }
    const finalizationInput = {
      providerRenderId: input.persistedJob.providerRenderId ?? input.renderId,
      bucketName: input.bucketName,
      sourceOutputUrl: progress.outputUrl,
      // Legacy chapter rows predate persisted byte identity. Keep their
      // compatibility path intact; strict rows never reach this fallback.
      sourceOutputSize: persistedOutputSize ?? 0,
    };
    if (input.strictAuthorization) {
      const result = await beginProjectRenderFinalizationV1({
        authorization: input.strictAuthorization,
        region: input.region,
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

async function readChapterFinalizationOutputSize(
  renderId: string,
  progress: {
    chapters: Array<{ outputSize?: unknown }>;
  } & Record<string, unknown>,
): Promise<number | undefined> {
  const directOutputSize = progress.outputSize;
  if (Number.isSafeInteger(directOutputSize) && (directOutputSize as number) > 0) {
    return directOutputSize as number;
  }
  const progressConcatResult = progress.concatResult;
  if (
    progressConcatResult
    && typeof progressConcatResult === 'object'
    && !Array.isArray(progressConcatResult)
    && Number.isSafeInteger((progressConcatResult as { sizeBytes?: unknown }).sizeBytes)
    && ((progressConcatResult as { sizeBytes: number }).sizeBytes) > 0
  ) {
    return (progressConcatResult as { sizeBytes: number }).sizeBytes;
  }
  if (progress.chapters.length === 1) {
    const childSize = progress.chapters[0]?.outputSize;
    if (Number.isSafeInteger(childSize) && (childSize as number) > 0) {
      return childSize as number;
    }
  }
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const { CHAPTERS_COLLECTION } = await import('@/lib/editron/services/chapter-renderer');
    const db = await getDatabase();
    const row = await db.collection(CHAPTERS_COLLECTION).findOne(
      { _id: renderId as any },
      { projection: { concatResult: 1 } },
    ) as { concatResult?: { sizeBytes?: unknown } } | null;
    const size = row?.concatResult?.sizeBytes;
    return Number.isSafeInteger(size) && (size as number) > 0 ? size as number : undefined;
  } catch {
    return undefined;
  }
}

async function completedRenderResponse(
  job: RenderJob,
  renderId: string,
  bucketName: string | undefined,
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
        ...(bucketName ? { renderBucketName: bucketName } : {}),
        renderId,
      },
    },
  });
}

function finalizingResponse(
  job: RenderJob,
  renderId: string,
  bucketName: string | undefined,
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
        ...(bucketName ? { renderBucketName: bucketName } : {}),
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
