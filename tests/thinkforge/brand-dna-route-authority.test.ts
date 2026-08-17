import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  extractVoiceFingerprint: vi.fn(),
  getSession: vi.fn(),
  getUserBrandDNA: vi.fn(),
  has: vi.fn(),
  updateUserBrandDNA: vi.fn(),
  writeThinkForgeBrandDNAToBrandVault: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getSession: mocks.getSession,
  getUserBrandDNA: mocks.getUserBrandDNA,
  updateUserBrandDNA: mocks.updateUserBrandDNA,
}));
vi.mock('@/lib/thinkforge/data/voice-signature', () => ({
  extractVoiceFingerprint: mocks.extractVoiceFingerprint,
}));
vi.mock('@/lib/thinkforge/services/brand-vault-voice-evidence', () => ({
  writeThinkForgeBrandDNAToBrandVault: mocks.writeThinkForgeBrandDNAToBrandVault,
}));

function patchRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/services/thinkforge/brand-dna', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function fingerprintRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/services/thinkforge/brand-dna/extract-fingerprint', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('ThinkForge BrandDNA route authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.has.mockReturnValue(false);
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', has: mocks.has });
    mocks.getSession.mockResolvedValue(null);
    mocks.getUserBrandDNA.mockResolvedValue({ voiceLock: 'global personal voice' });
    mocks.updateUserBrandDNA.mockResolvedValue({ voiceLock: 'updated global voice' });
    mocks.writeThinkForgeBrandDNAToBrandVault.mockResolvedValue({
      ok: true,
      jobId: 'job_1',
      recordId: 'draft_1',
      candidateCount: 1,
    });
    mocks.extractVoiceFingerprint.mockReturnValue({
      avgWordsPerSentence: 8,
      sentenceLengthVariance: 1,
      topBigrams: [],
      punctuationProfile: {},
      passiveVoiceRatio: 0,
      questionFrequency: 0,
      sentenceRhythm: ['short'],
      openingPattern: 'direct_claim',
      transitionStyle: 'implicit',
      closingPattern: 'reframe',
      listStyle: 'none',
      extractedFromCount: 5,
    });
  });

  it('stages an explicit-brand patch without mutating user-global BrandDNA', async () => {
    const { PATCH } = await import('@/app/api/services/thinkforge/brand-dna/route');
    const response = await PATCH(patchRequest({ brandId: 'brand_1', killList: ['never say this'] }));

    expect(response.status).toBe(200);
    expect(mocks.updateUserBrandDNA).not.toHaveBeenCalled();
    expect(mocks.writeThinkForgeBrandDNAToBrandVault).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      orgId: 'org_1',
      isOrgAdmin: false,
      brandId: 'brand_1',
      updates: { killList: ['never say this'] },
    }));
    await expect(response.json()).resolves.toMatchObject({
      brandDNA: { voiceLock: 'global personal voice' },
      pendingBrandDNA: { killList: ['never say this'] },
      vaultSync: { ok: true, recordId: 'draft_1' },
    });
  });

  it('fails an explicit-brand patch when Brand Vault cannot authorize it', async () => {
    mocks.writeThinkForgeBrandDNAToBrandVault.mockResolvedValue({
      ok: false,
      code: 'brand_scope_unavailable',
      error: 'Brand Vault cannot verify access to the selected brand.',
    });
    const { PATCH } = await import('@/app/api/services/thinkforge/brand-dna/route');
    const response = await PATCH(patchRequest({ brandId: 'brand_1', voiceLock: 'new voice' }));

    expect(response.status).toBe(503);
    expect(mocks.updateUserBrandDNA).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ code: 'brand_scope_unavailable' });
  });

  it('rejects a brand that conflicts with the authorized session binding', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_a' },
    });
    const { PATCH } = await import('@/app/api/services/thinkforge/brand-dna/route');
    const response = await PATCH(patchRequest({
      sessionId: 'session_1',
      brandId: 'brand_b',
      voiceLock: 'wrong brand',
    }));

    expect(response.status).toBe(409);
    expect(mocks.getSession).toHaveBeenCalledWith('session_1', 'user_1', 'org_1');
    expect(mocks.writeThinkForgeBrandDNAToBrandVault).not.toHaveBeenCalled();
    expect(mocks.updateUserBrandDNA).not.toHaveBeenCalled();
  });

  it('keeps deliberately unbranded personal voice edits in the legacy user scope', async () => {
    const { PATCH } = await import('@/app/api/services/thinkforge/brand-dna/route');
    const response = await PATCH(patchRequest({ voiceLock: 'updated global voice' }));

    expect(response.status).toBe(200);
    expect(mocks.updateUserBrandDNA).toHaveBeenCalledWith('user_1', { voiceLock: 'updated global voice' });
    expect(mocks.writeThinkForgeBrandDNAToBrandVault).toHaveBeenCalledWith(expect.objectContaining({
      brandId: undefined,
    }));
  });

  it('stages a brand-scoped fingerprint without overwriting personal voice memory', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/brand-dna/extract-fingerprint/route');
    const response = await POST(fingerprintRequest({
      brandId: 'brand_1',
      referenceTexts: ['one', 'two', 'three', 'four', 'five'],
    }));

    expect(response.status).toBe(200);
    expect(mocks.updateUserBrandDNA).not.toHaveBeenCalled();
    expect(mocks.writeThinkForgeBrandDNAToBrandVault).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      orgId: 'org_1',
      brandId: 'brand_1',
      source: 'voice_fingerprint_extract',
    }));
    await expect(response.json()).resolves.toMatchObject({
      brandDNA: { voiceLock: 'global personal voice' },
      pendingBrandDNA: { voiceFingerprint: { openingPattern: 'direct_claim' } },
    });
  });
});
