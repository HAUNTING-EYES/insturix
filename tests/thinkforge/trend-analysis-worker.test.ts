import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  setSessionSelectedTrendAnalysis: vi.fn(),
  resolveReferenceVideoSource: vi.fn(),
  analyzeSelectedTrendSource: vi.fn(),
}));

vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: (handler: unknown) => handler,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getSession: mocks.getSession,
  setSessionSelectedTrendAnalysis: mocks.setSessionSelectedTrendAnalysis,
}));
vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {},
}));
vi.mock('@/lib/editron/reference-video/reference-video-source', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/editron/reference-video/reference-video-source')>(),
  resolveReferenceVideoSource: mocks.resolveReferenceVideoSource,
}));
vi.mock('@/lib/thinkforge/trends/trend-source-analysis', () => ({
  analyzeSelectedTrendSource: mocks.analyzeSelectedTrendSource,
  TrendSourceAnalysisError: class TrendSourceAnalysisError extends Error {},
}));

import { buildQueuedTrendAnalysis, buildSelectedTrend } from '@/lib/thinkforge/trends/selected-trend';

const originalSigningKeys = {
  current: process.env.QSTASH_CURRENT_SIGNING_KEY,
  next: process.env.QSTASH_NEXT_SIGNING_KEY,
};

function queuedTrend() {
  const selected = buildSelectedTrend({
    sessionId: 'session_1',
    target: 'script',
    candidate: {
      candidateId: 'candidate_1',
      candidateVersion: 1,
      title: 'Fast reveal format',
      platform: 'youtube',
      evidence: [{
        evidenceId: 'evidence_1',
        evidenceVersion: 1,
        kind: 'user_submitted_reference',
        provider: 'user',
        platform: 'youtube',
        title: 'Fast reveal format',
        sourceUrl: 'https://www.youtube.com/watch?v=abc12345678',
        provenance: { purpose: 'public_trend_discovery', queryFingerprint: 'query_1' },
      }],
      evidenceCompleteness: 0.8,
      freshness: 'fresh',
      trendSpecEligible: false,
      nextAction: 'analyze_reference_video',
    },
  });
  return buildQueuedTrendAnalysis(selected, {
    jobId: 'job_1',
    sourceKind: 'remote-url',
  });
}

describe('ThinkForge trend-analysis worker', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'current';
    process.env.QSTASH_NEXT_SIGNING_KEY = 'next';
    mocks.getSession.mockReset();
    mocks.setSessionSelectedTrendAnalysis.mockReset();
    mocks.resolveReferenceVideoSource.mockReset();
    mocks.analyzeSelectedTrendSource.mockReset();
    mocks.getSession.mockResolvedValue({
      _id: 'session_1',
      userId: 'user_1',
      projectMeta: { selectedTrend: queuedTrend() },
    });
    mocks.resolveReferenceVideoSource.mockResolvedValue({
      ok: false,
      reason: 'youtube_reference_ingestion_failed',
      diagnostics: ['simulated'],
      sourceKind: 'youtube-url',
    });
    mocks.setSessionSelectedTrendAnalysis.mockResolvedValue({ selectedTrend: queuedTrend() });
  });

  afterEach(() => {
    if (originalSigningKeys.current === undefined) delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    else process.env.QSTASH_CURRENT_SIGNING_KEY = originalSigningKeys.current;
    if (originalSigningKeys.next === undefined) delete process.env.QSTASH_NEXT_SIGNING_KEY;
    else process.env.QSTASH_NEXT_SIGNING_KEY = originalSigningKeys.next;
  });

  it('routes YouTube references directly to Gemini instead of the brittle asset importer', async () => {
    const { POST } = await import('@/app/api/internal/workers/thinkforge/trend-analysis/route');
    const request = new Request('http://localhost/api/internal/workers/thinkforge/trend-analysis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session_1',
        candidateId: 'candidate_1',
        jobId: 'job_1',
        userId: 'user_1',
        orgId: null,
        sourceKind: 'remote-url',
        referenceVideoUrl: 'https://www.youtube.com/watch?v=abc12345678',
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(mocks.resolveReferenceVideoSource).toHaveBeenCalledWith(expect.objectContaining({
      referenceVideoUrl: 'https://www.youtube.com/watch?v=abc12345678',
      youtubeMode: 'provider-direct',
    }));
    expect(mocks.analyzeSelectedTrendSource).not.toHaveBeenCalled();
  });
});
