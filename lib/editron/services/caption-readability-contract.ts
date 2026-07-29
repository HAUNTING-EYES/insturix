import type {
  Caption,
  CaptionWord,
} from '@/components/editron/editor/version-7.0.0/types';

export interface CaptionReadabilityTimingPolicy {
  version: 'caption-readability-policy-v1';
  renderMode: string;
  minGroupDurationMs: number;
  maxMergeWords: number;
  maxMergeChars: number;
  maxMergedGroupDurationMs: number;
  maxCaptionPreRollMs: number;
  maxCaptionPostRollMs: number;
  minCaptionGapMs: number;
}

const STATIC_CAPTION_MIN_EVENT_MS = 1_000;
const KINETIC_CAPTION_MIN_EVENT_MS = 560;
const SUBTITLE_MAX_READING_WPM = 180;
const STATIC_CAPTION_MAX_READING_WPM = 200;
const KINETIC_CAPTION_MAX_READING_WPM = 230;
const KINETIC_MODES = new Set(['hormozi', 'instagram', 'karaoke', 'word-by-word']);

export function captionMinimumEventDurationMs(mode: string | undefined): number {
  const normalized = normalizeMode(mode);
  if (normalized === 'subtitle') return STATIC_CAPTION_MIN_EVENT_MS;
  if (KINETIC_MODES.has(normalized)) return KINETIC_CAPTION_MIN_EVENT_MS;
  return STATIC_CAPTION_MIN_EVENT_MS;
}

export function minimumReadableCaptionDurationMs(input: {
  wordCount: number;
  mode?: string;
  configuredFloorMs?: number;
}): number {
  const wordCount = Math.max(1, Math.round(input.wordCount));
  const mode = normalizeMode(input.mode);
  const maxReadingWpm = mode === 'subtitle'
    ? SUBTITLE_MAX_READING_WPM
    : KINETIC_MODES.has(mode)
      ? KINETIC_CAPTION_MAX_READING_WPM
      : STATIC_CAPTION_MAX_READING_WPM;
  const readingDurationMs = Math.ceil((wordCount / maxReadingWpm) * 60_000);

  return Math.max(
    captionMinimumEventDurationMs(mode),
    Math.max(0, Math.round(input.configuredFloorMs ?? 0)),
    readingDurationMs,
  );
}

export function normalizeCaptionGroupsForReadability(
  captions: readonly Caption[],
  policy: CaptionReadabilityTimingPolicy,
  segmentEndMs?: number,
): Caption[] {
  const normalized: Caption[] = [];

  for (const source of captions) {
    const caption = cloneCaption(source);
    const previous = normalized[normalized.length - 1];
    if (
      previous
      && (isCaptionUnderReadable(previous, policy) || isCaptionUnderReadable(caption, policy))
      && canMergeCaptionGroups(previous, caption, policy)
    ) {
      normalized[normalized.length - 1] = mergeCaptionGroups(previous, caption);
    } else {
      normalized.push(caption);
    }
  }

  return padReadableCaptionWindows(normalized, policy, segmentEndMs);
}

export function countCaptionReadabilityViolations(
  captions: readonly Caption[],
  policy: CaptionReadabilityTimingPolicy,
): number {
  return captions.filter((caption) => isCaptionUnderReadable(caption, policy)).length;
}

export function parseCaptionReadabilityTimingPolicy(
  value: unknown,
): CaptionReadabilityTimingPolicy | null {
  const record = asRecord(value);
  if (record.version !== 'caption-readability-policy-v1') return null;
  const renderMode = stringValue(record.renderMode);
  if (!renderMode) return null;

  const numericFields = [
    'minGroupDurationMs',
    'maxMergeWords',
    'maxMergeChars',
    'maxMergedGroupDurationMs',
    'maxCaptionPreRollMs',
    'maxCaptionPostRollMs',
    'minCaptionGapMs',
  ] as const;
  const numbers = Object.fromEntries(
    numericFields.map((field) => [field, finiteNumber(record[field])]),
  ) as Record<(typeof numericFields)[number], number | null>;
  if (numericFields.some((field) => numbers[field] == null || numbers[field]! < 0)) return null;

  return {
    version: 'caption-readability-policy-v1',
    renderMode,
    minGroupDurationMs: numbers.minGroupDurationMs!,
    maxMergeWords: numbers.maxMergeWords!,
    maxMergeChars: numbers.maxMergeChars!,
    maxMergedGroupDurationMs: numbers.maxMergedGroupDurationMs!,
    maxCaptionPreRollMs: numbers.maxCaptionPreRollMs!,
    maxCaptionPostRollMs: numbers.maxCaptionPostRollMs!,
    minCaptionGapMs: numbers.minCaptionGapMs!,
  };
}

function isCaptionUnderReadable(
  caption: Caption,
  policy: CaptionReadabilityTimingPolicy,
): boolean {
  return captionDurationMs(caption) < minimumReadableCaptionDurationMs({
    wordCount: captionWordCount(caption),
    mode: policy.renderMode,
    configuredFloorMs: policy.minGroupDurationMs,
  });
}

function canMergeCaptionGroups(
  left: Caption,
  right: Caption,
  policy: CaptionReadabilityTimingPolicy,
): boolean {
  const words = [...captionWords(left), ...captionWords(right)];
  const text = words.length > 0
    ? words.map((word) => word.word).join(' ')
    : `${left.text ?? ''} ${right.text ?? ''}`.trim();
  const durationMs = (right.endMs ?? 0) - (left.startMs ?? 0);

  return captionWordCount(left) + captionWordCount(right) <= policy.maxMergeWords
    && text.length <= policy.maxMergeChars
    && durationMs <= policy.maxMergedGroupDurationMs;
}

function mergeCaptionGroups(left: Caption, right: Caption): Caption {
  const words = [...captionWords(left), ...captionWords(right)];
  const text = words.length > 0
    ? words.map((word) => word.word).join(' ')
    : `${left.text ?? ''} ${right.text ?? ''}`.trim();
  const confidence = words.length > 0
    ? words.reduce((sum, word) => sum + (word.confidence ?? 1), 0) / words.length
    : Math.min(left.confidence ?? 1, right.confidence ?? 1);

  return {
    ...left,
    text,
    startMs: left.startMs,
    endMs: right.endMs,
    timestampMs: null,
    confidence,
    words,
  };
}

function padReadableCaptionWindows(
  captions: readonly Caption[],
  policy: CaptionReadabilityTimingPolicy,
  segmentEndMs?: number,
): Caption[] {
  return captions.map((caption, index) => {
    const durationMs = captionDurationMs(caption);
    const requiredDurationMs = minimumReadableCaptionDurationMs({
      wordCount: captionWordCount(caption),
      mode: policy.renderMode,
      configuredFloorMs: policy.minGroupDurationMs,
    });
    if (durationMs >= requiredDurationMs) return cloneCaption(caption);

    const previous = captions[index - 1];
    const next = captions[index + 1];
    const minStartMs = (previous?.endMs ?? 0) + policy.minCaptionGapMs;
    const maxEndMs = Math.min(
      next ? next.startMs - policy.minCaptionGapMs : Number.POSITIVE_INFINITY,
      Number.isFinite(segmentEndMs)
        ? (segmentEndMs ?? Number.POSITIVE_INFINITY) - policy.minCaptionGapMs
        : Number.POSITIVE_INFINITY,
    );

    let startMs = caption.startMs;
    let endMs = caption.endMs;
    let remainingMs = requiredDurationMs - durationMs;
    const postRollMs = Math.min(
      remainingMs,
      policy.maxCaptionPostRollMs,
      Math.max(0, maxEndMs - endMs),
    );
    endMs += postRollMs;
    remainingMs -= postRollMs;

    const preRollMs = Math.min(
      remainingMs,
      policy.maxCaptionPreRollMs,
      Math.max(0, startMs - minStartMs),
    );
    startMs -= preRollMs;

    return {
      ...cloneCaption(caption),
      startMs: Math.max(0, Math.round(startMs)),
      endMs: Math.max(Math.round(startMs) + 80, Math.round(endMs)),
    };
  });
}

function captionDurationMs(caption: Caption): number {
  return Math.max(0, (caption.endMs ?? 0) - (caption.startMs ?? 0));
}

function captionWordCount(caption: Caption): number {
  const words = captionWords(caption);
  if (words.length > 0) return words.length;
  return String(caption.text ?? '').trim().split(/\s+/u).filter(Boolean).length;
}

function captionWords(caption: Caption): CaptionWord[] {
  return Array.isArray(caption.words) ? caption.words : [];
}

function cloneCaption(caption: Caption): Caption {
  return {
    ...caption,
    ...(Array.isArray(caption.words)
      ? { words: caption.words.map((word) => ({ ...word })) }
      : {}),
  };
}

function normalizeMode(value: string | undefined): string {
  return value?.trim().toLowerCase() || 'phrase';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
