import { describe, expect, it, vi } from 'vitest';

import {
  buildChatBattleInitialProjectDocument,
  persistChatBattleDurableSeeds,
  prepareChatBattleDurableSeeds,
} from '@/lib/editron/services/chat-edit-battle-fixture-seeds';
import {
  evaluateChatBattleFixturePreconditions,
  getChatEditBattleScenario,
} from '@/lib/editron/services/chat-edit-battle-harness';
import type { ChatRestorableProjectField } from '@/lib/editron/services/checkpoint-service';

const NOW = new Date('2026-07-25T10:00:00.000Z');
const REVISION = {
  schemaVersion: 1 as const,
  value: 4,
  compatibilityUpdatedAt: NOW.toISOString(),
};
const WRITER_RECEIPT = {
  schemaVersion: 1 as const,
  projectId: 'proj_chatbattle_seed',
  revision: { ...REVISION, value: 5 },
  committedAt: '2026-07-25T10:00:01.000Z',
};

describe('chat battle durable fixture seeds', () => {
  it.each(['undo-overlay-edit', 'undo-full-state'])(
    'seeds real checkpoint history and a material prior state for %s',
    async (scenarioId) => {
      const scenario = getChatEditBattleScenario(scenarioId)!;
      const prepared = prepareChatBattleDurableSeeds({
        scenario,
        project: project(),
        now: NOW,
      });
      const dependencies = seedDependencies(prepared);

      await persistChatBattleDurableSeeds(prepared, dependencies);

      expect(prepared.sessionId).toMatch(/^sess_battle_undo_/);
      expect(prepared.chatSessions).toEqual([
        expect.objectContaining({
          projectId: 'proj_chatbattle_seed',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              checkpointIds: [
                prepared.undo!.beforeCheckpointId,
                prepared.undo!.afterCheckpointId,
              ],
            }),
          ]),
        }),
      ]);
      expect(prepared.project.overlays).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `battle-undo-overlay-${scenarioId}`,
          row: 0,
          styles: expect.objectContaining({
            backgroundColor: 'rgba(0,0,0,0.88)',
            color: '#ffffff',
            opacity: 1,
          }),
          metadata: { battleFixtureMutation: true },
        }),
      ]));
      expect(prepared.undo!.beforeProject.overlays).not.toEqual(prepared.project.overlays);
      expect(buildChatBattleInitialProjectDocument(prepared).overlays)
        .toEqual(prepared.undo!.beforeProject.overlays);
      expect(evaluateChatBattleFixturePreconditions(scenario, prepared.project))
        .toMatchObject({ ok: true, satisfied: ['ai-edit-checkpoint'] });
      expect(dependencies.claimChatEditOperation).toHaveBeenCalledWith(expect.objectContaining({
        checkpointId: prepared.undo!.beforeCheckpointId,
        operationId: prepared.undo!.operationId,
        projectId: 'proj_chatbattle_seed',
        userId: 'user_fixture',
        operationStatus: 'running',
        capturedProjectRevision: REVISION,
        force: true,
      }));
      expect(dependencies.commitUndoFixtureMutation).toHaveBeenCalledWith({
        userId: 'user_fixture',
        projectId: 'proj_chatbattle_seed',
        project: prepared.project,
        expectedRevision: REVISION,
      });
      expect(dependencies.createCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
        checkpointId: prepared.undo!.afterCheckpointId,
        type: 'after-llm',
        capturedWriterReceipt: WRITER_RECEIPT,
        force: true,
      }));
      expect(dependencies.updateChatEditOperation).toHaveBeenCalledWith(
        prepared.undo!.beforeCheckpointId,
        'user_fixture',
        prepared.undo!.operationId,
        expect.objectContaining({
          operationStatus: 'completed',
          afterCheckpointId: prepared.undo!.afterCheckpointId,
        }),
      );
      if (scenarioId === 'undo-full-state') {
        expect(prepared.project.durationInFrames).toBe(330);
        expect(prepared.project.projectMetadata).toMatchObject({ battleFixtureStateMutation: true });
      }
    },
  );

  it('claims the exact replay operation through the production transaction owner', async () => {
    const scenario = getChatEditBattleScenario('retry-idempotency')!;
    const prepared = prepareChatBattleDurableSeeds({
      scenario,
      project: project(),
      now: NOW,
    });
    const dependencies = seedDependencies(prepared);

    await persistChatBattleDurableSeeds(prepared, dependencies);

    expect(prepared.operationId).toMatch(/^chat-battle-replay:/);
    expect(prepared.sessionId).toMatch(/^sess_battle_replay_/);
    expect(evaluateChatBattleFixturePreconditions(scenario, prepared.project))
      .toMatchObject({ ok: true, satisfied: ['prior-idempotency-record'] });
    expect(dependencies.prepareChatAiEditTransaction).toHaveBeenCalledWith({
      operationId: prepared.operationId,
      sessionId: prepared.sessionId,
      projectId: 'proj_chatbattle_seed',
      userId: 'user_fixture',
      project: prepared.project,
      projectRevision: REVISION,
    });
    expect(dependencies.claimChatEditOperation).not.toHaveBeenCalled();
  });

  it('clones an owned video as a durable reference without adding it to source footage', () => {
    const scenario = getChatEditBattleScenario('reference-style-transfer')!;
    const prepared = prepareChatBattleDurableSeeds({
      scenario,
      project: project(),
      sourceReferenceAsset: {
        _id: 'mongo-source',
        assetId: 'asset_source_video',
        userId: 'user_fixture',
        type: 'video',
        source: 'user-upload',
        filename: 'reference.mp4',
        cachedUrl: 'https://cdn.example/reference.mp4',
        gcsPath: null,
        size: 123,
        uploadedAt: NOW,
      },
      now: NOW,
    });

    expect(prepared.referenceAsset).toMatchObject({
      assetId: prepared.referenceAssetId,
      projectId: 'proj_chatbattle_seed',
      type: 'video',
      metadata: {
        battleFixtureAlias: true,
        battleFixtureProjectId: 'proj_chatbattle_seed',
        role: 'reference',
        isReference: true,
      },
    });
    expect(prepared.referenceAsset).not.toHaveProperty('_id');
    expect(prepared.project.sourceAssetIds).toEqual(['asset_source_video']);
    expect(prepared.project.mediaAssets).toEqual([
      expect.objectContaining({
        assetId: prepared.referenceAssetId,
        role: 'reference',
      }),
    ]);
    expect(evaluateChatBattleFixturePreconditions(scenario, prepared.project))
      .toMatchObject({ ok: true, satisfied: ['durable-reference-asset'] });
  });

  it('fails closed when a reference scenario has no owned video to clone', () => {
    expect(() => prepareChatBattleDurableSeeds({
      scenario: getChatEditBattleScenario('reference-style-transfer')!,
      project: project(),
      now: NOW,
    })).toThrow('requires an owned source video asset');
  });

  it('keeps provider faults deterministic while allowing the seeded rollback journey', () => {
    const providerFailure = getChatEditBattleScenario('bgm-provider-failure')!;
    expect(providerFailure.executionLane).toBe('deterministic-contract');

    const rollback = getChatEditBattleScenario('rollback-partial-failure')!;
    const prepared = prepareChatBattleDurableSeeds({
      scenario: rollback,
      project: project(),
      now: NOW,
    });
    expect(evaluateChatBattleFixturePreconditions(rollback, prepared.project).ok).toBe(true);
  });
});

function seedDependencies(prepared: ReturnType<typeof prepareChatBattleDurableSeeds>) {
  const claimChatEditOperation = vi.fn(async (input: any) => ({
    claimed: true,
    checkpoint: checkpoint(input.checkpointId, input.operationId),
  }));
  const createCheckpoint = vi.fn(async (input: any) => checkpoint(input.checkpointId, input.operationId));
  return {
    captureRestorableProjectState: vi.fn((value: Record<string, unknown>) => ({
      presentFields: ['overlays', 'durationInFrames', 'name', 'projectMetadata'] as ChatRestorableProjectField[],
      fields: {
        overlays: structuredClone(value.overlays ?? []),
        durationInFrames: value.durationInFrames,
        name: value.name,
        projectMetadata: structuredClone(value.projectMetadata),
      },
    })),
    claimChatEditOperation,
    createCheckpoint,
    updateChatEditOperation: vi.fn(async () => undefined),
    loadProjectForMutation: vi.fn(async () => ({
      project: buildChatBattleInitialProjectDocument(prepared),
      revision: REVISION,
    })),
    commitUndoFixtureMutation: vi.fn(async () => WRITER_RECEIPT),
    prepareChatAiEditTransaction: vi.fn(async () => ({
      status: 'ready' as const,
      beforeCheckpointId: 'ckpt_replay_before',
    })),
  };
}

function checkpoint(checkpointId: string, operationId: string) {
  return {
    checkpointId,
    sessionId: 'sess_fixture',
    projectId: 'proj_chatbattle_seed',
    userId: 'user_fixture',
    overlays: [],
    operationId,
    operationStatus: 'running' as const,
    timestamp: NOW,
    description: 'fixture',
    type: 'before-llm' as const,
    createdAt: NOW,
  };
}

function project(): Record<string, unknown> {
  return {
    projectId: 'proj_chatbattle_seed',
    userId: 'user_fixture',
    name: 'Seed project',
    fps: 30,
    durationInFrames: 300,
    sourceAssetIds: ['asset_source_video'],
    overlays: [{
      id: 'clip-1',
      type: 'video',
      assetId: 'asset_source_video',
      from: 0,
      durationInFrames: 300,
      row: 0,
    }],
    metadata: {
      battleTest: {
        disposable: true,
      },
    },
    projectRevision: REVISION.value,
    updatedAt: NOW,
  };
}
