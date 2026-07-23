/**
 * Director Mode — director worker HANDLER assist guard. Proves the production
 * Stage-2 director site (the plan's corrected anchor) hands the pen to the user:
 * an assist project reaches ready_for_chat and the Director NEVER runs, while
 * auto is unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  findOne: vi.fn(),
  executeDirectorPlan: vi.fn(async () => ({ actionsExecuted: 0, decisionAuthority: {} })),
}));

vi.mock('@upstash/qstash/nextjs', () => ({ verifySignatureAppRouter: (h: unknown) => h }));
vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({ collection: () => ({ findOneAndUpdate: mocks.findOneAndUpdate, updateOne: mocks.updateOne, findOne: mocks.findOne }) })),
}));
vi.mock('@/lib/editron/agent/director-agent', () => ({ executeDirectorPlan: mocks.executeDirectorPlan }));

import { POST } from '@/app/api/internal/workers/director/route';

const request = (body: Record<string, unknown>) => new Request('http://localhost/api/internal/workers/director', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never;

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  delete process.env.QSTASH_CURRENT_SIGNING_KEY; // POST = handler directly
});

describe('director worker assist guard', () => {
  it('assist: hands the pen to the user — ready_for_chat, Director never runs', async () => {
    // The lock claims the project and returns the assist doc.
    mocks.findOneAndUpdate.mockResolvedValue({ projectId: 'p1', userId: 'u1', editMode: 'assist', autoEditStatus: 'directing' });
    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));
    const body = await res.json();

    expect(body).toMatchObject({ success: true, status: 'ready_for_chat', directorSkipped: true });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { projectId: 'p1', autoEditStatus: { $ne: 'scan_failed' } },
      expect.objectContaining({ $set: expect.objectContaining({ autoEditStatus: 'ready_for_chat' }) }),
    );
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
  });

  it('cancel-wins: the ready-write is guarded so a cancelled project is never resurrected', async () => {
    mocks.findOneAndUpdate.mockResolvedValue({ projectId: 'p1', userId: 'u1', editMode: 'assist', autoEditStatus: 'directing' });
    await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));
    const [filter] = mocks.updateOne.mock.calls[0];
    expect(filter).toEqual({ projectId: 'p1', autoEditStatus: { $ne: 'scan_failed' } });
  });

  it('already-settled: no lock claimed → skipped, no Director, no status write', async () => {
    mocks.findOneAndUpdate.mockResolvedValue(null);
    mocks.findOne.mockResolvedValue({ autoEditStatus: 'scan_failed' });
    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));
    const body = await res.json();
    expect(body).toMatchObject({ success: true, skipped: true });
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
  });
});
