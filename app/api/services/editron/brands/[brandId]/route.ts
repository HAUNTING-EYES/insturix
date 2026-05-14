/**
 * GET/PATCH/DELETE /api/services/editron/brands/[brandId]
 *
 * Single brand operations. PATCH dispatches brand_updated Graphiti episode
 * so the knowledge graph tracks brand DNA evolution over time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase } from '@/lib/editron/db/mongodb';
import { emitBrandEvent } from '@/lib/shared/brand-events';
import { invalidateCache } from '@/lib/shared/brand-registry';

export const runtime = 'nodejs';

const BRANDS_COLLECTION = 'brands';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { brandId } = await params;
    const db = await getDatabase();
    const brand = await db.collection(BRANDS_COLLECTION).findOne({ brandId, userId });

    if (!brand) return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 });
    return NextResponse.json({ success: true, brand });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { brandId } = await params;
    const body = await request.json();
    const { name, industry, colors, voiceDescription, visualStyle, typography } = body;

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updateFields.name = name;
    if (industry !== undefined) updateFields.industry = industry;
    if (colors !== undefined) updateFields.colors = colors;
    if (voiceDescription !== undefined) updateFields.voiceDescription = voiceDescription;
    if (visualStyle !== undefined) updateFields.visualStyle = visualStyle;
    if (typography !== undefined) updateFields.typography = typography;

    const db = await getDatabase();
    const result = await db.collection(BRANDS_COLLECTION).updateOne(
      { brandId, userId },
      { $set: updateFields },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 });
    }

    // Graphiti episode: brand DNA evolution — scoped to BRAND (Rule 11N).
    try {
      const { addGraphitiEpisode } = await import('@/lib/editron/services/graph-service');
      const changedFields = Object.keys(updateFields).filter(k => k !== 'updatedAt');
      await addGraphitiEpisode({
        type: 'brand_updated',
        name: `brand_updated_${brandId}_${Date.now()}`,
        body: `Brand "${name || brandId}" updated fields: ${changedFields.join(', ')}. `
          + (colors ? `New colors: ${colors.join(', ')}. ` : '')
          + (voiceDescription ? `New voice: ${voiceDescription}. ` : '')
          + (visualStyle ? `New visual style: ${visualStyle}. ` : ''),
        sourceDescription: 'brand_update',
        groupId: brandId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Brands] brand_updated Graphiti dispatch failed for ${brandId}: ${msg}`);
    }

    const changedFieldNames = Object.keys(updateFields).filter(k => k !== 'updatedAt');
    emitBrandEvent({
      userId,
      brandId,
      service: 'editron',
      type: 'brand_updated',
      payload: { action: 'updated', fields: changedFieldNames },
    }).catch((e) => console.warn('[Brands] brand_updated event failed:', e));

    invalidateCache(userId);

    const updated = await db.collection(BRANDS_COLLECTION).findOne({ brandId, userId });
    return NextResponse.json({ success: true, brand: updated });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { brandId } = await params;
    const db = await getDatabase();
    const result = await db.collection(BRANDS_COLLECTION).deleteOne({ brandId, userId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 });
    }

    emitBrandEvent({
      userId,
      brandId,
      service: 'editron',
      type: 'brand_updated',
      payload: { action: 'deleted' },
    }).catch((e) => console.warn('[Brands] brand_deleted event failed:', e));

    invalidateCache(userId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
