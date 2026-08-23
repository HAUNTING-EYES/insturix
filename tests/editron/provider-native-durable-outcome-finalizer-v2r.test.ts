import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  finalizeProviderNativeExecutionBoundDurableOutcomeV2R,
  type ProviderNativeDurableExecutionTraceV2R,
  type ProviderNativeExecutionBoundDurableIsolatedCloneV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-durable-outcome-finalizer-v2r';
import { bindProviderNativeExecutionBoundOutcomeProofReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-outcome-proof-v2r';
import type { ProviderNativeDurableProposalReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-durable-worker-v2r';
import type { ProviderNativeProposalRecoveryStateV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-proposal-recovery-v2r';
import type { ProviderNativeEpisodeReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';

const SCOPE = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  projectId: 'project-1',
  episodeId: 'episode-1',
} as const;
const EPISODE_SHA256 = 'a'.repeat(64);
const RESUMED_SHA256 = 'b'.repeat(64);
const BASE_STATE_SHA256 = '1'.repeat(64);
const FINAL_STATE_SHA256 = '2'.repeat(64);
const CALL_SHA256 = '3'.repeat(64);
const EXECUTION_SHA256 = '4'.repeat(64);

describe('provider-native execution-bound durable outcome finalizer V2R', () => {
  it.each([
    ['FRESH_EPISODE_RECEIPT', EPISODE_SHA256, 'provider_native_fresh_episode-1'],
    ['RESUMED_EPISODE_RECEIPT', RESUMED_SHA256, 'provider_native_resumed_episode-1'],
  ] as const)('finalizes exact %s evidence without a V1 fallback', async (
    kind,
    receiptSha256,
    expectedProofId,
  ) => {
    const executionTrace = { kind, receiptSha256 } as const;
    const owner = vi.fn(async (input) => proof(input.executionTrace));
    const result = await finalizeProviderNativeExecutionBoundDurableOutcomeV2R({
      scope: SCOPE,
      clone: clone(owner),
      episodeReceipt: episodeReceipt(),
      executionTrace,
      proposalRecoveryState: recoveryState(),
    });

    expect(owner).toHaveBeenCalledOnce();
    expect(result.disposition).toBe('PASS');
    expect(result.outcomeProof?.subject.executionTrace).toEqual(executionTrace);
    expect(result.proofReferences[0]).toEqual({
      proofId: expectedProofId,
      proofSha256: receiptSha256,
      disposition: 'PASS',
    });
  });

  it('rejects a copied resumed trace before invoking a proof owner', async () => {
    const owner = vi.fn(async (input) => proof(input.executionTrace));

    await expect(finalizeProviderNativeExecutionBoundDurableOutcomeV2R({
      scope: SCOPE,
      clone: clone(owner),
      episodeReceipt: episodeReceipt(),
      executionTrace: {
        kind: 'RESUMED_EPISODE_RECEIPT',
        receiptSha256: EPISODE_SHA256,
      },
      proposalRecoveryState: recoveryState(),
    })).rejects.toThrow('PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_TRACE_INVALID');
    expect(owner).not.toHaveBeenCalled();
  });

  it('requires the V2 proof owner for a changed proof-eligible proposal', async () => {
    await expect(finalizeProviderNativeExecutionBoundDurableOutcomeV2R({
      scope: SCOPE,
      clone: clone(),
      episodeReceipt: episodeReceipt(),
      executionTrace: freshTrace(),
      proposalRecoveryState: recoveryState(),
    })).rejects.toThrow('PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_OWNER_REQUIRED');
  });

  it('rejects a valid V2 proof bound to a different execution trace', async () => {
    const otherTrace = {
      kind: 'RESUMED_EPISODE_RECEIPT',
      receiptSha256: '9'.repeat(64),
    } as const;
    await expect(finalizeProviderNativeExecutionBoundDurableOutcomeV2R({
      scope: SCOPE,
      clone: clone(async () => proof(otherTrace)),
      episodeReceipt: episodeReceipt(),
      executionTrace: {
        kind: 'RESUMED_EPISODE_RECEIPT',
        receiptSha256: RESUMED_SHA256,
      },
      proposalRecoveryState: recoveryState(),
    })).rejects.toThrow(
      'PROVIDER_NATIVE_EXECUTION_BOUND_OUTCOME_PROOF_SUBJECT_MISMATCH',
    );
  });
});

function clone(
  finalizeExecutionBoundOutcomeProof?: (
    input: Readonly<{ executionTrace: ProviderNativeDurableExecutionTraceV2R }>,
  ) => Promise<ReturnType<typeof proof>>,
): Readonly<ProviderNativeExecutionBoundDurableIsolatedCloneV2R> {
  return {
    origin: 'PROJECTSERVICE_REVISION_CLONE',
    projectRevision: 'project-revision-v1:r7',
    stateSha256: BASE_STATE_SHA256,
    executeIsolated: vi.fn(),
    finalizeProposalReceipt: async () => proposalReceipt(),
    ...(finalizeExecutionBoundOutcomeProof ? { finalizeExecutionBoundOutcomeProof } : {}),
  } as unknown as Readonly<ProviderNativeExecutionBoundDurableIsolatedCloneV2R>;
}

function episodeReceipt(): Readonly<ProviderNativeEpisodeReceiptV2R> {
  return {
    episodeId: SCOPE.episodeId,
    receiptSha256: EPISODE_SHA256,
    terminal: { disposition: 'PASS' },
  } as unknown as Readonly<ProviderNativeEpisodeReceiptV2R>;
}

function freshTrace(): ProviderNativeDurableExecutionTraceV2R {
  return { kind: 'FRESH_EPISODE_RECEIPT', receiptSha256: EPISODE_SHA256 };
}

function proof(executionTrace: ProviderNativeDurableExecutionTraceV2R) {
  const proposal = proposalReceipt();
  return bindProviderNativeExecutionBoundOutcomeProofReceiptV2R({
    ...SCOPE,
    subject: {
      episodeReceiptSha256: EPISODE_SHA256,
      executionTrace,
      proposalReceiptSha256: proposal.receiptSha256,
      finalStateSha256: proposal.finalStateSha256,
    },
    proofPolicy: {
      policyId: 'policy-1',
      policyVersion: '1',
      policySha256: '5'.repeat(64),
    },
    obligations: [{
      obligationId: 'state-1',
      kind: 'state',
      disposition: 'PASS',
      proofReferenceIds: ['proof-1'],
    }],
    proofReferences: [{
      proofId: 'proof-1',
      proofSha256: '6'.repeat(64),
      disposition: 'PASS',
    }],
    observedAt: '2026-08-23T12:00:00.000Z',
    summary: 'verified',
  });
}

function proposalReceipt(): Readonly<ProviderNativeDurableProposalReceiptV2R> {
  const operationMaterial = {
    operatorId: 'cut_section',
    turn: 1,
    callSha256: CALL_SHA256,
    beforeStateSha256: BASE_STATE_SHA256,
    afterStateSha256: FINAL_STATE_SHA256,
    changedPaths: ['$.overlays'],
    executionSha256: EXECUTION_SHA256,
    writerProjectRevision: 'project-revision-v1:writer-r8',
  };
  const operationReceipt = {
    ...operationMaterial,
    operationReceiptSha256: hashCanonicalJsonV1(operationMaterial),
  };
  const material = {
    schemaVersion: 1 as const,
    authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_NO_PROJECT_MUTATION' as const,
    episodeId: SCOPE.episodeId,
    projectId: SCOPE.projectId,
    baseProjectRevision: 'project-revision-v1:r7',
    baseStateSha256: BASE_STATE_SHA256,
    finalStateSha256: FINAL_STATE_SHA256,
    changedPaths: ['$.overlays'],
    operationReceipts: [operationReceipt],
    canonicalProjectRevisionAfter: 'project-revision-v1:r7',
    canonicalStateSha256After: BASE_STATE_SHA256,
    canonicalUnchanged: true as const,
  };
  return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
}

function recoveryState(): Readonly<ProviderNativeProposalRecoveryStateV2R> {
  return {
    version: 'EDITRON_PROVIDER_NATIVE_PROPOSAL_RECOVERY_V2R_1',
    authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_RECOVERY_NO_PROJECT_MUTATION',
    episodeId: SCOPE.episodeId,
    projectId: SCOPE.projectId,
    canonicalBaseProjectRevision: 'project-revision-v1:r7',
    canonicalBaseStateSha256: BASE_STATE_SHA256,
    isolatedWorkingProjectRevision: 'project-revision-v1:writer-r8',
    isolatedWorkingStateSha256: FINAL_STATE_SHA256,
    completedTurnsSha256: '7'.repeat(64),
    nextTurn: 2,
    operations: [{
      turn: 1,
      operatorId: 'cut_section',
      callSha256: CALL_SHA256,
      recordedExecutionSha256: EXECUTION_SHA256,
      beforeStateSha256: BASE_STATE_SHA256,
      afterStateSha256: FINAL_STATE_SHA256,
      writerProjectRevision: 'project-revision-v1:writer-r8',
    }],
    recoveryStateSha256: '8'.repeat(64),
  };
}
