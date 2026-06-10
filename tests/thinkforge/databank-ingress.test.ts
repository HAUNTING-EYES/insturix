import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH, POST } from '@/app/api/services/thinkforge/databank/route';

const mocks = vi.hoisted(() => ({
  addDataBankEntry: vi.fn(),
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
  addDataBankEntry: mocks.addDataBankEntry,
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
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
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
    expect(mocks.addDataBankEntry).not.toHaveBeenCalled();
  });

  it('verifies session ownership and stores request content as project memory', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'tf_session_1',
      userId: 'user_1',
      projectMeta: {},
    });
    mocks.addDataBankEntry.mockResolvedValue({
      _id: 'entry_1',
      userId: 'user_1',
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
    expect(mocks.getSession).toHaveBeenCalledWith('tf_session_1', 'user_1');
    expect(mocks.addDataBankEntry).toHaveBeenCalledWith('tf_session_1', 'user_1', expect.objectContaining({
      type: 'note',
      title: 'Reference note',
      projectId: 'tf_session_1',
      scope: 'project',
      tags: ['raw', 'draft'],
    }));
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
