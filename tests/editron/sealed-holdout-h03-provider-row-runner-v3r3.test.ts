import { describe, expect, it } from 'vitest';

import { SEALED_H03_PROVIDER_ROW_VERSION_V3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-row-runner-v3r3';

describe('sealed H03 provider row owner V3R3 historical reuse boundary', () => {
  it('retains its version while V3R4 hash-binds and reuses this sole row owner', () => {
    expect(SEALED_H03_PROVIDER_ROW_VERSION_V3R3)
      .toBe('EDITRON_OE_SEALED_H03_PROVIDER_ROW_V3R3_1');
  });
});
