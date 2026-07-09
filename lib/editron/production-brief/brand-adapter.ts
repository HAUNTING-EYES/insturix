/**
 * brand-adapter - fill `BrandDefaults` from a Brand Vault profile (the deferred seam the
 * resolver's docblock names). Mirrors the scene-adapter / intake-adapter pattern: a LOCAL
 * structural mirror of the profile (`BrandProfileLike`) so this file imports nothing from the
 * Brand Vault WIP tree; the wiring maps the real profile onto this shape.
 *
 * Honest mapping - a brand profile is NOT a spec sheet. The real brand signals are:
 *   - which platform the brand actually posts to  -> preferredPlatform (beats content-inference)
 *   - the brand's tone / energy                   -> vibe (drives LOOK downstream, not the spec)
 * Aspect ratio and duration are NOT brand attributes - they fall out of the platform in the
 * resolver (PLATFORM_SHAPE), so the adapter leaves them unset rather than fabricating a
 * "brand default" for something the brand never specified. Pure; never throws.
 */

import type { BrandDefaults } from './intake-resolver';
import type { Platform } from './production-brief';

/** The subset of a Brand Vault profile the adapter reads. The caller maps the real profile here. */
export interface BrandProfileLike {
  /** The brand's primary / most-used posting platform, if known (free text). */
  primaryPlatform?: string | null;
  /** Connected posting destinations (free text); used when no explicit primary. */
  connectedPlatforms?: (string | null)[] | null;
  /** Brand tone / voice descriptors ('playful', 'premium', 'bold', ...) -> vibe.tone. */
  toneKeywords?: (string | null)[] | null;
  /** Energy / pace descriptor if the brand specifies one ('punchy', 'calm', ...) -> vibe.energy. */
  energy?: string | null;
}

/** Map common free-text platform names to a Platform. Unknown -> undefined (never guessed). */
export function normalizePlatform(raw: string | null | undefined): Platform | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().toLowerCase().replace(/[_\s]+/g, '-');
  const table: Record<string, Platform> = {
    tiktok: 'tiktok', 'tik-tok': 'tiktok',
    'instagram-reels': 'instagram-reels', reels: 'instagram-reels', 'ig-reels': 'instagram-reels',
    'youtube-shorts': 'youtube-shorts', shorts: 'youtube-shorts', 'yt-shorts': 'youtube-shorts',
    'instagram-feed': 'instagram-feed', instagram: 'instagram-feed', ig: 'instagram-feed', insta: 'instagram-feed',
    youtube: 'youtube', yt: 'youtube',
    linkedin: 'linkedin',
    x: 'x', twitter: 'x',
  };
  return table[s];
}

function firstNormalizedPlatform(list: (string | null)[] | null | undefined): Platform | undefined {
  if (!list) return undefined;
  for (const item of list) {
    const p = normalizePlatform(item);
    if (p) return p;
  }
  return undefined;
}

function buildVibe(profile: BrandProfileLike): Record<string, string> | undefined {
  const vibe: Record<string, string> = {};
  const tones = (profile.toneKeywords ?? [])
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter((t) => t.length > 0);
  if (tones.length > 0) vibe.tone = tones.join(', ');
  if (typeof profile.energy === 'string' && profile.energy.trim().length > 0) vibe.energy = profile.energy.trim();
  return Object.keys(vibe).length > 0 ? vibe : undefined;
}

/**
 * Build BrandDefaults from a Brand Vault profile. Sets only what the brand genuinely
 * expresses: preferredPlatform (explicit primary, else first connected) and vibe (tone +
 * energy). Aspect/duration are platform-derived downstream, so they stay unset. Pure.
 */
export function brandDefaultsFromProfile(profile: BrandProfileLike): BrandDefaults {
  const out: BrandDefaults = {};
  const platform = normalizePlatform(profile.primaryPlatform) ?? firstNormalizedPlatform(profile.connectedPlatforms);
  if (platform) out.preferredPlatform = platform;
  const vibe = buildVibe(profile);
  if (vibe) out.vibe = vibe;
  return out;
}
