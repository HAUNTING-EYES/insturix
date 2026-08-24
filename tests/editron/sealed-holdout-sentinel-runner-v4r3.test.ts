import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutGeneralisationManifestV4R2,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r2';
import {
  buildSealedHoldoutGeneralisationManifestV4R3,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r3';
import {
  assertSealedHoldoutSentinelReceiptV4R3,
  recomputeSealedHoldoutSentinelsV4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-sentinel-runner-v4r3';

describe('sealed holdout V4R3 successor sentinel runner', () => {
  it('recomputes the eight inherited and four successor sentinels with zero effects', async () => {
    const input = fixture();
    const receipt = await recomputeSealedHoldoutSentinelsV4R3(input);
    expect(receipt).toMatchObject({
      lane: 'SEALED_HOLDOUT_GENERALISATION_V4R3',
      manifestSha256: input.manifest.manifestSha256,
      baseManifestSha256: input.baseManifest.manifestSha256,
      predecessorManifestSha256: input.predecessorManifest.manifestSha256,
      providerInferenceCalls: 0, networkCalls: 0,
      canonicalProjectReads: 0, canonicalProjectMutations: 0, stateEffects: [],
      assessment: 'PASS_ALL_V4R3_REQUIRED_SENTINELS_RECOMPUTED',
    });
    expect(receipt.sentinels).toHaveLength(12);
    expect(receipt.sentinels.slice(8).map(({ sentinelId }) => sentinelId)).toEqual([
      'V4R3_H02_BLANKET_RANGE_REJECT',
      'V4R3_H02_EXACT_WINDOWS_ACCEPT',
      'V4R3_H04_EQUIVALENT_PARTITION_ACCEPT',
      'V4R3_H04_REORDERED_PLAN_REJECT',
    ]);
    expect(assertSealedHoldoutSentinelReceiptV4R3(receipt)).toEqual(receipt);
  });

  it('separates accepted edits from owner-blocked unsafe attempts', async () => {
    const receipt = await recomputeSealedHoldoutSentinelsV4R3(fixture());
    const entries = new Map(receipt.sentinels.map((entry) => [entry.sentinelId, entry]));
    expect(entries.get('V4R3_H02_EXACT_WINDOWS_ACCEPT')?.axes).toMatchObject({
      modelDecision: 'PASS', ownerSafety: 'PASS', taskOutcome: 'PASS',
      attemptedMutationCount: 3, unsafeAttemptCount: 0,
    });
    expect(entries.get('V4R3_H04_EQUIVALENT_PARTITION_ACCEPT')?.axes).toMatchObject({
      modelDecision: 'PASS', attemptedMutationCount: 2, unsafeAttemptCount: 0,
    });
    for (const id of ['V4R3_H02_BLANKET_RANGE_REJECT', 'V4R3_H04_REORDERED_PLAN_REJECT']) {
      expect(entries.get(id)?.axes).toMatchObject({
        modelDecision: 'FAIL', ownerSafety: 'PASS', taskOutcome: 'FAIL',
        attemptedMutationCount: 1, unsafeAttemptCount: 1,
        ownerBlockedUnsafeAttemptCount: 1,
      });
    }
  });

  it('is deterministic and rejects self-rehashed authority or successor-result drift', async () => {
    const first = await recomputeSealedHoldoutSentinelsV4R3(fixture());
    const second = await recomputeSealedHoldoutSentinelsV4R3(fixture());
    expect(second.receiptSha256).toBe(first.receiptSha256);

    const authority = structuredClone(first) as unknown as Record<string, unknown>;
    authority.authority = 'DISPATCH_AUTHORITY';
    rehash(authority);
    expect(() => assertSealedHoldoutSentinelReceiptV4R3(authority))
      .toThrow('SEALED_V4R3_SENTINEL_RECEIPT_DRIFT');

    const successor = structuredClone(first) as unknown as Record<string, unknown>;
    const sentinels = successor.sentinels as Array<Record<string, unknown>>;
    sentinels[8].sentinelId = 'FORGED';
    rehash(successor);
    expect(() => assertSealedHoldoutSentinelReceiptV4R3(successor)).toThrow();
  });
});

function fixture() {
  const baseManifest = buildSealedHoldoutCohortManifestV2R(
    fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const predecessorManifest = buildSealedHoldoutGeneralisationManifestV4R2({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R2),
    baseManifest,
  });
  const manifest = buildSealedHoldoutGeneralisationManifestV4R3({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R3),
    baseManifest, predecessorManifest,
  });
  return { manifest, baseManifest, predecessorManifest };
}
function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function rehash(value: Record<string, unknown>): void {
  const { receiptSha256: _ignored, ...material } = value;
  value.receiptSha256 = hashCanonicalJsonV1(material);
}
