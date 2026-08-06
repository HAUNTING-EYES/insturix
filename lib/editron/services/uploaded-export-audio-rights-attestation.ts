import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { withAtomicOverlayUpdateReceipt } from '@/lib/editron/engine/overlay-atomic-receipts';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import {
  AUDIO_RIGHTS_ATTESTATION_VERSION,
  isSoundOverlayWithRenderableSource,
  type AudioRightsContract,
} from '@/lib/editron/shared/render-request-payload';

type UnknownRecord = Record<string, unknown>;
type AttestableAudioRole = 'voiceover' | 'dubbing' | 'sfx' | 'other';

export const CURRENT_UPLOADED_EXPORT_AUDIO_RIGHTS_ATTESTATION = Object.freeze({
  accepted: true as const,
  version: AUDIO_RIGHTS_ATTESTATION_VERSION,
});

export type UploadedExportAudioRightsAttestationErrorCode =
  | 'INVALID_REQUEST'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_OWNER_REQUIRED'
  | 'PROJECT_TIMELINE_INVALID'
  | 'SOURCE_ASSET_NOT_ATTESTABLE'
  | 'CONFLICTING_AUDIO_ROLES'
  | 'PROJECT_REVISION_CONFLICT'
  | 'ATTESTATION_PERSISTENCE_FAILED';

export class UploadedExportAudioRightsAttestationError extends Error {
  constructor(
    readonly code: UploadedExportAudioRightsAttestationErrorCode,
    message: string,
    readonly httpStatus: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'UploadedExportAudioRightsAttestationError';
  }
}

export interface UploadedExportAudioRightsAttestationInput {
  userId: string;
  projectId: string;
  attestation: unknown;
}

interface StoryboardUpdate {
  storyboardId: string;
  scenes: unknown[];
}

export interface UploadedExportAudioRightsAttestationCommit {
  userId: string;
  projectId: string;
  expectedUpdatedAt: Date;
  updatedAt: Date;
  overlays: UnknownRecord[];
  rightsByAssetId: Record<string, AudioRightsContract>;
  storyboardUpdates: StoryboardUpdate[];
}

export interface UploadedExportAudioRightsAttestationDependencies {
  loadProject(userId: string, projectId: string): Promise<unknown | null>;
  loadAssets(assetIds: string[]): Promise<UnknownRecord[]>;
  loadStoryboards(userId: string, projectId: string): Promise<UnknownRecord[]>;
  commit(input: UploadedExportAudioRightsAttestationCommit): Promise<boolean>;
  now(): Date;
}

export interface UploadedExportAudioRightsAttestationResult {
  replayed: boolean;
  attestedAssetIds: string[];
  rightsByAssetId: Record<string, AudioRightsContract>;
}

const defaultDependencies: UploadedExportAudioRightsAttestationDependencies = {
  async loadProject(userId, projectId) {
    const { projectService } = await import('./project-service');
    return projectService.loadProject(userId, projectId);
  },
  async loadAssets(assetIds) {
    if (assetIds.length === 0) return [];
    const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    return db.collection(COLLECTIONS.MEDIA_ASSETS)
      .find({ assetId: { $in: assetIds } })
      .toArray() as Promise<UnknownRecord[]>;
  },
  async loadStoryboards(userId, projectId) {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    return db.collection('storyboards')
      .find({ userId, projectId })
      .toArray() as Promise<UnknownRecord[]>;
  },
  async commit(input) {
    const { COLLECTIONS, connectToDatabase } = await import('@/lib/editron/db/mongodb');
    const { assetResolver } = await import('./asset-resolver');
    const { client, db } = await connectToDatabase();
    const session = client.startSession();
    let committed = false;

    try {
      await session.withTransaction(async () => {
        const assetOperations = Object.entries(input.rightsByAssetId).map(
          ([assetId, audioRights]) => ({
            updateOne: {
              filter: {
                assetId,
                type: 'audio',
                source: 'user-upload',
                audioRights: { $exists: false },
                musicRights: { $exists: false },
                $or: [
                  { userId: input.userId },
                  { projectId: input.projectId },
                ],
              },
              update: {
                $set: {
                  audioRights,
                  rightsUpdatedAt: input.updatedAt,
                },
              },
            },
          }),
        );
        const assetResult = await db.collection(COLLECTIONS.MEDIA_ASSETS)
          .bulkWrite(assetOperations, { ordered: true, session });
        if (assetResult.matchedCount !== assetOperations.length) {
          throw attestationError(
            'ATTESTATION_PERSISTENCE_FAILED',
            'One or more uploaded audio assets changed before rights could be stored',
            409,
          );
        }

        for (const storyboard of input.storyboardUpdates) {
          const result = await db.collection('storyboards').updateOne(
            {
              storyboardId: storyboard.storyboardId,
              userId: input.userId,
              projectId: input.projectId,
            },
            {
              $set: {
                scenes: storyboard.scenes,
                updatedAt: input.updatedAt,
              },
            },
            { session },
          );
          if (result.matchedCount !== 1) {
            throw attestationError(
              'ATTESTATION_PERSISTENCE_FAILED',
              'A linked storyboard changed before audio rights could be stored',
              409,
            );
          }
        }

        const cleanOverlays = assetResolver.stripUrlsForLLM(
          input.overlays as unknown as Overlay[],
        );
        const projectResult = await db.collection(COLLECTIONS.PROJECTS).updateOne(
          {
            projectId: input.projectId,
            userId: input.userId,
            updatedAt: input.expectedUpdatedAt,
          },
          {
            $set: {
              overlays: cleanOverlays,
              updatedAt: input.updatedAt,
            },
          },
          { session },
        );
        if (projectResult.matchedCount !== 1) {
          throw attestationError(
            'PROJECT_REVISION_CONFLICT',
            'The project changed while audio rights were being confirmed. Review the latest timeline and retry.',
            409,
          );
        }
        committed = true;
      });
    } finally {
      await session.endSession();
    }

    return committed;
  },
  now: () => new Date(),
};

export async function reattestUploadedExportAudioRights(
  rawInput: UploadedExportAudioRightsAttestationInput,
  dependencyOverrides: Partial<UploadedExportAudioRightsAttestationDependencies> = {},
): Promise<UploadedExportAudioRightsAttestationResult> {
  const input = validateInput(rawInput);
  validateAttestation(input.attestation);
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const project = asRecord(
    await dependencies.loadProject(input.userId, input.projectId),
  );
  if (!project) {
    throw attestationError('PROJECT_NOT_FOUND', 'Project not found', 404);
  }
  if (nonEmptyString(project.userId) !== input.userId) {
    throw attestationError(
      'PROJECT_OWNER_REQUIRED',
      'Only the project owner can confirm uploaded audio rights',
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
  const expectedUpdatedAt = validDate(project.updatedAt);
  if (!expectedUpdatedAt) {
    throw attestationError(
      'PROJECT_TIMELINE_INVALID',
      'Project revision metadata is missing or malformed',
      500,
    );
  }

  const overlays = project.overlays.flatMap((value) => {
    const overlay = asRecord(value);
    return overlay ? [overlay] : [];
  });
  const rolesByAssetId = new Map<string, Set<AttestableAudioRole>>();
  for (const overlay of overlays) {
    const candidate = readAttestableSoundCandidate(overlay);
    if (!candidate) continue;
    const roles = rolesByAssetId.get(candidate.assetId) ?? new Set();
    roles.add(candidate.mediaRole);
    rolesByAssetId.set(candidate.assetId, roles);
  }
  if (rolesByAssetId.size === 0) {
    return { replayed: true, attestedAssetIds: [], rightsByAssetId: {} };
  }

  for (const [assetId, roles] of rolesByAssetId) {
    if (roles.size > 1) {
      throw attestationError(
        'CONFLICTING_AUDIO_ROLES',
        `Uploaded audio ${assetId} is used with conflicting export roles`,
        422,
      );
    }
  }

  const assetIds = Array.from(rolesByAssetId.keys());
  const assets = await dependencies.loadAssets(assetIds);
  const assetsById = new Map(assets.flatMap((asset) => {
    const assetId = nonEmptyString(asset.assetId);
    return assetId ? [[assetId, asset] as const] : [];
  }));
  const attestedAt = dependencies.now();
  const rightsByAssetId: Record<string, AudioRightsContract> = {};

  for (const assetId of assetIds) {
    const asset = assetsById.get(assetId);
    if (
      !asset
      || asset.type !== 'audio'
      || asset.source !== 'user-upload'
      || asset.audioRights !== undefined
      || asset.musicRights !== undefined
      || (
        nonEmptyString(asset.userId) !== input.userId
        && nonEmptyString(asset.projectId) !== input.projectId
      )
    ) {
      throw attestationError(
        'SOURCE_ASSET_NOT_ATTESTABLE',
        `Uploaded audio ${assetId} is missing, already claimed, or outside this project`,
        422,
      );
    }
    rightsByAssetId[assetId] = buildUploadedAudioRights({
      assetId,
      userId: input.userId,
      mediaRole: Array.from(rolesByAssetId.get(assetId) ?? [])[0] ?? 'other',
      attestedAt,
    });
  }

  const updatedOverlays = overlays.map((overlay) => {
    const assetId = nonEmptyString(overlay.assetId);
    const audioRights = assetId ? rightsByAssetId[assetId] : undefined;
    if (!audioRights) return overlay;
    return withAtomicOverlayUpdateReceipt(
      overlay as unknown as Overlay,
      { audioRights } as Partial<Overlay>,
      {
        source: 'uploaded-export-audio-rights-attestation',
        intent: 'confirm-uploaded-export-audio-rights',
        reason: 'project owner explicitly confirmed export rights for uploaded audio',
      },
    ) as unknown as UnknownRecord;
  });
  const storyboards = await dependencies.loadStoryboards(input.userId, input.projectId);
  const storyboardUpdates = buildStoryboardUpdates(storyboards, rightsByAssetId);
  const committed = await dependencies.commit({
    userId: input.userId,
    projectId: input.projectId,
    expectedUpdatedAt,
    updatedAt: attestedAt,
    overlays: updatedOverlays,
    rightsByAssetId,
    storyboardUpdates,
  });
  if (!committed) {
    throw attestationError(
      'PROJECT_REVISION_CONFLICT',
      'The project changed while audio rights were being confirmed. Review the latest timeline and retry.',
      409,
    );
  }

  return {
    replayed: false,
    attestedAssetIds: assetIds,
    rightsByAssetId,
  };
}

function readAttestableSoundCandidate(overlay: UnknownRecord): {
  assetId: string;
  mediaRole: AttestableAudioRole;
} | null {
  if (
    overlay.type !== 'sound'
    || !isSoundOverlayWithRenderableSource(overlay)
    || overlay.audioRights !== undefined
    || overlay.musicRights !== undefined
  ) {
    return null;
  }
  const assetId = nonEmptyString(overlay.assetId);
  if (!assetId) {
    throw attestationError(
      'SOURCE_ASSET_NOT_ATTESTABLE',
      `Sound overlay ${String(overlay.id ?? 'unknown')} has no stored source asset`,
      422,
    );
  }
  const mediaRole = resolveAttestableAudioRole(overlay);
  // Music must use the dedicated BGM assignment flow so reference-only songs
  // cannot become exportable through this generic consent path.
  if (mediaRole === 'music') return null;
  return { assetId, mediaRole };
}

function resolveAttestableAudioRole(
  overlay: UnknownRecord,
): AttestableAudioRole | 'music' {
  const explicitRole = nonEmptyString(overlay.mediaRole)
    ?? nonEmptyString(overlay.audioRole);
  if (
    explicitRole === 'voiceover'
    || explicitRole === 'dubbing'
    || explicitRole === 'sfx'
    || explicitRole === 'other'
    || explicitRole === 'music'
  ) {
    return explicitRole;
  }
  const metadata = asRecord(overlay.metadata);
  const assetId = nonEmptyString(overlay.assetId) ?? '';
  if (metadata?.isDubbingVoiceover === true) return 'dubbing';
  if (overlay.row === ROW.VOICEOVER || /^(voiceover_|vo_)/i.test(assetId)) {
    return 'voiceover';
  }
  if (overlay.row === ROW.BGM || /^bgm_/i.test(assetId)) return 'music';
  if (overlay.row === ROW.SFX) return 'sfx';
  return 'other';
}

function buildUploadedAudioRights(input: {
  assetId: string;
  userId: string;
  mediaRole: AttestableAudioRole;
  attestedAt: Date;
}): AudioRightsContract {
  if (!Number.isFinite(input.attestedAt.getTime())) {
    throw attestationError(
      'INVALID_REQUEST',
      'Uploaded audio rights require a valid server attestation time',
      400,
    );
  }
  return {
    mediaRole: input.mediaRole,
    source: 'user-upload',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'user-attestation',
      sourceAssetId: input.assetId,
      attestationVersion: AUDIO_RIGHTS_ATTESTATION_VERSION,
      attestedAt: input.attestedAt.toISOString(),
      attestedBy: input.userId,
    },
  };
}

function buildStoryboardUpdates(
  storyboards: UnknownRecord[],
  rightsByAssetId: Record<string, AudioRightsContract>,
): StoryboardUpdate[] {
  return storyboards.flatMap((storyboard) => {
    const storyboardId = nonEmptyString(storyboard.storyboardId);
    if (!storyboardId || !Array.isArray(storyboard.scenes)) return [];
    let changed = false;
    const scenes = storyboard.scenes.map((value) => {
      const scene = asRecord(value);
      const voiceover = asRecord(scene?.voiceover);
      const assetId = nonEmptyString(voiceover?.audioAssetId);
      const audioRights = assetId ? rightsByAssetId[assetId] : undefined;
      if (!scene || !voiceover || !audioRights) return value;
      changed = true;
      return {
        ...scene,
        voiceover: {
          ...voiceover,
          audioRights,
        },
      };
    });
    return changed ? [{ storyboardId, scenes }] : [];
  });
}

function validateInput(
  input: UploadedExportAudioRightsAttestationInput,
): UploadedExportAudioRightsAttestationInput {
  const userId = nonEmptyString(input?.userId);
  const projectId = nonEmptyString(input?.projectId);
  if (!userId || !projectId) {
    throw attestationError('INVALID_REQUEST', 'userId and projectId are required', 400);
  }
  return { ...input, userId, projectId };
}

function validateAttestation(value: unknown): void {
  const attestation = asRecord(value);
  if (
    attestation?.accepted !== true
    || attestation.version !== AUDIO_RIGHTS_ATTESTATION_VERSION
  ) {
    throw attestationError(
      'INVALID_REQUEST',
      'Confirm that you own or have permission to use the uploaded audio in exports',
      400,
    );
  }
}

function attestationError(
  code: UploadedExportAudioRightsAttestationErrorCode,
  message: string,
  httpStatus: number,
  cause?: unknown,
): UploadedExportAudioRightsAttestationError {
  return new UploadedExportAudioRightsAttestationError(
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

function validDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) ? date : null;
}
