import { describe, expect, it } from 'vitest';

import {
  assertNativeMediaFinalRenderExecutionBudgetPolicyV1,
  calculateNativeMediaFinalRenderExecutionBudgetCostV1,
  createNativeMediaFinalRenderExecutionBudgetPolicyV1,
  NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
} from '@/lib/editron/services/native-media-final-render-execution-budget-policy-v1';

const HASH = 'a'.repeat(64);

describe('native final-render execution-budget Finance policy v1', () => {
  it('creates one immutable content-addressed no-default policy', () => {
    const policy = createNativeMediaFinalRenderExecutionBudgetPolicyV1(policyInput());
    expect(policy).toMatchObject({
      authority: 'FINANCE_OWNED_EXACT_RENDER_EXECUTION_BUDGET_POLICY',
      ownerId: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
      ownerVersion: 'finance-render-v1',
      formula: { kind: 'CEIL_EACH_EXACT_METER_THEN_SUM_V1' },
    });
    expect(policy.policySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.formula)).toBe(true);
  });

  it('is independent of caller key order and changes identity on policy drift', () => {
    const first = createNativeMediaFinalRenderExecutionBudgetPolicyV1(policyInput());
    const reordered = createNativeMediaFinalRenderExecutionBudgetPolicyV1({
      artifactByteVerified: { unitsDenominator: '10', nanoUsdNumerator: '2' },
      expiresAt: '2026-09-01T00:00:00.000Z',
      encodedFrameAttempt: { unitsDenominator: '2', nanoUsdNumerator: '3' },
      ownerVersion: 'finance-render-v1',
      artifactByteWritten: { unitsDenominator: '10', nanoUsdNumerator: '1' },
      effectiveAt: '2026-08-30T00:00:00.000Z',
    });
    const changed = createNativeMediaFinalRenderExecutionBudgetPolicyV1({
      ...policyInput(),
      artifactByteWritten: { nanoUsdNumerator: '2', unitsDenominator: '10' },
    });
    expect(reordered).toEqual(first);
    expect(changed.policySha256).not.toBe(first.policySha256);
  });

  it('ceil-rounds each exact meter then sums and binds retry-inclusive usage evidence', () => {
    const receipt = calculateNativeMediaFinalRenderExecutionBudgetCostV1(
      createNativeMediaFinalRenderExecutionBudgetPolicyV1(policyInput()),
      {
        encodedFrameAttempts: '12',
        artifactBytesWritten: '11',
        artifactBytesVerified: '11',
        usageEvidenceSha256: HASH,
      },
    );
    expect(receipt).toMatchObject({
      authority: 'FINANCE_POLICY_METERING_NO_WALLET_OR_PROJECT_MUTATION',
      usage: { encodedFrameAttempts: '12', usageEvidenceSha256: HASH },
      meterCostsNanoUsd: {
        encodedFrameAttempts: '18',
        artifactBytesWritten: '2',
        artifactBytesVerified: '3',
      },
      totalCostNanoUsd: '23',
    });
    expect(receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects forged, extra-field and wrong-formula policy representations', () => {
    const policy = createNativeMediaFinalRenderExecutionBudgetPolicyV1(policyInput());
    expect(() => assertNativeMediaFinalRenderExecutionBudgetPolicyV1({
      ...policy,
      policySha256: 'b'.repeat(64),
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_POLICY_INVALID');
    expect(() => assertNativeMediaFinalRenderExecutionBudgetPolicyV1({
      ...policy,
      unexpected: true,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_POLICY_INVALID');
    expect(() => assertNativeMediaFinalRenderExecutionBudgetPolicyV1({
      ...policy,
      formula: { ...policy.formula, kind: 'FLOAT_AND_ROUND_LATER' },
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_POLICY_INVALID');
  });

  it.each([
    ['unordered window', { expiresAt: '2026-08-30T00:00:00.000Z' }],
    ['noncanonical timestamp', { effectiveAt: '2026-08-30' }],
    ['zero denominator', {
      artifactByteVerified: { nanoUsdNumerator: '2', unitsDenominator: '0' },
    }],
    ['leading-zero amount', {
      encodedFrameAttempt: { nanoUsdNumerator: '03', unitsDenominator: '2' },
    }],
    ['all-zero rates', {
      encodedFrameAttempt: zeroRate(),
      artifactByteWritten: zeroRate(),
      artifactByteVerified: zeroRate(),
    }],
    ['unbounded decimal', {
      encodedFrameAttempt: { nanoUsdNumerator: '1'.repeat(41), unitsDenominator: '2' },
    }],
  ])('fails closed for %s', (_label, override) => {
    expect(() => createNativeMediaFinalRenderExecutionBudgetPolicyV1({
      ...policyInput(),
      ...override,
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_');
  });

  it('rejects malformed, extra and arithmetically unbounded usage', () => {
    const policy = createNativeMediaFinalRenderExecutionBudgetPolicyV1({
      ...policyInput(),
      encodedFrameAttempt: {
        nanoUsdNumerator: '9'.repeat(40),
        unitsDenominator: '1',
      },
    });
    const calculate = (usage: unknown) => (
      calculateNativeMediaFinalRenderExecutionBudgetCostV1(policy, usage as never)
    );
    expect(() => calculate({ ...usage(), extra: true })).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_USAGE_INVALID',
    );
    expect(() => calculate({ ...usage(), encodedFrameAttempts: '01' })).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_USAGE_ENCODED_FRAME_ATTEMPTS_INVALID',
    );
    expect(() => calculate({ ...usage(), usageEvidenceSha256: 'nope' })).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_USAGE_EVIDENCE_INVALID',
    );
    expect(() => calculate({ ...usage(), encodedFrameAttempts: '9'.repeat(40) })).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_TOTAL_COST_NANOUSD_INVALID',
    );
  });
});

function policyInput() {
  return {
    ownerVersion: 'finance-render-v1',
    effectiveAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    encodedFrameAttempt: { nanoUsdNumerator: '3', unitsDenominator: '2' },
    artifactByteWritten: { nanoUsdNumerator: '1', unitsDenominator: '10' },
    artifactByteVerified: { nanoUsdNumerator: '2', unitsDenominator: '10' },
  };
}

function zeroRate() {
  return { nanoUsdNumerator: '0', unitsDenominator: '1' };
}

function usage() {
  return {
    encodedFrameAttempts: '1',
    artifactBytesWritten: '1',
    artifactBytesVerified: '1',
    usageEvidenceSha256: HASH,
  };
}
