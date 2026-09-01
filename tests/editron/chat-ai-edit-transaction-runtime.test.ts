import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const infrastructureMocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: 'user_1' })),
  findOne: vi.fn(),
  getDatabase: vi.fn(),
  insertOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
}));

function emulateMongoRoundTrip<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : emulateMongoRoundTrip(item),
    ) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        item === undefined ? null : emulateMongoRoundTrip(item),
      ]),
    ) as T;
  }
  return value;
}

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
import { GET as listCheckpointsRoute } from '@/app/api/services/editron/checkpoints/list/route';
import { createTools } from '@/lib/editron/agent/tools';
import {
  buildChatEditRenderVerificationRequest,
  completeChatAiEditTransaction,
  prepareChatAiEditTransaction,
  rollbackChatAiEditTransaction,
} from '@/lib/editron/agent/chat-ai-edit-transaction-runtime';
import { enforceChatToolPostcondition } from '@/lib/editron/agent/chat-edit-postconditions';
import {
  buildChatRevisionReplanOutput,
  classifyChatToolExecutionOutcome,
} from '@/lib/editron/agent/chat-tool-execution-policy';
import { COLLECTIONS } from '@/lib/editron/db/mongodb';
import {
  CHAT_RESTORABLE_PROJECT_FIELDS,
  CheckpointService,
  captureRestorableProjectState,
  checkpointService,
  projectStateFingerprint,
  type Checkpoint,
  type CheckpointRollbackReceiptV1,
  type CheckpointInput,
  type ChatEditOperationUpdate,
  type RestoreProjectCheckpointResult,
} from '@/lib/editron/services/checkpoint-service';
import {
  ProjectMutationConflictError,
  ProjectNotFoundOrForbiddenError,
  projectService,
  type ProjectMutationReceiptV1,
  type ProjectRevisionV1,
} from '@/lib/editron/services/project-service';

class MemoryCheckpointStore {
  readonly checkpoints = new Map<string, Checkpoint>();
  readonly events: string[] = [];
  readonly createInputs: CheckpointInput[] = [];
  readonly rollbackReceipts = new Map<string, ProjectRevisionV1>();
  readonly rollbackReceiptCalls: Array<{
    checkpointId: string;
    userId: string;
    projectId: string;
    operationId: string;
    writerIssuedReceipt?: ProjectMutationReceiptV1;
  }> = [];
  readonly restoreRequests: Array<{
    checkpointId: string;
    userId: string;
    projectId: string;
    expectedRevision: ProjectRevisionV1;
  }> = [];
  project: Record<string, unknown>;
  failClaim = false;
  failRestore = false;
  rejectRestoreAsStale = false;
  readonly issuedRollbackRevision: ProjectRevisionV1 = {
    schemaVersion: 1,
    value: 7,
    compatibilityUpdatedAt: '2026-08-09T00:00:07.000Z',
  };

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
    this.createInputs.push(structuredClone(input));
    const checkpoint = this.makeCheckpoint(input);
    this.checkpoints.set(checkpoint.checkpointId, checkpoint);
    return checkpoint;
  }

  async updateChatEditOperationScoped(
    checkpointId: string,
    userId: string,
    projectId: string,
    operationId: string,
    update: ChatEditOperationUpdate,
  ) {
    this.events.push(`status:${update.operationStatus}`);
    const checkpoint = this.checkpoints.get(checkpointId);
    if (
      !checkpoint
      || checkpoint.userId !== userId
      || checkpoint.projectId !== projectId
      || checkpoint.operationId !== operationId
    ) {
      throw new Error('missing or out-of-scope operation checkpoint');
    }
    Object.assign(checkpoint, update);
  }

  async recordRollbackExpectedRevision(
    checkpointId: string,
    userId: string,
    projectId: string,
    operationId: string,
    writerIssuedReceipt?: ProjectMutationReceiptV1,
  ): Promise<CheckpointRollbackReceiptV1> {
    this.rollbackReceiptCalls.push({
      checkpointId,
      userId,
      projectId,
      operationId,
      ...(writerIssuedReceipt ? { writerIssuedReceipt } : {}),
    });
    const checkpoint = this.checkpoints.get(checkpointId);
    if (
      !checkpoint
      || checkpoint.userId !== userId
      || checkpoint.projectId !== projectId
      || checkpoint.operationId !== operationId
    ) {
      throw new Error('missing or out-of-scope rollback checkpoint');
    }
    const existing = this.rollbackReceipts.get(checkpointId);
    if (writerIssuedReceipt && writerIssuedReceipt.projectId !== projectId) {
      throw new Error('writer receipt belongs to another project');
    }
    if (!existing && !writerIssuedReceipt) {
      throw new Error('writer-issued rollback receipt required');
    }
    const expectedRevision = existing ?? structuredClone(writerIssuedReceipt!.revision);
    this.rollbackReceipts.set(checkpointId, expectedRevision);
    return { schemaVersion: 1, receiptId: operationId, expectedRevision: structuredClone(expectedRevision) };
  }

  async restoreProjectCheckpoint(
    checkpointId: string,
    userId: string,
    options: { projectId: string; expectedRevision: ProjectRevisionV1 },
  ): Promise<RestoreProjectCheckpointResult> {
    this.events.push('restore');
    const checkpoint = this.checkpoints.get(checkpointId);
    this.restoreRequests.push({ checkpointId, userId, ...options });
    const expectedRevision = this.rollbackReceipts.get(checkpointId);
    if (
      !checkpoint
      || checkpoint.userId !== userId
      || checkpoint.projectId !== options.projectId
      || !expectedRevision
      || JSON.stringify(expectedRevision) !== JSON.stringify(options.expectedRevision)
      || this.rejectRestoreAsStale
    ) {
      return {
        restored: false,
        checkpointId,
        expectedStateHash: checkpoint?.stateHash ?? '',
        reason: 'project-revision-conflict',
        ...(this.rejectRestoreAsStale
          ? {
            currentRevision: {
              schemaVersion: 1 as const,
              value: options.expectedRevision.value + 1,
              compatibilityUpdatedAt: '2026-08-09T00:00:08.000Z',
            },
          }
          : {}),
      };
    }
    if (this.failRestore || !checkpoint.projectState) {
      return {
        restored: false,
        checkpointId: checkpoint.checkpointId,
        expectedStateHash: checkpoint.stateHash ?? '',
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
      restoredRevision: {
        schemaVersion: 1,
        value: options.expectedRevision.value + 1,
        compatibilityUpdatedAt: '2026-08-09T00:00:08.000Z',
      },
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
      ...(input.capturedWriterReceipt
        ? { capturedProjectRevision: structuredClone(input.capturedWriterReceipt.revision) }
        : input.capturedProjectRevision
          ? { capturedProjectRevision: structuredClone(input.capturedProjectRevision) }
          : {}),
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

const ORIGINAL_REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 6,
  compatibilityUpdatedAt: '2026-08-09T00:00:06.000Z',
};

async function prepare(store: MemoryCheckpointStore, operationId = 'chatop_12345678') {
  return prepareChatAiEditTransaction({
    operationId,
    sessionId: 'sess_1',
    projectId: 'proj_1',
    userId: 'user_1',
    project: structuredClone(ORIGINAL_PROJECT),
    projectRevision: ORIGINAL_REVISION,
  }, { checkpointStore: store, loadProject: store.loadProject });
}

function writerReceipt(projectId = 'proj_1'): ProjectMutationReceiptV1 {
  return {
    schemaVersion: 1,
    projectId,
    revision: {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: '2026-08-09T00:00:07.000Z',
    },
    committedAt: '2026-08-09T00:00:07.000Z',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  infrastructureMocks.auth.mockReset().mockResolvedValue({ userId: 'user_1' });
  infrastructureMocks.findOne.mockReset();
  infrastructureMocks.getDatabase.mockReset();
  infrastructureMocks.insertOne.mockReset();
  infrastructureMocks.findOneAndUpdate.mockReset();
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
    expect(store.checkpoints.get(first.beforeCheckpointId)?.capturedProjectRevision).toEqual(
      ORIGINAL_REVISION,
    );
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
      writerIssuedReceipt: writerReceipt(),
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'created',
      mutatingToolNames: ['update_overlay'],
      failedToolNames: [],
    });
    expect(result.checkpointIds).toHaveLength(2);
    expect(store.createInputs).toEqual([expect.objectContaining({
      type: 'after-llm',
      capturedWriterReceipt: writerReceipt(),
    })]);
    expect(Array.from(store.checkpoints.values()).find((checkpoint) => checkpoint.type === 'after-llm'))
      .toMatchObject({ capturedProjectRevision: writerReceipt().revision });
    expect(store.events).toEqual(['claim', 'create:after-llm', 'status:completed']);
  });

  it('fails a mutating completion without creating a rollback receipt, restore, or after checkpoint', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store, 'chatop_missing_writer_receipt');
    store.project.overlays = [{ ...ORIGINAL_PROJECT.overlays[0], content: 'persisted mutation' }];
    const postMutationHash = projectStateFingerprint(captureRestorableProjectState(store.project));

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [{ id: 'call_1', name: 'update_overlay' }],
      toolResults: [{ toolCallId: 'call_1', toolName: 'update_overlay', result: '{"status":"success"}' }],
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'failed',
      mutatingToolNames: ['update_overlay'],
      error: expect.stringContaining('no writer-issued mutation receipt'),
    });
    expect(store.rollbackReceiptCalls).toEqual([]);
    expect(store.restoreRequests).toEqual([]);
    expect(store.events).toEqual(['claim', 'status:failed']);
    expect(projectStateFingerprint(captureRestorableProjectState(store.project))).toBe(postMutationHash);
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
      writerIssuedReceipt: writerReceipt(),
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
      writerIssuedReceipt: writerReceipt(),
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
      writerIssuedReceipt: writerReceipt(),
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
        writerIssuedReceipt: writerReceipt(),
      }, { checkpointStore: store, loadProject: store.loadProject });

      expect(result).toMatchObject({ status: 'rolled-back', failedToolNames: ['add_overlay'] });
      expect(store.events).toEqual(['claim', 'restore', 'status:rolled-back']);
    }
  });

  it('uses one persisted transaction revision and refuses a later competing mutation', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store, 'chatop_receipt_123');
    const transaction = ready.transaction!;
    const writerIssuedReceipt = writerReceipt(transaction.projectId);
    store.project.overlays = [{ ...ORIGINAL_PROJECT.overlays[0], content: 'transaction change' }];

    const completed = await completeChatAiEditTransaction({
      transaction,
      toolCalls: [{ id: 'call_1', name: 'update_overlay' }],
      toolResults: [{ toolCallId: 'call_1', toolName: 'update_overlay', result: '{"status":"success"}' }],
      writerIssuedReceipt,
    }, { checkpointStore: store, loadProject: store.loadProject });
    expect(completed.status).toBe('created');

    const expectedRevision = writerIssuedReceipt.revision;
    store.project.overlays = [{ ...ORIGINAL_PROJECT.overlays[0], content: 'newer competing change' }];
    const competingStateHash = projectStateFingerprint(captureRestorableProjectState(store.project));
    store.rejectRestoreAsStale = true;

    const result = await rollbackChatAiEditTransaction({
      transaction,
      mutatingToolNames: ['update_overlay'],
      reason: 'postcondition failed after a competing mutation',
      writerIssuedReceipt,
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('project-revision-conflict'),
    });
    expect(store.restoreRequests).toEqual([{
      checkpointId: transaction.beforeCheckpointId,
      userId: transaction.userId,
      projectId: transaction.projectId,
      expectedRevision,
    }]);
    expect(store.rollbackReceiptCalls).toEqual([
      {
        checkpointId: transaction.beforeCheckpointId,
        userId: transaction.userId,
        projectId: transaction.projectId,
        operationId: transaction.operationId,
        writerIssuedReceipt,
      },
      {
        checkpointId: transaction.beforeCheckpointId,
        userId: transaction.userId,
        projectId: transaction.projectId,
        operationId: transaction.operationId,
        writerIssuedReceipt,
      },
    ]);
    expect(projectStateFingerprint(captureRestorableProjectState(store.project))).toBe(competingStateHash);
  });

  it('binds rollback to the writer-issued revision before a competing mutation can be observed', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store, 'chatop_writer_receipt_race');
    const transaction = ready.transaction!;
    const writerIssuedReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId: transaction.projectId,
      revision: {
        schemaVersion: 1,
        value: 7,
        compatibilityUpdatedAt: '2026-08-09T00:00:07.000Z',
      },
      committedAt: '2026-08-09T00:00:07.000Z',
    };

    store.project.overlays = [{ ...ORIGINAL_PROJECT.overlays[0], content: 'newer competing change' }];
    const competingStateHash = projectStateFingerprint(captureRestorableProjectState(store.project));
    store.rejectRestoreAsStale = true;

    const result = await rollbackChatAiEditTransaction({
      transaction,
      mutatingToolNames: ['update_overlay'],
      reason: 'writer receipt race probe',
      writerIssuedReceipt,
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('project-revision-conflict'),
    });
    expect(store.rollbackReceiptCalls).toEqual([{
      checkpointId: transaction.beforeCheckpointId,
      userId: transaction.userId,
      projectId: transaction.projectId,
      operationId: transaction.operationId,
      writerIssuedReceipt,
    }]);
    expect(store.restoreRequests[0]?.expectedRevision).toEqual(writerIssuedReceipt.revision);
    expect(store.rollbackReceipts.get(transaction.beforeCheckpointId)).toEqual(writerIssuedReceipt.revision);
    expect(projectStateFingerprint(captureRestorableProjectState(store.project))).toBe(competingStateHash);
  });

  it('rejects a writer receipt from another project before mutating the checkpoint', async () => {
    const service = new CheckpointService();
    vi.spyOn(service, 'getCheckpoint').mockResolvedValue({
      checkpointId: 'ckpt_writer_receipt_scope',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: [],
      timestamp: new Date(),
      description: 'writer receipt scope check',
      type: 'before-llm',
      createdAt: new Date(),
    });

    await expect(service.recordRollbackExpectedRevision(
      'ckpt_writer_receipt_scope',
      'user_1',
      'proj_1',
      'chatop_writer_receipt_scope',
      {
        schemaVersion: 1,
        projectId: 'proj_other',
        revision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: '2026-08-09T00:00:07.000Z',
        },
        committedAt: '2026-08-09T00:00:07.000Z',
      },
    )).rejects.toThrow('belongs to another project');
    expect(infrastructureMocks.getDatabase).not.toHaveBeenCalled();
  });

  it('requires a writer-issued receipt before binding a new rollback revision', async () => {
    const service = new CheckpointService();
    vi.spyOn(service, 'getCheckpoint').mockResolvedValue({
      checkpointId: 'ckpt_writer_receipt_required',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: [],
      timestamp: new Date(),
      description: 'writer receipt required',
      type: 'before-llm',
      createdAt: new Date(),
    });

    await expect(service.recordRollbackExpectedRevision(
      'ckpt_writer_receipt_required',
      'user_1',
      'proj_1',
      'chatop_writer_receipt_required',
    )).rejects.toThrow('requires a writer-issued rollback receipt');
    expect(infrastructureMocks.getDatabase).not.toHaveBeenCalled();
  });

  it('returns the new revision after a successful exact chat rollback', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store, 'chatop_rollback_123');
    store.project.overlays = [{ ...ORIGINAL_PROJECT.overlays[0], content: 'must be undone' }];

    const result = await rollbackChatAiEditTransaction({
      transaction: ready.transaction!,
      mutatingToolNames: ['update_overlay'],
      reason: 'tool failed after a project mutation',
      writerIssuedReceipt: writerReceipt(),
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'rolled-back',
      restoredRevision: {
        schemaVersion: 1,
        value: 8,
        compatibilityUpdatedAt: '2026-08-09T00:00:08.000Z',
      },
    });
    expect(projectStateFingerprint(captureRestorableProjectState(store.project))).toBe(
      projectStateFingerprint(captureRestorableProjectState(ORIGINAL_PROJECT)),
    );
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
      writerIssuedReceipt: writerReceipt(),
    }, { checkpointStore: store, loadProject: store.loadProject });

    // KEEP-BEST (founder-ruled after the C1 matrix): the parsed-envelope failure
    // no longer destroys the verified sibling success. The batch COMMITS, keeps
    // the successful edit, and reports the failure.
    expect(result).toMatchObject({
      status: 'created',
      mutatingToolNames: ['update_overlay'],
      failedToolNames: ['delete_overlay'],
    });
    expect(store.events).not.toContain('restore');
    const kept = captureRestorableProjectState(store.project);
    expect(projectStateFingerprint(kept)).not.toBe(
      projectStateFingerprint(captureRestorableProjectState(ORIGINAL_PROJECT)),
    );
  });

  it('recovers ANY failure kind when a later same-tool call succeeds (C1: add_captions retry)', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store, 'chatop_retryrecover');
    store.project.overlays = [{ ...ORIGINAL_PROJECT.overlays[0], content: 'captions added' }];

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [
        { id: 'call_1', name: 'add_captions' },
        { id: 'call_2', name: 'add_captions' },
      ],
      toolResults: [
        // Attempt 1: a real-world TOOL_HANDLER_ERROR (pre-flight guard) — the exact
        // shape that used to be unforgivable and rolled back the successful retry.
        { toolCallId: 'call_1', toolName: 'add_captions', result: JSON.stringify({ status: 'error', error: { code: 'TOOL_HANDLER_ERROR', message: 'Valid video overlay with asset not found' } }) },
        { toolCallId: 'call_2', toolName: 'add_captions', result: '{"status":"success"}' },
      ],
      writerIssuedReceipt: writerReceipt(),
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'created',
      mutatingToolNames: ['add_captions'],
      failedToolNames: [],
      recoveredInputToolNames: ['add_captions'],
    });
    expect(store.events).not.toContain('restore');
  });

  it('treats a missing mutating result as failure and reports a failed rollback loudly', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store);
    store.failRestore = true;

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [{ id: 'missing', name: 'trim_overlay' }],
      toolResults: [],
      writerIssuedReceipt: writerReceipt(),
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'failed',
      failedToolNames: ['trim_overlay'],
    });
    expect(result.error).toContain('Rollback failed');
    expect(store.events).toEqual(['claim', 'restore', 'status:failed']);
  });

  it('fails an ambiguous mutating result without attempting rollback when the writer receipt is missing', async () => {
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

    expect(result).toMatchObject({
      status: 'failed',
      failedToolNames: ['update_overlay'],
      error: expect.stringContaining('no writer-issued mutation receipt'),
    });
    expect(store.rollbackReceiptCalls).toEqual([]);
    expect(store.restoreRequests).toEqual([]);
    expect(store.events).toEqual(['claim', 'status:failed']);
    expect(projectStateFingerprint(captureRestorableProjectState(store.project))).toBe(
      projectStateFingerprint(captureRestorableProjectState({
        ...ORIGINAL_PROJECT,
        overlays: [{ ...ORIGINAL_PROJECT.overlays[0], content: 'must not survive' }],
      })),
    );
  });

  it('restores every captured project field through the production checkpoint owner', async () => {
    const service = new CheckpointService();
    let insertedCheckpoint: Checkpoint | undefined;
    const projectWithUndefinedMetadata = {
      ...ORIGINAL_PROJECT,
      overlays: [{
        ...ORIGINAL_PROJECT.overlays[0],
        metadata: {
          nestedOptional: undefined,
          arrayWithOptional: [undefined, 'kept'],
        },
      }],
    };
    const persistedProject: Record<string, any> = {
      ...structuredClone(ORIGINAL_PROJECT),
      overlays: [{ ...ORIGINAL_PROJECT.overlays[0], content: 'mutated' }],
      fps: 60,
      durationInFrames: 900,
      playerDimensions: { width: 1080, height: 1920 },
      metadata: { title: 'Mutated' },
      sourceAssetIds: ['asset_2'],
    };
    const expectedRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: '2026-08-09T01:00:00.000Z',
    };

    infrastructureMocks.insertOne.mockImplementation(async (checkpoint: Checkpoint) => {
      insertedCheckpoint = emulateMongoRoundTrip(checkpoint);
      return { acknowledged: true, insertedId: checkpoint.checkpointId };
    });
    infrastructureMocks.getDatabase.mockResolvedValue({
      collection: (name: string) => {
        if (name === COLLECTIONS.CHECKPOINTS) {
          return { insertOne: infrastructureMocks.insertOne };
        }
        throw new Error(`Unexpected collection ${name}`);
      },
    });
    vi.spyOn(projectService, 'loadProjectForMutation').mockResolvedValue({
      project: projectWithUndefinedMetadata as any,
      revision: expectedRevision,
    });
    vi.spyOn(projectService, 'restoreCheckpointState').mockImplementation(async (_userId, _projectId, input) => {
      Object.assign(persistedProject, emulateMongoRoundTrip(input.setFields));
      for (const field of input.unsetFields) delete persistedProject[field];
      const committedAt = '2026-08-09T01:00:01.000Z';
      persistedProject.projectRevision = input.expectedRevision.value + 1;
      persistedProject.updatedAt = new Date(committedAt);
      return {
        receipt: {
          schemaVersion: 1,
          projectId: 'proj_1',
          revision: { schemaVersion: 1, value: 8, compatibilityUpdatedAt: committedAt },
          committedAt,
        },
        project: emulateMongoRoundTrip(persistedProject),
      };
    });

    const created = await service.createCheckpoint({
      checkpointId: 'ckpt_full_state',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: projectWithUndefinedMetadata.overlays as any,
      projectState: captureRestorableProjectState(projectWithUndefinedMetadata),
      description: 'Before manual undo',
      type: 'before-llm',
      capturedProjectRevision: expectedRevision,
      force: true,
    });
    expect(created).not.toBeNull();
    expect(insertedCheckpoint?.projectState?.presentFields).toEqual(expect.arrayContaining([
      'overlays', 'fps', 'durationInFrames', 'playerDimensions', 'metadata', 'sourceAssetIds',
    ]));
    expect(insertedCheckpoint?.stateHashVersion).toBe(2);
    vi.spyOn(service, 'getCheckpoint').mockResolvedValue(insertedCheckpoint ?? null);

    const result = await service.restoreProjectCheckpoint('ckpt_full_state', 'user_1', {
      projectId: 'proj_1',
      expectedRevision,
    });

    expect(result).toMatchObject({ restored: true, restoredRevision: { value: 8 } });
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
    expect((persistedProject.overlays[0].metadata as Record<string, unknown>).nestedOptional).toBeUndefined();
    expect((persistedProject.overlays[0].metadata as Record<string, unknown>).arrayWithOptional).toEqual([
      null,
      'kept',
    ]);
  });

  it('binds a post-mutation checkpoint to its supplied writer receipt without rereading a newer revision', async () => {
    const service = new CheckpointService();
    const receipt = writerReceipt();
    infrastructureMocks.insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'ckpt_receipt_bound' });
    infrastructureMocks.getDatabase.mockResolvedValue({
      collection: (name: string) => {
        if (name === COLLECTIONS.CHECKPOINTS) {
          return { insertOne: infrastructureMocks.insertOne };
        }
        throw new Error(`Unexpected collection ${name}`);
      },
    });
    const loadSnapshot = vi.spyOn(projectService, 'loadProjectForMutation').mockResolvedValue({
      project: ORIGINAL_PROJECT as any,
      revision: receipt.revision,
    });

    const created = await service.createCheckpoint({
      checkpointId: 'ckpt_receipt_bound',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any,
      projectState: captureRestorableProjectState(ORIGINAL_PROJECT),
      description: 'Exact post-mutation state',
      type: 'after-llm',
      capturedWriterReceipt: receipt,
      force: true,
    });

    expect(created?.capturedProjectRevision).toEqual(receipt.revision);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    await expect(service.createCheckpoint({
      checkpointId: 'ckpt_wrong_receipt_scope',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any,
      description: 'Must not persist',
      type: 'after-llm',
      capturedWriterReceipt: writerReceipt('proj_other'),
      force: true,
    })).rejects.toThrow('belongs to another project');
    expect(infrastructureMocks.insertOne).toHaveBeenCalledTimes(1);
  });

  it('rejects a post-mutation checkpoint when its writer receipt is no longer the current snapshot', async () => {
    const receipt = writerReceipt();
    vi.spyOn(projectService, 'loadProjectForMutation').mockResolvedValue({
      project: ORIGINAL_PROJECT as any,
      revision: {
        ...receipt.revision,
        value: receipt.revision.value + 1,
        compatibilityUpdatedAt: '2026-08-09T00:00:08.000Z',
      },
    });

    await expect(new CheckpointService().createCheckpoint({
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any,
      projectState: captureRestorableProjectState(ORIGINAL_PROJECT),
      description: 'Stale post-mutation state',
      type: 'after-llm',
      capturedWriterReceipt: receipt,
      force: true,
    })).rejects.toBeInstanceOf(ProjectMutationConflictError);
    expect(infrastructureMocks.getDatabase).not.toHaveBeenCalled();
    expect(infrastructureMocks.insertOne).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied checkpoint state that differs from the authoritative snapshot', async () => {
    vi.spyOn(projectService, 'loadProjectForMutation').mockResolvedValue({
      project: ORIGINAL_PROJECT as any,
      revision: ORIGINAL_REVISION,
    });

    await expect(new CheckpointService().createCheckpoint({
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any,
      projectState: captureRestorableProjectState({
        ...ORIGINAL_PROJECT,
        metadata: { title: 'forged stale state' },
      }),
      capturedProjectRevision: ORIGINAL_REVISION,
      description: 'Forged pre-mutation state',
      type: 'before-llm',
      force: true,
    })).rejects.toThrow('does not match its authoritative project snapshot');
    expect(infrastructureMocks.insertOne).not.toHaveBeenCalled();
  });

  it('rejects checkpoint list, create, clear, and prune for a principal outside the actual project', async () => {
    vi.spyOn(projectService, 'getProjectRevision').mockRejectedValue(new ProjectNotFoundOrForbiddenError());
    vi.spyOn(projectService, 'loadProjectForMutation').mockRejectedValue(new ProjectNotFoundOrForbiddenError());
    const service = new CheckpointService();

    const listResponse = await listCheckpointsRoute(new NextRequest(
      'http://localhost/api/services/editron/checkpoints/list?sessionId=sess_b&projectId=proj_b',
    ));
    expect(listResponse.status).toBe(404);
    await expect(service.createCheckpoint({
      sessionId: 'sess_b', projectId: 'proj_b', userId: 'user_1', overlays: [],
      description: 'unauthorized', type: 'user-edit',
    })).rejects.toBeInstanceOf(ProjectNotFoundOrForbiddenError);
    await expect(service.clearCheckpoints('sess_b', 'user_1', 'proj_b')).rejects.toBeInstanceOf(ProjectNotFoundOrForbiddenError);
    await expect(service.pruneCheckpoints('sess_b', 'user_1', 'proj_b')).rejects.toBeInstanceOf(ProjectNotFoundOrForbiddenError);
    expect(infrastructureMocks.getDatabase).not.toHaveBeenCalled();
  });

  it('uses the owner-and-revision predicate for an exact checkpoint restore and rotates the revision', async () => {
    const expectedRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: '2026-08-09T01:00:00.000Z',
    };
    const persistedProject: Record<string, any> = {
      ...structuredClone(ORIGINAL_PROJECT),
      projectRevision: 7,
      updatedAt: new Date(expectedRevision.compatibilityUpdatedAt),
      metadata: { title: 'mutated' },
      unrelatedWorkerReceipt: { preserved: true },
    };
    infrastructureMocks.findOneAndUpdate.mockImplementation(async (
      filter: Record<string, unknown>,
      update: { $set: Record<string, unknown>; $unset?: Record<string, unknown>; $inc: Record<string, number> },
      options: Record<string, unknown>,
    ) => {
      expect(filter).toEqual({
        projectId: 'proj_1', userId: 'user_1', projectRevision: 7,
        updatedAt: new Date(expectedRevision.compatibilityUpdatedAt),
      });
      expect(options).toMatchObject({ returnDocument: 'after', includeResultMetadata: false });
      Object.assign(persistedProject, emulateMongoRoundTrip(update.$set));
      for (const field of Object.keys(update.$unset ?? {})) delete persistedProject[field];
      persistedProject.projectRevision += update.$inc.projectRevision;
      return emulateMongoRoundTrip(persistedProject);
    });
    infrastructureMocks.getDatabase.mockResolvedValue({
      collection: (name: string) => {
        if (name !== COLLECTIONS.PROJECTS) throw new Error(`Unexpected collection ${name}`);
        return { findOneAndUpdate: infrastructureMocks.findOneAndUpdate, findOne: infrastructureMocks.findOne };
      },
    });

    const restored = await projectService.restoreCheckpointState('user_1', 'proj_1', {
      expectedRevision,
      setFields: { overlays: structuredClone(ORIGINAL_PROJECT.overlays), fps: 30 },
      unsetFields: ['metadata'],
    });

    expect(restored.receipt.revision).toMatchObject({ schemaVersion: 1, value: 8 });
    expect(restored.project).toMatchObject({ projectRevision: 8, unrelatedWorkerReceipt: { preserved: true } });
    expect(restored.project.metadata).toBeUndefined();
  });

  it('rejects a stale browser-selected restore with zero project or checkpoint mutation', async () => {
    const expectedRevision: ProjectRevisionV1 = {
      schemaVersion: 1, value: 7, compatibilityUpdatedAt: '2026-08-09T01:00:00.000Z',
    };
    const checkpointState = captureRestorableProjectState(ORIGINAL_PROJECT);
    const checkpoint: Checkpoint = {
      checkpointId: 'ckpt_stale_browser', sessionId: 'sess_1', projectId: 'proj_1', userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any, projectState: checkpointState,
      stateHash: projectStateFingerprint(checkpointState), stateHashVersion: 2,
      timestamp: new Date(), description: 'stale browser', type: 'before-llm', createdAt: new Date(),
    };
    const projectAfterBrowserMutation = { ...structuredClone(ORIGINAL_PROJECT), projectRevision: 8 };
    const checkpointBefore = structuredClone(checkpoint);
    const service = new CheckpointService();
    vi.spyOn(service, 'getCheckpoint').mockResolvedValue(checkpoint);
    vi.spyOn(projectService, 'restoreCheckpointState').mockRejectedValue(new ProjectMutationConflictError({
      schemaVersion: 1, value: 8, compatibilityUpdatedAt: '2026-08-09T01:00:01.000Z',
    }));

    const result = await service.restoreProjectCheckpoint('ckpt_stale_browser', 'user_1', {
      projectId: 'proj_1',
      expectedRevision,
    });

    expect(result).toMatchObject({ restored: false, reason: 'project-revision-conflict', currentRevision: { value: 8 } });
    expect(projectAfterBrowserMutation).toMatchObject({ projectRevision: 8 });
    expect(checkpoint).toEqual(checkpointBefore);
    expect(infrastructureMocks.getDatabase).not.toHaveBeenCalled();
  });

  it('rejects a stale restore after a chat or worker mutation changes only the compatibility timestamp', async () => {
    const expectedRevision: ProjectRevisionV1 = {
      schemaVersion: 1, value: 7, compatibilityUpdatedAt: '2026-08-09T01:00:00.000Z',
    };
    const checkpointState = captureRestorableProjectState(ORIGINAL_PROJECT);
    const service = new CheckpointService();
    vi.spyOn(service, 'getCheckpoint').mockResolvedValue({
      checkpointId: 'ckpt_stale_worker', sessionId: 'sess_1', projectId: 'proj_1', userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any, projectState: checkpointState,
      stateHash: projectStateFingerprint(checkpointState), stateHashVersion: 2,
      timestamp: new Date(), description: 'stale worker', type: 'before-llm', createdAt: new Date(),
    });
    vi.spyOn(projectService, 'restoreCheckpointState').mockRejectedValue(new ProjectMutationConflictError({
      schemaVersion: 1, value: 7, compatibilityUpdatedAt: '2026-08-09T01:00:01.000Z',
    }));

    const result = await service.restoreProjectCheckpoint('ckpt_stale_worker', 'user_1', {
      projectId: 'proj_1',
      expectedRevision,
    });

    expect(result).toMatchObject({
      restored: false,
      reason: 'project-revision-conflict',
      currentRevision: { value: 7, compatibilityUpdatedAt: '2026-08-09T01:00:01.000Z' },
    });
    expect(infrastructureMocks.getDatabase).not.toHaveBeenCalled();
  });

  it('makes a duplicate restore retry deterministic after the first exact restore rotates the revision', async () => {
    const expectedRevision: ProjectRevisionV1 = {
      schemaVersion: 1, value: 7, compatibilityUpdatedAt: '2026-08-09T01:00:00.000Z',
    };
    const checkpointState = captureRestorableProjectState(ORIGINAL_PROJECT);
    const checkpoint: Checkpoint = {
      checkpointId: 'ckpt_retry', sessionId: 'sess_1', projectId: 'proj_1', userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any, projectState: checkpointState,
      stateHash: projectStateFingerprint(checkpointState), stateHashVersion: 2,
      timestamp: new Date(), description: 'retry', type: 'before-llm', createdAt: new Date(),
    };
    const service = new CheckpointService();
    vi.spyOn(service, 'getCheckpoint').mockResolvedValue(checkpoint);
    const restoreSpy = vi.spyOn(projectService, 'restoreCheckpointState')
      .mockResolvedValueOnce({
        receipt: {
          schemaVersion: 1, projectId: 'proj_1',
          revision: { schemaVersion: 1, value: 8, compatibilityUpdatedAt: '2026-08-09T01:00:01.000Z' },
          committedAt: '2026-08-09T01:00:01.000Z',
        },
        project: structuredClone(ORIGINAL_PROJECT),
      })
      .mockRejectedValueOnce(new ProjectMutationConflictError({
        schemaVersion: 1, value: 8, compatibilityUpdatedAt: '2026-08-09T01:00:01.000Z',
      }));

    const first = await service.restoreProjectCheckpoint('ckpt_retry', 'user_1', {
      projectId: 'proj_1',
      expectedRevision,
    });
    const duplicate = await service.restoreProjectCheckpoint('ckpt_retry', 'user_1', {
      projectId: 'proj_1',
      expectedRevision,
    });

    expect(first).toMatchObject({ restored: true, restoredRevision: { value: 8 } });
    expect(duplicate).toMatchObject({ restored: false, reason: 'project-revision-conflict', currentRevision: { value: 8 } });
    expect(restoreSpy).toHaveBeenCalledTimes(2);
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

    const result = await service.restoreProjectCheckpoint('ckpt_legacy', 'user_1', {
      projectId: 'proj_1',
      expectedRevision: {
        schemaVersion: 1,
        value: 7,
        compatibilityUpdatedAt: '2026-08-09T01:00:00.000Z',
      },
    });

    expect(result).toMatchObject({
      restored: false,
      reason: 'legacy-overlay-only-checkpoint',
    });
    expect(infrastructureMocks.getDatabase).not.toHaveBeenCalled();
  });

  it('rejects a corrupted versioned checkpoint before mutating the project', async () => {
    const service = new CheckpointService();
    const projectState = captureRestorableProjectState(ORIGINAL_PROJECT);
    vi.spyOn(service, 'getCheckpoint').mockResolvedValue({
      checkpointId: 'ckpt_corrupt',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any,
      projectState,
      stateHash: 'corrupt-state-hash',
      stateHashVersion: 2,
      timestamp: new Date(),
      description: 'Corrupt checkpoint',
      type: 'before-llm',
      createdAt: new Date(),
    });

    const result = await service.restoreProjectCheckpoint('ckpt_corrupt', 'user_1', {
      projectId: 'proj_1',
      expectedRevision: {
        schemaVersion: 1,
        value: 7,
        compatibilityUpdatedAt: '2026-08-09T01:00:00.000Z',
      },
    });

    expect(result).toMatchObject({
      restored: false,
      reason: 'checkpoint-state-hash-mismatch',
      expectedStateHash: 'corrupt-state-hash',
    });
    expect(infrastructureMocks.getDatabase).not.toHaveBeenCalled();
  });

  it('keeps the authenticated restore route project-scoped and verification-gated', async () => {
    const expectedRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: '2026-08-09T01:00:00.000Z',
    };
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
      restoredRevision: { ...expectedRevision, value: 8, compatibilityUpdatedAt: '2026-08-09T01:00:01.000Z' },
    });

    const mismatch = await restoreCheckpointRoute(new NextRequest(
      'http://localhost/api/services/editron/checkpoints/restore',
      { method: 'POST', body: JSON.stringify({ checkpointId: 'ckpt_route', projectId: 'proj_other', expectedRevision }) },
    ));
    expect(mismatch.status).toBe(409);
    expect(restoreSpy).not.toHaveBeenCalled();

    const response = await restoreCheckpointRoute(new NextRequest(
      'http://localhost/api/services/editron/checkpoints/restore',
      { method: 'POST', body: JSON.stringify({ checkpointId: 'ckpt_route', projectId: 'proj_1', expectedRevision }) },
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      checkpointId: 'ckpt_route',
      projectId: 'proj_1',
      reloadProject: true,
    });
    expect(restoreSpy).toHaveBeenCalledWith('ckpt_route', 'user_1', { projectId: 'proj_1', expectedRevision });

    restoreSpy.mockResolvedValueOnce({
      restored: false,
      checkpointId: checkpoint.checkpointId,
      expectedStateHash: checkpoint.stateHash!,
      reason: 'project-revision-conflict',
      currentRevision: { schemaVersion: 1, value: 8, compatibilityUpdatedAt: '2026-08-09T01:00:01.000Z' },
    });
    const staleResponse = await restoreCheckpointRoute(new NextRequest(
      'http://localhost/api/services/editron/checkpoints/restore',
      { method: 'POST', body: JSON.stringify({ checkpointId: 'ckpt_route', projectId: 'proj_1', expectedRevision }) },
    ));
    expect(staleResponse.status).toBe(409);
    await expect(staleResponse.json()).resolves.toMatchObject({
      success: false,
      code: 'CHECKPOINT_RESTORE_UNSAFE_UNDO',
      reason: 'project-revision-conflict',
      currentRevision: { value: 8 },
    });
  });

  it('routes the chat undo tool through an exact scoped restore and returns the new revision', async () => {
    const projectState = captureRestorableProjectState(ORIGINAL_PROJECT);
    const checkpoint: Checkpoint = {
      checkpointId: 'ckpt_tool',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any,
      projectState,
      stateHash: projectStateFingerprint(projectState),
      operationId: 'chatop_restore_tool',
      timestamp: new Date(),
      description: 'Tool restore',
      type: 'before-llm',
      createdAt: new Date(),
    };
    vi.spyOn(checkpointService, 'getCheckpoint').mockResolvedValue(checkpoint);
    const expectedRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: '2026-08-09T01:00:00.000Z',
    };
    const restoreSpy = vi.spyOn(checkpointService, 'restoreProjectCheckpoint').mockResolvedValue({
      restored: true,
      checkpointId: checkpoint.checkpointId,
      expectedStateHash: checkpoint.stateHash!,
      actualStateHash: checkpoint.stateHash,
      restoredRevision: {
        schemaVersion: 1,
        value: 8,
        compatibilityUpdatedAt: '2026-08-09T01:00:01.000Z',
      },
    });
    const getRevisionSpy = vi.spyOn(projectService, 'getProjectRevision');
    vi.spyOn(checkpointService, 'getRollbackReceipt').mockResolvedValue({
      schemaVersion: 1,
      receiptId: checkpoint.operationId!,
      expectedRevision,
    });

    const restoreTool = createTools('user_1', 'proj_1')
      .find((candidate) => candidate.name === 'restore_ai_edit_checkpoint');
    expect(restoreTool).toBeDefined();
    const envelope = JSON.parse(await restoreTool!.invoke({ checkpointId: 'ckpt_tool' }));

    expect(envelope).toMatchObject({
      status: 'success',
      data: {
        checkpointId: 'ckpt_tool',
        reloadProject: true,
        revision: { value: 8 },
        verification: { expectedStateHash: checkpoint.stateHash },
      },
    });
    expect(restoreSpy).toHaveBeenCalledWith('ckpt_tool', 'user_1', {
      projectId: 'proj_1',
      expectedRevision,
    });
    expect(checkpointService.getRollbackReceipt).toHaveBeenCalledWith(
      'ckpt_tool',
      'user_1',
      'proj_1',
      'chatop_restore_tool',
    );
    expect(getRevisionSpy).not.toHaveBeenCalled();
  });

  it('refuses a chat checkpoint restore without the original operation receipt', async () => {
    const projectState = captureRestorableProjectState(ORIGINAL_PROJECT);
    const checkpoint: Checkpoint = {
      checkpointId: 'ckpt_tool_missing_receipt',
      sessionId: 'sess_1',
      projectId: 'proj_1',
      userId: 'user_1',
      overlays: ORIGINAL_PROJECT.overlays as any,
      projectState,
      stateHash: projectStateFingerprint(projectState),
      operationId: 'chatop_restore_missing_receipt',
      timestamp: new Date(),
      description: 'Tool restore without receipt',
      type: 'before-llm',
      createdAt: new Date(),
    };
    vi.spyOn(checkpointService, 'getCheckpoint').mockResolvedValue(checkpoint);
    vi.spyOn(checkpointService, 'getRollbackReceipt').mockResolvedValue(null);
    const restoreSpy = vi.spyOn(checkpointService, 'restoreProjectCheckpoint');

    const restoreTool = createTools('user_1', 'proj_1')
      .find((candidate) => candidate.name === 'restore_ai_edit_checkpoint');
    const envelope = JSON.parse(await restoreTool!.invoke({ checkpointId: checkpoint.checkpointId }));

    expect(envelope).toMatchObject({
      status: 'error',
      error: { code: 'CHECKPOINT_RESTORE_RECEIPT_MISSING' },
    });
    expect(restoreSpy).not.toHaveBeenCalled();
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

  it('leaves durable mutation completion, checkpoints, and rendering to the owning worker', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store, 'chatop_deferred1');
    const deferredVerification = {
      version: 'editron-chat-postcondition-v1',
      status: 'pass',
      toolName: 'apply_editorial_intent',
      stateExpectation: 'project-state-changed-or-durable-operation-queued',
      reason: 'The durable editorial operation was queued.',
      beforeStateHash: 'same',
      afterStateHash: 'same',
      stateChanged: false,
      requestedTargetIds: [],
      affectedTargets: [],
      renderVerification: {
        status: 'deferred',
        required: false,
        modalities: [],
      },
    };

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [{ id: 'intent', name: 'apply_editorial_intent' }],
      toolResults: [{
        toolCallId: 'intent',
        toolName: 'apply_editorial_intent',
        result: JSON.stringify({
          status: 'success',
          data: {
            dispatch: {
              owner: 'phase2-script-planner',
              status: 'queued',
              authority: {
                queueStatus: 'queued',
                uploadBatchId: 'upload_batch_123',
                messageId: 'qstash_123',
              },
            },
            postconditionVerification: deferredVerification,
          },
        }),
      }],
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({ status: 'not-needed', mutatingToolNames: [] });
    expect(result.renderVerification).toBeUndefined();
    expect(Array.from(store.checkpoints.values()).filter((checkpoint) => checkpoint.type === 'after-llm')).toHaveLength(0);
  });

  it('keeps a verified first mutation and replans stale sibling work against the new revision', async () => {
    const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
    const ready = await prepare(store, 'chatop_revision_replan1');
    const replan = buildChatRevisionReplanOutput({
      toolName: 'add_sfx',
      scheduledRevision: 'revision-before',
      currentRevision: 'revision-after',
    });
    expect(replan).not.toBeNull();
    expect(classifyChatToolExecutionOutcome(replan!)).toBe('replan-required');

    const result = await completeChatAiEditTransaction({
      transaction: ready.transaction!,
      toolCalls: [
        { id: 'caption', name: 'add_captions' },
        { id: 'sfx', name: 'add_sfx' },
      ],
      toolResults: [
        {
          toolCallId: 'caption',
          toolName: 'add_captions',
          result: JSON.stringify({ status: 'success' }),
        },
        {
          toolCallId: 'sfx',
          toolName: 'add_sfx',
          result: replan!,
        },
      ],
      writerIssuedReceipt: writerReceipt(),
    }, { checkpointStore: store, loadProject: store.loadProject });

    expect(result).toMatchObject({
      status: 'created',
      mutatingToolNames: ['add_captions'],
      failedToolNames: [],
    });
    expect(store.events).not.toContain('restore');
  });

  it('treats explicit no-op, decline, and needs-choice outcomes as non-failures', async () => {
    for (const [index, status] of ['no-op', 'declined', 'needs-choice'].entries()) {
      const store = new MemoryCheckpointStore(ORIGINAL_PROJECT);
      const ready = await prepare(store, `chatop_nonmutation_${index}`);
      const result = await completeChatAiEditTransaction({
        transaction: ready.transaction!,
        toolCalls: [{ id: `captions-${index}`, name: 'add_captions' }],
        toolResults: [{
          toolCallId: `captions-${index}`,
          toolName: 'add_captions',
          result: JSON.stringify({ status, data: {}, error: null }),
        }],
      }, { checkpointStore: store, loadProject: store.loadProject });

      expect(result).toMatchObject({ status: 'not-needed', failedToolNames: [] });
      expect(store.events).not.toContain('restore');
    }
  });

  it('accepts only verifiable durable queue receipts', () => {
    const project = structuredClone(ORIGINAL_PROJECT);
    const reference = enforceChatToolPostcondition({
      toolName: 'apply_reference_style',
      args: { referenceAssetId: 'asset_ref' },
      output: JSON.stringify({
        status: 'success',
        data: { jobId: 'chat_style_123', queueStatus: 'queued' },
      }),
      beforeProject: project,
      afterProject: project,
    });
    const dubbing = enforceChatToolPostcondition({
      toolName: 'dub_selected_dialogue',
      args: { overlayId: 'video-1' },
      output: JSON.stringify({
        status: 'success',
        data: { jobId: 'chat_dub_123', status: 'already-queued' },
      }),
      beforeProject: project,
      afterProject: project,
    });
    const malformed = enforceChatToolPostcondition({
      toolName: 'apply_reference_style',
      args: { referenceAssetId: 'asset_ref' },
      output: JSON.stringify({
        status: 'success',
        data: { queueStatus: 'queued' },
      }),
      beforeProject: project,
      afterProject: project,
    });

    expect(reference.verification).toMatchObject({
      status: 'pass',
      renderVerification: { status: 'deferred', required: false },
    });
    expect(dubbing.verification).toMatchObject({
      status: 'pass',
      renderVerification: { status: 'deferred', required: false },
    });
    expect(malformed.verification?.status).toBe('fail');
    expect(JSON.parse(malformed.output)).toMatchObject({
      status: 'error',
      error: { code: 'CHAT_EDIT_POSTCONDITION_FAILED' },
    });
  });

  it('uses the durable family receipt and active caption spans for render proof', () => {
    const captionOverlay = {
      id: 'caption_1',
      type: 'caption',
      from: 0,
      durationInFrames: 300,
      captions: [
        { text: 'First phrase', startMs: 1_000, endMs: 2_000, words: [] },
        { text: 'Second phrase', startMs: 7_000, endMs: 8_000, words: [] },
      ],
    };
    const receipt = {
      version: 'editron-chat-postcondition-v1',
      status: 'pass',
      affectedTargets: [{
        overlayId: captionOverlay.id,
        overlayType: captionOverlay.type,
        state: 'created',
        from: captionOverlay.from,
        endFrame: captionOverlay.from + captionOverlay.durationInFrames,
      }],
      renderEligibility: { inheritedIssues: [], introducedIssues: [] },
      renderVerification: {
        status: 'pending',
        required: true,
        modalities: ['visual'],
      },
    };

    const request = buildChatEditRenderVerificationRequest({
      transaction: {
        operationId: 'chatop_captionproof',
        sessionId: 'session_captionproof',
        projectId: 'proj_captionproof',
        userId: 'user_1',
        beforeCheckpointId: 'checkpoint_before',
      },
      afterCheckpointId: 'checkpoint_after',
      subjectReceipt: writerReceipt('proj_captionproof'),
      project: {
        durationInFrames: 300,
        fps: 30,
        overlays: [captionOverlay],
      },
      successfulCalls: [{
        call: { id: 'intent', name: 'apply_editorial_intent' },
        result: {
          toolCallId: 'intent',
          toolName: 'apply_editorial_intent',
          result: JSON.stringify({
            status: 'success',
            data: { postconditionVerification: receipt },
          }),
        },
      }],
    });

    expect(request.modalities).toEqual(['visual']);
    expect(request.sampleFrames).toEqual([45, 225]);
    expect(request.subjectReceipt).toEqual(writerReceipt('proj_captionproof'));
  });

  it('keeps the live route and client ordered around durable preflight and stable operation IDs', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/services/editron/chat/stream/route.ts'), 'utf8');
    const panel = readFileSync(join(
      process.cwd(),
      'components/editron/editor/version-7.0.0/components/ai-chat/ai-chat-panel.tsx',
    ), 'utf8');

    expect(route.indexOf('prepareChatAiEditTransaction({')).toBeLessThan(route.indexOf('agent.invoke(inputs'));
    expect(route.indexOf('projectService.captureMutationReceipts(')).toBeLessThan(route.indexOf('agent.invoke(inputs'));
    expect(route).toContain('latestWriterReceiptForProject(receipts, projectId)');
    expect(route.match(/writerIssuedReceipt,/g)).toHaveLength(2);
    expect(route).toContain("code: 'CHAT_EDIT_OPERATION_REPLAY'");
    expect(route).toContain('rollbackChatAiEditTransaction({');
    expect(route).toContain('projectService.recordChatRenderVerificationProjection(');
    const chatProofProducer = route.slice(
      route.indexOf('async function persistChatEditVerificationRequested'),
      route.indexOf('export async function POST'),
    );
    expect(chatProofProducer).not.toContain('COLLECTIONS.PROJECTS');
    expect(chatProofProducer).not.toContain("collection(COLLECTIONS.PROJECTS)");
    expect(panel).toContain('const operationId = crypto.randomUUID();');
    expect(panel).toContain('const requestSessionId = currentSessionId;');
    expect(panel.indexOf('const requestSessionId = currentSessionId;')).toBeLessThan(
      panel.indexOf('await saveProject();'),
    );
    expect(panel).toMatch(/operationId,\r?\n\s+sessionId: requestSessionId/);
    expect(panel).toMatch(/console\.error\('Error parsing stream chunk', e\);\r?\n\s+throw e;/);
  });
});
