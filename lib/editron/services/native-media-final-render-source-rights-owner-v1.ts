import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import { readNativeMediaFinalRenderVideoOverlayV1 } from './native-media-final-render-admission-v1';
import {
  createNativeMediaFinalRenderPublicationRightsReceiptV1,
  type NativeMediaFinalRenderPublicationRightsOwnerV1,
} from './native-media-final-render-prepared-source-publisher-v1';
import {
  createNativeMediaFinalRenderArtifactV1,
  type NativeMediaFinalRenderArtifactV1,
} from './native-media-final-render-source-preparation-v1';
import { verifyRenderAudioRightsAuthority } from './render-audio-rights-authority';
import {
  assertSourceMediaRightsGrantStateV1,
  SOURCE_MEDIA_RIGHTS_OWNER_ID_V1,
  SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1,
  type SourceMediaRightsRecordV1,
} from './source-media-rights-owner-v1';
import {
  createSourceMediaRightsLedgerScopeV1,
  type SourceMediaRightsLedgerReaderV1,
} from './source-media-rights-ledger-v1';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';

export const NATIVE_MEDIA_FINAL_RENDER_SOURCE_RIGHTS_ADAPTER_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_SOURCE_RIGHTS_ADAPTER_V1' as const;

type AudioRightsVerifier = (
  input: Parameters<typeof verifyRenderAudioRightsAuthority>[0],
) => Promise<void>;

export function createNativeMediaFinalRenderSourceRightsOwnerV1(
  ports: Readonly<{
    rightsReader: Readonly<SourceMediaRightsLedgerReaderV1>;
    now?: () => Date;
    verifyAudioRights?: AudioRightsVerifier;
  }>,
): NativeMediaFinalRenderPublicationRightsOwnerV1 {
  if (typeof ports?.rightsReader?.read !== 'function') {
    throw new Error('SOURCE_MEDIA_RIGHTS_READER_PORT_INVALID');
  }
  if (ports.now !== undefined && typeof ports.now !== 'function') {
    throw new Error('SOURCE_MEDIA_RIGHTS_NOW_PORT_INVALID');
  }
  if (ports.verifyAudioRights !== undefined
    && typeof ports.verifyAudioRights !== 'function') {
    throw new Error('SOURCE_MEDIA_RIGHTS_AUDIO_AUTHORITY_PORT_INVALID');
  }
  const now = ports.now ?? (() => new Date());
  const verifyAudioRights = ports.verifyAudioRights
    ?? ((input) => verifyRenderAudioRightsAuthority(input));

  return Object.freeze({
    ownerId: SOURCE_MEDIA_RIGHTS_OWNER_ID_V1,
    ownerVersion: SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1,
    async authorize(
      input: Parameters<NativeMediaFinalRenderPublicationRightsOwnerV1['authorize']>[0],
    ) {
      try {
        const artifact = assertArtifact(input.artifact);
        const overlay = assertOverlay(input.overlay, artifact);
        const sourceVersion = assertMediaSourceVersionV1(input.asset.sourceVersionV1);
        assertArtifactScope(input, artifact, overlay, sourceVersion);

        let rightsState;
        try {
          const stored = await ports.rightsReader.read(
            createSourceMediaRightsLedgerScopeV1({
              tenantId: input.tenantId,
              orgId: input.orgId,
              projectId: input.projectId,
              assetId: sourceVersion.assetId,
              sourceVersionSha256: sourceVersion.sourceVersionSha256,
            }),
          );
          rightsState = stored === null
            ? null
            : assertSourceMediaRightsGrantStateV1(stored);
        } catch {
          fail('SOURCE_MEDIA_RIGHTS_EVIDENCE_INVALID');
        }
        if (!rightsState) fail('SOURCE_MEDIA_RIGHTS_EVIDENCE_MISSING');
        if (rightsState.sourceMediaRightsRevocationV1) {
          fail('SOURCE_MEDIA_RIGHTS_REVOKED');
        }
        const record = rightsState.sourceMediaRightsV1;
        assertRightsScope(record, input, sourceVersion.owner);
        assertLicenseActive(record, now());

        const audioEvidenceSha256 = await authorizeAudio(
          artifact,
          input.overlay,
          input.userId,
          input.projectId,
          input.projectOwnerId,
          verifyAudioRights,
        );
        const rightsEvidenceSha256 = hashEditronCanonicalJsonV1({
          adapterVersion: NATIVE_MEDIA_FINAL_RENDER_SOURCE_RIGHTS_ADAPTER_VERSION_V1,
          sourceMediaRightsStateSha256V1:
            rightsState.sourceMediaRightsStateSha256V1,
          sourceMediaRightsRecordSha256: record.recordSha256,
          sourceMediaRightsRevocationSha256: null,
          audioEvidenceSha256,
        });
        return Object.freeze({
          disposition: 'AUTHORIZED' as const,
          receipt: createNativeMediaFinalRenderPublicationRightsReceiptV1({
            ownerId: SOURCE_MEDIA_RIGHTS_OWNER_ID_V1,
            ownerVersion: SOURCE_MEDIA_RIGHTS_OWNER_VERSION_V1,
            tenantId: input.tenantId,
            userId: input.userId,
            orgId: input.orgId,
            projectId: input.projectId,
            projectOwnerId: input.projectOwnerId,
            sequenceId: input.sequenceId,
            projectRevision: input.projectRevision,
            overlayId: artifact.overlayId,
            assetId: artifact.assetId,
            sourceVersionSha256: artifact.sourceVersionSha256,
            artifactBindingSha256: artifact.artifactBindingSha256,
            currentScopeSha256: input.currentScopeSha256,
            rightsEvidenceSha256,
          }),
        });
      } catch (error) {
        return Object.freeze({
          disposition: 'BLOCKED' as const,
          diagnosticCode: diagnostic(error),
        });
      }
    },
  });
}

function assertArtifact(
  value: NativeMediaFinalRenderArtifactV1,
): NativeMediaFinalRenderArtifactV1 {
  try {
    const { artifactBindingSha256, ...material } = value;
    const rebuilt = createNativeMediaFinalRenderArtifactV1(material);
    if (rebuilt.artifactBindingSha256 !== artifactBindingSha256) {
      fail('SOURCE_MEDIA_RIGHTS_ARTIFACT_INVALID');
    }
    return rebuilt;
  } catch {
    fail('SOURCE_MEDIA_RIGHTS_ARTIFACT_INVALID');
  }
}

function assertOverlay(
  value: Overlay,
  artifact: NativeMediaFinalRenderArtifactV1,
) {
  try {
    const overlay = readNativeMediaFinalRenderVideoOverlayV1(value);
    if (overlay.overlayId !== artifact.overlayId
      || overlay.assetId !== artifact.assetId
      || overlay.overlayTimingSha256 !== artifact.overlayTimingSha256
      || (overlay.renderNativeAudio
        ? artifact.audio.disposition !== 'EMBEDDED_EXACT_NATIVE_PCM'
        : artifact.audio.disposition !== 'NO_AUDIO_MAPPING_REQUESTED')) {
      fail('SOURCE_MEDIA_RIGHTS_OVERLAY_SCOPE_MISMATCH');
    }
    return overlay;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SOURCE_MEDIA_RIGHTS_')) {
      throw error;
    }
    fail('SOURCE_MEDIA_RIGHTS_OVERLAY_INVALID');
  }
}

function assertArtifactScope(
  input: Parameters<NativeMediaFinalRenderPublicationRightsOwnerV1['authorize']>[0],
  artifact: NativeMediaFinalRenderArtifactV1,
  overlay: ReturnType<typeof readNativeMediaFinalRenderVideoOverlayV1>,
  sourceVersion: ReturnType<typeof assertMediaSourceVersionV1>,
): void {
  if (artifact.projectId !== input.projectId
    || artifact.sequenceId !== input.sequenceId
    || hashEditronCanonicalJsonV1(artifact.projectRevision)
      !== hashEditronCanonicalJsonV1(input.projectRevision)
    || artifact.assetId !== sourceVersion.assetId
    || artifact.sourceVersionSha256 !== sourceVersion.sourceVersionSha256
    || artifact.storageVersionSha256
      !== sourceVersion.storageVersion.storageVersionSha256
    || input.asset.assetId !== sourceVersion.assetId
    || input.asset.type !== sourceVersion.mediaKind
    || overlay.assetId !== sourceVersion.assetId) {
    fail('SOURCE_MEDIA_RIGHTS_ARTIFACT_SCOPE_MISMATCH');
  }
}

function assertRightsScope(
  record: SourceMediaRightsRecordV1,
  input: Parameters<NativeMediaFinalRenderPublicationRightsOwnerV1['authorize']>[0],
  sourceOwner: ReturnType<typeof assertMediaSourceVersionV1>['owner'],
): void {
  if (record.tenantId !== input.tenantId
    || record.orgId !== input.orgId
    || record.projectId !== input.projectId) {
    fail('SOURCE_MEDIA_RIGHTS_PROJECT_SCOPE_MISMATCH');
  }
  if (record.disposition === 'OWNED_BY_USER') {
    if (sourceOwner.kind !== 'USER'
      || record.attestedByUserId !== sourceOwner.userId
      || (input.userId !== sourceOwner.userId
        && input.projectOwnerId !== sourceOwner.userId)) {
      fail('SOURCE_MEDIA_RIGHTS_PRINCIPAL_SCOPE_MISMATCH');
    }
    return;
  }
  if (record.disposition === 'OWNED_BY_ORG') {
    if (sourceOwner.kind !== 'ORG'
      || input.orgId !== sourceOwner.orgId) {
      fail('SOURCE_MEDIA_RIGHTS_PRINCIPAL_SCOPE_MISMATCH');
    }
    return;
  }
  if (record.orgId === null
    && input.userId !== record.attestedByUserId
    && input.projectOwnerId !== record.attestedByUserId) {
    fail('SOURCE_MEDIA_RIGHTS_PRINCIPAL_SCOPE_MISMATCH');
  }
}

function assertLicenseActive(
  record: SourceMediaRightsRecordV1,
  value: Date,
): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    fail('SOURCE_MEDIA_RIGHTS_CURRENT_TIME_INVALID');
  }
  if (record.disposition !== 'LICENSED_FOR_PROJECT') return;
  const license = record.license;
  if (!license
    || value.getTime() < Date.parse(license.validFrom)
    || (license.expiresAt !== null
      && value.getTime() >= Date.parse(license.expiresAt))) {
    fail('SOURCE_MEDIA_RIGHTS_LICENSE_NOT_ACTIVE');
  }
}

async function authorizeAudio(
  artifact: NativeMediaFinalRenderArtifactV1,
  overlay: Overlay,
  userId: string,
  projectId: string,
  projectOwnerId: string | null,
  verifyAudioRights: AudioRightsVerifier,
): Promise<string | null> {
  if (artifact.audio.disposition === 'NO_AUDIO_MAPPING_REQUESTED') return null;
  try {
    await verifyAudioRights({
      userId,
      projectId,
      projectOwnerId,
      overlays: [overlay],
    });
  } catch {
    fail('SOURCE_MEDIA_RIGHTS_AUDIO_UNVERIFIED');
  }
  const record = overlay as unknown as Record<string, unknown>;
  return hashEditronCanonicalJsonV1({
    authority: 'EDITRON_RENDER_AUDIO_RIGHTS_AUTHORITY',
    authorityVersion: '1',
    overlayId: artifact.overlayId,
    assetId: artifact.assetId,
    audioRights: record.audioRights ?? null,
    musicRights: record.musicRights ?? null,
    sourceDecodedPcmSha256: artifact.audio.sourceDecodedPcmSha256,
    decodedPcmEquivalenceReceiptSha256:
      artifact.audio.decodedPcmEquivalenceReceiptSha256,
  });
}

function diagnostic(error: unknown): string {
  if (error instanceof Error
    && /^SOURCE_MEDIA_RIGHTS_[A-Z0-9_]{1,180}$/.test(error.message)) {
    return error.message;
  }
  return 'SOURCE_MEDIA_RIGHTS_AUTHORIZATION_UNAVAILABLE';
}

function fail(code: string): never {
  throw new Error(code);
}
