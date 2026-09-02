import type { Collection, Document, Filter } from 'mongodb';

import { NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 }
  from './native-media-final-render-ffmpeg-encoder-v1';
import { NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1 }
  from './native-media-final-render-materializer-v1';
import {
  assertNativeMediaFinalRenderPreparationExecutionManifestForJobV1,
  assertNativeMediaFinalRenderPreparationExecutionManifestV1,
  type NativeMediaFinalRenderPreparationExecutionManifestV1,
} from './native-media-final-render-preparation-execution-manifest-v1';
import type {
  NativeMediaFinalRenderPreparationExecutionProfileV1,
  NativeMediaFinalRenderPreparationJobInputV1,
} from './native-media-final-render-preparation-job-v1';
import { assertNativeMediaFinalRenderPreparationRuntimePolicyV1 }
  from './native-media-final-render-preparation-runtime-policy-v1';
import { NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1 }
  from './native-media-final-render-profile-v1';
import { NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 }
  from './native-media-final-render-r2-private-artifact-v1';

type MongoRecord = Record<string, unknown>;
type JobBindingV1 = Pick<
  NativeMediaFinalRenderPreparationJobInputV1,
  'policyBindings' | 'executionProfile'
>;
type PrimaryReadV1 = Readonly<{ readPreference: 'primary' }>;
type MajorityWriteV1 = Readonly<{ writeConcern: Readonly<{ w: 'majority' }> }>;

const PRIMARY_READ_V1: PrimaryReadV1 = Object.freeze({ readPreference: 'primary' });
const MAJORITY_WRITE_V1: MajorityWriteV1 = Object.freeze({
  writeConcern: Object.freeze({ w: 'majority' }),
});

export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_EXECUTION_MANIFEST_COLLECTION_V1 =
  'editron_native_media_final_render_preparation_execution_manifests_v1' as const;

export interface NativeMediaFinalRenderPreparationExecutionManifestCollectionV1 {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(filter: Readonly<MongoRecord>, options: PrimaryReadV1): Promise<MongoRecord | null>;
  insertOne(record: Readonly<MongoRecord>, options: MajorityWriteV1): Promise<unknown>;
}

export interface NativeMediaFinalRenderPreparationExecutionManifestStoreV1 {
  register(manifest: unknown): Promise<Readonly<{
    disposition: 'CREATED' | 'UNCHANGED';
    manifest: NativeMediaFinalRenderPreparationExecutionManifestV1;
  }>>;
  resolve(job: JobBindingV1): Promise<NativeMediaFinalRenderPreparationExecutionManifestV1>;
}

export function createNativeMediaFinalRenderPreparationExecutionManifestMongoStoreV1(
  input: Readonly<{
    loadCollection?: () => Promise<Readonly<
      NativeMediaFinalRenderPreparationExecutionManifestCollectionV1
    >>;
  }> = {},
): Readonly<NativeMediaFinalRenderPreparationExecutionManifestStoreV1> {
  const loadCollection = input.loadCollection ?? loadDefaultCollection;
  let collectionPromise: Promise<Readonly<
    NativeMediaFinalRenderPreparationExecutionManifestCollectionV1
  >> | null = null;
  let indexesPromise: Promise<void> | null = null;
  const collection = () => {
    collectionPromise ??= loadCollection();
    return collectionPromise;
  };
  const ensureIndexes = async () => {
    indexesPromise ??= collection().then(async (resolved) => {
      await resolved.createIndex(
        { manifestSha256: 1 },
        { name: 'uniq_exact_render_execution_manifest_sha_v1', unique: true },
      );
      await resolved.createIndex(
        exactBindingIndexV1(),
        { name: 'uniq_exact_render_execution_manifest_binding_v1', unique: true },
      );
    });
    try {
      await indexesPromise;
    } catch (error) {
      indexesPromise = null;
      throw error;
    }
  };
  const resolve = async (job: JobBindingV1) => {
    const filter = exactBindingFilterV1(job);
    await ensureIndexes();
    const stored = await readOne(await collection(), filter);
    if (!stored) fail('NOT_FOUND');
    return assertNativeMediaFinalRenderPreparationExecutionManifestForJobV1(
      withoutMongoId(stored!),
      job,
    );
  };

  return Object.freeze({
    resolve,
    async register(value: unknown) {
      const manifest = assertNativeMediaFinalRenderPreparationExecutionManifestV1(value);
      const job = jobBindingFromManifest(manifest);
      await ensureIndexes();
      const resolvedCollection = await collection();
      let disposition: 'CREATED' | 'UNCHANGED' = 'CREATED';
      try {
        await resolvedCollection.insertOne(
          manifest as unknown as MongoRecord,
          MAJORITY_WRITE_V1,
        );
      } catch (error) {
        if (!isDuplicateKeyError(error)) fail('WRITE_FAILED');
        disposition = 'UNCHANGED';
      }
      const persisted = await readOne(resolvedCollection, exactBindingFilterV1(job));
      if (!persisted) fail(disposition === 'CREATED' ? 'WRITE_NOT_DURABLE' : 'CONFLICT');
      const verified = assertNativeMediaFinalRenderPreparationExecutionManifestForJobV1(
        withoutMongoId(persisted),
        job,
      );
      if (verified.manifestSha256 !== manifest.manifestSha256) fail('CONFLICT');
      return Object.freeze({ disposition, manifest: verified });
    },
  });
}

function exactBindingIndexV1(): Readonly<Record<string, 1>> {
  return Object.freeze({
    'jobBindings.materializerPolicySha256': 1,
    'jobBindings.encoderPolicySha256': 1,
    'jobBindings.privateArtifactPolicySha256': 1,
    'jobBindings.runtimePolicy.bindingSha256': 1,
    'executionProfile.workerImageDigest': 1,
    'executionProfile.compatibilityReceipt.receiptSha256': 1,
  });
}

function exactBindingFilterV1(job: JobBindingV1): Readonly<MongoRecord> {
  const bindings = job?.policyBindings;
  const profile = job?.executionProfile;
  const runtime = assertNativeMediaFinalRenderPreparationRuntimePolicyV1(
    bindings?.runtimePolicy,
  );
  if (bindings?.materializerPolicyVersion
      !== NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1
    || bindings.encoderPolicyVersion
      !== NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1
    || bindings.privateArtifactPolicyVersion
      !== NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1
    || profile?.compatibilityProfileVersion !== NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1) {
    fail('JOB_BINDING_VERSION_INVALID');
  }
  return Object.freeze({
    'jobBindings.materializerPolicySha256': sha256(bindings.materializerPolicySha256),
    'jobBindings.encoderPolicySha256': sha256(bindings.encoderPolicySha256),
    'jobBindings.privateArtifactPolicySha256': sha256(
      bindings.privateArtifactPolicySha256,
    ),
    'jobBindings.runtimePolicy.bindingSha256': runtime.bindingSha256,
    'executionProfile.workerImageDigest': imageDigest(profile.workerImageDigest),
    'executionProfile.compatibilityReceipt.receiptSha256': sha256(
      profile.compatibilityReceiptSha256,
    ),
  });
}

function jobBindingFromManifest(
  manifest: NativeMediaFinalRenderPreparationExecutionManifestV1,
): JobBindingV1 {
  const receipt = manifest.executionProfile.compatibilityReceipt;
  const executionProfile: NativeMediaFinalRenderPreparationExecutionProfileV1 = {
    workerImageDigest: manifest.executionProfile.workerImageDigest,
    compatibilityProfileVersion: receipt.profileVersion,
    compatibilityReceiptSha256: receipt.receiptSha256,
  };
  return Object.freeze({ policyBindings: manifest.jobBindings, executionProfile });
}

async function loadDefaultCollection(): Promise<Readonly<
  NativeMediaFinalRenderPreparationExecutionManifestCollectionV1
>> {
  const { getDatabase } = await import('../db/mongodb');
  const database = await getDatabase();
  return wrapCollection(database.collection(
    NATIVE_MEDIA_FINAL_RENDER_PREPARATION_EXECUTION_MANIFEST_COLLECTION_V1,
  ));
}

function wrapCollection(
  collection: Collection<Document>,
): NativeMediaFinalRenderPreparationExecutionManifestCollectionV1 {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findOne: async (filter, options) => {
      const stored = await collection.findOne(filter as Filter<Document>, options);
      return stored as MongoRecord | null;
    },
    insertOne: (record, options) => collection.insertOne(record as Document, options),
  };
}

async function readOne(
  collection: NativeMediaFinalRenderPreparationExecutionManifestCollectionV1,
  filter: Readonly<MongoRecord>,
): Promise<MongoRecord | null> {
  try {
    return await collection.findOne(filter, PRIMARY_READ_V1);
  } catch {
    fail('READ_FAILED');
  }
}

function withoutMongoId(value: Readonly<MongoRecord>): MongoRecord {
  const { _id: _discarded, ...record } = value;
  return record;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('JOB_BINDING_SHA256_INVALID');
  }
  return value;
}

function imageDigest(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail('JOB_IMAGE_DIGEST_INVALID');
  }
  return value;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error
    && (error as { code?: unknown }).code === 11000);
}

function fail(code: string): never {
  throw new NativeMediaFinalRenderPreparationExecutionManifestMongoErrorV1(code);
}

export class NativeMediaFinalRenderPreparationExecutionManifestMongoErrorV1
  extends Error {
  constructor(code: string) {
    super(`NATIVE_MEDIA_FINAL_RENDER_EXECUTION_MANIFEST_MONGO_${code}`);
    this.name = 'NativeMediaFinalRenderPreparationExecutionManifestMongoErrorV1';
  }
}
