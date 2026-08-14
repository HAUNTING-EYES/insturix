import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1,
  buildGeneratedCompositionSandboxHostReceiptV1,
  buildGeneratedCompositionSandboxRequestV1,
  parseGeneratedCompositionSandboxRequestV1,
  type GeneratedCompositionSandboxWorkerResultV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-contract-v1';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

describe('open-ended planner V2 generated-composition sandbox contract', () => {
  it('binds frozen code, evidence, inputs, policy, and resource limits', () => {
    const request = fixtureRequest();
    expect(parseGeneratedCompositionSandboxRequestV1(request)).toMatchObject({
      authority: 'RESEARCH_ISOLATED_PROXY_NO_PROJECT_MUTATION',
      policy: { network: 'DENY_ALL', environment: 'EMPTY', secrets: 'NONE', database: 'DENY', projectMutation: 'DENY', persistent: false },
      stateEffects: [],
    });
    expect(request.inputs.map(({ bindingId }) => bindingId).sort()).toEqual(['dev02-close', 'dev02-wide', 'font-noto-sans-v27-regular']);
  });

  it('rejects widened policy and tampered inline bytes', () => {
    const widened = structuredClone(fixtureRequest()) as any;
    widened.policy.network = 'ALLOW_ALL';
    expect(() => parseGeneratedCompositionSandboxRequestV1(widened)).toThrow();

    const tampered = structuredClone(fixtureRequest());
    tampered.inputs[0].data = Buffer.from('tampered').toString('base64');
    expect(() => parseGeneratedCompositionSandboxRequestV1(tampered)).toThrow(/inline input drift/);
  });

  it('issues sandbox PASS only after host-verified outputs and teardown', () => {
    const request = fixtureRequest();
    const { outputs, result } = workerFixture(request);
    const receipt = buildGeneratedCompositionSandboxHostReceiptV1({
      request, result, snapshotId: 'snap_generated_composition_v1', sandboxDeleted: true, networkPolicy: 'DENY_ALL', persistent: false,
      command: { exitCode: 0, stdout: 'ok', stderr: '' }, outputBytes: outputs,
    });
    expect(receipt).toMatchObject({ proof: { productionSandbox: 'PASS', outputMaterialization: 'PASS', projectMutation: 'NONE' }, sandboxDeleted: true, stateEffects: [] });
    expect(receipt.proxyReceiptHash).toBe(result.proxyReceiptHash);
    expect(() => buildGeneratedCompositionSandboxHostReceiptV1({
      request, result, snapshotId: 'snap_generated_composition_v1', sandboxDeleted: false, networkPolicy: 'DENY_ALL', persistent: false,
      command: { exitCode: 0, stdout: 'ok', stderr: '' }, outputBytes: outputs,
    })).toThrow(/host attestation failed/);
    const drifted = { ...outputs, [Object.keys(outputs)[0]]: Buffer.from('different') };
    expect(() => buildGeneratedCompositionSandboxHostReceiptV1({
      request, result, snapshotId: 'snap_generated_composition_v1', sandboxDeleted: true, networkPolicy: 'DENY_ALL', persistent: false,
      command: { exitCode: 0, stdout: 'ok', stderr: '' }, outputBytes: drifted,
    })).toThrow(/output hash drift/);

    const unsafeReceipt = JSON.parse(Buffer.from(outputs[result.outputs.find(({ kind }) => kind === 'PROXY_RECEIPT')!.path]).toString('utf8'));
    unsafeReceipt.executionClass = 'TRUSTED_HUMAN_FIXTURE_LOCAL_PROCESS';
    const { receiptHash: _oldHash, ...unsafeUnsigned } = unsafeReceipt;
    unsafeReceipt.receiptHash = hashCanonicalJsonV1(unsafeUnsigned);
    const unsafeReceiptBytes = Buffer.from(JSON.stringify(unsafeReceipt));
    const receiptPath = result.outputs.find(({ kind }) => kind === 'PROXY_RECEIPT')!.path;
    const unsafeOutputs = { ...outputs, [receiptPath]: unsafeReceiptBytes };
    const unsafeResult = {
      ...result,
      proxyReceiptHash: unsafeReceipt.receiptHash,
      outputs: result.outputs.map((output) => output.path === receiptPath
        ? { ...output, contentSha256: sha(unsafeReceiptBytes), byteLength: unsafeReceiptBytes.byteLength }
        : output),
    };
    expect(() => buildGeneratedCompositionSandboxHostReceiptV1({
      request, result: unsafeResult, snapshotId: 'snap_generated_composition_v1', sandboxDeleted: true, networkPolicy: 'DENY_ALL', persistent: false,
      command: { exitCode: 0, stdout: 'ok', stderr: '' }, outputBytes: unsafeOutputs,
    })).toThrow();
  });
});

function workerFixture(request: ReturnType<typeof fixtureRequest>) {
  const workspace = `/tmp/editron-gcp/${request.requestId}/proxy`;
  const stillBytes = Buffer.from('still'); const sheetBytes = Buffer.from('sheet');
  const stills = request.proofFrames.map((frame) => ({ frame, path: `${workspace}/stills/frame-${String(frame).padStart(4, '0')}.png`, sha256: sha(stillBytes), width: 1080, height: 1920 }));
  const contactSheet = { path: `${workspace}/contact-sheet.png`, sha256: sha(sheetBytes), width: 810, height: 960 };
  const unsignedReceipt = {
    artifactType: 'GeneratedCompositionProxyReceiptV1' as const,
    executionClass: 'VERIFIED_PROGRAM_DENY_ALL_SANDBOX_PROCESS' as const,
    securityDisposition: 'HOST_ATTESTATION_REQUIRED' as const,
    programHash: request.programHash, sourceBundleHash: request.sourceBundleHash, apiImplementationHash: request.apiImplementationHash,
    composition: { width: 1080, height: 1920, fps: 30, durationInFrames: 180 }, stills, contactSheet,
    proof: { contract: 'PASS' as const, materializedInputs: 'PASS' as const, compile: 'PASS' as const, renderedEvidence: 'CAPTURED_UNJUDGED' as const, productionSandbox: 'HOST_ATTESTATION_REQUIRED' as const },
    stateEffects: [] as const, workspaceDir: workspace,
  };
  const receipt = { ...unsignedReceipt, receiptHash: hashCanonicalJsonV1(unsignedReceipt) };
  const receiptBytes = Buffer.from(JSON.stringify(receipt));
  const outputs: Record<string, Buffer> = Object.fromEntries([
    ...stills.map(({ path }) => [path, stillBytes]), [contactSheet.path, sheetBytes], [`${workspace}/receipt.json`, receiptBytes],
  ]);
  const result: GeneratedCompositionSandboxWorkerResultV1 = {
    version: GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1, requestId: request.requestId, executionId: request.executionId,
    appCommit: request.appCommit, programHash: request.programHash, sourceBundleHash: request.sourceBundleHash,
    completedAt: '2026-08-14T10:00:01.000Z', wallTimeMs: 1_000, cpuUpperBoundMs: 1_000, stateEffects: [], status: 'RENDERED',
    proxyReceiptHash: receipt.receiptHash,
    outputs: [
      ...stills.map(({ path, sha256 }) => ({ kind: 'STILL' as const, path, contentSha256: sha256, byteLength: stillBytes.byteLength })),
      { kind: 'CONTACT_SHEET' as const, path: contactSheet.path, contentSha256: contactSheet.sha256, byteLength: sheetBytes.byteLength },
      { kind: 'PROXY_RECEIPT' as const, path: `${workspace}/receipt.json`, contentSha256: sha(receiptBytes), byteLength: receiptBytes.byteLength },
    ],
  };
  return { outputs, result };
}

function fixtureRequest() {
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
    executionId: 'exec-dev02-sandbox-v1', createdAt: '2026-08-14T10:00:00.000Z', appCommit: '39f52f53b0000000000000000000000000000000',
    apiImplementationHash: '7da8e6696dcfd90c75bb833010a6ae7b5386b1c9e1d20e198cf604088a35641b',
    workerImplementationHash: '1111111111111111111111111111111111111111111111111111111111111111',
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

function sha(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
