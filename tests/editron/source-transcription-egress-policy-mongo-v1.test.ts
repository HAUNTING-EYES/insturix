import { describe, expect, it, vi } from 'vitest';

import {
  createSourceTranscriptionEgressPolicyMongoReaderV1,
} from '@/lib/editron/services/source-transcription-egress-policy-mongo-v1';
import {
  createSourceTranscriptionEgressPolicyGrantV1,
} from '@/lib/editron/services/source-transcription-egress-policy-v1';

describe('source transcription egress policy Mongo reader V1', () => {
  it('loads an exact canonical grant and creates the unique scope index once', async () => {
    const grant = policyGrant();
    const createIndex = vi.fn(async () => 'index');
    const findOne = vi.fn(async () => ({ _id: 'mongo', ...grant }));
    const reader = createSourceTranscriptionEgressPolicyMongoReaderV1({
      loadCollection: async () => ({ createIndex, findOne }),
    });
    const request = {
      scope: grant.scope,
      privacyEgressPolicyRef: grant.privacyEgressPolicyRef,
    };

    expect(await reader.read(request)).toEqual(grant);
    expect(await reader.read(request)).toEqual(grant);
    expect(createIndex).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith({
      'scope.tenantId': 'org-1',
      'scope.userId': 'member-1',
      'scope.orgId': 'org-1',
      'scope.projectId': 'project-1',
      'privacyEgressPolicyRef.ownerId': 'POLICY_SERVICE',
      'privacyEgressPolicyRef.artifactId': 'policy',
      'privacyEgressPolicyRef.artifactVersion': '1',
      'privacyEgressPolicyRef.artifactSha256': 'c'.repeat(64),
    });
  });

  it('returns null only for absence and rejects malformed or mismatched rows', async () => {
    const grant = policyGrant();
    const createIndex = vi.fn(async () => 'index');
    const absent = createSourceTranscriptionEgressPolicyMongoReaderV1({
      loadCollection: async () => ({
        createIndex,
        findOne: vi.fn(async () => null),
      }),
    });
    expect(await absent.read({
      scope: grant.scope,
      privacyEgressPolicyRef: grant.privacyEgressPolicyRef,
    })).toBeNull();

    for (const row of [
      {},
      policyGrant({ scope: { ...grant.scope, projectId: 'project-other' } }),
    ]) {
      const reader = createSourceTranscriptionEgressPolicyMongoReaderV1({
        loadCollection: async () => ({
          createIndex: vi.fn(async () => 'index'),
          findOne: vi.fn(async () => row),
        }),
      });
      await expect(reader.read({
        scope: grant.scope,
        privacyEgressPolicyRef: grant.privacyEgressPolicyRef,
      })).rejects.toThrow(/^SOURCE_TRANSCRIPTION_EGRESS_POLICY_/u);
    }
  });

  it('fails closed and retries index initialization after an index outage', async () => {
    const grant = policyGrant();
    const createIndex = vi.fn()
      .mockRejectedValueOnce(new Error('index unavailable'))
      .mockResolvedValueOnce('index');
    const reader = createSourceTranscriptionEgressPolicyMongoReaderV1({
      loadCollection: async () => ({
        createIndex,
        findOne: vi.fn(async () => grant),
      }),
    });
    const request = {
      scope: grant.scope,
      privacyEgressPolicyRef: grant.privacyEgressPolicyRef,
    };

    await expect(reader.read(request)).rejects.toThrow(
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_MONGO_UNAVAILABLE',
    );
    expect(await reader.read(request)).toEqual(grant);
    expect(createIndex).toHaveBeenCalledTimes(2);
  });
});

function policyGrant(overrides: Partial<Parameters<
  typeof createSourceTranscriptionEgressPolicyGrantV1
>[0]> = {}) {
  return createSourceTranscriptionEgressPolicyGrantV1({
    scope: {
      tenantId: 'org-1',
      userId: 'member-1',
      orgId: 'org-1',
      projectId: 'project-1',
    },
    privacyEgressPolicyRef: artifact('policy', 'c'),
    allowedProviderIds: ['deepgram'],
    allowedMediaKinds: ['video'],
    allowedSourceRoles: ['MASTER'],
    allowedPrecisions: ['MEASURED_WORD_REQUIRED'],
    authorizationTtlSeconds: 300,
    authorizationDecisionRef: artifact('decision', 'd'),
    issuedAt: '2026-08-31T14:00:00.000Z',
    expiresAt: '2026-08-31T16:00:00.000Z',
    ...overrides,
  });
}

function artifact(id: string, hashCharacter: string) {
  return {
    ownerId: 'POLICY_SERVICE',
    artifactId: id,
    artifactVersion: '1',
    artifactSha256: hashCharacter.repeat(64),
  };
}
