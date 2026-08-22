import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import {
  evaluateSealedHoldoutTraceV3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-evaluator-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r';
import { runSealedHoldoutEpisodeV3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v3r';
import { proveSealedHoldoutH01NativeOutcomeV3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h01-native-proof-v3r';
import { buildSealedHoldoutSelectedOperationTraceV3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;

let suiteRoot = '';
let caseSequence = 0;
let mediaManifest: Awaited<ReturnType<typeof materializeHoldoutMediaV2R>>;

beforeAll(async () => {
  suiteRoot = await mkdtemp(join(tmpdir(), 'e3h1-'));
  mediaManifest = await materializeHoldoutMediaV2R(join(suiteRoot, 'm'));
}, 60_000);

afterAll(async () => {
  if (suiteRoot) await rm(suiteRoot, { recursive: true, force: true });
}, 60_000);

describe('sealed HOLD-01 rendered native proof V3R', () => {
  it('binds corrected evidence through owner, trace, evaluator and real rendered geometry', async () => {
    const result = await setup('HOLD-01:C1', 30, 'READY_FOR_PROOF');
    const proof = await proveSealedHoldoutH01NativeOutcomeV3R({
      manifest: result.manifest,
      caseId: 'HOLD-01:C1',
      trace: result.trace,
      evaluation: result.evaluation,
      mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'p'),
    });

    expect(result.evaluation).toMatchObject({
      assessment: 'READY_FOR_PROOF', executionForm: 'NATIVE', proofRequired: true,
    });
    expect(proof).toMatchObject({
      authority: 'RESEARCH_RENDERED_NATIVE_PROXY_NO_PROJECT_MUTATION_NO_RESOURCE_BUDGET_CLAIM',
      resourceBudgetProof: 'NOT_CLAIMED',
      assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY',
      productProjectMutationProof: 'NOT_CLAIMED',
      selectedMutation: { incomingStartFrame: 30, incomingEndFrame: 180 },
      video: { codec: 'h264', averageFrameRate: '30/1', decodedFrameCount: 300 },
      stateEffects: [],
    });
    expect(proof.geometry.normalizedCenterDistance).toBeLessThanOrEqual(0.03);
    expect(proof.writerIssuedProjectRevision).toMatch(/^OE-HOLD-/);
  }, 60_000);

  it('rejects the first start outside the measured half-open window before rendering', async () => {
    const result = await setup('HOLD-01:C1', 37, 'READY_FOR_PROOF');
    await expect(proveSealedHoldoutH01NativeOutcomeV3R({
      manifest: result.manifest,
      caseId: 'HOLD-01:C1',
      trace: result.trace,
      evaluation: result.evaluation,
      mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'p'),
    })).rejects.toThrow('SEALED_H01_PROOF_SELECTED_MUTATION_INVALID');
  });

  it('rejects an evaluation copied or altered after the trace was issued', async () => {
    const result = await setup('HOLD-01:C1', 30, 'READY_FOR_PROOF');
    const forged = { ...result.evaluation, assessment: 'PASS' as const };
    await expect(proveSealedHoldoutH01NativeOutcomeV3R({
      manifest: result.manifest,
      caseId: 'HOLD-01:C1',
      trace: result.trace,
      evaluation: forged,
      mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'p'),
    })).rejects.toThrow('SEALED_V3_H01_PROOF_EVALUATION_DRIFT');
  });

  it('does not accept a false READY after the noisy owner returned UNVERIFIABLE', async () => {
    const result = await setup('HOLD-01:C2', null, 'READY_FOR_PROOF');
    expect(result.episode.turns.some(({ execution }) =>
      record(execution).disposition === 'UNVERIFIABLE')).toBe(true);
    expect(result.evaluation.assessment).toBe('FAIL');
    expect(result.evaluation.proofRequired).toBe(false);
  });
});

async function setup(
  caseId: 'HOLD-01:C1' | 'HOLD-01:C2',
  incomingStartFrame: number | null,
  terminalDisposition: string,
) {
  const root = join(suiteRoot, `c${++caseSequence}`);
  const manifest = await buildManifest();
  let turn = 0;
  const episode = await runSealedHoldoutEpisodeV3R({
    manifest,
    caseId,
    route: route(),
    invoke: vi.fn(async () => {
      turn += 1;
      const output = turn === 1
        ? call('visual', 'find_visual_moment', {
          projectId: 'oe-hold-01', query: 'round clock and product dial alignment',
          evidenceIds: ['E1'],
        })
        : turn === 2
          ? call('timeline', 'get_timeline_view', {
            projectId: 'oe-hold-01', expectedProjectRevision: 'R9',
          })
          : turn === 3
            ? call('resolve', 'resolve_visual_edit', {
              projectId: 'oe-hold-01', expectedProjectRevision: 'R9',
              intent: { query: 'align adjacent circular forms', action: 'replace_with_matching_source_range' },
              evidenceIds: ['E1', 'E2'],
            })
            : incomingStartFrame !== null && turn === 4
              ? call('replace', 'use_matching_footage', {
                projectId: 'oe-hold-01', expectedProjectRevision: 'R9', assetId: 'h01-dial',
                targetRange: { startFrame: 150, endFrame: 300 },
                sourceRange: { startFrame: incomingStartFrame, endFrame: incomingStartFrame + 150 },
                evidenceIds: ['E1', 'E2'], constraints: { transition: 'HARD_CUT_ONLY' },
              })
              : finish(terminalDisposition, ['E1', 'E2']);
      return response(turn, output);
    }),
  });
  const trace = buildSealedHoldoutSelectedOperationTraceV3R({ manifest, caseId, providerEpisode: episode });
  const evaluation = evaluateSealedHoldoutTraceV3R({ manifest, caseId, trace });
  return { root, manifest, episode, trace, evaluation, mediaManifest };
}

async function buildManifest() {
  const base = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  return buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: base,
  });
}

function route() {
  return {
    routeId: 'OPENAI_LUNA' as const, provider: 'openai' as const,
    model: 'gpt-5.6-luna' as const, claimedModelIdentity: 'gpt-5.6-luna',
    reasoningMode: 'medium' as const,
  };
}
function call(callId: string, name: string, args: JsonRecord): JsonRecord {
  return { type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args) };
}
function finish(disposition: string, evidenceIds: readonly string[]): JsonRecord {
  return call('finish', 'finish_editron_research_episode', {
    disposition, reasonCodes: [`MODEL_${disposition}`], evidenceIds,
    summary: `Finished as ${disposition}`,
  });
}
function response(turn: number, output: JsonRecord) {
  return {
    status: 200,
    body: { id: `v3-h01-${turn}`, model: 'gpt-5.6-luna', status: 'completed', output: [output] },
  };
}
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
