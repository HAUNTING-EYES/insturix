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
  const geometry = captionGeometry(dimensions);
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
      },
      calibration: {
        status: 'invented-needs-calibration',
        fields: ['geometry', 'maxGroupDurationMs', 'styleHeuristics'],
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

function captionGeometry(dimensions: { width: number; height: number }) {
  const width = Math.round(Math.min(dimensions.width * 0.86, 1320));
  const height = Math.round(Math.max(120, Math.min(dimensions.height * 0.18, 210)));
  return {
    width,
    height,
    left: Math.round((dimensions.width - width) / 2),
    top: Math.round(Math.min(dimensions.height - height - 72, dimensions.height * 0.72)),
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
  const fontSize = isHighEnergy ? '46px' : isFormal ? '34px' : '40px';
  const accentColor = isHighEnergy ? '#FFD84D' : isFormal ? '#7DB7FF' : '#FF6B6B';

  return {
    fontFamily: isFormal ? 'font-sans' : 'font-league-spartan',
    fontSize,
    fontWeight: isFormal ? 650 : 800,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: isFormal ? 1.3 : 1.15,
    textShadow: '0 2px 8px rgba(0,0,0,0.72), 0 0 2px rgba(0,0,0,0.92)',
    backgroundColor: presentation.displayMode === 'subtitle' || isFormal
      ? 'rgba(0,0,0,0.58)'
      : 'transparent',
    padding: presentation.displayMode === 'subtitle' || isFormal ? '10px 22px' : undefined,
    borderRadius: presentation.displayMode === 'subtitle' || isFormal ? '8px' : undefined,
    highlight: {
      color: accentColor,
      backgroundColor: 'transparent',
      scale: isHighEnergy ? 1.12 : 1.04,
      fontWeight: 900,
      effect: isHighEnergy ? 'pop' : 'glow',
      animation: isHighEnergy ? 'bounce' : 'none',
    },
  };
}
