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
  const captions = groupWordsIntoCaptions(words, {
    wordsPerGroup: displayConfig.wordsPerGroup,
    groupByPunctuation: true,
    maxGroupDuration: 2200,
  });
  const dimensions = input.playerDimensions ?? { width: 1920, height: 1080 };
  const geometry = captionGeometry(dimensions, input.presentation);
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
  return {
    ...displayConfig,
    maxWordsPerLine: Math.max(1, Math.min(12, displayConfig.maxWordsPerLine)),
  };
}

function captionGeometry(dimensions: { width: number; height: number }, presentation: AtomicCaptionPresentation) {
  const aesthetic = presentation.aesthetic;
  const width = Math.round(Math.min(dimensions.width * aesthetic.widthFraction, aesthetic.maxWidthPx));
  const height = Math.round(Math.max(
    aesthetic.minHeightPx,
    Math.min(dimensions.height * aesthetic.heightFraction, aesthetic.maxHeightPx),
  ));
  const bottomMargin = Math.round(dimensions.height * aesthetic.bottomMarginFraction);
  const top = dimensions.height - height - bottomMargin;
  return {
    width,
    height,
    left: Math.round((dimensions.width - width) / 2),
    top: Math.round(Math.max(dimensions.height * 0.58, Math.min(top, dimensions.height * 0.82))),
  };
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
  const fontSize = `${aesthetic.fontSizePx}px`;
  const accentColor = isHighEnergy ? '#FFD84D' : isFormal ? '#A7D3FF' : '#FF8A8A';
  const shadowAlpha = Math.max(0.65, Math.min(0.95, aesthetic.shadowStrength));

  return {
    fontFamily: isFormal ? 'font-sans' : 'font-league-spartan',
    fontSize,
    fontWeight: isHighEnergy ? 850 : isFormal ? 700 : 800,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: aesthetic.lineHeight,
    textShadow: `0 3px 12px rgba(0,0,0,${shadowAlpha}), 0 0 3px rgba(0,0,0,0.95)`,
    backgroundColor: panelSurface ? 'rgba(0,0,0,0.62)' : 'transparent',
    padding: panelSurface ? '8px 18px' : '4px 8px',
    borderRadius: panelSurface ? '8px' : undefined,
    highlight: {
      color: accentColor,
      backgroundColor: activeWordPill ? 'rgba(0,0,0,0.72)' : 'transparent',
      scale: aesthetic.emphasisScale,
      fontWeight: 900,
      effect: isHighEnergy ? 'pop' : 'glow',
      animation: isHighEnergy ? 'bounce' : 'none',
      textShadow: `0 2px 10px rgba(0,0,0,${shadowAlpha})`,
      borderRadius: activeWordPill ? '7px' : '4px',
    },
  };
}
