import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkCredits: vi.fn(),
  insertOne: vi.fn(),
  publishJSON: vi.fn(),
  qstashClient: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
  clerkClient: vi.fn(),
}));

vi.mock('@upstash/qstash', () => ({
  Client: mocks.qstashClient,
}));

vi.mock('@/lib/services/creditsMiddleware', () => ({
  checkCredits: mocks.checkCredits,
}));

vi.mock('@/lib/services/musitron-mongo', () => ({
  getMusitronCollections: vi.fn(async () => ({
    musicGenerations: { insertOne: mocks.insertOne },
  })),
}));

import { POST } from '@/app/api/services/musitron/generate/route';

function validRequest(): Request {
  return new Request('https://app.example.test/api/services/musitron/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Canary track',
      instrumental: true,
      style: 'minimal',
      duration: 30,
      model: 'fal-ai/stable-audio/v2.5',
    }),
  });
}

describe('Musitron generate startup boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('QSTASH_TOKEN', '');
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null });
    mocks.qstashClient.mockImplementation(() => ({ publishJSON: mocks.publishJSON }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('imports without QStash and rejects before billing or persistence', async () => {
    const response = await POST(validRequest());
    if (!response) throw new Error('Expected Musitron to return a queue-unavailable response');
    const body = await response.json() as { error?: { type?: string } };

    expect(response.status).toBe(503);
    expect(body.error?.type).toBe('QUEUE_UNAVAILABLE');
    expect(mocks.qstashClient).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.insertOne).not.toHaveBeenCalled();
    expect(mocks.publishJSON).not.toHaveBeenCalled();
  });
});
