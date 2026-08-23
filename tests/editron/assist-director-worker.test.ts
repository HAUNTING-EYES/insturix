/**
 * Director Mode — director worker HANDLER assist guard. Proves the production
 * Stage-2 director site (the plan's corrected anchor) hands the pen to the user:
 * an assist project reaches ready_for_chat and the Director NEVER runs, while
 * auto is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: any) => handler),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  findOne: vi.fn(),
  executeDirectorPlan: vi.fn(async () => ({ actionsExecuted: 0, decisionAuthority: {} })),
  recordProjectOutcome: vi.fn(async () => ({ recorded: true })),
}));

vi.mock('@upstash/qstash/nextjs', () => ({ verifySignatureAppRouter: mocks.verifySignatureAppRouter }));
vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({ collection: () => ({ findOneAndUpdate: mocks.findOneAndUpdate, updateOne: mocks.updateOne, findOne: mocks.findOne }) })),
}));
vi.mock('@/lib/editron/agent/director-agent', () => ({ executeDirectorPlan: mocks.executeDirectorPlan }));
vi.mock('@/lib/editron/services/editron-learning-gate', () => ({
  resolveDirectorCompletionHealth: () => ({ autoEditStatus: 'complete', needsQualityAttention: false, qualityScore: 0.9, criticalCount: 0 }),
}));
vi.mock('@/lib/editron/services/genre-parameter-bandit', () => ({ recordProjectOutcome: mocks.recordProjectOutcome }));

import { POST } from '@/app/api/internal/workers/director/route';

const request = (body: Record<string, unknown>) => new Request('http://localhost/api/internal/workers/director', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never;

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  mocks.executeDirectorPlan.mockResolvedValue({ actionsExecuted: 3, decisionAuthority: {} });
  mocks.recordProjectOutcome.mockResolvedValue({ recorded: true });
  mocks.verifySignatureAppRouter.mockImplementation((handler: any) => handler);
  vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-signing-key');
  vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-signing-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('director worker QStash boundary', () => {
  it.each([
    ['QSTASH_CURRENT_SIGNING_KEY', ''],
    ['QSTASH_NEXT_SIGNING_KEY', '   '],
  ])('fails closed with no project mutation when %s is unavailable', async (missingKey, value) => {
    vi.stubEnv(missingKey, value);

    const response = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_WORKER_AUTH_NOT_CONFIGURED',
        routeId: 'director',
      },
    });
    expect(mocks.verifySignatureAppRouter).not.toHaveBeenCalled();
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
  });
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

/**
 * Rescue seam (battle Lane E): the stuck-recovery cron can flip a still-running
 * `directing` project to `failed`; if the user then RESCUES it into Director Mode
 * (editMode=assist, ready_for_chat) while this worker is finishing, the completion
 * write must NOT resurrect it to `complete` with a full auto-edit applied. The
 * director owns the project only while autoEditStatus === 'directing'.
 */
describe('director completion ownership guard', () => {
  const autoLock = { projectId: 'p1', userId: 'u1', editMode: 'auto', autoEditStatus: 'directing' };

  it('resurrection blocked: completion no-ops + skips bookkeeping when the project left `directing` mid-run', async () => {
    mocks.findOneAndUpdate.mockResolvedValue(autoLock);          // claimed as auto + directing
    mocks.findOne.mockResolvedValue({});                          // projectAfterDirector (quality read)
    mocks.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }); // ownership lost (rescued/recovered)
    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));
    const body = await res.json();

    expect(mocks.executeDirectorPlan).toHaveBeenCalled();         // we DID reach completion — not an early skip
    expect(body).toMatchObject({ success: true, skipped: true, reason: 'ownership_lost' });
    // the completion write is gated by the ownership token, not a bare { projectId }
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { projectId: 'p1', autoEditStatus: 'directing' },
      expect.objectContaining({ $set: expect.objectContaining({ autoEditStatus: 'complete' }) }),
    );
    // post-director bookkeeping never runs on a project we no longer own
    expect(mocks.recordProjectOutcome).not.toHaveBeenCalled();
  });

  it('happy path: still `directing` → completion applies and bookkeeping runs', async () => {
    mocks.findOneAndUpdate.mockResolvedValue(autoLock);
    mocks.findOne.mockResolvedValue({});
    mocks.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }); // still ours
    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.skipped).toBeUndefined();
    expect(body).toHaveProperty('completionHealth');
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { projectId: 'p1', autoEditStatus: 'directing' },
      expect.anything(),
    );
    expect(mocks.recordProjectOutcome).toHaveBeenCalled();
  });
});
