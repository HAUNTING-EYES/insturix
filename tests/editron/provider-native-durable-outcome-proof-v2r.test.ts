import { describe, expect, it } from 'vitest';

import {
  assertProviderNativeDurableOutcomeProofReceiptV2R,
  assertProviderNativeExecutionBoundOutcomeProofReceiptV2R,
  bindProviderNativeDurableOutcomeProofReceiptV2R,
  bindProviderNativeExecutionBoundOutcomeProofReceiptV2R,
  type ProviderNativeExecutionTraceKindV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-durable-outcome-proof-v2r';

const EPISODE_RECEIPT_SHA256 = 'a'.repeat(64);
const RESUMED_RECEIPT_SHA256 = 'b'.repeat(64);

const COMMON = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  projectId: 'project-1',
  episodeId: 'episode-1',
  proofPolicy: {
    policyId: 'policy-1',
    policyVersion: '1',
    policySha256: 'e'.repeat(64),
  },
  obligations: [{
    obligationId: 'state-1',
    kind: 'state',
    disposition: 'PASS',
    proofReferenceIds: ['proof-1'],
  }],
  proofReferences: [{
    proofId: 'proof-1',
    proofSha256: 'f'.repeat(64),
    disposition: 'PASS',
  }],
  observedAt: '2026-08-23T00:00:00.000Z',
  summary: 'verified',
} as const;

describe('provider-native durable outcome-proof contract V2R', () => {
  it('preserves the frozen V1 receipt material and hash', () => {
    const receipt = bindProviderNativeDurableOutcomeProofReceiptV2R({
      ...COMMON,
      subject: {
        episodeReceiptSha256: EPISODE_RECEIPT_SHA256,
        resumedReceiptSha256: RESUMED_RECEIPT_SHA256,
        proposalReceiptSha256: 'c'.repeat(64),
        finalStateSha256: 'd'.repeat(64),
      },
    });

    expect(receipt.receiptSha256).toBe(
      '4b890232896fa9fe4ca5ab125d0d9045dd3bd999f2ec5969cd92144d43b9e604',
    );
    expect(assertProviderNativeDurableOutcomeProofReceiptV2R(receipt)).toEqual(receipt);
  });

  it.each([
    ['FRESH_EPISODE_RECEIPT', EPISODE_RECEIPT_SHA256],
    ['RESUMED_EPISODE_RECEIPT', RESUMED_RECEIPT_SHA256],
  ] as const)('binds and validates an exact %s trace', (kind, receiptSha256) => {
    const receipt = executionBoundReceipt(kind, receiptSha256);

    expect(receipt.subject.executionTrace).toEqual({ kind, receiptSha256 });
    expect(assertProviderNativeExecutionBoundOutcomeProofReceiptV2R(receipt)).toEqual(receipt);
  });

  it('rejects an unknown execution-trace kind', () => {
    expect(() => executionBoundReceipt(
      'COPIED_EPISODE_RECEIPT' as ProviderNativeExecutionTraceKindV2R,
      RESUMED_RECEIPT_SHA256,
    )).toThrow('PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_EXECUTION_TRACE_KIND_INVALID');
  });

  it('rejects mismatched fresh and copied resumed trace identities', () => {
    expect(() => executionBoundReceipt(
      'FRESH_EPISODE_RECEIPT',
      RESUMED_RECEIPT_SHA256,
    )).toThrow('PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_FRESH_EXECUTION_TRACE_MISMATCH');

    expect(() => executionBoundReceipt(
      'RESUMED_EPISODE_RECEIPT',
      EPISODE_RECEIPT_SHA256,
    )).toThrow(
      'PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_RESUMED_EXECUTION_TRACE_REUSES_EPISODE_RECEIPT',
    );
  });

  it('rejects a forged trace hash or tampered outer receipt', () => {
    const receipt = executionBoundReceipt(
      'RESUMED_EPISODE_RECEIPT',
      RESUMED_RECEIPT_SHA256,
    );
    const forgedTrace = {
      ...receipt,
      subject: {
        ...receipt.subject,
        executionTrace: {
          ...receipt.subject.executionTrace,
          receiptSha256: '9'.repeat(64),
        },
      },
    };
    const tamperedSummary = { ...receipt, summary: 'forged summary' };

    expect(() => assertProviderNativeExecutionBoundOutcomeProofReceiptV2R(forgedTrace))
      .toThrow('PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_RECEIPT_INVALID');
    expect(() => assertProviderNativeExecutionBoundOutcomeProofReceiptV2R(tamperedSummary))
      .toThrow('PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_RECEIPT_INVALID');
  });

  it('rejects a claimed obligation disposition that its evidence does not support', () => {
    expect(() => bindProviderNativeExecutionBoundOutcomeProofReceiptV2R({
      ...COMMON,
      subject: executionSubject('FRESH_EPISODE_RECEIPT', EPISODE_RECEIPT_SHA256),
      proofReferences: [{
        proofId: 'proof-1',
        proofSha256: 'f'.repeat(64),
        disposition: 'FAIL',
      }],
    })).toThrow('PROVIDER_NATIVE_DURABLE_OUTCOME_PROOF_OBLIGATION_DISPOSITION_MISMATCH');
  });
});

function executionBoundReceipt(
  kind: ProviderNativeExecutionTraceKindV2R,
  receiptSha256: string,
) {
  return bindProviderNativeExecutionBoundOutcomeProofReceiptV2R({
    ...COMMON,
    subject: executionSubject(kind, receiptSha256),
  });
}

function executionSubject(
  kind: ProviderNativeExecutionTraceKindV2R,
  receiptSha256: string,
) {
  return {
    episodeReceiptSha256: EPISODE_RECEIPT_SHA256,
    executionTrace: { kind, receiptSha256 },
    proposalReceiptSha256: 'c'.repeat(64),
    finalStateSha256: 'd'.repeat(64),
  };
}
