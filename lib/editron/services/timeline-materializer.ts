/**
 * Timeline materializer — shared, deterministic timeline assembly.
 *
 * Moved verbatim from app/api/services/editron/auto-edit/from-batch/route.ts
 * (Next.js route files cannot export helpers) so the assist lane (Director Mode)
 * can reuse the chronological lay-down without duplicating it.
 *
 *   assets (uploadedAt order) ──► materializeChronologicalFallback ──► overlays
 *        videos: full probed duration, untrimmed
 *        images: DEFAULT_IMAGE_HOLD_SEC hold
 *
 * Behavior contract: identical to the original route-local implementation.
 * The assist lane's stricter duration handling lives in assist-lane.ts as a
 * PRE-materializer partition — this module never trims differently per lane.
 */
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import { ROW } from '@/lib/pipeline/scene-to-editron';

export const FPS = 30;
export const DEFAULT_IMAGE_HOLD_SEC = 4;

/** Structural subset of a batch media asset the materializer needs. */
export type MaterializableAsset = {
  assetId: string;
  type: 'video' | 'image' | 'audio';
  duration?: number | string | null;
  thumbnail?: string;
  cachedUrl?: string | null;
  publicUrl?: string | null;
  uploadedAt?: Date | string | null;
};

export type MaterializedTimeline = {
  overlays: Array<Record<string, unknown>>;
  durationInFrames: number;
  source: 'storyline' | 'chronological-fallback';
  clipCount: number;
};

function positiveNumber(value: number | string | null | undefined): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

export function positiveDurationSec(asset: Pick<MaterializableAsset, 'duration'>): number | undefined {
  return positiveNumber(asset.duration);
}

export async function resolveOverlayUrl(
  asset: Pick<MaterializableAsset, 'assetId' | 'publicUrl' | 'cachedUrl'>,
  userId: string,
): Promise<string> {
  try {
    const { isR2Available, getR2PublicUrl } = await import('@/lib/editron/services/r2-service');
    if (isR2Available()) return getR2PublicUrl(asset.assetId);
  } catch (error) {
    console.warn('[timeline-materializer] R2 public URL failed:', error instanceof Error ? error.message : error);
  }

  const resolved = await assetResolver.resolveAssetUrl(asset.assetId, userId).catch(() => null);
  return resolved || asset.publicUrl || asset.cachedUrl || '';
}

export async function materializeChronologicalFallback(
  assets: readonly MaterializableAsset[],
  userId: string,
  uploadBatchId: string,
  dims: { width: number; height: number },
): Promise<MaterializedTimeline> {
  const visualAssets = [...assets]
    .filter((asset) => asset.type === 'video' || asset.type === 'image')
    .sort((a, b) => new Date(a.uploadedAt ?? 0).getTime() - new Date(b.uploadedAt ?? 0).getTime());

  const overlays: Array<Record<string, unknown>> = [];
  let cursor = 0;
  let overlayId = Date.now();

  for (const [index, asset] of visualAssets.entries()) {
    const durationSec = asset.type === 'video'
      ? (positiveDurationSec(asset) ?? DEFAULT_IMAGE_HOLD_SEC)
      : DEFAULT_IMAGE_HOLD_SEC;
    const durationFrames = Math.max(1, Math.round(durationSec * FPS));
    const src = await resolveOverlayUrl(asset, userId);
    const base = {
      id: overlayId++,
      type: asset.type,
      from: cursor,
      durationInFrames: durationFrames,
      row: ROW.VIDEO,
      left: 0,
      top: 0,
      width: dims.width,
      height: dims.height,
      isDragging: false,
      rotation: 0,
      content: asset.type === 'image' ? src : (asset.thumbnail || ''),
      src,
      assetId: asset.assetId,
      styles: { opacity: 1, objectFit: 'cover' },
      storyline: {
        uploadBatchId,
        source: 'chronological-fallback',
        order: index,
        role: index === 0 ? 'hook' : index === visualAssets.length - 1 ? 'outro' : 'body',
      },
    };

    overlays.push(asset.type === 'video'
      ? { ...base, videoStartTime: 0, sourceStartFrame: 0 }
      : { ...base, styles: { objectFit: 'cover', animation: { enter: 'fadeIn', exit: 'fadeOut' } } });
    cursor += durationFrames;
  }

  return { overlays, durationInFrames: cursor, source: 'chronological-fallback', clipCount: overlays.length };
}
