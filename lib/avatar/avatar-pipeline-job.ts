import { randomUUID } from 'node:crypto';
import { MongoClient, type Db, type Filter, type IndexDescription } from 'mongodb';
import {
  evaluateAvatarProfileRenderReadiness,
  type AvatarVaultActorInput,
  type AvatarVaultApiResult,
} from './avatar-vault-api';
import type {
  AvatarRenderAudioMode,
  AvatarRenderRecipe,
  AvatarRenderReferenceImage,
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
  OMNIHUMAN_FAL_MODEL_ID,
  type OmniHumanFalClient,
  type OmniHumanFalRefreshResult,
  type OmniHumanFalSubmitInput,
} from './avatar-omnihuman-fal';

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
  | 'omnihuman_failed';

export type AvatarPipelineStageId =
  | 'voice_chatterbox'
  | 'face_omnihuman_fal'
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
  | 'stage_ready'
  | 'waiting_for_face_video';

export interface AvatarPipelineStageSnapshot {
  id: AvatarPipelineStageId;
  label: string;
  providerId: 'chatterbox_tts' | 'fal_omnihuman_v1_5' | 'remotion';
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
}

export interface RefreshAvatarPipelineJobDependencies {
  pipelineJobStore?: AvatarPipelineJobStore;
  now?: () => string;
  env?: Record<string, string | undefined>;
  chatterboxClient?: ChatterboxClient;
  omniHumanClient?: OmniHumanFalClient;
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

  const refreshedJob = await refreshQueuedOmniHumanJob(job, dependencies);
  await store.savePipelineJobSnapshot(refreshedJob);
  return {
    status: 200,
    body: {
      ok: true,
      job: refreshedJob,
    },
  };
}
export function buildAvatarPipelineStages(
  recipe: AvatarRenderRecipe,
  env: Record<string, string | undefined> = process.env,
): AvatarPipelineStageSnapshot[] {
  const voiceStage = buildChatterboxStage(recipe, env);
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

function buildOmniHumanStage(
  recipe: AvatarRenderRecipe,
  env: Record<string, string | undefined>,
  voiceStage: AvatarPipelineStageSnapshot,
): AvatarPipelineStageSnapshot {
  const image = selectHumanImage(recipe.visual.referenceImages);
  const audio = resolveOmniHumanAudio(recipe, voiceStage);
  const input = {
    model: OMNIHUMAN_FAL_MODEL_ID,
    prompt: recipe.creative.prompt,
    image,
    audio,
    resolution: recipe.target.resolution,
    durationSeconds: recipe.target.durationSeconds,
    aspectRatio: recipe.target.aspectRatio,
  };

  if (!image?.imageUrl) {
    return blockedOmniHumanStage('missing_human_image', 'OmniHuman needs a usable human reference image URL.', input);
  }
  if (!audio.sourceUrl && !audio.sourceAssetId && !audio.dependsOnStageId) {
    return blockedOmniHumanStage('missing_omnihuman_audio', 'OmniHuman needs uploaded audio or the Chatterbox voice stage output.', input);
  }
  if (exceedsOmniHumanDurationLimit(recipe.target.resolution, recipe.target.durationSeconds)) {
    return blockedOmniHumanStage('omnihuman_duration_limit', 'OmniHuman v1.5 limits 1080p jobs to 30s and 720p jobs to 60s.', input);
  }
  if (!hasAnyEnv(env, FAL_ENDPOINT_KEYS)) {
    return blockedOmniHumanStage('missing_fal_key', 'FAL_AI_API_KEY or FAL_KEY is not configured, so OmniHuman cannot be dispatched.', input);
  }

  return stage({
    id: 'face_omnihuman_fal',
    label: 'Animate avatar',
    providerId: 'fal_omnihuman_v1_5',
    providerDisplayName: 'fal OmniHuman v1.5',
    status: 'ready',
    dispatchCode: 'stage_ready',
    statusReason: 'OmniHuman is configured and ready for the execution adapter.',
    requiredEnvKeys: FAL_ENDPOINT_KEYS,
    input,
  });
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
  dependencies: Pick<CreateAvatarPipelineJobDependencies, 'env' | 'now' | 'chatterboxClient' | 'omniHumanClient'>,
): Promise<AvatarPipelineJobSnapshot> {
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

  const synthesizeInput = toChatterboxSynthesizeInput(voiceStage);
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
  dependencies: Pick<CreateAvatarPipelineJobDependencies, 'env' | 'now' | 'omniHumanClient'>,
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
  try {
    const client = dependencies.omniHumanClient ?? createDefaultOmniHumanFalClient(dependencies.env ?? process.env);
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
              fal: {
                modelId: submitted.modelId,
                input: submitted.input,
              },
            },
            output: {
              requestId: submitted.requestId,
              modelId: submitted.modelId,
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
    const client = dependencies.omniHumanClient ?? createDefaultOmniHumanFalClient(dependencies.env ?? process.env);
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
              providerId: 'fal_omnihuman_v1_5',
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

function toChatterboxSynthesizeInput(stageSnapshot: AvatarPipelineStageSnapshot): ChatterboxSynthesizeInput | null {
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
  dispatchCode: AvatarPipelineStageDispatchCode,
  statusReason: string,
  input: Record<string, unknown>,
): AvatarPipelineStageSnapshot {
  return stage({
    id: 'face_omnihuman_fal',
    label: 'Animate avatar',
    providerId: 'fal_omnihuman_v1_5',
    providerDisplayName: 'fal OmniHuman v1.5',
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

function selectHumanImage(refs: AvatarRenderReferenceImage[]): AvatarRenderReferenceImage | undefined {
  return refs.find((ref) => ref.role === 'full_body_front' && ref.imageUrl)
    ?? refs.find((ref) => ref.role === 'full_body_side' && ref.imageUrl)
    ?? refs.find((ref) => ref.role === 'portrait' && ref.imageUrl)
    ?? refs.find((ref) => ref.imageUrl);
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
