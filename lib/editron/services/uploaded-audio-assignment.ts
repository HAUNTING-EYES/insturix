import { createHash } from 'node:crypto';

import {
  AUDIO_RIGHTS_ATTESTATION_VERSION,
  getAudioRightsContractIssue,
  type AudioRightsContract,
} from '@/lib/editron/shared/render-request-payload';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import type { SfxAcousticMeasurement } from '@/lib/pipeline/sfx-acoustic-measurement';
import type {
  ProjectMutationReceiptV1,
  ProjectRevisionV1,
  ProjectUploadedAudioAttachResultV1,
} from './project-service';

const ASSIGNMENT_VERSION = 'editron-uploaded-audio-assignment-v1';
const TIMELINE_ASSIGNMENT_VERSION = 'editron-uploaded-audio-timeline-v1';
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const ASSIGNABLE_ROLES = new Set<UploadedAudioMediaRole>([
  'sfx',
  'voiceover',
  'dubbing',
  'other',
]);

export type UploadedAudioMediaRole =
  | 'sfx'
  | 'voiceover'
  | 'dubbing'
  | 'other';

export type UploadedAudioAssignmentErrorCode =
  | 'INVALID_REQUEST'
  | 'PROJECT_NOT_FOUND'
  | 'ASSET_NOT_FOUND'
  | 'ASSET_ACCESS_DENIED'
  | 'ASSET_NOT_AUDIO'
  | 'ASSET_NOT_USER_UPLOAD'
  | 'ASSET_STORAGE_UNAVAILABLE'
  | 'RIGHTS_ATTESTATION_REQUIRED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'DERIVATIVE_PERSISTENCE_FAILED'
  | 'PROJECT_TIMELINE_INVALID'
  | 'PROJECT_REVISION_CONFLICT'
  | 'PROJECT_PERSISTENCE_FAILED'
  | 'SFX_AUDIO_REJECTED';

export class UploadedAudioAssignmentError extends Error {
  constructor(
    readonly code: UploadedAudioAssignmentErrorCode,
    message: string,
    readonly httpStatus: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'UploadedAudioAssignmentError';
  }
}

export interface UploadedAudioAssignmentInput {
  userId: string;
  projectId: string;
  sourceAssetId: string;
  mediaRole: UploadedAudioMediaRole;
  idempotencyKey: string;
  rightsAttestation?: {
    accepted: true;
    version: typeof AUDIO_RIGHTS_ATTESTATION_VERSION;
  };
}

export interface UploadedAudioAssignmentResult {
  replayed: boolean;
  sourceAssetId: string;
  derivativeAssetId: string;
  mediaRole: UploadedAudioMediaRole;
  audioRights: AudioRightsContract;
  audioUrl: string;
  duration?: number;
  sfxAcousticMeasurement?: SfxAcousticMeasurement;
}

export interface UploadedAudioTimelinePlacement {
  from: number;
  durationInFrames: number;
  requestedRow: number;
  startFromSound?: number;
}

export interface UploadedAudioTimelineAssignmentInput
  extends UploadedAudioAssignmentInput {
  displayName: string;
  placement: UploadedAudioTimelinePlacement;
}

export interface UploadedAudioTimelineAssignmentResult
  extends UploadedAudioAssignmentResult {
  overlayId: number;
  overlays: Array<Record<string, unknown>>;
  projectMutationReceipt?: ProjectMutationReceiptV1;
}

interface StoredAudioAsset extends Record<string, unknown> {
  assetId?: unknown;
  userId?: unknown;
  projectId?: unknown;
  type?: unknown;
  source?: unknown;
  filename?: unknown;
  contentType?: unknown;
  r2Key?: unknown;
  gcsPath?: unknown;
  cachedUrl?: unknown;
  urlExpiresAt?: unknown;
  size?: unknown;
  duration?: unknown;
  audioRights?: unknown;
  parentAssetId?: unknown;
  assignmentStatus?: unknown;
  audioAssignmentReceipt?: unknown;
  sfxAcousticMeasurement?: unknown;
}

interface AssignmentReceipt extends Record<string, unknown> {
  version?: unknown;
  idempotencyKey?: unknown;
  sourceAssetId?: unknown;
  derivativeAssetId?: unknown;
  mediaRole?: unknown;
  userId?: unknown;
  projectId?: unknown;
  attestedAt?: unknown;
}

export interface UploadedAudioAssignmentDependencies {
  loadProject(userId: string, projectId: string): Promise<unknown | null>;
  findAsset(assetId: string): Promise<StoredAudioAsset | null>;
  insertDerivativeAsset(document: Record<string, unknown>): Promise<boolean>;
  resolveReadUrl(
    asset: StoredAudioAsset,
    now: Date,
  ): Promise<{ url: string; expiresAt: Date }>;
  fetchSfxSourceBytes?: (url: string) => Promise<Buffer>;
  inspectSfxAudio?: (buffer: Buffer) => Promise<SfxAcousticMeasurement>;
  now(): Date;
}

export interface UploadedAudioTimelineAssignmentDependencies
  extends UploadedAudioAssignmentDependencies {
  loadProjectForTimelineMutation(
    userId: string,
    projectId: string,
  ): Promise<{ project: unknown; revision: ProjectRevisionV1 }>;
  commitTimelineOverlayThroughProjectService(
    userId: string,
    projectId: string,
    expectedRevision: ProjectRevisionV1,
    overlay: Record<string, unknown>,
  ): Promise<ProjectUploadedAudioAttachResultV1>;
}

const defaultDependencies: UploadedAudioAssignmentDependencies = {
  async loadProject(userId, projectId) {
    const { projectService } = await import('./project-service');
    return projectService.loadProject(userId, projectId);
  },
  async findAsset(assetId) {
    const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    return db.collection(COLLECTIONS.MEDIA_ASSETS).findOne({
      assetId,
    }) as Promise<StoredAudioAsset | null>;
  },
  async insertDerivativeAsset(document) {
    const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    try {
      const result = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        { assetId: document.assetId },
        { $setOnInsert: document },
        { upsert: true },
      );
      return result.upsertedCount === 1;
    } catch (error) {
      if (isDuplicateKeyError(error)) return false;
      throw error;
    }
  },
  async resolveReadUrl(asset, now) {
    const r2Key = nonEmptyString(asset.r2Key);
    if (r2Key) {
      const { getR2PresignedReadUrl } = await import('./r2-service');
      return {
        url: await getR2PresignedReadUrl(r2Key),
        expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
      };
    }
    const gcsPath = nonEmptyString(asset.gcsPath);
    if (gcsPath) {
      const { refreshSignedUrl } = await import('./gcs-service');
      const signed = await refreshSignedUrl(gcsPath);
      return { url: signed.url, expiresAt: signed.expiresAt };
    }
    const cachedUrl = validHttpUrl(asset.cachedUrl);
    const expiresAt = validDate(asset.urlExpiresAt);
    if (cachedUrl && expiresAt && expiresAt.getTime() > now.getTime()) {
      return { url: cachedUrl, expiresAt };
    }
    throw new Error('No refreshable or current storage URL exists');
  },
  async fetchSfxSourceBytes(url) {
    return defaultSfxFetch(url);
  },
  async inspectSfxAudio(buffer) {
    return defaultSfxInspect(buffer);
  },
  now: () => new Date(),
};

async function defaultSfxFetch(
  url: string,
): Promise<Buffer> {
  const { fetchUploadedAudioBytes } = await import(
    '@/lib/editron/services/media/verify-uploaded-audio'
  );
  return fetchUploadedAudioBytes(url);
}

async function defaultSfxInspect(
  buffer: Buffer,
): Promise<SfxAcousticMeasurement> {
  const { inspectEncodedSfxAudio } = await import('@/lib/pipeline/audio-conditioning');
  const { buildSfxAcousticMeasurement } = await import(
    '@/lib/pipeline/sfx-acoustic-measurement'
  );
  let inspection;
  try {
    inspection = await inspectEncodedSfxAudio(buffer);
  } catch (error) {
    throw new UploadedAudioAssignmentError(
      'SFX_AUDIO_REJECTED',
      `Uploaded SFX could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
      422,
      error instanceof Error ? error : undefined,
    );
  }
  if (!Number.isFinite(inspection.loudness.valueDb) || inspection.loudness.valueDb <= -60) {
    throw new UploadedAudioAssignmentError(
      'SFX_AUDIO_REJECTED',
      'Uploaded SFX is silent or below the loudness floor',
      422,
    );
  }
  if (inspection.truePeakDbtp > -1) {
    throw new UploadedAudioAssignmentError(
      'SFX_AUDIO_REJECTED',
      `Uploaded SFX exceeds the -1 dBTP ceiling (${inspection.truePeakDbtp.toFixed(1)} dBTP)`,
      422,
    );
  }
  if (inspection.sampleRate < 44_100) {
    throw new UploadedAudioAssignmentError(
      'SFX_AUDIO_REJECTED',
      `Uploaded SFX sample rate ${inspection.sampleRate} Hz is below the 44.1 kHz floor`,
      422,
    );
  }
  if (inspection.durationMs > 30_000) {
    throw new UploadedAudioAssignmentError(
      'SFX_AUDIO_REJECTED',
      `Uploaded SFX exceeds the 30s duration limit (${(inspection.durationMs / 1000).toFixed(1)}s)`,
      422,
    );
  }
  return buildSfxAcousticMeasurement(buffer, inspection);
}

const defaultTimelineDependencies: UploadedAudioTimelineAssignmentDependencies = {
  ...defaultDependencies,
  async loadProjectForTimelineMutation(userId, projectId) {
    const { projectService } = await import('./project-service');
    return projectService.loadProjectForMutation(userId, projectId);
  },
  async commitTimelineOverlayThroughProjectService(
    userId,
    projectId,
    expectedRevision,
    overlay,
  ) {
    const { projectService } = await import('./project-service');
    return projectService.attachUploadedAudioAtRevisionV1(userId, projectId, {
      expectedRevision,
      actorKind: 'USER',
      overlay: overlay as never,
    });
  },
};

export async function assignUploadedAudio(
  rawInput: UploadedAudioAssignmentInput,
  dependencyOverrides: Partial<UploadedAudioAssignmentDependencies> = {},
): Promise<UploadedAudioAssignmentResult> {
  const input = validateInput(rawInput);
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const project = await dependencies.loadProject(input.userId, input.projectId);
  if (!project) {
    throw assignmentError('PROJECT_NOT_FOUND', 'Project not found', 404);
  }

  const sourceAsset = await dependencies.findAsset(input.sourceAssetId);
  if (!sourceAsset) {
    throw assignmentError('ASSET_NOT_FOUND', 'Uploaded audio asset not found', 404);
  }
  assertSourceAsset(sourceAsset, input);

  const derivativeAssetId = buildDerivativeAssetId(input);
  const existing = await dependencies.findAsset(derivativeAssetId);
  if (existing) {
    return replayAssignment(existing, input, dependencies);
  }

  const assignedAt = dependencies.now();
  const audioRights = buildAudioRights(input, assignedAt);
  const readUrl = await resolveReadUrl(sourceAsset, assignedAt, dependencies);

  // Uploaded SFX is admitted only after its actual bytes decode to acceptable
  // audio. A silent, clipping, corrupt, too-quiet, or over-long file must not
  // reach preview or render admission as a volume-1 overlay.
  let sfxAcousticMeasurement: SfxAcousticMeasurement | undefined;
  if (input.mediaRole === 'sfx') {
    let sourceBytes;
    try {
      sourceBytes = await (dependencies.fetchSfxSourceBytes ?? defaultSfxFetch)(readUrl.url);
    } catch (error) {
      throw assignmentError(
        'SFX_AUDIO_REJECTED',
        `Uploaded SFX could not be read from storage: ${error instanceof Error ? error.message : String(error)}`,
        422,
        error,
      );
    }
    try {
      sfxAcousticMeasurement = await (
        dependencies.inspectSfxAudio ?? defaultSfxInspect
      )(sourceBytes);
    } catch (error) {
      if (error instanceof UploadedAudioAssignmentError
        && error.code === 'SFX_AUDIO_REJECTED') {
        throw error;
      }
      throw assignmentError(
        'SFX_AUDIO_REJECTED',
        `Uploaded SFX failed acoustic inspection: ${error instanceof Error ? error.message : String(error)}`,
        422,
        error,
      );
    }
  }

  const receipt: AssignmentReceipt = {
    version: ASSIGNMENT_VERSION,
    idempotencyKey: input.idempotencyKey,
    sourceAssetId: input.sourceAssetId,
    derivativeAssetId,
    mediaRole: input.mediaRole,
    userId: input.userId,
    projectId: input.projectId,
    attestedAt: assignedAt.toISOString(),
  };
  const derivative = {
    assetId: derivativeAssetId,
    userId: input.userId,
    projectId: input.projectId,
    type: 'audio',
    source: 'user-upload',
    filename: nonEmptyString(sourceAsset.filename) ?? `${derivativeAssetId}.audio`,
    ...(nonEmptyString(sourceAsset.contentType)
      ? { contentType: nonEmptyString(sourceAsset.contentType) }
      : {}),
    r2Key: nonEmptyString(sourceAsset.r2Key),
    gcsPath: nonEmptyString(sourceAsset.gcsPath),
    cachedUrl: readUrl.url,
    urlExpiresAt: readUrl.expiresAt,
    ...(finiteNumber(sourceAsset.size) !== null
      ? { size: finiteNumber(sourceAsset.size) }
      : {}),
    ...(finiteNumber(sourceAsset.duration) !== null
      ? { duration: finiteNumber(sourceAsset.duration) }
      : {}),
    ...(sfxAcousticMeasurement
      ? { sfxAcousticMeasurement }
      : {}),
    uploadedAt: assignedAt,
    lastUsedAt: assignedAt,
    parentAssetId: input.sourceAssetId,
    assignmentStatus: 'attached',
    audioRights,
    audioAssignmentReceipt: receipt,
  };

  let inserted: boolean;
  try {
    inserted = await dependencies.insertDerivativeAsset(derivative);
  } catch (error) {
    throw assignmentError(
      'DERIVATIVE_PERSISTENCE_FAILED',
      'Uploaded audio assignment could not be stored',
      500,
      error,
    );
  }
  if (!inserted) {
    const raced = await dependencies.findAsset(derivativeAssetId);
    if (!raced) {
      throw assignmentError(
        'DERIVATIVE_PERSISTENCE_FAILED',
        'Uploaded audio assignment was not readable after a concurrent write',
        500,
      );
    }
    return replayAssignment(raced, input, dependencies);
  }

  return buildResult(derivative, audioRights, input, false);
}

export async function assignUploadedAudioToTimeline(
  rawInput: UploadedAudioTimelineAssignmentInput,
  dependencyOverrides: Partial<UploadedAudioTimelineAssignmentDependencies> = {},
): Promise<UploadedAudioTimelineAssignmentResult> {
  const input = validateTimelineInput(rawInput);
  const dependencies = {
    ...defaultTimelineDependencies,
    ...dependencyOverrides,
  };
  const mutationTarget = await dependencies.loadProjectForTimelineMutation(
    input.userId,
    input.projectId,
  );
  const assignment = await assignUploadedAudio(input, {
    ...dependencies,
    loadProject: async () => mutationTarget.project,
  });
  const overlayId = buildTimelineOverlayId(input);
  const overlay = buildTimelineOverlay(input, assignment, overlayId);

  let attachment: ProjectUploadedAudioAttachResultV1;
  try {
    attachment = await dependencies.commitTimelineOverlayThroughProjectService(
      input.userId,
      input.projectId,
      mutationTarget.revision,
      overlay,
    );
  } catch (error) {
    const ownerCode = asRecord(error)?.code;
    if (ownerCode === 'PROJECT_REVISION_CONFLICT'
      || ownerCode === 'PROJECT_TIMELINE_RANGE_LOCKED') {
      throw assignmentError(
        'PROJECT_REVISION_CONFLICT',
        'The timeline changed or became locked while uploaded audio was being prepared. Review the latest timeline and retry.',
        409,
        error,
      );
    }
    throw assignmentError(
      'PROJECT_PERSISTENCE_FAILED',
      'Uploaded audio could not be attached to the project timeline',
      500,
      error,
    );
  }

  const project = asRecord(
    await dependencies.loadProject(input.userId, input.projectId),
  );
  if (!project) {
    throw assignmentError('PROJECT_NOT_FOUND', 'Project not found', 404);
  }
  const overlays = Array.isArray(project.overlays)
    ? project.overlays.flatMap((candidate) => {
        const record = asRecord(candidate);
        return record ? [record] : [];
      })
    : null;
  if (!overlays) {
    throw assignmentError(
      'PROJECT_TIMELINE_INVALID',
      'Project timeline is missing or malformed',
      500,
    );
  }
  const persisted = overlays.find((candidate) => candidate.id === overlayId);
  if (!persisted) {
    throw assignmentError(
      'PROJECT_PERSISTENCE_FAILED',
      'Uploaded audio was not present after the project timeline commit',
      500,
    );
  }
  assertPersistedTimelineOverlay(persisted, overlay, input);

  return {
    ...assignment,
    replayed: assignment.replayed || attachment.disposition === 'ALREADY_ATTACHED',
    overlayId,
    overlays,
    ...(attachment.mutationReceipt
      ? { projectMutationReceipt: attachment.mutationReceipt }
      : {}),
  };
}

function validateInput(
  input: UploadedAudioAssignmentInput,
): UploadedAudioAssignmentInput {
  const userId = nonEmptyString(input?.userId);
  const projectId = nonEmptyString(input?.projectId);
  const sourceAssetId = nonEmptyString(input?.sourceAssetId);
  const idempotencyKey = nonEmptyString(input?.idempotencyKey);
  if (!userId || !projectId || !sourceAssetId || !idempotencyKey) {
    throw assignmentError(
      'INVALID_REQUEST',
      'userId, projectId, sourceAssetId, mediaRole, and idempotencyKey are required',
      400,
    );
  }
  if (!ASSIGNABLE_ROLES.has(input.mediaRole)) {
    throw assignmentError(
      'INVALID_REQUEST',
      'mediaRole must be sfx, voiceover, dubbing, or other',
      400,
    );
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw assignmentError(
      'INVALID_REQUEST',
      'idempotencyKey must contain 8-128 letters, digits, underscores, or hyphens',
      400,
    );
  }
  if (
    input.rightsAttestation?.accepted !== true
    || input.rightsAttestation.version !== AUDIO_RIGHTS_ATTESTATION_VERSION
  ) {
    throw assignmentError(
      'RIGHTS_ATTESTATION_REQUIRED',
      'Uploaded audio requires the current rights attestation before assignment',
      422,
    );
  }
  return { ...input, userId, projectId, sourceAssetId, idempotencyKey };
}

function validateTimelineInput(
  input: UploadedAudioTimelineAssignmentInput,
): UploadedAudioTimelineAssignmentInput {
  const validated = validateInput(input);
  const displayName = nonEmptyString(input?.displayName);
  const placement = asRecord(input?.placement);
  const from = placement?.from;
  const durationInFrames = placement?.durationInFrames;
  const requestedRow = placement?.requestedRow;
  const startFromSound = placement?.startFromSound ?? 0;
  if (
    !displayName
    || !nonNegativeSafeInteger(from)
    || !positiveSafeInteger(durationInFrames)
    || !nonNegativeSafeInteger(requestedRow)
    || requestedRow > 63
    || !nonNegativeSafeInteger(startFromSound)
  ) {
    throw assignmentError(
      'INVALID_REQUEST',
      'displayName and a valid non-negative timeline placement are required',
      400,
    );
  }
  return {
    ...validated,
    displayName: displayName.slice(0, 200),
    placement: {
      from,
      durationInFrames,
      requestedRow,
      startFromSound,
    },
  };
}

function assertSourceAsset(
  asset: StoredAudioAsset,
  input: UploadedAudioAssignmentInput,
): void {
  if (asset.userId !== input.userId) {
    throw assignmentError(
      'ASSET_ACCESS_DENIED',
      'The selected audio asset is not owned by this user',
      403,
    );
  }
  if (asset.type !== 'audio') {
    throw assignmentError('ASSET_NOT_AUDIO', 'The selected asset is not audio', 422);
  }
  if (asset.source !== 'user-upload') {
    throw assignmentError(
      'ASSET_NOT_USER_UPLOAD',
      'Only original user-uploaded audio can use this assignment path',
      422,
    );
  }
  if (
    !nonEmptyString(asset.r2Key)
    && !nonEmptyString(asset.gcsPath)
    && !validHttpUrl(asset.cachedUrl)
  ) {
    throw assignmentError(
      'ASSET_STORAGE_UNAVAILABLE',
      'The uploaded audio has no durable storage identity',
      422,
    );
  }
}

function buildAudioRights(
  input: UploadedAudioAssignmentInput,
  assignedAt: Date,
): AudioRightsContract {
  return {
    mediaRole: input.mediaRole,
    source: 'user-upload',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'user-attestation',
      sourceAssetId: input.sourceAssetId,
      attestationVersion: AUDIO_RIGHTS_ATTESTATION_VERSION,
      attestedAt: assignedAt.toISOString(),
      attestedBy: input.userId,
    },
  };
}

async function replayAssignment(
  asset: StoredAudioAsset,
  input: UploadedAudioAssignmentInput,
  dependencies: UploadedAudioAssignmentDependencies,
): Promise<UploadedAudioAssignmentResult> {
  const receipt = asRecord(asset.audioAssignmentReceipt) as AssignmentReceipt | null;
  if (
    receipt?.version !== ASSIGNMENT_VERSION
    || receipt.idempotencyKey !== input.idempotencyKey
    || receipt.sourceAssetId !== input.sourceAssetId
    || receipt.mediaRole !== input.mediaRole
    || receipt.userId !== input.userId
    || receipt.projectId !== input.projectId
  ) {
    throw assignmentError(
      'IDEMPOTENCY_CONFLICT',
      'The idempotency key was already used for a different audio assignment',
      409,
    );
  }
  const rights = asset.audioRights as AudioRightsContract;
  if (
    getAudioRightsContractIssue(rights)
    || rights.mediaRole !== input.mediaRole
    || rights.evidence?.sourceAssetId !== input.sourceAssetId
    || asset.parentAssetId !== input.sourceAssetId
    || asset.assignmentStatus !== 'attached'
  ) {
    throw assignmentError(
      'DERIVATIVE_PERSISTENCE_FAILED',
      'The stored uploaded audio assignment is incomplete or inconsistent',
      500,
    );
  }
  const now = dependencies.now();
  const readUrl = await resolveReadUrl(asset, now, dependencies);
  return buildResult(
    { ...asset, cachedUrl: readUrl.url, urlExpiresAt: readUrl.expiresAt },
    rights,
    input,
    true,
  );
}

async function resolveReadUrl(
  asset: StoredAudioAsset,
  now: Date,
  dependencies: UploadedAudioAssignmentDependencies,
): Promise<{ url: string; expiresAt: Date }> {
  try {
    const result = await dependencies.resolveReadUrl(asset, now);
    if (!validHttpUrl(result.url) || !validDate(result.expiresAt)) {
      throw new Error('Storage resolver returned an invalid URL receipt');
    }
    return result;
  } catch (error) {
    throw assignmentError(
      'ASSET_STORAGE_UNAVAILABLE',
      'The uploaded audio could not be resolved from durable storage',
      422,
      error,
    );
  }
}

function buildResult(
  asset: StoredAudioAsset,
  audioRights: AudioRightsContract,
  input: UploadedAudioAssignmentInput,
  replayed: boolean,
): UploadedAudioAssignmentResult {
  return {
    replayed,
    sourceAssetId: input.sourceAssetId,
    derivativeAssetId: String(asset.assetId),
    mediaRole: input.mediaRole,
    audioRights,
    audioUrl: String(asset.cachedUrl),
    ...(finiteNumber(asset.duration) !== null
      ? { duration: finiteNumber(asset.duration) as number }
      : {}),
    ...(asset.sfxAcousticMeasurement
      ? { sfxAcousticMeasurement: asset.sfxAcousticMeasurement as SfxAcousticMeasurement }
      : {}),
  };
}

function buildDerivativeAssetId(input: UploadedAudioAssignmentInput): string {
  const digest = createHash('sha256')
    .update(`${input.userId}\0${input.projectId}\0${input.idempotencyKey}`)
    .digest('hex')
    .slice(0, 32);
  return `audio_use_${digest}`;
}

function buildTimelineOverlay(
  input: UploadedAudioTimelineAssignmentInput,
  assignment: UploadedAudioAssignmentResult,
  overlayId: number,
): Record<string, unknown> {
  const placement = input.placement;
  const row = resolveTimelineRow(input.mediaRole, placement.requestedRow);
  return {
    id: overlayId,
    type: 'sound',
    from: placement.from,
    durationInFrames: placement.durationInFrames,
    row,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    isDragging: false,
    rotation: 0,
    assetId: assignment.derivativeAssetId,
    src: assignment.audioUrl,
    content: input.displayName,
    startFromSound: placement.startFromSound ?? 0,
    styles: { volume: 1 },
    audioRights: assignment.audioRights,
    metadata: {
      source: 'uploaded-audio-assignment',
      audioRole: input.mediaRole,
      sourceAssetId: input.sourceAssetId,
      ...(assignment.sfxAcousticMeasurement
        ? { sfxAcousticMeasurement: assignment.sfxAcousticMeasurement }
        : {}),
      uploadedAudioAssignment: {
        version: TIMELINE_ASSIGNMENT_VERSION,
        idempotencyKey: input.idempotencyKey,
        sourceAssetId: input.sourceAssetId,
        derivativeAssetId: assignment.derivativeAssetId,
        mediaRole: input.mediaRole,
        placement: {
          ...placement,
          startFromSound: placement.startFromSound ?? 0,
          resolvedRow: row,
        },
      },
    },
    _workerAdded: true,
  };
}

function assertPersistedTimelineOverlay(
  persisted: Record<string, unknown>,
  expected: Record<string, unknown>,
  input: UploadedAudioTimelineAssignmentInput,
): void {
  const persistedMetadata = asRecord(persisted.metadata);
  const expectedMetadata = asRecord(expected.metadata);
  const persistedReceipt = asRecord(
    persistedMetadata?.uploadedAudioAssignment,
  );
  const expectedReceipt = asRecord(
    expectedMetadata?.uploadedAudioAssignment,
  );
  if (
    persisted.type !== 'sound'
    || persisted.assetId !== expected.assetId
    || persisted.row !== expected.row
    || persisted.from !== expected.from
    || persisted.durationInFrames !== expected.durationInFrames
    || persisted.startFromSound !== expected.startFromSound
    || persistedMetadata?.audioRole !== input.mediaRole
    || JSON.stringify(persisted.audioRights) !== JSON.stringify(expected.audioRights)
    || JSON.stringify(persistedReceipt) !== JSON.stringify(expectedReceipt)
  ) {
    throw assignmentError(
      'IDEMPOTENCY_CONFLICT',
      'The idempotency key is already attached to a different timeline placement',
      409,
    );
  }
}

function resolveTimelineRow(
  mediaRole: UploadedAudioMediaRole,
  requestedRow: number,
): number {
  if (mediaRole === 'sfx') return ROW.SFX;
  if (mediaRole === 'voiceover' || mediaRole === 'dubbing') {
    return ROW.VOICEOVER;
  }
  return requestedRow === ROW.BGM ? ROW.SFX : requestedRow;
}

function buildTimelineOverlayId(
  input: UploadedAudioTimelineAssignmentInput,
): number {
  const digest = createHash('sha256')
    .update(
      `${input.userId}\0${input.projectId}\0${input.idempotencyKey}\0timeline`,
    )
    .digest('hex')
    .slice(0, 11);
  return Number.parseInt(digest, 16);
}

function assignmentError(
  code: UploadedAudioAssignmentErrorCode,
  message: string,
  httpStatus: number,
  cause?: unknown,
): UploadedAudioAssignmentError {
  return new UploadedAudioAssignmentError(
    code,
    message,
    httpStatus,
    cause === undefined ? undefined : { cause },
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function validDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function validHttpUrl(value: unknown): string | null {
  const url = nonEmptyString(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return asRecord(error)?.code === 11000;
}
