export interface TimedSpeechWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface TimedSpeechPhrase {
  line: string;
  startMs: number;
  endMs: number;
  wordCount: number;
}

export interface TimedSpeechSegmentationPolicy {
  pauseBoundaryMs?: number;
  minimumStandaloneWords?: number;
}

const SENTENCE_END = /[.!?]["')\]]?$/;
const DEFAULT_PAUSE_BOUNDARY_MS = 800;
const DEFAULT_MINIMUM_STANDALONE_WORDS = 4;

/**
 * Segment measured speech at linguistic or acoustic boundaries.
 *
 * Consumers own their merge policy: narrative graphics retain denser beats,
 * while dubbing preserves short utterances so their timing is not swallowed.
 */
export function segmentTimedSpeechPhrases(
  words: TimedSpeechWord[],
  policy: TimedSpeechSegmentationPolicy = {},
): TimedSpeechPhrase[] {
  const pauseBoundaryMs = finiteNonNegative(
    policy.pauseBoundaryMs,
    DEFAULT_PAUSE_BOUNDARY_MS,
  );
  const minimumStandaloneWords = Math.max(
    1,
    Math.round(finiteNonNegative(
      policy.minimumStandaloneWords,
      DEFAULT_MINIMUM_STANDALONE_WORDS,
    )),
  );
  const clean = words.filter((word) =>
    typeof word.word === 'string'
    && word.word.trim().length > 0
    && Number.isFinite(word.startMs)
    && Number.isFinite(word.endMs)
    && word.endMs >= word.startMs
  );
  if (clean.length === 0) return [];

  const groups: TimedSpeechWord[][] = [];
  let current: TimedSpeechWord[] = [];
  for (let index = 0; index < clean.length; index += 1) {
    current.push(clean[index]);
    const sentenceEnd = SENTENCE_END.test(clean[index].word);
    const pause = index + 1 < clean.length
      ? clean[index + 1].startMs - clean[index].endMs >= pauseBoundaryMs
      : false;
    if (sentenceEnd || pause) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);

  const merged: TimedSpeechWord[][] = [];
  for (const group of groups) {
    if (merged.length > 0 && group.length < minimumStandaloneWords) {
      merged[merged.length - 1].push(...group);
    } else {
      merged.push(group);
    }
  }

  return merged.map((group) => ({
    line: group.map((word) => word.word).join(' '),
    startMs: group[0].startMs,
    endMs: group[group.length - 1].endMs,
    wordCount: group.length,
  }));
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : fallback;
}
