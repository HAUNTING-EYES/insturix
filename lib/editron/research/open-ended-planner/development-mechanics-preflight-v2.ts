import canonicalBlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import canonicalIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildGeneratedCompositionModelBenchmarkPlanV1,
  type GeneratedCompositionBenchmarkRouteV1,
} from './generated-composition-model-benchmark-v1';
import { buildDevelopmentSmokePreflightV2 } from './smoke-preflight-v2';
import {
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  buildDevelopmentStageOnePacketsV2,
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
  type InputArmV2,
} from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;
type TaskIdV2 = 'DEV-01' | 'DEV-02' | 'DEV-03' | 'DEV-04';

interface TaskPlanV2 {
  taskId: TaskIdV2;
  purpose: string;
  expectedExecutionForm: 'NATIVE' | 'HYBRID' | 'CAPABILITY_GAP';
  inputArm: InputArmV2;
  stageOnePacketHash: string;
  stageReadiness: readonly string[];
}

interface SmokeRouteV2 {
  routeId: string;
  provider: string;
  requestModel: string;
  claimedBenchmarkIdentity: string;
  reasoningMode: string;
}

const DIRECT_ROUTE_IDS = new Set(['OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH']);
const ZERO_SHA256 = '0'.repeat(64);

export async function buildDevelopmentMechanicsPreflightV2(input: {
  generatedCompositionApiImplementationHash: string;
}): Promise<Readonly<JsonRecord>> {
  requireSha256(input.generatedCompositionApiImplementationHash, 'generated composition API implementation');
  const smokePlan = await buildDevelopmentSmokePreflightV2() as unknown as {
    planHash: string;
    routes: SmokeRouteV2[];
  };
  const generatedPlan = await buildGeneratedCompositionModelBenchmarkPlanV1(
    input.generatedCompositionApiImplementationHash,
  );
  const directRoutes = smokePlan.routes
    .filter(({ routeId }) => DIRECT_ROUTE_IDS.has(routeId))
    .map((route) => ({
      routeId: route.routeId,
      executionAdapter: 'DIRECT_PROVIDER' as const,
      provider: route.provider,
      requestModel: route.requestModel,
      claimedBenchmarkIdentity: route.claimedBenchmarkIdentity,
      reasoningMode: route.reasoningMode,
      billingDisposition: 'METERED_USD' as const,
    }));
  if (directRoutes.length !== DIRECT_ROUTE_IDS.size) throw new Error('V2_MECHANICS_DIRECT_ROUTE_SET_INCOMPLETE');
  const qwenRoute = generatedPlan.routes.find(({ routeId }) => routeId === 'QWEN_3_8_MAX');
  if (!qwenRoute || qwenRoute.executionAdapter !== 'OPENCODE_AGENT_SHELL') {
    throw new Error('V2_MECHANICS_QWEN_AGENT_SHELL_ROUTE_MISSING');
  }

  const tasks = buildTaskPlans();
  const providerStageBudgets = deriveProviderStageBudgets();
  const maximumPlanningUsdPerDirectTask = money(
    sum(providerStageBudgets.map(({ maxProviderCostUsd }) => maxProviderCostUsd)),
  );
  const maximumDirectPlanningSpendUsd = money(
    directRoutes.length * tasks.length * maximumPlanningUsdPerDirectTask,
  );
  const maximumGeneratedSourceSpendUsd = generatedPlan.spend.absoluteMaxSpendUsd;
  const material = {
    planVersion: 'EDITRON_OE_V2_1_CONNECTED_MECHANICS_PREFLIGHT_V2',
    authority: 'RESEARCH_ONLY_NO_PROVIDER_CALL_NO_PROJECT_MUTATION',
    evidenceAsOf: '2026-08-15',
    routeSourcePlanHash: smokePlan.planHash,
    generatedCompositionSourcePlanHash: generatedPlan.planHash,
    routes: [
      ...directRoutes,
      routeFact(qwenRoute),
    ],
    tasks,
    matrix: tasks.flatMap((task) => [...directRoutes, routeFact(qwenRoute)].map((route) => ({
      taskId: task.taskId,
      routeId: route.routeId,
      executionAdapter: route.executionAdapter,
      stageOnePacketHash: task.stageOnePacketHash,
      dispatchStatus: 'BLOCKED_ON_CONNECTED_MECHANICS_PRECONDITIONS',
      blockers: taskBlockers(task.taskId, route.executionAdapter),
    }))),
    executionArchitecture: {
      modelStages: [
        { stage: 1, owner: 'MODEL_CHALLENGER', result: 'ReferenceBlueprintV2' },
        { stage: 2, owner: 'MODEL_CHALLENGER', result: 'EditorialIntentGraphV2' },
        { stage: 3, owner: 'MODEL_CHALLENGER', result: 'EvidenceBoundIntentGraphV2' },
      ],
      deterministicStages: [
        { stage: 4, owner: 'DETERMINISTIC_COMPILER_AND_VERIFIER', result: 'CompiledOperationGraphV2' },
        { stage: 5, owner: 'DETERMINISTIC_PROCEED_STOP_GATE', result: 'ProceedOrStopDecisionV2' },
        { stage: 6, owner: 'BOUNDED_RESEARCH_PROXY_OR_NO_EXECUTION', result: 'RenderedProxyEvidenceOrTypedStop' },
        { stage: 7, owner: 'REAL_MODEL_BLIND_HUMAN_REVIEW', result: 'HumanReviewReceiptV2' },
      ],
      rule: 'A model proposes observable targets and editorial topology; it does not author exact ports, revisions, policies, proof bindings, or graph validity.',
    },
    budgetCorrection: {
      supersededV2ZeroWholeTrialProviderCostUsd: 0.67,
      supersessionReason: 'The frozen V2-0 whole-trial ceiling predates the later fair per-stage budgets and cannot cover current Stages 1-3.',
      providerStageBudgets,
      maximumPlanningUsdPerDirectTask,
      maximumDirectPlanningSpendUsd,
      maximumGeneratedSourceSpendUsd,
      maximumCombinedDirectSpendUsd: money(maximumDirectPlanningSpendUsd + maximumGeneratedSourceSpendUsd),
      qwenBillingDisposition: qwenRoute.billingDisposition,
      qwenUsdComparison: null,
    },
    existingEvidenceDisposition: {
      dev02GeneratedCompositionRepeatability: 'PRESERVED_MODIFY_2_OF_3_LUNA_2_OF_3_TERRA_1_OF_3_QWEN',
      reuseRule: 'Existing receipts remain evidence, but they may enter a connected chain only when every upstream packet and artifact binding matches exactly.',
      productionMutationAuthorized: false,
    },
    nextImplementationOrder: [
      'DEV-04_CAPABILITY_GAP_STOP_CHAIN',
      'DEV-01_NATIVE_MULTI_OPERATION_PROXY_CHAIN',
      'DEV-03_AUDIO_VIDEO_NATIVE_PROXY_CHAIN',
      'DEV-02_FULL_HYBRID_CHAIN_AND_FORMAL_STAGE_7',
    ],
    operatorConfirmationGate: {
      status: 'NOT_REQUESTABLE_UNTIL_CONNECTED_EVALUATORS_AND_EXECUTORS_PASS',
      requiredEchoFieldsLater: ['planHash', 'maximumCombinedDirectSpendUsd', 'operatorId', 'confirmedAt'],
      appliesBefore: 'ANY_NEW_PROVIDER_NETWORK_CALL',
    },
    stateEffects: [],
  };
  return deepFreezeV1({ ...material, planHash: hashCanonicalJsonV1(material) });
}

function buildTaskPlans(): readonly TaskPlanV2[] {
  const stageOne = buildDevelopmentStageOnePacketsV2();
  return [
    task('DEV-01', 'MULTI_OPERATION_NATIVE_EDIT', 'NATIVE', 'TEXT_EVIDENCE_ONLY', textPacket(stageOne, 'DEV-01'), [
      'STAGE_1_PACKET_READY', 'STAGE_2_TASK_EVALUATOR_MISSING', 'STAGE_3_TASK_EVALUATOR_MISSING',
      'STAGE_4_TASK_COMPILER_MISSING', 'STAGE_5_INPUT_MISSING', 'STAGE_6_NATIVE_PROXY_EXECUTOR_MISSING', 'STAGE_7_BLOCKED',
    ]),
    task('DEV-02', 'DIFFICULT_REFERENCE_HYBRID_EDIT', 'HYBRID', 'REFERENCE_IMAGE_SEQUENCE_EVIDENCE',
      buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE'), [
        'STAGES_1_TO_3_DEV02_EVALUATORS_READY', 'STAGE_4_GENERATED_ISLAND_COMPILER_READY_FULL_HYBRID_BLOCKED',
        'STAGE_5_GENERATED_ISLAND_GATE_READY_FULL_HYBRID_BLOCKED', 'STAGE_6_GENERATED_ISLAND_SANDBOX_READY_FULL_HYBRID_BLOCKED',
        'STAGE_7_BLIND_PACK_READY_FINAL_REVIEW_RECEIPT_MISSING',
      ]),
    task('DEV-03', 'AUDIO_VIDEO_BEAT_AND_DIALOGUE_EDIT', 'NATIVE', 'TEXT_EVIDENCE_ONLY', textPacket(stageOne, 'DEV-03'), [
      'STAGE_1_PACKET_READY', 'STAGE_2_TASK_EVALUATOR_MISSING', 'STAGE_3_TASK_EVALUATOR_MISSING',
      'STAGE_4_TASK_COMPILER_MISSING', 'STAGE_5_INPUT_MISSING', 'STAGE_6_NATIVE_PROXY_EXECUTOR_MISSING', 'STAGE_7_BLOCKED',
    ]),
    task('DEV-04', 'HONEST_MOVING_MATTE_CAPABILITY_GAP', 'CAPABILITY_GAP', 'TEXT_EVIDENCE_ONLY', textPacket(stageOne, 'DEV-04'), [
      'STAGE_1_PACKET_READY', 'STAGE_2_TASK_EVALUATOR_MISSING', 'STAGE_3_TASK_EVALUATOR_MISSING',
      'STAGE_4_TASK_COMPILER_MISSING', 'STAGE_5_TYPED_STOP_GATE_READY_WITHOUT_INPUT', 'STAGE_6_NOT_APPLICABLE_AFTER_HONEST_STOP',
      'STAGE_7_NOT_APPLICABLE_AFTER_HONEST_STOP',
    ]),
  ];
}

function deriveProviderStageBudgets(): readonly { stage: 1 | 2 | 3; maxInputTokens: number; maxVisibleOutputTokens: number; maxReasoningTokens: number; maxWallClockMs: number; maxProviderCostUsd: number }[] {
  const stage1 = buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE');
  const stage2 = buildNextProviderStagePacketV2({ previousPacket: stage1, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: canonicalBlueprintJson });
  const stage3 = buildNextProviderStagePacketV2({ previousPacket: stage2, stage: 3, executionFormArm: 'FREE_CHOICE', priorArtifact: canonicalIntentJson });
  return [stage1, stage2, stage3].map(({ packet }) => ({ stage: packet.stage as 1 | 2 | 3, ...packet.stageBudget }));
}

function task(taskId: TaskIdV2, purpose: string, expectedExecutionForm: TaskPlanV2['expectedExecutionForm'], inputArm: InputArmV2, packet: HashedStagePacketV2, stageReadiness: readonly string[]): TaskPlanV2 {
  return { taskId, purpose, expectedExecutionForm, inputArm, stageOnePacketHash: packet.packetHash, stageReadiness };
}
function textPacket(packets: HashedStagePacketV2[], taskId: TaskIdV2): HashedStagePacketV2 {
  const packet = packets.find(({ packet: value }) => value.taskId === taskId && value.conditionId === 'BASELINE' && value.inputArm === 'TEXT_EVIDENCE_ONLY');
  if (!packet) throw new Error(`V2_MECHANICS_STAGE_ONE_PACKET_MISSING:${taskId}`);
  return packet;
}
function routeFact(route: GeneratedCompositionBenchmarkRouteV1) {
  return { routeId: route.routeId, executionAdapter: route.executionAdapter, provider: route.provider, requestModel: route.requestModel, claimedBenchmarkIdentity: route.claimedBenchmarkIdentity, reasoningMode: route.reasoningMode, billingDisposition: route.billingDisposition };
}
function taskBlockers(taskId: TaskIdV2, adapter: string): string[] {
  const blockers = taskId === 'DEV-02'
    ? ['FULL_HYBRID_EXECUTOR_MISSING', 'FORMAL_STAGE_7_RECEIPT_MISSING']
    : ['TASK_SPECIFIC_STAGE_2_TO_4_EVALUATOR_CHAIN_MISSING'];
  if (taskId === 'DEV-01' || taskId === 'DEV-03') blockers.push('NATIVE_RESEARCH_PROXY_EXECUTOR_MISSING');
  if (adapter === 'OPENCODE_AGENT_SHELL') blockers.push('SEPARATE_QWEN_AGENT_SHELL_RUNNER_REQUIRED');
  blockers.push('EXACT_OPERATOR_CONFIRMATION_NOT_YET_REQUESTABLE');
  return blockers;
}
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function money(value: number): number { return Number(value.toFixed(2)); }
function requireSha256(value: string, label: string): void { if (!/^[a-f0-9]{64}$/.test(value) || value === ZERO_SHA256) throw new Error(`V2_MECHANICS_${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_HASH_INVALID`); }
