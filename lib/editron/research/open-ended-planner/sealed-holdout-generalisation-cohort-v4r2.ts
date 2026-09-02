import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7 }
  from '../capability-census/cap2-current-truth-reissue-audit-v7';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildSealedHoldoutBenchmarkRoutesV2R,
  SEALED_HOLDOUT_HANDOFF_ARMS_V2R,
} from './sealed-holdout-credential-preflight-v2r';
import {
  SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2,
  sealedHoldoutOperatorCatalogIdentityV4R2,
} from './sealed-holdout-catalog-v4r2';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_GENERALISATION_VERSION_V4R2 =
  'EDITRON_OE_SEALED_HOLDOUT_GENERALISATION_COHORT_V4R2_1' as const;
export const SEALED_HOLDOUT_GENERALISATION_PATH_V4R2 =
  'lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r2.ts' as const;

const PRESENTATION_SEED = 'EDITRON_OE_STAGE25_GENERALISATION_PRESENTATION_V4R2_1';
const HISTORICAL_V4_MANIFEST_SHA256 =
  'df6d9024fcbdf56f0ee171348806c936b8bc1b7da0f53d6b019f2e665c99c38d';
const HISTORICAL_V4_RECEIPT_SHA256 =
  'fe4a3420356675d040c62c4f77f6fa6e98321c99c29eb9e767736f248b186787';

export interface SealedHoldoutGeneralisationManifestV4R2 {
  version: typeof SEALED_HOLDOUT_GENERALISATION_VERSION_V4R2;
  authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY';
  contractSource: Readonly<{
    path: typeof SEALED_HOLDOUT_GENERALISATION_PATH_V4R2;
    sha256: string;
  }>;
  frozenTaskPacketBinding: Readonly<JsonRecord>;
  currentTruthBinding: Readonly<JsonRecord>;
  operatorCatalogIdentity: Readonly<JsonRecord>;
  historicalEvidenceBinding: Readonly<JsonRecord>;
  routeSet: readonly Readonly<JsonRecord>[];
  routeSetSha256: string;
  caseSet: readonly Readonly<JsonRecord>[];
  caseSetSha256: string;
  pilotRows: readonly Readonly<JsonRecord>[];
  scoredRows: readonly Readonly<JsonRecord>[];
  pilotRowSetSha256: string;
  scoredRowSetSha256: string;
  executionPolicy: Readonly<JsonRecord>;
  stateEffects: readonly [];
  manifestSha256: string;
}

export function buildSealedHoldoutGeneralisationManifestV4R2(input: Readonly<{
  contractSourceSha256: string;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
}>): Readonly<SealedHoldoutGeneralisationManifestV4R2> {
  requireSha(input.contractSourceSha256, 'SOURCE_HASH_INVALID');
  const base = assertSealedHoldoutCohortManifestV2R(input.baseManifest);
  const routes = buildSealedHoldoutBenchmarkRoutesV2R()
    .map((route) => deepFreezeV1({ ...route }));
  const callableOperatorIds = records(SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2.operators)
    .filter((operator) => text(operator.compilerEligibility) !== 'NOT_COMPILABLE')
    .map((operator) => text(operator.operatorId));
  if (routes.length !== 3 || callableOperatorIds.length !== 33) {
    fail('ROUTE_OR_OPERATOR_SET_DRIFT');
  }
  const cases = base.cases
    .filter(({ caseId }) => caseId !== 'HOLD-03:C1')
    .map(({ caseId, publicCaseSha256 }) => ({ caseId, publicCaseSha256 }));
  if (cases.length !== 15) fail('CASE_SET_DRIFT');
  const scoredRows = buildScoredRows(cases, routes, callableOperatorIds);
  const pilotRows = buildPilotRows(cases, routes, callableOperatorIds);
  assertRows(pilotRows, scoredRows, routes);
  const material = {
    version: SEALED_HOLDOUT_GENERALISATION_VERSION_V4R2,
    authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY' as const,
    contractSource: {
      path: SEALED_HOLDOUT_GENERALISATION_PATH_V4R2,
      sha256: input.contractSourceSha256,
    },
    frozenTaskPacketBinding: {
      version: base.version,
      manifestSha256: base.manifestSha256,
      contractSource: base.contractSource,
      cap2BindingAtPacketIssuance: base.cap2CurrentTruthBinding,
      role: 'IMMUTABLE_TASK_PACKET_INPUT_NOT_CURRENT_CAP_ASSERTION',
    },
    currentTruthBinding: {
      artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.artifactType,
      manifestSha256: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.manifestHash,
      normalizedSourceSnapshotSha256:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.sourceBinding.normalizedSourceSnapshotHash,
      sourceCommit: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.sourceBinding.commit,
      runtimeAuthorityDenied: true as const,
    },
    operatorCatalogIdentity: sealedHoldoutOperatorCatalogIdentityV4R2(),
    historicalEvidenceBinding: {
      manifestSha256: HISTORICAL_V4_MANIFEST_SHA256,
      paidCohortReceiptSha256: HISTORICAL_V4_RECEIPT_SHA256,
      role: 'IMMUTABLE_RAW_INPUT_FOR_ZERO_INFERENCE_RESCORE_ONLY',
      historicalClaimsNotInherited: true as const,
    },
    routeSet: routes,
    routeSetSha256: hashCanonicalJsonV1(routes),
    caseSet: cases,
    caseSetSha256: hashCanonicalJsonV1(cases),
    pilotRows,
    scoredRows,
    pilotRowSetSha256: hashCanonicalJsonV1(pilotRows),
    scoredRowSetSha256: hashCanonicalJsonV1(scoredRows),
    executionPolicy: {
      dispatchAuthorized: false as const,
      zeroInferenceReadinessRequired: true as const,
      oneNonScoredPilotPerRouteRequired: true as const,
      pilotAuditRequiredBeforeScoredCohort: true as const,
      reliabilityEstimateAuthorized: false as const,
      projectReads: 0 as const,
      projectMutations: 0 as const,
    },
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertSealedHoldoutGeneralisationManifestV4R2(input: Readonly<{
  value: unknown;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
}>): Readonly<SealedHoldoutGeneralisationManifestV4R2> {
  if (!isRecord(input.value) || !isRecord(input.value.contractSource)) {
    fail('MANIFEST_MISSING');
  }
  const rebuilt = buildSealedHoldoutGeneralisationManifestV4R2({
    contractSourceSha256: text(input.value.contractSource.sha256),
    baseManifest: input.baseManifest,
  });
  if (hashCanonicalJsonV1(input.value) !== hashCanonicalJsonV1(rebuilt)) {
    fail('MANIFEST_DRIFT');
  }
  return rebuilt;
}

function buildScoredRows(
  cases: readonly Readonly<JsonRecord>[],
  routes: readonly Readonly<JsonRecord>[],
  operatorIds: readonly string[],
): readonly Readonly<JsonRecord>[] {
  const rows: JsonRecord[] = [];
  cases.forEach((taskCase, caseIndex) => routes.forEach((route, routeIndex) => {
    rows.push(row('SCORED', rows.length + 1, taskCase, route,
      ((caseIndex + routeIndex) % 3) + 1,
      SEALED_HOLDOUT_HANDOFF_ARMS_V2R[(caseIndex + routeIndex) % 2], operatorIds));
  }));
  return deepFreezeV1(rows);
}

function buildPilotRows(
  cases: readonly Readonly<JsonRecord>[],
  routes: readonly Readonly<JsonRecord>[],
  operatorIds: readonly string[],
): readonly Readonly<JsonRecord>[] {
  const control = cases.find(({ caseId }) => caseId === 'HOLD-08:C2')
    ?? fail('PILOT_CONTROL_MISSING');
  return deepFreezeV1(routes.map((route, index) => row(
    'PILOT', index + 1, control, route, index + 1,
    SEALED_HOLDOUT_HANDOFF_ARMS_V2R[index % 2], operatorIds,
  )));
}

function row(
  stage: 'PILOT' | 'SCORED',
  index: number,
  taskCase: Readonly<JsonRecord>,
  route: Readonly<JsonRecord>,
  orderOrdinal: number,
  handoffMode: string,
  operatorIds: readonly string[],
): Readonly<JsonRecord> {
  const caseId = text(taskCase.caseId);
  const routeId = text(route.routeId);
  const operatorOrder = presentationOrder(caseId, orderOrdinal, operatorIds);
  const material = {
    rowId: `${stage}-${String(index).padStart(3, '0')}-${caseId}-${routeId}`,
    stage,
    caseId,
    publicCaseSha256: text(taskCase.publicCaseSha256),
    route,
    routeSha256: hashCanonicalJsonV1(route),
    handoffMode,
    orderId: `ORDER_${orderOrdinal}`,
    operatorOrder,
    operatorOrderSha256: hashCanonicalJsonV1(operatorOrder),
  };
  return { ...material, rowPlanSha256: hashCanonicalJsonV1(material) };
}

function presentationOrder(caseId: string, ordinal: number, operatorIds: readonly string[]) {
  return operatorIds.map((operatorId) => ({
    operatorId,
    key: hashCanonicalJsonV1({ seed: PRESENTATION_SEED, caseId, ordinal, operatorId }),
  })).sort((left, right) => compare(left.key, right.key)).map(({ operatorId }) => operatorId);
}

function assertRows(
  pilots: readonly Readonly<JsonRecord>[],
  scored: readonly Readonly<JsonRecord>[],
  routes: readonly Readonly<JsonRecord>[],
): void {
  const all = [...pilots, ...scored];
  if (pilots.length !== 3 || scored.length !== 45
    || new Set(all.map(({ rowId }) => text(rowId))).size !== 48
    || routes.some(({ routeId }) =>
      pilots.filter((row) => text(record(row.route).routeId) === routeId).length !== 1
      || scored.filter((row) => text(record(row.route).routeId) === routeId).length !== 15)) {
    fail('ROW_BALANCE_DRIFT');
  }
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function requireSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) fail(code);
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(code: string): never { throw new Error(`SEALED_GENERALISATION_V4R2_${code}`); }
