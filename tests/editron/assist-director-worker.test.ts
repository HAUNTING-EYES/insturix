/**
 * Director Mode — director worker HANDLER assist guard. Proves the production
 * Stage-2 director site (the plan's corrected anchor) hands the pen to the user:
 * an assist project reaches ready_for_chat and the Director NEVER runs, while
 * auto is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: any) => handler),
  updateOne: vi.fn(),
  findOne: vi.fn(),
  executeDirectorPlan: vi.fn(),
  claimDirectorRunV1: vi.fn(),
  completeDirectorRunV1: vi.fn(),
  failDirectorRunV1: vi.fn(),
  recordProjectOutcome: vi.fn(async () => ({ recorded: true })),
  settleAssistScanFailure: vi.fn(),
}));

vi.mock('@upstash/qstash/nextjs', () => ({ verifySignatureAppRouter: mocks.verifySignatureAppRouter }));
vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({ collection: () => ({ updateOne: mocks.updateOne, findOne: mocks.findOne }) })),
}));
vi.mock('@/lib/editron/agent/director-agent', () => ({ executeDirectorPlan: mocks.executeDirectorPlan }));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    claimDirectorRunV1: mocks.claimDirectorRunV1,
    completeDirectorRunV1: mocks.completeDirectorRunV1,
    failDirectorRunV1: mocks.failDirectorRunV1,
  },
}));
vi.mock('@/lib/editron/services/assist-lane', () => ({
  ASSIST_STATUS_READY: 'ready_for_chat',
  isAssistProject: (project: { editMode?: string }) => project.editMode === 'assist',
  settleAssistScanFailure: mocks.settleAssistScanFailure,
}));
vi.mock('@/lib/editron/services/editron-learning-gate', () => ({
  resolveDirectorCompletionHealth: () => ({ autoEditStatus: 'complete', needsQualityAttention: false, qualityScore: 0.9, criticalCount: 0 }),
}));
vi.mock('@/lib/editron/services/genre-parameter-bandit', () => ({ recordProjectOutcome: mocks.recordProjectOutcome }));

import { POST } from '@/app/api/internal/workers/director/route';

const request = (body: Record<string, unknown>) => new Request('http://localhost/api/internal/workers/director', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never;

const terminalReceipt = {
  schemaVersion: 1,
  projectId: 'p1',
  revision: { schemaVersion: 1, value: 9, compatibilityUpdatedAt: '2026-08-25T00:00:09.000Z' },
  committedAt: '2026-08-25T00:00:09.000Z',
};

const autoProject = {
  projectId: 'p1',
  userId: 'u1',
  editMode: 'auto',
  autoEditStatus: 'directing',
};

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  mocks.findOne.mockResolvedValue({});
  mocks.executeDirectorPlan.mockResolvedValue({
    success: true,
    actionsExecuted: 3,
    decisionAuthority: {},
    terminalProjectReceipt: terminalReceipt,
  });
  mocks.claimDirectorRunV1.mockResolvedValue({
    disposition: 'CLAIMED',
    project: autoProject,
    runToken: 'director_run_12345678901234567890',
    receipt: terminalReceipt,
  });
  mocks.completeDirectorRunV1.mockResolvedValue({ disposition: 'RECORDED', receipt: terminalReceipt });
  mocks.failDirectorRunV1.mockResolvedValue({ disposition: 'RECORDED', receipt: terminalReceipt });
  mocks.recordProjectOutcome.mockResolvedValue({ recorded: true });
  mocks.settleAssistScanFailure.mockResolvedValue('settled');
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
    expect(mocks.claimDirectorRunV1).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
  });

  it('returns a retryable response while the exact analysis dispatch publication is pending', async () => {
    mocks.claimDirectorRunV1.mockResolvedValue({ disposition: 'DISPATCH_PENDING' });

    const response = await POST(request({
      projectId: 'p1', userId: 'u1', profileId: 'A-01',
      analysisRunId: 'analysis_run_12345678901234567890',
      analysisDirectorDispatchId: 'editron_director_dispatch_exact',
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { code: 'DIRECTOR_DISPATCH_PENDING', projectId: 'p1' },
    });
    expect(mocks.claimDirectorRunV1).toHaveBeenCalledWith('u1', 'p1', {
      analysisRunId: 'analysis_run_12345678901234567890',
      analysisDirectorDispatchId: 'editron_director_dispatch_exact',
    });
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
});

describe('director worker assist guard', () => {
  it('assist: hands the pen to the user — ready_for_chat, Director never runs', async () => {
    mocks.claimDirectorRunV1.mockResolvedValue({
      disposition: 'ASSIST_PROJECT',
      project: { projectId: 'p1', userId: 'u1', editMode: 'assist', autoEditStatus: 'ready_for_chat' },
      receipt: terminalReceipt,
    });
    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));
    const body = await res.json();

    expect(body).toMatchObject({ success: true, status: 'ready_for_chat', directorSkipped: true });
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
  });

  it('does not report success for an uncommitted Assist claim', async () => {
    mocks.claimDirectorRunV1.mockResolvedValue({
      disposition: 'ASSIST_PROJECT',
      project: { projectId: 'p1', userId: 'u1', editMode: 'assist', autoEditStatus: 'analysis_complete' },
      receipt: terminalReceipt,
    });
    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('uncommitted assist Director claim'),
    });
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.settleAssistScanFailure).not.toHaveBeenCalled();
  });

  it('already-settled: owner rejects the claim, so no Director or status write occurs', async () => {
    mocks.claimDirectorRunV1.mockResolvedValue({ disposition: 'NOT_ELIGIBLE' });
    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));
    const body = await res.json();
    expect(body).toMatchObject({ success: true, skipped: true });
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
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
  it('resurrection blocked: completion no-ops + skips bookkeeping when the project left `directing` mid-run', async () => {
    mocks.findOne.mockResolvedValue({});                          // projectAfterDirector (quality read)
    mocks.completeDirectorRunV1.mockResolvedValue({ disposition: 'OWNERSHIP_LOST' });
    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));
    const body = await res.json();

    expect(mocks.executeDirectorPlan).toHaveBeenCalled();         // we DID reach completion — not an early skip
    expect(body).toMatchObject({ success: true, skipped: true, reason: 'ownership_lost' });
    expect(mocks.completeDirectorRunV1).toHaveBeenCalledWith('u1', 'p1', expect.objectContaining({
      directorRunToken: 'director_run_12345678901234567890',
      expectedRevision: terminalReceipt.revision,
      terminalReceipt,
    }));
    expect(mocks.updateOne).not.toHaveBeenCalled();
    // post-director bookkeeping never runs on a project we no longer own
    expect(mocks.recordProjectOutcome).not.toHaveBeenCalled();
  });

  it('happy path: still `directing` → completion applies and bookkeeping runs', async () => {
    mocks.findOne.mockResolvedValue({});
    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.skipped).toBeUndefined();
    expect(body).toHaveProperty('completionHealth');
    expect(mocks.executeDirectorPlan).toHaveBeenCalledWith('p1', 'u1', 'A-01', undefined, expect.objectContaining({
      persistProjectProgress: true,
      deferProjectStatusTransitions: true,
    }));
    expect(mocks.completeDirectorRunV1).toHaveBeenCalledWith('u1', 'p1', expect.objectContaining({
      directorRunToken: 'director_run_12345678901234567890',
      expectedRevision: terminalReceipt.revision,
      terminalReceipt,
    }));
    expect(mocks.recordProjectOutcome).toHaveBeenCalled();
  });

  it('treats malformed legacy claim metadata as absent without bypassing ProjectService completion', async () => {
    mocks.claimDirectorRunV1.mockResolvedValue({
      disposition: 'CLAIMED',
      project: {
        ...autoProject,
        rawFootageAnalysis: { contentTypeDetection: { contentType: 42, confidence: 'high' } },
        referenceEditDNA: 'not-an-object',
        editorialPreferences: [],
        productionBrief: 'not-an-object',
        autoEditStartedAt: 'not-a-date',
      },
      runToken: 'director_run_12345678901234567890',
      receipt: terminalReceipt,
    });

    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));

    expect(res.status).toBe(200);
    expect(mocks.executeDirectorPlan).toHaveBeenCalledWith('p1', 'u1', 'A-01', undefined, expect.any(Object));
    expect(mocks.completeDirectorRunV1).toHaveBeenCalledWith('u1', 'p1', expect.objectContaining({
      directorRunToken: 'director_run_12345678901234567890',
      totalPipelineMs: expect.any(Number),
    }));
  });

  it('treats a non-terminal Director result as a run failure instead of a successful completion', async () => {
    mocks.executeDirectorPlan.mockResolvedValue({ success: false, actionsExecuted: 0 });

    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));

    expect(res.status).toBe(500);
    expect(mocks.completeDirectorRunV1).not.toHaveBeenCalled();
    expect(mocks.failDirectorRunV1).toHaveBeenCalledWith('u1', 'p1', expect.objectContaining({
      directorRunToken: 'director_run_12345678901234567890',
      errorMessage: expect.stringContaining('terminal ProjectService receipt'),
    }));
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('uses the active run owner for runtime failure and never falls back to a raw project update', async () => {
    mocks.executeDirectorPlan.mockRejectedValue(new Error('render failure'));

    const res = await POST(request({ projectId: 'p1', userId: 'u1', profileId: 'A-01' }));

    expect(res.status).toBe(500);
    expect(mocks.failDirectorRunV1).toHaveBeenCalledWith('u1', 'p1', {
      directorRunToken: 'director_run_12345678901234567890',
      errorMessage: 'Director: render failure',
    });
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
});
