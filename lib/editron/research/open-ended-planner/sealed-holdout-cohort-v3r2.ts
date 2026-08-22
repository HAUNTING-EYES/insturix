import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { sealedHoldoutOperatorCatalogIdentityV3R }
  from './sealed-holdout-catalog-v3r';
import type { SealedHoldoutCaseV2R }
  from './sealed-holdout-cohort-v2r';
import {
  assertSealedHoldoutCohortManifestV3R,
  type SealedHoldoutCohortManifestV3R,
} from './sealed-holdout-cohort-v3r';
import {
  assertSealedH03PublicTargetContractV3R,
  SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R,
} from './sealed-holdout-h03-target-contract-v3r';
import { assertNoEvaluatorLeakV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_COHORT_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_COHORT_V3R_2' as const;
export const SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2 =
  'lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r2.ts' as const;

const BASE_VERSION = 'EDITRON_OE_SEALED_HOLDOUT_COHORT_V3R_1';
const BASE_MANIFEST_SHA256 =
  'c82c4f3b512defe025ee2b57eee050305bb7380eddfea55bcddf8574901f68d2';
const BASE_CONTRACT_SHA256 =
  '1294613a8ff5004f63fd94235a7f345e30d75ae1577b9a54f4e92ded07490c48';

export interface SealedHoldoutCohortManifestV3R2 {
  version: typeof SEALED_HOLDOUT_COHORT_VERSION_V3R2;
  authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION';
  contractSource: Readonly<{
    path: typeof SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2;
    sha256: string;
  }>;
  baseCohortIdentity: Readonly<JsonRecord>;
  operatorCatalogIdentity: Readonly<JsonRecord>;
  cap2CurrentTruthBinding: Readonly<JsonRecord>;
  mediaIdentity: Readonly<JsonRecord>;
  sharedModelContext: Readonly<JsonRecord>;
  sharedModelContextSha256: string;
  cases: readonly Readonly<SealedHoldoutCaseV2R>[];
  correctionLedger: readonly string[];
  executionPolicy: Readonly<JsonRecord>;
  manifestSha256: string;
}

export function buildSealedHoldoutCohortManifestV3R2(input: Readonly<{
  contractSourceSha256: string;
  baseManifest: Readonly<SealedHoldoutCohortManifestV3R>;
}>): Readonly<SealedHoldoutCohortManifestV3R2> {
  requireSha(input.contractSourceSha256, 'HOLDOUT_V3R2_SOURCE_HASH_INVALID');
  const base = assertSealedHoldoutCohortManifestV3R(input.baseManifest);
  assertBaseIdentity(base);
  const cases = base.cases.map(amendCase);
  const material = {
    version: SEALED_HOLDOUT_COHORT_VERSION_V3R2,
    authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION' as const,
    contractSource: {
      path: SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2,
      sha256: input.contractSourceSha256,
    },
    baseCohortIdentity: {
      version: base.version,
      manifestSha256: base.manifestSha256,
      contractSource: base.contractSource,
    },
    operatorCatalogIdentity: base.operatorCatalogIdentity,
    cap2CurrentTruthBinding: base.cap2CurrentTruthBinding,
    mediaIdentity: base.mediaIdentity,
    sharedModelContext: base.sharedModelContext,
    sharedModelContextSha256: base.sharedModelContextSha256,
    cases,
    correctionLedger: [
      ...base.correctionLedger,
      'HOLD-03 protected literal and blueprint identity are public reference-analysis inputs',
      'HOLD-03 panel geometry, motion relation and native return are observable target facts rather than evaluator-only literals',
    ],
    executionPolicy: {
      ...base.executionPolicy,
      dispatchAuthorized: false as const,
      derivedIdentityOnly: true as const,
    },
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertSealedHoldoutCohortManifestV3R2(
  candidate: unknown,
): Readonly<SealedHoldoutCohortManifestV3R2> {
  if (!isRecord(candidate)) fail('HOLDOUT_V3R2_MANIFEST_MISSING');
  const manifest = candidate as unknown as SealedHoldoutCohortManifestV3R2;
  const { manifestSha256, ...material } = manifest;
  const baseIdentity = record(manifest.baseCohortIdentity);
  const baseSource = record(baseIdentity.contractSource);
  const catalogIdentity = sealedHoldoutOperatorCatalogIdentityV3R();
  if (manifest.version !== SEALED_HOLDOUT_COHORT_VERSION_V3R2
    || manifest.authority !== 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION'
    || manifest.contractSource.path !== SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2
    || manifest.cases.length !== 16
    || manifest.sharedModelContextSha256 !== hashCanonicalJsonV1(manifest.sharedModelContext)
    || hashCanonicalJsonV1(manifest.operatorCatalogIdentity)
      !== hashCanonicalJsonV1(catalogIdentity)
    || baseIdentity.version !== BASE_VERSION
    || baseIdentity.manifestSha256 !== BASE_MANIFEST_SHA256
    || baseSource.sha256 !== BASE_CONTRACT_SHA256
    || manifest.executionPolicy.dispatchAuthorized !== false
    || manifestSha256 !== hashCanonicalJsonV1(material)) {
    fail('HOLDOUT_V3R2_MANIFEST_DRIFT');
  }
  assertNoEvaluatorLeakV2(manifest.sharedModelContext);
  for (const entry of manifest.cases) {
    assertNoEvaluatorLeakV2(entry.publicCase);
    if (entry.publicCaseSha256 !== hashCanonicalJsonV1(entry.publicCase)
      || entry.ownerOnlySha256 !== hashCanonicalJsonV1(entry.ownerOnly)
      || entry.evaluatorOnlySha256 !== hashCanonicalJsonV1(entry.evaluatorOnly)) {
      fail(`HOLDOUT_V3R2_CASE_HASH_DRIFT:${entry.caseId}`);
    }
  }
  assertH03Targets(manifest.cases);
  return deepFreezeV1(manifest);
}

function amendCase(entry: Readonly<SealedHoldoutCaseV2R>): Readonly<SealedHoldoutCaseV2R> {
  const publicCase = record(entry.publicCase);
  if (publicCase.taskId !== 'HOLD-03') return entry;
  const amendedPublic = deepFreezeV1({
    ...publicCase,
    referenceTargetContract: SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R,
  });
  return deepFreezeV1({
    ...entry,
    publicCase: amendedPublic,
    publicCaseSha256: hashCanonicalJsonV1(amendedPublic),
  });
}

function assertH03Targets(cases: readonly Readonly<SealedHoldoutCaseV2R>[]): void {
  const h03 = cases.filter((entry) => record(entry.publicCase).taskId === 'HOLD-03');
  if (h03.length !== 2) fail('HOLDOUT_V3R2_H03_CASE_SET_DRIFT');
  for (const entry of h03) {
    try {
      assertSealedH03PublicTargetContractV3R(
        record(entry.publicCase).referenceTargetContract,
      );
    } catch {
      fail(`HOLDOUT_V3R2_H03_TARGET_DRIFT:${entry.caseId}`);
    }
  }
}

function assertBaseIdentity(base: Readonly<SealedHoldoutCohortManifestV3R>): void {
  if (base.version !== BASE_VERSION
    || base.manifestSha256 !== BASE_MANIFEST_SHA256
    || base.contractSource.sha256 !== BASE_CONTRACT_SHA256) {
    fail('HOLDOUT_V3R2_BASE_IDENTITY_DRIFT');
  }
}
function requireSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(code);
}
function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function fail(code: string): never { throw new Error(code); }
