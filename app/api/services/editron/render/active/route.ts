import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  assertProjectRenderSnapshotBindingV1,
} from '@/lib/editron/services/project-render-snapshot-binding-v1';
import {
  RenderJobChapterOrchestrationSchema,
  RenderJobSchema,
  RENDER_JOB_CHAPTER_ORCHESTRATION_SCOPE_V1,
  type RenderJob,
} from '@/lib/editron/schemas/render-job';
import { projectService } from '@/lib/editron/services/project-service';
import {
  CHAPTER_ORCHESTRATION_EXECUTION_KIND,
} from '@/lib/editron/shared/render-request-payload';
import {
  getActiveProjectRenderJobsV1,
  getActiveRendersForUser,
} from '@/lib/editron/services/render-job-service';

/**
 * GET /api/services/editron/render/active
 * Returns all active renders for the current user (for resume-on-refresh)
 */
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { type: 'error', message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const projectId = new URL(request.url).searchParams.get('projectId');
    let activeRenders: RenderJob[];
    if (projectId) {
      const snapshot = await projectService.loadProjectForRenderSnapshot(userId, projectId);
      if (!snapshot) {
        return NextResponse.json(
          { type: 'error', message: 'Project not found' },
          { status: 404 },
        );
      }
      const strict = await getActiveProjectRenderJobsV1({
        ownerId: snapshot.ownerId,
        requestedByUserId: userId,
        projectId,
        currentProjectRevision: snapshot.revision,
        limit: 10,
      });
      if (!strict.ok) {
        return NextResponse.json(
          {
            type: 'error',
            code: strict.code,
            message: 'Active renders no longer match the current project revision.',
          },
          { status: 409 },
        );
      }
      const legacy = (await getActiveRendersForUser(snapshot.ownerId)).filter((job) =>
        job.projectId === projectId
        && !job.projectRenderSnapshotBinding
        && !job.artifactBinding
      );
      activeRenders = [...strict.jobs, ...legacy]
        .sort((left, right) =>
          (right.startedAt?.getTime() ?? 0) - (left.startedAt?.getTime() ?? 0)
          || left._id.localeCompare(right._id)
        )
        .slice(0, 10);
    } else {
      activeRenders = (await getActiveRendersForUser(userId)).filter((job) =>
        !job.projectRenderSnapshotBinding && !job.artifactBinding
      );
    }

    const renders = activeRenders
      .sort((left, right) =>
        (right.startedAt?.getTime() ?? 0) - (left.startedAt?.getTime() ?? 0)
        || left._id.localeCompare(right._id)
      )
      .map(toActiveRenderResponse)
      .filter((render): render is Exclude<typeof render, null> => render !== null)
      .slice(0, 10);

    return NextResponse.json({
      type: 'success',
      data: {
        renders,
      }
    });
  } catch (error) {
    console.error('Error fetching active renders:', error);
    return NextResponse.json(
      { type: 'error', message: 'Failed to fetch active renders' },
      { status: 500 }
    );
  }
}

function toActiveRenderResponse(job: RenderJob) {
  if (job.chapterOrchestration !== undefined) {
    return toChapterActiveRenderResponse(job);
  }

  return {
    renderId: job.providerRenderId ?? job._id,
    projectId: job.projectId,
    status: job.status,
    progress: Math.round((job.progress || 0) * 100),
    bucketName: job.bucketName,
    region: job.region,
    startedAt: job.startedAt,
  };
}

/**
 * Chapter parents are provider-free aggregate claims.  Re-parse the durable
 * row at this presentation boundary so malformed or legacy rows cannot be
 * advertised with the chapter resume discriminant.
 */
function toChapterActiveRenderResponse(job: RenderJob) {
  const parsedJob = RenderJobSchema.safeParse(job);
  if (!parsedJob.success) return null;

  const parsedOrchestration = RenderJobChapterOrchestrationSchema.safeParse(
    parsedJob.data.chapterOrchestration,
  );
  if (
    !parsedOrchestration.success
    || parsedOrchestration.data.scope !== RENDER_JOB_CHAPTER_ORCHESTRATION_SCOPE_V1
  ) {
    return null;
  }

  const parsed = parsedJob.data;
  const orchestration = parsedOrchestration.data;
  const binding = parsed.projectRenderSnapshotBinding;
  if (!binding) return null;

  try {
    assertProjectRenderSnapshotBindingV1(binding);
  } catch {
    return null;
  }

  const dispatch = parsed.dispatch;
  if (
    orchestration.aggregateJobId !== parsed._id
    || orchestration.bindingHash !== binding.bindingHash
    || orchestration.selectedRegion !== parsed.region
    || binding.artifactId !== parsed._id
    || dispatch?.phase !== 'NOT_ATTEMPTED'
    || parsed.providerRenderId !== undefined
    || parsed.bucketName !== undefined
    || dispatch.providerRenderId !== undefined
    || dispatch.providerBucketName !== undefined
    || dispatch.providerRegion !== undefined
    || dispatch.providerBoundAt !== undefined
  ) {
    return null;
  }

  return {
    executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
    orchestrationId: orchestration.aggregateJobId,
    renderId: orchestration.aggregateJobId,
    projectId: parsed.projectId,
    status: parsed.status,
    progress: Math.round((orchestration.progress ?? parsed.progress ?? 0) * 100),
    region: orchestration.selectedRegion,
    startedAt: parsed.startedAt,
  };
}
