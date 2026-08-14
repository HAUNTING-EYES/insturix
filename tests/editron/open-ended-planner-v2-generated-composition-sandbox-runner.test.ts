import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  executeGeneratedCompositionInSandboxV1,
  resolveGeneratedCompositionSandboxOverlayV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1';
import {
  GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1,
  buildGeneratedCompositionSandboxRequestV1,
  type GeneratedCompositionSandboxWorkerResultV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-contract-v1';
import { assertGeneratedCompositionSandboxEnvironmentV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-worker-v1';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

const APP_COMMIT = '39f52f53b0000000000000000000000000000000';
const SNAPSHOT_ID = 'snap_generated_composition_v1';

describe('open-ended planner V2 generated-composition sandbox runner', () => {
  it('uses a deny-all, secret-free, nonpersistent sandbox and attests only after deletion', async () => {
    const overlay = await resolveGeneratedCompositionSandboxOverlayV1();
    const request = fixtureRequest(overlay.workerImplementationHash);
    const outputs = outputFixture(request.requestId);
    const result = workerResult(request, outputs);
    let deleted = false;
    const writeFiles = vi.fn(async () => undefined);
    const runCommand = vi.fn(async () => ({ exitCode: 0, stdout: async () => 'rendered', stderr: async () => '' }));
    const createSandbox = vi.fn(async (params: any) => ({
      writeFiles,
      runCommand,
      readFileToBuffer: async ({ path }: { path: string }) => path.endsWith('.gcp-result.json')
        ? Buffer.from(JSON.stringify(result))
        : outputs[path] ?? null,
      delete: async () => { deleted = true; },
    }));
    const executed = await executeGeneratedCompositionInSandboxV1({
      request, env: { MG_RENDER_SANDBOX_SNAPSHOT_ID: SNAPSHOT_ID, MG_RENDER_SANDBOX_APP_COMMIT: APP_COMMIT }, createSandbox,
    });
    expect(createSandbox).toHaveBeenCalledWith(expect.objectContaining({
      source: { type: 'snapshot', snapshotId: SNAPSHOT_ID }, networkPolicy: 'deny-all', env: {}, persistent: false,
      resources: { vcpus: 1 },
    }));
    expect(writeFiles).toHaveBeenCalledOnce();
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({
      env: { FFMPEG_PATH: '/vercel/sandbox/node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg' },
    }));
    expect(deleted).toBe(true);
    expect(executed.receipt).toMatchObject({
      workerImplementationHash: overlay.workerImplementationHash, sandboxDeleted: true,
      proof: { productionSandbox: 'PASS', outputMaterialization: 'PASS', projectMutation: 'NONE' },
    });
    expect(executed.receipt.outputs.map(({ kind }) => kind)).toContain('PLAYABLE_PROXY');
  });

  it('rejects secret-bearing workers, overlay drift, and teardown failure', async () => {
    expect(() => assertGeneratedCompositionSandboxEnvironmentV1({ PATH: '/usr/bin' })).not.toThrow();
    expect(() => assertGeneratedCompositionSandboxEnvironmentV1({ OPENAI_API_KEY: 'secret' })).toThrow(/forbidden environment/);
    const drifted = fixtureRequest('0'.repeat(64));
    const createSandbox = vi.fn();
    await expect(executeGeneratedCompositionInSandboxV1({
      request: drifted, env: { MG_RENDER_SANDBOX_SNAPSHOT_ID: SNAPSHOT_ID, MG_RENDER_SANDBOX_APP_COMMIT: APP_COMMIT }, createSandbox,
    })).rejects.toThrow(/worker implementation hash drift/);
    expect(createSandbox).not.toHaveBeenCalled();

    const overlay = await resolveGeneratedCompositionSandboxOverlayV1();
    const request = fixtureRequest(overlay.workerImplementationHash);
    const outputs = outputFixture(request.requestId);
    const result = workerResult(request, outputs);
    await expect(executeGeneratedCompositionInSandboxV1({
      request, env: { MG_RENDER_SANDBOX_SNAPSHOT_ID: SNAPSHOT_ID, MG_RENDER_SANDBOX_APP_COMMIT: APP_COMMIT },
      createSandbox: async () => ({
        writeFiles: async () => undefined,
        runCommand: async () => ({ exitCode: 0, stdout: async () => '', stderr: async () => '' }),
        readFileToBuffer: async ({ path }) => path.endsWith('.gcp-result.json') ? Buffer.from(JSON.stringify(result)) : outputs[path] ?? null,
        delete: async () => { throw new Error('teardown failed'); },
      }),
    })).rejects.toThrow('teardown failed');
  });
});

function fixtureRequest(workerImplementationHash: string) {
  const wide = Buffer.from('sandbox-wide'); const close = Buffer.from('sandbox-close'); const font = Buffer.from('sandbox-font');
  const wideHash = sha(wide); const closeHash = sha(close); const fontHash = sha(font);
  const evidencePack = structuredClone(DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1) as any;
  for (const fact of evidencePack.facts) {
    if (fact.assetId === 'dev02-wide') fact.assetVersion = `sha256:${wideHash}`;
    if (fact.assetId === 'dev02-close') fact.assetVersion = `sha256:${closeHash}`;
  }
  const supplementalFacts = structuredClone(DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1) as any[];
  const fontFact = supplementalFacts.find((fact) => fact.kind === 'FONT_IDENTITY');
  fontFact.fileSha256 = fontHash; fontFact.fontAssetVersion = `sha256:${fontHash}`;
  const program = structuredClone(DEV02_GENERATED_COMPOSITION_PROGRAM_V1);
  program.projectBinding.evidencePackHash = hashCanonicalJsonV1(evidencePack);
  program.sourceSlots[0].assetVersion = `sha256:${wideHash}`; program.sourceSlots[1].assetVersion = `sha256:${closeHash}`;
  program.fontSlots[0].fileSha256 = fontHash; program.fontSlots[0].fontAssetVersion = `sha256:${fontHash}`;
  return buildGeneratedCompositionSandboxRequestV1({
    executionId: 'exec-dev02-sandbox-v1', createdAt: '2026-08-14T10:00:00.000Z', appCommit: APP_COMMIT,
    apiImplementationHash: '7da8e6696dcfd90c75bb833010a6ae7b5386b1c9e1d20e198cf604088a35641b', workerImplementationHash,
    program, sourceBundle: DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1, evidencePack,
    referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1, supplementalFacts, proofFrames: [0, 24, 108, 144, 145, 179],
    inputs: [
      { kind: 'SOURCE_MEDIA', bindingId: 'dev02-wide', fileName: 'dev02-wide.mp4', bytes: wide },
      { kind: 'SOURCE_MEDIA', bindingId: 'dev02-close', fileName: 'dev02-close.mp4', bytes: close },
      { kind: 'FONT', bindingId: 'font-noto-sans-v27-regular', fileName: 'noto-sans.ttf', bytes: font },
    ],
    resources: { wallTimeMs: 90_000, maxCpuMs: 60_000, vcpus: 1, memoryMiB: 2_048, maxOutputBytes: 64 * 1_024 * 1_024 },
  });
}

function outputFixture(requestId: string): Record<string, Buffer> {
  const request = fixtureRequest('0'.repeat(64));
  const workspace = `/tmp/editron-gcp/${requestId}/proxy`;
  const stillBytes = Buffer.from('still'); const sheetBytes = Buffer.from('sheet'); const playableBytes = Buffer.from('playable');
  const stills = request.proofFrames.map((frame) => ({ frame, path: `${workspace}/stills/frame-${String(frame).padStart(4, '0')}.png`, sha256: sha(stillBytes), width: 1080, height: 1920 }));
  const contactSheet = { path: `${workspace}/contact-sheet.png`, sha256: sha(sheetBytes), width: 810, height: 960 };
  const playableProxy = { path: `${workspace}/playable-proxy.mp4`, sha256: sha(playableBytes), container: 'MP4' as const, codec: 'H264' as const, pixelFormat: 'YUV420P' as const, color: { space: 'BT709' as const, transfer: 'BT709' as const, primaries: 'BT709' as const, range: 'LIMITED' as const }, audio: 'ABSENT' as const, width: 1080, height: 1920, frameRate: { numerator: '30', denominator: '1' }, durationInFrames: 180 };
  const unsignedReceipt = {
    artifactType: 'GeneratedCompositionProxyReceiptV1' as const,
    executionClass: 'VERIFIED_PROGRAM_DENY_ALL_SANDBOX_PROCESS' as const,
    securityDisposition: 'HOST_ATTESTATION_REQUIRED' as const,
    programHash: request.programHash, sourceBundleHash: request.sourceBundleHash, apiImplementationHash: request.apiImplementationHash,
    composition: { width: 1080, height: 1920, fps: 30, durationInFrames: 180 }, stills, contactSheet, playableProxy,
    proof: { contract: 'PASS' as const, materializedInputs: 'PASS' as const, compile: 'PASS' as const, renderedEvidence: 'CAPTURED_UNJUDGED' as const, productionSandbox: 'HOST_ATTESTATION_REQUIRED' as const },
    stateEffects: [] as const, workspaceDir: workspace,
  };
  const receipt = { ...unsignedReceipt, receiptHash: hashCanonicalJsonV1(unsignedReceipt) };
  return Object.fromEntries([
    ...stills.map(({ path }) => [path, stillBytes]),
    [contactSheet.path, sheetBytes],
    [playableProxy.path, playableBytes],
    [`${workspace}/receipt.json`, Buffer.from(JSON.stringify(receipt))],
  ]);
}

function workerResult(request: ReturnType<typeof fixtureRequest>, outputs: Record<string, Buffer>): GeneratedCompositionSandboxWorkerResultV1 {
  const receiptPath = Object.keys(outputs).find((path) => path.endsWith('/receipt.json'))!;
  const proxyReceipt = JSON.parse(outputs[receiptPath].toString('utf8'));
  return {
    version: GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1, requestId: request.requestId, executionId: request.executionId,
    appCommit: request.appCommit, programHash: request.programHash, sourceBundleHash: request.sourceBundleHash,
    completedAt: '2026-08-14T10:00:01.000Z', wallTimeMs: 1_000, cpuUpperBoundMs: 1_000, stateEffects: [], status: 'RENDERED',
    proxyReceiptHash: proxyReceipt.receiptHash,
    outputs: Object.entries(outputs).map(([path, bytes]) => ({
      kind: path.endsWith('/receipt.json') ? 'PROXY_RECEIPT' as const : path.endsWith('/contact-sheet.png') ? 'CONTACT_SHEET' as const : path.endsWith('/playable-proxy.mp4') ? 'PLAYABLE_PROXY' as const : 'STILL' as const,
      path, contentSha256: sha(bytes), byteLength: bytes.byteLength,
    })),
  };
}

function sha(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
