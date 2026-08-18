import benchmarkJson from '@/tests/fixtures/editron/open-ended-planner-v2/benchmark-contract-v2.json';
import dev02CanonicalIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import dev02Stage3EvidenceJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import mediaManifestJson from '@/tests/fixtures/editron/open-ended-planner-v2/development-media-manifest-v2.json';
import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';
import tasksV2Json from '@/tests/fixtures/editron/open-ended-planner-v2/tasks-v2.json';
import developmentV1Json from '@/tests/fixtures/editron/open-ended-planner-v1/development-tasks-v1.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { getCanonicalDev01Stage123V2 } from './dev01-stage123-canonical-v2';
import { getCanonicalDev02V2RV2 } from './dev02-canonical-v2r-v2';
import {
  getCanonicalDev01NativeProxyFixtureV2,
  hashCanonicalDev01NativeProxyFixtureV2,
} from './dev01-native-proxy-fixture-v2';
import { getCanonicalDev04ConnectedChainV2 } from './dev04-capability-gap-chain-v2';
import {
  hashTemporalReferenceEvidenceV2,
  type TemporalReferenceEvidenceV2,
} from './media-materializer-v2';
import {
  STAGE2_SELECTED_OPERATOR_INSTRUCTIONS_V2R,
  STAGE2_SELECTED_OPERATOR_NODE_SCHEMA_V2R,
  STAGE3_SELECTED_OPERATOR_NODE_SCHEMA_V2R,
  referencedOperatorIdsV2R,
  selectedOperatorDriftDiagnosticsV2R,
} from './stage2-selected-operator-contract-v2r';
import { buildCap2aEnrichedCatalogV2R } from './cap2a-planner-dossier-v2r';

export const INPUT_ARMS_V2 = ['MULTIMODAL', 'TEXT_EVIDENCE_ONLY'] as const;
export const REFERENCE_IMAGE_INPUT_ARM_V2 = 'REFERENCE_IMAGE_EVIDENCE' as const;
export const REFERENCE_IMAGE_SEQUENCE_INPUT_ARM_V2 = 'REFERENCE_IMAGE_SEQUENCE_EVIDENCE' as const;
export const REFERENCE_NATIVE_VIDEO_INPUT_ARM_V2 = 'REFERENCE_NATIVE_VIDEO_EVIDENCE' as const;
export const EXECUTION_FORM_ARMS_V2 = [
  'FREE_CHOICE', 'FORCED_NATIVE', 'FORCED_GENERATED_COMPOSITION',
  'FORCED_HYBRID', 'THRESHOLD_ABLATION', 'SIGNAL_ABLATION',
] as const;

export type InputArmV2 = typeof INPUT_ARMS_V2[number]
  | typeof REFERENCE_IMAGE_INPUT_ARM_V2
  | typeof REFERENCE_IMAGE_SEQUENCE_INPUT_ARM_V2
  | typeof REFERENCE_NATIVE_VIDEO_INPUT_ARM_V2;
type ExecutionFormArmV2 = typeof EXECUTION_FORM_ARMS_V2[number];
type StageV2 = 1 | 2 | 3 | 4 | 5;
export type NodeContractVersionV2 = 'V2' | 'V2R';
type JsonRecord = Record<string, unknown>;

interface EvidenceV2 { evidenceId: string; kind: string; binding: string; value: unknown }
interface SourceTaskV1 {
  taskId: string;
  project: { projectId: string; projectRevision: string; fps: number; canvas: { width: number; height: number }; durationFrames: number; assets: Array<{ assetId: string; type: string; rightsStatus: string }> };
  evidence: EvidenceV2 | EvidenceV2[];
  conditionEvidence: { C4_NOISY_OR_MISSING_EVIDENCE: { omitEvidenceIds: string[]; replaceEvidence: EvidenceV2[] } };
}
interface ConditionCaseV2 { conditionId: string; availableEvidenceIds: string[]; omittedEvidenceIds: string[]; replacementEvidenceIds?: string[] }
interface SourceTaskV2 {
  taskId: string; split: string; sealed: boolean; originalRequest: string;
  projectBinding: { projectId: string; projectRevision: string };
  mediaBindings: Array<{ assetId: string; recipeSha256: string }>;
  conditionCases: ConditionCaseV2[];
}
interface MediaArtifactV2 {
  assetId: string; taskId: string; mimeType: string; artifactPath: string;
  recipeSha256: string; artifactSha256: string; bytes: number; technical: JsonRecord;
  temporalReferenceEvidence?: TemporalReferenceEvidenceV2;
}
interface PriorArtifactV2 { artifactType: string; taskId: string; [key: string]: unknown }

export interface ProviderStagePacketV2 {
  packetVersion: 'EDITRON_OE_PROVIDER_STAGE_PACKET_V2';
  authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_OR_PROJECT_MUTATION';
  stage: StageV2;
  stageName: string;
  taskId: string;
  conditionId: string;
  inputArm: InputArmV2;
  executionFormArm: ExecutionFormArmV2 | 'NOT_APPLICABLE_PRE_ROUTING';
  instructions: string[];
  stageBudget: StageBudgetV2;
  modelInput: JsonRecord;
  outputContract: JsonRecord;
}

export interface HashedStagePacketV2 {
  packet: Readonly<ProviderStagePacketV2>;
  packetHash: string;
  transportAttachments: ReadonlyArray<ProviderTransportAttachmentV2>;
  transportHash: string;
}

export interface ProviderTransportAttachmentV2 {
  assetId: string;
  mimeType: string;
  artifactPath: string;
  artifactSha256: string;
  bytes: number;
  evidenceRole?: 'ORDERED_REFERENCE_SAMPLE' | 'NATIVE_REFERENCE_VIDEO';
  bundleSha256?: string;
  sequenceIndex?: number;
  referenceTick?: string;
  timestampMilliseconds?: number;
  technical?: JsonRecord;
}

export interface StageThreeEvidenceSourceV2 {
  evidencePack: JsonRecord;
}

interface StageBudgetV2 { maxInputTokens: number; maxVisibleOutputTokens: number; maxReasoningTokens: number; maxWallClockMs: number; maxProviderCostUsd: number }

const STAGE_BUDGETS: Record<StageV2, StageBudgetV2> = {
  1: { maxInputTokens: 30000, maxVisibleOutputTokens: 10000, maxReasoningTokens: 3000, maxWallClockMs: 420000, maxProviderCostUsd: 0.70 },
  2: { maxInputTokens: 50000, maxVisibleOutputTokens: 8000, maxReasoningTokens: 5000, maxWallClockMs: 420000, maxProviderCostUsd: 0.70 },
  3: { maxInputTokens: 32000, maxVisibleOutputTokens: 4000, maxReasoningTokens: 3000, maxWallClockMs: 420000, maxProviderCostUsd: 0.60 },
  4: { maxInputTokens: 80000, maxVisibleOutputTokens: 8000, maxReasoningTokens: 7000, maxWallClockMs: 90000, maxProviderCostUsd: 0.48 },
  5: { maxInputTokens: 3000, maxVisibleOutputTokens: 800, maxReasoningTokens: 1800, maxWallClockMs: 30000, maxProviderCostUsd: 0.08 },
};

const STAGE_INSTRUCTIONS: Record<StageV2, string[]> = {
  1: ['Reconstruct only the visible and audible target.', 'Separate global editorial language, recurring design grammar, and bounded unique moments.', 'Express hard and soft results as measurable target claims with explicit coordinate scopes.', 'Do not select operators or an execution form.', 'State uncertainty when evidence is absent or noisy.'],
  2: ['Select editorial operations and their dependencies.', 'Prove structural hard-target coverage for every candidate execution form.', 'COVERED means the claim is assigned to catalog capabilities that can structurally realize it; missing concrete project IDs, ranges, or evidence belong in unresolvedRequirements for Stage 3 and do not by themselves make structural coverage UNVERIFIABLE.', 'ELIGIBLE requires truthful current support and compiler status; an ideal architectural route may still be selected while its candidate is INELIGIBLE or UNVERIFIABLE and records a capability gap.', 'Classify a bounded generated island as GENERATED_COMPOSITION and a full native plan surrounding an island as HYBRID.', 'Obey the assigned routing experiment.', 'Do not serialize exact runtime arguments yet.'],
  3: ['Bind every intent to supplied evidence, rights, privacy, revision, preservation, and proof requirements.', 'BOUND means the supplied facts are complete and exact for this binding; do not downgrade a binding merely because its capability cannot execute yet.', 'PLANNED means a proof obligation is required at a later executable stage; use UNVERIFIABLE only when supplied facts cannot determine whether that proof is required, not because the proof has not run yet.', 'COMPLIANT means the proposed plan obeys the rights or privacy policy even when that policy denies listed actions; use POLICY_BLOCKED only when the proposed plan itself requires a forbidden action.', 'Express unavailable execution only through stageDisposition and unresolvedRequirements so evidence completeness remains distinct from capability readiness.', 'Do not invent evidence or capability.'],
  4: ['Compile only operators named by the source intent into exact versioned catalog references and closed input fields.', 'Use only supplied fact, revision, policy, preservation, and proof identifiers; never invent runtime arguments.', 'RESEARCH_ONLY_NOT_IMPLEMENTED and NOT_COMPILABLE operators require structured diagnostics and unresolved intent nodes, never executable nodes or legacy replacements.', 'A compiled read or resolver subgraph does not make the requested graph executable when a required dependency is blocked.', 'Every node must declare reads, writes, requires, produces, invalidates, coordinate and revision bindings, stability, state effects, idempotency material, proof, failure and retry disposition, policy, concurrency, resource policy, reversibility, and trace references.', 'Set executionEligibility to NOT_EXECUTABLE whenever any required intent node remains unresolved.'],
  5: ['Return PROCEED only for a valid, policy-safe compiled graph.', 'Keep clarification, capability gap, policy block, conflict, fail, and unverifiable distinct.'],
};

const FORBIDDEN_KEYS = new Set([
  'evaluatorOnly', 'baselineDisposition', 'acceptableExecutionForms', 'requiredOperationFamilies',
  'missingCapabilities', 'requiredBehaviour', 'allowedDispositions', 'activePredicateIds',
  'predicates', 'behaviourBrief', 'successPredicates',
]);

export class StagedPacketErrorV2 extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'StagedPacketErrorV2'; }
}

export function buildDevelopmentStageOnePacketsV2(): HashedStagePacketV2[] {
  const results: HashedStagePacketV2[] = [];
  for (const task of developmentTasksV2()) {
    for (const condition of task.conditionCases) {
      for (const inputArm of INPUT_ARMS_V2) results.push(buildStageOnePacket(task, condition, inputArm));
    }
  }
  return results;
}

export function buildDev01TruthfulStageOneTextPacketV2(
  conditionId: 'BASELINE' | 'VISUAL_EVIDENCE_WITHHELD',
): HashedStagePacketV2 {
  const task = developmentTasksV2().find(({ taskId }) => taskId === 'DEV-01')
    ?? fail('TASK_MISSING', 'DEV-01');
  const condition = task.conditionCases.find((candidate) => candidate.conditionId === conditionId)
    ?? fail('CONDITION_MISSING', `DEV-01/${conditionId}`);
  return buildDev01TruthfulTextStageOnePacket(task, condition);
}

export function buildCanonicalTextStageOnePacketV2(input: {
  taskId: string;
  conditionId: string;
  canonicalInput: JsonRecord;
}): HashedStagePacketV2 {
  const task = developmentTasksV2().find(({ taskId }) => taskId === input.taskId)
    ?? fail('TASK_MISSING', input.taskId);
  const condition = task.conditionCases.find(({ conditionId }) => conditionId === input.conditionId)
    ?? fail('CONDITION_MISSING', `${input.taskId}/${input.conditionId}`);
  return buildCanonicalTextStageOnePacket(task, condition, input.canonicalInput);
}

export function buildDevelopmentReferenceImageStageOnePacketV2(
  taskId: string,
  conditionId: string,
): HashedStagePacketV2 {
  const task = developmentTasksV2().find((candidate) => candidate.taskId === taskId)
    ?? fail('TASK_MISSING', taskId);
  const condition = task.conditionCases.find((candidate) => candidate.conditionId === conditionId)
    ?? fail('CONDITION_MISSING', `${taskId}/${conditionId}`);
  return buildStageOnePacket(task, condition, REFERENCE_IMAGE_INPUT_ARM_V2);
}

export function buildDevelopmentReferenceImageSequenceStageOnePacketV2(
  taskId: string,
  conditionId: string,
): HashedStagePacketV2 {
  const task = developmentTasksV2().find((candidate) => candidate.taskId === taskId)
    ?? fail('TASK_MISSING', taskId);
  const condition = task.conditionCases.find((candidate) => candidate.conditionId === conditionId)
    ?? fail('CONDITION_MISSING', `${taskId}/${conditionId}`);
  return buildStageOnePacket(task, condition, REFERENCE_IMAGE_SEQUENCE_INPUT_ARM_V2);
}

export function buildDevelopmentReferenceNativeVideoStageOnePacketV2(
  taskId: string,
  conditionId: string,
): HashedStagePacketV2 {
  const task = developmentTasksV2().find((candidate) => candidate.taskId === taskId)
    ?? fail('TASK_MISSING', taskId);
  const condition = task.conditionCases.find((candidate) => candidate.conditionId === conditionId)
    ?? fail('CONDITION_MISSING', `${taskId}/${conditionId}`);
  return buildStageOnePacket(task, condition, REFERENCE_NATIVE_VIDEO_INPUT_ARM_V2);
}

export function buildNextProviderStagePacketV2(input: {
  previousPacket: HashedStagePacketV2;
  stage: 2 | 3 | 4 | 5;
  executionFormArm: ExecutionFormArmV2;
  priorArtifact: PriorArtifactV2;
  stageThreeSource?: StageThreeEvidenceSourceV2;
  nodeContractVersion?: NodeContractVersionV2;
}): HashedStagePacketV2 {
  if (input.previousPacket.packet.stage !== input.stage - 1) fail('NON_SEQUENTIAL_STAGE', 'Stages must be built sequentially');
  const expectedType = ['ReferenceBlueprintV2', 'EditorialIntentGraphV2', 'EvidenceBoundIntentGraphV2', 'CompiledOperationGraphV2'][input.stage - 2];
  if (input.priorArtifact.artifactType !== expectedType || input.priorArtifact.taskId !== input.previousPacket.packet.taskId) fail('PRIOR_ARTIFACT_MISMATCH', `Stage ${input.stage} requires ${expectedType} for the same task`);
  const diagnostics = validateArtifactV2(input.priorArtifact, input.previousPacket.packet.outputContract, '$');
  if (diagnostics.length) fail('PRIOR_ARTIFACT_SCHEMA_INVALID', diagnostics.join('; '));
  if (input.stage === 4
    && !['READY_FOR_COMPILATION', 'CAPABILITY_GAP'].includes(String(input.priorArtifact.stageDisposition))) {
    fail('STAGE4_PRIOR_STAGE_NOT_COMPILABLE', `Stage 4 cannot compile a ${String(input.priorArtifact.stageDisposition)} evidence-bound intent`);
  }
  const sourceTask = developmentTasksV2().find(({ taskId }) => taskId === input.previousPacket.packet.taskId) ?? fail('TASK_MISSING', 'Development task disappeared');
  const condition = sourceTask.conditionCases.find(({ conditionId }) => conditionId === input.previousPacket.packet.conditionId) ?? fail('CONDITION_MISSING', 'Condition disappeared');
  const nodeContractVersion: NodeContractVersionV2 = input.nodeContractVersion ?? 'V2';
  const modelInput: JsonRecord = {
    priorArtifact: input.priorArtifact,
    priorArtifactHash: hashCanonicalJsonV1(input.priorArtifact),
    condition: publicCondition(condition),
    ...(input.stage <= 4 ? { operatorCatalog: publicOperatorCatalog(input.stage, input.priorArtifact, nodeContractVersion) } : {}),
    ...(nodeContractVersion === 'V2R' && input.stage <= 4 ? {
      capabilityDossier: buildCap2aEnrichedCatalogV2R(
        exposedSpecOperators(input.stage, input.priorArtifact, nodeContractVersion).operators as unknown as JsonRecord[],
      ),
    } : {}),
    ...(input.stage === 3 ? {
      evidencePack: stageThreeEvidencePack(sourceTask, condition, input.stageThreeSource),
    } : {}),
    ...(input.stage === 4 ? {
      compilationSources: stageFourCompilationSources(sourceTask, condition, input.priorArtifact, input.previousPacket.packet, nodeContractVersion),
      compilationPolicy: stageFourCompilationPolicy(sourceTask.taskId),
    } : {}),
    ...(input.stage === 2 ? { routingExperiment: routingExperiment(input.executionFormArm) } : {}),
  };
  const packet = packetBase({
    stage: input.stage, taskId: sourceTask.taskId, conditionId: condition.conditionId,
    inputArm: input.previousPacket.packet.inputArm, executionFormArm: input.executionFormArm,
    modelInput, nodeContractVersion,
  });
  return hashPacket(packet, []);
}

export function buildDevelopmentNoProviderPlanV2(): Readonly<{
  planVersion: 'EDITRON_OE_DEVELOPMENT_NO_PROVIDER_PLAN_V2';
  authority: string;
  stageOnePackets: Array<{ taskId: string; conditionId: string; inputArm: InputArmV2; packetHash: string; transportHash: string }>;
  branches: Array<{ branchId: string; taskId: string; conditionId: string; inputArm: InputArmV2; executionFormArm: ExecutionFormArmV2; stageOnePacketHash: string; branchHash: string; stageStatuses: string[] }>;
  noProviderTelemetry: JsonRecord;
}> {
  const stageOne = buildDevelopmentStageOnePacketsV2();
  const branches = stageOne.flatMap((artifact) => EXECUTION_FORM_ARMS_V2.map((arm) => {
    const material = { taskId: artifact.packet.taskId, conditionId: artifact.packet.conditionId, inputArm: artifact.packet.inputArm, executionFormArm: arm, stageOnePacketHash: artifact.packetHash };
    return { branchId: `oe-v2-${material.taskId}-${material.conditionId}-${material.inputArm}-${arm}`.toLowerCase(), ...material, branchHash: hashCanonicalJsonV1(material), stageStatuses: ['STAGE_1_PACKET_READY', 'STAGE_2_BLOCKED_ON_REFERENCE_BLUEPRINT', 'STAGE_3_BLOCKED_ON_EDITORIAL_INTENT', 'STAGE_4_BLOCKED_ON_EVIDENCE_BOUND_INTENT', 'STAGE_5_BLOCKED_ON_COMPILE_DIAGNOSTICS', 'STAGE_6_BLOCKED_V2_1B_NO_EXECUTOR', 'STAGE_7_BLOCKED_V2_1B_NO_RENDER'] };
  }));
  const noProviderTelemetry = Object.fromEntries((benchmarkJson.requiredTelemetry as string[]).map((field) => [field, telemetryZero(field)]));
  return deepFreezeV1({
    planVersion: 'EDITRON_OE_DEVELOPMENT_NO_PROVIDER_PLAN_V2',
    authority: 'RESEARCH_ONLY_NO_PROVIDER_CALL_NO_PROJECT_MUTATION',
    stageOnePackets: stageOne.map(({ packet, packetHash, transportHash }) => ({ taskId: packet.taskId, conditionId: packet.conditionId, inputArm: packet.inputArm, packetHash, transportHash })),
    branches,
    noProviderTelemetry,
  });
}

function buildStageOnePacket(task: SourceTaskV2, condition: ConditionCaseV2, inputArm: InputArmV2): HashedStagePacketV2 {
  const v1 = (developmentV1Json.tasks as unknown as SourceTaskV1[]).find(({ taskId }) => taskId === task.taskId) ?? fail('V1_TASK_MISSING', task.taskId);
  if (v1.project.projectId !== task.projectBinding.projectId || v1.project.projectRevision !== task.projectBinding.projectRevision) fail('PROJECT_BINDING_DRIFT', task.taskId);
  const media = mediaForTask(task);
  const visible = visibleEvidence(v1, condition);
  const imageSequenceInput = inputArm === REFERENCE_IMAGE_INPUT_ARM_V2
    || inputArm === REFERENCE_IMAGE_SEQUENCE_INPUT_ARM_V2;
  const referenceInput = imageSequenceInput
    || inputArm === REFERENCE_NATIVE_VIDEO_INPUT_ARM_V2;
  const attachedMedia = referenceInput
    ? referenceImagesForEvidence(visible, media)
    : inputArm === 'MULTIMODAL' ? media : [];
  const temporalReference = referenceInput
    ? verifiedTemporalReferenceEvidence(attachedMedia)
    : undefined;
  const attachments = temporalReference
    ? temporalReferenceAttachments(inputArm, temporalReference)
    : attachedMedia.map(({ assetId, mimeType, artifactPath, artifactSha256, bytes }) => ({
        assetId, mimeType, artifactPath, artifactSha256, bytes,
      }));
  const evidence = referenceInput
    ? withoutReferenceAnswerLeak(visible, attachedMedia)
    : visible;
  const modelInput = {
    originalRequest: task.originalRequest,
    projectFacts: {
      projectId: v1.project.projectId,
      projectRevision: v1.project.projectRevision,
      projectTimebase: rationalTimebase(`${v1.project.projectId}:timeline`, v1.project.fps),
      duration: { coordinateDomain: 'PROJECT_TICK', start: '0', endExclusive: String(v1.project.durationFrames) },
      canvas: v1.project.canvas,
      assets: v1.project.assets.map(({ assetId, type, rightsStatus }) => ({ assetId, type, rightsStatus })),
    },
    sourceCoordinateFacts: media.map(sourceCoordinateFact),
    condition: publicCondition(condition),
    evidence,
    mediaDescriptors: temporalReference
      ? attachments.map(referenceAttachmentDescriptor)
      : attachedMedia.map(({ assetId, mimeType, artifactSha256, technical }) => ({ assetId, mimeType, artifactSha256, technical })),
    ...(temporalReference ? {
      referenceEvidenceContract: {
        bundleSha256: temporalReference.bundleSha256,
        coordinateDomain: temporalReference.coordinateDomain,
        timebase: temporalReference.timebase,
        order: temporalReference.order,
        representation: imageSequenceInput
          ? 'ORDERED_TIMESTAMPED_IMAGE_SEQUENCE'
          : 'NATIVE_REFERENCE_VIDEO',
      },
    } : {}),
    mediaPolicy: imageSequenceInput
      ? 'ATTACH_HASH_BOUND_ORDERED_REFERENCE_IMAGES'
      : inputArm === REFERENCE_NATIVE_VIDEO_INPUT_ARM_V2
      ? 'ATTACH_HASH_BOUND_NATIVE_REFERENCE_VIDEO'
      : inputArm === 'MULTIMODAL' ? 'ATTACH_HASH_BOUND_MEDIA' : 'NO_MEDIA_BYTES_OR_PATHS',
  };
  const packet = packetBase({ stage: 1, taskId: task.taskId, conditionId: condition.conditionId, inputArm, executionFormArm: 'NOT_APPLICABLE_PRE_ROUTING', modelInput });
  return hashPacket(packet, attachments);
}

function buildDev01TruthfulTextStageOnePacket(
  task: SourceTaskV2,
  condition: ConditionCaseV2,
): HashedStagePacketV2 {
  const source = getCanonicalDev01Stage123V2();
  const canonicalInput = source.stageOneTextInputs[condition.conditionId as keyof typeof source.stageOneTextInputs]
    ?? fail('DEV01_STAGE1_SOURCE_MISSING', condition.conditionId);
  return buildCanonicalTextStageOnePacket(task, condition, canonicalInput);
}

function buildCanonicalTextStageOnePacket(
  task: SourceTaskV2,
  condition: ConditionCaseV2,
  canonicalInput: JsonRecord,
): HashedStagePacketV2 {
  const evidenceSource = Array.isArray(canonicalInput.evidence)
    ? canonicalInput.evidence
    : canonicalInput.evidenceAvailability;
  const evidenceIds = records(evidenceSource).map(({ evidenceId }) => String(evidenceId));
  if (hashCanonicalJsonV1(evidenceIds) !== hashCanonicalJsonV1(condition.availableEvidenceIds)) {
    fail('CONDITION_EVIDENCE_DRIFT', `${task.taskId}/${condition.conditionId}`);
  }
  const projectFacts = isRecord(canonicalInput.projectFacts) ? canonicalInput.projectFacts : {};
  if (projectFacts.projectId !== task.projectBinding.projectId
    || projectFacts.projectRevision !== task.projectBinding.projectRevision) {
    fail('PROJECT_BINDING_DRIFT', task.taskId);
  }
  if (typeof canonicalInput.taskId === 'string' && canonicalInput.taskId !== task.taskId) {
    fail('TASK_BINDING_DRIFT', task.taskId);
  }
  if (typeof canonicalInput.conditionId === 'string'
    && canonicalInput.conditionId !== condition.conditionId) {
    fail('CONDITION_BINDING_DRIFT', `${task.taskId}/${condition.conditionId}`);
  }
  const modelInput = {
    originalRequest: task.originalRequest,
    ...canonicalInput,
    condition: publicCondition(condition),
  };
  const packet = packetBase({
    stage: 1,
    taskId: task.taskId,
    conditionId: condition.conditionId,
    inputArm: 'TEXT_EVIDENCE_ONLY',
    executionFormArm: 'NOT_APPLICABLE_PRE_ROUTING',
    modelInput,
  });
  return hashPacket(packet, []);
}

function verifiedTemporalReferenceEvidence(media: MediaArtifactV2[]): TemporalReferenceEvidenceV2 {
  if (media.length !== 1) fail('TEMPORAL_REFERENCE_CARDINALITY', 'Temporal reference arms require exactly one bound reference artifact');
  const temporal = media[0].temporalReferenceEvidence
    ?? fail('TEMPORAL_REFERENCE_MISSING', media[0].assetId);
  const { bundleSha256, ...material } = temporal;
  if (bundleSha256 !== `sha256:${hashTemporalReferenceEvidenceV2(material)}`) {
    fail('TEMPORAL_REFERENCE_HASH_DRIFT', media[0].assetId);
  }
  if (temporal.samples.length !== 6 || new Set(temporal.samples.map(({ sampleId }) => sampleId)).size !== 6) {
    fail('TEMPORAL_REFERENCE_SAMPLE_SET', 'Temporal image evidence requires six uniquely identified samples');
  }
  const numerator = Number(temporal.timebase.numerator);
  const denominator = Number(temporal.timebase.denominator);
  const endExclusiveTick = Number(temporal.timebase.endExclusiveTick);
  let previousTick = -1;
  for (const sample of temporal.samples) {
    const tick = Number(sample.referenceTick);
    const expectedMilliseconds = tick * denominator / numerator * 1_000;
    if (!Number.isSafeInteger(tick) || tick <= previousTick || tick >= endExclusiveTick
      || sample.timestampMilliseconds !== expectedMilliseconds) {
      fail('TEMPORAL_REFERENCE_ORDER_DRIFT', sample.sampleId);
    }
    previousTick = tick;
  }
  if (temporal.nativeVideo.technical.editRateNumerator !== temporal.timebase.numerator
    || temporal.nativeVideo.technical.editRateDenominator !== temporal.timebase.denominator
    || temporal.nativeVideo.technical.startTick !== temporal.timebase.startTick
    || temporal.nativeVideo.technical.endExclusiveTick !== temporal.timebase.endExclusiveTick) {
    fail('TEMPORAL_REFERENCE_VIDEO_TIMEBASE_DRIFT', temporal.nativeVideo.evidenceId);
  }
  return temporal;
}

function temporalReferenceAttachments(
  inputArm: InputArmV2,
  temporal: TemporalReferenceEvidenceV2,
): ProviderTransportAttachmentV2[] {
  if (inputArm === REFERENCE_IMAGE_INPUT_ARM_V2
    || inputArm === REFERENCE_IMAGE_SEQUENCE_INPUT_ARM_V2) {
    return temporal.samples.map((sample, sequenceIndex) => ({
      assetId: sample.sampleId,
      mimeType: sample.mimeType,
      artifactPath: sample.artifactPath,
      artifactSha256: sample.artifactSha256,
      bytes: sample.bytes,
      evidenceRole: 'ORDERED_REFERENCE_SAMPLE',
      bundleSha256: temporal.bundleSha256,
      sequenceIndex,
      referenceTick: sample.referenceTick,
      timestampMilliseconds: sample.timestampMilliseconds,
      technical: sample.technical,
    }));
  }
  if (inputArm === REFERENCE_NATIVE_VIDEO_INPUT_ARM_V2) {
    return [{
      assetId: temporal.nativeVideo.evidenceId,
      mimeType: temporal.nativeVideo.mimeType,
      artifactPath: temporal.nativeVideo.artifactPath,
      artifactSha256: temporal.nativeVideo.artifactSha256,
      bytes: temporal.nativeVideo.bytes,
      evidenceRole: 'NATIVE_REFERENCE_VIDEO',
      bundleSha256: temporal.bundleSha256,
      technical: temporal.nativeVideo.technical,
    }];
  }
  fail('TEMPORAL_REFERENCE_ARM_INVALID', inputArm);
}

function referenceAttachmentDescriptor(attachment: ProviderTransportAttachmentV2): JsonRecord {
  return {
    assetId: attachment.assetId,
    mimeType: attachment.mimeType,
    artifactSha256: attachment.artifactSha256,
    evidenceRole: attachment.evidenceRole,
    bundleSha256: attachment.bundleSha256,
    ...(attachment.sequenceIndex === undefined ? {} : { sequenceIndex: attachment.sequenceIndex }),
    ...(attachment.referenceTick === undefined ? {} : { referenceTick: attachment.referenceTick }),
    ...(attachment.timestampMilliseconds === undefined ? {} : { timestampMilliseconds: attachment.timestampMilliseconds }),
    technical: attachment.technical,
  };
}

function packetBase(input: { stage: StageV2; taskId: string; conditionId: string; inputArm: InputArmV2; executionFormArm: ExecutionFormArmV2 | 'NOT_APPLICABLE_PRE_ROUTING'; modelInput: JsonRecord; nodeContractVersion?: NodeContractVersionV2 }): ProviderStagePacketV2 {
  const stage = benchmarkJson.stages.find((entry) => entry.stage === input.stage) ?? fail('STAGE_MISSING', String(input.stage));
  const nodeContractVersion: NodeContractVersionV2 = input.nodeContractVersion ?? 'V2';
  const packet: ProviderStagePacketV2 = { packetVersion: 'EDITRON_OE_PROVIDER_STAGE_PACKET_V2', authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_OR_PROJECT_MUTATION', stage: input.stage, stageName: stage.name, taskId: input.taskId, conditionId: input.conditionId, inputArm: input.inputArm, executionFormArm: input.executionFormArm, instructions: stageInstructions(input.stage, nodeContractVersion), stageBudget: STAGE_BUDGETS[input.stage], modelInput: input.modelInput, outputContract: outputContract(input.stage, input.taskId, input.executionFormArm, nodeContractVersion) };
  assertNoEvaluatorLeakV2(packet);
  return packet;
}

function stageInstructions(stage: StageV2, nodeContractVersion: NodeContractVersionV2): string[] {
  if (nodeContractVersion === 'V2R' && stage === 2) {
    return [...STAGE_INSTRUCTIONS[2], ...STAGE2_SELECTED_OPERATOR_INSTRUCTIONS_V2R.stage2];
  }
  if (nodeContractVersion === 'V2R' && stage === 3) {
    return [...STAGE_INSTRUCTIONS[3], ...STAGE2_SELECTED_OPERATOR_INSTRUCTIONS_V2R.stage3];
  }
  return STAGE_INSTRUCTIONS[stage];
}

function hashPacket(packet: ProviderStagePacketV2, attachments: HashedStagePacketV2['transportAttachments']): HashedStagePacketV2 {
  return deepFreezeV1({ packet: deepFreezeV1(packet), packetHash: hashCanonicalJsonV1(packet), transportAttachments: deepFreezeV1([...attachments]), transportHash: hashCanonicalJsonV1(attachments) });
}

function visibleEvidence(task: SourceTaskV1, condition: ConditionCaseV2): EvidenceV2[] {
  const original = Array.isArray(task.evidence) ? task.evidence : [task.evidence];
  const variant = task.conditionEvidence.C4_NOISY_OR_MISSING_EVIDENCE;
  const replacements = condition.conditionId === 'BASELINE' ? new Map<string, EvidenceV2>() : new Map(variant.replaceEvidence.map((entry) => [entry.evidenceId, entry]));
  const omitted = new Set(condition.omittedEvidenceIds);
  const visible = original.filter(({ evidenceId }) => !omitted.has(evidenceId)).map((entry) => rewriteEvidenceBinding(replacements.get(entry.evidenceId) ?? entry));
  if (hashCanonicalJsonV1(visible.map(({ evidenceId }) => evidenceId)) !== hashCanonicalJsonV1(condition.availableEvidenceIds)) fail('CONDITION_EVIDENCE_DRIFT', `${task.taskId}/${condition.conditionId}`);
  return visible;
}

function rewriteEvidenceBinding(evidence: EvidenceV2): EvidenceV2 {
  const artifact = (mediaManifestJson.artifacts as MediaArtifactV2[]).find(({ assetId }) => evidence.binding.startsWith(`${assetId}@`));
  if (!artifact) return evidence;
  const revision = evidence.binding.match(/\/R\d+$/)?.[0] ?? '';
  return { ...evidence, binding: `${artifact.assetId}@${artifact.artifactSha256}${revision}` };
}

function mediaForTask(task: SourceTaskV2): MediaArtifactV2[] {
  return task.mediaBindings.map((binding) => {
    const artifact = (mediaManifestJson.artifacts as MediaArtifactV2[]).find(({ assetId }) => assetId === binding.assetId) ?? fail('MEDIA_MISSING', binding.assetId);
    if (artifact.taskId !== task.taskId || artifact.recipeSha256 !== binding.recipeSha256) fail('MEDIA_BINDING_DRIFT', binding.assetId);
    return artifact;
  });
}

function referenceImagesForEvidence(evidence: EvidenceV2[], media: MediaArtifactV2[]): MediaArtifactV2[] {
  const referenceAssetIds = new Set(evidence
    .filter(({ kind }) => kind.startsWith('REFERENCE_'))
    .flatMap(({ binding }) => media.filter(({ assetId }) => binding.startsWith(`${assetId}@`)).map(({ assetId }) => assetId)));
  const images = media.filter(({ assetId, mimeType }) => referenceAssetIds.has(assetId) && mimeType.startsWith('image/'));
  if (!images.length) fail('REFERENCE_IMAGE_MISSING', 'Reference-image evidence arm requires a hash-bound reference image');
  return images;
}

function withoutReferenceAnswerLeak(evidence: EvidenceV2[], referenceMedia: MediaArtifactV2[]): EvidenceV2[] {
  const referenceAssetIds = new Set(referenceMedia.map(({ assetId }) => assetId));
  return evidence.map((entry) => {
    const boundReference = [...referenceAssetIds].some((assetId) => entry.binding.startsWith(`${assetId}@`));
    if (!boundReference || !entry.kind.startsWith('REFERENCE_')) return entry;
    return {
      evidenceId: entry.evidenceId,
      kind: 'REFERENCE_MEDIA_BINDING',
      binding: entry.binding,
      value: { observationRequired: true },
    };
  });
}

function exposedSpecOperators(
  stage: number,
  priorArtifact: PriorArtifactV2,
  nodeContractVersion: NodeContractVersionV2,
): { operators: typeof operatorCatalogJson.operators; referencedIds: Set<string> | null } {
  const referencedIds = stage >= 3
    ? new Set(nodeContractVersion === 'V2R'
      ? referencedOperatorIdsV2R(priorArtifact.nodes)
      : (Array.isArray(priorArtifact.nodes) ? priorArtifact.nodes : [])
        .flatMap((node) => isRecord(node) && Array.isArray(node.candidateCapabilityIds)
          ? node.candidateCapabilityIds.filter((id): id is string => typeof id === 'string')
          : []))
    : null;
  const operators = operatorCatalogJson.operators
    .filter((operator) => !referencedIds || referencedIds.has(operator.operatorId));
  return { operators, referencedIds };
}

function publicOperatorCatalog(
  stage: number,
  priorArtifact: PriorArtifactV2,
  nodeContractVersion: NodeContractVersionV2 = 'V2',
): JsonRecord {
  const { operators: exposed, referencedIds } = exposedSpecOperators(stage, priorArtifact, nodeContractVersion);
  const operators = exposed.map((operator) => {
      const base = {
        operatorId: operator.operatorId,
        kind: operator.kind,
        supportStatus: operator.supportStatus,
        compilerEligibility: operator.compilerEligibility,
        input: operator.input,
        output: operator.output,
        stateEffects: operator.stateEffects,
        proof: operator.proof,
      };
      return stage === 4 ? {
        ...base,
        operatorSpecRef: `EDITRON_OPERATOR_SPECS_V2@${operatorCatalogJson.version}#${operator.operatorId}`,
        ownerRef: publicOperatorOwnerRef(operator as unknown as JsonRecord),
      } : base;
    });
  if (referencedIds && operators.length !== referencedIds.size) {
    const found = new Set(operators.map(({ operatorId }) => operatorId));
    fail('REFERENCED_OPERATOR_MISSING', [...referencedIds].filter((id) => !found.has(id)).join(','));
  }
  return stage === 4
    ? { version: operatorCatalogJson.version, productionEligibility: operatorCatalogJson.productionEligibility, schemaAssembly: operatorCatalogJson.schemaAssembly, fieldSchemas: operatorCatalogJson.fieldSchemas, operators }
    : { version: operatorCatalogJson.version, operators };
}

function stageThreeEvidencePack(
  task: SourceTaskV2,
  condition: ConditionCaseV2,
  source?: StageThreeEvidenceSourceV2,
): JsonRecord {
  const pack = source?.evidencePack
    ?? stageSources(task.taskId).evidencePacks[condition.conditionId]
    ?? fail('STAGE3_EVIDENCE_PACK_MISSING', `${task.taskId}/${condition.conditionId}`);
  if (pack.taskId !== task.taskId || pack.conditionId !== condition.conditionId) {
    fail('STAGE3_EVIDENCE_PACK_MISSING', `${task.taskId}/${condition.conditionId}`);
  }
  const facts = Array.isArray(pack.facts) ? pack.facts.filter(isRecord) : [];
  if (!facts.length || new Set(facts.map(({ factId }) => factId)).size !== facts.length) {
    fail('STAGE3_EVIDENCE_FACT_SET_INVALID', task.taskId);
  }
  const projectFact = facts.find(({ factId }) => factId === 'fact-project-revision');
  if (projectFact?.projectId !== task.projectBinding.projectId
    || projectFact.expectedProjectRevision !== task.projectBinding.projectRevision) {
    fail('STAGE3_PROJECT_BINDING_DRIFT', task.taskId);
  }
  if (task.taskId === 'DEV-01') {
    const sourceFixtureHash = hashCanonicalDev01NativeProxyFixtureV2();
    const sourceFact = facts.find(({ factId }) => factId === 'fact-source-fixture');
    if (pack.sourceFixtureHash !== sourceFixtureHash
      || sourceFact?.sourceFixtureHash !== sourceFixtureHash
      || sourceFact.materializationStatus !== 'NOT_MATERIALIZED_STAGE123') {
      fail('STAGE3_MEDIA_BINDING_DRIFT', 'DEV-01 truthful source fixture');
    }
  } else if (task.taskId === 'DEV-03') {
    const media = new Map(mediaForTask(task).map((artifact) => [artifact.assetId, artifact]));
    const sourceHandles = facts.find(({ factId }) => factId === 'fact-source-handles');
    const measuredBeats = facts.find(({ factId }) => factId === 'fact-measured-beats');
    if (sourceHandles?.sourceArtifactSha256 !== stripSha256Prefix(
      String(media.get('dev03-cards')?.artifactSha256 ?? ''),
    )) {
      fail('STAGE3_MEDIA_BINDING_DRIFT', 'dev03-cards');
    }
    if (measuredBeats && measuredBeats.sourceArtifactSha256 !== stripSha256Prefix(
      String(media.get('dev03-beats')?.artifactSha256 ?? ''),
    )) {
      fail('STAGE3_MEDIA_BINDING_DRIFT', 'dev03-beats');
    }
  } else {
    const media = mediaForTask(task);
    for (const artifact of media) {
      const fact = facts.find(({ factId }) => factId === `fact-source-${artifact.assetId}`);
      if (fact?.assetVersion !== artifact.artifactSha256) fail('STAGE3_MEDIA_BINDING_DRIFT', artifact.assetId);
    }
  }
  if (hashCanonicalJsonV1(pack.visibleEvidenceIds) !== hashCanonicalJsonV1(condition.availableEvidenceIds)) {
    fail('STAGE3_CONDITION_BINDING_DRIFT', `${task.taskId}/${condition.conditionId}`);
  }
  validateStageThreeSupportBinding(task.taskId, facts);
  return pack;
}

function stageFourCompilationSources(
  task: SourceTaskV2,
  condition: ConditionCaseV2,
  evidenceBoundIntent: PriorArtifactV2,
  stageThreePacket: ProviderStagePacketV2,
  nodeContractVersion: NodeContractVersionV2 = 'V2',
): JsonRecord {
  const editorialIntent = stageSources(task.taskId, nodeContractVersion).editorialIntent;
  if (editorialIntent.taskId !== task.taskId) {
    fail('STAGE4_EDITORIAL_INTENT_MISSING', task.taskId);
  }
  const sourceNodes = new Map(records(editorialIntent.nodes).map((node) => [String(node.intentNodeId), node]));
  const boundNodes = new Map(records(evidenceBoundIntent.nodes).map((node) => [String(node.intentNodeId), node]));
  if (!sameStringSet([...sourceNodes.keys()], [...boundNodes.keys()])) {
    fail('STAGE4_INTENT_NODE_DRIFT', task.taskId);
  }
  for (const [intentNodeId, sourceNode] of sourceNodes) {
    const boundNode = boundNodes.get(intentNodeId) ?? fail('STAGE4_INTENT_NODE_MISSING', intentNodeId);
    if (nodeContractVersion === 'V2R') {
      if (selectedOperatorDriftDiagnosticsV2R([sourceNode], [boundNode]).length) {
        fail('STAGE4_CAPABILITY_SET_DRIFT', intentNodeId);
      }
      continue;
    }
    if (!sameStringSet(strings(sourceNode.candidateCapabilityIds), strings(boundNode.candidateCapabilityIds))) {
      fail('STAGE4_CAPABILITY_SET_DRIFT', intentNodeId);
    }
  }
  const evidencePack = stageThreeEvidencePack(task, condition);
  const sourceEditorialIntentHash = hashCanonicalJsonV1(editorialIntent);
  const evidencePackHash = hashCanonicalJsonV1(evidencePack);
  if (stageThreePacket.modelInput.priorArtifactHash !== sourceEditorialIntentHash) {
    fail('STAGE4_SOURCE_INTENT_CHAIN_DRIFT', task.taskId);
  }
  if (!isRecord(stageThreePacket.modelInput.evidencePack)
    || hashCanonicalJsonV1(stageThreePacket.modelInput.evidencePack) !== evidencePackHash) {
    fail('STAGE4_EVIDENCE_PACK_CHAIN_DRIFT', task.taskId);
  }
  return {
    sourceEditorialIntent: editorialIntent,
    sourceEditorialIntentHash,
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(evidenceBoundIntent),
    evidencePack,
    evidencePackHash,
    ...(task.taskId === 'DEV-01' ? {
      nativeProxyFixture: getCanonicalDev01NativeProxyFixtureV2(),
      nativeProxyFixtureHash: hashCanonicalDev01NativeProxyFixtureV2(),
    } : {}),
  };
}

function stageSources(taskId: string, nodeContractVersion: NodeContractVersionV2 = 'V2'): { editorialIntent: JsonRecord; evidencePacks: Record<string, JsonRecord> } {
  if (taskId === 'DEV-01') {
    const source = getCanonicalDev01Stage123V2();
    return {
      editorialIntent: nodeContractVersion === 'V2R' ? source.editorialIntentV2R : source.editorialIntent,
      evidencePacks: source.evidencePacks,
    };
  }
  if (taskId === 'DEV-02') return {
    editorialIntent: nodeContractVersion === 'V2R'
      ? getCanonicalDev02V2RV2().editorialIntent
      : dev02CanonicalIntentJson as unknown as JsonRecord,
    evidencePacks: { BASELINE: dev02Stage3EvidenceJson as unknown as JsonRecord },
  };
  if (taskId === 'DEV-04') {
    const source = getCanonicalDev04ConnectedChainV2();
    return { editorialIntent: source.editorialIntent, evidencePacks: source.evidencePacks };
  }
  return fail('STAGED_TASK_SOURCE_MISSING', taskId);
}

function validateStageThreeSupportBinding(taskId: string, facts: JsonRecord[]): void {
  if (taskId === 'DEV-01') {
    for (const operatorId of [
      'read_project_file', 'get_timeline_view',
      'find_transcript_moment', 'resolve_transcript_edit', 'cut_section',
      'find_visual_moment', 'resolve_keyframe_edit', 'set_keyframes',
      'find_audio_moment', 'apply_audio_ducking',
    ]) {
      const operator = operatorCatalogJson.operators.find((candidate) => candidate.operatorId === operatorId);
      const supportFact = facts.find(({ factId }) => factId === `fact-support-${operatorId}`);
      if (!operator || supportFact?.operatorId !== operatorId
        || supportFact.supportStatus !== operator.supportStatus
        || supportFact.compilerEligibility !== operator.compilerEligibility) {
        fail('STAGE3_SUPPORT_BINDING_DRIFT', `${taskId}/${operatorId}`);
      }
    }
    return;
  }
  if (taskId === 'DEV-02') {
    const generatedOwner = operatorCatalogJson.operators.find(({ operatorId }) => operatorId === 'generated_composition_program');
    const supportFact = facts.find(({ factId }) => factId === 'fact-support-generated-composition');
    if (!generatedOwner || supportFact?.supportStatus !== generatedOwner.supportStatus
      || supportFact.compilerEligibility !== generatedOwner.compilerEligibility) {
      fail('STAGE3_SUPPORT_BINDING_DRIFT', taskId);
    }
    return;
  }
  if (taskId === 'DEV-03') {
    for (const operatorId of [
      'read_project_file', 'get_timeline_view', 'find_audio_moment',
      'sync_cuts_to_beats', 'apply_camera_shake',
    ]) {
      const operator = operatorCatalogJson.operators.find((candidate) => candidate.operatorId === operatorId);
      const supportFact = facts.find(({ factId }) => factId === `fact-support-${operatorId}`);
      if (!operator || supportFact?.operatorId !== operatorId
        || supportFact.supportStatus !== operator.supportStatus
        || supportFact.compilerEligibility !== operator.compilerEligibility) {
        fail('STAGE3_SUPPORT_BINDING_DRIFT', `${taskId}/${operatorId}`);
      }
    }
    return;
  }
  if (taskId === 'DEV-04') {
    const supportFact = facts.find(({ factId }) => factId === 'fact-support-moving-matte');
    if (supportFact?.capabilityId !== 'moving-matte-or-segmentation-track'
      || supportFact.supportStatus !== 'MISSING'
      || supportFact.compilerEligibility !== 'NOT_COMPILABLE') {
      fail('STAGE3_SUPPORT_BINDING_DRIFT', taskId);
    }
  }
}

function stageFourCompilationPolicy(taskId: string): JsonRecord {
  const dev01MutationProxy = taskId === 'DEV-01';
  return {
    policyVersion: 'EDITRON_OE_STAGE4_COMPILATION_POLICY_V2',
    authority: 'SYNTHETIC_RESEARCH_COMPILATION_ONLY_NO_PROJECT_MUTATION',
    operatorSpecRefFormat: `EDITRON_OPERATOR_SPECS_V2@${operatorCatalogJson.version}#<operatorId>`,
    executionRule: 'All required intent nodes must compile before execution eligibility can exceed NOT_EXECUTABLE.',
    inputRule: 'The deterministic evaluator assembles each closed input schema from operator.input and fieldSchemas and rejects missing, additional, ill-typed, out-of-range, or unbound values.',
    supportRules: [
      { match: { compilerEligibility: 'RESEARCH_READ_ONLY' }, disposition: 'RESEARCH_PROXY_ONLY' },
      { match: { supportStatus: 'RESEARCH_ONLY_NOT_IMPLEMENTED' }, disposition: 'FORBIDDEN_DIAGNOSTIC_REQUIRED' },
      { match: { compilerEligibility: 'NOT_COMPILABLE' }, disposition: 'FORBIDDEN_DIAGNOSTIC_REQUIRED' },
      ...(dev01MutationProxy ? [{ match: { compilerEligibility: 'ISOLATED_PROXY_ONLY' }, disposition: 'RESEARCH_PROXY_ONLY' }] : []),
    ],
    resourcePolicies: [
      { resourcePolicyId: 'OE_STAGE4_READ_V1', applicableKinds: ['READ'], maxWallClockMs: 5000, maxMemoryMiB: 128, maxOutputBytes: 1000000, networkPolicy: 'DENY' },
      { resourcePolicyId: 'OE_STAGE4_RESOLVER_V1', applicableKinds: ['RESOLVER'], maxWallClockMs: 10000, maxMemoryMiB: 256, maxOutputBytes: 2000000, networkPolicy: 'DENY' },
      { resourcePolicyId: 'OE_STAGE4_GENERATED_SANDBOX_V1', applicableKinds: ['GENERATED_COMPOSITION'], maxWallClockMs: 30000, maxMemoryMiB: 512, maxOutputBytes: 10000000, networkPolicy: 'DENY', currentEligibility: 'FORBIDDEN_UNTIL_IMPLEMENTED' },
      ...(dev01MutationProxy ? [{ resourcePolicyId: 'OE_STAGE4_MUTATION_PROXY_V1', applicableKinds: ['MUTATION'], maxWallClockMs: 10000, maxMemoryMiB: 256, maxOutputBytes: 2000000, networkPolicy: 'DENY', currentEligibility: 'ISOLATED_IN_MEMORY_CLONE_ONLY' }] : []),
    ],
    referenceRules: {
      reads: 'fact IDs or source artifact references actually consumed',
      writes: 'declared project paths or artifact namespaces; READ and RESOLVER nodes must write nothing',
      outputRefFormat: '<compiledNodeId>.<operatorOutputName>',
      requiresAndProduces: 'produces must contain every operator.output.required name exactly once in outputRefFormat; requires may contain fact IDs, compiled node IDs, or output references declared by another compiled node',
      edges: 'Every edge endpoint must be a compiled nodeId emitted in nodes; never copy a source-intent edge when either endpoint is unresolved or diagnostic-only',
      invalidates: 'READ and RESOLVER nodes are observational or propositional and must use []; invalidations belonging to an unresolved mutating intent remain on the source intent and structured diagnostic',
      traceRefs: 'source intent node, evidence binding, proof, preservation, and policy IDs only',
      ...(dev01MutationProxy ? {
        mutationRule: 'ISOLATED_PROXY_ONLY mutation nodes must declare exact writes, invalidations, exclusive conflict domains, checkpoint-required reversibility, and a writer-receipt revision chain. They never authorize ProjectService or user-project mutation.',
        bindingRule: 'Downstream identities and revisions produced by a mutation must be referenced from that mutation output, never copied from pre-mutation project state.',
      } : {}),
    },
  };
}

function publicCondition(condition: ConditionCaseV2): JsonRecord { return { conditionId: condition.conditionId, availableEvidenceIds: condition.availableEvidenceIds, omittedEvidenceIds: condition.omittedEvidenceIds, replacementEvidenceIds: condition.replacementEvidenceIds ?? [] }; }
function routingExperiment(arm: ExecutionFormArmV2): JsonRecord {
  return {
    arm,
    rule: arm === 'FREE_CHOICE' ? 'Choose NATIVE, GENERATED_COMPOSITION, or HYBRID only after the coverage matrix and hard gates.' : arm === 'FORCED_NATIVE' ? 'Use NATIVE or report a gap.' : arm === 'FORCED_GENERATED_COMPOSITION' ? 'Use GENERATED_COMPOSITION or report a gap.' : arm === 'FORCED_HYBRID' ? 'Use HYBRID or report a gap.' : arm === 'THRESHOLD_ABLATION' ? 'Choose freely without any step-count threshold heuristic.' : 'Choose freely without model-confidence or unsupported taste-score signals.',
    scopeRule: 'executionForm classifies the full requested plan; a generated island with native surrounding editorial is HYBRID.',
    coverageSemantics: {
      COVERED: 'One or more named catalog capabilities structurally realize the claim; this does not assert concrete Stage-3 evidence or runtime arguments.',
      UNCOVERED: 'No proposed capability path structurally realizes the claim.',
      UNVERIFIABLE: 'The supplied blueprint or catalog is insufficient to decide structural coverage; do not use this merely because project IDs, ranges, or other Stage-3 bindings are absent.',
    },
    readinessSemantics: 'hardGateStatus reflects current support/compiler truth. RESEARCH_ONLY_NOT_IMPLEMENTED is never ELIGIBLE, even when it is the correct ideal architectural owner.',
    stageBoundary: 'Put missing project revision, asset identity, source range, rights, or proof bindings in unresolvedRequirements for Stage 3 without confusing them with Stage-2 structural coverage.',
    hardGateOrder: ['hard target and preservation coverage', 'certified owner and support truth', 'source/timebase/range compatibility', 'rights/privacy/egress', 'editability/interchange', 'sandbox/resource/proof'],
  };
}

function outputContract(stage: StageV2, taskId: string, arm: ExecutionFormArmV2 | 'NOT_APPLICABLE_PRE_ROUTING', nodeContractVersion: NodeContractVersionV2 = 'V2'): JsonRecord {
  const artifactType = ['ReferenceBlueprintV2', 'EditorialIntentGraphV2', 'EvidenceBoundIntentGraphV2', 'CompiledOperationGraphV2', 'ProceedOrStopDecisionV2'][stage - 1];
  const source = stage === 3
    ? stageThreeOutputContractV2(taskId)
    : stage === 4
    ? stageFourOutputContractV2(taskId)
    : benchmarkJson.artifactSchemas[artifactType as keyof typeof benchmarkJson.artifactSchemas] as { required: string[]; properties?: JsonRecord };
  const required = ['artifactType', ...source.required];
  const properties = source.properties
    ? JSON.parse(JSON.stringify(source.properties)) as JsonRecord
    : Object.fromEntries(source.required.map((field) => [field, outputFieldSchema(field, artifactType, taskId, arm)]));
  if (nodeContractVersion === 'V2R' && stage === 2) {
    properties.nodes = { type: 'array', items: STAGE2_SELECTED_OPERATOR_NODE_SCHEMA_V2R };
  }
  if (nodeContractVersion === 'V2R' && stage === 3) {
    properties.nodes = { type: 'array', minItems: 1, items: STAGE3_SELECTED_OPERATOR_NODE_SCHEMA_V2R };
  }
  properties.artifactType = { const: artifactType };
  properties.taskId = { const: taskId };
  if (stage === 2) properties.executionForm = outputFieldSchema('executionForm', artifactType, taskId, arm);
  return { type: 'object', required, properties, additionalProperties: false };
}

function stageThreeOutputContractV2(taskId: string): { required: string[]; properties: JsonRecord } {
  const string = { type: 'string', minLength: 1 };
  const strings = { type: 'array', items: string, uniqueItems: true };
  const proofKinds = [
    'REVISION_FRESHNESS', 'ASSET_IDENTITY_RIGHTS', 'SOURCE_RANGE_HANDLES',
    'RENDERED_GEOMETRY', 'RENDERED_LEGIBILITY', 'BOUNDARY_CONTINUITY',
    'SANDBOX_COMPILE', 'STATE_RELOAD',
    ...(taskId === 'DEV-01' ? ['SPEECH_PRESERVATION', 'RENDERED_AUDIO_MIX'] : []),
    ...(taskId === 'DEV-03' ? [
      'MEASURED_BEAT_PROVENANCE', 'SOURCE_HANDLE_LEGALITY',
      'PROTECTED_AUDIO_BYTES_AND_TIMING', 'RENDERED_BOUNDARY_TIMING',
      'RENDERED_SHAKE_AND_NEUTRAL_RETURN',
    ] : []),
  ];
  return {
    required: ['taskId', 'stageDisposition', 'nodes', 'evidenceBindings', 'rightsDecision', 'privacyDecision', 'revisionBinding', 'preservationBindings', 'proofPlan', 'unresolvedRequirements'],
    properties: {
      taskId: string,
      stageDisposition: { type: 'string', enum: ['READY_FOR_COMPILATION', 'CAPABILITY_GAP', 'POLICY_BLOCKED', 'CONFLICT', 'UNVERIFIABLE'] },
      nodes: { type: 'array', minItems: 1, items: { type: 'object', required: ['intentNodeId', 'candidateCapabilityIds', 'evidenceBindingIds', 'preservationIds', 'proofObligationIds', 'bindingStatus', 'unresolvedRequirementIds'], properties: { intentNodeId: string, candidateCapabilityIds: strings, evidenceBindingIds: strings, preservationIds: strings, proofObligationIds: strings, bindingStatus: { type: 'string', enum: ['BOUND', 'PARTIAL', 'UNVERIFIABLE'] }, unresolvedRequirementIds: strings }, additionalProperties: false } },
      evidenceBindings: { type: 'array', minItems: 1, items: { type: 'object', required: ['bindingId', 'factIds', 'nodeIds', 'status'], properties: { bindingId: string, factIds: strings, nodeIds: { ...strings, minItems: 1 }, status: { type: 'string', enum: ['BOUND', 'PARTIAL', 'UNVERIFIABLE'] } }, additionalProperties: false } },
      rightsDecision: { type: 'object', required: ['decisionId', 'status', 'policyFactIds', 'allowedAssetIds', 'deniedActions', 'reasonCodes'], properties: { decisionId: string, status: { type: 'string', enum: ['COMPLIANT', 'POLICY_BLOCKED', 'UNVERIFIABLE'] }, policyFactIds: { ...strings, minItems: 1 }, allowedAssetIds: strings, deniedActions: strings, reasonCodes: { ...strings, minItems: 1 } }, additionalProperties: false },
      privacyDecision: { type: 'object', required: ['decisionId', 'status', 'policyFactIds', 'egressDisposition', 'reasonCodes'], properties: { decisionId: string, status: { type: 'string', enum: ['COMPLIANT', 'POLICY_BLOCKED', 'UNVERIFIABLE'] }, policyFactIds: { ...strings, minItems: 1 }, egressDisposition: { type: 'string', enum: ['DENIED', 'ALLOWED', 'UNVERIFIABLE'] }, reasonCodes: { ...strings, minItems: 1 } }, additionalProperties: false },
      revisionBinding: { type: 'object', required: ['projectId', 'expectedProjectRevision', 'timebaseFactId', 'status'], properties: { projectId: string, expectedProjectRevision: string, timebaseFactId: string, status: { type: 'string', enum: ['BOUND', 'CONFLICT', 'UNVERIFIABLE'] } }, additionalProperties: false },
      preservationBindings: { type: 'array', minItems: 1, items: { type: 'object', required: ['preservationId', 'factIds', 'status'], properties: { preservationId: string, factIds: { ...strings, minItems: 1 }, status: { type: 'string', enum: ['BOUND', 'PARTIAL', 'UNVERIFIABLE'] } }, additionalProperties: false } },
      proofPlan: { type: 'array', minItems: 1, items: { type: 'object', required: ['proofObligationId', 'kind', 'nodeIds', 'targetClaimIds', 'requiredFactIds', 'status'], properties: { proofObligationId: string, kind: { type: 'string', enum: proofKinds }, nodeIds: { ...strings, minItems: 1 }, targetClaimIds: strings, requiredFactIds: strings, status: { type: 'string', enum: ['PLANNED', 'UNVERIFIABLE'] } }, additionalProperties: false } },
      unresolvedRequirements: { type: 'array', items: { type: 'object', required: ['requirementId', 'kind', 'factIds', 'disposition'], properties: { requirementId: string, kind: { type: 'string', enum: ['EVIDENCE', 'CAPABILITY', 'AMBIGUITY', 'POLICY', 'CONFLICT'] }, factIds: strings, disposition: { type: 'string', enum: ['CAPABILITY_GAP', 'UNVERIFIABLE', 'NEEDS_REVIEW', 'POLICY_BLOCKED', 'CONFLICT'] }, failureDisposition: { type: 'string', enum: ['STOP_BEFORE_COMPILATION_OR_RENDER'] } }, additionalProperties: false } },
    },
  };
}

function stageFourOutputContractV2(taskId: string): { required: string[]; properties: JsonRecord } {
  const string = { type: 'string', minLength: 1 };
  const strings = { type: 'array', items: string, uniqueItems: true };
  const coordinateBinding = {
    type: 'object',
    required: ['coordinateDomain', 'timebaseFactIds', 'rangeFactIds', 'assetFactIds'],
    properties: {
      coordinateDomain: { type: 'string', enum: ['SOURCE_PTS', 'SOURCE_FRAME', 'SOURCE_SAMPLE', 'PROJECT_TICK', 'COMPOSITION_TICK', 'STILL_IMAGE'] },
      timebaseFactIds: strings,
      rangeFactIds: strings,
      assetFactIds: strings,
    },
    additionalProperties: false,
  };
  const node = {
    type: 'object',
    required: ['nodeId', 'intentNodeId', 'operatorId', 'operatorSpecRef', 'ownerRef', 'inputs', 'reads', 'writes', 'requires', 'produces', 'invalidates', 'coordinateBindings', 'revisionBinding', 'stabilityRequirement', 'stateEffects', 'idempotency', 'proofObligationIds', 'failureDisposition', 'retryDisposition', 'policyFactIds', 'concurrency', 'resourcePolicyId', 'reversibility', 'traceRefs'],
    properties: {
      nodeId: string,
      intentNodeId: string,
      operatorId: string,
      operatorSpecRef: string,
      ownerRef: string,
      inputs: { type: 'object' },
      reads: strings,
      writes: strings,
      requires: strings,
      produces: strings,
      invalidates: strings,
      coordinateBindings: { type: 'array', items: coordinateBinding },
      revisionBinding: { type: 'object', required: ['projectId', 'expectedProjectRevision'], properties: { projectId: string, expectedProjectRevision: string }, additionalProperties: false },
      stabilityRequirement: { type: 'string', enum: ['NONE', 'RANGE_STABLE', 'PICTURE_LOCK', 'FINAL_CONFORM'] },
      stateEffects: strings,
      idempotency: { type: 'object', required: ['scope', 'keyMaterialRefs'], properties: { scope: { type: 'string', enum: ['ACTOR_PROJECT', 'PROJECT_REVISION', 'ARTIFACT_ONLY'] }, keyMaterialRefs: { ...strings, minItems: 1 } }, additionalProperties: false },
      proofObligationIds: strings,
      failureDisposition: { type: 'string', enum: ['ABORT_GRAPH'] },
      retryDisposition: { type: 'string', enum: ['NEVER_RETRY', 'TRANSIENT_SAME_COMMAND', 'REBASE_REQUIRED'] },
      policyFactIds: { ...strings, minItems: 1 },
      concurrency: { type: 'object', required: ['class', 'conflictDomainRefs'], properties: { class: { type: 'string', enum: ['READ_SHARED', 'RESOLVER_ISOLATED', 'MUTATION_EXCLUSIVE', 'GENERATED_SANDBOX_ISOLATED'] }, conflictDomainRefs: strings }, additionalProperties: false },
      resourcePolicyId: { type: 'string', enum: [
        'OE_STAGE4_READ_V1', 'OE_STAGE4_RESOLVER_V1', 'OE_STAGE4_GENERATED_SANDBOX_V1',
        ...(taskId === 'DEV-01' ? ['OE_STAGE4_MUTATION_PROXY_V1'] : []),
      ] },
      reversibility: { type: 'object', required: ['disposition', 'undoBindingRefs'], properties: { disposition: { type: 'string', enum: ['NOT_APPLICABLE_READ_ONLY', 'CHECKPOINT_REQUIRED', 'UNSAFE_UNDO_BLOCKED'] }, undoBindingRefs: strings }, additionalProperties: false },
      traceRefs: { ...strings, minItems: 1 },
    },
    additionalProperties: false,
  };
  const diagnosticProperties: JsonRecord = {
    diagnosticId: string,
    code: { type: 'string', enum: ['CAPABILITY_NOT_IMPLEMENTED', 'OPERATOR_NOT_COMPILABLE', 'OPERATOR_SELECTION_AMBIGUOUS', 'INPUT_BINDING_MISSING', 'INPUT_BINDING_INVALID', 'POLICY_BLOCKED', 'REVISION_CONFLICT', 'DEPENDENCY_BLOCKED', 'SCHEMA_UNVERIFIABLE'] },
    intentNodeIds: { ...strings, minItems: 1 },
    operatorIds: strings,
    factIds: strings,
    disposition: { type: 'string', enum: ['CAPABILITY_GAP', 'POLICY_BLOCKED', 'CONFLICT', 'FAIL', 'UNVERIFIABLE'] },
  };
  if (taskId === 'DEV-04') diagnosticProperties.capabilityIds = strings;
  const diagnostic = {
    type: 'object',
    required: ['diagnosticId', 'code', 'intentNodeIds', 'operatorIds', 'factIds', 'disposition'],
    properties: diagnosticProperties,
    additionalProperties: false,
  };
  return {
    required: ['taskId', 'compileDisposition', 'executionEligibility', 'sourceEditorialIntentHash', 'sourceEvidenceBoundIntentHash', 'evidencePackHash', 'operatorCatalogVersion', 'projectId', 'expectedProjectRevision', 'nodes', 'edges', 'proofPolicy', 'diagnostics', 'unresolvedIntentNodeIds'],
    properties: {
      taskId: string,
      compileDisposition: { type: 'string', enum: ['COMPILED_RESEARCH_PROXY', 'CAPABILITY_GAP', 'POLICY_BLOCKED', 'CONFLICT', 'UNVERIFIABLE', 'FAIL'] },
      executionEligibility: { type: 'string', enum: ['RESEARCH_PROXY_ONLY', 'NOT_EXECUTABLE'] },
      sourceEditorialIntentHash: string,
      sourceEvidenceBoundIntentHash: string,
      evidencePackHash: string,
      operatorCatalogVersion: { const: operatorCatalogJson.version },
      projectId: string,
      expectedProjectRevision: string,
      nodes: { type: 'array', items: node, uniqueItems: true },
      edges: { type: 'array', items: { type: 'object', required: ['edgeId', 'fromNodeId', 'toNodeId', 'edgeType'], properties: { edgeId: string, fromNodeId: string, toNodeId: string, edgeType: { type: 'string', enum: ['DATA', 'TIME_ANCHOR', 'READ_AFTER_WRITE', 'WRITE_CONFLICT', 'APPROVAL_POLICY', 'PROOF'] } }, additionalProperties: false }, uniqueItems: true },
      proofPolicy: { type: 'object', required: ['proofVersion', 'mode', 'proofObligationIds', 'preservationIds', 'onUnverifiable'], properties: { proofVersion: string, mode: { type: 'string', enum: ['ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION'] }, proofObligationIds: { ...strings, minItems: 1 }, preservationIds: { ...strings, minItems: 1 }, onUnverifiable: { type: 'string', enum: ['BLOCK_EXECUTION'] } }, additionalProperties: false },
      diagnostics: { type: 'array', items: diagnostic, uniqueItems: true },
      unresolvedIntentNodeIds: strings,
    },
  };
}

function outputFieldSchema(field: string, artifactType: string, taskId: string, arm: ExecutionFormArmV2 | 'NOT_APPLICABLE_PRE_ROUTING'): JsonRecord {
  if (field === 'artifactType') return { const: artifactType };
  if (field === 'taskId') return { const: taskId };
  if (field === 'executionForm') {
    const all = ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID'];
    const forced = arm === 'FORCED_NATIVE' ? ['NATIVE'] : arm === 'FORCED_GENERATED_COMPOSITION' ? ['GENERATED_COMPOSITION'] : arm === 'FORCED_HYBRID' ? ['HYBRID'] : all;
    return { type: 'string', enum: [...forced, 'CAPABILITY_GAP'] };
  }
  if (field === 'disposition') return { type: 'string', enum: ['PROCEED', 'CLARIFICATION_REQUIRED', 'CAPABILITY_GAP', 'POLICY_BLOCKED', 'CONFLICT', 'FAIL', 'UNVERIFIABLE'] };
  if (['reasonCode', 'userMessage', 'operatorCatalogVersion', 'expectedProjectRevision'].includes(field)) return { type: 'string', minLength: 1 };
  if (field.endsWith('Ids') || ['observableTargets', 'layoutAndMotion', 'audioIntent', 'preservationIntents'].includes(field)) return { type: 'array', items: { type: 'string' }, uniqueItems: true };
  if (['temporalStructure', 'uncertainties', 'nodes', 'edges', 'unresolvedRequirements', 'evidenceBindings'].includes(field)) return { type: 'array', items: { type: 'object' } };
  return { type: 'object' };
}

export function assertNoEvaluatorLeakV2(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(assertNoEvaluatorLeakV2); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { if (FORBIDDEN_KEYS.has(key)) fail('EVALUATOR_LEAK', `Forbidden provider key: ${key}`); assertNoEvaluatorLeakV2(child); }
}

export function validateProviderStageArtifactV2(
  packet: HashedStagePacketV2,
  artifact: unknown,
): readonly string[] {
  return deepFreezeV1(validateArtifactV2(artifact, packet.packet.outputContract, '$'));
}

function developmentTasksV2(): SourceTaskV2[] { return (tasksV2Json.tasks as unknown as SourceTaskV2[]).filter(({ split, sealed }) => split === 'DEVELOPMENT' && !sealed); }
function telemetryZero(field: string): unknown { return field === 'provider' ? 'NO_PROVIDER' : field === 'model' ? 'NO_MODEL' : field === 'finishReason' ? 'NOT_DISPATCHED_V2_1B' : field === 'parseStatus' ? 'NOT_ATTEMPTED' : field === 'truncated' ? false : field === 'schemaDiagnostics' ? [] : field === 'inputArm' || field === 'executionFormArm' ? 'VARIES_BY_PLAN_ROW' : field === 'providerRequestId' || field === 'artifactSha256' ? null : 0; }
function fail(code: string, message: string): never { throw new StagedPacketErrorV2(code, message); }

function rationalTimebase(timebaseId: string, fps: number): JsonRecord {
  if (!Number.isSafeInteger(fps) || fps <= 0) fail('NON_RATIONAL_PROJECT_RATE', `${timebaseId}/${fps}`);
  return { timebaseId, timebaseVersion: 'V2_1F', rate: { numerator: String(fps), denominator: '1' }, coordinateDomain: 'PROJECT_TICK' };
}

function sourceCoordinateFact(artifact: MediaArtifactV2): JsonRecord {
  const technical = artifact.technical;
  if (typeof technical.fps === 'number' && typeof technical.frames === 'number') return {
    assetId: artifact.assetId, assetVersion: artifact.artifactSha256, coordinateDomain: 'SOURCE_FRAME',
    timebase: rationalTimebase(`${artifact.assetId}:source`, technical.fps), extent: { start: '0', endExclusive: String(technical.frames) },
  };
  if (typeof technical.sampleRate === 'number' && typeof technical.sampleCount === 'number') return {
    assetId: artifact.assetId, assetVersion: artifact.artifactSha256, coordinateDomain: 'SOURCE_SAMPLE',
    timebase: { timebaseId: `${artifact.assetId}:samples`, timebaseVersion: 'V2_1F', rate: { numerator: String(technical.sampleRate), denominator: '1' }, coordinateDomain: 'SOURCE_SAMPLE' },
    extent: { start: '0', endExclusive: String(technical.sampleCount) },
  };
  return { assetId: artifact.assetId, assetVersion: artifact.artifactSha256, coordinateDomain: 'STILL_IMAGE' };
}

function validateArtifactV2(value: unknown, schema: unknown, path: string): string[] {
  if (!isRecord(schema)) return [`${path}:INVALID_SCHEMA`];
  if ('const' in schema && value !== schema.const) return [`${path}:CONST`];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [`${path}:ENUM`];
  if (schema.type === 'string') return typeof value === 'string' && (!schema.minLength || value.length >= Number(schema.minLength)) ? [] : [`${path}:STRING`];
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${path}:ARRAY`];
    const diagnostics = value.flatMap((entry, index) => validateArtifactV2(entry, schema.items, `${path}[${index}]`));
    if (schema.minItems && value.length < Number(schema.minItems)) diagnostics.push(`${path}:MIN_ITEMS`);
    if (schema.uniqueItems === true && new Set(value.map((entry) => hashCanonicalJsonV1(entry))).size !== value.length) diagnostics.push(`${path}:UNIQUE`);
    return diagnostics;
  }
  if (schema.type === 'object') {
    if (!isRecord(value)) return [`${path}:OBJECT`];
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const diagnostics = (Array.isArray(schema.required) ? schema.required : [])
      .filter((field): field is string => typeof field === 'string' && !(field in value)).map((field) => `${path}.${field}:REQUIRED`);
    if (schema.additionalProperties === false) for (const field of Object.keys(value)) if (!(field in properties)) diagnostics.push(`${path}.${field}:ADDITIONAL`);
    for (const [field, child] of Object.entries(value)) if (field in properties) diagnostics.push(...validateArtifactV2(child, properties[field], `${path}.${field}`));
    return diagnostics;
  }
  return [];
}

function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stripSha256Prefix(value: string): string { return value.startsWith('sha256:') ? value.slice(7) : value; }
function publicOperatorOwnerRef(operator: JsonRecord): string {
  if (typeof operator.ownerRef === 'string' && operator.ownerRef) return operator.ownerRef;
  const owner = isRecord(operator.owner) ? operator.owner : {};
  if (typeof owner.path === 'string' && typeof owner.symbol === 'string') return `${owner.path}#${owner.symbol}`;
  fail('OPERATOR_OWNER_REF_MISSING', String(operator.operatorId ?? 'unknown'));
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function sameStringSet(left: string[], right: string[]): boolean { return left.length === right.length && left.every((value) => right.includes(value)); }
