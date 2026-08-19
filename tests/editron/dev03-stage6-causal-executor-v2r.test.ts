import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DEV03_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev03-lowering-policy-v2r';
import {
  buildCanonicalDev03BeatWithheldEvidenceV2,
  buildCanonicalDev03MeasuredEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { executeDev03Stage6GenericLoweredV2 } from '@/lib/editron/research/open-ended-planner/dev03-stage6-generic-lowered-executor-v2r';
import {
  DEV03_STAGE6_ARTIFACT_IDS_V2,
  DEV03_STAGE6_NATIVE_PROXY_V2,
  type Dev03Stage6RenderProofV2,
  type Dev03Stage6RendererV2,
} from '@/lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-contract-v2';
import { getCanonicalDev03Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import {
  lowerV2RBoundIntentGeneric,
  type GenericLoweringResultV2R,
} from '@/lib/editron/research/open-ended-planner/generic-lowerer-v2r';

type JsonRecord = Record<string, unknown>;
const roots: string[] = [];
let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;
const realIt = process.env.RUN_DEV03_CAUSAL_STAGE6_REAL_RENDER === '1' ? it : it.skip;

const FILENAMES = {
  SOURCE_VIDEO: 'source-cards.mp4', SOURCE_AUDIO: 'source-beats.wav',
  CUT1_BEFORE: 'cut1-before-0118.png', CUT1_AFTER: 'cut1-after-0119.png',
  CUT2_BEFORE: 'cut2-before-0238.png', CUT2_AFTER: 'cut2-after-0239.png',
  CUT3_BEFORE: 'cut3-before-0478.png', CUT3_AFTER: 'cut3-after-0479.png',
  SHAKE_ACTIVE_BASELINE: 'shake-baseline-0480.png', SHAKE_ACTIVE: 'shake-active-0480.png',
  SHAKE_NEUTRAL_BASELINE: 'shake-baseline-0490.png', SHAKE_NEUTRAL: 'shake-neutral-0490.png',
  FULL_AV_PROXY: 'dev03-native-proxy.mp4',
  PROTECTED_AUDIO_BASELINE_WAV: 'dev03-protected-audio-baseline.wav',
  PROTECTED_AUDIO_WAV: 'dev03-protected-audio.wav',
} as const;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('DEV-03 Stage-6 causal compiled-graph executor V2R', () => {
  it('executes all seven selected operators through measured causal ports on an isolated clone', async () => {
    const execution = await execute(lowering(), evidencePack(), fakeRenderer());
    expect(execution.receipt).toMatchObject({
      executor: 'CAUSAL_COMPILED_GRAPH_INTERPRETER_V2R',
      authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
      projectBinding: { expectedProjectRevision: 'R11', observedProjectRevision: 'NOT_READ' },
      proof: { state: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS', projectMutation: 'NONE' },
      renderProofValidation: { assessment: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS' },
      fullProjectExecutionEligibility: 'NOT_EXECUTABLE',
    });
    expect((execution.receipt.operations as JsonRecord[]).map(({ operatorId }) => operatorId)).toEqual([
      'read_project_file', 'get_timeline_view', 'find_audio_moment',
      'sync_cuts_to_beats', 'apply_camera_shake', 'read_project_file', 'get_timeline_view',
    ]);
    expect(videoOverlays(execution.snapshots.aligned).map(({ from }) => from)).toEqual([0, 119, 239, 479]);
    expect(videoOverlays(execution.snapshots.aligned).map(({ durationInFrames }) => durationInFrames))
      .toEqual([119, 120, 240, 121]);
    const finalCard = overlay(execution.snapshots.shaken, 'dev03-card-4');
    const properties = (finalCard.keyframeTracks as JsonRecord[]).map(({ property }) => property);
    expect(properties).toEqual(expect.arrayContaining(['x', 'y']));
    expect(execution.receipt.isolatedClone).toMatchObject({
      changedPaths: expect.arrayContaining([
        'overlays.dev03-card-1.durationInFrames',
        'overlays.dev03-card-4.from',
        'overlays.dev03-card-4.keyframeTracks.x',
        'overlays.dev03-card-4.keyframeTracks.y',
      ]),
    });
    expect(JSON.parse(await readFile(execution.receiptPath, 'utf8'))).toEqual(execution.receipt);
  });

  it('rejects evidence-pack drift before executing or rendering', async () => {
    const changed = structuredClone(evidencePack()) as JsonRecord;
    const fact = records(changed.facts).find(({ kind }) => kind === 'HASH_BOUND_MEASURED_AUDIO');
    if (!fact) throw new Error('test measured fact missing');
    fact.finalStrongPeakFrame = 480;
    const renderer = vi.fn(fakeRenderer());
    await expect(execute(lowering(), changed, renderer)).rejects.toThrow(
      'DEV03_STAGE6_EVIDENCE_PACK_HASH_DRIFT',
    );
    expect(renderer).not.toHaveBeenCalled();
  });

  it('rejects a broken causal result projection instead of using fixture truth', async () => {
    const changed = mutableLowering();
    const edge = edges(changed).find((candidate) => candidate.toPort === 'targetFrame');
    if (!edge) throw new Error('test targetFrame edge missing');
    edge.projectionPath = ['inventedFrame'];
    const renderer = vi.fn(fakeRenderer());
    await expect(execute(changed, evidencePack(), renderer)).rejects.toThrow(
      'COMPILED_PORT_PROJECTION_MISSING:inventedFrame',
    );
    expect(renderer).not.toHaveBeenCalled();
  });

  it('rejects a model query that the real audio resolver cannot ground', async () => {
    const changed = mutableLowering();
    const audioNode = nodes(changed).find(({ operatorId }) => operatorId === 'find_audio_moment');
    if (!audioNode) throw new Error('test audio node missing');
    (audioNode.inputs as JsonRecord).query = 'find a long silence';
    const renderer = vi.fn(fakeRenderer());
    await expect(execute(changed, evidencePack(), renderer)).rejects.toThrow(
      'DEV03_STAGE6_AUDIO_OWNER_DID_NOT_RESOLVE_BOUND_PEAKS',
    );
    expect(renderer).not.toHaveBeenCalled();
  });

  it('rejects independently invalid visual and audio proof before writing a receipt', async () => {
    const invalid = passingProof();
    invalid.renderer.root = '' as typeof invalid.renderer.root;
    invalid.visual.boundaryMeanAbsDiffs = [0, 0, 0];
    invalid.audio.renderedSampleFrames = 1;
    const renderer = vi.fn(fakeRenderer(invalid));
    await expect(execute(lowering(), evidencePack(), renderer)).rejects.toThrow(
      /DEV03_STAGE6_RENDER_PROOF_INVALID:.*AUDIO_DURATION_OR_RANGE_INVALID.*VISUAL_BOUNDARY_CHANGE_NOT_VISIBLE.*VISUAL_RENDER_BINDING_INVALID/,
    );
    expect(renderer).toHaveBeenCalledOnce();
  });

  it('contains no canned answer helper or live project authority', async () => {
    const [executorSource, adapterSource] = await Promise.all([
      readFile('lib/editron/research/open-ended-planner/dev03-stage6-generic-lowered-executor-v2r.ts', 'utf8'),
      readFile('lib/editron/research/open-ended-planner/dev03-stage6-operator-adapters-v2r.ts', 'utf8'),
    ]);
    expect(`${executorSource}\n${adapterSource}`).not.toMatch(
      /fixture\.expected|executeDev03BeatAlignmentV2|executeDev03FinalShakeV2/,
    );
    expect(`${executorSource}\n${adapterSource}`).not.toMatch(
      /from ['"][^'"]*(?:project-service|mutation-gate|mongodb)|\b(?:saveProject|updateProject|connectToDatabase)\s*\(/i,
    );
  });

  realIt('renders the causally executed state through the real Remotion and audio path', async () => {
    const execution = await execute(lowering(), evidencePack());
    const proof = execution.receipt.renderProof as Dev03Stage6RenderProofV2;
    expect(proof.video).toMatchObject({
      codec: 'h264', averageFrameRate: '30/1', decodedFrameCount: 600,
    });
    expect(proof.visual.boundaryMeanAbsDiffs.every((value) => value >= 20)).toBe(true);
    expect(proof.visual.shakeActiveMeanAbsDiff).toBeGreaterThanOrEqual(0.1);
    expect(proof.visual.shakeNeutralMeanAbsDiff).toBeLessThanOrEqual(0.05);
    expect(proof.audio.sourceToRenderedCorrelation).toBeGreaterThanOrEqual(0.995);
    expect(proof.browserErrors).toEqual([]);
  }, 300_000);
});

function canonical() {
  return getCanonicalDev03Stage123V2({
    measuredEvidence: measured,
    withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
  });
}

function evidencePack(): JsonRecord {
  return canonical().evidencePacks.BASELINE as JsonRecord;
}

function lowering(): Readonly<GenericLoweringResultV2R> {
  const source = canonical();
  return lowerV2RBoundIntentGeneric({
    taskId: 'DEV-03',
    editorialIntent: source.editorialIntentV2R,
    evidenceBoundIntent: source.evidenceBoundIntentsV2R.BASELINE,
    evidencePack: source.evidencePacks.BASELINE,
    policy: DEV03_LOWERING_POLICY_V2R,
  });
}

function mutableLowering(): GenericLoweringResultV2R {
  return structuredClone(lowering()) as GenericLoweringResultV2R;
}

async function execute(
  lowered: Readonly<GenericLoweringResultV2R>,
  pack: unknown,
  renderer?: Dev03Stage6RendererV2,
) {
  return executeDev03Stage6GenericLoweredV2({
    lowering: lowered,
    evidencePack: pack,
    executionId: `dev03-causal-${roots.length + 1}`,
    createdAt: '2026-08-19T00:00:00.000Z',
    outputDir: await scratch(),
    ...(renderer ? { renderer } : {}),
  });
}

function nodes(loweringResult: GenericLoweringResultV2R): JsonRecord[] {
  return records(loweringResult.compiled.nodes);
}
function edges(loweringResult: GenericLoweringResultV2R): JsonRecord[] {
  return records(loweringResult.compiled.edges);
}
function videoOverlays(project: JsonRecord): JsonRecord[] {
  return records(project.overlays)
    .filter(({ type }) => type === 'video')
    .sort((left, right) => Number(left.from) - Number(right.from));
}
function overlay(project: JsonRecord, id: string): JsonRecord {
  const found = records(project.overlays).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing overlay ${id}`);
  return found;
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function fakeRenderer(proof: Dev03Stage6RenderProofV2 = passingProof()): Dev03Stage6RendererV2 {
  return async ({ outputDir }) => {
    const artifactPaths = Object.fromEntries(await Promise.all(
      DEV03_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
        const artifactPath = path.join(outputDir, FILENAMES[artifactId]);
        await writeFile(artifactPath, `fixture-${artifactId}`);
        return [artifactId, artifactPath];
      }),
    )) as Record<typeof DEV03_STAGE6_ARTIFACT_IDS_V2[number], string>;
    return { artifactPaths, proof };
  };
}

function passingProof(): Dev03Stage6RenderProofV2 {
  return {
    schemaVersion: DEV03_STAGE6_NATIVE_PROXY_V2,
    renderer: {
      root: 'components/editron/editor/version-7.0.0/remotion/index.ts',
      assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps',
      visualConsumer: 'components/editron/editor/version-7.0.0/components/core/layer.tsx',
      audioConsumer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx',
    },
    composition: { width: 320, height: 180, fpsNumerator: 30, fpsDenominator: 1, durationInFrames: 600 },
    sourceBindings: { videoAssetId: 'dev03-cards', audioAssetId: 'dev03-beats' },
    video: { codec: 'h264', width: 320, height: 180, averageFrameRate: '30/1', decodedFrameCount: 600, durationSeconds: 20, audioStreamCount: 1 },
    visual: {
      boundarySamples: [
        { frame: 118, rgb: [33, 82, 145] }, { frame: 119, rgb: [111, 54, 124] },
        { frame: 238, rgb: [111, 54, 124] }, { frame: 239, rgb: [33, 82, 145] },
        { frame: 478, rgb: [111, 54, 124] }, { frame: 479, rgb: [151, 72, 48] },
      ],
      boundaryMeanAbsDiffs: [45, 45, 45], shakeActiveFrame: 480, shakeNeutralFrame: 490,
      shakeActiveMeanAbsDiff: 2, shakeNeutralMeanAbsDiff: 0,
    },
    audio: {
      sampleRateHz: 48_000, sourceChannels: 1, baselineChannels: 2, renderedChannels: 2,
      sourceSampleFrames: 960_000, baselineSampleFrames: 960_000, renderedSampleFrames: 960_000,
      protectedStartFrame: 250, protectedEndFrame: 350,
      sourceProtectedRms: 0.1, baselineProtectedRms: 0.07071, renderedProtectedRms: 0.07071,
      sourceToRenderedGainRatio: 0.7071, sourceToRenderedCorrelation: 1,
      baselineToRenderedGainRatio: 1, baselineToRenderedCorrelation: 1, renderedPeak: 0.7,
    },
    browserErrors: [],
    externalCalls: { providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0 },
  };
}

async function scratch(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editron-dev03-causal-'));
  roots.push(root);
  return root;
}
