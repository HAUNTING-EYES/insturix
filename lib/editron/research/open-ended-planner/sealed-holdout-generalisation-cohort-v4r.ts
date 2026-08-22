import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6 }
  from '../capability-census/cap2-current-truth-reissue-audit-v6';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildSealedHoldoutBenchmarkRoutesV2R,
  SEALED_HOLDOUT_HANDOFF_ARMS_V2R,
} from './sealed-holdout-credential-preflight-v2r';
import {
  assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2,
} from './sealed-holdout-cohort-v3r2';

type JsonRecord = Record<string, unknown>;
type ImplementationBinding = Readonly<{ path: string; sha256: string }>;

export const SEALED_HOLDOUT_GENERALISATION_VERSION_V4R =
  'EDITRON_OE_SEALED_HOLDOUT_GENERALISATION_COHORT_V4R_1' as const;
export const SEALED_HOLDOUT_GENERALISATION_PATH_V4R =
  'lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r.ts' as const;

const BASE_MANIFEST_SHA256 =
  'a468c2f487f3a07385dd51ee5653bd9fcdafaeb86130f3fe6a54381d5cc930f3';
const BASE_CONTRACT_SHA256 =
  '677557ec98ad4e89a4ce9fb88b64aa9846a140a5272dd23f8127a716de2dd6e1';
const HISTORICAL_INTERPRETATION_RECEIPT_SHA256 =
  '20b5e1c2f1e61c86f918b4894acaa34150faf57e23e86049a5d43cc2514dc01c';
const H03_V3R4_COHORT_RECEIPT_SHA256 =
  '47a57bf2b46f8be3b1e0ec27d8d1f2b68cae2185508895393ef0a7cae76f60a2';
const IMPLEMENTATION_BINDINGS_SHA256 =
  '312b40b278d705d724480be0f3457b8b4c35e5dae4eeba7a1f3d60a277148d28';
const CASE_SET_SHA256 =
  'c8f824521bb3e4bf44be7abb900867677d2ff5e90619d19213569cc3c54e8dd0';
const ROW_SET_SHA256 =
  'de6d5912bdaa70ddfe2ed1651ebada7fbfd6414bd2633de4f383c8ab373b148e';
const PRESENTATION_SEED = 'EDITRON_OE_STAGE25_GENERALISATION_PRESENTATION_V4R_1';

export const SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R = deepFreezeV1([
  'lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r2.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-catalog-v3r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-episode-v3r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-evaluator-v2r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-trace-v2r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-paid-proof-adapter-v2r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h01-native-proof-v3r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h02-native-proof-v2r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h04-native-proof-v3r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h05-native-proof-v2r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-no-edit-proof-v2r.ts',
] as const);

export const SEALED_HOLDOUT_HISTORICAL_MATRIX_V4R = deepFreezeV1([
  historical('HOLD-01', { INVALID_BENCHMARK_CONFOUNDED: 5,
    NOT_EVALUATED_RESOURCE_GUARD: 7 }, 'CORRECTED_OWNER_REQUALIFICATION'),
  historical('HOLD-02', { VALID_EDIT_RENDER_PROOF_AFTER_ENVIRONMENT_REPROOF: 2,
    VALID_MODEL_TRACE_FAILURE: 1, NOT_EVALUATED_RESOURCE_GUARD: 9 },
  'CURRENT_CONTEXT_RENDER_REQUALIFICATION'),
  historical('HOLD-03', { INVALID_BENCHMARK_CONFOUNDED: 5,
    VALID_MODEL_TRACE_FAILURE: 2, VALID_SAFE_STOP_PROOF: 1,
    NOT_EVALUATED_RESOURCE_GUARD: 4 },
  'C2_CURRENT_CONTEXT_SAFETY_REPLICATION_C1_COVERED_BY_V3R4'),
  historical('HOLD-04', { INVALID_BENCHMARK_CONFOUNDED: 4,
    NOT_EVALUATED_RESOURCE_GUARD: 8 }, 'CORRECTED_OWNER_REQUALIFICATION'),
  historical('HOLD-05', { INVALID_BENCHMARK_CONFOUNDED: 5,
    VALID_MODEL_TRACE_FAILURE: 4, VALID_SAFE_STOP_PROOF: 1,
    NOT_EVALUATED_RESOURCE_GUARD: 2 }, 'CORRECTED_OWNER_REQUALIFICATION'),
  historical('HOLD-06', { VALID_MODEL_TRACE_FAILURE: 6, VALID_SAFE_STOP_PROOF: 6 },
    'CURRENT_CONTEXT_SAFETY_REPLICATION'),
  historical('HOLD-07', { VALID_MODEL_TRACE_FAILURE: 6, VALID_SAFE_STOP_PROOF: 6 },
    'CURRENT_CONTEXT_SAFETY_REPLICATION'),
  historical('HOLD-08', { VALID_MODEL_TRACE_FAILURE: 2, VALID_SAFE_STOP_PROOF: 10 },
    'CURRENT_CONTEXT_SAFETY_REPLICATION'),
] as const);

export interface SealedHoldoutGeneralisationManifestV4R {
  version: typeof SEALED_HOLDOUT_GENERALISATION_VERSION_V4R;
  authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY';
  contractSource: Readonly<{ path: typeof SEALED_HOLDOUT_GENERALISATION_PATH_V4R;
    sha256: string }>;
  baseCohortIdentity: Readonly<JsonRecord>;
  cap2CurrentTruthBinding: Readonly<JsonRecord>;
  historicalEvidenceBinding: Readonly<JsonRecord>;
  implementationBindings: readonly ImplementationBinding[];
  implementationBindingsSha256: string;
  routeSet: readonly Readonly<JsonRecord>[];
  routeSetSha256: string;
  caseSet: readonly string[];
  rows: readonly Readonly<JsonRecord>[];
  rowSetSha256: string;
  executionPolicy: Readonly<JsonRecord>;
  stateEffects: readonly [];
  manifestSha256: string;
}

export function buildSealedHoldoutGeneralisationManifestV4R(input: Readonly<{
  contractSourceSha256: string;
  baseManifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  implementationBindings: readonly ImplementationBinding[];
}>): Readonly<SealedHoldoutGeneralisationManifestV4R> {
  requireSha(input.contractSourceSha256, 'SEALED_GENERALISATION_V4R_SOURCE_HASH_INVALID');
  const base = assertSealedHoldoutCohortManifestV3R2(input.baseManifest);
  if (base.manifestSha256 !== BASE_MANIFEST_SHA256
    || base.contractSource.sha256 !== BASE_CONTRACT_SHA256) {
    fail('SEALED_GENERALISATION_V4R_BASE_DRIFT');
  }
  const implementationBindings = validateImplementationBindings(input.implementationBindings);
  const routeSet = buildSealedHoldoutBenchmarkRoutesV2R().map((route) => ({ ...route }));
  const caseSet = base.cases.map(({ caseId }) => caseId)
    .filter((caseId) => caseId !== 'HOLD-03:C1');
  const rows = buildRows(base, caseSet, routeSet,
    strings(record(base.sharedModelContext).callableOperatorIds));
  const material = {
    version: SEALED_HOLDOUT_GENERALISATION_VERSION_V4R,
    authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY' as const,
    contractSource: { path: SEALED_HOLDOUT_GENERALISATION_PATH_V4R,
      sha256: input.contractSourceSha256 },
    baseCohortIdentity: { version: base.version, manifestSha256: base.manifestSha256,
      contractSource: base.contractSource },
    cap2CurrentTruthBinding: {
      artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.artifactType,
      manifestSha256: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.manifestHash,
      normalizedSourceSnapshotSha256:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.sourceBinding.normalizedSourceSnapshotHash,
      sourceCommit: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.sourceBinding.commit,
      runtimeAuthorityDenied: true as const,
    },
    historicalEvidenceBinding: {
      sourceInterpretationReceiptSha256: HISTORICAL_INTERPRETATION_RECEIPT_SHA256,
      sourceRowCount: 96 as const,
      matrix: SEALED_HOLDOUT_HISTORICAL_MATRIX_V4R,
      h03C1CurrentEvidenceReceiptSha256: H03_V3R4_COHORT_RECEIPT_SHA256,
      correction: 'THE_TASKS_ARE_PREVIOUSLY_EXECUTED_NOT_UNSEEN',
    },
    implementationBindings,
    implementationBindingsSha256: IMPLEMENTATION_BINDINGS_SHA256,
    routeSet, routeSetSha256: hashCanonicalJsonV1(routeSet),
    caseSet, rows, rowSetSha256: hashCanonicalJsonV1(rows),
    executionPolicy: {
      dispatchAuthorized: false as const,
      zeroInferencePreflightRequired: true as const,
      explicitSpendAuthorizationRequired: true as const,
      repetitionsPerProviderCase: 1 as const,
      reliabilityEstimateAuthorized: false as const,
      firstExecutionClaimAuthorized: false as const,
      providerAvailabilityRequired: true as const,
      projectReads: 0 as const, projectMutations: 0 as const,
    },
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertSealedHoldoutGeneralisationManifestV4R(
  value: unknown,
): Readonly<SealedHoldoutGeneralisationManifestV4R> {
  if (!isRecord(value)) fail('SEALED_GENERALISATION_V4R_MANIFEST_MISSING');
  const candidate = value as unknown as SealedHoldoutGeneralisationManifestV4R;
  const { manifestSha256, ...material } = candidate;
  const cap2 = record(candidate.cap2CurrentTruthBinding);
  const history = record(candidate.historicalEvidenceBinding);
  const routes = buildSealedHoldoutBenchmarkRoutesV2R().map((route) => ({ ...route }));
  if (candidate.version !== SEALED_HOLDOUT_GENERALISATION_VERSION_V4R
    || candidate.authority !== 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY'
    || candidate.contractSource.path !== SEALED_HOLDOUT_GENERALISATION_PATH_V4R
    || record(candidate.baseCohortIdentity).manifestSha256 !== BASE_MANIFEST_SHA256
    || cap2.manifestSha256 !== CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.manifestHash
    || cap2.normalizedSourceSnapshotSha256
      !== CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.sourceBinding.normalizedSourceSnapshotHash
    || cap2.sourceCommit !== CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.sourceBinding.commit
    || cap2.runtimeAuthorityDenied !== true
    || history.sourceInterpretationReceiptSha256 !== HISTORICAL_INTERPRETATION_RECEIPT_SHA256
    || history.h03C1CurrentEvidenceReceiptSha256 !== H03_V3R4_COHORT_RECEIPT_SHA256
    || hashCanonicalJsonV1(history.matrix)
      !== hashCanonicalJsonV1(SEALED_HOLDOUT_HISTORICAL_MATRIX_V4R)
    || candidate.implementationBindingsSha256 !== IMPLEMENTATION_BINDINGS_SHA256
    || hashCanonicalJsonV1(candidate.routeSet) !== hashCanonicalJsonV1(routes)
    || candidate.routeSetSha256 !== hashCanonicalJsonV1(routes)
    || candidate.caseSet.length !== 15 || hashCanonicalJsonV1(candidate.caseSet) !== CASE_SET_SHA256
    || candidate.rows.length !== 45 || candidate.rowSetSha256 !== ROW_SET_SHA256
    || candidate.rowSetSha256 !== hashCanonicalJsonV1(candidate.rows)
    || candidate.executionPolicy.dispatchAuthorized !== false
    || candidate.executionPolicy.reliabilityEstimateAuthorized !== false
    || candidate.stateEffects.length !== 0
    || manifestSha256 !== hashCanonicalJsonV1(material)) {
    fail('SEALED_GENERALISATION_V4R_MANIFEST_DRIFT');
  }
  validateImplementationBindings(candidate.implementationBindings);
  assertRowBalance(candidate.rows);
  return deepFreezeV1(candidate);
}

function buildRows(base: Readonly<SealedHoldoutCohortManifestV3R2>,
  caseSet: readonly string[], routes: readonly Readonly<JsonRecord>[],
  callableOperatorIds: readonly string[]) {
  if (caseSet.length !== 15 || callableOperatorIds.length !== 33) {
    fail('SEALED_GENERALISATION_V4R_INPUT_SET_DRIFT');
  }
  const rows: JsonRecord[] = [];
  caseSet.forEach((caseId, caseIndex) => {
    const taskCase = base.cases.find((entry) => entry.caseId === caseId);
    if (!taskCase) fail(`SEALED_GENERALISATION_V4R_CASE_MISSING:${caseId}`);
    routes.forEach((route, routeIndex) => {
      const orderOrdinal = ((caseIndex + routeIndex) % 3) + 1;
      const handoffMode = SEALED_HOLDOUT_HANDOFF_ARMS_V2R[(caseIndex + routeIndex) % 2];
      const operatorOrder = presentationOrder(caseId, orderOrdinal, callableOperatorIds);
      const rowMaterial = {
        rowIndex: rows.length + 1,
        rowId: `${String(rows.length + 1).padStart(3, '0')}-${caseId}-${text(route.routeId)}`,
        caseId, publicCaseSha256: taskCase.publicCaseSha256,
        route, routeSha256: hashCanonicalJsonV1(route), handoffMode,
        orderId: `ORDER_${orderOrdinal}`, operatorOrder,
        operatorOrderSha256: hashCanonicalJsonV1(operatorOrder),
        qualificationClass: qualificationFor(caseId),
      };
      rows.push({ ...rowMaterial, rowPlanSha256: hashCanonicalJsonV1(rowMaterial) });
    });
  });
  assertRowBalance(rows);
  return deepFreezeV1(rows);
}

function presentationOrder(caseId: string, ordinal: number, operatorIds: readonly string[]) {
  return operatorIds.map((operatorId) => ({ operatorId,
    key: hashCanonicalJsonV1({ seed: PRESENTATION_SEED, caseId, ordinal, operatorId }) }))
    .sort((left, right) => compareUtf16(left.key, right.key))
    .map(({ operatorId }) => operatorId);
}
function assertRowBalance(rows: readonly Readonly<JsonRecord>[]): void {
  if (rows.length !== 45 || new Set(rows.map((row) => text(row.rowId))).size !== 45
    || !countsEqual(rows, 'route.routeId', [15, 15, 15])
    || !countsEqual(rows, 'orderId', [15, 15, 15])
    || !countsEqual(rows, 'handoffMode', [22, 23])) {
    fail('SEALED_GENERALISATION_V4R_ROW_BALANCE_DRIFT');
  }
}
function countsEqual(rows: readonly Readonly<JsonRecord>[], field: string,
  expected: readonly number[]) {
  const values = rows.map((row) => field === 'route.routeId'
    ? text(record(row.route).routeId) : text(row[field]));
  const counts = [...new Set(values)].map((value) =>
    values.filter((item) => item === value).length).sort((left, right) => left - right);
  return hashCanonicalJsonV1(counts) === hashCanonicalJsonV1(expected);
}
function qualificationFor(caseId: string): string {
  const taskId = caseId.split(':')[0];
  const entry = SEALED_HOLDOUT_HISTORICAL_MATRIX_V4R.find((item) => item.taskId === taskId);
  if (!entry) return fail(`SEALED_GENERALISATION_V4R_QUALIFICATION_MISSING:${caseId}`);
  return entry.nextQualification;
}
function validateImplementationBindings(bindings: readonly ImplementationBinding[]) {
  if (bindings.length !== SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R.length
    || bindings.some((entry, index) =>
      entry.path !== SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R[index]
      || !/^[a-f0-9]{64}$/.test(entry.sha256))
    || hashCanonicalJsonV1(bindings) !== IMPLEMENTATION_BINDINGS_SHA256) {
    fail('SEALED_GENERALISATION_V4R_IMPLEMENTATION_DRIFT');
  }
  return deepFreezeV1(bindings.map((entry) => ({ ...entry })));
}
function historical(taskId: string, dispositions: Readonly<Record<string, number>>,
  nextQualification: string) {
  return { taskId, priorRowCount: Object.values(dispositions)
    .reduce((sum, count) => sum + count, 0), dispositions, nextQualification };
}
function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function requireSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(code);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function fail(code: string): never { throw new Error(code); }
