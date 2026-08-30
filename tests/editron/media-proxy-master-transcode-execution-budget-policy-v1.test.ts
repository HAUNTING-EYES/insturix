import { describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  calculateMediaProxyMasterTranscodeExecutionBudgetCostV1,
  createMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-policy-v1';

const EFFECTIVE = '2026-08-30T00:00:00.000Z';
const EXPIRES = '2026-09-30T00:00:00.000Z';

describe('MediaProxyMasterTranscodeExecutionBudgetPolicyV1', () => {
  it('seals a no-default Finance policy and revalidates its exact identity', () => {
    const policy = policyFixture();
    expect(assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(policy))
      .toStrictEqual(policy);
    expect(policy).toMatchObject({
      authority: 'FINANCE_OWNED_PROXY_TRANSCODE_EXECUTION_BUDGET_POLICY',
      currency: 'USD',
      billingQuantum: 'NANOUSD',
      formula: { kind: 'CEIL_EACH_EXACT_METER_THEN_SUM_V1' },
    });
    expect(policy.policySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it('ceil-meters every exact usage class independently before summing', () => {
    const receipt = calculateMediaProxyMasterTranscodeExecutionBudgetCostV1(
      policyFixture(),
      {
        sourceBytesRead: '3',
        encodedFrameAttempts: '4',
        processMilliseconds: '2',
        artifactBytesWritten: '5',
        artifactBytesVerified: '1',
        usageEvidenceSha256: hash('usage-evidence'),
      },
    );
    expect(receipt.meterCostsNanoUsd).toEqual({
      sourceBytesRead: '2',
      encodedFrameAttempts: '3',
      processMilliseconds: '3',
      artifactBytesWritten: '5',
      artifactBytesVerified: '2',
    });
    expect(receipt.totalCostNanoUsd).toBe('15');
    expect(receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('binds usage evidence into an otherwise identical cost receipt', () => {
    const usage = {
      sourceBytesRead: '3',
      encodedFrameAttempts: '4',
      processMilliseconds: '2',
      artifactBytesWritten: '5',
      artifactBytesVerified: '1',
    };
    const first = calculateMediaProxyMasterTranscodeExecutionBudgetCostV1(
      policyFixture(),
      { ...usage, usageEvidenceSha256: hash('usage-a') },
    );
    const second = calculateMediaProxyMasterTranscodeExecutionBudgetCostV1(
      policyFixture(),
      { ...usage, usageEvidenceSha256: hash('usage-b') },
    );
    expect(second.totalCostNanoUsd).toBe(first.totalCostNanoUsd);
    expect(second.receiptSha256).not.toBe(first.receiptSha256);
  });

  it('rejects empty price authority and invalid policy windows', () => {
    const zero = rate('0', '1');
    expect(() => createMediaProxyMasterTranscodeExecutionBudgetPolicyV1({
      ownerVersion: 'finance-proxy-v1',
      effectiveAt: EFFECTIVE,
      expiresAt: EXPIRES,
      sourceByteRead: zero,
      encodedFrameAttempt: zero,
      processMillisecond: zero,
      artifactByteWritten: zero,
      artifactByteVerified: zero,
    })).toThrow('POLICY_ALL_RATES_ZERO');
    expect(() => createMediaProxyMasterTranscodeExecutionBudgetPolicyV1({
      ...policyDeclaration(),
      expiresAt: EFFECTIVE,
    })).toThrow('POLICY_TIME_ORDER_INVALID');
  });

  it('rejects forged policy fields and noncanonical usage decimals', () => {
    const policy = policyFixture();
    expect(() => assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1({
      ...policy,
      ownerVersion: 'forged-owner',
    })).toThrow('POLICY_INVALID');
    expect(() => assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1({
      ...policy,
      hiddenRate: rate('1', '1'),
    })).toThrow('POLICY_INVALID');
    expect(() => calculateMediaProxyMasterTranscodeExecutionBudgetCostV1(
      policy,
      {
        sourceBytesRead: '03',
        encodedFrameAttempts: '4',
        processMilliseconds: '2',
        artifactBytesWritten: '5',
        artifactBytesVerified: '1',
        usageEvidenceSha256: hash('usage-invalid'),
      },
    )).toThrow('USAGE_SOURCE_BYTES_READ_INVALID');
  });
});

function policyFixture() {
  return createMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    policyDeclaration(),
  );
}

function policyDeclaration() {
  return {
    ownerVersion: 'finance-proxy-v1',
    effectiveAt: EFFECTIVE,
    expiresAt: EXPIRES,
    sourceByteRead: rate('1', '2'),
    encodedFrameAttempt: rate('2', '3'),
    processMillisecond: rate('5', '4'),
    artifactByteWritten: rate('1', '1'),
    artifactByteVerified: rate('3', '2'),
  };
}

function rate(nanoUsdNumerator: string, unitsDenominator: string) {
  return { nanoUsdNumerator, unitsDenominator };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
