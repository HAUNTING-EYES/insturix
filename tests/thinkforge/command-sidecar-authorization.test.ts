import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyCommand: vi.fn(),
  auth: vi.fn(),
  checkCredits: vi.fn(),
  createIngestorAgent: vi.fn(),
  createNullAgent: vi.fn(),
  createSupervisorAgent: vi.fn(),
  deconstruct: vi.fn(),
  deduct: vi.fn(),
  executeSpecialist: vi.fn(),
  fetchContextSources: vi.fn(),
  formatSystemBrief: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  getUserPreferences: vi.fn(),
  quickAssembleContext: vi.fn(),
  refund: vi.fn(),
  synthesizeAgent: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/services/creditsMiddleware', () => ({ checkCredits: mocks.checkCredits }));
vi.mock('@/lib/thinkforge/services/command-service', () => ({
  applyCommand: mocks.applyCommand,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getScript: mocks.getScript,
  getSession: mocks.getSession,
  getUserPreferences: mocks.getUserPreferences,
}));
vi.mock('@/lib/thinkforge/context', () => ({
  fetchContextSources: mocks.fetchContextSources,
  formatSystemBrief: mocks.formatSystemBrief,
  quickAssembleContext: mocks.quickAssembleContext,
}));
vi.mock('@/lib/thinkforge/agents/ingestor-agent', () => ({
  createIngestorAgent: mocks.createIngestorAgent,
}));
vi.mock('@/lib/thinkforge/agents/architect-agent', () => ({
  createArchitectAgent: vi.fn(() => ({})),
}));
vi.mock('@/lib/thinkforge/agents/stylist-agent', () => ({
  createStylistAgent: vi.fn(() => ({})),
}));
vi.mock('@/lib/thinkforge/agents/scope-detector-agent', () => ({
  createScopeDetectorAgent: vi.fn(() => ({})),
}));
vi.mock('@/lib/thinkforge/agents/discovery-agent', () => ({
  createDiscoveryAgent: vi.fn(() => ({})),
}));
vi.mock('@/lib/thinkforge/agents/supervisor-agent', () => ({
  createSupervisorAgent: mocks.createSupervisorAgent,
}));
vi.mock('@/lib/thinkforge/agents/null-agent', () => ({
  createNullAgent: mocks.createNullAgent,
}));

const storedScript = {
  _id: 'mongo_script_1',
  sessionId: 'session_canonical',
  scriptId: 'script_1',
  title: 'Draft',
  content: 'Existing content',
  blocks: [],
  version: 1,
};

function commandRequest(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'ReplaceDocument',
      sessionId: 'session_requested',
      baseVersion: 1,
      source: 'user',
      payload: { scriptId: 'script_1', blocks: [] },
      ...overrides,
    }),
  });
}

function sidecarRequest(action: string, fields: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/services/thinkforge/sidecar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, sessionId: 'session_requested', ...fields }),
  });
}

async function specialistStream() {
  async function* stream() {
    yield '# Specialist Brief\n\nA complete specialist document with useful production detail.';
  }
  return { stream: stream() };
}

describe('ThinkForge command and sidecar authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {},
    });
    mocks.getScript.mockResolvedValue(storedScript);
    mocks.getUserPreferences.mockResolvedValue({});
    mocks.fetchContextSources.mockResolvedValue(null);
    mocks.formatSystemBrief.mockReturnValue(null);
    mocks.quickAssembleContext.mockReturnValue({});
    mocks.checkCredits.mockResolvedValue({
      allowed: true,
      deduct: mocks.deduct,
      refund: mocks.refund,
    });
    mocks.applyCommand.mockResolvedValue({ ok: true, script: storedScript });
    mocks.deconstruct.mockResolvedValue({
      title: 'Analysis',
      summary: 'Summary',
      atomicFacts: [],
      viralHooks: [],
      visualAssets: [],
      tags: [],
    });
    mocks.createIngestorAgent.mockReturnValue({ deconstruct: mocks.deconstruct });
    mocks.synthesizeAgent.mockResolvedValue({
      title: 'Specialist Brief',
      persona: 'Specialist',
      documentType: 'document',
    });
    mocks.createSupervisorAgent.mockReturnValue({ synthesizeAgent: mocks.synthesizeAgent });
    mocks.executeSpecialist.mockImplementation(specialistStream);
    mocks.createNullAgent.mockReturnValue({ execute: mocks.executeSpecialist });
  });

  it('runtime-validates generic commands and preserves organization context', async () => {
    const { POST } = await import('@/app/api/commands/route');

    const valid = await POST(commandRequest());
    expect(valid.status).toBe(200);
    expect(mocks.applyCommand).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session_requested' }),
      'user_1',
      'org_1',
    );

    mocks.applyCommand.mockClear();
    const invalid = await POST(commandRequest({ type: 'ExplodeDatabase' }));
    expect(invalid.status).toBe(400);
    expect(mocks.applyCommand).not.toHaveBeenCalled();
  });

  it('rejects foreign sidecar sessions before billing or agent work', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/services/thinkforge/sidecar/route');

    const response = await POST(sidecarRequest('deconstruct', { content: 'Analyze this.' }));

    expect(response?.status).toBe(404);
    expect(mocks.getSession).toHaveBeenCalledWith('session_requested', 'user_1', 'org_1');
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.deconstruct).not.toHaveBeenCalled();
  });

  it('does not bill incomplete or deprecated sidecar actions', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/sidecar/route');

    const [incomplete, deprecated] = await Promise.all([
      POST(sidecarRequest('deconstruct')),
      POST(sidecarRequest('initialize_blueprint')),
    ]);

    expect([incomplete?.status, deprecated?.status]).toEqual([400, 410]);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
  });

  it('uses the canonical session throughout an organization sidecar action', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/sidecar/route');

    const response = await POST(sidecarRequest('deconstruct', { content: 'Analyze this.' }));

    expect(response?.status).toBe(200);
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', undefined);
    expect(mocks.fetchContextSources).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'session_canonical',
      sessionId: 'session_canonical',
      orgId: 'org_1',
    }));
    expect(mocks.deduct).toHaveBeenCalledOnce();
  });

  it('refunds and fails when specialist persistence does not commit', async () => {
    mocks.applyCommand.mockResolvedValue({ ok: false, error: 'Version conflict' });
    const { POST } = await import('@/app/api/services/thinkforge/sidecar/route');

    const response = await POST(sidecarRequest('summon_specialist', {
      specialistRequest: 'Create a launch brief.',
    }));

    expect(response?.status).toBe(500);
    expect(mocks.applyCommand).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session_canonical' }),
      'user_1',
      'org_1',
    );
    expect(mocks.refund).toHaveBeenCalledOnce();
  });
});
