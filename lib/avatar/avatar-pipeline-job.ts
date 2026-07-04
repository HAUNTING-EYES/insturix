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

export type AvatarPipelineJobStatus = 'blocked' | 'queued' | 'running' | 'succeeded' | 'failed';

export type AvatarPipelineJobDispatchCode =
  | 'pipeline_not_configured'
  | 'pipeline_input_blocked'
  | 'pipeline_adapter_not_implemented';

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
  | 'missing_fal_key'
  | 'missing_human_image'
  | 'missing_omnihuman_audio'
  | 'omnihuman_duration_limit'
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
}

export interface CreateAvatarPipelineJobSuccessBody {
  ok: true;
  job: AvatarPipelineJobSnapshot;
  recipe: AvatarRenderRecipe;
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
const FAL_ENDPOINT_KEYS = ['FAL_KEY'];

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
  await store.savePipelineJobSnapshot(job);
  return {
    status: 201,
    body: {
      ok: true,
      job,
      recipe,
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
    model: 'fal-ai/bytedance/omnihuman/v1.5',
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
    return blockedOmniHumanStage('missing_fal_key', 'FAL_KEY is not configured, so OmniHuman cannot be dispatched.', input);
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
  return {
    sourceType: recipe.audio.voiceSource.sourceType,
    assetId: recipe.audio.voiceSource.sampleAssetId,
    voiceProfileId: recipe.audio.voiceSource.voiceProfileId,
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
