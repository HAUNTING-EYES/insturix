import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertProviderNativeRuntimeGuardArtifactV2R,
  bindProviderNativeRuntimeGuardArtifactV2R,
  createProviderNativeBoundRuntimeGuardOwnerV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-bound-runtime-guard-owner-v2r';
import type { ProviderNativeRouteV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  bindSealedHoldoutInputTokenBoundV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
  SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R,
  type SealedHoldoutRuntimeAuthorizationV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';

const SCOPE = {
  tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
  episodeId: 'episode-1',
} as const;
const PUBLIC_CASE = {
  caseId: 'runtime-owner-1',
  resourceBudget: { maxNodes: 4, maxCandidates: 3, maxOutputTokens: 600 },
};
const ROUTE: ProviderNativeRouteV2R = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
};
const MANIFEST_SHA256 = 'c'.repeat(64);
const AUTHORIZATION: SealedHoldoutRuntimeAuthorizationV2R = {
  version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
  manifestSha256: MANIFEST_SHA256,
  caseId: PUBLIC_CASE.caseId,
  publicCaseSha256: hashCanonicalJsonV1(PUBLIC_CASE),
  routeId: ROUTE.routeId,
  claimedModelIdentity: ROUTE.claimedModelIdentity,
  routeSha256: hashCanonicalJsonV1(ROUTE),
  approvedBy: 'admin',
  approvedAt: '2026-08-23T00:00:00.000Z',
  maxInputTokensPerTurn: 85_000,
  absoluteMaxSpendMicroUsd: 10_000_000,
  pricing: {
    normalInputNanoUsdPerToken: 1_000,
    cachedInputNanoUsdPerToken: 100,
    cacheWriteNanoUsdPerToken: 1_250,
    outputNanoUsdPerToken: 6_000,
  },
};

describe('provider-native durable runtime guard owner', () => {
  it('binds exact scope and resolves fresh guards without counting tokens', async () => {
    const artifact = fixture();
    const countInputTokens = vi.fn(async (request) =>
      bindSealedHoldoutInputTokenBoundV2R({
        request, inputTokensUpperBound: 1_000, method: 'TEST_BOUND_V1',
      }));
    const owner = createProviderNativeBoundRuntimeGuardOwnerV2R(
      artifact,
      { countInputTokens },
    );

    const first = await owner.resolve({
      ...SCOPE,
      guardKind: artifact.guardKind,
      expectedGuardIdentitySha256: artifact.guardIdentitySha256,
    });
    const second = await owner.resolve({
      ...SCOPE,
      guardKind: artifact.guardKind,
      expectedGuardIdentitySha256: artifact.guardIdentitySha256,
    });

    expect(first).not.toBe(second);
    expect(await first.createResumeState({ completedTurns: [] })).toMatchObject({
      guardKind: SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R,
      guardIdentitySha256: artifact.guardIdentitySha256,
      nextTurn: 1,
    });
    expect(countInputTokens).not.toHaveBeenCalled();
  });

  it.each([
    ['scope', { ...SCOPE, userId: 'user-2' }, 'SCOPE_MISMATCH'],
    ['kind', SCOPE, 'KIND_MISMATCH'],
    ['identity', SCOPE, 'IDENTITY_MISMATCH'],
  ])('rejects a mismatched %s before token counting', async (kind, scope, code) => {
    const artifact = fixture();
    const countInputTokens = vi.fn();
    const owner = createProviderNativeBoundRuntimeGuardOwnerV2R(
      artifact,
      { countInputTokens },
    );
    await expect(owner.resolve({
      ...scope,
      guardKind: kind === 'kind' ? 'copied-guard' : artifact.guardKind,
      expectedGuardIdentitySha256: kind === 'identity'
        ? 'f'.repeat(64) : artifact.guardIdentitySha256,
    })).rejects.toThrow(`PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_${code}`);
    expect(countInputTokens).not.toHaveBeenCalled();
  });

  it('rejects forged authorization and copied outer hashes', () => {
    const artifact = fixture();
    const forgedAuthorization = {
      ...structuredClone(artifact),
      authorization: {
        ...structuredClone(artifact.authorization),
        routeSha256: 'f'.repeat(64),
      },
    };
    expect(() => assertProviderNativeRuntimeGuardArtifactV2R(forgedAuthorization))
      .toThrow('SEALED_RUNTIME_AUTHORIZATION_BINDING_INVALID');

    const forgedEnvelope = {
      ...structuredClone(artifact),
      authorization: {
        ...structuredClone(artifact.authorization),
        maxInputTokensPerTurn: artifact.authorization.maxInputTokensPerTurn + 1,
      },
    };
    expect(() => assertProviderNativeRuntimeGuardArtifactV2R(forgedEnvelope))
      .toThrow('PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_ARTIFACT_INVALID');
  });
});

function fixture() {
  return bindProviderNativeRuntimeGuardArtifactV2R({
    ...SCOPE,
    source: {
      ownerVersion: 'route-accounting-v1',
      ownerId: 'route-accounting-owner-1',
      ownerSha256: 'a'.repeat(64),
    },
    publicCase: PUBLIC_CASE,
    manifestSha256: MANIFEST_SHA256,
    route: ROUTE,
    authorization: AUTHORIZATION,
  });
}
