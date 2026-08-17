import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { POST } from '@/app/api/services/thinkforge/events/observe/route';

const mocks = vi.hoisted(() => ({
  addGovernedDataBankReviewCandidate: vi.fn(),
  assertDataBankSessionPrincipal: vi.fn(),
  auth: vi.fn(),
  checkDuplicateBeforeSave: vi.fn(),
  createThinkForgeModelForRoute: vi.fn(),
  generateObject: vi.fn(),
  getSession: vi.fn(),
  readAiSdkUsage: vi.fn(),
  recordThinkForgeDirectCost: vi.fn(),
  resolveThinkForgeProviderRoute: vi.fn(),
  safeJsonLength: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('@/lib/thinkforge/agents/model-factory', () => ({
  createThinkForgeModelForRoute: mocks.createThinkForgeModelForRoute,
  resolveThinkForgeProviderRoute: mocks.resolveThinkForgeProviderRoute,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  addGovernedDataBankReviewCandidate: mocks.addGovernedDataBankReviewCandidate,
  assertDataBankSessionPrincipal: mocks.assertDataBankSessionPrincipal,
  getSession: mocks.getSession,
}));
vi.mock('@/lib/thinkforge/services/embedding-service', () => ({
  checkDuplicateBeforeSave: mocks.checkDuplicateBeforeSave,
}));
vi.mock('@/lib/thinkforge/services/provider-cost-telemetry', () => ({
  readAiSdkUsage: mocks.readAiSdkUsage,
  recordThinkForgeDirectCost: mocks.recordThinkForgeDirectCost,
  safeJsonLength: mocks.safeJsonLength,
}));

const LONG_TEXT = 'This is a long enough editor buffer where I explain that I prefer warm direct response openings and crisp captions.';

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/thinkforge/events/observe', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('ThinkForge observer ingress', () => {
  beforeEach(() => {
    process.env.OBSERVER_ENABLED = 'true';
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null });
    mocks.resolveThinkForgeProviderRoute.mockReturnValue({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    mocks.createThinkForgeModelForRoute.mockReturnValue('model');
    mocks.checkDuplicateBeforeSave.mockResolvedValue(false);
    mocks.readAiSdkUsage.mockResolvedValue(undefined);
    mocks.recordThinkForgeDirectCost.mockResolvedValue(undefined);
    mocks.safeJsonLength.mockReturnValue(0);
    mocks.generateObject.mockResolvedValue({
      object: {
        facts: [{
          type: 'preference',
          content: 'The user prefers warm direct response openings.',
          confidence: 0.91,
          scope: 'global',
          sensitivity: 'non_personal',
        }],
      },
    });
    mocks.getSession.mockResolvedValue({
      _id: 'tf_session_1',
      userId: 'user_1',
      projectMeta: {},
    });
    mocks.addGovernedDataBankReviewCandidate.mockResolvedValue({
      _id: 'entry_1',
      userId: 'user_1',
      sessionId: 'tf_session_1',
      scope: 'project',
      provenanceStatus: 'quarantined',
      provenanceReason: 'pending_owner_review',
      reviewStatus: 'pending',
    });
  });

  it('does not observe text without an owned session', async () => {
    const response = await POST(request({ text: LONG_TEXT, source: 'editor' }));

    expect(response.status).toBe(202);
    await expect(json(response)).resolves.toMatchObject({
      accepted: false,
      reason: 'missing_session',
    });
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it('rejects sessions unavailable to the authenticated principal', async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(request({
      text: LONG_TEXT,
      sessionId: 'tf_session_other',
      source: 'editor',
    }));

    expect(response.status).toBe(404);
    expect(mocks.getSession).toHaveBeenCalledWith('tf_session_other', 'user_1', undefined);
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it('fails closed when a returned session does not match the active organization', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.auth.mockResolvedValue({ userId: 'member_1', orgId: 'org_active' });
    mocks.getSession.mockResolvedValue({
      _id: 'tf_wrong_org_session',
      userId: 'member_1',
      orgId: 'org_other',
      projectMeta: {},
    });
    mocks.assertDataBankSessionPrincipal.mockImplementation(() => {
      throw new Error('principal mismatch');
    });

    const response = await POST(request({
      text: LONG_TEXT,
      sessionId: 'tf_wrong_org_session',
      source: 'editor',
    }));

    expect(response.status).toBe(403);
    expect(mocks.generateObject).not.toHaveBeenCalled();
    expect(mocks.addGovernedDataBankReviewCandidate).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('writes eligible facts through governed project memory', async () => {
    const response = await POST(request({
      text: LONG_TEXT,
      sessionId: 'tf_session_1',
      source: 'editor',
    }));

    expect(response.status).toBe(200);
    expect(mocks.resolveThinkForgeProviderRoute).toHaveBeenCalledWith({
      routePurpose: 'structural',
      privacyClass: 'business_confidential',
      modelName: 'gemini-2.5-flash',
    });
    expect(mocks.addGovernedDataBankReviewCandidate).toHaveBeenCalledWith(
      { userId: 'user_1' },
      'tf_session_1',
      expect.objectContaining({
        type: 'brand_insight',
        projectId: 'tf_session_1',
        scope: 'project',
        memoryScope: 'project',
        content: expect.objectContaining({
          claim: 'The user prefers warm direct response openings.',
          llmScope: 'global',
          promotionReason: 'observer_project_quarantine',
        }),
        governance: {
          classification: 'business_confidential',
          consentStatus: 'not_required',
        },
      }),
    );
    await expect(json(response.clone())).resolves.toMatchObject({ reviewPendingCount: 1 });
    const routeSource = readFileSync('app/api/services/thinkforge/events/observe/route.ts', 'utf8');
    expect(routeSource).not.toContain('embedDataBankEntry');
  });

  it('propagates the Clerk organization principal and ignores browser governance fields', async () => {
    mocks.auth.mockResolvedValue({ userId: 'member_1', orgId: 'org_1' });
    const session = {
      _id: 'tf_org_session',
      userId: 'owner_1',
      orgId: 'org_1',
      projectMeta: {},
    };
    mocks.getSession.mockResolvedValue(session);

    const response = await POST(request({
      text: LONG_TEXT,
      sessionId: 'tf_org_session',
      source: 'chat',
      orgId: 'org_attacker',
      ownerType: 'user',
      classification: 'public',
      consentStatus: 'granted',
    }));

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('tf_org_session', 'member_1', 'org_1');
    expect(mocks.assertDataBankSessionPrincipal).toHaveBeenCalledWith(
      { userId: 'member_1', orgId: 'org_1' },
      session,
    );
    expect(mocks.addGovernedDataBankReviewCandidate).toHaveBeenCalledWith(
      { userId: 'member_1', orgId: 'org_1' },
      'tf_org_session',
      expect.objectContaining({
        governance: {
          classification: 'business_confidential',
          consentStatus: 'not_required',
        },
      }),
    );
  });

  it('excludes personal, mislabeled PII, and child candidates but keeps safe learning', async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        facts: [
          { type: 'personal_info', content: 'Contains the user name.', confidence: 0.99, scope: 'global', sensitivity: 'personal' },
          { type: 'preference', content: 'Contact private@example.com.', confidence: 0.99, scope: 'global', sensitivity: 'non_personal' },
          { type: 'audience_insight', content: 'Contains a child school record.', confidence: 0.99, scope: 'project', sensitivity: 'child_data' },
          { type: 'rule', content: 'Open with the useful fact before interpretation.', confidence: 0.92, scope: 'project', sensitivity: 'non_personal' },
        ],
      },
    });

    const response = await POST(request({
      text: LONG_TEXT,
      sessionId: 'tf_session_1',
      source: 'editor',
    }));

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      extractedCount: 4,
      eligibleCount: 1,
      sensitiveRejectedCount: 3,
      persistedCount: 1,
    });
    expect(mocks.addGovernedDataBankReviewCandidate).toHaveBeenCalledTimes(1);
    expect(mocks.addGovernedDataBankReviewCandidate).toHaveBeenCalledWith(
      { userId: 'user_1' },
      'tf_session_1',
      expect.objectContaining({
        content: expect.objectContaining({
          claim: 'Open with the useful fact before interpretation.',
        }),
      }),
    );
  });

  it('rejects child source text before model extraction or persistence', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await POST(request({
      text: 'My daughter is 12 years old and her school record should be remembered for future scripts.',
      sessionId: 'tf_session_1',
      source: 'chat',
    }));

    expect(response.status).toBe(202);
    await expect(json(response)).resolves.toMatchObject({
      accepted: false,
      reason: 'child_data_not_observed',
    });
    expect(mocks.generateObject).not.toHaveBeenCalled();
    expect(mocks.addGovernedDataBankReviewCandidate).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns an observable failure when candidate persistence fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.addGovernedDataBankReviewCandidate.mockRejectedValue(new Error('databank unavailable'));

    const response = await POST(request({
      text: LONG_TEXT,
      sessionId: 'tf_session_1',
      source: 'editor',
    }));

    expect(response.status).toBe(500);
    await expect(json(response)).resolves.toMatchObject({
      accepted: false,
      error: 'observation_processing_failed',
    });
    expect(errorSpy).toHaveBeenCalledWith(
      '[Observer] Observation processing failed',
      expect.objectContaining({ errorClass: 'Error' }),
    );
    errorSpy.mockRestore();
  });
});
