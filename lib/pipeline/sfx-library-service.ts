/**
 * SFX Library Service
 *
 * Searches royalty-free sound effects from external libraries.
 * Tier 2 approach: deterministic SFX from curated libraries instead of
 * AI generation (which is slow/unreliable via beatoven/mirelo).
 *
 * Primary: Pixabay SFX API (zero licensing, commercial use, no attribution)
 * Fallback: Freesound API (filter CC0 only)
 *
 * Usage:
 *   const sfx = await searchSFXLibrary("whoosh futuristic");
 *   // Returns { url, filename, duration, source }
 */

import { uploadMedia } from '@/lib/editron/services/upload-service';
import { nanoid } from 'nanoid';

export interface SFXLibraryResult {
  audioUrl: string;
  gcsPath: string;
  audioAssetId: string;
  durationMs: number;
  source: 'pixabay' | 'freesound' | 'local';
  originalTitle?: string;
}

// ─── Pixabay SFX API ─────────────────────────────────────────────
// Docs: https://pixabay.com/api/docs/#api_search_music
// All sounds are Pixabay License — free for commercial use, no attribution.

async function searchPixabay(
  query: string,
  maxDuration?: number,
): Promise<{ url: string; title: string; duration: number } | null> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    console.warn('[SFXLib] PIXABAY_API_KEY not set');
    return null;
  }

  try {
    // Pixabay audio search endpoint
    // Docs: https://pixabay.com/api/docs/ — use media_type=audio for sounds
    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      per_page: '5',
      safesearch: 'true',
    });

    const res = await fetch(`https://pixabay.com/api/?${params}`);
    if (!res.ok) {
      console.warn(`[SFXLib] Pixabay search failed: ${res.status} ${res.statusText}`);
      return null;
    }

    {
      const audioData = await res.json();
      const hits = audioData.hits || [];
      if (hits.length === 0) return null;

      // Pick the best match (shortest that fits the duration)
      const sorted = maxDuration
        ? hits.filter((h: any) => h.duration <= maxDuration + 5).sort((a: any, b: any) => b.downloads - a.downloads)
        : hits.sort((a: any, b: any) => b.downloads - a.downloads);

      const best = sorted[0] || hits[0];
      return {
        url: best.previewURL || best.webformatURL || best.largeImageURL,
        title: best.tags || query,
        duration: best.duration || 5,
      };
    }
  } catch (err: any) {
    console.error(`[SFXLib] Pixabay error: ${err.message}`);
    return null;
  }
}

// ─── Freesound API ───────────────────────────────────────────────
// Docs: https://freesound.org/docs/api/
// Filter for CC0 license only — free for commercial, no attribution.

async function searchFreesound(
  query: string,
  maxDuration?: number,
): Promise<{ url: string; title: string; duration: number } | null> {
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) {
    console.warn('[SFXLib] FREESOUND_API_KEY not set');
    return null;
  }

  try {
    const params = new URLSearchParams({
      query,
      token: apiKey,
      fields: 'id,name,duration,previews,license',
      filter: 'license:"Creative Commons 0"', // CC0 only
      page_size: '5',
      sort: 'rating_desc',
    });

    if (maxDuration) {
      params.set('filter', `license:"Creative Commons 0" duration:[0 TO ${maxDuration + 2}]`);
    }

    const res = await fetch(`https://freesound.org/apiv2/search/text/?${params}`);
    if (!res.ok) {
      console.warn(`[SFXLib] Freesound search failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) return null;

    const best = results[0];
    const previewUrl = best.previews?.['preview-hq-mp3'] || best.previews?.['preview-lq-mp3'];
    if (!previewUrl) return null;

    return {
      url: previewUrl,
      title: best.name || query,
      duration: Math.round(best.duration || 5),
    };
  } catch (err: any) {
    console.error(`[SFXLib] Freesound error: ${err.message}`);
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Search for a sound effect from library sources.
 * Tries Pixabay first (zero licensing), then Freesound (CC0 only).
 *
 * @param query - Search keywords (e.g., "whoosh futuristic", "city ambient", "UI click")
 * @param userId - For GCS upload
 * @param maxDurationSec - Maximum clip duration in seconds
 * @returns SFX result with GCS URL, or null if nothing found
 */
export async function searchAndDownloadSFX(
  query: string,
  userId: string,
  maxDurationSec?: number,
): Promise<SFXLibraryResult | null> {
  console.log(`[SFXLib] Searching: "${query}" (maxDuration=${maxDurationSec || 'any'}s)`);

  // Try Freesound first (actual audio search API).
  // Pixabay's general API returns images, not audio — their music API needs special access.
  let found = await searchFreesound(query, maxDurationSec);
  let source: 'pixabay' | 'freesound' = 'freesound';

  // NOTE: Pixabay fallback REMOVED — their general API (/api/) returns images, not audio.
  // The image URLs (previewURL, webformatURL) were being downloaded as "audio" files,
  // resulting in JPEG data stored with audio/mpeg content type. These never play.
  // Pixabay's actual audio API (/api/music/) requires special access we don't have.

  if (!found || !found.url) {
    console.warn(`[SFXLib] No results for "${query}"`);
    return null;
  }

  console.log(`[SFXLib] Found on ${source}: "${found.title}" (${found.duration}s)`);

  // Download and upload to GCS
  try {
    const response = await fetch(found.url);
    if (!response.ok) {
      console.error(`[SFXLib] Failed to download from ${source}: ${response.status}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Validate the downloaded content is actually audio, not an image or HTML error page
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('audio') && !contentType.includes('octet-stream')) {
      // Check first bytes for common non-audio signatures
      const header = buffer.slice(0, 4).toString('hex');
      const isJPEG = header.startsWith('ffd8ff');
      const isPNG = header === '89504e47';
      const isHTML = buffer.slice(0, 20).toString('utf-8').trim().startsWith('<');
      if (isJPEG || isPNG || isHTML) {
        console.error(`[SFXLib] Downloaded file is NOT audio (${isJPEG ? 'JPEG' : isPNG ? 'PNG' : 'HTML'}). Source returned wrong content. Skipping.`);
        return null;
      }
    }

    const assetId = `sfx_lib_${nanoid(8)}`;
    const ext = found.url.includes('.wav') ? 'wav' : 'mp3';
    const uploadResult = await uploadMedia(buffer, userId, `${assetId}.${ext}`, `audio/${ext === 'wav' ? 'wav' : 'mpeg'}`);

    return {
      audioUrl: uploadResult.signedUrl,
      gcsPath: uploadResult.gcsPath,
      audioAssetId: assetId,
      durationMs: found.duration * 1000,
      source,
      originalTitle: found.title,
    };
  } catch (err: any) {
    console.error(`[SFXLib] Download/upload failed: ${err.message}`);
    return null;
  }
}

/**
 * Convert an audioDescription into search keywords for SFX library lookup.
 * Uses simple keyword extraction — no LLM needed.
 */
export function audioDescriptionToSearchQuery(audioDescription: string): string {
  // Remove common non-SFX words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that',
    'these', 'those', 'it', 'its', 'sound', 'sounds', 'effect', 'effects',
    'subtle', 'gentle', 'soft', 'faint', 'slight', 'quiet',
  ]);

  return audioDescription
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 5) // Max 5 keywords
    .join(' ');
}

/**
 * Check if any SFX library is available.
 */
export function isSFXLibraryAvailable(): boolean {
  return !!(process.env.PIXABAY_API_KEY || process.env.FREESOUND_API_KEY);
}
