import { describe, expect, it } from 'vitest';

import {
  assessProviderNativeCohortRowV2R,
  summarizeProviderNativeCohortRowsV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-cohort-runner-v2r';

describe('provider-native V2R cohort accounting', () => {
  it('does not score provider infrastructure failures as editing failures', () => {
    expect(assessProviderNativeCohortRowV2R(
      'PASS',
      'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE',
    )).toBe('PROVIDER_INFRASTRUCTURE_UNVERIFIABLE');
    expect(assessProviderNativeCohortRowV2R('PASS', 'FAIL')).toBe('FAIL');
    expect(assessProviderNativeCohortRowV2R('UNVERIFIABLE', 'UNVERIFIABLE')).toBe('PASS');
  });

  it('keeps pass, product failure, provider outage, and harness error counts distinct', () => {
    expect(summarizeProviderNativeCohortRowsV2R([
      { assessment: 'PASS' },
      { assessment: 'FAIL' },
      { assessment: 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE' },
      { assessment: 'HARNESS_ERROR' },
    ])).toEqual({
      passCount: 1,
      failCount: 1,
      providerInfrastructureUnverifiableCount: 1,
      harnessErrorCount: 1,
    });
  });
});
