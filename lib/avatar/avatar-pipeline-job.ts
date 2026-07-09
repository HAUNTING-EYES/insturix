import { randomUUID } from 'node:crypto';
import { MongoClient, type Db, type Filter, type IndexDescription } from 'mongodb';
import {
  evaluateAvatarProfileRenderReadiness,
  type AvatarVaultActorInput,
  type AvatarVaultApiResult,
} from './avatar-vault-api';
import type {
  AvatarFaceProvider,
  AvatarRenderAudioMode,
  AvatarRenderRecipe,
  AvatarRenderReferenceImage,
  AvatarRenderUseCase,
} from './avatar-render-recipe';
import type {
  AvatarStoreResult,
  AvatarVaultMongoCollection,
  AvatarVaultProfileStore,
} from './avatar-mongo-store';
import {
  createDefaultChatterboxClient,
  type ChatterboxClient,
  type ChatterboxSynthesizeInput,
  type ChatterboxSynthesizeResult,
} from './avatar-chatterbox-client';
import {
  createDefaultOmniHumanFalClient,
  createKlingAvatarFalClient,
  KLING_AVATAR_MODEL_IDS,
  OMNIHUMAN_FAL_MODEL_ID,
  type OmniHumanFalClient,
  type OmniHumanFalRefreshResult,
  type OmniHumanFalSubmitInput,
} from './avatar-omnihuman-fal';
import {
  dispatchAvatarComposition,
  pollAvatarComposition,
  type AvatarCameraMove,
  type AvatarCompositionDeps,
  type AvatarCompositionRenderRef,
} from './avatar-composition';
import { composeOmniHumanPrompt } from './avatar-motion-director';
import {
  stageAvatarReference,
  type ReferenceStagingInput,
  type ReferenceStagingResult,
} from './avatar-reference-staging';
import { KLING_LIPSYNC_MODEL_ID, RELIP_ALIGNMENT_TOLERANCE_SEC } from './avatar-relip';
import {
  RELIP_MAX_SHOT_SEC,
  measureWavDurationSec,
  fitLineToShotBudget,
  padWavToSec,
  type FitDecision,
} from './avatar-audio-fit';
import { buildKlingI2vInput } from './generate-avatar-shot';
import {
  createFalVideoJobClient,
  defaultFetchAudioBytes,
  defaultUploadAudio,
  defaultMeasureVideoDurationSec,
  type FalVideoJobClient,
} from './avatar-fal-video-job';
import { MODEL_CAPABILITIES } from '../shared/capabilities';

// Body-motion (lane B) fal model. Single-sourced from the capability registry.
const KLING_I2V_MODEL_ID = MODEL_CAPABILITIES['kling-2.6-i2v'].falModelId;

function requireKlingI2vModelId(): string {
  if (!KLING_I2V_MODEL_ID) throw new Error('kling-2.6-i2v has no fal model id in the capability registry.');
  return KLING_I2V_MODEL_ID;
}

export type AvatarPipelineJobStatus = 'blocked' | 'queued' | 'running' | 'succeeded' | 'failed';

export type AvatarPipelineJobDispatchCode =
  | 'pipeline_not_configured'
  | 'pipeline_input_blocked'
  | 'pipeline_adapter_not_implemented'
  | 'chatterbox_succeeded'
  | 'chatterbox_failed'
  | 'omnihuman_queued'
  | 'omnihuman_running'
  | 'omnihuman_succeeded'
  | 'omnihuman_failed'
  | 'body_queued'
  | 'body_running'
  | 'body_succeeded'
  | 'body_failed'
  | 'body_motion_needs_fit'
  | 'relip_queued'
  | 'relip_running'
  | 'relip_succeeded'
  | 'relip_failed'
  | 'remotion_composition_queued'
  | 'remotion_composition_succeeded'
  | 'remotion_composition_failed';

export type AvatarPipelineStageId =
  | 'voice_chatterbox'
  | 'face_omnihuman_fal'
  | 'body_i2v_fal'
  | 'relip_kling_fal'
  | 'composition_remotion';

export type AvatarPipelineStageStatus =
  | 'blocked'
  | 'ready'
  | 'waiting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped';

export type AvatarPipelineStageDispatchCode =
  | 'missing_chatterbox_endpoint'
  | 'missing_chatterbox_text'
  | 'missing_chatterbox_voice_reference'
  | 'external_audio_supplied'
  | 'chatterbox_succeeded'
  | 'chatterbox_failed'
  | 'missing_fal_key'
  | 'missing_human_image'
  | 'missing_omnihuman_audio'
  | 'omnihuman_duration_limit'
  | 'omnihuman_queued'
  | 'omnihuman_running'
  | 'omnihuman_succeeded'
  | 'omnihuman_failed'
  | 'missing_body_image'
  | 'body_duration_limit'
  | 'body_motion_needs_fit'
  | 'body_queued'
  | 'body_running'
  | 'body_succeeded'
  | 'body_failed'
  | 'waiting_for_body_video'
  | 'relip_queued'
  | 'relip_running'
  | 'relip_succeeded'
  | 'relip_failed'
  | 'stage_ready'
  | 'waiting_for_face_video'
  | 'remotion_composition_queued'
  | 'remotion_composition_succeeded'
  | 'remotion_composition_failed';

export interface AvatarPipelineStageSnapshot {
  id: AvatarPipelineStageId;
  label: string;
  providerId: 'chatterbox_tts' | 'fal_omnihuman_v1_5' | 'fal_kling_avatar' | 'fal_kling_i2v' | 'fal_kling_lipsync' | 'remotion';
  providerDisplayName: string;
  status: AvatarPipelineStageStatus;
  dispatchCode: AvatarPipelineStageDispatchCode;
  statusReason: string;
  requiredEnvKeys: string[];
  providerRequestId?: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface AvatarPipelineJobSnapshot {
  id: string;
  recordId: string;
  avatarId: string;
  userId: string;
  orgId?: string | null;
  brandId?: string | null;
  status: AvatarPipelineJobStatus;
  dispatchCode: AvatarPipelineJobDispatchCode;
  statusReason: string;
  recipe: AvatarRenderRecipe;
  stages: AvatarPipelineStageSnapshot[];
  requestBody: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AvatarPipelineJobListFilter {
  recordId?: string;
  userId?: string;
  orgId?: string | null;
  status?: AvatarPipelineJobStatus;
}

export interface AvatarPipelineJobStore {
  savePipelineJobSnapshot(snapshot: AvatarPipelineJobSnapshot): AvatarStoreResult<AvatarPipelineJobSnapshot>;
  getPipelineJobSnapshot(jobId: string): AvatarStoreResult<AvatarPipelineJobSnapshot | null>;
  listPipelineJobSnapshots?(filter?: AvatarPipelineJobListFilter): AvatarStoreResult<AvatarPipelineJobSnapshot[]>;
}

export interface CreateAvatarPipelineJobDependencies {
  profileStore?: AvatarVaultProfileStore;
  pipelineJobStore?: AvatarPipelineJobStore;
  now?: () => string;
  idGenerator?: () => string;
  env?: Record<string, string | undefined>;
  chatterboxClient?: ChatterboxClient;
  omniHumanClient?: OmniHumanFalClient;
  /**
   * Reference-staging adapter (Nano Banana wardrobe/scene). Injected in tests; the
   * default calls the real fal client. Runs once, in the face dispatch, before the
   * talking-head model animates the reference — see dispatchReadyOmniHumanJob.
   */
  stageReference?: (input: ReferenceStagingInput) => Promise<ReferenceStagingResult>;
  /** Lane B (body_motion): Kling i2v body client. Injected in tests; default = real fal. */
  klingI2vClient?: FalVideoJobClient;
  /** Lane B: fetch synthesized-voice bytes to measure the real WAV duration (fit gate). */
  fetchAudioBytes?: (url: string) => Promise<Buffer>;
}

export interface RefreshAvatarPipelineJobDependencies {
  pipelineJobStore?: AvatarPipelineJobStore;
  now?: () => string;
  env?: Record<string, string | undefined>;
  chatterboxClient?: ChatterboxClient;
  omniHumanClient?: OmniHumanFalClient;
  compositionDeps?: AvatarCompositionDeps;
  /** Lane B (body_motion) adapters — all injected in tests; defaults call the real services. */
  klingI2vClient?: FalVideoJobClient;
  klingLipsyncClient?: FalVideoJobClient;
  fetchAudioBytes?: (url: string) => Promise<Buffer>;
  uploadAudio?: (wav: Buffer, userId: string) => Promise<{ audioUrl: string }>;
  measureVideoDurationSec?: (url: string) => Promise<number | null>;
}

export interface CreateAvatarPipelineJobSuccessBody {
  ok: true;
  job: AvatarPipelineJobSnapshot;
  recipe: AvatarRenderRecipe;
}

export interface RefreshAvatarPipelineJobSuccessBody {
  ok: true;
  job: AvatarPipelineJobSnapshot;
}

export interface AvatarPipelineJobErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    issues?: unknown[];
  };
}

interface AvatarPipelineJobMongoDocument extends AvatarPipelineJobSnapshot {
  _id: string;
}

const AVATAR_PIPELINE_JOB_COLLECTION = 'avatar_pipeline_jobs';
const CHATTERBOX_ENDPOINT_KEYS = ['CHATTERBOX_TTS_ENDPOINT'];
const FAL_ENDPOINT_KEYS = ['FAL_AI_API_KEY', 'FAL_KEY'];

let cachedPipelineJobMongoClient: Promise<MongoClient> | null = null;

export class InMemoryAvatarPipelineJobStore implements AvatarPipelineJobStore {
  private readonly jobs = new Map<string, AvatarPipelineJobSnapshot>();

  constructor(snapshots: AvatarPipelineJobSnapshot[] = []) {
    for (const snapshot of snapshots) {
      this.jobs.set(snapshot.id, clone(snapshot));
    }
  }

  savePipelineJobSnapshot(snapshot: AvatarPipelineJobSnapshot): AvatarPipelineJobSnapshot {
    this.jobs.set(snapshot.id, clone(snapshot));
    return clone(snapshot);
  }

  getPipelineJobSnapshot(jobId: string): AvatarPipelineJobSnapshot | null {
    const snapshot = this.jobs.get(jobId);
    return snapshot ? clone(snapshot) : null;
  }

  listPipelineJobSnapshots(filter: AvatarPipelineJobListFilter = {}): AvatarPipelineJobSnapshot[] {
    return Array.from(this.jobs.values())
      .filter((snapshot) => matchesJobFilter(snapshot, filter))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(clone);
  }
}

export interface AvatarPipelineJobMongoStoreOptions {
  collection: AvatarVaultMongoCollection<AvatarPipelineJobMongoDocument> | (() => Promise<AvatarVaultMongoCollection<AvatarPipelineJobMongoDocument>>);
}

export class AvatarPipelineJobMongoStore implements AvatarPipelineJobStore {
  private ensuredIndexes = false;

  constructor(private readonly options: AvatarPipelineJobMongoStoreOptions) {}

  async savePipelineJobSnapshot(snapshot: AvatarPipelineJobSnapshot): Promise<AvatarPipelineJobSnapshot> {
    const collection = await this.getCollection();
    const doc = jobDocument(snapshot);
    await collection.updateOne(
      { _id: doc._id } as Filter<AvatarPipelineJobMongoDocument>,
      { $set: doc },
      { upsert: true },
    );
    return clone(snapshot);
  }

  async getPipelineJobSnapshot(jobId: string): Promise<AvatarPipelineJobSnapshot | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ _id: jobId } as Filter<AvatarPipelineJobMongoDocument>);
    return doc ? clone(stripMongoId(doc)) : null;
  }

  async listPipelineJobSnapshots(filter: AvatarPipelineJobListFilter = {}): Promise<AvatarPipelineJobSnapshot[]> {
    const collection = await this.getCollection();
    const docs = await collection
      .find(toJobFilter(filter))
      .sort({ updatedAt: -1 })
      .limit(250)
      .toArray();
    return docs.map((doc) => clone(stripMongoId(doc)));
  }

  private async getCollection(): Promise<AvatarVaultMongoCollection<AvatarPipelineJobMongoDocument>> {
    const collection = typeof this.options.collection === 'function'
      ? await this.options.collection()
      : this.options.collection;
    if (!this.ensuredIndexes) {
      await ensureJobIndexes(collection);
      this.ensuredIndexes = true;
    }
    return collection;
  }
}

export function createInMemoryAvatarPipelineJobStore(
  snapshots: AvatarPipelineJobSnapshot[] = [],
): InMemoryAvatarPipelineJobStore {
  return new InMemoryAvatarPipelineJobStore(snapshots);
}

export function createAvatarPipelineJobMongoStoreFromEnvironment(): AvatarPipelineJobMongoStore | null {
  const uri = process.env.AVATAR_VAULT_MONGODB_URI ?? process.env.MONGODB_URI;
  const dbName = process.env.AVATAR_VAULT_MONGODB_DB_NAME ?? process.env.EDITRON_MONGODB_DB_NAME ?? process.env.MONGODB_DB_NAME;
  if (!uri || !dbName || process.env.AVATAR_VAULT_PERSISTENCE === 'memory') return null;
  return new AvatarPipelineJobMongoStore({
    collection: async () => collectionFromDb((await getMongoClient(uri)).db(dbName)),
  });
}

export function getDefaultAvatarPipelineJobStore(): AvatarPipelineJobStore {
  const globalStore = globalThis as typeof globalThis & {
    __avatarPipelineJobStore?: AvatarPipelineJobStore;
  };
  globalStore.__avatarPipelineJobStore ??=
    createAvatarPipelineJobMongoStoreFromEnvironment() ?? createInMemoryAvatarPipelineJobStore();
  return globalStore.__avatarPipelineJobStore;
}

export async function createAvatarPipelineJobFromRequest(
  input: AvatarVaultActorInput & { recordId: string; body: unknown },
  dependencies: CreateAvatarPipelineJobDependencies = {},
): Promise<AvatarVaultApiResult<CreateAvatarPipelineJobSuccessBody | AvatarPipelineJobErrorBody>> {
  const recipeResult = await evaluateAvatarProfileRenderReadiness(input, {
    store: dependencies.profileStore,
    now: dependencies.now,
  });
  if (!recipeResult.body.ok) {
    return { status: recipeResult.status, body: recipeResult.body as AvatarPipelineJobErrorBody };
  }

  const { recipe } = recipeResult.body;
  if (!recipe.readiness.ready) {
    return fail(
      409,
      'recipe_not_ready',
      'Avatar render recipe must pass Avatar Vault readiness before a pipeline job can be created.',
      recipe.readiness.errors,
    );
  }

  const now = dependencies.now?.() ?? new Date().toISOString();
  const stages = buildAvatarPipelineStages(recipe, dependencies.env ?? process.env);
  const dispatch = resolvePipelineDispatch(stages);
  const job: AvatarPipelineJobSnapshot = {
    id: dependencies.idGenerator?.() ?? `avatar_pipeline_job_${randomUUID()}`,
    recordId: recipe.avatarRecordId,
    avatarId: recipe.avatarId,
    userId: recipe.userId,
    orgId: recipe.orgId ?? null,
    brandId: recipe.brandId ?? null,
    status: 'blocked',
    dispatchCode: dispatch.code,
    statusReason: dispatch.message,
    recipe,
    stages,
    requestBody: asRecord(input.body) ?? {},
    createdAt: now,
    updatedAt: now,
  };

  const store = dependencies.pipelineJobStore ?? getDefaultAvatarPipelineJobStore();
  const dispatchedJob = await dispatchReadyAvatarPipelineJob(job, dependencies);
  await store.savePipelineJobSnapshot(dispatchedJob);
  return {
    status: 201,
    body: {
      ok: true,
      job: dispatchedJob,
      recipe,
    },
  };
}

export async function refreshAvatarPipelineJobFromRequest(
  input: AvatarVaultActorInput & { jobId: string },
  dependencies: RefreshAvatarPipelineJobDependencies = {},
): Promise<AvatarVaultApiResult<RefreshAvatarPipelineJobSuccessBody | AvatarPipelineJobErrorBody>> {
  const store = dependencies.pipelineJobStore ?? getDefaultAvatarPipelineJobStore();
  const job = await store.getPipelineJobSnapshot(input.jobId);
  if (!job || !canReadPipelineJob(job, input)) {
    return fail(404, 'pipeline_job_not_found', 'Avatar pipeline job was not found.');
  }

  // Lane B polls the body → relip chain; lane A polls the single talking-head stage.
  const afterSource = job.recipe.renderModality === 'body_motion'
    ? await refreshBodyMotionJob(job, dependencies)
    : await refreshQueuedOmniHumanJob(job, dependencies);
  // Advance composition only when the source lane did NOT transition this cycle (it
  // already reached its terminal video on a prior refresh) — the refresh returns the
  // same job ref when nothing changed, keeping this to one stage-transition per poll.
  const refreshedJob = afterSource === job
    ? await advanceCompositionStage(afterSource, dependencies)
    : afterSource;
  await store.savePipelineJobSnapshot(refreshedJob);
  return {
    status: 200,
    body: {
      ok: true,
      job: refreshedJob,
    },
  };
}
// Camera moves are applied deterministically in the composition (Remotion), not by the
// face model — a subtle push-in for close-framed speech, static otherwise. Doing camera
// in composition (vs prompting the model) avoids the identity drift a moving model camera
// causes, and gives repeatable control.
function resolveCameraMove(recipe: AvatarRenderRecipe): AvatarCameraMove {
  return CLOSE_FRAME_USE_CASES.has(recipe.useCase) ? 'push_in' : 'static';
}

// After OmniHuman produces the raw face video, render it into a finished
// Editron-owned MP4 via the existing Remotion Lambda path, then poll to completion.
async function advanceCompositionStage(
  job: AvatarPipelineJobSnapshot,
  dependencies: RefreshAvatarPipelineJobDependencies,
): Promise<AvatarPipelineJobSnapshot> {
  const composition = findPipelineStage(job, 'composition_remotion');
  if (!composition) return job;
  const now = dependencies.now?.() ?? new Date().toISOString();
  const compositionDeps = dependencies.compositionDeps ?? {};

  // The terminal video comes from the face stage (lane A) or the relip stage (lane B);
  // either writes it to composition.input.faceVideo, so composition stays lane-agnostic.
  const sourceStageId: AvatarPipelineStageId = job.recipe.renderModality === 'body_motion'
    ? 'relip_kling_fal'
    : 'face_omnihuman_fal';
  const sourceStage = findPipelineStage(job, sourceStageId);
  const faceVideoUrl = stringValue(asRecord(composition.input.faceVideo)?.videoUrl);

  // 1) Dispatch once the source video exists and composition has not started.
  if (composition.status === 'waiting' && sourceStage?.status === 'succeeded' && faceVideoUrl) {
    try {
      const ref = await dispatchAvatarComposition(
        {
          faceVideoUrl,
          durationSeconds: job.recipe.target.durationSeconds,
          aspectRatio: job.recipe.target.aspectRatio,
          resolution: job.recipe.target.resolution,
          displayName: job.recipe.visual.displayName,
          script: job.recipe.creative?.script,
          cameraMove: resolveCameraMove(job.recipe),
        },
        compositionDeps,
      );
      return applyCompositionDispatched(job, ref, now);
    } catch (error) {
      return failCompositionJob(job, now, `Avatar composition dispatch failed: ${errorMessage(error)}`);
    }
  }

  // 2) Poll a running composition render until it produces the final video URL.
  if (composition.status === 'running' && composition.dispatchCode === 'remotion_composition_queued') {
    const ref = compositionRenderRef(composition);
    if (!ref) return job;
    try {
      const status = await pollAvatarComposition(ref, compositionDeps);
      if (status.errorMessage) return failCompositionJob(job, now, `Avatar composition render failed: ${status.errorMessage}`);
      if (status.done && status.outputUrl) return applyCompositionSucceeded(job, status.outputUrl, now);
      return job; // still rendering
    } catch (error) {
      return failCompositionJob(job, now, `Avatar composition status refresh failed: ${errorMessage(error)}`);
    }
  }

  return job;
}

function compositionRenderRef(stageSnapshot: AvatarPipelineStageSnapshot): AvatarCompositionRenderRef | null {
  const output = asRecord(stageSnapshot.output);
  const renderId = stringValue(output?.renderId);
  const bucketName = stringValue(output?.bucketName);
  const region = stringValue(output?.region);
  if (!renderId || !bucketName || !region) return null;
  return { renderId, bucketName, region };
}

function applyCompositionDispatched(
  job: AvatarPipelineJobSnapshot,
  ref: AvatarCompositionRenderRef,
  now: string,
): AvatarPipelineJobSnapshot {
  return {
    ...job,
    status: 'running',
    dispatchCode: 'remotion_composition_queued',
    statusReason: `Avatar composition render queued (${ref.renderId}). Poll until the final video is ready.`,
    stages: job.stages.map((pipelineStage) => pipelineStage.id === 'composition_remotion'
      ? {
          ...pipelineStage,
          status: 'running',
          dispatchCode: 'remotion_composition_queued',
          statusReason: `Remotion composition render queued (${ref.renderId}).`,
          providerRequestId: ref.renderId,
          output: { ...(pipelineStage.output ?? {}), renderId: ref.renderId, bucketName: ref.bucketName, region: ref.region },
        }
      : pipelineStage),
    updatedAt: now,
  };
}

function applyCompositionSucceeded(
  job: AvatarPipelineJobSnapshot,
  outputUrl: string,
  now: string,
): AvatarPipelineJobSnapshot {
  return {
    ...job,
    status: 'succeeded',
    dispatchCode: 'remotion_composition_succeeded',
    statusReason: 'Avatar video is composed and ready.',
    stages: job.stages.map((pipelineStage) => pipelineStage.id === 'composition_remotion'
      ? {
          ...pipelineStage,
          status: 'succeeded',
          dispatchCode: 'remotion_composition_succeeded',
          statusReason: 'Remotion composition render completed.',
          output: { ...(pipelineStage.output ?? {}), videoUrl: outputUrl },
        }
      : pipelineStage),
    updatedAt: now,
  };
}

function failCompositionJob(job: AvatarPipelineJobSnapshot, now: string, reason: string): AvatarPipelineJobSnapshot {
  return {
    ...job,
    status: 'failed',
    dispatchCode: 'remotion_composition_failed',
    statusReason: reason,
    stages: job.stages.map((pipelineStage) => pipelineStage.id === 'composition_remotion'
      ? {
          ...pipelineStage,
          status: 'failed',
          dispatchCode: 'remotion_composition_failed',
          statusReason: reason,
          output: { ...(pipelineStage.output ?? {}), errorMessage: reason },
        }
      : pipelineStage),
    updatedAt: now,
  };
}

export function buildAvatarPipelineStages(
  recipe: AvatarRenderRecipe,
  env: Record<string, string | undefined> = process.env,
): AvatarPipelineStageSnapshot[] {
  const voiceStage = buildChatterboxStage(recipe, env);
  // Lane B ("more than talking"): Kling i2v animates the body/scene from the reference,
  // then Kling LipSync relips the mouth onto the cloned voice — two async stages in place
  // of the single talking-head stage. Lane A (default) stays exactly as before.
  if (recipe.renderModality === 'body_motion') {
    return [
      voiceStage,
      buildBodyMotionStage(recipe, env),
      buildRelipStage(recipe),
      buildRemotionStage(recipe),
    ];
  }
  return [
    voiceStage,
    buildOmniHumanStage(recipe, env, voiceStage),
    buildRemotionStage(recipe),
  ];
}

function buildChatterboxStage(
  recipe: AvatarRenderRecipe,
  env: Record<string, string | undefined>,
): AvatarPipelineStageSnapshot {
  const existingAudio = resolveExistingAudio(recipe.audio.mode, recipe.audio.sourceUrl, recipe.audio.sourceAssetId);
  const text = recipe.audio.voiceoverText ?? recipe.creative.script;
  const voiceReference = resolveVoiceReference(recipe);
  const input = {
    model: resolveChatterboxModel(recipe),
    text,
    language: recipe.audio.voiceSource.language ?? 'en',
    voiceReference,
    output: { format: 'wav' },
  };

  if (existingAudio) {
    return stage({
      id: 'voice_chatterbox',
      label: 'Generate voice',
      providerId: 'chatterbox_tts',
      providerDisplayName: 'Chatterbox TTS',
      status: 'skipped',
      dispatchCode: 'external_audio_supplied',
      statusReason: 'A voiceover audio source was supplied, so Chatterbox does not need to generate this stage.',
      requiredEnvKeys: [],
      input: { ...input, existingAudio },
      output: { audioUrl: recipe.audio.sourceUrl, audioAssetId: recipe.audio.sourceAssetId },
    });
  }

  if (!text) {
    return blockedChatterboxStage('missing_chatterbox_text', 'Chatterbox needs script or audio.voiceoverText to synthesize the avatar voice.', input);
  }
  if (!voiceReference.assetId && !voiceReference.voiceProfileId && !voiceReference.url) {
    return blockedChatterboxStage('missing_chatterbox_voice_reference', 'Chatterbox needs an uploaded voice sample or imported voice profile reference.', input);
  }
  if (!hasAnyEnv(env, CHATTERBOX_ENDPOINT_KEYS)) {
    return blockedChatterboxStage('missing_chatterbox_endpoint', 'CHATTERBOX_TTS_ENDPOINT is not configured, so voice synthesis cannot be dispatched.', input);
  }

  return stage({
    id: 'voice_chatterbox',
    label: 'Generate voice',
    providerId: 'chatterbox_tts',
    providerDisplayName: 'Chatterbox TTS',
    status: 'ready',
    dispatchCode: 'stage_ready',
    statusReason: 'Chatterbox voice synthesis is configured and ready for the execution adapter.',
    requiredEnvKeys: CHATTERBOX_ENDPOINT_KEYS,
    input,
  });
}

interface FaceProviderDescriptor {
  provider: AvatarFaceProvider;
  modelId: string;
  providerId: 'fal_omnihuman_v1_5' | 'fal_kling_avatar';
  displayName: string;
  createClient: (env: Record<string, string | undefined>) => OmniHumanFalClient;
}

/**
 * Kling AI Avatar is the default face model — it holds identity far better and is
 * ~3x cheaper than OmniHuman (bake-off 2026-07-06). Pro is the premium tier;
 * OmniHuman stays available as a fallback. All three share the fal queue contract.
 */
function resolveFaceProvider(provider: AvatarFaceProvider | undefined): FaceProviderDescriptor {
  switch (provider) {
    case 'omnihuman':
      return {
        provider: 'omnihuman',
        modelId: OMNIHUMAN_FAL_MODEL_ID,
        providerId: 'fal_omnihuman_v1_5',
        displayName: 'fal OmniHuman v1.5',
        createClient: (env) => createDefaultOmniHumanFalClient(env),
      };
    case 'kling_pro':
      return {
        provider: 'kling_pro',
        modelId: KLING_AVATAR_MODEL_IDS.pro,
        providerId: 'fal_kling_avatar',
        displayName: 'Kling AI Avatar v2 Pro',
        createClient: (env) => createKlingAvatarFalClient(env, 'pro'),
      };
    case 'kling_standard':
    default:
      return {
        provider: 'kling_standard',
        modelId: KLING_AVATAR_MODEL_IDS.standard,
        providerId: 'fal_kling_avatar',
        displayName: 'Kling AI Avatar',
        createClient: (env) => createKlingAvatarFalClient(env, 'standard'),
      };
  }
}

/** Pick the talking-head client for a face stage: test override wins, else the stage's provider. */
function faceClientForStage(
  faceStage: AvatarPipelineStageSnapshot,
  override: OmniHumanFalClient | undefined,
  env: Record<string, string | undefined>,
): OmniHumanFalClient {
  if (override) return override;
  const provider = stringValue(faceStage.input.provider) as AvatarFaceProvider | undefined;
  return resolveFaceProvider(provider).createClient(env);
}

function buildOmniHumanStage(
  recipe: AvatarRenderRecipe,
  env: Record<string, string | undefined>,
  voiceStage: AvatarPipelineStageSnapshot,
): AvatarPipelineStageSnapshot {
  const faceProvider = resolveFaceProvider(recipe.faceProvider);
  const image = selectHumanImage(recipe.visual.referenceImages, recipe.useCase);
  const audio = resolveOmniHumanAudio(recipe, voiceStage);
  const input = {
    model: faceProvider.modelId,
    provider: faceProvider.provider,
    prompt: composeOmniHumanPrompt(recipe),
    image,
    audio,
    staging: buildAvatarStagingConfig(recipe),
    resolution: recipe.target.resolution,
    durationSeconds: recipe.target.durationSeconds,
    aspectRatio: recipe.target.aspectRatio,
  };

  if (!image?.imageUrl) {
    return blockedOmniHumanStage(faceProvider, 'missing_human_image', 'The avatar model needs a usable human reference image URL.', input);
  }
  if (!audio.sourceUrl && !audio.sourceAssetId && !audio.dependsOnStageId) {
    return blockedOmniHumanStage(faceProvider, 'missing_omnihuman_audio', 'The avatar model needs uploaded audio or the Chatterbox voice stage output.', input);
  }
  if (exceedsOmniHumanDurationLimit(recipe.target.resolution, recipe.target.durationSeconds)) {
    return blockedOmniHumanStage(faceProvider, 'omnihuman_duration_limit', 'Avatar renders are limited to 30s at 1080p and 60s at 720p.', input);
  }
  if (!hasAnyEnv(env, FAL_ENDPOINT_KEYS)) {
    return blockedOmniHumanStage(faceProvider, 'missing_fal_key', 'FAL_AI_API_KEY or FAL_KEY is not configured, so the avatar model cannot be dispatched.', input);
  }

  return stage({
    id: 'face_omnihuman_fal',
    label: 'Animate avatar',
    providerId: faceProvider.providerId,
    providerDisplayName: faceProvider.displayName,
    status: 'ready',
    dispatchCode: 'stage_ready',
    statusReason: `${faceProvider.displayName} is configured and ready for the execution adapter.`,
    requiredEnvKeys: FAL_ENDPOINT_KEYS,
    input,
  });
}

/**
 * Reference-staging config carried on the face stage. Staging turns the user's raw
 * photos into a top-tier, scene/wardrobe-staged, identity-locked still (Nano Banana)
 * BEFORE the talking-head model animates it. The reference image is the quality
 * ceiling: a clean staged still cuts the identity drift and weird-mouth artifacts the
 * founder hit on camera moves, and realizes "wardrobe" — the look already on the recipe
 * IS the staging prompt.
 *
 * Enabled only when the profile carries a wardrobe/look (recipe.visual.wardrobe). Its
 * presence is the signal the user wants a staged look; absence ⇒ no staging ⇒ the raw
 * portrait is animated exactly as before (behavior-preserving, no surprise fal cost).
 */
function buildAvatarStagingConfig(recipe: AvatarRenderRecipe): {
  enabled: boolean;
  scenePrompt: string;
  sourceImageUrls: string[];
} {
  const scenePrompt = recipe.visual.wardrobe?.trim() ?? '';
  const sourceImageUrls = recipe.visual.referenceImages
    .filter((ref) => ref.role !== 'product' && typeof ref.imageUrl === 'string' && ref.imageUrl.trim())
    .map((ref) => ref.imageUrl as string);
  return {
    enabled: Boolean(scenePrompt) && sourceImageUrls.length > 0,
    scenePrompt,
    sourceImageUrls,
  };
}

function buildRemotionStage(recipe: AvatarRenderRecipe): AvatarPipelineStageSnapshot {
  return stage({
    id: 'composition_remotion',
    label: 'Composite final video',
    providerId: 'remotion',
    providerDisplayName: 'Remotion',
    status: 'waiting',
    dispatchCode: 'waiting_for_face_video',
    statusReason: 'Remotion composition waits for the OmniHuman face video output before stitching backgrounds, product media, captions, and audio.',
    requiredEnvKeys: [],
    input: {
      aspectRatio: recipe.target.aspectRatio,
      durationSeconds: recipe.target.durationSeconds,
      resolution: recipe.target.resolution,
      productImages: recipe.visual.referenceImages.filter((ref) => ref.role === 'product'),
      soundCues: recipe.audio.soundCues,
      editronContract: recipe.editronContract,
    },
  });
}

// Lane B stage 1: Kling 2.6 i2v animates the body/scene from the (staged) reference
// still — no audio, the voice arrives at the relip stage. Capped at the 10s relip budget.
function buildBodyMotionStage(
  recipe: AvatarRenderRecipe,
  env: Record<string, string | undefined>,
): AvatarPipelineStageSnapshot {
  const image = selectHumanImage(recipe.visual.referenceImages, recipe.useCase);
  const durationSeconds = Math.min(recipe.target.durationSeconds, RELIP_MAX_SHOT_SEC);
  const input = {
    model: KLING_I2V_MODEL_ID,
    provider: 'kling_i2v',
    prompt: composeOmniHumanPrompt(recipe),
    image,
    staging: buildAvatarStagingConfig(recipe),
    resolution: recipe.target.resolution,
    durationSeconds,
    aspectRatio: recipe.target.aspectRatio,
  };

  if (!image?.imageUrl) {
    return blockedBodyMotionStage('missing_body_image', 'Kling i2v needs a usable human reference image URL to animate.', input);
  }
  if (recipe.target.durationSeconds > RELIP_MAX_SHOT_SEC) {
    return blockedBodyMotionStage(
      'body_duration_limit',
      `Body-motion shots are capped at ${RELIP_MAX_SHOT_SEC}s (the Kling LipSync relip cap). Longer speech is many shots, stitched in Editron.`,
      input,
    );
  }
  if (!hasAnyEnv(env, FAL_ENDPOINT_KEYS)) {
    return blockedBodyMotionStage('missing_fal_key', 'FAL_AI_API_KEY or FAL_KEY is not configured, so the body model cannot be dispatched.', input);
  }

  return stage({
    id: 'body_i2v_fal',
    label: 'Animate body',
    providerId: 'fal_kling_i2v',
    providerDisplayName: 'Kling 2.6 i2v',
    status: 'ready',
    dispatchCode: 'stage_ready',
    statusReason: 'Kling 2.6 i2v is configured and ready to animate the body from the reference.',
    requiredEnvKeys: FAL_ENDPOINT_KEYS,
    input,
  });
}

function blockedBodyMotionStage(
  dispatchCode: AvatarPipelineStageDispatchCode,
  statusReason: string,
  input: Record<string, unknown>,
): AvatarPipelineStageSnapshot {
  return stage({
    id: 'body_i2v_fal',
    label: 'Animate body',
    providerId: 'fal_kling_i2v',
    providerDisplayName: 'Kling 2.6 i2v',
    status: 'blocked',
    dispatchCode,
    statusReason,
    requiredEnvKeys: dispatchCode === 'missing_fal_key' ? FAL_ENDPOINT_KEYS : [],
    input,
  });
}

// Lane B stage 2: Kling LipSync relips the mouth of the i2v body video onto the aligned
// cloned voice. Waits for BOTH the body video and the padded voice — dispatched from the
// body-stage poll once they exist (see Phase 2). Bound to the 10s input-video cap.
function buildRelipStage(recipe: AvatarRenderRecipe): AvatarPipelineStageSnapshot {
  return stage({
    id: 'relip_kling_fal',
    label: 'Sync mouth',
    providerId: 'fal_kling_lipsync',
    providerDisplayName: 'Kling LipSync',
    status: 'waiting',
    dispatchCode: 'waiting_for_body_video',
    statusReason: 'Kling LipSync waits for the Kling i2v body video and the aligned cloned voice before relipping the mouth.',
    requiredEnvKeys: FAL_ENDPOINT_KEYS,
    input: {
      model: KLING_LIPSYNC_MODEL_ID,
      provider: 'kling_lipsync',
      dependsOnBodyStageId: 'body_i2v_fal',
      dependsOnVoiceStageId: 'voice_chatterbox',
      maxShotSeconds: RELIP_MAX_SHOT_SEC,
      resolution: recipe.target.resolution,
      aspectRatio: recipe.target.aspectRatio,
    },
  });
}

function resolvePipelineDispatch(stages: AvatarPipelineStageSnapshot[]): {
  code: AvatarPipelineJobDispatchCode;
  message: string;
} {
  const blockedStages = stages.filter((pipelineStage) => pipelineStage.status === 'blocked');
  const missingConfig = blockedStages.filter((pipelineStage) => pipelineStage.dispatchCode === 'missing_chatterbox_endpoint' || pipelineStage.dispatchCode === 'missing_fal_key');
  if (missingConfig.length > 0) {
    return {
      code: 'pipeline_not_configured',
      message: `Avatar pipeline is saved, but required configuration is missing: ${missingConfig.map((pipelineStage) => pipelineStage.requiredEnvKeys.join(' or ')).join(', ')}.`,
    };
  }
  if (blockedStages.length > 0) {
    return {
      code: 'pipeline_input_blocked',
      message: `Avatar pipeline is saved, but ${blockedStages.length} stage input issue(s) must be resolved before dispatch.`,
    };
  }
  return {
    code: 'pipeline_adapter_not_implemented',
    message: 'Avatar pipeline contract is ready, but the Chatterbox, fal OmniHuman, and Remotion execution adapters are not wired in this build yet.',
  };
}

async function dispatchReadyAvatarPipelineJob(
  job: AvatarPipelineJobSnapshot,
  dependencies: Pick<
    CreateAvatarPipelineJobDependencies,
    'env' | 'now' | 'chatterboxClient' | 'omniHumanClient' | 'stageReference' | 'klingI2vClient' | 'fetchAudioBytes'
  >,
): Promise<AvatarPipelineJobSnapshot> {
  // Lane B: synth+measure+fit-gate the voice, then submit the body i2v. Voice is not
  // routed to a talking-head model — it arrives at the relip stage (see refresh).
  if (job.recipe.renderModality === 'body_motion') {
    return dispatchReadyBodyMotionJob(job, dependencies);
  }
  const voicePreparedJob = await dispatchReadyChatterboxJob(job, dependencies);
  if (voicePreparedJob.status === 'failed') return voicePreparedJob;
  return dispatchReadyOmniHumanJob(voicePreparedJob, dependencies);
}

async function dispatchReadyChatterboxJob(
  job: AvatarPipelineJobSnapshot,
  dependencies: Pick<CreateAvatarPipelineJobDependencies, 'env' | 'now' | 'chatterboxClient'>,
): Promise<AvatarPipelineJobSnapshot> {
  if (job.dispatchCode !== 'pipeline_adapter_not_implemented') return job;
  const voiceStage = findPipelineStage(job, 'voice_chatterbox');
  const omniHumanStage = findPipelineStage(job, 'face_omnihuman_fal');
  const omniHumanAudio = asRecord(omniHumanStage?.input.audio);
  if (
    !voiceStage
    || !omniHumanStage
    || voiceStage.status !== 'ready'
    || omniHumanAudio?.dependsOnStageId !== 'voice_chatterbox'
  ) {
    return job;
  }

  const synthesizeInput = toChatterboxSynthesizeInput(voiceStage, job.userId);
  if (!synthesizeInput) return job;

  const now = dependencies.now?.() ?? new Date().toISOString();
  try {
    const client = dependencies.chatterboxClient ?? createDefaultChatterboxClient(dependencies.env ?? process.env);
    const synthesized = await client.synthesize(synthesizeInput);
    return applyChatterboxSynthesis(job, voiceStage, omniHumanStage, synthesized, now);
  } catch (error) {
    return failChatterboxJob(job, now, `Chatterbox voice synthesis failed: ${errorMessage(error)}`);
  }
}

function applyChatterboxSynthesis(
  job: AvatarPipelineJobSnapshot,
  voiceStage: AvatarPipelineStageSnapshot,
  omniHumanStage: AvatarPipelineStageSnapshot,
  synthesized: ChatterboxSynthesizeResult,
  now: string,
): AvatarPipelineJobSnapshot {
  return {
    ...job,
    status: 'running',
    dispatchCode: 'chatterbox_succeeded',
    statusReason: 'Chatterbox generated the avatar voiceover from the saved voice reference. OmniHuman dispatch is next.',
    stages: job.stages.map((pipelineStage) => {
      if (pipelineStage.id === voiceStage.id) {
        return {
          ...pipelineStage,
          status: 'succeeded',
          dispatchCode: 'chatterbox_succeeded',
          statusReason: 'Chatterbox generated the avatar voiceover from the saved voice reference.',
          providerRequestId: synthesized.providerRequestId,
          output: {
            ...(pipelineStage.output ?? {}),
            audioUrl: synthesized.audioUrl,
            audioAssetId: synthesized.audioAssetId,
            providerRequestId: synthesized.providerRequestId,
          },
        };
      }
      if (pipelineStage.id === omniHumanStage.id) {
        return {
          ...pipelineStage,
          input: {
            ...pipelineStage.input,
            audio: {
              sourceUrl: synthesized.audioUrl,
              sourceAssetId: synthesized.audioAssetId,
              generatedByStageId: 'voice_chatterbox',
            },
          },
        };
      }
      return pipelineStage;
    }),
    updatedAt: now,
  };
}

function failChatterboxJob(job: AvatarPipelineJobSnapshot, now: string, reason: string): AvatarPipelineJobSnapshot {
  return {
    ...job,
    status: 'failed',
    dispatchCode: 'chatterbox_failed',
    statusReason: reason,
    stages: job.stages.map((pipelineStage) => pipelineStage.id === 'voice_chatterbox'
      ? {
          ...pipelineStage,
          status: 'failed',
          dispatchCode: 'chatterbox_failed',
          statusReason: reason,
          output: {
            ...(pipelineStage.output ?? {}),
            errorMessage: reason,
          },
        }
      : pipelineStage),
    updatedAt: now,
  };
}

async function dispatchReadyOmniHumanJob(
  job: AvatarPipelineJobSnapshot,
  dependencies: Pick<CreateAvatarPipelineJobDependencies, 'env' | 'now' | 'omniHumanClient' | 'stageReference'>,
): Promise<AvatarPipelineJobSnapshot> {
  if (
    job.dispatchCode !== 'pipeline_adapter_not_implemented'
    && job.dispatchCode !== 'chatterbox_succeeded'
  ) return job;
  const omniHumanStage = findPipelineStage(job, 'face_omnihuman_fal');
  if (!omniHumanStage || omniHumanStage.status !== 'ready') return job;

  const submitInput = toOmniHumanSubmitInput(omniHumanStage);
  if (!submitInput) return job;

  const now = dependencies.now?.() ?? new Date().toISOString();

  // Reference staging (Nano Banana wardrobe/scene) runs once, here, before the
  // talking-head model sees the image: stage the raw photos into a top-tier,
  // identity-locked still, then animate THAT. Fail loud on error — never silently
  // animate the un-staged portrait, which would ship a different (worse) product than
  // the user asked for (R18N). Skipped entirely when no wardrobe/look is configured.
  const staging = readAvatarStagingConfig(omniHumanStage);
  let stagedImageUrl: string | undefined;
  if (staging) {
    try {
      const stageReference = dependencies.stageReference
        ?? ((input: ReferenceStagingInput) => stageAvatarReference(input));
      const staged = await stageReference({
        sourceImageUrls: staging.sourceImageUrls,
        scenePrompt: staging.scenePrompt,
      });
      stagedImageUrl = staged.imageUrl;
      submitInput.imageUrl = stagedImageUrl;
    } catch (error) {
      return failOmniHumanJob(job, now, `Reference staging failed: ${errorMessage(error)}`);
    }
  }

  try {
    const client = faceClientForStage(omniHumanStage, dependencies.omniHumanClient, dependencies.env ?? process.env);
    const submitted = await client.submit(submitInput);
    return {
      ...job,
      status: 'queued',
      dispatchCode: 'omnihuman_queued',
      statusReason: `fal OmniHuman v1.5 queued request ${submitted.requestId}. Poll this pipeline job until the raw face video is available.`,
      stages: job.stages.map((pipelineStage) => pipelineStage.id === 'face_omnihuman_fal'
        ? {
            ...pipelineStage,
            status: 'running',
            dispatchCode: 'omnihuman_queued',
            statusReason: `fal OmniHuman v1.5 request ${submitted.requestId} is queued.`,
            providerRequestId: submitted.requestId,
            input: {
              ...pipelineStage.input,
              ...(stagedImageUrl ? { stagedImageUrl } : {}),
              fal: {
                modelId: submitted.modelId,
                input: submitted.input,
              },
            },
            output: {
              requestId: submitted.requestId,
              modelId: submitted.modelId,
              ...(stagedImageUrl ? { stagedImageUrl } : {}),
            },
          }
        : pipelineStage),
      updatedAt: now,
    };
  } catch (error) {
    return failOmniHumanJob(job, now, `fal OmniHuman dispatch failed: ${errorMessage(error)}`);
  }
}

async function refreshQueuedOmniHumanJob(
  job: AvatarPipelineJobSnapshot,
  dependencies: RefreshAvatarPipelineJobDependencies,
): Promise<AvatarPipelineJobSnapshot> {
  const omniHumanStage = findPipelineStage(job, 'face_omnihuman_fal');
  const requestId = omniHumanStage?.providerRequestId ?? stringValue(asRecord(omniHumanStage?.output)?.requestId);
  if (!omniHumanStage || !requestId || omniHumanStage.status === 'succeeded' || omniHumanStage.status === 'failed') {
    return job;
  }

  const now = dependencies.now?.() ?? new Date().toISOString();
  try {
    const client = faceClientForStage(omniHumanStage, dependencies.omniHumanClient, dependencies.env ?? process.env);
    const refresh = await client.refresh(requestId);
    return applyOmniHumanRefresh(job, omniHumanStage, refresh, now);
  } catch (error) {
    return failOmniHumanJob(job, now, `fal OmniHuman status refresh failed: ${errorMessage(error)}`);
  }
}

function applyOmniHumanRefresh(
  job: AvatarPipelineJobSnapshot,
  omniHumanStage: AvatarPipelineStageSnapshot,
  refresh: OmniHumanFalRefreshResult,
  now: string,
): AvatarPipelineJobSnapshot {
  if (refresh.status === 'failed') {
    return failOmniHumanJob(
      job,
      now,
      refresh.errorMessage
        ? `fal OmniHuman failed: ${refresh.errorMessage}`
        : `fal OmniHuman request ${refresh.requestId} failed with status ${refresh.providerStatus}.`,
    );
  }

  if (refresh.status !== 'succeeded') {
    const dispatchCode: AvatarPipelineStageDispatchCode = refresh.status === 'queued'
      ? 'omnihuman_queued'
      : 'omnihuman_running';
    return {
      ...job,
      status: refresh.status === 'queued' ? 'queued' : 'running',
      dispatchCode: dispatchCode === 'omnihuman_queued' ? 'omnihuman_queued' : 'omnihuman_running',
      statusReason: `fal OmniHuman request ${refresh.requestId} is ${refresh.providerStatus || refresh.status}.`,
      stages: job.stages.map((pipelineStage) => pipelineStage.id === omniHumanStage.id
        ? {
            ...pipelineStage,
            status: 'running',
            dispatchCode,
            statusReason: `fal OmniHuman request ${refresh.requestId} is ${refresh.providerStatus || refresh.status}.`,
            providerRequestId: refresh.requestId,
            output: {
              ...(pipelineStage.output ?? {}),
              requestId: refresh.requestId,
              modelId: refresh.modelId,
              providerStatus: refresh.providerStatus,
            },
          }
        : pipelineStage),
      updatedAt: now,
    };
  }

  if (!refresh.videoUrl) {
    return failOmniHumanJob(job, now, `fal OmniHuman request ${refresh.requestId} completed without a video URL.`);
  }

  return {
    ...job,
    status: 'running',
    dispatchCode: 'omnihuman_succeeded',
    statusReason: 'fal OmniHuman returned the raw face video. Remotion composition is still pending.',
    stages: job.stages.map((pipelineStage) => {
      if (pipelineStage.id === omniHumanStage.id) {
        return {
          ...pipelineStage,
          status: 'succeeded',
          dispatchCode: 'omnihuman_succeeded',
          statusReason: 'fal OmniHuman returned the raw face video.',
          providerRequestId: refresh.requestId,
          output: {
            ...(pipelineStage.output ?? {}),
            requestId: refresh.requestId,
            modelId: refresh.modelId,
            providerStatus: refresh.providerStatus,
            videoUrl: refresh.videoUrl,
            durationSeconds: refresh.durationSeconds,
          },
        };
      }
      if (pipelineStage.id === 'composition_remotion') {
        return {
          ...pipelineStage,
          input: {
            ...pipelineStage.input,
            faceVideo: {
              providerId: omniHumanStage.providerId,
              requestId: refresh.requestId,
              videoUrl: refresh.videoUrl,
              durationSeconds: refresh.durationSeconds,
            },
          },
        };
      }
      return pipelineStage;
    }),
    updatedAt: now,
  };
}

function failOmniHumanJob(job: AvatarPipelineJobSnapshot, now: string, reason: string): AvatarPipelineJobSnapshot {
  return {
    ...job,
    status: 'failed',
    dispatchCode: 'omnihuman_failed',
    statusReason: reason,
    stages: job.stages.map((pipelineStage) => pipelineStage.id === 'face_omnihuman_fal'
      ? {
          ...pipelineStage,
          status: 'failed',
          dispatchCode: 'omnihuman_failed',
          statusReason: reason,
          output: {
            ...(pipelineStage.output ?? {}),
            errorMessage: reason,
          },
        }
      : pipelineStage),
    updatedAt: now,
  };
}

// ─── Lane B (body_motion): async body i2v → relip pipeline ──────────────────────
//
// CREATE: synth the cloned voice (or take supplied audio), MEASURE the real WAV, fit it
// to the ≤10s relip budget BEFORE spending on the body render. Overrun ⇒ stop at
// body_motion_needs_fit. Else stage the reference and submit the Kling i2v body render.

interface BodyMotionVoice {
  audioUrl: string;
  audioAssetId?: string;
}

async function dispatchReadyBodyMotionJob(
  job: AvatarPipelineJobSnapshot,
  dependencies: Pick<
    CreateAvatarPipelineJobDependencies,
    'env' | 'now' | 'chatterboxClient' | 'stageReference' | 'klingI2vClient' | 'fetchAudioBytes'
  >,
): Promise<AvatarPipelineJobSnapshot> {
  if (job.dispatchCode !== 'pipeline_adapter_not_implemented') return job;
  const bodyStage = findPipelineStage(job, 'body_i2v_fal');
  const voiceStage = findPipelineStage(job, 'voice_chatterbox');
  if (!bodyStage || bodyStage.status !== 'ready' || !voiceStage) return job;

  const now = dependencies.now?.() ?? new Date().toISOString();
  try {
    // 1. Cloned voice (synth) or supplied audio.
    const voice = await resolveBodyMotionVoice(job, voiceStage, dependencies);

    // 2. Measure the real VO and fit to the shot budget — audio-first, never estimate.
    const fetchAudioBytes = dependencies.fetchAudioBytes ?? defaultFetchAudioBytes;
    const bytes = await fetchAudioBytes(voice.audioUrl);
    const measuredSec = measureWavDurationSec(bytes);
    if (measuredSec === null) {
      throw new Error('Could not measure the voice duration (not a parseable WAV). Fix the synth output; do not estimate.');
    }
    const budget = Math.min(numberValue(bodyStage.input.durationSeconds) ?? RELIP_MAX_SHOT_SEC, RELIP_MAX_SHOT_SEC);
    const fit = fitLineToShotBudget(measuredSec, budget);
    if (fit.action !== 'ok') {
      return applyBodyMotionNeedsFit(job, voiceStage, voice, measuredSec, fit, now);
    }

    // 3. Stage the reference (wardrobe/scene) before animating — same lever as the face lane.
    const staging = readAvatarStagingConfig(bodyStage);
    let imageUrl = stringValue(asRecord(bodyStage.input.image)?.imageUrl);
    let stagedImageUrl: string | undefined;
    if (staging) {
      const stageReference = dependencies.stageReference ?? ((i: ReferenceStagingInput) => stageAvatarReference(i));
      const staged = await stageReference({ sourceImageUrls: staging.sourceImageUrls, scenePrompt: staging.scenePrompt });
      stagedImageUrl = staged.imageUrl;
      imageUrl = stagedImageUrl;
    }
    if (!imageUrl) throw new Error('Body motion has no reference image to animate.');

    // 4. Submit the Kling i2v body render (to the measured VO; the adapter snaps 5/10s).
    const { input: i2vInput, durationSec } = buildKlingI2vInput({
      avatarImageRefs: [imageUrl],
      motionPrompt: stringValue(bodyStage.input.prompt),
      durationSec: Math.min(Math.max(Math.ceil(measuredSec), 4), budget),
      resolution: stringValue(bodyStage.input.resolution) ?? '1080p',
    });
    const client = dependencies.klingI2vClient
      ?? createFalVideoJobClient(requireKlingI2vModelId(), dependencies.env ?? process.env);
    const submitted = await client.submit(i2vInput);
    return applyBodyMotionSubmitted(job, voiceStage, voice, measuredSec, bodyStage, submitted, durationSec, stagedImageUrl, now);
  } catch (error) {
    return failBodyStage(job, now, `Body-motion dispatch failed: ${errorMessage(error)}`);
  }
}

async function resolveBodyMotionVoice(
  job: AvatarPipelineJobSnapshot,
  voiceStage: AvatarPipelineStageSnapshot,
  dependencies: Pick<CreateAvatarPipelineJobDependencies, 'env' | 'chatterboxClient'>,
): Promise<BodyMotionVoice> {
  // Supplied voiceover (external audio) — the voice stage was skipped at build.
  if (voiceStage.status === 'skipped') {
    const audioUrl = stringValue(asRecord(voiceStage.output)?.audioUrl);
    if (!audioUrl) throw new Error('Body motion: the supplied voiceover has no audio URL.');
    return { audioUrl, audioAssetId: stringValue(asRecord(voiceStage.output)?.audioAssetId) };
  }
  // Cloned voice — synthesize with Chatterbox.
  if (voiceStage.status === 'ready') {
    const synthesizeInput = toChatterboxSynthesizeInput(voiceStage, job.userId);
    if (!synthesizeInput) throw new Error('Body motion: the voice stage is not synthesizable (missing text or voice reference).');
    const client = dependencies.chatterboxClient ?? createDefaultChatterboxClient(dependencies.env ?? process.env);
    const synthesized = await client.synthesize(synthesizeInput);
    return { audioUrl: synthesized.audioUrl, audioAssetId: synthesized.audioAssetId };
  }
  throw new Error(`Body motion needs speech, but the voice stage is "${voiceStage.status}".`);
}

function applyBodyMotionNeedsFit(
  job: AvatarPipelineJobSnapshot,
  voiceStage: AvatarPipelineStageSnapshot,
  voice: BodyMotionVoice,
  measuredSec: number,
  fit: FitDecision,
  now: string,
): AvatarPipelineJobSnapshot {
  const reason = `The line's measured voiceover is ${measuredSec}s — ${Math.round(fit.overshootPct * 100)}% over the `
    + `${RELIP_MAX_SHOT_SEC}s shot budget. Shorten the line (or split it into multiple shots stitched in Editron) before rendering.`;
  return {
    ...job,
    status: 'blocked',
    dispatchCode: 'body_motion_needs_fit',
    statusReason: reason,
    stages: job.stages.map((pipelineStage) => {
      if (pipelineStage.id === voiceStage.id) {
        return {
          ...pipelineStage,
          status: 'succeeded',
          dispatchCode: 'chatterbox_succeeded',
          statusReason: 'Cloned voice generated; measured over the shot budget.',
          output: {
            ...(pipelineStage.output ?? {}),
            audioUrl: voice.audioUrl,
            audioAssetId: voice.audioAssetId,
            measuredDurationSec: measuredSec,
          },
        };
      }
      if (pipelineStage.id === 'body_i2v_fal') {
        return { ...pipelineStage, status: 'blocked' as const, dispatchCode: 'body_motion_needs_fit' as const, statusReason: reason };
      }
      return pipelineStage;
    }),
    updatedAt: now,
  };
}

function applyBodyMotionSubmitted(
  job: AvatarPipelineJobSnapshot,
  voiceStage: AvatarPipelineStageSnapshot,
  voice: BodyMotionVoice,
  measuredSec: number,
  bodyStage: AvatarPipelineStageSnapshot,
  submitted: { requestId: string; modelId: string },
  requestedDurationSec: number,
  stagedImageUrl: string | undefined,
  now: string,
): AvatarPipelineJobSnapshot {
  return {
    ...job,
    status: 'queued',
    dispatchCode: 'body_queued',
    statusReason: `Kling i2v body render queued (${submitted.requestId}). Poll until the body video is ready, then relip.`,
    stages: job.stages.map((pipelineStage) => {
      if (pipelineStage.id === voiceStage.id) {
        return {
          ...pipelineStage,
          status: 'succeeded',
          dispatchCode: 'chatterbox_succeeded',
          statusReason: 'Cloned voice generated and measured; arrives at the relip stage.',
          output: {
            ...(pipelineStage.output ?? {}),
            audioUrl: voice.audioUrl,
            audioAssetId: voice.audioAssetId,
            measuredDurationSec: measuredSec,
          },
        };
      }
      if (pipelineStage.id === bodyStage.id) {
        return {
          ...pipelineStage,
          status: 'running',
          dispatchCode: 'body_queued',
          statusReason: `Kling i2v body render ${submitted.requestId} is queued.`,
          providerRequestId: submitted.requestId,
          input: {
            ...pipelineStage.input,
            ...(stagedImageUrl ? { stagedImageUrl } : {}),
            requestedDurationSec,
          },
          output: { requestId: submitted.requestId, modelId: submitted.modelId },
        };
      }
      return pipelineStage;
    }),
    updatedAt: now,
  };
}

function failBodyStage(job: AvatarPipelineJobSnapshot, now: string, reason: string): AvatarPipelineJobSnapshot {
  return {
    ...job,
    status: 'failed',
    dispatchCode: 'body_failed',
    statusReason: reason,
    stages: job.stages.map((pipelineStage) => pipelineStage.id === 'body_i2v_fal'
      ? { ...pipelineStage, status: 'failed', dispatchCode: 'body_failed', statusReason: reason, output: { ...(pipelineStage.output ?? {}), errorMessage: reason } }
      : pipelineStage),
    updatedAt: now,
  };
}

// REFRESH: poll the body render; when it lands, measure its real length, pad the voice to
// match, and submit the relip. On the next poll, advance the relip; when it lands, feed the
// relipped video to composition (via composition.input.faceVideo, same as the face lane).
async function refreshBodyMotionJob(
  job: AvatarPipelineJobSnapshot,
  dependencies: RefreshAvatarPipelineJobDependencies,
): Promise<AvatarPipelineJobSnapshot> {
  const bodyStage = findPipelineStage(job, 'body_i2v_fal');
  const relipStage = findPipelineStage(job, 'relip_kling_fal');
  const bodyRequestId = bodyStage?.providerRequestId ?? stringValue(asRecord(bodyStage?.output)?.requestId);
  const relipRequestId = relipStage?.providerRequestId ?? stringValue(asRecord(relipStage?.output)?.requestId);

  if (bodyStage && bodyStage.status === 'running' && bodyRequestId) {
    return refreshBodyStage(job, bodyStage, bodyRequestId, dependencies);
  }
  if (relipStage && relipStage.status === 'running' && relipRequestId) {
    return refreshRelipStage(job, relipStage, relipRequestId, dependencies);
  }
  return job;
}

async function refreshBodyStage(
  job: AvatarPipelineJobSnapshot,
  bodyStage: AvatarPipelineStageSnapshot,
  requestId: string,
  dependencies: RefreshAvatarPipelineJobDependencies,
): Promise<AvatarPipelineJobSnapshot> {
  const now = dependencies.now?.() ?? new Date().toISOString();
  const env = dependencies.env ?? process.env;
  try {
    const client = dependencies.klingI2vClient ?? createFalVideoJobClient(requireKlingI2vModelId(), env);
    const refresh = await client.refresh(requestId);
    if (refresh.status === 'failed') {
      return failBodyStage(job, now, refresh.errorMessage ? `Kling i2v failed: ${refresh.errorMessage}` : `Kling i2v request ${requestId} failed.`);
    }
    if (refresh.status !== 'succeeded') {
      return applyBodyRunning(job, bodyStage, refresh.status, now);
    }
    if (!refresh.videoUrl) {
      return failBodyStage(job, now, `Kling i2v request ${requestId} completed without a video URL.`);
    }

    // Body landed. Align the voice to its ACTUAL length, then submit the relip.
    const voiceStage = findPipelineStage(job, 'voice_chatterbox');
    const voiceAudioUrl = stringValue(asRecord(voiceStage?.output)?.audioUrl);
    const measuredVoiceSec = numberValue(asRecord(voiceStage?.output)?.measuredDurationSec) ?? 0;
    if (!voiceAudioUrl) return failBodyStage(job, now, 'Body-motion align step lost the voice audio URL.');

    const measureVideo = dependencies.measureVideoDurationSec ?? defaultMeasureVideoDurationSec;
    const reported = refresh.durationSeconds ?? numberValue(asRecord(bodyStage.input)?.requestedDurationSec);
    const bodySec = (await measureVideo(refresh.videoUrl)) ?? reported;
    if (bodySec === undefined || bodySec === null) {
      return failBodyStage(job, now, 'Could not determine the body video duration to align the voice.');
    }
    if (bodySec + 0.05 < measuredVoiceSec) {
      return failBodyStage(job, now, `Body shot (${bodySec}s) is shorter than the voice (${measuredVoiceSec}s) — would cut words. Shorten the line.`);
    }
    if (bodySec > RELIP_MAX_SHOT_SEC + 0.1) {
      return failBodyStage(job, now, `Body shot (${bodySec}s) exceeds the ${RELIP_MAX_SHOT_SEC}s relip cap.`);
    }

    const fetchAudioBytes = dependencies.fetchAudioBytes ?? defaultFetchAudioBytes;
    const uploadAudio = dependencies.uploadAudio ?? defaultUploadAudio;
    const rawWav = await fetchAudioBytes(voiceAudioUrl);
    const alignedWav = padWavToSec(rawWav, bodySec);
    const { audioUrl: alignedAudioUrl } = await uploadAudio(alignedWav, job.userId);

    const relipClient = dependencies.klingLipsyncClient ?? createFalVideoJobClient(KLING_LIPSYNC_MODEL_ID, env);
    const submitted = await relipClient.submit({ video_url: refresh.videoUrl, audio_url: alignedAudioUrl });
    return applyBodySucceededSubmitRelip(job, bodyStage, refresh.videoUrl, bodySec, alignedAudioUrl, submitted, now);
  } catch (error) {
    return failBodyStage(job, now, `Kling i2v status/align failed: ${errorMessage(error)}`);
  }
}

function applyBodyRunning(
  job: AvatarPipelineJobSnapshot,
  bodyStage: AvatarPipelineStageSnapshot,
  status: 'queued' | 'running',
  now: string,
): AvatarPipelineJobSnapshot {
  const dispatchCode: AvatarPipelineStageDispatchCode = status === 'queued' ? 'body_queued' : 'body_running';
  return {
    ...job,
    status: status === 'queued' ? 'queued' : 'running',
    dispatchCode,
    statusReason: `Kling i2v body render is ${status}.`,
    stages: job.stages.map((pipelineStage) => pipelineStage.id === bodyStage.id
      ? { ...pipelineStage, status: 'running', dispatchCode, statusReason: `Kling i2v body render is ${status}.` }
      : pipelineStage),
    updatedAt: now,
  };
}

function applyBodySucceededSubmitRelip(
  job: AvatarPipelineJobSnapshot,
  bodyStage: AvatarPipelineStageSnapshot,
  bodyVideoUrl: string,
  bodySec: number,
  alignedAudioUrl: string,
  submitted: { requestId: string; modelId: string },
  now: string,
): AvatarPipelineJobSnapshot {
  return {
    ...job,
    status: 'queued',
    dispatchCode: 'relip_queued',
    statusReason: `Body video ready; Kling LipSync relip queued (${submitted.requestId}).`,
    stages: job.stages.map((pipelineStage) => {
      if (pipelineStage.id === bodyStage.id) {
        return {
          ...pipelineStage,
          status: 'succeeded',
          dispatchCode: 'body_succeeded',
          statusReason: 'Kling i2v returned the body video.',
          output: { ...(pipelineStage.output ?? {}), videoUrl: bodyVideoUrl, durationSeconds: bodySec },
        };
      }
      if (pipelineStage.id === 'relip_kling_fal') {
        return {
          ...pipelineStage,
          status: 'running',
          dispatchCode: 'relip_queued',
          statusReason: `Kling LipSync relip ${submitted.requestId} is queued.`,
          providerRequestId: submitted.requestId,
          input: {
            ...pipelineStage.input,
            videoUrl: bodyVideoUrl,
            audioUrl: alignedAudioUrl,
            videoDurationSec: bodySec,
            audioDurationSec: bodySec,
          },
          output: { requestId: submitted.requestId, modelId: submitted.modelId },
        };
      }
      return pipelineStage;
    }),
    updatedAt: now,
  };
}

async function refreshRelipStage(
  job: AvatarPipelineJobSnapshot,
  relipStage: AvatarPipelineStageSnapshot,
  requestId: string,
  dependencies: RefreshAvatarPipelineJobDependencies,
): Promise<AvatarPipelineJobSnapshot> {
  const now = dependencies.now?.() ?? new Date().toISOString();
  const env = dependencies.env ?? process.env;
  try {
    const client = dependencies.klingLipsyncClient ?? createFalVideoJobClient(KLING_LIPSYNC_MODEL_ID, env);
    const refresh = await client.refresh(requestId);
    if (refresh.status === 'failed') {
      return failRelipStage(job, now, refresh.errorMessage ? `Kling LipSync failed: ${refresh.errorMessage}` : `Kling LipSync request ${requestId} failed.`);
    }
    if (refresh.status !== 'succeeded') {
      return applyRelipRunning(job, relipStage, refresh.status, now);
    }
    if (!refresh.videoUrl) {
      return failRelipStage(job, now, `Kling LipSync request ${requestId} completed without a video URL.`);
    }
    return applyRelipSucceeded(job, relipStage, refresh.videoUrl, now);
  } catch (error) {
    return failRelipStage(job, now, `Kling LipSync status refresh failed: ${errorMessage(error)}`);
  }
}

function applyRelipRunning(
  job: AvatarPipelineJobSnapshot,
  relipStage: AvatarPipelineStageSnapshot,
  status: 'queued' | 'running',
  now: string,
): AvatarPipelineJobSnapshot {
  const dispatchCode: AvatarPipelineStageDispatchCode = status === 'queued' ? 'relip_queued' : 'relip_running';
  return {
    ...job,
    status: status === 'queued' ? 'queued' : 'running',
    dispatchCode,
    statusReason: `Kling LipSync relip is ${status}.`,
    stages: job.stages.map((pipelineStage) => pipelineStage.id === relipStage.id
      ? { ...pipelineStage, status: 'running', dispatchCode, statusReason: `Kling LipSync relip is ${status}.` }
      : pipelineStage),
    updatedAt: now,
  };
}

function applyRelipSucceeded(
  job: AvatarPipelineJobSnapshot,
  relipStage: AvatarPipelineStageSnapshot,
  videoUrl: string,
  now: string,
): AvatarPipelineJobSnapshot {
  const durationSeconds = numberValue(asRecord(relipStage.input)?.videoDurationSec);
  return {
    ...job,
    status: 'running',
    dispatchCode: 'relip_succeeded',
    statusReason: 'Kling LipSync returned the speaking body video. Remotion composition is still pending.',
    stages: job.stages.map((pipelineStage) => {
      if (pipelineStage.id === relipStage.id) {
        return {
          ...pipelineStage,
          status: 'succeeded',
          dispatchCode: 'relip_succeeded',
          statusReason: 'Kling LipSync returned the speaking body video.',
          output: { ...(pipelineStage.output ?? {}), videoUrl, durationSeconds },
        };
      }
      if (pipelineStage.id === 'composition_remotion') {
        return {
          ...pipelineStage,
          input: {
            ...pipelineStage.input,
            faceVideo: { providerId: relipStage.providerId, requestId: relipStage.providerRequestId, videoUrl, durationSeconds },
          },
        };
      }
      return pipelineStage;
    }),
    updatedAt: now,
  };
}

function failRelipStage(job: AvatarPipelineJobSnapshot, now: string, reason: string): AvatarPipelineJobSnapshot {
  return {
    ...job,
    status: 'failed',
    dispatchCode: 'relip_failed',
    statusReason: reason,
    stages: job.stages.map((pipelineStage) => pipelineStage.id === 'relip_kling_fal'
      ? { ...pipelineStage, status: 'failed', dispatchCode: 'relip_failed', statusReason: reason, output: { ...(pipelineStage.output ?? {}), errorMessage: reason } }
      : pipelineStage),
    updatedAt: now,
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toChatterboxSynthesizeInput(
  stageSnapshot: AvatarPipelineStageSnapshot,
  userId?: string,
): ChatterboxSynthesizeInput | null {
  const text = stringValue(stageSnapshot.input.text);
  const voiceReference = asRecord(stageSnapshot.input.voiceReference);
  const sourceType = stringValue(voiceReference?.sourceType);
  if (!text || !sourceType) return null;

  return {
    model: stringValue(stageSnapshot.input.model),
    text,
    language: stringValue(stageSnapshot.input.language),
    voiceReference: {
      sourceType,
      assetId: stringValue(voiceReference?.assetId),
      voiceProfileId: stringValue(voiceReference?.voiceProfileId),
      url: stringValue(voiceReference?.url),
    },
    output: asRecord(stageSnapshot.input.output),
    ...(userId ? { userId } : {}),
  };
}

function toOmniHumanSubmitInput(stageSnapshot: AvatarPipelineStageSnapshot): OmniHumanFalSubmitInput | null {
  const image = asRecord(stageSnapshot.input.image);
  const audio = asRecord(stageSnapshot.input.audio);
  const imageUrl = stringValue(image?.imageUrl);
  const audioUrl = stringValue(audio?.sourceUrl);
  if (!imageUrl || !audioUrl) return null;

  return {
    imageUrl,
    audioUrl,
    prompt: stringValue(stageSnapshot.input.prompt),
    resolution: stringValue(stageSnapshot.input.resolution),
    turboMode: false,
  };
}

/**
 * Read the persisted staging config off the face stage. Returns null (skip staging)
 * unless it is explicitly enabled AND has a scene prompt AND at least one source photo —
 * defensive so a malformed snapshot skips the paid fal call rather than crashing.
 */
function readAvatarStagingConfig(stageSnapshot: AvatarPipelineStageSnapshot): {
  scenePrompt: string;
  sourceImageUrls: string[];
} | null {
  const staging = asRecord(stageSnapshot.input.staging);
  if (!staging || staging.enabled !== true) return null;
  const scenePrompt = stringValue(staging.scenePrompt);
  const sourceImageUrls = Array.isArray(staging.sourceImageUrls)
    ? staging.sourceImageUrls.filter((url): url is string => typeof url === 'string' && Boolean(url.trim()))
    : [];
  if (!scenePrompt || sourceImageUrls.length === 0) return null;
  return { scenePrompt, sourceImageUrls };
}

function findPipelineStage(
  job: AvatarPipelineJobSnapshot,
  stageId: AvatarPipelineStageId,
): AvatarPipelineStageSnapshot | undefined {
  return job.stages.find((pipelineStage) => pipelineStage.id === stageId);
}

function canReadPipelineJob(job: AvatarPipelineJobSnapshot, actor: AvatarVaultActorInput): boolean {
  if (job.userId === actor.userId) return true;
  return Boolean(actor.orgId && job.orgId && actor.orgId === job.orgId);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function blockedChatterboxStage(
  dispatchCode: AvatarPipelineStageDispatchCode,
  statusReason: string,
  input: Record<string, unknown>,
): AvatarPipelineStageSnapshot {
  return stage({
    id: 'voice_chatterbox',
    label: 'Generate voice',
    providerId: 'chatterbox_tts',
    providerDisplayName: 'Chatterbox TTS',
    status: 'blocked',
    dispatchCode,
    statusReason,
    requiredEnvKeys: dispatchCode === 'missing_chatterbox_endpoint' ? CHATTERBOX_ENDPOINT_KEYS : [],
    input,
  });
}

function blockedOmniHumanStage(
  faceProvider: FaceProviderDescriptor,
  dispatchCode: AvatarPipelineStageDispatchCode,
  statusReason: string,
  input: Record<string, unknown>,
): AvatarPipelineStageSnapshot {
  return stage({
    id: 'face_omnihuman_fal',
    label: 'Animate avatar',
    providerId: faceProvider.providerId,
    providerDisplayName: faceProvider.displayName,
    status: 'blocked',
    dispatchCode,
    statusReason,
    requiredEnvKeys: dispatchCode === 'missing_fal_key' ? FAL_ENDPOINT_KEYS : [],
    input,
  });
}

function stage(snapshot: AvatarPipelineStageSnapshot): AvatarPipelineStageSnapshot {
  return snapshot;
}

function resolveExistingAudio(
  mode: AvatarRenderAudioMode,
  sourceUrl: string | undefined,
  sourceAssetId: string | undefined,
): { sourceUrl?: string; sourceAssetId?: string } | undefined {
  if (mode === 'tts_voiceover') return undefined;
  if (!sourceUrl && !sourceAssetId) return undefined;
  return { sourceUrl, sourceAssetId };
}

function resolveVoiceReference(recipe: AvatarRenderRecipe): {
  sourceType: string;
  assetId?: string;
  voiceProfileId?: string;
  url?: string;
} {
  const explicitVoiceReference = recipe.audio.voiceReferenceAssetId || recipe.audio.voiceReferenceUrl;
  return {
    sourceType: explicitVoiceReference ? 'uploaded_voice_sample' : recipe.audio.voiceSource.sourceType,
    assetId: recipe.audio.voiceReferenceAssetId ?? recipe.audio.voiceSource.sampleAssetId,
    voiceProfileId: explicitVoiceReference ? undefined : recipe.audio.voiceSource.voiceProfileId,
    url: recipe.audio.voiceReferenceUrl,
  };
}

function resolveChatterboxModel(recipe: AvatarRenderRecipe): 'chatterbox_turbo' | 'chatterbox_multilingual_v3' {
  const language = recipe.audio.voiceSource.language?.toLowerCase();
  return !language || language === 'en' ? 'chatterbox_turbo' : 'chatterbox_multilingual_v3';
}

// Talking-head use cases read best framed head-and-shoulders. Feeding OmniHuman a
// face/portrait reference makes it generate a close presenter shot; a full-body ref
// yields a tiny figure lost in the frame.
const CLOSE_FRAME_USE_CASES = new Set<AvatarRenderUseCase>(['speech_delivery', 'explainer_host', 'social_presenter']);

function selectHumanImage(
  refs: AvatarRenderReferenceImage[],
  useCase: AvatarRenderUseCase,
): AvatarRenderReferenceImage | undefined {
  const byRole = (role: AvatarRenderReferenceImage['role']) => refs.find((ref) => ref.role === role && ref.imageUrl);
  const face = byRole('face_front') ?? byRole('portrait') ?? byRole('face_side');
  const fullBody = byRole('full_body_front') ?? byRole('full_body_side');
  const any = refs.find((ref) => ref.imageUrl);
  return CLOSE_FRAME_USE_CASES.has(useCase) ? (face ?? fullBody ?? any) : (fullBody ?? face ?? any);
}

function resolveOmniHumanAudio(
  recipe: AvatarRenderRecipe,
  _voiceStage: AvatarPipelineStageSnapshot,
): { sourceUrl?: string; sourceAssetId?: string; dependsOnStageId?: AvatarPipelineStageId } {
  if (recipe.audio.sourceUrl || recipe.audio.sourceAssetId) {
    return {
      sourceUrl: recipe.audio.sourceUrl,
      sourceAssetId: recipe.audio.sourceAssetId,
    };
  }
  if (recipe.audio.voiceoverText || recipe.creative.script) {
    return { dependsOnStageId: 'voice_chatterbox' };
  }
  return {};
}

function exceedsOmniHumanDurationLimit(resolution: string, durationSeconds: number): boolean {
  if (resolution === '1080p') return durationSeconds > 30;
  if (resolution === '720p') return durationSeconds > 60;
  return false;
}

function hasAnyEnv(env: Record<string, string | undefined>, keys: string[]): boolean {
  return keys.some((key) => Boolean(env[key]?.trim()));
}

function collectionFromDb(db: Db): AvatarVaultMongoCollection<AvatarPipelineJobMongoDocument> {
  return db.collection<AvatarPipelineJobMongoDocument>(AVATAR_PIPELINE_JOB_COLLECTION);
}

function getMongoClient(uri: string): Promise<MongoClient> {
  cachedPipelineJobMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  }).connect();
  return cachedPipelineJobMongoClient;
}

async function ensureJobIndexes(
  collection: AvatarVaultMongoCollection<AvatarPipelineJobMongoDocument>,
): Promise<void> {
  const indexes: IndexDescription[] = [
    { key: { userId: 1, updatedAt: -1 }, name: 'avatar_pipeline_job_user_updatedAt' },
    { key: { recordId: 1, updatedAt: -1 }, name: 'avatar_pipeline_job_record_updatedAt' },
    { key: { userId: 1, orgId: 1, status: 1, updatedAt: -1 }, name: 'avatar_pipeline_job_user_org_status_updatedAt' },
  ];
  await collection.createIndexes?.(indexes);
}

function jobDocument(snapshot: AvatarPipelineJobSnapshot): AvatarPipelineJobMongoDocument {
  return { _id: snapshot.id, ...clone(snapshot) };
}

function stripMongoId(doc: AvatarPipelineJobMongoDocument): AvatarPipelineJobSnapshot {
  const { _id: _ignored, ...snapshot } = doc;
  return snapshot;
}

function toJobFilter(filter: AvatarPipelineJobListFilter): Filter<AvatarPipelineJobMongoDocument> {
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as Filter<AvatarPipelineJobMongoDocument>;
}

function matchesJobFilter(snapshot: AvatarPipelineJobSnapshot, filter: AvatarPipelineJobListFilter): boolean {
  if (filter.recordId && snapshot.recordId !== filter.recordId) return false;
  if (filter.userId && snapshot.userId !== filter.userId) return false;
  if (filter.orgId !== undefined && (snapshot.orgId ?? null) !== filter.orgId) return false;
  if (filter.status && snapshot.status !== filter.status) return false;
  return true;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? clone(value as Record<string, unknown>)
    : undefined;
}

function fail(
  status: number,
  code: string,
  message: string,
  issues?: unknown[],
): AvatarVaultApiResult<AvatarPipelineJobErrorBody> {
  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        message,
        ...(issues ? { issues } : {}),
      },
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
