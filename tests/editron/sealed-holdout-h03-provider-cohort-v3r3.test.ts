import { describe, expect, it } from 'vitest';

import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5 }
  from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v5';
import { buildSealedH03ProviderOperatorInputV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r3';

describe('sealed H03 provider cohort V3R3 historical invalidation', () => {
  it('preserves V3R3 as V5-bound history and refuses to rebuild it from corrected sources', async () => {
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5.manifestHash)
      .toBe('0b18f216bb7a825eb607353f80dd34fbe00b661ea3dd439782fcf76dab27a4f0');
    await expect(buildSealedH03ProviderOperatorInputV3R3())
      .rejects.toThrow('SEALED_H03_PROVIDER_IMPLEMENTATION_BINDING_DRIFT');
  });
});
