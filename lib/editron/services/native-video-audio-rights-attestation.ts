import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { withAtomicOverlayUpdateReceipt } from '@/lib/editron/engine/overlay-atomic-receipts';
import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import type {
  ProjectMutationReceiptV1,
  ProjectRevisionV1,
} from './project-service';
import {
  buildNativeVideoAudioRights,
  readNativeVideoAudioRightsClaim,
  readStoredNativeVideoAudioRights,
} from './native-video-audio-rights';

type UnknownRecord = Record<string, unknown>;

export type NativeVideoAudioRightsAttestationErrorCode =
  | 'INVALID_REQUEST'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_OWNER_REQUIRED'
  | 'PROJECT_TIMELINE_INVALID'
  | 'SOURCE_ASSET_NOT_ATTESTABLE'
  | 'PROJECT_REVISION_CONFLICT'
  | 'ATTESTATION_PERSISTENCE_FAILED';

export class NativeVideoAudioRightsAttestationError extends Error {
  constructor(
    readonly code: NativeVideoAudioRightsAttestationErrorCode,
    message: string,
    readonly httpStatus: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NativeVideoAudioRightsAttestationError';
  }
}

export interface NativeVideoAudioRightsAttestationInput {
  userId: string;
  projectId: string;
  attestation: unknown;
}

export interface NativeVideoAudioRightsAttestationCommit {
  userId: string;
  projectId: string;
  expectedRevision: ProjectRevisionV1;
  updatedAt: Date;
  overlays: Array<Record<string, unknown>>;
  rightsByAssetId: Record<string, AudioRightsContract>;
}

export interface NativeVideoAudioRightsAttestationDependencies {
  loadProjectForMutation(
    userId: string,
    projectId: string,
  ): Promise<{ project: unknown; revision: ProjectRevisionV1 }>;
  loadAssets(assetIds: string[]): Promise<Array<Record<string, unknown>>>;
  commit(input: NativeVideoAudioRightsAttestationCommit): Promise<{
    committed: boolean;
    receipt?: ProjectMutationReceiptV1;
  }>;
  now(): Date;
}

export interface NativeVideoAudioRightsAttestationResult {
  replayed: boolean;
  attestedAssetIds: string[];
  rightsByAssetId: Record<string, AudioRightsContract>;
  projectMutationReceipt?: ProjectMutationReceiptV1;
}

const defaultDependencies: NativeVideoAudioRightsAttestationDependencies = {
  async loadProjectForMutation(userId, projectId) {
    const { projectService } = await import('./project-service');
    return projectService.loadProjectForMutation(userId, projectId);
  },
  async loadAssets(assetIds) {
    if (assetIds.length === 0) return [];
    const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    return db.collection(COLLECTIONS.MEDIA_ASSETS)
      .find({ assetId: { $in: assetIds } })
      .toArray() as Promise<Array<Record<string, unknown>>>;
  },
  async commit(input) {
    const { projectService } = await import('./project-service');
    const receipt = await projectService.commitAudioRightsAttestation(
      input.userId,
      input.projectId,
      {
        kind: 'native-video',
        expectedRevision: input.expectedRevision,
        updatedAt: input.updatedAt,
        overlays: input.overlays as Overlay[],
        rightsByAssetId: input.rightsByAssetId,
      },
    );
    return receipt
      ? { committed: true, receipt }
      : { committed: false };
  },
  now: () => new Date(),
};

export async function reattestNativeVideoAudioRights(
  rawInput: NativeVideoAudioRightsAttestationInput,
  dependencyOverrides: Partial<NativeVideoAudioRightsAttestationDependencies> = {},
): Promise<NativeVideoAudioRightsAttestationResult> {
  const input = validateInput(rawInput);
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const mutationTarget = await dependencies.loadProjectForMutation(
    input.userId,
    input.projectId,
  );
  const project = asRecord(mutationTarget.project);
  if (!project) {
    throw attestationError('PROJECT_NOT_FOUND', 'Project not found', 404);
  }
  if (nonEmptyString(project.userId) !== input.userId) {
    throw attestationError(
      'PROJECT_OWNER_REQUIRED',
      'Only the project owner can confirm source-media rights',
      403,
    );
  }
  if (!Array.isArray(project.overlays)) {
    throw attestationError(
      'PROJECT_TIMELINE_INVALID',
      'Project timeline is missing or malformed',
      500,
    );
  }
  const overlays = project.overlays.flatMap((value) => {
    const overlay = asRecord(value);
    return overlay ? [overlay] : [];
  });
  const targetAssetIds = Array.from(new Set(overlays.flatMap((overlay) => {
    if (
      overlay.type !== 'video'
      || overlay.hasNativeAudio !== true
      || readNativeVideoAudioRightsClaim(overlay)
    ) {
      return [];
    }
    const assetId = nonEmptyString(overlay.assetId);
    if (!assetId) {
      throw attestationError(
        'SOURCE_ASSET_NOT_ATTESTABLE',
        `Native-audio video overlay ${String(overlay.id ?? 'unknown')} has no source asset`,
        422,
      );
    }
    return [assetId];
  })));
  if (targetAssetIds.length === 0) {
    return { replayed: true, attestedAssetIds: [], rightsByAssetId: {} };
  }

  const assets = await dependencies.loadAssets(targetAssetIds);
  const assetsById = new Map(assets.flatMap((asset) => {
    const assetId = nonEmptyString(asset.assetId);
    return assetId ? [[assetId, asset] as const] : [];
  }));
  const attestedAt = dependencies.now();
  const rightsByAssetId: Record<string, AudioRightsContract> = {};

  for (const assetId of targetAssetIds) {
    const asset = assetsById.get(assetId);
    if (
      !asset
      || asset.type !== 'video'
      || asset.source !== 'user-upload'
      || (
        nonEmptyString(asset.userId) !== input.userId
        && nonEmptyString(asset.projectId) !== input.projectId
      )
    ) {
      throw attestationError(
        'SOURCE_ASSET_NOT_ATTESTABLE',
        `Source video ${assetId} is missing, generated, or outside this project`,
        422,
      );
    }
    rightsByAssetId[assetId] = readStoredNativeVideoAudioRights(asset)
      ?? buildNativeVideoAudioRights({
        sourceAssetId: assetId,
        userId: input.userId,
        attestation: input.attestation,
        attestedAt,
      });
  }

  const updatedOverlays = overlays.map((overlay) => {
    const assetId = nonEmptyString(overlay.assetId);
    const audioRights = assetId ? rightsByAssetId[assetId] : undefined;
    if (!audioRights) return overlay;
    return withAtomicOverlayUpdateReceipt(
      overlay as Overlay,
      { audioRights } as Partial<Overlay>,
      {
        source: 'native-video-audio-rights-attestation',
        intent: 'confirm-native-video-audio-rights',
        reason: 'project owner explicitly confirmed source-media export rights',
      },
    ) as unknown as Record<string, unknown>;
  });
  let commitResult: { committed: boolean; receipt?: ProjectMutationReceiptV1 };
  try {
    commitResult = await dependencies.commit({
      userId: input.userId,
      projectId: input.projectId,
      expectedRevision: mutationTarget.revision,
      updatedAt: attestedAt,
      overlays: updatedOverlays,
      rightsByAssetId,
    });
  } catch (error) {
    throw attestationError(
      'ATTESTATION_PERSISTENCE_FAILED',
      'Source-media rights could not be stored',
      isProjectMutationWriteError(error) ? 409 : 500,
      error,
    );
  }
  if (!commitResult.committed) {
    throw attestationError(
      'PROJECT_REVISION_CONFLICT',
      'The project changed while rights were being confirmed. Review the latest timeline and retry.',
      409,
    );
  }

  return {
    replayed: false,
    attestedAssetIds: targetAssetIds,
    rightsByAssetId,
    ...(commitResult.receipt
      ? { projectMutationReceipt: commitResult.receipt }
      : {}),
  };
}

function validateInput(
  input: NativeVideoAudioRightsAttestationInput,
): NativeVideoAudioRightsAttestationInput {
  const userId = nonEmptyString(input?.userId);
  const projectId = nonEmptyString(input?.projectId);
  if (!userId || !projectId) {
    throw attestationError(
      'INVALID_REQUEST',
      'userId and projectId are required',
      400,
    );
  }
  return { ...input, userId, projectId };
}

function attestationError(
  code: NativeVideoAudioRightsAttestationErrorCode,
  message: string,
  httpStatus: number,
  cause?: unknown,
): NativeVideoAudioRightsAttestationError {
  return new NativeVideoAudioRightsAttestationError(
    code,
    message,
    httpStatus,
    cause === undefined ? undefined : { cause },
  );
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isProjectMutationWriteError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ProjectMutationWriteError';
}
