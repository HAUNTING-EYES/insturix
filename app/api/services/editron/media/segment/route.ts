/**
 * POST /api/services/editron/media/segment
 *
 * Creates a saved segment from a parent asset.
 * Segments are child entries in mediaAssets that reference the parent
 * asset's file + a time range. No data is duplicated.
 *
 * GET /api/services/editron/media/segment?parentAssetId=xxx
 * Returns all segments for a given parent asset.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { auth } from '@clerk/nextjs/server';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import type { MediaAsset } from '@/lib/editron/services/asset-resolver';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { parentAssetId, segmentStart, segmentEnd, name } = await request.json();

    if (!parentAssetId || segmentStart == null || segmentEnd == null || !name) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: parentAssetId, segmentStart, segmentEnd, name' },
        { status: 400 },
      );
    }

    if (segmentEnd <= segmentStart) {
      return NextResponse.json(
        { success: false, error: 'segmentEnd must be greater than segmentStart' },
        { status: 400 },
      );
    }

    const db = await getDatabase();

    // Verify parent asset exists and belongs to user
    const parent = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .findOne({ assetId: parentAssetId, userId }) as unknown as MediaAsset | null;

    if (!parent) {
      return NextResponse.json({ success: false, error: 'Parent asset not found' }, { status: 404 });
    }

    // Create segment asset — references parent's GCS file
    const { nanoid } = await import('nanoid');
    const segmentAssetId = `seg_${nanoid(12)}`;

    const segmentAsset: any = {
      assetId: segmentAssetId,
      userId,
      type: parent.type,
      source: 'user-upload',
      filename: name,
      gcsPath: parent.gcsPath, // Same file as parent
      cachedUrl: parent.cachedUrl,
      urlExpiresAt: parent.urlExpiresAt,
      size: parent.size,
      thumbnail: parent.thumbnail,
      duration: segmentEnd - segmentStart,
      dimensions: parent.dimensions,
      uploadedAt: new Date(),
      // Segment-specific fields
      parentAssetId,
      segmentStart,
      segmentEnd,
      isSegment: true,
      // Inherit parent's analysis tags (filtered to segment relevance)
      tags: (parent as any).tags || [],
      analysisStatus: 'complete', // Inherits parent analysis
    };

    await db.collection(COLLECTIONS.MEDIA_ASSETS).insertOne(segmentAsset);

    return NextResponse.json({
      success: true,
      segment: {
        assetId: segmentAssetId,
        parentAssetId,
        segmentStart,
        segmentEnd,
        name,
        duration: segmentEnd - segmentStart,
      },
    });
  } catch (error: any) {
    console.error('[Segment] Create error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const parentAssetId = request.nextUrl.searchParams.get('parentAssetId');

    const db = await getDatabase();
    const filter: any = { userId, isSegment: true };
    if (parentAssetId) filter.parentAssetId = parentAssetId;

    const segments = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .find(filter)
      .sort({ uploadedAt: -1 })
      .toArray();

    const resolved = await Promise.all(
      segments.map(async (seg: any) => {
        let url = seg.cachedUrl || '';
        try {
          url = await (assetResolver as any).getOrRefreshUrl(seg) || url;
        } catch (err: unknown) { console.warn('[Segment] URL refresh failed, using cached:', err instanceof Error ? err.message : err); }
        return {
          assetId: seg.assetId,
          parentAssetId: seg.parentAssetId,
          name: seg.filename,
          type: seg.type,
          url,
          thumbnail: seg.thumbnail,
          duration: seg.duration,
          segmentStart: seg.segmentStart,
          segmentEnd: seg.segmentEnd,
          tags: seg.tags || [],
        };
      }),
    );

    return NextResponse.json({ success: true, segments: resolved });
  } catch (error: any) {
    console.error('[Segment] List error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
