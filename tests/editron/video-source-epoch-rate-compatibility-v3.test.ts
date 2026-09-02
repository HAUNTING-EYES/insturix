import { describe, expect, it } from 'vitest';

import {
  classifyVerifiedVideoSourceEpochRateCompatibilityV3,
} from '@/lib/editron/services/video-source-time-transform-v1';
import { buildVerifiedProxySourceV3FixtureV1 }
  from './helpers/verified-proxy-source-v3-fixture';

describe('verified V3 source rate compatibility', () => {
  it('admits exact same-rate CFR and rejects VFR, mixed-rate, and decimal projects', async () => {
    const cfr30 = await buildVerifiedProxySourceV3FixtureV1({
      tag: 'rate-cfr30',
      frameDurations: ['3000', '3000', '3000', '3000', '3000', '3000'],
    });
    const vfr = await buildVerifiedProxySourceV3FixtureV1({ tag: 'rate-vfr' });
    const cfr3003 = await buildVerifiedProxySourceV3FixtureV1({
      tag: 'rate-cfr3003',
      frameDurations: ['3003', '3003', '3003', '3003', '3003', '3003'],
    });

    expect(classifyVerifiedVideoSourceEpochRateCompatibilityV3(
      cfr30.verifiedBinding,
      30,
    )).toEqual({ disposition: 'COMPATIBLE_SAME_RATE_CFR' });
    expect(classifyVerifiedVideoSourceEpochRateCompatibilityV3(
      vfr.verifiedBinding,
      30,
    )).toEqual({ disposition: 'UNSUPPORTED', reason: 'VFR_INDEX_REQUIRED' });
    expect(classifyVerifiedVideoSourceEpochRateCompatibilityV3(
      cfr3003.verifiedBinding,
      30,
    )).toEqual({
      disposition: 'UNSUPPORTED',
      reason: 'SOURCE_PROJECT_RATE_MISMATCH',
    });
    expect(classifyVerifiedVideoSourceEpochRateCompatibilityV3(
      cfr30.verifiedBinding,
      29.97,
    )).toEqual({
      disposition: 'UNSUPPORTED',
      reason: 'PROJECT_RATIONAL_TIMEBASE_REQUIRED',
    });
  });
});
