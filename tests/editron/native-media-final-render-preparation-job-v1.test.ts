import { describe, expect, it } from 'vitest';

import {
  assertNativeMediaFinalRenderPreparationJobInputV1,
  buildNativeMediaFinalRenderPreparationJobContractV1,
  NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
} from '@/lib/editron/services/native-media-final-render-preparation-job-v1';
import { NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import { NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-materializer-v1';
import { NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-profile-v1';
import { NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';

const sha = (character: string) => character.repeat(64);

function request(overlayId = 'overlay_exact_1') {
  return {
    overlayId,
    assetId: `asset_${overlayId}`,
    overlayTimingSha256: sha('1'),
    assetTimingStateSha256: sha('2'),
    sourceVersionSha256: sha('3'),
    storageVersionSha256: sha('4'),
    sourceBindingSha256: sha('5'),
    sourcePtsCadenceMapStateSha256V3: sha('6'),
    renderNativeAudio: true,
  } as const;
}

function input() {
  return {
    tenantId: 'tenant_1',
    userId: 'user_1',
    orgId: null,
    projectId: 'project_1',
    sequenceId: 'main',
    projectRevision: {
      schemaVersion: 1 as const,
      value: 12,
      compatibilityUpdatedAt: '2026-08-30T00:00:00.000Z',
    },
    admissionReceiptSha256: sha('7'),
    exactSourceRequest: request(),
    policyBindings: {
      materializerPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
      materializerPolicySha256: sha('8'),
      encoderPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
      encoderPolicySha256: sha('9'),
      privateArtifactPolicyVersion:
        NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      privateArtifactPolicySha256: sha('a'),
    },
    executionProfile: {
      workerImageDigest: `sha256:${sha('b')}`,
      compatibilityProfileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
      compatibilityReceiptSha256: sha('c'),
    },
  } as const;
}

describe('native final-render durable preparation job binding v1', () => {
  it('binds exact project, admission, source, policy and worker-image identity without URLs', () => {
    const contract = buildNativeMediaFinalRenderPreparationJobContractV1(input());

    expect(contract.operationIdentity).toMatch(/^nmfrprep_[a-f0-9]{64}$/);
    expect(contract.bindingSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(contract.payload).toMatchObject({
      version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
      projectId: 'project_1',
      sequenceId: 'main',
      artifactProfile: NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1,
      admissionReceiptSha256: sha('7'),
    });
    expect(contract.dependencies.map(({ dependencyId }) => dependencyId)).toEqual([
      'admission-receipt',
      'encoder-policy',
      'exact-source-request',
      'materializer-policy',
      'private-artifact-policy',
      'project-revision',
      'runtime-profile-receipt',
      'worker-image',
    ]);
    expect(JSON.stringify(contract)).not.toMatch(/sourceUrl|https:\/\//);
    expect(Object.isFrozen(contract.payload.exactSourceRequest)).toBe(true);
  });

  it('is canonical across object-key order and changes for material scope changes', () => {
    const first = buildNativeMediaFinalRenderPreparationJobContractV1(input());
    const reordered = buildNativeMediaFinalRenderPreparationJobContractV1({
      ...input(),
      exactSourceRequest: {
        renderNativeAudio: true,
        sourcePtsCadenceMapStateSha256V3: sha('6'),
        sourceBindingSha256: sha('5'),
        storageVersionSha256: sha('4'),
        sourceVersionSha256: sha('3'),
        assetTimingStateSha256: sha('2'),
        overlayTimingSha256: sha('1'),
        assetId: 'asset_overlay_exact_1',
        overlayId: 'overlay_exact_1',
      },
    });
    const changed = buildNativeMediaFinalRenderPreparationJobContractV1({
      ...input(),
      projectRevision: { ...input().projectRevision, value: 13 },
    });

    expect(reordered).toEqual(first);
    expect(changed.operationIdentity).not.toBe(first.operationIdentity);
    expect(buildNativeMediaFinalRenderPreparationJobContractV1({
      ...input(),
      exactSourceRequest: request('overlay_exact_2'),
    }).operationIdentity).not.toBe(first.operationIdentity);
  });

  it('rejects forged fields, request hashes, aggregate inputs and execution profiles', () => {
    const valid = buildNativeMediaFinalRenderPreparationJobContractV1(input()).payload;
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      unexpected: true,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_FIELDS_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      exactSourceRequestSha256: sha('f'),
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_REQUEST_HASH_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      exactSourceRequest: [request(), request()],
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_REQUEST_INVALID');
    expect(() => buildNativeMediaFinalRenderPreparationJobContractV1({
      ...input(),
      executionProfile: {
        ...input().executionProfile,
        workerImageDigest: sha('b'),
      },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_EXECUTION_PROFILE_INVALID');
  });

  it('rejects policy and profile drift', () => {
    const valid = buildNativeMediaFinalRenderPreparationJobContractV1(input()).payload;
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      executionProfile: {
        ...valid.executionProfile,
        compatibilityProfileVersion: 'EDITRON_UNKNOWN_PROFILE',
      },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_EXECUTION_PROFILE_INVALID');
    expect(() => assertNativeMediaFinalRenderPreparationJobInputV1({
      ...valid,
      policyBindings: {
        ...valid.policyBindings,
        encoderPolicyVersion: 'EDITRON_UNKNOWN_ENCODER',
      },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_POLICY_VERSION_INVALID');

  });
});
