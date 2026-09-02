import type {
  ClipOverlay,
  ImageOverlay,
  MgSequenceOverlay,
  Overlay,
  SoundOverlay,
} from '@/components/editron/editor/version-7.0.0/types';

import {
  canonicalizeEditronJsonV1,
  hashEditronCanonicalJsonV1,
  hashEditronPersistedJsonV1,
} from './canonical-json-v1';
import { assertMediaSourceVersionV1, type MediaSourceVersionV1 } from './media-source-version-v1';
import { assertProjectVideoSourceVersionPinV1 } from './project-video-source-version-pin-v1';
import {
  createProjectWholeStateMediaPrerequisiteReceiptV1,
  type ProjectWholeStateMediaPrerequisiteEntryV1,
  type ProjectWholeStateMediaPrerequisiteReceiptV1,
} from './project-whole-state-media-prerequisite-contract-v1';
import type { ProjectRevisionV1 } from './project-revision-v1';

type StoredAssetV1 = Record<string, unknown> & { assetId: string };
type MediaOverlayV1 = ClipOverlay | ImageOverlay | SoundOverlay | MgSequenceOverlay;
type SourceRightsAuthorizationEvidenceV1 = Readonly<{
  receiptSha256: string;
  sourceMediaRightsStateSha256V1: string;
  sourceMediaRightsRecordSha256: string;
  evaluatedAt: string;
}>;
type SourceRightsResultV1 = Readonly<
  | { disposition: 'AUTHORIZED'; receipt: SourceRightsAuthorizationEvidenceV1 }
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>;

export interface ProjectWholeStateMediaPrerequisitePortsV1 {
  loadAssets(assetIds: readonly string[]): Promise<readonly StoredAssetV1[]>;
  authorizeSourceRights(input: Readonly<{
    tenantId: string;
    userId: string;
    orgId: string | null;
    projectId: string;
    projectOwnerId: string;
    sourceVersion: Readonly<MediaSourceVersionV1>;
  }>): Promise<SourceRightsResultV1>;
  verifyAudioRights(input: Readonly<{
    userId: string;
    projectId: string;
    projectOwnerId: string;
    overlays: readonly Overlay[];
  }>): Promise<void>;
  now?: () => Date;
}

export async function issueProjectWholeStateMediaPrerequisiteV1(input: Readonly<{
  operation: ProjectWholeStateMediaPrerequisiteReceiptV1['operation'];
  tenantId: string;
  userId: string;
  projectOwnerId: string;
  orgId: string | null;
  projectId: string;
  projectRevision: ProjectRevisionV1;
  overlays: readonly Overlay[];
}>, ports: Readonly<ProjectWholeStateMediaPrerequisitePortsV1>): Promise<ProjectWholeStateMediaPrerequisiteReceiptV1> {
  assertPorts(ports);
  const mediaOverlays = input.overlays.filter(isMediaOverlay);
  if (new Set(mediaOverlays.map(({ id }) => id)).size !== mediaOverlays.length) {
    fail('PROJECT_WHOLE_STATE_MEDIA_OVERLAY_ID_DUPLICATE');
  }
  const assetIds = mediaOverlays.map((overlay) => assetIdFor(overlay));
  const assets = await ports.loadAssets([...new Set(assetIds)]);
  const assetsById = new Map<string, StoredAssetV1>();
  for (const asset of assets) {
    if (!asset || typeof asset.assetId !== 'string' || assetsById.has(asset.assetId)) {
      fail('PROJECT_WHOLE_STATE_MEDIA_ASSET_SET_INVALID');
    }
    assetsById.set(asset.assetId, asset);
  }
  if (mediaOverlays.some((overlay) => !assetsById.has(assetIdFor(overlay)))) {
    fail('PROJECT_WHOLE_STATE_MEDIA_ASSET_MISSING');
  }
  const audioOverlays = mediaOverlays.filter(requiresAudioRights);
  if (audioOverlays.length > 0) {
    await ports.verifyAudioRights({
      userId: input.userId,
      projectId: input.projectId,
      projectOwnerId: input.projectOwnerId,
      overlays: audioOverlays,
    });
  }

  const rightsBySource = new Map<string, SourceRightsAuthorizationEvidenceV1>();
  const mediaEntries: ProjectWholeStateMediaPrerequisiteEntryV1[] = [];
  for (const overlay of mediaOverlays) {
    const assetId = assetIdFor(overlay);
    const asset = assetsById.get(assetId)!;
    assertAssetScope(asset, overlay.type, input);
    if (overlay.type === 'mg-sequence') {
      mediaEntries.push(sequenceEntry(overlay, asset));
      continue;
    }
    const sourceVersion = sourceVersionFor(overlay, asset, input.projectId);
    let rightsEvidence = rightsBySource.get(sourceVersion.sourceVersionSha256);
    if (!rightsEvidence) {
      const authorization = await ports.authorizeSourceRights({
        tenantId: input.tenantId,
        userId: input.userId,
        orgId: input.orgId,
        projectId: input.projectId,
        projectOwnerId: input.projectOwnerId,
        sourceVersion,
      });
      if (authorization.disposition !== 'AUTHORIZED') {
        fail(`PROJECT_WHOLE_STATE_MEDIA_RIGHTS_${authorization.diagnosticCode}`);
      }
      if (!validSourceRightsEvidence(authorization.receipt)) {
        fail('PROJECT_WHOLE_STATE_MEDIA_RIGHTS_RECEIPT_INVALID');
      }
      rightsEvidence = authorization.receipt;
      rightsBySource.set(sourceVersion.sourceVersionSha256, rightsEvidence);
    }
    mediaEntries.push({
      overlayId: overlay.id,
      overlayType: overlay.type,
      assetId,
      overlayFingerprintSha256: hashEditronPersistedJsonV1(overlay),
      source: {
        disposition: 'QUALIFIED_MEDIA_SOURCE_VERSION',
        sourceVersionSha256: sourceVersion.sourceVersionSha256,
        storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
      },
      rights: { disposition: 'PROJECT_SOURCE_AUTHORIZED', ...rightsEvidence },
      audio: requiresAudioRights(overlay)
        ? { disposition: 'VERIFIED', evidenceSha256: audioEvidenceSha256(overlay, asset) }
        : { disposition: 'NOT_APPLICABLE', evidenceSha256: null },
      predecessor: predecessorFor(overlay, asset),
    });
  }
  const issuedAt = (ports.now ?? (() => new Date()))();
  if (!(issuedAt instanceof Date) || Number.isNaN(issuedAt.getTime())) {
    fail('PROJECT_WHOLE_STATE_MEDIA_TIME_INVALID');
  }
  return createProjectWholeStateMediaPrerequisiteReceiptV1({
    operation: input.operation,
    projectId: input.projectId,
    userId: input.userId,
    projectOwnerId: input.projectOwnerId,
    orgId: input.orgId,
    projectRevision: input.projectRevision,
    mediaEntries,
    issuedAt: issuedAt.toISOString(),
  });
}

function isMediaOverlay(overlay: Overlay): overlay is MediaOverlayV1 {
  return ['video', 'image', 'sound', 'mg-sequence'].includes(overlay.type);
}

function assetIdFor(overlay: Overlay): string {
  const assetId = (overlay as { assetId?: unknown }).assetId;
  if (typeof assetId !== 'string' || !assetId.trim() || assetId.length > 500) {
    fail('PROJECT_WHOLE_STATE_MEDIA_ASSET_ID_INVALID');
  }
  return assetId;
}

function assertAssetScope(
  asset: StoredAssetV1,
  overlayType: string,
  input: { projectOwnerId: string; orgId: string | null },
): void {
  const expectedType = overlayType === 'sound' ? 'audio'
    : overlayType === 'mg-sequence' ? 'sequence' : overlayType;
  const owned = asset.userId === input.projectOwnerId
    || (input.orgId !== null && asset.orgId === input.orgId);
  if (!owned || asset.type !== expectedType) fail('PROJECT_WHOLE_STATE_MEDIA_ASSET_SCOPE_INVALID');
}

function sourceVersionFor(
  overlay: Overlay,
  asset: StoredAssetV1,
  projectId: string,
): Readonly<MediaSourceVersionV1> {
  const candidates = [asset.sourceVersionV1, asset.proxySourceVersionV1].flatMap((value) => {
    try { return [assertMediaSourceVersionV1(value)]; } catch { return []; }
  });
  let source: Readonly<MediaSourceVersionV1> | undefined;
  if (overlay.type === 'video' && overlay.sourceVersionPinV1 !== undefined) {
    const pin = assertProjectVideoSourceVersionPinV1(overlay.sourceVersionPinV1);
    if (pin.projectId !== projectId || pin.overlayId !== overlay.id || pin.assetId !== overlay.assetId) {
      fail('PROJECT_WHOLE_STATE_MEDIA_SOURCE_PIN_SCOPE_MISMATCH');
    }
    source = candidates.find((candidate) => candidate.sourceVersionSha256 === pin.sourceVersionSha256
      && candidate.storageVersion.storageVersionSha256 === pin.storageVersionSha256);
  } else if (candidates.length === 1) source = candidates[0];
  if (!source || source.assetId !== asset.assetId || source.mediaKind !== asset.type
    || !sourceOwnerMatchesAsset(source, asset)) {
    fail('PROJECT_WHOLE_STATE_MEDIA_SOURCE_VERSION_INVALID');
  }
  return source;
}

function sourceOwnerMatchesAsset(source: Readonly<MediaSourceVersionV1>, asset: StoredAssetV1): boolean {
  return source.owner.kind === 'USER'
    ? source.owner.userId === asset.userId
    : source.owner.orgId === asset.orgId;
}

function requiresAudioRights(overlay: Overlay): boolean {
  return overlay.type === 'sound' || (overlay.type === 'video' && overlay.hasNativeAudio === true);
}

function audioEvidenceSha256(overlay: Overlay, asset: StoredAssetV1): string {
  const record = overlay as unknown as Record<string, unknown>;
  return hashEditronCanonicalJsonV1({
    overlayId: overlay.id,
    assetId: asset.assetId,
    audioRights: record.audioRights ?? null,
    musicRights: record.musicRights ?? null,
    storedAudioRights: asset.audioRights ?? null,
    storedMusicRights: asset.musicRights ?? null,
  });
}

function predecessorFor(
  overlay: Overlay,
  asset: StoredAssetV1,
): ProjectWholeStateMediaPrerequisiteEntryV1['predecessor'] {
  const record = overlay as unknown as Record<string, unknown>;
  const generatedVideo = record.generatedVideoReceipt;
  if (generatedVideo !== undefined || asset.generatedVideoReceipt !== undefined) {
    if (generatedVideo === undefined || asset.generatedVideoReceipt === undefined
      || canonicalizeEditronJsonV1(generatedVideo) !== canonicalizeEditronJsonV1(asset.generatedVideoReceipt)) {
      fail('PROJECT_WHOLE_STATE_MEDIA_GENERATED_VIDEO_PREDECESSOR_INVALID');
    }
    return { disposition: 'GENERATED_VIDEO_RECEIPT', receiptSha256: hashEditronCanonicalJsonV1(generatedVideo) };
  }
  const derived = asset.audioSeparationReceipt ?? asset.generationReceipt
    ?? asset.libraryLicenseReceipt ?? asset.providerReceipt;
  if (derived !== undefined) {
    return { disposition: 'DERIVED_MEDIA_RECEIPT', receiptSha256: hashEditronCanonicalJsonV1(derived) };
  }
  if (asset.parentAssetId !== undefined || !['user-upload', 'public'].includes(String(asset.source))) {
    fail('PROJECT_WHOLE_STATE_MEDIA_PREDECESSOR_REQUIRED');
  }
  return { disposition: 'ORIGINAL_SOURCE', receiptSha256: null };
}

function sequenceEntry(overlay: Overlay, asset: StoredAssetV1): ProjectWholeStateMediaPrerequisiteEntryV1 {
  const metadata = (overlay as unknown as { metadata?: Record<string, unknown> }).metadata;
  const codegen = asset.codegen as Record<string, unknown> | undefined;
  if (asset.status !== 'ready' || !codegen?.receipt || !metadata?.receipt
    || canonicalizeEditronJsonV1(codegen.receipt) !== canonicalizeEditronJsonV1(metadata.receipt)) {
    fail('PROJECT_WHOLE_STATE_MEDIA_MG_PREDECESSOR_INVALID');
  }
  const receiptSha256 = hashEditronCanonicalJsonV1(codegen.receipt);
  return {
    overlayId: overlay.id,
    overlayType: 'mg-sequence',
    assetId: asset.assetId,
    overlayFingerprintSha256: hashEditronPersistedJsonV1(overlay),
    source: { disposition: 'PROJECT_GENERATED_SEQUENCE', sourceIdentitySha256: hashEditronCanonicalJsonV1({
      assetId: asset.assetId, sequenceId: asset.sequenceId, frameCount: asset.frameCount,
      fps: asset.fps, r2Prefix: asset.r2Prefix, receiptSha256,
    }) },
    rights: { disposition: 'INTERNAL_GENERATED_ARTIFACT', receiptSha256: null },
    audio: { disposition: 'NOT_APPLICABLE', evidenceSha256: null },
    predecessor: { disposition: 'GENERATED_MG_SEQUENCE_RECEIPT', receiptSha256 },
  };
}

function assertPorts(ports: Readonly<ProjectWholeStateMediaPrerequisitePortsV1>): void {
  if (typeof ports?.loadAssets !== 'function' || typeof ports.authorizeSourceRights !== 'function'
    || typeof ports.verifyAudioRights !== 'function' || (ports.now !== undefined && typeof ports.now !== 'function')) {
    fail('PROJECT_WHOLE_STATE_MEDIA_PORT_INVALID');
  }
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function validSourceRightsEvidence(value: SourceRightsAuthorizationEvidenceV1): boolean {
  return isSha256(value.receiptSha256)
    && isSha256(value.sourceMediaRightsStateSha256V1)
    && isSha256(value.sourceMediaRightsRecordSha256)
    && typeof value.evaluatedAt === 'string'
    && !Number.isNaN(Date.parse(value.evaluatedAt));
}

function fail(code: string): never { throw new Error(code); }
