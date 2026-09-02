import { hashCanonicalJsonV1 } from './contracts-v1';
import { createProviderNativeDurableLiveTransportOwnerV2R,
  resolveProviderNativeCredentialsV2R }
  from './provider-native-live-transport-v2r';
import type { ProviderNativeEpisodeReceiptV2R }
  from './provider-native-tool-episode-v2r';
import { ProviderNativeRuntimeBudgetControllerV2R,
  bindProviderNativeRuntimeInputTokenBoundV2R }
  from './sealed-holdout-runtime-budget-v2r';
import { buildStage25LongFormProviderContextV1,
  runStage25LongFormProviderEpisodeV1 }
  from './stage25-long-form-plan-provider-protocol-v1';
import { assertStage25LongFormProviderCohortManifestV2,
  type Stage25LongFormProviderCohortManifestV2 }
  from './stage25-long-form-plan-provider-cohort-v2';
import { assertStage25LongFormProviderPaidAuthorizationV2,
  type Stage25LongFormProviderPaidAuthorizationV2 }
  from './stage25-long-form-plan-paid-authorization-v2';
import { createStage25LongFormProviderPaidCohortReceiptV2,
  createStage25LongFormProviderPaidRowResultV2,
  assertStage25LongFormProviderPaidRowResultV2,
  type Stage25LongFormProviderPaidDurablePortV2,
  type Stage25LongFormProviderPaidRowResultV2 }
  from './stage25-long-form-plan-paid-runner-contract-v2';
import type { Stage25LongFormProviderRequestCaptureV1 }
  from './stage25-long-form-plan-provider-preflight-v1';
import { assertStage25LongFormProviderPreflightBundleV2,
  type Stage25LongFormProviderPreflightReceiptV2 }
  from './stage25-long-form-plan-provider-preflight-v2';

type JsonRecord = Record<string, unknown>;
const TOKEN_BOUND_VERSION = 'EDITRON_STAGE25_LONG_FORM_RUNTIME_INPUT_BOUND_V2_1';

export async function runStage25LongFormProviderPaidCohortV2(input: {
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>;
  preflight: Readonly<Stage25LongFormProviderPreflightReceiptV2>;
  captures: readonly Readonly<Stage25LongFormProviderRequestCaptureV1>[];
  authorization: Readonly<Stage25LongFormProviderPaidAuthorizationV2>;
  durablePort: Readonly<Stage25LongFormProviderPaidDurablePortV2>;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  now: string;
}): Promise<Readonly<{
  rows: readonly Readonly<Stage25LongFormProviderPaidRowResultV2>[];
  receipt: Readonly<JsonRecord>;
}>> {
  const manifest = assertStage25LongFormProviderCohortManifestV2(input.manifest);
  const bundle = assertStage25LongFormProviderPreflightBundleV2({
    manifest, receipt: input.preflight, requestCaptures: input.captures,
  });
  const authorization = assertStage25LongFormProviderPaidAuthorizationV2({
    manifest, preflight: bundle.receipt, captures: bundle.requestCaptures,
    authorization: input.authorization, now: input.now,
  });
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  if (credentials.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY') {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_PAID_PRODUCTION_GOOGLE_KEY_REQUIRED');
  }
  const captureMap = new Map(bundle.requestCaptures.map((value) => [value.rowId, value]));
  const routes = new Map(manifest.baseManifest.routeRoster.map(
    ({ route, pricing }) => [route.routeId, { route, pricing }],
  ));
  const transportOwner = createProviderNativeDurableLiveTransportOwnerV2R({
    environment: input.environment,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });
  const completed: Stage25LongFormProviderPaidRowResultV2[] = [];
  for (const row of manifest.rows) {
    const capture = captureMap.get(row.rowId);
    const routeEntry = routes.get(row.routeId);
    if (!capture || !routeEntry) throw new Error(`STAGE25_LONG_FORM_PROVIDER_PAID_ROW_BINDING_MISSING:${row.rowId}`);
    const durable = await input.durablePort.load(row.rowId);
    if (durable.completedRow && durable.resumeCheckpoint) {
      throw new Error(`STAGE25_LONG_FORM_PROVIDER_PAID_DURABLE_STATE_AMBIGUOUS:${row.rowId}`);
    }
    if (durable.completedRow) {
      completed.push(assertStage25LongFormProviderPaidRowResultV2({
        manifest, preflight: bundle.receipt, authorization, capture,
        row: durable.completedRow,
      }));
      continue;
    }
    const guard = runtimeGuard(manifest, authorization, capture, row, routeEntry.pricing);
    const context = buildStage25LongFormProviderContextV1(row.presentationOrdinal);
    const invoke = await transportOwner.resolve({ route: routeEntry.route, episodeId: context.episodeId });
    let calls = 0;
    const episode = await runStage25LongFormProviderEpisodeV1({
      route: routeEntry.route, presentationOrdinal: row.presentationOrdinal,
      durableMode: true, runtimeGuard: guard, now: () => input.now,
      ...(durable.resumeCheckpoint ? {
        resumeCheckpoint: durable.resumeCheckpoint,
        resumeCurrentProjectRevision: String(context.revisionBinding.expectedProjectRevision),
      } : {}),
      invoke: async (request) => { calls += 1; return invoke(request); },
      onProviderDispatchCommitted: async ({ dispatchIntent, checkpoint }) => {
        await input.durablePort.commitDispatch({ rowId: row.rowId, dispatchIntent, checkpoint });
      },
      onProviderAttemptCommitted: async ({ attemptReceipt, checkpoint, dispatchIntent }) => {
        await input.durablePort.commitAttempt({
          rowId: row.rowId, attemptReceipt, checkpoint,
          ...(dispatchIntent ? { dispatchIntent } : {}),
        });
      },
    });
    if (calls === 0 && !durable.resumeCheckpoint) {
      throw new Error(`STAGE25_LONG_FORM_PROVIDER_PAID_REQUEST_NOT_DISPATCHED:${row.rowId}`);
    }
    const result = createStage25LongFormProviderPaidRowResultV2({
      manifest, preflight: bundle.receipt, authorization, capture, episode,
      providerInferenceCallsObserved: calls as 0 | 1,
      spentNanoUsd: spentNanoUsd(episode),
    });
    await input.durablePort.commitRow({ rowId: row.rowId, row: result });
    completed.push(result);
  }
  const receipt = createStage25LongFormProviderPaidCohortReceiptV2({
    manifest, authorization, rows: completed,
  });
  const persisted = JSON.stringify({ rows: completed, receipt });
  if ([credentials.openAiKey, credentials.googleKey].some((secret) => persisted.includes(secret))) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_PAID_SECRET_LEAK');
  }
  return { rows: completed, receipt };
}

function runtimeGuard(
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>,
  authorization: Readonly<Stage25LongFormProviderPaidAuthorizationV2>,
  capture: Readonly<Stage25LongFormProviderRequestCaptureV1>,
  row: Readonly<Stage25LongFormProviderCohortManifestV2['rows'][number]>,
  pricing: Readonly<{ inputUsdPerMillion: number; cachedInputUsdPerMillion: number;
    cacheWriteUsdPerMillion: number; outputUsdPerMillion: number }>,
) {
  const guardIdentity = hashCanonicalJsonV1({
    manifestSha256: manifest.manifestSha256,
    authorizationSha256: authorization.authorizationSha256,
    row, captureSha256: hashCanonicalJsonV1(capture),
  });
  return new ProviderNativeRuntimeBudgetControllerV2R({
    guardKind: 'EDITRON_STAGE25_LONG_FORM_PROVIDER_RUNTIME_GUARD_V2_1',
    guardIdentitySha256: guardIdentity,
    authorizationSha256: authorization.authorizationSha256,
    inputTokenBoundVersion: TOKEN_BOUND_VERSION,
    limits: {
      maxProviderTurns: 1, maxSelectedOperations: 1, maxCandidatesPerOperation: 1,
      maxCumulativeOutputTokens: manifest.baseManifest.maxOutputTokensPerRow,
      maxInputTokensPerTurn: manifest.baseManifest.maxInputTokensPerRow,
      absoluteMaxSpendNanoUsd: row.absoluteMaxRowSpendNanoUsd,
    },
    pricing: {
      normalInputNanoUsdPerToken: nanoRate(pricing.inputUsdPerMillion),
      cachedInputNanoUsdPerToken: nanoRate(pricing.cachedInputUsdPerMillion),
      cacheWriteNanoUsdPerToken: nanoRate(pricing.cacheWriteUsdPerMillion),
      outputNanoUsdPerToken: nanoRate(pricing.outputUsdPerMillion),
    },
    countInputTokens: async (request) => {
      if (hashCanonicalJsonV1(request) !== hashCanonicalJsonV1(capture.request)) {
        throw new Error('STAGE25_LONG_FORM_PROVIDER_PAID_REQUEST_DRIFT');
      }
      return bindProviderNativeRuntimeInputTokenBoundV2R({
        version: TOKEN_BOUND_VERSION, request,
        inputTokensUpperBound: capture.boundedInputTokens,
        method: capture.tokenCountMethod,
      });
    },
  });
}

function spentNanoUsd(episode: Readonly<ProviderNativeEpisodeReceiptV2R>): number {
  const values = episode.turns.flatMap((turn) => records(turn.runtimeGuardAudit))
    .map((event) => Number(event.cumulativeSpentNanoUsd))
    .filter(Number.isSafeInteger);
  if (!values.length) throw new Error('STAGE25_LONG_FORM_PROVIDER_PAID_ACCOUNTING_MISSING');
  return Math.max(...values);
}
function nanoRate(usdPerMillion: number): number {
  const result = usdPerMillion * 1_000;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_PAID_PRICE_INVALID');
  }
  return result;
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry)
      && typeof entry === 'object' && !Array.isArray(entry)) : [];
}
