import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, PATCH, POST } from '@/app/api/services/thinkforge/databank/route';

const mocks = vi.hoisted(() => ({
  addGovernedDataBankEntry: vi.fn(),
  assertDataBankSessionPrincipal: vi.fn(),
  auth: vi.fn(),
  authorizeBrandScope: vi.fn(),
  deleteAuthorizedDataBankEntry: vi.fn(),
  getAuthorizedDataBankEntries: vi.fn(),
  getAuthorizedDataBankReviewCandidates: vi.fn(),
  getAuthorizedProjectScopedEntries: vi.fn(),
  getSession: vi.fn(),
  promoteAuthorizedDataBankEntryToGlobal: vi.fn(),
  reviewAuthorizedDataBankEntry: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  addGovernedDataBankEntry: mocks.addGovernedDataBankEntry,
  assertDataBankSessionPrincipal: mocks.assertDataBankSessionPrincipal,
  deleteAuthorizedDataBankEntry: mocks.deleteAuthorizedDataBankEntry,
  getAuthorizedDataBankEntries: mocks.getAuthorizedDataBankEntries,
  getAuthorizedDataBankReviewCandidates: mocks.getAuthorizedDataBankReviewCandidates,
  getAuthorizedProjectScopedEntries: mocks.getAuthorizedProjectScopedEntries,
  getSession: mocks.getSession,
  promoteAuthorizedDataBankEntryToGlobal: mocks.promoteAuthorizedDataBankEntryToGlobal,
  reviewAuthorizedDataBankEntry: mocks.reviewAuthorizedDataBankEntry,
}));

vi.mock('@/lib/shared/brand-scope', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/shared/brand-scope')>(),
  authorizeBrandScope: mocks.authorizeBrandScope,
}));

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/thinkforge/databank', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('ThinkForge DataBank ingress', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null, has: vi.fn(() => false) });
    mocks.assertDataBankSessionPrincipal.mockReturnValue({ ownerType: 'user', userId: 'user_1' });
    mocks.getAuthorizedDataBankEntries.mockResolvedValue([]);
    mocks.getAuthorizedDataBankReviewCandidates.mockResolvedValue([]);
    mocks.getAuthorizedProjectScopedEntries.mockResolvedValue([]);
    mocks.promoteAuthorizedDataBankEntryToGlobal.mockResolvedValue('promoted');
    mocks.reviewAuthorizedDataBankEntry.mockResolvedValue('approved');
  });

  it('rejects direct global writes from request bodies', async () => {
    const response = await POST(request({
      sessionId: 'tf_session_1',
      type: 'brand_insight',
      title: 'Always use warm voice',
      content: { claim: 'Always use warm voice' },
      scope: 'global',
    }));

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({
      error: expect.stringContaining('Direct global DataBank writes are not allowed'),
    });
    expect(mocks.addGovernedDataBankEntry).not.toHaveBeenCalled();
  });

  it('authorizes the exact organization session and stores governed project memory', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', has: vi.fn(() => false) });
    mocks.getSession.mockResolvedValue({
      _id: 'tf_session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.addGovernedDataBankEntry.mockResolvedValue({
      _id: 'entry_1',
      userId: 'user_1',
      ownerType: 'organization',
      orgId: 'org_1',
      sessionId: 'tf_session_1',
      scope: 'project',
    });

    const response = await POST(request({
      sessionId: ' tf_session_1 ',
      type: 'note',
      title: 'Reference note',
      content: { text: 'Imported by the user' },
      tags: [' raw ', 'draft'],
    }));

    expect(response.status).toBe(201);
    expect(mocks.getSession).toHaveBeenCalledWith('tf_session_1', 'user_1', 'org_1');
    expect(mocks.addGovernedDataBankEntry).toHaveBeenCalledWith(
      { userId: 'user_1', orgId: 'org_1' },
      'tf_session_1',
      expect.objectContaining({
      type: 'note',
      title: 'Reference note',
      projectId: 'tf_session_1',
      scope: 'project',
      memoryScope: 'project',
      brandId: 'brand_1',
      tags: ['raw', 'draft'],
      governance: {
        classification: 'business_confidential',
        consentStatus: 'not_required',
      },
    }));
  });

  it('rejects forged authority fields instead of silently accepting them', async () => {
    const response = await POST(request({
      sessionId: 'tf_session_1',
      type: 'reference',
      title: 'Customer evidence',
      content: { text: 'Approved customer evidence' },
      ownerType: 'user',
      orgId: 'org_forged',
      classification: 'public',
      consentStatus: 'granted',
      memoryScope: 'universal',
    }));

    expect(response.status).toBe(400);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.addGovernedDataBankEntry).not.toHaveBeenCalled();
  });

  it('blocks personal data until an explicit consent flow exists', async () => {
    const response = await POST(request({
      sessionId: 'tf_session_1',
      type: 'reference',
      title: 'Customer contact',
      content: { email: 'customer@example.com' },
    }));

    expect(response.status).toBe(422);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.addGovernedDataBankEntry).not.toHaveBeenCalled();
  });

  it('fails closed when the exact organization session is unavailable', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_requesting', has: vi.fn(() => false) });
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(request({
      sessionId: 'tf_session_other_org',
      type: 'note',
      title: 'Cross-organization attempt',
      content: { text: 'Must not persist' },
    }));

    expect(response.status).toBe(404);
    expect(mocks.getSession).toHaveBeenCalledWith(
      'tf_session_other_org',
      'user_1',
      'org_requesting',
    );
    expect(mocks.addGovernedDataBankEntry).not.toHaveBeenCalled();
  });

  it('reads organization memory through the exact organization principal', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', has: vi.fn(() => false) });
    mocks.getAuthorizedDataBankEntries.mockResolvedValue([{ _id: 'entry_1' }]);

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/databank?dataScope=global&type=note&limit=25&tags=proof,approved',
    ));

    expect(response.status).toBe(200);
    expect(mocks.getAuthorizedDataBankEntries).toHaveBeenCalledWith(
      { userId: 'user_1', orgId: 'org_1' },
      { type: 'note', tags: ['proof', 'approved'], scope: 'global', limit: 25 },
    );
  });

  it('deletes only through the exact organization principal', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', has: vi.fn(() => false) });
    mocks.deleteAuthorizedDataBankEntry.mockResolvedValue(true);

    const response = await DELETE(new Request(
      'http://localhost/api/services/thinkforge/databank?id=entry_1',
      { method: 'DELETE' },
    ));

    expect(response.status).toBe(200);
    expect(mocks.deleteAuthorizedDataBankEntry).toHaveBeenCalledWith(
      'entry_1',
      { userId: 'user_1', orgId: 'org_1' },
    );
  });

  it('lists pending generated learning only through the owner review query', async () => {
    mocks.getAuthorizedDataBankReviewCandidates.mockResolvedValue([{ _id: 'candidate_1' }]);

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/databank?reviewStatus=pending&sessionId=tf_session_1&limit=20',
    ));

    expect(response.status).toBe(200);
    expect(mocks.getAuthorizedDataBankReviewCandidates).toHaveBeenCalledWith(
      { userId: 'user_1', orgId: null },
      { sessionId: 'tf_session_1', limit: 20 },
    );
    expect(mocks.getAuthorizedDataBankEntries).not.toHaveBeenCalled();
  });

  it('requires an organization administrator to review generated learning', async () => {
    const has = vi.fn(() => false);
    mocks.auth.mockResolvedValue({ userId: 'member_1', orgId: 'org_1', has });

    const listResponse = await GET(new Request(
      'http://localhost/api/services/thinkforge/databank?reviewStatus=pending',
    ));
    const reviewResponse = await PATCH(request({
      id: 'candidate_1',
      action: 'review',
      decision: 'approved',
    }));

    expect(listResponse.status).toBe(403);
    expect(reviewResponse.status).toBe(403);
    expect(mocks.getAuthorizedDataBankReviewCandidates).not.toHaveBeenCalled();
    expect(mocks.reviewAuthorizedDataBankEntry).not.toHaveBeenCalled();
  });

  it('reviews a candidate through an exact principal and surfaces stale decisions', async () => {
    const approved = await PATCH(request({
      id: 'candidate_1',
      action: 'review',
      decision: 'approved',
    }));

    expect(approved.status).toBe(200);
    expect(mocks.reviewAuthorizedDataBankEntry).toHaveBeenCalledWith(
      'candidate_1',
      { userId: 'user_1', orgId: null },
      'approved',
    );

    mocks.reviewAuthorizedDataBankEntry.mockResolvedValue('not_pending');
    const repeated = await PATCH(request({
      id: 'candidate_1',
      action: 'review',
      decision: 'rejected',
    }));
    expect(repeated.status).toBe(409);
  });

  it('builds a review predicate that cannot enter normal verified retrieval', async () => {
    const db = await vi.importActual<typeof import('@/lib/thinkforge/services/db')>(
      '@/lib/thinkforge/services/db',
    );
    const query = db.buildAuthorizedDataBankReviewQuery(
      { userId: 'user_1', orgId: null },
      'session_1',
      new Date('2026-08-17T00:00:00.000Z'),
    );

    expect(query).toMatchObject({
      $and: expect.arrayContaining([
        { provenanceStatus: 'quarantined' },
        { provenanceReason: 'pending_owner_review' },
        { reviewStatus: 'pending' },
        { sessionId: 'session_1' },
      ]),
    });
    expect(query.$and).not.toContainEqual({ provenanceStatus: 'verified' });
  });

  it('does not promote an entry outside the active principal', async () => {
    mocks.promoteAuthorizedDataBankEntryToGlobal.mockResolvedValue('not_found');

    const response = await PATCH(request({
      id: 'entry_other_user',
      action: 'promote',
      target: { memoryScope: 'universal' },
    }));

    expect(response.status).toBe(404);
    expect(mocks.promoteAuthorizedDataBankEntryToGlobal).toHaveBeenCalledWith(
      'entry_other_user',
      { userId: 'user_1', orgId: null },
      { memoryScope: 'universal' },
    );
  });

  it('requires an organization administrator to promote universal memory', async () => {
    const has = vi.fn(() => false);
    mocks.auth.mockResolvedValue({ userId: 'member_1', orgId: 'org_1', has });

    const response = await PATCH(request({
      id: 'entry_1',
      action: 'promote',
      target: { memoryScope: 'universal' },
    }));

    expect(response.status).toBe(403);
    await expect(json(response)).resolves.toMatchObject({
      error: 'Organization universal memory promotion requires an administrator',
    });
    expect(has).toHaveBeenCalledWith({ role: 'org:admin' });
    expect(mocks.promoteAuthorizedDataBankEntryToGlobal).not.toHaveBeenCalled();
  });

  it('allows an organization administrator to promote universal memory', async () => {
    const has = vi.fn(() => true);
    mocks.auth.mockResolvedValue({ userId: 'admin_1', orgId: 'org_1', has });

    const response = await PATCH(request({
      id: 'entry_1',
      action: 'promote',
      target: { memoryScope: 'universal' },
    }));

    expect(response.status).toBe(200);
    expect(mocks.promoteAuthorizedDataBankEntryToGlobal).toHaveBeenCalledWith(
      'entry_1',
      { userId: 'admin_1', orgId: 'org_1' },
      { memoryScope: 'universal' },
    );
  });

  it('authorizes an explicit brand target before CAS promotion', async () => {
    const has = vi.fn(() => true);
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', has });
    mocks.authorizeBrandScope.mockResolvedValue({ brandId: 'brand_1' });

    const response = await PATCH(request({
      id: 'entry_1',
      action: 'promote',
      target: { memoryScope: 'brand', brandId: 'brand_1' },
    }));

    expect(response.status).toBe(200);
    expect(mocks.authorizeBrandScope).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_1',
      isOrgAdmin: true,
      brandId: 'brand_1',
    });
    expect(mocks.promoteAuthorizedDataBankEntryToGlobal).toHaveBeenCalledWith(
      'entry_1',
      { userId: 'user_1', orgId: 'org_1' },
      { memoryScope: 'brand', brandId: 'brand_1' },
    );
  });

  it('requires an explicit promotion target', async () => {
    const response = await PATCH(request({
      id: 'entry_1',
      action: 'promote',
    }));

    expect(response.status).toBe(400);
    expect(mocks.authorizeBrandScope).not.toHaveBeenCalled();
    expect(mocks.promoteAuthorizedDataBankEntryToGlobal).not.toHaveBeenCalled();
  });
});
