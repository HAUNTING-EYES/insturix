import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getSession: vi.fn(),
  getScript: vi.fn(),
  listScripts: vi.fn(),
  applyCommand: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getSession: mocks.getSession,
  getScript: mocks.getScript,
  listScripts: mocks.listScripts,
}));
vi.mock('@/lib/thinkforge/services/command-service', () => ({
  applyCommand: mocks.applyCommand,
}));

import { executeScriptOperation } from '@/lib/thinkforge/services/script-service';

const postContract = createThinkForgeWriterContract('social_post');
const storedPost = {
  _id: 'mongo_post_001',
  sessionId: 'session_001',
  scriptId: 'post_001',
  title: 'Launch Post',
  content: 'A concise launch post.',
  blocks: [],
  richText: undefined,
  metadata: {},
  documentType: 'social_post',
  contentContract: postContract,
  version: 2,
  createdAt: new Date('2026-07-16T00:00:00.000Z'),
  updatedAt: new Date('2026-07-16T01:00:00.000Z'),
};

describe('ThinkForge script contract adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_001' });
    mocks.getSession.mockResolvedValue({ _id: 'session_001', userId: 'user_001' });
    mocks.getScript.mockResolvedValue(storedPost);
    mocks.listScripts.mockResolvedValue([]);
    mocks.applyCommand.mockResolvedValue({ ok: true, script: storedPost });
  });

  it('forwards classification through unified save and update operations', async () => {
    const script = {
      title: storedPost.title,
      content: storedPost.content,
      blocks: [],
      documentType: storedPost.documentType,
      contentContract: storedPost.contentContract,
    };

    await executeScriptOperation({
      sessionId: storedPost.sessionId,
      scriptId: storedPost.scriptId,
      userId: 'user_001',
      action: 'save',
      baseVersion: 1,
      script,
    });
    await executeScriptOperation({
      sessionId: storedPost.sessionId,
      scriptId: storedPost.scriptId,
      userId: 'user_001',
      action: 'update',
      baseVersion: 2,
      script,
    });

    expect(mocks.applyCommand).toHaveBeenCalledTimes(2);
    for (const [request] of mocks.applyCommand.mock.calls) {
      expect(request.payload).toMatchObject({
        documentType: 'social_post',
        contentContract: postContract,
      });
    }
  });

  it('forwards and returns classification through the legacy save route', async () => {
    const { POST } = await import(
      '@/app/api/services/thinkforge/script/save/route'
    );
    const response = await POST(new Request('http://localhost/api/services/thinkforge/script/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: storedPost.sessionId,
        scriptId: storedPost.scriptId,
        baseVersion: 1,
        script: {
          title: storedPost.title,
          content: storedPost.content,
          blocks: [],
          documentType: 'social_post',
          contentContract: postContract,
        },
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.applyCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          documentType: 'social_post',
          contentContract: postContract,
        }),
      }),
      'user_001',
    );
    expect((await response.json()).script).toMatchObject({
      documentType: 'social_post',
      contentContract: postContract,
    });
  });

  it('returns classification from the dedicated get route', async () => {
    const { GET } = await import(
      '@/app/api/services/thinkforge/script/get/route'
    );
    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/script/get?sessionId=session_001&scriptId=post_001',
    ));

    expect(response.status).toBe(200);
    expect((await response.json()).script).toMatchObject({
      documentType: 'social_post',
      contentContract: postContract,
    });
  });

  it('represents empty block state honestly and returns stored classification', async () => {
    const { GET, POST } = await import(
      '@/app/api/services/thinkforge/script/blocks/route'
    );

    mocks.getScript.mockResolvedValueOnce(null);
    const emptyResponse = await GET(new Request(
      'http://localhost/api/services/thinkforge/script/blocks?sessionId=session_empty',
    ));
    expect(await emptyResponse.json()).toMatchObject({
      documentType: null,
      contentContract: null,
    });

    mocks.getScript.mockResolvedValueOnce(storedPost);
    const storedResponse = await GET(new Request(
      'http://localhost/api/services/thinkforge/script/blocks?sessionId=session_001&scriptId=post_001',
    ));
    expect(await storedResponse.json()).toMatchObject({
      documentType: 'social_post',
      contentContract: postContract,
    });

    const saveResponse = await POST(new Request(
      'http://localhost/api/services/thinkforge/script/blocks',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: storedPost.sessionId,
          scriptId: storedPost.scriptId,
          baseVersion: 2,
          blocks: [],
        }),
      },
    ));
    expect(await saveResponse.json()).toMatchObject({
      script: {
        documentType: 'social_post',
        contentContract: postContract,
      },
    });
  });

  it('does not expose script data from a session the authenticated user does not own', async () => {
    mocks.getSession.mockResolvedValue(null);

    const [{ GET: getScript }, { GET: getBlocks }, { GET: listScripts }] = await Promise.all([
      import('@/app/api/services/thinkforge/script/get/route'),
      import('@/app/api/services/thinkforge/script/blocks/route'),
      import('@/app/api/services/thinkforge/script/list/route'),
    ]);

    const responses = await Promise.all([
      getScript(new Request(
        'http://localhost/api/services/thinkforge/script/get?sessionId=session_other&scriptId=post_001',
      )),
      getBlocks(new Request(
        'http://localhost/api/services/thinkforge/script/blocks?sessionId=session_other&scriptId=post_001',
      )),
      listScripts(new Request(
        'http://localhost/api/services/thinkforge/script/list?sessionId=session_other',
      )),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.listScripts).not.toHaveBeenCalled();
  });
});
