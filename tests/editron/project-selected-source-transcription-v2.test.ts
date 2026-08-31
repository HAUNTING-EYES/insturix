import { describe, expect, it, vi } from 'vitest';

import type { Project }
  from '@/lib/editron/services/project-service';
import {
  resolveProjectSelectedSourceTranscriptionV2,
  type ProjectSelectedSourceTranscriptionPortsV2,
} from '@/lib/editron/services/project-selected-source-transcription-v2';
import type { ProjectSelectedVideoSourceTimeBindingResultV1 }
  from '@/lib/editron/services/project-selected-video-source-time-binding-v1';
import { createAssetTranscriptionSourceBindingV2 }
  from '@/lib/editron/services/asset-transcription-source-binding-v2';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import type { SourceBoundAssetTranscriptionSuccessV2 }
  from '@/lib/editron/services/source-bound-asset-transcription-v2';

const REVISION = Object.freeze({
  schemaVersion: 1 as const,
  value: 4,
  compatibilityUpdatedAt: '2026-08-31T14:00:00.000Z',
});
type RequestV2 = Parameters<
  typeof resolveProjectSelectedSourceTranscriptionV2
>[0];

describe('project selected source transcription V2', () => {
  it('passes the exact selected source and project scope to transcription', async () => {
    const sourceVersion = source();
    const selection = resolvedSelection(sourceVersion, 'MASTER');
    const resolveSelectedSource = vi.fn(async () => selection);
    const success = transcriptionSuccess(sourceVersion);
    const resolveTranscription = vi.fn(async () => success);
    const input = request();

    const result = await resolveProjectSelectedSourceTranscriptionV2(
      input,
      ports({ resolveSelectedSource, resolveTranscription }),
    );

    expect(result).toMatchObject({
      disposition: 'CACHE_HIT',
      selectedSource: {
        sourceRole: 'MASTER',
        sourceVersion: {
          sourceVersionSha256: sourceVersion.sourceVersionSha256,
        },
      },
    });
    expect(resolveSelectedSource).toHaveBeenCalledWith({
      projectId: 'project-1',
      overlayId: 8,
      assetId: 'asset-1',
      sourcePin: input.overlay.sourceVersionPinV1,
      asset: input.asset,
    });
    expect(resolveTranscription).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'org-1',
        userId: 'member-1',
        orgId: 'org-1',
        projectId: 'project-1',
        projectOwnerId: 'owner-1',
        projectRevision: REVISION,
        asset: input.asset,
        sourceVersion,
        sourceRole: 'MASTER',
        precision: 'MEASURED_WORD_REQUIRED',
        eligibleProviderIds: ['deepgram'],
      }),
      expect.any(Object),
    );
  });

  it('stops before transcription when selected source proof is unavailable', async () => {
    const resolveSelectedSource = vi.fn(async () => ({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'SOURCE_VERSION_EVIDENCE_REQUIRED' as const,
    }));
    const resolveTranscription = vi.fn();

    expect(await resolveProjectSelectedSourceTranscriptionV2(
      request(),
      ports({ resolveSelectedSource, resolveTranscription }),
    )).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode:
        'PROJECT_SELECTED_TRANSCRIPTION_SOURCE_SOURCE_VERSION_EVIDENCE_REQUIRED',
    });
    expect(resolveTranscription).not.toHaveBeenCalled();
  });

  it('rejects an overlay/asset mismatch before source selection', async () => {
    const input = request();
    const resolveSelectedSource = vi.fn();

    expect(await resolveProjectSelectedSourceTranscriptionV2(
      {
        ...input,
        overlay: { ...input.overlay, assetId: 'asset-other' },
      },
      ports({ resolveSelectedSource }),
    )).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'PROJECT_SELECTED_TRANSCRIPTION_ASSET_SCOPE_MISMATCH',
    });
    expect(resolveSelectedSource).not.toHaveBeenCalled();
  });

  it('preserves a source-bound blocked result without inventing evidence', async () => {
    const resolveSelectedSource = vi.fn(async () =>
      resolvedSelection(source(), 'PROXY'));
    const resolveTranscription = vi.fn(async () => ({
      disposition: 'BLOCKED' as const,
      diagnosticCode: 'SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_NOT_CURRENT',
    }));

    expect(await resolveProjectSelectedSourceTranscriptionV2(
      request(),
      ports({ resolveSelectedSource, resolveTranscription }),
    )).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_NOT_CURRENT',
    });
  });
});

function ports(overrides: Partial<ProjectSelectedSourceTranscriptionPortsV2>) {
  return {
    transcription: {
      cache: { get: vi.fn(), save: vi.fn() },
      rightsReader: { read: vi.fn() },
      projectRevisionReader: { getProjectRevision: vi.fn() },
    },
    ...overrides,
  } satisfies ProjectSelectedSourceTranscriptionPortsV2;
}

function request(): RequestV2 {
  const sourceVersion = source();
  return {
    project: {
      projectId: 'project-1',
      userId: 'owner-1',
      orgId: 'org-1',
    } as Project,
    projectRevision: REVISION,
    userId: 'member-1',
    overlay: {
      id: 8,
      type: 'video' as const,
      assetId: 'asset-1',
      sourceVersionPinV1: { pinSha256: 'pin-sentinel' },
    } as unknown as RequestV2['overlay'],
    asset: {
      assetId: 'asset-1',
      userId: 'owner-1',
      orgId: 'org-1',
      type: 'video' as const,
      filename: 'source.mp4',
      source: 'user-upload' as const,
      gcsPath: null,
      cachedUrl: 'https://stale.example.com/source.mp4',
      urlExpiresAt: new Date('2026-09-01T00:00:00.000Z'),
      size: 4_096,
      uploadedAt: new Date('2026-08-31T00:00:00.000Z'),
      sourceVersionV1: sourceVersion,
    } as unknown as RequestV2['asset'],
    requestedLanguage: null,
    precision: 'MEASURED_WORD_REQUIRED' as const,
    eligibleProviderIds: ['deepgram'] as const,
    privacyEgressPolicyRef: artifact('policy'),
  };
}

function source() {
  return createMediaSourceVersionV1({
    owner: { kind: 'ORG', orgId: 'org-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 4_096,
    contentSha256: 'a'.repeat(64),
    storageVersion: createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: 'private/source.mp4' },
      byteLength: 4_096,
      providerVersion: { kind: 'R2_ETAG', value: 'etag-source' },
    }),
  });
}

function resolvedSelection(
  sourceVersion: ReturnType<typeof source>,
  sourceRole: 'PROXY' | 'MASTER',
): Extract<
  ProjectSelectedVideoSourceTimeBindingResultV1,
  Readonly<{ disposition: 'RESOLVED' }>
> {
  return Object.freeze({
    disposition: 'RESOLVED' as const,
    kind: 'EDITRON_PROJECT_SELECTED_VIDEO_SOURCE_TIME_BINDING_V1' as const,
    sourceRole,
    storageKey: sourceVersion.storageVersion.locator.objectKey,
    sourcePinSha256: 'b'.repeat(64),
    activeMappingStateSha256: 'c'.repeat(64),
    sourceVersionEvidenceSha256: 'd'.repeat(64),
    sourceVersion,
    binding: {} as never,
  });
}

function transcriptionSuccess(
  sourceVersion: ReturnType<typeof source>,
): SourceBoundAssetTranscriptionSuccessV2 {
  return {
    disposition: 'CACHE_HIT',
    projectRevision: REVISION,
    sourceBindingV2: createAssetTranscriptionSourceBindingV2({
      userId: 'member-1',
      assetId: 'asset-1',
      sourceRole: 'MASTER',
      sourceVersion,
      precision: 'MEASURED_WORD_REQUIRED',
    }),
    sourceRightsAuthorization: {} as never,
    evidence: {} as never,
  };
}

function artifact(tag: string) {
  return {
    ownerId: 'POLICY_SERVICE',
    artifactId: tag,
    artifactVersion: '1',
    artifactSha256: 'e'.repeat(64),
  };
}
