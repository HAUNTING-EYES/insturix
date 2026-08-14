import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyCommand: vi.fn(),
  auth: vi.fn(),
  checkCredits: vi.fn(),
  classifyIntent: vi.fn(),
  createScriptAuthorAgent: vi.fn(),
  generateScriptDraft: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  isOrgWalletBillingEnabled: vi.fn(),
  resolveContextBillingOwner: vi.fn(),
  reviseDocument: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getScript: mocks.getScript,
  getSession: mocks.getSession,
}));
vi.mock('@/lib/thinkforge/services/command-service', () => ({
  applyCommand: mocks.applyCommand,
}));
vi.mock('@/lib/thinkforge/services/flat-writer-edit', () => ({
  reviseDocumentViaFlatWriter: mocks.reviseDocument,
}));
vi.mock('@/lib/thinkforge/agents/script-draft-agent', () => ({
  generateScriptDraft: mocks.generateScriptDraft,
}));
vi.mock('@/lib/thinkforge/agents/script-author-agent', () => ({
  createScriptAuthorAgent: mocks.createScriptAuthorAgent,
}));
vi.mock('@/lib/thinkforge/protocol/intent-classifier', () => ({
  classifyIntent: mocks.classifyIntent,
}));
vi.mock('@/lib/thinkforge/services/retry-on-overload', () => ({
  retryOnceOnOverload: (operation: () => unknown) => operation(),
}));
vi.mock('@/lib/services/creditsMiddleware', () => ({
  checkCredits: mocks.checkCredits,
}));
vi.mock('@/lib/editron/services/project-ownership', () => ({
  resolveContextBillingOwner: mocks.resolveContextBillingOwner,
}));
vi.mock('@/lib/services/org-wallet-flag', () => ({
  isOrgWalletBillingEnabled: mocks.isOrgWalletBillingEnabled,
}));

import { POST as editDocument } from '@/app/api/services/thinkforge/script/edit/route';
import { POST as editBlocks } from '@/app/api/services/thinkforge/script/edit-blocks/route';

const existingDocument = {
  title: 'Existing document',
  content: 'Existing publishable content that must keep its canonical brand context.',
  blocks: [{ id: 'block_1', kind: 'paragraph', content: [] }],
  version: 4,
  documentType: 'social_post',
};

function request(pathname: string, extra: Record<string, unknown> = {}): Request {
  return new Request(`http://localhost${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'session_1',
      scriptId: 'post_1',
      instruction: 'Make the CTA more direct.',
      script: existingDocument,
      ...extra,
    }),
  });
}

describe('flat writer edit routes fail closed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getSession.mockResolvedValue({ _id: 'session_1', userId: 'user_1', orgId: 'org_1' });
    mocks.isOrgWalletBillingEnabled.mockReturnValue(true);
    mocks.resolveContextBillingOwner.mockReturnValue({ ownerType: 'organization', ownerId: 'org_1' });
    mocks.checkCredits.mockResolvedValue({
      allowed: true,
      deduct: vi.fn().mockResolvedValue(undefined),
      refund: vi.fn().mockResolvedValue(undefined),
    });
    mocks.reviseDocument.mockRejectedValue(new Error('canonical edit failed'));
    mocks.createScriptAuthorAgent.mockReturnValue({ writeStructuredResponse: vi.fn() });
  });

  it('does not fall back to generateScriptDraft after a whole-document edit failure', async () => {
    const response = await editDocument(request('/api/services/thinkforge/script/edit'));

    expect(response?.status).toBe(500);
    expect(mocks.reviseDocument).toHaveBeenCalledOnce();
    expect(mocks.generateScriptDraft).not.toHaveBeenCalled();
    const creditCheck = await mocks.checkCredits.mock.results[0]?.value;
    expect(creditCheck.refund).toHaveBeenCalledWith('canonical edit failed');
  });

  it('does not fall back to the legacy block author after a focused edit failure', async () => {
    const response = await editBlocks(request('/api/services/thinkforge/script/edit-blocks', {
      selection: 'Existing publishable content',
      indices: [0],
    }));

    expect(response?.status).toBe(500);
    expect(mocks.reviseDocument).toHaveBeenCalledOnce();
    expect(mocks.classifyIntent).not.toHaveBeenCalled();
    expect(mocks.createScriptAuthorAgent).not.toHaveBeenCalled();
    expect(mocks.applyCommand).not.toHaveBeenCalled();
  });
});
