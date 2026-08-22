import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { basename, resolve } from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R }
  from './holdout-media-materializer-v2r';
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
  assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2,
} from './sealed-holdout-cohort-v3r2';
import {
  evaluateSealedHoldoutH03TraceV3R3,
  type SealedHoldoutEvaluationReceiptV3R3,
} from './sealed-holdout-evaluator-v2r';
import {
  assertSealedH03ConnectedEpisodeReceiptV3R2,
  type SealedH03ConnectedEpisodeReceiptV3R2,
} from './sealed-holdout-episode-v3r2';
import { SEALED_H03_FONT_PATH_V2R }
  from './sealed-holdout-h03-generated-program-v2r';
import {
  bindSealedH03SourceArtifactsV2R,
  executeSealedH03RenderedHybridMechanicsV2R,
  type SealedH03RenderedHybridMechanicsV2R,
} from './sealed-holdout-h03-rendered-mechanics-v2r';
import {
  assertSealedHoldoutSelectedOperationTraceV3R2,
  type SealedHoldoutSelectedOperationTraceV3R2,
} from './sealed-holdout-trace-v2r';

type SandboxExecutorV3R2 = (
  options: ExecuteGeneratedCompositionSandboxOptionsV1,
) => Promise<ExecuteGeneratedCompositionSandboxResultV1>;

export const SEALED_HOLDOUT_H03_HYBRID_PROOF_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_H03_MODEL_SOURCE_SANDBOX_PROOF_V3R_2' as const;

export interface SealedHoldoutH03HybridProofReceiptV3R2
  extends SealedH03RenderedHybridMechanicsV2R {
  version: typeof SEALED_HOLDOUT_H03_HYBRID_PROOF_VERSION_V3R2;
  authority: 'RESEARCH_MODEL_SOURCE_SANDBOX_RENDERED_HYBRID_PROXY_NO_PROJECT_MUTATION';
  caseId: 'HOLD-03:C1';
  taskId: 'HOLD-03';
  manifestSha256: string;
  publicCaseSha256: string;
  connectedEpisodeReceiptSha256: string;
  providerEpisodeReceiptSha256: string;
  traceArtifactSha256: string;
  evaluationReceiptSha256: string;
  generatedSourceLineage: Readonly<{
    candidateOrdinal: 0 | 1;
    modelId: string;
    promptHash: string;
    orchestratorArgumentsSha256: string;
    ownerAuthorizationOutputSha256: string;
    generationReceiptSha256: string;
    programHash: string;
    sourceBundleHash: string;
  }>;
  sandboxProof: Readonly<{
    provider: 'VERCEL_SANDBOX';
    requestId: string;
    requestHash: string;
    hostReceiptHash: string;
    snapshotId: string;
    appCommit: string;
    workerImplementationHash: string;
    networkPolicy: 'DENY_ALL';
    persistent: false;
    sandboxDeleted: true;
    productionSandbox: 'PASS';
    projectMutation: 'NONE';
  }>;
  assessment: 'PASS_RESEARCH_MODEL_SOURCE_SANDBOX_RENDERED_HYBRID_PROXY';
  stateEffects: readonly [];
  receiptSha256: string;
}

/**
 * Version adapter only: selection and source generation are already complete.
 * This function binds their exact hashes to the existing Vercel Sandbox owner
 * and the sole HOLD-03 decoded-output measurement owner.
 */
export async function proveSealedHoldoutH03HybridOutcomeV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-03:C1';
  connectedEpisode: Readonly<SealedH03ConnectedEpisodeReceiptV3R2>;
  trace: Readonly<SealedHoldoutSelectedOperationTraceV3R2>;
  evaluation: Readonly<SealedHoldoutEvaluationReceiptV3R3>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string;
  executionId: string;
  createdAt: string;
  sandboxEnvironment: Readonly<{ snapshotId: string; snapshotCommit: string }>;
  repoRoot?: string;
  ffprobePath?: string;
  sandboxExecutor?: SandboxExecutorV3R2;
}): Promise<Readonly<SealedHoldoutH03HybridProofReceiptV3R2>> {
  const manifest = assertSealedHoldoutCohortManifestV3R2(input.manifest);
  const connected = assertSealedH03ConnectedEpisodeReceiptV3R2(input.connectedEpisode);
  const trace = assertSealedHoldoutSelectedOperationTraceV3R2(input.trace);
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase || connected.caseId !== input.caseId || trace.caseId !== input.caseId
    || connected.manifestSha256 !== manifest.manifestSha256
    || connected.disposition !== 'SOURCE_CONTRACT_READY_FOR_RENDERED_PROOF'
    || connected.stateEffects.length || trace.stateEffects.length) {
    fail('SEALED_V3R2_H03_PROOF_CASE_OR_STATE_BINDING_INVALID');
  }
  const evaluation = evaluateSealedHoldoutH03TraceV3R3({
    manifest,
    caseId: input.caseId,
    trace,
    connectedEpisode: connected,
  });
  if (hashCanonicalJsonV1(input.evaluation) !== hashCanonicalJsonV1(evaluation)
    || evaluation.assessment !== 'READY_FOR_PROOF'
    || evaluation.executionForm !== 'GENERATED_COMPOSITION'
    || evaluation.stateEffects.length) {
    fail('SEALED_V3R2_H03_PROOF_EVALUATION_DRIFT');
  }
  const accepted = connected.generatedCandidate
    ?? fail('SEALED_V3R2_H03_PROOF_ACCEPTED_SOURCE_MISSING');
  const programHash = accepted.verification.programHash
    ?? fail('SEALED_V3R2_H03_PROOF_PROGRAM_HASH_MISSING');
  const sourceBundleHash = accepted.verification.sourceBundleHash
    ?? fail('SEALED_V3R2_H03_PROOF_SOURCE_HASH_MISSING');
  const generatedNode = trace.nodes.find(({ selectedOperatorId }) =>
    selectedOperatorId === 'generated_composition_program');
  if (!generatedNode || hashCanonicalJsonV1(generatedNode.generatedSourceBinding)
    !== hashCanonicalJsonV1({
      sourceContractStatus: 'CONTRACT_VERIFIED',
      candidateOrdinal: accepted.candidateOrdinal,
      programHash,
      sourceBundleHash,
      modelId: accepted.candidate.program.generator.modelId,
      promptHash: accepted.candidate.program.generator.promptHash,
      orchestratorSpecSha256: accepted.orchestratorArgumentsSha256,
      ownerAuthorizationOutputSha256: accepted.ownerAuthorizationOutputSha256,
      generationReceiptSha256: accepted.generationReceiptSha256,
      renderStatus: 'READY_FOR_BOUNDED_PROXY_RENDER',
      projectMutation: 'NONE',
    })) {
    fail('SEALED_V3R2_H03_PROOF_TRACE_SOURCE_BINDING_DRIFT');
  }

  const publicCase = record(taskCase.publicCase);
  const sources = await bindSealedH03SourceArtifactsV2R({
    mediaManifest: input.mediaManifest,
    publicMedia: publicCase.media,
  });
  const repoRoot = resolve(input.repoRoot ?? process.cwd());
  const apiPath = resolve(
    repoRoot,
    'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx',
  );
  const overlay = await resolveGeneratedCompositionSandboxOverlayV1(repoRoot);
  const [sourceABytes, sourceBBytes, fontBytes, apiImplementationHash] = await Promise.all([
    fs.readFile(sources.sourceA.artifactPath),
    fs.readFile(sources.sourceB.artifactPath),
    fs.readFile(resolve(repoRoot, SEALED_H03_FONT_PATH_V2R)),
    sha256File(apiPath),
  ]);
  const request = buildGeneratedCompositionSandboxRequestV1({
    executionId: input.executionId,
    createdAt: input.createdAt,
    appCommit: input.sandboxEnvironment.snapshotCommit,
    apiImplementationHash,
    workerImplementationHash: overlay.workerImplementationHash,
    ...accepted.candidate,
    proofFrames: [0, 24, 90, 150, 179],
    inputs: [
      { kind: 'SOURCE_MEDIA', bindingId: 'h03-a', fileName: basename(sources.sourceA.artifactPath), bytes: sourceABytes },
      { kind: 'SOURCE_MEDIA', bindingId: 'h03-b', fileName: basename(sources.sourceB.artifactPath), bytes: sourceBBytes },
      { kind: 'FONT', bindingId: 'font-noto-sans-v27-regular', fileName: 'noto-sans-v27-regular.ttf', bytes: fontBytes },
    ],
    resources: {
      wallTimeMs: Math.min(accepted.candidate.program.resourceBudget.maxWallTimeMs, 180_000),
      maxCpuMs: Math.min(accepted.candidate.program.resourceBudget.maxCpuMs, 120_000),
      vcpus: 1,
      memoryMiB: 2_048,
      maxOutputBytes: Math.min(
        accepted.candidate.program.resourceBudget.maxOutputBytes,
        64 * 1_024 * 1_024,
      ),
    },
  });
  if (request.programHash !== programHash || request.sourceBundleHash !== sourceBundleHash) {
    fail('SEALED_V3R2_H03_PROOF_SANDBOX_REQUEST_SOURCE_DRIFT');
  }
  const executeSandbox = input.sandboxExecutor ?? executeGeneratedCompositionInSandboxV1;
  const executed = await executeSandbox({
    request,
    repoRoot,
    env: {
      MG_RENDER_SANDBOX_SNAPSHOT_ID: input.sandboxEnvironment.snapshotId,
      MG_RENDER_SANDBOX_APP_COMMIT: input.sandboxEnvironment.snapshotCommit,
    },
  });
  const host = assertSandboxResult(
    request,
    executed,
    input.sandboxEnvironment.snapshotId,
  );
  const playable = executed.workerResult.status === 'RENDERED'
    ? executed.workerResult.outputs.find(({ kind }) => kind === 'PLAYABLE_PROXY')
    : undefined;
  if (!playable) fail('SEALED_V3R2_H03_PROOF_PLAYABLE_OUTPUT_MISSING');
  const playableBytes = executed.outputBytes[playable.path];
  if (!playableBytes || sha256(playableBytes) !== playable.contentSha256) {
    fail('SEALED_V3R2_H03_PROOF_PLAYABLE_OUTPUT_DRIFT');
  }
  const materializedDirectory = resolve(input.outputDirectory, 'sandbox-output');
  await fs.mkdir(materializedDirectory, { recursive: true });
  const playablePath = resolve(materializedDirectory, 'sealed-holdout-h03-generated-v3r2.mp4');
  await fs.writeFile(playablePath, playableBytes, { mode: 0o600 });
  const mechanics = await executeSealedH03RenderedHybridMechanicsV2R({
    sources,
    generated: {
      programId: accepted.candidate.program.programId,
      programHash,
      sourceBundleHash,
      playableProxyPath: playablePath,
      playableProxySha256: playable.contentSha256,
    },
    outputDirectory: resolve(input.outputDirectory, 'hybrid'),
    outputFilename: 'sealed-holdout-h03-model-source-hybrid-v3r2.mp4',
    ffprobePath: input.ffprobePath,
  });
  const material = {
    version: SEALED_HOLDOUT_H03_HYBRID_PROOF_VERSION_V3R2,
    authority: 'RESEARCH_MODEL_SOURCE_SANDBOX_RENDERED_HYBRID_PROXY_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    taskId: 'HOLD-03' as const,
    manifestSha256: manifest.manifestSha256,
    publicCaseSha256: taskCase.publicCaseSha256,
    connectedEpisodeReceiptSha256: connected.receiptSha256,
    providerEpisodeReceiptSha256: connected.providerEpisode.receiptSha256,
    traceArtifactSha256: trace.artifactSha256,
    evaluationReceiptSha256: evaluation.receiptSha256,
    generatedSourceLineage: {
      candidateOrdinal: accepted.candidateOrdinal,
      modelId: accepted.candidate.program.generator.modelId,
      promptHash: accepted.candidate.program.generator.promptHash,
      orchestratorArgumentsSha256: accepted.orchestratorArgumentsSha256,
      ownerAuthorizationOutputSha256: accepted.ownerAuthorizationOutputSha256,
      generationReceiptSha256: accepted.generationReceiptSha256,
      programHash,
      sourceBundleHash,
    },
    sandboxProof: {
      provider: host.provider,
      requestId: host.requestId,
      requestHash: host.requestHash,
      hostReceiptHash: host.receiptHash,
      snapshotId: host.snapshotId,
      appCommit: host.appCommit,
      workerImplementationHash: host.workerImplementationHash,
      networkPolicy: host.networkPolicy,
      persistent: host.persistent,
      sandboxDeleted: host.sandboxDeleted,
      productionSandbox: host.proof.productionSandbox,
      projectMutation: host.proof.projectMutation,
    },
    ...mechanics,
    assessment: 'PASS_RESEARCH_MODEL_SOURCE_SANDBOX_RENDERED_HYBRID_PROXY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function assertSandboxResult(
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
    || host.networkPolicy !== 'DENY_ALL'
    || host.persistent || !host.sandboxDeleted
    || host.command.exitCode !== 0
    || host.proof.productionSandbox !== 'PASS'
    || host.proof.outputMaterialization !== 'PASS'
    || host.proof.projectMutation !== 'NONE'
    || host.stateEffects.length
    || receiptHash !== hashCanonicalJsonV1(hostMaterial)) {
    fail('SEALED_V3R2_H03_PROOF_SANDBOX_ATTESTATION_DRIFT');
  }
  const expected = new Map(result.outputs.map((output) => [output.path, output]));
  const requestRoot = `/tmp/editron-gcp/${request.requestId}/`;
  if (Object.keys(executed.outputBytes).length !== expected.size
    || result.outputs.some(({ path }) =>
      !path.startsWith(requestRoot) || path.includes('..'))) {
    fail('SEALED_V3R2_H03_PROOF_SANDBOX_OUTPUT_SET_DRIFT');
  }
  for (const [path, bytes] of Object.entries(executed.outputBytes)) {
    const output = expected.get(path);
    if (!output || bytes.byteLength !== output.byteLength
      || sha256(bytes) !== output.contentSha256) {
      fail('SEALED_V3R2_H03_PROOF_SANDBOX_OUTPUT_SET_DRIFT');
    }
  }
  return host;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((done, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', done);
  });
  return hash.digest('hex');
}
function fail(code: string): never { throw new Error(code); }
