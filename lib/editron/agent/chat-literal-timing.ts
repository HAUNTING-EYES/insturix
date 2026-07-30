type TimingKind = 'range' | 'start-duration' | 'start' | 'end' | 'duration' | 'anchor';

interface RawTiming {
  kind?: unknown;
  sourceSpan?: unknown;
  startSeconds?: unknown;
  endSeconds?: unknown;
  durationSeconds?: unknown;
  anchor?: unknown;
}

interface ParsedTiming {
  startSeconds?: number;
  endSeconds?: number;
  durationSeconds?: number;
  anchor?: 'intro' | 'outro' | 'entire';
}

interface TimeMention {
  start: number;
  end: number;
  seconds: number;
}

const TIMING_KINDS = new Set<TimingKind>([
  'range',
  'start-duration',
  'start',
  'end',
  'duration',
  'anchor',
]);

const UNIT_PATTERN =
  '(?:milliseconds?|msecs?|ms|seconds?|secs?|sec|s|minutes?|mins?|min|m|hours?|hrs?|hr|h)';
const NUMBER_WORD_PATTERN =
  '(?:a|an|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|and|point|half|quarter)';

/**
 * Structured-output models are good at identifying the timing relation but can
 * omit one of its conditional numeric fields. Literal timing remains owned by
 * deterministic code: only values recoverable from the exact user-authored
 * source span are inserted.
 */
export function repairChatOwnerLiteralTiming(
  value: unknown,
  userMessage: string,
): unknown {
  const root = asRecord(value);
  const facts = asRecord(root?.facts);
  if (!root || !facts || !Array.isArray(facts.localizedEdits)) return value;

  let changed = false;
  const localizedEdits = facts.localizedEdits.map((entry) => {
    const edit = asRecord(entry);
    if (edit && edit.modality !== 'asset') {
      const hasAssetOnlyConstraint = 'placement' in edit || 'timing' in edit;
      if (!hasAssetOnlyConstraint) return entry;
      const {
        placement: _placement,
        timing: _timing,
        ...nonAssetEdit
      } = edit;
      changed = true;
      return nonAssetEdit;
    }
    const timing = asRecord(edit?.timing) as RawTiming | null;
    if (!edit || !timing) return entry;

    const kind = typeof timing.kind === 'string' && TIMING_KINDS.has(timing.kind as TimingKind)
      ? timing.kind as TimingKind
      : null;
    const sourceSpan = typeof timing.sourceSpan === 'string' ? timing.sourceSpan.trim() : '';
    if (!kind || !sourceSpan || !spanOccursInMessage(sourceSpan, userMessage)) return entry;

    const parsed = parseLiteralTiming(kind, sourceSpan);
    if (!parsed) return entry;

    changed = true;
    return {
      ...edit,
      timing: {
        ...timing,
        ...parsed,
      },
    };
  });

  if (!changed) return value;
  return {
    ...root,
    facts: {
      ...facts,
      localizedEdits,
    },
  };
}

function parseLiteralTiming(kind: TimingKind, sourceSpan: string): ParsedTiming | null {
  if (kind === 'anchor') return parseAnchorTiming(sourceSpan);
  if (kind === 'range') return parseRangeTiming(sourceSpan);

  const mentions = extractTimeMentions(sourceSpan);
  if (kind === 'start-duration') {
    if (mentions.length < 2) return null;
    return {
      startSeconds: mentions[0].seconds,
      durationSeconds: mentions[1].seconds,
    };
  }
  if (mentions.length === 0) return null;

  if (kind === 'start') return { startSeconds: mentions[0].seconds };
  if (kind === 'end') return { endSeconds: mentions[0].seconds };
  return { durationSeconds: mentions[0].seconds };
}

function parseRangeTiming(sourceSpan: string): ParsedTiming | null {
  const normalized = normalizeTimingText(sourceSpan);
  const pair = normalized.match(
    /\b(?:from|between)\s+(.+?)\s+(?:to|until|through|and|-|\u2013|\u2014)\s+(.+?)(?:$|[,;.])/i,
  );
  if (pair && !pair[1].includes('%') && !pair[2].includes('%')) {
    const end = parseTimeQuantity(pair[2], false);
    const start = parseTimeQuantity(pair[1], true, end?.unit);
    if (start && end && end.seconds > start.seconds) {
      return { startSeconds: start.seconds, endSeconds: end.seconds };
    }
  }

  const mentions = extractTimeMentions(normalized);
  if (mentions.length < 2 || mentions[1].seconds <= mentions[0].seconds) return null;
  return {
    startSeconds: mentions[0].seconds,
    endSeconds: mentions[1].seconds,
  };
}

function parseAnchorTiming(sourceSpan: string): ParsedTiming | null {
  const normalized = normalizeTimingText(sourceSpan).toLowerCase();
  const anchor = /\b(?:intro|beginning|opening)\b/.test(normalized)
    ? 'intro'
    : /\b(?:outro|ending|closing)\b/.test(normalized)
      ? 'outro'
      : /\b(?:entire|whole|throughout)\b/.test(normalized)
        ? 'entire'
        : null;
  if (!anchor) return null;

  const duration = extractTimeMentions(normalized)[0]?.seconds;
  return {
    anchor,
    ...(duration == null || anchor === 'entire' ? {} : { durationSeconds: duration }),
  };
}

function extractTimeMentions(value: string): TimeMention[] {
  const normalized = normalizeTimingText(value);
  const mentions: TimeMention[] = [];

  const timecodePattern = /\b(?:(\d{1,3}):)?(\d{1,2}):(\d{2}(?:\.\d{1,6})?)\b/g;
  for (const match of normalized.matchAll(timecodePattern)) {
    const hours = match[1] == null ? 0 : Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    pushMention(mentions, match.index ?? 0, match[0].length, (hours * 3600) + (minutes * 60) + seconds);
  }

  const numericPattern = new RegExp(
    `\\b(\\d+(?:\\.\\d{1,6})?)\\s*(${UNIT_PATTERN})\\b`,
    'gi',
  );
  for (const match of normalized.matchAll(numericPattern)) {
    const seconds = quantityToSeconds(Number(match[1]), match[2]);
    pushMention(mentions, match.index ?? 0, match[0].length, seconds);
  }

  const wordsPattern = new RegExp(
    `\\b((?:${NUMBER_WORD_PATTERN})(?:[\\s-]+${NUMBER_WORD_PATTERN}){0,8})\\s*(${UNIT_PATTERN})\\b`,
    'gi',
  );
  for (const match of normalized.matchAll(wordsPattern)) {
    const number = parseEnglishNumberWords(match[1]);
    if (number == null) continue;
    pushMention(
      mentions,
      match.index ?? 0,
      match[0].length,
      quantityToSeconds(number, match[2]),
    );
  }

  return mentions.sort((left, right) => left.start - right.start);
}

function parseTimeQuantity(
  value: string,
  allowUnitless: boolean,
  inferredUnit?: string,
): { seconds: number; unit: string } | null {
  const normalized = normalizeTimingText(value).trim();
  const timecode = normalized.match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{2}(?:\.\d{1,6})?)/);
  if (timecode) {
    const hours = timecode[1] == null ? 0 : Number(timecode[1]);
    const minutes = Number(timecode[2]);
    const seconds = Number(timecode[3]);
    return { seconds: (hours * 3600) + (minutes * 60) + seconds, unit: 'seconds' };
  }

  const numeric = normalized.match(new RegExp(`^(\\d+(?:\\.\\d{1,6})?)\\s*(${UNIT_PATTERN})?\\b`, 'i'));
  if (numeric && (numeric[2] || allowUnitless)) {
    const unit = numeric[2] ?? inferredUnit ?? 'seconds';
    return { seconds: quantityToSeconds(Number(numeric[1]), unit), unit };
  }

  const words = normalized.match(new RegExp(`^((?:${NUMBER_WORD_PATTERN})(?:[\\s-]+${NUMBER_WORD_PATTERN}){0,8})\\s*(${UNIT_PATTERN})?\\b`, 'i'));
  if (!words || (!words[2] && !allowUnitless)) return null;
  const number = parseEnglishNumberWords(words[1]);
  if (number == null) return null;
  const unit = words[2] ?? inferredUnit ?? 'seconds';
  return { seconds: quantityToSeconds(number, unit), unit };
}

function parseEnglishNumberWords(value: string): number | null {
  const tokens = value.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length === 1 && tokens[0] === 'half') return 0.5;
  if (tokens.length === 1 && tokens[0] === 'quarter') return 0.25;

  const small: Record<string, number> = {
    a: 1,
    an: 1,
    zero: 0,
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
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };
  let total = 0;
  let current = 0;
  let fractional = false;
  let fractionDigits = '';

  for (const token of tokens) {
    if (token === 'and') continue;
    if (token === 'point') {
      fractional = true;
      continue;
    }
    if (token === 'half') {
      total += current + 0.5;
      current = 0;
      continue;
    }
    if (token === 'quarter') {
      total += current + 0.25;
      current = 0;
      continue;
    }
    const amount = small[token];
    if (amount == null) return null;
    if (fractional) {
      if (amount > 9) return null;
      fractionDigits += String(amount);
    } else if (token === 'hundred') {
      current = Math.max(1, current) * 100;
    } else {
      current += amount;
    }
  }

  const result = total + current + (fractionDigits ? Number(`0.${fractionDigits}`) : 0);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function quantityToSeconds(value: number, unit: string): number {
  const normalized = unit.toLowerCase();
  if (normalized.startsWith('ms') || normalized.startsWith('millisecond')) return value / 1000;
  if (normalized === 'm' || normalized.startsWith('min')) return value * 60;
  if (normalized === 'h' || normalized.startsWith('hr') || normalized.startsWith('hour')) return value * 3600;
  return value;
}

function pushMention(
  mentions: TimeMention[],
  start: number,
  length: number,
  seconds: number,
): void {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const end = start + length;
  if (mentions.some((mention) => start < mention.end && end > mention.start)) return;
  mentions.push({ start, end, seconds });
}

function spanOccursInMessage(sourceSpan: string, userMessage: string): boolean {
  return normalizeProvenanceText(userMessage).includes(normalizeProvenanceText(sourceSpan));
}

function normalizeProvenanceText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeTimingText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\uFF0C/g, ',')
    .replace(/\u3002/g, '.')
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
