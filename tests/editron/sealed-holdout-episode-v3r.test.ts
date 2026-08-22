import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

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

type JsonRecord = Record<string, unknown>;

describe('sealed holdout provider-native episode V3R', () => {
  it('connects measured H01 evidence through the semantic owner to one native mutation', async () => {
    const requests: JsonRecord[] = [];
    let turn = 0;
    const receipt = await runSealedHoldoutEpisodeV3R({
      manifest: await manifest(),
      caseId: 'HOLD-01:C1',
      route: route(),
      invoke: vi.fn(async (request) => {
        requests.push(request.body);
        turn += 1;
        return openAiResponse(turn, turn === 1
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
                intent: {
                  query: 'align the adjacent circular forms',
                  action: 'replace_with_matching_source_range',
                },
                evidenceIds: ['E1', 'E2'],
              })
              : turn === 4
                ? call('replace', 'use_matching_footage', {
                  projectId: 'oe-hold-01', expectedProjectRevision: 'R9',
                  assetId: 'h01-dial',
                  targetRange: { startFrame: 150, endFrame: 300 },
                  sourceRange: { startFrame: 30, endFrame: 180 },
                  evidenceIds: ['E1', 'E2'],
                })
                : finish('READY_FOR_PROOF', ['E1', 'E2']));
      }),
    });

    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(receipt.selectedOperatorIds).toEqual([
      'find_visual_moment', 'get_timeline_view', 'resolve_visual_edit',
      'use_matching_footage',
    ]);
    expect(receipt.turns.slice(0, 4).every(({ execution }) =>
      record(execution).disposition === 'OK')).toBe(true);
    expect(receipt.turns[2].execution).toMatchObject({
      disposition: 'OK',
      output: {
        proposedOperation: {
          targetOperatorId: 'use_matching_footage',
          arguments: {
            assetId: 'h01-dial', sourceRange: { startFrame: 30, endFrame: 180 },
          },
        },
      },
    });
    expect(receipt.turns[3].execution).toMatchObject({
      disposition: 'OK',
      output: { receipt: { status: 'PASS', projectRevision: expect.stringMatching(/^OE-HOLD-/) } },
    });
    expect(receipt.stateEffects).toEqual([]);
    expect(JSON.stringify(requests[0])).toContain('replace_with_matching_source_range');
    expect(JSON.stringify(requests[0])).not.toContain('"highlight"');
  });

  it('keeps the noisy H01 arm unresolved without a mutation', async () => {
    let turn = 0;
    const receipt = await runSealedHoldoutEpisodeV3R({
      manifest: await manifest(),
      caseId: 'HOLD-01:C2',
      route: route(),
      invoke: vi.fn(async () => {
        turn += 1;
        return openAiResponse(turn, turn === 1
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
                intent: {
                  query: 'align the adjacent circular forms',
                  action: 'replace_with_matching_source_range',
                },
                evidenceIds: ['E1', 'E2'],
              })
              : finish('UNVERIFIABLE', ['E1', 'E2']));
      }),
    });

    expect(receipt.terminal.disposition).toBe('UNVERIFIABLE');
    expect(receipt.selectedOperatorIds).not.toContain('use_matching_footage');
    expect(receipt.turns[2].execution).toMatchObject({ disposition: 'UNVERIFIABLE' });
    expect(receipt.stateEffects).toEqual([]);
  });

  it('rejects a task-shaped tool subset before provider inference', async () => {
    const invoke = vi.fn();
    await expect(runSealedHoldoutEpisodeV3R({
      manifest: await manifest(), caseId: 'HOLD-01:C1', route: route(), invoke,
      operatorPresentationOrder: ['find_visual_moment', 'use_matching_footage'],
    })).rejects.toThrow('SEALED_HOLDOUT_V3_EPISODE_OPERATOR_SET_DRIFT');
    expect(invoke).not.toHaveBeenCalled();
  });
});

async function manifest() {
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
    routeId: 'OPENAI_LUNA' as const,
    provider: 'openai' as const,
    model: 'gpt-5.6-luna' as const,
    claimedModelIdentity: 'gpt-5.6-luna',
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
function openAiResponse(turn: number, output: JsonRecord) {
  return {
    status: 200,
    body: { id: `v3-response-${turn}`, model: 'gpt-5.6-luna', status: 'completed', output: [output] },
  };
}
async function fileSha(filePath: string): Promise<string> {
  const bytes = await readFile(path.resolve(filePath));
  return createHash('sha256').update(bytes).digest('hex');
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
