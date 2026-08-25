/**
 * Asset Resolver Service
 * 
 * Resolves assetId references to signed URLs for media overlays
 */

import { getDatabase, COLLECTIONS } from '../db/mongodb';
import { refreshSignedUrl } from './gcs-service';
import { OverlayType, type MgSequenceOverlay, type Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { normalizeSequenceCdnBaseUrl } from '@/lib/editron/motion-graphics/codegen/render/sequence-playback';
import type { TranscriptionData } from './media/types';
import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import type { MediaSourcePtsCadenceMapRecordV1 } from './media-source-pts-cadence-map-lifecycle-v1';
import type { MediaSourcePtsCadenceMapAssetRecordV2 } from './media-source-pts-cadence-map-asset-state-v2';
import type {
  MediaProxyMasterRelationV1,
  MediaSourceInvalidationPlanV1,
  MediaSourceVersionV1,
} from './media-source-version-v1';
import { resolveActiveMediaR2StorageKeyV1 } from './media-proxy-master-transition-v1';

export interface MediaAsset {
  _id?: any;
  assetId: string;
  userId: string;
  /** Org that owns the asset (org-shared storage pool). Undefined for solo users. */
  orgId?: string;
  projectId?: string;
  type: 'video' | 'audio' | 'image';
  filename: string;
  source: 'user-upload' | 'public'; // Distinguish user uploads from public/stock media
  gcsPath: string | null; // Null for public assets
  publicUrl?: string; // Direct URL for public/stock media (Pexels, Supabase, etc.)
  cachedUrl: string;
  urlExpiresAt: Date;
  size: number;
  duration?: number;
  thumbnail?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  uploadedAt: Date;
  /** Last time the asset was used/resolved — the LRU signal for storage eviction. */
  lastUsedAt?: Date;
  /** When true, the asset is protected from LRU eviction (brand-vault reference or user-pinned). */
  pinned?: boolean;
  /** R2 key for CDN-cached assets */
  r2Key?: string;
  /** True when this asset is a compressed proxy — original still uploading */
  isProxy?: boolean;
  /** R2 key for the original file (set during proxy→original swap) */
  originalR2Key?: string;
  /** Source-bound technical-probe lifecycle embedded in this existing media record. */
  sourceQualificationV1?: MediaSourceQualificationRecordV1;
  /**
   * Immutable identity issued only after a complete server-read byte hash and
   * matching before/after provider observations. `null` is an explicit
   * non-qualified result, never a client or URL fallback.
   */
  sourceVersionV1?: Readonly<MediaSourceVersionV1> | null;
  /** Historical proxy identity retained only for a later qualified proxy/master relation. */
  proxySourceVersionV1?: Readonly<MediaSourceVersionV1> | null;
  /** Historical proxy and newly qualified master, with no implied source-time mapping. */
  proxyMasterRelationV1?: Readonly<MediaProxyMasterRelationV1> | null;
  /** Media-owner invalidation intent; ProjectService separately owns project effects. */
  sourceInvalidationPlanV1?: Readonly<MediaSourceInvalidationPlanV1> | null;
  /** Source-version-bound PTS/cadence lifecycle; absent until the media owner creates it. */
  sourcePtsCadenceMapV1?: Readonly<MediaSourcePtsCadenceMapRecordV1> | null;
  /** Exact canonical hash of `sourcePtsCadenceMapV1`, used only for owner CAS. */
  sourcePtsCadenceMapStateSha256V1?: string | null;
  /** Current successor PTS state. V1 and V2 may never coexist on one asset. */
  sourcePtsCadenceMapV2?: Readonly<MediaSourcePtsCadenceMapAssetRecordV2> | null;
  /** Exact canonical hash of `sourcePtsCadenceMapV2`, used only for owner CAS. */
  sourcePtsCadenceMapStateSha256V2?: string | null;
  /** Cached transcription data (0-based timestamps relative to video start) */
  transcription?: TranscriptionData;
  /** Canonical source receipt for an embedded user-uploaded audio stream. */
  audioRights?: AudioRightsContract;
  /** Canonical source provenance for a reference video (youtube/instagram/remote-url). */
  referenceSource?: Record<string, unknown>;
  /** R1 canonical reference envelope: content hash, audio usage mode, demux receipt. */
  referenceEnvelope?: ReferenceCanonicalEnvelope;
  /** R1 content hash — SHA-256 of the original uploaded/fetched source bytes. */
  contentHash?: string;
}

/** How a reference's demuxed audio may be used (Reference Template Plan Constraint #7). */
export type ReferenceAudioUsageMode =
  /** Default: audio drives preview, waveform, beats, timing — stripped from clean export. */
  | 'preview-waveform-only'
  /** User chose to include the reference song in export AND supplied required attestation. */
  | 'export-attested';

interface ReferenceCanonicalEnvelopeBase {
  /** SHA-256 of the original source bytes (dedup + integrity key). */
  contentHash: string;
  /** Constraint #7 audio usage mode. */
  audioUsageMode: ReferenceAudioUsageMode;
}

/** Historical R1 envelope. Read-compatible only; new issuance uses V2. */
export interface ReferenceCanonicalEnvelopeV1 extends ReferenceCanonicalEnvelopeBase {
  version: 'editron-r1-reference-envelope-v1';
  demux: {
    version: string;
    demuxedAt: string;
    durationMs: number | null;
    videoSha256: string;
    audioSha256: string | null;
    audioPresent: boolean;
  } | null;
}

/**
 * Current R1 envelope. Its demux summary binds the stable demux identity,
 * final demux receipt and both materialized-stream registration receipts.
 */
export interface ReferenceCanonicalEnvelopeV2 extends ReferenceCanonicalEnvelopeBase {
  version: 'editron-r1-reference-envelope-v2';
  demux: {
    version: 'editron-r1-demux-receipt-v2';
    demuxedAt: string;
    durationMs: number | null;
    videoSha256: string;
    audioSha256: string | null;
    audioPresent: boolean;
    receiptSha256: string;
    coreReceiptSha256: string;
    videoRegistrationReceiptSha256: string;
    audioRegistrationReceiptSha256: string | null;
  };
}

/** R1 canonical source provenance stored on a reference video MediaAsset. */
export type ReferenceCanonicalEnvelope =
  | ReferenceCanonicalEnvelopeV1
  | ReferenceCanonicalEnvelopeV2;

/** Persisted generated MG sequence. Kept distinct from searchable user media. */
export interface SequenceMediaAsset extends Omit<MediaAsset, 'type' | 'source'> {
  type: 'sequence';
  source: 'generated';
  sequenceId: string;
  frameCount: number;
  fps: number;
  frameFormat: 'webp';
  transparent: true;
  status: 'processing' | 'ready' | 'failed' | 'deleting';
  r2Prefix: string;
}

export type StoredMediaAsset = MediaAsset | SequenceMediaAsset;

export function hydrateMgSequenceOverlay(
  overlay: MgSequenceOverlay,
  asset: StoredMediaAsset | undefined,
  cdnBaseUrl: string | undefined,
): MgSequenceOverlay {
  if (!asset || asset.type !== 'sequence') {
    throw new Error(`[AssetResolver] MG sequence asset ${overlay.assetId} is missing or has the wrong type`);
  }
  if (asset.status !== 'ready') {
    throw new Error(`[AssetResolver] MG sequence asset ${overlay.assetId} is not ready (status=${asset.status ?? 'missing'})`);
  }
  if (!asset.sequenceId || !/^[A-Za-z0-9_-]+$/.test(asset.sequenceId)) {
    throw new Error(`[AssetResolver] MG sequence asset ${overlay.assetId} has an invalid sequenceId`);
  }
  const frameCount = asset.frameCount;
  const fps = asset.fps;
  const dimensions = asset.dimensions;
  if (typeof frameCount !== 'number' || !Number.isInteger(frameCount) || frameCount <= 0) {
    throw new Error(`[AssetResolver] MG sequence asset ${overlay.assetId} has an invalid frameCount`);
  }
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) {
    throw new Error(`[AssetResolver] MG sequence asset ${overlay.assetId} has an invalid fps`);
  }
  if (!dimensions || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error(`[AssetResolver] MG sequence asset ${overlay.assetId} has invalid dimensions`);
  }
  if (asset.frameFormat !== 'webp' || asset.transparent !== true) {
    throw new Error(`[AssetResolver] MG sequence asset ${overlay.assetId} has an unsupported frame contract`);
  }
  const expectedPrefix = `mgseq_${asset.sequenceId}_`;
  if (asset.r2Prefix !== expectedPrefix) {
    throw new Error(`[AssetResolver] MG sequence asset ${overlay.assetId} has an invalid R2 prefix`);
  }

  return {
    ...overlay,
    sequence: {
      sequenceId: asset.sequenceId,
      frameCount,
      fps,
      width: dimensions.width,
      height: dimensions.height,
      transparent: true,
      frameFormat: 'webp',
      cdnBaseUrl: normalizeSequenceCdnBaseUrl(cdnBaseUrl ?? ''),
    },
  };
}
/** Don't rewrite lastUsedAt more than once per hour per asset (avoids write amplification). */
const LRU_TOUCH_THROTTLE_MS = 60 * 60 * 1000;

/**
 * Bump `lastUsedAt` for assets that are being used (the LRU signal for storage
 * eviction). Throttled + best-effort: only touches assets not touched in the last
 * hour, and never throws — an LRU miss must not affect asset resolution.
 */
async function touchAssetsLastUsed(db: any, assetIds: string[]): Promise<void> {
  if (!assetIds.length) return;
  try {
    const cutoff = new Date(Date.now() - LRU_TOUCH_THROTTLE_MS);
    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateMany(
      {
        assetId: { $in: assetIds },
        $or: [{ lastUsedAt: { $lt: cutoff } }, { lastUsedAt: { $exists: false } }],
      },
      { $set: { lastUsedAt: new Date() } },
    );
  } catch {
    /* best-effort LRU touch — ignore */
  }
}

export class AssetResolver {
  /**
   * Create or get a public asset (for stock media like Pexels, default sounds, etc.)
   * This allows consistent assetId usage even for external media
   */
  async createPublicAsset(params: {
    publicUrl: string;
    type: 'video' | 'audio' | 'image';
    filename: string;
    userId: string;
    duration?: number;
    thumbnail?: string;
    dimensions?: { width: number; height: number };
  }): Promise<MediaAsset> {
    const db = await getDatabase();
    
    // Check if this public URL already exists (avoid duplicates)
    const existing = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .findOne({ publicUrl: params.publicUrl, userId: params.userId }) as unknown as MediaAsset | null;

    if (existing) {
      return existing;
    }

    // Generate new assetId
    const assetId = this.generateAssetId();

    const asset: MediaAsset = {
      assetId,
      userId: params.userId,
      type: params.type,
      filename: params.filename,
      source: 'public',
      gcsPath: null,
      publicUrl: params.publicUrl,
      cachedUrl: params.publicUrl, // Same as publicUrl for public assets
      urlExpiresAt: new Date('2099-12-31'), // Public URLs don't expire
      size: 0, // Unknown for public assets
      duration: params.duration,
      thumbnail: params.thumbnail,
      dimensions: params.dimensions,
      uploadedAt: new Date(),
    };

    await db.collection(COLLECTIONS.MEDIA_ASSETS).insertOne(asset);

    return asset;
  }

  /**
   * Generate a unique assetId
   */
  private generateAssetId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'a_';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  /**
   * Resolve assetIds to URLs for editor
   * This adds the 'src' property based on assetId
   */
  /**
   * @param forceGCS - When true, always use GCS signed URLs (skip CDN proxy).
   *   Lambda rendering REQUIRES this because the CDN proxy doesn't support
   *   Content-Length or Range headers needed by FFmpeg for video seeking.
   */
  async resolveProjectAssets(overlays: Overlay[], forceGCS: boolean = false): Promise<Overlay[]> {
    // Extract unique assetIds from overlays
    const assetIds = new Set<string>();
    
    for (const overlay of overlays) {
      if ('assetId' in overlay && overlay.assetId) {
        assetIds.add(overlay.assetId as string);
      }
    }

    if (assetIds.size === 0) {
      return overlays;
    }

    // Fetch all assets in one query
    const db = await getDatabase();
    const assets = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .find({ assetId: { $in: Array.from(assetIds) } })
      .toArray() as unknown as StoredMediaAsset[];

    // LRU: mark the resolved assets as recently used (fire-and-forget, throttled).
    void touchAssetsLastUsed(db, assets.map(a => a.assetId));

    const foundIds = new Set(assets.map(a => a.assetId));
    const assetsById = new Map(assets.map(asset => [asset.assetId, asset]));

    // Build assetId → URL map
    // Phase D W1: Use CDN URLs when available (never expire, edge-cached).
    // Falls back to GCS signed URL refresh for assets not yet in CDN.
    // forceGCS=true skips CDN entirely (Lambda rendering needs Range headers that CDN proxy doesn't support).
    const cdnBaseUrl = forceGCS ? '' : (process.env.CDN_WORKER_URL || '');
    const assetMap = new Map<string, string>();

    for (const asset of assets) {
      if (asset.type === 'sequence') continue;
      try {
        // CDN Worker URL is the canonical path for R2 assets.
        // A completed proxy promotion retains the proxy key in `r2Key` and
        // selects its server-owned master through `originalR2Key`.
        // Old code: only used CDN if asset had gcsPath/r2Key/cachedUrl-with-CDN.
        // Bug: R2 assets registered by the worker had no r2Key field, so they fell
        // through to "existing non-GCS URL" which returned the expired presigned URL.
        // Guard: GCS-only assets (have gcsPath but no R2 key) must NOT go through CDN
        // Worker — the Worker only serves R2 objects, not GCS.
        const activeStorageKey = resolveActiveMediaR2StorageKeyV1(asset);
        const isGcsOnly = !!asset.gcsPath && !activeStorageKey && !asset.cachedUrl?.includes(cdnBaseUrl);
        if (cdnBaseUrl && asset.assetId && !isGcsOnly) {
          const storageKey = activeStorageKey || asset.assetId;
          assetMap.set(asset.assetId, `${cdnBaseUrl}/asset/${storageKey}`);
        } else if (cdnBaseUrl && asset.cachedUrl && !asset.cachedUrl.includes('storage.googleapis.com')) {
          assetMap.set(asset.assetId, asset.cachedUrl);
        } else {
          // GCS signed URL path (used for forceGCS=true AND when CDN not configured)
          const url = await this.getOrRefreshUrl(asset);
          assetMap.set(asset.assetId, url);
        }
      } catch {
        if (asset.cachedUrl) {
          assetMap.set(asset.assetId, asset.cachedUrl);
        }
      }
    }


    for (const overlay of overlays) {
      if (!('assetId' in overlay) || !overlay.assetId) continue;
      const assetId = overlay.assetId as string;
      if (assetMap.has(assetId) || foundIds.has(assetId)) continue;

      const gcsPath = this.extractOverlayGcsPath(overlay);
      if (!gcsPath) continue;

      try {
        const { url } = await refreshSignedUrl(gcsPath);
        if (url) {
          assetMap.set(assetId, url);
        }
      } catch {
        // The existing overlay source remains intact when its persisted row cannot be recovered.
      }
    }

    // Inject URLs into overlays — but NEVER replace a working URL with empty string.
    // If the resolver can't find a fresh URL, keep the existing src/content.
    // OLD: Empty resolvedUrl overwrote working proxy URLs → Lambda got src:'' → hung forever.
    // NEW: Only replace if we actually have a valid resolved URL.
    return overlays.map(overlay => {
      if (overlay.type === OverlayType.MG_SEQUENCE) {
        return hydrateMgSequenceOverlay(
          overlay,
          assetsById.get(overlay.assetId),
          process.env.CDN_WORKER_URL,
        );
      }
      if ('assetId' in overlay && overlay.assetId) {
        const resolvedUrl = assetMap.get(overlay.assetId as string) || '';
        const existingSrc = (overlay as any).src || (overlay as any).content || '';

        if (resolvedUrl) {
          // Resolver found a fresh URL — use it
          const result: any = { ...overlay, src: resolvedUrl };
          if ((overlay.type === 'sound' || overlay.type === 'video') && resolvedUrl) {
            result.content = resolvedUrl;
          }
          return result as typeof overlay;
        } else if (existingSrc) {
          // No resolved URL, but overlay already has a working URL (e.g., R2 proxy) — keep it
          return overlay;
        } else {
          // No URL anywhere — genuinely broken
          return overlay;
        }
      }
      return overlay;
    });
  }


  private extractOverlayGcsPath(overlay: Overlay): string | null {
    const metadata = (overlay as any).metadata || {};
    const candidates = [
      (overlay as any).gcsPath,
      metadata.gcsPath,
      metadata.voiceover?.gcsPath,
      metadata.tts?.gcsPath,
      metadata.media?.gcsPath,
    ];
    const gcsPath = candidates.find(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
    );
    return gcsPath?.trim() || null;
  }

  /**
   * Get cached URL or refresh if expired/expiring soon
   */
  private async getOrRefreshUrl(asset: MediaAsset): Promise<string> {
    // For public assets, always return the public URL (no expiration)
    if (asset.source === 'public' && asset.publicUrl) {
      return asset.publicUrl;
    }

    // Phase D W1: If CDN is configured, return CDN URL (never expires)
    // The Cloudflare Worker handles R2 caching + GCS fallback transparently.
    const cdnWorkerUrl = process.env.CDN_WORKER_URL;
    if (cdnWorkerUrl && asset.assetId) {
      const storageKey = resolveActiveMediaR2StorageKeyV1(asset) || asset.assetId;
      return `https://${cdnWorkerUrl.replace(/^https?:\/\//, '')}/asset/${storageKey}`;
    }

    // Fallback: GCS signed URL flow (when CDN not configured)
    const now = Date.now();
    const expiresAt = new Date(asset.urlExpiresAt).getTime();
    const threeDaysFromNow = now + 3 * 24 * 60 * 60 * 1000;
    const needsRefresh = expiresAt < threeDaysFromNow;

    if (!needsRefresh) {
      return asset.cachedUrl;
    }

    // Refresh signed URL (only for user uploads with gcsPath)
    if (!asset.gcsPath) {
      // B4 FIX: Don't return expired URL — it'll cause silent 403 errors.
      // If cachedUrl is still valid (not expired yet), use it. Otherwise return empty.
      const now = Date.now();
      const expiresAt = new Date(asset.urlExpiresAt).getTime();
      if (expiresAt > now) {
        return asset.cachedUrl; // Still valid, use it
      }
      return ''; // Empty → editor shows "media unavailable" placeholder
    }

    const { url: newUrl, expiresAt: newExpiresAt } = await refreshSignedUrl(asset.gcsPath);

    // Update cache in database
    const db = await getDatabase();
    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId: asset.assetId },
      {
        $set: {
          cachedUrl: newUrl,
          urlExpiresAt: newExpiresAt,
        },
      }
    );

    return newUrl;
  }

  /**
   * Strip URLs from overlays (keep assetIds only)
   * Use this before sending to LLM or saving to database
   * IMPORTANT: Preserves public/external URLs (Pexels, etc.) but removes GCS signed URLs
   */
  stripUrlsForLLM(overlays: Overlay[]): Overlay[] {
    return overlays.map(overlay => {
      let modified = overlay as any;
      let changed = false;

      if (overlay.type === OverlayType.MG_SEQUENCE && 'sequence' in modified) {
        const { sequence: _, ...persistable } = modified;
        modified = persistable;
        changed = true;
      }

      // Strip temporary URLs from src field (GCS signed + fal.ai CDN)
      // F9.5: fal.ai URLs expire after ~24h — must be stripped like GCS
      if ('src' in modified && modified.src && modified.assetId) {
        const src = modified.src as string;
        const isTemporaryUrl = (src.includes('storage.googleapis.com') && src.includes('X-Goog-Signature'))
          || src.includes('fal.media/files/')
          || src.includes('fal.run/');
        if (isTemporaryUrl) {
          const { src: _, ...rest } = modified;
          modified = rest;
          changed = true;
        }
      }

      // Strip temporary URLs from content field (sound overlays store audio URL here too)
      if ('content' in modified && modified.content && modified.assetId) {
        const content = modified.content as string;
        const isTemporaryUrl = (content.includes('storage.googleapis.com') && content.includes('X-Goog-Signature'))
          || content.includes('fal.media/files/')
          || content.includes('fal.run/');
        if (isTemporaryUrl) {
          modified = { ...modified, content: '' };
          changed = true;
        }
      }

      return changed ? (modified as Overlay) : overlay;
    });
  }

  /**
   * Get asset by assetId
   */
  async getAsset(assetId: string, userId: string): Promise<MediaAsset | null> {
    const db = await getDatabase();
    const asset = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .findOne({ assetId, userId }) as unknown as MediaAsset | null;

    return asset;
  }

  /**
   * Get all assets for a user
   */
  async getUserAssets(userId: string, page = 1, limit = 50): Promise<{
    assets: MediaAsset[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const db = await getDatabase();
    const collection = db.collection(COLLECTIONS.MEDIA_ASSETS);

    const total = await collection.countDocuments({ userId });
    const skip = (page - 1) * limit;

    const assets = await collection
      .find({ userId })
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray() as unknown as MediaAsset[];

    return {
      assets,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Validate all assets in a project before export
   * Checks if URLs are accessible and not expired
   */
  async validateProjectAssets(overlays: Overlay[]): Promise<{
    valid: boolean;
    issues: Array<{
      overlayId: number;
      assetId: string;
      type: 'missing' | 'expired' | 'inaccessible';
      message: string;
    }>;
  }> {
    const issues: Array<{
      overlayId: number;
      assetId: string;
      type: 'missing' | 'expired' | 'inaccessible';
      message: string;
    }> = [];

    // Extract unique assetIds
    const assetIds = new Set<string>();
    const overlayAssetMap = new Map<string, number[]>(); // assetId → overlayIds

    for (const overlay of overlays) {
      if ('assetId' in overlay && overlay.assetId) {
        const assetId = overlay.assetId as string;
        assetIds.add(assetId);
        
        if (!overlayAssetMap.has(assetId)) {
          overlayAssetMap.set(assetId, []);
        }
        overlayAssetMap.get(assetId)!.push(overlay.id);
      }
    }

    if (assetIds.size === 0) {
      return { valid: true, issues: [] };
    }

    // Fetch all assets
    const db = await getDatabase();
    const assets = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .find({ assetId: { $in: Array.from(assetIds) } })
      .toArray() as unknown as MediaAsset[];

    const foundAssetIds = new Set(assets.map(a => a.assetId));

    // Check for missing assets
    for (const assetId of Array.from(assetIds)) {
      if (!foundAssetIds.has(assetId)) {
        const overlayIds = overlayAssetMap.get(assetId) || [];
        for (const overlayId of overlayIds) {
          issues.push({
            overlayId,
            assetId,
            type: 'missing',
            message: `Asset ${assetId} not found in database`,
          });
        }
      }
    }

    // Check for expired or inaccessible URLs
    for (const asset of assets) {
      const overlayIds = overlayAssetMap.get(asset.assetId) || [];
      
      // Check if user-uploaded asset URL is expired
      if (asset.source === 'user-upload') {
        const now = Date.now();
        const expiresAt = new Date(asset.urlExpiresAt).getTime();
        
        if (expiresAt < now) {
          for (const overlayId of overlayIds) {
            issues.push({
              overlayId,
              assetId: asset.assetId,
              type: 'expired',
              message: `Signed URL expired for ${asset.filename}`,
            });
          }
        }
      }

      // Optionally check if URL is accessible (HEAD request)
      // This can be expensive for many assets, so we'll skip for now
      // Could add as optional parameter: validateAccessibility: boolean
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Attempt to fix validation issues automatically
   * - Refresh expired URLs
   * - Return list of unfixable issues
   */
  async fixValidationIssues(overlays: Overlay[]): Promise<{
    fixed: number;
    remaining: Array<{
      overlayId: number;
      assetId: string;
      type: 'missing' | 'inaccessible';
      message: string;
    }>;
  }> {
    const validation = await this.validateProjectAssets(overlays);
    
    if (validation.valid) {
      return { fixed: 0, remaining: [] };
    }

    let fixed = 0;
    const remaining: Array<{
      overlayId: number;
      assetId: string;
      type: 'missing' | 'inaccessible';
      message: string;
    }> = [];

    for (const issue of validation.issues) {
      if (issue.type === 'expired') {
        // Try to refresh the URL
        try {
          const db = await getDatabase();
          const asset = await db
            .collection(COLLECTIONS.MEDIA_ASSETS)
            .findOne({ assetId: issue.assetId }) as unknown as MediaAsset | null;

          if (asset && asset.gcsPath) {
            const { url: newUrl, expiresAt: newExpiresAt } = await refreshSignedUrl(asset.gcsPath);
            
            await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
              { assetId: asset.assetId },
              {
                $set: {
                  cachedUrl: newUrl,
                  urlExpiresAt: newExpiresAt,
                },
              }
            );
            
            fixed++;
          }
        } catch (error) {
          remaining.push({
            overlayId: issue.overlayId,
            assetId: issue.assetId,
            type: 'inaccessible',
            message: `Failed to refresh URL: ${error}`,
          });
        }
      } else if (issue.type === 'missing' || issue.type === 'inaccessible') {
        // Can't auto-fix missing or inaccessible assets
        remaining.push({
          overlayId: issue.overlayId,
          assetId: issue.assetId,
          type: issue.type,
          message: issue.message,
        });
      }
    }

    return { fixed, remaining };
  }

  /**
   * Resolve an assetId to a playable URL (safe for backend usage)
   * Used by renderers, analyzers, and AI tools
   */
  async resolveAssetUrl(assetId: string, userId: string): Promise<string> {
    const asset = await this.getAsset(assetId, userId);

    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    // Public assets (Pexels, stock, etc.)
    if (asset.source === 'public' && asset.publicUrl) {
      return asset.publicUrl;
    }

    // User-uploaded assets → refresh signed URL if needed
    return await this.getOrRefreshUrl(asset);
  }
}

// Singleton instance
export const assetResolver = new AssetResolver();
