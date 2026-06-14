import { describe, expect, it } from 'vitest';

import { resolveDirectorCompletionHealth } from '../../app/api/internal/workers/director/route';

describe('director worker completion health', () => {
  it('marks missing quality review as needs-attention', () => {
    const health = resolveDirectorCompletionHealth(undefined);

    expect(health).toMatchObject({
      hasQualityReview: false,
      qualityScore: 0,
      criticalCount: 0,
      needsQualityAttention: true,
      warning: 'Director completed without a persisted quality review.',
    });
  });

  it('marks zero quality score as needs-attention', () => {
    const health = resolveDirectorCompletionHealth({ overallScore: 0, criticalCount: 0 });

    expect(health.needsQualityAttention).toBe(true);
    expect(health.warning).toContain('quality score 0');
  });

  it('marks too many critical issues as needs-attention', () => {
    const health = resolveDirectorCompletionHealth({ overallScore: 72, criticalCount: 6 });

    expect(health).toMatchObject({
      qualityScore: 72,
      criticalCount: 6,
      needsQualityAttention: true,
    });
  });

  it('does not mark a healthy quality review as needs-attention', () => {
    const health = resolveDirectorCompletionHealth({ overallScore: 72, criticalCount: 1 });

    expect(health).toMatchObject({
      hasQualityReview: true,
      qualityScore: 72,
      criticalCount: 1,
      needsQualityAttention: false,
    });
    expect(health.warning).toBeUndefined();
  });

  it('treats malformed persisted scores as unsafe instead of learning from them', () => {
    const health = resolveDirectorCompletionHealth({ overallScore: '72', criticalCount: '0' });

    expect(health).toMatchObject({
      qualityScore: 0,
      criticalCount: 0,
      needsQualityAttention: true,
    });
  });
});
