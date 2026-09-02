import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildProviderNativeControlOnlyToolSetV2R,
  type ProviderNativeToolSetV2R,
} from './provider-native-tool-catalog-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeEpisodeReceiptV2R,
  type ProviderNativeInvokeResponseV2R,
  type ProviderNativeRuntimeGuardV2R,
} from './provider-native-tool-episode-v2r';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from './provider-native-episode-resume-v2r';
import type { ProviderNativeDurableAttemptReceiptV2R }
  from './provider-native-durable-attempt-receipt-v2r';
import type { ProviderNativeDurableDispatchIntentV2R }
  from './provider-native-durable-dispatch-intent-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  buildStage25LongFormPlanHoldoutContextV2,
  STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2,
} from './stage25-long-form-plan-holdout-v2';

type JsonRecord = Record<string, unknown>;

export const STAGE25_LONG_FORM_PROVIDER_PROTOCOL_VERSION_V2 =
  'EDITRON_STAGE25_LONG_FORM_PROVIDER_PROTOCOL_V2_1' as const;
export const STAGE25_LONG_FORM_PROVIDER_PRESENTATION_SEED_V2 =
  'editron-stage25-long-form-provider-v2-20260824' as const;
export const STAGE25_LONG_FORM_PROVIDER_PRESENTATION_COUNT_V2 = 3 as const;
export const STAGE25_LONG_FORM_PROVIDER_MAX_INPUT_TOKENS_V2 = 64_000 as const;
export const STAGE25_LONG_FORM_PROVIDER_MAX_OUTPUT_TOKENS_V2 = 16_384 as const;
export const STAGE25_LONG_FORM_PROVIDER_DURABLE_HANDOFF_MODE_V2 =
  'OPAQUE_RESULT_REFERENCES' as const;

export const STAGE25_LONG_FORM_PROVIDER_STRUCTURAL_INVARIANTS_V2 = Object.freeze([
  'Use only supplied IDs. Duplicate IDs and unknown, dangling, self-referential, or cyclic parent/dependency references fail.',
  'Create exactly one DIRECTION root, include every required work kind, stay within maxNodes/maxDepth/maxFanout, and create at least minSequenceNodes SEQUENCE nodes.',
  'Every non-SEQUENCE narrativeOrder is null; SEQUENCE narrativeOrder values are unique and contiguous from zero.',
  'Every direction, deliverable, evidence, and approval requirement must be structurally covered.',
  'A selected range automatically contributes its context-owned semanticScopeId. Every node needs at least one effective scope; semanticScopeIds is the union of explicit scopes and selected-range scopes, so do not duplicate a range scope merely to satisfy the compiler.',
  'Required evidence is derived from the context-owned requiredEvidenceRequirementIds of every effective scope, selected range, and selected direction requirement.',
  'evidenceRequirementIds is an optional relevant declaration only: it cannot create relevance, replace derived evidence, or satisfy evidence required by another node.',
  'READY means LOCAL_READY only: every evidence item derived for that node must have status AVAILABLE. UNVERIFIED or MISSING evidence rejects LOCAL_READY.',
  'Canonical READY is separate: a LOCAL_READY node is canonical READY only when every dependency is already canonical VERIFIED with finalDisposition PASS; otherwise it compiles PROPOSED with dependency blockers.',
  'Initial model proposals cannot self-declare canonical VERIFIED status or PASS final disposition. PlanService is the sole owner of later promotion after dependency proof and receipts are accepted.',
  'SOURCE_ORGANIZATION and MUSIC_STRUCTURE precede STORY_ASSEMBLY.',
  'PICTURE_STABILITY depends transitively on every SEQUENCE node.',
  'FINAL_AUDIO, CAPTIONS and QUALITY_CONTROL follow PICTURE_STABILITY.',
  'DELIVERY follows FINAL_AUDIO, CAPTIONS and QUALITY_CONTROL.',
  'This protocol evaluates structure and provenance only. Editorial taste, range semantic accuracy, and rendered audiovisual quality remain unverified and require blind/editor review.',
] as const);

export interface Stage25LongFormProviderDurabilityV2 {
  resumeCheckpoint?: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  resumeCurrentProjectRevision?: string;
  onProviderAttemptCommitted?: (input: Readonly<{
    attemptReceipt: Readonly<ProviderNativeDurableAttemptReceiptV2R>;
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    dispatchIntent?: Readonly<ProviderNativeDurableDispatchIntentV2R>;
  }>) => void | Promise<void>;
  onProviderDispatchCommitted?: (input: Readonly<{
    dispatchIntent: Readonly<ProviderNativeDurableDispatchIntentV2R>;
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  }>) => void | Promise<void>;
  now?: () => string;
}

export function buildStage25LongFormProviderFinishSchemaV2(): Readonly<JsonRecord> {
  const id = { type: 'string', minLength: 1, maxLength: 240 };
  const text = { type: 'string', minLength: 1, maxLength: 1_000 };
  const stringArray = (maxItems: number, minItems = 0): JsonRecord => ({
    type: 'array', items: text, minItems, maxItems, uniqueItems: true,
  });
  const node = closed({
    nodeId: id,
    workKind: { enum: [
      'DIRECTION', 'SOURCE_ORGANIZATION', 'MUSIC_STRUCTURE', 'STORY_ASSEMBLY',
      'SEQUENCE', 'PICTURE_STABILITY', 'FINAL_AUDIO', 'CAPTIONS',
      'QUALITY_CONTROL', 'DELIVERY',
    ] },
    parentNodeId: { anyOf: [id, { type: 'null' }] },
    dependsOnNodeIds: stringArray(64),
    narrativeOrder: { anyOf: [
      { type: 'integer', minimum: 0 }, { type: 'null' },
    ] },
    targetClaims: stringArray(64, 1),
    preservationClaims: stringArray(64),
    successConditions: stringArray(64, 1),
    stopConditions: stringArray(32, 1),
    semanticScopeIds: stringArray(64),
    rangeCandidateIds: stringArray(64),
    deliverableIds: stringArray(16),
    directionRequirementIds: stringArray(64),
    evidenceRequirementIds: stringArray(128),
    approvalRequirementIds: stringArray(32),
    budgetClassId: id,
    status: { enum: ['DRAFT', 'NEEDS_EVIDENCE', 'READY'] },
    whatHasNotBeenChecked: stringArray(128, 1),
  });
  const proposal = closed({
    version: { enum: [STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2] },
    proposalId: id,
    nodes: { type: 'array', items: node, minItems: 1, maxItems: 24 },
  });
  return closed({
    disposition: {
      enum: ['READY_FOR_PROOF', 'UNVERIFIABLE', 'CLARIFICATION_REQUIRED'],
    },
    reasonCodes: stringArray(32, 1),
    evidenceIds: stringArray(128),
    summary: { type: 'string', minLength: 1, maxLength: 2_000 },
    proposal: { anyOf: [proposal, { type: 'null' }] },
  });
}

export function buildStage25LongFormProviderToolSetV2():
Readonly<ProviderNativeToolSetV2R> {
  return buildProviderNativeControlOnlyToolSetV2R(
    buildStage25LongFormProviderFinishSchemaV2(),
  );
}

export function buildStage25LongFormProviderContextV2(
  presentationOrdinal: number,
): Readonly<ProviderNativeEpisodeContextV2R> {
  if (!Number.isSafeInteger(presentationOrdinal)
    || presentationOrdinal < 1
    || presentationOrdinal > STAGE25_LONG_FORM_PROVIDER_PRESENTATION_COUNT_V2) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_V2_PRESENTATION_INVALID');
  }
  const source = buildStage25LongFormPlanHoldoutContextV2();
  const ordered = {
    semanticScopes: reorder(source.semanticScopes, presentationOrdinal, ({ id }) => id),
    rangeCandidates: reorder(
      source.rangeCandidates, presentationOrdinal, ({ rangeCandidateId }) => rangeCandidateId,
    ),
    deliverables: reorder(source.deliverables, presentationOrdinal, ({ id }) => id),
    directionRequirements: reorder(
      source.directionRequirements, presentationOrdinal, ({ id }) => id,
    ),
    evidenceRequirements: reorder(
      source.evidenceRequirements, presentationOrdinal, ({ id }) => id,
    ),
    approvalRequirements: reorder(
      source.approvalRequirements, presentationOrdinal, ({ id }) => id,
    ),
    budgetClasses: reorder(source.budgetClasses, presentationOrdinal, ({ id }) => id),
  };
  return Object.freeze({
    episodeId: `STAGE25-LONGFORM-PLAN-V2:P${presentationOrdinal}`,
    objective: [
      'Create a coarse, honest Sequence/Range editorial plan for the supplied',
      'long-form event project. Do not perform edits or invent unavailable evidence.',
    ].join(' '),
    activeTarget: {
      protocolVersion: STAGE25_LONG_FORM_PROVIDER_PROTOCOL_VERSION_V2,
      presentationOrdinal,
      canonicalContextSha256: source.contextSha256,
      brief: source.brief,
      workflowPolicy: source.workflowPolicy,
    },
    revisionBinding: {
      projectId: source.project.projectId,
      expectedProjectRevision: source.project.baseProjectRevisionRef.artifactId,
      directionRevisionRef: source.project.directionRevisionRef,
      canonicalContextSha256: source.contextSha256,
    },
    projectState: {
      project: source.project,
      longFormPlanningDirectory: ordered,
    },
    evidence: ordered.evidenceRequirements,
    preservationRules: source.directionRequirements
      .filter(({ kind }) => kind !== 'MUST')
      .map(({ id, kind, description }) => `${id}:${kind}:${description}`),
    authorityAndPolicy: {
      authority: 'RESEARCH_PLANNING_ONLY_NO_EDITING_OPERATORS_NO_PROJECT_MUTATION',
      canonicalPlanOwner: 'PlanService/Editron EditorialPlanV1',
      modelReadinessMeaning: 'READY_IS_LOCAL_READY_ONLY',
      canonicalReadinessMeaning: 'READY_REQUIRES_ALL_DEPENDENCIES_VERIFIED_PASS',
      coverageRules: [...STAGE25_LONG_FORM_PROVIDER_STRUCTURAL_INVARIANTS_V2],
      providerMayChoose: [
        'semantic decomposition', 'node objectives', 'range assignment',
        'dependency shape within the declared rules', 'honest unchecked claims',
      ],
      evaluatorDoesNotJudge: [
        'editorial taste', 'range semantic accuracy', 'rendered audiovisual quality',
      ],
      stateEffects: [],
    },
    budget: {
      maxTurns: 1,
      maxOutputTokensPerTurn: STAGE25_LONG_FORM_PROVIDER_MAX_OUTPUT_TOKENS_V2,
      maxIdenticalCalls: 1,
    },
  });
}

export async function captureStage25LongFormProviderInitialRequestV2(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  presentationOrdinal: number;
  durableMode?: boolean;
}): Promise<Readonly<SerializedProviderNativeTurnV2R>> {
  let captured: Readonly<SerializedProviderNativeTurnV2R> | undefined;
  await runStage25LongFormProviderEpisodeV2({
    ...input,
    invoke: async (request) => {
      captured = request;
      return { status: 418, body: { preflight: true } };
    },
  });
  if (!captured) throw new Error('STAGE25_LONG_FORM_PROVIDER_V2_REQUEST_CAPTURE_FAILED');
  return captured;
}

export async function runStage25LongFormProviderEpisodeV2(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  presentationOrdinal: number;
  durableMode?: boolean;
  invoke: (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ) => Promise<Readonly<ProviderNativeInvokeResponseV2R>>;
  runtimeGuard?: Readonly<ProviderNativeRuntimeGuardV2R>;
} & Stage25LongFormProviderDurabilityV2):
Promise<Readonly<ProviderNativeEpisodeReceiptV2R>> {
  const usesDurability = Boolean(
    input.resumeCheckpoint || input.resumeCurrentProjectRevision
      || input.onProviderAttemptCommitted || input.onProviderDispatchCommitted,
  );
  if (usesDurability && !input.durableMode) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_V2_DURABLE_MODE_REQUIRED');
  }
  const finishInputSchema = buildStage25LongFormProviderFinishSchemaV2();
  return runProviderNativeToolEpisodeV2R({
    route: input.route,
    context: buildStage25LongFormProviderContextV2(input.presentationOrdinal),
    eligibleOperatorIds: [],
    finishInputSchema,
    toolSetFactory: () => buildProviderNativeControlOnlyToolSetV2R(finishInputSchema),
    additionalInstructions: [
      'This is a planning submission, not an editing episode. No editing operation is exposed.',
      'Call finish_editron_research_episode exactly once with the complete coarse proposal.',
      'Use READY_FOR_PROOF only when proposal is non-null and ready for deterministic structural evaluation.',
      'Use UNVERIFIABLE or CLARIFICATION_REQUIRED with proposal=null when the supplied directory cannot support an honest plan.',
      'Do not compute hashes, runtime ports, mutation receipts, renders or low-level operator graphs.',
      'Every structural invariant in authorityAndPolicy.coverageRules is public and scored.',
      'Do not duplicate a range-owned scope; the compiler derives it deterministically.',
      'READY claims local evidence readiness only; it cannot self-certify dependencies, and only PlanService can later promote canonical status.',
    ],
    argumentHandoffMode: input.durableMode
      ? STAGE25_LONG_FORM_PROVIDER_DURABLE_HANDOFF_MODE_V2
      : 'DIRECT_ARGUMENTS',
    invoke: input.invoke,
    ...(input.runtimeGuard ? { runtimeGuard: input.runtimeGuard } : {}),
    ...(input.resumeCheckpoint ? {
      resumeCheckpoint: input.resumeCheckpoint,
      resumeCurrentProjectRevision: input.resumeCurrentProjectRevision,
    } : {}),
    ...(input.onProviderAttemptCommitted ? {
      onProviderAttemptCommitted: input.onProviderAttemptCommitted,
    } : {}),
    ...(input.onProviderDispatchCommitted ? {
      onProviderDispatchCommitted: input.onProviderDispatchCommitted,
    } : {}),
    ...(input.now ? { now: input.now } : {}),
    executeIsolated: async () => {
      throw new Error('STAGE25_LONG_FORM_PROVIDER_V2_EXECUTOR_MUST_NOT_RUN');
    },
  });
}

function closed(properties: Readonly<JsonRecord>): Readonly<JsonRecord> {
  return {
    type: 'object', properties,
    required: Object.keys(properties), additionalProperties: false,
  };
}

function reorder<T>(
  values: readonly T[], ordinal: number, identity: (value: T) => string,
): readonly T[] {
  return [...values].sort((left, right) => {
    const leftKey = hashCanonicalJsonV1([
      STAGE25_LONG_FORM_PROVIDER_PRESENTATION_SEED_V2, ordinal, identity(left),
    ]);
    const rightKey = hashCanonicalJsonV1([
      STAGE25_LONG_FORM_PROVIDER_PRESENTATION_SEED_V2, ordinal, identity(right),
    ]);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}
