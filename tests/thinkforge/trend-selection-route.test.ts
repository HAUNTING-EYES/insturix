import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getSession: vi.fn(),
  setSessionSelectedTrend: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  getSession: mocks.getSession,
  setSessionSelectedTrend: mocks.setSessionSelectedTrend,
}));

import { POST } from '@/app/api/services/thinkforge/trends/select/route';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: 'candidate_1',
    candidateVersion: 1,
    title: 'Creator teardown <format>',
    summary: 'A concise proof-driven creator format.',
    platform: 'instagram',
    evidence: [{
      evidenceId: 'evidence_1',
      evidenceVersion: 1,
      kind: 'cultural_signal',
      provider: 'public-provider',
      platform: 'instagram',
      title: 'Creator teardown <format>',
      sourceUrl: 'https://example.com/reel',
      provenance: {
        purpose: 'public_trend_discovery',
        queryFingerprint: 'query_1',
      },
    }],
    evidenceCompleteness: 0.7,
    freshness: 'fresh',
    trendSpecEligible: true,
    nextAction: 'use_as_timed_angle',
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/thinkforge/trends/select', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('ThinkForge trend selection route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.getSession.mockReset();
    mocks.setSessionSelectedTrend.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null });
    mocks.getSession.mockResolvedValue({ _id: 'session_1', userId: 'user_1', projectMeta: { idea: 'Onboarding' } });
    mocks.setSessionSelectedTrend.mockImplementation(async (_sessionId, selectedTrend) => ({
      idea: 'Onboarding',
      selectedTrend,
    }));
  });

  it('requires an authenticated user before checking or updating a session', async () => {
    mocks.auth.mockResolvedValue({ userId: null, orgId: null });

    const response = await POST(request({ sessionId: 'session_1', candidate: candidate(), target: 'script' }));

    expect(response.status).toBe(401);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.setSessionSelectedTrend).not.toHaveBeenCalled();
  });

  it('persists a confirmed selection but never trusts browser TrendSpec readiness', async () => {
    const response = await POST(request({ sessionId: 'session_1', candidate: candidate(), target: 'script' }));

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_1', 'user_1', null);
    expect(mocks.setSessionSelectedTrend).toHaveBeenCalledWith('session_1', expect.objectContaining({
      status: 'selected',
      target: 'script',
      candidate: expect.objectContaining({
        trendSpecEligible: false,
        nextAction: 'analyze_reference_video',
        title: 'Creator teardown format',
      }),
    }));

    await expect(response.json()).resolves.toMatchObject({
      sessionId: 'session_1',
      selectedTrend: {
        status: 'selected',
        target: 'script',
        candidate: {
          trendSpecEligible: false,
          nextAction: 'analyze_reference_video',
        },
      },
      calendarTrendContext: {
        trendId: 'candidate_1',
        source: 'public_trend',
        status: 'accepted',
      },
    });
  });

  it('does not persist a selection for a session the caller cannot access', async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(request({ sessionId: 'session_other', candidate: candidate(), target: 'calendar' }));

    expect(response.status).toBe(404);
    expect(mocks.setSessionSelectedTrend).not.toHaveBeenCalled();
  });
});
