import benchmarkJson from '@/tests/fixtures/editron/open-ended-planner-v2/benchmark-contract-v2.json';
import mediaManifestJson from '@/tests/fixtures/editron/open-ended-planner-v2/development-media-manifest-v2.json';
import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';
import tasksV2Json from '@/tests/fixtures/editron/open-ended-planner-v2/tasks-v2.json';
import developmentV1Json from '@/tests/fixtures/editron/open-ended-planner-v1/development-tasks-v1.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const INPUT_ARMS_V2 = ['MULTIMODAL', 'TEXT_EVIDENCE_ONLY'] as const;
export const EXECUTION_FORM_ARMS_V2 = [
  'FREE_CHOICE', 'FORCED_NATIVE', 'FORCED_GENERATED_COMPOSITION',
  'FORCED_HYBRID', 'THRESHOLD_ABLATION', 'SIGNAL_ABLATION',
] as const;

type InputArmV2 = typeof INPUT_ARMS_V2[number];
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
  transportAttachments: ReadonlyArray<{ assetId: string; mimeType: string; artifactPath: string; artifactSha256: string; bytes: number }>;
  transportHash: string;
}

interface StageBudgetV2 { maxInputTokens: number; maxVisibleOutputTokens: number; maxReasoningTokens: number; maxWallClockMs: number; maxProviderCostUsd: number }

const STAGE_BUDGETS: Record<StageV2, StageBudgetV2> = {
  1: { maxInputTokens: 6000, maxVisibleOutputTokens: 1200, maxReasoningTokens: 1800, maxWallClockMs: 30000, maxProviderCostUsd: 0.08 },
  2: { maxInputTokens: 7000, maxVisibleOutputTokens: 1600, maxReasoningTokens: 2400, maxWallClockMs: 40000, maxProviderCostUsd: 0.10 },
  3: { maxInputTokens: 6500, maxVisibleOutputTokens: 1400, maxReasoningTokens: 2200, maxWallClockMs: 35000, maxProviderCostUsd: 0.09 },
  4: { maxInputTokens: 7500, maxVisibleOutputTokens: 2000, maxReasoningTokens: 3800, maxWallClockMs: 45000, maxProviderCostUsd: 0.15 },
  5: { maxInputTokens: 3000, maxVisibleOutputTokens: 800, maxReasoningTokens: 1800, maxWallClockMs: 30000, maxProviderCostUsd: 0.08 },
};

const STAGE_INSTRUCTIONS: Record<StageV2, string[]> = {
  1: ['Reconstruct only the visible and audible target.', 'Do not select operators or an execution form.', 'State uncertainty when evidence is absent or noisy.'],
  2: ['Select editorial operations and their order.', 'Obey the assigned routing experiment.', 'Do not serialize exact runtime arguments yet.'],
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

export function buildNextProviderStagePacketV2(input: {
  previousPacket: HashedStagePacketV2;
  stage: 2 | 3 | 4 | 5;
  executionFormArm: ExecutionFormArmV2;
  priorArtifact: PriorArtifactV2;
}): HashedStagePacketV2 {
  if (input.previousPacket.packet.stage !== input.stage - 1) fail('NON_SEQUENTIAL_STAGE', 'Stages must be built sequentially');
  const expectedType = ['ReferenceBlueprintV2', 'EditorialIntentGraphV2', 'EvidenceBoundIntentGraphV2', 'CompiledOperationGraphV2'][input.stage - 2];
  if (input.priorArtifact.artifactType !== expectedType || input.priorArtifact.taskId !== input.previousPacket.packet.taskId) fail('PRIOR_ARTIFACT_MISMATCH', `Stage ${input.stage} requires ${expectedType} for the same task`);
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
  const evidence = visibleEvidence(v1, condition);
  const media = mediaForTask(task);
  const modelInput = {
    originalRequest: task.originalRequest,
    projectFacts: { projectId: v1.project.projectId, projectRevision: v1.project.projectRevision, fps: v1.project.fps, canvas: v1.project.canvas, durationFrames: v1.project.durationFrames, assets: v1.project.assets.map(({ assetId, type, rightsStatus }) => ({ assetId, type, rightsStatus })) },
    condition: publicCondition(condition),
    evidence,
    mediaDescriptors: inputArm === 'MULTIMODAL' ? media.map(({ assetId, mimeType, artifactSha256, technical }) => ({ assetId, mimeType, artifactSha256, technical })) : [],
    mediaPolicy: inputArm === 'MULTIMODAL' ? 'ATTACH_HASH_BOUND_MEDIA' : 'NO_MEDIA_BYTES_OR_PATHS',
  };
  const packet = packetBase({ stage: 1, taskId: task.taskId, conditionId: condition.conditionId, inputArm, executionFormArm: 'NOT_APPLICABLE_PRE_ROUTING', modelInput });
  const attachments = inputArm === 'MULTIMODAL' ? media.map(({ assetId, mimeType, artifactPath, artifactSha256, bytes }) => ({ assetId, mimeType, artifactPath, artifactSha256, bytes })) : [];
  return hashPacket(packet, attachments);
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

function publicOperatorCatalog(stage: number): JsonRecord {
  const operators = operatorCatalogJson.operators.map((operator) => ({ operatorId: operator.operatorId, kind: operator.kind, supportStatus: operator.supportStatus, compilerEligibility: operator.compilerEligibility, input: operator.input, output: operator.output, stateEffects: operator.stateEffects, proof: operator.proof }));
  return stage === 4 ? { version: operatorCatalogJson.version, fieldSchemas: operatorCatalogJson.fieldSchemas, operators } : { version: operatorCatalogJson.version, operators };
}

function publicCondition(condition: ConditionCaseV2): JsonRecord { return { conditionId: condition.conditionId, availableEvidenceIds: condition.availableEvidenceIds, omittedEvidenceIds: condition.omittedEvidenceIds, replacementEvidenceIds: condition.replacementEvidenceIds ?? [] }; }
function routingExperiment(arm: ExecutionFormArmV2): JsonRecord { return { arm, rule: arm === 'FREE_CHOICE' ? 'Choose NATIVE, GENERATED_COMPOSITION, or HYBRID from evidence.' : arm === 'FORCED_NATIVE' ? 'Use NATIVE or report a gap.' : arm === 'FORCED_GENERATED_COMPOSITION' ? 'Use GENERATED_COMPOSITION or report a gap.' : arm === 'FORCED_HYBRID' ? 'Use HYBRID or report a gap.' : arm === 'THRESHOLD_ABLATION' ? 'Choose freely without any step-count threshold heuristic.' : 'Choose freely without model-confidence or unsupported taste-score signals.' }; }

function outputContract(stage: StageV2, taskId: string, arm: ExecutionFormArmV2 | 'NOT_APPLICABLE_PRE_ROUTING'): JsonRecord {
  const artifactType = ['ReferenceBlueprintV2', 'EditorialIntentGraphV2', 'EvidenceBoundIntentGraphV2', 'CompiledOperationGraphV2', 'ProceedOrStopDecisionV2'][stage - 1];
  const source = benchmarkJson.artifactSchemas[artifactType as keyof typeof benchmarkJson.artifactSchemas];
  const required = ['artifactType', ...source.required];
  const properties = Object.fromEntries(required.map((field) => [field, outputFieldSchema(field, artifactType, taskId, arm)]));
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
