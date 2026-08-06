import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

import {
  CANONICAL_CAPTION_TRACK_SOURCE,
  installCanonicalCaptionTrack,
  restyleCanonicalCaptionTracks,
  type CanonicalCaptionStyleIntent,
  type InstallCanonicalCaptionTrackResult,
  type RestyleCanonicalCaptionTracksResult,
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
  fontSize?: string;
  color?: string;
  backgroundColor?: string;
  position?: CanonicalCaptionStyleIntent['position'];
  fontFamily?: string;
  fontWeight?: number | string;
  textCase?: CanonicalCaptionStyleIntent['textCase'];
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

export type ChatCanonicalCaptionRestylePlan =
  | {
      status: 'updated';
      overlays: Overlay[];
      captionOverlays: Array<Overlay & JsonRecord>;
      presentation: AtomicCaptionPresentation;
      result: RestyleCanonicalCaptionTracksResult;
    }
  | {
      status: 'no-op';
      reason: 'caption-track-not-found';
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

  const existingCaption = generatedCaptions[0];
  const presentation = resolveChatCaptionPresentation(project, preferences, existingCaption);
  const styleIntent = resolveChatCaptionStyleIntent(preferences, existingCaption);
  const result = installCanonicalCaptionTrack({
    overlays,
    editedTimelineContext,
    segmentAnalysis: project.segmentAnalysis ?? null,
    playerDimensions: playerDimensions(project),
    presentation,
    styleIntent,
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

export function planChatCanonicalCaptionRestyle(
  project: JsonRecord,
  preferences: ChatCanonicalCaptionPreferences,
): ChatCanonicalCaptionRestylePlan {
  const overlays = Array.isArray(project.overlays) ? [...project.overlays] : [];
  const captionOverlays = overlays.filter((overlay) => overlay?.type === 'caption');
  if (captionOverlays.length === 0) {
    return {
      status: 'no-op',
      reason: 'caption-track-not-found',
      message: 'No caption track exists in this project.',
    };
  }

  const rawFootage = asRecord(project.rawFootageAnalysis);
  const editedTimelineContext = buildEditedTimelineContext({
    rawFootage: rawFootage as any,
    overlays,
    fps: finitePositive(project.fps) ?? 30,
    projectDurationFrames: finitePositive(project.durationInFrames) ?? undefined,
  });
  const existingCaption = captionOverlays[0];
  const presentation = resolveChatCaptionPresentation(project, preferences, existingCaption);
  const styleIntent = resolveChatCaptionStyleIntent(preferences, existingCaption);
  const result = restyleCanonicalCaptionTracks({
    overlays,
    editedTimelineContext,
    segmentAnalysis: project.segmentAnalysis ?? null,
    playerDimensions: playerDimensions(project),
    presentation,
    styleIntent,
  });

  return {
    status: 'updated',
    overlays: overlays as Overlay[],
    captionOverlays: overlays.filter(
      (overlay): overlay is Overlay & JsonRecord => overlay?.type === 'caption',
    ),
    presentation,
    result,
  };
}

function resolveChatCaptionPresentation(
  project: JsonRecord,
  preferences: ChatCanonicalCaptionPreferences,
  existingCaption?: JsonRecord,
): AtomicCaptionPresentation {
  const storedPresentation = asRecord(existingCaption?.metadata?.captionPresentation);
  const requestedStyle = preferences.requestedStyle
    ?? nonEmptyString(storedPresentation.style)
    ?? nonEmptyString(existingCaption?.template);
  return resolveAtomicCaptionPresentation({
    requestedStyle,
    requestedStyleAuthority: requestedStyle ? 'user' : 'hint',
    displayMode: preferences.displayMode
      ?? nonEmptyString(storedPresentation.displayMode)
      ?? nonEmptyString(existingCaption?.displayConfig?.mode),
    wordsPerGroup: preferences.wordsPerGroup
      ?? finitePositive(storedPresentation.wordsPerGroup)
      ?? finitePositive(existingCaption?.displayConfig?.wordsPerGroup)
      ?? undefined,
    genreParams: asRecord(
      project.genreParametersSignalComputed ?? project.genreParameters,
    ),
  });
}

function resolveChatCaptionStyleIntent(
  preferences: ChatCanonicalCaptionPreferences,
  existingCaption?: JsonRecord,
): CanonicalCaptionStyleIntent {
  const storedIntent = asRecord(existingCaption?.metadata?.captionStyleIntent?.requested);
  return definedEntries({
    fontSize: preferences.fontSize ?? nonEmptyString(storedIntent.fontSize),
    color: preferences.color ?? nonEmptyString(storedIntent.color),
    backgroundColor: preferences.backgroundColor ?? nonEmptyString(storedIntent.backgroundColor),
    position: preferences.position ?? captionPosition(storedIntent.position),
    fontFamily: preferences.fontFamily ?? nonEmptyString(storedIntent.fontFamily),
    fontWeight: preferences.fontWeight ?? storedIntent.fontWeight,
    textCase: preferences.textCase ?? captionTextCase(storedIntent.textCase),
  }) as CanonicalCaptionStyleIntent;
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

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function captionPosition(value: unknown): CanonicalCaptionStyleIntent['position'] | undefined {
  return value === 'top' || value === 'center' || value === 'bottom' ? value : undefined;
}

function captionTextCase(value: unknown): CanonicalCaptionStyleIntent['textCase'] | undefined {
  return value === 'sentence'
    || value === 'uppercase'
    || value === 'lowercase'
    || value === 'capitalize'
    ? value
    : undefined;
}

function definedEntries(value: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}
