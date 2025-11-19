/**
 * Asset Resolver Service
 * 
 * Resolves assetId references to signed URLs for media overlays
 */

import { getDatabase, COLLECTIONS } from '../db/mongodb';
import { refreshSignedUrl } from './gcs-service';
import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

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

    // Build assetId → URL map (with auto-refresh)
    const assetMap = new Map<string, string>();
    
    for (const asset of assets) {
      const url = await this.getOrRefreshUrl(asset);
      assetMap.set(asset.assetId, url);
    }

    // Inject URLs into overlays
    return overlays.map(overlay => {
      if ('assetId' in overlay && overlay.assetId) {
        return { 
          ...overlay, 
          src: assetMap.get(overlay.assetId as string) || '' 
        };
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

    // For user-uploaded assets, check expiration
    const now = Date.now();
    const expiresAt = new Date(asset.urlExpiresAt).getTime();
    const oneDayFromNow = now + 24 * 60 * 60 * 1000; // Refresh if <1 day remaining

    // Refresh if expired or expiring within 1 day
    const needsRefresh = expiresAt < oneDayFromNow;

    if (!needsRefresh) {
      return asset.cachedUrl;
    }

    // Refresh signed URL (only for user uploads with gcsPath)
    if (!asset.gcsPath) {
      console.warn(`Asset ${asset.assetId} has no gcsPath and is not a public asset`);
      return asset.cachedUrl; // Fallback to cached URL
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
   */
  stripUrlsForLLM(overlays: Overlay[]): Overlay[] {
    return overlays.map(overlay => {
      // Remove 'src' property if it exists
      const { src, ...rest } = overlay as any;
      return rest as Overlay;
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
}

// Singleton instance
export const assetResolver = new AssetResolver();
