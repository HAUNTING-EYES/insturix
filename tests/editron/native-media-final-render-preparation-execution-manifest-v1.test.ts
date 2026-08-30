import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  assertNativeMediaFinalRenderFfmpegEncoderPolicyV1,
  NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
} from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import {
  assertNativeMediaFinalRenderMaterializerPolicyV1,
  NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
} from '@/lib/editron/services/native-media-final-render-materializer-v1';
import {
  assertNativeMediaFinalRenderPreparationExecutionManifestForJobV1,
  assertNativeMediaFinalRenderPreparationExecutionManifestV1,
  createNativeMediaFinalRenderPreparationExecutionManifestV1,
} from '@/lib/editron/services/native-media-final-render-preparation-execution-manifest-v1';
import {
  createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
} from '@/lib/editron/services/native-media-final-render-preparation-delivery-retry-policy-v1';
import {
  createNativeMediaFinalRenderPreparationHeartbeatPolicyV1,
} from '@/lib/editron/services/native-media-final-render-preparation-owner-adapter-v1';
import {
  createNativeMediaFinalRenderProfileReceiptV1,
} from '@/lib/editron/services/native-media-final-render-profile-v1';
import {
  assertNativeMediaFinalRenderR2PrivateArtifactPolicyV1,
  NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
} from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';

describe('NativeMediaFinalRenderPreparationExecutionManifestV1', () => {
  it('content-binds every historical execution policy and profile', () => {
    const manifest = createManifest();
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.policies.encoder)).toBe(true);
    expect(manifest.jobBindings.materializerPolicySha256).toBe(
      hashEditronCanonicalJsonV1(manifest.policies.materializer),
    );
    expect(manifest.jobBindings.encoderPolicySha256).toBe(
      hashEditronCanonicalJsonV1(manifest.policies.encoder),
    );
    expect(manifest.jobBindings.privateArtifactPolicySha256).toBe(
      hashEditronCanonicalJsonV1(manifest.policies.privateArtifact),
    );
    expect(assertNativeMediaFinalRenderPreparationExecutionManifestV1(manifest))
      .toEqual(manifest);
  });

  it('rejects nested policy drift, extra fields and a forged aggregate hash', () => {
    const manifest = createManifest();
    expect(() => assertNativeMediaFinalRenderPreparationExecutionManifestV1({
      ...manifest,
      policies: {
        ...manifest.policies,
        encoder: { ...manifest.policies.encoder, timeoutMs: 2_001 },
      },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_MANIFEST_MANIFEST_BINDING_MISMATCH');
    expect(() => assertNativeMediaFinalRenderPreparationExecutionManifestV1({
      ...manifest,
      unexpected: true,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_MANIFEST_MANIFEST_FIELDS_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationExecutionManifestV1({
      ...manifest,
      manifestSha256: HASH('f'),
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_MANIFEST_MANIFEST_BINDING_MISMATCH');
  });

  it('requires exact durable-job policy and execution-profile bindings', () => {
    const manifest = createManifest();
    const executionProfile = {
      workerImageDigest: manifest.executionProfile.workerImageDigest,
      compatibilityProfileVersion:
        manifest.executionProfile.compatibilityReceipt.profileVersion,
      compatibilityReceiptSha256:
        manifest.executionProfile.compatibilityReceipt.receiptSha256,
    };
    expect(assertNativeMediaFinalRenderPreparationExecutionManifestForJobV1(
      manifest,
      { policyBindings: manifest.jobBindings, executionProfile },
    )).toEqual(manifest);
    expect(() => assertNativeMediaFinalRenderPreparationExecutionManifestForJobV1(
      manifest,
      {
        policyBindings: manifest.jobBindings,
        executionProfile: { ...executionProfile, workerImageDigest: `sha256:${HASH('9')}` },
      },
    )).toThrow('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_MANIFEST_JOB_BINDING_MISMATCH');
  });

  it('keeps policy-domain validation in the real owners', () => {
    const manifest = createManifest();
    expect(() => assertNativeMediaFinalRenderMaterializerPolicyV1({
      ...manifest.policies.materializer,
      maxTimelineFrames: 10_001,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_POLICY_INVALID');
    expect(() => assertNativeMediaFinalRenderFfmpegEncoderPolicyV1({
      ...manifest.policies.encoder,
      maxFrameBytes: 2_000,
      maxDecodedSequenceBytes: 1_000,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_ENCODER_POLICY_INVALID');
    expect(() => assertNativeMediaFinalRenderR2PrivateArtifactPolicyV1({
      ...manifest.policies.privateArtifact,
      defaultLeaseTtlMs: 60_001,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_R2_POLICY_INVALID');
  });
});

function createManifest() {
  const retryPolicy = createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
    durableJob: { maxAttempts: 3, retentionMs: 86_400_000 },
    qstashDelivery: { retries: 2, retryDelayMs: 5_000, timeoutSeconds: 900 },
    workerRetry: { delayMs: 30_000 },
  });
  return createNativeMediaFinalRenderPreparationExecutionManifestV1({
    executionBudget: {
      ownerId: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET',
      ownerVersion: 'finance-2026-08-30',
      policySha256: HASH('b'),
    },
    materializerPolicy: {
      policyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
      maxTimelineFrames: 300,
      maxArtifactBytes: String(1024 * 1024 * 1024),
      epochWindow: {
        policyVersion: 'EDITRON_NATIVE_FINAL_RENDER_EPOCH_WINDOW_V1',
        maxFrameRecords: 10_000,
        maxBatchReads: 1_000,
        maxTotalReadBytes: 512 * 1024 * 1024,
      },
      conform: {
        policyVersion: 'EDITRON_NATIVE_FINAL_RENDER_CONFORM_V1',
        maxSourceFrames: 10_000,
        maxFrameQueries: 300,
      },
    },
    encoderPolicy: {
      policyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
      maxSourceBytes: 2_000_000_000,
      maxTimelineFrames: 300,
      maxFrameBytes: 100_000_000,
      maxDecodedSequenceBytes: 2_000_000_000,
      maxPcmBytes: 500_000_000,
      maxArtifactBytes: 5_000_000_000,
      maxDimension: 8_192,
      timeoutMs: 900_000,
    },
    privateArtifactPolicy: {
      policyVersion: NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      maxArtifactBytes: 4_000_000_000,
      defaultLeaseTtlMs: 60_000,
      maximumLeaseTtlMs: 86_400_000,
    },
    retryPolicy,
    heartbeatPolicy: createNativeMediaFinalRenderPreparationHeartbeatPolicyV1({
      heartbeatIntervalMs: 30_000,
    }),
    workerImageDigest: `sha256:${HASH('a')}`,
    compatibilityReceipt: createNativeMediaFinalRenderProfileReceiptV1({
      schemaVersion: 1,
      kind: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_V1',
      profileVersion: 'EDITRON_LOSSLESS_RGB_H264_PCM_S32LE_MATROSKA_V1',
      platform: `${process.platform}-${process.arch}`,
      ffmpegVersion: 'ffmpeg version 7.1.0',
      remotionVersion: '4.0.0',
      compositorPackageVersion: '4.0.0',
      container: 'matroska', videoEncoder: 'libx264rgb', videoCodec: 'h264',
      pixelFormat: 'gbrp', videoLosslessMode: 'CRF_0_INTRA_ONLY', audioCodec: 'pcm_s32le',
      sourceDecodedRgbSha256: HASH('1'), artifactDecodedRgbSha256: HASH('1'),
      sourceDecodedPcmSha256: HASH('2'), artifactDecodedPcmSha256: HASH('2'),
      sourceVideoFrameCount: '2', remotionVideoFrameCount: '2',
      sourceAudioSampleFrameCount: '3200', remotionOutputVideoCodec: 'h264',
      remotionOutputAudioCodec: 'aac', browserErrorCount: 0,
    }),
  });
}

function HASH(character: string): string {
  return character.repeat(64);
}
