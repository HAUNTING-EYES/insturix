import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyCommand: vi.fn(),
  auth: vi.fn(),
  checkVoice: vi.fn(),
  checkCredits: vi.fn(),
  createArchitectAgent: vi.fn(),
  createDiscoveryAgent: vi.fn(),
  createIngestorAgent: vi.fn(),
  createNullAgent: vi.fn(),
  createScopeDetectorAgent: vi.fn(),
  createStylistAgent: vi.fn(),
  createSupervisorAgent: vi.fn(),
  deconstruct: vi.fn(),
  deduct: vi.fn(),
  detectScope: vi.fn(),
  executeSpecialist: vi.fn(),
  fetchContextSources: vi.fn(),
  formatSystemBrief: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  getUserPreferences: vi.fn(),
  quickAssembleContext: vi.fn(),
  refund: vi.fn(),
  storyboard: vi.fn(),
  synthesizeAgent: vi.fn(),
  proposeBlueprint: vi.fn(),
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
  createArchitectAgent: mocks.createArchitectAgent,
}));
vi.mock('@/lib/thinkforge/agents/stylist-agent', () => ({
  createStylistAgent: mocks.createStylistAgent,
}));
vi.mock('@/lib/thinkforge/agents/scope-detector-agent', () => ({
  createScopeDetectorAgent: mocks.createScopeDetectorAgent,
}));
vi.mock('@/lib/thinkforge/agents/discovery-agent', () => ({
  createDiscoveryAgent: mocks.createDiscoveryAgent,
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
    mocks.storyboard.mockResolvedValue({
      title: 'Storyboard',
      shots: [],
      bRollSuggestions: [],
      musicDirection: 'Natural',
      productionNotes: 'Keep it practical.',
      totalDuration: '30 seconds',
    });
    mocks.createArchitectAgent.mockReturnValue({ storyboard: mocks.storyboard });
    mocks.checkVoice.mockResolvedValue({
      overallScore: 92,
      voiceSummary: 'Voice is consistent.',
      flags: [],
      patternInterrupts: [],
      toneAnalysis: {},
    });
    mocks.createStylistAgent.mockReturnValue({ checkVoice: mocks.checkVoice });
    mocks.detectScope.mockResolvedValue({
      complexity: 'simple',
      domain: 'marketing',
      summary: 'A focused project.',
      estimatedDuration: '1 day',
      recommendedArtifacts: [],
    });
    mocks.createScopeDetectorAgent.mockReturnValue({ detectScope: mocks.detectScope });
    mocks.proposeBlueprint.mockResolvedValue({
      greeting: 'Blueprint ready.',
      artifacts: [],
      followUpQuestion: 'Anything else?',
    });
    mocks.createDiscoveryAgent.mockReturnValue({ proposeBlueprint: mocks.proposeBlueprint });
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

  it('rejects a browser command that claims to be AI-authored', async () => {
    const { POST } = await import('@/app/api/commands/route');

    const response = await POST(commandRequest({ source: 'ai' }));

    expect(response.status).toBe(400);
    expect(mocks.applyCommand).not.toHaveBeenCalled();
  });

  it('returns a stable revision-conflict code to browser clients', async () => {
    mocks.applyCommand.mockResolvedValueOnce({
      ok: false,
      error: 'Version conflict',
      currentVersion: 7,
    });
    const { POST } = await import('@/app/api/commands/route');

    const response = await POST(commandRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Version conflict',
      code: 'DOCUMENT_REVISION_CONFLICT',
      currentVersion: 7,
    });
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
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.fetchContextSources).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'session_canonical',
      sessionId: 'session_canonical',
      orgId: 'org_1',
      currentScript: '',
    }));
    expect(mocks.deduct).toHaveBeenCalledOnce();
  });

  it.each([
    ['deconstruct', { content: 'Analyze this.', scriptId: 'unrelated_script' }],
    ['storyboard', { content: 'Storyboard this selection.', scriptId: 'unrelated_script' }],
    ['refine_voice', { content: 'Review this exact draft.', scriptId: 'unrelated_script' }],
    ['summon_specialist', { specialistRequest: 'Create a launch brief.', scriptId: 'unrelated_script' }],
    ['detect_scope', { content: 'Plan a campaign.', scriptId: 'unrelated_script' }],
    ['discover_blueprint', { content: 'Build a campaign system.', scriptId: 'unrelated_script' }],
  ])('%s remains document-independent when its complete input is supplied', async (action, fields) => {
    const { POST } = await import('@/app/api/services/thinkforge/sidecar/route');

    const response = await POST(sidecarRequest(action, fields));

    expect(response?.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_requested', 'user_1', 'org_1');
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.quickAssembleContext).toHaveBeenCalledWith(
      'chat',
      expect.any(Object),
      null,
      [],
      null,
      null,
    );
  });

  it('requires an exact document identity before stored voice analysis', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/sidecar/route');

    const [missing, whitespace] = await Promise.all([
      POST(sidecarRequest('refine_voice')),
      POST(sidecarRequest('refine_voice', { scriptId: '   ' })),
    ]);

    expect([missing?.status, whitespace?.status]).toEqual([400, 400]);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.checkVoice).not.toHaveBeenCalled();
  });

  it('loads only the exact stored document after session authorization and before billing', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/sidecar/route');

    const response = await POST(sidecarRequest('refine_voice', { scriptId: ' script_1 ' }));

    expect(response?.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_requested', 'user_1', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_1');
    expect(mocks.getSession.mock.invocationCallOrder[0]).toBeLessThan(mocks.getScript.mock.invocationCallOrder[0]);
    expect(mocks.getScript.mock.invocationCallOrder[0]).toBeLessThan(mocks.checkCredits.mock.invocationCallOrder[0]);
    expect(mocks.checkVoice).toHaveBeenCalledWith(expect.objectContaining({
      userPrompt: 'Existing content',
    }));
  });

  it('fails a missing exact document before billing or model work', async () => {
    mocks.getScript.mockResolvedValue(null);
    const { POST } = await import('@/app/api/services/thinkforge/sidecar/route');

    const response = await POST(sidecarRequest('refine_voice', { scriptId: 'missing_script' }));

    expect(response?.status).toBe(404);
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'missing_script');
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.checkVoice).not.toHaveBeenCalled();
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
