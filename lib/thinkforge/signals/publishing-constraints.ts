import type { OutputFormat } from '@/lib/shared/signals';
import twitterText from 'twitter-text';
import {
  ThinkForgeAuthoringRequestSchema,
  describeThinkForgePlatformSurface,
  type ThinkForgeAuthoringRequest,
  type ThinkForgePublishingSurfaceId,
} from '@/lib/thinkforge/schemas/authoring-request';
import {
  resolveThinkForgeCarouselCapabilities,
  type ThinkForgeCarouselCapabilities,
} from '@/lib/thinkforge/schemas/carousel-capabilities';

export const THINKFORGE_PUBLISHING_CONSTRAINTS_VERSION = 2;
export const THINKFORGE_PUBLISHING_POLICY_VERIFIED_AT = '2026-08-16';
export const THINKFORGE_PUBLISHING_REQUEST_ERROR_CODE = 'PUBLISHING_REQUEST_INCOMPATIBLE';
export const THINKFORGE_POST_TARGET_ERROR_CODE = 'POST_TARGET_NOT_PUBLISHABLE';

export class ThinkForgePublishingRequestError extends Error {
  readonly code = THINKFORGE_PUBLISHING_REQUEST_ERROR_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'ThinkForgePublishingRequestError';
  }
}

export class ThinkForgePostTargetError extends Error {
  readonly code = THINKFORGE_POST_TARGET_ERROR_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'ThinkForgePostTargetError';
  }
}

interface ThinkForgePostTargetFeasibilityInput {
  targetCharacters?: number;
  targetWords?: number;
  exactHashtags?: readonly string[];
  tolerance?: number;
}

export type ThinkForgePublishingSurface = ThinkForgePublishingSurfaceId | 'unknown';

export interface ThinkForgePublishingConstraints extends Record<string, unknown> {
  platform: string;
  surface: ThinkForgePublishingSurface;
  policyVersion: number;
  verifiedAt: string;
  sourceId?: 'linkedin_ugc_api' | 'linkedin_document_help' | 'x_counting_characters' | 'youtube_help';
  characterCounting?: 'utf16_code_units_conservative' | 'x_weighted';
  maxCharacters?: number;
  standardMaxCharacters?: number;
  extendedPostsRequireCapability?: boolean;
  maxDurationSeconds?: number;
  carousel?: ThinkForgeCarouselCapabilities;
}

export interface ThinkForgePublishableTextMeasurement {
  normalizedText: string;
  characterCount: number;
  maximumCharacters?: number;
  valid: boolean;
}

function normalizePlatformLabel(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveTypedPublishingSurface(
  request: ThinkForgeAuthoringRequest,
): ThinkForgePublishingSurface {
  if (request.publishingSurface) return request.publishingSurface;
  const isVideoScript = request.contentContract.outputKind === 'video_script';
  const isCarousel = request.contentContract.outputKind === 'carousel';
  switch (request.platformSurface.id) {
    case 'linkedin':
      return isCarousel ? 'linkedin_document_carousel' : 'linkedin_post';
    case 'x':
      return 'x_post';
    case 'instagram':
      return isVideoScript ? 'instagram_reels' : isCarousel ? 'instagram_carousel' : 'instagram_feed';
    case 'youtube':
      return request.contentContract.outputKind === 'social_post' ? 'youtube_community_post' : 'unknown';
    case 'tiktok':
      return 'tiktok_video';
    case 'facebook':
      return isVideoScript ? 'facebook_reels' : isCarousel ? 'facebook_carousel' : 'facebook_post';
    default:
      return 'unknown';
  }
}

function constraintsForSurface(
  platform: string,
  surface: ThinkForgePublishingSurface,
  outputFormat: OutputFormat,
): ThinkForgePublishingConstraints {
  const base: ThinkForgePublishingConstraints = {
    platform,
    surface,
    policyVersion: THINKFORGE_PUBLISHING_CONSTRAINTS_VERSION,
    verifiedAt: THINKFORGE_PUBLISHING_POLICY_VERIFIED_AT,
  };

  if (outputFormat === 'social_post' && (
    surface === 'instagram_carousel'
    || surface === 'linkedin_document_carousel'
    || surface === 'facebook_carousel'
    || surface === 'generic_carousel'
    || surface === 'custom'
  )) {
    return {
      ...base,
      carousel: resolveThinkForgeCarouselCapabilities(surface),
      ...(surface === 'linkedin_document_carousel'
        ? {
            sourceId: 'linkedin_document_help' as const,
            characterCounting: 'utf16_code_units_conservative' as const,
            maxCharacters: 3_000,
          }
        : {}),
    };
  }

  if (outputFormat === 'social_post' && surface === 'linkedin_post') {
    return {
      ...base,
      sourceId: 'linkedin_ugc_api',
      characterCounting: 'utf16_code_units_conservative',
      maxCharacters: 3_000,
    };
  }

  if (outputFormat === 'social_post' && surface === 'x_post') {
    return {
      ...base,
      sourceId: 'x_counting_characters',
      characterCounting: 'x_weighted',
      standardMaxCharacters: 280,
      extendedPostsRequireCapability: true,
    };
  }

  if (outputFormat === 'video_script' && surface === 'youtube_shorts') {
    return { ...base, sourceId: 'youtube_help', maxDurationSeconds: 180 };
  }

  return base;
}

export function resolveThinkForgePublishingSurface(platform: string): ThinkForgePublishingSurface {
  const normalized = normalizePlatformLabel(platform);
  if (/\byoutube\b/.test(normalized) && /\bshorts?\b/.test(normalized)) return 'youtube_shorts';
  if (/\byoutube\b/.test(normalized)) return 'youtube_video';
  if (/\binstagram\b/.test(normalized) && /\breels?\b/.test(normalized)) return 'instagram_reels';
  if (/\binstagram\b/.test(normalized)) return 'instagram_feed';
  if (/\btiktok\b/.test(normalized)) return 'tiktok_video';
  if (/\blinkedin\b/.test(normalized)) return 'linkedin_post';
  if (normalized === 'x' || normalized === 'twitter' || normalized === 'x post' || normalized === 'twitter post') {
    return 'x_post';
  }
  if (/\bfacebook\b/.test(normalized)) return 'facebook_post';
  return 'unknown';
}

/**
 * Publishing policy only. ProductionBrief remains the owner of aspect ratio,
 * visual shape, and editable duration defaults.
 */
export function resolveThinkForgePublishingConstraints(
  platform: string,
  outputFormat: OutputFormat,
): ThinkForgePublishingConstraints {
  const surface = resolveThinkForgePublishingSurface(platform);
  return constraintsForSurface(platform, surface, outputFormat);
}

export function resolveThinkForgePublishingConstraintsForAuthoringRequest(
  requestInput: ThinkForgeAuthoringRequest,
): ThinkForgePublishingConstraints {
  const request = ThinkForgeAuthoringRequestSchema.parse(requestInput);
  const outputFormat: OutputFormat = request.contentContract.outputKind === 'video_script'
    ? 'video_script'
    : 'social_post';
  return constraintsForSurface(
    describeThinkForgePlatformSurface(request.platformSurface),
    resolveTypedPublishingSurface(request),
    outputFormat,
  );
}

export function assertThinkForgePublishingRequestFeasible(
  requestInput: ThinkForgeAuthoringRequest,
): void {
  const request = ThinkForgeAuthoringRequestSchema.parse(requestInput);
  const constraints = resolveThinkForgePublishingConstraintsForAuthoringRequest(request);
  if (request.contentContract.outputKind === 'carousel') {
    const slideCount = request.contentContract.carouselSlideCount;
    if (slideCount === undefined) {
      throw new ThinkForgePublishingRequestError('Carousel authoring requires an explicit slide count');
    }
    const carousel = constraints.carousel ?? resolveThinkForgeCarouselCapabilities(undefined);
    if (
      carousel.destinationMaximumSlides !== undefined
      && slideCount > carousel.destinationMaximumSlides
    ) {
      throw new ThinkForgePublishingRequestError(
        `${constraints.surface} supports at most ${carousel.destinationMaximumSlides} slides; requested ${slideCount}`,
      );
    }
    if (slideCount > carousel.authoringBatchMaximumSlides) {
      const destinationContext = carousel.destinationMaximumSlides !== undefined
        ? ` The destination permits up to ${carousel.destinationMaximumSlides}.`
        : '';
      throw new ThinkForgePublishingRequestError(
        `ThinkForge one-pass carousel authoring supports at most ${carousel.authoringBatchMaximumSlides} slides; `
        + `requested ${slideCount}.${destinationContext} Reduce the count before generation.`,
      );
    }
  }
  if (
    request.targetDurationSec !== undefined
    && constraints.maxDurationSeconds !== undefined
    && request.targetDurationSec > constraints.maxDurationSeconds
  ) {
    throw new ThinkForgePublishingRequestError(
      `${constraints.surface} supports at most ${constraints.maxDurationSeconds} seconds; `
      + `requested ${request.targetDurationSec} seconds`,
    );
  }

  if (!request.postControls) return;
  const target = request.postControls.targetLength;
  assertThinkForgePostTargetFeasible({
    ...(target?.unit === 'characters' ? { targetCharacters: target.value } : {}),
    ...(target?.unit === 'words' ? { targetWords: target.value } : {}),
    ...(request.postControls.hashtags.preference === 'exact'
      ? { exactHashtags: request.postControls.hashtags.values ?? [] }
      : {}),
  }, constraints);
}

export function assertThinkForgePostTargetFeasible(
  input: ThinkForgePostTargetFeasibilityInput,
  constraints: ThinkForgePublishingConstraints,
  platformLabel = constraints.platform,
): void {
  const publishingMaximum = constraints.maxCharacters ?? constraints.standardMaxCharacters;
  if (publishingMaximum === undefined) return;

  if (input.targetCharacters !== undefined && input.targetCharacters > publishingMaximum) {
    throw new ThinkForgePostTargetError(
      `Post length target exceeds publishing maximum: ${input.targetCharacters}/${publishingMaximum} characters`,
    );
  }

  const exactHashtags = input.exactHashtags ?? [];
  const hashtagSuffix = exactHashtags.length > 0 ? `\n\n${exactHashtags.join(' ')}` : '';
  const hashtagCharacters = hashtagSuffix
    ? measureThinkForgePublishableText(hashtagSuffix, constraints).characterCount
    : 0;
  if (1 + hashtagCharacters > publishingMaximum) {
    throw new ThinkForgePostTargetError(
      `Exact hashtag plan exceeds the ${platformLabel} publishing limit: `
      + `${1 + hashtagCharacters}/${publishingMaximum} characters`,
    );
  }

  const tolerance = input.tolerance ?? 0.1;
  const minimumBodyCharacters = input.targetCharacters !== undefined
    ? Math.floor(input.targetCharacters * (1 - tolerance))
    : input.targetWords !== undefined
      ? Math.floor(input.targetWords * (1 - tolerance))
      : 1;
  const minimumPublishableCharacters = minimumBodyCharacters + hashtagCharacters;
  if (minimumPublishableCharacters <= publishingMaximum) return;

  const targetKind = input.targetWords !== undefined ? 'word' : 'character';
  const hashtagQualifier = hashtagCharacters > 0 ? ' plus exact hashtags' : '';
  throw new ThinkForgePostTargetError(
    `Post ${targetKind} target${hashtagQualifier} cannot fit the publishing maximum: at least `
    + `${minimumPublishableCharacters}/${publishingMaximum} characters are required`,
  );
}

/**
 * Measures the final publishable text using the counting policy attached to the
 * resolved publishing surface. X normalizes to NFC and uses twitter-text so
 * URLs, emoji, CJK, and invalid code points follow X's production semantics.
 */
export function measureThinkForgePublishableText(
  text: string,
  constraints: ThinkForgePublishingConstraints,
): ThinkForgePublishableTextMeasurement {
  const maximumCharacters = constraints.maxCharacters ?? constraints.standardMaxCharacters;

  if (constraints.characterCounting === 'x_weighted') {
    const normalizedText = text.normalize('NFC');
    const parsed = twitterText.parseTweet(normalizedText);
    return {
      normalizedText,
      characterCount: parsed.weightedLength,
      maximumCharacters,
      valid: parsed.valid && (
        maximumCharacters === undefined || parsed.weightedLength <= maximumCharacters
      ),
    };
  }

  if (constraints.characterCounting === 'utf16_code_units_conservative') {
    return {
      normalizedText: text,
      characterCount: text.length,
      maximumCharacters,
      valid: maximumCharacters === undefined || text.length <= maximumCharacters,
    };
  }

  return {
    normalizedText: text,
    characterCount: Array.from(text).length,
    maximumCharacters,
    valid: maximumCharacters === undefined || Array.from(text).length <= maximumCharacters,
  };
}
