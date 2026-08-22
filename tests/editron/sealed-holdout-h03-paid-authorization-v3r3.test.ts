import { describe, expect, it } from 'vitest';

import { buildSealedH03ProviderOperatorInputV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r3';

describe('sealed H03 paid authorization V3R3 historical invalidation', () => {
  it('cannot issue a new V3R3 authorization after its bound implementation changed', async () => {
    await expect(buildSealedH03ProviderOperatorInputV3R3())
      .rejects.toThrow('SEALED_H03_PROVIDER_IMPLEMENTATION_BINDING_DRIFT');
  });
});
