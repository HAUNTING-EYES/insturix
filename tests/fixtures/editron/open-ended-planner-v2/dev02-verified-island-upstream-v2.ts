import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import sharp, { type OverlayOptions } from 'sharp';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { evaluateDev02GeneratedCompositionRenderedProofV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-dev02-rendered-proof-v1';
import { materializeGeneratedCompositionLocalEvidenceV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-local-evidence-v1';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1 } from '@/lib/editron/research/open-ended-planner/generated-composition-research-proxy-capability-v1';
import {
  GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1,
  buildGeneratedCompositionSandboxHostReceiptV1,
  type GeneratedCompositionSandboxRequestV1,
  type GeneratedCompositionSandboxWorkerResultV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-contract-v1';
import { compileCanonicalStage4ResearchProxyPreviewV2 } from '@/lib/editron/research/open-ended-planner/stage4-research-proxy-compiler-v2';
import { executeStage6ResearchProxyPreviewV2 } from '@/lib/editron/research/open-ended-planner/stage6-research-proxy-executor-v2';

export async function buildDev02VerifiedIslandUpstreamFixtureV2(input: {
  root: string;
  playableBytes?: Uint8Array;
  boundaryFrameBytes?: Uint8Array;
  graph?: unknown;
}) {
  const graph = input.graph ?? compileCanonicalStage4ResearchProxyPreviewV2();
  const mediaRoot = path.resolve('.calibration-temp/open-ended-planner-v2/development-media');
  const materializedInputs = await Promise.all([
    readInput('SOURCE_MEDIA', 'dev02-wide', 'dev02-wide.mp4', path.join(mediaRoot, 'dev02-wide.mp4')),
    readInput('SOURCE_MEDIA', 'dev02-close', 'dev02-close.mp4', path.join(mediaRoot, 'dev02-close.mp4')),
    readInput('FONT', 'font-noto-sans-v27-regular', 'noto-sans.ttf', path.resolve('node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf')),
  ]);
  const rendered = await renderEvidenceBytes(input.playableBytes, input.boundaryFrameBytes);
  const stage6Evidence = await executeStage6ResearchProxyPreviewV2({
    graph, operatorId: 'admin', executionId: 'dev02-upstream-binding-test',
    createdAt: '2026-08-16T00:00:00.000Z', materializedInputs,
    sandboxEnvironment: promotedSandbox(),
    sandboxExecutor: async ({ request }) => sandboxFixture(request, rendered),
  });
  const localEvidence = await materializeGeneratedCompositionLocalEvidenceV1({
    candidateRoot: path.join(input.root, 'candidate'),
    workerResult: stage6Evidence.workerResult,
    hostReceipt: stage6Evidence.sandboxHostReceipt,
    outputBytes: stage6Evidence.outputBytes,
  });
  const boundaryReferencePath = path.join(input.root, 'boundary.png');
  await fs.writeFile(boundaryReferencePath, rendered.finalFrame);
  const renderedProof = await evaluateDev02GeneratedCompositionRenderedProofV1({
    program: stage6Evidence.sandboxRequest.program,
    proxyReceipt: localEvidence.localEvaluationReceipt,
    authoritativeProxyReceiptHash: localEvidence.originalProxyReceiptHash,
    boundaryReferencePath,
    referenceBlueprint: record(record(graph).previewInputBundle).referenceBlueprint,
  });
  if (renderedProof.hardGateDisposition !== 'PASS') throw new Error('DEV02_VERIFIED_FIXTURE_PROOF_FAILED');
  return { sourceGraph: graph, stage6Evidence, localEvidence, renderedProof, boundaryReferencePath };
}

async function readInput(kind: 'SOURCE_MEDIA' | 'FONT', bindingId: string, fileName: string, filePath: string) {
  return { kind, bindingId, fileName, bytes: await fs.readFile(filePath) };
}

async function renderEvidenceBytes(playableBytes?: Uint8Array, boundaryFrameBytes?: Uint8Array) {
  const canvas = { width: 1080, height: 1920 };
  const settled = await renderPanels(canvas, { centreY: 640, sidesY: 0, settled: true });
  const finalFrame = boundaryFrameBytes ?? await renderFinal(canvas);
  return {
    stills: new Map<number, Uint8Array>([
      [0, await renderPanels(canvas, { centreY: 1740, sidesY: -600, settled: false })],
      [24, await renderPanels(canvas, { centreY: 1450, sidesY: -400, settled: false })],
      [108, settled], [144, settled], [145, settled], [179, finalFrame],
    ]),
    finalFrame,
    contactSheet: await solid(810, 960, '#101010'),
    playable: playableBytes ?? Buffer.from('verified-playable-proxy'),
  };
}

function sandboxFixture(
  request: GeneratedCompositionSandboxRequestV1,
  rendered: Awaited<ReturnType<typeof renderEvidenceBytes>>,
) {
  const workspace = `/tmp/editron-gcp/${request.requestId}/proxy`;
  const stills = [...rendered.stills].map(([frame, bytes]) => ({
    frame, path: `${workspace}/stills/frame-${String(frame).padStart(4, '0')}.png`,
    sha256: sha(bytes), width: 1080, height: 1920,
  }));
  const contactSheet = { path: `${workspace}/contact-sheet.png`, sha256: sha(rendered.contactSheet), width: 810, height: 960 };
  const playableProxy = {
    path: `${workspace}/playable-proxy.mp4`, sha256: sha(rendered.playable), container: 'MP4' as const,
    codec: 'H264' as const, pixelFormat: 'YUV420P' as const,
    color: { space: 'BT709' as const, transfer: 'BT709' as const, primaries: 'BT709' as const, range: 'LIMITED' as const },
    audio: 'ABSENT' as const, width: 1080, height: 1920,
    frameRate: { numerator: '30', denominator: '1' }, durationInFrames: 180,
  };
  const unsignedProxy = {
    artifactType: 'GeneratedCompositionProxyReceiptV1' as const,
    executionClass: 'VERIFIED_PROGRAM_DENY_ALL_SANDBOX_PROCESS' as const,
    securityDisposition: 'HOST_ATTESTATION_REQUIRED' as const,
    programHash: request.programHash, sourceBundleHash: request.sourceBundleHash,
    apiImplementationHash: request.apiImplementationHash,
    composition: { width: 1080, height: 1920, fps: 30, durationInFrames: 180 },
    stills, contactSheet, playableProxy,
    proof: { contract: 'PASS' as const, materializedInputs: 'PASS' as const, compile: 'PASS' as const, renderedEvidence: 'CAPTURED_UNJUDGED' as const, productionSandbox: 'HOST_ATTESTATION_REQUIRED' as const },
    stateEffects: [] as const, workspaceDir: workspace,
  };
  const proxyReceipt = { ...unsignedProxy, receiptHash: hashCanonicalJsonV1(unsignedProxy) };
  const receiptPath = `${workspace}/receipt.json`;
  const outputBytes: Record<string, Uint8Array> = Object.fromEntries([
    ...stills.map((still) => [still.path, rendered.stills.get(still.frame)!]),
    [contactSheet.path, rendered.contactSheet], [playableProxy.path, rendered.playable],
    [receiptPath, Buffer.from(JSON.stringify(proxyReceipt))],
  ]);
  const workerResult: GeneratedCompositionSandboxWorkerResultV1 = {
    version: GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1, requestId: request.requestId,
    executionId: request.executionId, appCommit: request.appCommit, programHash: request.programHash,
    sourceBundleHash: request.sourceBundleHash, completedAt: '2026-08-16T00:00:01.000Z',
    wallTimeMs: 1_000, cpuUpperBoundMs: 1_000, stateEffects: [], status: 'RENDERED',
    proxyReceiptHash: proxyReceipt.receiptHash,
    outputs: Object.entries(outputBytes).map(([outputPath, bytes]) => ({
      kind: outputPath === receiptPath ? 'PROXY_RECEIPT' as const
        : outputPath.endsWith('contact-sheet.png') ? 'CONTACT_SHEET' as const
          : outputPath.endsWith('playable-proxy.mp4') ? 'PLAYABLE_PROXY' as const : 'STILL' as const,
      path: outputPath, contentSha256: sha(bytes), byteLength: bytes.byteLength,
    })),
  };
  const receipt = buildGeneratedCompositionSandboxHostReceiptV1({
    request, result: workerResult, snapshotId: promotedSandbox().snapshotId,
    sandboxDeleted: true, networkPolicy: 'DENY_ALL', persistent: false,
    command: { exitCode: 0, stdout: 'ok', stderr: '' }, outputBytes,
  });
  return { receipt, workerResult, outputBytes };
}

async function renderPanels(canvas: { width: number; height: number }, input: { centreY: number; sidesY: number; settled: boolean }) {
  const gutter = 10; const half = gutter / 2; const column = canvas.width / 3; const layers: OverlayOptions[] = [];
  const panel = async (left: number, top: number, width: number, height: number, color: string) => layers.push({ input: await solid(width - gutter, height - gutter, color), left: Math.round(left + half), top: Math.round(top + half) });
  await panel(0, input.sidesY, column, canvas.height / 2, '#304060');
  await panel(0, input.sidesY + canvas.height / 2, column, canvas.height / 2, '#704060');
  await panel(column, input.centreY, column, canvas.height / 3, '#503060');
  await panel(column * 2, input.sidesY, column, canvas.height / 2, '#304060');
  await panel(column * 2, input.sidesY + canvas.height / 2, column, canvas.height / 2, '#704060');
  if (input.settled) layers.push({ input: await solid(650, 70, '#F7E300'), left: 215, top: 875 }, { input: await solid(360, 70, '#F7E300'), left: 360, top: 975 });
  return sharp({ create: { ...canvas, channels: 3, background: '#000000' } }).composite(layers).png().toBuffer();
}

function renderFinal(canvas: { width: number; height: number }) {
  return sharp({ create: { ...canvas, channels: 3, background: '#203040' } }).composite([
    { input: { create: { width: 900, height: 1600, channels: 3, background: '#553366' } }, left: 90, top: 160 },
    { input: { create: { width: 180, height: 180, channels: 3, background: '#F7E300' } }, left: 450, top: 870 },
  ]).png().toBuffer();
}
function solid(width: number, height: number, background: string) { return sharp({ create: { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), channels: 3, background } }).png().toBuffer(); }
function promotedSandbox() { return DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1.implementation; }
function sha(value: Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
