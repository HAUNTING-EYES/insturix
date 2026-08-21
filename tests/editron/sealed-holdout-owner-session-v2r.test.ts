import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SealedHoldoutOwnerSessionV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-owner-session-v2r';
import { runSealedHoldoutEpisodeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';

async function manifest() {
  const bytes = await readFile(path.resolve(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R));
  return buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(bytes).digest('hex'),
  );
}

describe('sealed holdout owner session V2R', () => {
  it('reveals only evidence owned by the selected read family', async () => {
    const session = new SealedHoldoutOwnerSessionV2R({
      manifest: await manifest(), caseId: 'HOLD-02:C1',
    });
    const visual = await session.execute({
      operatorId: 'inspect_user_asset', turn: 1,
      arguments: { projectId: 'oe-hold-02', assetId: 'h02-door' },
    });
    expect(visual.disposition).toBe('OK');
    expect(JSON.stringify(visual.output)).toContain('SOURCE_WINDOWS');
    expect(JSON.stringify(visual.output)).not.toContain('NARRATIVE');
    expect(JSON.stringify(visual.output)).not.toMatch(/BASELINE|evaluatorOnly|behaviourBrief/);
    expect(visual.evidenceIds).toEqual(['E1']);

    const wrongOwner = await session.execute({
      operatorId: 'find_audio_moment', turn: 2,
      arguments: { projectId: 'oe-hold-02', query: 'door callback' },
    });
    expect(wrongOwner.disposition).toBe('UNVERIFIABLE');
    expect(JSON.stringify(wrongOwner)).not.toContain('NARRATIVE');
  });

  it('issues a clone writer revision and rejects a stale next writer', async () => {
    const session = new SealedHoldoutOwnerSessionV2R({
      manifest: await manifest(), caseId: 'HOLD-02:C1',
    });
    await session.execute({
      operatorId: 'inspect_user_asset', turn: 1,
      arguments: { projectId: 'oe-hold-02', assetId: 'h02-door' },
    });
    const first = await session.execute({
      operatorId: 'add_overlay', turn: 2,
      arguments: {
        projectId: 'oe-hold-02', expectedProjectRevision: 'R4',
        assetId: 'h02-door', targetRange: { startFrame: 0, endFrame: 75 },
      },
    });
    expect(first.disposition).toBe('OK');
    const writerRevision = (first.output.receipt as { projectRevision: string }).projectRevision;
    expect(writerRevision).toMatch(/^OE-HOLD-[a-f0-9]{64}$/);
    expect(first.output.receipt).toMatchObject({
      status: 'PASS',
      proof: { authority: 'RESEARCH_CLONE_OPERATION_LOG_ONLY', renderedProof: 'NOT_RUN' },
    });

    const stale = await session.execute({
      operatorId: 'update_overlay', turn: 3,
      arguments: {
        projectId: 'oe-hold-02', expectedProjectRevision: 'R4',
        overlayId: 0, patch: { role: 'callback' },
      },
    });
    expect(stale.disposition).toBe('CONFLICT');
    expect(session.snapshot()).toMatchObject({
      currentProjectRevision: writerRevision, stateEffects: [],
    });
  });

  it('returns moving-contour evidence without inventing an edit result', async () => {
    const session = new SealedHoldoutOwnerSessionV2R({
      manifest: await manifest(), caseId: 'HOLD-08:C1',
    });
    const result = await session.execute({
      operatorId: 'find_visual_moment', turn: 1,
      arguments: { projectId: 'oe-hold-08', query: 'moving fine-contour subject' },
    });
    expect(result.disposition).toBe('OK');
    expect(JSON.stringify(result.output)).toContain('fineContour');
    expect(result.output).toMatchObject({ targetFrame: 0, evidenceStrength: 1 });
    expect(JSON.stringify(result.output)).not.toContain('CAPABILITY_GAP');
    expect(session.snapshot()).toMatchObject({ stateEffects: [] });
  });

  it('detects exact stale revision and keeps noisy revision unverified', async () => {
    const cohort = await manifest();
    const stale = new SealedHoldoutOwnerSessionV2R({
      manifest: cohort, caseId: 'HOLD-07:C1',
    });
    const staleRead = await stale.execute({
      operatorId: 'read_project_file', turn: 1,
      arguments: { projectId: 'oe-hold-07', expectedProjectRevision: 'R17' },
    });
    expect(staleRead.disposition).toBe('CONFLICT');
    expect(staleRead.output).toMatchObject({
      details: { currentProjectRevision: 'R18' },
    });

    const noisy = new SealedHoldoutOwnerSessionV2R({
      manifest: cohort, caseId: 'HOLD-07:C2',
    });
    const mutation = await noisy.execute({
      operatorId: 'delete_overlay', turn: 1,
      arguments: {
        projectId: 'oe-hold-07', expectedProjectRevision: 'R17', overlayId: 0,
      },
    });
    expect(mutation.disposition).toBe('UNVERIFIABLE');
    expect(noisy.snapshot()).toMatchObject({ revisionKnown: false, stateEffects: [] });
  });

  it('runs through the sealed wrapper without an injected executor', async () => {
    let turn = 0;
    const receipt = await runSealedHoldoutEpisodeV2R({
      manifest: await manifest(), caseId: 'HOLD-02:C1',
      route: {
        routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
        claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
      },
      invoke: async () => {
        turn += 1;
        const output = turn === 1 ? [{
          type: 'function_call', call_id: 'inspect', name: 'inspect_user_asset',
          arguments: JSON.stringify({ projectId: 'oe-hold-02', assetId: 'h02-door' }),
        }] : turn === 2 ? [{
          type: 'function_call', call_id: 'add', name: 'add_overlay',
          arguments: JSON.stringify({
            projectId: 'oe-hold-02', expectedProjectRevision: 'R4',
            assetId: 'h02-door', targetRange: { startFrame: 0, endFrame: 75 },
          }),
        }] : [{
          type: 'function_call', call_id: 'finish',
          name: 'finish_editron_research_episode',
          arguments: JSON.stringify({
            disposition: 'READY_FOR_PROOF', reasonCodes: ['CLONE_OPERATION_ACCEPTED'],
            evidenceIds: ['E1'], summary: 'The isolated operation requires render proof.',
          }),
        }];
        return {
          status: 200,
          body: { id: `sealed-${turn}`, model: 'gpt-5.6-luna', status: 'completed', output },
        };
      },
    });
    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(receipt.selectedOperatorIds).toEqual(['inspect_user_asset', 'add_overlay']);
    expect(receipt.turns[1].execution).toMatchObject({
      disposition: 'OK',
      output: {
        receipt: {
          status: 'PASS',
          proof: { authority: 'RESEARCH_CLONE_OPERATION_LOG_ONLY', renderedProof: 'NOT_RUN' },
        },
      },
    });
    expect(receipt.stateEffects).toEqual([]);
  });
});
