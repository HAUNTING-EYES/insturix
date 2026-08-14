import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import type { GeneratedCompositionProxyReceiptV1 } from './generated-composition-proxy-renderer-v1';
import type {
  GeneratedCompositionSandboxHostReceiptV1,
  GeneratedCompositionSandboxOutputKindV1,
  GeneratedCompositionSandboxWorkerResultV1,
} from './generated-composition-sandbox-contract-v1';

export interface GeneratedCompositionLocalEvidenceV1 {
  artifactType: 'GeneratedCompositionLocalEvidenceV1';
  requestId: string;
  hostReceiptHash: string;
  originalProxyReceiptHash: string;
  localEvaluationReceipt: GeneratedCompositionProxyReceiptV1;
  bindings: readonly {
    kind: GeneratedCompositionSandboxOutputKindV1;
    remotePath: string;
    localPath: string;
    contentSha256: string;
    byteLength: number;
  }[];
  stateEffects: readonly [];
  evidenceHash: string;
}

export async function materializeGeneratedCompositionLocalEvidenceV1(input: {
  candidateRoot: string;
  workerResult: GeneratedCompositionSandboxWorkerResultV1;
  hostReceipt: GeneratedCompositionSandboxHostReceiptV1;
  outputBytes: Readonly<Record<string, Uint8Array>>;
}): Promise<Readonly<GeneratedCompositionLocalEvidenceV1>> {
  const { workerResult, hostReceipt } = input;
  if (workerResult.status !== 'RENDERED') throw new Error('GENERATED_COMPOSITION_LOCAL_EVIDENCE_NOT_RENDERED');
  const { receiptHash: hostReceiptHash, ...hostUnsigned } = hostReceipt;
  if (hostReceiptHash !== hashCanonicalJsonV1(hostUnsigned)
    || hostReceipt.resultHash !== hashCanonicalJsonV1(workerResult)
    || hostReceipt.requestId !== workerResult.requestId
    || hashCanonicalJsonV1(hostReceipt.outputs) !== hashCanonicalJsonV1(workerResult.outputs)) {
    throw new Error('GENERATED_COMPOSITION_LOCAL_EVIDENCE_HOST_BINDING_DRIFT');
  }

  const expectedPaths = new Set(workerResult.outputs.map(({ path: outputPath }) => outputPath));
  if (expectedPaths.size !== workerResult.outputs.length
    || Object.keys(input.outputBytes).length !== expectedPaths.size
    || Object.keys(input.outputBytes).some((outputPath) => !expectedPaths.has(outputPath))) {
    throw new Error('GENERATED_COMPOSITION_LOCAL_EVIDENCE_OUTPUT_SET_DRIFT');
  }

  const remoteRoot = `/tmp/editron-gcp/${workerResult.requestId}/`;
  const candidateRoot = path.resolve(input.candidateRoot);
  const outputParent = path.join(candidateRoot, 'sandbox-outputs');
  const outputRoot = path.join(outputParent, workerResult.requestId);
  await fs.mkdir(outputParent, { recursive: true });
  await fs.mkdir(outputRoot);
  const localPaths = new Map<string, string>();
  for (const output of workerResult.outputs) {
    const relativePath = safeRelativeOutputPath(remoteRoot, output.path);
    const bytes = input.outputBytes[output.path];
    if (!bytes || bytes.byteLength !== output.byteLength || sha256(bytes) !== output.contentSha256) {
      throw new Error(`GENERATED_COMPOSITION_LOCAL_EVIDENCE_OUTPUT_HASH_DRIFT:${output.path}`);
    }
    const localPath = path.resolve(outputRoot, ...relativePath.split('/'));
    if (!localPath.startsWith(outputRoot + path.sep)) throw new Error('GENERATED_COMPOSITION_LOCAL_EVIDENCE_OUTPUT_ESCAPE');
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, bytes, { mode: 0o600 });
    localPaths.set(output.path, localPath);
  }

  const receiptOutputs = workerResult.outputs.filter(({ kind }) => kind === 'PROXY_RECEIPT');
  const playableOutputs = workerResult.outputs.filter(({ kind }) => kind === 'PLAYABLE_PROXY');
  if (receiptOutputs.length !== 1 || playableOutputs.length !== 1) {
    throw new Error('GENERATED_COMPOSITION_LOCAL_EVIDENCE_REQUIRED_OUTPUT_MISSING');
  }
  const originalReceipt = parseOriginalProxyReceipt(input.outputBytes[receiptOutputs[0].path], workerResult.proxyReceiptHash);
  if (!originalReceipt.playableProxy
    || originalReceipt.playableProxy.path !== playableOutputs[0].path
    || originalReceipt.playableProxy.sha256 !== playableOutputs[0].contentSha256) {
    throw new Error('GENERATED_COMPOSITION_LOCAL_EVIDENCE_PLAYABLE_BINDING_DRIFT');
  }

  const { receiptHash: _originalReceiptHash, ...originalUnsigned } = originalReceipt;
  const localUnsigned = {
    ...originalUnsigned,
    stills: originalReceipt.stills.map((still) => ({ ...still, path: requiredPath(localPaths, still.path) })),
    contactSheet: { ...originalReceipt.contactSheet, path: requiredPath(localPaths, originalReceipt.contactSheet.path) },
    playableProxy: { ...originalReceipt.playableProxy, path: requiredPath(localPaths, originalReceipt.playableProxy.path) },
    workspaceDir: outputRoot,
  };
  const localEvaluationReceipt = {
    ...localUnsigned,
    receiptHash: hashCanonicalJsonV1(localUnsigned),
  } satisfies GeneratedCompositionProxyReceiptV1;
  const unsignedEvidence = {
    artifactType: 'GeneratedCompositionLocalEvidenceV1' as const,
    requestId: workerResult.requestId,
    hostReceiptHash,
    originalProxyReceiptHash: originalReceipt.receiptHash,
    localEvaluationReceipt,
    bindings: workerResult.outputs.map((output) => ({
      kind: output.kind,
      remotePath: output.path,
      localPath: requiredPath(localPaths, output.path),
      contentSha256: output.contentSha256,
      byteLength: output.byteLength,
    })),
    stateEffects: [] as const,
  };
  const evidence = Object.freeze({ ...unsignedEvidence, evidenceHash: hashCanonicalJsonV1(unsignedEvidence) });
  await fs.writeFile(path.join(candidateRoot, 'localized-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return evidence;
}

function safeRelativeOutputPath(remoteRoot: string, remotePath: string): string {
  if (!remotePath.startsWith(remoteRoot) || remotePath.includes('\\') || remotePath.includes('..')) {
    throw new Error(`GENERATED_COMPOSITION_LOCAL_EVIDENCE_OUTPUT_PATH_UNSAFE:${remotePath}`);
  }
  const relativePath = path.posix.relative(remoteRoot, remotePath);
  if (!relativePath || relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) {
    throw new Error(`GENERATED_COMPOSITION_LOCAL_EVIDENCE_OUTPUT_PATH_UNSAFE:${remotePath}`);
  }
  return relativePath;
}

function parseOriginalProxyReceipt(bytes: Uint8Array | undefined, expectedHash: string): GeneratedCompositionProxyReceiptV1 {
  if (!bytes) throw new Error('GENERATED_COMPOSITION_LOCAL_EVIDENCE_PROXY_RECEIPT_MISSING');
  let receipt: GeneratedCompositionProxyReceiptV1;
  try { receipt = JSON.parse(Buffer.from(bytes).toString('utf8')) as GeneratedCompositionProxyReceiptV1; }
  catch { throw new Error('GENERATED_COMPOSITION_LOCAL_EVIDENCE_PROXY_RECEIPT_INVALID'); }
  const { receiptHash, ...unsigned } = receipt;
  if (receiptHash !== expectedHash || receiptHash !== hashCanonicalJsonV1(unsigned)) {
    throw new Error('GENERATED_COMPOSITION_LOCAL_EVIDENCE_PROXY_RECEIPT_HASH_DRIFT');
  }
  return receipt;
}

function requiredPath(paths: ReadonlyMap<string, string>, remotePath: string): string {
  const localPath = paths.get(remotePath);
  if (!localPath) throw new Error(`GENERATED_COMPOSITION_LOCAL_EVIDENCE_OUTPUT_MISSING:${remotePath}`);
  return localPath;
}

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
