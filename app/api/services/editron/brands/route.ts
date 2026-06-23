/**
 * GET/POST /api/services/editron/brands
 *
 * Brand/Client CRUD for agency users.
 * Each brand scopes Graphiti knowledge (preferences, patterns, DNA)
 * so McDonald's intelligence doesn't bleed into Nike projects.
 *
 * GET  — list all brands for the authenticated user
 * POST — create a new brand (dispatches brand_created Graphiti episode)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase } from '@/lib/editron/db/mongodb';
import { nanoid } from 'nanoid';
import { emitBrandEvent } from '@/lib/shared/brand-events';
import { invalidateCache } from '@/lib/shared/brand-registry';
import { writeEditronBrandSettingsToBrandVault } from '@/lib/editron/services/editron-brand-vault-evidence';

export const runtime = 'nodejs';

const BRANDS_COLLECTION = 'brands';

export interface Brand {
  brandId: string;
  userId: string;
  name: string;
  industry: string;
  colors: string[];
  voiceDescription: string;
  visualStyle: string;
  typography: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDatabase();
    const brands = await db
      .collection(BRANDS_COLLECTION)
      .find({ userId })
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json({ success: true, brands });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, industry, colors, voiceDescription, visualStyle, typography } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ success: false, error: 'Brand name required' }, { status: 400 });
    }

    const brandId = `brand_${nanoid(12)}`;
    const now = new Date();

    const brand: Brand = {
      brandId,
      userId,
      name: name.trim(),
      industry: industry || '',
      colors: Array.isArray(colors) ? colors : [],
      voiceDescription: voiceDescription || '',
      visualStyle: visualStyle || '',
      typography: typography || '',
      createdAt: now,
      updatedAt: now,
    };

    const db = await getDatabase();
    await db.collection(BRANDS_COLLECTION).insertOne(brand);

    // Graphiti episode: brand DNA — scoped to BRAND, not user.
    // Rule 11N: agencies manage multiple brands (McDonald's, Nike). Using userId would
    // blend all brand intelligence into one bucket. brandId ensures brand-specific patterns.
    try {
      const { addGraphitiEpisode } = await import('@/lib/editron/services/graph-service');
      await addGraphitiEpisode({
        type: 'brand_created',
        name: `brand_created_${brandId}`,
        body: `User created brand "${name}" in the ${industry || 'unspecified'} industry. `
          + `Brand colors: ${(colors || []).join(', ') || 'not set'}. `
          + `Brand voice: ${voiceDescription || 'not set'}. `
          + `Visual style: ${visualStyle || 'not set'}. `
          + `Typography: ${typography || 'not set'}.`,
        sourceDescription: 'brand_setup',
        groupId: brandId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Brands] brand_created Graphiti dispatch failed: ${msg}`);
    }

    emitBrandEvent({
      userId,
      brandId,
      service: 'editron',
      type: 'brand_updated',
      payload: { action: 'created', name: name.trim(), industry: industry || '' },
    }).catch((e) => console.warn('[Brands] brand_created event failed:', e));

    const vaultSync = await writeEditronBrandSettingsToBrandVault({
      userId,
      actorId: userId,
      brand: { ...brand, orgId: orgId ?? undefined },
      source: 'manual_brand_create',
    });

    invalidateCache(userId);

    return NextResponse.json({ success: true, brand, vaultSync });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
