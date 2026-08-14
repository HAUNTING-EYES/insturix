import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { materializeGeneratedCompositionLocalEvidenceV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-local-evidence-v1';
import type { GeneratedCompositionProxyReceiptV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-proxy-renderer-v1';
import type {
  GeneratedCompositionSandboxHostReceiptV1,
  GeneratedCompositionSandboxWorkerResultV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-contract-v1';

describe('generated-composition local evidence materialization', () => {
  it('copies the playable proxy while preserving the authoritative sandbox receipt identity', async () => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-local-evidence-'));
    try {
      const fixture = makeFixture();
      const evidence = await materializeGeneratedCompositionLocalEvidenceV1({ candidateRoot: scratch, ...fixture });
      expect(evidence.originalProxyReceiptHash).toBe(fixture.workerResult.status === 'RENDERED' ? fixture.workerResult.proxyReceiptHash : '');
      expect(evidence.hostReceiptHash).toBe(fixture.hostReceipt.receiptHash);
      expect(evidence.localEvaluationReceipt.receiptHash).not.toBe(evidence.originalProxyReceiptHash);
      expect(evidence.localEvaluationReceipt.playableProxy?.path).toMatch(/playable-proxy\.mp4$/);
      expect(path.relative(scratch, evidence.localEvaluationReceipt.playableProxy!.path)).toBe(path.join(
        'sandbox-outputs', fixture.workerResult.requestId.slice(0, 16), 'playable-proxy.mp4',
      ));
      expect(evidence.localEvaluationReceipt.stills[0].path).toBe(path.join(
        scratch, 'sandbox-outputs', fixture.workerResult.requestId.slice(0, 16), 'stills', 'frame-0000.png',
      ));
      expect(await fs.readFile(evidence.localEvaluationReceipt.playableProxy!.path, 'utf8')).toBe('playable');
      expect(JSON.parse(await fs.readFile(path.join(scratch, 'localized-evidence.json'), 'utf8')).evidenceHash).toBe(evidence.evidenceHash);
    } finally { await fs.rm(scratch, { recursive: true, force: true }); }
  });

  it('fails loudly on byte drift, missing playable evidence, and escaped output paths', async () => {
    for (const mode of ['BYTE_DRIFT', 'NO_PLAYABLE', 'ESCAPE'] as const) {
      const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-local-evidence-adversarial-'));
      try {
        const fixture = makeFixture(mode);
        await expect(materializeGeneratedCompositionLocalEvidenceV1({ candidateRoot: scratch, ...fixture })).rejects.toThrow();
      } finally { await fs.rm(scratch, { recursive: true, force: true }); }
    }
  });
});

function makeFixture(mode: 'VALID' | 'BYTE_DRIFT' | 'NO_PLAYABLE' | 'ESCAPE' = 'VALID') {
  const requestId = 'a'.repeat(64);
  const workspace = `/tmp/editron-gcp/${requestId}/proxy`;
  const playablePath = mode === 'ESCAPE' ? `${workspace}/../playable-proxy.mp4` : `${workspace}/playable-proxy.mp4`;
  const stillPath = `${workspace}/stills/frame-0000.png`;
  const sheetPath = `${workspace}/contact-sheet.png`;
  const receiptPath = `${workspace}/receipt.json`;
  const stillBytes = Buffer.from('still'); const sheetBytes = Buffer.from('sheet'); const playableBytes = Buffer.from('playable');
  const originalUnsigned = {
    artifactType: 'GeneratedCompositionProxyReceiptV1' as const,
    executionClass: 'VERIFIED_PROGRAM_DENY_ALL_SANDBOX_PROCESS' as const,
    securityDisposition: 'HOST_ATTESTATION_REQUIRED' as const,
    programHash: 'b'.repeat(64), sourceBundleHash: 'c'.repeat(64), apiImplementationHash: 'd'.repeat(64),
    composition: { width: 1080, height: 1920, fps: 30, durationInFrames: 180 },
    stills: [{ frame: 0, path: stillPath, sha256: sha(stillBytes), width: 1080, height: 1920 }],
    contactSheet: { path: sheetPath, sha256: sha(sheetBytes), width: 810, height: 960 },
    ...(mode === 'NO_PLAYABLE' ? {} : { playableProxy: { path: playablePath, sha256: sha(playableBytes), container: 'MP4' as const, codec: 'H264' as const, pixelFormat: 'YUV420P' as const, color: { space: 'BT709' as const, transfer: 'BT709' as const, primaries: 'BT709' as const, range: 'LIMITED' as const }, audio: 'ABSENT' as const, width: 1080, height: 1920, frameRate: { numerator: '30', denominator: '1' }, durationInFrames: 180 } }),
    proof: { contract: 'PASS' as const, materializedInputs: 'PASS' as const, compile: 'PASS' as const, renderedEvidence: 'CAPTURED_UNJUDGED' as const, productionSandbox: 'HOST_ATTESTATION_REQUIRED' as const },
    stateEffects: [] as const, workspaceDir: workspace,
  };
  const originalReceipt = { ...originalUnsigned, receiptHash: hashCanonicalJsonV1(originalUnsigned) } satisfies GeneratedCompositionProxyReceiptV1;
  const receiptBytes = Buffer.from(JSON.stringify(originalReceipt));
  const outputEntries = [
    { kind: 'STILL' as const, path: stillPath, bytes: stillBytes },
    { kind: 'CONTACT_SHEET' as const, path: sheetPath, bytes: sheetBytes },
    ...(mode === 'NO_PLAYABLE' ? [] : [{ kind: 'PLAYABLE_PROXY' as const, path: playablePath, bytes: playableBytes }]),
    { kind: 'PROXY_RECEIPT' as const, path: receiptPath, bytes: receiptBytes },
  ];
  const outputs = outputEntries.map(({ kind, path: outputPath, bytes }) => ({ kind, path: outputPath, contentSha256: sha(bytes), byteLength: bytes.byteLength }));
  const workerResult: GeneratedCompositionSandboxWorkerResultV1 = {
    version: 'EDITRON_GENERATED_COMPOSITION_SANDBOX_V1', requestId, executionId: 'exec-local-evidence', appCommit: 'e'.repeat(40),
    programHash: originalReceipt.programHash, sourceBundleHash: originalReceipt.sourceBundleHash, completedAt: '2026-08-14T12:00:00.000Z',
    wallTimeMs: 1_000, cpuUpperBoundMs: 1_000, stateEffects: [], status: 'RENDERED', proxyReceiptHash: originalReceipt.receiptHash, outputs,
  };
  const hostUnsigned = {
    artifactType: 'GeneratedCompositionSandboxHostReceiptV1' as const, requestId, requestHash: 'f'.repeat(64), resultHash: hashCanonicalJsonV1(workerResult),
    executionId: workerResult.executionId, provider: 'VERCEL_SANDBOX' as const, snapshotId: 'snap-local-evidence', appCommit: workerResult.appCommit,
    workerImplementationHash: '1'.repeat(64), proxyReceiptHash: originalReceipt.receiptHash, networkPolicy: 'DENY_ALL' as const, persistent: false as const,
    sandboxDeleted: true as const, command: { exitCode: 0 as const, stdoutSha256: '2'.repeat(64), stderrSha256: '3'.repeat(64) }, outputs,
    proof: { productionSandbox: 'PASS' as const, outputMaterialization: 'PASS' as const, projectMutation: 'NONE' as const }, stateEffects: [] as const,
  };
  const hostReceipt = { ...hostUnsigned, receiptHash: hashCanonicalJsonV1(hostUnsigned) } satisfies GeneratedCompositionSandboxHostReceiptV1;
  const outputBytes = Object.fromEntries(outputEntries.map(({ path: outputPath, bytes }) => [outputPath, bytes]));
  if (mode === 'BYTE_DRIFT') outputBytes[playablePath] = Buffer.from('tampered');
  return { workerResult, hostReceipt, outputBytes };
}

function sha(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
