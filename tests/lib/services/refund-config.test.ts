import { describe, it, expect } from 'vitest';
import { REFUND_MAPPING } from '@/lib/services/refund-config';
import { UNIFIED_SERVICE_LIMITS } from '@/lib/config/serviceLimits';

describe('REFUND_MAPPING', () => {
  it('includes alyzitron analysis mapping', () => {
    expect(REFUND_MAPPING.alyzitron).toBeDefined();
    expect(REFUND_MAPPING.alyzitron.analysis).toBeDefined();
    expect(REFUND_MAPPING.alyzitron.analysis).toContain('AnalysisMinutes');
  });

  it('maps to existing service limits', () => {
    for (const [serviceName, tasks] of Object.entries(REFUND_MAPPING)) {
      for (const usageTypes of Object.values(tasks)) {
        for (const usageType of usageTypes) {
          // Ensure that the referenced limit type exists in UNIFIED_SERVICE_LIMITS
          const exists = UNIFIED_SERVICE_LIMITS[serviceName]?.[usageType as string];
          expect(exists).toBeDefined();
        }
      }
    }
  });
});