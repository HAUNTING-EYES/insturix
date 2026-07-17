/**
 * Source Ledger — dedupe identity (Master v1.1 §5.6.5).
 *
 * TWO checks only:
 *   (a) normalized platform URL / stable platform ID at ingest — covers the whole
 *       curated trend pipeline and paste-a-link;
 *   (b) a chromaprint (fpcalc) fingerprint — user-uploaded FILES only.
 * No pHash, no perceptual video matching. A trimmed re-upload costing ONE redundant
 * analysis is explicitly accepted.
 *
 * SAFETY BIAS: a wrong MERGE (two different videos treated as one) corrupts the Ledger;
 * a wrong SPLIT (the same video analyzed twice) only wastes one analysis, which the doc
 * accepts. So every ambiguous case here biases toward SPLIT:
 *   - we extract the STABLE platform id, so instagram.com/reel/X and instagram.com/p/X
 *     (same shortcode, both served by IG) correctly resolve to the same artifact;
 *   - we NEVER lowercase an id (YouTube/IG ids are case-sensitive: `aBc` != `abc`) —
 *     only the host is lowercased;
 *   - sameSource() compares each dimension independently and never merges across kinds.
 *
 * Pure + deterministic: no I/O, no Date/random. The chromaprint STRING is carried and
 * compared here; computing it (fpcalc binary) is a later phase.
 */

import type { LedgerDedupeIdentity, LedgerPlatform } from './types';

/** YouTube video ids are 11 url-safe chars — mirrors the existing extractYouTubeVideoId regex. */
const YOUTUBE_ID = '([A-Za-z0-9_-]{11})';
const YOUTUBE_ID_PATTERNS: RegExp[] = [
  new RegExp(`youtube\\.com/watch\\?v=${YOUTUBE_ID}`),
  new RegExp(`youtu\\.be/${YOUTUBE_ID}`),
  new RegExp(`youtube\\.com/embed/${YOUTUBE_ID}`),
  new RegExp(`youtube\\.com/v/${YOUTUBE_ID}`),
  new RegExp(`youtube\\.com/shorts/${YOUTUBE_ID}`),
];

/** Instagram reel/post/tv shortcode — the segment after reel(s)/p/tv, regardless of a leading username. */
const INSTAGRAM_SHORTCODE = /instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/;

/** TikTok numeric video id. */
const TIKTOK_ID = /tiktok\.com\/(?:@[^/]+\/)?video\/(\d+)/;

/** Parse a URL, tolerating a missing scheme (mirrors the existing extractors' `(?:https?:\/\/)?`). */
function safeParseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

/** Which platform a URL belongs to. Unrecognized/unparseable → 'web'. */
export function detectPlatform(url: string): LedgerPlatform {
  const parsed = safeParseUrl(url);
  if (!parsed) return 'web';
  const host = parsed.hostname.toLowerCase();
  if (host.includes('youtube.') || host === 'youtu.be' || host.endsWith('.youtu.be')) return 'youtube';
  if (host.includes('instagram.')) return 'instagram';
  if (host.includes('tiktok.')) return 'tiktok';
  return 'web';
}

/**
 * Extract the STABLE platform id from a URL (case PRESERVED). Returns null when no stable
 * id can be found (e.g. a generic web link) — the caller falls back to normalizedUrl.
 */
export function extractPlatformId(url: string, platform?: LedgerPlatform): string | null {
  const p = platform ?? detectPlatform(url);
  if (p === 'youtube') {
    for (const pattern of YOUTUBE_ID_PATTERNS) {
      const m = url.match(pattern);
      if (m?.[1]) return m[1];
    }
    return null;
  }
  if (p === 'instagram') return url.match(INSTAGRAM_SHORTCODE)?.[1] ?? null;
  if (p === 'tiktok') return url.match(TIKTOK_ID)?.[1] ?? null;
  return null;
}

/**
 * Canonical URL form for dedupe: lowercase host, drop `www.`, drop query + fragment,
 * drop a trailing slash. Path case is PRESERVED (ids can live there). Unparseable input
 * is returned trimmed so it can still be compared literally.
 */
export function normalizePlatformUrl(url: string): string {
  const parsed = safeParseUrl(url);
  if (!parsed) return url.trim();
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/+$/, '');
  return `https://${host}${path}`;
}

/** Build the dedupe identity for a source. `chromaprint` is supplied only for user file uploads. */
export function buildDedupeIdentity(input: {
  url?: string;
  platform?: LedgerPlatform;
  platformId?: string;
  chromaprint?: string;
}): LedgerDedupeIdentity {
  const platform = input.platform ?? (input.url ? detectPlatform(input.url) : undefined);
  const platformId =
    input.platformId ?? (input.url ? extractPlatformId(input.url, platform) ?? undefined : undefined);
  const normalizedUrl = input.url ? normalizePlatformUrl(input.url) : undefined;

  const identity: LedgerDedupeIdentity = {};
  if (normalizedUrl) identity.normalizedUrl = normalizedUrl;
  if (platform) identity.platform = platform;
  if (platformId) identity.platformId = platformId;
  if (input.chromaprint) identity.chromaprint = input.chromaprint;
  return identity;
}

/**
 * All candidate dedupe keys for an identity, strongest first. The store queries the Ledger
 * with these (an existing entry sharing ANY key is the same artifact). Empty when the
 * identity carries nothing to dedupe on.
 */
export function dedupeKeys(identity: LedgerDedupeIdentity): string[] {
  const keys: string[] = [];
  if (identity.platform && identity.platformId) keys.push(`id:${identity.platform}:${identity.platformId}`);
  if (identity.normalizedUrl) keys.push(`url:${identity.normalizedUrl}`);
  if (identity.chromaprint) keys.push(`fp:${identity.chromaprint}`);
  return keys;
}

/** The single strongest dedupe key (platform id > url > chromaprint), or null if none. */
export function dedupeKey(identity: LedgerDedupeIdentity): string | null {
  return dedupeKeys(identity)[0] ?? null;
}

/**
 * Do two identities refer to the same artifact? Conservative: each dimension is compared
 * independently and NEVER across kinds, so the only way to return true is a genuine match
 * on the same dimension. Biases to SPLIT over MERGE by design.
 */
export function sameSource(a: LedgerDedupeIdentity, b: LedgerDedupeIdentity): boolean {
  if (a.platform && a.platformId && a.platform === b.platform && a.platformId === b.platformId) {
    return true;
  }
  if (a.chromaprint && a.chromaprint === b.chromaprint) return true;
  if (a.normalizedUrl && a.normalizedUrl === b.normalizedUrl) return true;
  return false;
}
