import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import type { RenderJob } from '@/lib/editron/schemas/render-job';
import { projectService } from '@/lib/editron/services/project-service';
import {
  getProjectRenderHistoryV1,
  getRenderHistoryForProject,
  MAX_RENDER_FINALIZATION_ATTEMPTS,
} from '@/lib/editron/services/render-job-service';

function hasRetryableFinalizationEvidence(job: Awaited<ReturnType<typeof getRenderHistoryForProject>>[number]) {
  const finalization = job.finalization;
  return job.status === 'error'
    && finalization?.state === 'failed'
    && Number.isInteger(finalization.attempts)
    && finalization.attempts < MAX_RENDER_FINALIZATION_ATTEMPTS
    && typeof finalization.sourceOutputUrl === 'string'
    && finalization.sourceOutputUrl.startsWith('https://')
    && Number.isInteger(finalization.sourceOutputSize)
    && finalization.sourceOutputSize >= 0
    && Number.isInteger(job.expectedDurationMs)
    && job.expectedDurationMs! > 0;
}

/**
 * GET /api/services/editron/render/history?projectId=xxx
 * Returns the public render history projection for a project.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { type: 'error', message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { type: 'error', message: 'Missing projectId parameter' },
        { status: 400 }
      );
    }

    const snapshot = await projectService.loadProjectForRenderSnapshot(userId, projectId);
    if (!snapshot) {
      return NextResponse.json(
        { type: 'error', message: 'Project not found' },
        { status: 404 },
      );
    }
    const strict = await getProjectRenderHistoryV1({
      ownerId: snapshot.ownerId,
      requestedByUserId: userId,
      projectId,
      limit: 10,
    });
    if (!strict.ok) {
      return NextResponse.json(
        {
          type: 'error',
          code: strict.code,
          message: 'Render history could not be validated.',
        },
        { status: 409 },
      );
    }
    const legacy = (await getRenderHistoryForProject(
      projectId,
      snapshot.ownerId,
      10,
    )).filter((job) => !job.projectRenderSnapshotBinding && !job.artifactBinding);
    const history: RenderJob[] = [...strict.jobs, ...legacy]
      .sort((left, right) =>
        renderHistoryTime(right) - renderHistoryTime(left)
        || left._id.localeCompare(right._id)
      )
      .slice(0, 10);

    return NextResponse.json({
      type: 'success',
      data: {
        renders: history.map(job => ({
          id: job._id,
          status: job.status,
          url: job.outputUrl,
          size: job.outputSize,
          deliveryManifest: job.deliveryManifest,
          error: job.error,
          finalizationState: job.finalization?.state ?? null,
          canRetryFinalization: hasRetryableFinalizationEvidence(job),
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          expiresAt: job.expiresAt,
        })),
      }
    });
  } catch (error) {
    console.error('Error fetching render history:', error);
    return NextResponse.json(
      { type: 'error', message: 'Failed to fetch render history' },
      { status: 500 }
    );
  }
}

function renderHistoryTime(job: RenderJob): number {
  return job.completedAt?.getTime() ?? job.startedAt.getTime();
}
