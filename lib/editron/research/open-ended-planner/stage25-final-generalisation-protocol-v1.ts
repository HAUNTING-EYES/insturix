import { buildCap2aPlannerToolSheetV2R }
  from './cap2a-planner-dossier-v2r';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { V2R_OPERATOR_CATALOG } from './operator-catalog-v2r';
import {
  buildProviderNativeControlOnlyToolSetV2R,
} from './provider-native-tool-catalog-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
} from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;

export const STAGE25_FINAL_GENERALISATION_PROTOCOL_VERSION_V1 =
  'EDITRON_OE_STAGE25_FINAL_GENERALISATION_PROTOCOL_V1_1' as const;
export const STAGE25_FINAL_GENERALISATION_PRESENTATION_SEED_V1 =
  'editron-stage25-final-generalisation-20260826' as const;
export const STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1 = 64_000 as const;
export const STAGE25_FINAL_GENERALISATION_MAX_OUTPUT_TOKENS_V1 = 8_192 as const;

export type Stage25FinalGeneralisationLaneV1 = 'DEPENDENCY_PLAN' | 'ROUTE_DECISION';

export interface Stage25FinalGeneralisationPublicTaskV1 {
  taskId: string;
  lane: Stage25FinalGeneralisationLaneV1;
  taskSha256: string;
  publicTask: Readonly<JsonRecord>;
  eligibleOperatorIds: readonly string[];
  currentOwnerEvidence: Readonly<JsonRecord>;
  publicRuleIds: readonly string[];
  evidenceIds: readonly string[];
  preservationRules: readonly string[];
  taskPacketSha256: string;
}

export function buildStage25FinalGeneralisationContextV1(
  task: Readonly<Stage25FinalGeneralisationPublicTaskV1>,
): Readonly<ProviderNativeEpisodeContextV2R> {
  assertTask(task);
  const catalog = records(V2R_OPERATOR_CATALOG.operators);
  const selected = task.lane === 'ROUTE_DECISION'
    ? catalog
    : task.eligibleOperatorIds.map((operatorId) => (
        catalog.find((entry) => entry.operatorId === operatorId)
          ?? fail(`OPERATOR_UNKNOWN:${task.taskId}:${operatorId}`)
      ));
  const ordered = [...selected].sort((left, right) => compare(
    presentationKey(task.taskId, String(left.operatorId)),
    presentationKey(task.taskId, String(right.operatorId)),
  ));
  const toolSheet = buildCap2aPlannerToolSheetV2R(ordered);
  return deepFreezeV1({
    episodeId: `stage25-final-generalisation:${task.taskId}`,
    objective: task.lane === 'DEPENDENCY_PLAN'
      ? 'Produce one honest high-level Editron operation plan with explicit dependencies, evidence, revision handoffs and invalidations. Do not compile runtime plumbing or mutate a project.'
      : 'Qualify native, generated-composition and hybrid execution against the supplied target and current owner evidence, then choose a legal route or stop honestly.',
    activeTarget: {
      protocolVersion: STAGE25_FINAL_GENERALISATION_PROTOCOL_VERSION_V1,
      taskId: task.taskId,
      taskLane: task.lane,
      taskSha256: task.taskSha256,
      publicTask: task.publicTask,
      publicRuleIds: task.publicRuleIds,
    },
    revisionBinding: {
      taskPacketSha256: task.taskPacketSha256,
      expectedProjectRevision: expectedRevision(task.publicTask),
    },
    projectState: {
      currentOwnerEvidence: task.currentOwnerEvidence,
      completeCapabilityDirectory: toolSheet,
      presentedSelectableOperatorIds: ordered.map(({ operatorId }) => String(operatorId)),
      presentationOrderSha256: hashCanonicalJsonV1(
        ordered.map(({ operatorId }) => String(operatorId)),
      ),
    },
    evidence: task.evidenceIds.map((evidenceId) => ({
      evidenceId, status: 'PUBLIC_TASK_BOUND_REFERENCE',
    })),
    preservationRules: [...task.preservationRules],
    authorityAndPolicy: {
      authority: 'RESEARCH_PLANNER_SCREEN_NO_PROJECT_OR_EXECUTION_AUTHORITY',
      everyScoredRuleIsPublic: true,
      hiddenExpectedPlanAbsent: true,
      compilerMayAddCreativeOperations: false,
      historicalCatalogIsNotLiveCertification: true,
      taskBoundSuccessorContractsAreExplicit: true,
      safeStopMustAttemptZeroMutations: true,
      structuralPassIsNotRenderedOrProductProof: true,
      modelMustCopySelectableOperatorIdsExactly: true,
    },
    budget: {
      maxTurns: 2,
      maxOutputTokensPerTurn: STAGE25_FINAL_GENERALISATION_MAX_OUTPUT_TOKENS_V1,
      maxIdenticalCalls: 1,
    },
  });
}

export function buildStage25FinalGeneralisationFinishSchemaV1(
  lane: Stage25FinalGeneralisationLaneV1,
): Readonly<JsonRecord> {
  const id = { type: 'string', minLength: 1, maxLength: 240 };
  const text = { type: 'string', minLength: 1, maxLength: 2_000 };
  const strings = (maxItems: number, minItems = 0) => ({
    type: 'array', items: id, minItems, maxItems, uniqueItems: true,
  });
  const common = {
    disposition: { enum: [
      'READY_FOR_PROOF', 'UNVERIFIABLE', 'CAPABILITY_GAP',
      'CLARIFICATION_REQUIRED', 'FAIL',
    ] },
    reasonCodes: strings(32, 1),
    evidenceIds: strings(128),
    summary: text,
  };
  if (lane === 'DEPENDENCY_PLAN') {
    const node = closed({
      nodeId: id,
      selectedOperatorId: id,
      role: { enum: ['READ', 'EVIDENCE', 'RESOLUTION', 'MUTATION', 'PROOF'] },
      dependsOnNodeIds: strings(32),
      publicRuleIds: strings(32, 1),
      evidenceIds: strings(64),
      consumesOwnerOutputRefs: strings(32),
      producesOwnerOutputRefs: strings(32),
      reads: strings(32),
      writes: strings(32),
      invalidates: strings(32),
      coordinateDomain: { enum: [
        'PROJECT_TIMELINE_FRAME', 'SOURCE_PTS', 'NON_TEMPORAL',
      ] },
      expectedRevisionOrigin: { enum: [
        'INITIAL_PROJECT_SNAPSHOT', 'PRIOR_WRITER_RECEIPT', 'NOT_APPLICABLE',
      ] },
      proofObligationIds: strings(32),
      failureDisposition: { enum: ['STOP_NO_WRITE', 'ABORT_PLAN', 'UNVERIFIABLE'] },
      reversibility: { enum: ['READ_ONLY', 'CHECKPOINT_REQUIRED', 'UNSAFE_UNDO_BLOCKED'] },
      rationale: text,
    });
    const proposal = closed({
      taskId: id,
      lane: { enum: ['DEPENDENCY_PLAN'] },
      publicRuleCoverageIds: strings(64, 1),
      planNodes: { type: 'array', items: node, minItems: 1, maxItems: 32 },
      unresolvedRequirements: strings(64),
      whatHasNotBeenChecked: strings(64, 1),
    });
    return closed({ ...common, proposal: { anyOf: [proposal, { type: 'null' }] } });
  }
  const candidate = closed({
    route: { enum: ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID'] },
    qualification: { enum: [
      'RESEARCH_PREVIEW_AVAILABLE', 'OWNER_OR_FIXTURE_GAP', 'CAPABILITY_GAP',
    ] },
    targetPredicateIds: strings(64),
    preservationPredicateIds: strings(64),
    ownerRefs: strings(64),
    selectedOperatorIds: strings(64),
    blockers: strings(64),
    proofCeiling: id,
  });
  const proposal = closed({
    taskId: id,
    lane: { enum: ['ROUTE_DECISION'] },
    publicRuleCoverageIds: strings(64, 1),
    candidateForms: { type: 'array', items: candidate, minItems: 3, maxItems: 3 },
    selectedRoute: { anyOf: [
      { enum: ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID'] }, { type: 'null' },
    ] },
    boundaryHandoffs: strings(32),
    unresolvedRequirements: strings(64),
    whatHasNotBeenChecked: strings(64, 1),
  });
  return closed({ ...common, proposal: { anyOf: [proposal, { type: 'null' }] } });
}

export async function captureStage25FinalGeneralisationInitialRequestV1(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  task: Readonly<Stage25FinalGeneralisationPublicTaskV1>;
}): Promise<Readonly<SerializedProviderNativeTurnV2R>> {
  let captured: Readonly<SerializedProviderNativeTurnV2R> | undefined;
  const finishSchema = buildStage25FinalGeneralisationFinishSchemaV1(input.task.lane);
  await runProviderNativeToolEpisodeV2R({
    route: input.route,
    context: buildStage25FinalGeneralisationContextV1(input.task),
    eligibleOperatorIds: [],
    finishInputSchema: finishSchema,
    toolSetFactory: () => buildProviderNativeControlOnlyToolSetV2R(finishSchema),
    additionalInstructions: [
      'This is a planning and route-qualification submission; no editing operation is callable in this request.',
      'Call finish_editron_research_episode with one complete proposal or an honest null proposal.',
      'Use exact selectableOperatorIds from the supplied completeCapabilityDirectory; do not invent aliases, ports, receipts or compiler nodes.',
      'All scored rules are in activeTarget.publicTask and activeTarget.publicRuleIds; there are no hidden required operations or timings.',
      'Current owner evidence limits what may be called available. Research preview availability is not product certification.',
      'A safe stop must propose no mutations and must name the public missing evidence, owner, fixture or capability.',
    ],
    invoke: async (request) => {
      captured = request;
      return { status: 418, body: { zeroSpendCapture: true } };
    },
    executeIsolated: async () => fail('ZERO_SPEND_EXECUTOR_MUST_NOT_RUN'),
  });
  return captured ?? fail('REQUEST_CAPTURE_MISSING');
}

function assertTask(task: Readonly<Stage25FinalGeneralisationPublicTaskV1>): void {
  if (!task.taskId.trim() || !/^[a-f0-9]{64}$/.test(task.taskSha256)
    || !/^[a-f0-9]{64}$/.test(task.taskPacketSha256)
    || !task.publicRuleIds.length || new Set(task.publicRuleIds).size !== task.publicRuleIds.length) {
    fail(`TASK_INVALID:${task.taskId}`);
  }
}
function expectedRevision(task: Readonly<JsonRecord>): string {
  const project = record(task.project);
  return String(project.expectedProjectRevision ?? task.taskSha256 ?? 'RESEARCH-NO-PROJECT');
}
function presentationKey(taskId: string, operatorId: string): string {
  return hashCanonicalJsonV1([STAGE25_FINAL_GENERALISATION_PRESENTATION_SEED_V1, taskId, operatorId]);
}
function closed(properties: Readonly<JsonRecord>): Readonly<JsonRecord> {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code: string): never { throw new Error(`STAGE25_FINAL_GENERALISATION_PROTOCOL_${code}`); }
