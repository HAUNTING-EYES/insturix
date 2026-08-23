import {
  assertProviderNativeDurableOutcomeProofReceiptV2R,
  type ProviderNativeDurableOutcomeProofReceiptV2R,
} from './provider-native-durable-outcome-proof-v2r';
import {
  isProviderNativeProofGateEligibleV2R,
  type ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';
import type { ProviderNativeProposalRecoveryStateV2R }
  from './provider-native-proposal-recovery-v2r';
import { hashCanonicalJsonV1 } from './contracts-v1';
import type {
  ProviderNativeDurableIsolatedCloneV2R,
  ProviderNativeDurableProposalReceiptV2R,
} from './provider-native-episode-durable-worker-v2r';
import type { DurableWorkflowJobTerminalReceiptV1 }
  from '../../services/durable-workflow-job-v1';

export interface ProviderNativeDurableOutcomeScopeV2R {
  tenantId: string;
  userId: string;
  projectId: string;
  episodeId: string;
}

export interface ProviderNativeDurableOutcomeV2R {
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  proofReferences: DurableWorkflowJobTerminalReceiptV1['proofReferences'];
  proposalReceipt: Readonly<ProviderNativeDurableProposalReceiptV2R> | null;
  outcomeProof: Readonly<ProviderNativeDurableOutcomeProofReceiptV2R> | null;
}

export async function finalizeProviderNativeDurableOutcomeV2R(input: Readonly<{
  scope: Readonly<ProviderNativeDurableOutcomeScopeV2R>;
  clone: Readonly<ProviderNativeDurableIsolatedCloneV2R>;
  episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
  resumedReceiptSha256: string;
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
}>): Promise<Readonly<ProviderNativeDurableOutcomeV2R>> {
  const proposalReceipt = input.clone.finalizeProposalReceipt
    ? await input.clone.finalizeProposalReceipt() : null;
  if (proposalReceipt) assertProposalReceipt(
    input.scope,
    input.clone,
    proposalReceipt,
    input.proposalRecoveryState,
  );
  const outcomeProof = await finalizeOutcomeProof({
    ...input, proposalReceipt,
  });
  const episodeDisposition = input.episodeReceipt.terminal.disposition === 'PASS'
    ? 'PASS' : input.episodeReceipt.terminal.disposition === 'FAIL'
      ? 'FAIL' : 'UNVERIFIABLE';
  const disposition = outcomeProof?.disposition ?? episodeDisposition;
  const proofReferences: DurableWorkflowJobTerminalReceiptV1['proofReferences'] = [{
    proofId: `provider_native_resumed_${input.scope.episodeId}`,
    proofSha256: input.resumedReceiptSha256,
    disposition: outcomeProof ? 'PASS' : disposition,
  }, ...(proposalReceipt ? [{
    proofId: `projectservice_isolated_proposal_${input.scope.episodeId}`,
    proofSha256: proposalReceipt.receiptSha256,
    disposition: 'PASS' as const,
  }] : []), ...(outcomeProof ? [{
    proofId: `isolated_outcome_proof_${input.scope.episodeId}`,
    proofSha256: outcomeProof.receiptSha256,
    disposition: outcomeProof.disposition,
  }] : [])];
  return { disposition, proofReferences, proposalReceipt, outcomeProof };
}

async function finalizeOutcomeProof(input: Readonly<{
  scope: Readonly<ProviderNativeDurableOutcomeScopeV2R>;
  clone: Readonly<ProviderNativeDurableIsolatedCloneV2R>;
  episodeReceipt: Readonly<ProviderNativeEpisodeReceiptV2R>;
  resumedReceiptSha256: string;
  proposalReceipt: Readonly<ProviderNativeDurableProposalReceiptV2R> | null;
}>): Promise<Readonly<ProviderNativeDurableOutcomeProofReceiptV2R> | null> {
  const proposal = input.proposalReceipt;
  if (!proposal || !proposal.changedPaths.length
    || !isProviderNativeProofGateEligibleV2R(input.episodeReceipt.terminal.disposition)) {
    return null;
  }
  if (!input.clone.finalizeOutcomeProof) {
    throw new Error('PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_OWNER_REQUIRED');
  }
  const proof = assertProviderNativeDurableOutcomeProofReceiptV2R(
    await input.clone.finalizeOutcomeProof({
      episodeReceipt: input.episodeReceipt,
      resumedReceiptSha256: input.resumedReceiptSha256,
      proposalReceipt: proposal,
    }),
  );
  if (proof.scope.tenantId !== input.scope.tenantId
    || proof.scope.userId !== input.scope.userId
    || proof.scope.projectId !== input.scope.projectId
    || proof.scope.episodeId !== input.scope.episodeId
    || proof.subject.episodeReceiptSha256 !== input.episodeReceipt.receiptSha256
    || proof.subject.resumedReceiptSha256 !== input.resumedReceiptSha256
    || proof.subject.proposalReceiptSha256 !== proposal.receiptSha256
    || proof.subject.finalStateSha256 !== proposal.finalStateSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_SUBJECT_MISMATCH');
  }
  return proof;
}

function assertProposalReceipt(
  scope: Readonly<ProviderNativeDurableOutcomeScopeV2R>,
  clone: Readonly<ProviderNativeDurableIsolatedCloneV2R>,
  receipt: Readonly<ProviderNativeDurableProposalReceiptV2R>,
  recovery?: Readonly<ProviderNativeProposalRecoveryStateV2R>,
): void {
  if (!recovery) throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECOVERY_REQUIRED');
  const { receiptSha256, ...material } = receipt;
  if (receipt.schemaVersion !== 1
    || receipt.authority !== 'PROJECTSERVICE_ISOLATED_PROPOSAL_NO_PROJECT_MUTATION'
    || receipt.episodeId !== scope.episodeId
    || receipt.projectId !== scope.projectId
    || receipt.baseProjectRevision !== clone.projectRevision
    || receipt.baseStateSha256 !== clone.stateSha256
    || receipt.baseProjectRevision !== recovery.canonicalBaseProjectRevision
    || receipt.baseStateSha256 !== recovery.canonicalBaseStateSha256
    || receipt.finalStateSha256 !== recovery.isolatedWorkingStateSha256
    || receipt.canonicalProjectRevisionAfter !== clone.projectRevision
    || receipt.canonicalStateSha256After !== clone.stateSha256
    || receipt.canonicalUnchanged !== true
    || !isSha256(receipt.finalStateSha256)
    || !receipt.changedPaths.every((path) => typeof path === 'string' && path.startsWith('$'))
    || new Set(receipt.changedPaths).size !== receipt.changedPaths.length
    || receipt.operationReceipts.length !== recovery.operations.length
    || !receipt.operationReceipts.every((item, index) => (
      validOperationReceipt(item)
      && operationMatchesRecovery(item, recovery.operations[index])
    ))
    || hashCanonicalJsonV1(material) !== receiptSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROPOSAL_RECEIPT_INVALID');
  }
}

function operationMatchesRecovery(
  receipt: Readonly<Record<string, unknown>>,
  recovery: Readonly<ProviderNativeProposalRecoveryStateV2R['operations'][number]>,
): boolean {
  return receipt.operatorId === recovery.operatorId
    && receipt.turn === recovery.turn
    && receipt.callSha256 === recovery.callSha256
    && receipt.beforeStateSha256 === recovery.beforeStateSha256
    && receipt.afterStateSha256 === recovery.afterStateSha256
    && receipt.executionSha256 === recovery.recordedExecutionSha256;
}

function validOperationReceipt(receipt: Readonly<Record<string, unknown>>): boolean {
  if (!isSha256(receipt.operationReceiptSha256)) return false;
  const { operationReceiptSha256, ...material } = receipt;
  return hashCanonicalJsonV1(material) === operationReceiptSha256;
}
function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
