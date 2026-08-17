import { afterEach, describe, expect, it, vi } from 'vitest';

import { computeMGRenderPreflight, renderIntegrityPolicy } from '@/lib/editron/motion-graphics/codegen/mg-delivery';

const NOW = '2026-08-05T12:00:00.000Z';

function project(partial: {
  overlays?: unknown[];
  outcomes?: unknown[];
  asyncOutcomes?: unknown[];
}) {
  return {
    overlays: partial.overlays ?? [],
    intelligence: {
      mgCodegenRun: {
        outcomes: (partial.outcomes ?? []) as never,
        asyncOutcomes: (partial.asyncOutcomes ?? []) as never,
      },
    },
  };
}

describe('renderIntegrityPolicy (brief §16.4/§24.3)', () => {
  it('defaults to degraded_allowed (never silently fails the whole export)', () => {
    expect(renderIntegrityPolicy({})).toBe('degraded_allowed');
  });
  it('honors explicit preview/strict via env', () => {
    expect(renderIntegrityPolicy({ MG_RENDER_INTEGRITY_POLICY: 'strict' })).toBe('strict');
    expect(renderIntegrityPolicy({ MG_RENDER_INTEGRITY_POLICY: 'preview' })).toBe('preview');
  });
  afterEach(() => { vi.unstubAllEnvs(); });
});

describe('computeMGRenderPreflight (Fix-4 consolidation of the existing ledger)', () => {
  it('a landed MG_SEQUENCE overlay counts as delivered even without an async outcome', () => {
    const p = project({
      overlays: [{ type: 'mg-sequence', metadata: { mgRenderJobId: 'mgr_abc', sourceType: 'edl-mg-codegen' } }],
      outcomes: [{ jobId: 'mgr_abc', status: 'queued', momentId: 'm1' }],
    });
    const pre = computeMGRenderPreflight(p as never, { now: NOW });
    expect(pre.delivered).toContain('mgr_abc');
    expect(pre.missingMGs).toHaveLength(0);
    expect(pre.degraded).toBe(false);
    expect(pre.pending).toHaveLength(0);
  });

  it('a queued job with NO delivery is surfaced as missing (degraded, no card)', () => {
    const p = project({
      outcomes: [{ jobId: 'mgr_missing', status: 'queued', momentId: 'm2' }],
    });
    const pre = computeMGRenderPreflight(p as never, { now: NOW });
    // Current cloud-render default: this is an honest degraded result, not yet
    // the visible IF1-style non-success receipt required by the target plan.
    expect(pre.policy).toBe('degraded_allowed');
    expect(pre.expected).toContain('mgr_missing');
    expect(pre.missingMGs).toEqual([
      expect.objectContaining({
        jobId: 'mgr_missing',
        momentId: 'm2',
        status: 'queued',
        reason: expect.stringContaining('no replacement inserted'),
      }),
    ]);
    expect(pre.degraded).toBe(true);
    expect(pre.pending).toContain('mgr_missing');
    expect(pre.declined).not.toContain('mgr_missing');
    expect(pre.failed).not.toContain('mgr_missing');
  });

  it('async generated delivery resolves an expected queued job', () => {
    const p = project({
      outcomes: [{ jobId: 'mgr_async', status: 'queued', momentId: 'm3' }],
      asyncOutcomes: [{ jobId: 'mgr_async', status: 'generated', sequenceId: 'seq_1', momentId: 'm3' }],
    });
    const pre = computeMGRenderPreflight(p as never, { now: NOW });
    expect(pre.missingMGs).toHaveLength(0);
    expect(pre.delivered).toContain('mgr_async');
  });

  it('explicit decline is terminal and never flagged missing', () => {
    const p = project({
      asyncOutcomes: [{ jobId: 'mgr_dec', status: 'declined', momentId: 'm4', reason: 'no_communicative_need' }],
    });
    const pre = computeMGRenderPreflight(p as never, { now: NOW });
    expect(pre.declined).toContain('mgr_dec');
    expect(pre.missingMGs).toHaveLength(0);
    expect(pre.pending).toHaveLength(0);
  });

  it('fallback and timed_out are classified failures/rejected, not missing-at-render', () => {
    const p = project({
      outcomes: [
        { jobId: 'mgr_fb', status: 'queued', momentId: 'm5' },
        { jobId: 'mgr_to', status: 'queued', momentId: 'm6' },
      ],
      asyncOutcomes: [
        { jobId: 'mgr_fb', status: 'fallback', momentId: 'm5', reason: 'judge 3 < 7.5' },
        { jobId: 'mgr_to', status: 'timed_out', momentId: 'm6', reason: 'worker timeout' },
      ],
    });
    const pre = computeMGRenderPreflight(p as never, { now: NOW });
    expect(pre.failed).toContain('mgr_fb');
    expect(pre.timedOut).toContain('mgr_to');
    expect(pre.rejected).toContain('mgr_fb');
    expect(pre.missingMGs).toHaveLength(0);
    expect(pre.pending).toHaveLength(0);
  });

  it('strict policy does not change classification (the decision is at the render route)', () => {
    const p = project({ outcomes: [{ jobId: 'mgr_x', status: 'queued', momentId: 'm7' }] });
    const strict = computeMGRenderPreflight(p as never, { now: NOW, policy: 'strict' });
    const degraded = computeMGRenderPreflight(p as never, { now: NOW, policy: 'degraded_allowed' });
    expect(strict.missingMGs.map((m) => m.jobId)).toEqual(degraded.missingMGs.map((m) => m.jobId));
    expect(strict.policy).toBe('strict');
    expect(degraded.policy).toBe('degraded_allowed');
  });

  it('missing exit never proposes any replacement overlay/card (fail-honest, §3.2/§3.3)', () => {
    const p = project({ outcomes: [{ jobId: 'mgr_m', status: 'queued', momentId: 'm8' }] });
    const pre = computeMGRenderPreflight(p as never, { now: NOW });
    expect(pre.missingMGs[0]).toMatchObject({ jobId: 'mgr_m' });
    // The module's contract is to surface, never to fabricate a replacement.
    expect(pre.delivered).not.toContain('mgr_m');
    expect(pre.failed).not.toContain('mgr_m');
  });
});
