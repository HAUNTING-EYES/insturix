/**
 * Director Mode — chat/tool-call HANDLER gate (battle-lane P1-6 loophole fix).
 * A refunded scan_failed assist project must be inert to mutation on EVERY
 * endpoint, not just chat/stream. Drives the real POST handler.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  loadProject: vi.fn(),
  invoke: vi.fn(async () => JSON.stringify({ status: 'success' })),
  rateLimit: vi.fn(async () => ({ success: true })),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/services/project-service', () => ({ projectService: { loadProject: mocks.loadProject } }));
vi.mock('@/lib/editron/utils/rate-limiter', () => ({ checkDirectToolRateLimit: mocks.rateLimit }));
vi.mock('@/lib/editron/agent/tools', () => ({
  createTools: () => [{ name: 'add_transition', invoke: mocks.invoke }, { name: 'batch_edit_captions', invoke: mocks.invoke }],
}));

import { POST } from '@/app/api/services/editron/chat/tool-call/route';

const request = (body: Record<string, unknown>) => new Request('http://localhost/api/services/editron/chat/tool-call', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never;

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.auth.mockResolvedValue({ userId: 'user_1' });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.invoke.mockResolvedValue(JSON.stringify({ status: 'success' }));
});

describe('chat/tool-call assist gate', () => {
  it('403s a refunded scan_failed assist project — the tool never runs', async () => {
    mocks.loadProject.mockResolvedValue({ projectId: 'p1', editMode: 'assist', autoEditStatus: 'scan_failed' });
    const res = await POST(request({ projectId: 'p1', toolName: 'add_transition', params: {} }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe('assist_scan_failed');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('allows a healthy assist project (ready_for_chat) — the direct tool runs', async () => {
    mocks.loadProject.mockResolvedValue({ projectId: 'p1', editMode: 'assist', autoEditStatus: 'ready_for_chat' });
    const res = await POST(request({ projectId: 'p1', toolName: 'add_transition', params: {} }));
    expect(res.status).toBe(200);
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });

  it('never gates an auto project, even one that somehow reads failed', async () => {
    mocks.loadProject.mockResolvedValue({ projectId: 'p1', editMode: 'auto', autoEditStatus: 'failed' });
    const res = await POST(request({ projectId: 'p1', toolName: 'add_transition', params: {} }));
    expect(res.status).toBe(200);
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });
});
