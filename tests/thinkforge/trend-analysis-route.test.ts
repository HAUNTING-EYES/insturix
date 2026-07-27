import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const publishJSON = vi.fn();
  return {
    auth: vi.fn(),
    getSession: vi.fn(),
    setSessionSelectedTrendAnalysis: vi.fn(),
    publishJSON,
    Client: vi.fn(() => ({ publishJSON })),
  };
});

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@upstash/qstash', () => ({ Client: mocks.Client }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getSession: mocks.getSession,
  setSessionSelectedTrendAnalysis: mocks.setSessionSelectedTrendAnalysis,
}));

import { POST } from '@/app/api/services/thinkforge/trends/analyze/route';
import { buildQueuedTrendAnalysis, buildSelectedTrend } from '@/lib/thinkforge/trends/selected-trend';

const originalEnv = {
  qstashToken: process.env.QSTASH_TOKEN,
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
  vercelUrl: process.env.VERCEL_URL,
};

function selectedTrend() {
  return buildSelectedTrend({
    sessionId: 'session_1',
    target: 'script',
    candidate: {
      candidateId: 'candidate_1',
      candidateVersion: 1,
      title: 'Creator format',
      platform: 'instagram',
      evidence: [{
        evidenceId: 'evidence_1',
        evidenceVersion: 1,
        kind: 'user_submitted_reference',
        provider: 'user',
        platform: 'instagram',
        title: 'Creator format',
        sourceUrl: 'https://cdn.example.com/reference.mp4',
        provenance: { purpose: 'public_trend_discovery', queryFingerprint: 'query_1' },
      }],
      evidenceCompleteness: 0.8,
      freshness: 'fresh',
      trendSpecEligible: false,
      nextAction: 'analyze_reference_video',
    },
  }, new Date('2026-07-12T00:00:00.000Z'));
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/thinkforge/trends/analyze', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function restoreEnv(key: keyof typeof originalEnv, envName: string) {
  const value = originalEnv[key];
  if (value === undefined) delete process.env[envName];
  else process.env[envName] = value;
}

describe('ThinkForge trend-analysis queue route', () => {
  beforeEach(() => {
    process.env.QSTASH_TOKEN = 'test-token';
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'current';
    process.env.QSTASH_NEXT_SIGNING_KEY = 'next';
    process.env.VERCEL_URL = 'preview.example.com';
    mocks.auth.mockReset();
    mocks.getSession.mockReset();
    mocks.setSessionSelectedTrendAnalysis.mockReset();
    mocks.publishJSON.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null });
    mocks.getSession.mockResolvedValue({ _id: 'session_1', userId: 'user_1', projectMeta: { selectedTrend: selectedTrend() } });
    mocks.setSessionSelectedTrendAnalysis.mockImplementation(async (_sessionId, _candidateId, trend) => ({ selectedTrend: trend }));
    mocks.publishJSON.mockResolvedValue({ messageId: 'msg_1' });
  });

  afterEach(() => {
    restoreEnv('qstashToken', 'QSTASH_TOKEN');
    restoreEnv('currentSigningKey', 'QSTASH_CURRENT_SIGNING_KEY');
    restoreEnv('nextSigningKey', 'QSTASH_NEXT_SIGNING_KEY');
    restoreEnv('vercelUrl', 'VERCEL_URL');
  });

  it('requires an authenticated caller before creating a durable job', async () => {
    mocks.auth.mockResolvedValue({ userId: null, orgId: null });

    const response = await POST(request({ sessionId: 'session_1', referenceAssetId: 'asset_1' }));

    expect(response.status).toBe(401);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.publishJSON).not.toHaveBeenCalled();
  });

  it('persists a queued analysis before dispatching a signed worker job', async () => {
    const response = await POST(request({ sessionId: 'session_1', referenceAssetId: 'asset_1' }));

    expect(response.status).toBe(202);
    expect(mocks.setSessionSelectedTrendAnalysis).toHaveBeenCalledWith(
      'session_1',
      'candidate_1',
      expect.objectContaining({ analysis: expect.objectContaining({ status: 'queued', request: { sourceKind: 'asset' } }) }),
      { requireNoQueuedAnalysis: true },
    );
    expect(mocks.publishJSON).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://preview.example.com/api/internal/workers/thinkforge/trend-analysis',
      retries: 2,
      body: expect.objectContaining({ sessionId: 'session_1', candidateId: 'candidate_1', referenceAssetId: 'asset_1', sourceKind: 'asset' }),
    }));
    await expect(response.json()).resolves.toMatchObject({ status: 'queued', queueMessageId: 'msg_1' });
  });

  it('does not enqueue a duplicate while the selected trend already has a queued job', async () => {
    const queued = buildQueuedTrendAnalysis(selectedTrend(), {
      jobId: 'trend_analysis_existing',
      sourceKind: 'remote-url',
      now: new Date('2026-07-12T00:05:00.000Z'),
    });
    mocks.getSession.mockResolvedValue({ _id: 'session_1', userId: 'user_1', projectMeta: { selectedTrend: queued } });

    const response = await POST(request({ sessionId: 'session_1' }));

    expect(response.status).toBe(202);
    expect(mocks.setSessionSelectedTrendAnalysis).not.toHaveBeenCalled();
    expect(mocks.publishJSON).not.toHaveBeenCalled();
  });

  it('does not persist a queue record when no usable reference source was supplied', async () => {
    const noSource = buildSelectedTrend({
      sessionId: 'session_1',
      target: 'script',
      candidate: {
        ...selectedTrend().candidate,
        evidence: [{
          ...selectedTrend().candidate.evidence[0]!,
          sourceUrl: undefined,
        }],
        nextAction: 'add_reference_video',
      },
    });
    mocks.getSession.mockResolvedValue({ _id: 'session_1', userId: 'user_1', projectMeta: { selectedTrend: noSource } });

    const response = await POST(request({ sessionId: 'session_1' }));

    expect(response.status).toBe(422);
    expect(mocks.setSessionSelectedTrendAnalysis).not.toHaveBeenCalled();
    expect(mocks.publishJSON).not.toHaveBeenCalled();
  });

  it('rejects article and unsupported social-page URLs before queue persistence', async () => {
    const response = await POST(request({
      sessionId: 'session_1',
      referenceVideoUrl: 'https://example.com/article-about-a-trend',
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('must point directly'),
    });
    expect(mocks.setSessionSelectedTrendAnalysis).not.toHaveBeenCalled();
    expect(mocks.publishJSON).not.toHaveBeenCalled();
  });

  it('accepts a YouTube reference and queues the canonical analysis path', async () => {
    const referenceVideoUrl = 'https://www.youtube.com/watch?v=abc12345678';
    const response = await POST(request({ sessionId: 'session_1', referenceVideoUrl }));

    expect(response.status).toBe(202);
    expect(mocks.publishJSON).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ referenceVideoUrl, sourceKind: 'remote-url' }),
    }));
  });
});
