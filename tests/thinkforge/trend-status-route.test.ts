import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({ getSession: mocks.getSession }));

import { GET } from '@/app/api/services/thinkforge/trends/status/route';

function request(sessionId?: string): Request {
  const suffix = sessionId === undefined ? '' : `?sessionId=${encodeURIComponent(sessionId)}`;
  return new Request(`http://localhost/api/services/thinkforge/trends/status${suffix}`);
}

describe('ThinkForge trend status route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.getSession.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
  });

  it('requires authentication before reading session state', async () => {
    mocks.auth.mockResolvedValue({ userId: null, orgId: null });

    const response = await GET(request('session_1'));

    expect(response.status).toBe(401);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('validates the session id and returns only selected trend state', async () => {
    const selectedTrend = { status: 'selected', candidate: { candidateId: 'candidate_1' } };
    mocks.getSession.mockResolvedValue({
      _id: 'session_1',
      projectMeta: { selectedTrend },
      script: { content: 'private script data' },
      chat: [{ content: 'private chat data' }],
    });

    const response = await GET(request('session_1'));

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_1', 'user_1', 'org_1');
    await expect(response.json()).resolves.toEqual({ sessionId: 'session_1', selectedTrend });
  });

  it('returns null when a session has no selected trend', async () => {
    mocks.getSession.mockResolvedValue({ _id: 'session_1', projectMeta: {} });

    const response = await GET(request('session_1'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sessionId: 'session_1', selectedTrend: null });
  });
});
