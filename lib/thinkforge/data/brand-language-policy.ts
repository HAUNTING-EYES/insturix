import { isAcceptedSignalUsable } from '@/lib/shared/brand-context-block';
import type { BrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import { getAntiAiConstraintBundle } from './writing-graph-query';

export interface ThinkForgeBrandLanguagePolicy {
  approvedRecurringPhrases: string[];
}

export interface ThinkForgeAiFillerHit {
  label: string;
  matchedText: string;
  index: number;
}

const AI_FILLER_PATTERNS = getAntiAiConstraintBundle().fillerPatterns.map((definition) => ({
  label: definition.label,
  regex: new RegExp(definition.pattern, 'gi'),
}));

function cleanUniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of values) {
    const phrase = value.trim();
    const key = phrase.toLocaleLowerCase();
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(phrase);
  }
  return cleaned;
}

function actionableSignalStrings(
  signal: BrandSignalProfile['voice']['recurringPhrases'] | undefined,
): string[] {
  return signal && isAcceptedSignalUsable(signal)
    ? cleanUniqueStrings(signal.value)
    : [];
}

function containsLiteralPhrase(value: string, phrase: string): boolean {
  return value.toLocaleLowerCase().includes(phrase.toLocaleLowerCase());
}

export function resolveThinkForgeBrandLanguagePolicy(
  profile?: BrandSignalProfile | null,
): ThinkForgeBrandLanguagePolicy {
  if (!profile) return { approvedRecurringPhrases: [] };
  const recurringPhrases = actionableSignalStrings(profile.voice.recurringPhrases);
  const killList = actionableSignalStrings(profile.voice.killList);
  return {
    approvedRecurringPhrases: recurringPhrases.filter((phrase) => (
      !killList.some((forbidden) => containsLiteralPhrase(phrase, forbidden))
    )),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function protectedPhraseSpans(content: string, phrases: readonly string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const phrase of phrases) {
    const pattern = new RegExp(escapeRegExp(phrase), 'gi');
    for (const match of content.matchAll(pattern)) {
      const start = match.index;
      if (start === undefined) continue;
      spans.push([start, start + match[0].length]);
    }
  }
  return spans;
}

function isProtectedMatch(
  start: number,
  end: number,
  spans: ReadonlyArray<readonly [number, number]>,
): boolean {
  return spans.some(([spanStart, spanEnd]) => start >= spanStart && end <= spanEnd);
}

export function findDisallowedThinkForgeAiFiller(
  content: string,
  policy: ThinkForgeBrandLanguagePolicy,
): ThinkForgeAiFillerHit[] {
  const protectedSpans = protectedPhraseSpans(content, policy.approvedRecurringPhrases);
  const hits: ThinkForgeAiFillerHit[] = [];
  for (const definition of AI_FILLER_PATTERNS) {
    definition.regex.lastIndex = 0;
    for (const match of content.matchAll(definition.regex)) {
      const start = match.index;
      if (start === undefined) continue;
      const end = start + match[0].length;
      if (isProtectedMatch(start, end, protectedSpans)) continue;
      hits.push({ label: definition.label, matchedText: match[0], index: start });
      break;
    }
  }
  return hits;
}
