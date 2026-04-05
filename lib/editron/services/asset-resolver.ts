/**
 * Asset Resolver Service
 * 
 * Resolves assetId references to signed URLs for media overlays
 */

import { getDatabase, COLLECTIONS } from '../db/mongodb';
import { refreshSignedUrl } from './gcs-service';
import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import type { TranscriptionData } from './media/types';

export interface MediaAsset {
  _id?: any;
  assetId: string;
  userId: string;
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
  /** R2 key for CDN-cached assets */
  r2Key?: string;
  /** Cached transcription data (0-based timestamps relative to video start) */
  transcription?: TranscriptionData;
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
  async resolveProjectAssets(overlays: Overlay[]): Promise<Overlay[]> {
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
      .toArray() as unknown as MediaAsset[];

    console.log(`[AssetResolver] Resolving ${assetIds.size} assets, found ${assets.length} in DB`);

    // Log unresolved assets
    const foundIds = new Set(assets.map(a => a.assetId));
    for (const id of assetIds) {
      if (!foundIds.has(id)) {
        console.warn(`[AssetResolver] Asset NOT FOUND in media_assets: ${id}`);
      }
    }

    // Build assetId → URL map
    // Phase D W1: Use CDN URLs when available (never expire, edge-cached).
    // Falls back to GCS signed URL refresh for assets not yet in CDN.
    const cdnBaseUrl = process.env.CDN_WORKER_URL; // e.g., https://editron-asset-proxy.aged-shape-8752.workers.dev
    const assetMap = new Map<string, string>();

    for (const asset of assets) {
      try {
        if (cdnBaseUrl && (asset.gcsPath || asset.r2Key || asset.cachedUrl?.includes(cdnBaseUrl))) {
          // CDN URL — never expires, edge-cached.
          // Works for both R2-primary assets (r2Key) and GCS assets (gcsPath → Worker fetches from GCS on miss)
          assetMap.set(asset.assetId, `${cdnBaseUrl}/asset/${asset.assetId}`);
        } else if (cdnBaseUrl && asset.cachedUrl && !asset.cachedUrl.includes('storage.googleapis.com')) {
          // Asset already has a non-GCS URL (e.g., R2 public URL) — use directly
          assetMap.set(asset.assetId, asset.cachedUrl);
        } else {
          // No CDN configured or no gcsPath — use traditional GCS URL refresh
          const url = await this.getOrRefreshUrl(asset);
          assetMap.set(asset.assetId, url);
        }
      } catch (err: any) {
        console.error(`[AssetResolver] Failed to resolve URL for ${asset.assetId}:`, err.message);
        if (asset.cachedUrl) {
          assetMap.set(asset.assetId, asset.cachedUrl);
        }
      }
    }

    // Inject URLs into overlays — but NEVER replace a working URL with empty string.
    // If the resolver can't find a fresh URL, keep the existing src/content.
    // OLD: Empty resolvedUrl overwrote working proxy URLs → Lambda got src:'' → hung forever.
    // NEW: Only replace if we actually have a valid resolved URL.
    return overlays.map(overlay => {
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
          console.warn(`[AssetResolver] No resolved URL for ${overlay.assetId}, keeping existing: ${existingSrc.substring(0, 80)}`);
          return overlay;
        } else {
          // No URL anywhere — genuinely broken
          console.error(`[AssetResolver] No URL available for ${overlay.assetId}, type=${overlay.type} — render will fail for this asset`);
          return overlay;
        }
      }
      return overlay;
    });
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
      return `https://${cdnWorkerUrl.replace(/^https?:\/\//, '')}/asset/${asset.assetId}`;
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
      console.error(`[AssetResolver] Asset ${asset.assetId} expired and has no gcsPath — media unavailable`);
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
   * Get a proxy URL that never expires.
   * Returns /api/services/editron/assets/url/{assetId} which 302-redirects
   * to the current valid URL. Browser caches redirect for 1 hour.
   */
  getProxyUrl(assetId: string): string {
    return `/api/services/editron/assets/url/${assetId}`;
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
          console.error(`Failed to refresh asset ${issue.assetId}:`, error);
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
