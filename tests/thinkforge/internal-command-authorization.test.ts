import { readFileSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyCommand: vi.fn(),
  auth: vi.fn(),
  checkCredits: vi.fn(),
  deduct: vi.fn(),
  ensureMigrated: vi.fn(),
  getOrCreateSession: vi.fn(),
  getSession: vi.fn(),
  processChat: vi.fn(),
  refund: vi.fn(),
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
  getOrCreateSession: mocks.getOrCreateSession,
  getSession: mocks.getSession,
  setActiveGeneration: mocks.setActiveGeneration,
  updateGenerationState: mocks.updateGenerationState,
}));
vi.mock('@/lib/thinkforge/services/command-service', () => ({
  applyCommand: mocks.applyCommand,
}));

function chatRequest() {
  return new Request('http://localhost/api/services/thinkforge/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'session_requested',
      prompt: 'Create a launch post.',
    }),
  });
}

describe('ThinkForge internal command authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'owner_1',
      orgId: 'org_1',
      projectMeta: {},
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
    mocks.applyCommand.mockResolvedValue({ ok: true, script: { version: 1 } });
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
    expect(mocks.checkCredits).toHaveBeenCalledWith(
      'user_1',
      'thinkforge',
      'chat_message',
      { taskId: 'session_canonical' },
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
    }));
  });

  it('keeps org identity in CalOS persistence and never links an unsaved session', async () => {
    const { createLinkedThinkForgeSession } = await import('@/lib/calos/create-thinkforge-session');
    const params = {
      userId: 'user_1',
      orgId: 'org_1',
      brandId: 'brand_1',
      deliverableId: 'deliverable_1',
      campaignId: 'campaign_1',
      title: 'Launch post',
      content: 'A complete launch post with enough content to persist.',
    };

    await expect(createLinkedThinkForgeSession(params)).resolves.toBe('session_canonical');
    expect(mocks.applyCommand).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session_canonical' }),
      'user_1',
      'org_1',
    );

    mocks.applyCommand.mockResolvedValueOnce({ ok: false, error: 'Version conflict' });
    await expect(createLinkedThinkForgeSession(params)).resolves.toBeNull();
  });

  it('uses only canonical session IDs and org-aware commands inside processChat', () => {
    const source = readFileSync(
      new URL('../../lib/thinkforge/services/chat-service.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('orgId?: string | null;');
    expect(source).toContain('db.getSession(sessionId, userId, orgId)');
    expect(source).not.toContain('sessionId || session._id');
    expect(source).not.toContain('sessionId || session!._id');
    expect(source.match(/\}, userId, orgId\);/g)).toHaveLength(3);
  });
});
