import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { assetResolver } from '@/lib/editron/services/asset-resolver';

type PublicAssetType = 'video' | 'audio' | 'image';

const PUBLIC_ASSET_TYPES = new Set<PublicAssetType>(['video', 'audio', 'image']);
const STOCK_SOUND_HOST = 'rwxrdxvxndclnqvznxfj.supabase.co';
const MAX_FILENAME_LENGTH = 160;
const MAX_DURATION_SECONDS = 6 * 60 * 60;
const MAX_DIMENSION = 8192;

function isPublicAssetType(value: unknown): value is PublicAssetType {
  return typeof value === 'string' && PUBLIC_ASSET_TYPES.has(value as PublicAssetType);
}

function normalizePublicAssetUrl(value: unknown, type: PublicAssetType): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') {
      return null;
    }

    if (type === 'video' && host === 'videos.pexels.com' && url.pathname.startsWith('/video-files/')) {
      return url.toString();
    }

    if (type === 'image' && host === 'images.pexels.com') {
      return url.toString();
    }

    if (type === 'audio' && host === STOCK_SOUND_HOST && url.pathname.startsWith('/storage/v1/object/public/sounds/')) {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeOptionalThumbnail(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return normalizePublicAssetUrl(value, 'image');
}

function normalizeFilename(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const filename = value
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .slice(0, MAX_FILENAME_LENGTH);

  return filename || null;
}

function normalizeOptionalDuration(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_DURATION_SECONDS) {
    return null;
  }
  return value;
}

function normalizeOptionalDimensions(value: unknown): { width: number; height: number } | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object') {
    return null;
  }

  const dimensions = value as { width?: unknown; height?: unknown };
  if (
    typeof dimensions.width !== 'number'
    || typeof dimensions.height !== 'number'
    || !Number.isFinite(dimensions.width)
    || !Number.isFinite(dimensions.height)
    || dimensions.width <= 0
    || dimensions.height <= 0
    || dimensions.width > MAX_DIMENSION
    || dimensions.height > MAX_DIMENSION
  ) {
    return null;
  }

  return { width: dimensions.width, height: dimensions.height };
}

/**
 * POST /api/services/editron/assets/create-public
 *
 * Create a media asset record for allowlisted public/stock media.
 * Owner is always derived from the authenticated Clerk session.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const { type } = input;
    if (!isPublicAssetType(type)) {
      return NextResponse.json({ error: 'Invalid type. Must be video, audio, or image' }, { status: 400 });
    }

    const publicUrl = normalizePublicAssetUrl(input.publicUrl, type);
    if (!publicUrl) {
      return NextResponse.json({ error: 'Public asset URL is not allowed' }, { status: 400 });
    }

    const filename = normalizeFilename(input.filename);
    if (!filename) {
      return NextResponse.json({ error: 'Missing or invalid filename' }, { status: 400 });
    }

    const duration = normalizeOptionalDuration(input.duration);
    if (duration === null) {
      return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });
    }

    const thumbnail = normalizeOptionalThumbnail(input.thumbnail);
    if (thumbnail === null) {
      return NextResponse.json({ error: 'Invalid thumbnail URL' }, { status: 400 });
    }

    const dimensions = normalizeOptionalDimensions(input.dimensions);
    if (dimensions === null) {
      return NextResponse.json({ error: 'Invalid dimensions' }, { status: 400 });
    }

    const asset = await assetResolver.createPublicAsset({
      publicUrl,
      type,
      filename,
      userId: session.userId,
      duration,
      thumbnail,
      dimensions,
    });

    return NextResponse.json({
      success: true,
      assetId: asset.assetId,
      asset,
    });
  } catch (error) {
    console.error('Error creating public asset:', error);
    return NextResponse.json(
      { error: 'Failed to create public asset' },
      { status: 500 },
    );
  }
}