import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveDirectorCompletionHealth } from '../../lib/editron/services/editron-learning-gate';

describe('director worker completion health', () => {
  it('marks missing quality review as needs-attention', () => {
    const health = resolveDirectorCompletionHealth(undefined);

    expect(health).toMatchObject({
      hasQualityReview: false,
      qualityScore: 0,
      criticalCount: 0,
      needsQualityAttention: true,
      autoEditStatus: 'needs_review',
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
      autoEditStatus: 'needs_review',
    });
  });

  it('does not mark a healthy quality review as needs-attention', () => {
    const health = resolveDirectorCompletionHealth({ overallScore: 72, criticalCount: 1 });

    expect(health).toMatchObject({
      hasQualityReview: true,
      qualityScore: 72,
      criticalCount: 1,
      needsQualityAttention: false,
      autoEditStatus: 'complete',
    });
    expect(health.warning).toBeUndefined();
  });

  it('marks rendered Phase 0 failures as needs-attention even when metadata quality is healthy', () => {
    const health = resolveDirectorCompletionHealth(
      { overallScore: 72, criticalCount: 0 },
      {
        qualityEvidenceSource: 'rendered-aesthetic',
        renderedQualityStatus: 'fail',
        qualityScore: 18,
        renderedAestheticFailFrameCount: 2,
      },
    );

    expect(health).toMatchObject({
      hasQualityReview: true,
      qualityScore: 18,
      criticalCount: 0,
      needsQualityAttention: true,
      autoEditStatus: 'needs_review',
    });
    expect(health.warning).toContain('rendered Phase 0 quality failed');
  });

  it('does not downgrade healthy metadata when rendered evidence is still missing', () => {
    const health = resolveDirectorCompletionHealth(
      { overallScore: 72, criticalCount: 1 },
      {
        qualityEvidenceSource: 'metadata-only',
        renderedQualityStatus: 'missing',
        qualityScore: null,
        renderedAestheticFailFrameCount: 0,
      },
    );

    expect(health).toMatchObject({
      qualityScore: 72,
      criticalCount: 1,
      needsQualityAttention: false,
      autoEditStatus: 'complete',
    });
    expect(health.warning).toBeUndefined();
  });

  it('treats malformed persisted scores as unsafe instead of learning from them', () => {
    const health = resolveDirectorCompletionHealth({ overallScore: '72', criticalCount: '0' });

    expect(health).toMatchObject({
      qualityScore: 0,
      criticalCount: 0,
      needsQualityAttention: true,
      autoEditStatus: 'needs_review',
    });
  });

  it('does not persist bad-quality Director completions as successful auto-edits', () => {
    const directorSource = readFileSync(join(process.cwd(), 'lib/editron/services/canonical-director-run.ts'), 'utf8');
    const dashboardSource = readFileSync(join(process.cwd(), 'components/editron/project/project-dashboard.tsx'), 'utf8');
    const learningGateSource = readFileSync(join(process.cwd(), 'lib/editron/services/editron-learning-gate.ts'), 'utf8');

    expect(directorSource).toContain('resolveDirectorCompletionHealth,');
    expect(directorSource).toContain("autoEditStatus: completionHealth.autoEditStatus");
    expect(learningGateSource).toContain("autoEditStatus: needsQualityAttention ? 'needs_review' : 'complete'");
    expect(dashboardSource).toContain("if (status === 'needs_review')");
  });

  it('routes queued and inline Director execution through one quality/terminal owner', () => {
    const canonicalSource = readFileSync(
      join(process.cwd(), 'lib/editron/services/canonical-director-run.ts'),
      'utf8',
    );
    for (const routePath of [
      'app/api/internal/workers/video-analysis/route.ts',
      'app/api/internal/workers/tribe-analysis/route.ts',
    ]) {
      const source = readFileSync(join(process.cwd(), routePath), 'utf8');

      expect(source).toContain("import('@/lib/editron/services/canonical-director-run')");
      expect(source).toContain('runCanonicalDirectorV1(');
      expect(source).not.toContain("{ $set: { autoEditStatus: 'directing' } }");
      expect(source).not.toContain('executeDirectorPlan(projectId');
    }
    expect(canonicalSource).toContain('resolveDirectorCompletionHealth(');
    expect(canonicalSource).toContain('completeDirectorRunV1(');
    expect(canonicalSource).toContain('failDirectorRunV1(');
  });

  it('passes rendered quality evidence into the Director worker bandit write', () => {
    const directorSource = readFileSync(join(process.cwd(), 'lib/editron/services/canonical-director-run.ts'), 'utf8');

    expect(directorSource).toContain('intelligence.renderedQualityEvidence');
    expect(directorSource).toContain('const renderedQualityEvidence = projectAfterDirector?.intelligence?.renderedQualityEvidence');
    expect(directorSource).toContain('evidenceSource: renderedQualityEvidence?.qualityEvidenceSource');
    expect(directorSource).toContain('renderedQualityEvidence?.renderedAestheticStatus');
  });

  it('propagates fatal Director errors after lock cleanup instead of returning fake completion', () => {
    const directorAgentSource = readFileSync(join(process.cwd(), 'lib/editron/agent/director-agent.ts'), 'utf8');

    expect(directorAgentSource).toContain('let fatalDirectorError: Error | null = null');
    expect(directorAgentSource).toContain('fatalDirectorError = err instanceof Error ? err : new Error(String(err));');
    expect(directorAgentSource).toContain('await projectService.releaseDirectorMutationLease(userId, projectId, directorLeaseId);');
    expect(directorAgentSource).toContain('if (fatalDirectorError) {');
    expect(directorAgentSource).toContain('throw fatalDirectorError;');
    expect(directorAgentSource.indexOf('throw fatalDirectorError;')).toBeGreaterThan(
      directorAgentSource.indexOf('await projectService.releaseDirectorMutationLease(userId, projectId, directorLeaseId);')
    );
  });
});
