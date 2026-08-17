import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  evaluateDev02GeneratedCompositionRenderedProofV1,
  type Dev02GeneratedCompositionRenderedProofV1,
} from './generated-composition-dev02-rendered-proof-v1';
import type { GeneratedCompositionLocalEvidenceV1 } from './generated-composition-local-evidence-v1';
import type { Stage6ResearchProxyExecutionEvidenceV2 } from './stage6-research-proxy-contract-v2';
import { evaluateStage6ResearchProxyExecutionV2 } from './stage6-research-proxy-evaluator-v2';

export interface Dev02VerifiedHybridIslandBindingV2 {
  programHash: string;
  sourceStage4GraphHash: string;
  upstreamStage6ReceiptHash: string;
  hostReceiptHash: string;
  proxyReceiptHash: string;
  localEvidenceHash: string;
  renderedProofHash: string;
  hardGateDisposition: 'PASS';
  videoPath: string;
  videoSha256: string;
}

export interface Dev02HybridIslandUpstreamEvidenceV2 {
  sourceGraph: unknown;
  stage6Evidence: Readonly<Stage6ResearchProxyExecutionEvidenceV2>;
  localEvidence: Readonly<GeneratedCompositionLocalEvidenceV1>;
  renderedProof: Readonly<Dev02GeneratedCompositionRenderedProofV1>;
  boundaryReferencePath: string;
}

/**
 * Verification-only handoff from the existing generated-composition sandbox
 * owner to the existing DEV-02 hybrid renderer. It resolves no creative form.
 */
export async function bindVerifiedDev02HybridIslandV2(
  input: Dev02HybridIslandUpstreamEvidenceV2,
): Promise<Readonly<Dev02VerifiedHybridIslandBindingV2>> {
  const stage6 = evaluateStage6ResearchProxyExecutionV2({
    graph: input.sourceGraph,
    evidence: input.stage6Evidence,
  });
  if (stage6.disposition !== 'PASS') {
    throw new Error(`DEV02_HYBRID_UPSTREAM_STAGE6_INVALID:${stage6.diagnostics.join('|')}`);
  }

  const { receipt, sandboxRequest, sandboxHostReceipt } = input.stage6Evidence;
  if (receipt.taskId !== 'DEV-02' || sandboxRequest.program.taskId !== 'DEV-02') {
    throw new Error('DEV02_HYBRID_UPSTREAM_TASK_INVALID');
  }
  validateLocalEvidence(input.stage6Evidence, input.localEvidence);

  const recomputedProof = await evaluateDev02GeneratedCompositionRenderedProofV1({
    program: sandboxRequest.program,
    proxyReceipt: input.localEvidence.localEvaluationReceipt,
    authoritativeProxyReceiptHash: sandboxHostReceipt.proxyReceiptHash,
    boundaryReferencePath: input.boundaryReferencePath,
    referenceBlueprint: record(record(input.sourceGraph).previewInputBundle).referenceBlueprint,
  });
  if (hashCanonicalJsonV1(recomputedProof) !== hashCanonicalJsonV1(input.renderedProof)
    || recomputedProof.hardGateDisposition !== 'PASS') {
    throw new Error('DEV02_HYBRID_UPSTREAM_RENDERED_PROOF_INVALID');
  }

  const playable = input.localEvidence.localEvaluationReceipt.playableProxy;
  if (!playable) throw new Error('DEV02_HYBRID_UPSTREAM_PLAYABLE_MISSING');
  const videoBytes = await readFile(playable.path);
  if (sha256(videoBytes) !== playable.sha256) {
    throw new Error('DEV02_HYBRID_UPSTREAM_PLAYABLE_HASH_DRIFT');
  }

  return Object.freeze({
    programHash: sandboxRequest.programHash,
    sourceStage4GraphHash: hashCanonicalJsonV1(input.sourceGraph),
    upstreamStage6ReceiptHash: receipt.receiptHash,
    hostReceiptHash: sandboxHostReceipt.receiptHash,
    proxyReceiptHash: sandboxHostReceipt.proxyReceiptHash,
    localEvidenceHash: input.localEvidence.evidenceHash,
    renderedProofHash: recomputedProof.proofHash,
    hardGateDisposition: 'PASS' as const,
    videoPath: playable.path,
    videoSha256: playable.sha256,
  });
}

function validateLocalEvidence(
  stage6: Readonly<Stage6ResearchProxyExecutionEvidenceV2>,
  evidence: Readonly<GeneratedCompositionLocalEvidenceV1>,
): void {
  const { evidenceHash, ...unsignedEvidence } = evidence;
  const localReceipt = evidence.localEvaluationReceipt;
  const { receiptHash: localReceiptHash, ...unsignedLocalReceipt } = localReceipt;
  if (evidenceHash !== hashCanonicalJsonV1(unsignedEvidence)
    || localReceiptHash !== hashCanonicalJsonV1(unsignedLocalReceipt)
    || evidence.requestId !== stage6.sandboxRequest.requestId
    || evidence.hostReceiptHash !== stage6.sandboxHostReceipt.receiptHash
    || evidence.originalProxyReceiptHash !== stage6.sandboxHostReceipt.proxyReceiptHash
    || localReceipt.programHash !== stage6.sandboxRequest.programHash
    || localReceipt.sourceBundleHash !== stage6.sandboxRequest.sourceBundleHash
    || localReceipt.apiImplementationHash !== stage6.sandboxRequest.apiImplementationHash
    || evidence.stateEffects.length || localReceipt.stateEffects.length) {
    throw new Error('DEV02_HYBRID_UPSTREAM_LOCAL_EVIDENCE_INVALID');
  }

  const outputByPath = new Map(stage6.receipt.outputBindings.map((output) => [output.path, output]));
  if (evidence.bindings.length !== outputByPath.size
    || new Set(evidence.bindings.map(({ remotePath }) => remotePath)).size !== evidence.bindings.length) {
    throw new Error('DEV02_HYBRID_UPSTREAM_OUTPUT_SET_INVALID');
  }
  for (const binding of evidence.bindings) {
    const output = outputByPath.get(binding.remotePath);
    const remoteBytes = stage6.outputBytes[binding.remotePath];
    if (!output || !remoteBytes || output.kind !== binding.kind
      || output.contentSha256 !== binding.contentSha256 || output.byteLength !== binding.byteLength
      || sha256(remoteBytes) !== binding.contentSha256 || remoteBytes.byteLength !== binding.byteLength) {
      throw new Error(`DEV02_HYBRID_UPSTREAM_OUTPUT_BINDING_INVALID:${binding.remotePath}`);
    }
    assertInsideWorkspace(localReceipt.workspaceDir, binding.localPath);
  }
  validateLocalArtifactPaths(evidence);
}

function validateLocalArtifactPaths(evidence: Readonly<GeneratedCompositionLocalEvidenceV1>): void {
  const expected = [
    ...evidence.localEvaluationReceipt.stills.map((still) => ({ kind: 'STILL', path: still.path, sha256: still.sha256 })),
    { kind: 'CONTACT_SHEET', path: evidence.localEvaluationReceipt.contactSheet.path, sha256: evidence.localEvaluationReceipt.contactSheet.sha256 },
    { kind: 'PLAYABLE_PROXY', path: evidence.localEvaluationReceipt.playableProxy?.path ?? '', sha256: evidence.localEvaluationReceipt.playableProxy?.sha256 ?? '' },
  ];
  for (const artifact of expected) {
    const binding = evidence.bindings.find(({ kind, localPath }) => kind === artifact.kind && localPath === artifact.path);
    if (!binding || binding.contentSha256 !== artifact.sha256) {
      throw new Error(`DEV02_HYBRID_UPSTREAM_LOCAL_ARTIFACT_INVALID:${artifact.kind}`);
    }
  }
}

function assertInsideWorkspace(workspace: string, filePath: string): void {
  const root = path.resolve(workspace);
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('DEV02_HYBRID_UPSTREAM_LOCAL_PATH_INVALID');
  }
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
