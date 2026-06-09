type WordTimingLike = {
  startMs?: number;
  endMs?: number;
};

type SegmentLike = Record<string, unknown> & {
  words?: WordTimingLike[];
};

type BestTakeSelectionLike = Record<string, unknown> & {
  keptSegment?: SegmentLike;
  inferiorSegments?: SegmentLike[];
};

type TranscriptionLike = Record<string, unknown> & {
  words?: WordTimingLike[];
};

export type PersistableRawFootageAnalysis = Record<string, unknown> & {
  transcription?: TranscriptionLike;
  segments?: SegmentLike[];
  bestTakeSelections?: BestTakeSelectionLike[];
};

type PersistedSegment = Omit<SegmentLike, 'words'> & {
  wordStartMs?: number;
  wordEndMs?: number;
};

type PersistedBestTakeSelection = Omit<BestTakeSelectionLike, 'keptSegment' | 'inferiorSegments'> & {
  keptSegment: PersistedSegment;
  inferiorSegments: PersistedSegment[];
};

export type PersistedRawFootageAnalysis = Record<string, unknown> & {
  transcription?: TranscriptionLike;
  segments: PersistedSegment[];
  bestTakeSelections: PersistedBestTakeSelection[];
};

function compactTranscriptSegment(segment: SegmentLike = {}): PersistedSegment {
  const { words, ...rest } = segment;
  const firstWord = words?.[0];
  const lastWord = words?.[words.length - 1];

  return {
    ...rest,
    ...(firstWord?.startMs !== undefined && { wordStartMs: firstWord.startMs }),
    ...(lastWord?.endMs !== undefined && { wordEndMs: lastWord.endMs }),
  };
}

/**
 * Persist raw-footage analysis without repeating the full word list inside
 * every segment/best-take object. `transcription.words` remains canonical.
 */
export function compactRawFootageAnalysisForProject(
  analysis: PersistableRawFootageAnalysis,
): PersistedRawFootageAnalysis {
  return {
    ...analysis,
    segments: (analysis.segments || []).map(compactTranscriptSegment),
    bestTakeSelections: (analysis.bestTakeSelections || []).map(selection => {
      const { keptSegment, inferiorSegments, ...rest } = selection;

      return {
        ...rest,
        keptSegment: compactTranscriptSegment(keptSegment),
        inferiorSegments: (inferiorSegments || []).map(compactTranscriptSegment),
      };
    }),
  };
}
