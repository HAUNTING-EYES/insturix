import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildRhc03GeneratedCompositionFixtureV1 }
  from '@/tests/fixtures/editron/open-ended-planner-v2/rhc03-generated-composition-fixture-v1';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { materializeGeneratedCompositionLocalEvidenceV1 }
  from './generated-composition-local-evidence-v1';
import { adaptGeneratedCompositionProgramToProjectDraftV1 }
  from './generated-composition-project-draft-adapter-v1';
import {
  buildGeneratedCompositionSandboxRequestV1,
  parseGeneratedCompositionSandboxWorkerResultV1,
  type GeneratedCompositionSandboxHostReceiptV1,
} from './generated-composition-sandbox-contract-v1';
import {
  executeGeneratedCompositionInSandboxV1,
  resolveGeneratedCompositionSandboxOverlayV1,
  type ExecuteGeneratedCompositionSandboxOptionsV1,
  type ExecuteGeneratedCompositionSandboxResultV1,
} from './generated-composition-sandbox-runner-v1';
import {
  executeStage25HybridAvMechanicsV1,
  type Stage25HybridAvMechanicsInputV1,
  type Stage25HybridAvMechanicsReceiptV1,
} from './stage25-hybrid-av-mechanics-v1';
import {
  buildStage25Rhc03PreviewCandidatesV1,
  identityFromMedia,
} from './stage25-rhc03-preview-candidates-v1';
import { materializeStage25Rhc03PreviewMediaFixtureV1 }
  from './stage25-rhc03-preview-media-fixture-v1';
import {
  evaluateStage25Rhc03RenderedVisualProofV1,
  STAGE25_RHC03_RENDERED_VISUAL_POLICY_V1,
  type Stage25Rhc03RenderedVisualProofReceiptV1,
} from './stage25-rhc03-rendered-visual-proof-v1';

type SandboxExecutorV1 = (
  options: ExecuteGeneratedCompositionSandboxOptionsV1,
) => Promise<ExecuteGeneratedCompositionSandboxResultV1>;
type MechanicsExecutorV1 = (
  input: Readonly<Stage25HybridAvMechanicsInputV1>,
) => Promise<Readonly<Stage25HybridAvMechanicsReceiptV1>>;
type VisualProofExecutorV1 = (
  input: Parameters<typeof evaluateStage25Rhc03RenderedVisualProofV1>[0],
) => Promise<Readonly<Stage25Rhc03RenderedVisualProofReceiptV1>>;

const FIXTURE_CREATED_AT = '2026-08-27T14:00:00.000Z';
const EXPECTED = deepFreezeV1({
  mediaReceiptSha256: 'f2492483016a37a33db52a7f7335097d7a4401921fb1edda34b08cc5533056bd',
  fixtureSha256: '155d6971bb231b5b74f2d7f2e2143fbb61342aff26afc234a02f7aaf9fa6f303',
  programSha256: '4f782d45f4b04c0c804c1d52093cf7598e7353ff457b40e7f735a5684cba825f',
  sourceBundleSha256: '17aa73433e470a138f3127b44b0e5e715cfe58e43e7e4011fdfa2b0513c4fc03',
  evidencePackSha256: '2892129064ce84b09233e1a04b3c400990a96555ff5012103a4ad61c03715355',
  referenceBlueprintSha256: '18a4d6b82584314ec6151e8f1dc95b8f0a19a36c4f70a6c4bc0ae53f48fd6d51',
  sourceRightsReceiptsSha256: '26add45e168e291d24788bd92764cd7bc7ed3e85fe7f0ce3cbfe31f50d6b756e',
  candidateReceiptSha256: '7d3fbd61d8bc3a9073eeece35b6e6829d1fd13decf6ede2ed215de58f8c00b31',
  routeSetSha256: '438b44318ef87bccc328df1d9a361d931e8033bc18c0d3044ceea3ecf7478e02',
  apiImplementationSha256: 'ee2468e25c67987e466abaee1e1ef18b0e7caa08c48875b8c52b66ee0382e4bc',
  workerImplementationSha256: '4d392654882a1b067dcf3b510add92c79b519a596e8e833ca75526f50922a79d',
  draftSha256: '90820c534856ff7e63e49eb5132d98c16903d4beffc57bfe594cfb07fa3df091',
  adapterReceiptSha256: 'b12cb13694bb3920ef2b3c6516822fbcbddbc5965fca314b3eb8a22b20a35f31',
  actionSha256: '7fe82cf9defe10ef19de428cd57592fc7cb0fd1070827ea3ca3a00f210b0bab2',
  authoredWideSha256: '50736634f83fb14bf6e63a80a2c1dc0824626f4f08f6f08febe23f9ceb50be7a',
  productionAudioFileSha256: '77b65f32b4a3233856b815014e3a2d4e5964436aacf698c5030615d4dd07c8c4',
  productionAudioPcmSha256: '5f8fcd3f3250277b8f9f94bd77a5802f58b1964114655d19e6b955ab6bf7ca94',
  fontSha256: 'd2a8188db7fdd567bbd94017cec0622373d47206d45281b7c501f0775cdee83a',
  sandboxSnapshotId: 'snap_FuRFrHL9WE4IgNXjhWjMxeWZP9mW',
  sandboxSnapshotCommit: 'eb896ffbd8927621a77c4bd4073dad2a1119876d',
  sandboxCapabilityPredecessorReceiptSha256:
    'a182c3a7eb29909e837ed8da515feb89ab9d0123497cf6e7b522e5f3b609d1c6',
  currentHashQualificationRequestId:
    '7f21a8af41bca785c4814f6744ccb192d81c71037d17ca5ea160e4ef834bfe7a',
  currentHashQualificationHostReceiptSha256:
    'e1426a7b83b3f1acb637a6c577641e87b6454c98873bdaefb6c3203439326c03',
});

export const STAGE25_RHC03_RENDERED_HYBRID_PROOF_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC03_RENDERED_HYBRID_PROOF_V1' as const;

export const STAGE25_RHC03_HYBRID_AV_CONTRACT_V1 = deepFreezeV1({
  taskId: 'RHC-03',
  artifactPrefix: 'rhc03',
  canvas: { width: 1920, height: 1080 },
  frameRate: { numerator: 30, denominator: 1 },
  nativeVisualFrameCount: 900,
  proofWindow: { startFrame: 420, endExclusiveFrame: 630 },
  targetRange: { startFrame: 450, endExclusiveFrame: 600 },
  generatedLocalRange: { startFrame: 0, endExclusiveFrame: 150 },
  audio: { sampleRate: 48_000, channels: 2 },
} as const);

export async function executeStage25Rhc03RenderedHybridProofV1(input: {
  outputDirectory: string;
  executionId: string;
  createdAt: string;
  sandboxEnvironment: Readonly<{ snapshotId: string; snapshotCommit: string }>;
  repoRoot?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  sandboxExecutor?: SandboxExecutorV1;
  mechanicsExecutor?: MechanicsExecutorV1;
  visualProofExecutor?: VisualProofExecutorV1;
}) {
  assertExecutionIdentity(input);
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const outputRoot = await createNewOutputDirectory(input.outputDirectory);
  const media = await materializeStage25Rhc03PreviewMediaFixtureV1({
    outputDir: path.resolve(outputRoot, 'media'),
    createdAt: FIXTURE_CREATED_AT,
  });
  const fixture = buildRhc03GeneratedCompositionFixtureV1(
    identityFromMedia(media),
  );
  const candidates = await buildStage25Rhc03PreviewCandidatesV1(media, {
    repoRoot,
  });
  const apiPath = path.resolve(
    repoRoot,
    'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx',
  );
  const [apiImplementationSha256, overlay, actionBytes, fontBytes] =
    await Promise.all([
      sha256File(apiPath),
      resolveGeneratedCompositionSandboxOverlayV1(repoRoot),
      readRegular(media.hostPaths.assetPaths['rhc03-action-left']),
      readRegular(media.hostPaths.fontPath),
    ]);
  const adaptation = adaptGeneratedCompositionProgramToProjectDraftV1({
    verificationInput: fixture,
    sourceRightsReceipts: media.provenance,
    compositionId: 'rhc03-synchronized-dual-view',
    runtimeDigestSha256: apiImplementationSha256,
    generatorBinding: { kind: 'HUMAN_AUTHORED', authorId: 'rhc03-proposal-user' },
  });
  assertAcceptedIdentities({
    mediaReceiptSha256: media.receiptSha256,
    fixtureSha256: fixture.fixtureSha256,
    programSha256: hashCanonicalJsonV1(fixture.program),
    sourceBundleSha256: fixture.program.sourceBundleHash,
    evidencePackSha256: hashCanonicalJsonV1(fixture.evidencePack),
    referenceBlueprintSha256: hashCanonicalJsonV1(fixture.referenceBlueprint),
    sourceRightsReceiptsSha256: hashCanonicalJsonV1(media.provenance),
    candidateReceiptSha256: candidates.receiptSha256,
    routeSetSha256: candidates.routeSetSha256,
    apiImplementationSha256,
    workerImplementationSha256: overlay.workerImplementationHash,
    draftSha256: adaptation.binding.draftSha256,
    adapterReceiptSha256: adaptation.receipt.receiptSha256,
    actionSha256: assetSha(media.assets, 'rhc03-action-left'),
    authoredWideSha256: assetSha(media.assets, 'rhc03-authored-wide'),
    productionAudioFileSha256: assetSha(media.assets, 'rhc03-production-audio'),
    productionAudioPcmSha256: media.productionAudio.decodedPcmSha256,
    fontSha256: media.font.sha256,
  });
  const hybridRoute = candidates.routes.find(({ route }) => route === 'HYBRID');
  if (!hybridRoute || hybridRoute.disposition !== 'READY_FOR_RENDER'
    || hybridRoute.form.projectServiceDraftSha256 !== adaptation.binding.draftSha256
    || hybridRoute.form.projectServiceAdapterReceiptSha256
      !== adaptation.receipt.receiptSha256
    || candidates.runtimeDigestSha256 !== apiImplementationSha256) {
    fail('QUALIFIED_HYBRID_ROUTE_DRIFT');
  }

  const request = buildGeneratedCompositionSandboxRequestV1({
    executionId: input.executionId,
    createdAt: input.createdAt,
    appCommit: input.sandboxEnvironment.snapshotCommit,
    apiImplementationHash: apiImplementationSha256,
    workerImplementationHash: overlay.workerImplementationHash,
    program: fixture.program,
    sourceBundle: fixture.sourceBundle,
    evidencePack: fixture.evidencePack,
    referenceBlueprint: fixture.referenceBlueprint,
    supplementalFacts: fixture.supplementalFacts,
    proofFrames: STAGE25_RHC03_RENDERED_VISUAL_POLICY_V1.requiredFrames,
    inputs: [
      {
        kind: 'SOURCE_MEDIA',
        bindingId: 'rhc03-action-left',
        fileName: path.basename(media.hostPaths.assetPaths['rhc03-action-left']),
        bytes: actionBytes,
      },
      {
        kind: 'SOURCE_MEDIA',
        bindingId: 'rhc03-action-right',
        fileName: path.basename(media.hostPaths.assetPaths['rhc03-action-right']),
        bytes: actionBytes,
      },
      {
        kind: 'FONT',
        bindingId: 'rhc03-licensed-label',
        fileName: path.basename(media.hostPaths.fontPath),
        bytes: fontBytes,
      },
    ],
    resources: {
      wallTimeMs: Math.min(fixture.program.resourceBudget.maxWallTimeMs, 180_000),
      maxCpuMs: Math.min(fixture.program.resourceBudget.maxCpuMs, 120_000),
      vcpus: 1,
      memoryMiB: 2_048,
      maxOutputBytes: Math.min(
        fixture.program.resourceBudget.maxOutputBytes,
        64 * 1_024 * 1_024,
      ),
    },
  });
  const executeSandbox = input.sandboxExecutor
    ?? executeGeneratedCompositionInSandboxV1;
  const executed = await executeSandbox({
    request,
    repoRoot,
    env: {
      MG_RENDER_SANDBOX_SNAPSHOT_ID: input.sandboxEnvironment.snapshotId,
      MG_RENDER_SANDBOX_APP_COMMIT: input.sandboxEnvironment.snapshotCommit,
    },
  });
  const hostReceipt = assertSandboxExecution(
    request,
    executed,
    input.sandboxEnvironment.snapshotId,
  );
  const localEvidence = await materializeGeneratedCompositionLocalEvidenceV1({
    candidateRoot: outputRoot,
    workerResult: executed.workerResult,
    hostReceipt,
    outputBytes: executed.outputBytes,
  });
  const playable = onlyBinding(localEvidence.bindings, 'PLAYABLE_PROXY');
  const visualProof = await (
    input.visualProofExecutor ?? evaluateStage25Rhc03RenderedVisualProofV1
  )({
    proxyReceipt: localEvidence.localEvaluationReceipt,
    authoritativeProxyReceiptSha256: localEvidence.originalProxyReceiptHash,
    expectedProgramSha256: request.programHash,
    layoutContract: fixture.layoutContract,
  });
  const mechanics = await (
    input.mechanicsExecutor ?? executeStage25HybridAvMechanicsV1
  )({
    contract: STAGE25_RHC03_HYBRID_AV_CONTRACT_V1,
    nativeVisualPath: media.hostPaths.assetPaths['rhc03-authored-wide'],
    nativeVisualSha256: EXPECTED.authoredWideSha256,
    nativeAudioBaselinePath: media.hostPaths.productionAudioPath,
    nativeAudioBaselineFileSha256: EXPECTED.productionAudioFileSha256,
    nativeAudioBaselinePcmSha256: EXPECTED.productionAudioPcmSha256,
    generatedVisualPath: playable.localPath,
    generatedVisualSha256: playable.contentSha256,
    outputDirectory: path.resolve(outputRoot, 'hybrid'),
    ffmpegPath: input.ffmpegPath,
    ffprobePath: input.ffprobePath,
  });
  const { hostPaths: mechanicsHostPaths, ...portableMechanics } = mechanics;
  const synchronizationProof = assertSynchronizationBindings({
    fixture,
    request,
    actionSha256: EXPECTED.actionSha256,
    visualProof,
  });
  const controlArtifacts = await writeControlArtifacts(outputRoot, {
    request,
    workerResult: executed.workerResult,
    hostReceipt,
  });
  const portable = {
    version: STAGE25_RHC03_RENDERED_HYBRID_PROOF_VERSION_V1,
    artifactType: 'Stage25Rhc03RenderedHybridProofReceiptV1' as const,
    authority: 'RHC03_RESEARCH_SANDBOX_AND_NATIVE_AV_PROOF_NO_PROJECT_MUTATION' as const,
    taskId: 'RHC-03' as const,
    executionId: input.executionId,
    createdAt: input.createdAt,
    frozenTarget: {
      projectRange: fixture.handoffs.target,
      generatedLocalRange: STAGE25_RHC03_HYBRID_AV_CONTRACT_V1.generatedLocalRange,
      proofWindow: fixture.handoffs.proofWindow,
      returnFrame: {
        projectFrame: fixture.handoffs.exit.firstReturnProjectFrame,
        authoredWideSourceFrame:
          fixture.handoffs.exit.firstReturnAuthoredWideFrame,
      },
    },
    mediaEvidence: {
      mediaReceiptSha256: media.receiptSha256,
      sourceRepositorySha256: media.source.sha256,
      actionSha256: EXPECTED.actionSha256,
      authoredWideSha256: EXPECTED.authoredWideSha256,
      productionAudioFileSha256: EXPECTED.productionAudioFileSha256,
      productionAudioPcmSha256: EXPECTED.productionAudioPcmSha256,
      fontSha256: media.font.sha256,
      fontFamily: media.font.family,
      fontFace: media.font.face,
      fontWeight: media.font.weight,
      fontMetadataProof: media.font.metadataProof,
    },
    routeQualification: {
      candidateReceiptSha256: candidates.receiptSha256,
      routeSetSha256: candidates.routeSetSha256,
      selectedCandidateId: hybridRoute.candidateId,
      predecessorDisposition: hybridRoute.disposition,
    },
    generatedProgram: {
      programId: fixture.program.programId,
      programSha256: request.programHash,
      sourceBundleSha256: request.sourceBundleHash,
      evidencePackSha256: EXPECTED.evidencePackSha256,
      referenceBlueprintSha256: EXPECTED.referenceBlueprintSha256,
      sourceRightsReceiptsSha256: EXPECTED.sourceRightsReceiptsSha256,
      apiImplementationSha256,
      workerImplementationSha256: overlay.workerImplementationHash,
      exactLabel: 'SYNC' as const,
      sourceBindings: ['rhc03-action-left', 'rhc03-action-right'] as const,
      sandboxInputMediaKinds: ['VIDEO', 'VIDEO', 'FONT'] as const,
      nativeWideOrProductionAudioSentToSandbox: false as const,
    },
    projectServiceProjection: {
      draftSha256: adaptation.binding.draftSha256,
      adapterReceiptSha256: adaptation.receipt.receiptSha256,
      projectRange: adaptation.draft.placement.projectRange,
      compositionRange: adaptation.draft.placement.compositionRange,
      lifecycleStage: 'PENDING_PROPOSAL_ONLY' as const,
      canonicalMutationOwnerCalled: false as const,
    },
    sandboxProof: {
      qualification: {
        predecessorCapabilityReceiptSha256:
          EXPECTED.sandboxCapabilityPredecessorReceiptSha256,
        currentHashRequestId: EXPECTED.currentHashQualificationRequestId,
        currentHashHostReceiptSha256:
          EXPECTED.currentHashQualificationHostReceiptSha256,
        currentApiImplementationSha256: EXPECTED.apiImplementationSha256,
        currentWorkerImplementationSha256: EXPECTED.workerImplementationSha256,
      },
      requestId: request.requestId,
      requestSha256: hashCanonicalJsonV1(request),
      resultSha256: hashCanonicalJsonV1(executed.workerResult),
      hostReceiptSha256: hostReceipt.receiptHash,
      proxyReceiptSha256: hostReceipt.proxyReceiptHash,
      localizedEvidenceSha256: localEvidence.evidenceHash,
      snapshotId: hostReceipt.snapshotId,
      snapshotCommit: hostReceipt.appCommit,
      provider: hostReceipt.provider,
      networkPolicy: hostReceipt.networkPolicy,
      persistent: hostReceipt.persistent,
      sandboxDeleted: hostReceipt.sandboxDeleted,
      productionSandbox: hostReceipt.proof.productionSandbox,
      outputMaterialization: hostReceipt.proof.outputMaterialization,
      projectMutation: hostReceipt.proof.projectMutation,
    },
    synchronizationProof,
    renderedVisualProof: visualProof,
    hybridAvProof: portableMechanics,
    routeDisposition: {
      native: 'CAPABILITY_GAP_EXACT_PRODUCT_FONT_BINDING_UNPROVED' as const,
      generatedOnly:
        'CAPABILITY_GAP_PLAYABLE_NATIVE_AUDIO_OWNERSHIP_ABSENT' as const,
      hybrid: 'TECHNICAL_RENDER_PASS_HUMAN_QUALITY_UNJUDGED' as const,
    },
    localEvidenceArtifacts: [
      ...controlArtifacts,
      ...localEvidence.bindings.map((binding) => ({
        kind: `SANDBOX_${binding.kind}`,
        relativePath: safeRelative(outputRoot, binding.localPath),
        sha256: binding.contentSha256,
        byteLength: binding.byteLength,
      })),
      {
        kind: 'HYBRID_PROOF_MASTER' as const,
        relativePath: `hybrid/${portableMechanics.outputs.proofMaster.fileName}`,
        sha256: portableMechanics.outputs.proofMaster.sha256,
        byteLength: portableMechanics.outputs.proofMaster.bytes,
      },
      {
        kind: 'HYBRID_REVIEW_PROXY' as const,
        relativePath: `hybrid/${portableMechanics.outputs.reviewProxy.fileName}`,
        sha256: portableMechanics.outputs.reviewProxy.sha256,
        byteLength: portableMechanics.outputs.reviewProxy.bytes,
      },
    ],
    assessment: 'PASS_TECHNICAL_RENDERED_HYBRID_UNJUDGED' as const,
    historicalPaidCohortRerun: false as const,
    providerModelInference: 'NONE' as const,
    humanQuality: 'UNJUDGED' as const,
    stage25Completion: 'NOT_CLAIMED' as const,
    projectStateEffects: [] as const,
  };
  const receipt = deepFreezeV1({
    ...portable,
    receiptSha256: hashCanonicalJsonV1(portable),
  });
  const receiptPath = path.resolve(outputRoot, 'rhc03-rendered-hybrid-proof-v1.json');
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  return deepFreezeV1({
    receipt,
    request,
    hostPaths: {
      outputRoot,
      receiptPath,
      sandboxPlayablePath: playable.localPath,
      hybridMasterPath: mechanicsHostPaths.masterPath,
      hybridReviewPath: mechanicsHostPaths.reviewPath,
    },
  });
}

function assertExecutionIdentity(input: {
  executionId: string;
  createdAt: string;
  sandboxEnvironment: Readonly<{ snapshotId: string; snapshotCommit: string }>;
}): void {
  const createdAt = new Date(input.createdAt);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(input.executionId)
    || Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== input.createdAt
    || input.sandboxEnvironment.snapshotId !== EXPECTED.sandboxSnapshotId
    || input.sandboxEnvironment.snapshotCommit !== EXPECTED.sandboxSnapshotCommit) {
    fail('EXECUTION_IDENTITY_INVALID');
  }
}

function assertAcceptedIdentities(actual: Record<string, string>): void {
  for (const [key, value] of Object.entries(actual)) {
    if (EXPECTED[key as keyof typeof EXPECTED] !== value) {
      fail(`ACCEPTED_IDENTITY_DRIFT:${key}`);
    }
  }
}

function assertSandboxExecution(
  request: ReturnType<typeof buildGeneratedCompositionSandboxRequestV1>,
  executed: ExecuteGeneratedCompositionSandboxResultV1,
  expectedSnapshotId: string,
): Readonly<GeneratedCompositionSandboxHostReceiptV1> {
  const result = parseGeneratedCompositionSandboxWorkerResultV1(
    executed.workerResult,
  );
  const host = executed.receipt;
  const { receiptHash, ...hostMaterial } = host;
  if (result.status !== 'RENDERED'
    || result.requestId !== request.requestId
    || result.executionId !== request.executionId
    || result.appCommit !== request.appCommit
    || result.programHash !== request.programHash
    || result.sourceBundleHash !== request.sourceBundleHash
    || host.provider !== 'VERCEL_SANDBOX'
    || host.requestId !== request.requestId
    || host.requestHash !== hashCanonicalJsonV1(request)
    || host.resultHash !== hashCanonicalJsonV1(result)
    || host.executionId !== request.executionId
    || host.snapshotId !== expectedSnapshotId
    || host.appCommit !== request.appCommit
    || host.workerImplementationHash !== request.workerImplementationHash
    || host.proxyReceiptHash !== result.proxyReceiptHash
    || hashCanonicalJsonV1(host.outputs) !== hashCanonicalJsonV1(result.outputs)
    || host.networkPolicy !== 'DENY_ALL' || host.persistent
    || !host.sandboxDeleted || host.command.exitCode !== 0
    || host.proof.productionSandbox !== 'PASS'
    || host.proof.outputMaterialization !== 'PASS'
    || host.proof.projectMutation !== 'NONE' || host.stateEffects.length
    || receiptHash !== hashCanonicalJsonV1(hostMaterial)) {
    fail('SANDBOX_ATTESTATION_DRIFT');
  }
  return host;
}

function assertSynchronizationBindings(input: {
  fixture: ReturnType<typeof buildRhc03GeneratedCompositionFixtureV1>;
  request: ReturnType<typeof buildGeneratedCompositionSandboxRequestV1>;
  actionSha256: string;
  visualProof: Readonly<Stage25Rhc03RenderedVisualProofReceiptV1>;
}) {
  const slots = input.fixture.program.sourceSlots;
  const leftSlot = slots.find(({ slotId }) => slotId === 'source-left');
  const rightSlot = slots.find(({ slotId }) => slotId === 'source-right');
  const leftInput = input.request.inputs.find(
    ({ bindingId }) => bindingId === 'rhc03-action-left',
  );
  const rightInput = input.request.inputs.find(
    ({ bindingId }) => bindingId === 'rhc03-action-right',
  );
  if (!leftSlot || !rightSlot || leftSlot.assetId === rightSlot.assetId
    || leftSlot.sourceRange.start !== '0'
    || leftSlot.sourceRange.endExclusive !== '150'
    || hashCanonicalJsonV1(leftSlot.sourceRange)
      !== hashCanonicalJsonV1(rightSlot.sourceRange)
    || !leftInput || !rightInput
    || leftInput.contentSha256 !== input.actionSha256
    || rightInput.contentSha256 !== input.actionSha256
    || leftInput.byteLength !== rightInput.byteLength
    || leftInput.data !== rightInput.data
    || !input.fixture.handoffs.sourceMapping.sharedTemporalBytes
    || input.fixture.handoffs.sourceMapping.actionLocalToWideOffsetFrames !== 450
    || input.visualProof.proof.twoDistinctViewsVisible !== 'PASS') {
    fail('SOURCE_SYNCHRONIZATION_BINDING_DRIFT');
  }
  return deepFreezeV1({
    independentlyEditableSourceSlots: [leftSlot.slotId, rightSlot.slotId],
    independentlyAddressedAssets: [leftSlot.assetId, rightSlot.assetId],
    sharedTemporalArtifactSha256: input.actionSha256,
    localFrameRange: { startFrame: 0 as const, endExclusiveFrame: 150 as const },
    authoredWideOffsetFrames: 450 as const,
    leftCrop: 'portrait-left' as const,
    rightCrop: 'portrait-right' as const,
    sameLocalFrameExpressionBoundBySourceBundle: true as const,
    renderedViewsMateriallyDistinct: true as const,
    disposition: 'PASS_SAME_ACTION_PHASE_DISTINCT_VIEWS' as const,
  });
}

async function writeControlArtifacts(outputRoot: string, values: {
  request: unknown;
  workerResult: unknown;
  hostReceipt: unknown;
}) {
  const entries = [
    ['SANDBOX_REQUEST', 'sandbox-request.json', values.request],
    ['SANDBOX_WORKER_RESULT', 'sandbox-worker-result.json', values.workerResult],
    ['SANDBOX_HOST_RECEIPT', 'sandbox-host-receipt.json', values.hostReceipt],
  ] as const;
  return Promise.all(entries.map(async ([kind, fileName, value]) => {
    const bytes = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
    await writeFile(path.resolve(outputRoot, fileName), bytes, {
      mode: 0o600,
      flag: 'wx',
    });
    return {
      kind,
      relativePath: fileName,
      sha256: sha256(bytes),
      byteLength: bytes.length,
    };
  }));
}

async function createNewOutputDirectory(value: string): Promise<string> {
  const root = path.resolve(value);
  if (root === path.parse(root).root || root === path.resolve(process.cwd())) {
    fail('OUTPUT_DIRECTORY_UNSAFE');
  }
  await mkdir(path.dirname(root), { recursive: true });
  await mkdir(root);
  return root;
}

async function readRegular(filePath: string): Promise<Buffer> {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    fail('INPUT_FILE_INVALID');
  }
  return readFile(filePath);
}

function onlyBinding(
  bindings: readonly Readonly<{
    kind: string;
    localPath: string;
    contentSha256: string;
  }>[],
  kind: string,
) {
  const matches = bindings.filter((binding) => binding.kind === kind);
  if (matches.length !== 1) fail(`LOCAL_EVIDENCE_BINDING_INVALID:${kind}`);
  return matches[0]!;
}

function assetSha(
  assets: readonly Readonly<{ assetId: string; sha256: string }>[],
  assetId: string,
): string {
  const matches = assets.filter((asset) => asset.assetId === assetId);
  if (matches.length !== 1) fail(`ASSET_IDENTITY_INVALID:${assetId}`);
  return matches[0]!.sha256;
}

function safeRelative(root: string, target: string): string {
  const relative = path.relative(root, target).split(path.sep).join('/');
  if (!relative || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
    fail('LOCAL_EVIDENCE_PATH_UNSAFE');
  }
  return relative;
}

async function sha256File(filePath: string): Promise<string> {
  return sha256(await readRegular(filePath));
}
function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function fail(code: string): never {
  throw new Error(`STAGE25_RHC03_RENDERED_HYBRID_${code}`);
}
