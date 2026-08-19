import { readFileSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildThinkForgeWriterInvocationTrace } from '@/lib/thinkforge/provenance/generation-trace';

const mocks = vi.hoisted(() => ({
  applyCommand: vi.fn(),
  auth: vi.fn(),
  has: vi.fn(),
  checkCredits: vi.fn(),
  deduct: vi.fn(),
  ensureMigrated: vi.fn(),
  getOrCreateSessionForContentCard: vi.fn(),
  getOrCreateSession: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  processChat: vi.fn(),
  refund: vi.fn(),
  resolveThinkForgeAuthoringContext: vi.fn(),
  setActiveGeneration: vi.fn(),
  updateGenerationState: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/chat-service', () => ({ processChat: mocks.processChat }));
vi.mock('@/lib/services/creditsMiddleware', () => ({ checkCredits: mocks.checkCredits }));
vi.mock('@/lib/services/creditsMigrationService', () => ({
  CreditsMigrationService: { ensureMigrated: mocks.ensureMigrated },
}));
vi.mock('@/lib/config/creditCosts', () => ({ getCreditCost: vi.fn(() => 0.2) }));
vi.mock('@/lib/thinkforge/services/retry-on-overload', () => ({
  retryOnceOnOverload: vi.fn((operation: () => unknown) => operation()),
}));
vi.mock('@/lib/thinkforge/errors/thinkforge-error', () => ({
  toThinkForgeErrorResponse: vi.fn((error: Error) => ({
    body: { error: error.message },
    status: 500,
  })),
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getOrCreateSessionForContentCard: mocks.getOrCreateSessionForContentCard,
  getOrCreateSession: mocks.getOrCreateSession,
  getScript: mocks.getScript,
  getSession: mocks.getSession,
  setActiveGeneration: mocks.setActiveGeneration,
  updateGenerationState: mocks.updateGenerationState,
}));
vi.mock('@/lib/thinkforge/services/command-service', () => ({
  applyCommand: mocks.applyCommand,
}));
vi.mock('@/lib/thinkforge/context', () => ({
  resolveThinkForgeAuthoringContext: mocks.resolveThinkForgeAuthoringContext,
}));

function chatRequest() {
  return new Request('http://localhost/api/services/thinkforge/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'session_requested',
      scriptId: 'default',
      prompt: 'Create a launch post.',
    }),
  });
}

describe('ThinkForge internal command authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.has.mockReturnValue(false);
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', has: mocks.has });
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'owner_1',
      orgId: 'org_1',
      projectMeta: {},
    });
    mocks.getScript.mockResolvedValue({
      sessionId: 'session_canonical',
      scriptId: 'default',
      title: 'Canonical draft',
      content: 'Persisted content',
      blocks: [],
      version: 2,
    });
    mocks.checkCredits.mockResolvedValue({
      allowed: true,
      deduct: mocks.deduct,
      refund: mocks.refund,
    });
    mocks.deduct.mockResolvedValue({ transactionId: 'txn_1' });
    mocks.setActiveGeneration.mockResolvedValue(true);
    mocks.processChat.mockResolvedValue(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    }));
    mocks.getOrCreateSession.mockResolvedValue({ _id: 'session_canonical' });
    mocks.getOrCreateSessionForContentCard.mockResolvedValue({ _id: 'session_canonical' });
    mocks.applyCommand.mockResolvedValue({ ok: true, script: { version: 1 } });
    mocks.resolveThinkForgeAuthoringContext.mockResolvedValue(null);
  });

  it('rejects a foreign chat session before migration, billing, or generation', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/services/thinkforge/chat/route');

    const response = await POST(chatRequest());

    expect(response?.status).toBe(404);
    expect(mocks.getSession).toHaveBeenCalledWith('session_requested', 'user_1', 'org_1');
    expect(mocks.ensureMigrated).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.setActiveGeneration).not.toHaveBeenCalled();
    expect(mocks.processChat).not.toHaveBeenCalled();
  });

  it('uses canonical session and organization identity for chat admission', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/chat/route');

    const response = await POST(chatRequest());

    expect(response?.status).toBe(200);
    // P3.1: the 5th arg is the billing wallet resolved at work-start. ORG_WALLET_BILLING is
    // unset in this test env => personal wallet, today's behavior exactly (D7).
    expect(mocks.checkCredits).toHaveBeenCalledWith(
      'user_1',
      'thinkforge',
      'chat_message',
      { taskId: 'session_canonical' },
      { type: 'user', clerkUserId: 'user_1' },
    );
    expect(mocks.setActiveGeneration).toHaveBeenCalledWith(
      'session_canonical',
      'user_1',
      expect.any(Object),
    );
    expect(mocks.processChat).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session_canonical',
      userId: 'user_1',
      orgId: 'org_1',
      scriptId: 'default',
      script: expect.objectContaining({ version: 2, content: 'Persisted content' }),
    }));
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'default');
  });

  it('rejects chat without a document identity before retrieval or billing', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/chat/route');
    const response = await POST(new Request('http://localhost/api/services/thinkforge/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session_requested', prompt: 'Create a launch post.' }),
    }));

    if (!response) throw new Error('Chat route returned no response.');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing scriptId' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getScript).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
  });

  it('stamps the org wallet on the generation billing record when the flag is ON and an org context is active', async () => {
    const previous = process.env.ORG_WALLET_BILLING;
    process.env.ORG_WALLET_BILLING = 'true';
    try {
      const { POST } = await import('@/app/api/services/thinkforge/chat/route');

      const response = await POST(chatRequest());

      expect(response?.status).toBe(200);
      expect(mocks.checkCredits).toHaveBeenCalledWith(
        'user_1',
        'thinkforge',
        'chat_message',
        { taskId: 'session_canonical' },
        { type: 'org', clerkOrgId: 'org_1', actorUserId: 'user_1' },
      );
      const generation = mocks.setActiveGeneration.mock.calls[0][2] as { billing?: Record<string, unknown> };
      expect(generation?.billing?.billedWallet).toEqual({
        type: 'org',
        clerkOrgId: 'org_1',
        actorUserId: 'user_1',
      });
    } finally {
      if (previous === undefined) delete process.env.ORG_WALLET_BILLING;
      else process.env.ORG_WALLET_BILLING = previous;
    }
  });

  it('derives one opaque content-card session ID per exact owner scope, brand, and card', async () => {
    const actualDb = await vi.importActual<typeof import('@/lib/thinkforge/services/db')>(
      '@/lib/thinkforge/services/db',
    );
    const base = { brandId: 'brand_1', contentCardId: 'card_1' };

    const firstOrgActor = actualDb.buildThinkForgeContentCardSessionId({
      ...base,
      userId: 'user_1',
      orgId: 'org_1',
    });
    const secondOrgActor = actualDb.buildThinkForgeContentCardSessionId({
      ...base,
      userId: 'user_2',
      orgId: 'org_1',
    });
    const otherBrand = actualDb.buildThinkForgeContentCardSessionId({
      ...base,
      brandId: 'brand_2',
      userId: 'user_1',
      orgId: 'org_1',
    });
    const personal = actualDb.buildThinkForgeContentCardSessionId({
      ...base,
      userId: 'user_1',
      orgId: null,
    });

    expect(firstOrgActor).toBe(secondOrgActor);
    expect(firstOrgActor).not.toBe(otherBrand);
    expect(firstOrgActor).not.toBe(personal);
    expect(firstOrgActor).toMatch(/^session_calos_[a-f0-9]{64}$/);
  });

  it('keeps org identity in CalOS persistence and never links an unsaved session', async () => {
    const { createLinkedThinkForgeSession } = await import('@/lib/calos/create-thinkforge-session');
    const sourceLedger = { ledgerVersion: 1 as const, entries: [] };
    const writerTrace = buildThinkForgeWriterInvocationTrace({
      writerType: 'post',
      editorialPlan: { version: 2, writerKind: 'post', execution: { kind: 'post' } },
      selectedTechniques: [],
      promptTemplate: 'CalOS post writer prompt',
      sourceLedger,
      provider: 'gemini',
      model: 'gemini-test',
      cacheStatus: 'inline',
      generatedAt: '2026-08-19T00:00:00.000Z',
    });
    const params = {
      userId: 'user_1',
      orgId: 'org_1',
      brandId: 'brand_1',
      deliverableId: 'deliverable_1',
      campaignId: 'campaign_1',
      format: 'text',
      platform: 'linkedin',
      title: 'Launch post',
      artifact: {
        content: 'A complete launch post with enough content to persist.',
        documentType: 'social_post' as const,
        contentContract: {
          version: 1 as const,
          documentKind: 'post' as const,
          outputKind: 'social_post' as const,
          artifactType: 'social_post' as const,
        },
        briefSnapshot: {
          output: {
            platform: 'linkedin' as const,
            targetDurationSec: null,
            count: 1,
            format: 'auto-edit' as const,
          },
          resolution: {
            fieldConfidence: { platform: 1 },
            confirmed: ['platform' as const],
            inferred: [],
          },
          entryPoint: 'thinkforge' as const,
        },
        authoringContextSnapshot: {
          version: 1 as const,
          resolvedAt: '2026-08-12T00:00:00.000Z',
          scope: { kind: 'organization' as const, brandId: 'brand_1' },
          brand: {
            brandId: 'brand_1',
            recordId: 'record_1',
            profileUpdatedAt: '2026-08-12T00:00:00.000Z',
            profileFingerprint: 'a'.repeat(64),
          },
          retrieval: { projectFactIds: [], globalFactIds: [], interactionPatternTypes: [] },
          writingKnowledgeVersion: 'writing-knowledge-v3',
        },
        signalTrace: {
          outputFormat: 'social_post',
          goal: 'awareness',
          angle: 'launch',
          enforcedConstraints: {},
          selectedIntent: {
            proofPoints: [],
            forbiddenTerms: [],
            structuralHints: [],
            visualNeeds: [],
            clickatron: { requested: false, assetIntent: 'none' as const, rationale: [] },
          },
          sourceSummary: {
            brandContextPresent: true,
            brandVaultProfilePresent: true,
            projectFactsUsed: 0,
            globalFactsUsed: 0,
            interactionPatternsUsed: 0,
          },
          provenanceSummary: [],
          warnings: [],
        },
        writerOutput: {
          writerType: 'post' as const,
          writerTrace,
          contentAnalysis: {
            tone: 'precise',
            vibe: 'grounded',
            theme: 'launch',
            qualityScore: 96,
            violations: [],
          },
          hashtags: ['#Launch'],
          visualPrompts: { singleImagePrompt: 'A brand-safe launch scene.' },
          sourceLedger,
          writerMetadata: { platform: 'linkedin', charCount: 58 },
        },
      },
    };

    await expect(createLinkedThinkForgeSession(params)).resolves.toBe('session_canonical');
    const [savedCommand, savedUserId, savedOrgId] = mocks.applyCommand.mock.calls[0] ?? [];
    expect(savedUserId).toBe('user_1');
    expect(savedOrgId).toBe('org_1');
    expect(savedCommand).toMatchObject({
      sessionId: 'session_canonical',
      payload: {
        documentType: 'social_post',
        contentContract: { outputKind: 'social_post' },
        metadata: {
          origin: 'calos',
          authoringContextSnapshot: { brand: { brandId: 'brand_1' } },
          signalTrace: { outputFormat: 'social_post' },
          briefSnapshot: { output: { platform: 'linkedin' } },
          writerOutput: { writerType: 'post', writerTrace: { writerType: 'post' } },
        },
      },
    });
    expect(mocks.getOrCreateSessionForContentCard).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        orgId: 'org_1',
        contentCardId: 'deliverable_1',
        projectMeta: expect.objectContaining({
          brandId: 'brand_1',
          brandBinding: expect.objectContaining({ brandId: 'brand_1', scope: 'organization' }),
          format: 'text',
          platform: 'linkedin',
          contentContract: expect.objectContaining({ outputKind: 'social_post' }),
        }),
      }),
    );

    await expect(createLinkedThinkForgeSession({
      ...params,
      artifact: {
        ...params.artifact,
        writerOutput: { ...params.artifact.writerOutput, writerTrace: undefined },
      },
    })).rejects.toThrow('writer invocation trace is required');
    await expect(createLinkedThinkForgeSession({
      ...params,
      artifact: {
        ...params.artifact,
        writerOutput: {
          ...params.artifact.writerOutput,
          writerTrace: { ...writerTrace, sourceLedgerHash: 'b'.repeat(64) },
        },
      },
    })).rejects.toThrow('does not match the executed source ledger');
    expect(mocks.getOrCreateSessionForContentCard).toHaveBeenCalledTimes(1);

    mocks.applyCommand.mockResolvedValueOnce({ ok: false, error: 'Version conflict' });
    await expect(createLinkedThinkForgeSession(params)).rejects.toThrow('Version conflict');
  });

  it('uses only canonical session IDs and org-aware commands inside processChat', () => {
    const source = readFileSync(
      new URL('../../lib/thinkforge/services/chat-service.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('orgId?: string | null;');
    expect(source).toContain('sessionId: string;');
    expect(source).toContain('scriptId: string;');
    expect(source).toContain('db.getSession(exactSessionId, userId, orgId)');
    expect(source).not.toContain('sessionId || session._id');
    expect(source).not.toContain('sessionId || session!._id');
    expect(source).toContain('reviseDocumentViaFlatWriter({');
    expect(source).not.toContain('createScriptRefinementAgent');
    expect(source.match(/\}, userId, orgId\);/g)).toHaveLength(1);
  });
});
