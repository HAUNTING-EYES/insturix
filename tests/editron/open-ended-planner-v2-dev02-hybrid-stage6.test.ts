import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import canonicalBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import canonicalReferenceJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import evidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import {
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';
import { cloneCanonicalJsonV1, hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  compileCanonicalDev02HybridStage4GraphV2,
  compileDev02HybridStage4GraphV2,
} from '@/lib/editron/research/open-ended-planner/dev02-hybrid-stage4-compiler-v2';
import type {
  Dev02HybridNativeSourceBindingV2,
} from '@/lib/editron/research/open-ended-planner/dev02-hybrid-stage6-contract-v2';
import { evaluateDev02HybridStage6V2 } from '@/lib/editron/research/open-ended-planner/dev02-hybrid-stage6-evaluator-v2';
import { executeDev02HybridStage6V2 } from '@/lib/editron/research/open-ended-planner/dev02-hybrid-stage6-executor-v2';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1 } from '@/lib/editron/research/open-ended-planner/generated-composition-research-proxy-capability-v1';
import type { GeneratedCompositionProgramV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-program-v1';
import { encodeSyntheticVideoV2 } from '@/lib/editron/research/open-ended-planner/media-materializer-v2';
import { compileStage4DeterministicBaselineV2 } from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import { compileStage4ResearchProxyPreviewV2 } from '@/lib/editron/research/open-ended-planner/stage4-research-proxy-compiler-v2';
import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';
import { buildDev02VerifiedIslandUpstreamFixtureV2 } from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-verified-island-upstream-v2';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

describe('open-ended planner V2 DEV-02 full hybrid Stage 6', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('renders and independently verifies the full generated-to-native hybrid reel', async () => {
    const fixture = await makeFixture();
    const graph = compileCanonicalDev02HybridStage4GraphV2();
    const evidence = await executeDev02HybridStage6V2({
      graph,
      executionId: 'dev02-hybrid-real-0001',
      createdAt: '2026-08-16T00:00:00.000Z',
      outputDir: fixture.outputDir,
      islandUpstream: fixture.islandUpstream,
      nativeSource: fixture.nativeSource,
    });
    expect(await evaluateDev02HybridStage6V2({ graph, evidence })).toEqual({
      assessment: 'PASS', authorization: 'PASS', sourceIdentity: 'PASS', artifactIntegrity: 'PASS',
      upstreamBinding: 'PASS', hybridTiming: 'PASS', boundaryContinuity: 'PASS',
      nativeContinuation: 'PASS', projectIsolation: 'PASS', diagnostics: [],
    });
    expect(evidence.receipt.renderProof.outputVideo).toMatchObject({
      codec: 'h264', width: 1080, height: 1920, averageFrameRate: '30/1',
      decodedFrameCount: 345, audioStreamCount: 0,
    });
    expect(evidence.receipt.projectBinding.changedProjectPaths).toEqual([]);
    expect(evidence.receipt.stateEffects).toEqual([]);
    expect(evidence.receipt.fullProjectExecutionEligibility).toBe('NOT_EXECUTABLE');
  }, 120_000);

  it('executes the model-selected move/retime as an idempotent isolated-clone operation', async () => {
    const graph = isolatedMoveHybridGraph();
    const fixture = await makeFixture((graph as Record<string, unknown>).sourceIslandGraph);
    const evidence = await executeDev02HybridStage6V2({
      graph, executionId: 'dev02-hybrid-qwen-move', createdAt: '2026-08-16T00:00:00.000Z',
      outputDir: fixture.outputDir, islandUpstream: fixture.islandUpstream, nativeSource: fixture.nativeSource,
    });
    expect(evidence.receipt.inputs.nativeContinuation).toMatchObject({
      operatorId: 'move_retime_overlay', scope: 'ISOLATED_PROXY_CLONE',
      disposition: 'APPLIED_IDEMPOTENT', changedProxyPaths: [], appliedStateEffects: [],
    });
    expect(evidence.receipt.operations[1].owner).toBe('move_retime_overlay');
    expect(await evaluateDev02HybridStage6V2({ graph, evidence }))
      .toMatchObject({ assessment: 'PASS', nativeContinuation: 'PASS', projectIsolation: 'PASS', diagnostics: [] });
  }, 120_000);

  it('rejects a source range or generated hard-gate lie before rendering', async () => {
    const fixture = await makeFixture();
    const graph = compileCanonicalDev02HybridStage4GraphV2();
    await expect(executeDev02HybridStage6V2({
      graph, executionId: 'dev02-hybrid-bad-range', createdAt: '2026-08-16T00:00:00.000Z',
      outputDir: fixture.outputDir, islandUpstream: fixture.islandUpstream,
      nativeSource: { ...fixture.nativeSource, sourceStartFrame: 181 } as unknown as Dev02HybridNativeSourceBindingV2,
    })).rejects.toThrow('NATIVE_BINDING_INVALID');
    await expect(executeDev02HybridStage6V2({
      graph, executionId: 'dev02-hybrid-bad-proof', createdAt: '2026-08-16T00:00:00.000Z',
      outputDir: fixture.outputDir,
      islandUpstream: {
        ...fixture.islandUpstream,
        renderedProof: { ...fixture.islandUpstream.renderedProof, hardGateDisposition: 'FAIL' },
      },
      nativeSource: fixture.nativeSource,
    })).rejects.toThrow('UPSTREAM_RENDERED_PROOF_INVALID');
  }, 120_000);

  it('detects output artifact tampering after a successful render', async () => {
    const fixture = await makeFixture();
    const graph = compileCanonicalDev02HybridStage4GraphV2();
    const evidence = await executeDev02HybridStage6V2({
      graph, executionId: 'dev02-hybrid-tamper', createdAt: '2026-08-16T00:00:00.000Z',
      outputDir: fixture.outputDir, islandUpstream: fixture.islandUpstream, nativeSource: fixture.nativeSource,
    });
    const proxy = evidence.receipt.artifacts.find(({ artifactId }) => artifactId === 'FULL_HYBRID_PROXY');
    await fs.appendFile(proxy!.path, Buffer.from('tamper'));
    const evaluation = await evaluateDev02HybridStage6V2({ graph, evidence });
    expect(evaluation.assessment).toBe('FAIL');
    expect(evaluation.artifactIntegrity).toBe('FAIL');
  }, 120_000);
});

async function makeFixture(graph?: unknown) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-dev02-hybrid-'));
  roots.push(root);
  const islandPath = path.join(root, 'island.mp4');
  const nativePath = path.join(root, 'native.mp4');
  await encodeSyntheticVideoV2({
    assetId: 'dev02-close', outputPath: nativePath, width: 360, height: 640,
    frameCount: 360, ffmpegPath: getFFmpegPath(),
  });
  await makeIslandVideo(islandPath, nativePath);
  const nativeSha = await sha256File(nativePath);
  const boundaryPath = path.join(root, 'boundary.png');
  await execFileAsync(getFFmpegPath(), [
    '-y', '-v', 'error', '-i', nativePath, '-vf', 'select=eq(n\\,180),scale=1080:1920:flags=lanczos',
    '-frames:v', '1', boundaryPath,
  ], { windowsHide: true, timeout: 60_000 });
  const islandUpstream = await buildDev02VerifiedIslandUpstreamFixtureV2({
    root: path.join(root, 'upstream'),
    playableBytes: await fs.readFile(islandPath),
    boundaryFrameBytes: await fs.readFile(boundaryPath),
    graph,
  });
  const nativeSource: Dev02HybridNativeSourceBindingV2 = {
    assetId: 'dev02-close', assetVersion: `sha256:${nativeSha}`,
    videoPath: nativePath, videoSha256: nativeSha,
    sourceStartFrame: 180, sourceEndExclusiveFrame: 345,
    projectStartFrame: 180, projectEndExclusiveFrame: 345,
  };
  return { root, outputDir: path.join(root, 'output'), islandUpstream, nativeSource };
}

function isolatedMoveHybridGraph() {
  const editorialIntent = structuredClone(canonicalIntentJson) as unknown as Record<string, unknown>;
  const evidenceBoundIntent = structuredClone(canonicalBoundJson) as unknown as Record<string, unknown>;
  for (const value of [editorialIntent, evidenceBoundIntent]) {
    const nodes = value.nodes as Array<Record<string, unknown>>;
    const continuation = nodes.find((node) => node.intentNodeId === 'node-native-continuation');
    if (!continuation) throw new Error('DEV02_CONTINUATION_FIXTURE_MISSING');
    continuation.candidateCapabilityIds = ['move_retime_overlay', 'trim_overlay', 'update_overlay'];
  }
  const sourceCompilationSource = {
    referenceBlueprint: canonicalReferenceJson, editorialIntent, evidenceBoundIntent, evidencePack: evidencePackJson,
  };
  const sourceBlockedGraph = compileStage4DeterministicBaselineV2(sourceCompilationSource);
  const program = cloneCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_PROGRAM_V1) as GeneratedCompositionProgramV1;
  program.projectBinding = { ...program.projectBinding, evidencePackHash: hashCanonicalJsonV1(evidencePackJson) };
  program.referenceBinding = { ...program.referenceBinding, blueprintHash: hashCanonicalJsonV1(canonicalReferenceJson) };
  const islandEvaluationSource = { sourceBlockedGraph, sourceCompilationSource };
  const islandGraph = compileStage4ResearchProxyPreviewV2({
    program, sourceBundle: DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    evidencePack: evidencePackJson, referenceBlueprint: canonicalReferenceJson,
    supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    capabilityPromotion: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1,
    sourceBlockedGraph, sourceCompilationSource,
  });
  return compileDev02HybridStage4GraphV2({ islandGraph, islandEvaluationSource });
}

async function makeIslandVideo(output: string, nativePath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x553366:s=1080x1920:r=30',
    '-i', nativePath, '-filter_complex',
    '[0:v]trim=start_frame=0:end_frame=179,setpts=PTS-STARTPTS[build];'
      + '[1:v]trim=start_frame=180:end_frame=181,setpts=PTS-STARTPTS,scale=1080:1920:flags=lanczos[exit];'
      + '[build][exit]concat=n=2:v=1:a=0,fps=30[outv]',
    '-map', '[outv]', '-frames:v', '180', '-an', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-colorspace', 'bt709', '-color_range', 'tv', output,
  ], { windowsHide: true, timeout: 60_000 });
}

async function sha256File(filePath: string): Promise<string> {
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}
