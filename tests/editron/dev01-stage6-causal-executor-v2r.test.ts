import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { DEV01_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev01-lowering-policy-v2r';
import { executeDev01Stage6GenericLoweredV2 } from '@/lib/editron/research/open-ended-planner/dev01-stage6-generic-lowered-executor-v2r';
import {
  DEV01_STAGE6_ARTIFACT_IDS_V2,
  DEV01_STAGE6_NATIVE_PROXY_V2,
  type Dev01Stage6RenderProofV2,
  type Dev01Stage6RendererV2,
} from '@/lib/editron/research/open-ended-planner/dev01-stage6-native-proxy-contract-v2';
import {
  lowerV2RBoundIntentGeneric,
  type GenericLoweringResultV2R,
} from '@/lib/editron/research/open-ended-planner/generic-lowerer-v2r';

type JsonRecord = Record<string, unknown>;
const roots: string[] = [];
const realIt = process.env.RUN_DEV01_CAUSAL_STAGE6_REAL_RENDER === '1' ? it : it.skip;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('DEV-01 Stage-6 causal compiled-graph executor V2R', () => {
  it('executes all six selected operators through causal ports on an isolated clone', async () => {
    const execution = await execute(lowering(), fakeRenderer());
    expect(execution.receipt).toMatchObject({
      executor: 'CAUSAL_COMPILED_GRAPH_INTERPRETER_V2R',
      authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
      projectBinding: { expectedProjectRevision: 'R7', observedProjectRevision: 'NOT_READ' },
      proof: { state: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS', projectMutation: 'NONE' },
      fullProjectExecutionEligibility: 'NOT_EXECUTABLE',
    });
    expect((execution.receipt.operations as JsonRecord[]).map(({ operatorId }) => operatorId)).toEqual([
      'resolve_transcript_edit', 'cut_section', 'find_visual_moment',
      'apply_audio_ducking', 'resolve_keyframe_edit', 'set_keyframes',
    ]);
    expect(execution.snapshots.afterCut.durationInFrames).toBe(435);
    const finalHost = overlay(execution.snapshots.afterDuck, 104);
    expect(finalHost).toMatchObject({
      from: 151, sourceStartFrame: 196, styles: { transformOrigin: '74.5% 50%' },
    });
    expect(finalHost.keyframeTracks).toContainEqual({
      property: 'scale',
      keyframes: [
        { frame: 9, value: 1, easing: 'ease-out' },
        { frame: 21, value: 1.12, easing: 'ease-out' },
        { frame: 284, value: 1.12, easing: 'linear' },
      ],
    });
    expect(overlay(execution.snapshots.afterDuck, 103)).toMatchObject({
      styles: { duckingConfig: { enabled: true, duckLevel: 0.089 } },
    });
    expect(JSON.parse(await readFile(execution.receiptPath, 'utf8'))).toEqual(execution.receipt);
  });

  it('rejects a changed port schema hash before render', async () => {
    const changed = mutableLowering();
    const edge = edges(changed).find((candidate) => candidate.toPort === 'targetRange');
    if (!edge) throw new Error('test targetRange edge missing');
    edge.expectedInputSchemaHash = '0'.repeat(64);
    const renderer = vi.fn(fakeRenderer());
    await expect(execute(changed, renderer)).rejects.toThrow('DEV01_STAGE6_PORT_SCHEMA_HASH_DRIFT');
    expect(renderer).not.toHaveBeenCalled();
  });

  it('rejects a missing causal producer output instead of using fixture truth', async () => {
    const changed = mutableLowering();
    const edge = edges(changed).find((candidate) => candidate.toPort === 'targetRange');
    if (!edge) throw new Error('test targetRange edge missing');
    edge.fromPort = 'inventedOutput';
    const renderer = vi.fn(fakeRenderer());
    await expect(execute(changed, renderer)).rejects.toThrow('COMPILED_PORT_OUTPUT_MISSING');
    expect(renderer).not.toHaveBeenCalled();
  });

  it('rejects omitted model-owned zoom direction and ungrounded visual queries', async () => {
    const omitted = mutableLowering();
    const resolveNode = nodes(omitted).find((candidate) => candidate.operatorId === 'resolve_keyframe_edit');
    if (!resolveNode) throw new Error('test keyframe resolver node missing');
    const intent = (resolveNode.inputs as JsonRecord).intent as JsonRecord;
    delete intent.direction;
    await expect(execute(omitted, fakeRenderer())).rejects.toThrow('DEV01_STAGE6_KEYFRAME_DIRECTION_INVALID');

    const ungrounded = mutableLowering();
    const visualNode = nodes(ungrounded).find((candidate) => candidate.operatorId === 'find_visual_moment');
    if (!visualNode) throw new Error('test visual node missing');
    (visualNode.inputs as JsonRecord).query = 'nonexistent visual claim';
    await expect(execute(ungrounded, fakeRenderer())).rejects.toThrow('DEV01_STAGE6_VISUAL_UNRESOLVED:NO_MATCH');
  });

  it('contains no canned answer or live mutation authority', async () => {
    const executorSource = await readFile(path.join(process.cwd(), 'lib/editron/research/open-ended-planner/dev01-stage6-generic-lowered-executor-v2r.ts'), 'utf8');
    const adapterSource = await readFile(path.join(process.cwd(), 'lib/editron/research/open-ended-planner/dev01-stage6-operator-adapters-v2r.ts'), 'utf8');
    expect(executorSource).not.toContain('executeDev01TruthCutV2');
    expect(executorSource).not.toMatch(/targetFrame:\s*160|overlayId:\s*104|scaleDelta:\s*0\.12/);
    expect(`${executorSource}\n${adapterSource}`).not.toMatch(/ProjectService|saveProject|updateProject|MutationGate|MongoClient|connectToDatabase/);
  });

  realIt('renders the causally executed state through the real Remotion and audio path', async () => {
    const execution = await execute(lowering());
    const proof = execution.receipt.renderProof as Dev01Stage6RenderProofV2;
    expect(proof.video).toMatchObject({ codec: 'h264', averageFrameRate: '30/1', decodedFrameCount: 435 });
    expect(proof.visual).toMatchObject({ preRevealFrame: 159, revealFrame: 160, zoomedFrame: 171 });
    expect(proof.visual.widthScale).toBeGreaterThanOrEqual(1.07);
    expect(proof.audio.duckReductionDb).toBeGreaterThanOrEqual(10);
    expect(proof.audio.dialogueLiftOverDuckedBgmDb).toBeGreaterThanOrEqual(6);
    expect(proof.browserErrors).toEqual([]);
  }, 300_000);
});

function lowering(): Readonly<GenericLoweringResultV2R> {
  const canonical = getCanonicalDev01Stage123V2();
  return lowerV2RBoundIntentGeneric({
    taskId: 'DEV-01',
    editorialIntent: canonical.editorialIntentV2R,
    evidenceBoundIntent: canonical.evidenceBoundIntentsV2R.BASELINE,
    evidencePack: canonical.evidencePacks.BASELINE,
    policy: DEV01_LOWERING_POLICY_V2R,
  });
}

function mutableLowering(): GenericLoweringResultV2R {
  return structuredClone(lowering()) as GenericLoweringResultV2R;
}

async function execute(lowered: Readonly<GenericLoweringResultV2R>, renderer?: Dev01Stage6RendererV2) {
  return executeDev01Stage6GenericLoweredV2({
    lowering: lowered,
    executionId: `dev01-causal-${roots.length + 1}`,
    createdAt: '2026-08-19T00:00:00.000Z',
    outputDir: await scratch(),
    ...(renderer ? { renderer } : {}),
  });
}

function nodes(loweringResult: GenericLoweringResultV2R): JsonRecord[] {
  return (loweringResult.compiled.nodes as JsonRecord[]) ?? [];
}
function edges(loweringResult: GenericLoweringResultV2R): JsonRecord[] {
  return (loweringResult.compiled.edges as JsonRecord[]) ?? [];
}
function overlay(project: JsonRecord, id: number): Record<string, any> {
  const found = (project.overlays as Record<string, any>[]).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing overlay ${id}`);
  return found;
}

function fakeRenderer(): Dev01Stage6RendererV2 {
  return async ({ outputDir }) => {
    const artifactPaths = Object.fromEntries(await Promise.all(DEV01_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
      const artifactPath = path.join(outputDir, `${artifactId.toLowerCase()}.fixture`);
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
    visual: { preRevealFrame: 159, revealFrame: 160, zoomedFrame: 171, preRevealYellowPixels: 0, revealYellowPixels: 4_000, revealBounds: { left: 198, top: 43, width: 80, height: 94, centerX: 238, centerY: 90 }, zoomedBounds: { left: 193, top: 38, width: 90, height: 105, centerX: 238, centerY: 90 }, widthScale: 1.125, heightScale: 1.117, centerDriftPixels: 0 },
    audio: { sampleRateHz: 48_000, bgmProofSampleFrames: 696_000, fullMixSampleFrames: 697_344, bgmSoloBeforeRms: 0.03, bgmDuckedRms: 0.0075, bgmSoloAfterRms: 0.03, duckReductionDb: 12.041, soloRecoveryRatio: 1, fullSpeechRms: 0.08, dialogueLiftOverDuckedBgmDb: 20.56, fullMixPeak: 0.22 },
    browserErrors: [], externalCalls: { providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0 },
  };
}

async function scratch(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editron-dev01-causal-'));
  roots.push(root);
  return root;
}
