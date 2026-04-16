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
    const uploadResult = await uploadMedia(buffer, userId, `${assetId}.${ext}`, `audio/${ext === 'wav' ? 'wav' : 'mpeg'}`, { customAssetId: assetId });

    return {
      audioUrl: uploadResult.signedUrl,
      gcsPath: uploadResult.gcsPath!,
      audioAssetId: uploadResult.assetId,
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
 * KB atomic tokens for SFX library search.
 *
 * BACKGROUND (why this changed 2026-04-16):
 * The previous implementation joined up to 5 filtered keywords into a compound
 * query like "climactic whoosh strong impact hit crowd cheering". Pixabay/Freesound
 * index sounds by single-word tags — compound phrases return zero matches.
 * Nike test (proj_o0IBr1ParZJQ, 2026-04-14): 3 searches, 0 hits, silent output.
 *
 * NEW STRATEGY (rule-driven per Rule 18N — reduce LLM dependency):
 * Extract ONE atomic token from the description using DIRECTOR_KB Part 9 vocabulary
 * first, fallback to ambient tokens for environment beds, last resort to generic 'ambient'.
 *
 * WHY THIS WORKS: SFX libraries are indexed by single-word descriptors. A sound
 * designer searching for a transition whoosh types "whoosh", not
 * "climactic whoosh, strong impact hit, subtle crowd cheering". We do the same.
 */

// Primary SFX primitives from DIRECTOR_KNOWLEDGE_BASE.md Part 9 (rules A-001 to A-021).
// Stem-match via \bTOKEN catches TOKEN, TOKENs, TOKENing, TOKENful, etc.
// Order = priority: earlier tokens win if multiple match in the same description.
const KB_PRIMARY_TOKENS: string[] = [
  // A-001: transition SFX (dissolve/wipe/slide/swish-pan/film-burn)
  'whoosh',        // primary
  'swoosh',        // common synonym
  'swish',         // scripts often use "swish" for fabric/movement
  // A-002: zoom-punch / flash transitions (impact-hit)
  'impact',        // stem covers impactful, impacting
  'thud',          // related percussive
  'boom',          // low-frequency impact
  // A-010: pre-reveal tension
  'riser',
  // A-011: pre-beat-drop anticipation
  'cymbal',        // matches "reverse-cymbal" via stem
  // A-020: graphic entrance (non-cinematic)
  'pop',
  'notification',
  // A-021: stat-counter landing
  'click',
  'ding',
  'chime',
  'bell',
  // Orchestral/musical stingers
  'stinger',
  'flourish',
  // Generic percussive fallback
  'hit',
];

// Ambient / environment tokens for scene-level sound beds.
// Checked after primary tokens fail to match.
const KB_AMBIENT_TOKENS: string[] = [
  'crowd',
  'cheer',
  'applause',
  'footstep',
  'footfall',
  'breath',        // stem covers breathing
  'gasp',
  'laugh',
  'rustle',
  'traffic',
  'nature',
  'forest',
  'ocean',
  'waves',
  'rain',
  'wind',
  'river',
  'birds',
  'fire',
  'crackle',
  'typing',
  'chatter',
  'ambient',       // generic bed fallback
];

// Stopwords for the noun-extraction fallback path.
const SFX_STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','as',
  'is','was','are','were','been','be','have','has','had','do','does','did',
  'will','would','could','should','may','might','shall','can',
  'this','that','these','those','it','its','they','them','their',
  'sound','sounds','effect','effects',
  // Qualifiers (not nouns — never useful as search terms)
  'subtle','gentle','soft','faint','slight','quiet','strong','sudden','sharp','clean',
  'climactic','rhythmic','atmospheric','dynamic','cinematic','triumphant','epic',
  'deep','loud','light','heavy','slow','fast','quick','brief',
]);

/**
 * Convert a free-form audio description into a single atomic search token
 * for SFX library lookup.
 *
 * Strategy (rule-based, deterministic — Rule 18N):
 * 1. Match highest-priority KB primary token (DIRECTOR_KB Part 9 primitives).
 * 2. If no primary match, try KB ambient tokens for environment beds.
 * 3. Fallback: extract first meaningful noun after stopword filtering.
 * 4. Last resort: 'ambient' (function never returns empty string).
 *
 * @example
 *   "climactic whoosh, strong impact hit, subtle crowd cheering, triumphant flourish"
 *     → "whoosh"  (A-001 primary)
 *   "sudden impactful hit, sharp punchy sound design, sprinter's footfalls"
 *     → "impact"  (A-002 primary — 'impactful' stem-matches 'impact')
 *   "swish of fabric, impact of feet, rhythmic breathing, athletic environment"
 *     → "swish"   (A-001 synonym wins over 'impact' by priority)
 *   "office chatter with typing sounds"
 *     → "chatter" (ambient token — no primary match)
 *   "soft music swell"
 *     → "ambient" (no KB match, no nouns > 3 chars)
 */
export function audioDescriptionToSearchQuery(audioDescription: string): string {
  const desc = (audioDescription || '').toLowerCase().trim();
  if (!desc) return 'ambient';

  // 1. Primary KB tokens (transition/feature SFX primitives — DIRECTOR_KB Part 9)
  for (const token of KB_PRIMARY_TOKENS) {
    const regex = new RegExp(`\\b${token}`, 'i');
    if (regex.test(desc)) return token;
  }

  // 2. Ambient / environment tokens (scene beds)
  for (const token of KB_AMBIENT_TOKENS) {
    const regex = new RegExp(`\\b${token}`, 'i');
    if (regex.test(desc)) return token;
  }

  // 3. Fallback: first meaningful noun from stopword-filtered description
  const words = desc
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !SFX_STOP_WORDS.has(w));

  // 4. Last resort guarantee: never return empty — 'ambient' always has library matches
  return words[0] || 'ambient';
}

/**
 * Check if any SFX library is available.
 */
export function isSFXLibraryAvailable(): boolean {
  return !!(process.env.PIXABAY_API_KEY || process.env.FREESOUND_API_KEY);
}
