import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkCredits: vi.fn(),
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
vi.mock('@/lib/thinkforge/services/flat-writer-edit', () => ({
  reviseDocumentViaFlatWriter: mocks.reviseDocument,
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
  title: 'Browser-supplied wrong document',
  content: 'This content must never become edit authority.',
  blocks: [{ id: 'browser_block', kind: 'scene', content: [] }],
  version: 999,
  documentType: 'video_script',
};

const canonicalResult = {
  scriptId: 'post_1',
  title: 'Canonical post',
  content: 'Canonical revised post content.',
  blocks: [{ id: 'canonical_block', kind: 'paragraph', content: [] }],
  richText: { type: 'doc', content: [] },
  metadata: { workflow: 'edit' },
  version: 5,
  documentType: 'social_post',
  contentContract: {
    version: 1,
    documentKind: 'post',
    outputKind: 'social_post',
    artifactType: 'social_post',
  },
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
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', userId: 'user_1', orgId: 'org_1' });
    mocks.getScript.mockResolvedValue({
      sessionId: 'session_canonical',
      scriptId: 'post_1',
      title: 'Canonical post',
      content: 'Canonical persisted post content.',
      blocks: [{ id: 'canonical_block', kind: 'paragraph', content: [] }],
      version: 4,
      documentType: 'social_post',
      contentContract: canonicalResult.contentContract,
    });
    mocks.isOrgWalletBillingEnabled.mockReturnValue(true);
    mocks.resolveContextBillingOwner.mockReturnValue({ ownerType: 'organization', ownerId: 'org_1' });
    mocks.checkCredits.mockResolvedValue({
      allowed: true,
      deduct: vi.fn().mockResolvedValue(undefined),
      refund: vi.fn().mockResolvedValue(undefined),
    });
    mocks.reviseDocument.mockRejectedValue(new Error('canonical edit failed'));
  });

  it('does not fall back to generateScriptDraft after a whole-document edit failure', async () => {
    const response = await editDocument(request('/api/services/thinkforge/script/edit'));

    expect(response?.status).toBe(500);
    expect(mocks.reviseDocument).toHaveBeenCalledOnce();
    expect(mocks.reviseDocument).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_canonical',
      scriptId: 'post_1',
      instruction: 'Make the CTA more direct.',
    });
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
    expect(mocks.reviseDocument).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_canonical',
      scriptId: 'post_1',
      instruction: expect.stringContaining('Make the CTA more direct.'),
      selection: 'Existing publishable content',
    });
  });

  it('rejects missing, blank, and padded identities before authorization, billing, or model work', async () => {
    const invalidBodies = [
      { scriptId: undefined },
      { scriptId: '   ' },
      { scriptId: ' post_1 ' },
      { sessionId: ' session_1 ' },
    ];

    const responses = await Promise.all(invalidBodies.flatMap((body) => [
      editDocument(request('/api/services/thinkforge/script/edit', body)),
      editBlocks(request('/api/services/thinkforge/script/edit-blocks', body)),
    ]));

    expect(responses.every((response) => response?.status === 400)).toBe(true);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.reviseDocument).not.toHaveBeenCalled();
  });

  it('uses canonical ownership and never forwards browser document state', async () => {
    mocks.reviseDocument.mockResolvedValue(canonicalResult);

    const [documentResponse, blockResponse] = await Promise.all([
      editDocument(request('/api/services/thinkforge/script/edit')),
      editBlocks(request('/api/services/thinkforge/script/edit-blocks', {
        selection: 'Canonical selection',
        indices: [0],
      })),
    ]);

    expect([documentResponse?.status, blockResponse?.status]).toEqual([200, 200]);
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
    expect(mocks.getSession).toHaveBeenCalledWith('session_1', 'user_1', 'org_1');
    expect(mocks.reviseDocument).toHaveBeenCalledTimes(2);
    for (const [args] of mocks.reviseDocument.mock.calls) {
      expect(args).toMatchObject({
        sessionId: 'session_canonical',
        scriptId: 'post_1',
      });
      expect(args).not.toHaveProperty('existingScript');
      expect(args).not.toHaveProperty('existingContent');
      expect(args).not.toHaveProperty('baseVersion');
    }
    expect(mocks.getSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkCredits.mock.invocationCallOrder[0],
    );
    expect(mocks.getSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.reviseDocument.mock.invocationCallOrder[0],
    );
    await expect(documentResponse?.json()).resolves.toMatchObject({
      scriptId: 'post_1',
      documentType: 'social_post',
      contentContract: canonicalResult.contentContract,
    });
  });

  it('returns a clear not-found response and refunds when the stored document disappears', async () => {
    mocks.reviseDocument.mockRejectedValue(new Error('ThinkForge document not found'));

    const [documentResponse, blockResponse] = await Promise.all([
      editDocument(request('/api/services/thinkforge/script/edit')),
      editBlocks(request('/api/services/thinkforge/script/edit-blocks')),
    ]);

    expect([documentResponse?.status, blockResponse?.status]).toEqual([404, 404]);
    const creditCheck = await mocks.checkCredits.mock.results[0]?.value;
    expect(creditCheck.refund).toHaveBeenCalledWith('ThinkForge document not found');
  });

  it('rejects a missing exact document before billing or model work', async () => {
    mocks.getScript.mockResolvedValue(null);

    const [documentResponse, blockResponse] = await Promise.all([
      editDocument(request('/api/services/thinkforge/script/edit')),
      editBlocks(request('/api/services/thinkforge/script/edit-blocks')),
    ]);

    expect([documentResponse?.status, blockResponse?.status]).toEqual([404, 404]);
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'post_1');
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.reviseDocument).not.toHaveBeenCalled();
  });

  it('rejects stale block indices before billing or model work', async () => {
    const response = await editBlocks(request('/api/services/thinkforge/script/edit-blocks', {
      indices: [1],
    }));

    if (!response) throw new Error('Expected a block-edit response');
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'Block selection is stale' });
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.reviseDocument).not.toHaveBeenCalled();
  });

  it('surfaces a version race and refunds instead of retrying against newer content', async () => {
    mocks.reviseDocument.mockRejectedValue(new Error('Version conflict'));

    const [documentResponse, blockResponse] = await Promise.all([
      editDocument(request('/api/services/thinkforge/script/edit')),
      editBlocks(request('/api/services/thinkforge/script/edit-blocks')),
    ]);

    if (!documentResponse || !blockResponse) throw new Error('Expected both edit responses');
    expect([documentResponse.status, blockResponse.status]).toEqual([409, 409]);
    const creditCheck = await mocks.checkCredits.mock.results[0]?.value;
    expect(creditCheck.refund).toHaveBeenCalledTimes(2);
    expect(creditCheck.refund).toHaveBeenCalledWith('Version conflict');
  });
});
