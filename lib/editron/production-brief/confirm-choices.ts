/**
 * confirm-choices - the option lists + bounds for the editable SPEC CARD. These are
 * concrete METADATA editors (where it's going, how long, what shape), NOT a menu of
 * creative "types". Picking your destination or a duration is legitimate; picking
 * "reel vs full edit" is templatization and does not exist here.
 */

import type { AspectRatio, Platform, ProductionBrief } from './production-brief';

/** Destination options for the platform picker (often pre-filled from connected accounts). */
export const PLATFORM_CHOICES: readonly Platform[] = [
  'tiktok',
  'instagram-reels',
  'youtube-shorts',
  'instagram-feed',
  'youtube',
  'linkedin',
  'x',
];

/** Supported aspect ratios for the shape control. */
export const ASPECT_CHOICES: readonly AspectRatio[] = ['9:16', '16:9', '1:1', '4:5'];

/** Common duration presets (seconds) for the length control. */
export const DURATION_PRESET_SECONDS: readonly number[] = [15, 30, 60, 90];

/** Smallest sensible output length (seconds). INVENTED-PLACEHOLDER (calibrate). */
export const MIN_TARGET_DURATION_SEC = 5;

/**
 * Duration bounds for the length control: at least MIN, at most the total source length -
 * you cannot cut more than you uploaded (the founder's constraint). `max` is null when the
 * source length is unknown (no cap yet).
 */
export function durationBounds(brief: ProductionBrief): { min: number; max: number | null } {
  const src = brief.sourceDurationSec;
  return {
    min: MIN_TARGET_DURATION_SEC,
    max: typeof src === 'number' && src > 0 ? src : null,
  };
}
