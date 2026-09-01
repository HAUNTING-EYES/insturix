import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import type { RenderJob } from '@/lib/editron/schemas/render-job';
import { projectService } from '@/lib/editron/services/project-service';
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

    return NextResponse.json({
      type: 'success',
      data: {
        renders: activeRenders.map(job => ({
          renderId: job.providerRenderId ?? job._id,
          projectId: job.projectId,
          status: job.status,
          progress: Math.round((job.progress || 0) * 100),
          bucketName: job.bucketName,
          region: job.region,
          startedAt: job.startedAt,
        })),
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
