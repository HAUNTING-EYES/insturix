import { describe, expect, it, vi } from 'vitest';

import { NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import { NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-materializer-v1';
import {
  createNativeMediaFinalRenderPreparationExecutionManifestMongoStoreV1,
  type NativeMediaFinalRenderPreparationExecutionManifestCollectionV1,
} from '@/lib/editron/services/native-media-final-render-preparation-execution-manifest-mongo-v1';
import {
  createNativeMediaFinalRenderPreparationExecutionManifestV1,
  type NativeMediaFinalRenderPreparationExecutionManifestV1,
} from '@/lib/editron/services/native-media-final-render-preparation-execution-manifest-v1';
import {
  createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
} from '@/lib/editron/services/native-media-final-render-preparation-delivery-retry-policy-v1';
import {
  createNativeMediaFinalRenderPreparationHeartbeatPolicyV1,
} from '@/lib/editron/services/native-media-final-render-preparation-owner-adapter-v1';
import { createNativeMediaFinalRenderProfileReceiptV1 }
  from '@/lib/editron/services/native-media-final-render-profile-v1';
import { NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';

describe('NativeMediaFinalRenderPreparationExecutionManifestMongoStoreV1', () => {
  it('creates immutable indexes, rereads a new row and resolves its exact job', async () => {
    const fixture = memoryCollection();
    const store = createNativeMediaFinalRenderPreparationExecutionManifestMongoStoreV1({
      loadCollection: vi.fn(async () => fixture.collection),
    });
    const manifest = manifestFixture();

    await expect(store.register(manifest)).resolves.toEqual({
      disposition: 'CREATED', manifest,
    });
    await expect(store.resolve(jobBinding(manifest))).resolves.toEqual(manifest);
    expect(fixture.createIndex).toHaveBeenCalledTimes(2);
    expect(fixture.createIndex).toHaveBeenNthCalledWith(
      1,
      { manifestSha256: 1 },
      { name: 'uniq_exact_render_execution_manifest_sha_v1', unique: true },
    );
    expect(fixture.findOne).toHaveBeenCalledWith(
      exactFilter(manifest),
      { readPreference: 'primary' },
    );
    expect(fixture.insertOne).toHaveBeenCalledWith(
      manifest,
      { writeConcern: { w: 'majority' } },
    );
  });

  it('treats an identical duplicate registration as an idempotent replay', async () => {
    const fixture = memoryCollection();
    const store = createNativeMediaFinalRenderPreparationExecutionManifestMongoStoreV1({
      loadCollection: async () => fixture.collection,
    });
    const manifest = manifestFixture();

    await store.register(manifest);
    await expect(store.register(manifest)).resolves.toEqual({
      disposition: 'UNCHANGED', manifest,
    });
    expect(fixture.records).toHaveLength(1);
  });

  it('fails closed for an absent exact binding and for write failure', async () => {
    const manifest = manifestFixture();
    const empty = memoryCollection();
    const store = createNativeMediaFinalRenderPreparationExecutionManifestMongoStoreV1({
      loadCollection: async () => empty.collection,
    });
    await expect(store.resolve({
      ...jobBinding(manifest),
      executionProfile: {
        ...jobBinding(manifest).executionProfile,
        workerImageDigest: `sha256:${HASH('9')}`,
      },
    })).rejects.toThrow('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_MANIFEST_MONGO_NOT_FOUND');

    const failed = memoryCollection({ writeFailure: true });
    const failedStore = createNativeMediaFinalRenderPreparationExecutionManifestMongoStoreV1({
      loadCollection: async () => failed.collection,
    });
    await expect(failedStore.register(manifest)).rejects.toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_EXECUTION_MANIFEST_MONGO_WRITE_FAILED',
    );
  });

  it('rejects a stored row whose canonical manifest hash was altered', async () => {
    const manifest = manifestFixture();
    const fixture = memoryCollection({
      records: [{ _id: 'mongo-id', ...manifest, manifestSha256: HASH('f') }],
    });
    const store = createNativeMediaFinalRenderPreparationExecutionManifestMongoStoreV1({
      loadCollection: async () => fixture.collection,
    });
    await expect(store.resolve(jobBinding(manifest))).rejects.toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_EXECUTION_MANIFEST_MANIFEST_BINDING_MISMATCH',
    );
  });
});

function memoryCollection(options: Readonly<{
  records?: Record<string, unknown>[];
  writeFailure?: boolean;
}> = {}) {
  const records = options.records ?? [];
  const createIndex = vi.fn(async () => 'created');
  const findOne = vi.fn(async (
    filter: Readonly<Record<string, unknown>>,
    _options: Readonly<{ readPreference: 'primary' }>,
  ) => (
    records.find((record) => Object.entries(filter).every(
      ([path, expected]) => nested(record, path) === expected,
    )) ?? null
  ));
  const insertOne = vi.fn(async (
    record: Readonly<Record<string, unknown>>,
    _options: Readonly<{ writeConcern: Readonly<{ w: 'majority' }> }>,
  ) => {
    if (options.writeFailure) throw new Error('storage offline');
    if (records.some((current) => current.manifestSha256 === record.manifestSha256
      || sameBinding(current, record))) {
      throw Object.assign(new Error('duplicate'), { code: 11000 });
    }
    records.push({ _id: `mongo-${records.length}`, ...record });
  });
  const collection: NativeMediaFinalRenderPreparationExecutionManifestCollectionV1 = {
    createIndex, findOne, insertOne,
  };
  return { collection, createIndex, findOne, insertOne, records };
}

function sameBinding(left: Record<string, unknown>, right: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(exactFilter(right as unknown as NativeMediaFinalRenderPreparationExecutionManifestV1))
    .every(([path, expected]) => nested(left, path) === expected);
}

function nested(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (
    current && typeof current === 'object'
      ? (current as Record<string, unknown>)[key]
      : undefined
  ), value);
}

function exactFilter(manifest: NativeMediaFinalRenderPreparationExecutionManifestV1) {
  return {
    'jobBindings.materializerPolicySha256': manifest.jobBindings.materializerPolicySha256,
    'jobBindings.encoderPolicySha256': manifest.jobBindings.encoderPolicySha256,
    'jobBindings.privateArtifactPolicySha256':
      manifest.jobBindings.privateArtifactPolicySha256,
    'jobBindings.runtimePolicy.bindingSha256':
      manifest.jobBindings.runtimePolicy.bindingSha256,
    'executionProfile.workerImageDigest': manifest.executionProfile.workerImageDigest,
    'executionProfile.compatibilityReceipt.receiptSha256':
      manifest.executionProfile.compatibilityReceipt.receiptSha256,
  };
}

function jobBinding(manifest: NativeMediaFinalRenderPreparationExecutionManifestV1) {
  const receipt = manifest.executionProfile.compatibilityReceipt;
  return {
    policyBindings: manifest.jobBindings,
    executionProfile: {
      workerImageDigest: manifest.executionProfile.workerImageDigest,
      compatibilityProfileVersion: receipt.profileVersion,
      compatibilityReceiptSha256: receipt.receiptSha256,
    },
  };
}

function manifestFixture() {
  return createNativeMediaFinalRenderPreparationExecutionManifestV1({
    executionBudget: {
      ownerId: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET',
      ownerVersion: 'finance-2026-08-30', policySha256: HASH('b'),
    },
    materializerPolicy: {
      policyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
      maxTimelineFrames: 300, maxArtifactBytes: '1000000000',
      epochWindow: {
        policyVersion: 'EDITRON_NATIVE_FINAL_RENDER_EPOCH_WINDOW_V1',
        maxFrameRecords: 10_000, maxBatchReads: 1_000, maxTotalReadBytes: 500_000_000,
      },
      conform: {
        policyVersion: 'EDITRON_NATIVE_FINAL_RENDER_CONFORM_V1',
        maxSourceFrames: 10_000, maxFrameQueries: 300,
      },
    },
    encoderPolicy: {
      policyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
      maxSourceBytes: 2_000_000_000, maxTimelineFrames: 300,
      maxFrameBytes: 100_000_000, maxDecodedSequenceBytes: 2_000_000_000,
      maxPcmBytes: 500_000_000, maxArtifactBytes: 5_000_000_000,
      maxDimension: 8_192, timeoutMs: 900_000,
    },
    privateArtifactPolicy: {
      policyVersion: NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      maxArtifactBytes: 4_000_000_000,
      defaultLeaseTtlMs: 60_000, maximumLeaseTtlMs: 86_400_000,
    },
    retryPolicy: createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
      durableJob: { maxAttempts: 3, retentionMs: 86_400_000 },
      qstashDelivery: { retries: 2, retryDelayMs: 5_000, timeoutSeconds: 900 },
      workerRetry: { delayMs: 30_000 },
    }),
    heartbeatPolicy: createNativeMediaFinalRenderPreparationHeartbeatPolicyV1({
      heartbeatIntervalMs: 30_000,
    }),
    workerImageDigest: `sha256:${HASH('a')}`,
    compatibilityReceipt: profileReceipt(),
  });
}

function profileReceipt() {
  return createNativeMediaFinalRenderProfileReceiptV1({
    schemaVersion: 1, kind: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_V1',
    profileVersion: 'EDITRON_LOSSLESS_RGB_H264_PCM_S32LE_MATROSKA_V1',
    platform: `${process.platform}-${process.arch}`, ffmpegVersion: 'ffmpeg version 7.1.0',
    remotionVersion: '4.0.0', compositorPackageVersion: '4.0.0', container: 'matroska',
    videoEncoder: 'libx264rgb', videoCodec: 'h264', pixelFormat: 'gbrp',
    videoLosslessMode: 'CRF_0_INTRA_ONLY', audioCodec: 'pcm_s32le',
    sourceDecodedRgbSha256: HASH('1'), artifactDecodedRgbSha256: HASH('1'),
    sourceDecodedPcmSha256: HASH('2'), artifactDecodedPcmSha256: HASH('2'),
    sourceVideoFrameCount: '2', remotionVideoFrameCount: '2',
    sourceAudioSampleFrameCount: '3200', remotionOutputVideoCodec: 'h264',
    remotionOutputAudioCodec: 'aac', browserErrorCount: 0,
  });
}

function HASH(character: string): string {
  return character.repeat(64);
}
