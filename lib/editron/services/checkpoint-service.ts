/**
 * Checkpoint service for editor state and durable AI edit transactions.
 */

import { createHash } from 'crypto';
import { nanoid } from 'nanoid';

import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

import { getDatabase, COLLECTIONS } from '../db/mongodb';
import { assetResolver } from './asset-resolver';
import {
  ProjectMutationConflictError,
  ProjectNotFoundOrForbiddenError,
  projectService,
  type ProjectMutationReceiptV1,
  type ProjectRevisionV1,
  type ProjectTimelineChangeActorKindV1,
} from './project-service';

export type CheckpointType = 'initial' | 'before-llm' | 'after-llm' | 'user-edit';
export type ChatEditOperationStatus = 'running' | 'completed' | 'no-op' | 'rolled-back' | 'failed';

// Only editor-owned/user-visible fields belong in an AI edit restore boundary.
// Worker locks, billing, ownership, timestamps, and immutable IDs are deliberately excluded.
export const CHAT_RESTORABLE_PROJECT_FIELDS = [
  'overlays',
  'generatedCompositions',
  'aspectRatio',
  'playerDimensions',
  'fps',
  'durationInFrames',
  'name',
  'thumbnail',
  'brand',
  'brandId',
  'metadata',
  'projectMetadata',
  'sourceAssetIds',
  'mediaAssetIds',
  'videoAssets',
  'audioAssets',
  'imageAssets',
  'sourceAssets',
  'uploadBatchId',
  'primaryAssetId',
  'storyline',
  'editorialPreferences',
  'productionBrief',
  'pipelineStage',
  'qualityScore',
  'projectStatus',
  'status',
  'statusHistory',
  'lastError',
  'editMethod',
  'needsVisualDrivenEditing',
  'intelligence',
  'qualityReview',
] as const;

export type ChatRestorableProjectField = typeof CHAT_RESTORABLE_PROJECT_FIELDS[number];

export interface RestorableProjectState {
  presentFields: ChatRestorableProjectField[];
  fields: Partial<Record<ChatRestorableProjectField, unknown>>;
}

/**
 * The revision bound to one named rollback attempt. A supplied writer-issued
 * post-write receipt is used directly; the temporary observed-revision path
 * remains only for callers that D3 has not migrated yet.
 */
export interface CheckpointRollbackReceiptV1 {
  schemaVersion: 1;
  receiptId: string;
  expectedRevision: ProjectRevisionV1;
}

export interface Checkpoint {
  _id?: string;
  checkpointId: string;
  sessionId: string;
  projectId: string;
  userId: string;
  overlays: Overlay[];
  projectState?: RestorableProjectState;
  stateHash?: string;
  stateHashVersion?: 2;
  capturedProjectRevision?: ProjectRevisionV1;
  rollbackReceipts?: CheckpointRollbackReceiptV1[];
  operationId?: string;
  operationStatus?: ChatEditOperationStatus;
  mutatingToolNames?: string[];
  afterCheckpointId?: string;
  operationError?: string;
  timestamp: Date;
  description: string;
  type: CheckpointType;
  createdAt: Date;
  updatedAt?: Date;
}

export interface CheckpointInput {
  sessionId: string;
  projectId: string;
  userId: string;
  overlays: Overlay[];
  projectState?: RestorableProjectState;
  description: string;
  type: CheckpointType;
  checkpointId?: string;
  operationId?: string;
  operationStatus?: ChatEditOperationStatus;
  /**
   * The exact ProjectService receipt for the state supplied to this checkpoint.
   * When present, checkpoint capture must not re-observe a newer project revision.
   */
  capturedWriterReceipt?: ProjectMutationReceiptV1;
  /** The exact revision paired with a caller's pre-mutation project snapshot. */
  capturedProjectRevision?: ProjectRevisionV1;
  force?: boolean;
}

export interface ChatEditOperationUpdate {
  operationStatus: ChatEditOperationStatus;
  mutatingToolNames?: string[];
  afterCheckpointId?: string;
  operationError?: string;
}

export interface RestoreProjectCheckpointResult {
  restored: boolean;
  checkpointId: string;
  expectedStateHash: string;
  actualStateHash?: string;
  reason?: string;
  beforeRevision?: ProjectRevisionV1;
  restoredRevision?: ProjectRevisionV1;
  currentRevision?: ProjectRevisionV1;
}

export interface RestoreProjectCheckpointOptions {
  projectId: string;
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineChangeActorKindV1;
}

const CURRENT_STATE_HASH_VERSION = 2 as const;

export function captureRestorableProjectState(project: Record<string, unknown>): RestorableProjectState {
  const fields: RestorableProjectState['fields'] = {};
  const presentFields: ChatRestorableProjectField[] = [];

  for (const field of CHAT_RESTORABLE_PROJECT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(project, field) || project[field] === undefined) continue;
    presentFields.push(field);
    fields[field] = cloneValue(project[field]);
  }

  if (!presentFields.includes('overlays')) {
    presentFields.unshift('overlays');
    fields.overlays = [];
  }
  if (!presentFields.includes('generatedCompositions')) {
    presentFields.push('generatedCompositions');
    fields.generatedCompositions = [];
  }

  return { presentFields, fields };
}

export function projectStateFingerprint(state: RestorableProjectState): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({
      presentFields: [...state.presentFields].sort(),
      fields: state.fields,
    })))
    .digest('hex');
}

export class CheckpointService {
  async createCheckpoint(input: CheckpointInput): Promise<Checkpoint | null> {
    const expectedProjectRevision = input.capturedWriterReceipt
      ? revisionFromWriterReceipt(input.capturedWriterReceipt, input.projectId)
      : input.capturedProjectRevision;
    if (expectedProjectRevision && !isProjectRevisionV1(expectedProjectRevision)) {
      throw new Error('Checkpoint capture revision is invalid.');
    }
    const snapshot = await projectService.loadProjectForMutation(
      input.userId,
      input.projectId,
    );
    if (expectedProjectRevision && !sameProjectRevision(
      snapshot.revision,
      expectedProjectRevision,
    )) {
      throw new ProjectMutationConflictError(
        snapshot.revision,
        'Checkpoint capture no longer matches the project revision that produced its state.',
      );
    }
    const db = await getDatabase();
    const cleanState = this.cleanProjectState(
      captureRestorableProjectState(snapshot.project as unknown as Record<string, unknown>),
    );
    if (input.projectState) {
      const proposedState = this.cleanProjectState(input.projectState);
      if (projectStateFingerprint(proposedState) !== projectStateFingerprint(cleanState)) {
        throw new Error('Checkpoint state does not match its authoritative project snapshot.');
      }
    }
    const stateHash = projectStateFingerprint(cleanState);

    if (!input.force) {
      const lastCheckpoint = await db
        .collection(COLLECTIONS.CHECKPOINTS)
        .find({
          sessionId: input.sessionId,
          projectId: input.projectId,
          userId: input.userId,
        })
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray() as unknown as Checkpoint[];

      if (lastCheckpoint.length > 0 && checkpointStateHash(lastCheckpoint[0]) === stateHash) {
        return null;
      }
    }

    const checkpointId = input.checkpointId ?? `ckpt_${nanoid(12)}`;
    const now = new Date();
    const checkpoint: Checkpoint = {
      _id: checkpointId,
      checkpointId,
      sessionId: input.sessionId,
      projectId: input.projectId,
      userId: input.userId,
      overlays: (cleanState.fields.overlays ?? []) as Overlay[],
      projectState: cleanState,
      stateHash,
      stateHashVersion: CURRENT_STATE_HASH_VERSION,
      capturedProjectRevision: snapshot.revision,
      operationId: input.operationId,
      operationStatus: input.operationStatus,
      timestamp: now,
      description: input.description,
      type: input.type,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection<Checkpoint>(COLLECTIONS.CHECKPOINTS).insertOne(checkpoint);
    return checkpoint;
  }

  async claimChatEditOperation(input: CheckpointInput & {
    checkpointId: string;
    operationId: string;
    projectState: RestorableProjectState;
  }): Promise<{ claimed: boolean; checkpoint: Checkpoint }> {
    try {
      const checkpoint = await this.createCheckpoint({
        ...input,
        force: true,
        operationStatus: 'running',
      });
      if (!checkpoint) throw new Error('Durable chat edit checkpoint was not created.');
      return { claimed: true, checkpoint };
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) throw error;
      const existing = await this.getCheckpoint(
        input.checkpointId,
        input.userId,
        input.projectId,
      );
      if (
        !existing
        || existing.projectId !== input.projectId
        || existing.sessionId !== input.sessionId
        || existing.operationId !== input.operationId
      ) {
        throw new Error('Chat edit operation ID collided with an inaccessible checkpoint.');
      }
      return { claimed: false, checkpoint: existing };
    }
  }

  async updateChatEditOperation(
    checkpointId: string,
    userId: string,
    operationId: string,
    update: ChatEditOperationUpdate,
  ): Promise<void> {
    const checkpoint = await this.getCheckpoint(checkpointId, userId);
    if (!checkpoint) {
      throw new Error(`Chat edit operation checkpoint ${checkpointId} could not be updated.`);
    }
    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.CHECKPOINTS).updateOne(
      { checkpointId, userId, projectId: checkpoint.projectId, operationId },
      { $set: { ...update, updatedAt: new Date() } },
    );
    if (result.matchedCount !== 1) {
      throw new Error(`Chat edit operation checkpoint ${checkpointId} could not be updated.`);
    }
  }

  async updateChatEditOperationScoped(
    checkpointId: string,
    userId: string,
    projectId: string,
    operationId: string,
    update: ChatEditOperationUpdate,
  ): Promise<void> {
    const checkpoint = await this.getCheckpoint(checkpointId, userId, projectId);
    if (!checkpoint || checkpoint.operationId !== operationId) {
      throw new Error(`Chat edit operation checkpoint ${checkpointId} could not be updated.`);
    }
    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.CHECKPOINTS).updateOne(
      { checkpointId, userId, projectId, operationId },
      { $set: { ...update, updatedAt: new Date() } },
    );
    if (result.matchedCount !== 1) {
      throw new Error(`Chat edit operation checkpoint ${checkpointId} could not be updated.`);
    }
  }

  async recordRollbackExpectedRevision(
    checkpointId: string,
    userId: string,
    projectId: string,
    receiptId: string,
    writerIssuedReceipt?: ProjectMutationReceiptV1,
  ): Promise<CheckpointRollbackReceiptV1> {
    assertRollbackReceiptId(receiptId);
    const checkpoint = await this.getCheckpoint(checkpointId, userId, projectId);
    if (!checkpoint) {
      throw new Error(`Chat edit operation checkpoint ${checkpointId} could not be bound to a rollback revision.`);
    }
    const existing = rollbackReceiptFor(checkpoint, receiptId);
    if (existing) return existing;
    if (!writerIssuedReceipt) {
      throw new Error(`Chat edit operation checkpoint ${checkpointId} requires a writer-issued rollback receipt.`);
    }

    const receipt: CheckpointRollbackReceiptV1 = {
      schemaVersion: 1,
      receiptId,
      expectedRevision: revisionFromWriterReceipt(writerIssuedReceipt, projectId),
    };
    const db = await getDatabase();
    const persisted = await db.collection<Checkpoint>(COLLECTIONS.CHECKPOINTS).findOneAndUpdate(
      {
        checkpointId,
        userId,
        projectId,
        rollbackReceipts: { $not: { $elemMatch: { receiptId } } },
      },
      {
        $push: { rollbackReceipts: receipt },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after', includeResultMetadata: false },
    ) as unknown as Checkpoint | null;
    const persistedReceipt = persisted && rollbackReceiptFor(persisted, receiptId);
    if (persistedReceipt) return persistedReceipt;

    const concurrentReceipt = await this.getRollbackReceipt(
      checkpointId,
      userId,
      projectId,
      receiptId,
    );
    if (concurrentReceipt) return concurrentReceipt;
    throw new Error(`Chat edit operation checkpoint ${checkpointId} could not persist a rollback revision.`);
  }

  async getRollbackReceipt(
    checkpointId: string,
    userId: string,
    projectId: string,
    receiptId: string,
  ): Promise<CheckpointRollbackReceiptV1 | null> {
    const checkpoint = await this.getCheckpoint(checkpointId, userId, projectId);
    if (!checkpoint) return null;
    return rollbackReceiptFor(checkpoint, receiptId);
  }

  async getCheckpoints(sessionId: string, userId?: string, projectId?: string): Promise<Checkpoint[]> {
    const scope = checkpointScope(sessionId, userId, projectId);
    await projectService.getProjectRevision(scope.userId, scope.projectId);
    const db = await getDatabase();
    return db
      .collection(COLLECTIONS.CHECKPOINTS)
      .find(scope)
      .sort({ timestamp: 1 })
      .toArray() as unknown as Checkpoint[];
  }

  async getCheckpoint(checkpointId: string, userId: string, projectId?: string): Promise<Checkpoint | null> {
    const db = await getDatabase();
    const checkpoint = await db.collection(COLLECTIONS.CHECKPOINTS)
      .findOne({ checkpointId, userId, ...(projectId ? { projectId } : {}) }) as unknown as Checkpoint | null;
    if (!checkpoint) return null;
    try {
      await projectService.getProjectRevision(userId, checkpoint.projectId);
    } catch (error) {
      if (error instanceof ProjectNotFoundOrForbiddenError) return null;
      throw error;
    }
    return checkpoint;
  }

  async restoreCheckpoint(checkpointId: string, userId: string): Promise<Overlay[] | null> {
    const checkpoint = await this.getCheckpoint(checkpointId, userId);
    if (!checkpoint) return null;
    return assetResolver.resolveProjectAssets(checkpoint.overlays ?? []);
  }

  async restoreProjectCheckpoint(
    checkpointId: string,
    userId: string,
    options: RestoreProjectCheckpointOptions,
  ): Promise<RestoreProjectCheckpointResult> {
    const checkpoint = await this.getCheckpoint(checkpointId, userId, options.projectId);
    if (!checkpoint) {
      return { restored: false, checkpointId, expectedStateHash: '', reason: 'checkpoint-not-found' };
    }

    // An overlay-only legacy checkpoint cannot restore timing, dimensions, metadata,
    // or asset references exactly. Fail closed instead of claiming a partial undo or
    // unsetting fields that the checkpoint never captured.
    if (!checkpoint.projectState) {
      return {
        restored: false,
        checkpointId,
        expectedStateHash: checkpoint.stateHash ?? '',
        reason: 'legacy-overlay-only-checkpoint',
      };
    }
    if (!checkpoint.projectState.presentFields.includes('generatedCompositions')) {
      return {
        restored: false,
        checkpointId,
        expectedStateHash: checkpoint.stateHash ?? '',
        reason: 'legacy-checkpoint-missing-generated-composition-state',
      };
    }

    const projectState = this.cleanProjectState(
      cloneValue(checkpoint.projectState),
    );
    const expectedStateHash = projectStateFingerprint(projectState);
    if (
      checkpoint.stateHashVersion === CURRENT_STATE_HASH_VERSION
      && checkpoint.stateHash
      && checkpoint.stateHash !== expectedStateHash
    ) {
      return {
        restored: false,
        checkpointId,
        expectedStateHash: checkpoint.stateHash,
        actualStateHash: expectedStateHash,
        reason: 'checkpoint-state-hash-mismatch',
      };
    }
    const setFields: Record<string, unknown> = {};
    const unsetFields: string[] = [];

    for (const field of CHAT_RESTORABLE_PROJECT_FIELDS) {
      if (projectState.presentFields.includes(field)) {
        setFields[field] = cloneValue(projectState.fields[field]);
      } else {
        unsetFields.push(field);
      }
    }

    let restoreReceipt;
    try {
      restoreReceipt = await projectService.restoreCheckpointState(
        userId,
        checkpoint.projectId,
        {
          checkpointId,
          actorKind: options.actorKind,
          expectedRevision: options.expectedRevision,
          setFields,
          unsetFields,
        },
      );
    } catch (error) {
      if (error instanceof ProjectMutationConflictError) {
        return {
          restored: false,
          checkpointId,
          expectedStateHash,
          reason: 'project-revision-conflict',
          beforeRevision: options.expectedRevision,
          currentRevision: error.currentRevision,
        };
      }
      if (error instanceof ProjectNotFoundOrForbiddenError) {
        return {
          restored: false,
          checkpointId,
          expectedStateHash,
          reason: 'project-not-found-or-not-owned',
          beforeRevision: options.expectedRevision,
        };
      }
      throw error;
    }

    const actualState = this.cleanProjectState(
      captureRestorableProjectState(restoreReceipt.project),
    );
    const actualStateHash = projectStateFingerprint(actualState);
    if (actualStateHash !== expectedStateHash) {
      return {
        restored: false,
        checkpointId,
        expectedStateHash,
        actualStateHash,
        reason: 'state-fingerprint-mismatch',
        beforeRevision: options.expectedRevision,
        restoredRevision: restoreReceipt.receipt.revision,
      };
    }
    return {
      restored: true,
      checkpointId,
      expectedStateHash,
      actualStateHash,
      beforeRevision: options.expectedRevision,
      restoredRevision: restoreReceipt.receipt.revision,
    };
  }

  async clearCheckpoints(sessionId: string, userId: string, projectId: string): Promise<void> {
    const scope = checkpointScope(sessionId, userId, projectId);
    await projectService.getProjectRevision(scope.userId, scope.projectId);
    const db = await getDatabase();
    await db.collection(COLLECTIONS.CHECKPOINTS).deleteMany(scope);
  }

  async pruneCheckpoints(sessionId: string, userId: string, projectId: string, keepLast = 50): Promise<void> {
    const scope = checkpointScope(sessionId, userId, projectId);
    await projectService.getProjectRevision(scope.userId, scope.projectId);
    if (!Number.isSafeInteger(keepLast) || keepLast < 0) {
      throw new Error('keepLast must be a non-negative integer.');
    }
    const db = await getDatabase();
    const checkpoints = await db
      .collection(COLLECTIONS.CHECKPOINTS)
      .find(scope)
      .sort({ timestamp: -1 })
      .skip(keepLast)
      .toArray();

    if (checkpoints.length > 0) {
      await db.collection(COLLECTIONS.CHECKPOINTS).deleteMany({
        ...scope,
        _id: { $in: checkpoints.map((checkpoint) => checkpoint._id) },
      });
    }
  }

  private cleanProjectState(state: RestorableProjectState): RestorableProjectState {
    const fields = cloneValue(state.fields);
    const rawOverlays = Array.isArray(fields.overlays) ? fields.overlays as Overlay[] : [];
    fields.overlays = assetResolver.stripUrlsForLLM(rawOverlays);
    const presentFields = Array.from(new Set<ChatRestorableProjectField>([
      'overlays',
      'generatedCompositions',
      ...state.presentFields,
    ]));
    if (!state.presentFields.includes('generatedCompositions')) {
      fields.generatedCompositions = [];
    }
    return mongoStableValue({ presentFields, fields });
  }
}

function checkpointScope(sessionId: string, userId?: string, projectId?: string): {
  sessionId: string;
  userId: string;
  projectId: string;
} {
  if (!sessionId || !userId || !projectId) {
    throw new Error('Checkpoint operations require sessionId, projectId, and authenticated userId.');
  }
  return { sessionId, userId, projectId };
}

function checkpointStateHash(checkpoint: Checkpoint): string {
  if (checkpoint.stateHash) return checkpoint.stateHash;
  return projectStateFingerprint(
    checkpoint.projectState ?? captureRestorableProjectState({ overlays: checkpoint.overlays ?? [] }),
  );
}

function rollbackReceiptFor(
  checkpoint: Checkpoint,
  receiptId: string,
): CheckpointRollbackReceiptV1 | null {
  const receipt = checkpoint.rollbackReceipts?.find((candidate) => candidate.receiptId === receiptId);
  if (!receipt || receipt.schemaVersion !== 1 || !isProjectRevisionV1(receipt.expectedRevision)) {
    return null;
  }
  return receipt;
}

function assertRollbackReceiptId(receiptId: string): void {
  if (!receiptId || receiptId.trim() !== receiptId || receiptId.length > 200) {
    throw new Error('A non-empty rollback receiptId is required.');
  }
}

function isProjectRevisionV1(value: unknown): value is ProjectRevisionV1 {
  if (!value || typeof value !== 'object') return false;
  const revision = value as ProjectRevisionV1;
  return revision.schemaVersion === 1
    && Number.isSafeInteger(revision.value)
    && revision.value >= 0
    && typeof revision.compatibilityUpdatedAt === 'string'
    && !Number.isNaN(new Date(revision.compatibilityUpdatedAt).getTime());
}

function revisionFromWriterReceipt(
  receipt: ProjectMutationReceiptV1,
  projectId: string,
): ProjectRevisionV1 {
  if (
    receipt.schemaVersion !== 1
    || receipt.projectId !== projectId
    || !isProjectRevisionV1(receipt.revision)
    || typeof receipt.committedAt !== 'string'
    || Number.isNaN(new Date(receipt.committedAt).getTime())
  ) {
    throw new Error('Rollback writer receipt is invalid or belongs to another project.');
  }
  return cloneValue(receipt.revision);
}

function sameProjectRevision(
  left: ProjectRevisionV1,
  right: ProjectRevisionV1,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

function mongoStableValue<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : mongoStableValue(item),
    ) as T;
  }
  if (value && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      normalized[key] = mongoStableValue(item);
    }
    return normalized as T;
  }
  return value;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: number }).code === 11000);
}

export const checkpointService = new CheckpointService();
