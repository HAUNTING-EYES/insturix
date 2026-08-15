import type { IntakeSignals } from '@/lib/editron/production-brief/intake-resolver';
import type { AspectRatio, Platform } from '@/lib/editron/production-brief/production-brief';

export type DeterministicOutputKnobs = Pick<
  NonNullable<IntakeSignals['requested']>,
  'platform' | 'targetDurationSec' | 'aspectRatio'
>;

export interface ExplicitDurationStatement {
  targetDurationSec: number;
  durationLabel: string;
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fortyfive: 45,
  sixty: 60,
  ninety: 90,
};

const NUMERIC_DURATION_PATTERN = /(\d+(?:\.\d+)?)\s*(?:-|\u2013|\u2014)?\s*(hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)\b/i;
const WORD_DURATION_PATTERN = new RegExp(
  `\\b(${Object.keys(NUMBER_WORDS).join('|').replace('fortyfive', 'forty[- ]?five')})\\s*(?:-|\\u2013|\\u2014)?\\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\\b`,
  'i',
);
const NON_EXACT_DURATION_PREFIX_PATTERN = new RegExp(
  String.raw`(?:\b(?:under|over|about|around|approximately|roughly|circa)\s*|\b(?:less|more|no\s+less|no\s+more)\s+than\s*|\bup\s+to\s*|\bat\s+(?:most|least)\s*|\b(?:minimum|maximum)(?:\s+of)?\s*|\b(?:half|quarter(?:\s+of)?)\s*|\bbetween\s+\d+(?:\.\d+)?\s+and\s*|\bfrom\s+\d+(?:\.\d+)?\s+(?:to|-|\u2013|\u2014)\s*|\b\d+(?:\.\d+)?\s*(?:to|-|\u2013|\u2014)\s*)$`,
  'i',
);

function durationUnitMultiplier(unit: string): number {
  if (/^h/.test(unit)) return 3600;
  if (/^m/.test(unit)) return 60;
  return 1;
}

function formatDurationLabel(targetDurationSec: number): string {
  if (targetDurationSec % 3600 === 0) return `${targetDurationSec / 3600}-hour`;
  if (targetDurationSec % 60 === 0) return `${targetDurationSec / 60}-minute`;
  return `${targetDurationSec}-second`;
}

function durationStatement(targetDurationSec: number): ExplicitDurationStatement | null {
  if (!Number.isFinite(targetDurationSec) || targetDurationSec <= 0) return null;
  return {
    targetDurationSec,
    durationLabel: formatDurationLabel(targetDurationSec),
  };
}

function hasExactDurationPrefix(value: string, index: number): boolean {
  const prefix = value.slice(Math.max(0, index - 80), index);
  return !NON_EXACT_DURATION_PREFIX_PATTERN.test(prefix);
}

function addDurationCandidate(candidates: Set<number>, targetDurationSec: number): void {
  if (Number.isFinite(targetDurationSec) && targetDurationSec > 0) {
    candidates.add(targetDurationSec);
  }
}

/** Resolve only exact duration statements. Bounds such as "under a minute" are not exact targets. */
export function resolveExplicitDurationStatement(value: string): ExplicitDurationStatement | null {
  const normalized = value.toLowerCase();
  const candidates = new Set<number>();

  for (const match of normalized.matchAll(new RegExp(NUMERIC_DURATION_PATTERN.source, 'gi'))) {
    if (hasExactDurationPrefix(normalized, match.index)) {
      addDurationCandidate(candidates, Number(match[1]) * durationUnitMultiplier(match[2]));
    }
  }

  for (const match of normalized.matchAll(new RegExp(WORD_DURATION_PATTERN.source, 'gi'))) {
    if (!hasExactDurationPrefix(normalized, match.index)) continue;
    const numberKey = match[1].replace(/[- ]/g, '');
    const amount = NUMBER_WORDS[numberKey];
    if (amount) addDurationCandidate(candidates, amount * durationUnitMultiplier(match[2]));
  }

  const phraseDurations: ReadonlyArray<readonly [RegExp, number]> = [
    [/\bhalf[- ](?:a|an)[- ]hour\b|\bhalf[- ]hour\b/gi, 30 * 60],
    [/\bquarter[- ](?:of[- ])?(?:a|an)[- ]hour\b|\bquarter[- ]hour\b/gi, 15 * 60],
    [/\bhalf[- ](?:a|an)[- ]minute\b|\bhalf[- ]minute\b/gi, 30],
    [/\b(?:a|an)[- ]hour\b/gi, 60 * 60],
    [/\b(?:a|one)[- ]minute\b/gi, 60],
  ];
  for (const [pattern, targetDurationSec] of phraseDurations) {
    for (const match of normalized.matchAll(pattern)) {
      if (hasExactDurationPrefix(normalized, match.index)) {
        addDurationCandidate(candidates, targetDurationSec);
      }
    }
  }

  return candidates.size === 1 ? durationStatement([...candidates][0]) : null;
}

function resolveExplicitPlatform(value: string): Platform | undefined {
  const platforms = new Set<Platform>();
  const normalized = value.toLowerCase();

  if (/\byoutube[- ]?shorts?\b|\b(?:for|on|to)\s+youtube\s+shorts?\b/.test(normalized)) {
    platforms.add('youtube-shorts');
  } else if (/\byoutube\s+(?:video|livestream)\b|\b(?:for|on|to)\s+youtube\b/.test(normalized)) {
    platforms.add('youtube');
  }

  if (/\binstagram[- ]?reels?\b|\big[- ]?reels?\b/.test(normalized)) {
    platforms.add('instagram-reels');
  } else if (
    /\binstagram\s+(?:post|carousel|story|video)\b|\b(?:for|on|to)\s+instagram\b/.test(normalized)
  ) {
    platforms.add('instagram-feed');
  }

  if (
    /\btiktok\s+(?:video|post|carousel)\b|\b(?:for|on|to)\s+tiktok\b|\b(?:vertical|square|portrait)\s+tiktok\b/.test(
      normalized,
    )
  ) {
    platforms.add('tiktok');
  }
  if (/\blinkedin\s+(?:post|carousel|article|video)\b|\b(?:for|on|to)\s+linkedin\b/.test(normalized)) {
    platforms.add('linkedin');
  }
  if (
    /\b(?:twitter|x)\s+(?:post|thread|video)\b|\b(?:for|on|to)\s+(?:twitter|x)\b/.test(normalized)
  ) {
    platforms.add('x');
  }

  return platforms.size === 1 ? [...platforms][0] : undefined;
}

function resolveExplicitAspectRatio(value: string): AspectRatio | undefined {
  const ratios = new Set<AspectRatio>();
  const normalized = value.toLowerCase();

  for (const ratio of ['16:9', '9:16', '1:1', '4:5'] as const) {
    if (normalized.includes(ratio)) ratios.add(ratio);
  }
  if (
    /\bvertical\s+(?:format|video|post|reel|short|tiktok|canvas|frame|output)\b|\b(?:make|format|render|export|crop)(?:\s+it|\s+this|\s+the\s+output)?\s+vertical\b/.test(
      normalized,
    )
  ) {
    ratios.add('9:16');
  }
  if (
    /\bsquare\s+(?:format|video|post|canvas|frame|output)\b|\b(?:make|format|render|export|crop)(?:\s+it|\s+this|\s+the\s+output)?\s+square\b/.test(
      normalized,
    )
  ) {
    ratios.add('1:1');
  }
  if (
    /\bportrait\s+(?:format|aspect|ratio|video|post|canvas|frame|output)\b|\b(?:make|format|render|export|crop)(?:\s+it|\s+this|\s+the\s+output)?\s+portrait\b/.test(
      normalized,
    )
  ) {
    ratios.add('4:5');
  }
  if (
    /\b(?:widescreen|landscape)\s+(?:format|aspect|ratio|video|post|canvas|frame|output|youtube|tiktok|instagram|linkedin)\b|\b(?:make|format|render|export|crop)(?:\s+it|\s+this|\s+the\s+output)?\s+(?:widescreen|landscape)\b/.test(
      normalized,
    )
  ) {
    ratios.add('16:9');
  }

  return ratios.size === 1 ? [...ratios][0] : undefined;
}

/**
 * Extract controls that are mechanically provable from the request. Semantic
 * intent, languages, deliverables, and ambiguous values remain LLM/resolver work.
 */
export function resolveDeterministicOutputKnobs(value: string): Partial<DeterministicOutputKnobs> {
  const duration = resolveExplicitDurationStatement(value);
  const platform = resolveExplicitPlatform(value);
  const aspectRatio = resolveExplicitAspectRatio(value);
  return {
    ...(platform ? { platform } : {}),
    ...(duration ? { targetDurationSec: duration.targetDurationSec } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
  };
}
