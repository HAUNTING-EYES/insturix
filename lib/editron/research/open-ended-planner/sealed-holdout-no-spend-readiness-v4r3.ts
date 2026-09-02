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
  assertSealedHoldoutGeneralisationManifestV4R3,
  type SealedHoldoutGeneralisationManifestV4R3,
} from './sealed-holdout-generalisation-cohort-v4r3';
import {
  assertSealedHoldoutSentinelReceiptV4R3,
  recomputeSealedHoldoutSentinelsV4R3,
} from './sealed-holdout-sentinel-runner-v4r3';

export const SEALED_HOLDOUT_NO_SPEND_READINESS_PATH_V4R3 =
  'lib/editron/research/open-ended-planner/sealed-holdout-no-spend-readiness-v4r3.ts' as const;
export const SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R3 = Object.freeze([
  SEALED_HOLDOUT_NO_SPEND_READINESS_PATH_V4R3,
  'lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r3.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-route-health-v4r3.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-sentinel-runner-v4r3.ts',
] as const);

interface ReadinessInputV4R3 {
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R3>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  predecessorManifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
  rootDir?: string;
}

export async function issueSealedHoldoutNoSpendReadinessV4R3(
  input: Readonly<ReadinessInputV4R3>,
): Promise<Readonly<NoSpendLaneIntegrityReceiptV2>> {
  const base = assertSealedHoldoutCohortManifestV2R(input.baseManifest);
  const predecessor = assertSealedHoldoutGeneralisationManifestV4R2({
    value: input.predecessorManifest, baseManifest: base,
  });
  const manifest = assertSealedHoldoutGeneralisationManifestV4R3({
    value: input.manifest, baseManifest: base, predecessorManifest: predecessor,
  });
  const sentinel = assertSealedHoldoutSentinelReceiptV4R3(
    await recomputeSealedHoldoutSentinelsV4R3({
      manifest, baseManifest: base, predecessorManifest: predecessor,
    }),
  );
  if (sentinel.manifestSha256 !== manifest.manifestSha256
    || sentinel.baseManifestSha256 !== base.manifestSha256
    || sentinel.predecessorManifestSha256 !== predecessor.manifestSha256
    || sentinel.sentinels.length !== 12
    || sentinel.assessment !== 'PASS_ALL_V4R3_REQUIRED_SENTINELS_RECOMPUTED') {
    fail('SENTINEL_BINDING_INVALID');
  }
  const executableClosure = computeExecutableImportClosureV1({
    rootDir: input.rootDir,
    roots: SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R3,
    mode: 'verification',
    strictGit: true,
  });
  return buildNoSpendLaneIntegrityReceiptV2({
    lane: 'SEALED_HOLDOUT_GENERALISATION_V4R3',
    successorManifestSha256: manifest.manifestSha256,
    sentinelExecution: {
      receiptVersion: sentinel.version,
      receiptSha256: sentinel.receiptSha256,
      claimSetSha256: sentinel.claimSetSha256,
      sentinelCount: sentinel.sentinels.length,
      assessment: sentinel.assessment,
    },
    executableClosure,
    expectedRoots: SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R3,
  });
}

export async function assertCurrentSealedHoldoutNoSpendReadinessV4R3(
  input: Readonly<ReadinessInputV4R3 & { value: unknown }>,
): Promise<Readonly<NoSpendLaneIntegrityReceiptV2>> {
  const current = await issueSealedHoldoutNoSpendReadinessV4R3(input);
  return assertNoSpendLaneIntegrityReceiptV2({
    value: input.value,
    lane: current.lane,
    successorManifestSha256: current.successorManifestSha256,
    sentinelExecution: current.sentinelExecution,
    expectedRoots: SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R3,
  });
}

function fail(code: string): never {
  throw new Error(`SEALED_HOLDOUT_NO_SPEND_V4R3_${code}`);
}
