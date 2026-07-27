import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: 'user-a' })),
  collection: vi.fn(),
  findOne: vi.fn(),
  getDatabase: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('nanoid', () => ({ nanoid: () => 'newchat' }));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { CHAT_SESSIONS: 'chatSessions' },
  getDatabase: mocks.getDatabase,
}));

import { ChatService } from '@/lib/editron/services/chat-service';
import { GET as getSessionHistory } from '@/app/api/services/editron/chat/sessions/[sessionId]/history/route';

const repoRoot = resolve(__dirname, '../..');

describe('Editron chat project isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collection.mockReturnValue({
      findOne: mocks.findOne,
      insertOne: mocks.insertOne,
      updateOne: mocks.updateOne,
    });
    mocks.getDatabase.mockResolvedValue({ collection: mocks.collection });
    mocks.insertOne.mockResolvedValue({ acknowledged: true });
    mocks.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  it('scopes history reads by session, user, and project', async () => {
    mocks.findOne.mockResolvedValue({
      sessionId: 'sess-shared',
      userId: 'user-a',
      projectId: 'project-b',
      messages: [{ role: 'user', content: 'project B only' }],
    });

    const service = new ChatService();
    const messages = await service.getSessionHistory('sess-shared', 'user-a', 'project-b');

    expect(mocks.findOne).toHaveBeenCalledWith({
      sessionId: 'sess-shared',
      userId: 'user-a',
      projectId: 'project-b',
    });
    expect(messages).toHaveLength(1);
  });

  it('does not reuse a stale session id from another project', async () => {
    mocks.findOne.mockResolvedValue(null);

    const service = new ChatService();
    const sessionId = await service.getOrCreateSession(
      'user-a',
      'project-b',
      'sess-from-project-a',
    );

    expect(mocks.findOne).toHaveBeenCalledWith({
      sessionId: 'sess-from-project-a',
      userId: 'user-a',
      projectId: 'project-b',
    });
    expect(sessionId).not.toBe('sess-from-project-a');
    expect(mocks.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        userId: 'user-a',
        projectId: 'project-b',
        messages: [],
      }),
    );
  });

  it('rejects a write when the session does not belong to the project', async () => {
    mocks.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const service = new ChatService();
    await expect(
      service.saveMessage('sess-shared', 'user-a', 'project-b', {
        role: 'user',
        content: 'must not cross projects',
      }),
    ).rejects.toThrow('Chat session is not accessible for this project');

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { sessionId: 'sess-shared', userId: 'user-a', projectId: 'project-b' },
      expect.any(Object),
    );
  });

  it('requires projectId and scopes the authenticated history route', async () => {
    const missingProjectResponse = await getSessionHistory(
      new NextRequest(
        'http://localhost/api/services/editron/chat/sessions/sess-shared/history',
      ),
      { params: Promise.resolve({ sessionId: 'sess-shared' }) },
    );

    expect(missingProjectResponse.status).toBe(400);
    expect(mocks.findOne).not.toHaveBeenCalled();

    mocks.findOne.mockResolvedValue({ messages: [] });

    const response = await getSessionHistory(
      new NextRequest(
        'http://localhost/api/services/editron/chat/sessions/sess-shared/history?projectId=project-b',
      ),
      { params: Promise.resolve({ sessionId: 'sess-shared' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.findOne).toHaveBeenCalledWith({
      sessionId: 'sess-shared',
      userId: 'user-a',
      projectId: 'project-b',
    });
  });

  it('keeps project identity in EditorContext instead of the trailing /v2 path segment', () => {
    const panel = readFileSync(
      resolve(
        repoRoot,
        'components/editron/editor/version-7.0.0/components/ai-chat/ai-chat-panel.tsx',
      ),
      'utf8',
    );

    expect(panel).toContain('projectId: editorProjectId');
    expect(panel).toContain("'/history?projectId='");
    expect(panel).not.toContain("window.location.pathname.split('/').pop()");
  });
});