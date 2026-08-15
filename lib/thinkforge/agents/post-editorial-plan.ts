import type { ThinkForgeContentSignalProfile } from '../signals';

type PostCtaMode = 'supplied_action' | 'source_question';
type PostEditorialShape =
  | 'event_action'
  | 'evidence_led'
  | 'offer_announcement'
  | 'instructional'
  | 'personal_narrative'
  | 'general';

type PostSourceBoundary = 'source_only' | 'bounded_implication';

interface PostEditorialPlanInput {
  userPrompt: string;
  contentSignalProfile?: ThinkForgeContentSignalProfile;
  retrievedFactCount?: number;
}

/**
 * Server-owned execution choices for a social post. The writing graph supplies craft;
 * this plan prevents a selected technique from asking the model to invent an offer,
 * evidence, or a long-form argument that the brief does not support.
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
  maximumBodyCharacters?: number;
  requiredAudience?: string;
  requiredClaim?: string;
  requiredDestination?: string;
  hookProofMarkers: string[];
  hookProofAttribution?: string;
  hookRequiresProof: boolean;
  visualProofDirection?: string;
}

const ACTION_DESTINATION_PATTERN = /(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/i;
const EXPLICIT_ACTION_PATTERN = /\b(?:apply|book|buy|claim|download|join|register|reserve|shop|sign\s*up|subscribe|visit)\b(?:\s+(?:at|here|now|today|for|via)\b)?/i;
const EXPLICIT_OFFER_PATTERN = /\b(?:offer\s*:\s*|free\s+(?:audit|consultation|download|guide|sample|teardown|trial)\b)/i;
const EXPLICIT_LENGTH_PATTERN = /\b\d{2,5}\s*(?:characters?|chars?|words?)\b/i;
const PERCENTAGE_PATTERN = /\b\d+(?:\.\d+)?%/;
const MULTIPLIER_PATTERN = /\b\d+(?:\.\d+)?x\b/i;
const COUNT_PATTERN = /\b\d+\s+(?:(?:pilot|beta|customer|client|team|user|member|case|project|participant|company|organisation|organization)s?|(?:[a-z]+\s+){0,2}(?:pilot|beta|customer|client|team|user|member|case|project|participant|company|organisation|organization)s?)\b/i;
const EVENT_CONTEXT_PATTERN = /\b(?:event|workshop|webinar|cleanup|clean-up|drive|meetup|session|conference|volunteer(?:s|ing)?|attend(?:ance)?|check-?in|open\s+house|evento|taller|seminario|limpieza|jornada|voluntari(?:o|a|os|as|ado)|inscripci(?:on|\u00f3n)|plazas?|familias?)\b/i;
const SCHEDULE_PATTERN = /(?:\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|mi(?:e|\u00e9)rcoles|jueves|viernes|s(?:a|\u00e1)bado|domingo)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{1,2}\b|\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b)/i;
const QUANTITY_DETAIL_PATTERN = /(?:\b\d+(?:\.\d+)?%|\$\s*\d|\b\d+\s+[\p{L}])/iu;
const FIRST_PERSON_PATTERN = /\b(?:i|i'm|i've|my|me|we|we're|we've|our)\b/i;
const LIVED_EXPERIENCE_PATTERN = /\b(?:learned|failed|mistake|realized|realised|remember|career|journey|story|experience)\b/i;

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

function quantitativeProofMarkers(
  profile: ThinkForgeContentSignalProfile | undefined,
): string[] {
  const markers = profile?.intent.proofPoints.flatMap((point) => {
    const metric = point.match(/^Metric mentioned in brief:\s*(.+)$/i)?.[1]?.trim();
    if (!metric || (!PERCENTAGE_PATTERN.test(metric) && !MULTIPLIER_PATTERN.test(metric))) {
      return [];
    }
    return metric.match(/\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?x\b/gi) ?? [];
  }) ?? [];

  return [...new Set(markers.map((marker) => marker.toLocaleLowerCase()))];
}

function hasSuppliedAction(userPrompt: string): boolean {
  return ACTION_DESTINATION_PATTERN.test(userPrompt)
    || EXPLICIT_ACTION_PATTERN.test(userPrompt)
    || EXPLICIT_OFFER_PATTERN.test(userPrompt);
}

function suppliedActionDestination(userPrompt: string): string | undefined {
  return userPrompt.match(ACTION_DESTINATION_PATTERN)?.[0]?.replace(/[.,;:!?]+$/, '');
}

function proofAttribution(requiredClaim: string | undefined): string | undefined {
  return requiredClaim?.match(
    /^(.{2,80}?)\s+(?:cut|cuts|reduced|reduces|increased|increases|improved|improves)\b/i,
  )?.[1]?.trim();
}

function defaultLengthEnvelope(
  profile: ThinkForgeContentSignalProfile | undefined,
  editorialShape: PostEditorialShape,
  sourceBoundary: PostSourceBoundary,
  evidenceDensity: PostEditorialPlan['evidenceDensity'],
  sourceDetailDensity: PostEditorialPlan['sourceDetailDensity'],
  explicitLengthRequested: boolean,
): Pick<PostEditorialPlan, 'targetBodyCharacters' | 'maximumBodyCharacters'> {
  if (explicitLengthRequested || !profile) return {};

  const resolvedTarget = profile.profile.constraints.target_length;
  if (resolvedTarget?.unit === 'characters' && resolvedTarget.value < 600) return {};

  if (sourceBoundary === 'source_only') {
    return sourceDetailDensity === 'rich'
      ? { targetBodyCharacters: 450, maximumBodyCharacters: 700 }
      : { targetBodyCharacters: 400, maximumBodyCharacters: 650 };
  }

  if (evidenceDensity !== 'thin') return {};
  if (editorialShape === 'evidence_led') {
    return sourceDetailDensity === 'rich'
      ? { targetBodyCharacters: 1200, maximumBodyCharacters: 1500 }
      : { targetBodyCharacters: 600, maximumBodyCharacters: 1100 };
  }
  return { targetBodyCharacters: 900, maximumBodyCharacters: 1200 };
}

function classifyEditorialShape(
  userPrompt: string,
  profile: ThinkForgeContentSignalProfile | undefined,
  requiredClaim: string | undefined,
  hookProofMarkers: readonly string[],
): PostEditorialShape {
  const hasEventEvidence = EVENT_CONTEXT_PATTERN.test(userPrompt) && SCHEDULE_PATTERN.test(userPrompt);
  // Performance evidence is the editorial spine even when the same brief also promotes
  // a webinar or event. Event-first classification made long evidence posts source-only.
  if (hookProofMarkers.length > 0 || (requiredClaim && PERCENTAGE_PATTERN.test(requiredClaim))) {
    return 'evidence_led';
  }
  if (hasSuppliedAction(userPrompt) && hasEventEvidence) return 'event_action';
  if (requiredClaim && (PERCENTAGE_PATTERN.test(userPrompt) || MULTIPLIER_PATTERN.test(userPrompt))) {
    return 'evidence_led';
  }
  if (profile?.intent.goal === 'announcement' || /\b(?:launch|release|announce|introduc(?:e|ing))\b/i.test(userPrompt)) {
    return 'offer_announcement';
  }
  if (profile?.intent.goal === 'education') return 'instructional';
  if (FIRST_PERSON_PATTERN.test(userPrompt) && LIVED_EXPERIENCE_PATTERN.test(userPrompt)) {
    return 'personal_narrative';
  }
  return 'general';
}

function countSourceDetailKinds(userPrompt: string): number {
  return [
    hasSuppliedAction(userPrompt),
    EVENT_CONTEXT_PATTERN.test(userPrompt),
    SCHEDULE_PATTERN.test(userPrompt),
    QUANTITY_DETAIL_PATTERN.test(userPrompt),
  ].filter(Boolean).length;
}

function shapeContract(shape: PostEditorialShape): Pick<
  PostEditorialPlan,
  'sourceBoundary' | 'developmentSequence' | 'forbiddenNarrativeExpansions'
> {
  switch (shape) {
    case 'event_action':
      return {
        sourceBoundary: 'source_only',
        developmentSequence: [
          'Open on the named event, place, or participation opportunity.',
          'Organize only the supplied schedule, access, capacity, materials, and audience details.',
          'Close on the supplied participation route.',
        ],
        forbiddenNarrativeExpansions: [
          'unsupplied causes, conditions, or community problems',
          'invented beneficiary, wildlife, student, or impact stories',
          'urgency beyond a supplied deadline, capacity, or availability limit',
        ],
      };
    case 'evidence_led':
      return {
        sourceBoundary: 'bounded_implication',
        developmentSequence: [
          'Open on the supplied audience, workflow context, and proof; do not infer friction that the sources do not state.',
          'State the supplied evidence exactly.',
          'Use a direct source-backed product or workflow definition for context, or state an explicit scope limitation; do not infer an operational outcome.',
          'Close on the supplied action or a source-grounded question.',
        ],
        forbiddenNarrativeExpansions: [
          'unsupplied product capabilities or mechanisms',
          'causal outcomes beyond the supplied proof',
          'guarantees or generalization beyond the measured group',
        ],
      };
    case 'offer_announcement':
      return {
        sourceBoundary: 'source_only',
        developmentSequence: [
          'Name the announced offer or product and its supplied differentiator.',
          'Develop only supplied product, price, timing, and availability details.',
          'Close on the supplied launch or purchase action.',
        ],
        forbiddenNarrativeExpansions: [
          'unsupplied scarcity, luxury, or performance claims',
          'invented product features or materials',
          'invented testimonials or customer outcomes',
        ],
      };
    case 'instructional':
      return {
        sourceBoundary: 'source_only',
        developmentSequence: [
          'State the practical problem or outcome.',
          'Present only steps and explanations supported by supplied material.',
          'Close with the next supported action or check.',
        ],
        forbiddenNarrativeExpansions: [
          'unsupplied steps or tool behavior',
          'invented prerequisites or guarantees',
        ],
      };
    case 'personal_narrative':
      return {
        sourceBoundary: 'source_only',
        developmentSequence: [
          'Open on a supplied moment or consequence.',
          'Develop the supplied experience and its stated tension.',
          'Land on a lesson supported by the brief.',
        ],
        forbiddenNarrativeExpansions: [
          'invented scenes, emotions, dialogue, or chronology',
          'a broader lesson the supplied experience does not support',
        ],
      };
    default:
      return {
        sourceBoundary: 'bounded_implication',
        developmentSequence: [
          'Open on the most concrete supplied stake.',
          'Develop only supplied facts and clearly bounded implications.',
          'Close on the supplied action or a source-grounded question.',
        ],
        forbiddenNarrativeExpansions: ['claims not supported by the brief or authorized context'],
      };
  }
}

function visualProofDirection(
  shape: PostEditorialShape,
  claim: string | undefined,
): string | undefined {
  if (shape === 'event_action') {
    return 'Use only source-supplied event evidence: the named place, stated participants, supplied materials or capacity, and observable participation. Do not add environmental conditions, beneficiary stories, impact outcomes, or scale absent from the brief. Keep every number and label out of the raster.';
  }
  if (!claim) return undefined;
  if (PERCENTAGE_PATTERN.test(claim) && COUNT_PATTERN.test(claim)) {
    return 'Show the improvement through a physical before/after evidence queue: a visibly reduced stack alongside a grouped set of source folders. Keep every number and label out of the raster.';
  }
  if (PERCENTAGE_PATTERN.test(claim)) {
    return 'Show the improvement through a physical before/after workflow state, such as a visibly reduced queue or cleared review tray. Keep every number and label out of the raster.';
  }
  if (COUNT_PATTERN.test(claim)) {
    return 'Use a grouped set of concrete source objects to make the supplied count tangible, without rendering numbers or labels in the raster.';
  }
  return undefined;
}

export function buildPostEditorialPlan(input: PostEditorialPlanInput): PostEditorialPlan {
  const hookProofMarkers = quantitativeProofMarkers(input.contentSignalProfile);
  const requiredClaim = requiredProfileValue(
    input.contentSignalProfile,
    'Required brief claim',
    hookProofMarkers,
  );
  const requiredAudience = requiredProfileValue(input.contentSignalProfile, 'Required audience anchor');
  const explicitLengthRequested = EXPLICIT_LENGTH_PATTERN.test(input.userPrompt);
  const editorialShape = classifyEditorialShape(
    input.userPrompt,
    input.contentSignalProfile,
    requiredClaim,
    hookProofMarkers,
  );
  const sourceDetailDensity = countSourceDetailKinds(input.userPrompt) >= 3 ? 'rich' : 'sparse';
  const contract = shapeContract(editorialShape);
  const evidenceDensity = (requiredClaim ? 1 : 0) + (input.retrievedFactCount ?? 0) <= 1
    ? 'thin'
    : 'supported';
  const lengthEnvelope = defaultLengthEnvelope(
    input.contentSignalProfile,
    editorialShape,
    contract.sourceBoundary,
    evidenceDensity,
    sourceDetailDensity,
    explicitLengthRequested,
  );
  const requiredDestination = suppliedActionDestination(input.userPrompt);
  const hookProofAttribution = proofAttribution(requiredClaim);
  const direction = visualProofDirection(editorialShape, requiredClaim);

  return {
    editorialShape,
    ...contract,
    ctaMode: hasSuppliedAction(input.userPrompt) ? 'supplied_action' : 'source_question',
    explicitLengthRequested,
    evidenceDensity,
    sourceDetailDensity,
    ...lengthEnvelope,
    ...(requiredAudience ? { requiredAudience } : {}),
    ...(requiredClaim ? { requiredClaim } : {}),
    ...(requiredDestination ? { requiredDestination } : {}),
    hookProofMarkers,
    ...(hookProofAttribution ? { hookProofAttribution } : {}),
    hookRequiresProof: editorialShape === 'evidence_led' && hookProofMarkers.length > 0,
    ...(direction ? { visualProofDirection: direction } : {}),
  };
}
