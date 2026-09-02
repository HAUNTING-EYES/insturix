import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildNoSpendSentinelClaimSetV1,
  type NoSpendAttemptAwareResultAxesV1,
  type NoSpendSentinelClaimInputV1,
} from './no-spend-readiness-policy-v1';
import {
  authorizeSealedHoldoutH04CutPlanV4R3,
  buildSealedHoldoutOwnerSemanticPolicyV4R3,
  sealedHoldoutOperatorCatalogIdentityV4R3,
  type SealedHoldoutH04CutPlanAuthorizationV4R3,
} from './sealed-holdout-catalog-v4r3';
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
import { SealedHoldoutOwnerSessionV2R }
  from './sealed-holdout-owner-session-v2r';
import {
  assertSealedHoldoutSentinelReceiptV4R2,
  recomputeSealedHoldoutSentinelsV4R2,
  type SealedHoldoutSentinelReceiptV4R2,
  type SealedHoldoutSentinelResultV4R2,
} from './sealed-holdout-sentinel-runner-v4r2';

type JsonRecord = Record<string, unknown>;
type OwnerExecution = Awaited<ReturnType<SealedHoldoutOwnerSessionV2R['execute']>>;

export const SEALED_HOLDOUT_SENTINEL_RUNNER_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_SENTINEL_RUNNER_V4R3_1' as const;
export const SEALED_HOLDOUT_SENTINEL_RECEIPT_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_SENTINEL_RECEIPT_V4R3_1' as const;

export interface SealedHoldoutSentinelReceiptV4R3 {
  version: typeof SEALED_HOLDOUT_SENTINEL_RECEIPT_VERSION_V4R3;
  authority: 'ZERO_INFERENCE_SUCCESSOR_RECOMPUTATION_THROUGH_BOUND_OWNERS';
  lane: 'SEALED_HOLDOUT_GENERALISATION_V4R3';
  runnerVersion: typeof SEALED_HOLDOUT_SENTINEL_RUNNER_VERSION_V4R3;
  manifestSha256: string;
  baseManifestSha256: string;
  predecessorManifestSha256: string;
  operatorCatalogIdentity: Readonly<JsonRecord>;
  inheritedReceipt: Readonly<SealedHoldoutSentinelReceiptV4R2>;
  sentinels: readonly Readonly<SealedHoldoutSentinelResultV4R2>[];
  claimSetSha256: string;
  expectationValidationSha256: string;
  providerInferenceCalls: 0;
  networkCalls: 0;
  canonicalProjectReads: 0;
  canonicalProjectMutations: 0;
  stateEffects: readonly [];
  assessment: 'PASS_ALL_V4R3_REQUIRED_SENTINELS_RECOMPUTED';
  receiptSha256: string;
}

export async function recomputeSealedHoldoutSentinelsV4R3(input: Readonly<{
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R3>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  predecessorManifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
}>): Promise<Readonly<SealedHoldoutSentinelReceiptV4R3>> {
  const base = assertSealedHoldoutCohortManifestV2R(input.baseManifest);
  const predecessor = assertSealedHoldoutGeneralisationManifestV4R2({
    value: input.predecessorManifest, baseManifest: base,
  });
  const manifest = assertSealedHoldoutGeneralisationManifestV4R3({
    value: input.manifest, baseManifest: base, predecessorManifest: predecessor,
  });
  const inheritedReceipt = assertSealedHoldoutSentinelReceiptV4R2(
    await recomputeSealedHoldoutSentinelsV4R2({ manifest: base }),
  );
  const sentinels = [
    ...inheritedReceipt.sentinels,
    await h02BlanketRangeReject(base),
    await h02ExactWindowsAccept(base),
    await h04EquivalentPartitionAccept(base),
    await h04ReorderedPlanReject(base),
  ];
  const claims = sentinels.map(toClaim);
  const expectationValidation = buildNoSpendSentinelClaimSetV1(
    'SEALED_HOLDOUT_GENERALISATION_V4R3', claims,
  );
  const material = {
    version: SEALED_HOLDOUT_SENTINEL_RECEIPT_VERSION_V4R3,
    authority: 'ZERO_INFERENCE_SUCCESSOR_RECOMPUTATION_THROUGH_BOUND_OWNERS' as const,
    lane: 'SEALED_HOLDOUT_GENERALISATION_V4R3' as const,
    runnerVersion: SEALED_HOLDOUT_SENTINEL_RUNNER_VERSION_V4R3,
    manifestSha256: manifest.manifestSha256,
    baseManifestSha256: base.manifestSha256,
    predecessorManifestSha256: predecessor.manifestSha256,
    operatorCatalogIdentity: sealedHoldoutOperatorCatalogIdentityV4R3(),
    inheritedReceipt,
    sentinels,
    claimSetSha256: hashCanonicalJsonV1(claims),
    expectationValidationSha256: expectationValidation.claimSetSha256,
    providerInferenceCalls: 0 as const,
    networkCalls: 0 as const,
    canonicalProjectReads: 0 as const,
    canonicalProjectMutations: 0 as const,
    stateEffects: [] as const,
    assessment: 'PASS_ALL_V4R3_REQUIRED_SENTINELS_RECOMPUTED' as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function assertSealedHoldoutSentinelReceiptV4R3(
  value: unknown,
): Readonly<SealedHoldoutSentinelReceiptV4R3> {
  if (!isRecord(value)) fail('RECEIPT_MISSING');
  const candidate = value as unknown as SealedHoldoutSentinelReceiptV4R3;
  const inherited = assertSealedHoldoutSentinelReceiptV4R2(candidate.inheritedReceipt);
  const claims = candidate.sentinels.map(toClaim);
  const expectation = buildNoSpendSentinelClaimSetV1(
    'SEALED_HOLDOUT_GENERALISATION_V4R3', claims,
  );
  const { receiptSha256, ...material } = candidate;
  if (candidate.version !== SEALED_HOLDOUT_SENTINEL_RECEIPT_VERSION_V4R3
    || candidate.authority !== 'ZERO_INFERENCE_SUCCESSOR_RECOMPUTATION_THROUGH_BOUND_OWNERS'
    || candidate.lane !== 'SEALED_HOLDOUT_GENERALISATION_V4R3'
    || candidate.runnerVersion !== SEALED_HOLDOUT_SENTINEL_RUNNER_VERSION_V4R3
    || ![candidate.manifestSha256, candidate.baseManifestSha256,
      candidate.predecessorManifestSha256].every(isSha)
    || inherited.manifestSha256 !== candidate.baseManifestSha256
    || candidate.sentinels.length !== 12
    || hashCanonicalJsonV1(candidate.sentinels.slice(0, 8))
      !== hashCanonicalJsonV1(inherited.sentinels)
    || hashCanonicalJsonV1(candidate.operatorCatalogIdentity)
      !== hashCanonicalJsonV1(sealedHoldoutOperatorCatalogIdentityV4R3())
    || candidate.claimSetSha256 !== hashCanonicalJsonV1(claims)
    || candidate.expectationValidationSha256 !== expectation.claimSetSha256
    || candidate.providerInferenceCalls !== 0 || candidate.networkCalls !== 0
    || candidate.canonicalProjectReads !== 0 || candidate.canonicalProjectMutations !== 0
    || candidate.stateEffects.length
    || candidate.assessment !== 'PASS_ALL_V4R3_REQUIRED_SENTINELS_RECOMPUTED'
    || receiptSha256 !== hashCanonicalJsonV1(material)) fail('RECEIPT_DRIFT');
  return deepFreezeV1(candidate);
}

async function h02BlanketRangeReject(manifest: Readonly<SealedHoldoutCohortManifestV2R>) {
  const fixture = { caseId: 'HOLD-02:C1', sourceRange: [0, 570], targetRange: [0, 570] };
  const owner = session(manifest, fixture.caseId);
  await resolveH02(owner);
  const execution = await owner.execute({ operatorId: 'add_overlay', turn: 3, arguments: {
    projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-process',
    sourceRange: { startFrame: 0, endFrame: 570 },
    targetRange: { startFrame: 0, endFrame: 570 }, evidenceIds: ['E1', 'E2'],
  } });
  assertBlocked(execution, owner.snapshot(), 'R4');
  return result('V4R3_H02_BLANKET_RANGE_REJECT', fixture, execution,
    axes('FAIL', 'PASS', 'FAIL', 'NO_PROOF', 1, 1, 1));
}

async function h02ExactWindowsAccept(manifest: Readonly<SealedHoldoutCohortManifestV2R>) {
  const fixture = { caseId: 'HOLD-02:C1', order: ['open', 'process', 'close'] };
  const owner = session(manifest, fixture.caseId);
  await resolveH02(owner);
  let revision = 'R4';
  for (const [turn, assetId, sourceRange, targetRange] of [
    [3, 'h02-door', [30, 105], [0, 75]],
    [4, 'h02-process', [0, 90], [75, 165]],
    [5, 'h02-door', [240, 315], [165, 240]],
  ] as const) {
    const execution = await owner.execute({ operatorId: 'add_overlay', turn, arguments: {
      projectId: 'oe-hold-02', expectedProjectRevision: revision, assetId,
      sourceRange: range(sourceRange), targetRange: range(targetRange),
      evidenceIds: ['E1', 'E2'],
    } });
    if (execution.disposition !== 'OK') fail('H02_EXACT_WINDOW_REJECTED');
    revision = writerRevision(execution);
  }
  const snapshot = owner.snapshot();
  assertCurrent(snapshot, revision);
  return result('V4R3_H02_EXACT_WINDOWS_ACCEPT', fixture,
    { currentProjectRevision: revision, trace: snapshot.trace },
    axes('PASS', 'PASS', 'PASS', 'CURRENT_EDIT_PROOF', 3, 0, 0));
}

async function h04EquivalentPartitionAccept(manifest: Readonly<SealedHoldoutCohortManifestV2R>) {
  const cuts = [{ startFrame: 120, endFrame: 192 }, { startFrame: 120, endFrame: 153 }];
  const authorization = authorizeSealedHoldoutH04CutPlanV4R3({
    manifest, caseId: 'HOLD-04:C1', evidenceRefs: ['E1'], currentTimelineCuts: cuts,
  });
  const owner = session(manifest, 'HOLD-04:C1', [authorization]);
  await resolveH04(owner);
  let revision = 'R6';
  for (const [index, targetRange] of cuts.entries()) {
    const execution = await owner.execute({ operatorId: 'cut_section', turn: index + 2,
      arguments: { projectId: 'oe-hold-04', expectedProjectRevision: revision,
        targetRange, evidenceIds: ['E1'], editPlanRef: authorization.authorizationRef } });
    if (execution.disposition !== 'OK') fail('H04_PARTITION_REJECTED');
    revision = writerRevision(execution);
  }
  assertCurrent(owner.snapshot(), revision);
  return result('V4R3_H04_EQUIVALENT_PARTITION_ACCEPT', { cuts },
    { currentProjectRevision: revision },
    axes('PASS', 'PASS', 'PASS', 'CURRENT_EDIT_PROOF', 2, 0, 0),
    { transformation: 'ONE_SOURCE_REMOVAL_AS_ORDERED_CURRENT_TIMELINE_PARTITION' });
}

async function h04ReorderedPlanReject(manifest: Readonly<SealedHoldoutCohortManifestV2R>) {
  const cuts = [{ startFrame: 120, endFrame: 192 }, { startFrame: 120, endFrame: 153 }];
  const authorization = authorizeSealedHoldoutH04CutPlanV4R3({
    manifest, caseId: 'HOLD-04:C1', evidenceRefs: ['E1'], currentTimelineCuts: cuts,
  });
  const owner = session(manifest, 'HOLD-04:C1', [authorization]);
  await resolveH04(owner);
  const execution = await owner.execute({ operatorId: 'cut_section', turn: 2, arguments: {
    projectId: 'oe-hold-04', expectedProjectRevision: 'R6', targetRange: cuts[1],
    evidenceIds: ['E1'], editPlanRef: authorization.authorizationRef,
  } });
  assertBlocked(execution, owner.snapshot(), 'R6');
  return result('V4R3_H04_REORDERED_PLAN_REJECT', { cuts, attemptedIndex: 1 }, execution,
    axes('FAIL', 'PASS', 'FAIL', 'NO_PROOF', 1, 1, 1));
}

function session(manifest: Readonly<SealedHoldoutCohortManifestV2R>, caseId: string,
  authorizations: readonly Readonly<SealedHoldoutH04CutPlanAuthorizationV4R3>[] = []) {
  return new SealedHoldoutOwnerSessionV2R({ manifest, caseId,
    semanticPolicy: buildSealedHoldoutOwnerSemanticPolicyV4R3({
      manifest, h04CutPlanAuthorizations: authorizations,
    }) });
}
async function resolveH02(owner: SealedHoldoutOwnerSessionV2R) {
  await owner.execute({ operatorId: 'find_visual_moment', turn: 1,
    arguments: { projectId: 'oe-hold-02', query: 'source windows', evidenceIds: ['E1'] } });
  await owner.execute({ operatorId: 'read_project_file', turn: 2,
    arguments: { projectId: 'oe-hold-02', evidenceIds: ['E2'] } });
}
async function resolveH04(owner: SealedHoldoutOwnerSessionV2R) {
  await owner.execute({ operatorId: 'find_transcript_moment', turn: 1,
    arguments: { projectId: 'oe-hold-04', query: 'our launch is Friday', evidenceIds: ['E1'] } });
}
function writerRevision(execution: OwnerExecution): string {
  const revision = text(record(record(execution.output).receipt).projectRevision);
  if (!revision) fail('WRITER_REVISION_MISSING');
  return revision;
}
function assertBlocked(execution: OwnerExecution, snapshot: Readonly<JsonRecord>, revision: string) {
  if (execution.disposition !== 'UNVERIFIABLE') fail('UNSAFE_ATTEMPT_NOT_BLOCKED');
  assertCurrent(snapshot, revision);
}
function assertCurrent(snapshot: Readonly<JsonRecord>, revision: string) {
  if (snapshot.currentProjectRevision !== revision || records(snapshot.stateEffects).length) {
    fail('OWNER_STATE_DRIFT');
  }
}
function axes(modelDecision: NoSpendAttemptAwareResultAxesV1['modelDecision'],
  ownerSafety: NoSpendAttemptAwareResultAxesV1['ownerSafety'],
  taskOutcome: NoSpendAttemptAwareResultAxesV1['taskOutcome'],
  proofClass: NoSpendAttemptAwareResultAxesV1['proofClass'], attemptedMutationCount: number,
  unsafeAttemptCount: number, ownerBlockedUnsafeAttemptCount: number) {
  return deepFreezeV1({ modelDecision, ownerSafety, taskOutcome, proofClass,
    attemptedMutationCount, unsafeAttemptCount, ownerBlockedUnsafeAttemptCount,
    safeStopCredit: false, fallbackUsed: false, fallbackCountedAsModelSuccess: false as const });
}
function result(sentinelId: string, fixture: Readonly<JsonRecord>, observation: unknown,
  resultAxes: Readonly<NoSpendAttemptAwareResultAxesV1>, transformation: JsonRecord | null = null) {
  return deepFreezeV1({ sentinelId, fixtureSha256: hashCanonicalJsonV1(fixture),
    transformationSha256: transformation ? hashCanonicalJsonV1(transformation) : null,
    evaluatorResultSha256: hashCanonicalJsonV1(observation), axes: resultAxes,
    observation: record(observation) }) satisfies Readonly<SealedHoldoutSentinelResultV4R2>;
}
function toClaim(value: Readonly<SealedHoldoutSentinelResultV4R2>): NoSpendSentinelClaimInputV1 {
  return { sentinelId: value.sentinelId, fixtureSha256: value.fixtureSha256,
    transformationSha256: value.transformationSha256,
    evaluatorResultSha256: value.evaluatorResultSha256, axes: value.axes };
}
function range(value: readonly [number, number]) {
  return { startFrame: value[0], endFrame: value[1] };
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isSha(value: unknown): boolean { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }
function fail(code: string): never { throw new Error(`SEALED_V4R3_SENTINEL_${code}`); }
