import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import {
  avatarStoryboardSceneUpdate,
  buildAvatarStoryboardJobRequests,
  createAvatarStoryboardJob,
  getAvatarStoryboardVideo,
  refreshAvatarStoryboardJob,
  type AvatarStoryboardJobSummary,
} from '@/lib/pipeline/avatar-storyboard-bridge';
import { getStoryboard, updateStoryboardScene } from '@/lib/pipeline/storyboard-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { id: storyboardId } = await params;
    const storyboard = await getStoryboard(storyboardId, userId);
    if (!storyboard) {
      return NextResponse.json({ success: false, error: 'Storyboard not found' }, { status: 404 });
    }

    const { requests, skipped } = buildAvatarStoryboardJobRequests(storyboard);
    const summaries: AvatarStoryboardJobSummary[] = skipped.map((item) => ({
      sceneIndex: item.sceneIndex,
      status: 'skipped',
      reason: item.reason,
    }));

    for (const request of requests) {
      const scene = storyboard.scenes.find((candidate) => candidate.sceneIndex === request.sceneIndex);
      if (!scene) continue;

      if (scene.avatarPipelineJobId) {
        summaries.push({
          sceneIndex: request.sceneIndex,
          jobId: scene.avatarPipelineJobId,
          status: scene.avatarPipelineStatus ?? 'queued',
          ...(scene.avatarPipelineError ? { reason: scene.avatarPipelineError } : {}),
        });
        continue;
      }

      try {
        const job = await createAvatarStoryboardJob({ userId, orgId, request });
        await updateStoryboardScene(storyboardId, request.sceneIndex, {
          avatarPipelineJobId: job.id,
          avatarPipelineStatus: job.status,
          ...(job.status === 'blocked' ? { avatarPipelineError: job.statusReason } : {}),
        });
        summaries.push({
          sceneIndex: request.sceneIndex,
          jobId: job.id,
          status: job.status,
          ...(job.status === 'blocked' ? { reason: job.statusReason } : {}),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        summaries.push({
          sceneIndex: request.sceneIndex,
          status: 'failed',
          reason,
        });
      }
    }

    return NextResponse.json({
      success: true,
      storyboardId,
      jobs: summaries,
      created: summaries.filter((summary) => Boolean(summary.jobId)).length,
      skipped: summaries.filter((summary) => summary.status === 'skipped').length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[storyboard-avatar] create failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { id: storyboardId } = await params;
    const storyboard = await getStoryboard(storyboardId, userId);
    if (!storyboard) {
      return NextResponse.json({ success: false, error: 'Storyboard not found' }, { status: 404 });
    }

    const summaries: AvatarStoryboardJobSummary[] = [];
    for (const scene of storyboard.scenes) {
      if (!scene.avatarPipelineJobId) continue;

      try {
        const job = await refreshAvatarStoryboardJob({
          userId,
          orgId,
          jobId: scene.avatarPipelineJobId,
        });
        const video = getAvatarStoryboardVideo(job);
        if (Object.keys(video).length > 0 || job.status === 'failed') {
          await updateStoryboardScene(
            storyboardId,
            scene.sceneIndex,
            avatarStoryboardSceneUpdate(job, video),
          );
        }
        summaries.push({
          sceneIndex: scene.sceneIndex,
          jobId: job.id,
          status: job.status,
          ...(job.status === 'failed' ? { reason: job.statusReason } : {}),
          ...video,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        summaries.push({
          sceneIndex: scene.sceneIndex,
          jobId: scene.avatarPipelineJobId,
          status: 'failed',
          reason,
        });
      }
    }

    const terminal = summaries.filter((summary) => (
      summary.status === 'succeeded'
      || summary.status === 'failed'
      || summary.status === 'blocked'
    )).length;

    return NextResponse.json({
      success: true,
      storyboardId,
      jobs: summaries,
      completed: terminal,
      total: summaries.length,
      isComplete: summaries.length > 0 && terminal === summaries.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[storyboard-avatar] refresh failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
