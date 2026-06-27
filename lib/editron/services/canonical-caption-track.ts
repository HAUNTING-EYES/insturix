import {
  OverlayType,
  type CaptionDisplayConfig,
  type Caption,
  type CaptionOverlay,
  type CaptionStyles,
  type CaptionWord,
} from '@/components/editron/editor/version-7.0.0/types';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import type { AtomicCaptionPresentation } from './caption-form';
import type { EditedTimelineContext } from './edited-timeline-context';
import { createDisplayConfig, groupWordsIntoCaptions } from '../utils/caption-utils';

export const CANONICAL_CAPTION_TRACK_SOURCE = 'canonical-caption-track';

export interface InstallCanonicalCaptionTrackInput {
  overlays: any[];
  editedTimelineContext: EditedTimelineContext;
  playerDimensions?: { width: number; height: number } | null;
  presentation: AtomicCaptionPresentation;
}

export interface InstallCanonicalCaptionTrackResult {
  created: number;
  removedGenerated: number;
  skippedReason?: 'no-words' | 'manual-captions-present';
  wordCount: number;
  captionCount: number;
}

interface CaptionProtectedRegion {
  reason: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strength: number;
}

export function installCanonicalCaptionTrack(input: InstallCanonicalCaptionTrackInput): InstallCanonicalCaptionTrackResult {
  const removedGenerated = removeSupersededGeneratedCaptionTracks(input.overlays);
  const hasManualCaptions = input.overlays.some(isManualCaptionTrack);
  if (hasManualCaptions) {
    return {
      created: 0,
      removedGenerated,
      skippedReason: 'manual-captions-present',
      wordCount: input.editedTimelineContext.transcription.length,
      captionCount: 0,
    };
  }

  const overlay = createCanonicalCaptionTrack(input);
  if (!overlay) {
    return {
      created: 0,
      removedGenerated,
      skippedReason: 'no-words',
      wordCount: input.editedTimelineContext.transcription.length,
      captionCount: 0,
    };
  }

  input.overlays.push(overlay);
  return {
    created: 1,
    removedGenerated,
    wordCount: overlay.words?.length ?? 0,
    captionCount: overlay.captions.length,
  };
}

export function createCanonicalCaptionTrack(input: InstallCanonicalCaptionTrackInput): (CaptionOverlay & { metadata: Record<string, unknown>; words: CaptionWord[] }) | null {
  const words = input.editedTimelineContext.transcription
    .map((word): CaptionWord => ({
      word: word.word,
      startMs: Math.max(0, Math.round(word.startMs)),
      endMs: Math.max(Math.round(word.startMs) + 80, Math.round(word.endMs)),
      confidence: 1,
    }))
    .filter((word) => word.word.trim().length > 0 && word.endMs > word.startMs);

  if (words.length === 0) return null;

  // Read-speed must follow the ACTUAL speaking pace, not the genre-derived estimate carried in
  // input.presentation.signals.speakingRate (caption-form.ts maps a video-level `pacing_tolerance`
  // to a guessed WPM). We have the real word timings here, so measure the true rate and feed it to
  // the readability policy. For VO-based edits these ARE the VO's word timings, so the pace matches
  // what the viewer hears. Style/displayMode were chosen upstream and are intentionally left as-is.
  const measuredSpeakingRateWpm = measureSpeakingRateWpm(words);
  const pacedPresentation = measuredSpeakingRateWpm > 0
    ? { ...input.presentation, signals: { ...input.presentation.signals, speakingRate: measuredSpeakingRateWpm } }
    : input.presentation;
  const displayConfig = resolveDisplayConfig(input.presentation);
  const readability = captionReadabilityPolicy(pacedPresentation, displayConfig);
  const groupingConfig = {
    wordsPerGroup: readability.groupWordsPerCaption,
    groupByPunctuation: true,
    maxGroupDuration: readability.maxGroupDurationMs,
    maxCharsPerLine: readability.maxCharsPerCaption,
  };
  const captionBoundaries = captionBoundaryPlanMs(input.editedTimelineContext, words, readability);
  const captions = groupWordsIntoBoundaryAwareCaptions(words, groupingConfig, captionBoundaries.allMs, readability);
  const dimensions = input.playerDimensions ?? { width: 1920, height: 1080 };
  const protectedRegions = collectCaptionProtectedRegions(input.overlays, input.editedTimelineContext.durationFrames);
  const geometry = captionGeometry(dimensions, input.presentation, protectedRegions);
  const styles = stylesForPresentation(input.presentation);

  return {
    id: nextNumericOverlayId(input.overlays),
    type: OverlayType.CAPTION,
    from: 0,
    durationInFrames: input.editedTimelineContext.durationFrames,
    captions,
    words,
    left: geometry.left,
    top: geometry.top,
    width: geometry.width,
    height: geometry.height,
    rotation: 0,
    isDragging: false,
    row: ROW.CAPTIONS,
    styles,
    displayConfig,
    position: 'custom',
    template: input.presentation.style,
    metadata: {
      source: CANONICAL_CAPTION_TRACK_SOURCE,
      version: 'canonical-caption-track-v1',
      timeline: 'cut',
      generated: true,
      captionPresentation: input.presentation,
      evidence: {
        editedWordCount: words.length,
        measuredSpeakingRateWpm,
        presentationSpeakingRateWpm: input.presentation.signals.speakingRate,
        durationFrames: input.editedTimelineContext.durationFrames,
        sourceClipCount: input.editedTimelineContext.sourceClips.length,
        captionBoundaryCount: captionBoundaries.allMs.length,
        clipBoundaryCount: captionBoundaries.clipBoundaryCount,
        speechPauseBoundaryCount: captionBoundaries.speechPauseBoundaryCount,
        speechPauseBoundaryMs: captionBoundaries.speechPauseBoundaryMs,
        sourceDisplayMode: input.presentation.displayMode,
        renderDisplayMode: displayConfig.mode,
        captionAesthetic: input.presentation.aesthetic,
        readability,
        protectedRegionCount: protectedRegions.length,
        selectedRegion: geometry.region,
      },
      calibration: {
        status: 'invented-needs-calibration',
        fields: ['geometry', 'maxGroupDurationMs', 'styleHeuristics', 'aestheticResolver'],
      },
    },
  };
}

interface CaptionBoundaryPlan {
  allMs: number[];
  clipBoundaryCount: number;
  speechPauseBoundaryCount: number;
  speechPauseBoundaryMs: number;
}

function captionBoundaryPlanMs(
  context: EditedTimelineContext,
  words: CaptionWord[],
  readability: ReturnType<typeof captionReadabilityPolicy>,
): CaptionBoundaryPlan {
  const rawClipBoundaries = context.sourceClips
    .map((clip) => Math.round((clip.from / context.fps) * 1000))
    .filter((ms) => ms > 0 && ms < context.durationMs)
    .sort((a, b) => a - b);
  const speechPauseBoundaries = speechPauseBoundaryMs(words, readability.speechPauseBoundaryMs);
  const clipBoundaries = rawClipBoundaries
    .filter((ms) => isCaptionSafeClipBoundary(ms, words, readability));
  const allMs = uniqueSortedMs([...clipBoundaries, ...speechPauseBoundaries]);

  return {
    allMs,
    clipBoundaryCount: uniqueSortedMs(clipBoundaries).length,
    speechPauseBoundaryCount: speechPauseBoundaries.length,
    speechPauseBoundaryMs: readability.speechPauseBoundaryMs,
  };
}

function isCaptionSafeClipBoundary(
  boundaryMs: number,
  words: CaptionWord[],
  readability: ReturnType<typeof captionReadabilityPolicy>,
): boolean {
  const previous = [...words].reverse().find((word) => word.endMs <= boundaryMs);
  const next = words.find((word) => word.startMs >= boundaryMs);
  if (!previous || !next) return true;

  const speechGapMs = next.startMs - previous.endMs;
  if (speechGapMs >= readability.softClipBoundaryGapMs) return true;

  const punctuationPause = /[.!?;:]$/.test(previous.word.trim());
  return punctuationPause && speechGapMs >= readability.punctuationClipBoundaryGapMs;
}

function speechPauseBoundaryMs(words: CaptionWord[], pauseBoundaryMs: number): number[] {
  const boundaries: number[] = [];
  for (let index = 1; index < words.length; index += 1) {
    const previous = words[index - 1];
    const current = words[index];
    if (!previous || !current) continue;
    const gap = current.startMs - previous.endMs;
    if (gap >= pauseBoundaryMs) boundaries.push(current.startMs);
  }
  return uniqueSortedMs(boundaries);
}

function uniqueSortedMs(values: number[]): number[] {
  return values
    .filter((ms) => Number.isFinite(ms) && ms > 0)
    .sort((a, b) => a - b)
    .filter((ms, index, all) => index === 0 || ms !== all[index - 1]);
}

function groupWordsIntoBoundaryAwareCaptions(
  words: CaptionWord[],
  config: Parameters<typeof groupWordsIntoCaptions>[1],
  boundariesMs: number[],
  readability: ReturnType<typeof captionReadabilityPolicy>,
): Caption[] {
  if (boundariesMs.length === 0) return readableCaptionGroups(words, config, readability);

  const captions: Caption[] = [];
  let currentWords: CaptionWord[] = [];
  let boundaryIndex = 0;

  const pushCurrentWords = (segmentEndMs?: number) => {
    if (currentWords.length === 0) return;
    captions.push(...readableCaptionGroups(currentWords, config, readability, segmentEndMs));
    currentWords = [];
  };

  for (const word of words) {
    while (
      boundaryIndex < boundariesMs.length &&
      word.startMs >= boundariesMs[boundaryIndex]
    ) {
      pushCurrentWords(boundariesMs[boundaryIndex]);
      boundaryIndex++;
    }
    currentWords.push(word);
  }
  pushCurrentWords();

  return captions;
}

function readableCaptionGroups(
  words: CaptionWord[],
  config: Parameters<typeof groupWordsIntoCaptions>[1],
  readability: ReturnType<typeof captionReadabilityPolicy>,
  segmentEndMs?: number,
): Caption[] {
  return padReadableCaptionWindows(
    normalizeReadableCaptionGroups(groupWordsIntoCaptions(words, config), readability),
    readability,
    segmentEndMs,
  );
}

function normalizeReadableCaptionGroups(
  captions: Caption[],
  readability: ReturnType<typeof captionReadabilityPolicy>,
): Caption[] {
  const normalized: Caption[] = [];

  for (const caption of captions) {
    const previous = normalized[normalized.length - 1];
    if (
      previous &&
      (captionDurationMs(previous) < readability.minGroupDurationMs || captionDurationMs(caption) < readability.minGroupDurationMs) &&
      canMergeCaptionGroups(previous, caption, readability)
    ) {
      normalized[normalized.length - 1] = mergeCaptionGroups(previous, caption);
    } else {
      normalized.push(caption);
    }
  }

  return normalized;
}

function canMergeCaptionGroups(
  left: Caption,
  right: Caption,
  readability: ReturnType<typeof captionReadabilityPolicy>,
): boolean {
  const words = [...(left.words ?? []), ...(right.words ?? [])];
  const text = words.map((word) => word.word).join(' ');
  const durationMs = (right.endMs ?? 0) - (left.startMs ?? 0);

  return words.length <= readability.maxMergeWords
    && text.length <= readability.maxMergeChars
    && durationMs <= readability.maxMergedGroupDurationMs;
}

function mergeCaptionGroups(left: Caption, right: Caption): Caption {
  const words = [...(left.words ?? []), ...(right.words ?? [])];
  const text = words.map((word) => word.word).join(' ');
  const confidence = words.length > 0
    ? words.reduce((sum, word) => sum + (word.confidence ?? 1), 0) / words.length
    : Math.min(left.confidence ?? 1, right.confidence ?? 1);

  return {
    text,
    startMs: left.startMs,
    endMs: right.endMs,
    timestampMs: null,
    confidence,
    words,
  };
}

function captionDurationMs(caption: Caption): number {
  return Math.max(0, (caption.endMs ?? 0) - (caption.startMs ?? 0));
}

function padReadableCaptionWindows(
  captions: Caption[],
  readability: ReturnType<typeof captionReadabilityPolicy>,
  segmentEndMs?: number,
): Caption[] {
  return captions.map((caption, index) => {
    const durationMs = captionDurationMs(caption);
    if (durationMs >= readability.minGroupDurationMs) return caption;

    const previous = captions[index - 1];
    const next = captions[index + 1];
    const minStartMs = (previous?.endMs ?? 0) + readability.minCaptionGapMs;
    const maxEndMs = Math.min(
      next ? next.startMs - readability.minCaptionGapMs : Number.POSITIVE_INFINITY,
      Number.isFinite(segmentEndMs) ? (segmentEndMs ?? Number.POSITIVE_INFINITY) - readability.minCaptionGapMs : Number.POSITIVE_INFINITY,
    );

    let startMs = caption.startMs;
    let endMs = caption.endMs;
    let remainingMs = readability.minGroupDurationMs - durationMs;

    const postRollMs = Math.min(
      remainingMs,
      readability.maxCaptionPostRollMs,
      Math.max(0, maxEndMs - endMs),
    );
    endMs += postRollMs;
    remainingMs -= postRollMs;

    const preRollMs = Math.min(
      remainingMs,
      readability.maxCaptionPreRollMs,
      Math.max(0, startMs - minStartMs),
    );
    startMs -= preRollMs;

    return {
      ...caption,
      startMs: Math.max(0, Math.round(startMs)),
      endMs: Math.max(Math.round(startMs) + 80, Math.round(endMs)),
    };
  });
}

function removeSupersededGeneratedCaptionTracks(overlays: any[]): number {
  const kept = overlays.filter((overlay) => !isSupersededGeneratedCaptionTrack(overlay));
  const removed = overlays.length - kept.length;
  if (removed > 0) {
    overlays.length = 0;
    overlays.push(...kept);
  }
  return removed;
}

function isSupersededGeneratedCaptionTrack(overlay: any): boolean {
  if (overlay?.type !== OverlayType.CAPTION && overlay?.type !== 'caption') return false;
  if (overlay?.metadata?.source === CANONICAL_CAPTION_TRACK_SOURCE) return true;
  if (overlay?.metadata?.userEdited === true || overlay?.metadata?.manual === true) return false;
  return overlay?._workerAdded === true || overlay?.sourceVideoId != null;
}

function isManualCaptionTrack(overlay: any): boolean {
  if (overlay?.type !== OverlayType.CAPTION && overlay?.type !== 'caption') return false;
  if (overlay?.metadata?.source === CANONICAL_CAPTION_TRACK_SOURCE) return false;
  if (overlay?._workerAdded === true || overlay?.sourceVideoId != null) return false;
  return Boolean(overlay?.metadata?.userEdited === true || overlay?.metadata?.manual === true);
}

function resolveDisplayConfig(presentation: AtomicCaptionPresentation): CaptionDisplayConfig {
  const renderMode = renderCaptionModeForPresentation(presentation);
  const displayConfig = createDisplayConfig(renderMode, {
    wordsPerGroup: presentation.wordsPerGroup,
  });
  const readability = captionReadabilityPolicy(presentation, displayConfig);
  return {
    ...displayConfig,
    mode: readability.renderMode,
    wordsPerGroup: readability.wordsPerGroup,
    maxWordsPerLine: readability.maxWordsPerLine,
  };
}

function renderCaptionModeForPresentation(presentation: AtomicCaptionPresentation): CaptionDisplayConfig['mode'] {
  if (presentation.displayMode === 'karaoke' && presentation.aesthetic.surface === 'subtitle-panel') {
    return 'phrase';
  }
  return presentation.displayMode;
}

function captionReadabilityPolicy(
  presentation: AtomicCaptionPresentation,
  displayConfig: CaptionDisplayConfig,
) {
  const sourceMode = presentation.displayMode;
  const mode = displayConfig.mode;
  const fastSpeech = presentation.signals.speakingRate > 165;
  const sourceKaraokeMode = sourceMode === 'karaoke';
  const highEnergy = presentation.signals.energy > 0.68 || mode === 'hormozi' || mode === 'instagram' || mode === 'word-by-word';
  const subtitleMode = sourceMode === 'subtitle' || mode === 'subtitle';
  const karaokeMode = sourceKaraokeMode || mode === 'karaoke';
  const panelMode = subtitleMode || sourceKaraokeMode;
  const maxWordsPerLine = subtitleMode
    ? Math.min(6, displayConfig.maxWordsPerLine)
    : sourceKaraokeMode
      ? Math.min(4, displayConfig.maxWordsPerLine)
    : highEnergy
      ? Math.min(2, displayConfig.maxWordsPerLine)
      : Math.min(3, displayConfig.maxWordsPerLine);
  const wordsPerGroup = subtitleMode
    ? Math.min(displayConfig.wordsPerGroup, fastSpeech ? 6 : 8)
    : sourceKaraokeMode
      ? 1
    : karaokeMode
      ? Math.min(displayConfig.wordsPerGroup, fastSpeech ? 3 : 4)
    : highEnergy
      ? Math.min(displayConfig.wordsPerGroup, mode === 'word-by-word' ? 1 : 3)
      : Math.min(displayConfig.wordsPerGroup, 4);
  const groupWordsPerCaption = sourceKaraokeMode
    ? Math.max(wordsPerGroup + 8, fastSpeech ? 12 : 14)
    : wordsPerGroup;
  const maxCharsPerCaption = subtitleMode ? 38 : sourceKaraokeMode ? 84 : highEnergy ? 22 : 30;
  const maxGroupDurationMs = sourceKaraokeMode ? 2800 : panelMode ? 2300 : highEnergy ? 1450 : 1900;
  const speechPauseBoundaryMs = highEnergy ? 380 : panelMode ? 620 : 500;
  const minGroupDurationMs = subtitleMode ? 900 : karaokeMode ? 760 : highEnergy ? 560 : 680;
  const maxMergeWords = subtitleMode
    ? Math.max(wordsPerGroup, 10)
    : sourceKaraokeMode
      ? Math.max(groupWordsPerCaption, 18)
      : highEnergy
        ? Math.max(wordsPerGroup + 2, 5)
        : Math.max(wordsPerGroup + 2, 6);
  const maxMergeChars = subtitleMode ? 52 : sourceKaraokeMode ? 112 : highEnergy ? 30 : 38;
  const maxMergedGroupDurationMs = sourceKaraokeMode
    ? Math.max(maxGroupDurationMs, 5200)
    : Math.max(maxGroupDurationMs, minGroupDurationMs + 700);

  return {
    version: 'caption-readability-policy-v1',
    sourceMode,
    renderMode: mode,
    wordsPerGroup: Math.max(1, wordsPerGroup),
    groupWordsPerCaption: Math.max(wordsPerGroup, groupWordsPerCaption),
    maxWordsPerLine: Math.max(1, maxWordsPerLine),
    maxCharsPerCaption,
    maxGroupDurationMs,
    minGroupDurationMs,
    maxMergeWords,
    maxMergeChars,
    maxMergedGroupDurationMs,
    maxCaptionPreRollMs: panelMode ? 320 : 260,
    maxCaptionPostRollMs: panelMode ? 520 : 420,
    minCaptionGapMs: 80,
    speechPauseBoundaryMs,
    softClipBoundaryGapMs: Math.max(220, Math.round(speechPauseBoundaryMs * 0.65)),
    punctuationClipBoundaryGapMs: 140,
    contrastFloor: 4.5,
    surface: presentation.aesthetic.surface,
    status: 'invented-needs-calibration',
  };
}

function captionGeometry(
  dimensions: { width: number; height: number },
  presentation: AtomicCaptionPresentation,
  protectedRegions: CaptionProtectedRegion[] = [],
) {
  const aesthetic = presentation.aesthetic;
  const width = Math.round(Math.min(dimensions.width * aesthetic.widthFraction, aesthetic.maxWidthPx));
  const height = Math.round(Math.max(
    aesthetic.minHeightPx,
    Math.min(dimensions.height * aesthetic.heightFraction, aesthetic.maxHeightPx),
  ));
  const bottomMargin = Math.round(dimensions.height * aesthetic.bottomMarginFraction);
  const lowerTop = dimensions.height - height - bottomMargin;
  const candidates = [
    {
      region: 'bottom-center' as const,
      left: Math.round((dimensions.width - width) / 2),
      top: Math.round(Math.max(dimensions.height * 0.58, Math.min(lowerTop, dimensions.height * 0.82))),
    },
    {
      region: 'top-center' as const,
      left: Math.round((dimensions.width - width) / 2),
      top: Math.round(dimensions.height * 0.12),
    },
  ];
  const selected = candidates
    .map((candidate) => ({ ...candidate, risk: captionRegionRisk(candidate, width, height, dimensions, protectedRegions) }))
    .sort((a, b) => a.risk - b.risk || (a.region === 'bottom-center' ? -1 : 1))[0] ?? candidates[0];
  return {
    width,
    height,
    left: selected.left,
    top: selected.top,
    region: selected.region,
  };
}

function collectCaptionProtectedRegions(overlays: any[], captionDurationFrames: number): CaptionProtectedRegion[] {
  const regions = new Map<string, CaptionProtectedRegion>();
  for (const overlay of overlays) {
    if (overlay?.type === OverlayType.CAPTION || overlay?.type === 'caption') continue;
    if (overlay?.type === OverlayType.VIDEO || overlay?.type === 'video') continue;
    const temporalCoverage = overlayTemporalCoverage(overlay, captionDurationFrames);
    if (temporalCoverage <= 0) continue;
    for (const receipt of overlayReceipts(overlay)) {
      const avoid = receipt?.placementHints?.avoid;
      if (!Array.isArray(avoid)) continue;
      for (const item of avoid) {
        const region = normalizeProtectedRegion(item, temporalCoverage);
        if (!region) continue;
        const key = protectedRegionKey(region);
        const existing = regions.get(key);
        if (existing) {
          existing.strength = Math.min(1, existing.strength + region.strength);
        } else {
          regions.set(key, region);
        }
      }
    }
  }
  return [...regions.values()].filter((region) => region.strength >= 0.3);
}

function overlayReceipts(overlay: any): any[] {
  const metadata = overlay?.metadata;
  return [
    metadata?.atomicOverlayReceipt,
    ...(Array.isArray(metadata?.atomicOverlayReceipts) ? metadata.atomicOverlayReceipts : []),
  ].filter(Boolean);
}

function normalizeProtectedRegion(value: any, temporalCoverage: number): CaptionProtectedRegion | null {
  const strength = numeric(value?.strength);
  const x = numeric(value?.x);
  const y = numeric(value?.y);
  const width = numeric(value?.width);
  const height = numeric(value?.height);
  if (strength == null || strength < 0.2 || x == null || y == null || width == null || height == null) return null;
  const effectiveStrength = strength * temporalCoverage;
  if (effectiveStrength < 0.02) return null;
  return {
    reason: String(value?.reason ?? 'protected-region'),
    x,
    y,
    width,
    height,
    strength: effectiveStrength,
  };
}

function overlayTemporalCoverage(overlay: any, captionDurationFrames: number): number {
  if (!Number.isFinite(captionDurationFrames) || captionDurationFrames <= 0) return 1;
  const duration = numeric(overlay?.durationInFrames);
  if (duration == null || duration <= 0) return 0;
  return Math.max(0, Math.min(1, duration / captionDurationFrames));
}

function protectedRegionKey(region: CaptionProtectedRegion): string {
  const precision = 1000;
  const part = (value: number) => String(Math.round(value * precision) / precision);
  return [
    region.reason,
    part(region.x),
    part(region.y),
    part(region.width),
    part(region.height),
  ].join(':');
}

function captionRegionRisk(
  candidate: { left: number; top: number },
  width: number,
  height: number,
  dimensions: { width: number; height: number },
  protectedRegions: CaptionProtectedRegion[],
): number {
  const box = { x: candidate.left, y: candidate.top, width, height };
  return protectedRegions.reduce((risk, region) => {
    return risk + region.strength * intersectionRatio(box, {
      x: region.x * dimensions.width,
      y: region.y * dimensions.height,
      width: region.width * dimensions.width,
      height: region.height * dimensions.height,
    });
  }, 0);
}

function intersectionRatio(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  return ((right - left) * (bottom - top)) / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nextNumericOverlayId(overlays: any[]): number {
  const maxId = overlays.reduce((max, overlay) => {
    return typeof overlay?.id === 'number' && Number.isFinite(overlay.id)
      ? Math.max(max, overlay.id)
      : max;
  }, 0);
  return maxId + 1;
}

/**
 * Measure the REAL speaking rate (words/min) from the cut's word timings — the actual pace, not the
 * genre-derived estimate the presentation carries (caption-form.ts maps a video-level `pacing_tolerance`
 * to a guessed WPM). Long pauses (> 600ms, ~ the readability policy's speech-pause boundary) are excluded
 * so the figure reflects how fast the person actually talks. For VO-based edits these are the VO's word
 * timings, so the pace matches what the viewer hears.
 * Clamp 80-320 WPM = human speech range (cf. VOICE_WPM_BY_TONE 100-200) to reject transcription glitches.
 */
function measureSpeakingRateWpm(words: CaptionWord[]): number {
  if (words.length < 2) return 0;
  let activeMs = 0;
  for (let i = 0; i < words.length; i++) {
    activeMs += Math.max(0, words[i].endMs - words[i].startMs);
    if (i > 0) {
      const gap = words[i].startMs - words[i - 1].endMs;
      if (gap > 0 && gap <= 600) activeMs += gap;
    }
  }
  if (activeMs <= 0) return 0;
  const wpm = words.length / (activeMs / 60000);
  return Math.max(80, Math.min(320, wpm));
}

function stylesForPresentation(presentation: AtomicCaptionPresentation): CaptionStyles {
  const isFormal = presentation.signals.formality > 0.68;
  const isHighEnergy = presentation.signals.energy > 0.68;
  const aesthetic = presentation.aesthetic;
  const panelSurface = aesthetic.surface === 'subtitle-panel';
  const activeWordPill = aesthetic.surface === 'active-word-pill';
  const readabilitySurface = panelSurface || activeWordPill;
  const fontSize = `${aesthetic.fontSizePx}px`;
  const accentColor = isHighEnergy ? '#FFD84D' : isFormal ? '#A7D3FF' : '#FF8A8A';
  const shadowAlpha = Math.max(0.65, Math.min(0.95, aesthetic.shadowStrength));
  const surfaceAlpha = panelSurface ? 0.88 : activeWordPill ? 0.56 : 0.44;

  return {
    fontFamily: isFormal ? 'font-sans' : 'font-league-spartan',
    fontSize,
    fontWeight: isHighEnergy ? 850 : isFormal ? 700 : 800,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: aesthetic.lineHeight,
    textShadow: `0 4px 16px rgba(0,0,0,${shadowAlpha}), 0 0 5px rgba(0,0,0,0.98), 0 1px 1px rgba(0,0,0,1)`,
    backgroundColor: readabilitySurface || !isFormal ? `rgba(0,0,0,${surfaceAlpha})` : 'rgba(0,0,0,0.36)',
    backdropFilter: 'blur(3px)',
    padding: panelSurface ? '9px 18px' : '8px 14px',
    borderRadius: panelSurface ? '8px' : undefined,
    highlight: {
      color: accentColor,
      backgroundColor: activeWordPill ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.82)',
      scale: aesthetic.emphasisScale,
      fontWeight: 900,
      effect: isHighEnergy ? 'pop' : 'glow',
      animation: isHighEnergy ? 'bounce' : 'none',
      textShadow: `0 2px 12px rgba(0,0,0,${shadowAlpha}), 0 0 3px rgba(0,0,0,1)`,
      padding: activeWordPill ? '5px 9px' : '4px 8px',
      borderRadius: activeWordPill ? '7px' : '4px',
    },
  };
}
