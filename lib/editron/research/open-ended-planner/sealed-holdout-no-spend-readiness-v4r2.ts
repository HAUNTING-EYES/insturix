import { computeExecutableImportClosureV1 }
  from '../../services/executable-import-closure-v1';
import {
  assertNoSpendLaneIntegrityReceiptV2,
  buildNoSpendLaneIntegrityReceiptV2,
  type NoSpendLaneIntegrityReceiptV2,
} from './no-spend-lane-integrity-receipt-v2';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  assertSealedHoldoutGeneralisationManifestV4R2,
  type SealedHoldoutGeneralisationManifestV4R2,
} from './sealed-holdout-generalisation-cohort-v4r2';
import {
  assertSealedHoldoutSentinelReceiptV4R2,
  recomputeSealedHoldoutSentinelsV4R2,
} from './sealed-holdout-sentinel-runner-v4r2';

export const SEALED_HOLDOUT_NO_SPEND_READINESS_PATH_V4R2 =
  'lib/editron/research/open-ended-planner/sealed-holdout-no-spend-readiness-v4r2.ts' as const;
export const SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R2 = Object.freeze([
  SEALED_HOLDOUT_NO_SPEND_READINESS_PATH_V4R2,
  'lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r2.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-sentinel-runner-v4r2.ts',
] as const);

export async function issueSealedHoldoutNoSpendReadinessV4R2(input: Readonly<{
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  rootDir?: string;
}>): Promise<Readonly<NoSpendLaneIntegrityReceiptV2>> {
  const base = assertSealedHoldoutCohortManifestV2R(input.baseManifest);
  const manifest = assertSealedHoldoutGeneralisationManifestV4R2({
    value: input.manifest,
    baseManifest: base,
  });
  const sentinel = assertSealedHoldoutSentinelReceiptV4R2(
    await recomputeSealedHoldoutSentinelsV4R2({ manifest: base }),
  );
  if (sentinel.manifestSha256 !== base.manifestSha256
    || sentinel.sentinels.length !== 8
    || sentinel.assessment !== 'PASS_ALL_REQUIRED_SENTINELS_RECOMPUTED') {
    fail('SENTINEL_BINDING_INVALID');
  }
  const closure = computeExecutableImportClosureV1({
    rootDir: input.rootDir,
    roots: SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R2,
    mode: 'verification',
    strictGit: true,
  });
  return buildNoSpendLaneIntegrityReceiptV2({
    lane: 'SEALED_HOLDOUT_GENERALISATION_V4R2',
    successorManifestSha256: manifest.manifestSha256,
    sentinelExecution: sentinelMaterial(sentinel),
    executableClosure: closure,
    expectedRoots: SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R2,
  });
}

export async function assertCurrentSealedHoldoutNoSpendReadinessV4R2(input: Readonly<{
  value: unknown;
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  rootDir?: string;
}>): Promise<Readonly<NoSpendLaneIntegrityReceiptV2>> {
  const current = await issueSealedHoldoutNoSpendReadinessV4R2(input);
  return assertNoSpendLaneIntegrityReceiptV2({
    value: input.value,
    lane: current.lane,
    successorManifestSha256: current.successorManifestSha256,
    sentinelExecution: current.sentinelExecution,
    expectedRoots: SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R2,
  });
}

function sentinelMaterial(
  sentinel: ReturnType<typeof assertSealedHoldoutSentinelReceiptV4R2>,
): NoSpendLaneIntegrityReceiptV2['sentinelExecution'] {
  return {
    receiptVersion: sentinel.version,
    receiptSha256: sentinel.receiptSha256,
    claimSetSha256: sentinel.claimSetSha256,
    sentinelCount: sentinel.sentinels.length,
    assessment: sentinel.assessment,
  };
}
function fail(code: string): never {
  throw new Error(`SEALED_HOLDOUT_NO_SPEND_V4R2_${code}`);
}
