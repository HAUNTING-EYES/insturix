import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThinkForgeBrandAuthorityError } from '@/lib/thinkforge/context/brand-authoring-context';

const mocks = vi.hoisted(() => ({
  applyCommand: vi.fn(),
  auth: vi.fn(),
  checkVoice: vi.fn(),
  checkCredits: vi.fn(),
  createArchitectAgent: vi.fn(),
  createIngestorAgent: vi.fn(),
  createScopeDetectorAgent: vi.fn(),
  createStylistAgent: vi.fn(),
  deconstruct: vi.fn(),
  deduct: vi.fn(),
  detectScope: vi.fn(),
  ensureMigrated: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  getUserPreferences: vi.fn(),
  has: vi.fn(),
  quickAssembleContext: vi.fn(),
  refund: vi.fn(),
  storyboard: vi.fn(),
  processChat: vi.fn(),
  resolveThinkForgeAuthoringContext: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/services/creditsMiddleware', () => ({ checkCredits: mocks.checkCredits }));
vi.mock('@/lib/services/creditsMigrationService', () => ({
  CreditsMigrationService: { ensureMigrated: mocks.ensureMigrated },
}));
vi.mock('@/lib/thinkforge/services/command-service', () => ({
  applyCommand: mocks.applyCommand,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getScript: mocks.getScript,
  getSession: mocks.getSession,
  getUserPreferences: mocks.getUserPreferences,
}));
vi.mock('@/lib/thinkforge/context', () => ({
  quickAssembleContext: mocks.quickAssembleContext,
  resolveThinkForgeAuthoringContext: mocks.resolveThinkForgeAuthoringContext,
}));
vi.mock('@/lib/thinkforge/services/chat-service', () => ({ processChat: mocks.processChat }));
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

function blueprintChatRequest() {
  return new Request('http://localhost/api/services/thinkforge/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Initialize these documents.',
      sessionId: 'session_requested',
      scriptId: 'script_1',
      blueprintArtifacts: [{ type: 'budget', label: 'Budget' }],
    }),
  });
}

describe('ThinkForge command and sidecar authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.has.mockReturnValue(true);
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', has: mocks.has });
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {},
    });
    mocks.getScript.mockResolvedValue(storedScript);
    mocks.getUserPreferences.mockResolvedValue({});
    mocks.resolveThinkForgeAuthoringContext.mockResolvedValue({
      projectMeta: {},
      retrievedContext: {},
      systemBrief: '',
      snapshot: {},
    });
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

    const [incomplete, initialize, discover, specialist] = await Promise.all([
      POST(sidecarRequest('deconstruct')),
      POST(sidecarRequest('initialize_blueprint')),
      POST(sidecarRequest('discover_blueprint', { content: 'Build a campaign system.' })),
      POST(sidecarRequest('summon_specialist', { specialistRequest: 'Create a launch brief.' })),
    ]);

    expect([incomplete?.status, initialize?.status, discover?.status, specialist?.status]).toEqual([400, 410, 410, 410]);
    await expect(initialize?.json()).resolves.toMatchObject({ code: 'LEGACY_BLUEPRINT_RETIRED' });
    await expect(discover?.json()).resolves.toMatchObject({ code: 'LEGACY_BLUEPRINT_RETIRED' });
    await expect(specialist?.json()).resolves.toMatchObject({ code: 'LEGACY_SPECIALIST_RETIRED' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.ensureMigrated).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
  });

  it('rejects legacy chat blueprints before session access, billing, or generation', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/chat/route');

    const response = await POST(blueprintChatRequest());
    if (!response) {
      throw new Error('Chat route returned no response for a retired Blueprint request.');
    }

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ code: 'LEGACY_BLUEPRINT_RETIRED' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.ensureMigrated).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.processChat).not.toHaveBeenCalled();
  });

  it('uses the canonical session throughout an organization sidecar action', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/sidecar/route');

    const response = await POST(sidecarRequest('deconstruct', { content: 'Analyze this.' }));

    expect(response?.status).toBe(200);
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.resolveThinkForgeAuthoringContext).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'session_canonical',
      sessionId: 'session_canonical',
      orgId: 'org_1',
      currentScript: '',
    }));
    expect(mocks.resolveThinkForgeAuthoringContext.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.checkCredits.mock.invocationCallOrder[0]);
    expect(mocks.deduct).toHaveBeenCalledOnce();
  });

  it('fails closed on missing brand authority before credit checks or model work', async () => {
    mocks.resolveThinkForgeAuthoringContext.mockRejectedValueOnce(
      new ThinkForgeBrandAuthorityError(
        'brand_profile_unavailable',
        'The selected brand has no accepted profile.',
      ),
    );
    const { POST } = await import('@/app/api/services/thinkforge/sidecar/route');

    const response = await POST(sidecarRequest('deconstruct', { content: 'Analyze this.' }));

    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toMatchObject({
      code: 'brand_profile_unavailable',
      message: 'The selected brand has no accepted profile.',
    });
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.deconstruct).not.toHaveBeenCalled();
  });

  it.each([
    ['deconstruct', { content: 'Analyze this.', scriptId: 'unrelated_script' }],
    ['storyboard', { content: 'Storyboard this selection.', scriptId: 'unrelated_script' }],
    ['refine_voice', { content: 'Review this exact draft.', scriptId: 'unrelated_script' }],
    ['detect_scope', { content: 'Plan a campaign.', scriptId: 'unrelated_script' }],
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
    expect(mocks.getScript.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.resolveThinkForgeAuthoringContext.mock.invocationCallOrder[0]);
    expect(mocks.resolveThinkForgeAuthoringContext.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.checkCredits.mock.invocationCallOrder[0]);
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

});
