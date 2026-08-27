import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
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
  executeStage25Rhc02HybridAvMechanicsV1,
  type Stage25Rhc02HybridAvMechanicsInputV1,
  type Stage25Rhc02HybridAvMechanicsReceiptV1,
} from './stage25-rhc02-hybrid-av-mechanics-v1';
import {
  materializeStage25Rhc02PreviewMediaFixtureV2,
} from './stage25-rhc02-preview-media-fixture-v2';
import { buildRhc02GeneratedCompositionFixtureV2 }
  from '@/tests/fixtures/editron/open-ended-planner-v2/rhc02-generated-composition-fixture-v2';

type SandboxExecutorV1 = (
  options: ExecuteGeneratedCompositionSandboxOptionsV1,
) => Promise<ExecuteGeneratedCompositionSandboxResultV1>;
type MechanicsExecutorV1 = (
  input: Readonly<Stage25Rhc02HybridAvMechanicsInputV1>,
) => Promise<Readonly<Stage25Rhc02HybridAvMechanicsReceiptV1>>;

const FIXTURE_CREATED_AT = '2026-08-27T05:30:00.000Z';
const EXPECTED = deepFreezeV1({
  mediaReceiptSha256: '5b1053bc3bf0146e1550bb1f1c98f025bbed818477b1fe99481731d0f5f921ca',
  programSha256: 'e9eccd5ce966de6924ec9b2c1936214e5bbc52f6a0eff0594fe44c603f399852',
  sourceBundleSha256: 'ba1ec8f349a652e829faf1d6d2fd6d8837f0875b03b1ae9836f041d7dfa445c3',
  evidencePackSha256: '57e88b09e1ae5dcfe4855be4fc34e849b56fe7607b18f091c927407344b3a705',
  sourceRightsReceiptsSha256: 'aeb63e119bb3d4ca818781914b136617924511ba0319c162658bc0c8a1f2a68b',
  referenceBlueprintSha256: 'f856cd51dcac899648d51911f928ed23e97c2e6ea3ea409fccfdf183e71ada63',
  apiImplementationSha256: 'ee2468e25c67987e466abaee1e1ef18b0e7caa08c48875b8c52b66ee0382e4bc',
  workerImplementationSha256: '4d392654882a1b067dcf3b510add92c79b519a596e8e833ca75526f50922a79d',
  draftSha256: 'f0eb5a241cf52728b71b3229295f30fa349b94bbf82dbd9d2da4e9d5cb92843e',
  adapterReceiptSha256: '2a18583574f189ab2fe31b2b5f177f07d724a3ece460a2fa3ca0f449db288a3d',
  sandboxSnapshotId: 'snap_FuRFrHL9WE4IgNXjhWjMxeWZP9mW',
  sandboxSnapshotCommit: 'eb896ffbd8927621a77c4bd4073dad2a1119876d',
  sandboxCapabilityPredecessorReceiptSha256:
    'a182c3a7eb29909e837ed8da515feb89ab9d0123497cf6e7b522e5f3b609d1c6',
  currentHashQualificationRequestId:
    '7f21a8af41bca785c4814f6744ccb192d81c71037d17ca5ea160e4ef834bfe7a',
  currentHashQualificationHostReceiptSha256:
    'e1426a7b83b3f1acb637a6c577641e87b6454c98873bdaefb6c3203439326c03',
});

export const STAGE25_RHC02_RENDERED_HYBRID_PROOF_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC02_RENDERED_HYBRID_PROOF_V1' as const;

export async function executeStage25Rhc02RenderedHybridProofV1(input: {
  outputDirectory: string;
  executionId: string;
  createdAt: string;
  sandboxEnvironment: Readonly<{ snapshotId: string; snapshotCommit: string }>;
  repoRoot?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  sandboxExecutor?: SandboxExecutorV1;
  mechanicsExecutor?: MechanicsExecutorV1;
}) {
  assertExecutionIdentity(input);
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const outputRoot = await createNewOutputDirectory(input.outputDirectory);
  const media = await materializeStage25Rhc02PreviewMediaFixtureV2({
    outputDir: path.resolve(outputRoot, 'media'),
    createdAt: FIXTURE_CREATED_AT,
  });
  const fixture = buildRhc02GeneratedCompositionFixtureV2(media);
  const apiPath = path.resolve(
    repoRoot,
    'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx',
  );
  const [apiImplementationHash, overlay, stillA, stillB, font] = await Promise.all([
    sha256File(apiPath),
    resolveGeneratedCompositionSandboxOverlayV1(repoRoot),
    readRegular(media.hostPaths.assetPaths['rhc02-still-a']),
    readRegular(media.hostPaths.assetPaths['rhc02-still-b']),
    readRegular(media.hostPaths.fontPath),
  ]);
  const adaptation = adaptGeneratedCompositionProgramToProjectDraftV1({
    verificationInput: fixture,
    sourceRightsReceipts: media.provenance,
    compositionId: 'rhc02-chapter-card',
    runtimeDigestSha256: apiImplementationHash,
    generatorBinding: { kind: 'HUMAN_AUTHORED', authorId: 'rhc02-proposal-user' },
  });
  assertAcceptedIdentities({
    mediaReceiptSha256: media.receiptSha256,
    programSha256: adaptation.binding.programSha256,
    sourceBundleSha256: adaptation.binding.sourceBundleSha256,
    evidencePackSha256: adaptation.binding.evidencePackSha256,
    sourceRightsReceiptsSha256: adaptation.binding.sourceRightsReceiptsSha256,
    referenceBlueprintSha256: adaptation.binding.referenceBlueprintSha256,
    apiImplementationSha256: apiImplementationHash,
    workerImplementationSha256: overlay.workerImplementationHash,
    draftSha256: adaptation.binding.draftSha256,
    adapterReceiptSha256: adaptation.receipt.receiptSha256,
  });

  const request = buildGeneratedCompositionSandboxRequestV1({
    executionId: input.executionId,
    createdAt: input.createdAt,
    appCommit: input.sandboxEnvironment.snapshotCommit,
    apiImplementationHash,
    workerImplementationHash: overlay.workerImplementationHash,
    program: fixture.program,
    sourceBundle: fixture.sourceBundle,
    evidencePack: fixture.evidencePack,
    referenceBlueprint: fixture.referenceBlueprint,
    supplementalFacts: fixture.supplementalFacts,
    proofFrames: [0, 29, 44, 45, 60, 89],
    inputs: [
      {
        kind: 'SOURCE_MEDIA', bindingId: 'rhc02-still-a',
        fileName: path.basename(media.hostPaths.assetPaths['rhc02-still-a']), bytes: stillA,
      },
      {
        kind: 'SOURCE_MEDIA', bindingId: 'rhc02-still-b',
        fileName: path.basename(media.hostPaths.assetPaths['rhc02-still-b']), bytes: stillB,
      },
      {
        kind: 'FONT', bindingId: 'rhc02-licensed-title',
        fileName: path.basename(media.hostPaths.fontPath), bytes: font,
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
  const executeSandbox = input.sandboxExecutor ?? executeGeneratedCompositionInSandboxV1;
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
  const materialized = await materializeSandboxOutputs(outputRoot, request.requestId, executed);
  const mechanics = await (input.mechanicsExecutor ?? executeStage25Rhc02HybridAvMechanicsV1)({
    interviewPath: media.hostPaths.assetPaths['rhc02-interview'],
    interviewSha256: requiredAssetSha(media.assets, 'rhc02-interview'),
    nativeAudioBaselinePath: media.hostPaths.audioBaselinePath,
    nativeAudioBaselinePcmSha256: media.audioBaseline.mixedPcmSha256,
    generatedPlayableProxyPath: materialized.playablePath,
    generatedPlayableProxySha256: materialized.playableSha256,
    outputDirectory: path.resolve(outputRoot, 'hybrid'),
    ffmpegPath: input.ffmpegPath,
    ffprobePath: input.ffprobePath,
  });
  const { hostPaths: mechanicsHostPaths, ...portableMechanics } = mechanics;
  const controlArtifacts = await writeControlArtifacts(outputRoot, {
    request,
    workerResult: executed.workerResult,
    hostReceipt,
  });
  const portable = {
    version: STAGE25_RHC02_RENDERED_HYBRID_PROOF_VERSION_V1,
    artifactType: 'Stage25Rhc02RenderedHybridProofReceiptV1' as const,
    authority: 'RHC02_RESEARCH_SANDBOX_AND_NATIVE_AV_PROOF_NO_PROJECT_MUTATION' as const,
    taskId: 'RHC-02' as const,
    executionId: input.executionId,
    createdAt: input.createdAt,
    frozenTarget: {
      projectRange: { startFrame: 300 as const, endExclusiveFrame: 390 as const },
      generatedLocalRange: { startFrame: 0 as const, endExclusiveFrame: 90 as const },
      proofWindow: { startFrame: 270 as const, endExclusiveFrame: 420 as const },
      returnFrame: { projectFrame: 390 as const, interviewSourceFrame: 390 as const },
    },
    mediaEvidence: {
      mediaReceiptSha256: media.receiptSha256,
      predecessorMediaReceiptSha256: media.correction.predecessorReceiptSha256,
      fontSha256: media.font.sha256,
      fontFamily: media.font.family,
      fontFace: media.font.face,
      fontWeight: media.font.weight,
      fontMetadataProof: media.fontMetadataProof,
    },
    generatedProgram: {
      programId: fixture.program.programId,
      programSha256: request.programHash,
      sourceBundleSha256: request.sourceBundleHash,
      evidencePackSha256: adaptation.binding.evidencePackSha256,
      referenceBlueprintSha256: adaptation.binding.referenceBlueprintSha256,
      sourceRightsReceiptsSha256: adaptation.binding.sourceRightsReceiptsSha256,
      apiImplementationSha256: apiImplementationHash,
      workerImplementationSha256: overlay.workerImplementationHash,
      exactTitle: 'How we shipped it' as const,
      sourceBindings: ['rhc02-still-a', 'rhc02-still-b'] as const,
      sandboxInputKinds: ['STILL_IMAGE', 'STILL_IMAGE', 'FONT'] as const,
      nativeInterviewOrAudioSentToSandbox: false as const,
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
        currentWorkerImplementationSha256: EXPECTED.workerImplementationSha256,
      },
      requestId: request.requestId,
      requestSha256: hashCanonicalJsonV1(request),
      resultSha256: hashCanonicalJsonV1(executed.workerResult),
      hostReceiptSha256: hostReceipt.receiptHash,
      proxyReceiptSha256: hostReceipt.proxyReceiptHash,
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
    hybridAvProof: portableMechanics,
    routeDisposition: {
      native: 'CAPABILITY_GAP_EXACT_PRODUCT_FONT_BINDING_UNPROVED' as const,
      generatedOnly: 'CAPABILITY_GAP_PLAYABLE_NATIVE_AUDIO_OWNERSHIP_ABSENT' as const,
      hybrid: 'TECHNICAL_RENDER_PASS_HUMAN_QUALITY_UNJUDGED' as const,
    },
    localEvidenceArtifacts: [
      ...controlArtifacts,
      ...materialized.artifacts,
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
  const receiptPath = path.resolve(outputRoot, 'rhc02-rendered-hybrid-proof-v1.json');
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { encoding: 'utf8', mode: 0o600 });
  return deepFreezeV1({
    receipt,
    request,
    hostPaths: {
      outputRoot,
      receiptPath,
      sandboxPlayablePath: materialized.playablePath,
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
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (key.startsWith('sandbox') || key.startsWith('currentHashQualification')) continue;
    if (actual[key] !== expected) fail(`ACCEPTED_IDENTITY_DRIFT:${key}`);
  }
}

function assertSandboxExecution(
  request: ReturnType<typeof buildGeneratedCompositionSandboxRequestV1>,
  executed: ExecuteGeneratedCompositionSandboxResultV1,
  expectedSnapshotId: string,
): Readonly<GeneratedCompositionSandboxHostReceiptV1> {
  const result = parseGeneratedCompositionSandboxWorkerResultV1(executed.workerResult);
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
    || host.networkPolicy !== 'DENY_ALL' || host.persistent || !host.sandboxDeleted
    || host.command.exitCode !== 0 || host.proof.productionSandbox !== 'PASS'
    || host.proof.outputMaterialization !== 'PASS'
    || host.proof.projectMutation !== 'NONE' || host.stateEffects.length
    || receiptHash !== hashCanonicalJsonV1(hostMaterial)) {
    fail('SANDBOX_ATTESTATION_DRIFT');
  }
  const outputs = new Map(result.outputs.map((output) => [output.path, output]));
  const root = `/tmp/editron-gcp/${request.requestId}/`;
  if (outputs.size !== result.outputs.length
    || Object.keys(executed.outputBytes).length !== outputs.size
    || result.outputs.some(({ path: outputPath }) =>
      !outputPath.startsWith(root) || outputPath.includes('..'))) {
    fail('SANDBOX_OUTPUT_SET_DRIFT');
  }
  for (const [outputPath, bytes] of Object.entries(executed.outputBytes)) {
    const output = outputs.get(outputPath);
    if (!output || output.byteLength !== bytes.byteLength
      || output.contentSha256 !== sha256(bytes)) fail('SANDBOX_OUTPUT_SET_DRIFT');
  }
  return host;
}

async function materializeSandboxOutputs(
  outputRoot: string,
  requestId: string,
  executed: ExecuteGeneratedCompositionSandboxResultV1,
) {
  const sandboxRoot = path.resolve(outputRoot, 'sandbox-output');
  await mkdir(sandboxRoot);
  const remoteRoot = `/tmp/editron-gcp/${requestId}/`;
  const artifacts = [] as Array<{
    kind: string;
    relativePath: string;
    sha256: string;
    byteLength: number;
  }>;
  let playablePath = '';
  let playableSha256 = '';
  if (executed.workerResult.status !== 'RENDERED') fail('SANDBOX_RESULT_NOT_RENDERED');
  for (const output of executed.workerResult.outputs) {
    const relativeRemote = path.posix.relative(remoteRoot, output.path);
    if (!relativeRemote || relativeRemote.startsWith('../') || path.posix.isAbsolute(relativeRemote)) {
      fail('SANDBOX_OUTPUT_PATH_UNSAFE');
    }
    const localPath = path.resolve(sandboxRoot, ...relativeRemote.split('/'));
    if (!localPath.startsWith(sandboxRoot + path.sep)) fail('SANDBOX_OUTPUT_PATH_UNSAFE');
    const bytes = executed.outputBytes[output.path];
    if (!bytes) fail('SANDBOX_OUTPUT_BYTES_MISSING');
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, bytes, { mode: 0o600 });
    artifacts.push({
      kind: `SANDBOX_${output.kind}`,
      relativePath: path.relative(outputRoot, localPath).split(path.sep).join('/'),
      sha256: output.contentSha256,
      byteLength: output.byteLength,
    });
    if (output.kind === 'PLAYABLE_PROXY') {
      if (playablePath) fail('SANDBOX_PLAYABLE_DUPLICATE');
      playablePath = localPath;
      playableSha256 = output.contentSha256;
    }
  }
  if (!playablePath) fail('SANDBOX_PLAYABLE_MISSING');
  artifacts.sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));
  return { artifacts, playablePath, playableSha256 };
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
    await writeFile(path.resolve(outputRoot, fileName), bytes, { mode: 0o600 });
    return { kind, relativePath: fileName, sha256: sha256(bytes), byteLength: bytes.length };
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
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) fail('INPUT_FILE_INVALID');
  return readFile(filePath);
}

function requiredAssetSha(
  assets: readonly Readonly<{ assetId: string; sha256: string }>[],
  assetId: string,
): string {
  const matches = assets.filter((asset) => asset.assetId === assetId);
  if (matches.length !== 1 || !/^[a-f0-9]{64}$/.test(matches[0]!.sha256)) {
    return fail(`ASSET_IDENTITY_INVALID:${assetId}`);
  }
  return matches[0]!.sha256;
}

async function sha256File(filePath: string): Promise<string> {
  return sha256(await readRegular(filePath));
}
function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function compareCodeUnits(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
function fail(code: string): never {
  throw new Error(`STAGE25_RHC02_RENDERED_HYBRID_${code}`);
}
