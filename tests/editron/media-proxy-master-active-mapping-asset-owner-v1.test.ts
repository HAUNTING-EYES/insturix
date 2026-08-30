import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  assertMediaProxyMasterActiveMappingV1,
  createMediaProxyMasterActiveMappingAssetStateV1,
  mediaProxyMasterActiveMappingAssetCompareAndSetFilterV1,
  persistMediaProxyMasterActiveMappingAssetStateV1,
  readMediaProxyMasterActiveMappingAssetStateV1,
  type MediaProxyMasterActiveMappingAssetInputV1,
  type MediaProxyMasterActiveMappingAssetStorePortsV1,
} from '@/lib/editron/services/media-proxy-master-active-mapping-asset-owner-v1';
import {
  qualifyMediaProxyMasterTimeMappingV1,
  type MediaProxyMasterMappingQualificationReceiptV1,
} from '@/lib/editron/services/media-proxy-master-mapping-qualification-v1';
import { createMediaSourceInvalidationPlanV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { buildMediaProxyMasterMappingQualificationFixtureV1 }
  from './helpers/media-proxy-master-mapping-qualification-fixture';

type QualificationFixtureV1 = Awaited<
ReturnType<typeof buildMediaProxyMasterMappingQualificationFixtureV1>
>;

describe('MediaProxyMasterActiveMappingAssetOwnerV1', () => {
  let fixture: QualificationFixtureV1;
  let otherFixture: QualificationFixtureV1;
  let qualification: MediaProxyMasterMappingQualificationReceiptV1;
  let replacementQualification: MediaProxyMasterMappingQualificationReceiptV1;

  beforeAll(async () => {
    [fixture, otherFixture] = await Promise.all([
      buildMediaProxyMasterMappingQualificationFixtureV1({ tag: 'active-a' }),
      buildMediaProxyMasterMappingQualificationFixtureV1({ tag: 'active-b' }),
    ]);
    qualification = qualify(fixture, 'd'.repeat(64), '2026-08-31T10:04:00.000Z');
    replacementQualification = qualify(
      fixture,
      'e'.repeat(64),
      '2026-08-31T10:05:00.000Z',
    );
  });

  it('activates one exact qualified mapping with an immutable predecessor chain', async () => {
    const memory = inMemory(activeAsset(fixture));

    const result = await persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, qualification),
      memory.ports,
    );

    expect(result).toMatchObject({
      disposition: 'APPLIED',
      state: {
        proxyMasterActiveMappingV1: {
          disposition: 'ACTIVE',
          assetId: fixture.relation.assetId,
          relationSha256: fixture.relation.relationSha256,
          qualification: {
            qualificationSha256: qualification.qualificationSha256,
          },
          sourceInvalidationPlanSha256:
            activeAsset(fixture).sourceInvalidationPlanV1.planSha256,
          predecessorStateSha256: null,
          activatedAt: '2026-08-31T10:06:00.000Z',
        },
      },
    });
    if (result.disposition !== 'APPLIED') {
      throw new Error('TEST_EXPECTED_ACTIVE_MAPPING_APPLIED');
    }
    expect(readMediaProxyMasterActiveMappingAssetStateV1(memory.current()))
      .toEqual(result.state);
    expect(assertMediaProxyMasterActiveMappingV1(
      result.state.proxyMasterActiveMappingV1,
    )).toEqual(result.state.proxyMasterActiveMappingV1);
    expect(Object.isFrozen(result.state)).toBe(true);

    const filter = mediaProxyMasterActiveMappingAssetCompareAndSetFilterV1({
      assetId: fixture.relation.assetId,
      userId: fixtureUserId(fixture),
      expectedState: null,
      nextState: result.state,
    });
    expect(filter).toMatchObject({
      assetId: fixture.relation.assetId,
      userId: fixtureUserId(fixture),
      type: 'video',
      isProxy: false,
      'sourceVersionV1.sourceVersionSha256':
        fixture.relation.master.sourceVersionSha256,
      'proxySourceVersionV1.sourceVersionSha256':
        fixture.relation.proxy.sourceVersionSha256,
      'proxyMasterRelationV1.relationSha256':
        fixture.relation.relationSha256,
    });
    expect(filter.$and).toHaveLength(2);
  });

  it('makes redelivery idempotent even when the caller still expects no state', async () => {
    const memory = inMemory(activeAsset(fixture));
    const input = request(fixture, qualification);
    const first = await persistMediaProxyMasterActiveMappingAssetStateV1(
      input,
      memory.ports,
    );
    const replay = await persistMediaProxyMasterActiveMappingAssetStateV1(
      { ...input, activatedAt: new Date('2026-08-31T10:07:00.000Z') },
      memory.ports,
    );

    expect(first).toMatchObject({ disposition: 'APPLIED' });
    expect(replay).toEqual({
      disposition: 'UNCHANGED',
      state: first.disposition === 'APPLIED' ? first.state : undefined,
    });
    expect(memory.replace).toHaveBeenCalledTimes(1);
  });

  it('rotates only from the exact active predecessor state', async () => {
    const memory = inMemory(activeAsset(fixture));
    const first = await persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, qualification),
      memory.ports,
    );
    if (first.disposition !== 'APPLIED') {
      throw new Error('TEST_EXPECTED_FIRST_ACTIVE_MAPPING');
    }
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, replacementQualification),
      memory.ports,
    )).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'EXPECTED_STATE_MISMATCH',
    });

    const olderQualification = qualify(
      fixture,
      'b'.repeat(64),
      '2026-08-31T10:03:30.000Z',
    );
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1({
      ...request(fixture, olderQualification),
      expectedStateSha256:
        first.state.proxyMasterActiveMappingStateSha256V1,
      activatedAt: new Date('2026-08-31T10:07:00.000Z'),
    }, memory.ports)).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'QUALIFICATION_NOT_NEWER',
    });
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1({
      ...request(fixture, replacementQualification),
      expectedStateSha256:
        first.state.proxyMasterActiveMappingStateSha256V1,
    }, memory.ports)).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'ACTIVATION_TIME_INCONSISTENT',
    });

    const rotated = await persistMediaProxyMasterActiveMappingAssetStateV1({
      ...request(fixture, replacementQualification),
      expectedStateSha256:
        first.state.proxyMasterActiveMappingStateSha256V1,
      activatedAt: new Date('2026-08-31T10:07:00.000Z'),
    }, memory.ports);
    expect(rotated).toMatchObject({
      disposition: 'APPLIED',
      state: {
        proxyMasterActiveMappingV1: {
          predecessorStateSha256:
            first.state.proxyMasterActiveMappingStateSha256V1,
          qualification: {
            qualificationSha256:
              replacementQualification.qualificationSha256,
          },
        },
      },
    });
    if (rotated.disposition !== 'APPLIED') {
      throw new Error('TEST_EXPECTED_ACTIVE_MAPPING_ROTATED');
    }
    const filter = mediaProxyMasterActiveMappingAssetCompareAndSetFilterV1({
      assetId: fixture.relation.assetId,
      userId: fixtureUserId(fixture),
      expectedState: first.state,
      nextState: rotated.state,
    });
    expect(filter).not.toHaveProperty('$and');
    expect(filter).toMatchObject({
      proxyMasterActiveMappingStateSha256V1:
        first.state.proxyMasterActiveMappingStateSha256V1,
      'proxyMasterActiveMappingV1.activationSha256':
        first.state.proxyMasterActiveMappingV1.activationSha256,
    });
  });

  it('rejects malformed qualification and activation chronology', async () => {
    const malformed = {
      ...structuredClone(qualification),
      qualificationSha256: '0'.repeat(64),
    };
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, malformed),
      inMemory(activeAsset(fixture)).ports,
    )).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'QUALIFICATION_INVALID',
    });
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1(
      {
        ...request(fixture, qualification),
        activatedAt: new Date('2026-08-31T10:03:59.999Z'),
      },
      inMemory(activeAsset(fixture)).ports,
    )).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'ACTIVATION_TIME_INCONSISTENT',
    });
  });

  it('rejects cross-relation evidence and changed source identity', async () => {
    const otherQualification = qualify(
      otherFixture,
      'c'.repeat(64),
      '2026-08-31T10:04:00.000Z',
    );
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, otherQualification),
      inMemory(activeAsset(fixture)).ports,
    )).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'ASSET_SCOPE_MISMATCH',
    });
    const changedMaster = {
      ...activeAsset(fixture),
      sourceVersionV1:
        fixture.trustedTranscodeReceipt.proxyEncode.sourceVersion,
    };
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, qualification),
      inMemory(changedMaster).ports,
    )).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'ASSET_SCOPE_MISMATCH',
    });
  });

  it('rejects missing or altered invalidation intent', async () => {
    const missing = { ...activeAsset(fixture), sourceInvalidationPlanV1: null };
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, qualification),
      inMemory(missing).ports,
    )).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'INVALIDATION_PLAN_MISMATCH',
    });
    const plan = activeAsset(fixture).sourceInvalidationPlanV1;
    const altered = {
      ...activeAsset(fixture),
      sourceInvalidationPlanV1: { ...plan, planSha256: '0'.repeat(64) },
    };
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, qualification),
      inMemory(altered).ports,
    )).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'INVALIDATION_PLAN_MISMATCH',
    });
  });

  it('rejects partial or tampered current state before rotation', async () => {
    const state = createMediaProxyMasterActiveMappingAssetStateV1({
      assetId: fixture.relation.assetId,
      userId: fixtureUserId(fixture),
      asset: activeAsset(fixture),
      qualification,
      predecessorStateSha256: null,
      activatedAt: new Date('2026-08-31T10:06:00.000Z'),
    });
    const partial = {
      ...activeAsset(fixture),
      proxyMasterActiveMappingV1: state.proxyMasterActiveMappingV1,
    };
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, replacementQualification),
      inMemory(partial).ports,
    )).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'CURRENT_STATE_INVALID',
    });
    const tampered = {
      ...activeAsset(fixture),
      ...state,
      proxyMasterActiveMappingStateSha256V1: '0'.repeat(64),
    };
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, replacementQualification),
      inMemory(tampered).ports,
    )).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'CURRENT_STATE_INVALID',
    });
  });

  it('reports missing assets and a lost final CAS without false activation', async () => {
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, qualification),
      {
        load: vi.fn(async () => null),
        replace: vi.fn(async () => true),
      },
    )).resolves.toEqual({ disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND' });

    const raced = inMemory(activeAsset(fixture), false);
    await expect(persistMediaProxyMasterActiveMappingAssetStateV1(
      request(fixture, qualification),
      raced.ports,
    )).resolves.toEqual({ disposition: 'RACE_LOST' });
    expect(readMediaProxyMasterActiveMappingAssetStateV1(raced.current()))
      .toBeNull();
  });
});

function qualify(
  fixture: QualificationFixtureV1,
  workerImageDigest: string,
  qualifiedAt: string,
): MediaProxyMasterMappingQualificationReceiptV1 {
  const result = qualifyMediaProxyMasterTimeMappingV1({
    relation: fixture.relation,
    trustedTranscodeReceipt: fixture.trustedTranscodeReceipt,
    correspondenceDerivationReceipt: fixture.derivationReceipt,
    segmentMaterializationReceipt: fixture.segmentMaterializationReceipt,
    audioLineageReceipt: fixture.audioLineageReceipt,
    workerImageDigest,
    qualifiedAt: new Date(qualifiedAt),
  });
  if (result.disposition !== 'MAPPING_QUALIFIED') {
    throw new Error('TEST_ACTIVE_MAPPING_QUALIFICATION_FAILED');
  }
  return result;
}

function activeAsset(fixture: QualificationFixtureV1) {
  const proxy = fixture.trustedTranscodeReceipt.proxyEncode.sourceVersion;
  const master = fixture.trustedTranscodeReceipt.command.masterSourceVersion;
  return {
    assetId: fixture.relation.assetId,
    userId: fixtureUserId(fixture),
    type: 'video' as const,
    isProxy: false as const,
    sourceVersionV1: master,
    proxySourceVersionV1: proxy,
    proxyMasterRelationV1: fixture.relation,
    sourceInvalidationPlanV1: createMediaSourceInvalidationPlanV1({
      previous: proxy,
      next: master,
      proxyMasterRelation: fixture.relation,
    }),
  };
}

function fixtureUserId(fixture: QualificationFixtureV1): string {
  if (fixture.relation.owner.kind !== 'USER') {
    throw new Error('TEST_EXPECTED_USER_RELATION');
  }
  return fixture.relation.owner.userId;
}

function request(
  fixture: QualificationFixtureV1,
  activeQualification: MediaProxyMasterMappingQualificationReceiptV1,
) {
  return {
    assetId: fixture.relation.assetId,
    userId: fixtureUserId(fixture),
    expectedStateSha256: null,
    qualification: activeQualification,
    activatedAt: new Date('2026-08-31T10:06:00.000Z'),
  };
}

function inMemory(
  initial: MediaProxyMasterActiveMappingAssetInputV1,
  replaceResult = true,
) {
  let stored = structuredClone(initial);
  const replace = vi.fn(async (input: Parameters<
  MediaProxyMasterActiveMappingAssetStorePortsV1['replace']
  >[0]) => {
    if (!replaceResult) return false;
    stored = { ...stored, ...structuredClone(input.nextState) };
    return true;
  });
  return {
    replace,
    current: () => structuredClone(stored),
    ports: {
      load: vi.fn(async () => structuredClone(stored)),
      replace,
    } satisfies MediaProxyMasterActiveMappingAssetStorePortsV1,
  };
}
