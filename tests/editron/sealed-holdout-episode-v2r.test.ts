import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { mapProviderNativeNonProofTerminalToProductOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-product-outcome-v2r';
import { buildProviderNativeResultReferenceProjectionPolicyV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import { buildSealedHoldoutEpisodeContextV2R, runSealedHoldoutEpisodeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v2r';
import { buildProviderNativeToolSetV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import { V2R_OPERATOR_CATALOG }
  from '@/lib/editron/research/open-ended-planner/operator-catalog-v2r';

async function manifest() {
  const bytes = await readFile(path.resolve(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R));
  return buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(bytes).digest('hex'),
  );
}

describe('sealed holdout provider-native episode V2R', () => {
  it('preserves the historical default tool-set identity', () => {
    const toolSet = buildProviderNativeToolSetV2R(['read_project_file']);
    expect(toolSet.toolSetSha256)
      .toBe('508f5dcd8b515a4a3ac4f90ad841025b4c1c547a5d5980188fcc4d41981732f9');
  });

  it('exposes all forty records and keeps POLICY_BLOCKED distinct', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const executeIsolated = vi.fn();
    const receipt = await runSealedHoldoutEpisodeV2R({
      manifest: await manifest(), caseId: 'HOLD-06:C1',
      route: {
        routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
        claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
      },
      invoke: vi.fn(async (request) => {
        requests.push(request.body);
        return {
          status: 200,
          body: {
            id: 'response-policy', model: 'gpt-5.6-luna', status: 'completed',
            output: [{
              type: 'function_call', call_id: 'finish-policy',
              name: 'finish_editron_research_episode',
              arguments: JSON.stringify({
                disposition: 'POLICY_BLOCKED', reasonCodes: ['NETWORK_EGRESS_DENIED'],
                evidenceIds: [], summary: 'Authorized stock retrieval is unavailable.',
              }),
            }],
          },
        };
      }),
      executeIsolated,
    });
    const requestText = JSON.stringify(requests[0]);
    if (!Array.isArray(V2R_OPERATOR_CATALOG.operators)) {
      throw new Error('SEALED_HOLDOUT_TEST_OPERATOR_CATALOG_INVALID');
    }
    for (const operator of V2R_OPERATOR_CATALOG.operators as Array<{ operatorId: string }>) {
      expect(requestText, operator.operatorId).toContain(operator.operatorId);
    }
    expect((requests[0].tools as unknown[])).toHaveLength(34);
    expect(requestText).toContain('POLICY_BLOCKED');
    expect(requestText).not.toMatch(/BASELINE|RIGHTS-EVIDENCE-WITHHELD|evaluatorOnly|behaviourBrief/);
    expect(receipt.terminal.disposition).toBe('POLICY_BLOCKED');
    expect(mapProviderNativeNonProofTerminalToProductOutcomeV2R('POLICY_BLOCKED'))
      .toBe('POLICY_BLOCKED');
    expect(executeIsolated).not.toHaveBeenCalled();
    expect(receipt.stateEffects).toEqual([]);
  });

  it('rejects a task-shaped operator subset instead of leaking hints', async () => {
    await expect(runSealedHoldoutEpisodeV2R({
      manifest: await manifest(), caseId: 'HOLD-01:C1',
      route: {
        routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
        claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
      },
      operatorPresentationOrder: ['find_visual_moment', 'use_matching_footage'],
      invoke: vi.fn(), executeIsolated: vi.fn(),
    })).rejects.toThrow('SEALED_HOLDOUT_EPISODE_OPERATOR_SET_DRIFT');
  });

  it('keeps clarification distinct and declares generic writer-revision handoff', async () => {
    const cohort = await manifest();
    const context = buildSealedHoldoutEpisodeContextV2R({
      manifest: cohort, caseId: 'HOLD-02:C1',
    });
    const projections = buildProviderNativeResultReferenceProjectionPolicyV2R(
      context as unknown as Record<string, unknown>,
    );
    expect(projections).toContainEqual({
      sourceOperatorId: 'add_overlay',
      sourceOutputPath: ['receipt', 'projectRevision'],
    });
    expect(projections).toContainEqual({
      sourceOperatorId: 'cut_section',
      sourceOutputPath: ['timelineCoordinateTransform'],
    });

    const receipt = await runSealedHoldoutEpisodeV2R({
      manifest: cohort, caseId: 'HOLD-02:C2',
      route: {
        routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
        claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
      },
      invoke: vi.fn(async () => ({
        status: 200,
        body: {
          id: 'response-clarify', model: 'gpt-5.6-terra', status: 'completed',
          output: [{
            type: 'function_call', call_id: 'finish-clarify',
            name: 'finish_editron_research_episode',
            arguments: JSON.stringify({
              disposition: 'CLARIFICATION_REQUIRED',
              reasonCodes: ['NARRATIVE_CALLBACK_AMBIGUOUS'], evidenceIds: ['E1', 'E2'],
              summary: 'The callback asset cannot be identified reliably.',
            }),
          }],
        },
      })),
      executeIsolated: vi.fn(),
    });
    expect(receipt.terminal.disposition).toBe('CLARIFICATION_REQUIRED');
    expect(mapProviderNativeNonProofTerminalToProductOutcomeV2R('CLARIFICATION_REQUIRED'))
      .toBe('CLARIFICATION_REQUIRED');
  });

  it('carries a writer-issued revision through an opaque causal reference', async () => {
    let invocation = 0;
    const executeIsolated = vi.fn(async ({ operatorId, arguments: args }) => {
      if (operatorId === 'add_overlay') {
        expect(args.expectedProjectRevision).toBe('R4');
        return {
          authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
          disposition: 'OK' as const,
          output: { receipt: { status: 'PASS', projectRevision: 'R5' } },
          evidenceIds: ['E1'],
        };
      }
      expect(operatorId).toBe('update_overlay');
      expect(args.expectedProjectRevision).toBe('R5');
      return {
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
        disposition: 'OK' as const,
        output: { receipt: { status: 'PASS', projectRevision: 'R6' } },
        evidenceIds: ['E1'],
      };
    });
    const receipt = await runSealedHoldoutEpisodeV2R({
      manifest: await manifest(), caseId: 'HOLD-02:C1',
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      route: {
        routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
        claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
      },
      invoke: vi.fn(async () => {
        invocation += 1;
        const calls = invocation === 1 ? [{
          type: 'function_call', call_id: 'add', name: 'add_overlay',
          arguments: JSON.stringify({
            projectId: 'proj-h02', expectedProjectRevision: 'R4', assetId: 'h02-door',
            targetRange: { startFrame: 0, endFrame: 75 },
          }),
        }] : invocation === 2 ? [{
          type: 'function_call', call_id: 'update', name: 'update_overlay',
          arguments: JSON.stringify({
            projectId: 'proj-h02', overlayId: 1, patch: { role: 'callback' },
            argumentReferences: [{
              targetField: 'expectedProjectRevision', resultReferenceId: 'result_t1_1',
            }],
          }),
        }] : [{
          type: 'function_call', call_id: 'finish',
          name: 'finish_editron_research_episode',
          arguments: JSON.stringify({
            disposition: 'READY_FOR_PROOF', reasonCodes: ['ISOLATED_EDIT_COMPLETE'],
            evidenceIds: ['E1'], summary: 'The research clone is ready for proof.',
          }),
        }];
        return {
          status: 200,
          body: { id: `response-${invocation}`, model: 'gpt-5.6-luna', status: 'completed', output: calls },
        };
      }),
      executeIsolated,
    });
    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(executeIsolated).toHaveBeenCalledTimes(2);
    expect(receipt.turns[1].argumentReferenceBindings).toEqual([
      expect.objectContaining({
        targetField: 'expectedProjectRevision', sourceOperatorId: 'add_overlay',
        sourceOutputField: 'receipt.projectRevision',
      }),
    ]);
    expect(receipt.stateEffects).toEqual([]);
  });
});
