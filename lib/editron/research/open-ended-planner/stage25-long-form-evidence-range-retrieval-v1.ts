import { z } from 'zod';

import { deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1 } from '../../services/canonical-json-v1';
import { EditorialPlanArtifactRefSchemaV1 }
  from '../../services/editorial-plan-v1';
import {
  assertStage25LongFormEvidenceScaleProxyV1,
  Stage25LongFormEvidenceSourceRangeSchemaV1,
  STAGE25_LONG_FORM_EVIDENCE_KINDS_V1,
  type Stage25LongFormEvidenceKindV1,
  type Stage25LongFormEvidenceScaleProxyV1,
} from './stage25-long-form-evidence-scale-proxy-v1';

export const STAGE25_LONG_FORM_EVIDENCE_RANGE_RETRIEVAL_VERSION_V1 =
  'EDITRON_STAGE25_LONG_FORM_EVIDENCE_RANGE_RETRIEVAL_V1_1' as const;

const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/);
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const POSITIVE_INTEGER = z.string().regex(/^[1-9]\d*$/);
const NON_NEGATIVE_INTEGER = z.string().regex(/^(0|[1-9]\d*)$/);
const RangeRequest = z.object({
  rangeRequestId: ID, priorityOrdinal: z.number().int().min(0).max(15),
  sourceAssetId: ID, sourceVersionSha256: SHA256,
  startPts: NON_NEGATIVE_INTEGER, endExclusivePts: POSITIVE_INTEGER,
  requiredEvidenceKinds: z.array(z.enum(STAGE25_LONG_FORM_EVIDENCE_KINDS_V1))
    .min(1).max(STAGE25_LONG_FORM_EVIDENCE_KINDS_V1.length),
}).strict();
const RequestMaterial = z.object({
  version: z.literal(STAGE25_LONG_FORM_EVIDENCE_RANGE_RETRIEVAL_VERSION_V1),
  authority: z.literal('RESEARCH_BOUNDED_RETRIEVAL_ONLY'),
  evidenceClass: z.literal('SCALE_PROXY_ONLY'),
  requestId: ID,
  inventorySha256: SHA256,
  ranges: z.array(RangeRequest).min(1).max(16),
  budget: z.object({
    maxRangeRequests: z.number().int().min(1).max(16), maxWindowDurationUs: POSITIVE_INTEGER,
    maxTotalHydratedDurationUs: POSITIVE_INTEGER,
    maxEvidenceRefs: z.number().int().min(1).max(64), maxContextTokens: z.number().int().min(1).max(100_000),
  }).strict(),
  stateEffects: z.tuple([]),
}).strict();
const Request = RequestMaterial.extend({ requestSha256: SHA256 }).strict();

const RationalRate = z.object({
  numerator: POSITIVE_INTEGER, denominator: POSITIVE_INTEGER,
}).strict();
const MediaArtifactRef = z.object({
  artifactId: ID, version: ID,
  digest: z.object({ algorithm: z.literal('sha-256'), value: SHA256 }).strict(),
}).strict();
const ReelIdentity = z.object({
  reelId: ID, start: z.string().regex(/^\d{2}:\d{2}:\d{2}[:;]\d{2}$/),
  rate: RationalRate, dropFrame: z.boolean(), evidence: MediaArtifactRef,
}).strict();
const Cadence = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('CFR'), frameRate: RationalRate,
    frameCount: POSITIVE_INTEGER }).strict(),
  z.object({ kind: z.literal('VFR'), nominalFrameRate: RationalRate,
    ptsMapping: MediaArtifactRef }).strict(),
]);
const EvidenceBinding = z.object({
  kind: z.enum(STAGE25_LONG_FORM_EVIDENCE_KINDS_V1), evidenceId: ID,
  artifactRef: EditorialPlanArtifactRefSchemaV1,
  producerRef: EditorialPlanArtifactRefSchemaV1,
  estimatedContextTokens: z.number().int().positive().max(100_000),
  payloadDisposition: z.literal('REFERENCE_ONLY_NO_PAYLOAD_BYTES'),
}).strict();
const SelectedWindow = z.object({
  rangeRequestId: ID, sourceAssetId: ID, sourceVersionSha256: SHA256,
  sourceRange: Stage25LongFormEvidenceSourceRangeSchemaV1,
  reelIdentity: ReelIdentity, cadence: Cadence,
  evidenceBindings: z.array(EvidenceBinding).max(4),
}).strict();
const CoverageStatus = z.enum([
  'COVERED', 'OMITTED_EVIDENCE_REF_BUDGET', 'OMITTED_CONTEXT_TOKEN_BUDGET',
]);
const CoverageEntry = z.object({
  rangeRequestId: ID, evidenceKind: z.enum(STAGE25_LONG_FORM_EVIDENCE_KINDS_V1),
  evidenceId: ID, status: CoverageStatus,
}).strict();
const OmissionReason = z.enum(['EVIDENCE_REF_BUDGET', 'CONTEXT_TOKEN_BUDGET']);
const OmissionEntry = z.object({
  rangeRequestId: ID, sourceAssetId: ID,
  evidenceKind: z.enum(STAGE25_LONG_FORM_EVIDENCE_KINDS_V1), evidenceId: ID,
  reason: OmissionReason,
}).strict();
const ContextBudget = z.object({
  maxRangeRequests: z.number().int().min(1).max(16),
  requestedRangeCount: z.number().int().min(1).max(16),
  maxWindowDurationUs: POSITIVE_INTEGER, maxTotalHydratedDurationUs: POSITIVE_INTEGER,
  hydratedDurationUs: NON_NEGATIVE_INTEGER,
  maxEvidenceRefs: z.number().int().min(1).max(64),
  selectedEvidenceRefs: z.number().int().min(0).max(64),
  maxContextTokens: z.number().int().min(1).max(100_000),
  consumedContextTokens: z.number().int().min(0).max(100_000),
  remainingContextTokens: z.number().int().min(0).max(100_000),
}).strict();
const ReceiptMaterial = z.object({
  version: z.literal(STAGE25_LONG_FORM_EVIDENCE_RANGE_RETRIEVAL_VERSION_V1),
  authority: z.literal('RESEARCH_BOUNDED_RETRIEVAL_ONLY'),
  evidenceClass: z.literal('SCALE_PROXY_ONLY'),
  requestSha256: SHA256, inventorySha256: SHA256,
  disposition: z.enum(['PASS_STRUCTURAL_SCALE_PROXY_ONLY',
    'UNVERIFIABLE_CONTEXT_BUDGET']),
  selectedWindows: z.array(SelectedWindow).min(1).max(16),
  coverageLedger: z.array(CoverageEntry).min(1).max(64),
  omissionLedger: z.array(OmissionEntry).max(64), contextBudget: ContextBudget,
  limitations: z.tuple([
    z.literal('REFERENCES_ONLY_NO_EVIDENCE_PAYLOADS_OR_MEDIA_BYTES'),
    z.literal('NO_SEMANTIC_RANGE_ACCURACY_MEDIA_QUALITY_OR_PRODUCT_PROOF'),
  ]),
  providerInferenceCalls: z.literal(0), networkCalls: z.literal(0),
  renderCalls: z.literal(0), canonicalProjectReads: z.literal(0),
  canonicalProjectMutations: z.literal(0), stateEffects: z.tuple([]),
}).strict();
export const Stage25LongFormEvidenceRangeRetrievalReceiptSchemaV1 =
  ReceiptMaterial.extend({ receiptSha256: SHA256 }).strict();

export type Stage25LongFormEvidenceRangeRetrievalRequestV1 = z.infer<typeof Request>;
export type Stage25LongFormEvidenceRangeRetrievalMaterialV1 =
  z.infer<typeof RequestMaterial>;
export type Stage25LongFormEvidenceRangeRetrievalReceiptV1 =
  z.infer<typeof Stage25LongFormEvidenceRangeRetrievalReceiptSchemaV1>;

export function createStage25LongFormEvidenceRangeRetrievalRequestV1(
  material: Stage25LongFormEvidenceRangeRetrievalMaterialV1,
): Readonly<Stage25LongFormEvidenceRangeRetrievalRequestV1> {
  const parsed = RequestMaterial.parse(material);
  assertRequestInvariants(parsed);
  const canonical = canonicalizeRequestMaterial(parsed);
  return deepFreezeEditronJsonV1({
    ...canonical,
    requestSha256: hashEditronCanonicalJsonV1(canonical),
  }) as Readonly<Stage25LongFormEvidenceRangeRetrievalRequestV1>;
}

export function retrieveStage25LongFormEvidenceRangesV1(input: Readonly<{
  inventory: unknown;
  request: unknown;
}>): Readonly<Stage25LongFormEvidenceRangeRetrievalReceiptV1> {
  const inventory = assertStage25LongFormEvidenceScaleProxyV1(input.inventory);
  const request = assertRequest(input.request);
  if (request.inventorySha256 !== inventory.inventorySha256) fail('INVENTORY_BINDING_INVALID');
  const sourceById = new Map(inventory.sources.map((source) =>
    [qualifiedAssetId(source.identity), source]));
  const selectedWindows: z.infer<typeof SelectedWindow>[] = [];
  const coverageLedger: z.infer<typeof CoverageEntry>[] = [];
  const omissionLedger: z.infer<typeof OmissionEntry>[] = [];
  let totalDurationUs = BigInt(0);
  let consumedTokens = 0;
  let selectedEvidenceRefs = 0;

  for (const range of request.ranges) {
    const source = sourceById.get(range.sourceAssetId);
    if (!source) fail(`SOURCE_UNKNOWN:${range.sourceAssetId}`);
    if (source.sourceVersionSha256 !== range.sourceVersionSha256) {
      fail(`SOURCE_VERSION_STALE:${range.sourceAssetId}`);
    }
    const identity = qualifiedIdentity(source.identity);
    const durationUs = validateRangeAndDurationUs(range, identity);
    if (durationUs > BigInt(request.budget.maxWindowDurationUs)) {
      fail(`WINDOW_DURATION_BUDGET_EXCEEDED:${range.rangeRequestId}`);
    }
    totalDurationUs += durationUs;
    if (totalDurationUs > BigInt(request.budget.maxTotalHydratedDurationUs)) {
      fail('TOTAL_DURATION_BUDGET_EXCEEDED');
    }
    const evidenceByKind = new Map(source.evidenceReferences.map((evidence) => [
      evidence.kind, evidence,
    ]));
    const evidenceBindings: z.infer<typeof EvidenceBinding>[] = [];
    for (const kind of range.requiredEvidenceKinds) {
      const evidence = evidenceByKind.get(kind);
      if (!evidence) fail(`REQUIRED_EVIDENCE_REFERENCE_MISSING:${range.rangeRequestId}:${kind}`);
      const tokenCost = estimateContextTokens(kind, durationUs);
      const omissionReason = selectedEvidenceRefs >= request.budget.maxEvidenceRefs
        ? 'EVIDENCE_REF_BUDGET'
        : consumedTokens + tokenCost > request.budget.maxContextTokens
          ? 'CONTEXT_TOKEN_BUDGET' : null;
      if (omissionReason) {
        coverageLedger.push(coverage(range.rangeRequestId, kind, evidence.evidenceId,
          `OMITTED_${omissionReason}`));
        omissionLedger.push({ rangeRequestId: range.rangeRequestId,
          sourceAssetId: range.sourceAssetId, evidenceKind: kind,
          evidenceId: evidence.evidenceId, reason: omissionReason });
        continue;
      }
      consumedTokens += tokenCost;
      selectedEvidenceRefs += 1;
      coverageLedger.push(coverage(range.rangeRequestId, kind, evidence.evidenceId, 'COVERED'));
      evidenceBindings.push({ kind, evidenceId: evidence.evidenceId,
        artifactRef: evidence.artifactRef, producerRef: evidence.producerRef,
        estimatedContextTokens: tokenCost,
        payloadDisposition: evidence.payloadDisposition });
    }
    selectedWindows.push({
      rangeRequestId: range.rangeRequestId, sourceAssetId: range.sourceAssetId,
      sourceVersionSha256: range.sourceVersionSha256,
      sourceRange: {
        coordinateDomain: 'SOURCE_PTS', timebaseId: identity.source.timebase.timebaseId,
        timebaseVersion: identity.source.timebase.version,
        ticksPerSecond: identity.source.timebase.ticksPerSecond,
        startPts: range.startPts, endExclusivePts: range.endExclusivePts,
      },
      reelIdentity: identity.source.reelTimecode, cadence: identity.source.cadence,
      evidenceBindings,
    });
  }
  const material = {
    version: STAGE25_LONG_FORM_EVIDENCE_RANGE_RETRIEVAL_VERSION_V1,
    authority: 'RESEARCH_BOUNDED_RETRIEVAL_ONLY' as const,
    evidenceClass: 'SCALE_PROXY_ONLY' as const,
    requestSha256: request.requestSha256, inventorySha256: inventory.inventorySha256,
    disposition: omissionLedger.length
      ? 'UNVERIFIABLE_CONTEXT_BUDGET' as const
      : 'PASS_STRUCTURAL_SCALE_PROXY_ONLY' as const,
    selectedWindows, coverageLedger, omissionLedger,
    contextBudget: {
      maxRangeRequests: request.budget.maxRangeRequests,
      requestedRangeCount: request.ranges.length,
      maxWindowDurationUs: request.budget.maxWindowDurationUs,
      maxTotalHydratedDurationUs: request.budget.maxTotalHydratedDurationUs,
      hydratedDurationUs: String(totalDurationUs),
      maxEvidenceRefs: request.budget.maxEvidenceRefs, selectedEvidenceRefs,
      maxContextTokens: request.budget.maxContextTokens,
      consumedContextTokens: consumedTokens,
      remainingContextTokens: request.budget.maxContextTokens - consumedTokens,
    },
    limitations: [
      'REFERENCES_ONLY_NO_EVIDENCE_PAYLOADS_OR_MEDIA_BYTES',
      'NO_SEMANTIC_RANGE_ACCURACY_MEDIA_QUALITY_OR_PRODUCT_PROOF',
    ] as const,
    providerInferenceCalls: 0 as const, networkCalls: 0 as const,
    renderCalls: 0 as const, canonicalProjectReads: 0 as const,
    canonicalProjectMutations: 0 as const,
    stateEffects: [] as const,
  };
  return assertStage25LongFormEvidenceRangeRetrievalReceiptV1({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertStage25LongFormEvidenceRangeRetrievalReceiptV1(
  value: unknown,
): Readonly<Stage25LongFormEvidenceRangeRetrievalReceiptV1> {
  let receipt: Stage25LongFormEvidenceRangeRetrievalReceiptV1;
  try {
    receipt = Stage25LongFormEvidenceRangeRetrievalReceiptSchemaV1.parse(value);
  } catch {
    fail('RECEIPT_SCHEMA_INVALID');
  }
  const { receiptSha256, ...material } = receipt;
  if (receiptSha256 !== hashEditronCanonicalJsonV1(material)) fail('RECEIPT_HASH_INVALID');
  assertReceiptInvariants(receipt);
  return deepFreezeEditronJsonV1(receipt) as Readonly<
  Stage25LongFormEvidenceRangeRetrievalReceiptV1>;
}

function assertReceiptInvariants(
  receipt: Stage25LongFormEvidenceRangeRetrievalReceiptV1,
): void {
  const budget = receipt.contextBudget;
  const hasOmissions = receipt.omissionLedger.length > 0;
  if (hasOmissions !== (receipt.disposition === 'UNVERIFIABLE_CONTEXT_BUDGET')) {
    fail('RECEIPT_DISPOSITION_INVALID');
  }
  const windows = new Map<string, typeof receipt.selectedWindows[number]>();
  const selectedTuples = new Set<string>();
  let selectedEvidenceRefs = 0;
  let consumedContextTokens = 0;
  let hydratedDurationUs = BigInt(0);
  for (const window of receipt.selectedWindows) {
    addUnique(windows, window.rangeRequestId, window, 'RECEIPT_WINDOW_ID_DUPLICATED');
    const durationUs = receiptRangeDurationUs(window.sourceRange);
    if (durationUs > BigInt(budget.maxWindowDurationUs)) {
      fail('RECEIPT_WINDOW_DURATION_LIMIT_INVALID');
    }
    hydratedDurationUs += durationUs;
    const kinds = new Set<string>();
    const evidenceIds = new Set<string>();
    for (const binding of window.evidenceBindings) {
      addUnique(kinds, binding.kind, binding.kind, 'RECEIPT_BINDING_KIND_DUPLICATED');
      addUnique(evidenceIds, binding.evidenceId, binding.evidenceId,
        'RECEIPT_BINDING_ID_DUPLICATED');
      selectedTuples.add(receiptTuple(window.rangeRequestId, binding.kind,
        binding.evidenceId));
      selectedEvidenceRefs += 1;
      consumedContextTokens += binding.estimatedContextTokens;
    }
  }
  const coverage = new Map<string, z.infer<typeof CoverageStatus>>();
  for (const entry of receipt.coverageLedger) {
    if (!windows.has(entry.rangeRequestId)) fail('RECEIPT_COVERAGE_RANGE_UNKNOWN');
    addUnique(coverage, receiptTuple(entry.rangeRequestId, entry.evidenceKind,
      entry.evidenceId), entry.status, 'RECEIPT_COVERAGE_TUPLE_DUPLICATED');
  }
  const omittedTuples = new Set<string>();
  for (const omission of receipt.omissionLedger) {
    const window = windows.get(omission.rangeRequestId);
    if (!window || window.sourceAssetId !== omission.sourceAssetId) {
      fail('RECEIPT_OMISSION_RANGE_INVALID');
    }
    const tuple = receiptTuple(omission.rangeRequestId, omission.evidenceKind,
      omission.evidenceId);
    if (selectedTuples.has(tuple)) fail('RECEIPT_SELECTION_OMISSION_CONFLICT');
    addUnique(omittedTuples, tuple, tuple, 'RECEIPT_OMISSION_TUPLE_DUPLICATED');
    if (coverage.get(tuple) !== `OMITTED_${omission.reason}`) {
      fail('RECEIPT_OMISSION_COVERAGE_INVALID');
    }
  }
  for (const tuple of selectedTuples) {
    if (coverage.get(tuple) !== 'COVERED') fail('RECEIPT_SELECTION_COVERAGE_INVALID');
  }
  if (coverage.size !== selectedTuples.size + omittedTuples.size) {
    fail('RECEIPT_COVERAGE_ACCOUNTING_INVALID');
  }
  if (budget.requestedRangeCount !== receipt.selectedWindows.length
    || budget.requestedRangeCount > budget.maxRangeRequests) {
    fail('RECEIPT_RANGE_COUNT_INVALID');
  }
  if (selectedEvidenceRefs !== budget.selectedEvidenceRefs
    || selectedEvidenceRefs > budget.maxEvidenceRefs) {
    fail('RECEIPT_SELECTED_REF_COUNT_INVALID');
  }
  if (consumedContextTokens !== budget.consumedContextTokens
    || consumedContextTokens > budget.maxContextTokens
    || budget.remainingContextTokens
      !== budget.maxContextTokens - budget.consumedContextTokens) {
    fail('RECEIPT_CONTEXT_TOKEN_ARITHMETIC_INVALID');
  }
  if (hydratedDurationUs !== BigInt(budget.hydratedDurationUs)
    || hydratedDurationUs > BigInt(budget.maxTotalHydratedDurationUs)) {
    fail('RECEIPT_DURATION_ACCOUNTING_INVALID');
  }
}

function assertRequest(
  value: unknown,
): Readonly<Stage25LongFormEvidenceRangeRetrievalRequestV1> {
  const request = Request.parse(value);
  const { requestSha256, ...material } = request;
  assertRequestInvariants(material);
  if (hashEditronCanonicalJsonV1(material)
    !== hashEditronCanonicalJsonV1(canonicalizeRequestMaterial(material))) {
    fail('REQUEST_NON_CANONICAL');
  }
  if (requestSha256 !== hashEditronCanonicalJsonV1(material)) fail('REQUEST_HASH_INVALID');
  return request;
}

function assertRequestInvariants(
  material: Stage25LongFormEvidenceRangeRetrievalMaterialV1,
) {
  if (material.ranges.length > material.budget.maxRangeRequests) fail('RANGE_COUNT_BUDGET_EXCEEDED');
  const ids = new Set<string>();
  const priorities = new Set<number>();
  for (const range of material.ranges) {
    if (ids.has(range.rangeRequestId)) fail('RANGE_REQUEST_ID_DUPLICATED');
    ids.add(range.rangeRequestId);
    if (priorities.has(range.priorityOrdinal)) fail('RANGE_PRIORITY_DUPLICATED');
    priorities.add(range.priorityOrdinal);
    if (new Set(range.requiredEvidenceKinds).size !== range.requiredEvidenceKinds.length) {
      fail(`EVIDENCE_KIND_DUPLICATED:${range.rangeRequestId}`);
    }
  }
  if (material.ranges.some((_, index) => !priorities.has(index))) {
    fail('RANGE_PRIORITY_NOT_CONTIGUOUS');
  }
}

function canonicalizeRequestMaterial(
  material: Stage25LongFormEvidenceRangeRetrievalMaterialV1,
): Stage25LongFormEvidenceRangeRetrievalMaterialV1 {
  const kindOrder = new Map(STAGE25_LONG_FORM_EVIDENCE_KINDS_V1
    .map((kind, index) => [kind, index] as const));
  return {
    ...material,
    ranges: material.ranges.map((range) => ({
      ...range,
      requiredEvidenceKinds: [...range.requiredEvidenceKinds]
        .sort((left, right) => kindOrder.get(left)! - kindOrder.get(right)!),
    })).sort((left, right) => left.priorityOrdinal - right.priorityOrdinal),
  };
}

function validateRangeAndDurationUs(
  range: z.infer<typeof RangeRequest>,
  identity: ReturnType<typeof qualifiedIdentity>,
): bigint {
  const start = BigInt(range.startPts);
  const end = BigInt(range.endExclusivePts);
  const sourceStart = BigInt(identity.source.range.startTick);
  const sourceEnd = BigInt(identity.source.range.endExclusiveTick);
  if (end <= start || start < sourceStart || end > sourceEnd) {
    fail(`SOURCE_RANGE_INVALID:${range.rangeRequestId}`);
  }
  const rate = identity.source.timebase.ticksPerSecond;
  return ceilDiv((end - start) * BigInt(1_000_000) * BigInt(rate.denominator),
    BigInt(rate.numerator));
}

function estimateContextTokens(kind: Stage25LongFormEvidenceKindV1, durationUs: bigint) {
  const seconds = ceilDiv(durationUs, BigInt(1_000_000));
  const base = kind === 'TRANSCRIPT' ? 80 : kind === 'SHOT' ? 60 : kind === 'AUDIO' ? 50 : 20;
  const variable = kind === 'TRANSCRIPT' ? seconds * BigInt(3)
    : kind === 'SHOT' || kind === 'AUDIO' ? ceilDiv(seconds, BigInt(2)) : BigInt(0);
  const result = BigInt(base) + variable;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) fail('CONTEXT_TOKEN_ESTIMATE_UNSAFE');
  return Number(result);
}

function coverage(rangeRequestId: string, kind: Stage25LongFormEvidenceKindV1,
  evidenceId: string, status: z.infer<typeof CoverageStatus>) {
  return { rangeRequestId, evidenceKind: kind, evidenceId, status };
}

function receiptRangeDurationUs(
  range: z.infer<typeof Stage25LongFormEvidenceSourceRangeSchemaV1>,
): bigint {
  const start = BigInt(range.startPts);
  const end = BigInt(range.endExclusivePts);
  if (end <= start) fail('RECEIPT_SOURCE_RANGE_INVALID');
  return ceilDiv((end - start) * BigInt(1_000_000)
    * BigInt(range.ticksPerSecond.denominator),
  BigInt(range.ticksPerSecond.numerator));
}

function receiptTuple(rangeRequestId: string, kind: Stage25LongFormEvidenceKindV1,
  evidenceId: string): string {
  return `${rangeRequestId}|${kind}|${evidenceId}`;
}

function addUnique<T>(values: Map<string, T>, key: string, value: T,
  code: string): void;
function addUnique(values: Set<string>, key: string, value: string,
  code: string): void;
function addUnique<T>(values: Map<string, T> | Set<string>, key: string,
  value: T | string, code: string): void {
  if (values.has(key)) fail(code);
  if (values instanceof Map) values.set(key, value as T);
  else values.add(key);
}

function qualifiedAssetId(identity: Stage25LongFormEvidenceScaleProxyV1['sources'][number]['identity']) {
  return qualifiedIdentity(identity).media.assetId;
}

function qualifiedIdentity(
  identity: Stage25LongFormEvidenceScaleProxyV1['sources'][number]['identity'],
) {
  if (identity.identityStatus !== 'QUALIFIED') fail('SOURCE_NOT_QUALIFIED');
  return identity;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - BigInt(1)) / denominator;
}

function fail(code: string): never {
  throw new Error(`STAGE25_LONG_FORM_EVIDENCE_RETRIEVAL_${code}`);
}
