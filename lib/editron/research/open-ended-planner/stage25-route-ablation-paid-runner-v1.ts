import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { evaluateStage25RouteAblationArtifactV1 } from './stage25-route-ablation-evaluator-v1';
import {
  assertStage25RouteAblationPaidAuthorizationV1,
  type Stage25RouteAblationPaidAuthorizationV1,
} from './stage25-route-ablation-paid-authorization-v1';
import {
  assertStage25RouteAblationProviderManifestV1,
  stage25RouteAblationProviderRouteV1,
  type Stage25RouteAblationProviderManifestV1,
} from './stage25-route-ablation-provider-manifest-v1';
import type {
  Stage25RouteAblationPreflightReceiptV1,
  Stage25RouteAblationRequestCaptureV1,
} from './stage25-route-ablation-provider-preflight-v1';
import { buildStage25RouteAblationProviderManifestV1 as buildBaseManifest }
  from './stage25-route-ablation-v1';
import { estimateOpenAiGpt56InputTokensV2 } from './openai-input-token-counter-v2';
import { serializeGoogleCountTokensRequestV2, type SerializedProviderRequestV2 }
  from './provider-codecs-v2';
import { resolveProviderNativeCredentialsV2R } from './provider-native-live-transport-v2r';
import { runProviderStageV2, type ProviderStageRunV2 } from './provider-transport-v2';

type JsonRecord = Record<string, unknown>;
type Evaluation = Readonly<ReturnType<typeof evaluateStage25RouteAblationArtifactV1>>;

export const STAGE25_ROUTE_ABLATION_PAID_RUNNER_VERSION_V1 =
  'EDITRON_OE_STAGE25_ROUTE_ABLATION_PAID_RUNNER_V1_1' as const;

export interface Stage25RouteAblationPaidRowResultV1 {
  version: typeof STAGE25_ROUTE_ABLATION_PAID_RUNNER_VERSION_V1;
  authority: 'RESEARCH_STAGE2_PLAN_RESULT_NO_PROJECT_AUTHORITY';
  authorizationSha256: string;
  rowId: string;
  routeId: string;
  packetHash: string;
  run: Readonly<ProviderStageRunV2>;
  evaluation: Evaluation | Readonly<JsonRecord>;
  providerInferenceCalls: number;
  googleRepairCountTokensCalls: number;
  knownProviderCostUsd: number;
  providerCostUnverifiable: boolean;
  secretsPersisted: false;
  projectReads: 0;
  projectMutations: 0;
  stateEffects: readonly [];
  resultSha256: string;
}

export interface Stage25RouteAblationPaidCohortReceiptV1 {
  version: typeof STAGE25_ROUTE_ABLATION_PAID_RUNNER_VERSION_V1;
  authority: 'RESEARCH_STAGE2_COHORT_RESULT_NO_PROJECT_AUTHORITY';
  authorizationSha256: string;
  manifestSha256: string;
  preflightReceiptSha256: string;
  requestCaptureSetSha256: string;
  rowResultSetSha256: string;
  rows: 24;
  providerInferenceCalls: number;
  googleRepairCountTokensCalls: number;
  knownProviderCostUsd: number;
  rowsWithUnverifiableCost: number;
  runDispositions: Readonly<Record<string, number>>;
  hiddenEvaluationDispositions: Readonly<Record<string, number>>;
  secretsPersisted: false;
  projectReads: 0;
  projectMutations: 0;
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function runStage25RouteAblationPaidCohortV1(input: {
  manifest: Readonly<Stage25RouteAblationProviderManifestV1>;
  preflight: Readonly<Stage25RouteAblationPreflightReceiptV1>;
  captures: readonly Readonly<Stage25RouteAblationRequestCaptureV1>[];
  authorization: Readonly<Stage25RouteAblationPaidAuthorizationV1>;
  environment: Readonly<Record<string, string | undefined>>;
  completedRows?: readonly Readonly<Stage25RouteAblationPaidRowResultV1>[];
  fetchImpl?: typeof fetch;
  now?: string;
  onRowCompleted?: (row: Readonly<Stage25RouteAblationPaidRowResultV1>) => Promise<void>;
}): Promise<Readonly<{
  receipt: Readonly<Stage25RouteAblationPaidCohortReceiptV1>;
  rows: readonly Readonly<Stage25RouteAblationPaidRowResultV1>[];
}>> {
  const manifest = assertStage25RouteAblationProviderManifestV1(input.manifest);
  const authorization = assertStage25RouteAblationPaidAuthorizationV1({
    ...input, authorization: input.authorization, now: input.now,
  });
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  if (credentials.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY') {
    throw new Error('STAGE25_ROUTE_PAID_PRODUCTION_GOOGLE_CREDENTIAL_REQUIRED');
  }
  const completed = new Map((input.completedRows ?? []).map((row) => [row.rowId,
    assertPaidRowResult(row, manifest, authorization)]));
  if (completed.size !== (input.completedRows ?? []).length) {
    throw new Error('STAGE25_ROUTE_PAID_RESUME_DUPLICATE');
  }
  const baseRows = buildBaseManifest().rows;
  const fetchImpl = input.fetchImpl ?? fetch;
  const results: Stage25RouteAblationPaidRowResultV1[] = [];
  for (const authorizedRow of authorization.authorizedRows) {
    const rowId = text(authorizedRow.rowId);
    const resumed = completed.get(rowId);
    if (resumed) { results.push(resumed); continue; }
    const manifestRow = manifest.rows.find((row) => row.rowId === rowId);
    const route = manifest.routeRoster.find((entry) => entry.routeId === manifestRow?.routeId);
    const baseRow = baseRows.find((entry) => entry.scopeId === manifestRow?.scopeId
      && entry.arm === manifestRow?.arm);
    const capture = input.captures.find((entry) => entry.rowId === rowId);
    if (!manifestRow || !route || !baseRow || !capture
      || baseRow.artifact.packetHash !== manifestRow.packetHash) {
      throw new Error(`STAGE25_ROUTE_PAID_ROW_BINDING_INVALID:${rowId}`);
    }
    const providerRoute = stage25RouteAblationProviderRouteV1(
      route, route.kind === 'openai' ? credentials.openAiKey : credentials.googleKey,
    );
    let providerInferenceCalls = 0;
    let googleRepairCountTokensCalls = 0;
    const run = await runProviderStageV2({
      artifact: baseRow.artifact, route: providerRoute, pricing: route.pricing,
      preflightInputTokens: async ({ attempt, request }) => {
        if (attempt === 1) {
          if (request.requestHash !== capture.request.requestHash) {
            throw new Error(`STAGE25_ROUTE_PAID_INITIAL_REQUEST_DRIFT:${rowId}`);
          }
          return capture.boundedInputTokens;
        }
        if (route.kind === 'openai') return estimateOpenAiGpt56InputTokensV2(request);
        googleRepairCountTokensCalls += 1;
        return countGoogleRepair(providerRoute, request, fetchImpl);
      },
      fetchImpl: async (url, init) => {
        if (String(url) !== expectedInferenceEndpoint(route.kind, route.model)) {
          throw new Error(`STAGE25_ROUTE_PAID_INFERENCE_ENDPOINT_INVALID:${rowId}`);
        }
        providerInferenceCalls += 1;
        return fetchImpl(url, init);
      },
    });
    assertProviderIdentity(run, route.modelSnapshot, route.kind);
    const costs = run.attempts.map(({ providerCostUsd }) => providerCostUsd);
    const knownProviderCostUsd = roundUsd(costs.reduce<number>(
      (sum, value) => sum + (value ?? 0), 0,
    ));
    const providerCostUnverifiable = costs.some((value) => value === null);
    if (knownProviderCostUsd * 1_000_000 > Number(authorizedRow.absoluteMaxRowSpendMicroUsd)
      || providerInferenceCalls > Number(authorizedRow.maximumAttempts)
      || googleRepairCountTokensCalls > (route.kind === 'google' ? 1 : 0)) {
      throw new Error(`STAGE25_ROUTE_PAID_ROW_LIMIT_EXCEEDED:${rowId}`);
    }
    const evaluation = evaluateRun(run, baseRow);
    const material = {
      version: STAGE25_ROUTE_ABLATION_PAID_RUNNER_VERSION_V1,
      authority: 'RESEARCH_STAGE2_PLAN_RESULT_NO_PROJECT_AUTHORITY' as const,
      authorizationSha256: authorization.authorizationSha256,
      rowId, routeId: route.routeId, packetHash: manifestRow.packetHash,
      run, evaluation, providerInferenceCalls, googleRepairCountTokensCalls,
      knownProviderCostUsd, providerCostUnverifiable,
      secretsPersisted: false as const, projectReads: 0 as const, projectMutations: 0 as const,
      stateEffects: [] as const,
    };
    const result = deepFreezeV1({ ...material, resultSha256: hashCanonicalJsonV1(material) });
    assertNoSecrets(result, credentials.openAiKey, credentials.googleKey);
    results.push(result);
    await input.onRowCompleted?.(result);
  }
  if (results.length !== 24) throw new Error('STAGE25_ROUTE_PAID_RESULT_SET_INCOMPLETE');
  const material = {
    version: STAGE25_ROUTE_ABLATION_PAID_RUNNER_VERSION_V1,
    authority: 'RESEARCH_STAGE2_COHORT_RESULT_NO_PROJECT_AUTHORITY' as const,
    authorizationSha256: authorization.authorizationSha256,
    manifestSha256: manifest.manifestSha256,
    preflightReceiptSha256: input.preflight.receiptSha256,
    requestCaptureSetSha256: input.preflight.requestCaptureSetSha256,
    rowResultSetSha256: hashCanonicalJsonV1(results), rows: 24 as const,
    providerInferenceCalls: sum(results, 'providerInferenceCalls'),
    googleRepairCountTokensCalls: sum(results, 'googleRepairCountTokensCalls'),
    knownProviderCostUsd: roundUsd(results.reduce((sumValue, row) => sumValue + row.knownProviderCostUsd, 0)),
    rowsWithUnverifiableCost: results.filter(({ providerCostUnverifiable }) => providerCostUnverifiable).length,
    runDispositions: counts(results.map(({ run }) => run.disposition)),
    hiddenEvaluationDispositions: counts(results.map(({ evaluation }) => text(evaluation.disposition))),
    secretsPersisted: false as const, projectReads: 0 as const, projectMutations: 0 as const,
    stateEffects: [] as const,
  };
  if (material.providerInferenceCalls > authorization.limits.maximumProviderInferenceCalls
    || material.googleRepairCountTokensCalls > authorization.limits.maximumGoogleRepairCountTokensCalls
    || material.knownProviderCostUsd * 1_000_000 > authorization.limits.absoluteMaxCohortSpendMicroUsd) {
    throw new Error('STAGE25_ROUTE_PAID_COHORT_LIMIT_EXCEEDED');
  }
  const receipt = deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
  assertNoSecrets({ receipt, results }, credentials.openAiKey, credentials.googleKey);
  return deepFreezeV1({ receipt, rows: results });
}

function assertPaidRowResult(value: Readonly<Stage25RouteAblationPaidRowResultV1>,
  manifest: Readonly<Stage25RouteAblationProviderManifestV1>,
  authorization: Readonly<Stage25RouteAblationPaidAuthorizationV1>) {
  const { resultSha256, ...material } = value;
  const row = manifest.rows.find((entry) => entry.rowId === value.rowId);
  const route = manifest.routeRoster.find((entry) => entry.routeId === row?.routeId);
  const baseRow = buildBaseManifest().rows.find((entry) => entry.scopeId === row?.scopeId
    && entry.arm === row?.arm);
  const costs = value.run.attempts.map(({ providerCostUsd }) => providerCostUsd);
  const expectedKnownCost = roundUsd(costs.reduce<number>(
    (total, cost) => total + (cost ?? 0), 0,
  ));
  const expectedCostUnverifiable = costs.some((cost) => cost === null);
  if (!row || value.version !== STAGE25_ROUTE_ABLATION_PAID_RUNNER_VERSION_V1
    || !route || !baseRow
    || value.authority !== 'RESEARCH_STAGE2_PLAN_RESULT_NO_PROJECT_AUTHORITY'
    || value.authorizationSha256 !== authorization.authorizationSha256
    || value.routeId !== row.routeId || value.packetHash !== row.packetHash
    || value.run.runVersion !== 'EDITRON_OE_PROVIDER_STAGE_RUN_V2'
    || value.run.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || value.run.packetHash !== row.packetHash || value.run.attempts.length > row.maximumAttempts
    || value.providerInferenceCalls < 0
    || value.providerInferenceCalls > value.run.attempts.length
    || value.googleRepairCountTokensCalls < 0
    || value.googleRepairCountTokensCalls > (route.kind === 'google' ? 1 : 0)
    || value.knownProviderCostUsd !== expectedKnownCost
    || value.providerCostUnverifiable !== expectedCostUnverifiable
    || value.knownProviderCostUsd * 1_000_000 > 1_400_000
    || hashCanonicalJsonV1(value.evaluation) !== hashCanonicalJsonV1(evaluateRun(value.run, baseRow))
    || value.secretsPersisted !== false || value.projectReads !== 0 || value.projectMutations !== 0
    || !Array.isArray(value.stateEffects) || value.stateEffects.length !== 0
    || resultSha256 !== hashCanonicalJsonV1(material)) {
    throw new Error(`STAGE25_ROUTE_PAID_RESUME_ROW_INVALID:${value.rowId}`);
  }
  assertProviderIdentity(value.run, route.modelSnapshot, route.kind);
  return deepFreezeV1(structuredClone(value));
}

function evaluateRun(run: Readonly<ProviderStageRunV2>,
  row: ReturnType<typeof buildBaseManifest>['rows'][number]): Evaluation | Readonly<JsonRecord> {
  return run.artifact
    ? evaluateStage25RouteAblationArtifactV1({ row, artifact: run.artifact })
    : deepFreezeV1({
        disposition: 'UNVERIFIABLE', observedExecutionForm: null,
        routeClassification: 'UNVERIFIABLE', claimCoverage: 'UNVERIFIABLE',
        operatorSelection: 'UNVERIFIABLE', capabilityHonesty: 'UNVERIFIABLE',
        diagnostics: [`PROVIDER_RUN:${run.disposition}`],
      });
}

async function countGoogleRepair(route: ReturnType<typeof stage25RouteAblationProviderRouteV1>,
  request: Readonly<SerializedProviderRequestV2>, fetchImpl: typeof fetch): Promise<number> {
  const count = serializeGoogleCountTokensRequestV2({ route, generationRequest: request });
  const response = await fetchImpl(count.endpoint, {
    method: 'POST', headers: count.headers, body: JSON.stringify(count.body),
  });
  const body = record(await response.json().catch(() => ({})));
  const tokens = Number(body.totalTokens);
  if (!response.ok || !Number.isSafeInteger(tokens) || tokens < 1) {
    throw new Error(`STAGE25_ROUTE_PAID_GOOGLE_REPAIR_COUNT_FAILED:${response.status}`);
  }
  return Math.ceil(tokens * 1.15) + 512;
}
function assertProviderIdentity(run: Readonly<ProviderStageRunV2>, expected: string,
  kind: 'openai' | 'google'): void {
  for (const attempt of run.attempts) if (attempt.providerModel !== null
    && attempt.providerModel !== expected
    && !(kind === 'google' && attempt.providerModel === `models/${expected}`)) {
    throw new Error(`STAGE25_ROUTE_PAID_PROVIDER_IDENTITY_DRIFT:${attempt.providerModel}`);
  }
}
function expectedInferenceEndpoint(kind: 'openai' | 'google', model: string): string {
  return kind === 'openai' ? 'https://api.openai.com/v1/responses'
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}
function counts(values: readonly string[]): Readonly<Record<string, number>> {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value,
    values.filter((candidate) => candidate === value).length]));
}
function sum(rows: readonly Readonly<Stage25RouteAblationPaidRowResultV1>[],
  field: 'providerInferenceCalls' | 'googleRepairCountTokensCalls'): number {
  return rows.reduce((total, row) => total + row[field], 0);
}
function assertNoSecrets(value: unknown, ...secrets: string[]): void {
  const serialized = JSON.stringify(value);
  if (secrets.some((secret) => serialized.includes(secret))) throw new Error('STAGE25_ROUTE_PAID_SECRET_LEAK');
}
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function roundUsd(value: number): number { return Math.round(value * 1e9) / 1e9; }
