import {
  getTechniqueById,
  selectTechniques,
  type TechniqueCard,
  type TechniqueResult,
} from '../data/writing-graph-query';
import type { ThinkForgeContentSignalProfile } from '../signals';

type PostCtaMode = 'none' | 'supplied_action' | 'soft' | 'hard' | 'urgent';
type PostEditorialShape =
  | 'evidence_led'
  | 'announcement'
  | 'conversion'
  | 'instructional'
  | 'personal_narrative'
  | 'general';
type PostSourceBoundary = 'source_only' | 'bounded_implication';

interface PostEditorialPlanInput {
  userPrompt: string;
  contentSignalProfile?: ThinkForgeContentSignalProfile;
  retrievedFactCount?: number;
}

export interface PostTechniqueDirective {
  id: string;
  guidance: string;
  avoid: string[];
}

/**
 * Server-owned execution choices for a social post. Creative form comes from the
 * resolved signal profile and writing graph; this contract only adds evidence and
 * publishing feasibility constraints that the model is not allowed to reinterpret.
 */
export interface PostEditorialPlan {
  editorialShape: PostEditorialShape;
  sourceBoundary: PostSourceBoundary;
  ctaMode: PostCtaMode;
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

function classifyEditorialShape(
  profile: ThinkForgeContentSignalProfile | undefined,
  hookProofMarkers: readonly string[],
): PostEditorialShape {
  if (hookProofMarkers.length > 0) return 'evidence_led';

  const goal = profile?.intent.goal.toLocaleLowerCase() ?? '';
  if (goal === 'announcement') return 'announcement';
  if (goal === 'conversion') return 'conversion';
  if (goal === 'education') return 'instructional';
  if ((profile?.profile.signals.narrative_transportation ?? 0) >= 0.6) return 'personal_narrative';
  return 'general';
}

function toDirective(
  technique: Pick<TechniqueResult | TechniqueCard, 'id' | 'primary' | 'antiPatterns'> | undefined,
): PostTechniqueDirective | undefined {
  if (!technique?.primary) return undefined;
  return {
    id: technique.id,
    guidance: technique.primary,
    avoid: technique.antiPatterns ?? [],
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

  const persuasionNeedsUnsupportedMaterial = sourceBoundary === 'source_only' || evidenceDensity === 'thin';
  const unsupported = persuasionNeedsUnsupportedMaterial
    ? new Set(['problem_agitate_solve', 'attention_interest_desire_action', 'sparkline_structure'])
    : new Set<string>();
  if (shape !== 'personal_narrative') unsupported.add('narrative_arc');

  return toDirective(selectTechniques(signals, 'structure', 5)
    .find((technique) => !unsupported.has(technique.id)));
}

function resolveCtaMode(
  profile: ThinkForgeContentSignalProfile | undefined,
  requiredDestination: string | undefined,
): PostCtaMode {
  if (requiredDestination) return 'supplied_action';
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
): Pick<PostEditorialPlan, 'targetBodyCharacters' | 'targetBodyWords'> {
  if (!explicitLengthRequested) return {};
  const target = profile?.profile.constraints.target_length;
  if (target?.unit === 'characters') return { targetBodyCharacters: target.value };
  if (target?.unit === 'words') return { targetBodyWords: target.value };
  return {};
}

function developmentSequence(
  selectedStructure: PostTechniqueDirective | undefined,
  ctaMode: PostCtaMode,
): string[] {
  return [
    ...(selectedStructure ? [selectedStructure.guidance] : []),
    'Order only source-supported claims and clearly bounded implications; do not add a generic problem, benefit, story, or outcome to fill space.',
    ...(ctaMode === 'none'
      ? ['End when the editorial thought is complete; do not append a perfunctory CTA.']
      : ['Close by executing the selected CTA directive with only a supplied action, offer, or destination.']),
  ];
}

export function buildPostEditorialPlan(input: PostEditorialPlanInput): PostEditorialPlan {
  const profile = input.contentSignalProfile;
  const hookProofMarkers = quantitativeProofMarkers(profile);
  const requiredClaim = requiredProfileValue(profile, 'Required brief claim', hookProofMarkers);
  const requiredAudience = requiredProfileValue(profile, 'Required audience anchor');
  const requiredDestination = suppliedActionDestination(input.userPrompt);
  const explicitLengthRequested = EXPLICIT_LENGTH_PATTERN.test(input.userPrompt);
  // Resolver proofPoints can repeat one brief fact under multiple labels
  // (for example metric, required claim, and audience). Count the authorized
  // claim once so repeated metadata cannot masquerade as richer evidence.
  const evidenceUnitCount = requiredClaim ? 1 : 0;
  const retrievedFactCount = Math.max(0, input.retrievedFactCount ?? 0);
  const evidenceDensity = evidenceUnitCount + retrievedFactCount >= 2 ? 'supported' : 'thin';
  const sourceDetailDensity = evidenceUnitCount + retrievedFactCount >= 3 ? 'rich' : 'sparse';
  const sourceBoundary = retrievedFactCount > 0 ? 'bounded_implication' : 'source_only';
  const editorialShape = classifyEditorialShape(profile, hookProofMarkers);
  const ctaMode = resolveCtaMode(profile, requiredDestination);
  const selectedHook = selectHookDirective(profile, editorialShape, hookProofMarkers, sourceBoundary);
  const selectedStructure = selectStructureDirective(profile, editorialShape, sourceBoundary, evidenceDensity);
  const selectedCta = selectCtaDirective(ctaMode);
  const maximumBodyCharacters = readPlatformCharacterMaximum(profile);
  const lengthTargets = resolvedLengthTargets(profile, explicitLengthRequested);
  const visualProofDirection = hookProofMarkers.length > 0
    ? 'Translate supplied proof into an observable text-free contrast using only source-backed subjects, objects, actions, and environments. Keep numbers, labels, and claims in editable copy, not the raster.'
    : undefined;

  return {
    editorialShape,
    sourceBoundary,
    ctaMode,
    explicitLengthRequested,
    evidenceDensity,
    sourceDetailDensity,
    developmentSequence: developmentSequence(selectedStructure, ctaMode),
    forbiddenNarrativeExpansions: [
      'facts, causes, capabilities, outcomes, testimonials, urgency, or scarcity absent from authorized sources',
      'generalizing a measured result beyond its named sample, period, workflow, or stated scope',
      'adding a problem, benefit, story, or emotional reaction only to reach a generic length target',
    ],
    ...lengthTargets,
    ...(maximumBodyCharacters ? { maximumBodyCharacters } : {}),
    ...(requiredAudience ? { requiredAudience } : {}),
    ...(requiredClaim ? { requiredClaim } : {}),
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
