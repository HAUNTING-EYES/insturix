import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertStage25LongFormProviderCohortManifestV2,
  type Stage25LongFormProviderCohortManifestV2,
} from './stage25-long-form-plan-provider-cohort-v2';
import {
  preflightStage25LongFormProvidersV1,
  type Stage25LongFormProviderRequestCaptureV1,
} from './stage25-long-form-plan-provider-preflight-v1';

type JsonRecord = Record<string, unknown>;
export const STAGE25_LONG_FORM_PROVIDER_PREFLIGHT_VERSION_V2 =
  'EDITRON_STAGE25_LONG_FORM_PROVIDER_ZERO_INFERENCE_PREFLIGHT_V2_1' as const;

export interface Stage25LongFormProviderPreflightReceiptV2 {
  version: typeof STAGE25_LONG_FORM_PROVIDER_PREFLIGHT_VERSION_V2;
  authority: 'RESEARCH_ZERO_INFERENCE_PREFLIGHT_NO_PROJECT_ACCESS';
  operatorId: string;
  manifestSha256: string;
  sourceBindingSha256: string;
  basePreflightReceipt: Readonly<JsonRecord>;
  basePreflightReceiptSha256: string;
  checks: readonly Readonly<JsonRecord>[];
  requestCaptureSetSha256: string;
  networkCalls: Readonly<{
    modelMetadataGets: number;
    googleCountTokensPosts: number;
    inferenceCalls: 0;
  }>;
  initialAttemptCostUpperBoundUsd: number;
  absoluteMaxSpendNanoUsd: number;
  secretsPersisted: false;
  projectReads: 0;
  projectMutations: 0;
  dispatchAuthorized: false;
  assessment: 'PASS_9_DURABLE_REQUESTS_BOUNDED_ZERO_INFERENCE';
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function preflightStage25LongFormProvidersV2(input: {
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>;
  confirmedManifestSha256: string;
  operatorId: string;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
}): Promise<Readonly<{
  receipt: Readonly<Stage25LongFormProviderPreflightReceiptV2>;
  requestCaptures: readonly Readonly<Stage25LongFormProviderRequestCaptureV1>[];
}>> {
  const manifest = assertStage25LongFormProviderCohortManifestV2(input.manifest);
  if (input.confirmedManifestSha256 !== manifest.manifestSha256) {
    throw new Error('STAGE25_LONG_FORM_PREFLIGHT_V2_MANIFEST_CONFIRMATION_INVALID');
  }
  const base = await preflightStage25LongFormProvidersV1({
    manifest: manifest.baseManifest,
    confirmedManifestSha256: manifest.baseManifest.manifestSha256,
    operatorId: input.operatorId,
    environment: input.environment,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    durableMode: true,
  });
  const baseReceipt = record(base.receipt);
  const material = {
    version: STAGE25_LONG_FORM_PROVIDER_PREFLIGHT_VERSION_V2,
    authority: 'RESEARCH_ZERO_INFERENCE_PREFLIGHT_NO_PROJECT_ACCESS' as const,
    operatorId: input.operatorId,
    manifestSha256: manifest.manifestSha256,
    sourceBindingSha256: manifest.sourceBinding.sourceBindingSha256,
    basePreflightReceipt: baseReceipt,
    basePreflightReceiptSha256: text(baseReceipt.receiptSha256),
    checks: records(baseReceipt.checks),
    requestCaptureSetSha256: hashCanonicalJsonV1(base.requestCaptures),
    networkCalls: normalizeNetworkCalls(baseReceipt.networkCalls),
    initialAttemptCostUpperBoundUsd: number(baseReceipt.initialAttemptCostUpperBoundUsd),
    absoluteMaxSpendNanoUsd: manifest.absoluteMaxSpendNanoUsd,
    secretsPersisted: false as const,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    dispatchAuthorized: false as const,
    assessment: 'PASS_9_DURABLE_REQUESTS_BOUNDED_ZERO_INFERENCE' as const,
    stateEffects: [] as const,
  };
  const result = deepFreezeV1({
    receipt: { ...material, receiptSha256: hashCanonicalJsonV1(material) },
    requestCaptures: base.requestCaptures,
  });
  return assertStage25LongFormProviderPreflightBundleV2({ manifest, ...result });
}

export function assertStage25LongFormProviderPreflightBundleV2(input: {
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>;
  receipt: Readonly<Stage25LongFormProviderPreflightReceiptV2>;
  requestCaptures: readonly Readonly<Stage25LongFormProviderRequestCaptureV1>[];
}): Readonly<{
  receipt: Readonly<Stage25LongFormProviderPreflightReceiptV2>;
  requestCaptures: readonly Readonly<Stage25LongFormProviderRequestCaptureV1>[];
}> {
  const manifest = assertStage25LongFormProviderCohortManifestV2(input.manifest);
  const receipt = input.receipt;
  const { receiptSha256, ...material } = receipt;
  const checks = new Map(receipt.checks.map((check) => [text(check.rowId), check]));
  const rows = new Map(manifest.rows.map((row) => [row.rowId, row]));
  assertBaseReceipt(manifest, receipt, input.requestCaptures);
  if (receipt.version !== STAGE25_LONG_FORM_PROVIDER_PREFLIGHT_VERSION_V2
    || receipt.authority !== 'RESEARCH_ZERO_INFERENCE_PREFLIGHT_NO_PROJECT_ACCESS'
    || !/^[A-Za-z0-9._-]{1,128}$/.test(receipt.operatorId)
    || receipt.manifestSha256 !== manifest.manifestSha256
    || receipt.sourceBindingSha256 !== manifest.sourceBinding.sourceBindingSha256
    || receipt.checks.length !== 9
    || input.requestCaptures.length !== 9
    || new Set(input.requestCaptures.map(({ rowId }) => rowId)).size !== 9
    || receipt.requestCaptureSetSha256 !== hashCanonicalJsonV1(input.requestCaptures)
    || receipt.networkCalls.modelMetadataGets !== 3
    || receipt.networkCalls.googleCountTokensPosts !== 3
    || receipt.networkCalls.inferenceCalls !== 0
    || receipt.dispatchAuthorized !== false
    || receipt.projectReads !== 0 || receipt.projectMutations !== 0
    || receipt.secretsPersisted !== false || receipt.stateEffects.length !== 0
    || receipt.absoluteMaxSpendNanoUsd !== manifest.absoluteMaxSpendNanoUsd
    || receipt.assessment !== 'PASS_9_DURABLE_REQUESTS_BOUNDED_ZERO_INFERENCE'
    || receiptSha256 !== hashCanonicalJsonV1(material)) {
    throw new Error('STAGE25_LONG_FORM_PREFLIGHT_V2_BUNDLE_INVALID');
  }
  for (const capture of input.requestCaptures) {
    const row = rows.get(capture.rowId);
    const check = checks.get(capture.rowId);
    const serialized = JSON.stringify(capture.request.body);
    if (!row || capture.routeId !== row.routeId || capture.model !== row.model
      || capture.presentationOrdinal !== row.presentationOrdinal
      || capture.request.requestHash !== text(check?.requestSha256)
      || capture.request.requestHash !== hashCanonicalJsonV1({
        endpoint: capture.request.endpoint, body: capture.request.body,
      })
      || !Number.isSafeInteger(capture.boundedInputTokens)
      || capture.boundedInputTokens < 1
      || capture.boundedInputTokens > manifest.baseManifest.maxInputTokensPerRow
      || capture.boundedInputTokens !== number(check?.boundedInputTokens)
      || capture.tokenCountMethod !== text(check?.tokenCountMethod)
      || capture.countResponseSha256 !== nullableText(check?.countResponseSha256)
      || capture.initialAttemptCostUpperBoundUsd
        !== number(check?.initialAttemptCostUpperBoundUsd)
      || capture.initialAttemptCostUpperBoundUsd < 0
      || capture.initialAttemptCostUpperBoundUsd
        > manifest.baseManifest.rows.find(({ rowId }) => rowId === row.rowId)!
          .absoluteMaxRowSpendUsd
      || !serialized.includes('OPAQUE_RESULT_REFERENCES')
      || 'headers' in capture.request) {
      throw new Error(`STAGE25_LONG_FORM_PREFLIGHT_V2_CAPTURE_INVALID:${capture.rowId}`);
    }
  }
  return deepFreezeV1(structuredClone(input));
}

function assertBaseReceipt(
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>,
  receipt: Readonly<Stage25LongFormProviderPreflightReceiptV2>,
  captures: readonly Readonly<Stage25LongFormProviderRequestCaptureV1>[],
): void {
  const base = receipt.basePreflightReceipt;
  const { receiptSha256, ...baseMaterial } = base;
  const network = record(base.networkCalls);
  if (text(base.version)
      !== 'EDITRON_STAGE25_LONG_FORM_PROVIDER_ZERO_INFERENCE_PREFLIGHT_V1_1'
    || text(base.authority)
      !== 'RESEARCH_ZERO_INFERENCE_PREFLIGHT_NO_PROJECT_ACCESS'
    || text(base.manifestSha256) !== manifest.baseManifest.manifestSha256
    || text(base.requestCaptureSetSha256) !== hashCanonicalJsonV1(captures)
    || number(network.modelMetadataGets) !== 3
    || number(network.googleCountTokensPosts) !== 3
    || number(network.inferenceCalls) !== 0
    || base.dispatchAuthorized !== false || number(base.projectReads) !== 0
    || number(base.projectMutations) !== 0 || base.secretsPersisted !== false
    || text(receipt.basePreflightReceiptSha256) !== text(receiptSha256)
    || text(receiptSha256) !== hashCanonicalJsonV1(baseMaterial)) {
    throw new Error('STAGE25_LONG_FORM_PREFLIGHT_V2_BASE_RECEIPT_INVALID');
  }
}

function normalizeNetworkCalls(value: unknown) {
  const calls = record(value);
  const result = {
    modelMetadataGets: number(calls.modelMetadataGets),
    googleCountTokensPosts: number(calls.googleCountTokensPosts),
    inferenceCalls: number(calls.inferenceCalls),
  };
  if (result.modelMetadataGets !== 3 || result.googleCountTokensPosts !== 3
    || result.inferenceCalls !== 0) {
    throw new Error('STAGE25_LONG_FORM_PREFLIGHT_V2_NETWORK_CALLS_INVALID');
  }
  return result as { modelMetadataGets: number; googleCountTokensPosts: number; inferenceCalls: 0 };
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return typeof value === 'number' ? value : NaN; }
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
