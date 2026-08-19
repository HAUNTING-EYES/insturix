import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getChatHistory: vi.fn(),
  getOrCreateSession: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  getUserPreferences: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  getChatHistory: mocks.getChatHistory,
  getOrCreateSession: mocks.getOrCreateSession,
  getScript: mocks.getScript,
  getSession: mocks.getSession,
  getUserPreferences: mocks.getUserPreferences,
}));

vi.mock('@/lib/editron/services/project-service', () => {
  throw new Error('Please define the GOOGLE_CLOUD_CREDENTIALS environment variable');
});

vi.mock('@/lib/shared/project-links', () => ({
  addProjectToLinkBySessionId: vi.fn(),
  createProjectLink: vi.fn(),
  findLinkBySessionId: vi.fn(),
}));

describe('ThinkForge optional project integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      userId: 'user_1',
      orgId: null,
      has: vi.fn(() => false),
    });
    mocks.getOrCreateSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'user_1',
      orgId: null,
      projectMeta: {},
      activeGeneration: null,
    });
    mocks.getScript.mockResolvedValue(null);
    mocks.getChatHistory.mockResolvedValue([]);
    mocks.getUserPreferences.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and hydrates a session when the optional Editron module cannot initialize', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { POST } = await import('@/app/api/services/thinkforge/session/route');

    const response = await POST(new Request('http://localhost/api/services/thinkforge/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectMeta: { title: 'Storage-independent session' } }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sessionId: 'session_canonical',
      script: null,
      chat: [],
    });
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'default');
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0]?.[0]).toMatch(
      /^\[ThinkForge\] Script-stage project creation failed \(non-blocking\): /,
    );
  });
});
