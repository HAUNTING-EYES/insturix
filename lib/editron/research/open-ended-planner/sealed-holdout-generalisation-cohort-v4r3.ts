import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { sealedHoldoutOperatorCatalogIdentityV4R3 } from './sealed-holdout-catalog-v4r3';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  assertSealedHoldoutGeneralisationManifestV4R2,
  type SealedHoldoutGeneralisationManifestV4R2,
} from './sealed-holdout-generalisation-cohort-v4r2';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_GENERALISATION_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_GENERALISATION_COHORT_V4R3_1' as const;
export const SEALED_HOLDOUT_GENERALISATION_PATH_V4R3 =
  'lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r3.ts' as const;

export interface SealedHoldoutGeneralisationManifestV4R3 {
  version: typeof SEALED_HOLDOUT_GENERALISATION_VERSION_V4R3;
  authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY';
  contractSource: Readonly<{
    path: typeof SEALED_HOLDOUT_GENERALISATION_PATH_V4R3;
    sha256: string;
  }>;
  frozenTaskPacketBinding: Readonly<JsonRecord>;
  currentTruthBinding: Readonly<JsonRecord>;
  operatorCatalogIdentity: Readonly<JsonRecord>;
  predecessorManifestBinding: Readonly<JsonRecord>;
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

export function buildSealedHoldoutGeneralisationManifestV4R3(input: Readonly<{
  contractSourceSha256: string;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  predecessorManifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
}>): Readonly<SealedHoldoutGeneralisationManifestV4R3> {
  requireSha(input.contractSourceSha256, 'SOURCE_HASH_INVALID');
  const base = assertSealedHoldoutCohortManifestV2R(input.baseManifest);
  const predecessor = assertSealedHoldoutGeneralisationManifestV4R2({
    value: input.predecessorManifest,
    baseManifest: base,
  });
  const { manifestSha256: _predecessorHash, ...predecessorMaterial } = predecessor;
  const predecessorIdentity = record(predecessor.operatorCatalogIdentity);
  const material = {
    ...predecessorMaterial,
    version: SEALED_HOLDOUT_GENERALISATION_VERSION_V4R3,
    contractSource: {
      path: SEALED_HOLDOUT_GENERALISATION_PATH_V4R3,
      sha256: input.contractSourceSha256,
    },
    operatorCatalogIdentity: sealedHoldoutOperatorCatalogIdentityV4R3(),
    predecessorManifestBinding: {
      version: predecessor.version,
      manifestSha256: predecessor.manifestSha256,
      operatorCatalogSha256: text(predecessorIdentity.catalogSha256),
      role: 'IMMUTABLE_V4R2_PREDECESSOR_NOT_DISPATCH_AUTHORITY',
    },
    executionPolicy: {
      ...record(predecessor.executionPolicy),
      v4r3OwnerEvidencePolicyRequired: true,
      v4r2ManifestAcceptedForV4R3Dispatch: false,
      dispatchAuthorized: false,
    },
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertSealedHoldoutGeneralisationManifestV4R3(input: Readonly<{
  value: unknown;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  predecessorManifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
}>): Readonly<SealedHoldoutGeneralisationManifestV4R3> {
  if (!isRecord(input.value) || !isRecord(input.value.contractSource)) {
    fail('MANIFEST_MISSING');
  }
  const rebuilt = buildSealedHoldoutGeneralisationManifestV4R3({
    contractSourceSha256: text(input.value.contractSource.sha256),
    baseManifest: input.baseManifest,
    predecessorManifest: input.predecessorManifest,
  });
  if (hashCanonicalJsonV1(input.value) !== hashCanonicalJsonV1(rebuilt)) {
    fail('MANIFEST_DRIFT');
  }
  return rebuilt;
}

function requireSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) fail(code);
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(code: string): never { throw new Error(`SEALED_GENERALISATION_V4R3_${code}`); }
