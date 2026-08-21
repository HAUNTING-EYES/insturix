import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  REFERENCE_HOLDOUT_01_SOURCE_SHA256,
  REFERENCE_HOLDOUT_01_TASK_ID_V2R,
} from './provider-native-reference-holdout-01-v2r';

export const REFERENCE_HOLDOUT_01_EVALUATOR_VERSION_V2R =
  'EDITRON_REFERENCE_HOLDOUT_01_EVALUATOR_V2R_1' as const;

export interface ReferenceHoldout01EvaluatorV2R {
  version: typeof REFERENCE_HOLDOUT_01_EVALUATOR_VERSION_V2R;
  authority: 'EVALUATOR_ONLY_NEVER_PROVIDER_VISIBLE';
  taskId: typeof REFERENCE_HOLDOUT_01_TASK_ID_V2R;
  sourceSha256: typeof REFERENCE_HOLDOUT_01_SOURCE_SHA256;
  inputArmLimits: readonly string[];
  provisionalObservationRubric: readonly Readonly<Record<string, unknown>>[];
  hardFailures: readonly string[];
  leakageSentinels: readonly string[];
  reviewProtocol: Readonly<Record<string, unknown>>;
  evaluatorSha256: string;
}

const RUBRIC: readonly Readonly<Record<string, unknown>>[] = [
  rubric('HREF01-EVAL-DARK-WARM-SYSTEM', 'GLOBAL_EDITORIAL_LANGUAGE',
    'A predominantly near-black visual system uses restrained warm cream/gold accents plus occasional semantic coral or green emphasis.',
    ['frame_000001', 'frame_000003', 'frame_000008', 'frame_000009', 'frame_000014']),
  rubric('HREF01-EVAL-TYPE-HIERARCHY', 'GLOBAL_EDITORIAL_LANGUAGE',
    'Large high-contrast sans-serif claims lead the hierarchy while small uppercase or letter-spaced labels and restrained UI copy remain secondary.',
    ['frame_000001', 'frame_000004', 'frame_000008', 'frame_000014']),
  rubric('HREF01-EVAL-PROGRESSION', 'GLOBAL_EDITORIAL_LANGUAGE',
    'The sampled progression moves from concise premise and brand reveal through system/capability demonstrations and quantitative proof into social proof and a brand promise close.',
    ['frame_000001', 'frame_000002', 'frame_000003', 'frame_000008', 'frame_000012', 'frame_000014']),
  rubric('HREF01-EVAL-UI-CARD-GRAMMAR', 'RECURRING_DESIGN_GRAMMAR',
    'Dark product UI cards and panels recur as evidence-bearing visual objects rather than full-frame footage.',
    ['frame_000003', 'frame_000005', 'frame_000006', 'frame_000007', 'frame_000009', 'frame_000011']),
  rubric('HREF01-EVAL-ACCENT-GRAMMAR', 'RECURRING_DESIGN_GRAMMAR',
    'Warm accent colour repeatedly isolates key words, numbers, controls or borders without saturating the entire frame.',
    ['frame_000003', 'frame_000004', 'frame_000005', 'frame_000008', 'frame_000010', 'frame_000014']),
  rubric('HREF01-EVAL-DENSITY-COUNTEREXAMPLE', 'RECURRING_DESIGN_GRAMMAR',
    'Sparse centered claims and denser dashboards alternate; neither density should be incorrectly reported as universal.',
    ['frame_000001', 'frame_000004', 'frame_000008', 'frame_000011', 'frame_000012']),
  rubric('HREF01-EVAL-HUB-HERO', 'BOUNDED_HERO_MOMENT',
    'One bounded construction presents a central intelligence hub with several labelled functions arranged around it.',
    ['frame_000004']),
  rubric('HREF01-EVAL-METRIC-HERO', 'BOUNDED_HERO_MOMENT',
    'A bounded proof moment combines a large numeric metric with a multitrack or multi-row timeline visualization.',
    ['frame_000008']),
  rubric('HREF01-EVAL-FORMAT-HERO', 'BOUNDED_HERO_MOMENT',
    'A bounded format-delivery moment presents a central landscape result with flanking portrait variants.',
    ['frame_000010']),
  rubric('HREF01-EVAL-CLOSE-HERO', 'BOUNDED_HERO_MOMENT',
    'The final sampled state is a sparse brand-promise close with a small call-to-action.',
    ['frame_000014']),
  rubric('HREF01-EVAL-CONTENT-LITERALS', 'CONTENT_LITERAL',
    'Brand name/logo, exact interface copy, metrics, testimonials and URL are literal identities or claims and must be separated from transferable structure.',
    ['frame_000002', 'frame_000005', 'frame_000008', 'frame_000012', 'frame_000014']),
  rubric('HREF01-EVAL-EVIDENCE-LIMITS', 'UNCERTAINTY',
    'Audio, exact easing, continuous motion, transition microtiming and unsampled intervals remain unverifiable from this sparse image-only arm.',
    ['frame_000001', 'frame_000014']),
] as const;

export function buildReferenceHoldout01EvaluatorV2R(): Readonly<ReferenceHoldout01EvaluatorV2R> {
  const material = {
    version: REFERENCE_HOLDOUT_01_EVALUATOR_VERSION_V2R,
    authority: 'EVALUATOR_ONLY_NEVER_PROVIDER_VISIBLE' as const,
    taskId: REFERENCE_HOLDOUT_01_TASK_ID_V2R,
    sourceSha256: REFERENCE_HOLDOUT_01_SOURCE_SHA256,
    inputArmLimits: [
      'NO_AUDIO_BYTES', 'NO_NATIVE_VIDEO', 'NO_EASING_PROOF',
      'NO_CONTINUOUS_MOTION_PROOF', 'NO_UNSAMPLED_INTERVAL_PROOF',
    ],
    provisionalObservationRubric: RUBRIC,
    hardFailures: [
      'INVENTS_AUDIO_OR_MUSIC_BEHAVIOUR',
      'CLAIMS_EXACT_EASING_OR_CONTINUOUS_MOTION_FROM_SPARSE_FRAMES',
      'TREATS_LITERAL_BRAND_OR_PRODUCT_CONTENT_AS_TRANSFERABLE_STYLE',
      'CHOOSES_EDITING_OPERATORS_OR_EXECUTION_FORM_DURING_OBSERVATION',
      'OMITS_EVIDENCE_BINDINGS_FOR_MATERIAL_OBSERVATIONS',
      'REPORTS_SUCCESS_WHILE_REQUIRED_MATERIAL_IS_UNVERIFIABLE',
    ],
    leakageSentinels: RUBRIC.map((entry) => String(entry.observationId)),
    reviewProtocol: {
      semanticScoring: 'TWO_INDEPENDENT_VIDEO_EDITORS_PLUS_ADJUDICATION',
      deterministicChecks: ['SCHEMA_VALID', 'EVIDENCE_IDS_EXIST', 'RANGES_ORDERED', 'NO_EVALUATOR_SENTINEL_IN_REQUEST'],
      currentHumanReviewStatus: 'NOT_PERFORMED',
      interpretation: 'DIAGNOSTIC_SINGLE_REFERENCE_ONLY_NO_MODEL_PROMOTION',
      competencePilotRequirement: 'AT_LEAST_20_RIGHTS_CLEARED_MOVING_REFERENCES_WITH_TWO_EXPERT_ANNOTATIONS',
    },
  };
  return deepFreezeV1({ ...material, evaluatorSha256: hashCanonicalJsonV1(material) });
}

export function assertReferenceHoldout01EvaluatorV2R(
  value: unknown,
): Readonly<ReferenceHoldout01EvaluatorV2R> {
  const expected = buildReferenceHoldout01EvaluatorV2R();
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(expected)) {
    throw new Error('REFERENCE_HOLDOUT_01_EVALUATOR_DRIFT');
  }
  return value as ReferenceHoldout01EvaluatorV2R;
}

function rubric(
  observationId: string,
  layer: string,
  statement: string,
  evidenceFrameIds: readonly string[],
): Readonly<Record<string, unknown>> {
  return { observationId, layer, statement, evidenceFrameIds, scoring: 'BLIND_SEMANTIC_EDITOR_JUDGMENT' };
}
