import { describe, expect, it } from 'vitest';
import {
  LEGACY_INTELLIGENCE_FALLBACK_ENV,
  formatVjepaCoverageAuditWarning,
  shouldRunLegacyIntelligenceFallback,
} from '../../lib/editron/agent/director-observability';

describe('Director observability gates', () => {
  it('keeps legacy intelligence fallback opt-in only', () => {
    expect(shouldRunLegacyIntelligenceFallback({})).toBe(false);
    expect(shouldRunLegacyIntelligenceFallback({ [LEGACY_INTELLIGENCE_FALLBACK_ENV]: 'false' })).toBe(false);
    expect(shouldRunLegacyIntelligenceFallback({ [LEGACY_INTELLIGENCE_FALLBACK_ENV]: 'true' })).toBe(true);
  });

  it('formats non-passing V-JEPA coverage audits as explicit warnings', () => {
    const warning = formatVjepaCoverageAuditWarning({
      status: 'warn',
      issues: ['warn:missing-vjepa-primitives'],
      overlayHitRate: 0.5,
      segmentCoverage: { coverageRatio: 0.875 },
      reliability: {
        screenAwarePlacement: 'degraded',
        score: 0.62,
        reasons: ['negativeSpace-coverage-below-90:0%'],
      },
    });

    expect(warning).toContain('V-JEPA coverage audit warn');
    expect(warning).toContain('duration=88%');
    expect(warning).toContain('overlayHit=50%');
    expect(warning).toContain('screenAwarePlacement=degraded');
    expect(warning).toContain('reliability=62%');
    expect(warning).toContain('negativeSpace-coverage-below-90:0%');
    expect(warning).toContain('warn:missing-vjepa-primitives');
  });

  it('does not warn when V-JEPA coverage passes', () => {
    expect(formatVjepaCoverageAuditWarning({
      status: 'pass',
      issues: [],
      overlayHitRate: 1,
      segmentCoverage: { coverageRatio: 1 },
    })).toBeNull();
  });
});
