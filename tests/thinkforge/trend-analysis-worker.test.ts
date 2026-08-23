import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  setSessionSelectedTrendAnalysis: vi.fn(),
  resolveReferenceVideoSource: vi.fn(),
  canonicalizeReferenceVideo: vi.fn(),
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
vi.mock('@/lib/editron/reference-video/canonicalize-reference', () => ({
  canonicalizeReferenceVideo: mocks.canonicalizeReferenceVideo,
  CanonicalizeReferenceError: class CanonicalizeReferenceError extends Error {
    constructor(readonly code: string) { super(code); }
  },
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
    mocks.canonicalizeReferenceVideo.mockReset();
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

  it('does not bypass the canonical importer when a YouTube source is rejected', async () => {
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
    }));
    expect(mocks.resolveReferenceVideoSource.mock.calls[0]?.[0]).not.toHaveProperty('youtubeMode');
    expect(mocks.canonicalizeReferenceVideo).not.toHaveBeenCalled();
    expect(mocks.analyzeSelectedTrendSource).not.toHaveBeenCalled();
  });

  it('canonicalizes exact imported bytes before invoking trend analysis', async () => {
    mocks.resolveReferenceVideoSource.mockResolvedValue({
      ok: true,
      source: {
        kind: 'asset',
        referenceId: 'imported_youtube_asset',
        videoUrl: 'https://cdn.example.com/imported-youtube.mp4',
        durationSec: 30,
        sourceLabel: 'Imported YouTube reference.mp4',
        sourceFingerprint: 'youtube|abc12345678',
        asset: null,
      },
    });
    mocks.canonicalizeReferenceVideo.mockResolvedValue({
      referenceAssetId: 'ref_canon_exact',
      videoUrl: 'https://cdn.example.com/ref_canon_exact.mp4',
      durationSec: 30,
      sourceLabel: 'Imported YouTube reference.mp4',
      sourceFingerprint: 'youtube|abc12345678',
      canonicalKind: 'asset',
      sourceRegistration: {
        bytesSha256: 'a'.repeat(64),
        receiptSha256: 'b'.repeat(64),
      },
    });
    mocks.analyzeSelectedTrendSource.mockResolvedValue({
      analysisVersion: 1,
      status: 'completed',
      analyzedAt: '2026-08-23T00:00:00.000Z',
      provider: 'gemini',
      model: 'gemini-test',
      source: {
        referenceId: 'ref_canon_exact',
        sourceKind: 'asset',
        sourceLabel: 'Imported YouTube reference.mp4',
        sourceFingerprint: `canonical|${'a'.repeat(64)}|${'b'.repeat(64)}`,
        durationSec: 30,
      },
      trendSpec: {
        trendId: 'candidate_1',
        version: 1,
        alignmentFrame: 'beat-space',
        beatGrid: {
          beatsMs: [0, 1_000],
          sections: [{ id: 'hook', role: 'hook', start: 0, end: 30_000 }],
          totalMs: 30_000,
        },
        invariants: [],
        variables: [],
        copyFormula: { slots: [{ id: 'hook', role: 'hook', template: '{claim}' }] },
        performanceScript: 'Open on the claim, then reveal the proof.',
        exemplarRefs: ['ref_canon_exact'],
        fetchedAt: '2026-08-23T00:00:00.000Z',
      },
    });
    const { POST } = await import('@/app/api/internal/workers/thinkforge/trend-analysis/route');
    const request = new Request('http://localhost/api/internal/workers/thinkforge/trend-analysis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session_1',
        candidateId: 'candidate_1',
        jobId: 'job_1',
        userId: 'user_1',
        orgId: 'org_1',
        sourceKind: 'remote-url',
        referenceVideoUrl: 'https://www.youtube.com/watch?v=abc12345678',
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(mocks.canonicalizeReferenceVideo).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_1',
      source: expect.objectContaining({ referenceId: 'imported_youtube_asset' }),
      audioUsageMode: 'preview-waveform-only',
    });
    expect(mocks.analyzeSelectedTrendSource).toHaveBeenCalledWith(expect.objectContaining({
      source: {
        kind: 'asset',
        referenceId: 'ref_canon_exact',
        videoUrl: 'https://cdn.example.com/ref_canon_exact.mp4',
        durationSec: 30,
        sourceLabel: 'Imported YouTube reference.mp4',
        sourceFingerprint: `canonical|${'a'.repeat(64)}|${'b'.repeat(64)}`,
        asset: null,
      },
    }));
  });

  it('fails loud when canonical registration is missing and exhausts retries without analysis', async () => {
    mocks.resolveReferenceVideoSource.mockResolvedValue({
      ok: true,
      source: {
        kind: 'asset',
        referenceId: 'imported_asset',
        videoUrl: 'https://cdn.example.com/imported.mp4',
        durationSec: 30,
        sourceLabel: 'Imported reference.mp4',
        sourceFingerprint: 'asset|imported_asset',
        asset: null,
      },
    });
    mocks.canonicalizeReferenceVideo.mockResolvedValue({
      referenceAssetId: 'ref_without_receipt',
      videoUrl: 'https://cdn.example.com/ref_without_receipt.mp4',
      canonicalKind: 'asset',
    });
    const { POST } = await import('@/app/api/internal/workers/thinkforge/trend-analysis/route');
    const body = JSON.stringify({
      sessionId: 'session_1',
      candidateId: 'candidate_1',
      jobId: 'job_1',
      userId: 'user_1',
      sourceKind: 'remote-url',
      referenceVideoUrl: 'https://cdn.example.com/imported.mp4',
    });

    const retryable = await POST(new Request(
      'http://localhost/api/internal/workers/thinkforge/trend-analysis',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body },
    ) as never);
    const exhausted = await POST(new Request(
      'http://localhost/api/internal/workers/thinkforge/trend-analysis',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Upstash-Retry-Count': '2' },
        body,
      },
    ) as never);

    expect(retryable.status).toBe(500);
    expect(await exhausted.json()).toMatchObject({
      status: 'failed',
      failureCode: 'analysis_generation_failed',
    });
    expect(mocks.analyzeSelectedTrendSource).not.toHaveBeenCalled();
  });
});
