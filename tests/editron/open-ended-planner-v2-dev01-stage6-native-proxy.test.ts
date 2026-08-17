import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  DEV01_STAGE6_ARTIFACT_IDS_V2,
  DEV01_STAGE6_NATIVE_PROXY_V2,
  type Dev01Stage6ExecutionEvidenceV2,
  type Dev01Stage6RenderProofV2,
  type Dev01Stage6RendererV2,
} from '@/lib/editron/research/open-ended-planner/dev01-stage6-native-proxy-contract-v2';
import { evaluateDev01Stage6NativeProxyV2 } from '@/lib/editron/research/open-ended-planner/dev01-stage6-native-proxy-evaluator-v2';
import { executeDev01Stage6NativeProxyV2 } from '@/lib/editron/research/open-ended-planner/dev01-stage6-native-proxy-executor-v2';
import {
  compileCanonicalDev01Stage4NativeV2,
  compileDev01Stage4NativeV2,
} from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import { buildDev01ProviderRelativeSourceV2 } from '@/tests/fixtures/editron/open-ended-planner-v2/dev01-provider-relative-source-v2';

const roots: string[] = [];
const realIt = process.env.RUN_DEV01_STAGE6_REAL_RENDER === '1' ? it : it.skip;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('open-ended planner V2 DEV-01 Stage-6 native research proxy', () => {
  it('executes the certified owners on an isolated clone and emits a hash-bound receipt', async () => {
    const { graph, evidence } = await executeWith(fakeRenderer());
    expect(await evaluateDev01Stage6NativeProxyV2({ graph, evidence })).toEqual({
      assessment: 'PASS', authorization: 'PASS', isolatedState: 'PASS', artifactIntegrity: 'PASS',
      renderedVisual: 'PASS', renderedAudio: 'PASS', diagnostics: [],
    });
    expect(evidence.receipt).toMatchObject({
      authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION', taskId: 'DEV-01',
      projectBinding: { expectedProjectRevision: 'R7', observedProjectRevision: 'NOT_READ', changedProjectPaths: [] },
      proof: { state: 'PASS', reloadEquivalent: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS', projectMutation: 'NONE' },
      fullProjectExecutionEligibility: 'NOT_EXECUTABLE', stateEffects: [],
    });
    expect(evidence.snapshots.afterCut).toMatchObject({ durationInFrames: 435 });
    const host = overlay(evidence.snapshots.afterDuck, 104);
    expect(host).toMatchObject({ from: 151, sourceStartFrame: 196, styles: { transformOrigin: '74.5% 50%' } });
    expect(host.keyframeTracks).toContainEqual({ property: 'scale', keyframes: [
      { frame: 9, value: 1, easing: 'ease-out' },
      { frame: 20, value: 1.12, easing: 'ease-out' },
      { frame: 284, value: 1.12, easing: 'linear' },
    ] });
    expect(overlay(evidence.snapshots.afterDuck, 103)).toMatchObject({ styles: {
      volume: 0.355,
      duckingConfig: { enabled: true, duckLevel: 0.089, rampDownMs: 300, rampUpMs: 600, lookAheadMs: 200 },
    } });
    expect(JSON.parse(await readFile(evidence.receiptPath, 'utf8'))).toEqual(evidence.receipt);
  });

  it('executes a provider-relative graph only with its exact source-bound planning chain', async () => {
    const source = buildDev01ProviderRelativeSourceV2();
    const graph = compileDev01Stage4NativeV2(source);
    const evidence = await executeDev01Stage6NativeProxyV2({
      graph, source, executionId: 'dev01-provider-source', createdAt: '2026-08-16T00:00:00.000Z',
      outputDir: await scratch(), renderer: fakeRenderer(),
    });
    expect(await evaluateDev01Stage6NativeProxyV2({ graph, source, evidence })).toMatchObject({
      assessment: 'PASS', authorization: 'PASS', diagnostics: [],
    });
    expect(await evaluateDev01Stage6NativeProxyV2({ graph, evidence })).toMatchObject({
      assessment: 'FAIL', authorization: 'FAIL',
      diagnostics: expect.arrayContaining(['AUTH_STAGE4_NOT_PASS']),
    });

    const mismatchedSource = structuredClone(source);
    (mismatchedSource.editorialIntent as Record<string, unknown>).providerSourceDrift = true;
    const renderer = vi.fn(fakeRenderer());
    await expect(executeDev01Stage6NativeProxyV2({
      graph, source: mismatchedSource, executionId: 'dev01-mismatched-source',
      createdAt: '2026-08-16T00:00:00.000Z', outputDir: await scratch(), renderer,
    })).rejects.toThrow(/DEV01_STAGE6_STAGE4_BLOCKED/);
    expect(renderer).not.toHaveBeenCalled();
  });

  it('blocks an invalid graph before the renderer receives any content', async () => {
    const graph = structuredClone(compileCanonicalDev01Stage4NativeV2()) as Record<string, unknown>;
    graph.executionEligibility = 'PRODUCTION';
    const renderer = vi.fn(fakeRenderer());
    const outputDir = await scratch();
    await expect(executeDev01Stage6NativeProxyV2({
      graph, executionId: 'dev01-invalid-graph', createdAt: '2026-08-16T00:00:00.000Z', outputDir, renderer,
    })).rejects.toThrow(/DEV01_STAGE6_STAGE4_BLOCKED/);
    expect(renderer).not.toHaveBeenCalled();
  });

  it('detects state, artifact, authority, visual, and audio tampering independently', async () => {
    const first = await executeWith(fakeRenderer());
    const stateTamper = structuredClone(first.evidence);
    stateTamper.snapshots.afterDuck.durationInFrames = 434;
    expect(await evaluateDev01Stage6NativeProxyV2({ graph: first.graph, evidence: stateTamper })).toMatchObject({
      assessment: 'FAIL', isolatedState: 'FAIL', diagnostics: expect.arrayContaining(['STATE_AFTERDUCK_DRIFT']),
    });

    const artifactTamper = await executeWith(fakeRenderer());
    await writeFile(artifactTamper.evidence.receipt.artifacts[0].path, 'changed-after-receipt');
    expect(await evaluateDev01Stage6NativeProxyV2(artifactTamper)).toMatchObject({
      assessment: 'FAIL', artifactIntegrity: 'FAIL', diagnostics: expect.arrayContaining(['ARTIFACT_BYTES_DRIFT:SOURCE_VIDEO']),
    });

    const authorityTamper = await executeWith(fakeRenderer());
    const mutableAuthority = authorityTamper.evidence.receipt as unknown as Record<string, unknown>;
    mutableAuthority.projectBinding = { projectId: 'oe-dev-01', expectedProjectRevision: 'R7', observedProjectRevision: 'R8', changedProjectPaths: ['overlays'] };
    resign(authorityTamper.evidence);
    expect(await evaluateDev01Stage6NativeProxyV2(authorityTamper)).toMatchObject({
      assessment: 'FAIL', authorization: 'FAIL', diagnostics: expect.arrayContaining(['AUTH_PROJECT_MUTATION_OR_REVISION_READ']),
    });

    const proofTamper = await executeWith(fakeRenderer());
    proofTamper.evidence.receipt.renderProof.visual.widthScale = 1;
    proofTamper.evidence.receipt.renderProof.audio.duckReductionDb = 0;
    resign(proofTamper.evidence);
    expect(await evaluateDev01Stage6NativeProxyV2(proofTamper)).toMatchObject({
      assessment: 'FAIL', renderedVisual: 'FAIL', renderedAudio: 'FAIL',
      diagnostics: expect.arrayContaining(['VISUAL_PUSH_GEOMETRY_INVALID', 'AUDIO_DUCK_ENVELOPE_INVALID']),
    });
  });

  it('contains no production project, database, or live chat mutation authority', async () => {
    const source = await readFile(path.join(process.cwd(), 'lib/editron/research/open-ended-planner/dev01-stage6-native-proxy-executor-v2.ts'), 'utf8');
    expect(source).not.toMatch(/ProjectService|saveProject|updateProject|MutationGate|MongoClient|connectToDatabase/);
    expect(source).toContain("observedProjectRevision: 'NOT_READ'");
    expect(source).toContain("fullProjectExecutionEligibility: 'NOT_EXECUTABLE'");
  });

  realIt('renders and independently evaluates the real production Remotion video/audio path', async () => {
    const { graph, evidence } = await executeWith(undefined);
    const evaluation = await evaluateDev01Stage6NativeProxyV2({ graph, evidence });
    expect(evaluation).toMatchObject({ assessment: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS' });
    expect(evidence.receipt.renderProof.video).toMatchObject({ codec: 'h264', width: 320, height: 180, decodedFrameCount: 435 });
    expect(evidence.receipt.artifacts).toHaveLength(8);
  }, 300_000);
});

async function executeWith(renderer: Dev01Stage6RendererV2 | undefined) {
  const graph = compileCanonicalDev01Stage4NativeV2();
  const evidence = await executeDev01Stage6NativeProxyV2({
    graph, executionId: `dev01-stage6-${roots.length + 1}`, createdAt: '2026-08-16T00:00:00.000Z',
    outputDir: await scratch(), ...(renderer ? { renderer } : {}),
  });
  return { graph, evidence };
}

function fakeRenderer(): Dev01Stage6RendererV2 {
  return async ({ outputDir }) => {
    const names = {
      SOURCE_VIDEO: 'source-host.mp4', SOURCE_DIALOGUE_WAV: 'source-dialogue.wav', SOURCE_BGM_WAV: 'source-bgm.wav',
      PRE_REVEAL_STILL: 'frame-0159.png', REVEAL_STILL: 'frame-0160.png', ZOOMED_STILL: 'frame-0171.png',
      FULL_AV_PROXY: 'dev01-native-proxy.mp4', BGM_GAIN_PROOF_WAV: 'dev01-bgm-gain-proof.wav',
    } as const;
    const artifactPaths = Object.fromEntries(await Promise.all(DEV01_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
      const artifactPath = path.join(outputDir, names[artifactId]);
      await writeFile(artifactPath, `fixture-${artifactId}`);
      return [artifactId, artifactPath];
    }))) as Record<typeof DEV01_STAGE6_ARTIFACT_IDS_V2[number], string>;
    return { artifactPaths, proof: passingProof() };
  };
}

function passingProof(): Dev01Stage6RenderProofV2 {
  return {
    schemaVersion: DEV01_STAGE6_NATIVE_PROXY_V2,
    renderer: { root: 'components/editron/editor/version-7.0.0/remotion/index.ts', assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps', visualConsumer: 'components/editron/editor/version-7.0.0/components/core/layer.tsx', audioConsumer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx' },
    composition: { width: 320, height: 180, fpsNumerator: 30, fpsDenominator: 1, durationInFrames: 435 },
    sourceBindings: { hostVideoAssetId: 'dev01-host-truth-v2', dialogueAssetId: 'dev01-dialogue-truth-v2', bgmAssetId: 'dev01-bgm-truth-v2' },
    video: { codec: 'h264', width: 320, height: 180, averageFrameRate: '30/1', decodedFrameCount: 435, durationSeconds: 14.5, audioStreamCount: 1 },
    visual: { preRevealFrame: 159, revealFrame: 160, zoomedFrame: 171, preRevealYellowPixels: 0, revealYellowPixels: 4_000,
      revealBounds: { left: 198, top: 43, width: 80, height: 94, centerX: 238, centerY: 90 },
      zoomedBounds: { left: 193, top: 38, width: 90, height: 105, centerX: 238, centerY: 90 }, widthScale: 1.125, heightScale: 1.117, centerDriftPixels: 0 },
    audio: { sampleRateHz: 48_000, bgmProofSampleFrames: 696_000, fullMixSampleFrames: 697_344,
      bgmSoloBeforeRms: 0.03, bgmDuckedRms: 0.0075, bgmSoloAfterRms: 0.03, duckReductionDb: 12.041,
      soloRecoveryRatio: 1, fullSpeechRms: 0.08, dialogueLiftOverDuckedBgmDb: 20.56, fullMixPeak: 0.22 },
    browserErrors: [], externalCalls: { providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0 },
  };
}

async function scratch(): Promise<string> { const root = await mkdtemp(path.join(os.tmpdir(), 'editron-dev01-stage6-')); roots.push(root); return root; }
function overlay(project: Record<string, unknown>, id: number): Record<string, any> { const found = (project.overlays as Record<string, any>[]).find((item) => item.id === id); if (!found) throw new Error(`Missing overlay ${id}`); return found; }
function resign(evidence: Dev01Stage6ExecutionEvidenceV2): void { const receipt = evidence.receipt as unknown as Record<string, unknown>; delete receipt.receiptHash; receipt.receiptHash = hashCanonicalJsonV1(receipt); }
