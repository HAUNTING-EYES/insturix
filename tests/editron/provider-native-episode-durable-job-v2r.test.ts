import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildProviderNativeEpisodeDurableJobInputV2R,
  persistProviderNativeEpisodeCheckpointV2R,
  restoreProviderNativeEpisodeCheckpointV2R,
  type ProviderNativeDurableEpisodeIdentityV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-durable-job-v2r';
import {
  createProviderNativeEpisodeResumeCheckpointV2R,
  PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R,
  type ProviderNativeEpisodeResumeCheckpointV2R,
  type ProviderNativeRuntimeGuardResumeStateV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import type { ProviderNativeRouteV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import { DurableWorkflowJobLeaseLostErrorV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-23T12:00:00.000Z');
const CONTEXT_SHA = 'a'.repeat(64);
const TOOL_SET_SHA = 'b'.repeat(64);
const GUARD_SHA = 'c'.repeat(64);
const REFERENCE_SHA = 'd'.repeat(64);
const ROUTE: ProviderNativeRouteV2R = {
  routeId: 'OPENAI_TERRA',
  provider: 'openai',
  model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra',
  reasoningMode: 'medium',
};
const IDENTITY: ProviderNativeDurableEpisodeIdentityV2R = {
  route: ROUTE,
  episodeId: 'durable-episode-1',
  contextSha256: CONTEXT_SHA,
  toolSetSha256: TOOL_SET_SHA,
  referenceInputManifestSha256: REFERENCE_SHA,
  runtimeGuard: {
    guardKind: 'SEALED_HOLDOUT_RUNTIME_BUDGET_V2R',
    guardIdentitySha256: GUARD_SHA,
  },
};

function setup() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  return {
    collection,
    store: new DurableWorkflowJobStoreV1(async () => collection.asCollection()),
  };
}

function jobInput(identity = IDENTITY) {
  return buildProviderNativeEpisodeDurableJobInputV2R({
    tenantId: 'tenant-1',
    userId: 'user-1',
    orgId: 'org-1',
    projectId: 'project-1',
    parentCommandId: 'command-1',
    parentReceiptId: 'receipt-1',
    idempotencyKey: 'durable-episode-1',
    identity,
    budgetReservationId: 'budget-1',
    maxAttempts: 3,
  });
}

function checkpoint(
  identity = IDENTITY,
  completedTurns: readonly Record<string, unknown>[] = [{ turn: 1, marker: 'prefix' }],
): Readonly<ProviderNativeEpisodeResumeCheckpointV2R> {
  const completedTurnsSha256 = hashCanonicalJsonV1(completedTurns);
  const runtimeMaterial = {
    version: PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R,
    authority: 'RESEARCH_RUNTIME_GUARD_RESUME_NO_PROJECT_MUTATION' as const,
    guardKind: identity.runtimeGuard!.guardKind,
    guardIdentitySha256: identity.runtimeGuard!.guardIdentitySha256,
    completedTurnsSha256,
    nextTurn: completedTurns.length + 1,
    state: { usage: { providerTurns: completedTurns.length }, pendingRequest: null },
  };
  const runtimeGuardResumeState: ProviderNativeRuntimeGuardResumeStateV2R = {
    ...runtimeMaterial,
    resumeStateSha256: hashCanonicalJsonV1(runtimeMaterial),
  };
  return createProviderNativeEpisodeResumeCheckpointV2R({
    route: identity.route,
    episodeId: identity.episodeId,
    contextSha256: identity.contextSha256,
    toolSetSha256: identity.toolSetSha256,
    completedTurns,
    ...(identity.referenceInputManifestSha256 ? {
      referenceInputManifestSha256: identity.referenceInputManifestSha256,
    } : {}),
    runtimeGuardResumeState,
  });
}

describe('provider-native durable episode checkpoint adapter V2R', () => {
  it('persists one exact V4 checkpoint and restores it through a fresh store instance', async () => {
    const { collection, store } = setup();
    const created = await store.createOrGet(jobInput(), START);
    expect(created.job.dependencies.map(({ dependencyId }) => dependencyId)).toEqual([
      'episode_context', 'operator_tool_set', 'provider_route', 'reference_media_manifest',
      'runtime_guard_authorization',
    ]);
    const claim = await store.claim({
      jobId: created.job.jobId, workerId: 'worker-a', now: START,
    });
    if (claim.kind !== 'claimed') throw new Error('expected durable claim');
    const expected = checkpoint();
    await expect(persistProviderNativeEpisodeCheckpointV2R({
      store,
      jobId: created.job.jobId,
      tenantId: 'tenant-1',
      userId: 'user-1',
      leaseToken: claim.leaseToken,
      expectedSequence: 0,
      checkpoint: expected,
      now: new Date(START.getTime() + 1),
    })).resolves.toMatchObject({ sequence: 1 });

    const freshStore = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
    const persisted = await freshStore.getAuthorized({
      jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
    });
    expect(persisted).not.toBeNull();
    expect(restoreProviderNativeEpisodeCheckpointV2R(persisted!)).toEqual(expected);
  });

  it('rejects forged, mismatched and stale checkpoint writes before changing state', async () => {
    const { store } = setup();
    const created = await store.createOrGet(jobInput(), START);
    const claim = await store.claim({
      jobId: created.job.jobId, workerId: 'worker-a', now: START,
    });
    if (claim.kind !== 'claimed') throw new Error('expected durable claim');
    const exact = checkpoint();
    await persistProviderNativeEpisodeCheckpointV2R({
      store, jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
      leaseToken: claim.leaseToken, expectedSequence: 0, checkpoint: exact,
      now: new Date(START.getTime() + 1),
    });

    const forged = structuredClone(exact) as unknown as Record<string, unknown>;
    (forged.completedTurns as Record<string, unknown>[])[0].marker = 'forged';
    await expect(persistProviderNativeEpisodeCheckpointV2R({
      store, jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
      leaseToken: claim.leaseToken, expectedSequence: 1,
      checkpoint: forged as unknown as ProviderNativeEpisodeResumeCheckpointV2R,
      now: new Date(START.getTime() + 2),
    })).rejects.toThrow('PROVIDER_NATIVE_RESUME_CHECKPOINT_HASH_MISMATCH');

    const wrongIdentity = { ...IDENTITY, contextSha256: 'd'.repeat(64) };
    await expect(persistProviderNativeEpisodeCheckpointV2R({
      store, jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
      leaseToken: claim.leaseToken, expectedSequence: 1,
      checkpoint: checkpoint(wrongIdentity),
      now: new Date(START.getTime() + 3),
    })).rejects.toThrow('PROVIDER_NATIVE_DURABLE_CHECKPOINT_IDENTITY_MISMATCH');

    const next = checkpoint(IDENTITY, [{ turn: 1 }, { turn: 2 }]);
    await expect(persistProviderNativeEpisodeCheckpointV2R({
      store, jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
      leaseToken: claim.leaseToken, expectedSequence: 0, checkpoint: next,
      now: new Date(START.getTime() + 4),
    })).rejects.toThrow('DURABLE_JOB_RESUME_STATE_CONFLICT');
  });

  it('requires budget, tenant and active lease bindings', async () => {
    expect(() => buildProviderNativeEpisodeDurableJobInputV2R({
      tenantId: 'tenant-1', userId: 'user-1', orgId: null, projectId: null,
      parentCommandId: null, parentReceiptId: null, idempotencyKey: 'missing-budget',
      identity: IDENTITY, maxAttempts: 2,
    })).toThrow('PROVIDER_NATIVE_DURABLE_BUDGET_BINDING_MISMATCH');

    const { store } = setup();
    const created = await store.createOrGet(jobInput(), START);
    const claim = await store.claim({
      jobId: created.job.jobId, workerId: 'worker-a', now: START,
    });
    if (claim.kind !== 'claimed') throw new Error('expected durable claim');
    await expect(persistProviderNativeEpisodeCheckpointV2R({
      store, jobId: created.job.jobId, tenantId: 'tenant-2', userId: 'user-1',
      leaseToken: claim.leaseToken, expectedSequence: 0, checkpoint: checkpoint(),
    })).rejects.toThrow('PROVIDER_NATIVE_DURABLE_JOB_NOT_FOUND');
    await expect(persistProviderNativeEpisodeCheckpointV2R({
      store, jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
      leaseToken: claim.leaseToken, expectedSequence: 0, checkpoint: checkpoint(),
      now: new Date(START.getTime() + 5 * 60 * 1000 + 1),
    })).rejects.toBeInstanceOf(DurableWorkflowJobLeaseLostErrorV1);
  });

  it('detects tampered durable dependency and resume-state bindings on restore', async () => {
    const { store } = setup();
    const created = await store.createOrGet(jobInput(), START);
    const claim = await store.claim({
      jobId: created.job.jobId, workerId: 'worker-a', now: START,
    });
    if (claim.kind !== 'claimed') throw new Error('expected durable claim');
    await persistProviderNativeEpisodeCheckpointV2R({
      store, jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
      leaseToken: claim.leaseToken, expectedSequence: 0, checkpoint: checkpoint(),
      now: new Date(START.getTime() + 1),
    });
    const snapshot = await store.getAuthorized({
      jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
    });
    if (!snapshot) throw new Error('expected durable snapshot');

    const dependencyTamper = structuredClone(snapshot) as unknown as Record<string, unknown>;
    (dependencyTamper.dependencies as Record<string, unknown>[])[0].bindingSha256 = 'f'.repeat(64);
    expect(() => restoreProviderNativeEpisodeCheckpointV2R(
      dependencyTamper as unknown as typeof snapshot,
    )).toThrow('PROVIDER_NATIVE_DURABLE_JOB_INPUT_MISMATCH');

    const stateTamper = structuredClone(snapshot) as unknown as Record<string, unknown>;
    const resumeState = stateTamper.resumeState as Record<string, unknown>;
    (resumeState.payload as Record<string, unknown>).checkpointSha256 = 'f'.repeat(64);
    expect(() => restoreProviderNativeEpisodeCheckpointV2R(
      stateTamper as unknown as typeof snapshot,
    )).toThrow('PROVIDER_NATIVE_DURABLE_RESUME_STATE_INVALID');
  });
});
