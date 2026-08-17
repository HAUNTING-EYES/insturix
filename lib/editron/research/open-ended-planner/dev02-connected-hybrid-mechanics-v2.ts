import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { evaluateDev02GeneratedCompositionRenderedProofV1 } from './generated-composition-dev02-rendered-proof-v1';
import { materializeGeneratedCompositionLocalEvidenceV1 } from './generated-composition-local-evidence-v1';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1 } from './generated-composition-research-proxy-capability-v1';
import { compileCanonicalDev02HybridStage4GraphV2 } from './dev02-hybrid-stage4-compiler-v2';
import type { Dev02HybridNativeSourceBindingV2 } from './dev02-hybrid-stage6-contract-v2';
import { evaluateDev02HybridStage6V2 } from './dev02-hybrid-stage6-evaluator-v2';
import { executeDev02HybridStage6V2 } from './dev02-hybrid-stage6-executor-v2';
import { executeStage6ResearchProxyPreviewV2 } from './stage6-research-proxy-executor-v2';
import { getFFmpegPath } from '../../services/media/ffmpeg-runtime';

const execFileAsync = promisify(execFile);

export interface Dev02ConnectedHybridMechanicsResultV2 {
  sourceStage6ReceiptHash: string;
  sourceStage6ReceiptPath: string;
  hybridStage6ReceiptHash: string;
  hybridStage6ReceiptPath: string;
  hybridVideoPath: string;
  diagnostics: readonly string[];
}

/** Orchestrates existing owners only; it does not resolve generated or native form. */
export async function executeConnectedDev02HybridMechanicsV2(input: {
  outputRoot: string;
  runId: string;
  createdAt: string;
  hybridGraph?: unknown;
}): Promise<Readonly<Dev02ConnectedHybridMechanicsResultV2>> {
  const root = path.resolve(input.outputRoot);
  const islandRoot = path.join(root, 'generated-island');
  const hybridRoot = path.join(root, 'hybrid');
  await mkdir(root, { recursive: true });

  const mediaRoot = path.resolve('.calibration-temp/open-ended-planner-v2/development-media');
  const widePath = path.join(mediaRoot, 'dev02-wide.mp4');
  const closePath = path.join(mediaRoot, 'dev02-close.mp4');
  const fontPath = path.resolve('node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf');
  const [wideBytes, closeBytes, fontBytes] = await Promise.all([
    readFile(widePath), readFile(closePath), readFile(fontPath),
  ]);

  const hybridGraph = input.hybridGraph ?? compileCanonicalDev02HybridStage4GraphV2();
  const sourceGraph = record(hybridGraph).sourceIslandGraph;
  if (!sourceGraph || typeof sourceGraph !== 'object' || Array.isArray(sourceGraph)) {
    throw new Error('DEV02_CONNECTED_MECHANICS_SOURCE_ISLAND_GRAPH_MISSING');
  }
  const capability = DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1;
  const stage6Evidence = await executeStage6ResearchProxyPreviewV2({
    graph: sourceGraph,
    operatorId: 'admin',
    executionId: `${input.runId}-dev02-island`,
    createdAt: input.createdAt,
    repoRoot: path.resolve('.'),
    materializedInputs: [
      { kind: 'SOURCE_MEDIA', bindingId: 'dev02-wide', fileName: 'dev02-wide.mp4', bytes: wideBytes },
      { kind: 'SOURCE_MEDIA', bindingId: 'dev02-close', fileName: 'dev02-close.mp4', bytes: closeBytes },
      { kind: 'FONT', bindingId: 'font-noto-sans-v27-regular', fileName: 'noto-sans.ttf', bytes: fontBytes },
    ],
    sandboxEnvironment: {
      snapshotId: capability.implementation.snapshotId,
      snapshotCommit: capability.implementation.snapshotCommit,
    },
  });
  const localEvidence = await materializeGeneratedCompositionLocalEvidenceV1({
    candidateRoot: islandRoot,
    workerResult: stage6Evidence.workerResult,
    hostReceipt: stage6Evidence.sandboxHostReceipt,
    outputBytes: stage6Evidence.outputBytes,
  });
  const boundaryReferencePath = path.join(root, 'boundary-source-frame-0180.png');
  await execFileAsync(getFFmpegPath(), [
    '-y', '-v', 'error', '-i', closePath,
    '-vf', 'select=eq(n\\,180),scale=1080:1920:flags=lanczos', '-frames:v', '1', boundaryReferencePath,
  ], { windowsHide: true, timeout: 60_000 });
  const renderedProof = await evaluateDev02GeneratedCompositionRenderedProofV1({
    program: stage6Evidence.sandboxRequest.program,
    proxyReceipt: localEvidence.localEvaluationReceipt,
    authoritativeProxyReceiptHash: localEvidence.originalProxyReceiptHash,
    boundaryReferencePath,
    referenceBlueprint: record(record(sourceGraph).previewInputBundle).referenceBlueprint,
  });
  if (renderedProof.hardGateDisposition !== 'PASS') {
    throw new Error('DEV02_CONNECTED_MECHANICS_GENERATED_PROOF_NOT_PASS');
  }

  const sourceStage6ReceiptPath = path.join(islandRoot, 'stage6-research-proxy-receipt-v2.json');
  await Promise.all([
    writeJson(sourceStage6ReceiptPath, stage6Evidence.receipt),
    writeJson(path.join(islandRoot, 'sandbox-host-receipt.json'), stage6Evidence.sandboxHostReceipt),
    writeJson(path.join(islandRoot, 'sandbox-worker-result.json'), stage6Evidence.workerResult),
    writeJson(path.join(islandRoot, 'rendered-proof.json'), renderedProof),
  ]);

  const closeHash = sha256(closeBytes);
  const nativeSource: Dev02HybridNativeSourceBindingV2 = {
    assetId: 'dev02-close', assetVersion: `sha256:${closeHash}`,
    videoPath: closePath, videoSha256: closeHash,
    sourceStartFrame: 180, sourceEndExclusiveFrame: 345,
    projectStartFrame: 180, projectEndExclusiveFrame: 345,
  };
  const hybridEvidence = await executeDev02HybridStage6V2({
    graph: hybridGraph,
    executionId: `${input.runId}-dev02-hybrid`,
    createdAt: input.createdAt,
    outputDir: hybridRoot,
    islandUpstream: { sourceGraph, stage6Evidence, localEvidence, renderedProof, boundaryReferencePath },
    nativeSource,
  });
  const hybridEvaluation = await evaluateDev02HybridStage6V2({ graph: hybridGraph, evidence: hybridEvidence });
  if (hybridEvaluation.assessment !== 'PASS') {
    throw new Error(`DEV02_CONNECTED_MECHANICS_HYBRID_NOT_PASS:${hybridEvaluation.diagnostics.join('|')}`);
  }
  const hybridVideo = hybridEvidence.receipt.artifacts.find(({ artifactId }) => artifactId === 'FULL_HYBRID_PROXY');
  if (!hybridVideo) throw new Error('DEV02_CONNECTED_MECHANICS_HYBRID_VIDEO_MISSING');
  return Object.freeze({
    sourceStage6ReceiptHash: stage6Evidence.receipt.receiptHash,
    sourceStage6ReceiptPath,
    hybridStage6ReceiptHash: hybridEvidence.receipt.receiptHash,
    hybridStage6ReceiptPath: hybridEvidence.receiptPath,
    hybridVideoPath: hybridVideo.path,
    diagnostics: hybridEvaluation.diagnostics,
  });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
