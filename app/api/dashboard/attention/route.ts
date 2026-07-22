/**
 * GET /api/dashboard/attention
 *
 * Returns items that need the user's attention:
 * 1. Failed video generation batches (joined to projects via storyboards)
 * 2. Projects stuck in a stage for >24h (future)
 *
 * Uses the Editron MongoDB database (getDatabase), not Mongoose.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ObjectId } from 'mongodb';
import { getDatabase } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';

interface AttentionItem {
  id: string;
  type: 'failed-batch' | 'stale-project';
  title: string;
  detail: string;
  time: string;
  projectId: string | null;
  severity: 'high' | 'medium';
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDatabase();
    const items: AttentionItem[] = [];

    // 1. Failed video batches — join to storyboards to get projectId
    const failedBatches = await db.collection('pipeline_video_batches').find({
      userId,
      status: { $in: ['failed', 'partial_enqueue_failure'] },
      dismissedAt: { $exists: false }, // hide items the user has cleared
    }).sort({ createdAt: -1 }).limit(10).toArray();

    if (failedBatches.length > 0) {
      // Get storyboard IDs to look up project links
      const storyboardIds = [...new Set(failedBatches.map(b => b.storyboardId).filter(Boolean))];

      const storyboards = storyboardIds.length > 0
        ? await db.collection('storyboards').find(
            { storyboardId: { $in: storyboardIds } },
            { projection: { storyboardId: 1, projectId: 1, name: 1 } }
          ).toArray()
        : [];

      const storyboardMap = new Map(
        storyboards.map(s => [s.storyboardId, { projectId: s.projectId || null, name: s.name || 'Untitled' }])
      );

      for (const batch of failedBatches) {
        const sb = storyboardMap.get(batch.storyboardId);
        const failedCount = batch.failed || 0;
        const totalCount = batch.totalScenes || 0;

        items.push({
          id: batch._id?.toString() || batch.batchId || '',
          type: 'failed-batch',
          title: sb?.name || 'Video generation failed',
          detail: `${failedCount}/${totalCount} scenes failed · ${batch.videoModel || 'unknown model'}`,
          time: batch.createdAt ? new Date(batch.createdAt).toISOString() : new Date().toISOString(),
          projectId: sb?.projectId || null,
          severity: failedCount === totalCount ? 'high' : 'medium',
        });
      }
    }

    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    console.error('[dashboard/attention]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboard/attention
 * Dismisses (soft-clears) failed-batch attention items so they stop showing.
 * Body: { id } to clear one, or { all: true } to clear every failed batch.
 * Non-destructive — sets `dismissedAt`; the batch record is kept.
 */
export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const id: string | undefined = typeof body?.id === 'string' ? body.id : undefined;
    const all = body?.all === true;

    // Only ever touch THIS user's failed batches.
    const base = { userId, status: { $in: ['failed', 'partial_enqueue_failure'] } };
    let filter: Record<string, unknown>;
    if (all) {
      filter = base;
    } else if (id) {
      const or: Record<string, unknown>[] = [{ batchId: id }];
      if (ObjectId.isValid(id)) or.push({ _id: new ObjectId(id) });
      filter = { ...base, $or: or };
    } else {
      return NextResponse.json({ error: 'Provide `id` or `all: true`.' }, { status: 400 });
    }

    const db = await getDatabase();
    const result = await db.collection('pipeline_video_batches').updateMany(
      filter,
      { $set: { dismissedAt: new Date() } },
    );
    return NextResponse.json({ success: true, dismissed: result.modifiedCount });
  } catch (error: any) {
    console.error('[dashboard/attention][DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
