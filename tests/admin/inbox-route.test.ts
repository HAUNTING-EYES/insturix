import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const CONTACT_ID = '507f1f77bcf86cd799439011';
const SUPPORT_ID = '507f1f77bcf86cd799439012';

const mocks = vi.hoisted(() => ({
  verifyAdminForApi: vi.fn(),
  connectToDatabase: vi.fn(),
  contactAggregate: vi.fn(),
  contactFindByIdAndUpdate: vi.fn(),
  contactUpdateMany: vi.fn(),
  contactDeleteMany: vi.fn(),
  supportFindByIdAndUpdate: vi.fn(),
  supportUpdateMany: vi.fn(),
  supportDeleteMany: vi.fn(),
}));

vi.mock('@/lib/auth/adminAuth', () => ({ verifyAdminForApi: mocks.verifyAdminForApi }));
vi.mock('@/schemas/ConnectToDatabase', () => ({ default: mocks.connectToDatabase }));
vi.mock('@/schemas/ContactSchema', () => ({
  default: {
    aggregate: mocks.contactAggregate,
    findByIdAndUpdate: mocks.contactFindByIdAndUpdate,
    updateMany: mocks.contactUpdateMany,
    deleteMany: mocks.contactDeleteMany,
  },
}));
vi.mock('@/schemas/SupportSchema', () => ({
  default: {
    collection: { name: 'supports' },
    findByIdAndUpdate: mocks.supportFindByIdAndUpdate,
    updateMany: mocks.supportUpdateMany,
    deleteMany: mocks.supportDeleteMany,
  },
}));

function request(path: string, body?: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: body ? 'PATCH' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as NextRequest;
}

describe('admin inbox route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.verifyAdminForApi.mockResolvedValue({ isAdmin: true });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.contactAggregate.mockResolvedValue([{
      messages: [{
        _id: `support:${SUPPORT_ID}`,
        source: 'support',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: 'Support request: Sponsorship',
        message: 'I would like to help.',
        createdAt: '2026-08-23T00:00:00.000Z',
        read: false,
        deleted: false,
        organizationName: 'Analytical Engines',
        telephone: '1234567890',
        budget: 10000,
      }],
      total: [{ count: 1 }],
    }]);
    mocks.contactFindByIdAndUpdate.mockResolvedValue({ _id: CONTACT_ID, read: true, deleted: false });
    mocks.supportFindByIdAndUpdate.mockResolvedValue({ _id: SUPPORT_ID, read: true, deleted: false });
    mocks.contactUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    mocks.supportUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    mocks.contactDeleteMany.mockResolvedValue({ deletedCount: 1 });
    mocks.supportDeleteMany.mockResolvedValue({ deletedCount: 1 });
  });

  it('fails closed before database work for a non-admin', async () => {
    const denied = new Response(JSON.stringify({ ok: false }), { status: 403 });
    mocks.verifyAdminForApi.mockResolvedValue({ isAdmin: false, response: denied });
    const { GET } = await import('@/app/api/admin/inbox/route');

    const response = await GET(request('/api/admin/inbox'));

    expect(response).toBe(denied);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(mocks.contactAggregate).not.toHaveBeenCalled();
  });

  it('returns a single date-sorted inbox that includes support records', async () => {
    const { GET } = await import('@/app/api/admin/inbox/route');

    const response = await GET(request('/api/admin/inbox?page=1&limit=10&read=false'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      messages: [expect.objectContaining({
        _id: `support:${SUPPORT_ID}`,
        source: 'support',
        organizationName: 'Analytical Engines',
      })],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
    });

    const pipeline = mocks.contactAggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const union = pipeline.find((stage) => '$unionWith' in stage) as { $unionWith: { coll: string } };
    expect(union.$unionWith.coll).toBe('supports');
  });

  it('routes a support read action to Support, not Contact', async () => {
    const { PATCH } = await import('@/app/api/admin/inbox/route');

    const response = await PATCH(request('/api/admin/inbox', {
      id: `support:${SUPPORT_ID}`,
      read: true,
    }));

    expect(response.status).toBe(200);
    expect(mocks.supportFindByIdAndUpdate).toHaveBeenCalledWith(
      SUPPORT_ID,
      { $set: expect.objectContaining({ read: true, readAt: expect.any(Date) }) },
      { new: true },
    );
    expect(mocks.contactFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('applies bulk status updates to both message sources', async () => {
    const { PATCH } = await import('@/app/api/admin/inbox/route');

    const response = await PATCH(request('/api/admin/inbox', {
      ids: [CONTACT_ID, `support:${SUPPORT_ID}`],
      action: 'delete',
    }));

    expect(response.status).toBe(200);
    expect(mocks.contactUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: [CONTACT_ID] } },
      { $set: expect.objectContaining({ deleted: true, deletedAt: expect.any(Date) }) },
    );
    expect(mocks.supportUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: [SUPPORT_ID] } },
      { $set: expect.objectContaining({ deleted: true, deletedAt: expect.any(Date) }) },
    );
  });
});
