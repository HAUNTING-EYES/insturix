import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import {
  evaluateBudgetedSealedHoldoutTraceV3R2,
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
import {
  buildSealedHoldoutCohortManifestV3R2,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r2';
import {
  runBudgetedSealedHoldoutEpisodeV3R2,
  runSealedHoldoutEpisodeV3R,
}
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v3r';
import {
  proveSealedHoldoutH01NativeOutcomeV3R,
  proveSealedHoldoutH01NativeOutcomeV3R2,
}
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h01-native-proof-v3r';
import {
  bindSealedHoldoutInputTokenBoundV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';
import {
  buildBudgetedSealedHoldoutSelectedOperationTraceV3R2,
  buildSealedHoldoutSelectedOperationTraceV3R,
}
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

  it('binds current V3R2 resource accounting to the existing rendered proof mechanics', async () => {
    const result = await setupCurrent(30);
    const proof = await proveSealedHoldoutH01NativeOutcomeV3R2({
      manifest: result.manifest,
      caseId: 'HOLD-01:C1',
      trace: result.trace,
      evaluation: result.evaluation,
      mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'p'),
    });

    expect(proof).toMatchObject({
      version: 'EDITRON_OE_SEALED_HOLDOUT_H01_RENDERED_NATIVE_PROOF_V3R_2_RESOURCE_BOUND_1',
      resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET',
      runtimeBudgetReceiptSha256: result.trace.runtimeBudgetReceiptSha256,
      assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY',
      video: { codec: 'h264', averageFrameRate: '30/1', decodedFrameCount: 300 },
      stateEffects: [],
    });
  }, 60_000);

  it('rejects a current noisy C2 range deletion before proof dispatch', async () => {
    const result = await setupCurrent(null, 'HOLD-01:C2');

    expect(result.trace.nodes.map(({ selectedOperatorId }) => selectedOperatorId))
      .toContain('cut_section');
    expect(result.evaluation).toMatchObject({
      assessment: 'FAIL',
      proofRequired: false,
    });
    expect(result.evaluation.diagnostics).toEqual(expect.arrayContaining([
      'EVAL_CURRENT_EXECUTABLE_PROOF_OWNER_MISSING:HOLD-01:C2',
      'EVAL_H01_RANGE_DELETE_FORBIDDEN',
    ]));
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

async function setupCurrent(
  incomingStartFrame: number | null,
  caseId: 'HOLD-01:C1' | 'HOLD-01:C2' = 'HOLD-01:C1',
) {
  const root = join(suiteRoot, `c${++caseSequence}`);
  const v3 = await buildManifest();
  const manifest = buildSealedHoldoutCohortManifestV3R2({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
    baseManifest: v3,
  });
  const taskCase = manifest.cases.find((entry) => entry.caseId === caseId)!;
  let turn = 0;
  const episode = await runBudgetedSealedHoldoutEpisodeV3R2({
    manifest,
    caseId,
    route: route(),
    authorization: {
      version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
      manifestSha256: manifest.manifestSha256,
      caseId,
      publicCaseSha256: taskCase.publicCaseSha256,
      routeId: route().routeId,
      claimedModelIdentity: route().claimedModelIdentity,
      routeSha256: hashCanonicalJsonV1(route()),
      approvedBy: 'admin', approvedAt: '2026-08-22T00:00:00.000Z',
      maxInputTokensPerTurn: 85_000, absoluteMaxSpendMicroUsd: 5_000_000,
      pricing: {
        normalInputNanoUsdPerToken: 200, cachedInputNanoUsdPerToken: 20,
        cacheWriteNanoUsdPerToken: 250, outputNanoUsdPerToken: 1_200,
      },
    },
    countInputTokens: async (request) => bindSealedHoldoutInputTokenBoundV2R({
      request, inputTokensUpperBound: 1_000,
      method: 'CURRENT_H01_PROOF_TEST_BOUND_V1',
    }),
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
              intent: { query: 'align adjacent circular forms',
                action: 'replace_with_matching_source_range' },
              evidenceIds: ['E1', 'E2'],
            })
            : turn === 4 && incomingStartFrame !== null
              ? call('replace', 'use_matching_footage', {
                projectId: 'oe-hold-01', expectedProjectRevision: 'R9',
                assetId: 'h01-dial', targetRange: { startFrame: 150, endFrame: 300 },
                sourceRange: { startFrame: incomingStartFrame,
                  endFrame: incomingStartFrame + 150 },
                evidenceIds: ['E1', 'E2'], constraints: { transition: 'HARD_CUT_ONLY' },
              })
              : turn === 4
                ? call('wrong-range-delete', 'cut_section', {
                  projectId: 'oe-hold-01', expectedProjectRevision: 'R9',
                  targetRange: { startFrame: 78, endFrame: 148 },
                  evidenceIds: ['E1', 'E2'],
                  constraints: { preserveSpeech: true, preserveOutsideRange: true },
                })
              : finish('READY_FOR_PROOF', ['E1', 'E2']);
      return response(turn, output);
    }),
  });
  const trace = buildBudgetedSealedHoldoutSelectedOperationTraceV3R2({
    manifest, caseId, budgetedEpisode: episode,
  });
  const evaluation = evaluateBudgetedSealedHoldoutTraceV3R2({
    manifest, caseId, trace,
  });
  return { root, manifest, episode, trace, evaluation, mediaManifest };
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
    body: {
      id: `v3-h01-${turn}`, model: 'gpt-5.6-luna', status: 'completed',
      usage: {
        input_tokens: 100, output_tokens: 40, total_tokens: 140,
        input_tokens_details: { cached_tokens: 10, cache_write_tokens: 20 },
        output_tokens_details: { reasoning_tokens: 10 },
      },
      output: [output],
    },
  };
}
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
