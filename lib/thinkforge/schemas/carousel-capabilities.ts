export const THINKFORGE_CAROUSEL_CAPABILITIES_VERSION = 1;
export const THINKFORGE_CAROUSEL_POLICY_VERIFIED_AT = '2026-08-16';
export const THINKFORGE_CAROUSEL_MIN_SLIDES = 2;

/**
 * Current capacity of the one-pass ThinkForge carousel authoring contract.
 * This is an implementation capability, not a claim about any destination.
 * Ten covers Instagram's verified limit and the writing guide's 6-10 slide
 * LinkedIn editorial range. Raising it requires writer-quality evidence.
 */
export const THINKFORGE_CAROUSEL_AUTHORING_BATCH_MAX_SLIDES = 10;

/**
 * Wire/storage guard only. Permission comes from the selected destination and
 * execution capability, not from this broad schema envelope.
 */
export const THINKFORGE_CAROUSEL_SCHEMA_MAX_SLIDES = 300;

export type ThinkForgeCarouselPublishingSurface =
  | 'instagram_carousel'
  | 'linkedin_document_carousel'
  | 'facebook_carousel'
  | 'generic_carousel'
  | 'custom';

export interface ThinkForgeCarouselDestinationPolicy {
  maximumSlides: number;
  verifiedAt: string;
  sourceUrl: string;
}

export interface ThinkForgeCarouselCapabilities {
  version: number;
  minimumSlides: number;
  authoringBatchMaximumSlides: number;
  destinationMaximumSlides?: number;
  effectiveAuthoringMaximumSlides: number;
  destinationPolicy?: ThinkForgeCarouselDestinationPolicy;
}

const DESTINATION_POLICIES: Partial<Record<
  ThinkForgeCarouselPublishingSurface,
  ThinkForgeCarouselDestinationPolicy
>> = {
  instagram_carousel: {
    maximumSlides: 10,
    verifiedAt: THINKFORGE_CAROUSEL_POLICY_VERIFIED_AT,
    sourceUrl: 'https://www.facebook.com/help/instagram/269314186824048?locale=en_GB',
  },
  linkedin_document_carousel: {
    maximumSlides: 300,
    verifiedAt: THINKFORGE_CAROUSEL_POLICY_VERIFIED_AT,
    sourceUrl: 'https://www.linkedin.com/help/linkedin/answer/a523054/document-uploads-on-linkedin-faq?lang=en',
  },
};

export function resolveThinkForgeCarouselCapabilities(
  surface: string | undefined,
): ThinkForgeCarouselCapabilities {
  const destinationPolicy = surface
    ? DESTINATION_POLICIES[surface as ThinkForgeCarouselPublishingSurface]
    : undefined;
  const destinationMaximumSlides = destinationPolicy?.maximumSlides;
  return {
    version: THINKFORGE_CAROUSEL_CAPABILITIES_VERSION,
    minimumSlides: THINKFORGE_CAROUSEL_MIN_SLIDES,
    authoringBatchMaximumSlides: THINKFORGE_CAROUSEL_AUTHORING_BATCH_MAX_SLIDES,
    ...(destinationMaximumSlides !== undefined ? { destinationMaximumSlides } : {}),
    effectiveAuthoringMaximumSlides: destinationMaximumSlides === undefined
      ? THINKFORGE_CAROUSEL_AUTHORING_BATCH_MAX_SLIDES
      : Math.min(THINKFORGE_CAROUSEL_AUTHORING_BATCH_MAX_SLIDES, destinationMaximumSlides),
    ...(destinationPolicy ? { destinationPolicy } : {}),
  };
}
