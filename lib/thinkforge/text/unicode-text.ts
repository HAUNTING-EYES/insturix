const SEGMENTERS = new Map<string, Intl.Segmenter>();

const QUESTION_TERMINATOR_PATTERN = /[?\u061f\uff1f]\s*$/u;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;
const CURRENCY_AMOUNT_PATTERN = /(?:\p{Sc}\s*\p{N}|\b(?:aed|aud|cad|chf|cny|eur|gbp|inr|jpy|rs|usd)\.?\s*\p{N})/iu;
const PERCENT_PATTERN = /\p{N}[\p{N},.\s]*?(?:%|\uff05|percent(?:age)?|per\s+cent)\b/iu;
const DATE_OR_TIME_PATTERN = /(?:\p{N}{1,4}[\/.\p{Pd}]\p{N}{1,2}(?:[\/.\p{Pd}]\p{N}{1,4})?|\p{N}{1,2}:\p{N}{2})/u;
const LEADING_LIST_MARKER_PATTERN = /^\s*(?:[-*\u2022]|\p{N}{1,3}[.)])\s+/u;
const COMPACT_SCRIPT_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

const ENGLISH_MONTH_TOKENS = new Set([
  'jan', 'january',
  'feb', 'february',
  'mar', 'march',
  'apr', 'april',
  'may',
  'jun', 'june',
  'jul', 'july',
  'aug', 'august',
  'sep', 'sept', 'september',
  'oct', 'october',
  'nov', 'november',
  'dec', 'december',
]);

function assertSegmenterAvailable(): void {
  if (typeof Intl.Segmenter !== 'function') {
    throw new Error('ThinkForge requires Intl.Segmenter for Unicode-safe text validation');
  }
}

export function canonicalizeLanguageTag(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error('ThinkForge language tag cannot be empty');
  if (raw.includes('_') && raw.split('_').some((part) => part.length < 2)) {
    throw new Error(`ThinkForge received invalid BCP-47 language tag: ${value}`);
  }
  const candidate = raw.replaceAll('_', '-');

  try {
    return Intl.getCanonicalLocales(candidate)[0]
      ?? (() => { throw new Error('missing canonical locale'); })();
  } catch {
    throw new Error(`ThinkForge received invalid BCP-47 language tag: ${value}`);
  }
}

function segmenter(granularity: Intl.SegmenterOptions['granularity'], locale?: string): Intl.Segmenter {
  assertSegmenterAvailable();
  const resolvedLocale = locale ? canonicalizeLanguageTag(locale) : 'und';
  const key = `${resolvedLocale}:${granularity}`;
  const cached = SEGMENTERS.get(key);
  if (cached) return cached;

  const created = new Intl.Segmenter(resolvedLocale, { granularity });
  SEGMENTERS.set(key, created);
  return created;
}

export function normalizeUnicodeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function segmentUnicodeSentences(value: string, locale?: string): string[] {
  const sentenceSegmenter = segmenter('sentence', locale);
  return value
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .flatMap((line) => [...sentenceSegmenter.segment(line)].map(({ segment }) => segment.trim()))
    .filter(Boolean);
}

export function unicodeLexicalTokens(value: string, locale?: string): string[] {
  const wordSegmenter = segmenter('word', locale);
  return [...wordSegmenter.segment(normalizeUnicodeText(value))]
    .filter((part) => part.isWordLike)
    .map(({ segment }) => segment.replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter(Boolean);
}

export function countUnicodeWords(value: string, locale?: string): number {
  return unicodeLexicalTokens(value, locale).length;
}

export function isUnicodeQuestion(value: string): boolean {
  return QUESTION_TERMINATOR_PATTERN.test(value);
}

export function isSubstantiveUnicodeToken(token: string): boolean {
  return /^\p{N}/u.test(token)
    || token.length >= 4
    || COMPACT_SCRIPT_PATTERN.test(token);
}

export function hasUnicodeFactualMarker(value: string): boolean {
  const withoutListMarker = value.replace(LEADING_LIST_MARKER_PATTERN, '');
  if (
    URL_PATTERN.test(withoutListMarker)
    || CURRENCY_AMOUNT_PATTERN.test(withoutListMarker)
    || PERCENT_PATTERN.test(withoutListMarker)
    || DATE_OR_TIME_PATTERN.test(withoutListMarker)
    || /\p{N}/u.test(withoutListMarker)
  ) {
    return true;
  }

  return unicodeLexicalTokens(withoutListMarker)
    .some((token) => ENGLISH_MONTH_TOKENS.has(token));
}
