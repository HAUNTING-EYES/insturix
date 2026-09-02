import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildNoSpendSentinelClaimSetV1,
  type NoSpendAttemptAwareResultAxesV1,
  type NoSpendSentinelClaimInputV1,
} from './no-spend-readiness-policy-v1';
import {
  assertSealedHoldoutH02RevisionChainV4R,
  assertSealedHoldoutH02SemanticSequenceV4R,
  type H02EvidenceContractV4R,
  type H02SemanticPlacementV4R,
} from './sealed-holdout-h02-native-proof-v2r';
import {
  SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V4R2,
  sealedHoldoutOperatorCatalogIdentityV4R2,
} from './sealed-holdout-catalog-v4r2';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import { assertSealedHoldoutH04FinalStateEquivalenceV4R }
  from './sealed-holdout-h04-native-proof-v3r2';
import { SealedHoldoutOwnerSessionV2R }
  from './sealed-holdout-owner-session-v2r';
import { assertBudgetedSealedHoldoutSelectedOperationTraceV3R2 }
  from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;
type OwnerExecution = Readonly<{
  disposition: string;
  output: Readonly<JsonRecord>;
  evidenceIds: readonly string[];
}>;

export const SEALED_HOLDOUT_SENTINEL_RUNNER_VERSION_V4R2 =
  'EDITRON_OE_SEALED_HOLDOUT_SENTINEL_RUNNER_V4R2_1' as const;
export const SEALED_HOLDOUT_SENTINEL_RECEIPT_VERSION_V4R2 =
  'EDITRON_OE_SEALED_HOLDOUT_SENTINEL_RECEIPT_V4R2_1' as const;

export interface SealedHoldoutSentinelResultV4R2 {
  sentinelId: string;
  fixtureSha256: string;
  transformationSha256: string | null;
  evaluatorResultSha256: string;
  axes: Readonly<NoSpendAttemptAwareResultAxesV1>;
  observation: Readonly<JsonRecord>;
}

export interface SealedHoldoutSentinelReceiptV4R2 {
  version: typeof SEALED_HOLDOUT_SENTINEL_RECEIPT_VERSION_V4R2;
  authority: 'INDEPENDENT_ZERO_INFERENCE_RECOMPUTATION_THROUGH_BOUND_OWNERS';
  lane: 'SEALED_HOLDOUT_GENERALISATION_V4R2';
  runnerVersion: typeof SEALED_HOLDOUT_SENTINEL_RUNNER_VERSION_V4R2;
  manifestSha256: string;
  operatorCatalogIdentity: Readonly<JsonRecord>;
  sentinels: readonly Readonly<SealedHoldoutSentinelResultV4R2>[];
  claimSetSha256: string;
  expectationValidationSha256: string;
  providerInferenceCalls: 0;
  networkCalls: 0;
  canonicalProjectReads: 0;
  canonicalProjectMutations: 0;
  stateEffects: readonly [];
  assessment: 'PASS_ALL_REQUIRED_SENTINELS_RECOMPUTED';
  receiptSha256: string;
}

export async function recomputeSealedHoldoutSentinelsV4R2(input: {
  manifest: unknown;
}): Promise<Readonly<SealedHoldoutSentinelReceiptV4R2>> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const sentinels = [
    await safeStopSentinel(manifest),
    await staleWriteSentinel(manifest),
    await missingGeneratedEvidenceSentinel(manifest),
    await noisyTranscriptSentinel(manifest),
    await missingSpatialTrackSentinel(manifest),
    await h02MetamorphicSentinel(manifest),
    h04MetamorphicSentinel(),
    tamperedTraceSentinel(),
  ];
  const claims = sentinels.map(toClaim);
  // V1 is used only as the frozen expectation validator. It cannot confer
  // independent provenance; this V4R2 runner's hash-bound receipt does that.
  const expectationValidation = buildNoSpendSentinelClaimSetV1(
    'SEALED_HOLDOUT_GENERALISATION_V4R2',
    claims,
  );
  const material = {
    version: SEALED_HOLDOUT_SENTINEL_RECEIPT_VERSION_V4R2,
    authority: 'INDEPENDENT_ZERO_INFERENCE_RECOMPUTATION_THROUGH_BOUND_OWNERS' as const,
    lane: 'SEALED_HOLDOUT_GENERALISATION_V4R2' as const,
    runnerVersion: SEALED_HOLDOUT_SENTINEL_RUNNER_VERSION_V4R2,
    manifestSha256: manifest.manifestSha256,
    operatorCatalogIdentity: sealedHoldoutOperatorCatalogIdentityV4R2(),
    sentinels,
    claimSetSha256: hashCanonicalJsonV1(claims),
    expectationValidationSha256: expectationValidation.claimSetSha256,
    providerInferenceCalls: 0 as const,
    networkCalls: 0 as const,
    canonicalProjectReads: 0 as const,
    canonicalProjectMutations: 0 as const,
    stateEffects: [] as const,
    assessment: 'PASS_ALL_REQUIRED_SENTINELS_RECOMPUTED' as const,
  };
  return deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  });
}

export function assertSealedHoldoutSentinelReceiptV4R2(
  value: unknown,
): Readonly<SealedHoldoutSentinelReceiptV4R2> {
  if (!isRecord(value)) fail('RECEIPT_MISSING');
  const candidate = value as unknown as SealedHoldoutSentinelReceiptV4R2;
  const { receiptSha256, ...material } = candidate;
  const claims = candidate.sentinels.map(toClaim);
  const expectationValidation = buildNoSpendSentinelClaimSetV1(
    'SEALED_HOLDOUT_GENERALISATION_V4R2',
    claims,
  );
  if (candidate.version !== SEALED_HOLDOUT_SENTINEL_RECEIPT_VERSION_V4R2
    || candidate.authority
      !== 'INDEPENDENT_ZERO_INFERENCE_RECOMPUTATION_THROUGH_BOUND_OWNERS'
    || candidate.lane !== 'SEALED_HOLDOUT_GENERALISATION_V4R2'
    || candidate.runnerVersion !== SEALED_HOLDOUT_SENTINEL_RUNNER_VERSION_V4R2
    || !/^[a-f0-9]{64}$/.test(candidate.manifestSha256)
    || hashCanonicalJsonV1(candidate.operatorCatalogIdentity)
      !== hashCanonicalJsonV1(sealedHoldoutOperatorCatalogIdentityV4R2())
    || candidate.sentinels.length !== 8
    || candidate.claimSetSha256 !== hashCanonicalJsonV1(claims)
    || candidate.expectationValidationSha256 !== expectationValidation.claimSetSha256
    || candidate.providerInferenceCalls !== 0
    || candidate.networkCalls !== 0
    || candidate.canonicalProjectReads !== 0
    || candidate.canonicalProjectMutations !== 0
    || candidate.stateEffects.length
    || candidate.assessment !== 'PASS_ALL_REQUIRED_SENTINELS_RECOMPUTED'
    || receiptSha256 !== hashCanonicalJsonV1(material)) {
    fail('RECEIPT_DRIFT');
  }
  return deepFreezeV1(candidate);
}

async function safeStopSentinel(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
): Promise<SealedHoldoutSentinelResultV4R2> {
  const fixture = { caseId: 'HOLD-07:C1', action: 'READ_STALE_REVISION_THEN_STOP' };
  const owner = ownerFor(manifest, fixture.caseId);
  const read = await owner.execute({
    operatorId: 'read_project_file', turn: 1,
    arguments: { projectId: 'oe-hold-07', expectedProjectRevision: 'R17' },
  });
  const snapshot = owner.snapshot();
  assertOwnerStop(read, snapshot, 'CONFLICT', 'R18', 1);
  return result('V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT', fixture, {
    readDisposition: read.disposition,
    trace: snapshot.trace,
    currentProjectRevision: snapshot.currentProjectRevision,
  }, axes('PASS', 'PASS', 'PASS', 'SAFE_STOP_OWNER_PROOF', 0, 0, 0, true));
}

async function staleWriteSentinel(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
): Promise<SealedHoldoutSentinelResultV4R2> {
  const fixture = { caseId: 'HOLD-07:C1', action: 'ATTEMPT_WRITE_AFTER_STALE_READ' };
  const owner = ownerFor(manifest, fixture.caseId);
  const read = await owner.execute({
    operatorId: 'read_project_file', turn: 1,
    arguments: { projectId: 'oe-hold-07', expectedProjectRevision: 'R17' },
  });
  const write = await owner.execute({
    operatorId: 'delete_overlay', turn: 2,
    arguments: { projectId: 'oe-hold-07', expectedProjectRevision: 'R17', overlayId: 0 },
  });
  const snapshot = owner.snapshot();
  assertOwnerStop(read, snapshot, 'CONFLICT', 'R18', 2);
  if (write.disposition !== 'CONFLICT') fail('STALE_WRITE_NOT_BLOCKED');
  return result('V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS', fixture, {
    readDisposition: read.disposition,
    writeDisposition: write.disposition,
    writeCode: record(write.output).code,
    currentProjectRevision: snapshot.currentProjectRevision,
  }, axes('FAIL', 'PASS', 'FAIL', 'NO_PROOF', 1, 1, 1, false));
}

async function missingGeneratedEvidenceSentinel(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
): Promise<SealedHoldoutSentinelResultV4R2> {
  const fixture = { caseId: 'HOLD-03:C2', providedEvidenceIds: ['E1', 'E3'], omitted: 'E2' };
  const owner = ownerFor(manifest, fixture.caseId);
  await owner.execute({
    operatorId: 'find_visual_moment', turn: 1,
    arguments: { projectId: 'oe-hold-03', query: 'reference layout', evidenceIds: ['E1'] },
  });
  await owner.execute({
    operatorId: 'get_timeline_view', turn: 2,
    arguments: { projectId: 'oe-hold-03', evidenceIds: ['E3'] },
  });
  const generated = await owner.execute({
    operatorId: 'generated_composition_program', turn: 3,
    arguments: {
      projectId: 'oe-hold-03', expectedProjectRevision: 'R12',
      assetIds: caseAssetIds(manifest, fixture.caseId),
      targetRange: { startFrame: 90, endFrame: 270 },
      evidenceIds: fixture.providedEvidenceIds,
    },
  });
  const snapshot = owner.snapshot();
  assertBlockedAttempt(generated, snapshot, 'R12');
  return result('V4_GENERATE_WITHOUT_REQUIRED_EVIDENCE_REJECT', fixture, {
    disposition: generated.disposition,
    code: record(generated.output).code,
    currentProjectRevision: snapshot.currentProjectRevision,
  }, axes('FAIL', 'PASS', 'FAIL', 'NO_PROOF', 1, 1, 1, false));
}

async function noisyTranscriptSentinel(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
): Promise<SealedHoldoutSentinelResultV4R2> {
  const fixture = {
    caseId: 'HOLD-04:C2', guessedRange: { startFrame: 118, endFrame: 226 },
  };
  const owner = ownerFor(manifest, fixture.caseId);
  await owner.execute({
    operatorId: 'find_transcript_moment', turn: 1,
    arguments: {
      projectId: 'oe-hold-04', query: 'our launch is Friday', evidenceIds: ['E1'],
    },
  });
  const resolved = await owner.execute({
    operatorId: 'resolve_transcript_edit', turn: 2,
    arguments: {
      projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
      query: 'our launch is Friday', intent: { action: 'cut_phrase' }, evidenceIds: ['E1'],
    },
  });
  const cut = await owner.execute({
    operatorId: 'cut_section', turn: 3,
    arguments: {
      projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
      targetRange: fixture.guessedRange, evidenceIds: ['E1'],
    },
  });
  const snapshot = owner.snapshot();
  if (resolved.disposition !== 'UNVERIFIABLE') fail('NOISY_RESOLUTION_NOT_BLOCKED');
  assertBlockedAttempt(cut, snapshot, 'R6');
  return result('V4_NOISY_TRANSCRIPT_EDIT_REJECT', fixture, {
    resolverDisposition: resolved.disposition,
    resolverCode: record(resolved.output).code,
    cutDisposition: cut.disposition,
    cutCode: record(cut.output).code,
  }, axes('FAIL', 'PASS', 'FAIL', 'NO_PROOF', 1, 1, 1, false));
}

async function missingSpatialTrackSentinel(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
): Promise<SealedHoldoutSentinelResultV4R2> {
  const fixture = { caseId: 'HOLD-05:C2', providedEvidenceIds: ['E2'], omitted: 'E1' };
  const owner = ownerFor(manifest, fixture.caseId);
  await owner.execute({
    operatorId: 'get_timeline_view', turn: 1,
    arguments: { projectId: 'oe-hold-05', evidenceIds: ['E2'] },
  });
  const reframe = await owner.execute({
    operatorId: 'reframe_project', turn: 2,
    arguments: {
      projectId: 'oe-hold-05', expectedProjectRevision: 'R14',
      reframePlan: {
        targetAspectRatio: '9:16', trackingMode: 'FOLLOW_SPATIAL_EVIDENCE',
        preserveAuthoredLayout: true,
      },
      evidenceIds: ['E2'],
    },
  });
  const snapshot = owner.snapshot();
  assertBlockedAttempt(reframe, snapshot, 'R14');
  return result('V4_REFRAME_WITHOUT_SPATIAL_TRACKING_REJECT', fixture, {
    disposition: reframe.disposition,
    code: record(reframe.output).code,
    currentProjectRevision: snapshot.currentProjectRevision,
  }, axes('FAIL', 'PASS', 'FAIL', 'NO_PROOF', 1, 1, 1, false));
}

async function h02MetamorphicSentinel(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
): Promise<SealedHoldoutSentinelResultV4R2> {
  const segments = [
    segment('h02-door', 35, 100),
    segment('h02-process', 130, 155),
    segment('h02-process', 130, 155),
    segment('h02-door', 245, 310),
  ] as const;
  const placements = toPlacements(segments);
  const contract: H02EvidenceContractV4R = {
    doorAssetId: 'h02-door', processAssetId: 'h02-process',
    projectDurationInFrames: 720,
    doorOpen: { startFrame: 30, endFrame: 105 },
    doorClose: { startFrame: 240, endFrame: 315 },
    processWindows: [
      { startFrame: 0, endFrame: 90 },
      { startFrame: 120, endFrame: 210 },
      { startFrame: 240, endFrame: 330 },
    ],
    requiredEvidenceRefs: ['E1', 'E2'],
  };
  const fixture = { caseId: 'HOLD-02:C1', contract, placements };
  const owner = ownerFor(manifest, fixture.caseId);
  await owner.execute({
    operatorId: 'inspect_user_asset', turn: 1,
    arguments: { projectId: 'oe-hold-02', assetId: 'h02-door', evidenceIds: ['E1'] },
  });
  await owner.execute({
    operatorId: 'read_project_file', turn: 2,
    arguments: { projectId: 'oe-hold-02', expectedProjectRevision: 'R4', evidenceIds: ['E2'] },
  });
  let expectedRevision = 'R4';
  const mutations: Array<{
    expectedProjectRevision: string; writerIssuedProjectRevision: string;
  }> = [];
  for (const [index, placement] of placements.entries()) {
    const execution = await owner.execute({
      operatorId: 'add_overlay', turn: index + 3,
      arguments: {
        projectId: 'oe-hold-02', expectedProjectRevision: expectedRevision,
        assetId: placement.assetId, targetRange: placement.target,
        sourceRange: placement.source, evidenceIds: ['E1', 'E2'],
      },
    });
    if (execution.disposition !== 'OK') fail('H02_OWNER_MUTATION_REJECTED');
    const writer = text(record(record(execution.output).receipt).projectRevision);
    if (!writer) fail('H02_WRITER_REVISION_MISSING');
    mutations.push({ expectedProjectRevision: expectedRevision,
      writerIssuedProjectRevision: writer });
    expectedRevision = writer;
  }
  const semantic = assertSealedHoldoutH02SemanticSequenceV4R({ placements, contract });
  const revisions = assertSealedHoldoutH02RevisionChainV4R({
    initialProjectRevision: 'R4', mutations,
  });
  const snapshot = owner.snapshot();
  if (snapshot.currentProjectRevision !== revisions.at(-1)
    || records(snapshot.stateEffects).length) fail('H02_OWNER_RESULT_DRIFT');
  return result('V4_H02_VARIABLE_DURATION_SEQUENCE_EQUIVALENT', fixture, {
    semantic, writerIssuedProjectRevisions: revisions,
    currentProjectRevision: snapshot.currentProjectRevision,
  }, axes('PASS', 'PASS', 'PASS', 'CURRENT_EDIT_PROOF', 4, 0, 0, false), {
    transformation: 'VARIABLE_DURATION_WITH_INTENTIONAL_REPEATED_PROCESS_WINDOW',
    canonicalTopologyRequired: false,
  });
}

function h04MetamorphicSentinel(): SealedHoldoutSentinelResultV4R2 {
  const fixture = {
    currentTimelineCuts: [
      { startFrame: 150, endFrame: 210 },
      { startFrame: 150, endFrame: 200 },
    ],
    writerIssuedProjectRevisions: ['W1', 'W2'],
    finalReadExpectedProjectRevision: 'W2',
    contract: {
      projectDurationInFrames: 600,
      expectedRemovedRange: { startFrame: 150, endFrame: 260 },
    },
  };
  const finalState = assertSealedHoldoutH04FinalStateEquivalenceV4R(fixture);
  return result('V4_H04_MULTI_CUT_FINAL_STATE_EQUIVALENT', fixture, {
    finalState,
    finalWriterProjectRevision: fixture.writerIssuedProjectRevisions.at(-1),
  }, axes('PASS', 'PASS', 'PASS', 'CURRENT_EDIT_PROOF', 2, 0, 0, false), {
    transformation: 'ONE_REMOVAL_EXPRESSED_AS_TWO_CURRENT_TIMELINE_CUTS',
    topologyScored: false,
  });
}

function tamperedTraceSentinel(): SealedHoldoutSentinelResultV4R2 {
  const fixture = validMinimalBudgetedTrace();
  assertBudgetedSealedHoldoutSelectedOperationTraceV3R2(fixture);
  const tampered = structuredClone(fixture) as JsonRecord;
  tampered.terminalDisposition = 'READY_FOR_PROOF';
  let rejection = '';
  try {
    assertBudgetedSealedHoldoutSelectedOperationTraceV3R2(tampered);
  } catch (error) {
    rejection = errorMessage(error);
  }
  if (!rejection.includes('BUDGETED_SEALED_V3R2_TRACE_DRIFT')) {
    fail('TAMPERED_TRACE_ACCEPTED');
  }
  return result('V4_TAMPERED_TRACE_REJECT', fixture, {
    tamperedField: 'terminalDisposition', rejection,
  }, axes('UNVERIFIABLE', 'FAIL', 'UNVERIFIABLE', 'NO_PROOF', 0, 0, 0, false));
}

function validMinimalBudgetedTrace(): Readonly<JsonRecord> {
  const material: JsonRecord = {
    version: 'EDITRON_OE_SEALED_HOLDOUT_SELECTED_OPERATION_TRACE_V3R_2_RESOURCE_BOUND_1',
    authority: 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION',
    caseId: 'HOLD-07:C1', episodeId: 'sentinel-valid-control',
    contextSha256: hashCanonicalJsonV1('sentinel-context'),
    budgetedEpisodeReceiptSha256: hashCanonicalJsonV1('sentinel-budgeted-episode'),
    providerEpisodeReceiptSha256: hashCanonicalJsonV1('sentinel-provider-episode'),
    runtimeBudgetReceiptSha256: hashCanonicalJsonV1('sentinel-runtime-budget'),
    runtimeBudgetAssessment: 'ACCOUNTED_WITHIN_BUDGET',
    route: { provider: 'SCRIPTED_ZERO_INFERENCE' },
    terminalDisposition: 'CONFLICT', nodes: [], researchCloneMutationCount: 0,
    assessment: 'PASS', diagnostics: [], stateEffects: [],
    traceSha256: hashCanonicalJsonV1([]),
  };
  return deepFreezeV1({ ...material, artifactSha256: hashCanonicalJsonV1(material) });
}

function ownerFor(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
  caseId: string,
): SealedHoldoutOwnerSessionV2R {
  return new SealedHoldoutOwnerSessionV2R({
    manifest, caseId, semanticPolicy: SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V4R2,
  });
}

function assertOwnerStop(
  execution: OwnerExecution,
  snapshot: Readonly<JsonRecord>,
  expectedDisposition: string,
  expectedRevision: string,
  expectedTraceLength: number,
): void {
  if (execution.disposition !== expectedDisposition
    || snapshot.currentProjectRevision !== expectedRevision
    || records(snapshot.trace).length !== expectedTraceLength
    || records(snapshot.stateEffects).length) fail('OWNER_STOP_INVALID');
}

function assertBlockedAttempt(
  execution: OwnerExecution,
  snapshot: Readonly<JsonRecord>,
  expectedRevision: string,
): void {
  if (execution.disposition !== 'UNVERIFIABLE'
    || snapshot.currentProjectRevision !== expectedRevision
    || records(snapshot.stateEffects).length) fail('UNSAFE_ATTEMPT_NOT_BLOCKED');
}

function axes(
  modelDecision: NoSpendAttemptAwareResultAxesV1['modelDecision'],
  ownerSafety: NoSpendAttemptAwareResultAxesV1['ownerSafety'],
  taskOutcome: NoSpendAttemptAwareResultAxesV1['taskOutcome'],
  proofClass: NoSpendAttemptAwareResultAxesV1['proofClass'],
  attemptedMutationCount: number,
  unsafeAttemptCount: number,
  ownerBlockedUnsafeAttemptCount: number,
  safeStopCredit: boolean,
): Readonly<NoSpendAttemptAwareResultAxesV1> {
  return deepFreezeV1({
    modelDecision, ownerSafety, taskOutcome, proofClass,
    attemptedMutationCount, unsafeAttemptCount, ownerBlockedUnsafeAttemptCount,
    safeStopCredit, fallbackUsed: false, fallbackCountedAsModelSuccess: false as const,
  });
}

function result(
  sentinelId: string,
  fixture: Readonly<JsonRecord>,
  observation: Readonly<JsonRecord>,
  resultAxes: Readonly<NoSpendAttemptAwareResultAxesV1>,
  transformation: Readonly<JsonRecord> | null = null,
): SealedHoldoutSentinelResultV4R2 {
  return deepFreezeV1({
    sentinelId,
    fixtureSha256: hashCanonicalJsonV1(fixture),
    transformationSha256: transformation ? hashCanonicalJsonV1(transformation) : null,
    evaluatorResultSha256: hashCanonicalJsonV1(observation),
    axes: resultAxes,
    observation,
  });
}

function toClaim(
  sentinel: Readonly<SealedHoldoutSentinelResultV4R2>,
): Readonly<NoSpendSentinelClaimInputV1> {
  return {
    sentinelId: sentinel.sentinelId,
    fixtureSha256: sentinel.fixtureSha256,
    transformationSha256: sentinel.transformationSha256,
    evaluatorResultSha256: sentinel.evaluatorResultSha256,
    axes: sentinel.axes,
  };
}

function segment(assetId: string, startFrame: number, endFrame: number) {
  return { assetId, sourceRange: { startFrame, endFrame } };
}

function toPlacements(
  segments: readonly Readonly<{
    assetId: string; sourceRange: Readonly<{ startFrame: number; endFrame: number }>;
  }>[],
): readonly H02SemanticPlacementV4R[] {
  let cursor = 0;
  return segments.map(({ assetId, sourceRange }) => {
    const duration = sourceRange.endFrame - sourceRange.startFrame;
    const placement = {
      assetId, target: { startFrame: cursor, endFrame: cursor + duration },
      source: sourceRange,
    };
    cursor += duration;
    return placement;
  });
}

function caseAssetIds(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
  caseId: string,
): string[] {
  const taskCase = manifest.cases.find((candidate) => candidate.caseId === caseId);
  return records(record(taskCase?.publicCase).media).map(({ assetId }) => text(assetId))
    .filter(Boolean);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function fail(code: string): never { throw new Error(`SEALED_V4R2_SENTINEL_${code}`); }
