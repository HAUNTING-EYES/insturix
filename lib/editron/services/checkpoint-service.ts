/**
 * Checkpoint service for editor state and durable AI edit transactions.
 */

import { createHash } from 'crypto';
import { nanoid } from 'nanoid';

import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

import { getDatabase, COLLECTIONS } from '../db/mongodb';
import { assetResolver } from './asset-resolver';

export type CheckpointType = 'initial' | 'before-llm' | 'after-llm' | 'user-edit';
export type ChatEditOperationStatus = 'running' | 'completed' | 'no-op' | 'rolled-back' | 'failed';

// Only editor-owned/user-visible fields belong in an AI edit restore boundary.
// Worker locks, billing, ownership, timestamps, and immutable IDs are deliberately excluded.
export const CHAT_RESTORABLE_PROJECT_FIELDS = [
  'overlays',
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
    const db = await getDatabase();
    const cleanState = this.cleanProjectState(
      input.projectState ?? captureRestorableProjectState({ overlays: input.overlays }),
    );
    const stateHash = projectStateFingerprint(cleanState);

    if (!input.force) {
      const lastCheckpoint = await db
        .collection(COLLECTIONS.CHECKPOINTS)
        .find({ sessionId: input.sessionId })
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray() as unknown as Checkpoint[];

      if (lastCheckpoint.length > 0 && checkpointStateHash(lastCheckpoint[0]) === stateHash) {
        console.log(`[CHECKPOINT] Skipped "${input.description}" - no state changes detected`);
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
      operationId: input.operationId,
      operationStatus: input.operationStatus,
      timestamp: now,
      description: input.description,
      type: input.type,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection<Checkpoint>(COLLECTIONS.CHECKPOINTS).insertOne(checkpoint);
    console.log(`[CHECKPOINT] Created "${input.description}" (${input.type})`);
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
      const existing = await this.getCheckpoint(input.checkpointId, input.userId);
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
    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.CHECKPOINTS).updateOne(
      { checkpointId, userId, operationId },
      { $set: { ...update, updatedAt: new Date() } },
    );
    if (result.matchedCount !== 1) {
      throw new Error(`Chat edit operation checkpoint ${checkpointId} could not be updated.`);
    }
  }

  async getCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    const db = await getDatabase();
    return db
      .collection(COLLECTIONS.CHECKPOINTS)
      .find({ sessionId })
      .sort({ timestamp: 1 })
      .toArray() as unknown as Checkpoint[];
  }

  async getCheckpoint(checkpointId: string, userId: string): Promise<Checkpoint | null> {
    const db = await getDatabase();
    return db.collection(COLLECTIONS.CHECKPOINTS)
      .findOne({ checkpointId, userId }) as unknown as Checkpoint | null;
  }

  async restoreCheckpoint(checkpointId: string, userId: string): Promise<Overlay[] | null> {
    const checkpoint = await this.getCheckpoint(checkpointId, userId);
    if (!checkpoint) return null;
    return assetResolver.resolveProjectAssets(checkpoint.overlays ?? []);
  }

  async restoreProjectCheckpoint(
    checkpointId: string,
    userId: string,
  ): Promise<RestoreProjectCheckpointResult> {
    const checkpoint = await this.getCheckpoint(checkpointId, userId);
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
    const unsetFields: Record<string, ''> = {};

    for (const field of CHAT_RESTORABLE_PROJECT_FIELDS) {
      if (projectState.presentFields.includes(field)) {
        setFields[field] = cloneValue(projectState.fields[field]);
      } else {
        unsetFields[field] = '';
      }
    }

    const db = await getDatabase();
    const update: Record<string, unknown> = { $set: { ...setFields, updatedAt: new Date() } };
    if (Object.keys(unsetFields).length > 0) update.$unset = unsetFields;

    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId: checkpoint.projectId, userId },
      update,
    );
    if (result.matchedCount !== 1) {
      return {
        restored: false,
        checkpointId,
        expectedStateHash,
        reason: 'project-not-found-or-not-owned',
      };
    }

    const restoredProject = await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId: checkpoint.projectId,
      userId,
    });
    if (!restoredProject) {
      return {
        restored: false,
        checkpointId,
        expectedStateHash,
        reason: 'project-missing-after-restore',
      };
    }

    const actualState = this.cleanProjectState(
      captureRestorableProjectState(restoredProject as Record<string, unknown>),
    );
    const actualStateHash = projectStateFingerprint(actualState);
    return {
      restored: actualStateHash === expectedStateHash,
      checkpointId,
      expectedStateHash,
      actualStateHash,
      reason: actualStateHash === expectedStateHash ? undefined : 'state-fingerprint-mismatch',
    };
  }

  async clearCheckpoints(sessionId: string): Promise<void> {
    const db = await getDatabase();
    await db.collection(COLLECTIONS.CHECKPOINTS).deleteMany({ sessionId });
  }

  async pruneCheckpoints(sessionId: string, keepLast = 50): Promise<void> {
    const db = await getDatabase();
    const checkpoints = await db
      .collection(COLLECTIONS.CHECKPOINTS)
      .find({ sessionId })
      .sort({ timestamp: -1 })
      .skip(keepLast)
      .toArray();

    if (checkpoints.length > 0) {
      await db.collection(COLLECTIONS.CHECKPOINTS).deleteMany({
        _id: { $in: checkpoints.map((checkpoint) => checkpoint._id) },
      });
      console.log(`[CHECKPOINT] Pruned ${checkpoints.length} old checkpoints for session ${sessionId}`);
    }
  }

  private cleanProjectState(state: RestorableProjectState): RestorableProjectState {
    const fields = cloneValue(state.fields);
    const rawOverlays = Array.isArray(fields.overlays) ? fields.overlays as Overlay[] : [];
    fields.overlays = assetResolver.stripUrlsForLLM(rawOverlays);
    const presentFields = Array.from(new Set<ChatRestorableProjectField>(['overlays', ...state.presentFields]));
    return mongoStableValue({ presentFields, fields });
  }
}

function checkpointStateHash(checkpoint: Checkpoint): string {
  if (checkpoint.stateHash) return checkpoint.stateHash;
  return projectStateFingerprint(
    checkpoint.projectState ?? captureRestorableProjectState({ overlays: checkpoint.overlays ?? [] }),
  );
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
