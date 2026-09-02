import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { ProviderNativeDurableAttemptReceiptV2R }
  from './provider-native-durable-attempt-receipt-v2r';
import type { ProviderNativeDurableDispatchIntentV2R }
  from './provider-native-durable-dispatch-intent-v2r';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from './provider-native-episode-resume-v2r';
import type { ProviderNativeEpisodeReceiptV2R }
  from './provider-native-tool-episode-v2r';
import {
  evaluateStage25LongFormProviderEpisodeV1,
} from './stage25-long-form-plan-provider-evaluator-v1';
import type { Stage25LongFormProviderCohortManifestV2 }
  from './stage25-long-form-plan-provider-cohort-v2';
import type { Stage25LongFormProviderPaidAuthorizationV2 }
  from './stage25-long-form-plan-paid-authorization-v2';
import type { Stage25LongFormProviderRequestCaptureV1 }
  from './stage25-long-form-plan-provider-preflight-v1';
import type { Stage25LongFormProviderPreflightReceiptV2 }
  from './stage25-long-form-plan-provider-preflight-v2';

type JsonRecord = Record<string, unknown>;
export const STAGE25_LONG_FORM_PROVIDER_PAID_ROW_VERSION_V2 =
  'EDITRON_STAGE25_LONG_FORM_PROVIDER_PAID_ROW_V2_1' as const;
export const STAGE25_LONG_FORM_PROVIDER_PAID_COHORT_RECEIPT_VERSION_V2 =
  'EDITRON_STAGE25_LONG_FORM_PROVIDER_PAID_COHORT_RECEIPT_V2_1' as const;

export interface Stage25LongFormProviderPaidRowResultV2 {
  version: typeof STAGE25_LONG_FORM_PROVIDER_PAID_ROW_VERSION_V2;
  authority: 'RESEARCH_PROVIDER_RESULT_NO_PROJECT_AUTHORITY';
  rowId: string;
  routeId: string;
  model: string;
  presentationOrdinal: number;
  manifestSha256: string;
  preflightReceiptSha256: string;
  authorizationSha256: string;
  requestSha256: string;
  episode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  evaluation: Readonly<JsonRecord>;
  accounting: Readonly<{
    providerDispatchesAccounted: 1;
    providerInferenceCallsObserved: 0 | 1;
    spentNanoUsd: number;
    observation: 'RESPONSE_OBSERVED' | 'RECOVERED_UNKNOWN_DISPATCH_NO_RETRY';
  }>;
  projectReads: 0;
  projectMutations: 0;
  stateEffects: readonly [];
  resultSha256: string;
}

export interface Stage25LongFormProviderPaidDurablePortV2 {
  load(rowId: string): Promise<Readonly<{
    completedRow?: Readonly<Stage25LongFormProviderPaidRowResultV2>;
    resumeCheckpoint?: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  }>>;
  commitDispatch(input: Readonly<{
    rowId: string;
    dispatchIntent: Readonly<ProviderNativeDurableDispatchIntentV2R>;
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  }>): Promise<void>;
  commitAttempt(input: Readonly<{
    rowId: string;
    attemptReceipt: Readonly<ProviderNativeDurableAttemptReceiptV2R>;
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    dispatchIntent?: Readonly<ProviderNativeDurableDispatchIntentV2R>;
  }>): Promise<void>;
  /** Atomically stores the row and supersedes any pending checkpoint. */
  commitRow(input: Readonly<{
    rowId: string;
    row: Readonly<Stage25LongFormProviderPaidRowResultV2>;
  }>): Promise<void>;
}

export function createStage25LongFormProviderPaidRowResultV2(input: {
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>;
  preflight: Readonly<Stage25LongFormProviderPreflightReceiptV2>;
  authorization: Readonly<Stage25LongFormProviderPaidAuthorizationV2>;
  capture: Readonly<Stage25LongFormProviderRequestCaptureV1>;
  episode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  providerInferenceCallsObserved: 0 | 1;
  spentNanoUsd: number;
}): Readonly<Stage25LongFormProviderPaidRowResultV2> {
  const row = input.manifest.rows.find(({ rowId }) => rowId === input.capture.rowId);
  if (!row) throw new Error('STAGE25_LONG_FORM_PROVIDER_PAID_ROW_SCOPE_MISSING');
  const evaluation = evaluateStage25LongFormProviderEpisodeV1(input.episode);
  const material = {
    version: STAGE25_LONG_FORM_PROVIDER_PAID_ROW_VERSION_V2,
    authority: 'RESEARCH_PROVIDER_RESULT_NO_PROJECT_AUTHORITY' as const,
    rowId: row.rowId, routeId: row.routeId, model: row.model,
    presentationOrdinal: row.presentationOrdinal,
    manifestSha256: input.manifest.manifestSha256,
    preflightReceiptSha256: input.preflight.receiptSha256,
    authorizationSha256: input.authorization.authorizationSha256,
    requestSha256: input.capture.request.requestHash,
    episode: input.episode,
    evaluation,
    accounting: {
      providerDispatchesAccounted: 1 as const,
      providerInferenceCallsObserved: input.providerInferenceCallsObserved,
      spentNanoUsd: input.spentNanoUsd,
      observation: input.providerInferenceCallsObserved
        ? 'RESPONSE_OBSERVED' as const
        : 'RECOVERED_UNKNOWN_DISPATCH_NO_RETRY' as const,
    },
    projectReads: 0 as const, projectMutations: 0 as const,
    stateEffects: [] as const,
  };
  return assertStage25LongFormProviderPaidRowResultV2({
    manifest: input.manifest, preflight: input.preflight,
    authorization: input.authorization, capture: input.capture,
    row: { ...material, resultSha256: hashCanonicalJsonV1(material) },
  });
}

export function assertStage25LongFormProviderPaidRowResultV2(input: {
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>;
  preflight: Readonly<Stage25LongFormProviderPreflightReceiptV2>;
  authorization: Readonly<Stage25LongFormProviderPaidAuthorizationV2>;
  capture: Readonly<Stage25LongFormProviderRequestCaptureV1>;
  row: unknown;
}): Readonly<Stage25LongFormProviderPaidRowResultV2> {
  const row = input.row as Stage25LongFormProviderPaidRowResultV2;
  const scope = input.manifest.rows.find(({ rowId }) => rowId === input.capture.rowId);
  const { resultSha256, ...material } = row;
  const expectedEvaluation = evaluateStage25LongFormProviderEpisodeV1(row.episode);
  const recovered = row.accounting?.providerInferenceCallsObserved === 0;
  if (!scope || row.version !== STAGE25_LONG_FORM_PROVIDER_PAID_ROW_VERSION_V2
    || row.authority !== 'RESEARCH_PROVIDER_RESULT_NO_PROJECT_AUTHORITY'
    || row.rowId !== scope.rowId || row.routeId !== scope.routeId || row.model !== scope.model
    || row.presentationOrdinal !== scope.presentationOrdinal
    || row.manifestSha256 !== input.manifest.manifestSha256
    || row.preflightReceiptSha256 !== input.preflight.receiptSha256
    || row.authorizationSha256 !== input.authorization.authorizationSha256
    || row.requestSha256 !== input.capture.request.requestHash
    || row.episode.route.routeId !== scope.routeId || row.episode.route.model !== scope.model
    || hashCanonicalJsonV1(row.evaluation) !== hashCanonicalJsonV1(expectedEvaluation)
    || row.accounting.providerDispatchesAccounted !== 1
    || ![0, 1].includes(row.accounting.providerInferenceCallsObserved)
    || !Number.isSafeInteger(row.accounting.spentNanoUsd)
    || row.accounting.spentNanoUsd < 0
    || row.accounting.spentNanoUsd > scope.absoluteMaxRowSpendNanoUsd
    || recovered !== (row.accounting.observation === 'RECOVERED_UNKNOWN_DISPATCH_NO_RETRY')
    || row.projectReads !== 0 || row.projectMutations !== 0 || row.stateEffects.length !== 0
    || resultSha256 !== hashCanonicalJsonV1(material)) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_PAID_ROW_INVALID');
  }
  return deepFreezeV1(structuredClone(row));
}

export function createStage25LongFormProviderPaidCohortReceiptV2(input: {
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>;
  authorization: Readonly<Stage25LongFormProviderPaidAuthorizationV2>;
  rows: readonly Readonly<Stage25LongFormProviderPaidRowResultV2>[];
}): Readonly<JsonRecord> {
  const spentNanoUsd = input.rows.reduce((sum, row) => sum + row.accounting.spentNanoUsd, 0);
  if (input.rows.length !== 9 || spentNanoUsd > input.manifest.absoluteMaxSpendNanoUsd) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_PAID_COHORT_INVALID');
  }
  const dispositions = Object.fromEntries(input.rows.map((row) => [
    row.rowId, row.evaluation.structuralDisposition,
  ]));
  const material = {
    version: STAGE25_LONG_FORM_PROVIDER_PAID_COHORT_RECEIPT_VERSION_V2,
    authority: 'RESEARCH_PROVIDER_COHORT_RESULT_NO_PROJECT_AUTHORITY' as const,
    manifestSha256: input.manifest.manifestSha256,
    authorizationSha256: input.authorization.authorizationSha256,
    rowResultSha256: input.rows.map(({ resultSha256 }) => resultSha256),
    rows: 9 as const, providerDispatchesAccounted: 9 as const,
    providerInferenceCallsObserved: input.rows.reduce(
      (sum, row) => sum + row.accounting.providerInferenceCallsObserved, 0,
    ),
    spentNanoUsd, dispositions,
    projectReads: 0 as const, projectMutations: 0 as const, stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}
