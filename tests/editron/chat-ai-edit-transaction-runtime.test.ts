import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const infrastructureMocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: 'user_1' })),
  findOne: vi.fn(),
  getDatabase: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
});

vi.mock('@clerk/nextjs/server', () => ({ auth: infrastructureMocks.auth }));
vi.mock('@/lib/editron/db/mongodb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editron/db/mongodb')>();
  return { ...actual, getDatabase: infrastructureMocks.getDatabase };
});

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
  },
}));

import { POST as restoreCheckpointRoute } from '@/app/api/services/editron/checkpoints/restore/route';
import { createTools } from '@/lib/editron/agent/tools';
import {
  completeChatAiEditTransaction,
  prepareChatAiEditTransaction,
} from '@/lib/editron/agent/chat-ai-edit-transaction-runtime';
import { COLLECTIONS } from '@/lib/editron/db/mongodb';
import {
  CHAT_RESTORABLE_PROJECT_FIELDS,
  CheckpointService,
  captureRestorableProjectState,
  checkpointService,
  projectStateFingerprint,
  type Checkpoint,
  type CheckpointInput,
  type ChatEditOperationUpdate,
  type RestoreProjectCheckpointResult,
} from '@/lib/editron/services/checkpoint-service';
import { projectService } from '@/lib/editron/services/project-service';

class MemoryCheckpointStore {
  readonly checkpoints = new Map<string, Checkpoint>();
  readonly events: string[] = [];
  project: Record<string, unknown>;
  failClaim = false;
  failRestore = false;

  constructor(project: Record<string, unknown>) {
    this.project = structuredClone(project);
  }

  async claimChatEditOperation(input: CheckpointInput & {
    checkpointId: string;
    operationId: string;
    projectState: ReturnType<typeof captureRestorableProjectState>;
  }) {
    this.events.push('claim');
    if (this.failClaim) throw new Error('checkpoint storage unavailable');
    const existing = this.checkpoints.get(input.checkpointId);
    if (existing) return { claimed: false, checkpoint: existing };
    const checkpoint = this.makeCheckpoint(input);
    checkpoint.operationStatus = 'running';
    this.checkpoints.set(checkpoint.checkpointId, checkpoint);
    return { claimed: true, checkpoint };
  }

  async createCheckpoint(input: CheckpointInput) {
    this.events.push(`create:${input.type}`);
    const checkpoint = this.makeCheckpoint(input);
    this.checkpoints.set(checkpoint.checkpointId, checkpoint);
    return checkpoint;
  }

  async updateChatEditOperation(
    checkpointId: string,
    _userId: string,
    _operationId: string,
    update: ChatEditOperationUpdate,
  ) {
    this.events.push(`status:${update.operationStatus}`);
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) throw new Error('missing operation checkpoint');
    Object.assign(checkpoint, update);
  }

  async restoreProjectCheckpoint(checkpointId: string): Promise<RestoreProjectCheckpointResult> {
    this.events.push('restore');
    const checkpoint = this.checkpoints.get(checkpointId);
    if (this.failRestore || !checkpoint?.projectState) {
      return {
        restored: false,
        checkpointId,
        expectedStateHash: checkpoint?.stateHash ?? '',
        reason: this.failRestore ? 'forced-restore-failure' : 'missing-state',
      };
    }
    for (const field of CHAT_RESTORABLE_PROJECT_FIELDS) delete this.project[field];
    for (const field of checkpoint.projectState.presentFields) {
      this.project[field] = structuredClone(checkpoint.projectState.fields[field]);
    }
    return {
      restored: true,
      checkpointId,
      expectedStateHash: checkpoint.stateHash ?? '',
      actualStateHash: checkpoint.stateHash,
    };
  }

  loadProject = async () => structuredClone(this.project);

  private makeCheckpoint(input: CheckpointInput): Checkpoint {
    const projectState = input.projectState ?? captureRestorableProjectState({ overlays: input.overlays });
    const checkpointId = input.checkpointId ?? `ckpt_${this.checkpoints.size + 1}`;
    return {
      checkpointId,
      sessionId: input.sessionId,
      projectId: input.projectId,
      userId: input.userId,
      overlays: structuredClone(input.overlays),
      projectState: structuredClone(projectState),
      stateHash: projectStateFingerprint(projectState),
      operationId: input.operationId,
      operationStatus: input.operationStatus,
      timestamp: new Date(),
      description: input.description,
      type: input.type,
      createdAt: new Date(),
    };
  }
}

const ORIGINAL_PROJECT = {
  projectId: 'proj_1',
  userId: 'user_1',
  overlays: [{
    id: 1,
    type: 'text',
    from: 0,
    durationInFrames: 30,
    content: 'before',
    styles: { color: '#ffffff' },
  }],
  aspectRatio: '16:9',
  playerDimensions: { width: 1920, height: 1080 },
  fps: 30,
  durationInFrames: 300,
  metadata: { title: 'Original' },
  sourceAssetIds: ['asset_1'],
  intelligence: { decisionLog: ['before'] },
  qualityReview: { overallScore: 80 },
};

async function prepare(store: MemoryCheckpointStore, operationId = 'chatop_12345678') {
  return prepareChatAiEditTransaction({
    operationId,
    sessionId: 'sess_1',
    projectId: 'proj_1',
    userId: 'user_1',
    project: structuredClone(ORIGINAL_PROJECT),
  }, { checkpointStore: store, loadProject: store.loadProject });
}

afterEach(() => {
  vi.restoreAllMocks();
  infrastructureMocks.auth.mockReset().mockResolvedValue({ userId: 'user_1' });
  infrastructureMocks.findOne.mockReset();
  infrastructureMocks.getDatabase.mockReset();
  infrastructureMocks.insertOne.mockReset();
  infrastructureMocks.updateOne.mockReset();
});

describe('chat AI edit transaction runtime', () => {
  it('fingerprints style and full project-state changes, not only overlay timing', () => {
    const before = captureRestorableProjectState(ORIGINAL_PROJECT);
    const after = captureRestorableProjectState({
      ...ORIGINAL_PROJECT,
      overlays: [{ ...ORIGINAL_PROJECT.overlays[0], styles: { color: '#ff0000' } }],
    });

    expect(before.presentFields).toEqual(expect.arrayContaining([
      'overlays', 'fps', 'durationInFrames', 'metadata', 'sourceAssetIds', 'intelligence', 'qualityReview',
    ]));
    expect(projectStateFingerprint(after)).not.toBe(projectStateFingerprint(before));
  });

  it('fails closed when the durable pre-mutation checkpoint cannot be written', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    store.failClaim = true;

    await expect(prepare(store)).rejects.toThrow('checkpoint storage unavailable');
    expect(store.events).toEqual(['claim']);
  });

  it('claims an operation once and blocks every replay of that operation ID', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const first = await prepare(store);
    const replay = await prepare(store);

    expect(first.status).toBe('ready');
    expect(replay).toMatchObject({ status: 'duplicate', operationStatus: 'running' });
    expect(first.beforeCheckpointId).toBe(replay.beforeCheckpointId);
    expect(store.events).toEqual(['claim', 'claim']);
  });

  it('persists an exact after-state only after every mutating call succeeds', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store);
    store.project.overlays = [{ ...ORIGINAL_PROJECT.overlays[0], content: 'after' }];
    store.project.durationInFrames = 420;

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [{ id: 'call_1', name: 'update_overlay' }],
      toolResults: [{ toolCallId: 'call_1', toolName: 'update_overlay', result: '{"status":"success"}' }],
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'created',
      mutatingToolNames: ['update_overlay'],
      failedToolNames: [],
    });
    expect(result.checkpointIds).toHaveLength(2);
    expect(store.events).toEqual(['claim', 'create:after-llm', 'status:completed']);
  });

  it('commits an atomic cut when a redundant close_gaps follow-up is shadowed', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store, 'chatop_cut_shadow');
    store.project.durationInFrames = 270;

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [
        { id: 'cut', name: 'cut_section', args: { startFrame: 30, endFrame: 60 } },
        { id: 'gaps', name: 'close_gaps', args: { preserveCaptions: true } },
      ],
      toolResults: [
        {
          toolCallId: 'cut',
          toolName: 'cut_section',
          result: JSON.stringify({ status: 'success', data: { framesCut: 30 }, error: null }),
        },
        {
          toolCallId: 'gaps',
          toolName: 'close_gaps',
          result: JSON.stringify({
            status: 'advisory',
            data: {
              executionPolicy: {
                code: 'CHAT_TOOL_EFFECT_ALREADY_SATISFIED',
                shadowedTool: 'close_gaps',
                producerTools: ['cut_section'],
                satisfiedEffects: ['cut-gap-closed'],
              },
            },
            error: null,
          }),
        },
      ],
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'created',
      mutatingToolNames: ['cut_section'],
      failedToolNames: [],
    });
    const afterCheckpoint = Array.from(store.checkpoints.values())
      .find((checkpoint) => checkpoint.type === 'after-llm');
    expect(afterCheckpoint?.projectState?.fields.durationInFrames).toBe(270);
    expect(store.events).toEqual(['claim', 'create:after-llm', 'status:completed']);
  });

  it('commits a successful retry after a schema-rejected non-mutating attempt', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store);
    store.project.overlays = [{ ...ORIGINAL_PROJECT.overlays[0], content: 'Launch day' }];

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [
        { id: 'bad_input', name: 'add_overlay' },
        { id: 'corrected_input', name: 'add_overlay' },
      ],
      toolResults: [
        {
          toolCallId: 'bad_input',
          toolName: 'add_overlay',
          result: JSON.stringify({
            status: 'error',
            error: {
              code: 'TOOL_INVOKE_EXCEPTION',
              message: 'Received tool input did not match expected schema\nstyles.fontSize',
            },
            nextAction: 'retry',
          }),
        },
        {
          toolCallId: 'corrected_input',
          toolName: 'add_overlay',
          result: JSON.stringify({ status: 'success', data: { id: 2 } }),
        },
      ],
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'created',
      mutatingToolNames: ['add_overlay'],
      failedToolNames: [],
      recoveredInputToolNames: ['add_overlay'],
    });
    expect(store.events).toEqual(['claim', 'create:after-llm', 'status:completed']);
  });

  it('commits a successful retry after a policy-blocked precondition attempt', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store, 'chatop_precondition_retry');
    store.project.overlays = [{ ...ORIGINAL_PROJECT.overlays[0], content: 'Launch day' }];

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [
        { id: 'blocked', name: 'add_overlay' },
        { id: 'grounded', name: 'add_overlay' },
      ],
      toolResults: [
        {
          toolCallId: 'blocked',
          toolName: 'add_overlay',
          result: JSON.stringify({
            status: 'error',
            error: {
              code: 'CHAT_TOOL_EVIDENCE_REQUIRED',
              message: 'add_overlay requires current project-state evidence before mutation.',
            },
            nextAction: 'Call read_project_file, then retry this target once.',
          }),
        },
        {
          toolCallId: 'grounded',
          toolName: 'add_overlay',
          result: JSON.stringify({ status: 'success', data: { id: 2 } }),
        },
      ],
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'created',
      mutatingToolNames: ['add_overlay'],
      failedToolNames: [],
      recoveredPreconditionToolNames: ['add_overlay'],
    });
    expect(store.events).toEqual(['claim', 'create:after-llm', 'status:completed']);
  });

  it('rolls back an unrecovered schema rejection and every real execution failure', async () => {
    for (const error of [
      {
        code: 'TOOL_INVOKE_EXCEPTION',
        message: 'Received tool input did not match expected schema\nstyles.fontSize',
      },
      {
        code: 'TOOL_INVOKE_EXCEPTION',
        message: 'Database write failed after tool execution began',
      },
    ]) {
      const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
      const ready = await prepare(store, `chatop_${error.message.includes('schema') ? 'schemafail' : 'runtimefail'}`);
      store.project.overlays = [{ ...ORIGINAL_PROJECT.overlays[0], content: 'must not survive' }];

      const result = await completeChatAiEditTransaction({
        transaction: ready.transaction!,
        toolCalls: [{ id: 'failed_call', name: 'add_overlay' }],
        toolResults: [{
          toolCallId: 'failed_call',
          toolName: 'add_overlay',
          result: JSON.stringify({ status: 'error', error }),
        }],
      }, { checkpointStore: store, loadProject: store.loadProject });

      expect(result).toMatchObject({ status: 'rolled-back', failedToolNames: ['add_overlay'] });
      expect(store.events).toEqual(['claim', 'restore', 'status:rolled-back']);
    }
  });

  it('restores overlays, timing, dimensions, metadata, and asset references after partial failure', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store);
    store.project = {
      ...store.project,
      overlays: [{ ...ORIGINAL_PROJECT.overlays[0], content: 'partially changed' }],
      fps: 60,
      durationInFrames: 900,
      playerDimensions: { width: 1080, height: 1920 },
      metadata: { title: 'Wrong' },
      sourceAssetIds: ['asset_2'],
    };

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [
        { id: 'call_1', name: 'update_overlay' },
        { id: 'call_2', name: 'delete_overlay' },
      ],
      toolResults: [
        { toolCallId: 'call_1', toolName: 'update_overlay', result: '{"status":"success"}' },
        { toolCallId: 'call_2', toolName: 'delete_overlay', result: '{"status":"error","error":"failed"}' },
      ],
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'rolled-back',
      mutatingToolNames: ['update_overlay', 'delete_overlay'],
      failedToolNames: ['delete_overlay'],
    });
    const restored = captureRestorableProjectState(store.project);
    expect(projectStateFingerprint(restored)).toBe(
      projectStateFingerprint(captureRestorableProjectState(ORIGINAL_PROJECT)),
    );
    expect(store.events).toEqual(['claim', 'restore', 'status:rolled-back']);
  });

  it('treats a missing mutating result as failure and reports a failed rollback loudly', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store);
    store.failRestore = true;

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [{ id: 'missing', name: 'trim_overlay' }],
      toolResults: [],
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'failed',
      failedToolNames: ['trim_overlay'],
    });
    expect(result.error).toContain('Rollback failed');
    expect(store.events).toEqual(['claim', 'restore', 'status:failed']);
  });

  it('rolls back a mutating result without explicit success instead of guessing', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store);
    store.project.overlays = [{ ...ORIGINAL_PROJECT.overlays[0], content: 'must not survive' }];

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [{ id: 'ambiguous', name: 'update_overlay' }],
      toolResults: [{
        toolCallId: 'ambiguous',
        toolName: 'update_overlay',
        result: { message: 'ambiguous result without a status' },
      }],
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({ status: 'rolled-back', failedToolNames: ['update_overlay'] });
    expect(projectStateFingerprint(captureRestorableProjectState(store.project))).toBe(
      projectStateFingerprint(captureRestorableProjectState(ORIGINAL_PROJECT)),
    );
  });

  it('restores every captured project field through the production checkpoint owner', async () => {
    const service = new CheckpointService();
    let insertedCheckpoint: Checkpoint | undefined;
    const persistedProject: Record<string, any> = {
      ...structuredClone(ORIGINAL_PROJECT),
      overlays: [{ ...ORIGINAL_PROJECT.overlays[0], content: 'mutated' }],
      fps: 60,
      durationInFrames: 900,
      playerDimensions: { width: 1080, height: 1920 },
      metadata: { title: 'Mutated' },
      sourceAssetIds: ['asset_2'],
    };

    infrastructureMocks.insertOne.mockImplementation(async (checkpoint: Checkpoint) => {
      insertedCheckpoint = structuredClone(checkpoint);
      return { acknowledged: true, insertedId: checkpoint.checkpointId };
    });
    infrastructureMocks.updateOne.mockImplementation(async (
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> },
    ) => {
      expect(filter).toEqual({ projectId: 'proj_1', userId: 'user_1' });
      Object.assign(persistedProject, structuredClone(update.$set ?? {}));
      for (const field of Object.keys(update.$unset ?? {})) delete persistedProject[field];
      return { matchedCount: 1, modifiedCount: 1 };
    });
    infrastructureMocks.findOne.mockImplementation(async () => structuredClone(persistedProject));
    infrastructureMocks.getDatabase.mockResolvedValue({
      collection: (name: string) => {
        if (name === COLLECTIONS.CHECKPOINTS) {
          return { insertOne: infrastructureMocks.insertOne };
        }
        if (name === COLLECTIONS.PROJECTS) {
          return {
            updateOne: infrastructureMocks.updateOne,
            findOne: infrastructureMocks.findOne,
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      },
    });

    const created = await service.createCheckpoint({
      checkpointId: 'ckpt_full_state',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any,
      projectState: captureRestorableProjectState(ORIGINAL_PROJECT),
      description: 'Before manual undo',
      type: 'before-llm',
      force: true,
    });
    expect(created).not.toBeNull();
    expect(insertedCheckpoint?.projectState?.presentFields).toEqual(expect.arrayContaining([
      'overlays', 'fps', 'durationInFrames', 'playerDimensions', 'metadata', 'sourceAssetIds',
    ]));
    vi.spyOn(service, 'getCheckpoint').mockResolvedValue(insertedCheckpoint ?? null);

    const result = await service.restoreProjectCheckpoint('ckpt_full_state', 'user_1');

    expect(result).toMatchObject({ restored: true, reason: undefined });
    expect(projectStateFingerprint(captureRestorableProjectState(persistedProject))).toBe(
      created?.stateHash,
    );
    expect(persistedProject).toMatchObject({
      fps: ORIGINAL_PROJECT.fps,
      durationInFrames: ORIGINAL_PROJECT.durationInFrames,
      playerDimensions: ORIGINAL_PROJECT.playerDimensions,
      metadata: ORIGINAL_PROJECT.metadata,
      sourceAssetIds: ORIGINAL_PROJECT.sourceAssetIds,
    });
  });

  it('rejects legacy overlay-only checkpoints before any project mutation', async () => {
    const service = new CheckpointService();
    vi.spyOn(service, 'getCheckpoint').mockResolvedValue({
      checkpointId: 'ckpt_legacy',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any,
      timestamp: new Date(),
      description: 'Legacy overlay snapshot',
      type: 'before-llm',
      createdAt: new Date(),
    });

    const result = await service.restoreProjectCheckpoint('ckpt_legacy', 'user_1');

    expect(result).toMatchObject({
      restored: false,
      reason: 'legacy-overlay-only-checkpoint',
    });
    expect(infrastructureMocks.getDatabase).not.toHaveBeenCalled();
  });

  it('keeps the authenticated restore route project-scoped and verification-gated', async () => {
    const projectState = captureRestorableProjectState(ORIGINAL_PROJECT);
    const checkpoint: Checkpoint = {
      checkpointId: 'ckpt_route',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any,
      projectState,
      stateHash: projectStateFingerprint(projectState),
      timestamp: new Date(),
      description: 'Route restore',
      type: 'before-llm',
      createdAt: new Date(),
    };
    vi.spyOn(checkpointService, 'getCheckpoint').mockResolvedValue(checkpoint);
    const restoreSpy = vi.spyOn(checkpointService, 'restoreProjectCheckpoint').mockResolvedValue({
      restored: true,
      checkpointId: checkpoint.checkpointId,
      expectedStateHash: checkpoint.stateHash!,
      actualStateHash: checkpoint.stateHash,
    });

    const mismatch = await restoreCheckpointRoute(new NextRequest(
      'http://localhost/api/services/editron/checkpoints/restore',
      { method: 'POST', body: JSON.stringify({ checkpointId: 'ckpt_route', projectId: 'proj_other' }) },
    ));
    expect(mismatch.status).toBe(409);
    expect(restoreSpy).not.toHaveBeenCalled();

    const response = await restoreCheckpointRoute(new NextRequest(
      'http://localhost/api/services/editron/checkpoints/restore',
      { method: 'POST', body: JSON.stringify({ checkpointId: 'ckpt_route', projectId: 'proj_1' }) },
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      checkpointId: 'ckpt_route',
      projectId: 'proj_1',
      reloadProject: true,
    });
    expect(restoreSpy).toHaveBeenCalledWith('ckpt_route', 'user_1');
  });

  it('routes the chat undo tool through full-state restore and returns a reload receipt', async () => {
    const projectState = captureRestorableProjectState(ORIGINAL_PROJECT);
    const checkpoint: Checkpoint = {
      checkpointId: 'ckpt_tool',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any,
      projectState,
      stateHash: projectStateFingerprint(projectState),
      timestamp: new Date(),
      description: 'Tool restore',
      type: 'before-llm',
      createdAt: new Date(),
    };
    vi.spyOn(checkpointService, 'getCheckpoint').mockResolvedValue(checkpoint);
    const restoreSpy = vi.spyOn(checkpointService, 'restoreProjectCheckpoint').mockResolvedValue({
      restored: true,
      checkpointId: checkpoint.checkpointId,
      expectedStateHash: checkpoint.stateHash!,
      actualStateHash: checkpoint.stateHash,
    });
    vi.spyOn(projectService, 'loadProject').mockResolvedValue(ORIGINAL_PROJECT as any);

    const restoreTool = createTools('user_1', 'proj_1')
      .find((candidate) => candidate.name === 'restore_ai_edit_checkpoint');
    expect(restoreTool).toBeDefined();
    const envelope = JSON.parse(await restoreTool!.invoke({ checkpointId: 'ckpt_tool' }));

    expect(envelope).toMatchObject({
      status: 'success',
      data: {
        checkpointId: 'ckpt_tool',
        reloadProject: true,
        verification: { expectedStateHash: checkpoint.stateHash },
      },
    });
    expect(restoreSpy).toHaveBeenCalledWith('ckpt_tool', 'user_1');
  });

  it('keeps the legacy client helper on compact receipt plus canonical project reload', () => {
    const manager = readFileSync(join(
      process.cwd(),
      'components/editron/editor/version-7.0.0/checkpoint-manager.ts',
    ), 'utf8');

    expect(manager).toContain('body: JSON.stringify({ checkpointId, projectId })');
    expect(manager).toContain('checkpointService.restoreProjectCheckpoint(checkpointId, userId)');
    expect(manager).toContain('`/api/services/editron/projects/${encodeURIComponent(projectId)}`');
    expect(manager).not.toContain('return checkpoint ? checkpoint.overlays : null');
  });

  it('marks read-only and advisory turns as no-op without creating an after checkpoint', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const readReady = await prepare(store, 'chatop_readonly1');
    const readResult = await completeChatAiEditTransaction({
      transaction: readReady.transaction!,
      toolCalls: [{ id: 'read', name: 'read_project_file' }],
      toolResults: [{ toolCallId: 'read', toolName: 'read_project_file', result: '{"status":"success"}' }],
    }, { checkpointStore: store, loadProject: store.loadProject });

    const advisoryReady = await prepare(store, 'chatop_advisory1');
    const advisoryResult = await completeChatAiEditTransaction({
      transaction: advisoryReady.transaction!,
      toolCalls: [{ id: 'intent', name: 'apply_editorial_intent' }],
      toolResults: [{ toolCallId: 'intent', toolName: 'apply_editorial_intent', result: '{"status":"advisory"}' }],
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(readResult.status).toBe('not-needed');
    expect(advisoryResult.status).toBe('not-needed');
    expect(Array.from(store.checkpoints.values()).filter((checkpoint) => checkpoint.type === 'after-llm')).toHaveLength(0);
  });

  it('keeps the live route and client ordered around durable preflight and stable operation IDs', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/services/editron/chat/stream/route.ts'), 'utf8');
    const panel = readFileSync(join(
      process.cwd(),
      'components/editron/editor/version-7.0.0/components/ai-chat/ai-chat-panel.tsx',
    ), 'utf8');

    expect(route.indexOf('prepareChatAiEditTransaction({')).toBeLessThan(route.indexOf('agent.invoke(inputs'));
    expect(route).toContain("code: 'CHAT_EDIT_OPERATION_REPLAY'");
    expect(route).toContain('rollbackChatAiEditTransaction({');
    expect(panel).toContain('const operationId = crypto.randomUUID();');
    expect(panel).toContain('const requestSessionId = currentSessionId;');
    expect(panel.indexOf('const requestSessionId = currentSessionId;')).toBeLessThan(
      panel.indexOf('await saveProject();'),
    );
    expect(panel).toMatch(/operationId,\r?\n\s+sessionId: requestSessionId/);
    expect(panel).toMatch(/console\.error\('Error parsing stream chunk', e\);\r?\n\s+throw e;/);
  });
});
