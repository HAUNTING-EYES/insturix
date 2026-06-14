export const LEGACY_INTELLIGENCE_FALLBACK_ENV = 'USE_LEGACY_INTELLIGENCE_FALLBACK';

export function shouldRunLegacyIntelligenceFallback(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[LEGACY_INTELLIGENCE_FALLBACK_ENV] === 'true';
}

export function formatVjepaCoverageAuditWarning(audit: {
  status: 'pass' | 'warn' | 'fail';
  issues: string[];
  overlayHitRate: number | null;
  segmentCoverage: { coverageRatio: number | null };
  reliability?: {
    screenAwarePlacement: 'trusted' | 'degraded' | 'unavailable';
    score: number;
    reasons: string[];
  };
}): string | null {
  if (audit.status === 'pass') return null;
  const coveragePct = audit.segmentCoverage.coverageRatio == null
    ? 'n/a'
    : `${Math.round(audit.segmentCoverage.coverageRatio * 100)}%`;
  const hitPct = audit.overlayHitRate == null
    ? 'n/a'
    : `${Math.round(audit.overlayHitRate * 100)}%`;
  const trust = audit.reliability
    ? `, screenAwarePlacement=${audit.reliability.screenAwarePlacement}, reliability=${Math.round(audit.reliability.score * 100)}%, reasons=${audit.reliability.reasons.join('|') || 'none'}`
    : '';
  return `V-JEPA coverage audit ${audit.status}: duration=${coveragePct}, overlayHit=${hitPct}${trust}, issues=${audit.issues.join(',') || 'none'}`;
}
