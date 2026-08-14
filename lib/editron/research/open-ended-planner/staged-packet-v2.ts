import benchmarkJson from '@/tests/fixtures/editron/open-ended-planner-v2/benchmark-contract-v2.json';
import mediaManifestJson from '@/tests/fixtures/editron/open-ended-planner-v2/development-media-manifest-v2.json';
import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';
import tasksV2Json from '@/tests/fixtures/editron/open-ended-planner-v2/tasks-v2.json';
import developmentV1Json from '@/tests/fixtures/editron/open-ended-planner-v1/development-tasks-v1.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  hashTemporalReferenceEvidenceV2,
  type TemporalReferenceEvidenceV2,
} from './media-materializer-v2';

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

interface StageBudgetV2 { maxInputTokens: number; maxVisibleOutputTokens: number; maxReasoningTokens: number; maxWallClockMs: number; maxProviderCostUsd: number }

const STAGE_BUDGETS: Record<StageV2, StageBudgetV2> = {
  1: { maxInputTokens: 30000, maxVisibleOutputTokens: 10000, maxReasoningTokens: 3000, maxWallClockMs: 90000, maxProviderCostUsd: 0.35 },
  2: { maxInputTokens: 50000, maxVisibleOutputTokens: 4000, maxReasoningTokens: 3200, maxWallClockMs: 40000, maxProviderCostUsd: 0.27 },
  3: { maxInputTokens: 6500, maxVisibleOutputTokens: 1400, maxReasoningTokens: 2200, maxWallClockMs: 35000, maxProviderCostUsd: 0.09 },
  4: { maxInputTokens: 7500, maxVisibleOutputTokens: 2000, maxReasoningTokens: 3800, maxWallClockMs: 45000, maxProviderCostUsd: 0.15 },
  5: { maxInputTokens: 3000, maxVisibleOutputTokens: 800, maxReasoningTokens: 1800, maxWallClockMs: 30000, maxProviderCostUsd: 0.08 },
};

const STAGE_INSTRUCTIONS: Record<StageV2, string[]> = {
  1: ['Reconstruct only the visible and audible target.', 'Separate global editorial language, recurring design grammar, and bounded unique moments.', 'Express hard and soft results as measurable target claims with explicit coordinate scopes.', 'Do not select operators or an execution form.', 'State uncertainty when evidence is absent or noisy.'],
  2: ['Select editorial operations and their dependencies.', 'Prove hard-target coverage for every candidate execution form.', 'Classify a bounded generated island as GENERATED_COMPOSITION and a full native plan surrounding an island as HYBRID.', 'Obey the assigned routing experiment.', 'Do not serialize exact runtime arguments yet.'],
  3: ['Bind every intent to supplied evidence, rights, privacy, revision, preservation, and proof requirements.', 'Do not invent evidence or capability.'],
  4: ['Compile the evidence-bound intent into exact catalog operator IDs and closed input fields.', 'Non-compilable operators require diagnostics, never invented replacements.'],
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
}): HashedStagePacketV2 {
  if (input.previousPacket.packet.stage !== input.stage - 1) fail('NON_SEQUENTIAL_STAGE', 'Stages must be built sequentially');
  const expectedType = ['ReferenceBlueprintV2', 'EditorialIntentGraphV2', 'EvidenceBoundIntentGraphV2', 'CompiledOperationGraphV2'][input.stage - 2];
  if (input.priorArtifact.artifactType !== expectedType || input.priorArtifact.taskId !== input.previousPacket.packet.taskId) fail('PRIOR_ARTIFACT_MISMATCH', `Stage ${input.stage} requires ${expectedType} for the same task`);
  const diagnostics = validateArtifactV2(input.priorArtifact, input.previousPacket.packet.outputContract, '$');
  if (diagnostics.length) fail('PRIOR_ARTIFACT_SCHEMA_INVALID', diagnostics.join('; '));
  const sourceTask = developmentTasksV2().find(({ taskId }) => taskId === input.previousPacket.packet.taskId) ?? fail('TASK_MISSING', 'Development task disappeared');
  const condition = sourceTask.conditionCases.find(({ conditionId }) => conditionId === input.previousPacket.packet.conditionId) ?? fail('CONDITION_MISSING', 'Condition disappeared');
  const modelInput: JsonRecord = {
    priorArtifact: input.priorArtifact,
    priorArtifactHash: hashCanonicalJsonV1(input.priorArtifact),
    condition: publicCondition(condition),
    ...(input.stage <= 4 ? { operatorCatalog: publicOperatorCatalog(input.stage) } : {}),
    ...(input.stage === 2 ? { routingExperiment: routingExperiment(input.executionFormArm) } : {}),
  };
  const packet = packetBase({
    stage: input.stage, taskId: sourceTask.taskId, conditionId: condition.conditionId,
    inputArm: input.previousPacket.packet.inputArm, executionFormArm: input.executionFormArm,
    modelInput,
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

function packetBase(input: { stage: StageV2; taskId: string; conditionId: string; inputArm: InputArmV2; executionFormArm: ExecutionFormArmV2 | 'NOT_APPLICABLE_PRE_ROUTING'; modelInput: JsonRecord }): ProviderStagePacketV2 {
  const stage = benchmarkJson.stages.find((entry) => entry.stage === input.stage) ?? fail('STAGE_MISSING', String(input.stage));
  const packet: ProviderStagePacketV2 = { packetVersion: 'EDITRON_OE_PROVIDER_STAGE_PACKET_V2', authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_OR_PROJECT_MUTATION', stage: input.stage, stageName: stage.name, taskId: input.taskId, conditionId: input.conditionId, inputArm: input.inputArm, executionFormArm: input.executionFormArm, instructions: STAGE_INSTRUCTIONS[input.stage], stageBudget: STAGE_BUDGETS[input.stage], modelInput: input.modelInput, outputContract: outputContract(input.stage, input.taskId, input.executionFormArm) };
  assertNoEvaluatorLeakV2(packet);
  return packet;
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

function publicOperatorCatalog(stage: number): JsonRecord {
  const operators = operatorCatalogJson.operators.map((operator) => ({ operatorId: operator.operatorId, kind: operator.kind, supportStatus: operator.supportStatus, compilerEligibility: operator.compilerEligibility, input: operator.input, output: operator.output, stateEffects: operator.stateEffects, proof: operator.proof }));
  return stage === 4 ? { version: operatorCatalogJson.version, fieldSchemas: operatorCatalogJson.fieldSchemas, operators } : { version: operatorCatalogJson.version, operators };
}

function publicCondition(condition: ConditionCaseV2): JsonRecord { return { conditionId: condition.conditionId, availableEvidenceIds: condition.availableEvidenceIds, omittedEvidenceIds: condition.omittedEvidenceIds, replacementEvidenceIds: condition.replacementEvidenceIds ?? [] }; }
function routingExperiment(arm: ExecutionFormArmV2): JsonRecord {
  return {
    arm,
    rule: arm === 'FREE_CHOICE' ? 'Choose NATIVE, GENERATED_COMPOSITION, or HYBRID only after the coverage matrix and hard gates.' : arm === 'FORCED_NATIVE' ? 'Use NATIVE or report a gap.' : arm === 'FORCED_GENERATED_COMPOSITION' ? 'Use GENERATED_COMPOSITION or report a gap.' : arm === 'FORCED_HYBRID' ? 'Use HYBRID or report a gap.' : arm === 'THRESHOLD_ABLATION' ? 'Choose freely without any step-count threshold heuristic.' : 'Choose freely without model-confidence or unsupported taste-score signals.',
    scopeRule: 'executionForm classifies the full requested plan; a generated island with native surrounding editorial is HYBRID.',
    hardGateOrder: ['hard target and preservation coverage', 'certified owner and support truth', 'source/timebase/range compatibility', 'rights/privacy/egress', 'editability/interchange', 'sandbox/resource/proof'],
  };
}

function outputContract(stage: StageV2, taskId: string, arm: ExecutionFormArmV2 | 'NOT_APPLICABLE_PRE_ROUTING'): JsonRecord {
  const artifactType = ['ReferenceBlueprintV2', 'EditorialIntentGraphV2', 'EvidenceBoundIntentGraphV2', 'CompiledOperationGraphV2', 'ProceedOrStopDecisionV2'][stage - 1];
  const source = benchmarkJson.artifactSchemas[artifactType as keyof typeof benchmarkJson.artifactSchemas] as { required: string[]; properties?: JsonRecord };
  const required = ['artifactType', ...source.required];
  const properties = source.properties
    ? JSON.parse(JSON.stringify(source.properties)) as JsonRecord
    : Object.fromEntries(source.required.map((field) => [field, outputFieldSchema(field, artifactType, taskId, arm)]));
  properties.artifactType = { const: artifactType };
  properties.taskId = { const: taskId };
  if (stage === 2) properties.executionForm = outputFieldSchema('executionForm', artifactType, taskId, arm);
  return { type: 'object', required, properties, additionalProperties: false };
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
