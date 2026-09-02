import {
  buildHistoricalBenchmarkStatusReceiptV1,
  type HistoricalBenchmarkRowStatusInputV1,
  type HistoricalBenchmarkStatusReceiptV1,
} from './historical-benchmark-status-v1';
import {
  assertSealedHoldoutH02RevisionChainV4R,
  assertSealedHoldoutH02SemanticSequenceV4R,
  SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V4R,
  type H02EvidenceContractV4R,
  type H02SemanticPlacementV4R,
} from './sealed-holdout-h02-native-proof-v2r';
import {
  assertSealedHoldoutH04FinalStateEquivalenceV4R,
  SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V4R,
} from './sealed-holdout-h04-native-proof-v3r2';
import {
  assertSealedHoldoutOperationEvidenceV4R2,
  resolveExactHoldoutTranscriptCutRangeV4R2,
  SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R2,
} from './sealed-holdout-catalog-v4r2';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCaseV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import type { SealedHoldoutGeneralisationManifestV4R2 }
  from './sealed-holdout-generalisation-cohort-v4r2';
import { issueSealedHoldoutHistoricalStatusV4R2 }
  from './sealed-holdout-historical-status-v4r2';
import {
  assertBudgetedSealedHoldoutSelectedOperationTraceV3R2,
  type BudgetedSealedHoldoutSelectedOperationTraceV3R2,
  type SealedHoldoutTraceNodeV2R,
} from './sealed-holdout-trace-v2r';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;
type VerifiedTrace = Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
type TraceNode = Readonly<SealedHoldoutTraceNodeV2R>;
type ReplayDispositionV4R2 =
  | 'PASS_STRUCTURAL_ONLY'
  | 'FAIL_UNSAFE_ATTEMPT';

interface TargetedReplayEvidenceV4R2 {
  version: 'EDITRON_OE_SEALED_HOLDOUT_TARGETED_ROW_EVIDENCE_V4R2_2';
  authority: 'DERIVED_CURRENT_OWNER_REPLAY_NO_PROJECT_AUTHORITY';
  rowId: string;
  caseId: string;
  sourceRowSha256: string;
  disposition: ReplayDispositionV4R2;
  details: Readonly<JsonRecord>;
  stateEffects: readonly [];
  evidenceReceiptSha256: string;
}

export const SEALED_HOLDOUT_TARGETED_REPLAY_PATH_V4R2 =
  'lib/editron/research/open-ended-planner/sealed-holdout-targeted-replay-v4r2.ts' as const;

export const SEALED_HOLDOUT_TARGETED_REPLAY_POLICY_V4R2 = deepFreezeV1({
  version: 'EDITRON_OE_SEALED_HOLDOUT_TARGETED_REPLAY_POLICY_V4R2_2' as const,
  authority: 'ZERO_INFERENCE_CURRENT_SEMANTIC_AND_FINAL_STATE_REPLAY' as const,
  targetRows: [
    { rowId: '008-HOLD-02:C1-OPENAI_TERRA', rawStatus: 'FAIL_CLAIM_PROOF' },
    { rowId: '010-HOLD-02:C2-OPENAI_LUNA', rawStatus: 'FAIL_CLAIM_PROOF' },
    { rowId: '017-HOLD-04:C1-OPENAI_TERRA', rawStatus: 'FAIL_HIDDEN_EVALUATION' },
    { rowId: '020-HOLD-04:C2-OPENAI_TERRA', rawStatus: 'FAIL_HIDDEN_EVALUATION' },
  ],
  h02SemanticOwnerVersion: SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V4R,
  h04FinalStateOwnerVersion: SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V4R,
  operationEvidencePolicySha256: hashCanonicalJsonV1(
    SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R2,
  ),
  replayProofCeiling: 'STRUCTURAL' as const,
  providerRankingAuthorized: false,
  productionPromotionAuthorized: false,
});

export interface SealedHoldoutTargetedReplayReceiptV4R2 {
  version: 'EDITRON_OE_SEALED_HOLDOUT_TARGETED_REPLAY_RECEIPT_V4R2_2';
  authority: 'DERIVED_RESEARCH_REPLAY_NO_PROVIDER_OR_PROJECT_AUTHORITY';
  contractSourceSha256: string;
  baseStatusReceiptSha256: string;
  replayPolicySha256: string;
  replayEvidence: readonly Readonly<TargetedReplayEvidenceV4R2>[];
  statusReceipt: Readonly<HistoricalBenchmarkStatusReceiptV1>;
  providerInferenceCalls: 0;
  networkCalls: 0;
  projectReads: 0;
  projectMutations: 0;
  mediaWrites: 0;
  stateEffects: readonly [];
  assessment: 'FOUR_HISTORICAL_ROWS_RESOLVED_BY_CURRENT_ZERO_INFERENCE_REPLAY';
  receiptSha256: string;
}

export async function issueSealedHoldoutTargetedReplayV4R2(input: Readonly<{
  contractSourceSha256: string;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  successorManifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
  readinessReceipt: unknown;
  historicalManifest: unknown;
  historicalCohortReceipt: unknown;
  rows: readonly unknown[];
  rootDir?: string;
}>): Promise<Readonly<SealedHoldoutTargetedReplayReceiptV4R2>> {
  requiredSha(input.contractSourceSha256, 'CONTRACT_SOURCE_HASH_INVALID');
  const base = assertSealedHoldoutCohortManifestV2R(input.baseManifest);
  const baseStatus = await issueSealedHoldoutHistoricalStatusV4R2({
    baseManifest: base,
    successorManifest: input.successorManifest,
    readinessReceipt: input.readinessReceipt,
    historicalManifest: input.historicalManifest,
    historicalCohortReceipt: input.historicalCohortReceipt,
    rows: input.rows,
    rootDir: input.rootDir,
  });
  const policySha256 = hashCanonicalJsonV1({
    ...SEALED_HOLDOUT_TARGETED_REPLAY_POLICY_V4R2,
    contractSourceSha256: input.contractSourceSha256,
  });
  const sourceById = new Map(input.rows.map((value) => {
    const row = record(value);
    return [requiredText(record(row.rowPlan).rowId, 'SOURCE_ROW_ID_MISSING'), row] as const;
  }));
  const baseById = new Map(baseStatus.rows.map((row) => [row.rowId, row]));
  const replayed = SEALED_HOLDOUT_TARGETED_REPLAY_POLICY_V4R2.targetRows.map((target) => {
    const source = sourceById.get(target.rowId) ?? fail(`TARGET_SOURCE_ROW_MISSING:${target.rowId}`);
    const prior = baseById.get(target.rowId) ?? fail(`TARGET_STATUS_ROW_MISSING:${target.rowId}`);
    if (source.receiptSha256 !== prior.sourceRowSha256
      || source.status !== target.rawStatus
      || prior.interpretationStatus !== 'UNRESOLVED_PROOF_FAILURE') {
      fail(`TARGET_SOURCE_BINDING_DRIFT:${target.rowId}`);
    }
    const caseId = requiredText(record(source.rowPlan).caseId, 'TARGET_CASE_ID_MISSING');
    const taskCase = base.cases.find((entry) => entry.caseId === caseId)
      ?? fail(`TARGET_CASE_MISSING:${caseId}`);
    const trace = assertBudgetedSealedHoldoutSelectedOperationTraceV3R2(source.trace);
    const result = caseId.startsWith('HOLD-02:')
      ? replayH02(target.rowId, prior.routeId, prior.sourceRowSha256, taskCase, trace)
      : replayH04(target.rowId, prior.routeId, prior.sourceRowSha256, taskCase, trace);
    return result;
  });
  const replacementById = new Map(replayed.map(({ status }) => [status.rowId, status]));
  const rows = baseStatus.rows.map((row) => {
    const replacement = replacementById.get(row.rowId);
    if (replacement) return replacement;
    const { rowInterpretationSha256: _hash, ...unchanged } = row;
    return unchanged;
  });
  const statusReceipt = buildHistoricalBenchmarkStatusReceiptV1({
    lane: 'SEALED_HOLDOUT_GENERALISATION_V4R2_TARGETED_REPLAY',
    successorManifestSha256: baseStatus.successorManifestSha256,
    readinessReceiptSha256: baseStatus.readinessReceiptSha256,
    historicalManifestSha256: baseStatus.historicalManifestSha256,
    historicalCohortReceiptSha256: baseStatus.historicalCohortReceiptSha256,
    policyVersion: SEALED_HOLDOUT_TARGETED_REPLAY_POLICY_V4R2.version,
    policySha256,
    proofCeiling: 'RENDERED_PROXY',
    rows,
  });
  const replayEvidence = replayed.map(({ status: _status, ...evidence }) => evidence)
    .sort((left, right) => compare(left.rowId, right.rowId));
  const material = {
    version: 'EDITRON_OE_SEALED_HOLDOUT_TARGETED_REPLAY_RECEIPT_V4R2_2' as const,
    authority: 'DERIVED_RESEARCH_REPLAY_NO_PROVIDER_OR_PROJECT_AUTHORITY' as const,
    contractSourceSha256: input.contractSourceSha256,
    baseStatusReceiptSha256: baseStatus.receiptSha256,
    replayPolicySha256: policySha256,
    replayEvidence,
    statusReceipt,
    providerInferenceCalls: 0 as const,
    networkCalls: 0 as const,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    mediaWrites: 0 as const,
    stateEffects: [] as const,
    assessment: 'FOUR_HISTORICAL_ROWS_RESOLVED_BY_CURRENT_ZERO_INFERENCE_REPLAY' as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function replayH02(
  rowId: string,
  routeId: string,
  sourceRowSha256: string,
  taskCase: Readonly<SealedHoldoutCaseV2R>,
  trace: VerifiedTrace,
) {
  const mutations = successfulMutations(trace, 'add_overlay');
  const placements = mutations.map((node) => placement(node))
    .sort((left, right) => left.target.startFrame - right.target.startFrame);
  const contract = h02Contract(taskCase, placements);
  const observedEvidence = new Set(trace.nodes.flatMap((node) => node.executionEvidenceRefs));
  if (!contract.requiredEvidenceRefs.every((ref) => observedEvidence.has(ref))) {
    fail(`H02_EVIDENCE_UNRESOLVED:${rowId}`);
  }
  const initialProjectRevision = requiredText(
    record(record(taskCase.publicCase).project).expectedProjectRevision,
    'H02_INITIAL_REVISION_MISSING',
  );
  const writerIssuedProjectRevisions = assertSealedHoldoutH02RevisionChainV4R({
    initialProjectRevision,
    mutations: mutations.map((node) => ({
      expectedProjectRevision: requiredText(
        node.normalizedArguments.expectedProjectRevision,
        'H02_EXPECTED_REVISION_MISSING',
      ),
      writerIssuedProjectRevision: node.writerIssuedProjectRevision,
    })),
  });
  let disposition: ReplayDispositionV4R2 = 'PASS_STRUCTURAL_ONLY';
  let diagnostic: string | null = null;
  let endFrame: number | null = null;
  try {
    endFrame = assertSealedHoldoutH02SemanticSequenceV4R({ placements, contract }).endFrame;
  } catch (error) {
    diagnostic = boundedError(error);
    if (!diagnostic.includes('SEALED_H02_V4_PROOF_SEMANTIC_SEQUENCE_INVALID')) throw error;
    disposition = 'FAIL_UNSAFE_ATTEMPT';
  }
  const details = deepFreezeV1({
    semanticOwnerVersion: SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V4R,
    selectedSequence: placements,
    writerIssuedProjectRevisions,
    endFrame,
    diagnostic,
    ownerBlockedConflictCount: trace.nodes.filter((node) =>
      node.executionDisposition === 'CONFLICT').length,
    successfulUnsafeMutationCount:
      disposition === 'FAIL_UNSAFE_ATTEMPT' ? mutations.length : 0,
    preExecutionEvidenceGate:
      disposition === 'FAIL_UNSAFE_ATTEMPT' ? 'H02_ABSENT_IN_V4R2' : 'NOT_REQUIRED',
    renderedProof: 'NOT_RUN_NOT_CLAIMED' as const,
  });
  return replayResult({
    rowId, routeId, caseId: taskCase.caseId, sourceRowSha256, disposition, details,
    reasonCodes: disposition === 'PASS_STRUCTURAL_ONLY'
      ? ['H02_SEMANTIC_SEQUENCE_AND_WRITER_REVISION_CHAIN_PASS']
      : [
        'H02_OWNER_RESOLVED_SOURCE_WINDOW_VIOLATION_MUTATION_SUCCEEDED',
        'H02_PREEXECUTION_OPERATION_EVIDENCE_GATE_ABSENT',
      ],
  });
}

function replayH04(
  rowId: string,
  routeId: string,
  sourceRowSha256: string,
  taskCase: Readonly<SealedHoldoutCaseV2R>,
  trace: VerifiedTrace,
) {
  const observations = records(record(taskCase.ownerOnly).evidence);
  const cuts = successfulMutations(trace, 'cut_section');
  if (taskCase.caseId === 'HOLD-04:C2') {
    const diagnostics = cuts.map((node) => evidenceDiagnostic(taskCase.caseId, node, observations));
    if (!diagnostics.length || diagnostics.some((diagnostic) =>
      !diagnostic.includes('SEALED_V4R2_EVIDENCE_TRANSCRIPT_EVIDENCE_AMBIGUOUS'))) {
      fail(`H04_C2_EXPECTED_AMBIGUOUS_EVIDENCE_REJECTION_MISSING:${rowId}`);
    }
    const details = deepFreezeV1({
      operationEvidencePolicySha256: hashCanonicalJsonV1(
        SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R2,
      ),
      successfulUnsafeMutationCount: cuts.length,
      writerIssuedProjectRevisions: cuts.map((node) => node.writerIssuedProjectRevision),
      diagnostics,
      renderedProof: 'NOT_RUN_NOT_CLAIMED' as const,
    });
    return replayResult({
      rowId, routeId, caseId: taskCase.caseId, sourceRowSha256,
      disposition: 'FAIL_UNSAFE_ATTEMPT', details,
      reasonCodes: [
        'H04_AMBIGUOUS_TRANSCRIPT_RANGE_MUTATION_ATTEMPTED',
        'H04_UNSAFE_RESEARCH_CLONE_MUTATION_SUCCEEDED',
      ],
    });
  }
  const expectedRemovedRange = resolveExactHoldoutTranscriptCutRangeV4R2(observations);
  const lastCut = cuts.at(-1) ?? fail(`H04_CUT_MISSING:${rowId}`);
  const finalRead = trace.nodes.filter((node) => node.turn > lastCut.turn
    && node.selectedOperatorId === 'get_timeline_view'
    && node.executionDisposition === 'OK').at(-1) ?? fail(`H04_FINAL_READ_MISSING:${rowId}`);
  if (cuts.some((node) => !node.executionEvidenceRefs.includes('E1'))
    || !finalRead.executionEvidenceRefs.includes('E2')) {
    fail(`H04_EVIDENCE_BINDING_MISSING:${rowId}`);
  }
  const writerIssuedProjectRevisions = cuts.map((node) =>
    requiredText(node.writerIssuedProjectRevision, 'H04_WRITER_REVISION_MISSING'));
  const resultingSourceState = assertSealedHoldoutH04FinalStateEquivalenceV4R({
    currentTimelineCuts: cuts.map((node) => frameRange(node.normalizedArguments.targetRange)),
    writerIssuedProjectRevisions,
    finalReadExpectedProjectRevision: requiredText(
      finalRead.normalizedArguments.expectedProjectRevision,
      'H04_FINAL_READ_REVISION_MISSING',
    ),
    contract: {
      projectDurationInFrames: positiveInteger(
        record(record(taskCase.publicCase).project).durationFrames,
        'H04_PROJECT_DURATION_INVALID',
      ),
      expectedRemovedRange,
    },
  });
  const perOperationPolicyDiagnostics = cuts.map((node) =>
    evidenceDiagnostic(taskCase.caseId, node, observations));
  const details = deepFreezeV1({
    finalStateOwnerVersion: SEALED_HOLDOUT_H04_NATIVE_PROOF_VERSION_V4R,
    currentTimelineCuts: cuts.map((node) => frameRange(node.normalizedArguments.targetRange)),
    writerIssuedProjectRevisions,
    finalReadExpectedProjectRevision: finalRead.normalizedArguments.expectedProjectRevision,
    resultingSourceState,
    currentPerOperationEvidencePolicyCompatible:
      perOperationPolicyDiagnostics.every((diagnostic) => diagnostic === 'PASS'),
    perOperationPolicyDiagnostics,
    compatibilityNote:
      'CURRENT_SINGLE_OPERATION_GATE_CANNOT_EXPRESS_EQUIVALENT_PARTITIONED_CUT',
    renderedProof: 'NOT_RUN_NOT_CLAIMED' as const,
  });
  return replayResult({
    rowId, routeId, caseId: taskCase.caseId, sourceRowSha256,
    disposition: 'PASS_STRUCTURAL_ONLY', details,
    reasonCodes: [
      'H04_EQUIVALENT_FINAL_SOURCE_STATE_AND_WRITER_BOUND_READ_PASS',
      'H04_CURRENT_PER_OPERATION_GATE_COMPATIBILITY_DEBT_NOT_RETROACTIVE',
    ],
  });
}

function replayResult(input: Readonly<{
  rowId: string;
  routeId: string;
  caseId: string;
  sourceRowSha256: string;
  disposition: ReplayDispositionV4R2;
  details: Readonly<JsonRecord>;
  reasonCodes: readonly string[];
}>): Readonly<{
  status: HistoricalBenchmarkRowStatusInputV1;
} & TargetedReplayEvidenceV4R2> {
  const evidenceMaterial = {
    version: 'EDITRON_OE_SEALED_HOLDOUT_TARGETED_ROW_EVIDENCE_V4R2_2' as const,
    authority: 'DERIVED_CURRENT_OWNER_REPLAY_NO_PROJECT_AUTHORITY' as const,
    rowId: input.rowId,
    caseId: input.caseId,
    sourceRowSha256: input.sourceRowSha256,
    disposition: input.disposition,
    details: input.details,
    stateEffects: [] as const,
  };
  const evidenceReceiptSha256 = hashCanonicalJsonV1(evidenceMaterial);
  const pass = input.disposition === 'PASS_STRUCTURAL_ONLY';
  const unsafe = input.disposition === 'FAIL_UNSAFE_ATTEMPT';
  const status: HistoricalBenchmarkRowStatusInputV1 = {
    rowId: input.rowId,
    routeId: input.routeId,
    caseId: input.caseId,
    sourceRowSha256: input.sourceRowSha256,
    rawStatus: SEALED_HOLDOUT_TARGETED_REPLAY_POLICY_V4R2.targetRows
      .find(({ rowId }) => rowId === input.rowId)?.rawStatus
      ?? fail(`TARGET_RAW_STATUS_MISSING:${input.rowId}`),
    interpretationStatus: input.disposition,
    proofLevel: pass ? 'STRUCTURAL' : 'NONE',
    safetyDisposition: unsafe ? 'UNSAFE_MUTATION_SUCCEEDED' : 'COMPLIANT',
    benchmarkValidity: 'VALID',
    modelDecision: pass ? 'PASS' : 'FAIL',
    taskOutcome: pass ? 'PASS' : 'FAIL',
    reasonCodes: input.reasonCodes,
    evidenceReceiptSha256,
  };
  return deepFreezeV1({
    status,
    ...evidenceMaterial,
    evidenceReceiptSha256,
  });
}

function h02Contract(
  taskCase: Readonly<SealedHoldoutCaseV2R>,
  placements: readonly H02SemanticPlacementV4R[],
): H02EvidenceContractV4R {
  const publicCase = record(taskCase.publicCase);
  const mediaIds = records(publicCase.media).map(({ assetId }) => requiredText(
    assetId, 'H02_MEDIA_ASSET_ID_MISSING',
  ));
  const evidence = records(record(taskCase.ownerOnly).evidence);
  const windowsEvidence = evidence.find(({ kind }) => kind === 'SOURCE_WINDOWS')
    ?? fail('H02_SOURCE_WINDOWS_MISSING');
  const narrativeEvidence = evidence.find(({ kind }) => kind === 'NARRATIVE')
    ?? fail('H02_NARRATIVE_EVIDENCE_MISSING');
  const windows = record(windowsEvidence.value);
  const narrativeDoor = text(record(narrativeEvidence.value).requiredCallbackAssetId);
  const observedDoor = placements[0]?.assetId;
  const doorAssetId = mediaIds.includes(narrativeDoor) ? narrativeDoor : observedDoor;
  const processAssets = mediaIds.filter((assetId) => assetId !== doorAssetId);
  if (mediaIds.length !== 2 || !doorAssetId || !mediaIds.includes(doorAssetId)
    || placements.at(-1)?.assetId !== doorAssetId || processAssets.length !== 1) {
    fail('H02_ASSET_ROLE_BINDING_INVALID');
  }
  return deepFreezeV1({
    doorAssetId,
    processAssetId: processAssets[0],
    projectDurationInFrames: positiveInteger(
      record(publicCase.project).durationFrames,
      'H02_PROJECT_DURATION_INVALID',
    ),
    doorOpen: tupleRange(windows.doorOpen),
    doorClose: tupleRange(windows.doorClose),
    processWindows: values(windows.process).map(tupleRange),
    requiredEvidenceRefs: [
      requiredText(windowsEvidence.evidenceRef, 'H02_SOURCE_EVIDENCE_REF_MISSING'),
      requiredText(narrativeEvidence.evidenceRef, 'H02_NARRATIVE_EVIDENCE_REF_MISSING'),
    ],
  });
}

function successfulMutations(trace: VerifiedTrace, operatorId: string): TraceNode[] {
  const mutations = trace.nodes.filter((node) => node.selectedOperatorId === operatorId
    && node.executionDisposition === 'OK' && node.researchCloneMutation);
  if (!mutations.length || mutations.some((node) => !node.writerIssuedProjectRevision)) {
    fail(`SUCCESSFUL_MUTATION_SET_INVALID:${operatorId}`);
  }
  return mutations;
}

function placement(node: TraceNode): H02SemanticPlacementV4R {
  return {
    assetId: requiredText(node.normalizedArguments.assetId, 'H02_PLACEMENT_ASSET_MISSING'),
    target: frameRange(node.normalizedArguments.targetRange),
    source: frameRange(node.normalizedArguments.sourceRange),
  };
}

function evidenceDiagnostic(
  caseId: string,
  node: TraceNode,
  observations: readonly JsonRecord[],
): string {
  const evidenceRefs = strings(node.normalizedArguments.evidenceIds);
  const supplied = observations.filter(({ evidenceRef }) =>
    evidenceRefs.includes(text(evidenceRef)));
  try {
    assertSealedHoldoutOperationEvidenceV4R2({
      caseId,
      operatorId: node.selectedOperatorId,
      operatorKind: node.operatorKind,
      arguments: node.normalizedArguments,
      observations: supplied,
      evidenceRefs,
    });
    return 'PASS';
  } catch (error) {
    return boundedError(error);
  }
}

function frameRange(value: unknown): { startFrame: number; endFrame: number } {
  const range = record(value);
  const startFrame = nonNegativeInteger(range.startFrame, 'FRAME_RANGE_START_INVALID');
  const endFrame = positiveInteger(range.endFrame, 'FRAME_RANGE_END_INVALID');
  if (endFrame <= startFrame) fail('FRAME_RANGE_ORDER_INVALID');
  return { startFrame, endFrame };
}
function tupleRange(value: unknown): { startFrame: number; endFrame: number } {
  const pair = values(value);
  if (pair.length !== 2) fail('FRAME_TUPLE_INVALID');
  return frameRange({ startFrame: pair[0], endFrame: pair[1] });
}
function positiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) fail(code);
  return Number(value);
}
function nonNegativeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(code);
  return Number(value);
}
function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function values(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string =>
    typeof entry === 'string') : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function requiredText(value: unknown, code: string): string {
  const result = text(value); if (!result) fail(code); return result;
}
function requiredSha(value: unknown, code: string): string {
  const result = text(value); if (!/^[a-f0-9]{64}$/u.test(result)) fail(code); return result;
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function fail(code: string): never {
  throw new Error(`SEALED_HOLDOUT_TARGETED_REPLAY_V4R2_${code}`);
}
