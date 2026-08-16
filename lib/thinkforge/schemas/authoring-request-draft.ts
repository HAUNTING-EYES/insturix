import { ZodError } from 'zod';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
  inferLegacyThinkForgePublishingSurface,
  platformForThinkForgePublishingSurface,
  ThinkForgeAuthoringRequestSchema,
  type ThinkForgeAuthoringRequest,
  type ThinkForgePlatformSurfaceId,
  type ThinkForgePublishingSurfaceId,
} from './authoring-request';
import {
  createThinkForgeWriterContract,
  type ThinkForgeWriterKind,
} from './document-contract';
import { assertThinkForgePublishingRequestFeasible } from '../signals/publishing-constraints';

export type ThinkForgeAuthoringRequestDraft = {
  outputKind: ThinkForgeWriterKind | '';
  platformId: ThinkForgePlatformSurfaceId | '';
  publishingSurfaceId: ThinkForgePublishingSurfaceId | '';
  customPlatformLabel: string;
  carouselSlideCount: string;
  durationMinutes: string;
  durationSeconds: string;
  ctaPreference: 'editorial' | 'none' | 'soft' | 'direct';
  ctaAction: string;
  ctaDestination: string;
  hashtagPreference: 'editorial' | 'none' | 'exact';
  hashtags: string[];
  emojiPreference: 'editorial' | 'none' | 'restrained';
  targetLengthValue: string;
  targetLengthUnit: 'characters' | 'words';
};

export type ResolveThinkForgeAuthoringRequestDraftResult =
  | { success: true; request: ThinkForgeAuthoringRequest }
  | { success: false; error: string };

function wholeNumber(value: string, label: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a whole number.`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} is too large.`);
  }
  return parsed;
}

function validationMessage(error: unknown): string {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (!issue) return 'Invalid authoring settings.';
    const field = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${field}${issue.message}`;
  }
  return error instanceof Error ? error.message : 'Invalid authoring settings.';
}

export function createThinkForgeAuthoringRequestDraft(
  requestInput?: ThinkForgeAuthoringRequest | null,
): ThinkForgeAuthoringRequestDraft {
  const request = requestInput ? ThinkForgeAuthoringRequestSchema.parse(requestInput) : null;
  const controls = request?.postControls || createDefaultThinkForgePostControls();
  return {
    outputKind: request?.contentContract.outputKind as ThinkForgeWriterKind | undefined || '',
    platformId: request?.platformSurface.id || '',
    publishingSurfaceId: request?.publishingSurface
      ?? (request ? inferLegacyThinkForgePublishingSurface(request) : undefined)
      ?? '',
    customPlatformLabel: request?.platformSurface.customLabel || '',
    carouselSlideCount: request?.contentContract.carouselSlideCount !== undefined
      ? String(request.contentContract.carouselSlideCount)
      : '',
    durationMinutes: request?.targetDurationSec !== undefined
      ? String(Math.floor(request.targetDurationSec / 60))
      : '',
    durationSeconds: request?.targetDurationSec !== undefined
      ? String(request.targetDurationSec % 60)
      : '',
    ctaPreference: controls.cta.preference,
    ctaAction: controls.cta.action || '',
    ctaDestination: controls.cta.destination || '',
    hashtagPreference: controls.hashtags.preference,
    hashtags: controls.hashtags.values ? [...controls.hashtags.values] : [],
    emojiPreference: controls.emoji.preference,
    targetLengthValue: controls.targetLength ? String(controls.targetLength.value) : '',
    targetLengthUnit: controls.targetLength?.unit || 'words',
  };
}

export function resolveThinkForgeAuthoringRequestDraft(
  draft: ThinkForgeAuthoringRequestDraft,
): ResolveThinkForgeAuthoringRequestDraftResult {
  try {
    if (!draft.outputKind) throw new Error('Choose an output type.');
    if (!draft.publishingSurfaceId) throw new Error('Choose a publishing destination.');
    const resolvedPlatformId = platformForThinkForgePublishingSurface(draft.publishingSurfaceId);
    if (draft.platformId && draft.platformId !== resolvedPlatformId) {
      throw new Error('Publishing destination conflicts with the selected platform.');
    }
    const platformId = resolvedPlatformId;
    if (platformId === 'custom' && !draft.customPlatformLabel.trim()) {
      throw new Error('Name the destination platform.');
    }

    const carouselSlideCount = wholeNumber(draft.carouselSlideCount, 'Carousel slide count');
    if (draft.outputKind === 'carousel') {
      if (carouselSlideCount === undefined) throw new Error('Choose the carousel slide count.');
    }

    const minutes = wholeNumber(draft.durationMinutes, 'Duration minutes') || 0;
    const seconds = wholeNumber(draft.durationSeconds, 'Duration seconds') || 0;
    if (draft.outputKind === 'video_script' && seconds > 59) {
      throw new Error('Duration seconds must be between 0 and 59.');
    }
    const targetDurationSec = minutes * 60 + seconds;
    const targetLength = wholeNumber(draft.targetLengthValue, 'Target length');
    if (targetLength !== undefined && targetLength < 1) {
      throw new Error('Target length must be greater than zero.');
    }

    const hashtagValues = draft.hashtags.map((value) => value.trim()).filter(Boolean);
    const baseControls = createDefaultThinkForgePostControls();
    const request = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract(
        draft.outputKind,
        draft.outputKind === 'carousel' ? { carouselSlideCount } : undefined,
      ),
      platformSurface: platformId === 'custom'
        ? { id: 'custom', customLabel: draft.customPlatformLabel.trim() }
        : { id: platformId },
      publishingSurface: draft.publishingSurfaceId,
      ...(draft.outputKind === 'video_script' && targetDurationSec > 0 ? { targetDurationSec } : {}),
      ...(draft.outputKind !== 'video_script'
        ? {
            postControls: {
              ...baseControls,
              cta: {
                preference: draft.ctaPreference,
                ...(draft.ctaAction.trim() ? { action: draft.ctaAction.trim() } : {}),
                ...(draft.ctaDestination.trim() ? { destination: draft.ctaDestination.trim() } : {}),
              },
              hashtags: draft.hashtagPreference === 'exact'
                ? { preference: 'exact' as const, values: hashtagValues }
                : { preference: draft.hashtagPreference },
              emoji: { preference: draft.emojiPreference },
              ...(targetLength !== undefined
                ? { targetLength: { unit: draft.targetLengthUnit, value: targetLength } }
                : {}),
            },
          }
        : {}),
    });
    assertThinkForgePublishingRequestFeasible(request);
    return { success: true, request };
  } catch (error) {
    return { success: false, error: validationMessage(error) };
  }
}
