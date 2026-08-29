import { describe, expect, it } from 'vitest';

import { createNativeMediaFinalRenderArtifactV1 } from '@/lib/editron/services/native-media-final-render-source-preparation-v1';
import {
  buildNativeMediaFinalRenderPreparationJobContractV1,
} from '@/lib/editron/services/native-media-final-render-preparation-job-v1';
import { createNativeMediaFinalRenderPreparationRuntimePolicyV1 } from '@/lib/editron/services/native-media-final-render-preparation-runtime-policy-v1';
import {
  assertNativeMediaFinalRenderPreparationResultV1,
  createNativeMediaFinalRenderPreparationResultV1,
  createNativeMediaFinalRenderPreparationResumeStateV1,
  createNativeMediaFinalRenderPreparationTerminalReceiptV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_SCHEMA_V1,
} from '@/lib/editron/services/native-media-final-render-preparation-result-v1';
import { NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import { NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-materializer-v1';
import { NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-profile-v1';
import { NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';

const sha = (character: string) => character.repeat(64);
const revision = Object.freeze({
  schemaVersion: 1 as const,
  value: 12,
  compatibilityUpdatedAt: '2026-08-30T00:00:00.000Z',
});

function contract() {
  return buildNativeMediaFinalRenderPreparationJobContractV1({
    tenantId: 'tenant_1', userId: 'user_1', orgId: null,
    projectId: 'project_1', sequenceId: 'main', projectRevision: revision,
    admissionReceiptSha256: sha('7'),
    budgetReservation: { reservationId: 'render_budget_1', bindingSha256: sha('0') },
    exactSourceRequest: {
      overlayId: 'overlay_1', assetId: 'asset_1', overlayTimingSha256: sha('1'),
      assetTimingStateSha256: sha('2'), sourceVersionSha256: sha('3'),
      storageVersionSha256: sha('4'), sourceBindingSha256: sha('5'),
      sourcePtsCadenceMapStateSha256V3: sha('6'), renderNativeAudio: true,
    },
    policyBindings: {
      materializerPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
      materializerPolicySha256: sha('8'),
      encoderPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
      encoderPolicySha256: sha('9'),
      privateArtifactPolicyVersion:
        NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      privateArtifactPolicySha256: sha('a'),
      runtimePolicy: runtimePolicy(),
    },
    executionProfile: {
      workerImageDigest: `sha256:${sha('b')}`,
      compatibilityProfileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
      compatibilityReceiptSha256: sha('c'),
    },
  });
}

function runtimePolicy() {
  return createNativeMediaFinalRenderPreparationRuntimePolicyV1({
    executionBudget: {
      ownerId: 'TEST_RENDER_BUDGET_OWNER',
      ownerVersion: 'TEST_RENDER_BUDGET_OWNER_V1',
      policySha256: sha('e'),
    },
    retryPolicy: {
      ownerId: 'TEST_RENDER_RETRY_POLICY',
      ownerVersion: 'TEST_RENDER_RETRY_POLICY_V1',
      policySha256: sha('f'),
    },
    heartbeatPolicySha256: sha('0'),
  });
}

function artifact(overrides: Record<string, unknown> = {}) {
  const job = contract().payload;
  const request = job.exactSourceRequest;
  return createNativeMediaFinalRenderArtifactV1({
    schemaVersion: 1, kind: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_V1',
    artifactHandle: `nmfrv1_${sha('d')}`, projectId: job.projectId,
    sequenceId: job.sequenceId, projectRevision: job.projectRevision,
    overlayId: request.overlayId, assetId: request.assetId,
    overlayTimingSha256: request.overlayTimingSha256,
    assetTimingStateSha256: request.assetTimingStateSha256,
    sourceVersionSha256: request.sourceVersionSha256,
    storageVersionSha256: request.storageVersionSha256,
    sourceBindingSha256: request.sourceBindingSha256,
    sourcePtsCadenceMapStateSha256V3: request.sourcePtsCadenceMapStateSha256V3,
    transformSha256: sha('e'), projectRate: { numerator: '30', denominator: '1' },
    timelineStartFrame: '90', timelineFrameCount: '60',
    artifactProfile: 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1',
    container: 'matroska', videoCodec: 'h264', pixelFormat: 'gbrp',
    videoFrameCount: '60', decodedFrameSequenceSha256: sha('f'),
    remotionCompatibilityReceiptSha256: sha('c'),
    audio: {
      disposition: 'EMBEDDED_EXACT_NATIVE_PCM', audioCodec: 'pcm_s32le',
      audioMappingSha256: sha('1'), sourceDecodedPcmSha256: sha('2'),
      artifactDecodedPcmSha256: sha('3'),
      decodedPcmEquivalenceReceiptSha256: sha('4'), sampleRate: '48000',
      channelCount: 2, decodedSampleFrameCount: '96000',
    },
    contentType: 'video/x-matroska', artifactContentSha256: sha('d'),
    artifactByteLength: '123456',
    ...overrides,
  } as never);
}

function result() {
  const job = contract();
  return createNativeMediaFinalRenderPreparationResultV1({
    jobInput: job.payload,
    jobInputBindingSha256: job.bindingSha256,
    publishHandle: `nmfrpubv1_${sha('d')}`,
    artifact: artifact(),
  });
}

describe('native final-render durable preparation result v1', () => {
  it('persists one URL-free, source-bound artifact and canonical resume state', () => {
    const job = contract();
    const state = createNativeMediaFinalRenderPreparationResumeStateV1({
      jobInput: job.payload, jobInputBindingSha256: job.bindingSha256,
      publishHandle: `nmfrpubv1_${sha('d')}`, artifact: artifact(),
    });

    expect(state.schemaId).toBe(NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_SCHEMA_V1);
    expect(state.stateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(state.payload.resultBindingSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(state.payload.artifact.overlayId).toBe('overlay_1');
    expect(JSON.stringify(state)).not.toMatch(/sourceUrl|https?:\/\//i);
    expect(Object.isFrozen(state.payload.artifact.audio)).toBe(true);
  });

  it('creates a terminal PASS bound to result, artifact, runtime and completion time', () => {
    const job = contract();
    const receipt = createNativeMediaFinalRenderPreparationTerminalReceiptV1({
      jobId: 'job_1', operationId: job.operationIdentity,
      jobInput: job.payload, jobInputBindingSha256: job.bindingSha256,
      executionAuthorizationReceiptSha256: sha('b'),
      result: result(), completedAt: new Date('2026-08-30T00:05:00.000Z'),
    });

    expect(receipt.disposition).toBe('PASS');
    expect(receipt.receiptId).toMatch(/^nmfrprep_[a-f0-9]{24}$/);
    expect(receipt.proofReferences.map(({ proofId }) => proofId)).toEqual([
      'execution-budget-authorization', 'exact-render-artifact',
      'exact-render-result', 'runtime-profile-receipt',
    ]);
    expect(receipt.proofReferences.every(({ disposition }) => disposition === 'PASS')).toBe(true);
  });

  it('rejects stale job bindings, URL-like handles and forged result fields', () => {
    const job = contract();
    expect(() => createNativeMediaFinalRenderPreparationResultV1({
      jobInput: job.payload, jobInputBindingSha256: sha('0'),
      publishHandle: `nmfrpubv1_${sha('d')}`, artifact: artifact(),
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_RESULT_JOB_INPUT_BINDING_INVALID');
    expect(() => createNativeMediaFinalRenderPreparationResultV1({
      jobInput: job.payload, jobInputBindingSha256: job.bindingSha256,
      publishHandle: 'https://private.example/signed', artifact: artifact(),
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_RESULT_PUBLISH_HANDLE_INVALID');
    expect(() => createNativeMediaFinalRenderPreparationResultV1({
      jobInput: job.payload, jobInputBindingSha256: job.bindingSha256,
      publishHandle: `nmfrpubv1_${sha('e')}`, artifact: artifact(),
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_RESULT_PUBLISH_HANDLE_INVALID');
    expect(() => createNativeMediaFinalRenderPreparationTerminalReceiptV1({
      jobId: 'job_1', operationId: job.operationIdentity,
      jobInput: job.payload, jobInputBindingSha256: job.bindingSha256,
      executionAuthorizationReceiptSha256: 'not-a-sha',
      result: result(), completedAt: new Date('2026-08-30T00:05:00.000Z'),
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_RESULT_EXECUTION_AUTHORIZATION_RECEIPT_SHA256_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationResultV1({
      ...result(), unexpected: true,
    }, { jobInput: job.payload, jobInputBindingSha256: job.bindingSha256 }))
      .toThrow('NATIVE_MEDIA_FINAL_RENDER_RESULT_FIELDS_INVALID');
  });

  it('rejects wrong source, revision, runtime profile, audio disposition and artifact hash', () => {
    const job = contract();
    const create = (candidate: ReturnType<typeof artifact>) => (
      createNativeMediaFinalRenderPreparationResultV1({
        jobInput: job.payload, jobInputBindingSha256: job.bindingSha256,
        publishHandle: `nmfrpubv1_${sha('d')}`, artifact: candidate,
      })
    );
    expect(() => create(artifact({ overlayId: 'overlay_2' })))
      .toThrow('NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_SCOPE_INVALID');
    expect(() => create(artifact({ projectRevision: { ...revision, value: 13 } })))
      .toThrow('NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_SCOPE_INVALID');
    expect(() => create(artifact({ remotionCompatibilityReceiptSha256: sha('0') })))
      .toThrow('NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_SCOPE_INVALID');
    expect(() => create(artifact({
      audio: {
        disposition: 'NO_AUDIO_MAPPING_REQUESTED', audioCodec: null,
        audioMappingSha256: null, sourceDecodedPcmSha256: null,
        artifactDecodedPcmSha256: null, decodedPcmEquivalenceReceiptSha256: null,
        sampleRate: null, channelCount: null, decodedSampleFrameCount: null,
      },
    }))).toThrow('NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_SCOPE_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationResultV1({
      ...result(), artifact: { ...artifact(), artifactBindingSha256: sha('0') },
    }, { jobInput: job.payload, jobInputBindingSha256: job.bindingSha256 }))
      .toThrow('NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_BINDING_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationResultV1({
      ...result(),
      artifact: { ...artifact(), audio: { ...artifact().audio, sourceUrl: 'https://bad' } },
    }, { jobInput: job.payload, jobInputBindingSha256: job.bindingSha256 }))
      .toThrow('NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_AUDIO_FIELDS_INVALID');
  });
});
