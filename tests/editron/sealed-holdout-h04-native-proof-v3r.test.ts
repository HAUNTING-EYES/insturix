import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import { evaluateSealedHoldoutTraceV3R2 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-evaluator-v2r';
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
import { proveSealedHoldoutH04NativeOutcomeV3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h04-native-proof-v3r';
import { proveSealedHoldoutH04NativeOutcomeV3R2 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h04-native-proof-v3r2';
import type { ProviderNativeEpisodeReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import { buildSealedHoldoutSelectedOperationTraceV3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-trace-v2r';

import {
  finishSealedHoldoutScriptV2R,
  runScriptedBudgetedSealedHoldoutV3R2,
} from './helpers/sealed-holdout-v2r-test-driver';

type JsonRecord = Record<string, unknown>;

let suiteRoot = '';
let sequence = 0;
let mediaManifest: Awaited<ReturnType<typeof materializeHoldoutMediaV2R>>;

beforeAll(async () => {
  suiteRoot = await mkdtemp(join(tmpdir(), 'e3h4-'));
  mediaManifest = await materializeHoldoutMediaV2R(join(suiteRoot, 'm'));
}, 60_000);

afterAll(async () => {
  if (suiteRoot) await rm(suiteRoot, { recursive: true, force: true });
}, 60_000);

describe('sealed HOLD-04 evolving-state and rendered native proof V3R', () => {
  it('binds the current metered writer handoff to the same state and AV proof', async () => {
    const root = join(suiteRoot, `current-${++sequence}`);
    const result = await runScriptedBudgetedSealedHoldoutV3R2({
      caseId: 'HOLD-04:C1',
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      calls: [
        { name: 'get_video_transcription', arguments: {
          projectId: 'oe-hold-04', assetId: 'h04-host',
        } },
        { name: 'get_timeline_view', arguments: {
          projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
        } },
        { name: 'cut_section', arguments: {
          projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
          targetRange: { startFrame: 120, endFrame: 225 },
          evidenceIds: ['E1', 'E2'],
          constraints: { retainOccurrence: 'SECOND', preserveCaptionPresentation: true },
        } },
        { name: 'get_timeline_view', arguments: {
          projectId: 'oe-hold-04',
          argumentReferences: [{
            targetField: 'expectedProjectRevision', resultReferenceId: 'result_t3_1',
          }],
        } },
        finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
      ],
    });
    const proof = await proveSealedHoldoutH04NativeOutcomeV3R2({
      manifest: result.manifest,
      caseId: 'HOLD-04:C1',
      budgetedEpisode: result.budgetedEpisode,
      trace: result.trace,
      evaluation: result.evaluation,
      mediaManifest,
      outputDirectory: join(root, 'proof'),
    });
    expect(proof).toMatchObject({
      version: 'EDITRON_OE_SEALED_HOLDOUT_H04_NATIVE_AV_STATE_PROOF_V3R_2_RESOURCE_BOUND_1',
      authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION',
      resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET',
      assessment: 'PASS_RESEARCH_NATIVE_OWNER_STATE_AND_RENDERED_AV_PROXY',
      evolvingOwnerStateProof: {
        beforeDurationInFrames: 540, afterDurationInFrames: 435,
        retainedCaptionText: 'our launch is Friday', retainedCaptionWordCount: 4,
      },
      video: { decodedFrameCount: 435, averageFrameRate: '30/1' },
      stateEffects: [],
    });
    expect(proof.runtimeBudgetReceiptSha256)
      .toBe(result.trace.runtimeBudgetReceiptSha256);
    expect(proof.writerIssuedProjectRevision)
      .toBe(result.trace.nodes[2].writerIssuedProjectRevision);
  }, 60_000);

  it('binds the actual post-cut state and proves the retained take with real AV', async () => {
    const result = await setup(true);
    const proof = await proveSealedHoldoutH04NativeOutcomeV3R({
      manifest: result.manifest,
      caseId: 'HOLD-04:C1',
      providerEpisode: result.episode,
      trace: result.trace,
      evaluation: result.evaluation,
      mediaManifest,
      outputDirectory: join(result.root, 'p'),
    });

    expect(result.evaluation).toMatchObject({
      assessment: 'READY_FOR_PROOF', executionForm: 'NATIVE', proofRequired: true,
    });
    expect(proof).toMatchObject({
      authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY_NO_PROJECT_MUTATION_NO_RESOURCE_BUDGET_CLAIM',
      assessment: 'PASS_RESEARCH_NATIVE_OWNER_STATE_AND_RENDERED_AV_PROXY',
      resourceBudgetProof: 'NOT_CLAIMED',
      productProjectMutationProof: 'NOT_CLAIMED',
      selectedMutation: {
        operatorId: 'cut_section', removedRange: { startFrame: 120, endFrame: 225 },
      },
      evolvingOwnerStateProof: {
        beforeDurationInFrames: 540, afterDurationInFrames: 435,
        rightSourceStartFrame: 225, retainedCaptionText: 'our launch is Friday',
        retainedCaptionWordCount: 4, retainedCaptionGroupCount: 1,
      },
      video: { codec: 'h264', averageFrameRate: '30/1', decodedFrameCount: 435 },
      audio: { codec: 'aac', sampleRate: 48000, channels: 1 },
      captionPixelProof: 'NOT_RENDERED_FIXTURE_HAS_NO_BOUND_CAPTION_PIXEL_FORM',
      speechIntelligibilityProof: 'NOT_CLAIMED_SYNTHETIC_TONE_ONLY',
      stateEffects: [],
    });
    expect(proof.writerIssuedProjectRevision).toMatch(/^OE-HOLD-/);
    expect(proof.audio.retainedTakeMeanAbsolutePcm)
      .toBeGreaterThan(proof.audio.precedingQuietMeanAbsolutePcm * 10);
    expect(proof.visualTakeProof.greenPixelsAtStart).toBeGreaterThan(1_000);
  }, 60_000);

  it('fails hidden evaluation when the episode never rereads writer-bound state', async () => {
    const result = await setup(false);
    expect(result.evaluation).toMatchObject({
      assessment: 'FAIL', proofRequired: false,
      diagnostics: ['EVAL_H04_POST_MUTATION_STATE_READ_MISSING'],
    });
  });

  it('rejects an internally rehashed episode that no longer matches the frozen trace', async () => {
    const result = await setup(true);
    const forged = forgeEpisodeState(result.episode);
    await expect(proveSealedHoldoutH04NativeOutcomeV3R({
      manifest: result.manifest,
      caseId: 'HOLD-04:C1',
      providerEpisode: forged,
      trace: result.trace,
      evaluation: result.evaluation,
      mediaManifest,
      outputDirectory: join(result.root, 'forged'),
    })).rejects.toThrow('SEALED_V3_H04_PROOF_EPISODE_BINDING_INVALID');
  });
});

async function setup(includePostMutationRead: boolean) {
  const root = join(suiteRoot, `c${++sequence}`);
  const manifest = await buildManifest();
  let turn = 0;
  const episode = await runSealedHoldoutEpisodeV3R({
    manifest,
    caseId: 'HOLD-04:C1',
    route: route(),
    invoke: vi.fn(async (request) => {
      turn += 1;
      const output = turn === 1
        ? call('transcript', 'get_video_transcription', {
          projectId: 'oe-hold-04', assetId: 'h04-host',
        })
        : turn === 2
          ? call('before', 'get_timeline_view', {
            projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
          })
          : turn === 3
            ? call('cut', 'cut_section', {
              projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
              targetRange: { startFrame: 120, endFrame: 225 },
              evidenceIds: ['E1', 'E2'],
              constraints: {
                retainOccurrence: 'SECOND', preserveCaptionPresentation: true,
              },
            })
            : includePostMutationRead && turn === 4
              ? call('after', 'get_timeline_view', {
                projectId: 'oe-hold-04',
                expectedProjectRevision: requireWriterRevision(request.body),
              })
              : finish('READY_FOR_PROOF', ['E1', 'E2']);
      return response(turn, output);
    }),
  });
  const trace = buildSealedHoldoutSelectedOperationTraceV3R({
    manifest, caseId: 'HOLD-04:C1', providerEpisode: episode,
  });
  const evaluation = evaluateSealedHoldoutTraceV3R2({
    manifest, caseId: 'HOLD-04:C1', trace,
  });
  return { root, manifest, episode, trace, evaluation };
}

function forgeEpisodeState(
  episode: Readonly<ProviderNativeEpisodeReceiptV2R>,
): Readonly<ProviderNativeEpisodeReceiptV2R> {
  const forged = structuredClone(episode) as ProviderNativeEpisodeReceiptV2R;
  const cutTurn = forged.turns.find((turn) => record(record(turn.modelCall)).name === 'cut_section');
  const output = record(record(cutTurn?.execution).output);
  const transition = record(record(record(output.receipt).proof).isolatedStateTransition);
  const projection = record(transition.projection);
  record(projection.captionSemanticState).wordCount = 99;
  forged.transcriptSha256 = hashCanonicalJsonV1(forged.turns);
  const { receiptSha256: _oldReceipt, ...material } = forged;
  forged.receiptSha256 = hashCanonicalJsonV1(material);
  return forged;
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
    body: { id: `v3-h04-proof-${turn}`, model: 'gpt-5.6-luna', status: 'completed', output: [output] },
  };
}
function requireWriterRevision(value: unknown): string {
  const revision = collectStringsForKey(value, 'projectRevision')
    .filter((entry) => entry.startsWith('OE-HOLD-')).at(-1);
  if (!revision) throw new Error('TEST_H04_WRITER_REVISION_MISSING');
  return revision;
}
function collectStringsForKey(value: unknown, key: string): string[] {
  if (typeof value === 'string') {
    const candidate = value.trim();
    if (!candidate.startsWith('{') && !candidate.startsWith('[')) return [];
    try { return collectStringsForKey(JSON.parse(candidate) as unknown, key); } catch { return []; }
  }
  if (Array.isArray(value)) return value.flatMap((entry) => collectStringsForKey(entry, key));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as JsonRecord).flatMap(([entryKey, entry]) => [
    ...(entryKey === key && typeof entry === 'string' ? [entry] : []),
    ...collectStringsForKey(entry, key),
  ]);
}
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
