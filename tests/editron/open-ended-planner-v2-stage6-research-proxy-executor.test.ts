import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1 } from '@/lib/editron/research/open-ended-planner/generated-composition-research-proxy-capability-v1';
import {
  GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1,
  buildGeneratedCompositionSandboxHostReceiptV1,
  type GeneratedCompositionSandboxRequestV1,
  type GeneratedCompositionSandboxWorkerResultV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-contract-v1';
import { compileStage4DeterministicBaselineV2 } from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import { compileStage4ResearchProxyPreviewV2 } from '@/lib/editron/research/open-ended-planner/stage4-research-proxy-compiler-v2';
import { executeStage6ResearchProxyPreviewV2 } from '@/lib/editron/research/open-ended-planner/stage6-research-proxy-executor-v2';
import { evaluateStage6ResearchProxyExecutionV2 } from '@/lib/editron/research/open-ended-planner/stage6-research-proxy-evaluator-v2';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';
import canonicalBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import canonicalReferenceJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import canonicalEvidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';

describe('open-ended planner V2 Stage 6 research proxy executor', () => {
  it('runs the authorized graph through the existing sandbox boundary and returns no project effects', async () => {
    const fixture = fixtureGraph();
    const sandboxExecutor = vi.fn(async ({ request }: { request: GeneratedCompositionSandboxRequestV1 }) => sandboxFixture(request));
    const evidence = await executeStage6ResearchProxyPreviewV2({
      graph: fixture.graph, operatorId: 'admin', executionId: 'stage6-dev02-test',
      createdAt: '2026-08-15T00:00:00.000Z', materializedInputs: fixture.inputs,
      sandboxEnvironment: promotedSandbox(), sandboxExecutor: sandboxExecutor as never,
    });
    expect(sandboxExecutor).toHaveBeenCalledOnce();
    expect(evaluateStage6ResearchProxyExecutionV2({ graph: fixture.graph, evidence })).toEqual({
      disposition: 'PASS', stageAuthorization: 'PASS', requestBinding: 'PASS', sandboxAttestation: 'PASS',
      outputMaterialization: 'PASS', projectIsolation: 'PASS', receiptIntegrity: 'PASS', diagnostics: [],
    });
    expect(evidence.receipt).toMatchObject({
      authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
      projectBinding: { revisionDisposition: 'NOT_READ_OR_MUTATED', changedProjectPaths: [] },
      proof: { projectMutation: 'NONE', renderedEvidence: 'CAPTURED_UNJUDGED' },
      fullProjectExecutionEligibility: 'NOT_EXECUTABLE', stateEffects: [],
    });
  });

  it('binds the preview request by promoted operator identity rather than a provider intent-node label', async () => {
    const fixture = fixtureGraph({ providerIntentId: 'N-GEN-ISLAND' });
    const graph = fixture.graph;
    expect(graph.previewEligibleIntentNodeIds).toEqual(['N-GEN-ISLAND']);

    const evidence = await executeStage6ResearchProxyPreviewV2({
      graph, operatorId: 'admin', executionId: 'stage6-provider-node-label',
      createdAt: '2026-08-15T00:00:00.000Z', materializedInputs: fixture.inputs,
      sandboxEnvironment: promotedSandbox(), sandboxExecutor: async ({ request }) => sandboxFixture(request),
    });

    expect(evaluateStage6ResearchProxyExecutionV2({ graph, evidence }))
      .toMatchObject({ disposition: 'PASS', requestBinding: 'PASS', diagnostics: [] });
  });

  it('never calls the sandbox for a falsely-ready graph or wrong materialized media', async () => {
    const fixture = fixtureGraph(); const sandboxExecutor = vi.fn();
    const falseReady = structuredClone(fixture.graph) as any;
    falseReady.fullProjectExecutionEligibility = 'EXECUTABLE';
    await expect(executeStage6ResearchProxyPreviewV2({
      graph: falseReady, operatorId: 'admin', executionId: 'stage6-false-ready',
      createdAt: '2026-08-15T00:00:00.000Z', materializedInputs: fixture.inputs,
      sandboxEnvironment: promotedSandbox(), sandboxExecutor,
    })).rejects.toThrow(/STAGE4_BLOCKED/);
    const wrongInputs = fixture.inputs.map((entry, index) => index ? entry : { ...entry, bytes: Buffer.from('wrong') });
    await expect(executeStage6ResearchProxyPreviewV2({
      graph: fixture.graph, operatorId: 'admin', executionId: 'stage6-wrong-media',
      createdAt: '2026-08-15T00:00:00.000Z', materializedInputs: wrongInputs,
      sandboxEnvironment: promotedSandbox(), sandboxExecutor,
    })).rejects.toThrow(/inline input drift/);
    expect(sandboxExecutor).not.toHaveBeenCalled();
  });

  it('independently rejects output, receipt, and project-isolation tampering', async () => {
    const fixture = fixtureGraph();
    const evidence = await executeStage6ResearchProxyPreviewV2({
      graph: fixture.graph, operatorId: 'admin', executionId: 'stage6-tamper-test',
      createdAt: '2026-08-15T00:00:00.000Z', materializedInputs: fixture.inputs,
      sandboxEnvironment: promotedSandbox(), sandboxExecutor: async ({ request }) => sandboxFixture(request),
    });
    const outputDrift = structuredClone(evidence) as any;
    const playablePath = Object.keys(outputDrift.outputBytes).find((path) => path.endsWith('.mp4'))!;
    outputDrift.outputBytes[playablePath] = Buffer.from('tampered');
    expect(evaluateStage6ResearchProxyExecutionV2({ graph: fixture.graph, evidence: outputDrift }).disposition).toBe('FAIL');

    const falseProject = structuredClone(evidence) as any;
    falseProject.receipt.fullProjectExecutionEligibility = 'EXECUTABLE';
    rehash(falseProject.receipt);
    expect(evaluateStage6ResearchProxyExecutionV2({ graph: fixture.graph, evidence: falseProject })).toMatchObject({
      disposition: 'FAIL', projectIsolation: 'FAIL',
    });

    const stateEffect = structuredClone(evidence) as any;
    stateEffect.sandboxHostReceipt.stateEffects = ['project.timeline.write'];
    rehash(stateEffect.sandboxHostReceipt);
    expect(evaluateStage6ResearchProxyExecutionV2({ graph: fixture.graph, evidence: stateEffect })).toMatchObject({
      disposition: 'FAIL', sandboxAttestation: 'FAIL',
    });
  });
});

function fixtureGraph(options: { providerIntentId?: string } = {}) {
  const wide = Buffer.from('stage6-wide'); const close = Buffer.from('stage6-close'); const font = Buffer.from('stage6-font');
  const evidencePack = structuredClone(DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1) as any;
  for (const fact of evidencePack.facts) {
    if (fact.assetId === 'dev02-wide') fact.assetVersion = `sha256:${sha(wide)}`;
    if (fact.assetId === 'dev02-close') fact.assetVersion = `sha256:${sha(close)}`;
  }
  const supplementalFacts = structuredClone(DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1) as any[];
  const fontFact = supplementalFacts.find((fact) => fact.kind === 'FONT_IDENTITY');
  fontFact.fileSha256 = sha(font); fontFact.fontAssetVersion = `sha256:${sha(font)}`;
  const program = structuredClone(DEV02_GENERATED_COMPOSITION_PROGRAM_V1);
  program.projectBinding.evidencePackHash = hashCanonicalJsonV1(evidencePack);
  program.sourceSlots[0].assetVersion = `sha256:${sha(wide)}`; program.sourceSlots[1].assetVersion = `sha256:${sha(close)}`;
  program.fontSlots[0].fileSha256 = sha(font); program.fontSlots[0].fontAssetVersion = `sha256:${sha(font)}`;
  const sourceCompilation = options.providerIntentId
    ? providerCompilationSource(options.providerIntentId)
    : undefined;
  const graph = compileStage4ResearchProxyPreviewV2({
    program, sourceBundle: DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1, evidencePack,
    referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1, supplementalFacts,
    capabilityPromotion: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1,
    ...(sourceCompilation ? {
      sourceBlockedGraph: compileStage4DeterministicBaselineV2(sourceCompilation),
      sourceCompilationSource: sourceCompilation,
    } : {}),
  });
  return {
    graph,
    inputs: [
      { kind: 'SOURCE_MEDIA' as const, bindingId: 'dev02-wide', fileName: 'dev02-wide.mp4', bytes: wide },
      { kind: 'SOURCE_MEDIA' as const, bindingId: 'dev02-close', fileName: 'dev02-close.mp4', bytes: close },
      { kind: 'FONT' as const, bindingId: 'font-noto-sans-v27-regular', fileName: 'noto-sans.ttf', bytes: font },
    ],
  };
}

function providerCompilationSource(intentNodeId: string) {
  const rename = new Map([['node-generated-island', intentNodeId]]);
  return {
    referenceBlueprint: canonicalReferenceJson,
    editorialIntent: replaceRoleIds(structuredClone(canonicalIntentJson), rename),
    evidenceBoundIntent: replaceRoleIds(structuredClone(canonicalBoundJson), rename),
    evidencePack: canonicalEvidencePackJson,
  };
}

function replaceRoleIds(value: unknown, rename: Map<string, string>): unknown {
  if (typeof value === 'string') return rename.get(value) ?? value;
  if (Array.isArray(value)) return value.map((entry) => replaceRoleIds(entry, rename));
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceRoleIds(entry, rename)]));
  }
  return value;
}

function sandboxFixture(request: GeneratedCompositionSandboxRequestV1) {
  const workspace = `/tmp/editron-gcp/${request.requestId}/proxy`;
  const stillBytes = Buffer.from('still'); const sheetBytes = Buffer.from('sheet'); const playableBytes = Buffer.from('playable');
  const stills = request.proofFrames.map((frame) => ({ frame, path: `${workspace}/stills/frame-${String(frame).padStart(4, '0')}.png`, sha256: sha(stillBytes), width: 1080, height: 1920 }));
  const contactSheet = { path: `${workspace}/contact-sheet.png`, sha256: sha(sheetBytes), width: 810, height: 960 };
  const playableProxy = { path: `${workspace}/playable-proxy.mp4`, sha256: sha(playableBytes), container: 'MP4' as const, codec: 'H264' as const, pixelFormat: 'YUV420P' as const, color: { space: 'BT709' as const, transfer: 'BT709' as const, primaries: 'BT709' as const, range: 'LIMITED' as const }, audio: 'ABSENT' as const, width: 1080, height: 1920, frameRate: { numerator: '30', denominator: '1' }, durationInFrames: 180 };
  const unsignedProxyReceipt = {
    artifactType: 'GeneratedCompositionProxyReceiptV1' as const, executionClass: 'VERIFIED_PROGRAM_DENY_ALL_SANDBOX_PROCESS' as const,
    securityDisposition: 'HOST_ATTESTATION_REQUIRED' as const, programHash: request.programHash, sourceBundleHash: request.sourceBundleHash,
    apiImplementationHash: request.apiImplementationHash, composition: { width: 1080, height: 1920, fps: 30, durationInFrames: 180 },
    stills, contactSheet, playableProxy, proof: { contract: 'PASS' as const, materializedInputs: 'PASS' as const, compile: 'PASS' as const, renderedEvidence: 'CAPTURED_UNJUDGED' as const, productionSandbox: 'HOST_ATTESTATION_REQUIRED' as const },
    stateEffects: [] as const, workspaceDir: workspace,
  };
  const proxyReceipt = { ...unsignedProxyReceipt, receiptHash: hashCanonicalJsonV1(unsignedProxyReceipt) };
  const receiptBytes = Buffer.from(JSON.stringify(proxyReceipt));
  const outputBytes: Record<string, Buffer> = Object.fromEntries([
    ...stills.map(({ path }) => [path, stillBytes]), [contactSheet.path, sheetBytes], [playableProxy.path, playableBytes],
    [`${workspace}/receipt.json`, receiptBytes],
  ]);
  const workerResult: GeneratedCompositionSandboxWorkerResultV1 = {
    version: GENERATED_COMPOSITION_SANDBOX_CONTRACT_V1, requestId: request.requestId, executionId: request.executionId,
    appCommit: request.appCommit, programHash: request.programHash, sourceBundleHash: request.sourceBundleHash,
    completedAt: '2026-08-15T00:00:01.000Z', wallTimeMs: 1_000, cpuUpperBoundMs: 1_000, stateEffects: [], status: 'RENDERED',
    proxyReceiptHash: proxyReceipt.receiptHash,
    outputs: Object.entries(outputBytes).map(([path, bytes]) => ({
      kind: path.endsWith('/receipt.json') ? 'PROXY_RECEIPT' as const : path.endsWith('/contact-sheet.png') ? 'CONTACT_SHEET' as const : path.endsWith('/playable-proxy.mp4') ? 'PLAYABLE_PROXY' as const : 'STILL' as const,
      path, contentSha256: sha(bytes), byteLength: bytes.byteLength,
    })),
  };
  if (workerResult.status !== 'RENDERED') throw new Error('fixture drift');
  const receipt = buildGeneratedCompositionSandboxHostReceiptV1({
    request, result: workerResult, snapshotId: promotedSandbox().snapshotId, sandboxDeleted: true,
    networkPolicy: 'DENY_ALL', persistent: false, command: { exitCode: 0, stdout: 'ok', stderr: '' }, outputBytes,
  });
  return { receipt, workerResult, outputBytes };
}

function promotedSandbox() {
  return {
    snapshotId: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1.implementation.snapshotId,
    snapshotCommit: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1.implementation.snapshotCommit,
  };
}
function rehash(value: Record<string, unknown>): void { delete value.receiptHash; value.receiptHash = hashCanonicalJsonV1(value); }
function sha(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
