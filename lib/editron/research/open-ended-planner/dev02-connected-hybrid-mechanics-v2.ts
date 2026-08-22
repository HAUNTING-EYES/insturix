import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  evaluateDev02GeneratedCompositionRenderedProofV1,
  type Dev02GeneratedCompositionRenderedProofV1,
} from './generated-composition-dev02-rendered-proof-v1';
import { buildCurrentDev02HybridResearchGraphV2 } from './dev02-current-hybrid-research-graph-v2';
import { materializeGeneratedCompositionLocalEvidenceV1 } from './generated-composition-local-evidence-v1';
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

  const hybridGraph = input.hybridGraph ?? buildCurrentDev02HybridResearchGraphV2();
  const sourceGraph = record(hybridGraph).sourceIslandGraph;
  if (!sourceGraph || typeof sourceGraph !== 'object' || Array.isArray(sourceGraph)) {
    throw new Error('DEV02_CONNECTED_MECHANICS_SOURCE_ISLAND_GRAPH_MISSING');
  }
  // The verified graph owns the execution identity. A host-side capability
  // constant could silently mismatch a historical or requalified graph.
  const implementation = record(record(sourceGraph).capabilityPromotion).implementation;
  if (!implementation || typeof implementation !== 'object' || Array.isArray(implementation)) {
    throw new Error('DEV02_CONNECTED_MECHANICS_CAPABILITY_IMPLEMENTATION_MISSING');
  }
  const sandboxIdentity = record(implementation);
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
      snapshotId: text(sandboxIdentity.snapshotId),
      snapshotCommit: text(sandboxIdentity.snapshotCommit),
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
  const sourceStage6ReceiptPath = path.join(islandRoot, 'stage6-research-proxy-receipt-v2.json');
  await Promise.all([
    writeJson(sourceStage6ReceiptPath, stage6Evidence.receipt),
    writeJson(path.join(islandRoot, 'sandbox-host-receipt.json'), stage6Evidence.sandboxHostReceipt),
    writeJson(path.join(islandRoot, 'sandbox-worker-result.json'), stage6Evidence.workerResult),
    writeJson(path.join(islandRoot, 'rendered-proof.json'), renderedProof),
  ]);
  if (renderedProof.hardGateDisposition !== 'PASS') {
    throw new Error(summarizeDev02RenderedProofFailureV2(renderedProof));
  }

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

export function summarizeDev02RenderedProofFailureV2(
  proof: Pick<Dev02GeneratedCompositionRenderedProofV1, 'checks'>,
): string {
  const failed = proof.checks
    .filter(({ status }) => status === 'FAIL')
    .map(({ checkId, metrics }) => `${checkId}:${JSON.stringify(metrics)}`);
  const detail = (failed.length ? failed : ['UNKNOWN_HARD_GATE']).join('|').slice(0, 420);
  return `DEV02_CONNECTED_MECHANICS_GENERATED_PROOF_NOT_PASS:${detail}`;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
