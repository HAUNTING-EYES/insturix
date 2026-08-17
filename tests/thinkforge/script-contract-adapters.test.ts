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
const carouselContract = createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 });
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
const storedCarousel = {
  ...storedPost,
  _id: 'mongo_carousel_001',
  scriptId: 'carousel_001',
  title: 'Launch Carousel',
  content: 'A five-slide launch carousel.',
  documentType: 'carousel',
  contentContract: carouselContract,
};

describe('ThinkForge script contract adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_001', orgId: 'org_001' });
    mocks.getSession.mockResolvedValue({ _id: 'session_001', userId: 'user_001', orgId: 'org_001' });
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
      orgId: 'org_001',
      action: 'save',
      baseVersion: 1,
      script,
    });
    await executeScriptOperation({
      sessionId: storedPost.sessionId,
      scriptId: storedPost.scriptId,
      userId: 'user_001',
      action: 'update',
      orgId: 'org_001',
      baseVersion: 2,
      script,
    });

    expect(mocks.applyCommand).toHaveBeenCalledTimes(2);
    for (const [request] of mocks.applyCommand.mock.calls) {
      expect(request.payload).toMatchObject({
        scriptId: 'post_001',
        documentType: 'social_post',
        contentContract: postContract,
      });
    }
    expect(mocks.applyCommand).toHaveBeenNthCalledWith(
      1, expect.any(Object), 'user_001', 'org_001',
    );
    expect(mocks.applyCommand).toHaveBeenNthCalledWith(
      2, expect.any(Object), 'user_001', 'org_001',
    );
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
      'org_001',
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
      'http://localhost/api/services/thinkforge/script/blocks?sessionId=session_empty&scriptId=default',
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
    expect(mocks.applyCommand).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session_001' }),
      'user_001',
      'org_001',
    );
  });

  it('rejects missing script identity before any database access', async () => {
    const [{ GET: getScript }, { GET: getBlocks, POST: saveBlocks }, { POST: saveScript }] = await Promise.all([
      import('@/app/api/services/thinkforge/script/get/route'),
      import('@/app/api/services/thinkforge/script/blocks/route'),
      import('@/app/api/services/thinkforge/script/save/route'),
    ]);

    const responses = await Promise.all([
      getScript(new Request(
        'http://localhost/api/services/thinkforge/script/get?sessionId=session_001',
      )),
      getBlocks(new Request(
        'http://localhost/api/services/thinkforge/script/blocks?sessionId=session_001',
      )),
      saveBlocks(new Request('http://localhost/api/services/thinkforge/script/blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session_001', blocks: [] }),
      })),
      saveScript(new Request('http://localhost/api/services/thinkforge/script/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session_001', script: { blocks: [] } }),
      })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
    await Promise.all(responses.map(async (response) => {
      await expect(response.json()).resolves.toMatchObject({ error: 'Missing scriptId' });
    }));
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.applyCommand).not.toHaveBeenCalled();
  });

  it('rejects invalid rich text atomically before database access', async () => {
    const [{ POST: saveBlocks }, { POST: saveScript }] = await Promise.all([
      import('@/app/api/services/thinkforge/script/blocks/route'),
      import('@/app/api/services/thinkforge/script/save/route'),
    ]);
    const invalidRichText = { type: 'not-a-tiptap-document' };

    const responses = await Promise.all([
      saveBlocks(new Request('http://localhost/api/services/thinkforge/script/blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_001',
          scriptId: 'post_001',
          baseVersion: 2,
          blocks: [],
          richText: invalidRichText,
        }),
      })),
      saveScript(new Request('http://localhost/api/services/thinkforge/script/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_001',
          scriptId: 'post_001',
          baseVersion: 2,
          script: { blocks: [], richText: invalidRichText },
        }),
      })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400]);
    await Promise.all(responses.map(async (response) => {
      await expect(response.json()).resolves.toMatchObject({ error: 'Invalid richText' });
    }));
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.applyCommand).not.toHaveBeenCalled();
  });

  it('rejects document mutations without the client-observed base version', async () => {
    const [{ POST: unifiedScript }, { POST: saveBlocks }, { POST: saveScript }] = await Promise.all([
      import('@/app/api/services/thinkforge/script/route'),
      import('@/app/api/services/thinkforge/script/blocks/route'),
      import('@/app/api/services/thinkforge/script/save/route'),
    ]);
    const requests = [
      unifiedScript(new Request('http://localhost/api/services/thinkforge/script', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_001',
          scriptId: 'post_001',
          action: 'save',
          script: { content: 'Unsafe write.' },
        }),
      })),
      saveBlocks(new Request('http://localhost/api/services/thinkforge/script/blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session_001', scriptId: 'post_001', blocks: [] }),
      })),
      saveScript(new Request('http://localhost/api/services/thinkforge/script/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session_001', scriptId: 'post_001', script: { content: 'Unsafe write.' } }),
      })),
    ];

    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.applyCommand).not.toHaveBeenCalled();
  });

  it('does not invent empty blocks or content for a rich-text-only save', async () => {
    const richText = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Canonical rich text' }] }],
    };
    mocks.getScript.mockResolvedValue(storedPost);
    mocks.applyCommand.mockResolvedValue({ ok: true, script: storedPost });
    const [{ POST: saveBlocks }, { POST: saveScript }] = await Promise.all([
      import('@/app/api/services/thinkforge/script/blocks/route'),
      import('@/app/api/services/thinkforge/script/save/route'),
    ]);

    const responses = await Promise.all([
      saveBlocks(new Request('http://localhost/api/services/thinkforge/script/blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_001',
          scriptId: 'post_001',
          baseVersion: 2,
          richText,
        }),
      })),
      saveScript(new Request('http://localhost/api/services/thinkforge/script/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_001',
          scriptId: 'post_001',
          baseVersion: 2,
          script: { richText },
        }),
      })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const calls = mocks.applyCommand.mock.calls.slice(-2);
    for (const [request] of calls) {
      expect(request.payload).toMatchObject({ scriptId: 'post_001', richText });
      expect(request.payload).not.toHaveProperty('blocks');
      expect(request.payload).not.toHaveProperty('content');
    }
  });

  it('preserves carousel classification through exact reads and both save adapters', async () => {
    mocks.getScript.mockResolvedValue(storedCarousel);
    mocks.applyCommand.mockResolvedValue({ ok: true, script: storedCarousel });
    const [{ GET: getScript }, { POST: saveBlocks }, { POST: saveScript }] = await Promise.all([
      import('@/app/api/services/thinkforge/script/get/route'),
      import('@/app/api/services/thinkforge/script/blocks/route'),
      import('@/app/api/services/thinkforge/script/save/route'),
    ]);

    const getResponse = await getScript(new Request(
      'http://localhost/api/services/thinkforge/script/get?sessionId=session_001&scriptId=carousel_001',
    ));
    const blocksResponse = await saveBlocks(new Request(
      'http://localhost/api/services/thinkforge/script/blocks',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_001',
          scriptId: 'carousel_001',
          baseVersion: 2,
          blocks: [],
        }),
      },
    ));
    const saveResponse = await saveScript(new Request(
      'http://localhost/api/services/thinkforge/script/save',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_001',
          scriptId: 'carousel_001',
          baseVersion: 2,
          script: {
            title: storedCarousel.title,
            content: storedCarousel.content,
            blocks: [],
            documentType: 'carousel',
            contentContract: carouselContract,
          },
        }),
      },
    ));

    expect([getResponse.status, blocksResponse.status, saveResponse.status]).toEqual([200, 200, 200]);
    for (const response of [getResponse, blocksResponse, saveResponse]) {
      const body = await response.json();
      expect(body.script ?? body).toMatchObject({
        documentType: 'carousel',
        contentContract: carouselContract,
      });
    }
    expect(mocks.getScript).toHaveBeenCalledWith('session_001', 'carousel_001');
    expect(mocks.applyCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session_001',
        payload: expect.objectContaining({
          scriptId: 'carousel_001',
          documentType: 'carousel',
          contentContract: carouselContract,
        }),
      }),
      'user_001',
      'org_001',
    );
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

  it('rejects foreign unified and legacy operations before script access', async () => {
    mocks.getSession.mockResolvedValue(null);
    const [{ POST: unifiedScript }, { POST: saveScript }] = await Promise.all([
      import('@/app/api/services/thinkforge/script/route'),
      import('@/app/api/services/thinkforge/script/save/route'),
    ]);

    const responses = await Promise.all([
      unifiedScript(new Request('http://localhost/api/services/thinkforge/script', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_foreign',
          scriptId: 'post_001',
          action: 'get',
        }),
      })),
      saveScript(new Request('http://localhost/api/services/thinkforge/script/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_foreign',
          scriptId: 'post_001',
          baseVersion: 2,
          script: { title: 'Blocked save', content: 'Must not persist.', blocks: [] },
        }),
      })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.applyCommand).not.toHaveBeenCalled();
  });

  it('rejects missing, blank, and padded unified document identities before authorization', async () => {
    const { POST: unifiedScript } = await import('@/app/api/services/thinkforge/script/route');
    const bodies = [
      { sessionId: 'session_001', action: 'get' },
      { sessionId: 'session_001', scriptId: '   ', action: 'get' },
      { sessionId: 'session_001', scriptId: ' post_001 ', action: 'get' },
    ];

    const responses = await Promise.all(bodies.map((body) => unifiedScript(new Request(
      'http://localhost/api/services/thinkforge/script',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    ))));

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.applyCommand).not.toHaveBeenCalled();
  });

  it('rejects a non-exact service document identity before session access', async () => {
    await expect(executeScriptOperation({
      sessionId: 'session_001',
      scriptId: ' post_001 ',
      userId: 'user_001',
      orgId: 'org_001',
      action: 'get',
    })).rejects.toThrow('Document identity is invalid');

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.applyCommand).not.toHaveBeenCalled();
  });

  it('uses the canonical session for organization unified and legacy operations', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_001',
    });
    const [{ POST: unifiedScript }, { POST: saveScript }] = await Promise.all([
      import('@/app/api/services/thinkforge/script/route'),
      import('@/app/api/services/thinkforge/script/save/route'),
    ]);

    const getResponse = await unifiedScript(new Request(
      'http://localhost/api/services/thinkforge/script',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session_alias', scriptId: 'post_001', action: 'get' }),
      },
    ));
    const saveResponse = await saveScript(new Request(
      'http://localhost/api/services/thinkforge/script/save',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_alias',
          scriptId: 'post_001',
          baseVersion: 2,
          script: { title: 'Organization save', content: 'Authorized.', blocks: [] },
        }),
      },
    ));

    expect([getResponse.status, saveResponse.status]).toEqual([200, 200]);
    expect(mocks.getSession).toHaveBeenCalledWith(
      'session_alias', 'user_001', 'org_001',
    );
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'post_001');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'post_001');
    expect(mocks.applyCommand).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session_canonical' }),
      'user_001',
      'org_001',
    );
  });
});
