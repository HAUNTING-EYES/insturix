import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildRhc04GeneratedCompositionFixtureV1,
  type Rhc04FixtureVariantV1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc04-generated-composition-fixture-v1';

import {
  hasSamePreparedCompositionMaterialV1,
  parseProjectGeneratedCompositionEntryV1,
  type ProjectGeneratedCompositionEntryV1,
} from '../../services/project-generated-composition-entry-v1';
import {
  parseProjectGeneratedCompositionStateV1,
} from '../../services/project-generated-composition-state-verifier-v1';
import type {
  ProjectGeneratedCompositionStateV1,
} from '../../services/project-generated-composition-state-v1';
import type { Project, ProjectRevisionV1 } from '../../services/project-service';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { materializeGeneratedCompositionLocalEvidenceV1 }
  from './generated-composition-local-evidence-v1';
import {
  adaptGeneratedCompositionProgramToProjectDraftV1,
  type GeneratedCompositionProjectDraftAdapterInputV1,
} from './generated-composition-project-draft-adapter-v1';
import {
  buildGeneratedCompositionSandboxRequestV1,
  parseGeneratedCompositionSandboxWorkerResultV1,
  type GeneratedCompositionSandboxHostReceiptV1,
  type GeneratedCompositionSandboxRequestV1,
} from './generated-composition-sandbox-contract-v1';
import {
  executeGeneratedCompositionInSandboxV1,
  resolveGeneratedCompositionSandboxOverlayV1,
  type ExecuteGeneratedCompositionSandboxOptionsV1,
  type ExecuteGeneratedCompositionSandboxResultV1,
} from './generated-composition-sandbox-runner-v1';
import { projectProposalStateV2R }
  from './project-service-proposal-state-v2r';
import { createProviderNativeProjectServiceGeneratedCompositionOwnerV2R }
  from './provider-native-project-service-generated-composition-owner-v2r';
import type { ProviderNativeToolExecutionV2R }
  from './provider-native-tool-episode-v2r';
import {
  buildStage25Rhc04PreviewCandidatesV1,
  identityFromMedia,
} from './stage25-rhc04-preview-candidates-v1';
import {
  materializeStage25Rhc04PreviewMediaFixtureV1,
  STAGE25_RHC04_ASSET_IDS_V1,
} from './stage25-rhc04-preview-media-fixture-v1';
import {
  evaluateStage25Rhc04RenderedCorrectionProofV1,
  STAGE25_RHC04_RENDERED_CORRECTION_POLICY_V1,
  STAGE25_RHC04_RENDERED_CORRECTION_PROOF_VERSION_V1,
  type Stage25Rhc04RenderedCorrectionProofReceiptV1,
} from './stage25-rhc04-rendered-correction-proof-v1';

type SandboxExecutorV1 = (
  options: ExecuteGeneratedCompositionSandboxOptionsV1,
) => Promise<ExecuteGeneratedCompositionSandboxResultV1>;
type VisualProofExecutorV1 = (
  input: Parameters<typeof evaluateStage25Rhc04RenderedCorrectionProofV1>[0],
) => Promise<Readonly<Stage25Rhc04RenderedCorrectionProofReceiptV1>>;
type AdaptationV1 = ReturnType<
  typeof adaptGeneratedCompositionProgramToProjectDraftV1
>;
type FixtureV1 = ReturnType<typeof buildRhc04GeneratedCompositionFixtureV1>;
type LocalEvidenceV1 = Awaited<ReturnType<
  typeof materializeGeneratedCompositionLocalEvidenceV1
>>;
type JsonRecord = Record<string, unknown>;

const FIXTURE_CREATED_AT = '2026-08-27T17:30:00.000Z';
const PROJECT_ID = 'stage25-rhc04-preview';
const USER_ID = 'rhc04-proposal-user';
const TENANT_ID = 'tenant-rhc04';
const COMPOSITION_ID = 'rhc04-results-card';
const INSERT_REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 1,
  compatibilityUpdatedAt: '2026-08-27T17:30:00.000Z',
};
const CORRECTION_REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 2,
  compatibilityUpdatedAt: '2026-08-27T17:31:00.000Z',
};
const EXPECTED = deepFreezeV1({
  taskSha256: '1e34fb82b82f80fea9888039712af69984dc575942b04c4b9129bf80f7948ea1',
  mediaReceiptSha256: '5e377f611c2d45109730fe402e83ef0781344eef7b41f28d0975df001c20c9fd',
  initialFixtureSha256: 'ad190d2d4793a31ba9b69fcf0f5b0bfe07a39ac2a5a01daf40ab053480e675a1',
  correctedFixtureSha256: '0afeab0d4eeea3bf7f4ad67ae9db807ff5f7ab11ed29703e28793e91240c54f7',
  initialProgramSha256: '97c8fe0a5f7a9a46b7c43f3d38c7961a36eaedb27302297961f801d60858808a',
  correctedProgramSha256: 'c34472f796e3a26fca97d1bb6ff0ba358e98e99567e63f2a3309800bb72419ff',
  sourceBundleSha256: '7e6193d42a32eeba327b263fee41a89d35929b2347f26a96dd737bc662be9f01',
  initialEvidencePackSha256: '48b248608f58b69fb653efd245399ffc84a754d6bc5d2f00b12e4b8636b41be1',
  correctedEvidencePackSha256: '78cd05daee2fc5632e24d1dfcd0b4f486d2e6cf002cdc139a083e12a01469d06',
  initialReferenceBlueprintSha256: '44066c56ffd677948798f67cf161368fe45a73d920f2af7092b361ddb91b85bc',
  correctedReferenceBlueprintSha256: 'ad60b48603327add8656f5cc537e2936eeb479df417747978f6e2a124e187265',
  sourceRightsReceiptsSha256: 'd89d133e71a8bf62feb58889841a1e7273b931465f48d4d8399f09fa3dda10cf',
  candidateReceiptSha256: '323d905f9c24fa18b1e21dbdc63720b5f730f943403310fc6d74b595620539f5',
  routeSetSha256: '247fb4a6ec75bfeb3a8c8791bf2f9ce8c8d87eb75b892d8b7eb122bad3b39140',
  apiImplementationSha256: 'ee2468e25c67987e466abaee1e1ef18b0e7caa08c48875b8c52b66ee0382e4bc',
  workerImplementationSha256: '4d392654882a1b067dcf3b510add92c79b519a596e8e833ca75526f50922a79d',
  initialDraftSha256: '5f86d30c672a057d31dc6366eb979dd22a1a1b196791ee594f1d5aa77d8aa89b',
  correctedDraftSha256: '25375728c0ed2963d3bb7cc0a310155d06743341aa75a8094788d4ef4111fb7b',
  initialAdapterReceiptSha256: '757392f9a5b19d498cd29ccf620a57eecf40550ad581217bc02af213f70d152f',
  correctedAdapterReceiptSha256: 'a5582845a646fd2a650e80228879a3ccf6a2c196b87036edb736ea9caa89e910',
  closeup60Sha256: '33a92ff2cbcf79c0b5060eac50bd37f74c9bd0986c4496d33f2becef89544bd5',
  closeup30Sha256: '994598d318dfe9027c0349631b31ae255e4fb6eadaf5302a63054ad11d151fb1',
  closeup10Sha256: '6ff92c33ca36ff91e66dc2c46976b5c27bd386951ceec9fb4c04210e95821c23',
  correctionSourceSha256: '8ef53be6d68aaf257d5584b8cea9c4381647250c51171de8a1aa2edb9ae94fcf',
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

export const STAGE25_RHC04_RENDERED_GENERATED_PROOF_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC04_RENDERED_GENERATED_PROOF_V1' as const;

export async function executeStage25Rhc04RenderedGeneratedProofV1(input: {
  outputDirectory: string;
  executionId: string;
  createdAt: string;
  sandboxEnvironment: Readonly<{ snapshotId: string; snapshotCommit: string }>;
  repoRoot?: string;
  sandboxExecutor?: SandboxExecutorV1;
  visualProofExecutor?: VisualProofExecutorV1;
}) {
  assertExecutionIdentity(input);
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const outputRoot = await createNewOutputDirectory(input.outputDirectory);
  const media = await materializeStage25Rhc04PreviewMediaFixtureV1({
    outputDir: path.resolve(outputRoot, 'media'),
    createdAt: FIXTURE_CREATED_AT,
  });
  const identity = identityFromMedia(media);
  const initialFixture = buildRhc04GeneratedCompositionFixtureV1(identity, {
    variant: 'INITIAL', expectedProjectRevision: 'R1',
  });
  const correctedFixture = buildRhc04GeneratedCompositionFixtureV1(identity, {
    variant: 'CORRECTED', expectedProjectRevision: 'R2',
  });
  const candidates = await buildStage25Rhc04PreviewCandidatesV1(media, { repoRoot });
  const apiPath = path.resolve(
    repoRoot,
    'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx',
  );
  const [apiImplementationSha256, overlay, assetBytes, fontBytes] =
    await Promise.all([
      sha256File(apiPath),
      resolveGeneratedCompositionSandboxOverlayV1(repoRoot),
      readAssetBytes(media.hostPaths.assetPaths),
      readRegular(media.hostPaths.fontPath),
    ]);
  const initialAdapterInput = adapterInput(
    initialFixture,
    media.provenance,
    apiImplementationSha256,
  );
  const correctedAdapterInput = adapterInput(
    correctedFixture,
    media.provenance,
    apiImplementationSha256,
  );
  const initialAdaptation = adaptGeneratedCompositionProgramToProjectDraftV1(
    initialAdapterInput,
  );
  const correctedAdaptation = adaptGeneratedCompositionProgramToProjectDraftV1(
    correctedAdapterInput,
  );
  assertAcceptedIdentities({
    taskSha256: candidates.taskSha256,
    mediaReceiptSha256: media.receiptSha256,
    initialFixtureSha256: initialFixture.fixtureSha256,
    correctedFixtureSha256: correctedFixture.fixtureSha256,
    initialProgramSha256: hashCanonicalJsonV1(initialFixture.program),
    correctedProgramSha256: hashCanonicalJsonV1(correctedFixture.program),
    sourceBundleSha256: initialFixture.program.sourceBundleHash,
    initialEvidencePackSha256: hashCanonicalJsonV1(initialFixture.evidencePack),
    correctedEvidencePackSha256: hashCanonicalJsonV1(correctedFixture.evidencePack),
    initialReferenceBlueprintSha256:
      hashCanonicalJsonV1(initialFixture.referenceBlueprint),
    correctedReferenceBlueprintSha256:
      hashCanonicalJsonV1(correctedFixture.referenceBlueprint),
    sourceRightsReceiptsSha256: hashCanonicalJsonV1(media.provenance),
    candidateReceiptSha256: candidates.receiptSha256,
    routeSetSha256: candidates.routeSetSha256,
    apiImplementationSha256,
    workerImplementationSha256: overlay.workerImplementationHash,
    initialDraftSha256: initialAdaptation.binding.draftSha256,
    correctedDraftSha256: correctedAdaptation.binding.draftSha256,
    initialAdapterReceiptSha256: initialAdaptation.receipt.receiptSha256,
    correctedAdapterReceiptSha256: correctedAdaptation.receipt.receiptSha256,
    closeup60Sha256: assetSha(media.assets, 'rhc04-closeup-60'),
    closeup30Sha256: assetSha(media.assets, 'rhc04-closeup-30'),
    closeup10Sha256: assetSha(media.assets, 'rhc04-closeup-10'),
    correctionSourceSha256: assetSha(media.assets, 'rhc04-correction-source'),
    fontSha256: media.font.sha256,
  });
  const generatedRoute = candidates.routes.find(
    ({ route }) => route === 'GENERATED_COMPOSITION',
  );
  if (!generatedRoute || generatedRoute.route !== 'GENERATED_COMPOSITION'
    || generatedRoute.disposition !== 'READY_FOR_RENDER'
    || generatedRoute.form.initial.projectServiceDraftSha256
      !== initialAdaptation.binding.draftSha256
    || generatedRoute.form.corrected.projectServiceDraftSha256
      !== correctedAdaptation.binding.draftSha256
    || candidates.runtimeDigestSha256 !== apiImplementationSha256) {
    fail('QUALIFIED_GENERATED_ROUTE_DRIFT');
  }

  const initialRequest = buildSandboxRequest({
    fixture: initialFixture,
    executionId: `${input.executionId}-initial`,
    createdAt: input.createdAt,
    appCommit: input.sandboxEnvironment.snapshotCommit,
    apiImplementationSha256,
    workerImplementationSha256: overlay.workerImplementationHash,
    assetBytes,
    assetPaths: media.hostPaths.assetPaths,
    fontBytes,
    fontPath: media.hostPaths.fontPath,
  });
  const correctedRequest = buildSandboxRequest({
    fixture: correctedFixture,
    executionId: `${input.executionId}-corrected`,
    createdAt: input.createdAt,
    appCommit: input.sandboxEnvironment.snapshotCommit,
    apiImplementationSha256,
    workerImplementationSha256: overlay.workerImplementationHash,
    assetBytes,
    assetPaths: media.hostPaths.assetPaths,
    fontBytes,
    fontPath: media.hostPaths.fontPath,
  });
  const executeSandbox = input.sandboxExecutor
    ?? executeGeneratedCompositionInSandboxV1;
  const initialExecution = await executeSandbox({
    request: initialRequest,
    repoRoot,
    env: sandboxEnv(input.sandboxEnvironment),
  });
  const initialHostReceipt = assertSandboxExecution(
    initialRequest,
    initialExecution,
    input.sandboxEnvironment.snapshotId,
  );
  const initialEvidence = await materializeGeneratedCompositionLocalEvidenceV1({
    candidateRoot: path.resolve(outputRoot, 'initial-evidence'),
    workerResult: initialExecution.workerResult,
    hostReceipt: initialHostReceipt,
    outputBytes: initialExecution.outputBytes,
  });
  const correctedExecution = await executeSandbox({
    request: correctedRequest,
    repoRoot,
    env: sandboxEnv(input.sandboxEnvironment),
  });
  const correctedHostReceipt = assertSandboxExecution(
    correctedRequest,
    correctedExecution,
    input.sandboxEnvironment.snapshotId,
  );
  const correctedEvidence = await materializeGeneratedCompositionLocalEvidenceV1({
    candidateRoot: path.resolve(outputRoot, 'corrected-evidence'),
    workerResult: correctedExecution.workerResult,
    hostReceipt: correctedHostReceipt,
    outputBytes: correctedExecution.outputBytes,
  });
  const initialPlayable = onlyBinding(initialEvidence, 'PLAYABLE_PROXY');
  const correctedPlayable = onlyBinding(correctedEvidence, 'PLAYABLE_PROXY');
  const visualProof = await (
    input.visualProofExecutor ?? evaluateStage25Rhc04RenderedCorrectionProofV1
  )({
    initialProxyReceipt: initialEvidence.localEvaluationReceipt,
    correctedProxyReceipt: correctedEvidence.localEvaluationReceipt,
    authoritativeInitialProxyReceiptSha256:
      initialEvidence.originalProxyReceiptHash,
    authoritativeCorrectedProxyReceiptSha256:
      correctedEvidence.originalProxyReceiptHash,
    expectedInitialProgramSha256: initialRequest.programHash,
    expectedCorrectedProgramSha256: correctedRequest.programHash,
    layoutContract: initialFixture.layoutContract,
    sourceContrast: media.stillContract.measurements.map((measurement) => ({
      assetId: measurement.assetId,
      minimumWhiteContrastRatio: measurement.minimumWhiteContrastRatio,
    })),
  });
  const proposalProof = await proveProjectServiceProposalLifecycle({
    initialAdapterInput,
    correctedAdapterInput,
    initialAdaptation,
    correctedAdaptation,
    initialPlayable,
    correctedPlayable,
    visualProof,
    initialObligationIds: initialFixture.program.proofObligationIds,
    correctedObligationIds: correctedFixture.program.proofObligationIds,
    expectedCorrectionScope: generatedRoute.correctionScope,
  });
  const controlArtifacts = await writeControlArtifacts(outputRoot, {
    initialRequest,
    initialWorkerResult: initialExecution.workerResult,
    initialHostReceipt,
    correctedRequest,
    correctedWorkerResult: correctedExecution.workerResult,
    correctedHostReceipt,
  });
  const portable = {
    version: STAGE25_RHC04_RENDERED_GENERATED_PROOF_VERSION_V1,
    artifactType: 'Stage25Rhc04RenderedGeneratedProofReceiptV1' as const,
    authority:
      'RHC04_RESEARCH_DUAL_SANDBOX_AND_ISOLATED_PROPOSAL_PROOF_NO_CANONICAL_MUTATION' as const,
    taskId: 'RHC-04' as const,
    executionId: input.executionId,
    createdAt: input.createdAt,
    frozenTarget: {
      projectRange: { startFrame: 0, endExclusiveFrame: 180 } as const,
      frameRate: { numerator: 30, denominator: 1 } as const,
      canvas: { width: 1080, height: 1920 } as const,
      initial: initialFixture.timingContract,
      corrected: correctedFixture.timingContract,
    },
    mediaEvidence: {
      mediaReceiptSha256: media.receiptSha256,
      assets: media.assets.map(({ assetId, sha256, rightsEvidenceSha256 }) => ({
        assetId, sha256, rightsEvidenceSha256,
      })),
      sourceRightsReceiptsSha256: EXPECTED.sourceRightsReceiptsSha256,
      fontSha256: media.font.sha256,
      fontFamily: media.font.family,
      fontFace: media.font.face,
      fontWeight: media.font.weight,
      fontLicenseId: media.font.licenseId,
      sourceContrast: media.stillContract.measurements,
    },
    routeQualification: {
      candidateReceiptSha256: candidates.receiptSha256,
      routeSetSha256: candidates.routeSetSha256,
      selectedCandidateId: generatedRoute.candidateId,
      predecessorDisposition: generatedRoute.disposition,
      nativeDisposition:
        'CAPABILITY_GAP_EXACT_PRODUCT_FONT_FILE_BINDING_UNPROVED' as const,
      hybridDisposition:
        'NOT_APPLICABLE_NO_DISTINCT_NATIVE_CONTRIBUTION' as const,
    },
    generatedPrograms: {
      initial: programBinding(initialFixture, initialAdaptation, initialRequest),
      corrected: programBinding(
        correctedFixture,
        correctedAdaptation,
        correctedRequest,
      ),
      sourceBundleExactAcrossCorrection: true as const,
      sourceBundleRegeneratedForCorrection: false as const,
      mediaRegeneratedForCorrection: false as const,
      declaredCorrectionScope: generatedRoute.correctionScope,
    },
    sandboxProof: {
      qualification: {
        predecessorCapabilityReceiptSha256:
          EXPECTED.sandboxCapabilityPredecessorReceiptSha256,
        currentHashRequestId: EXPECTED.currentHashQualificationRequestId,
        currentHashHostReceiptSha256:
          EXPECTED.currentHashQualificationHostReceiptSha256,
        currentApiImplementationSha256: EXPECTED.apiImplementationSha256,
        currentWorkerImplementationSha256:
          EXPECTED.workerImplementationSha256,
      },
      initial: sandboxProof(
        initialRequest,
        initialExecution,
        initialHostReceipt,
        initialEvidence,
      ),
      corrected: sandboxProof(
        correctedRequest,
        correctedExecution,
        correctedHostReceipt,
        correctedEvidence,
      ),
    },
    renderedCorrectionProof: visualProof,
    projectServiceProposalProof: proposalProof,
    correctionMeasurement: {
      automatedCorrectedRenderWorkerWallTimeMs:
        correctedExecution.workerResult.wallTimeMs,
      automatedCorrectedRenderCpuUpperBoundMs:
        correctedExecution.workerResult.cpuUpperBoundMs,
      humanHandsOnCorrectionTime:
        'PENDING_MEASURED_HANDS_ON_SESSION' as const,
      providerExecutionCost:
        'UNVERIFIABLE_PROVIDER_BILLING_NOT_EXPOSED_BY_EXECUTION_RECEIPT' as const,
    },
    routeDisposition: {
      native: 'CAPABILITY_GAP_EXACT_PRODUCT_FONT_BINDING_UNPROVED' as const,
      generatedOnly:
        'TECHNICAL_INITIAL_AND_CORRECTED_RENDER_PASS_HUMAN_QUALITY_UNJUDGED' as const,
      hybrid: 'NOT_APPLICABLE_NO_DISTINCT_NATIVE_CONTRIBUTION' as const,
    },
    localEvidenceArtifacts: [
      ...controlArtifacts,
      ...evidenceArtifacts(outputRoot, 'INITIAL', initialEvidence),
      ...evidenceArtifacts(outputRoot, 'CORRECTED', correctedEvidence),
    ],
    assessment: 'PASS_TECHNICAL_RENDERED_GENERATED_CORRECTION_UNJUDGED' as const,
    historicalPaidCohortRerun: false as const,
    providerModelInference: 'NONE' as const,
    humanQuality: 'UNJUDGED' as const,
    stage25Completion: 'NOT_CLAIMED' as const,
    canonicalProjectMutationWrites: 0 as const,
    projectStateEffects: [] as const,
  };
  const receipt = deepFreezeV1({
    ...portable,
    receiptSha256: hashCanonicalJsonV1(portable),
  });
  const receiptPath = path.resolve(
    outputRoot,
    'rhc04-rendered-generated-proof-v1.json',
  );
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8', mode: 0o600, flag: 'wx',
  });
  return deepFreezeV1({
    receipt,
    requests: { initial: initialRequest, corrected: correctedRequest },
    hostPaths: {
      outputRoot,
      receiptPath,
      initialPlayablePath: initialPlayable.localPath,
      correctedPlayablePath: correctedPlayable.localPath,
    },
  });
}

function adapterInput(
  fixture: FixtureV1,
  sourceRightsReceipts: readonly Readonly<Record<string, unknown>>[],
  runtimeDigestSha256: string,
): GeneratedCompositionProjectDraftAdapterInputV1 {
  return {
    verificationInput: fixture,
    sourceRightsReceipts,
    compositionId: COMPOSITION_ID,
    runtimeDigestSha256,
    generatorBinding: { kind: 'HUMAN_AUTHORED', authorId: USER_ID },
  };
}

function buildSandboxRequest(input: {
  fixture: FixtureV1;
  executionId: string;
  createdAt: string;
  appCommit: string;
  apiImplementationSha256: string;
  workerImplementationSha256: string;
  assetBytes: ReadonlyMap<string, Buffer>;
  assetPaths: Readonly<Record<string, string>>;
  fontBytes: Buffer;
  fontPath: string;
}): Readonly<GeneratedCompositionSandboxRequestV1> {
  return buildGeneratedCompositionSandboxRequestV1({
    executionId: input.executionId,
    createdAt: input.createdAt,
    appCommit: input.appCommit,
    apiImplementationHash: input.apiImplementationSha256,
    workerImplementationHash: input.workerImplementationSha256,
    program: input.fixture.program,
    sourceBundle: input.fixture.sourceBundle,
    evidencePack: input.fixture.evidencePack,
    referenceBlueprint: input.fixture.referenceBlueprint,
    supplementalFacts: input.fixture.supplementalFacts,
    proofFrames: STAGE25_RHC04_RENDERED_CORRECTION_POLICY_V1.requiredFrames,
    inputs: [
      ...input.fixture.program.sourceSlots.map(({ assetId }) => ({
        kind: 'SOURCE_MEDIA' as const,
        bindingId: assetId,
        fileName: path.basename(required(input.assetPaths[assetId], assetId)),
        bytes: required(input.assetBytes.get(assetId), assetId),
      })),
      {
        kind: 'FONT' as const,
        bindingId: 'rhc04-licensed-numerals',
        fileName: path.basename(input.fontPath),
        bytes: input.fontBytes,
      },
    ],
    resources: {
      wallTimeMs: Math.min(input.fixture.program.resourceBudget.maxWallTimeMs, 180_000),
      maxCpuMs: Math.min(input.fixture.program.resourceBudget.maxCpuMs, 120_000),
      vcpus: 1,
      memoryMiB: 2_048,
      maxOutputBytes: Math.min(
        input.fixture.program.resourceBudget.maxOutputBytes,
        64 * 1_024 * 1_024,
      ),
    },
  });
}

async function proveProjectServiceProposalLifecycle(input: {
  initialAdapterInput: GeneratedCompositionProjectDraftAdapterInputV1;
  correctedAdapterInput: GeneratedCompositionProjectDraftAdapterInputV1;
  initialAdaptation: AdaptationV1;
  correctedAdaptation: AdaptationV1;
  initialPlayable: ReturnType<typeof onlyBinding>;
  correctedPlayable: ReturnType<typeof onlyBinding>;
  visualProof: Readonly<Stage25Rhc04RenderedCorrectionProofReceiptV1>;
  initialObligationIds: readonly string[];
  correctedObligationIds: readonly string[];
  expectedCorrectionScope: Readonly<{
    changedSourceSlotIds: readonly string[];
    changedControlIds: readonly string[];
    unchangedControlIds: readonly string[];
    unchangedSourceSlotIds: readonly string[];
    unchangedArtifactClasses: readonly string[];
  }>;
}) {
  const initialRevision = revisionIdentity(INSERT_REVISION);
  const initialCanonical = fixtureProject(INSERT_REVISION, []);
  const initialCanonicalSha256 = proposalStateSha(initialCanonical);
  const initialWorking = structuredClone(initialCanonical);
  const initialCall = proposalCall({
    adaptation: input.initialAdaptation,
    project: initialWorking,
    expectedProjectRevision: initialRevision,
    operationKind: 'INSERT',
    turn: 1,
  });
  const initialExecution = await createProviderNativeProjectServiceGeneratedCompositionOwnerV2R({
    adapterInput: input.initialAdapterInput,
  }).execute(executeInput(
    initialWorking,
    INSERT_REVISION,
    initialRevision,
    initialCall,
  ));
  assertDisposition(initialExecution, 'OK', 'INITIAL_INSERT');
  const pendingInitialEntry = executionEntry(initialExecution, 'INITIAL_INSERT');
  const pendingInitial = required(
    pendingInitialEntry.candidateState,
    'INITIAL_PENDING_STATE',
  );
  const passingInitial = buildPassingProjection({
    pending: pendingInitial,
    playable: input.initialPlayable,
    visualProof: input.visualProof,
    obligationIds: input.initialObligationIds,
    variant: 'INITIAL',
  });
  const activeInitialEntry = parseProjectGeneratedCompositionEntryV1({
    schemaVersion: 1,
    compositionId: COMPOSITION_ID,
    activeState: passingInitial,
    candidateState: null,
  });
  if (proposalStateSha(initialCanonical) !== initialCanonicalSha256) {
    fail('INITIAL_CANONICAL_PROJECT_CHANGED');
  }

  const correctionCanonical = fixtureProject(
    CORRECTION_REVISION,
    [activeInitialEntry],
  );
  const correctionCanonicalSha256 = proposalStateSha(correctionCanonical);
  const correctionWorking = structuredClone(correctionCanonical);
  const correctionRevision = revisionIdentity(CORRECTION_REVISION);
  const staleCall = proposalCall({
    adaptation: input.correctedAdaptation,
    project: correctionWorking,
    expectedProjectRevision: correctionRevision,
    operationKind: 'REVISE',
    expectedBaseStateToken: `gcp-state-v1:${'f'.repeat(64)}`,
    turn: 1,
  });
  const correctedOwner = createProviderNativeProjectServiceGeneratedCompositionOwnerV2R({
    adapterInput: input.correctedAdapterInput,
  });
  const beforeStaleSha256 = proposalStateSha(correctionWorking);
  const staleExecution = await correctedOwner.execute(executeInput(
    correctionWorking,
    CORRECTION_REVISION,
    correctionRevision,
    staleCall,
  ));
  assertDisposition(staleExecution, 'CONFLICT', 'STALE_REVISE');
  if (executionCode(staleExecution) !==
      'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_BASE_STATE_CONFLICT'
    || proposalStateSha(correctionWorking) !== beforeStaleSha256) {
    fail('STALE_REVISE_NOT_SIDE_EFFECT_FREE');
  }
  const exactCall = proposalCall({
    adaptation: input.correctedAdaptation,
    project: correctionWorking,
    expectedProjectRevision: correctionRevision,
    operationKind: 'REVISE',
    expectedBaseStateToken: passingInitial.stateIdentity.token,
    turn: 2,
  });
  const correctedExecution = await correctedOwner.execute(executeInput(
    correctionWorking,
    CORRECTION_REVISION,
    correctionRevision,
    exactCall,
  ));
  assertDisposition(correctedExecution, 'OK', 'EXACT_REVISE');
  const revisedEntry = executionEntry(correctedExecution, 'EXACT_REVISE');
  const correctedPending = required(
    revisedEntry.candidateState,
    'CORRECTED_PENDING_STATE',
  );
  if (!revisedEntry.activeState
    || hashCanonicalJsonV1(revisedEntry.activeState)
      !== hashCanonicalJsonV1(passingInitial)) {
    fail('ACTIVE_INITIAL_STATE_NOT_PRESERVED');
  }
  const correctionScope = assertCorrectionScope(
    passingInitial,
    correctedPending,
    input.expectedCorrectionScope,
  );
  const passingCorrected = buildPassingProjection({
    pending: correctedPending,
    playable: input.correctedPlayable,
    visualProof: input.visualProof,
    obligationIds: input.correctedObligationIds,
    variant: 'CORRECTED',
  });
  if (proposalStateSha(correctionCanonical) !== correctionCanonicalSha256) {
    fail('CORRECTION_CANONICAL_PROJECT_CHANGED');
  }
  return deepFreezeV1({
    authority:
      'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_PROPOSAL_OWNER_AND_SCHEMA_PROJECTION' as const,
    initialInsert: {
      disposition: initialExecution.disposition,
      executionSha256: hashCanonicalJsonV1(initialExecution),
      proposalRevision: executionRevision(initialExecution, 'INITIAL_INSERT'),
      pendingStateToken: pendingInitial.stateIdentity.token,
      pendingStateSha256: hashCanonicalJsonV1(pendingInitial),
      changedPaths: executionChangedPaths(initialExecution, 'INITIAL_INSERT'),
    },
    passingInitialStateProjection: {
      disposition: 'SCHEMA_VALID_PASSING_STATE_PROJECTION' as const,
      stateSha256: hashCanonicalJsonV1(passingInitial),
      stateToken: passingInitial.stateIdentity.token,
      canonicalFinalizerCalled: false as const,
      canonicalPromotionClaimed: false as const,
    },
    staleRevise: {
      disposition: staleExecution.disposition,
      code: executionCode(staleExecution),
      workingStateUnchanged: true as const,
    },
    exactBaseRevise: {
      disposition: correctedExecution.disposition,
      executionSha256: hashCanonicalJsonV1(correctedExecution),
      proposalRevision: executionRevision(correctedExecution, 'EXACT_REVISE'),
      activeInitialStatePreservedExactly: true as const,
      candidateStateToken: correctedPending.stateIdentity.token,
      candidateStateSha256: hashCanonicalJsonV1(correctedPending),
      changedPaths: executionChangedPaths(correctedExecution, 'EXACT_REVISE'),
      correctionScope,
    },
    passingCorrectedStateProjection: {
      disposition: 'SCHEMA_VALID_PASSING_STATE_PROJECTION' as const,
      stateSha256: hashCanonicalJsonV1(passingCorrected),
      stateToken: passingCorrected.stateIdentity.token,
      canonicalFinalizerCalled: false as const,
      canonicalPromotionClaimed: false as const,
    },
    canonicalSnapshots: {
      initialCanonicalUnchanged: true as const,
      correctionCanonicalUnchanged: true as const,
      canonicalMutationOwnerCalled: false as const,
      canonicalMutationWrites: 0 as const,
    },
    lifecycleCeiling:
      'ISOLATED_INSERT_AND_REVISE_PROVED_CANONICAL_PREPARE_FINALIZE_NOT_CALLED' as const,
  });
}

function buildPassingProjection(input: {
  pending: Readonly<ProjectGeneratedCompositionStateV1>;
  playable: ReturnType<typeof onlyBinding>;
  visualProof: Readonly<Stage25Rhc04RenderedCorrectionProofReceiptV1>;
  obligationIds: readonly string[];
  variant: Rhc04FixtureVariantV1;
}): ProjectGeneratedCompositionStateV1 {
  const playableArtifact = immutableArtifact(
    `rhc04-${input.variant.toLowerCase()}-playable-proxy`,
    input.playable.contentSha256,
  );
  const proofArtifact = immutableArtifact(
    'rhc04-rendered-correction-proof',
    input.visualProof.receiptSha256,
  );
  const programDigest = input.pending.programRef.programArtifact.digest;
  const passing = parseProjectGeneratedCompositionStateV1({
    ...input.pending,
    renderArtifacts: [{
      stage: 'PREVIEW',
      artifact: playableArtifact,
      boundStateToken: input.pending.stateIdentity.token,
      programDigest,
      width: input.pending.canvas.width,
      height: input.pending.canvas.height,
      frameRate: input.pending.placement.compositionTimebase.rate,
      durationTicks: '180',
      contentOffsetTicks: '0',
      outputKind: input.pending.output.kind,
    }],
    verificationDisposition: 'PASS',
    proof: {
      ownerId: 'stage25-rhc04-rendered-correction-proof-v1',
      receipt: {
        ...proofArtifact,
        version: STAGE25_RHC04_RENDERED_CORRECTION_PROOF_VERSION_V1,
      },
      boundStateToken: input.pending.stateIdentity.token,
      programDigest,
      status: 'PASS',
      observations: input.obligationIds.map((obligationId) => ({
        obligationId,
        required: true,
        status: 'PASS',
        evidence: [playableArtifact, proofArtifact],
      })),
    },
  });
  if (!hasSamePreparedCompositionMaterialV1(input.pending, passing)) {
    fail(`${input.variant}_PASSING_PROJECTION_MATERIAL_DRIFT`);
  }
  return passing;
}

function assertCorrectionScope(
  active: Readonly<ProjectGeneratedCompositionStateV1>,
  candidate: Readonly<ProjectGeneratedCompositionStateV1>,
  expected: Readonly<{
    changedSourceSlotIds: readonly string[];
    changedControlIds: readonly string[];
    unchangedControlIds: readonly string[];
    unchangedSourceSlotIds: readonly string[];
    unchangedArtifactClasses: readonly string[];
  }>,
) {
  const changedSourceSlotIds = changedIds(
    active.sourceBindings,
    candidate.sourceBindings,
    'slotId',
  );
  const changedControlIds = changedIds(
    active.exposedControls,
    candidate.exposedControls,
    'parameterId',
  );
  const allSourceIds = active.sourceBindings.map(({ slotId }) => slotId);
  const allControlIds = active.exposedControls.map(({ parameterId }) => parameterId);
  const unchangedSourceSlotIds = allSourceIds.filter(
    (value) => !changedSourceSlotIds.includes(value),
  );
  const unchangedControlIds = allControlIds.filter(
    (value) => !changedControlIds.includes(value),
  );
  const actualCore = {
    changedSourceSlotIds,
    changedControlIds,
    unchangedControlIds,
    unchangedSourceSlotIds,
  };
  const expectedCore = {
    changedSourceSlotIds: expected.changedSourceSlotIds,
    changedControlIds: expected.changedControlIds,
    unchangedControlIds: expected.unchangedControlIds,
    unchangedSourceSlotIds: expected.unchangedSourceSlotIds,
  };
  if (hashCanonicalJsonV1(actualCore) !== hashCanonicalJsonV1(expectedCore)
    || expected.unchangedArtifactClasses.join('|')
      !== 'SOURCE_BUNDLE|CANVAS|PROJECT_RANGE|FONT_BINDING|SOURCE_60_BINDING|SOURCE_10_BINDING'
    || active.programRef.sourceBundleArtifact.digest.value
      !== candidate.programRef.sourceBundleArtifact.digest.value
    || hashCanonicalJsonV1(active.placement) !== hashCanonicalJsonV1(candidate.placement)
    || hashCanonicalJsonV1(active.canvas) !== hashCanonicalJsonV1(candidate.canvas)
    || hashCanonicalJsonV1(active.fontBindings)
      !== hashCanonicalJsonV1(candidate.fontBindings)
    || hashCanonicalJsonV1(active.output) !== hashCanonicalJsonV1(candidate.output)) {
    fail('PROJECTSERVICE_CORRECTION_SCOPE_DRIFT');
  }
  return deepFreezeV1({
    ...actualCore,
    unchangedArtifactClasses: [...expected.unchangedArtifactClasses],
  });
}

function changedIds<T extends Record<K, string>, K extends keyof T>(
  initial: readonly T[],
  corrected: readonly T[],
  key: K,
): string[] {
  const right = new Map(corrected.map((value) => [value[key], value]));
  if (right.size !== initial.length || corrected.length !== initial.length) {
    fail('PROJECTSERVICE_CORRECTION_CARDINALITY_DRIFT');
  }
  return initial.filter((value) => (
    hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(right.get(value[key]))
  )).map((value) => value[key]);
}

function proposalCall(input: {
  adaptation: AdaptationV1;
  project: Readonly<Project>;
  expectedProjectRevision: string;
  operationKind: 'INSERT' | 'REVISE';
  expectedBaseStateToken?: string;
  turn: number;
}) {
  return {
    operatorId: 'generated_composition_program',
    turn: input.turn,
    arguments: {
      projectId: PROJECT_ID,
      expectedProjectRevision: input.expectedProjectRevision,
      expectedProjectStateSha256: proposalStateSha(input.project),
      programExpectedProjectRevision:
        input.adaptation.binding.programExpectedProjectRevision,
      operationKind: input.operationKind,
      ...(input.expectedBaseStateToken
        ? { expectedBaseStateToken: input.expectedBaseStateToken }
        : {}),
      compositionId: input.adaptation.draft.compositionId,
      programSha256: input.adaptation.binding.programSha256,
      sourceBundleSha256: input.adaptation.binding.sourceBundleSha256,
      evidencePackSha256: input.adaptation.binding.evidencePackSha256,
      sourceRightsReceiptsSha256:
        input.adaptation.binding.sourceRightsReceiptsSha256,
      referenceBlueprintSha256:
        input.adaptation.binding.referenceBlueprintSha256,
      runtimeDigestSha256: input.adaptation.binding.runtimeDigestSha256,
      draftSha256: input.adaptation.binding.draftSha256,
      adapterReceiptSha256: input.adaptation.binding.adapterReceiptSha256,
      evidenceIds: [...input.adaptation.requiredEvidenceIds],
    },
  } as const;
}

function executeInput(
  project: Project,
  baseRevision: Readonly<ProjectRevisionV1>,
  currentProjectRevision: string,
  call: ReturnType<typeof proposalCall>,
) {
  return {
    tenantId: TENANT_ID,
    userId: USER_ID,
    projectId: PROJECT_ID,
    project,
    baseRevision,
    currentProjectRevision,
    call,
  };
}

function fixtureProject(
  revision: Readonly<ProjectRevisionV1>,
  entries: readonly ProjectGeneratedCompositionEntryV1[],
): Project {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: 'RHC04 generated correction proposal',
    overlays: [],
    aspectRatio: '9:16',
    playerDimensions: { width: 1080, height: 1920 },
    fps: 30,
    durationInFrames: 180,
    createdAt: new Date('2026-08-27T17:30:00.000Z'),
    updatedAt: new Date(revision.compatibilityUpdatedAt),
    projectRevision: revision.value,
    generatedCompositions: structuredClone([...entries]),
    visibility: 'private',
  };
}

function immutableArtifact(artifactId: string, digest: string) {
  assertSha(digest, `ARTIFACT_${artifactId}`);
  return {
    artifactId,
    version: `sha256:${digest}`,
    digest: { algorithm: 'sha-256' as const, value: digest },
  };
}

function programBinding(
  fixture: FixtureV1,
  adaptation: AdaptationV1,
  request: Readonly<GeneratedCompositionSandboxRequestV1>,
) {
  return deepFreezeV1({
    variant: fixture.variant,
    fixtureSha256: fixture.fixtureSha256,
    programId: fixture.program.programId,
    programSha256: request.programHash,
    sourceBundleSha256: request.sourceBundleHash,
    evidencePackSha256: hashCanonicalJsonV1(fixture.evidencePack),
    referenceBlueprintSha256: hashCanonicalJsonV1(fixture.referenceBlueprint),
    draftSha256: adaptation.binding.draftSha256,
    adapterReceiptSha256: adaptation.receipt.receiptSha256,
    sourceBindings: fixture.program.sourceSlots.map(({ slotId, assetId }) => ({
      slotId, assetId,
    })),
    controls: fixture.program.exposedParameters.map(
      ({ parameterId, defaultValue }) => ({ parameterId, defaultValue }),
    ),
  });
}

function sandboxProof(
  request: Readonly<GeneratedCompositionSandboxRequestV1>,
  execution: Readonly<ExecuteGeneratedCompositionSandboxResultV1>,
  hostReceipt: Readonly<GeneratedCompositionSandboxHostReceiptV1>,
  evidence: Readonly<LocalEvidenceV1>,
) {
  return deepFreezeV1({
    requestId: request.requestId,
    requestSha256: hashCanonicalJsonV1(request),
    resultSha256: hashCanonicalJsonV1(execution.workerResult),
    hostReceiptSha256: hostReceipt.receiptHash,
    proxyReceiptSha256: hostReceipt.proxyReceiptHash,
    localizedEvidenceSha256: evidence.evidenceHash,
    snapshotId: hostReceipt.snapshotId,
    snapshotCommit: hostReceipt.appCommit,
    provider: hostReceipt.provider,
    networkPolicy: hostReceipt.networkPolicy,
    persistent: hostReceipt.persistent,
    sandboxDeleted: hostReceipt.sandboxDeleted,
    productionSandbox: hostReceipt.proof.productionSandbox,
    outputMaterialization: hostReceipt.proof.outputMaterialization,
    projectMutation: hostReceipt.proof.projectMutation,
    wallTimeMs: execution.workerResult.wallTimeMs,
    cpuUpperBoundMs: execution.workerResult.cpuUpperBoundMs,
  });
}

function assertSandboxExecution(
  request: Readonly<GeneratedCompositionSandboxRequestV1>,
  executed: Readonly<ExecuteGeneratedCompositionSandboxResultV1>,
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

function assertExecutionIdentity(input: {
  executionId: string;
  createdAt: string;
  sandboxEnvironment: Readonly<{ snapshotId: string; snapshotCommit: string }>;
}): void {
  const createdAt = new Date(input.createdAt);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,139}$/.test(input.executionId)
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

async function readAssetBytes(
  paths: Readonly<Record<string, string>>,
): Promise<ReadonlyMap<string, Buffer>> {
  const entries = await Promise.all(STAGE25_RHC04_ASSET_IDS_V1.map(
    async (assetId) => [assetId, await readRegular(required(paths[assetId], assetId))] as const,
  ));
  return new Map(entries);
}

async function writeControlArtifacts(outputRoot: string, values: {
  initialRequest: unknown;
  initialWorkerResult: unknown;
  initialHostReceipt: unknown;
  correctedRequest: unknown;
  correctedWorkerResult: unknown;
  correctedHostReceipt: unknown;
}) {
  const entries = [
    ['INITIAL_SANDBOX_REQUEST', 'initial-sandbox-request.json', values.initialRequest],
    ['INITIAL_SANDBOX_WORKER_RESULT', 'initial-sandbox-worker-result.json', values.initialWorkerResult],
    ['INITIAL_SANDBOX_HOST_RECEIPT', 'initial-sandbox-host-receipt.json', values.initialHostReceipt],
    ['CORRECTED_SANDBOX_REQUEST', 'corrected-sandbox-request.json', values.correctedRequest],
    ['CORRECTED_SANDBOX_WORKER_RESULT', 'corrected-sandbox-worker-result.json', values.correctedWorkerResult],
    ['CORRECTED_SANDBOX_HOST_RECEIPT', 'corrected-sandbox-host-receipt.json', values.correctedHostReceipt],
  ] as const;
  return Promise.all(entries.map(async ([kind, fileName, value]) => {
    const bytes = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
    await writeFile(path.resolve(outputRoot, fileName), bytes, {
      mode: 0o600, flag: 'wx',
    });
    return {
      kind,
      relativePath: fileName,
      sha256: sha256(bytes),
      byteLength: bytes.length,
    };
  }));
}

function evidenceArtifacts(
  outputRoot: string,
  variant: 'INITIAL' | 'CORRECTED',
  evidence: Readonly<LocalEvidenceV1>,
) {
  return evidence.bindings.map((binding) => ({
    kind: `${variant}_SANDBOX_${binding.kind}`,
    relativePath: safeRelative(outputRoot, binding.localPath),
    sha256: binding.contentSha256,
    byteLength: binding.byteLength,
  }));
}

function onlyBinding(evidence: Readonly<LocalEvidenceV1>, kind: string) {
  const matches = evidence.bindings.filter((binding) => binding.kind === kind);
  if (matches.length !== 1) fail(`LOCAL_EVIDENCE_BINDING_INVALID:${kind}`);
  return matches[0]!;
}

function executionEntry(
  execution: Readonly<ProviderNativeToolExecutionV2R>,
  code: string,
): ProjectGeneratedCompositionEntryV1 {
  const output = jsonRecord(execution.output, `${code}_OUTPUT`);
  return parseProjectGeneratedCompositionEntryV1(output.entry);
}

function executionRevision(
  execution: Readonly<ProviderNativeToolExecutionV2R>,
  code: string,
): string {
  const receipt = jsonRecord(
    jsonRecord(execution.output, `${code}_OUTPUT`).receipt,
    `${code}_RECEIPT`,
  );
  return requiredText(receipt.projectRevision, `${code}_REVISION`);
}

function executionChangedPaths(
  execution: Readonly<ProviderNativeToolExecutionV2R>,
  code: string,
): readonly string[] {
  const receipt = jsonRecord(
    jsonRecord(execution.output, `${code}_OUTPUT`).receipt,
    `${code}_RECEIPT`,
  );
  const proof = jsonRecord(receipt.proof, `${code}_PROOF`);
  if (!Array.isArray(proof.changedPaths)
    || proof.changedPaths.some((value) => typeof value !== 'string')) {
    fail(`${code}_CHANGED_PATHS_INVALID`);
  }
  return proof.changedPaths as string[];
}

function executionCode(execution: Readonly<ProviderNativeToolExecutionV2R>): string {
  return requiredText(jsonRecord(execution.output, 'EXECUTION_OUTPUT').code, 'EXECUTION_CODE');
}

function assertDisposition(
  execution: Readonly<ProviderNativeToolExecutionV2R>,
  expected: ProviderNativeToolExecutionV2R['disposition'],
  code: string,
): void {
  if (execution.disposition !== expected) fail(`${code}_DISPOSITION_DRIFT`);
}

function jsonRecord(value: unknown, code: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${code}_INVALID`);
  return value as JsonRecord;
}

function proposalStateSha(project: Readonly<Project>): string {
  return hashCanonicalJsonV1(projectProposalStateV2R(project));
}

function revisionIdentity(revision: Readonly<ProjectRevisionV1>): string {
  return `project-revision-v1:${hashCanonicalJsonV1(revision)}`;
}

function sandboxEnv(environment: Readonly<{ snapshotId: string; snapshotCommit: string }>) {
  return {
    MG_RENDER_SANDBOX_SNAPSHOT_ID: environment.snapshotId,
    MG_RENDER_SANDBOX_APP_COMMIT: environment.snapshotCommit,
  };
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

async function sha256File(filePath: string): Promise<string> {
  return sha256(await readRegular(filePath));
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${code}_MISSING`);
  return value;
}

function required<T>(value: T | null | undefined, code: string): T {
  if (value === null || value === undefined) fail(`${code}_MISSING`);
  return value;
}

function assertSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(`${code}_SHA_INVALID`);
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function fail(code: string): never {
  throw new Error(`STAGE25_RHC04_RENDERED_GENERATED_${code}`);
}
