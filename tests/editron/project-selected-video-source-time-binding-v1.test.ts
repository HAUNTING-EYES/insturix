import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  resolveProjectSelectedVideoSourceTimeBindingV1,
} from '@/lib/editron/services/project-selected-video-source-time-binding-v1';
import { createProjectVideoSourceVersionPinV1 }
  from '@/lib/editron/services/project-video-source-version-pin-v1';
import type { MediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import type { VerifiedVideoSourceEpochTimeBindingV3 }
  from '@/lib/editron/services/video-source-time-transform-v1';
import { buildMediaProxyMasterExactBoundaryFixtureV1 }
  from './helpers/media-proxy-master-exact-boundary-fixture';

const mocks = vi.hoisted(() => ({
  assertEvidence: vi.fn((value: unknown) => value),
  evidenceView: vi.fn((value: unknown) => value),
  resolveBinding: vi.fn((value: unknown) => (
    value as { binding?: VerifiedVideoSourceEpochTimeBindingV3 }
  ).binding ?? null),
}));

vi.mock('@/lib/editron/services/media-source-version-evidence-owner-v1', () => ({
  assertMediaSourceVersionEvidenceRecordV1: mocks.assertEvidence,
  mediaSourceVersionEvidenceAssetViewV1: mocks.evidenceView,
}));

vi.mock('@/lib/editron/services/video-source-time-transform-v1', () => ({
  resolveVerifiedVideoSourceEpochTimeBindingV3: mocks.resolveBinding,
}));

describe('project selected video source time binding v1', () => {
  beforeEach(() => {
    mocks.assertEvidence.mockClear();
    mocks.evidenceView.mockClear();
    mocks.resolveBinding.mockClear();
  });

  it('resolves a direct current proxy without historical evidence', async () => {
    const fixture = await activeFixture('selected-direct-proxy');
    const proxy = fixture.qualification.relation.proxy;
    const binding = bindingFromMap(
      fixture.qualification.mapping.proxyTimeMap,
      fixture.asset.assetId as string,
    );
    const loadSourceVersionEvidence = vi.fn();

    const result = await resolveProjectSelectedVideoSourceTimeBindingV1({
      projectId: 'project-direct',
      overlayId: 1,
      assetId: fixture.asset.assetId as string,
      asset: {
        assetId: fixture.asset.assetId,
        userId: fixture.asset.userId,
        type: 'video',
        isProxy: true,
        r2Key: fixture.proxySource.storageVersion.locator.objectKey,
        sourceVersionV1: fixture.proxySource,
        binding,
      } as never,
      ports: { loadSourceVersionEvidence },
    });

    expect(result).toMatchObject({
      disposition: 'RESOLVED',
      sourceRole: 'PROXY',
      storageKey: fixture.proxySource.storageVersion.locator.objectKey,
      sourceVersionEvidenceSha256: null,
      binding: { sourceVersionSha256: proxy.sourceVersionSha256 },
    });
    expect(loadSourceVersionEvidence).not.toHaveBeenCalled();
  });

  it.each(['PROXY', 'MASTER'] as const)(
    'resolves active mapped %s timing from exact source-version evidence',
    async (role) => {
      const fixture = await activeFixture(`selected-active-${role.toLowerCase()}`);
      const map = role === 'PROXY'
        ? fixture.qualification.mapping.proxyTimeMap
        : fixture.qualification.mapping.masterTimeMap;
      const source = role === 'PROXY'
        ? fixture.proxySource
        : fixture.masterSource;
      const evidence = {
        evidenceSha256: hash(`${role}-evidence`),
        sourceVersionV1: source,
        binding: bindingFromMap(map, fixture.asset.assetId as string),
      };
      const loadSourceVersionEvidence = vi.fn(async () => evidence);

      const result = await resolveProjectSelectedVideoSourceTimeBindingV1({
        projectId: 'project-active',
        overlayId: role === 'PROXY' ? 2 : 3,
        assetId: fixture.asset.assetId as string,
        sourcePin: pin(fixture, role, role === 'PROXY' ? 2 : 3),
        asset: fixture.asset as never,
        ports: { loadSourceVersionEvidence },
      });

      expect(result).toMatchObject({
        disposition: 'RESOLVED',
        sourceRole: role,
        sourceVersionEvidenceSha256: evidence.evidenceSha256,
        activeMappingStateSha256:
          fixture.activeMappingState.proxyMasterActiveMappingStateSha256V1,
        binding: {
          sourceVersionSha256: source.sourceVersionSha256,
          sourcePtsCadenceMapStateSha256V3:
            map.sourcePtsCadenceMapStateSha256V3,
        },
      });
      expect(loadSourceVersionEvidence).toHaveBeenCalledWith({
        owner: source.owner,
        assetId: source.assetId,
        sourceVersionSha256: source.sourceVersionSha256,
      });
    },
  );

  it('blocks active mapped timing when source-version evidence is absent', async () => {
    const fixture = await activeFixture('selected-missing-evidence');

    const result = await resolveProjectSelectedVideoSourceTimeBindingV1({
      projectId: 'project-active',
      overlayId: 4,
      assetId: fixture.asset.assetId as string,
      sourcePin: pin(fixture, 'MASTER', 4),
      asset: fixture.asset as never,
      ports: { loadSourceVersionEvidence: vi.fn(async () => null) },
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_VERSION_EVIDENCE_REQUIRED',
    });
  });

  it('blocks a historical proxy when no active mapping authorizes the join', async () => {
    const fixture = await activeFixture('selected-no-active');
    const asset = { ...fixture.asset } as Record<string, unknown>;
    delete asset.proxyMasterActiveMappingV1;
    delete asset.proxyMasterActiveMappingStateSha256V1;

    const result = await resolveProjectSelectedVideoSourceTimeBindingV1({
      projectId: 'project-active',
      overlayId: 5,
      assetId: fixture.asset.assetId as string,
      sourcePin: pin(fixture, 'PROXY', 5),
      asset: asset as never,
      ports: { loadSourceVersionEvidence: vi.fn() },
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'HISTORICAL_SOURCE_ACTIVE_MAPPING_REQUIRED',
    });
  });

  it('blocks evidence whose V3 binding differs from the active time map', async () => {
    const fixture = await activeFixture('selected-map-mismatch');
    const map = fixture.qualification.mapping.masterTimeMap;
    const evidence = {
      evidenceSha256: hash('mismatched-evidence'),
      sourceVersionV1: fixture.masterSource,
      binding: {
        ...bindingFromMap(map, fixture.asset.assetId as string),
        technicalObservationSha256: hash('forged-observation'),
      },
    };

    const result = await resolveProjectSelectedVideoSourceTimeBindingV1({
      projectId: 'project-active',
      overlayId: 6,
      assetId: fixture.asset.assetId as string,
      sourcePin: pin(fixture, 'MASTER', 6),
      asset: fixture.asset as never,
      ports: { loadSourceVersionEvidence: vi.fn(async () => evidence) },
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'ACTIVE_TIME_MAP_REFERENCE_MISMATCH',
    });
  });
});

async function activeFixture(tag: string) {
  const fixture = await buildMediaProxyMasterExactBoundaryFixtureV1({
    tag,
    cadence: 'EQUAL',
  });
  const asset = {
    ...fixture.asset,
  } as Record<string, unknown>;
  const fullProxy = fixture.asset.proxySourceVersionV1 as
    Readonly<MediaSourceVersionV1>;
  const fullMaster = fixture.asset.sourceVersionV1 as
    Readonly<MediaSourceVersionV1>;
  asset.r2Key = fullProxy.storageVersion.locator.objectKey;
  asset.originalR2Key = fullMaster.storageVersion.locator.objectKey;
  return {
    ...fixture,
    asset,
    proxySource: fullProxy,
    masterSource: fullMaster,
  };
}

function pin(
  fixture: Awaited<ReturnType<typeof activeFixture>>,
  role: 'PROXY' | 'MASTER',
  overlayId: number,
) {
  const source = role === 'PROXY'
    ? fixture.proxySource
    : fixture.masterSource;
  return createProjectVideoSourceVersionPinV1({
    projectId: 'project-active',
    overlayId,
    assetId: source.assetId,
    sourceRole: role,
    sourceVersionSha256: source.sourceVersionSha256,
    storageVersionSha256: source.storageVersion.storageVersionSha256,
    authority: role === 'PROXY'
      ? {
          kind: 'PROJECT_PROXY_SOURCE_BINDING',
          bindingSha256: hash('proxy-project-binding'),
          proxyTimeMapReferenceSha256: hashEditronCanonicalJsonV1(
            fixture.qualification.mapping.proxyTimeMap,
          ),
        }
      : {
          kind: 'PROJECT_PROXY_MASTER_RELINK',
          relinkStateSha256: hash('master-project-relink'),
          relationSha256: fixture.qualification.relation.relationSha256,
          activeMappingStateSha256:
            fixture.activeMappingState.proxyMasterActiveMappingStateSha256V1,
        },
    issuedAt: new Date('2026-08-31T10:06:00.000Z'),
  });
}

function bindingFromMap(
  map: Awaited<ReturnType<typeof activeFixture>>['qualification']['mapping']['proxyTimeMap'],
  assetId: string,
): VerifiedVideoSourceEpochTimeBindingV3 {
  return {
    schemaVersion: 3,
    kind: 'EDITRON_VERIFIED_VIDEO_SOURCE_EPOCH_TIME_BINDING_V3',
    assetId,
    sourceVersionSha256: map.sourceVersionSha256,
    storageVersionSha256: map.storageVersionSha256,
    sourceBindingSha256: map.sourceBindingSha256,
    technicalObservationSha256: map.technicalObservationSha256,
    sourcePtsCadenceMapStateSha256V3: map.sourcePtsCadenceMapStateSha256V3,
    mapBindingSha256: map.mapBindingSha256,
    terminalReceiptSha256: map.terminalReceiptSha256,
    verificationSha256: map.verificationSha256,
    epochIndexContentSha256: map.epochIndexContentSha256,
    streamId: map.streamId,
    videoStreamIndex: map.videoStreamIndex,
    sourceTimebase: { numerator: '1', denominator: '90000' },
    sourceCadence: { kind: 'CFR', durationTicks: '3000' },
    totalSourceFrameCount: map.totalFrameCount,
    bindingSha256: hash(`binding-${map.sourceVersionSha256}`),
  } as VerifiedVideoSourceEpochTimeBindingV3;
}

function hash(value: string): string {
  return hashEditronCanonicalJsonV1({ value });
}
