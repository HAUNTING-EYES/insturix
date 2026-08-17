import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildCanonicalDev03BeatWithheldEvidenceV2, buildCanonicalDev03MeasuredEvidenceV2, type Dev03MeasuredEvidenceReceiptV2 } from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { DEV03_STAGE6_ARTIFACT_IDS_V2, DEV03_STAGE6_NATIVE_PROXY_V2, type Dev03Stage6ExecutionEvidenceV2, type Dev03Stage6RenderProofV2, type Dev03Stage6RendererV2 } from '@/lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-contract-v2';
import { evaluateDev03Stage6NativeProxyV2 } from '@/lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-evaluator-v2';
import { executeDev03Stage6NativeProxyV2 } from '@/lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-executor-v2';
import { getCanonicalDev03Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import { compileDev03Stage4NativeV2 } from '@/lib/editron/research/open-ended-planner/stage4-dev03-native-compiler-v2';

const roots: string[] = []; let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;
const realIt = process.env.RUN_DEV03_STAGE6_REAL_RENDER === '1' ? it : it.skip;
beforeAll(async () => { const [audioBytes, analyzerSourceBytes] = await Promise.all([readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'), readFile('lib/editron/services/media/beat-detection-service.ts')]); measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes }); });
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('open-ended planner V2 DEV-03 Stage-6 native research proxy', () => {
  it('runs both real form owners on an isolated clone and emits a hash-bound receipt', async () => {
    const { graph, evidence } = await executeWith(fakeRenderer());
    expect(await evaluateDev03Stage6NativeProxyV2({ graph, evidence })).toEqual({ assessment: 'PASS', authorization: 'PASS', isolatedState: 'PASS', artifactIntegrity: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS', diagnostics: [] });
    expect(evidence.receipt).toMatchObject({ authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION', taskId: 'DEV-03', projectBinding: { expectedProjectRevision: 'R11', observedProjectRevision: 'NOT_READ', changedProjectPaths: [] }, proof: { state: 'PASS', reloadEquivalent: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS', projectMutation: 'NONE' }, fullProjectExecutionEligibility: 'NOT_EXECUTABLE', stateEffects: [] });
    expect(records(evidence.snapshots.aligned.overlays).map(({ id, from, durationInFrames, videoStartTime }) => [id, from, durationInFrames, videoStartTime])).toEqual([
      ['dev03-card-1', 0, 119, 0], ['dev03-card-2', 119, 120, 165], ['dev03-card-3', 239, 240, 3], ['dev03-card-4', 479, 121, 477], ['dev03-beats-track', 0, 600, undefined],
    ]);
    const final = records(evidence.snapshots.shaken.overlays).find(({ id }) => id === 'dev03-card-4');
    expect(records(final?.keyframeTracks).map(({ property }) => property)).toEqual(['x', 'y']);
    expect(JSON.parse(await readFile(evidence.receiptPath, 'utf8'))).toEqual(evidence.receipt);
  });

  it('blocks an invalid or production-upgraded graph before rendering', async () => {
    const graph = structuredClone(compile()) as Record<string, unknown>; graph.executionEligibility = 'PRODUCTION'; const renderer = vi.fn(fakeRenderer());
    await expect(executeDev03Stage6NativeProxyV2({ graph, executionId: 'dev03-invalid-graph', createdAt: '2026-08-16T00:00:00.000Z', outputDir: await scratch(), renderer })).rejects.toThrow(/DEV03_STAGE6_STAGE4_BLOCKED/);
    expect(renderer).not.toHaveBeenCalled();
  });

  it('detects state, artifact, authority, visual, and audio tampering', async () => {
    const state = await executeWith(fakeRenderer()); state.evidence.snapshots.shaken.durationInFrames = 599;
    expect(await evaluateDev03Stage6NativeProxyV2(state)).toMatchObject({ assessment: 'FAIL', isolatedState: 'FAIL', diagnostics: expect.arrayContaining(['STATE_SHAKEN_DRIFT']) });
    const artifact = await executeWith(fakeRenderer()); await writeFile(artifact.evidence.receipt.artifacts[0].path, 'tampered');
    expect(await evaluateDev03Stage6NativeProxyV2(artifact)).toMatchObject({ assessment: 'FAIL', artifactIntegrity: 'FAIL', diagnostics: expect.arrayContaining(['ARTIFACT_BYTES_DRIFT:SOURCE_VIDEO']) });
    const authority = await executeWith(fakeRenderer()); (authority.evidence.receipt as unknown as Record<string, unknown>).projectBinding = { projectId: 'oe-dev-03', expectedProjectRevision: 'R11', observedProjectRevision: 'R12', changedProjectPaths: ['overlays'] }; resign(authority.evidence);
    expect(await evaluateDev03Stage6NativeProxyV2(authority)).toMatchObject({ assessment: 'FAIL', authorization: 'FAIL', diagnostics: expect.arrayContaining(['AUTH_PROJECT_MUTATION_OR_REVISION_READ']) });
    const proof = await executeWith(fakeRenderer()); proof.evidence.receipt.renderProof.visual.shakeActiveMeanAbsDiff = 0; proof.evidence.receipt.renderProof.audio.baselineToRenderedCorrelation = 0; resign(proof.evidence);
    expect(await evaluateDev03Stage6NativeProxyV2(proof)).toMatchObject({ assessment: 'FAIL', renderedVisual: 'FAIL', renderedAudio: 'FAIL', diagnostics: expect.arrayContaining(['VISUAL_SHAKE_OR_NEUTRAL_RETURN_INVALID', 'AUDIO_PROTECTED_CONTENT_INVALID']) });
  });

  it('contains no production project, database, or live chat mutation authority', async () => {
    const source = await readFile('lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-executor-v2.ts', 'utf8');
    expect(source).not.toMatch(/ProjectService|saveProject|updateProject|MutationGate|MongoClient|connectToDatabase/);
    expect(source).toContain("observedProjectRevision: 'NOT_READ'"); expect(source).toContain("fullProjectExecutionEligibility: 'NOT_EXECUTABLE'");
  });

  realIt('renders and evaluates the real production Remotion video/audio path', async () => {
    const { graph, evidence } = await executeWith(undefined); const evaluation = await evaluateDev03Stage6NativeProxyV2({ graph, evidence });
    expect(evaluation).toMatchObject({ assessment: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS' });
    expect(evidence.receipt.renderProof.video).toMatchObject({ codec: 'h264', width: 320, height: 180, decodedFrameCount: 600 });
    expect(evidence.receipt.artifacts).toHaveLength(15);
  }, 360_000);
});

function compile() { const canonical = getCanonicalDev03Stage123V2({ measuredEvidence: measured, withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2() }); return compileDev03Stage4NativeV2({ measuredEvidence: measured, editorialIntent: canonical.editorialIntent, evidencePack: canonical.evidencePacks.BASELINE, evidenceBoundIntent: canonical.evidenceBoundIntents.BASELINE }); }
async function executeWith(renderer: Dev03Stage6RendererV2 | undefined) { const graph = compile(); const evidence = await executeDev03Stage6NativeProxyV2({ graph, executionId: `dev03-stage6-${roots.length + 1}`, createdAt: '2026-08-16T00:00:00.000Z', outputDir: await scratch(), ...(renderer ? { renderer } : {}) }); return { graph, evidence }; }
function fakeRenderer(): Dev03Stage6RendererV2 { return async ({ outputDir }) => { const names = { SOURCE_VIDEO: 'source-cards.mp4', SOURCE_AUDIO: 'source-beats.wav', CUT1_BEFORE: 'cut1-before-0118.png', CUT1_AFTER: 'cut1-after-0119.png', CUT2_BEFORE: 'cut2-before-0238.png', CUT2_AFTER: 'cut2-after-0239.png', CUT3_BEFORE: 'cut3-before-0478.png', CUT3_AFTER: 'cut3-after-0479.png', SHAKE_ACTIVE_BASELINE: 'shake-baseline-0480.png', SHAKE_ACTIVE: 'shake-active-0480.png', SHAKE_NEUTRAL_BASELINE: 'shake-baseline-0490.png', SHAKE_NEUTRAL: 'shake-neutral-0490.png', FULL_AV_PROXY: 'dev03-native-proxy.mp4', PROTECTED_AUDIO_BASELINE_WAV: 'dev03-protected-audio-baseline.wav', PROTECTED_AUDIO_WAV: 'dev03-protected-audio.wav' } as const; const artifactPaths = Object.fromEntries(await Promise.all(DEV03_STAGE6_ARTIFACT_IDS_V2.map(async (id) => { const file = path.join(outputDir, names[id]); await writeFile(file, `fixture-${id}`); return [id, file]; }))) as Record<typeof DEV03_STAGE6_ARTIFACT_IDS_V2[number], string>; return { artifactPaths, proof: passingProof() }; }; }
function passingProof(): Dev03Stage6RenderProofV2 { return { schemaVersion: DEV03_STAGE6_NATIVE_PROXY_V2, renderer: { root: 'components/editron/editor/version-7.0.0/remotion/index.ts', assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps', visualConsumer: 'components/editron/editor/version-7.0.0/components/core/layer.tsx', audioConsumer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx' }, composition: { width: 320, height: 180, fpsNumerator: 30, fpsDenominator: 1, durationInFrames: 600 }, sourceBindings: { videoAssetId: 'dev03-cards', audioAssetId: 'dev03-beats' }, video: { codec: 'h264', width: 320, height: 180, averageFrameRate: '30/1', decodedFrameCount: 600, durationSeconds: 20, audioStreamCount: 1 }, visual: { boundarySamples: [{ frame: 118, rgb: [33, 82, 145] }, { frame: 119, rgb: [111, 54, 124] }, { frame: 238, rgb: [111, 54, 124] }, { frame: 239, rgb: [33, 82, 145] }, { frame: 478, rgb: [111, 54, 124] }, { frame: 479, rgb: [151, 72, 48] }], boundaryMeanAbsDiffs: [45, 45, 45], shakeActiveFrame: 480, shakeNeutralFrame: 490, shakeActiveMeanAbsDiff: 2, shakeNeutralMeanAbsDiff: 0 }, audio: { sampleRateHz: 48_000, sourceChannels: 1, baselineChannels: 2, renderedChannels: 2, sourceSampleFrames: 960_000, baselineSampleFrames: 960_000, renderedSampleFrames: 960_000, protectedStartFrame: 250, protectedEndFrame: 350, sourceProtectedRms: 0.1, baselineProtectedRms: 0.07071, renderedProtectedRms: 0.07071, sourceToRenderedGainRatio: 0.7071, sourceToRenderedCorrelation: 1, baselineToRenderedGainRatio: 1, baselineToRenderedCorrelation: 1, renderedPeak: 0.7 }, browserErrors: [], externalCalls: { providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0 } }; }
async function scratch(): Promise<string> { const root = await mkdtemp(path.join(os.tmpdir(), 'editron-dev03-stage6-')); roots.push(root); return root; }
function records(value: unknown): Record<string, any>[] { return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []; }
function resign(evidence: Dev03Stage6ExecutionEvidenceV2): void { const receipt = evidence.receipt as unknown as Record<string, unknown>; delete receipt.receiptHash; receipt.receiptHash = hashCanonicalJsonV1(receipt); }
