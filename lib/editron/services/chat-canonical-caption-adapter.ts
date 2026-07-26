import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

import {
  CANONICAL_CAPTION_TRACK_SOURCE,
  installCanonicalCaptionTrack,
  type InstallCanonicalCaptionTrackResult,
} from './canonical-caption-track';
import {
  resolveAtomicCaptionPresentation,
  type AtomicCaptionPresentation,
} from './caption-form';
import { buildEditedTimelineContext } from './edited-timeline-context';

type JsonRecord = Record<string, any>;

export interface ChatCanonicalCaptionPreferences {
  requestedStyle?: string;
  displayMode?: string;
  wordsPerGroup?: number;
  overwrite?: boolean;
}

export type ChatCanonicalCaptionPlan =
  | {
      status: 'generated';
      overlays: Overlay[];
      captionOverlay: Overlay & JsonRecord;
      presentation: AtomicCaptionPresentation;
      result: InstallCanonicalCaptionTrackResult;
    }
  | {
      status: 'no-op' | 'declined' | 'needs-choice';
      reason:
        | 'canonical-track-already-present'
        | 'manual-caption-track-present'
        | 'canonical-transcript-unavailable'
        | 'unsafe-source-mapping'
        | 'canonical-track-not-created';
      message: string;
    };

export function planChatCanonicalCaptionTrack(
  project: JsonRecord,
  preferences: ChatCanonicalCaptionPreferences,
): ChatCanonicalCaptionPlan {
  const overlays = Array.isArray(project.overlays) ? [...project.overlays] : [];
  const captionOverlays = overlays.filter((overlay) => overlay?.type === 'caption');
  const manualCaptions = captionOverlays.filter(isManualCaption);
  if (manualCaptions.length > 0) {
    return {
      status: 'needs-choice',
      reason: 'manual-caption-track-present',
      message:
        'This project contains manually edited captions. Confirm replacement or edit that track in place; automatic caption creation will not overwrite it.',
    };
  }

  const generatedCaptions = captionOverlays.filter(isGeneratedCaption);
  if (generatedCaptions.length > 0 && !preferences.overwrite) {
    return {
      status: 'no-op',
      reason: 'canonical-track-already-present',
      message: 'A generated caption track already exists. Use overwrite to regenerate it.',
    };
  }

  const rawFootage = asRecord(project.rawFootageAnalysis);
  if (!hasCaptionWords(rawFootage)) {
    return {
      status: 'declined',
      reason: 'canonical-transcript-unavailable',
      message:
        'No canonical word-timed transcript is available for the edited timeline. Complete transcription/analysis before adding captions.',
    };
  }

  const editedTimelineContext = buildEditedTimelineContext({
    rawFootage: rawFootage as any,
    overlays,
    fps: finitePositive(project.fps) ?? 30,
    projectDurationFrames: finitePositive(project.durationInFrames) ?? undefined,
  });
  if (
    editedTimelineContext.evidence.requiresSourceMapping
    && !editedTimelineContext.evidence.isCanonicalDecisionTimeline
  ) {
    return {
      status: 'declined',
      reason: 'unsafe-source-mapping',
      message:
        'The edited clips do not have complete source-frame mapping, so caption timing cannot be projected safely onto the cut timeline.',
    };
  }

  const presentation = resolveAtomicCaptionPresentation({
    requestedStyle: preferences.requestedStyle,
    displayMode: preferences.displayMode,
    wordsPerGroup: preferences.wordsPerGroup,
    genreParams: asRecord(
      project.genreParametersSignalComputed ?? project.genreParameters,
    ),
  });
  const result = installCanonicalCaptionTrack({
    overlays,
    editedTimelineContext,
    segmentAnalysis: project.segmentAnalysis ?? null,
    playerDimensions: playerDimensions(project),
    presentation,
  });
  const captionOverlay = overlays.find(
    (overlay) =>
      overlay?.type === 'caption'
      && overlay?.metadata?.source === CANONICAL_CAPTION_TRACK_SOURCE,
  );
  if (!captionOverlay || result.created !== 1) {
    return {
      status: 'declined',
      reason: 'canonical-track-not-created',
      message: `The canonical caption planner did not create a track (${result.skippedReason ?? 'unknown reason'}).`,
    };
  }

  return {
    status: 'generated',
    overlays: overlays as Overlay[],
    captionOverlay: captionOverlay as Overlay & JsonRecord,
    presentation,
    result,
  };
}

function isGeneratedCaption(overlay: JsonRecord): boolean {
  return overlay?.metadata?.source === CANONICAL_CAPTION_TRACK_SOURCE
    || overlay?._workerAdded === true
    || overlay?.sourceVideoId != null;
}

function isManualCaption(overlay: JsonRecord): boolean {
  return overlay?.type === 'caption' && !isGeneratedCaption(overlay);
}

function hasCaptionWords(rawFootage: JsonRecord): boolean {
  if (Array.isArray(rawFootage.transcription?.words)) {
    return rawFootage.transcription.words.some((word: unknown) => {
      const record = asRecord(word);
      return String(record.word ?? record.text ?? '').trim().length > 0
        && Number.isFinite(Number(record.startMs ?? record.start))
        && Number.isFinite(Number(record.endMs ?? record.end));
    });
  }
  return Array.isArray(rawFootage.segments)
    && rawFootage.segments.some((segment: unknown) => {
      const words = asRecord(segment).words;
      return Array.isArray(words) && words.length > 0;
    });
}

function playerDimensions(project: JsonRecord): { width: number; height: number } {
  const dimensions = asRecord(project.playerDimensions);
  return {
    width: finitePositive(dimensions.width) ?? 1920,
    height: finitePositive(dimensions.height) ?? 1080,
  };
}

function finitePositive(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}
