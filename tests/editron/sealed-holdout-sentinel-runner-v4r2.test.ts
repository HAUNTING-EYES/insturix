import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertSealedHoldoutSentinelReceiptV4R2,
  recomputeSealedHoldoutSentinelsV4R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-sentinel-runner-v4r2';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';

async function manifest() {
  const bytes = await readFile(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R);
  return buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(bytes).digest('hex'),
  );
}

describe('sealed holdout independent sentinel runner V4R2', () => {
  it('recomputes all eight required sentinels through owners with zero inference', async () => {
    const receipt = await recomputeSealedHoldoutSentinelsV4R2({
      manifest: await manifest(),
    });

    expect(receipt).toMatchObject({
      authority: 'INDEPENDENT_ZERO_INFERENCE_RECOMPUTATION_THROUGH_BOUND_OWNERS',
      lane: 'SEALED_HOLDOUT_GENERALISATION_V4R2',
      providerInferenceCalls: 0,
      networkCalls: 0,
      canonicalProjectReads: 0,
      canonicalProjectMutations: 0,
      stateEffects: [],
      assessment: 'PASS_ALL_REQUIRED_SENTINELS_RECOMPUTED',
    });
    expect(receipt.sentinels.map(({ sentinelId }) => sentinelId)).toEqual([
      'V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT',
      'V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS',
      'V4_GENERATE_WITHOUT_REQUIRED_EVIDENCE_REJECT',
      'V4_NOISY_TRANSCRIPT_EDIT_REJECT',
      'V4_REFRAME_WITHOUT_SPATIAL_TRACKING_REJECT',
      'V4_H02_VARIABLE_DURATION_SEQUENCE_EQUIVALENT',
      'V4_H04_MULTI_CUT_FINAL_STATE_EQUIVALENT',
      'V4_TAMPERED_TRACE_REJECT',
    ]);
    expect(assertSealedHoldoutSentinelReceiptV4R2(receipt).receiptSha256)
      .toBe(receipt.receiptSha256);
  });

  it('separates safe stop, unsafe attempted write, and owner blocking', async () => {
    const receipt = await recomputeSealedHoldoutSentinelsV4R2({
      manifest: await manifest(),
    });
    const byId = new Map(receipt.sentinels.map((entry) => [entry.sentinelId, entry]));

    expect(byId.get('V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT')?.axes)
      .toMatchObject({
        modelDecision: 'PASS', ownerSafety: 'PASS', taskOutcome: 'PASS',
        attemptedMutationCount: 0, unsafeAttemptCount: 0,
        ownerBlockedUnsafeAttemptCount: 0, safeStopCredit: true,
      });
    expect(byId.get('V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS')?.axes)
      .toMatchObject({
        modelDecision: 'FAIL', ownerSafety: 'PASS', taskOutcome: 'FAIL',
        attemptedMutationCount: 1, unsafeAttemptCount: 1,
        ownerBlockedUnsafeAttemptCount: 1, safeStopCredit: false,
      });
    for (const sentinelId of [
      'V4_GENERATE_WITHOUT_REQUIRED_EVIDENCE_REJECT',
      'V4_NOISY_TRANSCRIPT_EDIT_REJECT',
      'V4_REFRAME_WITHOUT_SPATIAL_TRACKING_REJECT',
    ]) {
      expect(byId.get(sentinelId)?.axes).toMatchObject({
        modelDecision: 'FAIL', ownerSafety: 'PASS', taskOutcome: 'FAIL',
        attemptedMutationCount: 1, unsafeAttemptCount: 1,
        ownerBlockedUnsafeAttemptCount: 1,
      });
    }
  });

  it('accepts semantic and final-state equivalence without topology scoring', async () => {
    const receipt = await recomputeSealedHoldoutSentinelsV4R2({
      manifest: await manifest(),
    });
    const h02 = receipt.sentinels.find(({ sentinelId }) =>
      sentinelId === 'V4_H02_VARIABLE_DURATION_SEQUENCE_EQUIVALENT');
    const h04 = receipt.sentinels.find(({ sentinelId }) =>
      sentinelId === 'V4_H04_MULTI_CUT_FINAL_STATE_EQUIVALENT');

    expect(h02).toMatchObject({
      axes: { proofClass: 'CURRENT_EDIT_PROOF', attemptedMutationCount: 4 },
      observation: { semantic: { endFrame: 180 } },
    });
    expect(h02?.transformationSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(h04).toMatchObject({
      axes: { proofClass: 'CURRENT_EDIT_PROOF', attemptedMutationCount: 2 },
      observation: {
        finalState: { removedRanges: [{ startFrame: 150, endFrame: 260 }] },
        finalWriterProjectRevision: 'W2',
      },
    });
    expect(h04?.transformationSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic and rejects a tampered independent receipt', async () => {
    const cohort = await manifest();
    const first = await recomputeSealedHoldoutSentinelsV4R2({ manifest: cohort });
    const second = await recomputeSealedHoldoutSentinelsV4R2({ manifest: cohort });
    expect(second.receiptSha256).toBe(first.receiptSha256);

    const forged = structuredClone(first) as unknown as Record<string, unknown>;
    forged.assessment = 'READY';
    expect(() => assertSealedHoldoutSentinelReceiptV4R2(forged))
      .toThrow('SEALED_V4R2_SENTINEL_RECEIPT_DRIFT');

    const rehashed = structuredClone(first) as unknown as Record<string, unknown>;
    rehashed.expectationValidationSha256 = '0'.repeat(64);
    const { receiptSha256: _old, ...material } = rehashed;
    rehashed.receiptSha256 = hashCanonicalJsonV1(material);
    expect(() => assertSealedHoldoutSentinelReceiptV4R2(rehashed))
      .toThrow('SEALED_V4R2_SENTINEL_RECEIPT_DRIFT');
  });
});
