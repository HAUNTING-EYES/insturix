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
import type { EditDecision } from './reactive-edit-engine';
import type { EditedTimelineContext } from './edited-timeline-context';
import type { SegmentAnalysis, SegmentRecord } from '../types/segment-analysis';
import type { VjepaTextBox } from './vjepa-service';
import { createDisplayConfig, groupWordsIntoCaptions } from '../utils/caption-utils';
import { selectCaptionPreset } from './caption-preset-registry';
import {
  EDITRON_CAPTION_SAFE_BOTTOM_MARGIN,
  EDITRON_CAPTION_SAFE_TOP_MARGIN,
} from '../shared/overlay-safe-zone-contract';
import {
  captionMinimumEventDurationMs,
  maximumReadableCaptionWords,
  normalizeCaptionGroupsForReadability,
} from './caption-readability-contract';

export const CANONICAL_CAPTION_TRACK_SOURCE = 'canonical-caption-track';
const SOURCE_TEXT_PROTECTED_REGION_REASON = 'source-text-box';

export interface CanonicalCaptionStyleIntent {
  fontSize?: string;
  color?: string;
  backgroundColor?: string;
  position?: 'top' | 'center' | 'bottom';
  fontFamily?: string;
  fontWeight?: number | string;
  textCase?: 'sentence' | 'uppercase' | 'lowercase' | 'capitalize';
}

export interface CaptionStyleAudit {
  requested: CanonicalCaptionStyleIntent;
  applied: {
    fontSize: string;
    color: string;
    backgroundColor?: string;
    position: 'top-center' | 'center' | 'bottom-center';
    fontFamily: string;
    fontWeight: number | string;
    textTransform?: CaptionStyles['textTransform'];
  };
  adjustments: string[];
}

export interface InstallCanonicalCaptionTrackInput {
  overlays: any[];
  editedTimelineContext: EditedTimelineContext;
  segmentAnalysis?: SegmentAnalysis | null;
  playerDimensions?: { width: number; height: number } | null;
  presentation: AtomicCaptionPresentation;
  styleIntent?: CanonicalCaptionStyleIntent;
  choreographyReservationCount?: number;
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

export interface RestyleCanonicalCaptionTracksResult {
  updated: number;
  captionOverlayIds: Array<string | number>;
  styleAudit: CaptionStyleAudit;
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

export function buildCanonicalCaptionChoreographyReservations(
  input: InstallCanonicalCaptionTrackInput,
): EditDecision[] {
  const overlay = createCanonicalCaptionTrack(input);
  if (!overlay) return [];
  const fps = input.editedTimelineContext.fps > 0 ? input.editedTimelineContext.fps : 30;
  const dimensions = input.playerDimensions ?? { width: 1920, height: 1080 };
  const captionProtectedRegion = {
    x: clamp01(overlay.left / Math.max(1, dimensions.width)),
    y: clamp01(overlay.top / Math.max(1, dimensions.height)),
    width: clamp01(overlay.width / Math.max(1, dimensions.width)),
    height: clamp01(overlay.height / Math.max(1, dimensions.height)),
    reason: 'canonical-caption-region',
    strength: 1,
  };
  return overlay.captions.map((caption, index) => {
    const frame = Math.max(0, Math.floor((caption.startMs / 1000) * fps));
    const endFrame = Math.max(frame + 1, Math.ceil((caption.endMs / 1000) * fps));
    return {
      type: 'caption-emphasis',
      frame,
      durationFrames: endFrame - frame,
      priority: 1,
      source: CANONICAL_CAPTION_TRACK_SOURCE,
      signal: 'caption-group-active',
      reason: 'Reserve the text-attention lane while a canonical caption group is visible.',
      params: {
        choreographyReservationOnly: true,
        captionGroupIndex: index,
        captionStartMs: caption.startMs,
        captionEndMs: caption.endMs,
        captionProtectedRegion,
      },
      confidence: 1,
    };
  });
}

export function restyleCanonicalCaptionTracks(
  input: InstallCanonicalCaptionTrackInput,
): RestyleCanonicalCaptionTracksResult {
  const dimensions = input.playerDimensions ?? { width: 1920, height: 1080 };
  const protectedRegions = collectCaptionProtectedRegions(
    input.overlays,
    input.editedTimelineContext.durationFrames,
    input.editedTimelineContext,
    input.segmentAnalysis,
  );
  const geometry = captionGeometry(
    dimensions,
    input.presentation,
    protectedRegions,
    input.styleIntent?.position,
  );
  const styleResolution = resolveCaptionStyles(
    input.presentation,
    input.styleIntent,
    geometry,
  );
  const displayConfig = resolveDisplayConfig(input.presentation);
  const captionOverlayIds: Array<string | number> = [];

  input.overlays.forEach((overlay, index) => {
    if (overlay?.type !== OverlayType.CAPTION && overlay?.type !== 'caption') return;
    captionOverlayIds.push(overlay.id);
    input.overlays[index] = {
      ...overlay,
      left: geometry.left,
      top: geometry.top,
      width: geometry.width,
      height: geometry.height,
      styles: styleResolution.styles,
      displayConfig,
      position: 'custom',
      template: input.presentation.style,
      metadata: {
        ...(overlay.metadata ?? {}),
        captionPresentationOwner: CANONICAL_CAPTION_TRACK_SOURCE,
        captionPresentation: input.presentation,
        captionStyleIntent: styleResolution.audit,
        evidence: {
          ...(overlay.metadata?.evidence ?? {}),
          sourceDisplayMode: input.presentation.displayMode,
          renderDisplayMode: displayConfig.mode,
          captionAesthetic: input.presentation.aesthetic,
          protectedRegionCount: protectedRegions.length,
          selectedRegion: geometry.region,
        },
      },
    };
  });

  return {
    updated: captionOverlayIds.length,
    captionOverlayIds,
    styleAudit: styleResolution.audit,
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
  const protectedRegions = collectCaptionProtectedRegions(
    input.overlays,
    input.editedTimelineContext.durationFrames,
    input.editedTimelineContext,
    input.segmentAnalysis,
  );
  const geometry = captionGeometry(
    dimensions,
    input.presentation,
    protectedRegions,
    input.styleIntent?.position,
  );
  const styleResolution = resolveCaptionStyles(
    input.presentation,
    input.styleIntent,
    geometry,
  );
  const sourceTextProtectedRegionCount = protectedRegions
    .filter((region) => region.reason === SOURCE_TEXT_PROTECTED_REGION_REASON)
    .length;
  const semanticVisualOcrSegmentCount = countSemanticVisualOcrSegments(input.segmentAnalysis);

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
    styles: styleResolution.styles,
    displayConfig,
    position: 'custom',
    template: input.presentation.style,
    metadata: {
      source: CANONICAL_CAPTION_TRACK_SOURCE,
      version: 'canonical-caption-track-v1',
      timeline: 'cut',
      generated: true,
      crossOverlayChoreographyReservations: {
        version: 'canonical-caption-reservations-v1',
        status: input.choreographyReservationCount === captions.length ? 'scheduled' : 'unreserved',
        reservationCount: input.choreographyReservationCount ?? 0,
        activeGroupCount: captions.length,
      },
      captionPresentation: input.presentation,
      captionStyleIntent: styleResolution.audit,
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
        sourceTextProtectedRegionCount,
        semanticVisualOcrSegmentCount,
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
  let segmentStartMs = 0;

  const pushCurrentWords = (segmentEndMs?: number) => {
    if (currentWords.length === 0) return;
    captions.push(...readableCaptionGroups(
      currentWords,
      config,
      readability,
      segmentEndMs,
      segmentStartMs,
    ));
    currentWords = [];
  };

  for (const word of words) {
    while (
      boundaryIndex < boundariesMs.length &&
      word.startMs >= boundariesMs[boundaryIndex]
    ) {
      pushCurrentWords(boundariesMs[boundaryIndex]);
      segmentStartMs = boundariesMs[boundaryIndex];
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
  segmentStartMs?: number,
): Caption[] {
  return normalizeCaptionGroupsForReadability(
    groupWordsIntoCaptions(words, config),
    readability,
    segmentEndMs,
    segmentStartMs,
  );
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
    emphasisBehavior: presentation.displayMode === 'subtitle' ? 'none' : 'active-word',
    fontSizing: 'authored',
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
  const minGroupDurationMs = Math.max(
    subtitleMode ? 900 : karaokeMode ? 760 : highEnergy ? 560 : 680,
    captionMinimumEventDurationMs(sourceMode),
  );
  const structuralMaxMergeWords = subtitleMode
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
  const maxMergeWords = Math.min(
    structuralMaxMergeWords,
    maximumReadableCaptionWords({
      durationMs: maxMergedGroupDurationMs,
      mode,
      configuredFloorMs: minGroupDurationMs,
    }),
  );

  return {
    version: 'caption-readability-policy-v1' as const,
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
    maxCaptionPostRollMs: panelMode ? 520 : 500,
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
  preferredPosition?: CanonicalCaptionStyleIntent['position'],
) {
  const aesthetic = presentation.aesthetic;
  const width = Math.round(Math.min(dimensions.width * aesthetic.widthFraction, aesthetic.maxWidthPx));
  const height = Math.round(Math.max(
    aesthetic.minHeightPx,
    Math.min(dimensions.height * aesthetic.heightFraction, aesthetic.maxHeightPx),
  ));
  const bottomMargin = Math.round(dimensions.height * aesthetic.bottomMarginFraction);
  const lowerTop = dimensions.height - height - bottomMargin;
  const safeCenterMin = dimensions.height * EDITRON_CAPTION_SAFE_TOP_MARGIN;
  const safeCenterMax = dimensions.height * (1 - EDITRON_CAPTION_SAFE_BOTTOM_MARGIN);
  const safeTopMin = Math.max(0, Math.ceil(safeCenterMin - (height / 2)));
  const safeTopMax = Math.min(
    dimensions.height - height,
    Math.floor(safeCenterMax - (height / 2)),
  );
  const clampTopToSafeCenter = (top: number) => Math.max(
    safeTopMin,
    Math.min(safeTopMax, Math.round(top)),
  );
  const candidates = [
    {
      region: 'bottom-center' as const,
      left: Math.round((dimensions.width - width) / 2),
      top: clampTopToSafeCenter(
        Math.max(dimensions.height * 0.58, Math.min(lowerTop, dimensions.height * 0.82)),
      ),
    },
    {
      region: 'top-center' as const,
      left: Math.round((dimensions.width - width) / 2),
      top: clampTopToSafeCenter(dimensions.height * 0.12),
    },
    ...(preferredPosition === 'center'
      ? [{
          region: 'center' as const,
          left: Math.round((dimensions.width - width) / 2),
          top: clampTopToSafeCenter((dimensions.height - height) / 2),
        }]
      : []),
  ];
  const preferredRegion = preferredPosition === 'top'
    ? 'top-center'
    : preferredPosition === 'center'
      ? 'center'
      : 'bottom-center';
  const selected = candidates
    .map((candidate) => ({
      ...candidate,
      risk: captionRegionRisk(candidate, width, height, dimensions, protectedRegions),
      preferenceRank: candidate.region === preferredRegion ? 0 : 1,
    }))
    .sort((a, b) => a.risk - b.risk || a.preferenceRank - b.preferenceRank)[0] ?? candidates[0];
  return {
    width,
    height,
    left: selected.left,
    top: selected.top,
    region: selected.region,
  };
}

function collectCaptionProtectedRegions(
  overlays: any[],
  captionDurationFrames: number,
  editedTimelineContext?: EditedTimelineContext,
  segmentAnalysis?: SegmentAnalysis | null,
): CaptionProtectedRegion[] {
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
        addProtectedRegion(regions, region);
      }
    }
  }
  for (const region of collectSourceTextProtectedRegions(editedTimelineContext, segmentAnalysis, captionDurationFrames)) {
    addProtectedRegion(regions, region);
  }
  return [...regions.values()].filter((region) => region.strength >= 0.3);
}

function addProtectedRegion(regions: Map<string, CaptionProtectedRegion>, region: CaptionProtectedRegion): void {
  const key = protectedRegionKey(region);
  const existing = regions.get(key);
  if (existing) {
    existing.strength = Math.min(1, existing.strength + region.strength);
  } else {
    regions.set(key, region);
  }
}

function collectSourceTextProtectedRegions(
  context: EditedTimelineContext | undefined,
  segmentAnalysis: SegmentAnalysis | null | undefined,
  captionDurationFrames: number,
): CaptionProtectedRegion[] {
  if (!context || !Array.isArray(segmentAnalysis?.segments)) return [];
  const regions: CaptionProtectedRegion[] = [];
  for (const segment of segmentAnalysis.segments) {
    const textBoxes = segment.visual?.textBoxes;
    if (!Array.isArray(textBoxes) || textBoxes.length === 0) continue;
    const temporalCoverage = sourceSegmentTemporalCoverage(segment, context, captionDurationFrames);
    if (temporalCoverage <= 0) continue;
    const hasSemanticOcr = Boolean(segment.semanticVisual?.ocrText?.some((text) => text.trim().length > 0));
    const coverageBoost = Math.min(0.2, Math.max(0, segment.visual?.textCoverage ?? 0) * 0.5);
    const ocrBoost = hasSemanticOcr ? 0.05 : 0;
    for (const box of textBoxes) {
      const region = sourceTextBoxProtectedRegion(box, temporalCoverage, coverageBoost + ocrBoost);
      if (region) regions.push(region);
    }
  }
  return regions;
}

function sourceTextBoxProtectedRegion(
  box: VjepaTextBox,
  temporalCoverage: number,
  confidenceBoost: number,
): CaptionProtectedRegion | null {
  const rawX = numeric(box?.x);
  const rawY = numeric(box?.y);
  const rawWidth = numeric(box?.width);
  const rawHeight = numeric(box?.height);
  if (rawX == null || rawY == null || rawWidth == null || rawHeight == null || rawWidth <= 0 || rawHeight <= 0) return null;
  const x = clamp01(rawX);
  const y = clamp01(rawY);
  const width = Math.min(clamp01(rawWidth), 1 - x);
  const height = Math.min(clamp01(rawHeight), 1 - y);
  if (width <= 0.01 || height <= 0.01) return null;
  const baseStrength = Math.max(0.35, Math.min(1, (numeric(box?.confidence) ?? 0.65) + confidenceBoost));
  const effectiveStrength = baseStrength * temporalCoverage;
  if (effectiveStrength < 0.02) return null;
  return {
    reason: SOURCE_TEXT_PROTECTED_REGION_REASON,
    x,
    y,
    width,
    height,
    strength: effectiveStrength,
  };
}

function sourceSegmentTemporalCoverage(
  segment: SegmentRecord,
  context: EditedTimelineContext,
  captionDurationFrames: number,
): number {
  if (!Number.isFinite(captionDurationFrames) || captionDurationFrames <= 0) return 1;
  const sourceStartFrame = msToFrame(segment.startMs, context.fps);
  const sourceEndFrame = Math.max(sourceStartFrame + 1, msToFrame(segment.endMs, context.fps));
  if (!context.sourceClips.length) {
    return Math.max(0, Math.min(1, (sourceEndFrame - sourceStartFrame) / captionDurationFrames));
  }
  let coveredFrames = 0;
  for (const clip of context.sourceClips) {
    const clipSourceStart = clip.sourceStartFrame;
    const clipSourceEnd = clip.sourceStartFrame + clip.durationInFrames;
    const overlapStart = Math.max(sourceStartFrame, clipSourceStart);
    const overlapEnd = Math.min(sourceEndFrame, clipSourceEnd);
    if (overlapEnd > overlapStart) coveredFrames += overlapEnd - overlapStart;
  }
  return Math.max(0, Math.min(1, coveredFrames / captionDurationFrames));
}

function countSemanticVisualOcrSegments(segmentAnalysis: SegmentAnalysis | null | undefined): number {
  if (!Array.isArray(segmentAnalysis?.segments)) return 0;
  return segmentAnalysis.segments.filter((segment) => (
    segment.semanticVisual?.ocrText?.some((text) => text.trim().length > 0)
  )).length;
}

function msToFrame(ms: number, fps: number): number {
  if (!Number.isFinite(ms) || !Number.isFinite(fps) || fps <= 0) return 0;
  return Math.round((ms / 1000) * fps);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
 * Measure the REAL speaking rate (words/min) from the cut's word timings â€” the actual pace, not the
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

function resolveCaptionStyles(
  presentation: AtomicCaptionPresentation,
  intent: CanonicalCaptionStyleIntent | undefined,
  geometry: { width: number; height: number; region: 'top-center' | 'center' | 'bottom-center' },
): { styles: CaptionStyles; audit: CaptionStyleAudit } {
  // The registry row owns the style IDENTITY (font, palette, highlight mode/effect/animation). The
  // explicitly-chosen style (presentation.style) wins selection; signals only break ties. The aesthetic
  // carries the SIGNAL-DRIVEN MAGNITUDE â€” size + emphasis scale move with energy/surface â€” so size and
  // pop stay on the signal rail while the picked style owns the look. A shadow floor guards readability
  // for any row that ships neither its own background nor its own text-shadow (e.g. karaoke).
  // (Per-MOMENT modulation of size/colour, and the per-word role/case/stroke atoms, are the next steps.)
  const preset = selectCaptionPreset(presentation.signals, presentation.style);
  const aesthetic = presentation.aesthetic;
  const shadowAlpha = Math.max(0.65, Math.min(0.95, aesthetic.shadowStrength));
  const shadowFloor = `0 4px 16px rgba(0,0,0,${shadowAlpha}), 0 0 5px rgba(0,0,0,0.98), 0 1px 1px rgba(0,0,0,1)`;

  const styles: CaptionStyles = {
    ...preset.styles,
    fontSize: `${Math.round(aesthetic.fontSizePx)}px`,
    lineHeight: aesthetic.lineHeight,
    textShadow: preset.styles.textShadow ?? shadowFloor,
    highlight: {
      ...preset.styles.highlight,
      scale: aesthetic.emphasisScale,
    },
    // Carry the row's renderer atoms â€” caption-layer-content applies these per caption/word.
    textTransform: preset.textCase === 'upper' ? 'uppercase' : preset.textCase === 'lower' ? 'lowercase' : undefined,
    stroke: preset.stroke,
    roles: preset.roles,
  };
  const adjustments: string[] = [];
  const requested = { ...(intent ?? {}) };
  const requestedFontSize = parsePixelSize(intent?.fontSize);
  if (intent?.fontSize && requestedFontSize == null) {
    adjustments.push('font-size-invalid');
  } else if (requestedFontSize != null) {
    const baseFontSize = Math.round(aesthetic.fontSizePx);
    const availableHeight = Math.max(1, geometry.height - 32);
    const twoLineFit = Math.floor(
      (availableHeight * 150)
      / Math.max(1, geometry.height * aesthetic.lineHeight * 2),
    );
    const maximumFontSize = Math.max(baseFontSize, twoLineFit);
    const appliedFontSize = Math.max(baseFontSize, Math.min(maximumFontSize, requestedFontSize));
    styles.fontSize = `${appliedFontSize}px`;
    if (appliedFontSize !== requestedFontSize) adjustments.push('font-size-clamped-to-readable-fit');
  }

  const requestedColor = normalizeCaptionColor(intent?.color);
  if (intent?.color && !requestedColor) adjustments.push('text-color-invalid');
  if (requestedColor) styles.color = requestedColor;

  const requestedBackground = normalizeCaptionColor(intent?.backgroundColor);
  if (intent?.backgroundColor && !requestedBackground) adjustments.push('background-color-invalid');
  if (requestedBackground) styles.backgroundColor = requestedBackground;

  const foreground = parseCaptionColor(styles.color);
  const background = parseCaptionColor(styles.backgroundColor);
  if (foreground && background && background.a >= 0.75) {
    const ratio = colorContrastRatio(foreground, background);
    if (ratio < 4.5) {
      const black = { r: 0, g: 0, b: 0, a: 1 };
      const white = { r: 255, g: 255, b: 255, a: 1 };
      styles.color = colorContrastRatio(black, background) >= colorContrastRatio(white, background)
        ? '#000000'
        : '#ffffff';
      adjustments.push('text-color-adjusted-for-wcag-aa');
    }
  }

  const resolvedBackground = parseCaptionColor(styles.backgroundColor);
  const resolvedForeground = parseCaptionColor(styles.color);
  if (resolvedForeground && (!resolvedBackground || resolvedBackground.a < 0.28)) {
    styles.textShadow = mergeCaptionTextShadows(
      styles.textShadow,
      captionContrastEdgeShadow(styles.color, styles.fontSize, shadowAlpha),
    );
    adjustments.push('base-contrast-edge-added');
  }

  const highlight = styles.highlight;
  const highlightForeground = parseCaptionColor(highlight?.color ?? styles.color);
  const highlightBackground = parseCaptionColor(highlight?.backgroundColor);
  const hasHighlightSurface = Boolean(
    (highlightBackground && highlightBackground.a >= 0.28)
    || (resolvedBackground && resolvedBackground.a >= 0.28),
  );
  if (highlight && highlightForeground && !hasHighlightSurface) {
    highlight.textShadow = mergeCaptionTextShadows(
      highlight.textShadow,
      captionContrastEdgeShadow(highlight.color ?? styles.color, styles.fontSize, shadowAlpha),
    );
    adjustments.push('highlight-contrast-edge-added');
  }

  const fontFamily = normalizeCaptionFontFamily(intent?.fontFamily);
  if (intent?.fontFamily && !fontFamily) adjustments.push('font-family-rejected-for-readability');
  if (fontFamily) styles.fontFamily = fontFamily;

  const fontWeight = normalizeCaptionFontWeight(intent?.fontWeight);
  if (intent?.fontWeight != null && fontWeight == null) adjustments.push('font-weight-invalid');
  if (fontWeight != null) styles.fontWeight = fontWeight;

  if (intent?.textCase) {
    styles.textTransform = intent.textCase === 'sentence' ? 'none' : intent.textCase;
  }

  return {
    styles,
    audit: {
      requested,
      applied: {
        fontSize: styles.fontSize,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        position: geometry.region,
        fontFamily: styles.fontFamily,
        fontWeight: styles.fontWeight,
        textTransform: styles.textTransform,
      },
      adjustments,
    },
  };
}

function captionContrastEdgeShadow(
  color: string | undefined,
  fontSize: string | undefined,
  shadowAlpha: number,
): string {
  const parsed = parseCaptionColor(color);
  const lightText = !parsed || relativeLuminance(parsed) >= 0.45;
  const edge = lightText ? '0,0,0' : '255,255,255';
  const edgePx = Math.max(2, Math.min(4, Math.round((parsePixelSize(fontSize) ?? 36) / 18)));
  const alpha = Math.max(0.86, shadowAlpha);
  return [
    `${edgePx}px 0 0 rgba(${edge},${alpha})`,
    `-${edgePx}px 0 0 rgba(${edge},${alpha})`,
    `0 ${edgePx}px 0 rgba(${edge},${alpha})`,
    `0 -${edgePx}px 0 rgba(${edge},${alpha})`,
    `${edgePx}px ${edgePx}px 0 rgba(${edge},${alpha})`,
    `-${edgePx}px ${edgePx}px 0 rgba(${edge},${alpha})`,
    `${edgePx}px -${edgePx}px 0 rgba(${edge},${alpha})`,
    `-${edgePx}px -${edgePx}px 0 rgba(${edge},${alpha})`,
    `0 4px 16px rgba(${edge},${Math.max(0.65, shadowAlpha)})`,
  ].join(', ');
}

function mergeCaptionTextShadows(...values: Array<string | undefined>): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(', ');
}

function parsePixelSize(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function normalizeCaptionFontFamily(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (
    trimmed.length === 0
    || trimmed.length > 80
    || /[;{}()]/.test(trimmed)
    || /\b(?:script|cursive)\b/i.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function normalizeCaptionFontWeight(value: number | string | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 100 || parsed > 900) return null;
  return Math.round(parsed / 100) * 100;
}

function normalizeCaptionColor(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'transparent') return 'transparent';
  if (NAMED_CAPTION_COLORS[trimmed]) return NAMED_CAPTION_COLORS[trimmed];
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed) && [4, 5, 7, 9].includes(trimmed.length)) {
    return trimmed;
  }
  if (/^rgba?\(\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

const NAMED_CAPTION_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  yellow: '#ffff00',
  red: '#ff0000',
  blue: '#0000ff',
  green: '#008000',
  orange: '#ffa500',
};

function parseCaptionColor(value: string | undefined): { r: number; g: number; b: number; a: number } | null {
  if (!value || value === 'transparent') return value === 'transparent'
    ? { r: 0, g: 0, b: 0, a: 0 }
    : null;
  const normalized = NAMED_CAPTION_COLORS[value.toLowerCase()] ?? value;
  if (normalized.startsWith('#')) {
    const raw = normalized.slice(1);
    const expanded = raw.length === 3 || raw.length === 4
      ? raw.split('').map((part) => part + part).join('')
      : raw;
    if (expanded.length !== 6 && expanded.length !== 8) return null;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
      a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }
  const match = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(',').map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return {
    r: Math.max(0, Math.min(255, parts[0])),
    g: Math.max(0, Math.min(255, parts[1])),
    b: Math.max(0, Math.min(255, parts[2])),
    a: Math.max(0, Math.min(1, parts[3] ?? 1)),
  };
}

function colorContrastRatio(
  foreground: { r: number; g: number; b: number },
  background: { r: number; g: number; b: number },
): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (0.2126 * channel(color.r)) + (0.7152 * channel(color.g)) + (0.0722 * channel(color.b));
}
