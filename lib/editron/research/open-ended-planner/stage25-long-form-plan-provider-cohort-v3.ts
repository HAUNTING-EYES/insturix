import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7 }
  from '../capability-census/cap2-current-truth-reissue-audit-v7';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { buildSealedHoldoutBenchmarkRoutesV2R }
  from './sealed-holdout-credential-preflight-v2r';
import { STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V2 }
  from './stage25-long-form-plan-compiler-v2';
import {
  buildStage25LongFormPlanHoldoutContextV2,
  STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V2,
  STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2,
} from './stage25-long-form-plan-holdout-v2';
import { STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V2 }
  from './stage25-long-form-plan-provider-evaluator-v2';
import {
  buildStage25LongFormProviderToolSetV2,
  STAGE25_LONG_FORM_PROVIDER_DURABLE_HANDOFF_MODE_V2,
  STAGE25_LONG_FORM_PROVIDER_PRESENTATION_COUNT_V2,
  STAGE25_LONG_FORM_PROVIDER_PROTOCOL_VERSION_V2,
} from './stage25-long-form-plan-provider-protocol-v2';

type JsonRecord = Record<string, unknown>;

export const STAGE25_LONG_FORM_PROVIDER_COHORT_VERSION_V3 =
  'EDITRON_STAGE25_LONG_FORM_PROVIDER_COHORT_V3_1' as const;
export const STAGE25_LONG_FORM_PROVIDER_COHORT_PATH_V3 =
  'lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-cohort-v3.ts' as const;

const HISTORICAL_V2_MANIFEST_SHA256 =
  '975010c997d5755efb9333241f89a4a6a5cc50e928f8d2ac6c623a724f09b357';
const HISTORICAL_V2_RECEIPT_SHA256 =
  'ad64ab8d261dc90ca39d5a94679de036f4067b967eedc595d73e1c3fa1b342c3';

export interface Stage25LongFormProviderCohortManifestV3 {
  version: typeof STAGE25_LONG_FORM_PROVIDER_COHORT_VERSION_V3;
  authority: 'RESEARCH_PLANNING_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION';
  contractSource: Readonly<{
    path: typeof STAGE25_LONG_FORM_PROVIDER_COHORT_PATH_V3;
    sha256: string;
  }>;
  currentTruthBinding: Readonly<JsonRecord>;
  planningContractBinding: Readonly<JsonRecord>;
  historicalEvidenceBinding: Readonly<JsonRecord>;
  routeSet: readonly Readonly<JsonRecord>[];
  pilotRows: readonly Readonly<JsonRecord>[];
  scoredRows: readonly Readonly<JsonRecord>[];
  pilotRowSetSha256: string;
  scoredRowSetSha256: string;
  executionPolicy: Readonly<JsonRecord>;
  stateEffects: readonly [];
  manifestSha256: string;
}

export function buildStage25LongFormProviderCohortManifestV3(input: Readonly<{
  contractSourceSha256: string;
}>): Readonly<Stage25LongFormProviderCohortManifestV3> {
  requireSha(input.contractSourceSha256, 'SOURCE_HASH_INVALID');
  const routes = buildSealedHoldoutBenchmarkRoutesV2R()
    .map((route) => deepFreezeV1({ ...route }));
  const context = buildStage25LongFormPlanHoldoutContextV2();
  const toolSet = buildStage25LongFormProviderToolSetV2();
  if (routes.length !== 3 || STAGE25_LONG_FORM_PROVIDER_PRESENTATION_COUNT_V2 !== 3) {
    fail('ROUTE_OR_PRESENTATION_SET_DRIFT');
  }
  const pilotRows = routes.map((route) => row('PILOT', route, 1));
  const scoredRows = routes.flatMap((route) => [1, 2, 3]
    .map((presentationOrdinal) => row('SCORED', route, presentationOrdinal)));
  assertRows(pilotRows, scoredRows, routes);
  const material = {
    version: STAGE25_LONG_FORM_PROVIDER_COHORT_VERSION_V3,
    authority: 'RESEARCH_PLANNING_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION' as const,
    contractSource: {
      path: STAGE25_LONG_FORM_PROVIDER_COHORT_PATH_V3,
      sha256: input.contractSourceSha256,
    },
    currentTruthBinding: {
      artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.artifactType,
      manifestSha256: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.manifestHash,
      normalizedSourceSnapshotSha256:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.sourceBinding.normalizedSourceSnapshotHash,
      sourceCommit: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.sourceBinding.commit,
      role: 'CURRENT_CODE_CENSUS_NOT_MODEL_INPUT_FOR_CONTROL_ONLY_PLAN',
      runtimeAuthorityDenied: true as const,
    },
    planningContractBinding: {
      holdoutVersion: STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V2,
      proposalVersion: STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2,
      protocolVersion: STAGE25_LONG_FORM_PROVIDER_PROTOCOL_VERSION_V2,
      compilerVersion: STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V2,
      evaluatorVersion: STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V2,
      contextSha256: context.contextSha256,
      toolSetSha256: toolSet.toolSetSha256,
      argumentHandoffMode: STAGE25_LONG_FORM_PROVIDER_DURABLE_HANDOFF_MODE_V2,
      proofCeiling: 'STRUCTURE_AND_PROVENANCE_ONLY',
    },
    historicalEvidenceBinding: {
      manifestSha256: HISTORICAL_V2_MANIFEST_SHA256,
      paidCohortReceiptSha256: HISTORICAL_V2_RECEIPT_SHA256,
      role: 'IMMUTABLE_RAW_INPUT_FOR_ZERO_INFERENCE_RESCORE_ONLY',
      historicalClaimsNotInherited: true as const,
    },
    routeSet: routes,
    pilotRows,
    scoredRows,
    pilotRowSetSha256: hashCanonicalJsonV1(pilotRows),
    scoredRowSetSha256: hashCanonicalJsonV1(scoredRows),
    executionPolicy: {
      dispatchAuthorized: false as const,
      zeroInferenceReadinessRequired: true as const,
      oneNonScoredPilotPerRouteRequired: true as const,
      pilotAuditRequiredBeforeScoredCohort: true as const,
      maximumAttemptsPerRow: 1 as const,
      automaticRetry: false as const,
      projectReads: 0 as const,
      projectMutations: 0 as const,
    },
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertStage25LongFormProviderCohortManifestV3(
  value: unknown,
): Readonly<Stage25LongFormProviderCohortManifestV3> {
  if (!isRecord(value) || !isRecord(value.contractSource)) fail('MANIFEST_MISSING');
  const rebuilt = buildStage25LongFormProviderCohortManifestV3({
    contractSourceSha256: text(value.contractSource.sha256),
  });
  if (hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(rebuilt)) {
    fail('MANIFEST_DRIFT');
  }
  return rebuilt;
}

function row(
  stage: 'PILOT' | 'SCORED',
  route: Readonly<JsonRecord>,
  presentationOrdinal: number,
): Readonly<JsonRecord> {
  const routeId = text(route.routeId);
  const material = {
    rowId: `${stage}-${routeId}:P${presentationOrdinal}`,
    stage,
    route,
    routeSha256: hashCanonicalJsonV1(route),
    presentationOrdinal,
    argumentHandoffMode: STAGE25_LONG_FORM_PROVIDER_DURABLE_HANDOFF_MODE_V2,
  };
  return { ...material, rowPlanSha256: hashCanonicalJsonV1(material) };
}

function assertRows(
  pilots: readonly Readonly<JsonRecord>[],
  scored: readonly Readonly<JsonRecord>[],
  routes: readonly Readonly<JsonRecord>[],
): void {
  const all = [...pilots, ...scored];
  if (pilots.length !== 3 || scored.length !== 9
    || new Set(all.map(({ rowId }) => text(rowId))).size !== 12
    || routes.some(({ routeId }) =>
      pilots.filter((entry) => text(record(entry.route).routeId) === routeId).length !== 1
      || scored.filter((entry) => text(record(entry.route).routeId) === routeId).length !== 3)) {
    fail('ROW_BALANCE_DRIFT');
  }
}

function requireSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) fail(code);
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(code: string): never { throw new Error(`STAGE25_LONG_FORM_COHORT_V3_${code}`); }
