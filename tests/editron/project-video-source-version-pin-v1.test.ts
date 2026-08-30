import { beforeAll, describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  assertProjectVideoSourceVersionPinV1,
  createProjectVideoSourceVersionPinV1,
  resolveProjectVideoSourceStorageV1,
  type ProjectVideoSourceStorageAssetV1,
  type ProjectVideoSourceVersionPinV1,
} from '@/lib/editron/services/project-video-source-version-pin-v1';
import { assertMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import {
  buildMediaProxyMasterExactBoundaryFixtureV1,
  type MediaProxyMasterExactBoundaryFixtureV1,
} from './helpers/media-proxy-master-exact-boundary-fixture';

const PROJECT_ID = 'project-source-pin-a';
const OVERLAY_ID = 17;
const ISSUED_AT = new Date('2026-08-31T10:05:30.000Z');

describe('ProjectVideoSourceVersionPinV1', () => {
  let fixture: MediaProxyMasterExactBoundaryFixtureV1;
  let asset: ProjectVideoSourceStorageAssetV1;
  let proxyPin: ProjectVideoSourceVersionPinV1;
  let masterPin: ProjectVideoSourceVersionPinV1;

  beforeAll(async () => {
    fixture = await buildMediaProxyMasterExactBoundaryFixtureV1({
      tag: 'project-video-source-pin',
      cadence: 'VARIABLE',
    });
    const proxy = assertMediaSourceVersionV1(
      fixture.asset.proxySourceVersionV1,
    );
    const master = assertMediaSourceVersionV1(fixture.asset.sourceVersionV1);
    asset = {
      ...fixture.asset,
      r2Key: proxy.storageVersion.locator.objectKey,
      originalR2Key: master.storageVersion.locator.objectKey,
    };
    proxyPin = createProjectVideoSourceVersionPinV1({
      projectId: PROJECT_ID,
      overlayId: OVERLAY_ID,
      assetId: fixture.qualification.relation.assetId,
      sourceRole: 'PROXY',
      sourceVersionSha256: proxy.sourceVersionSha256,
      storageVersionSha256: proxy.storageVersion.storageVersionSha256,
      authority: {
        kind: 'PROJECT_PROXY_SOURCE_BINDING',
        bindingSha256: 'a'.repeat(64),
        proxyTimeMapReferenceSha256: hashEditronCanonicalJsonV1(
          fixture.qualification.mapping.proxyTimeMap,
        ),
      },
      issuedAt: ISSUED_AT,
    });
    masterPin = createProjectVideoSourceVersionPinV1({
      projectId: PROJECT_ID,
      overlayId: OVERLAY_ID,
      assetId: fixture.qualification.relation.assetId,
      sourceRole: 'MASTER',
      sourceVersionSha256: master.sourceVersionSha256,
      storageVersionSha256: master.storageVersion.storageVersionSha256,
      authority: {
        kind: 'PROJECT_PROXY_MASTER_RELINK',
        relinkStateSha256: 'b'.repeat(64),
        relationSha256: fixture.qualification.relation.relationSha256,
        activeMappingStateSha256:
          fixture.activeMappingState.proxyMasterActiveMappingStateSha256V1,
      },
      issuedAt: ISSUED_AT,
    });
  });

  it('issues a canonical immutable pin whose meaning is independent of key order', () => {
    const reordered = Object.fromEntries(
      Object.entries(proxyPin).reverse().map(([key, value]) => [
        key,
        key === 'authority'
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ]),
    );

    expect(assertProjectVideoSourceVersionPinV1(reordered)).toEqual(proxyPin);
    expect(Object.isFrozen(proxyPin)).toBe(true);
    expect(Object.isFrozen(proxyPin.authority)).toBe(true);
  });

  it('requires an explicit project pin for every dual-version asset', () => {
    expect(resolve({ sourcePin: undefined })).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'DUAL_VERSION_SOURCE_PIN_REQUIRED',
    });
  });

  it('keeps a proxy-pinned project on exact proxy bytes after master activation', () => {
    const proxy = assertMediaSourceVersionV1(asset.proxySourceVersionV1);

    expect(resolve({ sourcePin: proxyPin })).toEqual({
      disposition: 'PINNED_PROXY_SOURCE',
      storageKey: proxy.storageVersion.locator.objectKey,
      pin: proxyPin,
      activeMappingStateSha256:
        fixture.activeMappingState.proxyMasterActiveMappingStateSha256V1,
    });
  });

  it('selects master bytes only for a master pin bound to the current active mapping', () => {
    const master = assertMediaSourceVersionV1(asset.sourceVersionV1);

    expect(resolve({ sourcePin: masterPin })).toEqual({
      disposition: 'PINNED_MASTER_SOURCE',
      storageKey: master.storageVersion.locator.objectKey,
      pin: masterPin,
      activeMappingStateSha256:
        fixture.activeMappingState.proxyMasterActiveMappingStateSha256V1,
    });
  });

  it('rejects master selection when activation is absent or names another state', () => {
    const withoutActive = {
      ...asset,
      proxyMasterActiveMappingV1: undefined,
      proxyMasterActiveMappingStateSha256V1: undefined,
    };
    expect(resolve({ sourcePin: masterPin, asset: withoutActive })).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'ACTIVE_MAPPING_REQUIRED',
    });

    const stalePin = createProjectVideoSourceVersionPinV1({
      ...masterPin,
      authority: {
        ...masterPin.authority,
        activeMappingStateSha256: 'c'.repeat(64),
      } as Extract<
      ProjectVideoSourceVersionPinV1['authority'],
      { kind: 'PROJECT_PROXY_MASTER_RELINK' }
      >,
      issuedAt: ISSUED_AT,
    });
    expect(resolve({ sourcePin: stalePin })).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'ACTIVE_MAPPING_MISMATCH',
    });
  });

  it('rejects copied, tampered, and semantically reversed pins', () => {
    expect(resolve({ sourcePin: proxyPin, projectId: 'project-source-pin-b' }))
      .toEqual({
        disposition: 'UNVERIFIABLE',
        reason: 'SOURCE_PIN_SCOPE_MISMATCH',
      });
    expect(resolve({
      sourcePin: { ...proxyPin, pinSha256: 'f'.repeat(64) },
    })).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_PIN_INVALID',
    });
    expect(() => createProjectVideoSourceVersionPinV1({
      ...proxyPin,
      sourceRole: 'PROXY',
      authority: masterPin.authority,
      issuedAt: ISSUED_AT,
    })).toThrow('PROJECT_VIDEO_SOURCE_VERSION_PIN_AUTHORITY_MISMATCH');
  });

  it('rejects stale time-map authority and changed storage identity', () => {
    const staleMapPin = createProjectVideoSourceVersionPinV1({
      ...proxyPin,
      authority: {
        ...proxyPin.authority,
        proxyTimeMapReferenceSha256: 'd'.repeat(64),
      } as Extract<
      ProjectVideoSourceVersionPinV1['authority'],
      { kind: 'PROJECT_PROXY_SOURCE_BINDING' }
      >,
      issuedAt: ISSUED_AT,
    });
    expect(resolve({ sourcePin: staleMapPin })).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'ACTIVE_MAPPING_MISMATCH',
    });
    expect(resolve({
      sourcePin: proxyPin,
      asset: { ...asset, r2Key: 'another-proxy-object' },
    })).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_STORAGE_MISMATCH',
    });
  });

  it('rejects partial active state even when the project remains proxy-pinned', () => {
    expect(resolve({
      sourcePin: proxyPin,
      asset: {
        ...asset,
        proxyMasterActiveMappingStateSha256V1: undefined,
      },
    })).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'ACTIVE_MAPPING_INVALID',
    });
  });

  it('keeps a legacy single-source asset on its sole physical object', () => {
    expect(resolveProjectVideoSourceStorageV1({
      projectId: PROJECT_ID,
      overlayId: OVERLAY_ID,
      assetId: 'legacy-video-a',
      asset: {
        assetId: 'legacy-video-a',
        userId: 'user-a',
        type: 'video',
        r2Key: 'legacy-video-object',
      },
    })).toEqual({
      disposition: 'DIRECT_SOURCE',
      storageKey: 'legacy-video-object',
    });
  });

  function resolve(overrides: Readonly<{
    projectId?: string;
    sourcePin?: unknown;
    asset?: ProjectVideoSourceStorageAssetV1;
  }>): ReturnType<typeof resolveProjectVideoSourceStorageV1> {
    return resolveProjectVideoSourceStorageV1({
      projectId: overrides.projectId ?? PROJECT_ID,
      overlayId: OVERLAY_ID,
      assetId: fixture.qualification.relation.assetId,
      sourcePin: overrides.sourcePin,
      asset: overrides.asset ?? asset,
    });
  }
});
