import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  deleteScript: vi.fn(),
  getChatHistory: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  listChatThreads: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  deleteScript: mocks.deleteScript,
  getChatHistory: mocks.getChatHistory,
  getScript: mocks.getScript,
  getSession: mocks.getSession,
  listChatThreads: mocks.listChatThreads,
}));

async function loadRoutes() {
  const [chatList, chatThreads, currentScript, deleteScript] = await Promise.all([
    import('@/app/api/services/thinkforge/chat/list/route'),
    import('@/app/api/services/thinkforge/chat/threads/route'),
    import('@/app/api/services/thinkforge/script/current/route'),
    import('@/app/api/services/thinkforge/script/delete/route'),
  ]);

  return {
    chatList: chatList.GET,
    chatThreads: chatThreads.GET,
    currentScript: currentScript.POST,
    deleteScript: deleteScript.POST,
  };
}

async function callRoutes() {
  const routes = await loadRoutes();

  return Promise.all([
    routes.chatList(new Request(
      'http://localhost/api/services/thinkforge/chat/list?sessionId=session_requested&limit=25&threadId=thread_1',
    )),
    routes.chatThreads(new Request(
      'http://localhost/api/services/thinkforge/chat/threads?sessionId=session_requested',
    )),
    routes.currentScript(new Request(
      'http://localhost/api/services/thinkforge/script/current',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session_requested' }),
      },
    )),
    routes.deleteScript(new Request(
      'http://localhost/api/services/thinkforge/script/delete',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_requested',
          scriptId: 'script_2',
        }),
      },
    )),
  ]);
}

describe('ThinkForge session route authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
    });
    mocks.getChatHistory.mockResolvedValue([]);
    mocks.listChatThreads.mockResolvedValue([]);
    mocks.getScript.mockResolvedValue(null);
    mocks.deleteScript.mockResolvedValue(true);
  });

  it('rejects unauthenticated callers before accessing session data', async () => {
    mocks.auth.mockResolvedValue({ userId: null, orgId: null });

    const responses = await callRoutes();

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getChatHistory).not.toHaveBeenCalled();
    expect(mocks.listChatThreads).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.deleteScript).not.toHaveBeenCalled();
  });

  it('does not expose or delete data from a foreign session', async () => {
    mocks.getSession.mockResolvedValue(null);

    const responses = await callRoutes();

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(mocks.getSession).toHaveBeenCalledTimes(4);
    expect(mocks.getSession).toHaveBeenCalledWith('session_requested', 'user_1', 'org_1');
    expect(mocks.getChatHistory).not.toHaveBeenCalled();
    expect(mocks.listChatThreads).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.deleteScript).not.toHaveBeenCalled();
  });

  it('uses the authorized canonical session for an organization member', async () => {
    const responses = await callRoutes();

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(mocks.getSession).toHaveBeenCalledTimes(4);
    expect(mocks.getChatHistory).toHaveBeenCalledWith('session_canonical', 25, 'thread_1');
    expect(mocks.listChatThreads).toHaveBeenCalledWith('session_canonical');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical');
    expect(mocks.deleteScript).toHaveBeenCalledWith('session_canonical', 'script_2');
  });
});
