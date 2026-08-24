import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  assertHistoricalBenchmarkStatusReceiptV1,
  buildHistoricalBenchmarkStatusReceiptV1,
  type HistoricalBenchmarkRowStatusInputV1,
} from '@/lib/editron/research/open-ended-planner/historical-benchmark-status-v1';

describe('historical benchmark status V1', () => {
  it('keeps proof, safety, validity and model outcome independent', () => {
    const expected = fixture();
    const receipt = buildHistoricalBenchmarkStatusReceiptV1(expected);

    expect(receipt).toMatchObject({
      proofCeiling: 'STRUCTURAL',
      counts: {
        interpretationStatus: {
          FAIL_UNSAFE_ATTEMPT: 1,
          PASS_STRUCTURAL_ONLY: 1,
        },
        safetyDisposition: {
          COMPLIANT: 1,
          OWNER_BLOCKED_UNSAFE_ATTEMPT: 1,
        },
      },
      providerInferenceCalls: 0,
      networkCalls: 0,
      projectReads: 0,
      projectMutations: 0,
      mediaWrites: 0,
      stateEffects: [],
      providerRankingAuthorized: false,
      reliabilityEstimateAuthorized: false,
      productionPromotionAuthorized: false,
    });
    expect(receipt.rows.map(({ rowId }) => rowId)).toEqual(['row-a', 'row-b']);
    expect(assertHistoricalBenchmarkStatusReceiptV1({ value: receipt, expected }))
      .toEqual(receipt);
  });

  it('rejects duplicate rows, inconsistent axes and invented product proof', () => {
    const base = fixture();
    expect(() => buildHistoricalBenchmarkStatusReceiptV1({
      ...base, rows: [base.rows[0], base.rows[0]],
    })).toThrow('ROW_ID_DUPLICATED');
    expect(() => buildHistoricalBenchmarkStatusReceiptV1({
      ...base,
      rows: [{ ...base.rows[0], modelDecision: 'FAIL' }],
    })).toThrow('PASS_AXES_INCONSISTENT');
    expect(() => buildHistoricalBenchmarkStatusReceiptV1({
      ...base,
      rows: [{
        ...base.rows[0],
        interpretationStatus: 'PASS_PRODUCT_PROOF',
        proofLevel: 'PRODUCT',
      }],
    })).toThrow('PROOF_CEILING_EXCEEDED');
    expect(() => buildHistoricalBenchmarkStatusReceiptV1({
      ...base,
      rows: [{ ...base.rows[0], proofLevel: 'MAGIC' as never }],
    })).toThrow('PROOF_LEVEL_INVALID');
  });

  it('rejects a self-rehashed receipt against trusted expected inputs', () => {
    const expected = fixture();
    const forged = structuredClone(
      buildHistoricalBenchmarkStatusReceiptV1(expected),
    ) as unknown as Record<string, unknown>;
    forged.historicalCohortReceiptSha256 = hash('another cohort');
    const material = { ...forged };
    delete material.receiptSha256;
    forged.receiptSha256 = hashEditronCanonicalJsonV1(material);

    expect(() => assertHistoricalBenchmarkStatusReceiptV1({ value: forged, expected }))
      .toThrow('RECEIPT_FORGED_OR_EXPECTATION_DRIFT');
  });
});

function fixture() {
  const rows: HistoricalBenchmarkRowStatusInputV1[] = [{
    rowId: 'row-b', routeId: 'route-1', caseId: 'case-1',
    sourceRowSha256: hash('row-b'), rawStatus: 'RAW_PASS',
    interpretationStatus: 'PASS_STRUCTURAL_ONLY', proofLevel: 'STRUCTURAL',
    safetyDisposition: 'COMPLIANT', benchmarkValidity: 'VALID',
    modelDecision: 'PASS', taskOutcome: 'PASS', reasonCodes: ['STRUCTURE_VALID'],
    evidenceReceiptSha256: hash('evidence-b'),
  }, {
    rowId: 'row-a', routeId: 'route-2', caseId: 'case-2',
    sourceRowSha256: hash('row-a'), rawStatus: 'RAW_PASS',
    interpretationStatus: 'FAIL_UNSAFE_ATTEMPT', proofLevel: 'NONE',
    safetyDisposition: 'OWNER_BLOCKED_UNSAFE_ATTEMPT', benchmarkValidity: 'VALID',
    modelDecision: 'FAIL', taskOutcome: 'FAIL', reasonCodes: ['STALE_WRITE_ATTEMPT'],
    evidenceReceiptSha256: hash('evidence-a'),
  }];
  return {
    lane: 'TEST_LANE', successorManifestSha256: hash('manifest'),
    readinessReceiptSha256: hash('readiness'),
    historicalManifestSha256: hash('historical-manifest'),
    historicalCohortReceiptSha256: hash('historical-cohort'),
    policyVersion: 'TEST_POLICY_V1', policySha256: hash('policy'),
    proofCeiling: 'STRUCTURAL' as const, rows,
  };
}

function hash(value: unknown): string {
  return hashEditronCanonicalJsonV1(value);
}
