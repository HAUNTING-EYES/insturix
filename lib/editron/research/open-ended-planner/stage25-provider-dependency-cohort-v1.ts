import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3 }
  from '../capability-census/cap2-current-truth-reissue-audit-v3';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { estimateOpenAiGpt56InputTokensV2 } from './openai-input-token-counter-v2';
import {
  providerNativeCohortRoutesV2R,
  type ProviderNativeCohortRouteV2R,
} from './provider-native-cohort-manifest-v2r';
import { buildProviderNativePresentationPermutationsV3R }
  from './provider-native-evidence-visibility-v3r';
import { resolveProviderNativeCredentialsV2R }
  from './provider-native-live-transport-v2r';
import { runProviderNativeToolEpisodeV2R }
  from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import type { SerializedProviderRequestV2 } from './provider-codecs-v2';
import {
  buildStage25ProviderDependencyContextV1,
  buildStage25ProviderDependencyToolSetV1,
  STAGE25_PROVIDER_DEPENDENCY_ELIGIBLE_OPERATOR_IDS_V1,
  STAGE25_PROVIDER_DEPENDENCY_HOLDOUT_VERSION_V1,
} from './stage25-provider-dependency-holdout-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_PROVIDER_DEPENDENCY_COHORT_VERSION_V1 =
  'EDITRON_STAGE25_PROVIDER_DEPENDENCY_COHORT_V1_2' as const;
export const STAGE25_PROVIDER_DEPENDENCY_COHORT_SEED_V1 =
  'editron-stage25-provider-dependency-v2-20260823' as const;
export const STAGE25_PROVIDER_DEPENDENCY_EVALUATOR_SOURCE_PATH_V1 =
  'lib/editron/research/open-ended-planner/stage25-provider-dependency-holdout-v1.ts' as const;
export const STAGE25_PROVIDER_DEPENDENCY_MAX_INPUT_TOKENS_V1 = 60_000 as const;

interface PresentationEntryV1 {
  ordinal: number;
  operatorOrder: readonly string[];
  operatorOrderSha256: string;
  toolSetSha256: string;
}

export interface Stage25ProviderDependencyCohortManifestV1 {
  version: typeof STAGE25_PROVIDER_DEPENDENCY_COHORT_VERSION_V1;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  experimentId: 'EDITRON_STAGE25_FORK_JOIN_PROVIDER_COHORT_V2';
  sourceBinding: Readonly<{
    sourceCommit: string;
    evaluatorSourcePath: typeof STAGE25_PROVIDER_DEPENDENCY_EVALUATOR_SOURCE_PATH_V1;
    evaluatorSourceSha256: string;
    cap2ManifestSha256: string;
    cap2SourceSnapshotSha256: string;
  }>;
  holdoutVersion: typeof STAGE25_PROVIDER_DEPENDENCY_HOLDOUT_VERSION_V1;
  argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES';
  context: ReturnType<typeof buildStage25ProviderDependencyContextV1>;
  contextSha256: string;
  routes: readonly Readonly<ProviderNativeCohortRouteV2R>[];
  presentationSeed: typeof STAGE25_PROVIDER_DEPENDENCY_COHORT_SEED_V1;
  presentations: readonly Readonly<PresentationEntryV1>[];
  repetitionsPerRoute: 3;
  rowCount: 9;
  maxInputTokensPerTurn: typeof STAGE25_PROVIDER_DEPENDENCY_MAX_INPUT_TOKENS_V1;
  absoluteMaxSpendUsd: number;
  stateEffects: readonly [];
  manifestSha256: string;
}

export function buildStage25ProviderDependencyCohortManifestV1(input: {
  sourceCommit: string;
  evaluatorSourceSha256: string;
}): Readonly<Stage25ProviderDependencyCohortManifestV1> {
  if (!/^[a-f0-9]{40}$/.test(input.sourceCommit)) fail('SOURCE_COMMIT_INVALID');
  if (!/^[a-f0-9]{64}$/.test(input.evaluatorSourceSha256)) {
    fail('EVALUATOR_SOURCE_SHA256_INVALID');
  }
  const context = buildStage25ProviderDependencyContextV1();
  const routes = providerNativeCohortRoutesV2R();
  assertRoutes(routes);
  const orders = buildProviderNativePresentationPermutationsV3R({
    operatorIds: STAGE25_PROVIDER_DEPENDENCY_ELIGIBLE_OPERATOR_IDS_V1,
    seed: STAGE25_PROVIDER_DEPENDENCY_COHORT_SEED_V1,
    count: 3,
  });
  const presentations = orders.map((operatorOrder, index) => ({
    ordinal: index + 1,
    operatorOrder,
    operatorOrderSha256: hashCanonicalJsonV1(operatorOrder),
    toolSetSha256: buildStage25ProviderDependencyToolSetV1(operatorOrder).toolSetSha256,
  }));
  const material = {
    version: STAGE25_PROVIDER_DEPENDENCY_COHORT_VERSION_V1,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    experimentId: 'EDITRON_STAGE25_FORK_JOIN_PROVIDER_COHORT_V2' as const,
    sourceBinding: {
      sourceCommit: input.sourceCommit,
      evaluatorSourcePath: STAGE25_PROVIDER_DEPENDENCY_EVALUATOR_SOURCE_PATH_V1,
      evaluatorSourceSha256: input.evaluatorSourceSha256,
      cap2ManifestSha256: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.manifestHash,
      cap2SourceSnapshotSha256:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.sourceBinding.normalizedSourceSnapshotHash,
    },
    holdoutVersion: STAGE25_PROVIDER_DEPENDENCY_HOLDOUT_VERSION_V1,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES' as const,
    context,
    contextSha256: hashCanonicalJsonV1(context),
    routes,
    presentationSeed: STAGE25_PROVIDER_DEPENDENCY_COHORT_SEED_V1,
    presentations,
    repetitionsPerRoute: 3 as const,
    rowCount: 9 as const,
    maxInputTokensPerTurn: STAGE25_PROVIDER_DEPENDENCY_MAX_INPUT_TOKENS_V1,
    absoluteMaxSpendUsd: roundUsd(routes.reduce(
      (sum, routeEntry) => sum + maximumRouteSpend(routeEntry) * 3,
      0,
    )),
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertStage25ProviderDependencyCohortManifestV1(
  value: unknown,
): Readonly<Stage25ProviderDependencyCohortManifestV1> {
  if (!isRecord(value)) fail('MANIFEST_MISSING');
  const candidate = value as unknown as Stage25ProviderDependencyCohortManifestV1;
  const rebuilt = buildStage25ProviderDependencyCohortManifestV1({
    sourceCommit: candidate.sourceBinding?.sourceCommit,
    evaluatorSourceSha256: candidate.sourceBinding?.evaluatorSourceSha256,
  });
  if (hashCanonicalJsonV1(candidate) !== hashCanonicalJsonV1(rebuilt)) {
    fail('MANIFEST_DRIFT');
  }
  return deepFreezeV1(candidate);
}

export async function preflightStage25ProviderDependencyCohortV1(input: {
  manifest: Readonly<Stage25ProviderDependencyCohortManifestV1>;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
}): Promise<Readonly<JsonRecord>> {
  const manifest = assertStage25ProviderDependencyCohortManifestV1(input.manifest);
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  const fetchImpl = input.fetchImpl ?? fetch;
  await Promise.all(manifest.routes.map((entry) => verifyModel(
    entry.route,
    entry.route.provider === 'openai' ? credentials.openAiKey : credentials.googleKey,
    fetchImpl,
  )));
  const checks: JsonRecord[] = [];
  let googleCountTokensPosts = 0;
  for (const entry of manifest.routes) for (const presentation of manifest.presentations) {
    const request = await captureInitialRequest(
      entry.route, manifest, presentation.operatorOrder,
    );
    assertHiddenFactsPrivate(request);
    const boundedInputTokens = entry.route.provider === 'openai'
      ? estimateOpenAiGpt56InputTokensV2(
          request as unknown as SerializedProviderRequestV2,
        )
      : await countGoogleRequest(
          request, entry.route.model, credentials.googleKey, fetchImpl,
        );
    if (entry.route.provider === 'google') googleCountTokensPosts += 1;
    if (boundedInputTokens > manifest.maxInputTokensPerTurn) {
      fail(`INPUT_BUDGET_EXCEEDED:${entry.route.routeId}:P${presentation.ordinal}`);
    }
    checks.push({
      routeId: entry.route.routeId,
      model: entry.route.model,
      presentationOrdinal: presentation.ordinal,
      operatorOrderSha256: presentation.operatorOrderSha256,
      toolSetSha256: presentation.toolSetSha256,
      requestSha256: request.requestHash,
      boundedInputTokens,
    });
  }
  const material = {
    version: 'EDITRON_STAGE25_PROVIDER_DEPENDENCY_PREFLIGHT_V1_2',
    authority: 'RESEARCH_PREFLIGHT_NO_INFERENCE_NO_PROJECT_MUTATION' as const,
    manifestSha256: manifest.manifestSha256,
    checks,
    googleCredentialSource: credentials.googleCredentialSource,
    networkCalls: {
      modelMetadataGets: manifest.routes.length,
      googleCountTokensPosts,
      inferenceCalls: 0 as const,
    },
    secretsPersisted: false as const,
    assessment: 'PASS_READY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

async function captureInitialRequest(
  route: Readonly<ProviderNativeRouteV2R>,
  manifest: Readonly<Stage25ProviderDependencyCohortManifestV1>,
  operatorOrder: readonly string[],
): Promise<Readonly<SerializedProviderNativeTurnV2R>> {
  let captured: Readonly<SerializedProviderNativeTurnV2R> | undefined;
  await runProviderNativeToolEpisodeV2R({
    route,
    context: manifest.context,
    eligibleOperatorIds: operatorOrder,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    invoke: async (request) => {
      captured = request;
      return { status: 418, body: { preflight: true } };
    },
    executeIsolated: async () => fail('PREFLIGHT_EXECUTOR_MUST_NOT_RUN'),
  });
  if (!captured) fail('REQUEST_CAPTURE_FAILED');
  return captured;
}

function assertHiddenFactsPrivate(request: Readonly<SerializedProviderNativeTurnV2R>): void {
  const serialized = JSON.stringify(request.body);
  for (const forbidden of [
    '"strongPeakFrames":[119,239]', '"targetFrame":660', '"overlayId":42',
  ]) {
    if (serialized.includes(forbidden)) fail(`RESOLVED_EVIDENCE_LEAK:${forbidden}`);
  }
}

async function verifyModel(
  route: Readonly<ProviderNativeRouteV2R>, key: string, fetchImpl: typeof fetch,
): Promise<void> {
  const openAi = route.provider === 'openai';
  const endpoint = openAi ? `https://api.openai.com/v1/models/${route.model}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${route.model}`;
  const response = await fetchImpl(endpoint, { headers: openAi
    ? { authorization: `Bearer ${key}` } : { 'x-goog-api-key': key } });
  const body = await safeJson(response);
  const identity = openAi ? record(body).id : record(body).name;
  if (!response.ok || identity !== (openAi ? route.model : `models/${route.model}`)) {
    fail(`MODEL_ACCESS_FAILED:${route.routeId}:${response.status}`);
  }
}

async function countGoogleRequest(
  request: Readonly<SerializedProviderNativeTurnV2R>, model: string,
  key: string, fetchImpl: typeof fetch,
): Promise<number> {
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`,
    { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: JSON.stringify(request.body) }] }] }) },
  );
  const body = await safeJson(response);
  const total = Number(record(body).totalTokens);
  if (!response.ok || !Number.isSafeInteger(total) || total < 1) {
    fail(`GOOGLE_COUNT_FAILED:${response.status}`);
  }
  return Math.ceil(total * 1.15) + 512;
}

function maximumRouteSpend(entry: Readonly<ProviderNativeCohortRouteV2R>): number {
  const inputRate = Math.max(
    entry.pricing.inputUsdPerMillion,
    entry.pricing.cacheWriteUsdPerMillion,
  );
  return 9 * (
    STAGE25_PROVIDER_DEPENDENCY_MAX_INPUT_TOKENS_V1 * inputRate
      + 768 * entry.pricing.outputUsdPerMillion
  ) / 1_000_000;
}
function assertRoutes(routes: readonly Readonly<ProviderNativeCohortRouteV2R>[]): void {
  const roster = routes.map(({ route }) => `${route.routeId}:${route.model}`);
  if (roster.join('|') !== [
    'OPENAI_LUNA:gpt-5.6-luna', 'OPENAI_TERRA:gpt-5.6-terra',
    'GOOGLE_FLASH:gemini-3.7-flash',
  ].join('|')) fail('ROUTE_ROSTER_DRIFT');
}
async function safeJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return {}; }
}
function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function roundUsd(value: number): number { return Math.ceil(value * 1_000_000) / 1_000_000; }
function fail(code: string): never { throw new Error(`STAGE25_PROVIDER_DEPENDENCY_COHORT_${code}`); }
