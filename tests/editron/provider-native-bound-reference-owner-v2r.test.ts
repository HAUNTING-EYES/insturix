import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  assertProviderNativeReferenceArtifactV2R,
  bindProviderNativeReferenceArtifactV2R,
  createProviderNativeBoundReferenceOwnerV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-bound-reference-owner-v2r';
import { PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-reference-input-v2r';
import { PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-video-reference-input-v2r';

const SCOPE = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  projectId: 'project-1',
  episodeId: 'episode-1',
} as const;
const SOURCE = {
  ownerVersion: 'reference-pack-v1',
  ownerId: 'reference-pack-1',
  ownerSha256: 'a'.repeat(64),
} as const;

describe('provider-native bound reference owner V2R', () => {
  it('resolves an immutable ordered-frame reference only for its exact scope and manifest', async () => {
    const artifact = bindProviderNativeReferenceArtifactV2R({
      ...SCOPE,
      source: SOURCE,
      referenceInput: orderedFrames(),
    });
    const owner = createProviderNativeBoundReferenceOwnerV2R(artifact);
    const resolved = await owner.resolve({
      ...SCOPE,
      expectedManifestSha256: artifact.referenceManifestSha256,
    });

    expect(resolved).toEqual(artifact.referenceInput);
    expect(resolved).not.toBe(artifact.referenceInput);
    expect(Object.isFrozen(artifact)).toBe(true);
    await expect(owner.resolve({
      ...SCOPE,
      userId: 'user-2',
      expectedManifestSha256: artifact.referenceManifestSha256,
    })).rejects.toThrow('PROVIDER_NATIVE_BOUND_REFERENCE_SCOPE_MISMATCH');
    await expect(owner.resolve({
      ...SCOPE,
      expectedManifestSha256: 'f'.repeat(64),
    })).rejects.toThrow('PROVIDER_NATIVE_BOUND_REFERENCE_MANIFEST_MISMATCH');
  });

  it('supports the native-video arm without converting it to sampled frames', async () => {
    const input = nativeVideo();
    const artifact = bindProviderNativeReferenceArtifactV2R({
      ...SCOPE,
      source: SOURCE,
      referenceInput: input,
    });
    const resolved = await createProviderNativeBoundReferenceOwnerV2R(artifact)
      .resolve({
        ...SCOPE,
        expectedManifestSha256: artifact.referenceManifestSha256,
      });

    expect(resolved).toMatchObject({
      arm: 'NATIVE_VIDEO',
      bytesSha256: input.bytesSha256,
      sourceRate: { numerator: '30000', denominator: '1001' },
    });
  });

  it('rejects altered bytes even when the outer artifact hash is copied or rehashed', () => {
    const artifact = bindProviderNativeReferenceArtifactV2R({
      ...SCOPE,
      source: SOURCE,
      referenceInput: orderedFrames(),
    });
    const copied = structuredClone(artifact) as Record<string, unknown>;
    const input = copied.referenceInput as Record<string, unknown>;
    const frames = input.frames as Record<string, unknown>[];
    frames[0].bytesBase64 = Buffer.from('forged').toString('base64');
    expect(() => assertProviderNativeReferenceArtifactV2R(copied))
      .toThrow(/REFERENCE_FRAME_(BASE64|SIGNATURE|SHA256)/);

    const copiedHash = structuredClone(artifact) as Record<string, unknown>;
    copiedHash.artifactSha256 = 'f'.repeat(64);
    expect(() => assertProviderNativeReferenceArtifactV2R(copiedHash))
      .toThrow('PROVIDER_NATIVE_BOUND_REFERENCE_ARTIFACT_INVALID');
  });
});

function orderedFrames() {
  const first = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01,
  ]);
  const second = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x02,
  ]);
  return {
    version: PROVIDER_NATIVE_REFERENCE_INPUT_VERSION_V2R,
    arm: 'ORDERED_TIMESTAMPED_IMAGES' as const,
    referenceId: 'ref_ordered',
    referenceAssetSha256: 'b'.repeat(64),
    resolution: 'high' as const,
    frames: [frame('frame_1', '1000000', first), frame('frame_2', '2000000', second)],
  };
}

function frame(frameId: string, timestampUs: string, bytes: Buffer) {
  return {
    frameId,
    timestampUs,
    mimeType: 'image/png' as const,
    bytesBase64: bytes.toString('base64'),
    bytesSha256: sha256(bytes),
  };
}

function nativeVideo() {
  const bytes = Buffer.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d,
  ]);
  const bytesSha256 = sha256(bytes);
  return {
    version: PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R,
    arm: 'NATIVE_VIDEO' as const,
    referenceId: 'ref_video',
    referenceAssetSha256: bytesSha256,
    mimeType: 'video/mp4' as const,
    bytesBase64: bytes.toString('base64'),
    bytesSha256,
    byteLength: bytes.length,
    durationUs: '1000000',
    sourceRate: { numerator: '30000', denominator: '1001' },
    resolution: 'high' as const,
  };
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
