import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6 }
  from '../capability-census/cap2-current-truth-reissue-audit-v6';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { GENERATED_COMPOSITION_MODEL_API_SURFACE_V2 }
  from './generated-composition-model-candidate-v1';
import {
  assertProviderNativeCohortManifestV2R,
  type ProviderNativeCohortManifestV2R,
  type ProviderNativeCohortRouteV2R,
} from './provider-native-cohort-manifest-v2r';
import {
  assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2,
} from './sealed-holdout-cohort-v3r2';
import {
  SEALED_H03_MODEL_SOURCE_CONTRACT_VERSION_V3R,
  SEALED_H03_MODEL_SOURCE_STAGE_BUDGET_V3R,
} from './sealed-holdout-h03-model-candidate-v3r';

type JsonRecord = Record<string, unknown>;
type ImplementationBinding = Readonly<{ path: string; sha256: string }>;

export const SEALED_H03_PROVIDER_COHORT_VERSION_V3R4 =
  'EDITRON_OE_SEALED_H03_PROVIDER_COHORT_V3R4_1' as const;
export const SEALED_H03_PROVIDER_COHORT_PATH_V3R4 =
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-v3r4.ts' as const;

const BASE_MANIFEST_SHA256 =
  'a468c2f487f3a07385dd51ee5653bd9fcdafaeb86130f3fe6a54381d5cc930f3';
const BASE_CONTRACT_SHA256 =
  '677557ec98ad4e89a4ce9fb88b64aa9846a140a5272dd23f8127a716de2dd6e1';
const H03_PUBLIC_CASE_SHA256 =
  'c60f30c2d91654c37c69cd8ec150b9dd6ed460923b1a012aaf060b8a256b85f2';
const IMPLEMENTATION_BINDINGS_SHA256 =
  'b2255d634f61a5f6872ef32ab4b9d121346851639756d3291adcc1009ac14680';
const SANDBOX_WORKER_IMPLEMENTATION_SHA256 =
  'acbd1e6b8dcd30443b9bb919dc15cf2d8d501b2cee0ba8c460af972b3b5046f0';

export const SEALED_H03_PROVIDER_IMPLEMENTATION_PATHS_V3R4 = deepFreezeV1([
  'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx',
  'lib/editron/research/open-ended-planner/generated-composition-model-candidate-v1.ts',
  'lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1.ts',
  'lib/editron/research/open-ended-planner/provider-native-generated-source-adapter-v2r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v3r2.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-model-candidate-v3r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-row-runner-v3r3.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-source-adapter-v3r2.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-rendered-mechanics-v2r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-source-executor-v3r2.ts',
] as const);

export const SEALED_H03_PROVIDER_SOURCE_REQUEST_IDENTITY_V3R4 = deepFreezeV1({
  authority: 'PRIOR_OWNER_AUTHORIZATION_FIXTURE_NO_MODEL_PERFORMANCE_CLAIM',
  caseId: 'HOLD-03:C1',
  operationId: 'generated_composition_program',
  orchestratorArgumentsSha256:
    '19057629f308d64e82a96d4c831fa39076a0ebc0715982c1f31d28b445b280a0',
  ownerAuthorizationOutputSha256:
    '5ca2f52ad9865f526b7a4ae8ff9955d8496b0901726487fb59e45fa14ffddb9a',
  sourceAArtifactSha256:
    'sha256:cb54ba193dad9159cdd0856ce39280855af4adb1c3d4f8de50fd13fc2a1bef25',
  sourceBArtifactSha256:
    'sha256:3bc9ff365921e4a3043490f05c7e6bee68d4e067a3ead8e6013f981aebbbff6f',
  priorSyntheticProofReceiptSha256:
    '17a81dc399d1c9dc0dbe30bc39b6f40d25e4798756271045c39469092d05722f',
  priorSourceOrigin: 'SYNTHETIC_CONTRACT_CALLBACK_NOT_PROVIDER_OUTPUT',
  correctedProviderContract: {
    cap2ManifestSha256: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.manifestHash,
    modelApiSurfaceVersion: GENERATED_COMPOSITION_MODEL_API_SURFACE_V2.contractVersion,
    modelSourceContractVersion: SEALED_H03_MODEL_SOURCE_CONTRACT_VERSION_V3R,
    renderedAcceptanceContractVersion: 'EDITRON_OE_SEALED_H03_RENDERED_ACCEPTANCE_V3R_2',
    sandboxWorkerImplementationSha256: SANDBOX_WORKER_IMPLEMENTATION_SHA256,
  },
  projectMutation: 'NONE',
});

export const SEALED_H03_PROVIDER_BUDGET_ARMS_V3R4 = deepFreezeV1([
  { armId: 'PRODUCTION_BUDGET', maximumSourceCandidates: 1,
    maximumVerifierRepairs: 0, maximumTransportAttemptsPerCandidate: 2,
    maximumProviderHttpRequests: 2 },
  { armId: 'CAPABILITY_CEILING', maximumSourceCandidates: 2,
    maximumVerifierRepairs: 1, maximumTransportAttemptsPerCandidate: 2,
    maximumProviderHttpRequests: 4 },
] as const);

type BudgetArm = typeof SEALED_H03_PROVIDER_BUDGET_ARMS_V3R4[number];

export interface SealedH03ProviderCohortManifestV3R4 {
  version: typeof SEALED_H03_PROVIDER_COHORT_VERSION_V3R4;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION_NO_PROVIDER_DISPATCH';
  contractSource: Readonly<{ path: typeof SEALED_H03_PROVIDER_COHORT_PATH_V3R4; sha256: string }>;
  baseCohortIdentity: Readonly<JsonRecord>;
  cap2CurrentTruthBinding: Readonly<JsonRecord>;
  providerRouteManifest: Readonly<JsonRecord>;
  h03CaseBinding: Readonly<JsonRecord>;
  sourceRequestIdentity: typeof SEALED_H03_PROVIDER_SOURCE_REQUEST_IDENTITY_V3R4;
  implementationBindings: readonly ImplementationBinding[];
  implementationBindingsSha256: string;
  sandboxWorkerImplementationSha256: string;
  stageBudget: typeof SEALED_H03_MODEL_SOURCE_STAGE_BUDGET_V3R;
  budgetArms: typeof SEALED_H03_PROVIDER_BUDGET_ARMS_V3R4;
  repetitionsPerRouteArm: 3;
  rows: readonly Readonly<JsonRecord>[];
  absoluteMaxSpendUsd: number;
  executionPolicy: Readonly<JsonRecord>;
  stateEffects: readonly [];
  manifestSha256: string;
}

export function buildSealedH03ProviderCohortManifestV3R4(input: Readonly<{
  contractSourceSha256: string;
  baseManifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  providerManifest: Readonly<ProviderNativeCohortManifestV2R>;
  implementationBindings: readonly ImplementationBinding[];
  sandboxWorkerImplementationSha256: string;
}>): Readonly<SealedH03ProviderCohortManifestV3R4> {
  requireSha(input.contractSourceSha256, 'SEALED_H03_V3R4_COHORT_SOURCE_HASH_INVALID');
  const base = assertSealedHoldoutCohortManifestV3R2(input.baseManifest);
  const provider = assertProviderNativeCohortManifestV2R(input.providerManifest);
  if (base.manifestSha256 !== BASE_MANIFEST_SHA256
    || base.contractSource.sha256 !== BASE_CONTRACT_SHA256) fail('SEALED_H03_V3R4_BASE_DRIFT');
  const h03 = base.cases.find(({ caseId }) => caseId === 'HOLD-03:C1');
  if (!h03 || h03.publicCaseSha256 !== H03_PUBLIC_CASE_SHA256) {
    fail('SEALED_H03_V3R4_CASE_DRIFT');
  }
  const implementationBindings = validateImplementationBindings(input.implementationBindings);
  if (input.sandboxWorkerImplementationSha256 !== SANDBOX_WORKER_IMPLEMENTATION_SHA256) {
    fail('SEALED_H03_V3R4_SANDBOX_WORKER_DRIFT');
  }
  const routes = provider.routes.map((entry) => deepFreezeV1({
    route: entry.route, transport: entry.transport, pricing: entry.pricing,
    priceSnapshotDate: entry.priceSnapshotDate, pricingSource: entry.pricingSource,
  }));
  const rows = buildRows(routes, SEALED_H03_PROVIDER_BUDGET_ARMS_V3R4);
  const material = {
    version: SEALED_H03_PROVIDER_COHORT_VERSION_V3R4,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION_NO_PROVIDER_DISPATCH' as const,
    contractSource: { path: SEALED_H03_PROVIDER_COHORT_PATH_V3R4,
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
    providerRouteManifest: { purpose: 'ROUTE_PRICING_AND_PROVIDER_IDENTITY_ONLY_NOT_CAP_AUTHORITY',
      version: provider.version, manifestSha256: provider.manifestSha256, routes },
    h03CaseBinding: { caseId: h03.caseId, publicCaseSha256: h03.publicCaseSha256,
      ownerOnlySha256: h03.ownerOnlySha256, evaluatorOnlySha256: h03.evaluatorOnlySha256 },
    sourceRequestIdentity: SEALED_H03_PROVIDER_SOURCE_REQUEST_IDENTITY_V3R4,
    implementationBindings,
    implementationBindingsSha256: IMPLEMENTATION_BINDINGS_SHA256,
    sandboxWorkerImplementationSha256: SANDBOX_WORKER_IMPLEMENTATION_SHA256,
    stageBudget: SEALED_H03_MODEL_SOURCE_STAGE_BUDGET_V3R,
    budgetArms: SEALED_H03_PROVIDER_BUDGET_ARMS_V3R4,
    repetitionsPerRouteArm: 3 as const,
    rows,
    absoluteMaxSpendUsd: roundUsd(rows.reduce(
      (sum, row) => sum + Number(row.absoluteMaxRowSpendUsd), 0)),
    executionPolicy: { dispatchAuthorized: false as const,
      explicitSpendAuthorizationRequired: true as const,
      zeroInferencePreflightRequired: true as const,
      renderAndHiddenEvaluationRequired: true as const,
      projectReads: 0 as const, projectMutations: 0 as const },
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertSealedH03ProviderCohortManifestV3R4(
  value: unknown,
): Readonly<SealedH03ProviderCohortManifestV3R4> {
  if (!isRecord(value)) fail('SEALED_H03_V3R4_COHORT_MISSING');
  const candidate = value as unknown as SealedH03ProviderCohortManifestV3R4;
  const { manifestSha256, ...material } = candidate;
  const cap2 = record(candidate.cap2CurrentTruthBinding);
  const base = record(candidate.baseCohortIdentity);
  const routeManifest = record(candidate.providerRouteManifest);
  const routes = Array.isArray(routeManifest.routes)
    ? routeManifest.routes as readonly ProviderNativeCohortRouteV2R[] : [];
  const rows = buildRows(routes, SEALED_H03_PROVIDER_BUDGET_ARMS_V3R4);
  if (candidate.version !== SEALED_H03_PROVIDER_COHORT_VERSION_V3R4
    || candidate.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION_NO_PROVIDER_DISPATCH'
    || candidate.contractSource.path !== SEALED_H03_PROVIDER_COHORT_PATH_V3R4
    || base.manifestSha256 !== BASE_MANIFEST_SHA256
    || cap2.artifactType !== CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.artifactType
    || cap2.manifestSha256 !== CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.manifestHash
    || cap2.normalizedSourceSnapshotSha256
      !== CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.sourceBinding.normalizedSourceSnapshotHash
    || cap2.sourceCommit !== CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.sourceBinding.commit
    || cap2.runtimeAuthorityDenied !== true
    || routeManifest.purpose !== 'ROUTE_PRICING_AND_PROVIDER_IDENTITY_ONLY_NOT_CAP_AUTHORITY'
    || !sameRouteSet(routes)
    || hashCanonicalJsonV1(candidate.sourceRequestIdentity)
      !== hashCanonicalJsonV1(SEALED_H03_PROVIDER_SOURCE_REQUEST_IDENTITY_V3R4)
    || hashCanonicalJsonV1(candidate.budgetArms)
      !== hashCanonicalJsonV1(SEALED_H03_PROVIDER_BUDGET_ARMS_V3R4)
    || candidate.implementationBindingsSha256 !== IMPLEMENTATION_BINDINGS_SHA256
    || candidate.sandboxWorkerImplementationSha256 !== SANDBOX_WORKER_IMPLEMENTATION_SHA256
    || candidate.repetitionsPerRouteArm !== 3 || candidate.rows.length !== 18
    || hashCanonicalJsonV1(candidate.rows) !== hashCanonicalJsonV1(rows)
    || candidate.absoluteMaxSpendUsd !== roundUsd(rows.reduce(
      (sum, row) => sum + Number(row.absoluteMaxRowSpendUsd), 0))
    || candidate.executionPolicy.dispatchAuthorized !== false
    || candidate.stateEffects.length !== 0
    || manifestSha256 !== hashCanonicalJsonV1(material)) fail('SEALED_H03_V3R4_COHORT_DRIFT');
  validateImplementationBindings(candidate.implementationBindings);
  return deepFreezeV1(candidate);
}

function buildRows(routes: readonly Readonly<ProviderNativeCohortRouteV2R>[], arms: readonly BudgetArm[]) {
  return routes.flatMap((entry) => arms.flatMap((arm) => [1, 2, 3].map((repetition) => ({
    rowId: `${entry.route.routeId.toLowerCase()}-${arm.armId.toLowerCase()}-r${repetition}`,
    routeId: entry.route.routeId, armId: arm.armId, repetition,
    maximumProviderHttpRequests: arm.maximumProviderHttpRequests,
    absoluteMaxRowSpendUsd: roundUsd(maximumProviderRequestSpend(entry)
      * arm.maximumProviderHttpRequests),
  }))));
}
function maximumProviderRequestSpend(entry: Readonly<ProviderNativeCohortRouteV2R>): number {
  const inputRate = Math.max(entry.pricing.inputUsdPerMillion,
    entry.pricing.cacheWriteUsdPerMillion);
  const outputTokens = SEALED_H03_MODEL_SOURCE_STAGE_BUDGET_V3R.maxVisibleOutputTokens
    + SEALED_H03_MODEL_SOURCE_STAGE_BUDGET_V3R.maxReasoningTokens;
  const spend = (SEALED_H03_MODEL_SOURCE_STAGE_BUDGET_V3R.maxInputTokens * inputRate
    + outputTokens * entry.pricing.outputUsdPerMillion) / 1_000_000;
  if (spend > SEALED_H03_MODEL_SOURCE_STAGE_BUDGET_V3R.maxProviderCostUsd) {
    fail(`SEALED_H03_V3R4_ROUTE_EXCEEDS_STAGE_COST:${entry.route.routeId}`);
  }
  return spend;
}
function validateImplementationBindings(values: readonly ImplementationBinding[]) {
  const sorted = [...values].sort((left, right) => left.path < right.path ? -1 : 1);
  if (sorted.length !== SEALED_H03_PROVIDER_IMPLEMENTATION_PATHS_V3R4.length
    || sorted.some((entry, index) => entry.path
      !== SEALED_H03_PROVIDER_IMPLEMENTATION_PATHS_V3R4[index]
      || !/^[a-f0-9]{64}$/.test(entry.sha256))
    || hashCanonicalJsonV1(sorted) !== IMPLEMENTATION_BINDINGS_SHA256) {
    fail('SEALED_H03_V3R4_IMPLEMENTATION_BINDING_DRIFT');
  }
  return deepFreezeV1(sorted);
}
function sameRouteSet(routes: readonly Readonly<ProviderNativeCohortRouteV2R>[]): boolean {
  return hashCanonicalJsonV1(routes.map(({ route }) => [route.routeId, route.provider, route.model]))
    === hashCanonicalJsonV1([
      ['OPENAI_LUNA', 'openai', 'gpt-5.6-luna'],
      ['OPENAI_TERRA', 'openai', 'gpt-5.6-terra'],
      ['GOOGLE_FLASH', 'google', 'gemini-3.7-flash'],
    ]);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function requireSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(code);
}
function roundUsd(value: number): number { return Number(value.toFixed(6)); }
function fail(code: string): never { throw new Error(code); }
