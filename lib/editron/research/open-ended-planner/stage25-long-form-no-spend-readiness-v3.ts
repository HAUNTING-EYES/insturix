import { computeExecutableImportClosureV1 }
  from '../../services/executable-import-closure-v1';
import {
  assertNoSpendLaneIntegrityReceiptV2,
  buildNoSpendLaneIntegrityReceiptV2,
  type NoSpendLaneIntegrityReceiptV2,
} from './no-spend-lane-integrity-receipt-v2';
import {
  assertStage25LongFormProviderCohortManifestV3,
  type Stage25LongFormProviderCohortManifestV3,
} from './stage25-long-form-plan-provider-cohort-v3';
import {
  assertStage25LongFormSentinelReceiptV3,
  recomputeStage25LongFormSentinelsV3,
} from './stage25-long-form-sentinel-runner-v3';

export const STAGE25_LONG_FORM_NO_SPEND_READINESS_PATH_V3 =
  'lib/editron/research/open-ended-planner/stage25-long-form-no-spend-readiness-v3.ts' as const;
export const STAGE25_LONG_FORM_NO_SPEND_ROOTS_V3 = Object.freeze([
  STAGE25_LONG_FORM_NO_SPEND_READINESS_PATH_V3,
  'lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-cohort-v3.ts',
  'lib/editron/research/open-ended-planner/stage25-long-form-sentinel-runner-v3.ts',
] as const);

export async function issueStage25LongFormNoSpendReadinessV3(input: Readonly<{
  manifest: Readonly<Stage25LongFormProviderCohortManifestV3>;
  rootDir?: string;
}>): Promise<Readonly<NoSpendLaneIntegrityReceiptV2>> {
  const manifest = assertStage25LongFormProviderCohortManifestV3(input.manifest);
  const sentinel = assertStage25LongFormSentinelReceiptV3(
    await recomputeStage25LongFormSentinelsV3(),
  );
  if (sentinel.contextSha256 !== manifest.planningContractBinding.contextSha256
    || sentinel.sentinels.length !== 5
    || sentinel.assessment !== 'PASS_ALL_REQUIRED_LONG_FORM_SENTINELS_RECOMPUTED') {
    fail('SENTINEL_BINDING_INVALID');
  }
  const closure = computeExecutableImportClosureV1({
    rootDir: input.rootDir,
    roots: STAGE25_LONG_FORM_NO_SPEND_ROOTS_V3,
    mode: 'verification',
    strictGit: true,
  });
  return buildNoSpendLaneIntegrityReceiptV2({
    lane: 'STAGE25_LONG_FORM_PROVIDER_V3',
    successorManifestSha256: manifest.manifestSha256,
    sentinelExecution: sentinelMaterial(sentinel),
    executableClosure: closure,
    expectedRoots: STAGE25_LONG_FORM_NO_SPEND_ROOTS_V3,
  });
}

export async function assertCurrentStage25LongFormNoSpendReadinessV3(input: Readonly<{
  value: unknown;
  manifest: Readonly<Stage25LongFormProviderCohortManifestV3>;
  rootDir?: string;
}>): Promise<Readonly<NoSpendLaneIntegrityReceiptV2>> {
  const current = await issueStage25LongFormNoSpendReadinessV3(input);
  return assertNoSpendLaneIntegrityReceiptV2({
    value: input.value,
    lane: current.lane,
    successorManifestSha256: current.successorManifestSha256,
    sentinelExecution: current.sentinelExecution,
    expectedRoots: STAGE25_LONG_FORM_NO_SPEND_ROOTS_V3,
  });
}

function sentinelMaterial(
  sentinel: ReturnType<typeof assertStage25LongFormSentinelReceiptV3>,
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
  throw new Error(`STAGE25_LONG_FORM_NO_SPEND_V3_${code}`);
}
