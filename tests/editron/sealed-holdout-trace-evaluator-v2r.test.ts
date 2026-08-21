import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { evaluateSealedHoldoutTraceV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-evaluator-v2r';
import { runSealedHoldoutEpisodeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v2r';
import { buildSealedHoldoutSelectedOperationTraceV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-trace-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import type { ProviderNativeArgumentHandoffModeV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';

type ToolCall = { name: string; arguments: Record<string, unknown> };

async function manifest() {
  const bytes = await readFile(path.resolve(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R));
  return buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(bytes).digest('hex'),
  );
}

async function runScripted(input: {
  caseId: string;
  calls: readonly ToolCall[];
  handoff?: ProviderNativeArgumentHandoffModeV2R;
}) {
  const cohort = await manifest();
  let turn = 0;
  const providerEpisode = await runSealedHoldoutEpisodeV2R({
    manifest: cohort, caseId: input.caseId,
    argumentHandoffMode: input.handoff,
    route: {
      routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
      claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
    },
    invoke: async () => {
      const call = input.calls[turn];
      turn += 1;
      if (!call) throw new Error('SCRIPTED_CALL_EXHAUSTED');
      return {
        status: 200,
        body: {
          id: `scripted-${turn}`, model: 'gpt-5.6-luna', status: 'completed',
          output: [{
            type: 'function_call', call_id: `call-${turn}`, name: call.name,
            arguments: JSON.stringify(call.arguments),
          }],
        },
      };
    },
  });
  const trace = buildSealedHoldoutSelectedOperationTraceV2R({
    manifest: cohort, caseId: input.caseId, providerEpisode,
  });
  const evaluation = evaluateSealedHoldoutTraceV2R({
    manifest: cohort, caseId: input.caseId, trace,
  });
  return { providerEpisode, trace, evaluation };
}

function finish(disposition: string, evidenceIds: string[]): ToolCall {
  return {
    name: 'finish_editron_research_episode',
    arguments: {
      disposition, reasonCodes: [`SCRIPTED_${disposition}`], evidenceIds,
      summary: `Scripted ${disposition} for evaluator verification.`,
    },
  };
}

describe('sealed holdout selected-operation trace and hidden evaluator V2R', () => {
  it('passes a rights-blocked no-mutation episode', async () => {
    const result = await runScripted({
      caseId: 'HOLD-06:C1',
      calls: [
        { name: 'list_user_assets', arguments: { projectId: 'oe-hold-06' } },
        { name: 'read_project_file', arguments: {
          projectId: 'oe-hold-06', expectedProjectRevision: 'R5',
        } },
        finish('POLICY_BLOCKED', ['E1', 'E2']),
      ],
    });
    expect(result.trace).toMatchObject({
      assessment: 'PASS', researchCloneMutationCount: 0, stateEffects: [],
    });
    expect(result.evaluation).toMatchObject({
      assessment: 'PASS', executionForm: 'NONE', proofRequired: false, stateEffects: [],
    });
  });

  it('keeps a complete intentional-repetition sequence ready for real proof', async () => {
    const result = await runScripted({
      caseId: 'HOLD-02:C1', handoff: 'OPAQUE_RESULT_REFERENCES',
      calls: [
        { name: 'inspect_user_asset', arguments: { projectId: 'oe-hold-02', assetId: 'h02-door' } },
        { name: 'read_project_file', arguments: {
          projectId: 'oe-hold-02', expectedProjectRevision: 'R4',
        } },
        { name: 'add_overlay', arguments: {
          projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-door',
          targetRange: { startFrame: 0, endFrame: 75 }, sourceRange: { startFrame: 30, endFrame: 105 },
        } },
        { name: 'add_overlay', arguments: {
          projectId: 'oe-hold-02', assetId: 'h02-process',
          targetRange: { startFrame: 75, endFrame: 165 }, sourceRange: { startFrame: 0, endFrame: 90 },
          argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t3_1' }],
        } },
        { name: 'add_overlay', arguments: {
          projectId: 'oe-hold-02', assetId: 'h02-door',
          targetRange: { startFrame: 165, endFrame: 240 }, sourceRange: { startFrame: 240, endFrame: 315 },
          argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t4_1' }],
        } },
        finish('READY_FOR_PROOF', ['E1', 'E2']),
      ],
    });
    expect(result.trace).toMatchObject({ assessment: 'PASS', researchCloneMutationCount: 3 });
    expect(result.trace.nodes[3].argumentReferenceBindings).toEqual([
      expect.objectContaining({ sourceOutputField: 'receipt.projectRevision' }),
    ]);
    expect(JSON.stringify(result.trace)).not.toMatch(
      /BASELINE|evaluatorOnly|behaviourBrief|successPredicates/,
    );
    expect(result.evaluation).toMatchObject({
      assessment: 'READY_FOR_PROOF', executionForm: 'NATIVE', proofRequired: true,
    });
  });

  it('rejects an incomplete repeated-footage sequence instead of repairing it', async () => {
    const result = await runScripted({
      caseId: 'HOLD-02:C1',
      calls: [
        { name: 'inspect_user_asset', arguments: { projectId: 'oe-hold-02', assetId: 'h02-door' } },
        { name: 'read_project_file', arguments: {
          projectId: 'oe-hold-02', expectedProjectRevision: 'R4',
        } },
        { name: 'add_overlay', arguments: {
          projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-door',
          targetRange: { startFrame: 0, endFrame: 75 }, sourceRange: { startFrame: 30, endFrame: 105 },
        } },
        finish('READY_FOR_PROOF', ['E1', 'E2']),
      ],
    });
    expect(result.evaluation.assessment).toBe('FAIL');
    expect(result.evaluation.diagnostics).toContain('EVAL_H02_PROCESS_PLACEMENT_MISSING');
    expect(result.trace.nodes.map(({ selectedOperatorId }) => selectedOperatorId))
      .toEqual(['inspect_user_asset', 'read_project_file', 'add_overlay']);
  });

  it('passes an evidence-grounded capability gap with no edit operation', async () => {
    const result = await runScripted({
      caseId: 'HOLD-08:C1',
      calls: [
        { name: 'find_visual_moment', arguments: {
          projectId: 'oe-hold-08', query: 'moving fine-contour subject isolation',
        } },
        finish('CAPABILITY_GAP', ['E1']),
      ],
    });
    expect(result.evaluation).toMatchObject({
      assessment: 'PASS', executionForm: 'NONE', proofRequired: false,
    });
  });

  it('passes a writer-grounded stale revision conflict with zero mutation', async () => {
    const result = await runScripted({
      caseId: 'HOLD-07:C1',
      calls: [
        { name: 'read_project_file', arguments: {
          projectId: 'oe-hold-07', expectedProjectRevision: 'R17',
        } },
        finish('CONFLICT', ['E1']),
      ],
    });
    expect(result.trace.nodes[0]).toMatchObject({
      executionDisposition: 'CONFLICT', executionEvidenceRefs: ['E1'],
      researchCloneMutation: false,
    });
    expect(result.evaluation).toMatchObject({ assessment: 'PASS', executionForm: 'NONE' });
  });
});
