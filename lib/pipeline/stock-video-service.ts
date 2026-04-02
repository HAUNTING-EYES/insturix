/**
 * Stock Video Service
 *
 * Searches Pixabay + Pexels for stock video footage, downloads the best match,
 * and uploads to R2 for use in the pipeline.
 *
 * Priority order: Pixabay (free, no attribution) → Pexels (free, attribution appreciated)
 *
 * Follows the same pattern as sfx-library-service.ts:
 *   Search → Download → Validate → Upload to R2 → Return URL
 *
 * Used by:
 *   - prefetch-stock-video route (parallel to video gen)
 *   - AI chat tools (manual stock footage search)
 *   - Future: stock footage browse panel in editor
 */

import { searchStockVideos, isPixabayAvailable } from './pixabay-service';
import { nanoid } from 'nanoid';

const PEXELS_API_KEY = process.env.NEXT_PUBLIC_PEXELS_API_KEY || process.env.PEXELS_API_KEY;

export interface StockVideoResult {
  videoUrl: string;
  r2Key: string;
  assetId: string;
  durationMs: number;
  source: 'pixabay' | 'pexels';
  thumbnailUrl?: string;
  originalTitle?: string;
  width?: number;
  height?: number;
  query: string;
}

/**
 * Check if stock video search is available (at least one API key configured)
 */
export function isStockVideoAvailable(): boolean {
  return isPixabayAvailable() || !!PEXELS_API_KEY;
}

/**
 * Extract 3-5 search keywords from a visual description.
 * Strips cinematic fluff (lighting, lens, grade) and keeps subjects + actions.
 */
export function visualDescriptionToSearchQuery(desc: string): string {
  if (!desc) return '';

  // Remove cinematic/photography terms that don't help stock search
  const stripped = desc
    .replace(/\b(cinematic|35mm|film grain|shallow depth of field|anamorphic|bokeh|lens flare|soft focus|golden hour|professional color grade|crisp|vibrant|desaturated|warm lighting|ambient lighting|natural light|studio lighting|macro lens|wide[- ]angle|close[- ]up|medium shot|wide shot|extreme|subtle|gentle|slightly)\b/gi, '')
    .replace(/\b(filmic|nostalgic|intimate|dynamic|composition|framing|quality|resolution|4k|hd|aesthetic|authentic|candid|photography|footage|cinematic)\b/gi, '')
    .replace(/[,.:;!?()]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Take the first 5 meaningful words (skip articles, prepositions)
  const stopwords = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'of', 'and', 'or', 'with', 'for', 'to', 'is', 'are', 'was', 'were', 'their', 'from', 'by', 'this', 'that', 'it', 'its', 'into', 'as', 'be', 'being']);
  const words = stripped.split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w.toLowerCase()));

  return words.slice(0, 5).join(' ');
}

/**
 * Search Pexels video API.
 */
async function searchPexelsVideos(
  query: string,
  options: { maxDuration?: number; orientation?: 'landscape' | 'portrait' | 'square'; limit?: number } = {},
): Promise<Array<{ videoUrl: string; videoUrlHD?: string; duration: number; thumbnailUrl: string; title: string; width: number; height: number; source: 'pexels' }>> {
  if (!PEXELS_API_KEY) return [];

  const { maxDuration, orientation, limit = 10 } = options;
  const params = new URLSearchParams({
    query,
    per_page: String(Math.min(limit, 30)),
    size: 'medium',
  });
  if (orientation) params.set('orientation', orientation);

  try {
    const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
      headers: { Authorization: PEXELS_API_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[StockVideo] Pexels search failed: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.videos || [])
      .filter((v: any) => {
        if (maxDuration && v.duration > maxDuration) return false;
        return true;
      })
      .map((v: any) => {
        // Pick best video file: prefer HD, fallback to SD
        const files = v.video_files || [];
        const hd = files.find((f: any) => f.quality === 'hd' && f.width >= 1280);
        const sd = files.find((f: any) => f.quality === 'sd') || files[0];
        const best = hd || sd;
        return {
          videoUrl: best?.link || '',
          videoUrlHD: hd?.link,
          duration: v.duration || 0,
          thumbnailUrl: v.image || '',
          title: v.url?.split('/').pop()?.replace(/-/g, ' ') || query,
          width: best?.width || 1920,
          height: best?.height || 1080,
          source: 'pexels' as const,
        };
      })
      .filter((v: any) => v.videoUrl);
  } catch (err: any) {
    console.warn(`[StockVideo] Pexels search error: ${err.message}`);
    return [];
  }
}

/**
 * Search for stock video, download the best match, upload to R2.
 *
 * Priority: Pixabay → Pexels → null (caller should fall back to AI video or Ken Burns)
 *
 * @param query - Search query (visual description or extracted keywords)
 * @param userId - User ID for asset ownership
 * @param options - Duration, orientation, etc.
 * @returns StockVideoResult or null if nothing found
 */
export async function searchAndDownloadStockVideo(
  query: string,
  userId: string,
  options: {
    minDurationSec?: number;
    maxDurationSec?: number;
    orientation?: 'landscape' | 'portrait' | 'square';
  } = {},
): Promise<StockVideoResult | null> {
  const searchQuery = visualDescriptionToSearchQuery(query);
  if (!searchQuery) {
    console.warn('[StockVideo] Empty search query after keyword extraction');
    return null;
  }

  const { minDurationSec, maxDurationSec = 15, orientation = 'landscape' } = options;
  const assetId = `stock_${nanoid(12)}`;

  console.log(`[StockVideo] Searching: "${searchQuery}" (max ${maxDurationSec}s, ${orientation})`);

  // ─── Priority 1: Pixabay ───
  let videoUrl: string | undefined;
  let thumbnailUrl: string | undefined;
  let duration = 0;
  let source: 'pixabay' | 'pexels' = 'pixabay';
  let title = searchQuery;
  let width = 1920;
  let height = 1080;

  if (isPixabayAvailable()) {
    try {
      const results = await searchStockVideos(searchQuery, {
        maxDuration: maxDurationSec,
        orientation: orientation === 'landscape' ? 'horizontal' : orientation === 'portrait' ? 'vertical' : undefined,
        limit: 5,
      });
      // Filter out clips shorter than minimum (we need enough footage to trim FROM, never stretch)
      const filtered = minDurationSec
        ? results.filter(r => r.duration >= minDurationSec)
        : results;
      if (filtered.length > 0) {
        const best = filtered[0]; // Already sorted by popularity
        videoUrl = best.videoUrlHD || best.videoUrl;
        thumbnailUrl = best.thumbnailUrl;
        duration = best.duration;
        title = best.tags.slice(0, 3).join(', ') || searchQuery;
        source = 'pixabay';
        console.log(`[StockVideo] Pixabay hit: "${title}" (${duration}s)`);
      }
    } catch (err: any) {
      console.warn(`[StockVideo] Pixabay search failed: ${err.message}`);
    }
  }

  // ─── Priority 2: Pexels ───
  if (!videoUrl && PEXELS_API_KEY) {
    try {
      const results = await searchPexelsVideos(searchQuery, {
        maxDuration: maxDurationSec,
        orientation,
        limit: 5,
      });
      const pexFiltered = minDurationSec
        ? results.filter(r => r.duration >= minDurationSec)
        : results;
      if (pexFiltered.length > 0) {
        const best = pexFiltered[0];
        videoUrl = best.videoUrlHD || best.videoUrl;
        thumbnailUrl = best.thumbnailUrl;
        duration = best.duration;
        title = best.title;
        width = best.width;
        height = best.height;
        source = 'pexels';
        console.log(`[StockVideo] Pexels hit: "${title}" (${duration}s)`);
      }
    } catch (err: any) {
      console.warn(`[StockVideo] Pexels search failed: ${err.message}`);
    }
  }

  if (!videoUrl) {
    console.log(`[StockVideo] No results for "${searchQuery}"`);
    return null;
  }

  // ─── Download + Upload to R2 ───
  try {
    const { uploadMedia } = await import('@/lib/editron/services/upload-service');

    const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(30000) });
    if (!videoRes.ok) {
      console.warn(`[StockVideo] Download failed: ${videoRes.status}`);
      return null;
    }

    const buffer = Buffer.from(await videoRes.arrayBuffer());
    if (buffer.length < 1000) {
      console.warn(`[StockVideo] Downloaded file too small (${buffer.length} bytes)`);
      return null;
    }

    const contentType = videoRes.headers.get('content-type') || 'video/mp4';
    // Validate it's actually video (not HTML error page)
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      console.warn(`[StockVideo] Got ${contentType} instead of video`);
      return null;
    }

    const ext = contentType.includes('webm') ? 'webm' : 'mp4';
    const uploadResult = await uploadMedia(buffer, userId, `${assetId}.${ext}`, contentType, { customAssetId: assetId });

    if (!uploadResult?.signedUrl) {
      console.warn('[StockVideo] Upload to R2 failed');
      return null;
    }

    console.log(`[StockVideo] Success: ${source} → R2 (${assetId}, ${duration}s, ${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

    return {
      videoUrl: uploadResult.signedUrl,
      r2Key: uploadResult.r2Key || assetId,
      assetId,
      durationMs: duration * 1000,
      source,
      thumbnailUrl,
      originalTitle: title,
      width,
      height,
      query: searchQuery,
    };
  } catch (err: any) {
    console.error(`[StockVideo] Download/upload failed: ${err.message}`);
    return null;
  }
}
