import { beforeEach, describe, expect, it, vi } from 'vitest';

const owners = vi.hoisted(() => ({
  noEdit: vi.fn(), h01: vi.fn(), h02: vi.fn(), h04: vi.fn(), h05: vi.fn(),
}));

vi.mock('@/lib/editron/research/open-ended-planner/sealed-holdout-h01-native-proof-v2r',
  () => ({ proveSealedHoldoutH01NativeOutcomeV2R: vi.fn() }));
vi.mock('@/lib/editron/research/open-ended-planner/sealed-holdout-h01-native-proof-v3r',
  () => ({ proveSealedHoldoutH01NativeOutcomeV3R2: owners.h01 }));
vi.mock('@/lib/editron/research/open-ended-planner/sealed-holdout-h02-native-proof-v2r',
  () => ({
    proveSealedHoldoutH02NativeOutcomeV2R: vi.fn(),
    proveSealedHoldoutH02NativeOutcomeV3R2: owners.h02,
  }));
vi.mock('@/lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v2r',
  () => ({ proveSealedHoldoutH03HybridOutcomeV2R: vi.fn() }));
vi.mock('@/lib/editron/research/open-ended-planner/sealed-holdout-h04-native-proof-v2r',
  () => ({ proveSealedHoldoutH04NativeOutcomeV2R: vi.fn() }));
vi.mock('@/lib/editron/research/open-ended-planner/sealed-holdout-h04-native-proof-v3r2',
  () => ({ proveSealedHoldoutH04NativeOutcomeV3R2: owners.h04 }));
vi.mock('@/lib/editron/research/open-ended-planner/sealed-holdout-h05-native-proof-v2r',
  () => ({ proveSealedHoldoutH05NativeOutcomeV2R: vi.fn() }));
vi.mock('@/lib/editron/research/open-ended-planner/sealed-holdout-h05-native-proof-v3r2',
  () => ({ proveSealedHoldoutH05NativeOutcomeV3R2: owners.h05 }));
vi.mock('@/lib/editron/research/open-ended-planner/sealed-holdout-no-edit-proof-v2r',
  () => ({
    proveSealedHoldoutGeneralNoEditOutcomeV2R: vi.fn(),
    proveSealedHoldoutGeneralNoEditOutcomeV3R2: owners.noEdit,
  }));

import {
  proveSealedHoldoutPaidOutcomeV3R2,
  type SealedHoldoutPaidProofInputV3R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-paid-proof-adapter-v2r';

beforeEach(() => {
  vi.clearAllMocks();
  for (const [name, owner] of Object.entries(owners)) {
    owner.mockResolvedValue({ assessment: name, receiptSha256: name, stateEffects: [] });
  }
});

describe('current sealed paid proof dispatcher V3R2', () => {
  it.each([
    ['HOLD-06:C1', 'PASS', 'noEdit'],
    ['HOLD-01:C1', 'READY_FOR_PROOF', 'h01'],
    ['HOLD-02:C1', 'READY_FOR_PROOF', 'h02'],
    ['HOLD-02:C2', 'READY_FOR_PROOF', 'h02'],
    ['HOLD-04:C1', 'READY_FOR_PROOF', 'h04'],
    ['HOLD-05:C1', 'READY_FOR_PROOF', 'h05'],
  ] as const)('routes %s/%s to only the %s owner', async (caseId, assessment, ownerName) => {
    const input = proofInput(caseId, assessment);
    const result = await proveSealedHoldoutPaidOutcomeV3R2(input);
    expect(result.receiptSha256).toBe(ownerName);
    for (const [name, owner] of Object.entries(owners)) {
      expect(owner).toHaveBeenCalledTimes(name === ownerName ? 1 : 0);
    }
    if (ownerName === 'h04') {
      expect(owners.h04).toHaveBeenCalledWith(expect.objectContaining({
        budgetedEpisode: input.budgetedEpisode,
      }));
    }
  });

  it('does not lower the separately governed generated-composition row', async () => {
    await expect(proveSealedHoldoutPaidOutcomeV3R2(
      proofInput('HOLD-03:C1', 'READY_FOR_PROOF'),
    )).rejects.toThrow('SEALED_CURRENT_PAID_PROOF_EXECUTABLE_CASE_UNSUPPORTED:HOLD-03:C1');
    expect(Object.values(owners).every((owner) => owner.mock.calls.length === 0)).toBe(true);
  });

  it('fails closed before owner dispatch when evaluation is not provable', async () => {
    await expect(proveSealedHoldoutPaidOutcomeV3R2(
      proofInput('HOLD-01:C1', 'FAIL'),
    )).rejects.toThrow('SEALED_CURRENT_PAID_PROOF_EVALUATION_NOT_PROVABLE:FAIL');
    expect(Object.values(owners).every((owner) => owner.mock.calls.length === 0)).toBe(true);
  });
});

function proofInput(caseId: string, assessment: string): SealedHoldoutPaidProofInputV3R2 {
  return {
    manifest: { manifestSha256: 'manifest' },
    caseId,
    budgetedEpisode: { receiptSha256: 'episode' },
    trace: { artifactSha256: 'trace' },
    evaluation: { assessment },
    mediaManifest: { artifacts: [] },
    outputDirectory: 'unused',
  } as unknown as SealedHoldoutPaidProofInputV3R2;
}
