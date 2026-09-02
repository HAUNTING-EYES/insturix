import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getUserSessions: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getUserSessions: mocks.getUserSessions,
}));

import { GET } from '@/app/api/services/thinkforge/sessions/metadata/route';

function request(): Request {
  return new Request('http://localhost/api/services/thinkforge/sessions/metadata?limit=50&offset=0');
}

describe('ThinkForge session metadata authority', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.getUserSessions.mockReset();
    mocks.getUserSessions.mockResolvedValue([]);
  });

  it('lists sessions within the active organization scope', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.getUserSessions).toHaveBeenCalledWith('user_1', 'org_1');
  });

  it('lists only personal sessions when no organization is active', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.getUserSessions).toHaveBeenCalledWith('user_1', null);
  });

  it('does not query sessions for an unauthenticated request', async () => {
    mocks.auth.mockResolvedValue({ userId: null, orgId: null });

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.getUserSessions).not.toHaveBeenCalled();
  });
});
