import { createHash } from 'node:crypto';

import { applyAudioDuckingToProject } from '@/lib/editron/agent/chat-audio-tools';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import {
  MAX_AUDIO_CONDITIONING_INPUT_BYTES,
  conditionAudio,
} from '@/lib/pipeline/audio-conditioning';
import {
  resolveAudioPlatformEvidence,
  resolveMusicGenerationPolicy,
} from '@/lib/pipeline/bgm-conditioning-contract';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import {
  getAudioRightsContractIssue,
  MUSIC_RIGHTS_ATTESTATION_VERSION as RIGHTS_ATTESTATION_VERSION,
  type MusicRightsContract,
} from '@/lib/editron/shared/render-request-payload';
import {
  RenderAudioRightsAuthorityError,
  verifyRenderAudioRightsAuthority,
} from './render-audio-rights-authority';

import { DEFAULT_BGM_MIX_LEVELS } from './bgm-mix-levels';
import { refreshSignedUrl } from './gcs-service';
import { analyzeConditionedMusicBeatGrid } from './music-beat-grid';
import {
  buildMusicCoverageOverlays,
  resolveRuntimeMusicCoveragePlan,
} from './music-coverage-runtime';
import { projectService } from './project-service';
import { readProjectRevisionV1 } from './project-revision-v1';
import { getR2PresignedReadUrl } from './r2-service';
import { uploadMedia } from './upload-service';

const DOWNLOAD_TIMEOUT_MS = 60_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export type { MusicRightsContract } from '@/lib/editron/shared/render-request-payload';

export type BackgroundMusicUsageMode = 'embedded' | 'reference-only';

export type BackgroundMusicAssignmentErrorCode =
  | 'INVALID_REQUEST'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_TIMELINE_INVALID'
  | 'MUSIC_DISABLED_BY_POLICY'
  | 'ASSET_NOT_FOUND'
  | 'ASSET_ACCESS_DENIED'
  | 'ASSET_NOT_AUDIO'
  | 'RIGHTS_ATTESTATION_REQUIRED'
  | 'RIGHTS_EVIDENCE_REQUIRED'
  | 'UNLICENSED_LIBRARY_ASSET'
  | 'ASSET_STORAGE_UNAVAILABLE'
  | 'ASSET_DOWNLOAD_FAILED'
  | 'CONDITIONING_FAILED'
  | 'BEAT_ANALYSIS_FAILED'
  | 'DERIVATIVE_UPLOAD_FAILED'
  | 'DERIVATIVE_PERSISTENCE_FAILED'
  | 'PROJECT_PERSISTENCE_FAILED'
  | 'PROJECT_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT';

export class BackgroundMusicAssignmentError extends Error {
  constructor(
    readonly code: BackgroundMusicAssignmentErrorCode,
    message: string,
    readonly httpStatus: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BackgroundMusicAssignmentError';
  }
}

export interface BackgroundMusicAssignmentInput {
  userId: string;
  projectId: string;
  assetId: string;
  idempotencyKey: string;
  usageMode?: BackgroundMusicUsageMode;
  sourceMetadata?: {
    identityId?: string;
    title?: string;
    artists?: string[];
    provider?: string;
    providerTrackId?: string;
    isrcs?: string[];
  };
  rightsAttestation?: {
    accepted: true;
    version: typeof RIGHTS_ATTESTATION_VERSION;
  };
}

export interface BackgroundMusicAssignmentResult {
  replayed: boolean;
  usageMode: BackgroundMusicUsageMode;
  sourceAssetId: string;
  derivativeAssetId: string;
  overlays: unknown[];
  musicRights: MusicRightsContract;
  beatGrid: Awaited<ReturnType<typeof analyzeConditionedMusicBeatGrid>>['beatGrid'];
  musicCoveragePlan: ReturnType<typeof resolveRuntimeMusicCoveragePlan>;
  snappedCutCount: number;
}

interface StoredAudioAsset extends Record<string, unknown> {
  assetId: string;
  userId?: string;
  projectId?: string;
  type?: string;
  filename?: string;
  source?: string;
  r2Key?: string | null;
  gcsPath?: string | null;
  musicRights?: MusicRightsContract;
}

interface AssignmentReceipt {
  version?: string;
  idempotencyKey?: string;
  sourceAssetId?: string;
  derivativeAssetId?: string;
  usageMode?: BackgroundMusicUsageMode;
  musicRights?: MusicRightsContract;
  beatGrid?: BackgroundMusicAssignmentResult['beatGrid'];
  musicCoveragePlan?: BackgroundMusicAssignmentResult['musicCoveragePlan'];
  snappedCutCount?: number;
}

export interface BackgroundMusicAssignmentDependencies {
  loadProject: (userId: string, projectId: string) => Promise<any | null>;
  findAsset: (
    assetId: string,
    userId: string,
    projectId: string,
  ) => Promise<StoredAudioAsset | null>;
  resolveR2ReadUrl: (r2Key: string) => Promise<string>;
  resolveGcsReadUrl: (gcsPath: string) => Promise<string>;
  fetchAsset: typeof fetch;
  condition: typeof conditionAudio;
  analyze: typeof analyzeConditionedMusicBeatGrid;
  upload: typeof uploadMedia;
  upsertDerivativeAsset: (document: Record<string, unknown>) => Promise<void>;
  setDerivativeAssignmentStatus: (
    assetId: string,
    status: 'attached' | 'orphaned',
  ) => Promise<void>;
  replaceBackgroundMusicAtRevisionV1: typeof projectService.replaceBackgroundMusicAtRevisionV1;
  now: () => Date;
}

export function buildBackgroundMusicSourceAssetFilter(input: {
  assetId: string;
  userId: string;
  projectId: string;
}): Record<string, unknown> {
  return {
    assetId: input.assetId,
    userId: input.userId,
    $or: [
      { source: { $ne: 'library' } },
      { source: 'library', projectId: input.projectId },
    ],
  };
}

const defaultDependencies: BackgroundMusicAssignmentDependencies = {
  loadProject: (userId, projectId) => projectService.loadProject(userId, projectId),
  findAsset: async (assetId, userId, projectId) => {
    const db = await getDatabase();
    return db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(
      buildBackgroundMusicSourceAssetFilter({ assetId, userId, projectId }),
    ) as Promise<StoredAudioAsset | null>;
  },
  resolveR2ReadUrl: getR2PresignedReadUrl,
  resolveGcsReadUrl: async (gcsPath) => (await refreshSignedUrl(gcsPath)).url,
  fetchAsset: fetch,
  condition: conditionAudio,
  analyze: analyzeConditionedMusicBeatGrid,
  upload: uploadMedia,
  upsertDerivativeAsset: async (document) => {
    const db = await getDatabase();
    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId: document.assetId },
      { $set: document },
      { upsert: true },
    );
  },
  setDerivativeAssignmentStatus: async (assetId, status) => {
    const db = await getDatabase();
    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId },
      { $set: { assignmentStatus: status, updatedAt: new Date() } },
    );
  },
  replaceBackgroundMusicAtRevisionV1: (userId, projectId, input) => (
    projectService.replaceBackgroundMusicAtRevisionV1(userId, projectId, input)
  ),
  now: () => new Date(),
};

export async function assignBackgroundMusic(
  rawInput: BackgroundMusicAssignmentInput,
  dependencyOverrides: Partial<BackgroundMusicAssignmentDependencies> = {},
): Promise<BackgroundMusicAssignmentResult> {
  const input = validateInput(rawInput);
  const usageMode = input.usageMode ?? 'embedded';
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const project = await dependencies.loadProject(input.userId, input.projectId);
  if (!project) {
    throw assignmentError('PROJECT_NOT_FOUND', 'Project not found', 404);
  }

  const replay = readAssignmentReceipt(project);
  if (replay?.idempotencyKey === input.idempotencyKey) {
    if (replay.sourceAssetId !== input.assetId) {
      throw assignmentError(
        'IDEMPOTENCY_CONFLICT',
        'The idempotency key was already used for a different source asset',
        409,
      );
    }
    if ((replay.usageMode ?? 'embedded') !== usageMode) {
      throw assignmentError(
        'IDEMPOTENCY_CONFLICT',
        'The idempotency key was already used for a different music usage mode',
        409,
      );
    }
    return replayAssignment(project, replay);
  }

  const expectedRevision = readProjectRevisionV1(project);
  const totalFrames = positiveInteger(project.durationInFrames);
  const fps = positiveNumber(project.fps);
  if (!expectedRevision || totalFrames === null || fps === null) {
    throw assignmentError(
      'PROJECT_TIMELINE_INVALID',
      'Project must have a valid revision, durationInFrames, and fps before assigning music',
      422,
    );
  }
  const assignedAt = dependencies.now();

  const musicPolicy = resolveMusicGenerationPolicy({
    musicPreferences: [
      { value: project.musicPreference, source: 'project.musicPreference' },
      { value: project.productionBrief?.musicPreference, source: 'project.productionBrief.musicPreference' },
      { value: project.productionBriefIntake?.musicPreference, source: 'project.productionBriefIntake.musicPreference' },
      { value: project.creativeBrief?.musicPreference, source: 'project.creativeBrief.musicPreference' },
    ],
    editorialPreferences: [
      { value: project.editorialPreferences, source: 'project.editorialPreferences' },
      { value: project.productionBrief?.editorialPreferences, source: 'project.productionBrief.editorialPreferences' },
      { value: project.productionBriefIntake?.editorialPreferences, source: 'project.productionBriefIntake.editorialPreferences' },
      { value: project.creativeBrief?.editorialPreferences, source: 'project.creativeBrief.editorialPreferences' },
    ],
  });
  if (!musicPolicy.allowed) {
    throw assignmentError(
      'MUSIC_DISABLED_BY_POLICY',
      `Background music is disabled by ${musicPolicy.reason}`,
      409,
    );
  }
  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  const existingBgm = overlays.filter(isBgmOverlay);
  const nonBgm = overlays.filter((overlay: any) => !isBgmOverlay(overlay));
  const musicCoveragePlan = resolveRuntimeMusicCoveragePlan({
    totalFrames,
    fps,
    project,
    overlays: nonBgm,
    authoredMusicIntent: {
      coverage: 'full',
      source: 'user-set-background-music',
    },
  });

  const sourceAsset = await dependencies.findAsset(
    input.assetId,
    input.userId,
    input.projectId,
  );
  if (!sourceAsset) {
    throw assignmentError('ASSET_NOT_FOUND', 'Audio asset not found', 404);
  }
  assertSourceAssetScope(sourceAsset, input);
  if (sourceAsset.type !== 'audio') {
    throw assignmentError('ASSET_NOT_AUDIO', 'Selected asset is not an audio asset', 422);
  }
  const musicRights = resolveMusicRights(sourceAsset, input, assignedAt, usageMode);
  await verifyLibrarySourceAuthority(sourceAsset, input, musicRights);
  const sourceBuffer = await downloadStoredAudio(sourceAsset, dependencies);

  const audioPlatformEvidence = resolveAudioPlatformEvidence([
    { value: project.productionBrief?.output?.platform, source: 'project.productionBrief.output.platform' },
    { value: project.syntheticStoryboard?.platform, source: 'project.syntheticStoryboard.platform' },
    { value: project.platform, source: 'project.platform' },
  ]);
  let conditioned;
  try {
    conditioned = await dependencies.condition({
      role: 'music',
      buffer: sourceBuffer,
      targetFrames: totalFrames,
      fps,
      platform: audioPlatformEvidence.platform,
    });
  } catch (error) {
    throw assignmentError(
      'CONDITIONING_FAILED',
      `Selected audio could not be conditioned: ${errorMessage(error)}`,
      422,
      error,
    );
  }

  let beatEvidence;
  try {
    beatEvidence = await dependencies.analyze({
      buffer: conditioned.buffer,
      fps,
      totalFrames,
    });
  } catch (error) {
    throw assignmentError(
      'BEAT_ANALYSIS_FAILED',
      `Selected audio did not produce trustworthy beat evidence: ${errorMessage(error)}`,
      422,
      error,
    );
  }
  const conditioningEvidence = withoutBuffer(conditioned);

  const derivativeAssetId = buildDerivativeAssetId(input, totalFrames, fps);
  let uploadResult;
  try {
    uploadResult = await dependencies.upload(
      conditioned.buffer,
      input.userId,
      `${derivativeAssetId}.flac`,
      conditioned.contentType,
      { customAssetId: derivativeAssetId },
    );
  } catch (error) {
    throw assignmentError(
      'DERIVATIVE_UPLOAD_FAILED',
      `Conditioned background music could not be stored: ${errorMessage(error)}`,
      502,
      error,
    );
  }
  if (uploadResult.assetId !== derivativeAssetId) {
    throw assignmentError(
      'DERIVATIVE_UPLOAD_FAILED',
      'Storage returned a different asset identity for conditioned background music',
      502,
    );
  }

  const overlaySeed = parseInt(
    createHash('sha256').update(derivativeAssetId).digest('hex').slice(0, 12),
    16,
  );
  const referenceTrack = usageMode === 'reference-only'
    ? resolveReferenceTrackMetadata({
        sourceAsset: sourceAsset,
        sourceMetadata: input.sourceMetadata,
        bpm: positiveNumber(beatEvidence.beatGrid.bpm),
      })
    : null;
  const baseOverlay: any = {
    ...(existingBgm[0] ?? {}),
    id: overlaySeed,
    type: 'sound',
    from: 0,
    durationInFrames: totalFrames,
    row: ROW.BGM,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    isDragging: false,
    rotation: 0,
    assetId: derivativeAssetId,
    src: uploadResult.signedUrl,
    content: uploadResult.signedUrl,
    styles: {
      ...(existingBgm[0]?.styles ?? {}),
      volume: typeof existingBgm[0]?.styles?.volume === 'number'
        ? existingBgm[0].styles.volume
        : DEFAULT_BGM_MIX_LEVELS.baseVolume,
      opacity: 1,
      animation: { exit: 'fade', duration: 1 },
    },
    audioRights: musicRights,
    musicRights,
    metadata: {
      ...(existingBgm[0]?.metadata ?? {}),
      source: 'background-music-assignment',
      sourceAssetId: input.assetId,
      referenceTrack,
      beatGrid: beatEvidence.beatGrid,
      audioConditioning: {
        requestedPlatform: audioPlatformEvidence.platform,
        platformEvidenceSource: audioPlatformEvidence.source,
        ...conditioningEvidence,
      },
      assignment: {
        version: 'background-music-assignment-v1',
        idempotencyKey: input.idempotencyKey,
        usageMode,
        assignedAt: assignedAt.toISOString(),
      },
    },
  };
  const replacementBgm = buildMusicCoverageOverlays({
    baseOverlay,
    plan: musicCoveragePlan,
    totalFrames,
    idFactory: sectionIndex => overlaySeed + sectionIndex,
  });
  const replacementIndex = overlays.findIndex(isBgmOverlay);
  const nextOverlays = overlays.flatMap((overlay: any, index: number) => {
    if (!isBgmOverlay(overlay)) return [overlay];
    return index === replacementIndex ? replacementBgm : [];
  });
  if (replacementIndex < 0) nextOverlays.push(...replacementBgm);

  const mixPlan = applyAudioDuckingToProject({ ...project, overlays: nextOverlays });
  for (const bgmOverlay of replacementBgm) {
    const mixUpdate = mixPlan.updates.find(update => update.overlayId === bgmOverlay.id);
    if (mixUpdate) bgmOverlay.styles = mixUpdate.nextStyles;
  }

  const beatRealignRequested = (
    process.env.EDITRON_MUSIC_CHANGE_BEAT_REALIGN === 'true'
    || project.featureFlags?.musicChangeBeatRealign === true
  );
  const beatRealignEnabled = false;
  const snappedCutCount = 0;
  const assignmentReceipt = {
    version: 'background-music-assignment-v1',
    idempotencyKey: input.idempotencyKey,
    sourceAssetId: input.assetId,
    derivativeAssetId,
    usageMode,
    referenceTrack,
    musicRights,
    beatGrid: beatEvidence.beatGrid,
    musicCoveragePlan,
    snappedCutCount,
    beatRealignEnabled,
    beatRealignDeferred: beatRealignRequested,
    assignedAt: assignedAt.toISOString(),
  };

  try {
    await dependencies.upsertDerivativeAsset({
      assetId: derivativeAssetId,
      userId: input.userId,
      projectId: input.projectId,
      type: 'audio',
      source: usageMode === 'reference-only' ? 'preview-only' : 'generated',
      filename: `${derivativeAssetId}.flac`,
      contentType: uploadResult.contentType,
      gcsPath: uploadResult.gcsPath,
      r2Key: uploadResult.r2Key,
      cachedUrl: uploadResult.signedUrl,
      urlExpiresAt: uploadResult.urlExpiresAt ?? new Date('2099-12-31T00:00:00.000Z'),
      size: uploadResult.size,
      duration: conditioned.durationMs / 1_000,
      durationMs: conditioned.durationMs,
      uploadedAt: assignedAt,
      lastUsedAt: assignedAt,
      parentAssetId: input.assetId,
      assignmentStatus: 'pending',
      musicRights,
      beatAnalysis: beatEvidence.beatAnalysis,
      beatGrid: beatEvidence.beatGrid,
      audioConditioningEvidence: conditioningEvidence,
      referenceTrack,
    });
  } catch (error) {
    throw assignmentError(
      'DERIVATIVE_PERSISTENCE_FAILED',
      `Conditioned background music metadata could not be stored: ${errorMessage(error)}`,
      500,
      error,
    );
  }

  try {
    await dependencies.replaceBackgroundMusicAtRevisionV1(
      input.userId,
      input.projectId,
      {
        expectedRevision,
        actorKind: 'USER',
        candidateOverlays: nextOverlays,
        musicCoveragePlan,
        evidence: {
          kind: 'ASSIGNMENT',
          usageMode,
          receipt: assignmentReceipt,
        },
      },
    );
  } catch (error) {
    await setDerivativeAssignmentStatusBestEffort(
      dependencies,
      derivativeAssetId,
      'orphaned',
    );
    if (isProjectRevisionConflict(error)) {
      throw assignmentError(
        'PROJECT_CONFLICT',
        'The project changed while background music was being prepared; the existing BGM was kept',
        409,
        error,
      );
    }
    throw assignmentError(
      'PROJECT_PERSISTENCE_FAILED',
      `Background music could not be committed to the project: ${errorMessage(error)}`,
      500,
      error,
    );
  }
  await setDerivativeAssignmentStatusBestEffort(
    dependencies,
    derivativeAssetId,
    'attached',
  );

  return {
    replayed: false,
    usageMode,
    sourceAssetId: input.assetId,
    derivativeAssetId,
    overlays: nextOverlays,
    musicRights,
    beatGrid: beatEvidence.beatGrid,
    musicCoveragePlan,
    snappedCutCount,
  };
}

function validateInput(input: BackgroundMusicAssignmentInput): BackgroundMusicAssignmentInput {
  const userId = nonEmptyString(input?.userId);
  const projectId = nonEmptyString(input?.projectId);
  const assetId = nonEmptyString(input?.assetId);
  const idempotencyKey = nonEmptyString(input?.idempotencyKey);
  if (!userId || !projectId || !assetId || !idempotencyKey) {
    throw assignmentError(
      'INVALID_REQUEST',
      'userId, projectId, assetId, and idempotencyKey are required',
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
    input.usageMode !== undefined
    && input.usageMode !== 'embedded'
    && input.usageMode !== 'reference-only'
  ) {
    throw assignmentError(
      'INVALID_REQUEST',
      'usageMode must be embedded or reference-only',
      400,
    );
  }
  return { ...input, userId, projectId, assetId, idempotencyKey };
}

function resolveMusicRights(
  asset: StoredAudioAsset,
  input: BackgroundMusicAssignmentInput,
  assignedAt: Date,
  usageMode: BackgroundMusicUsageMode,
): MusicRightsContract {
  if (usageMode === 'reference-only') {
    return {
      mediaRole: 'music',
      source: 'preview-only',
      userChoice: 'no-music',
      licensed: false,
    };
  }
  const persistedRights = asset.musicRights;
  const persistedRightsIssue = persistedRights
    ? getAudioRightsContractIssue(persistedRights)
    : 'audio rights metadata is missing';
  if (
    asset.source === 'preview-only'
    || persistedRights?.source === 'preview-only'
    || persistedRights?.licensed === false
  ) {
    throw assignmentError(
      'UNLICENSED_LIBRARY_ASSET',
      'Preview-only or unlicensed audio cannot be assigned as renderable background music',
      422,
    );
  }
  if (asset.source === 'library' || persistedRights?.source === 'library') {
    if (
      persistedRights?.source !== 'library'
      || persistedRights.licensed !== true
      || persistedRightsIssue
    ) {
      throw assignmentError(
        'UNLICENSED_LIBRARY_ASSET',
        'Library audio requires durable license evidence before assignment',
        422,
      );
    }
    return persistedRights;
  }
  if (asset.source === 'generated') {
    if (
      persistedRights?.source === 'generated'
      && persistedRights.licensed === true
      && persistedRights.evidence?.kind === 'generated-provider'
      && !persistedRightsIssue
    ) {
      return persistedRights;
    }
    throw assignmentError(
      'RIGHTS_EVIDENCE_REQUIRED',
      'Generated music requires durable provider rights evidence before assignment',
      422,
    );
  }
  if (
    persistedRights?.source === 'user-upload'
    && persistedRights.licensed === true
    && persistedRights.userChoice === 'attested'
    && !persistedRightsIssue
  ) {
    return persistedRights;
  }
  if (
    input.rightsAttestation?.accepted !== true
    || input.rightsAttestation.version !== RIGHTS_ATTESTATION_VERSION
  ) {
    throw assignmentError(
      'RIGHTS_ATTESTATION_REQUIRED',
      'User-uploaded music requires the current rights attestation before assignment',
      422,
    );
  }
  return {
    mediaRole: 'music',
    source: 'user-upload',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'user-attestation',
      sourceAssetId: asset.assetId,
      attestationVersion: RIGHTS_ATTESTATION_VERSION,
      attestedAt: assignedAt.toISOString(),
      attestedBy: input.userId,
    },
  };
}

function assertSourceAssetScope(
  asset: StoredAudioAsset,
  input: BackgroundMusicAssignmentInput,
): void {
  if (asset.userId !== input.userId) {
    throw assignmentError(
      'ASSET_ACCESS_DENIED',
      'The selected audio asset is not owned by this user',
      403,
    );
  }
  if (asset.source === 'library' && asset.projectId !== input.projectId) {
    throw assignmentError(
      'ASSET_ACCESS_DENIED',
      'Library music is licensed only for the project that ingested it',
      403,
    );
  }
}

async function verifyLibrarySourceAuthority(
  asset: StoredAudioAsset,
  input: BackgroundMusicAssignmentInput,
  musicRights: MusicRightsContract,
): Promise<void> {
  if (musicRights.source !== 'library') return;

  try {
    await verifyRenderAudioRightsAuthority(
      {
        userId: input.userId,
        projectId: input.projectId,
        overlays: [{
          id: `background-music-source:${asset.assetId}`,
          type: 'sound',
          row: ROW.BGM,
          assetId: asset.assetId,
          musicRights,
        }],
      },
      {
        loadAssets: async () => [asset],
      },
    );
  } catch (error) {
    if (error instanceof RenderAudioRightsAuthorityError) {
      throw assignmentError(
        'UNLICENSED_LIBRARY_ASSET',
        `Library audio authority could not be verified: ${error.message}`,
        422,
        error,
      );
    }
    throw error;
  }
}

async function downloadStoredAudio(
  asset: StoredAudioAsset,
  dependencies: BackgroundMusicAssignmentDependencies,
): Promise<Buffer> {
  let readUrl: string;
  try {
    if (typeof asset.r2Key === 'string' && asset.r2Key.trim()) {
      readUrl = await dependencies.resolveR2ReadUrl(asset.r2Key.trim());
    } else if (typeof asset.gcsPath === 'string' && asset.gcsPath.trim()) {
      readUrl = await dependencies.resolveGcsReadUrl(asset.gcsPath.trim());
    } else {
      throw assignmentError(
        'ASSET_STORAGE_UNAVAILABLE',
        'Selected audio must be ingested into controlled R2 or GCS storage before assignment',
        422,
      );
    }
  } catch (error) {
    if (error instanceof BackgroundMusicAssignmentError) throw error;
    throw assignmentError(
      'ASSET_STORAGE_UNAVAILABLE',
      `Selected audio storage could not be resolved: ${errorMessage(error)}`,
      502,
      error,
    );
  }

  let response: Response;
  try {
    response = await dependencies.fetchAsset(readUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    throw assignmentError(
      'ASSET_DOWNLOAD_FAILED',
      `Selected audio could not be downloaded: ${errorMessage(error)}`,
      502,
      error,
    );
  }
  if (!response.ok) {
    throw assignmentError(
      'ASSET_DOWNLOAD_FAILED',
      `Selected audio download returned HTTP ${response.status}`,
      502,
    );
  }
  const declaredBytes = Number(response.headers.get('content-length'));
  if (
    Number.isFinite(declaredBytes)
    && declaredBytes > MAX_AUDIO_CONDITIONING_INPUT_BYTES
  ) {
    throw assignmentError(
      'ASSET_DOWNLOAD_FAILED',
      `Selected audio exceeds the ${MAX_AUDIO_CONDITIONING_INPUT_BYTES}-byte conditioning limit`,
      413,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_AUDIO_CONDITIONING_INPUT_BYTES) {
    throw assignmentError(
      'ASSET_DOWNLOAD_FAILED',
      buffer.length === 0
        ? 'Selected audio download was empty'
        : `Selected audio exceeds the ${MAX_AUDIO_CONDITIONING_INPUT_BYTES}-byte conditioning limit`,
      buffer.length === 0 ? 422 : 413,
    );
  }
  return buffer;
}

function replayAssignment(
  project: any,
  receipt: AssignmentReceipt,
): BackgroundMusicAssignmentResult {
  const derivativeAssetId = nonEmptyString(receipt.derivativeAssetId);
  if (
    !derivativeAssetId
    || !receipt.musicRights
    || !receipt.beatGrid
    || !receipt.musicCoveragePlan
  ) {
    throw assignmentError(
      'IDEMPOTENCY_CONFLICT',
      'The prior assignment receipt is incomplete and cannot be replayed safely',
      409,
    );
  }
  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  const hasMatchingBgm = overlays.some(
    (overlay: any) => isBgmOverlay(overlay) && overlay.assetId === derivativeAssetId,
  );
  if (!hasMatchingBgm) {
    throw assignmentError(
      'IDEMPOTENCY_CONFLICT',
      'The prior assignment receipt no longer matches the project timeline',
      409,
    );
  }
  return {
    replayed: true,
    usageMode: receipt.usageMode ?? 'embedded',
    sourceAssetId: receipt.sourceAssetId as string,
    derivativeAssetId,
    overlays,
    musicRights: receipt.musicRights,
    beatGrid: receipt.beatGrid,
    musicCoveragePlan: receipt.musicCoveragePlan,
    snappedCutCount: receipt.snappedCutCount ?? 0,
  };
}

function readAssignmentReceipt(project: any): AssignmentReceipt | null {
  const receipt = project?.intelligence?.audio?.lastMusicAssignment;
  return receipt && typeof receipt === 'object' ? receipt as AssignmentReceipt : null;
}

function buildDerivativeAssetId(
  input: BackgroundMusicAssignmentInput,
  totalFrames: number,
  fps: number,
): string {
  const digest = createHash('sha256')
    .update([
      input.userId,
      input.projectId,
      input.assetId,
      input.idempotencyKey,
      input.usageMode ?? 'embedded',
      String(totalFrames),
      String(fps),
    ].join('\0'))
    .digest('hex')
    .slice(0, 24);
  return `bgm_assignment_${digest}`;
}

function isBgmOverlay(overlay: any): boolean {
  return overlay?.type === 'sound' && overlay?.row === ROW.BGM;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? value as number : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function audioAssetDisplayTitle(asset: StoredAudioAsset): string {
  const filename = nonEmptyString(asset.filename);
  if (!filename) return asset.assetId;
  const withoutExtension = filename.replace(/\.[^.]+$/, '').trim();
  return withoutExtension || filename;
}

function resolveReferenceTrackMetadata(input: {
  sourceAsset: StoredAudioAsset;
  sourceMetadata?: BackgroundMusicAssignmentInput['sourceMetadata'];
  bpm: number | null;
}): {
  title: string;
  artists: string[];
  provider: string;
  sourceAssetId: string;
  bpm: number | null;
  providerTrackId?: string;
  isrcs?: string[];
  identityId?: string;
} {
  const metadata = input.sourceMetadata;
  const title = nonEmptyString(metadata?.title) ?? audioAssetDisplayTitle(input.sourceAsset);
  const artists = Array.isArray(metadata?.artists)
    ? metadata.artists.filter((artist): artist is string => Boolean(nonEmptyString(artist)))
    : [];
  const provider = nonEmptyString(metadata?.provider) ?? nonEmptyString(input.sourceAsset.source) ?? 'user-upload';
  const providerTrackId = nonEmptyString(metadata?.providerTrackId) ?? null;
  const isrcs = Array.isArray(metadata?.isrcs)
    ? metadata.isrcs.filter((isrc): isrc is string => Boolean(nonEmptyString(isrc)))
    : [];
  return {
    title,
    artists,
    provider,
    sourceAssetId: input.sourceAsset.assetId,
    bpm: input.bpm,
    ...(providerTrackId ? { providerTrackId } : {}),
    ...(isrcs.length > 0 ? { isrcs } : {}),
    ...(nonEmptyString(metadata?.identityId) ? { identityId: nonEmptyString(metadata?.identityId) as string } : {}),
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function withoutBuffer<T extends { buffer: Buffer }>(value: T): Omit<T, 'buffer'> {
  const { buffer: _buffer, ...evidence } = value;
  return evidence;
}

async function setDerivativeAssignmentStatusBestEffort(
  dependencies: BackgroundMusicAssignmentDependencies,
  assetId: string,
  status: 'attached' | 'orphaned',
): Promise<void> {
  try {
    await dependencies.setDerivativeAssignmentStatus(assetId, status);
  } catch (error) {
    console.warn(
      `[BackgroundMusicAssignment] Could not mark ${assetId} ${status}: ${errorMessage(error)}`,
    );
  }
}

function assignmentError(
  code: BackgroundMusicAssignmentErrorCode,
  message: string,
  httpStatus: number,
  cause?: unknown,
): BackgroundMusicAssignmentError {
  return new BackgroundMusicAssignmentError(code, message, httpStatus, { cause });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isProjectRevisionConflict(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'PROJECT_REVISION_CONFLICT',
  );
}
