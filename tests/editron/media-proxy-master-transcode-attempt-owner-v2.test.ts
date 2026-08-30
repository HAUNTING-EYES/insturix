import { describe, expect, it, vi } from 'vitest';

import { MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';
import {
  createMediaProxyMasterTranscodeAttemptOwnerV2,
  MediaProxyMasterTranscodeAttemptOwnerErrorV2,
} from '@/lib/editron/services/media-proxy-master-transcode-attempt-owner-v2';
import {
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V2,
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V2,
  MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2,
  MEDIA_PROXY_MASTER_PUBLICATION_OWNER_ID_V2,
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_VERSION_V2,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-attempt-v2';
import { MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_ID_V2 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-worker-v2';
import { buildMediaProxyMasterTranscodeV2Fixture }
  from './helpers/media-proxy-master-transcode-v2-fixture';

describe('MediaProxyMasterTranscodeAttemptOwnerV2', () => {
  it('binds every concrete owner and delegates to the durable attempt', async () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const ports = boundPorts(fixture.contract.payload);
    const owner = createMediaProxyMasterTranscodeAttemptOwnerV2({
      jobInput: fixture.contract.payload,
      ...ports,
    });

    expect(owner).toMatchObject({
      ownerId: MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_ID_V2,
      ownerVersion: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_VERSION_V2,
      runtimePolicyBindingSha256:
        fixture.contract.payload.runtimePolicy.bindingSha256,
      publicationPolicySha256:
        fixture.contract.payload.publicationPolicy.policySha256,
      preparedArtifactPolicySha256:
        fixture.contract.payload.preparedArtifactPolicy.policySha256,
    });
    await expect(owner.run({
      job: fixture.job,
      budgetAuthorizationReceiptSha256: 'a'.repeat(64),
      abortSignal: new AbortController().signal,
      clock: () => new Date('2026-08-30T00:12:01.000Z'),
    })).resolves.toEqual({
      kind: 'unverifiable',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_RUNTIME_INVALID',
    });
    expect(ports.currentAssetOwner.resolve).toHaveBeenCalledTimes(1);
    expect(ports.preparationOwner.prepare).toHaveBeenCalledTimes(1);
    expect(ports.preparedArtifactStore.stage).not.toHaveBeenCalled();
    expect(ports.publicationOwner.publish).not.toHaveBeenCalled();
  });

  it('rejects substituted owners and incomplete stores at construction', () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const ports = boundPorts(fixture.contract.payload);
    expect(() => createMediaProxyMasterTranscodeAttemptOwnerV2({
      jobInput: fixture.contract.payload,
      ...ports,
      preparationOwner: {
        ...ports.preparationOwner,
        runtimePolicyBindingSha256: '0'.repeat(64),
      },
    })).toThrow(MediaProxyMasterTranscodeAttemptOwnerErrorV2);
    expect(() => createMediaProxyMasterTranscodeAttemptOwnerV2({
      jobInput: fixture.contract.payload,
      ...ports,
      preparedArtifactStore: {
        stage: ports.preparedArtifactStore.stage,
      } as never,
    })).toThrow('ATTEMPT_OWNER_V2_CONSTRUCTION_BINDING_INVALID');
  });
});

function boundPorts(
  jobInput: ReturnType<
    typeof buildMediaProxyMasterTranscodeV2Fixture
  >['contract']['payload'],
) {
  return {
    currentAssetOwner: {
      ownerId: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V2,
      ownerVersion: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V2,
      runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
      resolve: vi.fn(async () => ({} as never)),
    },
    preparationOwner: {
      ownerId: MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2,
      ownerVersion: jobInput.command.policy.policyVersion,
      runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
      prepare: vi.fn(async () => ({
        disposition: 'UNVERIFIABLE' as const,
        diagnostic:
          'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_RUNTIME_INVALID' as const,
      })),
    },
    preparedArtifactStore: {
      stage: vi.fn(),
      reopen: vi.fn(),
    },
    publicationOwner: {
      ownerId: MEDIA_PROXY_MASTER_PUBLICATION_OWNER_ID_V2,
      ownerVersion:
        MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2,
      publicationPolicySha256: jobInput.publicationPolicy.policySha256,
      preparedArtifactPolicySha256:
        jobInput.preparedArtifactPolicy.policySha256,
      publish: vi.fn(),
    },
  };
}
