import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R,
  PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R,
  type ProviderNativeVideoReferenceManifestV2R,
} from './provider-native-video-reference-input-v2r';
import {
  buildReferenceNativeObserverProviderSemanticContractV2R,
} from './provider-native-reference-semantics-v2r';

export const REFERENCE_HOLDOUT_01_VERSION_V2R =
  'EDITRON_REFERENCE_HOLDOUT_01_V2R_1' as const;
export const REFERENCE_HOLDOUT_01_TASK_ID_V2R = 'HREF-01' as const;
export const REFERENCE_HOLDOUT_01_SOURCE_SHA256 =
  'd95dd77fccaa5e6eb4f1c0e42b399b95a801937c49ef072160d10b2a4208e73f' as const;
export const REFERENCE_HOLDOUT_01_SOURCE_RELATIVE_PATH =
  'public/product_demos/showcase/insturix-final-intro.mp4' as const;
export const REFERENCE_HOLDOUT_01_EXPECTED_INPUT_SHA256 =
  '06f248c676427078a6bfcbcb97e328914bc6a27fc15d0783f28974c6058a9cbe' as const;
export const REFERENCE_HOLDOUT_01_SOURCE_BYTE_LENGTH = 15_006_528 as const;
export const REFERENCE_HOLDOUT_01_SOURCE_DURATION_US = '64750000' as const;
export const REFERENCE_HOLDOUT_01_NATIVE_VERSION_V2R =
  'EDITRON_REFERENCE_HOLDOUT_01_NATIVE_V2R_1' as const;
export const REFERENCE_HOLDOUT_01_NATIVE_TASK_ID_V2R = 'HREF-01-NATIVE' as const;
export const REFERENCE_HOLDOUT_01_NATIVE_INPUT_ARM_V2R =
  'NATIVE_VIDEO_WITH_EMBEDDED_AUDIO' as const;

type JsonRecord = Record<string, unknown>;

export interface ReferenceHoldoutSampleV2R {
  frameId: string;
  timestampUs: string;
  bytesSha256: string;
  byteLength: number;
}

const SAMPLES: readonly Readonly<ReferenceHoldoutSampleV2R>[] = [
  sample(1, '500000', '4b16dc72619db9267ce772ecdaadadf4af444d98cb6c97f2feafa5df087367af', 10285),
  sample(2, '5000000', 'e456765ec91e30fa8f51284f8a6c5192150d02c2b61663ea63d145ef73f941e6', 11450),
  sample(3, '10000000', 'ec0b81380e7dc34a3015f8bd5b9f49cc5e3e82019949612ea36b950f54158bd2', 28026),
  sample(4, '15000000', '820f78940c49b2aede64b990ea564540c02d4f32b1a217a2640fae701509fd60', 18958),
  sample(5, '20000000', '3775551c7fdbd3e8a3c070d26a40884ff59766b362d6d88b604afe5e49c406ee', 24918),
  sample(6, '25000000', '1eaef2a14c2a1b4223cdd18c04c64fd9895e4f237d4ca0aba2f4e40c2eca98b5', 28413),
  sample(7, '30000000', '8b135266bb7fd15af0065f3dc82c8af24081a2576b77a90a88c952c32f56c1ad', 36485),
  sample(8, '35000000', '6f62f6dc36842605b61b9f5cf2d6ca0340665373f6459374736790c9d22b0779', 27359),
  sample(9, '40000000', '02b9ec52b26acb44ece133e11b9ce1c35109442d644c99d6f01d402fa27cd3bd', 23770),
  sample(10, '45000000', 'bc026f272404b53505ba4697762a3be7a58441eef58cdfbf7e7395d7ea54eda0', 19571),
  sample(11, '50000000', '768906002da725b064200c62a6bfcb860c477cc707b671c648c922d0c4172fe5', 28775),
  sample(12, '55000000', 'e65ae380cfdcddf0a4e02b47625ef1af229055a63af8f885c21e1790e1ce8522', 29645),
  sample(13, '60000000', 'a5cc50c56fcf45e89cf9d0c437ec8eb39cc179b4baabf93518d0aa20504b6195', 20313),
  sample(14, '64250000', '2e836b5e16c7021c3f9e537301d9878c9f706603a0d922f39c4f0e9402133c27', 24392),
] as const;

export interface ReferenceHoldoutManifestV2R {
  version: typeof REFERENCE_HOLDOUT_01_VERSION_V2R;
  authority: 'RESEARCH_ONLY_HELDOUT_REFERENCE_NO_PROJECT_MUTATION';
  taskId: typeof REFERENCE_HOLDOUT_01_TASK_ID_V2R;
  heldoutBasis: Readonly<JsonRecord>;
  sourceMaterialization: Readonly<JsonRecord> & {
    samples: readonly Readonly<ReferenceHoldoutSampleV2R>[];
  };
  rightsAndEgress: Readonly<JsonRecord>;
  providerVisibleTask: Readonly<JsonRecord>;
  manifestSha256: string;
}

export interface ReferenceHoldout01NativeEvaluatorV2R {
  version: 'EDITRON_REFERENCE_HOLDOUT_01_NATIVE_EVALUATOR_V2R_1';
  authority: 'EVALUATOR_ONLY_NEVER_PROVIDER_VISIBLE';
  taskId: typeof REFERENCE_HOLDOUT_01_NATIVE_TASK_ID_V2R;
  sourceSha256: typeof REFERENCE_HOLDOUT_01_SOURCE_SHA256;
  inheritedHumanApprovedVisualRequirements: readonly Readonly<JsonRecord>[];
  nativeMotionAudioReviewRequirements: readonly Readonly<JsonRecord>[];
  hardFailures: readonly string[];
  leakageSentinels: readonly string[];
  reviewProtocol: Readonly<JsonRecord>;
  evaluatorSha256: string;
}

export interface ReferenceHoldout01NativeManifestV2R {
  version: typeof REFERENCE_HOLDOUT_01_NATIVE_VERSION_V2R;
  authority: 'RESEARCH_ONLY_HELDOUT_NATIVE_REFERENCE_NO_PROJECT_MUTATION';
  taskId: typeof REFERENCE_HOLDOUT_01_NATIVE_TASK_ID_V2R;
  sourceBinding: Readonly<ProviderNativeVideoReferenceManifestV2R>;
  rightsAndEgress: Readonly<JsonRecord>;
  providerVisibleTask: Readonly<JsonRecord>;
  evaluatorOnly: Readonly<ReferenceHoldout01NativeEvaluatorV2R>;
  manifestSha256: string;
}

export function buildReferenceHoldout01ManifestV2R(): Readonly<ReferenceHoldoutManifestV2R> {
  const material = {
    version: REFERENCE_HOLDOUT_01_VERSION_V2R,
    authority: 'RESEARCH_ONLY_HELDOUT_REFERENCE_NO_PROJECT_MUTATION' as const,
    taskId: REFERENCE_HOLDOUT_01_TASK_ID_V2R,
    heldoutBasis: {
      sourceIntroducedBeforeBenchmark: true,
      sourceCommitSha: '60efe24546a8ef0cde83793d445302acaeae2a00',
      priorBenchmarkSemanticLabelsFound: 0,
      priorProviderExposureUnderThisTaskId: 0,
      dev02ContaminationDisposition: 'EXCLUDED_DIFFERENT_SOURCE',
    },
    sourceMaterialization: {
      sourcePath: REFERENCE_HOLDOUT_01_SOURCE_RELATIVE_PATH,
      sourceSha256: REFERENCE_HOLDOUT_01_SOURCE_SHA256,
      sourceTimebase: { numerator: '60', denominator: '1', durationUs: '64750000' },
      sourceTechnicalFacts: {
        video: { codec: 'h264', width: 1920, height: 1080, averageRate: '60/1' },
        audio: { codec: 'aac', sampleRate: 96000, channels: 2 },
      },
      extractor: {
        binarySha256: 'c8abc49e7be62dde8e12972af373959e0076a7b8dc8040eb45978e0608f8781e',
        versionLine: 'ffmpeg version N-92722-gf22fcd4483 Copyright (c) 2000-2018 the FFmpeg developers',
        output: { mimeType: 'image/jpeg', width: 960, height: 540, quality: 2 },
        deterministicArgs: [
          '-fflags', '+bitexact', '-ss', '{timestampSeconds}', '-i', '{sourcePath}',
          '-map', '0:v:0', '-frames:v', '1', '-vf',
          'scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2:color=black',
          '-an', '-threads', '1', '-c:v', 'mjpeg', '-q:v', '2', '-pix_fmt', 'yuvj420p',
          '-flags', '+bitexact', '-f', 'image2pipe', 'pipe:1',
        ],
      },
      samples: SAMPLES,
      expectedReferenceInputManifestSha256: REFERENCE_HOLDOUT_01_EXPECTED_INPUT_SHA256,
    },
    rightsAndEgress: {
      provenance: 'TRACKED_PRODUCT_SHOWCASE_ASSET',
      legalClearanceClaim: 'NOT_ASSERTED_BY_THIS_MANIFEST',
      permittedUse: 'LOCAL_INTERNAL_RESEARCH_PREFLIGHT',
      providerEgress: 'REQUIRES_SEPARATE_OPERATOR_AUTHORIZATION',
      contentLiteralDefault: 'DO_NOT_COPY',
    },
    providerVisibleTask: providerVisibleTask(),
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertReferenceHoldout01ManifestV2R(
  value: unknown,
): Readonly<ReferenceHoldoutManifestV2R> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('REFERENCE_HOLDOUT_01_MANIFEST_MISSING');
  }
  const candidate = value as ReferenceHoldoutManifestV2R;
  const expected = buildReferenceHoldout01ManifestV2R();
  if (candidate.version !== REFERENCE_HOLDOUT_01_VERSION_V2R
    || candidate.manifestSha256 !== expected.manifestSha256
    || hashCanonicalJsonV1(candidate) !== hashCanonicalJsonV1(expected)) {
    throw new Error('REFERENCE_HOLDOUT_01_MANIFEST_DRIFT');
  }
  if (!isDeepFrozen(candidate)) throw new Error('REFERENCE_HOLDOUT_01_MANIFEST_NOT_IMMUTABLE');
  return candidate;
}

export function buildReferenceHoldout01NativeInputManifestV2R(): Readonly<ProviderNativeVideoReferenceManifestV2R> {
  return deepFreezeV1({
    version: PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R,
    arm: PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R,
    referenceId: 'ref_heldout_01',
    referenceAssetSha256: REFERENCE_HOLDOUT_01_SOURCE_SHA256,
    mimeType: 'video/mp4',
    bytesSha256: REFERENCE_HOLDOUT_01_SOURCE_SHA256,
    byteLength: REFERENCE_HOLDOUT_01_SOURCE_BYTE_LENGTH,
    durationUs: REFERENCE_HOLDOUT_01_SOURCE_DURATION_US,
    sourceRate: { numerator: '60', denominator: '1' },
    resolution: 'high',
    embeddedStreams: 'PRESERVED_IN_SOURCE_BYTES',
  });
}

export const REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256 =
  hashCanonicalJsonV1(buildReferenceHoldout01NativeInputManifestV2R());

export function buildReferenceHoldout01NativeManifestV2R(): Readonly<ReferenceHoldout01NativeManifestV2R> {
  const evaluatorOnly = buildReferenceHoldout01NativeEvaluatorV2R();
  const material = {
    version: REFERENCE_HOLDOUT_01_NATIVE_VERSION_V2R,
    authority: 'RESEARCH_ONLY_HELDOUT_NATIVE_REFERENCE_NO_PROJECT_MUTATION' as const,
    taskId: REFERENCE_HOLDOUT_01_NATIVE_TASK_ID_V2R,
    sourceBinding: buildReferenceHoldout01NativeInputManifestV2R(),
    rightsAndEgress: {
      provenance: 'TRACKED_PRODUCT_SHOWCASE_ASSET',
      legalClearanceClaim: 'NOT_ASSERTED_BY_THIS_MANIFEST',
      permittedUse: 'LOCAL_INTERNAL_RESEARCH_PREFLIGHT',
      providerEgress: 'REQUIRES_SEPARATE_OPERATOR_AUTHORIZATION',
      contentLiteralDefault: 'DO_NOT_COPY',
    },
    providerVisibleTask: nativeProviderVisibleTask(),
    evaluatorOnly,
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertReferenceHoldout01NativeManifestV2R(
  value: unknown,
): Readonly<ReferenceHoldout01NativeManifestV2R> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_MANIFEST_MISSING');
  }
  const expected = buildReferenceHoldout01NativeManifestV2R();
  if (hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(expected)) {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_MANIFEST_DRIFT');
  }
  if (!isDeepFrozen(value)) throw new Error('REFERENCE_HOLDOUT_01_NATIVE_MANIFEST_NOT_IMMUTABLE');
  return value as Readonly<ReferenceHoldout01NativeManifestV2R>;
}

function providerVisibleTask(): Readonly<JsonRecord> {
  return {
    taskId: REFERENCE_HOLDOUT_01_TASK_ID_V2R,
    taskKind: 'REFERENCE_OBSERVATION_ONLY',
    inputArm: 'ORDERED_TIMESTAMPED_IMAGES_WITHOUT_AUDIO',
    objective: 'Reconstruct only observable reference behaviour from the supplied ordered frames.',
    rules: [
      'Separate global editorial language, recurring design grammar, bounded hero moments, content-literal details, temporal structure and uncertainties.',
      'Cite frame IDs and timestamp ranges for every material observation.',
      'A recurring claim requires at least two evidenced occurrences and relevant counterexamples.',
      'Do not choose editing operators, execution forms, software techniques or what a future project must copy.',
      'Treat audio, exact easing, continuous motion and unsampled intervals as unavailable in this input arm.',
      'Content-literal identities and exact text default to DO_NOT_COPY.',
    ],
    referenceBinding: {
      referenceId: 'ref_heldout_01',
      referenceAssetSha256: REFERENCE_HOLDOUT_01_SOURCE_SHA256,
      sourceRate: { numerator: '60', denominator: '1' },
      durationUs: '64750000',
      samples: SAMPLES.map(({ frameId, timestampUs }) => ({ frameId, timestampUs })),
    },
    outputContract: referenceObservationSchema(),
  };
}

function nativeProviderVisibleTask(): Readonly<JsonRecord> {
  return {
    taskId: REFERENCE_HOLDOUT_01_NATIVE_TASK_ID_V2R,
    taskKind: 'REFERENCE_OBSERVATION_ONLY',
    inputArm: REFERENCE_HOLDOUT_01_NATIVE_INPUT_ARM_V2R,
    objective: 'Reconstruct observable visual, temporal and audible reference behaviour from the supplied native video and embedded audio.',
    rules: [
      'Separate global editorial language, recurring design grammar, bounded hero moments, content-literal details, temporal structure, audio behaviour and uncertainties.',
      'Cite bounded microsecond ranges and the observed modality for every material observation.',
      'A recurring claim requires at least two distinct evidenced occurrence ranges and relevant counterexamples.',
      'Do not choose editing operators, execution forms, software techniques or what a future project must copy.',
      'Do not treat provider sampling as source-frame-complete evidence; request targeted dense reinspection when exact easing, microtiming, masks or fast motion cannot be proved.',
      'Content-literal identities, exact copy, metrics, testimonials, music identity and logos default to DO_NOT_COPY.',
    ],
    referenceBinding: {
      referenceId: 'ref_heldout_01',
      referenceAssetSha256: REFERENCE_HOLDOUT_01_SOURCE_SHA256,
      sourceRate: { numerator: '60', denominator: '1' },
      durationUs: REFERENCE_HOLDOUT_01_SOURCE_DURATION_US,
      embeddedStreams: 'VIDEO_AND_AUDIO',
    },
    semanticContract: buildReferenceNativeObserverProviderSemanticContractV2R(),
    outputContract: nativeReferenceObservationSchema(),
  };
}

function nativeReferenceObservationSchema(): Readonly<JsonRecord> {
  const range = () => closed({
    startTimestampUs: { type: 'string', pattern: '^(0|[1-9][0-9]*)$' },
    endTimestampUsExclusive: { type: 'string', pattern: '^[1-9][0-9]*$' },
    modality: { type: 'string', enum: ['VIDEO', 'AUDIO', 'VIDEO_AND_AUDIO'] },
  });
  const ranges = (minimum = 1) => ({ type: 'array', minItems: minimum, items: range() });
  const base = {
    observationId: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,79}$' },
    statement: { type: 'string', minLength: 1 },
    certainty: { type: 'string', enum: ['OBSERVED', 'AMBIGUOUS'] },
    evidenceRanges: ranges(),
  };
  const observation = closed({
    ...base,
    dimension: {
      type: 'string',
      enum: [
        'NARRATIVE_STRUCTURE', 'PACING_RHYTHM', 'COMPOSITION_FRAMING',
        'TYPOGRAPHY', 'COLOUR_LIGHT', 'GRAPHIC_DENSITY',
        'AUDIOVISUAL_RELATIONSHIP',
      ],
    },
    transferability: {
      type: 'string', enum: ['STRUCTURAL', 'STYLE_ONLY', 'CONTENT_LITERAL', 'UNRESOLVED'],
    },
  });
  return closed({
    artifactVersion: { const: 'REFERENCE_OBSERVATION_MAP_V2R_2' },
    taskId: { const: REFERENCE_HOLDOUT_01_NATIVE_TASK_ID_V2R },
    inputArm: { const: REFERENCE_HOLDOUT_01_NATIVE_INPUT_ARM_V2R },
    globalEditorialLanguage: { type: 'array', minItems: 1, items: observation },
    recurringDesignGrammar: {
      type: 'array',
      items: closed({
        ...base,
        patternKind: { const: 'RECURRING' },
        occurrenceRanges: ranges(2),
        counterexampleRanges: ranges(0),
      }),
    },
    boundedHeroMoments: {
      type: 'array',
      items: closed({
        ...base,
        momentRange: range(),
        states: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
      }),
    },
    contentLiterals: {
      type: 'array',
      items: closed({
        ...base,
        kind: {
          type: 'string',
          enum: ['BRAND', 'LOGO', 'EXACT_TEXT', 'PRODUCT_UI', 'PERSON', 'METRIC', 'MUSIC_IDENTITY'],
        },
        rightsDisposition: { const: 'DO_NOT_COPY' },
      }),
    },
    temporalStructure: {
      type: 'array',
      minItems: 1,
      items: closed({
        ...base,
        phaseRange: range(),
        phaseRole: { type: 'string', enum: ['INTRODUCTION', 'BUILD', 'PROOF', 'RELEASE', 'OTHER'] },
      }),
    },
    audioBehaviour: {
      type: 'array',
      minItems: 1,
      items: closed({
        ...base,
        behaviourKind: {
          type: 'string',
          enum: ['MUSIC_STRUCTURE', 'RHYTHM_RELATIONSHIP', 'DYNAMICS', 'SPEECH', 'SFX', 'OTHER'],
        },
      }),
    },
    uncertainties: {
      type: 'array',
      minItems: 1,
      items: closed({
        uncertaintyId: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,79}$' },
        statement: { type: 'string', minLength: 1 },
        disposition: {
          type: 'string',
          enum: [
            'UNVERIFIABLE_FROM_NATIVE_PASS',
            'REQUIRES_DENSE_REINSPECTION',
            'REQUIRES_HUMAN_REVIEW',
          ],
        },
        affectedLayers: {
          type: 'array', minItems: 1, uniqueItems: true,
          items: { type: 'string', minLength: 1 },
        },
      }),
    },
    requestedDenseReinspectionWindows: {
      type: 'array',
      items: closed({
        windowId: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,79}$' },
        startTimestampUs: { type: 'string', pattern: '^(0|[1-9][0-9]*)$' },
        endTimestampUsExclusive: { type: 'string', pattern: '^[1-9][0-9]*$' },
        reason: { type: 'string', minLength: 1 },
        requiredModality: {
          type: 'string', enum: ['SOURCE_FRAME_WINDOW', 'CUSTOM_FPS_VIDEO', 'AUDIO_WINDOW', 'VIDEO_AND_AUDIO_WINDOW'],
        },
        requestedRate: {
          anyOf: [
            { type: 'null' },
            closed({
              numerator: { type: 'string', pattern: '^[1-9][0-9]*$' },
              denominator: { type: 'string', pattern: '^[1-9][0-9]*$' },
            }),
          ],
        },
      }),
    },
  });
}

function buildReferenceHoldout01NativeEvaluatorV2R(): Readonly<ReferenceHoldout01NativeEvaluatorV2R> {
  const inheritedHumanApprovedVisualRequirements = [
    nativeRubric('HREF01N-EVAL-VISUAL-SYSTEM', 'GLOBAL_EDITORIAL_LANGUAGE', 'Capture the near-black visual system, restrained cream/gold palette and occasional semantic accent colours.'),
    nativeRubric('HREF01N-EVAL-TYPE-HIERARCHY', 'GLOBAL_EDITORIAL_LANGUAGE', 'Capture the hierarchy between large claims, small uppercase labels and secondary product-interface copy.'),
    nativeRubric('HREF01N-EVAL-PROGRESSION', 'TEMPORAL_STRUCTURE', 'Capture the premise-to-capability-to-proof-to-social-proof-to-brand-close progression.'),
    nativeRubric('HREF01N-EVAL-RECURRING-GRAMMAR', 'RECURRING_DESIGN_GRAMMAR', 'Capture recurring product cards, warm emphasis and the alternation between sparse claims and dense dashboards.'),
    nativeRubric('HREF01N-EVAL-HERO-MOMENTS', 'BOUNDED_HERO_MOMENT', 'Capture the intelligence hub, metric/timeline, format-delivery and closing hero constructions as bounded moments.'),
    nativeRubric('HREF01N-EVAL-CONTENT-LITERALS', 'CONTENT_LITERAL', 'Keep exact brand, logo, copy, metrics, testimonials, URL and music identity non-transferable.'),
  ] as const;
  const nativeMotionAudioReviewRequirements = [
    nativeRubric('HREF01N-EVAL-MOTION', 'HUMAN_REVIEW_OPEN_QUESTION', 'Describe recurring motion and transition behaviour with bounded timestamp evidence; request dense reinspection for unproved microtiming or easing.'),
    nativeRubric('HREF01N-EVAL-AUDIO', 'HUMAN_REVIEW_OPEN_QUESTION', 'Describe audible structure and audiovisual relationships with bounded timestamp evidence without inventing music identity or causal synchronization.'),
    nativeRubric('HREF01N-EVAL-COVERAGE-LIMIT', 'HUMAN_REVIEW_OPEN_QUESTION', 'State which material source intervals or fast events remain unverified by the native provider pass.'),
  ] as const;
  const material = {
    version: 'EDITRON_REFERENCE_HOLDOUT_01_NATIVE_EVALUATOR_V2R_1' as const,
    authority: 'EVALUATOR_ONLY_NEVER_PROVIDER_VISIBLE' as const,
    taskId: REFERENCE_HOLDOUT_01_NATIVE_TASK_ID_V2R,
    sourceSha256: REFERENCE_HOLDOUT_01_SOURCE_SHA256,
    inheritedHumanApprovedVisualRequirements,
    nativeMotionAudioReviewRequirements,
    hardFailures: [
      'INVENTS_UNSUPPORTED_AUDIO_MOTION_OR_EASING',
      'TREATS_LITERAL_CONTENT_AS_TRANSFERABLE_STYLE',
      'CHOOSES_EDITING_OPERATORS_OR_EXECUTION_FORM_DURING_OBSERVATION',
      'OMITS_TIMESTAMP_OR_MODALITY_BINDINGS',
      'REPORTS_SOURCE_FRAME_COMPLETENESS_FROM_PROVIDER_NATIVE_SAMPLING',
      'REPORTS_SUCCESS_WHILE_REQUIRED_MATERIAL_IS_UNVERIFIABLE',
    ],
    leakageSentinels: [
      ...inheritedHumanApprovedVisualRequirements,
      ...nativeMotionAudioReviewRequirements,
    ].map((entry) => String(entry.requirementId)),
    reviewProtocol: {
      deterministicChecks: [
        'SCHEMA_VALID', 'RANGES_BOUNDED', 'MODALITIES_DECLARED',
        'RECURRENCE_HAS_TWO_OCCURRENCES', 'NO_EVALUATOR_SENTINEL_IN_REQUEST',
      ],
      currentHumanReviewStatus: 'PROTOCOL_APPROVED_OUTPUT_NOT_YET_REVIEWED',
      protocolApprovalBasis: 'ACTIVE_SESSION_USER_CONFIRMATION_2026_08_20',
      dispatchGate: 'REQUIRES_HASH_BOUND_ONE_CALL_OPERATOR_AUTHORIZATION',
      interpretation: 'DIAGNOSTIC_SINGLE_REFERENCE_ONLY_NO_MODEL_PROMOTION',
    },
  };
  return deepFreezeV1({ ...material, evaluatorSha256: hashCanonicalJsonV1(material) });
}

function nativeRubric(
  requirementId: string,
  layer: string,
  requirement: string,
): Readonly<JsonRecord> {
  return { requirementId, layer, requirement, scoring: 'BLIND_SEMANTIC_EDITOR_JUDGMENT' };
}

function referenceObservationSchema(): Readonly<JsonRecord> {
  const evidenceIds = { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', pattern: '^frame_[0-9]{6}$' } };
  const base = {
    observationId: { type: 'string', minLength: 1 }, statement: { type: 'string', minLength: 1 },
    certainty: { type: 'string', enum: ['OBSERVED', 'AMBIGUOUS'] }, evidenceFrameIds: evidenceIds,
  };
  const observation = closed({
    ...base,
    dimension: { type: 'string', enum: ['NARRATIVE_STRUCTURE', 'PACING_RHYTHM', 'COMPOSITION_FRAMING', 'TYPOGRAPHY', 'COLOUR_LIGHT', 'GRAPHIC_DENSITY'] },
    transferability: { type: 'string', enum: ['STRUCTURAL', 'STYLE_ONLY', 'CONTENT_LITERAL', 'UNRESOLVED'] },
  });
  const recurring = closed({
    ...base, patternKind: { const: 'RECURRING' }, occurrenceFrameIds: evidenceIds,
    counterexampleFrameIds: { type: 'array', uniqueItems: true, items: { type: 'string', pattern: '^frame_[0-9]{6}$' } },
  });
  const ranged = {
    startTimestampUs: { type: 'string', pattern: '^(0|[1-9][0-9]*)$' },
    endTimestampUsExclusive: { type: 'string', pattern: '^[1-9][0-9]*$' },
  };
  return closed({
    artifactVersion: { const: 'REFERENCE_OBSERVATION_MAP_V2R_1' },
    taskId: { const: REFERENCE_HOLDOUT_01_TASK_ID_V2R },
    inputArm: { const: 'ORDERED_TIMESTAMPED_IMAGES_WITHOUT_AUDIO' },
    globalEditorialLanguage: { type: 'array', minItems: 1, items: observation },
    recurringDesignGrammar: { type: 'array', items: recurring },
    boundedHeroMoments: { type: 'array', items: closed({ ...base, ...ranged, states: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } } }) },
    contentLiterals: { type: 'array', items: closed({ ...base, kind: { type: 'string', enum: ['BRAND', 'LOGO', 'EXACT_TEXT', 'PRODUCT_UI', 'PERSON', 'METRIC'] }, rightsDisposition: { const: 'DO_NOT_COPY' } }) },
    temporalStructure: { type: 'array', minItems: 1, items: closed({ ...base, ...ranged, phaseRole: { type: 'string', enum: ['INTRODUCTION', 'BUILD', 'PROOF', 'RELEASE', 'OTHER'] } }) },
    uncertainties: { type: 'array', minItems: 1, items: closed({ uncertaintyId: { type: 'string', minLength: 1 }, statement: { type: 'string', minLength: 1 }, disposition: { type: 'string', enum: ['UNVERIFIABLE_FROM_CURRENT_EVIDENCE', 'REQUIRES_DENSE_REINSPECTION', 'REQUIRES_AUDIO'] }, affectedLayers: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } } }) },
    requestedDenseReinspectionWindows: { type: 'array', items: closed({ ...ranged, reason: { type: 'string', minLength: 1 }, requiredModality: { type: 'string', enum: ['ORDERED_DENSE_FRAMES', 'NATIVE_VIDEO', 'AUDIO', 'VIDEO_AND_AUDIO'] } }) },
  });
}

function closed(properties: JsonRecord): Readonly<JsonRecord> {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

function sample(index: number, timestampUs: string, bytesSha256: string, byteLength: number): ReferenceHoldoutSampleV2R {
  return { frameId: `frame_${String(index).padStart(6, '0')}`, timestampUs, bytesSha256, byteLength };
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((entry) => isDeepFrozen(entry, seen));
}
