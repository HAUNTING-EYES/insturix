import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCurrentWriterOutputBinding } from '@/lib/thinkforge/persistence/writer-output-binding';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createProjectLink: vi.fn(),
  findLinkBySessionId: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/shared/project-links', () => ({
  createProjectLink: mocks.createProjectLink,
  findLinkBySessionId: mocks.findLinkBySessionId,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getScript: mocks.getScript,
  getSession: mocks.getSession,
  updateSession: mocks.updateSession,
}));

const profile = {
  version: 1,
  spaces: [],
  equipment: [],
  people: {
    performersAvailable: 1,
    cameraOperatorsAvailable: 0,
    assistantsAvailable: 0,
    selfShoot: true,
  },
  constraints: {
    currency: 'USD',
    maxIncrementalSpend: 0,
    rentalAllowed: false,
    purchaseAllowed: false,
    maxLocationChanges: 0,
    transportMode: 'none',
    accessibility: [],
    safety: [],
  },
  preferences: {
    defaultPlanTier: 'no-spend',
    prioritize: ['cost', 'setup-time'],
    householdSubstitutionsAllowed: true,
  },
  provenance: {},
};

const settings = { aspectRatio: '16:9', tier: 'no-spend' };

function postRequest(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function storedDocument(sessionId: string, scriptId: string) {
  return {
    _id: `stored_${scriptId}`,
    sessionId,
    scriptId,
    title: 'Verified document',
    content: 'One useful, exact document.',
    blocks: [{
      id: 'block_1',
      kind: 'paragraph',
      content: [{ type: 'text', text: 'One useful, exact document.', styles: {} }],
    }],
    metadata: {},
    version: 1,
  };
}

function boundPostDocument(status: 'current' | 'stale' = 'current') {
  const content = status === 'current' ? 'Current post copy.' : 'Edited post copy.';
  const writerOutput = {
    writerType: 'post',
    visualPrompts: { singleImagePrompt: 'A precise evidence-led editorial visual.' },
  };
  const current = createCurrentWriterOutputBinding({
    documentContent: 'Current post copy.',
    documentVersion: 1,
    writerOutput,
  });
  return {
    ...storedDocument('session_canonical', 'post_1'),
    content,
    version: status === 'current' ? 1 : 2,
    metadata: {
      writerOutput: {
        ...writerOutput,
        artifactBinding: status === 'current'
          ? current
          : {
              ...current,
              status: 'stale',
              staleReason: 'content_changed_without_fresh_writer_output',
              staleAtVersion: 2,
            },
      },
    },
  };
}

describe('ThinkForge Clickatron document identity', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_member', orgId: 'org_1' });
    mocks.findLinkBySessionId.mockResolvedValue({
      universalId: 'project_link_1',
      brandId: 'brand_1',
      sourceScriptId: 'script_1',
    });
  });

  it('rejects a whitespace document ID before session or project-link work', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      { sessionId: 'session_alias', scriptId: '   ' },
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'scriptId is required' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.findLinkBySessionId).not.toHaveBeenCalled();
  });

  it('uses org authorization and canonical session identity throughout the handoff', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.getScript.mockResolvedValue(storedDocument('session_canonical', 'script_1'));
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      {
        sessionId: 'session_alias',
        scriptId: 'script_1',
        kind: 'single',
        platform: 'linkedin',
      },
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_alias', 'user_member', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_1');
    expect(mocks.findLinkBySessionId).toHaveBeenCalledWith('user_member', 'session_canonical');
    expect(payload.context).toMatchObject({
      sourceSessionId: 'session_canonical',
      sourceScriptId: 'script_1',
    });
  });

  it('does not create a project link when the exact document is missing', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {},
    });
    mocks.getScript.mockResolvedValue(null);
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      { sessionId: 'session_alias', scriptId: 'missing_script' },
    ));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'ThinkForge document not found' });
    expect(mocks.findLinkBySessionId).not.toHaveBeenCalled();
    expect(mocks.createProjectLink).not.toHaveBeenCalled();
  });

  it('rejects stale hidden prompts before creating or reading a project link', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.getScript.mockResolvedValue(boundPostDocument('stale'));
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      { sessionId: 'session_alias', scriptId: 'post_1', kind: 'single', platform: 'linkedin' },
    ));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'writer-output-stale' });
    expect(mocks.findLinkBySessionId).not.toHaveBeenCalled();
    expect(mocks.createProjectLink).not.toHaveBeenCalled();
  });

  it('admits a writer prompt only when its document binding is current', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.getScript.mockResolvedValue(boundPostDocument());
    const { POST } = await import('@/app/api/services/thinkforge/clickatron-context/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/clickatron-context',
      { sessionId: 'session_alias', scriptId: 'post_1', kind: 'single', platform: 'linkedin' },
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.context.sessionDraft.prompt).toContain('precise evidence-led editorial visual');
  });
});

describe('ThinkForge Shoot Kit document identity', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_member', orgId: 'org_1' });
  });

  it('rejects a missing GET document ID before session access', async () => {
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=%20',
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Missing scriptId' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
  });

  it('rejects a missing POST document ID before session access or mutation', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        sessionId: 'session_alias',
        scriptId: '   ',
        profile,
        settings,
      },
    ));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid production request');
    expect(payload.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['scriptId'] }),
    ]));
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('reads the exact document through the authorized canonical session', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {
        productionCapabilityProfile: profile,
        productionShotSettings: settings,
      },
    });
    mocks.getScript.mockResolvedValue(storedDocument('session_canonical', 'script_1'));
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=script_1',
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_alias', 'user_member', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_1');
    expect(payload).toMatchObject({ status: 'needs-user-input', plan: null });
  });

  it('does not persist production settings until exact document ownership is proven', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {},
    });
    mocks.getScript.mockResolvedValue(null);
    const { POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(postRequest(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        sessionId: 'session_alias',
        scriptId: 'missing_script',
        profile,
        settings,
      },
    ));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Document not found' });
    expect(mocks.getSession).toHaveBeenCalledWith('session_alias', 'user_member', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'missing_script');
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });
});
