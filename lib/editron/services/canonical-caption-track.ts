import {
  OverlayType,
  type CaptionDisplayConfig,
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

  const displayConfig = resolveDisplayConfig(input.presentation);
  const readability = captionReadabilityPolicy(input.presentation, displayConfig);
  const captions = groupWordsIntoCaptions(words, {
    wordsPerGroup: readability.wordsPerGroup,
    groupByPunctuation: true,
    maxGroupDuration: readability.maxGroupDurationMs,
    maxCharsPerLine: readability.maxCharsPerCaption,
  });
  const dimensions = input.playerDimensions ?? { width: 1920, height: 1080 };
  const protectedRegions = collectCaptionProtectedRegions(input.overlays);
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
        durationFrames: input.editedTimelineContext.durationFrames,
        sourceClipCount: input.editedTimelineContext.sourceClips.length,
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
  const displayConfig = createDisplayConfig(presentation.displayMode, {
    wordsPerGroup: presentation.wordsPerGroup,
  });
  const readability = captionReadabilityPolicy(presentation, displayConfig);
  return {
    ...displayConfig,
    wordsPerGroup: readability.wordsPerGroup,
    maxWordsPerLine: readability.maxWordsPerLine,
  };
}

function captionReadabilityPolicy(
  presentation: AtomicCaptionPresentation,
  displayConfig: CaptionDisplayConfig,
) {
  const mode = presentation.displayMode;
  const fastSpeech = presentation.signals.speakingRate > 165;
  const highEnergy = presentation.signals.energy > 0.68 || mode === 'hormozi' || mode === 'instagram' || mode === 'word-by-word';
  const subtitleMode = mode === 'subtitle';
  const karaokeMode = mode === 'karaoke';
  const panelMode = subtitleMode || karaokeMode;
  const maxWordsPerLine = subtitleMode
    ? Math.min(6, displayConfig.maxWordsPerLine)
    : karaokeMode
      ? Math.min(4, displayConfig.maxWordsPerLine)
    : highEnergy
      ? Math.min(2, displayConfig.maxWordsPerLine)
      : Math.min(3, displayConfig.maxWordsPerLine);
  const wordsPerGroup = subtitleMode
    ? Math.min(displayConfig.wordsPerGroup, fastSpeech ? 6 : 8)
    : karaokeMode
      ? Math.min(displayConfig.wordsPerGroup, fastSpeech ? 4 : 5)
    : highEnergy
      ? Math.min(displayConfig.wordsPerGroup, mode === 'word-by-word' ? 1 : 3)
      : Math.min(displayConfig.wordsPerGroup, 4);
  const maxCharsPerCaption = subtitleMode ? 38 : karaokeMode ? 30 : highEnergy ? 22 : 30;
  const maxGroupDurationMs = panelMode ? 2300 : highEnergy ? 1450 : 1900;

  return {
    version: 'caption-readability-policy-v1',
    wordsPerGroup: Math.max(1, wordsPerGroup),
    maxWordsPerLine: Math.max(1, maxWordsPerLine),
    maxCharsPerCaption,
    maxGroupDurationMs,
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

function collectCaptionProtectedRegions(overlays: any[]): CaptionProtectedRegion[] {
  const regions: CaptionProtectedRegion[] = [];
  for (const overlay of overlays) {
    if (overlay?.type === OverlayType.CAPTION || overlay?.type === 'caption') continue;
    for (const receipt of overlayReceipts(overlay)) {
      const avoid = receipt?.placementHints?.avoid;
      if (!Array.isArray(avoid)) continue;
      for (const item of avoid) {
        const region = normalizeProtectedRegion(item);
        if (region) regions.push(region);
      }
    }
  }
  return regions;
}

function overlayReceipts(overlay: any): any[] {
  const metadata = overlay?.metadata;
  return [
    metadata?.atomicOverlayReceipt,
    ...(Array.isArray(metadata?.atomicOverlayReceipts) ? metadata.atomicOverlayReceipts : []),
  ].filter(Boolean);
}

function normalizeProtectedRegion(value: any): CaptionProtectedRegion | null {
  const strength = numeric(value?.strength);
  const x = numeric(value?.x);
  const y = numeric(value?.y);
  const width = numeric(value?.width);
  const height = numeric(value?.height);
  if (strength == null || strength < 0.3 || x == null || y == null || width == null || height == null) return null;
  return {
    reason: String(value?.reason ?? 'protected-region'),
    x,
    y,
    width,
    height,
    strength,
  };
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
