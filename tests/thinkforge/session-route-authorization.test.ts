import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkCredits: vi.fn(),
  authorizeBrandScope: vi.fn(),
  createIdeasAgent: vi.fn(),
  deductCredits: vi.fn(),
  deleteScript: vi.fn(),
  getChatHistory: vi.fn(),
  getOrCreateSession: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  getUserPreferences: vi.fn(),
  fetchContextSources: vi.fn(),
  formatSystemBrief: vi.fn(),
  ensureMigrated: vi.fn(),
  isOrgWalletBillingEnabled: vi.fn(),
  listAuthorizedBrandScopes: vi.fn(),
  listChatThreads: vi.fn(),
  refundCredits: vi.fn(),
  reviseDocument: vi.fn(),
  resolveContextBillingOwner: vi.fn(),
  saveScriptWithVersion: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth, clerkClient: vi.fn() }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  deleteScript: mocks.deleteScript,
  getChatHistory: mocks.getChatHistory,
  getOrCreateSession: mocks.getOrCreateSession,
  getScript: mocks.getScript,
  getSession: mocks.getSession,
  getUserPreferences: mocks.getUserPreferences,
  listChatThreads: mocks.listChatThreads,
  saveScriptWithVersion: mocks.saveScriptWithVersion,
}));
vi.mock('@/lib/services/creditsMiddleware', () => ({
  checkCredits: mocks.checkCredits,
}));
vi.mock('@/lib/services/creditsMigrationService', () => ({
  CreditsMigrationService: { ensureMigrated: mocks.ensureMigrated },
}));
vi.mock('@/lib/thinkforge/agents/ideas-agent', () => ({
  createIdeasAgent: mocks.createIdeasAgent,
}));
vi.mock('@/lib/thinkforge/context', () => ({
  fetchContextSources: mocks.fetchContextSources,
  formatSystemBrief: mocks.formatSystemBrief,
}));
vi.mock('@/lib/editron/services/project-ownership', () => ({
  resolveContextBillingOwner: mocks.resolveContextBillingOwner,
}));
vi.mock('@/lib/services/org-wallet-flag', () => ({
  isOrgWalletBillingEnabled: mocks.isOrgWalletBillingEnabled,
}));
vi.mock('@/lib/thinkforge/services/flat-writer-edit', () => ({
  reviseDocumentViaFlatWriter: mocks.reviseDocument,
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { createScriptStageProject: vi.fn() },
}));
vi.mock('@/lib/shared/project-links', () => ({
  addProjectToLinkBySessionId: vi.fn(),
  createProjectLink: vi.fn(),
  findLinkBySessionId: vi.fn(),
}));
vi.mock('@/lib/shared/brand-scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/shared/brand-scope')>();
  return {
    ...actual,
    authorizeBrandScope: mocks.authorizeBrandScope,
    listAuthorizedBrandScopes: mocks.listAuthorizedBrandScopes,
  };
});

import { applyCommand } from '@/lib/thinkforge/services/command-service';

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

async function callAiEditRoutes() {
  const [{ POST: editDocument }, { POST: editBlocks }] = await Promise.all([
    import('@/app/api/services/thinkforge/script/edit/route'),
    import('@/app/api/services/thinkforge/script/edit-blocks/route'),
  ]);
  const body = {
    instruction: 'Make this clearer.',
    sessionId: 'session_requested',
    scriptId: 'script_2',
    script: {
      title: 'Draft',
      content: 'This is a sufficiently long existing document for an AI edit.',
      blocks: [{ id: 'block_1', kind: 'paragraph', content: [] }],
      version: 1,
    },
  };

  return Promise.all([
    editDocument(new Request('http://localhost/api/services/thinkforge/script/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })),
    editBlocks(new Request('http://localhost/api/services/thinkforge/script/edit-blocks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })),
  ]);
}

async function callSessionHydrate(body: Record<string, unknown> = {
  sessionId: 'session_requested',
  scriptId: 'script_2',
}) {
  // This route is dynamically imported because its reads begin immediately.
  // Resetting the route module keeps its mocked collaborators local to this spec
  // when the full ThinkForge suite runs files in parallel.
  vi.resetModules();
  const { POST } = await import('@/app/api/services/thinkforge/session/route');
  return POST(new Request('http://localhost/api/services/thinkforge/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

async function callIdeas(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/services/thinkforge/ideas/route');
  return POST(new Request('http://localhost/api/services/thinkforge/ideas', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('ThinkForge session route authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', has: vi.fn(() => false) });
    mocks.authorizeBrandScope.mockResolvedValue({
      brandId: 'brand_allowed',
      brandName: 'Allowed Brand',
      recordId: 'record_allowed',
    });
    mocks.listAuthorizedBrandScopes.mockResolvedValue([{
      brandId: 'brand_allowed',
      brandName: 'Allowed Brand',
      recordId: 'record_allowed',
    }]);
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
    });
    mocks.getChatHistory.mockResolvedValue([]);
    mocks.getOrCreateSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {},
      activeGeneration: null,
    });
    mocks.listChatThreads.mockResolvedValue([]);
    mocks.getScript.mockResolvedValue(null);
    mocks.getUserPreferences.mockResolvedValue({ tone: 'direct' });
    mocks.deleteScript.mockResolvedValue(true);
    mocks.checkCredits.mockResolvedValue({
      allowed: true,
      deduct: mocks.deductCredits,
      refund: mocks.refundCredits,
    });
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.fetchContextSources.mockResolvedValue({});
    mocks.formatSystemBrief.mockReturnValue('Resolved brand context');
    mocks.isOrgWalletBillingEnabled.mockReturnValue(false);
    mocks.resolveContextBillingOwner.mockReturnValue({ type: 'personal', userId: 'user_1' });
    mocks.createIdeasAgent.mockReturnValue({
      generateIdeas: vi.fn().mockResolvedValue([{
        idea: 'A grounded idea',
        purpose: 'A useful purpose',
        style: 'Direct',
        format: 'LinkedIn post',
        platform: 'linkedin',
        tone: 'blue',
      }]),
    });
    mocks.reviseDocument.mockResolvedValue({
      title: 'Draft',
      content: 'This is the revised document content.',
      blocks: [{ id: 'block_1', kind: 'paragraph', content: [] }],
    });
    mocks.saveScriptWithVersion.mockImplementation(
      async (sessionId, script, _baseVersion, scriptId) => ({
        ok: true,
        script: {
          ...script,
          _id: 'mongo_script_1',
          sessionId,
          scriptId,
          version: 1,
          createdAt: new Date('2026-07-16T00:00:00.000Z'),
          updatedAt: new Date('2026-07-16T00:00:00.000Z'),
        },
      }),
    );
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

  it('loads script, chat, and preferences concurrently after canonical session resolution', async () => {
    let releaseScript!: (value: null) => void;
    const pendingScript = new Promise<null>((resolve) => {
      releaseScript = resolve;
    });
    mocks.getScript.mockReturnValueOnce(pendingScript);

    const responsePromise = callSessionHydrate();
    await vi.waitFor(() => expect(mocks.getScript).toHaveBeenCalledOnce());

    const allReadsStartedBeforeScriptCompleted =
      mocks.getChatHistory.mock.calls.length === 1 &&
      mocks.getUserPreferences.mock.calls.length === 1;
    releaseScript(null);

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(response.headers.get('server-timing')).toMatch(
      /^tf-session-state;dur=\d+\.\d, tf-session-total;dur=\d+\.\d$/,
    );
    expect(allReadsStartedBeforeScriptCompleted).toBe(true);
    expect(mocks.getOrCreateSession).toHaveBeenCalledWith(
      'user_1',
      'session_requested',
      undefined,
      'org_1',
      undefined,
    );
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_2');
    expect(mocks.getChatHistory).toHaveBeenCalledWith('session_canonical', 50, 'default');
    expect(mocks.getUserPreferences).toHaveBeenCalledWith('user_1');
  });

  it('authorizes and normalizes the brand binding before creating a session', async () => {
    const response = await callSessionHydrate({
      sessionId: 'session_requested',
      scriptId: 'script_2',
      projectMeta: { brandId: ' brand_allowed ' },
    });

    expect(response.status).toBe(200);
    expect(mocks.authorizeBrandScope).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_1',
      isOrgAdmin: false,
      brandId: 'brand_allowed',
    });
    expect(mocks.getOrCreateSession).toHaveBeenCalledWith(
      'user_1',
      'session_requested',
      { brandId: 'brand_allowed' },
      'org_1',
      undefined,
    );
  });

  it('rejects an attempt to change a session brand binding', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_original' },
    });

    const response = await callSessionHydrate({
      sessionId: 'session_requested',
      projectMeta: { brandId: 'brand_replacement' },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'brand_binding_immutable' });
    expect(mocks.authorizeBrandScope).not.toHaveBeenCalled();
    expect(mocks.getOrCreateSession).not.toHaveBeenCalled();
  });

  it('denies a requested brand that is absent from the caller\'s authorized Vault scope', async () => {
    const actual = await vi.importActual<typeof import('@/lib/shared/brand-scope')>('@/lib/shared/brand-scope');
    const listAcceptedBrands = vi.fn().mockResolvedValue([]);

    await expect(actual.authorizeBrandScope({
      userId: 'user_1',
      orgId: 'org_1',
      brandId: 'brand_restricted',
      store: { listAcceptedBrands },
    })).rejects.toMatchObject({ code: 'brand_not_found' });

    expect(listAcceptedBrands).toHaveBeenCalledWith({
      orgId: 'org_1',
      userId: 'user_1',
      isOrgAdmin: false,
    });
  });

  it('uses only the authorized selected Vault brand when generating ideas', async () => {
    const response = await callIdeas({
      prompt: 'Create a post for my brand about product adoption.',
      brandId: 'brand_allowed',
      brandBrief: 'Stale browser scan: make every idea about the old founder interview.',
    });

    if (!response) throw new Error('Ideas route did not return a response');
    expect(response.status).toBe(200);
    expect(mocks.listAuthorizedBrandScopes).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_1',
      isOrgAdmin: false,
    });
    expect(mocks.fetchContextSources).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      orgId: 'org_1',
      brandId: 'brand_allowed',
    }));
    const body = await response.json();
    expect(body.grounding).toMatchObject({
      brandId: 'brand_allowed',
      brandName: 'Allowed Brand',
    });
    expect(body.ideas[0]).toMatchObject({ brandId: 'brand_allowed' });
    expect(body.ideas[0].brandBrief).toBeUndefined();
    const ideasAgent = mocks.createIdeasAgent.mock.results[0]?.value;
    expect(ideasAgent.generateIdeas).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ systemBrief: '## Active Brand Scope\nBrand: Allowed Brand\nOnly use this brand identity for brand-specific ideas.\n\nResolved brand context' }),
    );
  });

  it('rejects foreign-session AI edits before credits or model work', async () => {
    mocks.getSession.mockResolvedValue(null);

    const responses = await callAiEditRoutes();

    expect(responses.map((response) => response?.status)).toEqual([404, 404]);
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.reviseDocument).not.toHaveBeenCalled();
  });

  it('routes organization-member AI edits through the canonical session', async () => {
    const responses = await callAiEditRoutes();

    expect(responses.map((response) => response?.status)).toEqual([200, 200]);
    expect(mocks.deductCredits).toHaveBeenCalledOnce();
    expect(mocks.reviseDocument).toHaveBeenCalledTimes(2);
    expect(mocks.reviseDocument).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_canonical',
    }));
  });

  it('keeps organization authorization and canonical identity at the command boundary', async () => {
    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: 'session_requested',
      baseVersion: 0,
      source: 'user',
      payload: {
        scriptId: 'script_2',
        title: 'Draft',
        content: 'Authorized content',
        blocks: [],
      },
    }, 'user_1', 'org_1');

    expect(result.ok).toBe(true);
    expect(mocks.getSession).toHaveBeenCalledWith('session_requested', 'user_1', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_2');
    expect(mocks.saveScriptWithVersion).toHaveBeenCalledWith(
      'session_canonical',
      expect.any(Object),
      0,
      'script_2',
    );
  });
});
