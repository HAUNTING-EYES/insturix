import {
  getTechniqueById,
  selectTechniques,
  type TechniqueCard,
  type TechniqueResult,
} from '../data/writing-graph-query';
import type { ThinkForgeContentSignalProfile } from '../signals';
import {
  ThinkForgeAuthoringRequestSchema,
  describeThinkForgePlatformSurface,
  describeThinkForgePublishingSurface,
  type ThinkForgeAuthoringRequest,
  type ThinkForgePostControls,
} from '../schemas/authoring-request';
import {
  resolveThinkForgePublishingConstraints,
  resolveThinkForgePublishingConstraintsForAuthoringRequest,
  type ThinkForgePublishingConstraints,
} from '../signals/publishing-constraints';

export type PostCtaMode = 'none' | 'supplied_action' | 'soft' | 'hard' | 'urgent';
export type PostHashtagMode = 'editorial' | 'none' | 'exact';
export type PostEmojiMode = 'editorial' | 'none' | 'restrained';
type PostEditorialShape =
  | 'evidence_led'
  | 'announcement'
  | 'conversion'
  | 'instructional'
  | 'personal_narrative'
  | 'general';
type PostSourceBoundary = 'source_only' | 'bounded_implication' | 'conceptual';

interface PostEditorialPlanInput {
  userPrompt: string;
  authoringRequest?: ThinkForgeAuthoringRequest | null;
  contentSignalProfile?: ThinkForgeContentSignalProfile;
  retrievedFactCount?: number;
}

export interface PostTechniqueDirective {
  id: string;
  guidance: string;
  avoid: string[];
  sourceLines: [number, number];
}

/**
 * Server-owned execution choices for a social post. Creative form comes from the
 * resolved signal profile and writing graph; this contract only adds evidence and
 * publishing feasibility constraints that the model is not allowed to reinterpret.
 */
export interface PostEditorialPlan {
  controlSource: 'authoring_request' | 'legacy_profile';
  platform: string;
  publishingConstraints: ThinkForgePublishingConstraints;
  editorialShape: PostEditorialShape;
  sourceBoundary: PostSourceBoundary;
  ctaMode: PostCtaMode;
  hashtagMode: PostHashtagMode;
  requiredHashtags: string[];
  emojiMode: PostEmojiMode;
  explicitLengthRequested: boolean;
  evidenceDensity: 'thin' | 'supported';
  sourceDetailDensity: 'sparse' | 'rich';
  developmentSequence: string[];
  forbiddenNarrativeExpansions: string[];
  targetBodyCharacters?: number;
  targetBodyWords?: number;
  maximumBodyCharacters?: number;
  requiredAudience?: string;
  requiredClaim?: string;
  requiredAction?: string;
  requiredDestination?: string;
  hookProofMarkers: string[];
  hookRequiresProof: boolean;
  visualProofDirection?: string;
  selectedHook?: PostTechniqueDirective;
  selectedStructure?: PostTechniqueDirective;
  selectedCta?: PostTechniqueDirective;
}

const ACTION_DESTINATION_PATTERN = /(?:(?:https?:\/\/|www\.)[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/i;
const EXPLICIT_LENGTH_PATTERN = /\b\d{2,5}\s*(?:characters?|chars?|words?)\b/i;
const PERCENTAGE_PATTERN = /\b\d+(?:\.\d+)?%/;
const MULTIPLIER_PATTERN = /\b\d+(?:\.\d+)?x\b/i;
// This is a narrow safety boundary, not a creative classifier. It identifies
// directly supplied documentary values which must remain source-bounded even
// when no retrieved fact record was available for the request.
const DOCUMENTARY_BRIEF_MARKER_PATTERN = /(?:https?:\/\/|www\.|\p{Sc}\s*\p{N}|\b(?:aed|aud|cad|chf|cny|eur|gbp|inr|jpy|rs|usd)\.?\s*\p{N}|\p{N}[\p{N},.\s]*?(?:%|％|percent(?:age)?\b|per\s+cent\b)|\p{N}{1,4}[\/.\p{Pd}]\p{N}{1,2}(?:[\/.\p{Pd}]\p{N}{1,4})?|\p{N}{1,2}:\p{N}{2}|\b\p{N}+\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b)/iu;

function requiredProfileValue(
  profile: ThinkForgeContentSignalProfile | undefined,
  label: 'Required brief claim' | 'Required audience anchor',
  preferredMarkers: readonly string[] = [],
): string | undefined {
  const values = profile?.intent.proofPoints
    .map((point) => point.match(new RegExp(`^${label}:\\s*(.+)$`, 'i'))?.[1]?.trim())
    .filter((value): value is string => Boolean(value)) ?? [];

  return values.find((value) => preferredMarkers.some((marker) => value.includes(marker)))
    ?? values[0];
}

function quantitativeProofMarkers(profile: ThinkForgeContentSignalProfile | undefined): string[] {
  const markers = profile?.intent.proofPoints.flatMap((point) => {
    const metric = point.match(/^Metric mentioned in brief:\s*(.+)$/i)?.[1]?.trim();
    if (!metric || (!PERCENTAGE_PATTERN.test(metric) && !MULTIPLIER_PATTERN.test(metric))) return [];
    return metric.match(/\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?x\b/gi) ?? [];
  }) ?? [];

  return [...new Set(markers.map((marker) => marker.toLocaleLowerCase()))];
}

function suppliedActionDestination(userPrompt: string): string | undefined {
  return userPrompt.match(ACTION_DESTINATION_PATTERN)?.[0]?.replace(/[.,;:!?]+$/, '');
}

function hasDirectDocumentaryBriefEvidence(userPrompt: string): boolean {
  return DOCUMENTARY_BRIEF_MARKER_PATTERN.test(userPrompt);
}

function resolvePostAuthoringRequest(
  requestInput: ThinkForgeAuthoringRequest | null | undefined,
): ThinkForgeAuthoringRequest | null {
  if (!requestInput) return null;
  const request = ThinkForgeAuthoringRequestSchema.parse(requestInput);
  if (!['social_post', 'carousel'].includes(request.contentContract.outputKind)) {
    throw new Error('Post editorial planning requires a post or carousel authoring request');
  }
  return request;
}

function classifyEditorialShape(
  profile: ThinkForgeContentSignalProfile | undefined,
  hookProofMarkers: readonly string[],
  ctaMode: PostCtaMode,
): PostEditorialShape {
  if (hookProofMarkers.length > 0) return 'evidence_led';
  if (ctaMode === 'hard' || ctaMode === 'urgent' || ctaMode === 'supplied_action') return 'conversion';

  const goal = profile?.intent.goal.toLocaleLowerCase() ?? '';
  if (goal === 'announcement') return 'announcement';
  if (goal === 'conversion') return 'conversion';
  if (goal === 'education') return 'instructional';
  if ((profile?.profile.signals.narrative_transportation ?? 0) >= 0.6) return 'personal_narrative';
  return 'general';
}

function toDirective(
  technique: Pick<TechniqueResult | TechniqueCard, 'id' | 'primary' | 'antiPatterns' | 'sourceLines'> | undefined,
): PostTechniqueDirective | undefined {
  if (!technique?.primary) return undefined;
  return {
    id: technique.id,
    guidance: technique.primary,
    avoid: technique.antiPatterns ?? [],
    sourceLines: technique.sourceLines,
  };
}

function selectHookDirective(
  profile: ThinkForgeContentSignalProfile | undefined,
  shape: PostEditorialShape,
  markers: readonly string[],
  sourceBoundary: PostSourceBoundary,
): PostTechniqueDirective | undefined {
  const signals = profile?.profile.signals;
  if (!signals) return undefined;

  const unsupported = new Set<string>();
  if (markers.length === 0) {
    unsupported.add('statistic_hook');
    unsupported.add('outcome_hook');
  }
  if (sourceBoundary === 'source_only' && shape !== 'personal_narrative') {
    unsupported.add('story_hook');
    unsupported.add('provocation_hook');
  }

  return toDirective(selectTechniques(signals, 'hook', 6)
    .find((technique) => !unsupported.has(technique.id)));
}

function selectStructureDirective(
  profile: ThinkForgeContentSignalProfile | undefined,
  shape: PostEditorialShape,
  sourceBoundary: PostSourceBoundary,
  evidenceDensity: PostEditorialPlan['evidenceDensity'],
): PostTechniqueDirective | undefined {
  const signals = profile?.profile.signals;
  if (!signals) return undefined;

  const persuasionNeedsUnsupportedMaterial = sourceBoundary === 'source_only'
    || (sourceBoundary !== 'conceptual' && evidenceDensity === 'thin');
  const unsupported = persuasionNeedsUnsupportedMaterial
    ? new Set(['problem_agitate_solve', 'attention_interest_desire_action', 'sparkline_structure'])
    : new Set<string>();
  if (shape !== 'personal_narrative') unsupported.add('narrative_arc');

  return toDirective(selectTechniques(signals, 'structure', 5)
    .find((technique) => !unsupported.has(technique.id)));
}

function resolveCtaMode(
  profile: ThinkForgeContentSignalProfile | undefined,
  controls: ThinkForgePostControls | undefined,
  legacyDestination: string | undefined,
): PostCtaMode {
  if (controls) {
    if (controls.cta.preference === 'none') return 'none';
    if (controls.cta.preference === 'soft') return 'soft';
    if (controls.cta.preference === 'direct') return 'hard';
    // "Editorial" keeps the brand's CTA temperament as a writing preference, but
    // does not silently turn an unselected CTA into a publishing requirement.
    return 'none';
  }
  if (legacyDestination) return 'supplied_action';
  return profile?.profile.constraints.cta_type ?? 'none';
}

function selectCtaDirective(ctaMode: PostCtaMode): PostTechniqueDirective | undefined {
  if (ctaMode === 'none') return undefined;
  const techniqueId = ctaMode === 'soft'
    ? 'soft_cta'
    : ctaMode === 'urgent'
      ? 'urgent_cta'
      : 'hard_cta';
  return toDirective(getTechniqueById(techniqueId) ?? undefined);
}

function readPlatformCharacterMaximum(
  profile: ThinkForgeContentSignalProfile | undefined,
): number | undefined {
  const constraints = profile?.profile.constraints.platform_constraints;
  const maximum = constraints?.maxCharacters ?? constraints?.standardMaxCharacters;
  return typeof maximum === 'number' && Number.isFinite(maximum) && maximum > 0
    ? maximum
    : undefined;
}

function resolvedLengthTargets(
  profile: ThinkForgeContentSignalProfile | undefined,
  explicitLengthRequested: boolean,
  controls?: ThinkForgePostControls,
): Pick<PostEditorialPlan, 'targetBodyCharacters' | 'targetBodyWords'> {
  if (!explicitLengthRequested) return {};
  const target = controls?.targetLength ?? profile?.profile.constraints.target_length;
  if (target?.unit === 'characters') return { targetBodyCharacters: target.value };
  if (target?.unit === 'words') return { targetBodyWords: target.value };
  return {};
}

function developmentSequence(
  selectedStructure: PostTechniqueDirective | undefined,
  ctaMode: PostCtaMode,
  sourceBoundary: PostSourceBoundary,
): string[] {
  return [
    ...(selectedStructure ? [selectedStructure.guidance] : []),
    sourceBoundary === 'conceptual'
      ? 'Develop one clear editorial observation or explicitly illustrative scenario. Do not present invented facts, outcomes, customer stories, or evidence as real.'
      : 'Order only source-supported claims and clearly bounded implications; do not add a generic problem, benefit, story, or outcome to fill space.',
    ...(ctaMode === 'none'
      ? ['End when the editorial thought is complete; do not append a perfunctory CTA.']
      : ['Close by executing the selected CTA directive with only a supplied action, offer, or destination.']),
  ];
}

export function buildPostEditorialPlan(input: PostEditorialPlanInput): PostEditorialPlan {
  const authoringRequest = resolvePostAuthoringRequest(input.authoringRequest);
  const controls = authoringRequest?.postControls;
  const profile = input.contentSignalProfile;
  const platform = authoringRequest
    ? authoringRequest.publishingSurface
      ? describeThinkForgePublishingSurface(authoringRequest.publishingSurface)
      : describeThinkForgePlatformSurface(authoringRequest.platformSurface)
    : profile?.intent.platform || 'unspecified';
  const publishingConstraints = authoringRequest
    ? resolveThinkForgePublishingConstraintsForAuthoringRequest(authoringRequest)
    : resolveThinkForgePublishingConstraints(platform, 'social_post');
  const hookProofMarkers = quantitativeProofMarkers(profile);
  const requiredClaim = requiredProfileValue(profile, 'Required brief claim', hookProofMarkers);
  const requiredAudience = requiredProfileValue(profile, 'Required audience anchor');
  const legacyDestination = authoringRequest ? undefined : suppliedActionDestination(input.userPrompt);
  const ctaMode = resolveCtaMode(profile, controls, legacyDestination);
  const requiredAction = ctaMode === 'none' ? undefined : controls?.cta.action;
  const requiredDestination = ctaMode === 'none'
    ? undefined
    : controls?.cta.destination ?? legacyDestination;
  const explicitLengthRequested = controls
    ? controls.targetLength !== undefined
    : EXPLICIT_LENGTH_PATTERN.test(input.userPrompt);
  // Resolver proofPoints can repeat one brief fact under multiple labels
  // (for example metric, required claim, and audience). Count the authorized
  // claim once so repeated metadata cannot masquerade as richer evidence.
  const evidenceUnitCount = requiredClaim ? 1 : 0;
  const retrievedFactCount = Math.max(0, input.retrievedFactCount ?? 0);
  const evidenceDensity = evidenceUnitCount + retrievedFactCount >= 2 ? 'supported' : 'thin';
  const sourceDetailDensity = evidenceUnitCount + retrievedFactCount >= 3 ? 'rich' : 'sparse';
  const sourceBoundary: PostSourceBoundary = retrievedFactCount > 0
    ? 'bounded_implication'
    : !authoringRequest || requiredClaim || hasDirectDocumentaryBriefEvidence(input.userPrompt)
      ? 'source_only'
      : 'conceptual';
  const editorialShape = classifyEditorialShape(profile, hookProofMarkers, ctaMode);
  const selectedHook = selectHookDirective(profile, editorialShape, hookProofMarkers, sourceBoundary);
  const selectedStructure = selectStructureDirective(profile, editorialShape, sourceBoundary, evidenceDensity);
  const selectedCta = selectCtaDirective(ctaMode);
  const policyMaximum = publishingConstraints.maxCharacters ?? publishingConstraints.standardMaxCharacters;
  const maximumBodyCharacters = authoringRequest
    ? policyMaximum
    : policyMaximum ?? readPlatformCharacterMaximum(profile);
  const lengthTargets = resolvedLengthTargets(profile, explicitLengthRequested, controls);
  const visualProofDirection = hookProofMarkers.length > 0
    ? 'Translate supplied proof into an observable text-free contrast using only source-backed subjects, objects, actions, and environments. Keep numbers, labels, and claims in editable copy, not the raster.'
    : undefined;

  return {
    controlSource: authoringRequest ? 'authoring_request' : 'legacy_profile',
    platform,
    publishingConstraints,
    editorialShape,
    sourceBoundary,
    ctaMode,
    hashtagMode: controls?.hashtags.preference ?? 'editorial',
    requiredHashtags: controls?.hashtags.preference === 'exact'
      ? [...(controls.hashtags.values ?? [])]
      : [],
    emojiMode: controls?.emoji.preference ?? 'editorial',
    explicitLengthRequested,
    evidenceDensity,
    sourceDetailDensity,
    developmentSequence: developmentSequence(selectedStructure, ctaMode, sourceBoundary),
    forbiddenNarrativeExpansions: sourceBoundary === 'conceptual'
      ? [
        'presenting an illustrative scenario, opinion, or creative framing as a documented customer fact',
        'invented metrics, dates, named people, product capabilities, testimonials, guarantees, or outcomes',
        'universal causal claims presented as evidence without an authorized source',
      ]
      : [
        'facts, causes, capabilities, outcomes, testimonials, urgency, or scarcity absent from authorized sources',
        'generalizing a measured result beyond its named sample, period, workflow, or stated scope',
        'adding a problem, benefit, story, or emotional reaction only to reach a generic length target',
      ],
    ...lengthTargets,
    ...(maximumBodyCharacters ? { maximumBodyCharacters } : {}),
    ...(requiredAudience ? { requiredAudience } : {}),
    ...(requiredClaim ? { requiredClaim } : {}),
    ...(requiredAction ? { requiredAction } : {}),
    ...(requiredDestination ? { requiredDestination } : {}),
    hookProofMarkers,
    hookRequiresProof: Boolean(
      selectedHook && ['statistic_hook', 'outcome_hook'].includes(selectedHook.id) && hookProofMarkers.length > 0,
    ),
    ...(visualProofDirection ? { visualProofDirection } : {}),
    ...(selectedHook ? { selectedHook } : {}),
    ...(selectedStructure ? { selectedStructure } : {}),
    ...(selectedCta ? { selectedCta } : {}),
  };
}
