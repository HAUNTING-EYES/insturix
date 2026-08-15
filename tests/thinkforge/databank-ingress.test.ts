import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH, POST } from '@/app/api/services/thinkforge/databank/route';

const mocks = vi.hoisted(() => ({
  addGovernedDataBankEntry: vi.fn(),
  auth: vi.fn(),
  getDataBankEntry: vi.fn(),
  getDataBankEntries: vi.fn(),
  getDataBankEntriesByUser: vi.fn(),
  getProjectScopedEntries: vi.fn(),
  getSession: vi.fn(),
  deleteDataBankEntry: vi.fn(),
  promoteEntryToGlobal: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  addGovernedDataBankEntry: mocks.addGovernedDataBankEntry,
  deleteDataBankEntry: mocks.deleteDataBankEntry,
  getDataBankEntry: mocks.getDataBankEntry,
  getDataBankEntries: mocks.getDataBankEntries,
  getDataBankEntriesByUser: mocks.getDataBankEntriesByUser,
  getProjectScopedEntries: mocks.getProjectScopedEntries,
  getSession: mocks.getSession,
  promoteEntryToGlobal: mocks.promoteEntryToGlobal,
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
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null });
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
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getSession.mockResolvedValue({
      _id: 'tf_session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: {},
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
      tags: [' raw ', '', null, 'draft'],
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
      tags: ['raw', 'draft'],
      governance: {
        classification: 'business_confidential',
        consentStatus: 'not_required',
      },
    }));
  });

  it('ignores forged authority fields and keeps direct references conservatively governed', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_real' });
    mocks.getSession.mockResolvedValue({
      _id: 'tf_session_1',
      userId: 'user_1',
      orgId: 'org_real',
      projectMeta: {},
    });
    mocks.addGovernedDataBankEntry.mockResolvedValue({ _id: 'entry_1' });

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

    expect(response.status).toBe(201);
    expect(mocks.addGovernedDataBankEntry).toHaveBeenCalledWith(
      { userId: 'user_1', orgId: 'org_real' },
      'tf_session_1',
      expect.objectContaining({
        type: 'reference',
        scope: 'project',
        memoryScope: 'project',
        governance: {
          classification: 'business_confidential',
          consentStatus: 'not_required',
        },
      }),
    );
    const storedEntry = mocks.addGovernedDataBankEntry.mock.calls[0][2];
    expect(storedEntry).not.toHaveProperty('ownerType');
    expect(storedEntry).not.toHaveProperty('orgId');
    expect(storedEntry).not.toHaveProperty('classification');
    expect(storedEntry).not.toHaveProperty('consentStatus');
  });

  it('fails closed when the exact organization session is unavailable', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_requesting' });
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

  it('does not promote an entry unless it belongs to the user', async () => {
    mocks.getDataBankEntry.mockResolvedValue(null);

    const response = await PATCH(request({
      id: 'entry_other_user',
      action: 'promote',
    }));

    expect(response.status).toBe(404);
    expect(mocks.getDataBankEntry).toHaveBeenCalledWith('entry_other_user', 'user_1');
    expect(mocks.promoteEntryToGlobal).not.toHaveBeenCalled();
  });

  it('allows explicit owner promotion only for promotable memory types', async () => {
    mocks.getDataBankEntry.mockResolvedValue({
      _id: 'entry_1',
      userId: 'user_1',
      type: 'brand_insight',
      scope: 'project',
    });

    const response = await PATCH(request({
      id: 'entry_1',
      action: 'promote',
    }));

    expect(response.status).toBe(200);
    expect(mocks.promoteEntryToGlobal).toHaveBeenCalledWith('entry_1');
  });
});
