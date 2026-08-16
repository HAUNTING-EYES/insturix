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
import {
  buildAnalyzedSelectedTrend,
  buildSelectedTrend,
  selectedTrendToContentCardContext,
} from '@/lib/thinkforge/trends/selected-trend';
import { TREND_SPEC_VERSION } from '@/lib/thinkforge/schemas/trend-spec';
import type { TrendCandidate } from '@/lib/thinkforge/trends/trend-evidence';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

function candidate(overrides: Partial<TrendCandidate> = {}): TrendCandidate {
  return {
    candidateId: 'candidate_1',
    candidateVersion: 1,
    title: 'Creator teardown <format>',
    summary: 'A concise proof-driven creator format.',
    platform: 'youtube',
    evidence: [{
      evidenceId: 'evidence_1',
      evidenceVersion: 1,
      kind: 'cultural_signal',
      provider: 'public-provider',
      platform: 'youtube',
      title: 'Creator teardown <format>',
      sourceUrl: 'https://www.youtube.com/watch?v=abc12345678',
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

const scriptAuthoringRequest = createThinkForgeAuthoringRequest({
  contentContract: createThinkForgeWriterContract('video_script'),
  platformSurface: { id: 'youtube' },
  targetDurationSec: 420,
});

const postAuthoringRequest = createThinkForgeAuthoringRequest({
  contentContract: createThinkForgeWriterContract('social_post'),
  platformSurface: { id: 'linkedin' },
  postControls: createDefaultThinkForgePostControls(),
});

describe('ThinkForge trend selection route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.getSession.mockReset();
    mocks.setSessionSelectedTrend.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null });
    mocks.getSession.mockResolvedValue({ _id: 'session_1', userId: 'user_1', projectMeta: { idea: 'Onboarding' } });
    mocks.setSessionSelectedTrend.mockImplementation(async (_sessionId, selectedTrend, authoringRequest) => ({
      idea: 'Onboarding',
      selectedTrend,
      authoringRequest,
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
    const response = await POST(request({
      sessionId: 'session_1',
      candidate: candidate(),
      target: 'script',
      authoringRequest: scriptAuthoringRequest,
    }));

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_1', 'user_1', null);
    expect(mocks.setSessionSelectedTrend).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({
        status: 'selected',
        target: 'script',
        candidate: expect.objectContaining({
          trendSpecEligible: false,
          nextAction: 'analyze_reference_video',
          title: 'Creator teardown format',
        }),
      }),
      scriptAuthoringRequest,
    );

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
        status: 'suggested',
      },
    });
  });

  it('rejects a trend target that conflicts with the explicit authoring request', async () => {
    const response = await POST(request({
      sessionId: 'session_1',
      candidate: candidate(),
      target: 'script',
      authoringRequest: postAuthoringRequest,
    }));

    expect(response.status).toBe(400);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.setSessionSelectedTrend).not.toHaveBeenCalled();
  });

  it('does not advertise article evidence as a video-analysis source', () => {
    const articleCandidate = candidate({
      evidence: [{
        ...candidate().evidence[0]!,
        sourceUrl: 'https://example.com/article-about-a-trend',
      }],
    });

    const selected = buildSelectedTrend({
      sessionId: 'session_1',
      target: 'script',
      candidate: articleCandidate,
    });

    expect(selected.candidate).toMatchObject({
      trendSpecEligible: false,
      nextAction: 'add_reference_video',
    });
  });

  it('marks calendar trend context accepted only after authorized analysis completes', () => {
    const selected = buildSelectedTrend({
      sessionId: 'session_1',
      target: 'calendar',
      candidate: candidate(),
    }, new Date('2026-07-12T00:00:00.000Z'));
    const analyzed = buildAnalyzedSelectedTrend(selected, {
      analysisVersion: 1,
      status: 'completed',
      analyzedAt: '2026-07-12T00:01:00.000Z',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      source: {
        referenceId: 'asset_reference_1',
        sourceKind: 'asset',
        sourceLabel: 'Reference reel',
        sourceFingerprint: 'sha256:reference_1',
      },
      trendSpec: {
        trendId: 'candidate_1',
        version: TREND_SPEC_VERSION,
        alignmentFrame: 'beat-space',
        beatGrid: {
          beatsMs: [0, 500],
          sections: [{ id: 'hook', role: 'hook', start: 0, end: 500, beats: [0] }],
          totalMs: 500,
        },
        invariants: [],
        variables: [],
        copyFormula: { slots: [] },
        performanceScript: 'Use the beat as a pacing cue.',
      },
    });

    expect(selectedTrendToContentCardContext(analyzed)).toMatchObject({
      trendId: 'candidate_1',
      source: 'social',
      status: 'accepted',
      provenance: ['evidence_1', 'asset_reference_1'],
    });
  });

  it('does not persist a selection for a session the caller cannot access', async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(request({ sessionId: 'session_other', candidate: candidate(), target: 'calendar' }));

    expect(response.status).toBe(404);
    expect(mocks.setSessionSelectedTrend).not.toHaveBeenCalled();
  });
});
