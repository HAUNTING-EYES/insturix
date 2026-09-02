import { randomUUID } from 'node:crypto';

import type { ChatBattleScenario } from './chat-edit-battle-harness';
import type {
  Checkpoint,
  CheckpointInput,
  ChatEditOperationUpdate,
  RestorableProjectState,
} from './checkpoint-service';
import type {
  ProjectMutationReceiptV1,
  ProjectRevisionV1,
} from './project-service';

const CHAT_BATTLE_UNDO_MUTATED_FIELDS = [
  'overlays',
  'durationInFrames',
  'name',
  'projectMetadata',
] as const;

interface ChatBattleFixtureSeedDependencies {
  captureRestorableProjectState(project: Record<string, unknown>): RestorableProjectState;
  claimChatEditOperation(input: CheckpointInput & {
    checkpointId: string;
    operationId: string;
    projectState: RestorableProjectState;
  }): Promise<{ claimed: boolean; checkpoint: Checkpoint }>;
  createCheckpoint(input: CheckpointInput): Promise<Checkpoint | null>;
  updateChatEditOperation(
    checkpointId: string,
    userId: string,
    operationId: string,
    update: ChatEditOperationUpdate,
  ): Promise<void>;
  loadProjectForMutation(
    userId: string,
    projectId: string,
  ): Promise<{ project: Record<string, unknown>; revision: ProjectRevisionV1 }>;
  commitUndoFixtureMutation(input: {
    userId: string;
    projectId: string;
    project: Record<string, unknown>;
    expectedRevision: ProjectRevisionV1;
  }): Promise<ProjectMutationReceiptV1>;
  prepareChatAiEditTransaction(input: {
    operationId: string;
    sessionId: string;
    projectId: string;
    userId: string;
    project: Record<string, unknown>;
    projectRevision: ProjectRevisionV1;
  }): Promise<{ status: 'ready' | 'duplicate'; beforeCheckpointId: string }>;
}

interface UndoSeed {
  operationId: string;
  beforeCheckpointId: string;
  afterCheckpointId: string;
  beforeProject: Record<string, unknown>;
}

export interface PreparedChatBattleDurableSeeds {
  project: Record<string, unknown>;
  chatSessions: Record<string, unknown>[];
  referenceAsset?: Record<string, unknown>;
  sessionId?: string;
  operationId?: string;
  referenceAssetId?: string;
  undo?: UndoSeed;
  replay?: {
    operationId: string;
    sessionId: string;
  };
}

export function prepareChatBattleDurableSeeds(input: {
  scenario: ChatBattleScenario;
  project: Record<string, unknown>;
  sourceReferenceAsset?: Record<string, unknown> | null;
  now: Date;
}): PreparedChatBattleDurableSeeds {
  const project = input.project;
  const projectId = requireString(project.projectId, 'fixture projectId');
  const userId = requireString(project.userId, 'fixture userId');
  const fixtureContext = asRecord(project.chatBattleFixture);
  const result: PreparedChatBattleDurableSeeds = {
    project,
    chatSessions: [],
  };

  if (input.scenario.fixtureRequirements.includes('ai-edit-checkpoint')) {
    const beforeProject = structuredClone(project);
    const suffix = randomUUID().replace(/-/g, '').slice(0, 16);
    const operationId = `chat-battle-seed:${input.scenario.id}:${suffix}`;
    const beforeCheckpointId = `ckpt_battle_before_${suffix}`;
    const afterCheckpointId = `ckpt_battle_after_${suffix}`;
    const sessionId = `sess_battle_undo_${suffix}`;

    applyUndoFixtureMutation(project, input.scenario.id);
    Object.assign(fixtureContext, {
      beforeCheckpointId,
      checkpointIds: [beforeCheckpointId, afterCheckpointId],
    });
    result.undo = { operationId, beforeCheckpointId, afterCheckpointId, beforeProject };
    result.sessionId = sessionId;
    result.chatSessions.push(buildCheckpointHistorySession({
      sessionId,
      userId,
      projectId,
      beforeCheckpointId,
      afterCheckpointId,
      now: input.now,
    }));
  }

  if (input.scenario.fixtureRequirements.includes('prior-idempotency-record')) {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 16);
    const operationId = `chat-battle-replay:${suffix}`;
    const sessionId = `sess_battle_replay_${suffix}`;
    Object.assign(fixtureContext, { priorOperationId: operationId });
    result.operationId = operationId;
    result.sessionId = sessionId;
    result.replay = { operationId, sessionId };
    result.chatSessions.push({
      sessionId,
      userId,
      projectId,
      name: 'Chat battle interrupted operation',
      messages: [{
        role: 'user',
        content: 'Add one title to this project.',
        timestamp: input.now,
      }, {
        role: 'assistant',
        content: 'The request was durably claimed but interrupted before it could execute. Retrying must not apply it twice.',
        timestamp: input.now,
      }],
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  if (input.scenario.fixtureRequirements.includes('durable-reference-asset')) {
    const source = input.sourceReferenceAsset;
    if (!source) {
      throw new Error('Durable-reference battle fixture requires an owned source video asset.');
    }
    if (source.type !== 'video') {
      throw new Error('Durable-reference battle fixture source asset must be a video.');
    }
    const suffix = randomUUID().replace(/-/g, '').slice(0, 16);
    const referenceAssetId = `battle_ref_${suffix}`;
    const referenceAsset = structuredClone(source);
    delete referenceAsset._id;
    referenceAsset.assetId = referenceAssetId;
    referenceAsset.projectId = projectId;
    referenceAsset.filename = `battle-style-reference-${String(source.filename ?? 'video.mp4')}`;
    referenceAsset.uploadedAt = input.now;
    referenceAsset.createdAt = input.now;
    referenceAsset.updatedAt = input.now;
    referenceAsset.metadata = {
      ...asRecord(referenceAsset.metadata),
      battleFixtureAlias: true,
      battleFixtureProjectId: projectId,
      role: 'reference',
      purpose: 'reference',
      isReference: true,
    };
    project.mediaAssets = [
      ...asArray(project.mediaAssets),
      {
        assetId: referenceAssetId,
        type: 'video',
        filename: referenceAsset.filename,
        role: 'reference',
        purpose: 'reference',
        metadata: {
          battleFixtureAlias: true,
          battleFixtureProjectId: projectId,
          role: 'reference',
          purpose: 'reference',
          isReference: true,
        },
      },
    ];
    Object.assign(fixtureContext, { referenceAssetId });
    result.referenceAsset = referenceAsset;
    result.referenceAssetId = referenceAssetId;
  }

  project.chatBattleFixture = fixtureContext;
  return result;
}

export function buildChatBattleInitialProjectDocument(
  prepared: PreparedChatBattleDurableSeeds,
): Record<string, unknown> {
  const initialProject = structuredClone(prepared.project);
  if (!prepared.undo) return initialProject;
  for (const field of CHAT_BATTLE_UNDO_MUTATED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(prepared.undo.beforeProject, field)) {
      initialProject[field] = structuredClone(prepared.undo.beforeProject[field]);
    } else {
      delete initialProject[field];
    }
  }
  return initialProject;
}

export async function persistChatBattleDurableSeeds(
  prepared: PreparedChatBattleDurableSeeds,
  dependencies?: ChatBattleFixtureSeedDependencies,
): Promise<void> {
  const deps = dependencies ?? await productionDependencies();
  const projectId = requireString(prepared.project.projectId, 'fixture projectId');
  const userId = requireString(prepared.project.userId, 'fixture userId');

  if (prepared.undo) {
    const sessionId = requireString(prepared.sessionId, 'undo fixture sessionId');
    const beforeSnapshot = await deps.loadProjectForMutation(userId, projectId);
    const beforeState = deps.captureRestorableProjectState(beforeSnapshot.project);
    const claim = await deps.claimChatEditOperation({
      checkpointId: prepared.undo.beforeCheckpointId,
      operationId: prepared.undo.operationId,
      operationStatus: 'running',
      sessionId,
      projectId,
      userId,
      overlays: asArray(beforeState.fields.overlays) as any[],
      projectState: beforeState,
      capturedProjectRevision: beforeSnapshot.revision,
      description: `Before seeded battle edit ${prepared.undo.operationId}`,
      type: 'before-llm',
      force: true,
    });
    if (!claim.claimed) {
      throw new Error(`Seeded undo checkpoint already exists: ${prepared.undo.beforeCheckpointId}`);
    }
    const writerReceipt = await deps.commitUndoFixtureMutation({
      userId,
      projectId,
      project: prepared.project,
      expectedRevision: beforeSnapshot.revision,
    });
    const afterState = deps.captureRestorableProjectState(prepared.project);
    const after = await deps.createCheckpoint({
      checkpointId: prepared.undo.afterCheckpointId,
      operationId: prepared.undo.operationId,
      sessionId,
      projectId,
      userId,
      overlays: asArray(afterState.fields.overlays) as any[],
      projectState: afterState,
      capturedWriterReceipt: writerReceipt,
      description: `After seeded battle edit ${prepared.undo.operationId}`,
      type: 'after-llm',
      force: true,
    });
    if (!after) {
      throw new Error(`Seeded undo after-checkpoint was not created: ${prepared.undo.afterCheckpointId}`);
    }
    await deps.updateChatEditOperation(
      prepared.undo.beforeCheckpointId,
      userId,
      prepared.undo.operationId,
      {
        operationStatus: 'completed',
        mutatingToolNames: ['add_overlay'],
        afterCheckpointId: after.checkpointId,
      },
    );
  }

  if (prepared.replay) {
    const replaySnapshot = await deps.loadProjectForMutation(userId, projectId);
    const replay = await deps.prepareChatAiEditTransaction({
      operationId: prepared.replay.operationId,
      sessionId: prepared.replay.sessionId,
      projectId,
      userId,
      project: replaySnapshot.project,
      projectRevision: replaySnapshot.revision,
    });
    if (replay.status !== 'ready') {
      throw new Error(`Seeded replay operation was not freshly claimed: ${prepared.replay.operationId}`);
    }
  }
}

async function productionDependencies(): Promise<ChatBattleFixtureSeedDependencies> {
  const [checkpointModule, transactionRuntime, projectModule] = await Promise.all([
    import('./checkpoint-service'),
    import('../agent/chat-ai-edit-transaction-runtime'),
    import('./project-service'),
  ]);
  const { checkpointService } = checkpointModule;
  return {
    captureRestorableProjectState: checkpointModule.captureRestorableProjectState,
    claimChatEditOperation: checkpointService.claimChatEditOperation.bind(checkpointService),
    createCheckpoint: checkpointService.createCheckpoint.bind(checkpointService),
    updateChatEditOperation: checkpointService.updateChatEditOperation.bind(checkpointService),
    loadProjectForMutation: async (userId, projectId) => {
      const snapshot = await projectModule.projectService.loadProjectForMutation(userId, projectId);
      return {
        project: snapshot.project as unknown as Record<string, unknown>,
        revision: snapshot.revision,
      };
    },
    commitUndoFixtureMutation: ({ userId, projectId, project, expectedRevision }) => {
      const projectUpdates: Record<string, unknown> = {};
      for (const field of ['name', 'projectMetadata'] as const) {
        if (Object.prototype.hasOwnProperty.call(project, field)) {
          projectUpdates[field] = structuredClone(project[field]);
        }
      }
      return projectModule.projectService.saveProjectWithReceipt(
        userId,
        projectId,
        project as any,
        {
          expectedRevision,
          overlayAuthority: 'server',
          projectUpdates,
        },
      );
    },
    prepareChatAiEditTransaction: transactionRuntime.prepareChatAiEditTransaction,
  };
}

function applyUndoFixtureMutation(project: Record<string, unknown>, scenarioId: string): void {
  const overlays = asArray(project.overlays).map((overlay) => structuredClone(overlay));
  const durationInFrames = positiveInteger(project.durationInFrames)
    ?? Math.max(1, ...overlays.map((value) => {
      const overlay = asRecord(value);
      return nonNegativeInteger(overlay.from) + Math.max(1, nonNegativeInteger(overlay.durationInFrames));
    }));
  overlays.push({
    id: `battle-undo-overlay-${scenarioId}`,
    type: 'text',
    content: 'This seeded AI edit must be undone',
    from: Math.max(0, Math.min(durationInFrames - 1, 30)),
    durationInFrames: Math.min(90, Math.max(1, durationInFrames)),
    row: 0,
    left: 160,
    top: 120,
    width: 900,
    height: 160,
    rotation: 0,
    isDragging: false,
    styles: {
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.88)',
      fontFamily: 'Inter',
      fontSize: '64px',
      fontStyle: 'normal',
      fontWeight: '700',
      lineHeight: '1.2',
      opacity: 1,
      padding: '16px',
      textAlign: 'center',
      textDecoration: 'none',
      zIndex: 1,
    },
    metadata: { battleFixtureMutation: true },
  });
  project.overlays = overlays;
  if (scenarioId === 'undo-full-state') {
    project.durationInFrames = durationInFrames + 30;
    project.name = `${String(project.name ?? 'Battle fixture')} - changed by seeded AI edit`;
    project.projectMetadata = {
      ...asRecord(project.projectMetadata),
      battleFixtureStateMutation: true,
    };
  }
}

function buildCheckpointHistorySession(input: {
  sessionId: string;
  userId: string;
  projectId: string;
  beforeCheckpointId: string;
  afterCheckpointId: string;
  now: Date;
}): Record<string, unknown> {
  return {
    sessionId: input.sessionId,
    userId: input.userId,
    projectId: input.projectId,
    name: 'Chat battle undo history',
    messages: [{
      role: 'user',
      content: 'Add a temporary title to this edit.',
      timestamp: input.now,
    }, {
      role: 'assistant',
      content: 'Added the temporary title.',
      checkpointIds: [input.beforeCheckpointId, input.afterCheckpointId],
      timestamp: input.now,
    }],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}.`);
  return value.trim();
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
