import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkCredits: vi.fn(),
  claimInitialDraftIntent: vi.fn(),
  clerkClient: vi.fn(),
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
  resolveThinkForgeAuthoringContext: vi.fn(),
  ensureMigrated: vi.fn(),
  isOrgWalletBillingEnabled: vi.fn(),
  listAuthorizedBrandScopes: vi.fn(),
  listChatThreads: vi.fn(),
  refundCredits: vi.fn(),
  reviseDocument: vi.fn(),
  resolveContextBillingOwner: vi.fn(),
  saveScriptWithVersion: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth, clerkClient: mocks.clerkClient }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  claimInitialDraftIntent: mocks.claimInitialDraftIntent,
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
  resolveThinkForgeAuthoringContext: mocks.resolveThinkForgeAuthoringContext,
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
        body: JSON.stringify({ sessionId: 'session_requested', scriptId: 'default' }),
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

async function callSessionMetadataUpdate(body: Record<string, unknown>) {
  vi.resetModules();
  const { POST } = await import('@/app/api/services/thinkforge/session/update/route');
  return POST(new Request('http://localhost/api/services/thinkforge/session/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

async function callSessionSummary(scriptId?: string) {
  const { GET } = await import('@/app/api/services/thinkforge/sessions/[id]/route');
  const query = scriptId === undefined ? '' : `?scriptId=${encodeURIComponent(scriptId)}`;
  return GET(
    new Request(`http://localhost/api/services/thinkforge/sessions/session_requested${query}`),
    { params: Promise.resolve({ id: 'session_requested' }) },
  );
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
    mocks.clerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({
          firstName: 'Session',
          lastName: 'Owner',
          username: 'session-owner',
          emailAddresses: [],
        }),
      },
    });
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
    mocks.claimInitialDraftIntent.mockResolvedValue(true);
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.fetchContextSources.mockResolvedValue({});
    mocks.formatSystemBrief.mockReturnValue('Resolved brand context');
    mocks.resolveThinkForgeAuthoringContext.mockResolvedValue({
      systemBrief: 'Resolved brand context',
      snapshot: {
        version: 1,
        resolvedAt: '2026-08-11T00:00:00.000Z',
        scope: { kind: 'organization', brandId: 'brand_allowed' },
        brand: {
          brandId: 'brand_allowed',
          recordId: 'record_allowed',
          profileUpdatedAt: '2026-08-11T00:00:00.000Z',
          profileFingerprint: 'a'.repeat(64),
        },
        retrieval: {
          projectFactIds: [],
          globalFactIds: [],
          interactionPatternTypes: [],
        },
        writingKnowledgeVersion: null,
      },
    });
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
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'default');
    expect(mocks.deleteScript).toHaveBeenCalledWith('session_canonical', 'script_2');
  });

  it('requires an explicit non-empty document identity for current-script reads', async () => {
    const routes = await loadRoutes();
    const response = await routes.currentScript(new Request(
      'http://localhost/api/services/thinkforge/script/current',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session_requested', scriptId: '   ' }),
      },
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing scriptId' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
  });

  it('returns the canonical document identity and persisted content contract', async () => {
    const contract = createThinkForgeWriterContract('social_post');
    mocks.getScript.mockResolvedValueOnce({
      sessionId: 'session_canonical',
      scriptId: 'post_2',
      title: 'Launch post',
      content: 'A launch post.',
      blocks: [],
      metadata: {},
      version: 3,
      documentType: 'social_post',
      contentContract: contract,
    });
    const routes = await loadRoutes();
    const response = await routes.currentScript(new Request(
      'http://localhost/api/services/thinkforge/script/current',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session_requested', scriptId: 'post_2' }),
      },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      script: {
        sessionId: 'session_canonical',
        scriptId: 'post_2',
        documentType: 'social_post',
        contentContract: contract,
      },
    });
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'post_2');
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

  it('claims the initial draft on the authorized canonical session only', async () => {
    const response = await callSessionHydrate({
      sessionId: 'session_requested',
      claimInitialDraft: true,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionId: 'session_canonical',
      initialDraftClaimed: true,
    });
    expect(mocks.claimInitialDraftIntent).toHaveBeenCalledWith('session_canonical');
    expect(mocks.getOrCreateSession).not.toHaveBeenCalled();
  });

  it('requires an exact document identity when reopening an existing session', async () => {
    const missingResponse = await callSessionHydrate({ sessionId: 'session_requested' });
    const coercedResponse = await callSessionHydrate({ sessionId: 'session_requested', scriptId: 42 });

    expect(missingResponse.status).toBe(400);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'Missing scriptId' });
    expect(coercedResponse.status).toBe(400);
    await expect(coercedResponse.json()).resolves.toEqual({ error: 'Invalid scriptId' });
    expect(mocks.getScript).not.toHaveBeenCalled();
  });

  it('assigns the server-owned default identity only when creating a new session', async () => {
    const response = await callSessionHydrate({ projectMeta: { title: 'New session' } });

    expect(response.status).toBe(200);
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'default');
  });

  it('requires exact document identity and canonical organization scope for session summaries', async () => {
    const missingResponse = await callSessionSummary();
    expect(missingResponse.status).toBe(400);
    expect(mocks.getSession).not.toHaveBeenCalled();

    const response = await callSessionSummary('script_2');
    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_requested', 'user_1', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_2');
    expect(mocks.getChatHistory).toHaveBeenCalledWith('session_canonical', 1);
  });

  it('authorizes and stamps a server-owned binding before creating a session', async () => {
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
      expect.objectContaining({
        brandId: 'brand_allowed',
        brandBinding: expect.objectContaining({
          version: 2,
          brandId: 'brand_allowed',
          scope: 'organization',
          orgId: 'org_1',
        }),
      }),
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
      scriptId: 'script_2',
      projectMeta: { brandId: 'brand_replacement' },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'brand_binding_immutable' });
    expect(mocks.authorizeBrandScope).not.toHaveBeenCalled();
    expect(mocks.getOrCreateSession).not.toHaveBeenCalled();
  });

  it('issues a server-owned binding when a selected brand creates a session', async () => {
    const response = await callSessionHydrate({
      projectMeta: {
        brandId: 'brand_allowed',
        brandBinding: {
          version: 1,
          brandId: 'forged_brand',
          scope: 'personal',
          boundAt: '2000-01-01T00:00:00.000Z',
        },
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.getOrCreateSession).toHaveBeenCalledWith(
      'user_1',
      undefined,
      expect.objectContaining({
        brandId: 'brand_allowed',
        brandBinding: expect.objectContaining({
          version: 2,
          brandId: 'brand_allowed',
          scope: 'organization',
          orgId: 'org_1',
        }),
      }),
      'org_1',
      'Session Owner',
    );
  });

  it('backfills a server-owned binding for a legacy session on rehydration', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_allowed' },
    });

    const response = await callSessionHydrate();

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
      expect.objectContaining({
        brandId: 'brand_allowed',
        brandBinding: expect.objectContaining({
          version: 2,
          brandId: 'brand_allowed',
          scope: 'organization',
          orgId: 'org_1',
        }),
      }),
      'org_1',
      undefined,
    );
  });

  it('does not create an unknown session ID during hydration', async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await callSessionHydrate({ sessionId: 'session_foreign' });

    expect(response.status).toBe(404);
    expect(mocks.getOrCreateSession).not.toHaveBeenCalled();
  });

  it('denies a metadata update for a session outside the active organization', async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await callSessionMetadataUpdate({
      sessionId: 'session_foreign',
      projectMeta: { title: 'Attempted overwrite' },
    });

    expect(response.status).toBe(404);
    expect(mocks.getOrCreateSession).not.toHaveBeenCalled();
  });

  it('preserves the server binding and ignores a forged browser binding on metadata update', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {
        brandId: 'brand_allowed',
        brandBinding: expect.objectContaining({
          version: 2,
          brandId: 'brand_allowed',
          scope: 'organization',
          orgId: 'org_1',
        }),
      },
    });

    const response = await callSessionMetadataUpdate({
      sessionId: 'session_requested',
      projectMeta: {
        title: 'Safe metadata change',
        brandBinding: {
          version: 1,
          brandId: 'brand_forged',
          scope: 'personal',
          boundAt: '2000-01-01T00:00:00.000Z',
        },
      },
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
      'session_canonical',
      expect.objectContaining({
        title: 'Safe metadata change',
        brandId: 'brand_allowed',
        brandBinding: expect.objectContaining({
          version: 2,
          brandId: 'brand_allowed',
          scope: 'organization',
          orgId: 'org_1',
        }),
      }),
      'org_1',
    );
  });

  it('rejects a V2 binding issued for a different organization', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {
        brandId: 'brand_allowed',
        brandBinding: {
          version: 2,
          brandId: 'brand_allowed',
          scope: 'organization',
          orgId: 'org_other',
          boundAt: '2026-08-01T00:00:00.000Z',
        },
      },
    });

    const response = await callSessionMetadataUpdate({
      sessionId: 'session_requested',
      projectMeta: { title: 'Must not persist' },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'brand_binding_scope_mismatch' });
    expect(mocks.authorizeBrandScope).not.toHaveBeenCalled();
    expect(mocks.getOrCreateSession).not.toHaveBeenCalled();
  });

  it('denies a requested brand that is absent from the caller\'s authorized Vault scope', async () => {
    const actual = await vi.importActual<typeof import('@/lib/shared/brand-scope')>('@/lib/shared/brand-scope');
    const getLatestAcceptedRecord = vi.fn().mockResolvedValue(null);

    await expect(actual.authorizeBrandScope({
      userId: 'user_1',
      orgId: 'org_1',
      brandId: 'brand_restricted',
      store: { getLatestAcceptedRecord },
    })).rejects.toMatchObject({ code: 'brand_not_found' });

    expect(getLatestAcceptedRecord).toHaveBeenCalledWith({
      brandId: 'brand_restricted',
      userId: 'user_1',
      orgId: 'org_1',
    });
  });

  it('uses only the authorized selected Vault brand when generating ideas', async () => {
    const authoringRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' },
      postControls: createDefaultThinkForgePostControls(),
    });
    const response = await callIdeas({
      prompt: 'Create a post for my brand about product adoption.',
      brandId: 'brand_allowed',
      brandBrief: 'Stale browser scan: make every idea about the old founder interview.',
      authoringRequest,
    });

    if (!response) throw new Error('Ideas route did not return a response');
    expect(response.status).toBe(200);
    expect(mocks.listAuthorizedBrandScopes).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_1',
      isOrgAdmin: false,
    });
    expect(mocks.resolveThinkForgeAuthoringContext).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      orgId: 'org_1',
      providedProject: { brandId: 'brand_allowed', authoringRequest },
    }));
    const body = await response.json();
    expect(body.grounding).toMatchObject({
      brandId: 'brand_allowed',
      brandName: 'Allowed Brand',
    });
    expect(body.ideas[0]).toMatchObject({ brandId: 'brand_allowed' });
    expect(body.ideas[0].brandBrief).toBeUndefined();
    expect(body.generation.authoringRequest).toEqual(authoringRequest);
    expect(body.generation.authoringContextSnapshot).toMatchObject({
      brand: { brandId: 'brand_allowed', recordId: 'record_allowed' },
    });
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
    mocks.getScript.mockResolvedValue({
      _id: 'mongo_script_2',
      sessionId: 'session_canonical',
      scriptId: 'script_2',
      title: 'Draft',
      content: 'This is the canonical persisted document for the edit.',
      blocks: [{ id: 'block_1', kind: 'paragraph', content: [] }],
      version: 1,
      documentType: 'social_post',
      contentContract: createThinkForgeWriterContract('social_post'),
    });
    const responses = await callAiEditRoutes();

    expect(responses.map((response) => response?.status)).toEqual([200, 200]);
    expect(mocks.deductCredits).toHaveBeenCalledTimes(2);
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
        contentContract: createThinkForgeWriterContract('social_post'),
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
