import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { estimateOpenAiGpt56InputTokensV2 } from './openai-input-token-counter-v2';
import {
  buildProviderNativeCohortManifestV2R,
  type ProviderNativeCohortCaseV2R,
  type ProviderNativeCohortRouteV2R,
} from './provider-native-cohort-manifest-v2r';
import {
  PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R,
  runProviderNativeDev03ConnectedEpisodeV2R,
} from './provider-native-dev03-connected-episode-v2r';
import {
  createProviderNativeLiveTransportV2R,
  resolveProviderNativeCredentialsV2R,
} from './provider-native-live-transport-v2r';
import {
  PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R,
  type ProviderNativeArgumentHandoffModeV2R,
} from './provider-native-result-references-v2r';
import { runProviderNativeToolEpisodeV2R } from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import type { SerializedProviderRequestV2 } from './provider-codecs-v2';
import type { V2RBenchmarkTaskRegistryV2 } from './v2r-benchmark-task-registry';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_V2R_2' as const;
export const PROVIDER_NATIVE_HANDOFF_ORDER_OPERATOR_ORDER_V2R = [
  'sync_cuts_to_beats',
  'apply_camera_shake',
  'get_timeline_view',
  'find_audio_moment',
  'read_project_file',
] as const;
export const PROVIDER_NATIVE_HANDOFF_ORDER_ARMS_V2R = [
  'DIRECT_ARGUMENTS',
  'OPAQUE_RESULT_REFERENCES',
] as const satisfies readonly ProviderNativeArgumentHandoffModeV2R[];
export const PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V2R = deepFreezeV1({
  version: 'EDITRON_PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V2R_1',
  providerInfrastructureDispositions: [
    'PROVIDER_RATE_LIMIT', 'PROVIDER_TIMEOUT', 'PROVIDER_ERROR',
  ],
  renderInfrastructureErrorPatterns: [
    'NetworkError', 'network error', 'ERR_NAME_NOT_RESOLVED',
  ],
  passRequirements: [
    'FIRST_ATTEMPT_CAUSAL_ORDER', 'SUCCESSFUL_CAUSAL_ORDER',
    'REQUIRED_RESULT_HANDOFF', 'RENDERED_PRODUCT_PASS', 'NO_PROJECT_MUTATION',
  ],
} as const);
export const PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_SHA256_V2R =
  hashCanonicalJsonV1({
    policy: PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V2R,
    evaluatorSource: evaluateProviderNativeHandoffOrderEpisodeV2R.toString(),
  });

export interface ProviderNativeHandoffOrderManifestV2R {
  version: typeof PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_VERSION_V2R;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  experimentId: 'EDITRON_V2R_DEV03_HANDOFF_ORDER_V2';
  sourceCohortManifestSha256: string;
  connectedEpisodeVersion: typeof PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R;
  resultReferenceVersion: typeof PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R;
  evaluatorPolicySha256: string;
  evaluatorSourceSha256: string;
  caseEntry: Readonly<ProviderNativeCohortCaseV2R>;
  routes: readonly Readonly<ProviderNativeCohortRouteV2R>[];
  arms: typeof PROVIDER_NATIVE_HANDOFF_ORDER_ARMS_V2R;
  episodeOperatorOrder: typeof PROVIDER_NATIVE_HANDOFF_ORDER_OPERATOR_ORDER_V2R;
  requiredCausalOrder: readonly ['find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake'];
  repetitionsPerRouteArm: 3;
  absoluteMaxSpendUsd: number;
  stateEffects: readonly [];
  manifestSha256: string;
}

export function buildProviderNativeHandoffOrderManifestV2R(
  registry: Readonly<V2RBenchmarkTaskRegistryV2>,
): Readonly<ProviderNativeHandoffOrderManifestV2R> {
  const source = buildProviderNativeCohortManifestV2R(registry);
  const caseEntry = source.cases.find(({ caseId }) => caseId === 'DEV-03:BASELINE');
  if (!caseEntry) throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_CASE_MISSING');
  const repetitionsPerRouteArm = 3 as const;
  const absoluteMaxSpendUsd = roundUsd(source.routes.reduce((sum, routeEntry) => (
    sum + worstCaseSpend(routeEntry, caseEntry)
      * repetitionsPerRouteArm * PROVIDER_NATIVE_HANDOFF_ORDER_ARMS_V2R.length
  ), 0));
  const material = {
    version: PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    experimentId: 'EDITRON_V2R_DEV03_HANDOFF_ORDER_V2' as const,
    sourceCohortManifestSha256: source.manifestSha256,
    connectedEpisodeVersion: PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R,
    resultReferenceVersion: PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R,
    evaluatorPolicySha256: hashCanonicalJsonV1(
      PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V2R,
    ),
    evaluatorSourceSha256:
      PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_SHA256_V2R,
    caseEntry,
    routes: source.routes,
    arms: PROVIDER_NATIVE_HANDOFF_ORDER_ARMS_V2R,
    episodeOperatorOrder: PROVIDER_NATIVE_HANDOFF_ORDER_OPERATOR_ORDER_V2R,
    requiredCausalOrder: [
      'find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake',
    ] as const,
    repetitionsPerRouteArm,
    absoluteMaxSpendUsd,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertProviderNativeHandoffOrderManifestV2R(
  value: unknown,
): Readonly<ProviderNativeHandoffOrderManifestV2R> {
  if (!isRecord(value)) throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_MANIFEST_MISSING');
  const manifest = value as unknown as ProviderNativeHandoffOrderManifestV2R;
  const { manifestSha256, ...material } = manifest;
  if (manifest.version !== PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_VERSION_V2R
    || manifest.connectedEpisodeVersion !== PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R
    || manifest.resultReferenceVersion !== PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R
    || manifest.evaluatorPolicySha256 !== hashCanonicalJsonV1(
      PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V2R,
    )
    || manifest.evaluatorSourceSha256
      !== PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_SHA256_V2R
    || manifestSha256 !== hashCanonicalJsonV1(material)
    || manifest.routes.length !== 3
    || manifest.caseEntry.caseId !== 'DEV-03:BASELINE'
    || !sameStrings(manifest.arms, PROVIDER_NATIVE_HANDOFF_ORDER_ARMS_V2R)
    || !sameStrings(manifest.episodeOperatorOrder, PROVIDER_NATIVE_HANDOFF_ORDER_OPERATOR_ORDER_V2R)
    || !sameStrings(manifest.requiredCausalOrder, [
      'find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake',
    ])) {
    throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_MANIFEST_DRIFT');
  }
  return deepFreezeV1(manifest);
}

export async function preflightProviderNativeHandoffOrderV2R(input: {
  manifest: Readonly<ProviderNativeHandoffOrderManifestV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
}): Promise<Readonly<JsonRecord>> {
  const manifest = assertProviderNativeHandoffOrderManifestV2R(input.manifest);
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  const fetchImpl = input.fetchImpl ?? fetch;
  await Promise.all(manifest.routes.map((routeEntry) => verifyModel(
    routeEntry.route,
    routeEntry.route.provider === 'openai' ? credentials.openAiKey : credentials.googleKey,
    fetchImpl,
  )));
  const checks: JsonRecord[] = [];
  for (const routeEntry of manifest.routes) for (const arm of manifest.arms) {
    const request = await captureInitialRequest(routeEntry.route, manifest.caseEntry, arm);
    const boundedInputTokens = routeEntry.route.provider === 'openai'
      ? estimateOpenAiGpt56InputTokensV2(request as unknown as SerializedProviderRequestV2)
      : await countGoogleRequest(request, routeEntry.route.model, credentials.googleKey, fetchImpl);
    if (boundedInputTokens > manifest.caseEntry.maxInputTokensPerTurn) {
      throw new Error(`PROVIDER_NATIVE_HANDOFF_ORDER_INPUT_BUDGET_EXCEEDED:${routeEntry.route.routeId}:${arm}`);
    }
    checks.push({ routeId: routeEntry.route.routeId, model: routeEntry.route.model, arm,
      requestSha256: request.requestHash, boundedInputTokens,
      maxInputTokensPerTurn: manifest.caseEntry.maxInputTokensPerTurn });
  }
  const material = {
    authority: 'RESEARCH_PREFLIGHT_NO_INFERENCE_NO_PROJECT_MUTATION' as const,
    manifestSha256: manifest.manifestSha256,
    checks,
    googleCredentialSource: credentials.googleCredentialSource,
    networkCalls: { modelMetadataGets: manifest.routes.length, googleCountTokensPosts: manifest.arms.length, inferenceCalls: 0 },
    secretsPersisted: false,
    assessment: 'PASS_READY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export async function runProviderNativeHandoffOrderExperimentV2R(input: {
  manifest: Readonly<ProviderNativeHandoffOrderManifestV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  outputRoot: string;
  repetitions?: number;
}): Promise<Readonly<JsonRecord>> {
  const manifest = assertProviderNativeHandoffOrderManifestV2R(input.manifest);
  const repetitions = input.repetitions ?? manifest.repetitionsPerRouteArm;
  if (!Number.isSafeInteger(repetitions) || repetitions < 1
    || repetitions > manifest.repetitionsPerRouteArm) {
    throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_REPETITIONS_INVALID');
  }
  await mkdir(input.outputRoot, { recursive: false });
  const rows: JsonRecord[] = [];
  for (const routeEntry of manifest.routes) for (const arm of manifest.arms) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const rowId = `${routeEntry.route.routeId.toLowerCase()}-${arm.toLowerCase()}-r${repetition}`;
      const rowRoot = path.join(input.outputRoot, 'rows', rowId);
      const transport = createProviderNativeLiveTransportV2R({ environment: input.environment });
      await mkdir(rowRoot, { recursive: true });
      try {
        const receipt = await runProviderNativeDev03ConnectedEpisodeV2R({
          route: routeEntry.route, context: manifest.caseEntry.context,
          invoke: transport.invoke, outputDir: path.join(rowRoot, 'render'),
          executionId: rowId, createdAt: new Date().toISOString(),
          argumentHandoffMode: arm, eligibleOperatorIds: manifest.episodeOperatorOrder,
        });
        const evaluation = evaluateProviderNativeHandoffOrderEpisodeV2R(
          receipt as unknown as JsonRecord, arm, manifest.requiredCausalOrder,
        );
        const row = { rowId, routeId: routeEntry.route.routeId, model: routeEntry.route.model,
          arm, repetition, evaluation, receipt, transport: transport.snapshot(), stateEffects: [] };
        rows.push(row);
        await writeJson(path.join(rowRoot, 'row.json'), row);
      } catch (error) {
        const row = { rowId, routeId: routeEntry.route.routeId, model: routeEntry.route.model,
          arm, repetition, evaluation: { assessment: 'HARNESS_ERROR',
            reasonCodes: ['UNCAUGHT_EXPERIMENT_EXCEPTION'] },
          error: errorMessage(error), transport: transport.snapshot(), stateEffects: [] };
        rows.push(row);
        await writeJson(path.join(rowRoot, 'row.json'), row);
      }
    }
  }
  const assessments = rows.map((row) => text(record(row.evaluation).assessment));
  const material = { authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    manifestSha256: manifest.manifestSha256,
    evaluatorPolicySha256: manifest.evaluatorPolicySha256,
    evaluatorSourceSha256: manifest.evaluatorSourceSha256,
    repetitions, rows,
    passCount: assessments.filter((assessment) => assessment === 'PASS').length,
    failCount: assessments.filter((assessment) => assessment === 'FAIL').length,
    providerInfrastructureUnverifiableCount: assessments.filter((assessment) => (
      assessment === 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE'
    )).length,
    renderInfrastructureUnverifiableCount: assessments.filter((assessment) => (
      assessment === 'RENDER_INFRASTRUCTURE_UNVERIFIABLE'
    )).length,
    harnessErrorCount: assessments.filter((assessment) => assessment === 'HARNESS_ERROR').length,
    stateEffects: [] as const };
  const receipt = deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
  await writeJson(path.join(input.outputRoot, 'experiment-receipt.json'), receipt);
  return receipt;
}

export function evaluateProviderNativeHandoffOrderEpisodeV2R(
  receipt: JsonRecord,
  arm: ProviderNativeArgumentHandoffModeV2R,
  order: readonly string[],
): Readonly<JsonRecord> {
  const episode = record(receipt.providerEpisode);
  const turns = records(episode.turns);
  const attempted = turns.map((turn) => text(record(turn.modelCall).name)).filter(Boolean);
  const successful = turns.filter((turn) => record(turn.execution).disposition === 'OK')
    .map((turn) => text(record(turn.modelCall).name)).filter(Boolean);
  const firstAttemptOrderPass = ordered(attempted, order);
  const successfulOrderPass = ordered(successful, order);
  const bindings = turns.flatMap((turn) => records(turn.argumentReferenceBindings));
  const referenceHandoffPass = arm === 'DIRECT_ARGUMENTS'
    ? bindings.length === 0
    : bindings.some((binding) => binding.targetField === 'beatPlan'
      && binding.sourceOperatorId === 'find_audio_moment'
      && binding.sourceOutputField === 'result');
  const renderedProductPass = receipt.productOutcome === 'PASS';
  const noProjectMutation = Array.isArray(receipt.stateEffects) && receipt.stateEffects.length === 0;
  const providerTerminalDisposition = text(record(episode.terminal).disposition);
  const providerInfrastructureUnverifiable = (
    PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V2R
      .providerInfrastructureDispositions as readonly string[]
  ).includes(providerTerminalDisposition)
    || receipt.productOutcome === 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE';
  const renderInfrastructureUnverifiable = records(record(receipt.execution).proofAttempts)
    .some((attempt) => {
      const error = text(attempt.error);
      return PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_POLICY_V2R
        .renderInfrastructureErrorPatterns.some((pattern) => error.includes(pattern));
    });
  const reasonCodes = [
    ...(!firstAttemptOrderPass ? ['FIRST_ATTEMPT_CAUSAL_ORDER_FAILED'] : []),
    ...(!successfulOrderPass ? ['SUCCESSFUL_CAUSAL_ORDER_FAILED'] : []),
    ...(!referenceHandoffPass ? ['RESULT_HANDOFF_FAILED'] : []),
    ...(!renderedProductPass ? ['RENDERED_PRODUCT_NOT_PASS'] : []),
    ...(!noProjectMutation ? ['FORBIDDEN_PROJECT_MUTATION'] : []),
  ];
  const assessment = providerInfrastructureUnverifiable
    ? 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE'
    : renderInfrastructureUnverifiable
      ? 'RENDER_INFRASTRUCTURE_UNVERIFIABLE'
      : reasonCodes.length === 0 ? 'PASS' : 'FAIL';
  return { assessment, reasonCodes, attempted, successful,
    providerTerminalDisposition, firstAttemptOrderPass, successfulOrderPass,
    referenceHandoffPass, renderedProductPass, noProjectMutation };
}

async function captureInitialRequest(route: Readonly<ProviderNativeRouteV2R>, taskCase: Readonly<ProviderNativeCohortCaseV2R>, arm: ProviderNativeArgumentHandoffModeV2R) {
  let captured: Readonly<SerializedProviderNativeTurnV2R> | undefined;
  await runProviderNativeToolEpisodeV2R({ route, context: taskCase.context,
    eligibleOperatorIds: PROVIDER_NATIVE_HANDOFF_ORDER_OPERATOR_ORDER_V2R,
    argumentHandoffMode: arm,
    invoke: async (request) => { captured = request; return { status: 418, body: { preflight: true } }; },
    executeIsolated: async () => { throw new Error('PREFLIGHT_EXECUTOR_MUST_NOT_RUN'); } });
  if (!captured) throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_REQUEST_CAPTURE_FAILED');
  return captured;
}

async function verifyModel(route: Readonly<ProviderNativeRouteV2R>, key: string, fetchImpl: typeof fetch): Promise<void> {
  const openAi = route.provider === 'openai';
  const endpoint = openAi ? `https://api.openai.com/v1/models/${route.model}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${route.model}`;
  const response = await fetchImpl(endpoint, { headers: openAi
    ? { authorization: `Bearer ${key}` } : { 'x-goog-api-key': key } });
  const body = await safeJson(response);
  const identity = openAi ? record(body).id : record(body).name;
  if (!response.ok || identity !== (openAi ? route.model : `models/${route.model}`)) {
    throw new Error(`PROVIDER_NATIVE_HANDOFF_ORDER_MODEL_ACCESS_FAILED:${route.routeId}:${response.status}`);
  }
}

async function countGoogleRequest(request: Readonly<SerializedProviderNativeTurnV2R>, model: string, key: string, fetchImpl: typeof fetch): Promise<number> {
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: JSON.stringify(request.body) }] }] }),
  });
  const body = await safeJson(response); const total = Number(record(body).totalTokens);
  if (!response.ok || !Number.isSafeInteger(total) || total < 1) {
    throw new Error(`PROVIDER_NATIVE_HANDOFF_ORDER_GOOGLE_COUNT_FAILED:${response.status}`);
  }
  return Math.ceil(total * 1.15) + 512;
}

function worstCaseSpend(route: Readonly<ProviderNativeCohortRouteV2R>, taskCase: Readonly<ProviderNativeCohortCaseV2R>): number {
  const inputRate = Math.max(route.pricing.inputUsdPerMillion, route.pricing.cacheWriteUsdPerMillion);
  return taskCase.context.budget.maxTurns * (taskCase.maxInputTokensPerTurn * inputRate
    + taskCase.context.budget.maxOutputTokensPerTurn * route.pricing.outputUsdPerMillion) / 1_000_000;
}
function ordered(calls: readonly string[], required: readonly string[]): boolean { const positions = required.map((id) => calls.indexOf(id)); return positions.every((value) => value >= 0) && positions.every((value, index) => index === 0 || positions[index - 1] < value); }
function sameStrings(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
async function writeJson(filePath: string, value: unknown): Promise<void> { await mkdir(path.dirname(filePath), { recursive: true }); await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); }
async function safeJson(response: Response): Promise<unknown> { try { return await response.json(); } catch { return {}; } }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function roundUsd(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }
function errorMessage(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 2_000); }
