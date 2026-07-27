import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  discover: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/thinkforge/trends/trend-discovery-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/thinkforge/trends/trend-discovery-service')>();
  return {
    ...actual,
    discoverPublicTrendCandidates: mocks.discover,
  };
});

import { POST } from '@/app/api/services/thinkforge/trends/discover/route';
import { TrendDiscoveryUnavailableError } from '@/lib/thinkforge/trends/trend-discovery-service';

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/thinkforge/trends/discover', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('ThinkForge public trend discovery route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.discover.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
  });

  it('requires an authenticated user before invoking external discovery', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(request({ niche: 'B2B SaaS' }));

    expect(response.status).toBe(401);
    expect(mocks.discover).not.toHaveBeenCalled();
  });

  it('returns only the discovery service result for valid public input', async () => {
    mocks.discover.mockResolvedValue({
      provider: 'perplexity',
      query: { niche: 'B2B SaaS', limit: 8 },
      candidates: [],
    });

    const response = await POST(request({ niche: 'B2B SaaS' }));

    expect(response.status).toBe(200);
    expect(mocks.discover).toHaveBeenCalledWith({ niche: 'B2B SaaS' });
    await expect(response.json()).resolves.toEqual({
      provider: 'perplexity',
      query: { niche: 'B2B SaaS', limit: 8 },
      candidates: [],
    });
  });

  it('reports unavailable public discovery instead of silently using another model path', async () => {
    mocks.discover.mockRejectedValue(new TrendDiscoveryUnavailableError('No public trend provider is available.'));

    const response = await POST(request({ niche: 'B2B SaaS' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'No public trend provider is available.',
    });
  });
});
