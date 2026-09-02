import type { SerializedProviderRequestV2 } from './provider-codecs-v2';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { estimateOpenAiGpt56InputTokensV2 }
  from './openai-input-token-counter-v2';
import { FINISH_RESEARCH_EPISODE_TOOL_V2R }
  from './provider-native-tool-catalog-v2r';
import {
  STAGE25_FINAL_GENERALISATION_COHORT_V1,
} from './stage25-final-generalisation-cohort-v1';
import {
  STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1,
  buildStage25FinalGeneralisationContextV1,
  captureStage25FinalGeneralisationInitialRequestV1,
} from './stage25-final-generalisation-protocol-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_FINAL_GENERALISATION_ZERO_SPEND_PREFLIGHT_VERSION_V1 =
  'EDITRON_OE_STAGE25_FINAL_GENERALISATION_ZERO_SPEND_PREFLIGHT_V1_1' as const;

export async function runStage25FinalGeneralisationZeroSpendPreflightV1() {
  assertCohort();
  const captures = [];
  for (const row of STAGE25_FINAL_GENERALISATION_COHORT_V1.rows) {
    const task = STAGE25_FINAL_GENERALISATION_COHORT_V1.tasks
      .find(({ taskId }) => taskId === row.taskId) ?? fail(`TASK_MISSING:${row.rowId}`);
    const request = await captureStage25FinalGeneralisationInitialRequestV1({
      route: row.route, task,
    });
    const expectedHash = hashCanonicalJsonV1({ endpoint: request.endpoint, body: request.body });
    if (request.requestHash !== expectedHash) fail(`REQUEST_HASH_INVALID:${row.rowId}`);
    const body = record(request.body);
    if (body.model !== row.route.model || request.provider !== row.route.provider) {
      fail(`ROUTE_IDENTITY_DRIFT:${row.rowId}`);
    }
    const toolNames = records(body.tools).map(({ name }) => String(name));
    if (toolNames.length !== 1 || toolNames[0] !== FINISH_RESEARCH_EPISODE_TOOL_V2R) {
      fail(`CONTROL_ONLY_TOOL_BOUNDARY_INVALID:${row.rowId}`);
    }
    const serialized = JSON.stringify(body);
    for (const ruleId of task.publicRuleIds) {
      if (!serialized.includes(ruleId)) fail(`PUBLIC_RULE_HIDDEN:${row.rowId}:${ruleId}`);
    }
    if (!serialized.includes(task.taskPacketSha256)
      || !serialized.includes(task.taskSha256)) fail(`TASK_BINDING_HIDDEN:${row.rowId}`);
    for (const forbidden of ['"sentinels"', 'KNOWN_GOOD', 'EQUIVALENT_GOOD',
      'KNOWN_BAD', 'TAMPERED_TRACE_REJECT']) {
      if (serialized.includes(forbidden)) fail(`HIDDEN_EXPECTATION_LEAK:${row.rowId}:${forbidden}`);
    }
    const context = buildStage25FinalGeneralisationContextV1(task);
    const estimatedInputTokens = request.provider === 'openai'
      ? estimateOpenAiGpt56InputTokensV2(
          request as unknown as SerializedProviderRequestV2,
        )
      : null;
    if (estimatedInputTokens !== null
      && estimatedInputTokens > STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1) {
      fail(`OPENAI_INPUT_BUDGET_EXCEEDED:${row.rowId}:${estimatedInputTokens}`);
    }
    captures.push({
      rowId: row.rowId,
      taskId: row.taskId,
      taskLane: row.taskLane,
      routeId: row.route.routeId,
      provider: row.route.provider,
      model: row.route.model,
      requestSha256: request.requestHash,
      requestBodySha256: hashCanonicalJsonV1(body),
      contextSha256: hashCanonicalJsonV1(context),
      presentationOrderSha256:
        String(record(context.projectState).presentationOrderSha256),
      requestUtf8Bytes: Buffer.byteLength(serialized, 'utf8'),
      inputTokenStatus: request.provider === 'openai'
        ? 'PASS_LOCAL_O200K_115_PERCENT_MARGIN' as const
        : 'PENDING_GOOGLE_OFFICIAL_COUNT_TOKENS' as const,
      estimatedInputTokens,
      controlOnlyToolName: FINISH_RESEARCH_EPISODE_TOOL_V2R,
      publicRuleCount: task.publicRuleIds.length,
      hiddenExpectationLeakCount: 0 as const,
    });
  }
  assertSameTaskPresentation(captures);
  const material = {
    version: STAGE25_FINAL_GENERALISATION_ZERO_SPEND_PREFLIGHT_VERSION_V1,
    artifactType: 'Stage25FinalGeneralisationZeroSpendPreflightReceiptV1' as const,
    authority: 'ZERO_NETWORK_ZERO_INFERENCE_ZERO_PROJECT_MUTATION' as const,
    cohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
    captures,
    counts: {
      contemplatedRows: STAGE25_FINAL_GENERALISATION_COHORT_V1.rows.length,
      capturedInitialRequests: captures.length,
      openAiLocalTokenChecks: captures.filter(({ provider }) => provider === 'openai').length,
      googleOfficialTokenChecks: 0,
      providerMetadataChecks: 0,
      providerInferenceCalls: 0,
      projectReads: 0,
      projectMutations: 0,
    },
    checks: {
      exactEightTasksThreeRoutesTwentyFourRows: true,
      exactTaskAndRequestHashes: true,
      publicRuleLedgerVisible: true,
      hiddenExpectedAnswersAbsent: true,
      controlOnlyProviderTools: true,
      providerIndependentTaskPresentation: true,
      openAiLocalInputBudgetsPass: true,
      googleOfficialInputBudgetsPass: 'PENDING_PROVIDER_ACCESS_PREFLIGHT' as const,
      providerModelAndPricingMetadataPass: 'PENDING_PROVIDER_ACCESS_PREFLIGHT' as const,
    },
    readiness: 'READY_FOR_PROVIDER_ACCESS_AND_OFFICIAL_TOKEN_PREFLIGHT_NOT_INFERENCE' as const,
    dispatchAuthorized: false as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function assertCohort(): void {
  const { cohortSha256, ...material } = STAGE25_FINAL_GENERALISATION_COHORT_V1;
  if (hashCanonicalJsonV1(material) !== cohortSha256
    || material.counts.tasks !== 8 || material.counts.routes !== 3
    || material.counts.rows !== 24 || material.tasks.length !== 8
    || material.rows.length !== 24 || material.dispatchAuthorized) fail('COHORT_INVALID');
  if (new Set(material.rows.map(({ rowId }) => rowId)).size !== 24) fail('ROW_ID_DUPLICATED');
  for (const task of material.tasks) {
    const { taskPacketSha256, ...taskMaterial } = task;
    if (hashCanonicalJsonV1(taskMaterial) !== taskPacketSha256) {
      fail(`TASK_HASH_INVALID:${task.taskId}`);
    }
  }
}
function assertSameTaskPresentation(captures: readonly JsonRecord[]): void {
  for (const taskId of new Set(captures.map(({ taskId }) => String(taskId)))) {
    const rows = captures.filter((capture) => capture.taskId === taskId);
    if (new Set(rows.map(({ contextSha256 }) => contextSha256)).size !== 1
      || new Set(rows.map(({ presentationOrderSha256 }) => presentationOrderSha256)).size !== 1) {
      fail(`PROVIDER_PRESENTATION_CONFOUNDED:${taskId}`);
    }
  }
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord =>
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];
}
function fail(code: string): never {
  throw new Error(`STAGE25_FINAL_GENERALISATION_ZERO_SPEND_PREFLIGHT_${code}`);
}
