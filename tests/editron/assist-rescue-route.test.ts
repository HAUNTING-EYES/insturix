/**
 * Director Mode rescue (Lane E) — the predicate gate + the route handler.
 * A failed auto-edit that KEPT its scans + timeline reopens as Director Mode for
 * free; anything else must be refused, and the flip must be atomic (a double-click
 * or race rescues once).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canRescueToDirectorMode } from '@/lib/editron/services/assist-lane-predicates';

const failedAuto = (over: Record<string, unknown> = {}) => ({
  editMode: 'auto',
  autoEditStatus: 'failed',
  overlays: [{ type: 'video', assetId: 'v1' }],
  rawFootageAnalysis: { transcription: { words: [] } },
  ...over,
});

describe('canRescueToDirectorMode (the shared gate)', () => {
  it('rescues a director-stage failure that kept a timeline + scan evidence', () => {
    expect(canRescueToDirectorMode(failedAuto())).toBe(true);
    expect(canRescueToDirectorMode(failedAuto({ rawFootageAnalysis: undefined, segmentAnalysis: { segments: [] } }))).toBe(true);
  });

  it('refuses when the substrate is missing (pre-director failure = refunded, no free giveaway)', () => {
    expect(canRescueToDirectorMode(failedAuto({ overlays: [] }))).toBe(false);           // no timeline
    expect(canRescueToDirectorMode(failedAuto({ overlays: [{ type: 'caption' }] }))).toBe(false); // no visual clip
    expect(canRescueToDirectorMode(failedAuto({ rawFootageAnalysis: undefined, segmentAnalysis: undefined }))).toBe(false); // no scans
  });

  it('refuses non-failure statuses, already-assist, refunded, and garbage', () => {
    expect(canRescueToDirectorMode(failedAuto({ autoEditStatus: 'complete' }))).toBe(false);
    expect(canRescueToDirectorMode(failedAuto({ autoEditStatus: 'directing' }))).toBe(false);
    expect(canRescueToDirectorMode(failedAuto({ autoEditStatus: 'needs_input' }))).toBe(false); // coverage gap has no timeline — upload UI, not rescue
    expect(canRescueToDirectorMode(failedAuto({ editMode: 'assist' }))).toBe(false);       // already Director Mode
    expect(canRescueToDirectorMode(failedAuto({ editMode: 'assist', autoEditStatus: 'scan_failed' }))).toBe(false); // refunded
    expect(canRescueToDirectorMode(null)).toBe(false);
    expect(canRescueToDirectorMode('x')).toBe(false);
  });

  it('P0: a REFUNDED failure with a full substrate is NOT free-rescuable (from-batch dispatch-fail window)', () => {
    // from-batch persists overlays + rawFootageAnalysis, THEN the director dispatch
    // throws → the catch refunds AND marks autoEditRefunded. The project looks
    // rescuable but the user already got their money back — must be refused.
    expect(canRescueToDirectorMode(failedAuto({ autoEditRefunded: true }))).toBe(false);
    // Belt: a re-charged retry clears the mark (autoEditRefunded:false) → rescuable again.
    expect(canRescueToDirectorMode(failedAuto({ autoEditRefunded: false }))).toBe(true);
  });
});

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  loadProjectForMutation: vi.fn(),
  rescueFailedAutoEditToAssistV1: vi.fn(),
}));
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/services/project-service', () => ({
  ProjectMutationConflictError: class ProjectMutationConflictError extends Error {},
  ProjectNotFoundOrForbiddenError: class ProjectNotFoundOrForbiddenError extends Error {},
  projectService: {
    loadProjectForMutation: mocks.loadProjectForMutation,
    rescueFailedAutoEditToAssistV1: mocks.rescueFailedAutoEditToAssistV1,
  },
}));

import { POST } from '@/app/api/services/editron/auto-edit/rescue/route';

const request = (body: unknown) => new Request('http://localhost/api/services/editron/auto-edit/rescue', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never;

const oldEnv = { ...process.env };
const snapshot = {
  project: failedAuto(),
  revision: { schemaVersion: 1 as const, value: 7, compatibilityUpdatedAt: '2026-09-01T00:00:00.000Z' },
};
beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  process.env = { ...oldEnv, DIRECTOR_MODE_ENABLED: 'true' };
  mocks.auth.mockResolvedValue({ userId: 'user_1' });
  mocks.loadProjectForMutation.mockResolvedValue(snapshot);
  mocks.rescueFailedAutoEditToAssistV1.mockResolvedValue({ disposition: 'RESCUED' });
});

describe('rescue route handler', () => {
  it('401 unauth, 403 when flag off, 400 bad body', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(request({ projectId: 'p' }))).status).toBe(401);

    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    process.env.DIRECTOR_MODE_ENABLED = 'false';
    expect((await POST(request({ projectId: 'p' }))).status).toBe(403);

    process.env.DIRECTOR_MODE_ENABLED = 'true';
    expect((await POST(request({ projectId: { $ne: null } }))).status).toBe(400);
    expect(mocks.loadProjectForMutation).not.toHaveBeenCalled();
  });

  it('404 unknown, 409 when not rescuable — no write', async () => {
    const { ProjectNotFoundOrForbiddenError } = await import('@/lib/editron/services/project-service');
    mocks.loadProjectForMutation.mockRejectedValueOnce(new ProjectNotFoundOrForbiddenError());
    expect((await POST(request({ projectId: 'p' }))).status).toBe(404);

    mocks.rescueFailedAutoEditToAssistV1.mockResolvedValueOnce({ disposition: 'NOT_ELIGIBLE' });
    const res = await POST(request({ projectId: 'p' }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('not_rescuable');
  });

  it('P0: the server refuses a refunded-but-full-substrate project — no free giveaway', async () => {
    mocks.rescueFailedAutoEditToAssistV1.mockResolvedValueOnce({ disposition: 'NOT_ELIGIBLE' });
    const res = await POST(request({ projectId: 'p' }));
    expect(res.status).toBe(409);
  });

  it('delegates the exact server revision to the atomic rescue owner', async () => {
    const payload = await (await POST(request({ projectId: 'p' }))).json();
    expect(payload).toMatchObject({ success: true, status: 'ready_for_chat' });
    expect(mocks.rescueFailedAutoEditToAssistV1).toHaveBeenCalledWith(
      'user_1',
      'p',
      { expectedRevision: snapshot.revision },
    );
  });

  it('maps an already-rescued outcome idempotently and a revision race to 409', async () => {
    mocks.rescueFailedAutoEditToAssistV1.mockResolvedValueOnce({ disposition: 'ALREADY_RESCUED' });
    const already = await (await POST(request({ projectId: 'p' }))).json();
    expect(already).toMatchObject({ success: true, alreadyRescued: true });

    const { ProjectMutationConflictError } = await import('@/lib/editron/services/project-service');
    mocks.rescueFailedAutoEditToAssistV1.mockRejectedValueOnce(new ProjectMutationConflictError(snapshot.revision));
    const conflict = await POST(request({ projectId: 'p' }));
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('project_changed');
  });
});
