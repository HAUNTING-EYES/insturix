import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));

import { POST } from '@/app/api/services/thinkforge/trends/reference/route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/thinkforge/trends/reference', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('ThinkForge direct trend reference intake', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
  });

  it('requires authentication before validating a reference', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(request({ referenceVideoUrl: 'https://youtu.be/abc12345678' }));

    expect(response.status).toBe(401);
  });

  it('returns canonical server-owned evidence for a direct YouTube reference', async () => {
    const response = await POST(request({
      referenceVideoUrl: 'https://youtube.com/shorts/abc12345678?feature=share',
      platform: 'linkedin',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      candidate: {
        candidateId: expect.stringMatching(/^candidate_user_[a-f0-9]{24}$/),
        title: 'YouTube trend reference',
        platform: 'linkedin',
        trendSpecEligible: false,
        nextAction: 'analyze_reference_video',
        evidence: [expect.objectContaining({
          evidenceId: expect.stringMatching(/^evidence_user_[a-f0-9]{24}$/),
          kind: 'user_submitted_reference',
          provider: 'user',
          platform: 'youtube',
          sourceUrl: 'https://www.youtube.com/watch?v=abc12345678',
        })],
      },
    });
  });

  it('rejects article URLs before the UI creates a ThinkForge session', async () => {
    const response = await POST(request({
      referenceVideoUrl: 'https://example.com/article-about-a-trend',
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('must point directly'),
    });
  });
});
