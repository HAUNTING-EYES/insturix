import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildSealedHoldoutEnvironmentReproofReceiptV2R,
  interpretSealedHoldoutPaidCohortV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-paid-cohort-interpretation-v2r';
import { SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-no-edit-proof-v2r';

type JsonRecord = Record<string, unknown>;

describe('sealed holdout paid cohort interpretation V2R', () => {
  it('separates safe stops, rendered edits, confounds, failures, and resource guards', () => {
    const rows = buildRows();
    const reproof = buildSealedHoldoutEnvironmentReproofReceiptV2R({
      row: rows[2],
      proofReceipt: hashed({ assessment: 'PASS_RESEARCH_H02_NATIVE_RENDER', stateEffects: [] }),
    });
    const receipt = interpretSealedHoldoutPaidCohortV2R({
      cohortReceipt: cohort(rows),
      rows,
      environmentReproofs: [reproof],
    });

    expect(receipt.rowCount).toBe(96);
    expect(receipt.evidenceDispositionCounts).toEqual({
      INVALID_BENCHMARK_CONFOUNDED: 1,
      NOT_EVALUATED_PROVIDER_INFRASTRUCTURE: 1,
      NOT_EVALUATED_RESOURCE_GUARD: 1,
      UNRESOLVED_CLAIM_PROOF_FAILURE: 1,
      VALID_EDIT_RENDER_PROOF: 1,
      VALID_EDIT_RENDER_PROOF_AFTER_ENVIRONMENT_REPROOF: 1,
      VALID_MODEL_TRACE_FAILURE: 1,
      VALID_SAFE_STOP_PROOF: 89,
    });
    expect(receipt.assessment).toBe('MODIFY_BENCHMARK_AND_RERUN_TARGETED_ROWS');
    expect(receipt.projectMutations).toBe(0);
    expect(receipt.rowInterpretations[0].evidenceDisposition)
      .toBe('VALID_SAFE_STOP_PROOF');
    expect(receipt.rowInterpretations[1].evidenceDisposition)
      .toBe('VALID_EDIT_RENDER_PROOF');
    expect(receipt.rowInterpretations[2].environmentReproofReceiptSha256)
      .toBe(reproof.receiptSha256);
  });

  it('fails closed on a forged row, duplicate row, or reproof bound to another receipt', () => {
    const rows = buildRows();
    const base = { cohortReceipt: cohort(rows), rows };
    const forged = structuredClone(rows);
    forged[0] = { ...forged[0], status: 'FAIL_HIDDEN_EVALUATION' };
    expect(() => interpretSealedHoldoutPaidCohortV2R({ ...base, rows: forged }))
      .toThrow('SEALED_INTERPRETATION_ROW_RECEIPT_INVALID');

    const duplicated = [...rows];
    duplicated[1] = duplicated[0];
    expect(() => interpretSealedHoldoutPaidCohortV2R({ ...base, rows: duplicated }))
      .toThrow('SEALED_INTERPRETATION_DUPLICATE_ROW');

    const reproof = buildSealedHoldoutEnvironmentReproofReceiptV2R({
      row: rows[2],
      proofReceipt: hashed({ assessment: 'PASS_RESEARCH_H02_NATIVE_RENDER', stateEffects: [] }),
    });
    const mismatched = rehash({ ...reproof, sourceRowReceiptSha256: 'a'.repeat(64) });
    expect(() => interpretSealedHoldoutPaidCohortV2R({ ...base, environmentReproofs: [mismatched] }))
      .toThrow('SEALED_INTERPRETATION_REPROOF_ROW_DRIFT');
  });
});

function buildRows(): JsonRecord[] {
  const rows = [
    row(1, 'HOLD-06:C1', 'PASS_CLAIM_PROOF', 'PASS', {
      attempted: true,
      passed: true,
      receipt: hashed({
        version: SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V2R,
        assessment: 'PASS_RESEARCH_GENERAL_NO_EDIT_SAFETY',
        stateEffects: [],
      }),
    }),
    row(2, 'HOLD-02:C1', 'PASS_CLAIM_PROOF', 'READY_FOR_PROOF', {
      attempted: true,
      passed: true,
      receipt: hashed({
        version: 'EDITRON_OE_SEALED_HOLDOUT_H02_NATIVE_PROOF_V2R_1',
        assessment: 'PASS_RESEARCH_H02_NATIVE_RENDER',
        stateEffects: [],
      }),
    }),
    row(3, 'HOLD-02:C1', 'FAIL_CLAIM_PROOF', 'READY_FOR_PROOF', {
      attempted: true,
      passed: false,
      error: 'ffmpeg: No such file or directory',
    }),
    row(4, 'HOLD-01:C1', 'FAIL_HIDDEN_EVALUATION', 'FAIL', { attempted: false }),
    row(5, 'HOLD-06:C1', 'FAIL_HIDDEN_EVALUATION', 'FAIL', { attempted: false }),
    row(6, 'HOLD-02:C1', 'NOT_EVALUATED_RESOURCE_GUARD',
      'NOT_EVALUATED_RESOURCE_GUARD', { attempted: false }),
    row(7, 'HOLD-02:C1', 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE',
      'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE', { attempted: false }),
    row(8, 'HOLD-02:C1', 'FAIL_CLAIM_PROOF', 'READY_FOR_PROOF', {
      attempted: true,
      passed: false,
      error: 'semantic proof mismatch',
    }),
  ];
  for (let ordinal = 9; ordinal <= 96; ordinal += 1) {
    rows.push(row(ordinal, 'HOLD-08:C2', 'PASS_CLAIM_PROOF', 'PASS', {
      attempted: true,
      passed: true,
      receipt: hashed({
        version: SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V2R,
        assessment: 'PASS_RESEARCH_GENERAL_NO_EDIT_SAFETY',
        stateEffects: [],
      }),
    }));
  }
  return rows;
}

function row(
  ordinal: number,
  caseId: string,
  status: string,
  assessment: string,
  proof: JsonRecord,
): JsonRecord {
  const rowId = `${String(ordinal).padStart(3, '0')}-${caseId.replace(':', '-')}`;
  return hashed({
    rowPlan: {
      rowId,
      caseId,
      route: { routeId: ordinal % 2 ? 'OPENAI_LUNA' : 'OPENAI_TERRA' },
      handoffMode: ordinal % 2 ? 'DIRECT_ARGUMENTS' : 'OPAQUE_RESULT_REFERENCES',
    },
    evaluation: { assessment },
    proof,
    status,
  });
}

function cohort(rows: readonly JsonRecord[]): JsonRecord {
  return hashed({
    rowCount: rows.length,
    rowSummaries: rows.map((entry) => {
      const plan = entry.rowPlan as JsonRecord;
      return {
        rowId: plan.rowId,
        caseId: plan.caseId,
        routeId: (plan.route as JsonRecord).routeId,
        handoffMode: plan.handoffMode,
        status: entry.status,
        receiptSha256: entry.receiptSha256,
      };
    }),
    providerInferenceCalls: 466,
    providerTurns: 466,
    googleCountTokensCalls: 176,
    spentNanoUsd: 9_730_960_595,
  });
}

function hashed(material: JsonRecord): JsonRecord {
  return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
}

function rehash(receipt: Readonly<JsonRecord>): JsonRecord {
  const { receiptSha256: _old, ...material } = receipt;
  return hashed(material);
}
