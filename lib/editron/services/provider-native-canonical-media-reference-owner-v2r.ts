import { createHash } from 'node:crypto';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import type { EditorialPlanArtifactRefV1 } from './editorial-plan-v1';
import {
  assertProviderNativeCanonicalMediaReferenceBindingV2R,
  type ProviderNativeCanonicalMediaReferenceBindingV2R,
} from './provider-native-canonical-media-reference-v2r';
import type { ProviderNativeDurableReferenceOwnerV2R }
  from '../research/open-ended-planner/provider-native-episode-owner-artifact-resolver-v2r';
import {
  bindProviderNativeReferenceInputV2R,
  type ProviderNativeReferenceManifestV2R,
} from '../research/open-ended-planner/provider-native-reference-input-v2r';
import {
  bindProviderNativeVideoReferenceInputV2R,
  type ProviderNativeVideoReferenceManifestV2R,
} from '../research/open-ended-planner/provider-native-video-reference-input-v2r';
import type { ProviderNativeRouteV2R }
  from '../research/open-ended-planner/provider-native-tool-codecs-v2r';

type Scope = ProviderNativeCanonicalMediaReferenceBindingV2R['scope'];
type Artifact = ProviderNativeCanonicalMediaReferenceBindingV2R[
  'materialization'
]['artifacts'][number];

export interface ProviderNativeCanonicalMediaReferenceLocatorV2R {
  resolve(input: Readonly<{
    scope: Readonly<Scope>;
    expectedManifestSha256: string;
    expectedRouteSha256: string;
  }>): Promise<unknown>;
}

export interface ProviderNativeCanonicalMediaBytesOwnerV2R {
  read(input: Readonly<{
    scope: Readonly<Scope>;
    sourceAssetId: string;
    sourceAssetVersionSha256: string;
    referenceEnvelopeSha256: string;
    artifactId: string;
    artifactVersionSha256: string;
    expectedBytesSha256: string;
    expectedByteLength: number;
  }>): Promise<Uint8Array>;
}

export interface ProviderNativeCanonicalMediaPolicyOwnerV2R {
  assertAuthorized(input: Readonly<{
    scope: Readonly<Scope>;
    route: Readonly<ProviderNativeRouteV2R>;
    sourceAssetId: string;
    sourceContentSha256: string;
    rightsPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
    privacyEgressPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
  }>): Promise<Readonly<{ authorizationSha256: string }>>;
}

/**
 * Product implementation of the existing durable reference port. The route is
 * closed over only after the Plan definition is revalidated; the locator and
 * byte readers remain ports owned by canonical media/evidence storage.
 */
export function createProviderNativeCanonicalMediaReferenceOwnerV2R(
  input: Readonly<{
    route: Readonly<ProviderNativeRouteV2R>;
    locator: Readonly<ProviderNativeCanonicalMediaReferenceLocatorV2R>;
    bytes: Readonly<ProviderNativeCanonicalMediaBytesOwnerV2R>;
    policy: Readonly<ProviderNativeCanonicalMediaPolicyOwnerV2R>;
  }>,
): Readonly<ProviderNativeDurableReferenceOwnerV2R> {
  const routeSha256 = hashEditronCanonicalJsonV1(input.route);
  return {
    resolve: async (request) => {
      const scope = {
        tenantId: request.tenantId,
        userId: request.userId,
        projectId: request.projectId,
        episodeId: request.episodeId,
      };
      const binding = assertProviderNativeCanonicalMediaReferenceBindingV2R(
        await input.locator.resolve({
          scope,
          expectedManifestSha256: request.expectedManifestSha256,
          expectedRouteSha256: routeSha256,
        }),
      );
      assertResolutionBinding(binding, scope, routeSha256, request.expectedManifestSha256);
      const authorization = await input.policy.assertAuthorized({
        scope,
        route: binding.route,
        sourceAssetId: binding.source.assetId,
        sourceContentSha256: binding.source.contentSha256,
        rightsPolicyRef: binding.policy.rightsPolicyRef,
        privacyEgressPolicyRef: binding.policy.privacyEgressPolicyRef,
      });
      if (authorization.authorizationSha256 !== binding.policy.authorizationSha256) {
        throw new Error('PROVIDER_NATIVE_CANONICAL_MEDIA_POLICY_AUTHORIZATION_MISMATCH');
      }
      return binding.materialization.arm === 'NATIVE_VIDEO'
        ? resolveNativeVideo(binding, input.bytes)
        : resolveOrderedFrames(binding, input.bytes);
    },
  };
}

async function resolveNativeVideo(
  binding: Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R>,
  bytesOwner: Readonly<ProviderNativeCanonicalMediaBytesOwnerV2R>,
) {
  const manifest = binding.materialization.manifest as unknown as Readonly<
    ProviderNativeVideoReferenceManifestV2R
  >;
  const artifact = binding.materialization.artifacts[0];
  const bytes = await readVerifiedBytes(binding, artifact, bytesOwner);
  const rebound = bindProviderNativeVideoReferenceInputV2R({
    version: manifest.version,
    arm: manifest.arm,
    referenceId: manifest.referenceId,
    referenceAssetSha256: manifest.referenceAssetSha256,
    mimeType: manifest.mimeType,
    bytesBase64: Buffer.from(bytes).toString('base64'),
    bytesSha256: manifest.bytesSha256,
    byteLength: manifest.byteLength,
    durationUs: manifest.durationUs,
    sourceRate: manifest.sourceRate,
    resolution: manifest.resolution,
  });
  assertManifestReproduced(binding, rebound.manifestSha256);
  return rebound.input;
}

async function resolveOrderedFrames(
  binding: Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R>,
  bytesOwner: Readonly<ProviderNativeCanonicalMediaBytesOwnerV2R>,
) {
  const manifest = binding.materialization.manifest as unknown as Readonly<
    ProviderNativeReferenceManifestV2R
  >;
  const descriptors = new Map(
    binding.materialization.artifacts.map((artifact) => [artifact.frameId, artifact]),
  );
  const frames = await Promise.all(manifest.frames.map(async (frame) => {
    const artifact = descriptors.get(frame.frameId);
    if (!artifact) {
      throw new Error('PROVIDER_NATIVE_CANONICAL_MEDIA_FRAME_ARTIFACT_MISSING');
    }
    const bytes = await readVerifiedBytes(binding, artifact, bytesOwner);
    return {
      frameId: frame.frameId,
      timestampUs: frame.timestampUs,
      mimeType: frame.mimeType,
      bytesBase64: Buffer.from(bytes).toString('base64'),
      bytesSha256: frame.bytesSha256,
    };
  }));
  const rebound = bindProviderNativeReferenceInputV2R({
    version: manifest.version,
    arm: manifest.arm,
    referenceId: manifest.referenceId,
    referenceAssetSha256: manifest.referenceAssetSha256,
    resolution: manifest.resolution,
    frames,
  });
  assertManifestReproduced(binding, rebound.manifestSha256);
  return rebound.input;
}

async function readVerifiedBytes(
  binding: Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R>,
  artifact: Readonly<Artifact>,
  bytesOwner: Readonly<ProviderNativeCanonicalMediaBytesOwnerV2R>,
): Promise<Uint8Array> {
  const bytes = await bytesOwner.read({
    scope: binding.scope,
    sourceAssetId: binding.source.assetId,
    sourceAssetVersionSha256: binding.source.assetVersionSha256,
    referenceEnvelopeSha256: binding.source.referenceEnvelopeSha256,
    artifactId: artifact.artifactId,
    artifactVersionSha256: artifact.artifactVersionSha256,
    expectedBytesSha256: artifact.bytesSha256,
    expectedByteLength: artifact.byteLength,
  });
  if (!(bytes instanceof Uint8Array)
    || bytes.byteLength !== artifact.byteLength
    || createHash('sha256').update(bytes).digest('hex') !== artifact.bytesSha256) {
    throw new Error('PROVIDER_NATIVE_CANONICAL_MEDIA_BYTES_MISMATCH');
  }
  return bytes;
}

function assertResolutionBinding(
  binding: Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R>,
  scope: Readonly<Scope>,
  routeSha256: string,
  manifestSha256: string,
): void {
  if (binding.scope.tenantId !== scope.tenantId
    || binding.scope.userId !== scope.userId
    || binding.scope.projectId !== scope.projectId
    || binding.scope.episodeId !== scope.episodeId) {
    throw new Error('PROVIDER_NATIVE_CANONICAL_MEDIA_SCOPE_MISMATCH');
  }
  if (binding.routeSha256 !== routeSha256) {
    throw new Error('PROVIDER_NATIVE_CANONICAL_MEDIA_ROUTE_MISMATCH');
  }
  if (binding.materialization.manifestSha256 !== manifestSha256) {
    throw new Error('PROVIDER_NATIVE_CANONICAL_MEDIA_MANIFEST_MISMATCH');
  }
}

function assertManifestReproduced(
  binding: Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R>,
  manifestSha256: string,
): void {
  if (manifestSha256 !== binding.materialization.manifestSha256) {
    throw new Error('PROVIDER_NATIVE_CANONICAL_MEDIA_REPRODUCTION_MISMATCH');
  }
}
