import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createTools: vi.fn(),
  loadProject: vi.fn(),
  directRateLimit: vi.fn(),
  expensiveRateLimit: vi.fn(),
  executeDirectorPlan: vi.fn(),
  receiverVerify: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/agent/tools', () => ({ createTools: mocks.createTools }));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { loadProject: mocks.loadProject },
}));
vi.mock('@/lib/editron/utils/rate-limiter', () => ({
  checkDirectToolRateLimit: mocks.directRateLimit,
  checkExpensiveRateLimit: mocks.expensiveRateLimit,
}));
vi.mock('@/lib/editron/agent/director-agent', () => ({
  executeDirectorPlan: mocks.executeDirectorPlan,
}));
vi.mock('@upstash/qstash', () => ({
  Receiver: class {
    verify = mocks.receiverVerify;
  },
}));

import { POST as invokeDirectTool } from '@/app/api/services/editron/chat/tool-call/route';
import { POST as executeDirector } from '@/app/api/services/editron/director/execute/route';

function request(path: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-key');
  vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-key');
  mocks.auth.mockResolvedValue({ userId: 'user-1' });
  mocks.loadProject.mockResolvedValue({ projectId: 'project-1', userId: 'user-1' });
  mocks.directRateLimit.mockResolvedValue({ success: true, limit: 60, remaining: 59, reset: Date.now() + 60_000 });
  mocks.expensiveRateLimit.mockResolvedValue({ success: true, limit: 50, remaining: 49, reset: Date.now() + 60_000 });
  mocks.executeDirectorPlan.mockResolvedValue({ success: true });
  mocks.receiverVerify.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Editron direct tool-call capability boundary', () => {
  it('rejects provider-backed tools before creating or invoking the full tool registry', async () => {
    const expensiveInvoke = vi.fn();
    mocks.createTools.mockReturnValue([{ name: 'generate_html_scene', invoke: expensiveInvoke }]);

    const response = await invokeDirectTool(request('/api/services/editron/chat/tool-call', {
      projectId: 'project-1',
      toolName: 'generate_html_scene',
      params: { prompt: 'spend Gemini credits' },
    }));

    expect(response.status).toBe(403);
    expect(mocks.createTools).not.toHaveBeenCalled();
    expect(expensiveInvoke).not.toHaveBeenCalled();
  });

  it('rate-limits before loading the project or invoking a tool', async () => {
    mocks.directRateLimit.mockResolvedValue({ success: false, limit: 60, remaining: 0, reset: 12345, reason: 'limited' });

    const response = await invokeDirectTool(request('/api/services/editron/chat/tool-call', {
      projectId: 'project-1',
      toolName: 'add_transition',
      params: { type: 'dissolve', applyToAll: true },
    }));

    expect(response.status).toBe(429);
    expect(mocks.loadProject).not.toHaveBeenCalled();
    expect(mocks.createTools).not.toHaveBeenCalled();
  });

  it('fails closed when the production limiter is unavailable', async () => {
    mocks.directRateLimit.mockResolvedValue({ success: false, limit: 60, remaining: 0, reset: 12345, reason: 'unavailable' });

    const response = await invokeDirectTool(request('/api/services/editron/chat/tool-call', {
      projectId: 'project-1',
      toolName: 'add_transition',
      params: {},
    }));

    expect(response.status).toBe(503);
    expect(mocks.loadProject).not.toHaveBeenCalled();
  });

  it('rejects a project the authenticated user does not own', async () => {
    mocks.loadProject.mockResolvedValue(null);

    const response = await invokeDirectTool(request('/api/services/editron/chat/tool-call', {
      projectId: 'other-project',
      toolName: 'batch_edit_captions',
      params: {},
    }));

    expect(response.status).toBe(404);
    expect(mocks.loadProject).toHaveBeenCalledWith('user-1', 'other-project');
    expect(mocks.createTools).not.toHaveBeenCalled();
  });

  it('allows an owned deterministic direct tool capability', async () => {
    const invoke = vi.fn(async () => JSON.stringify({ status: 'success', data: { transitionsApplied: 1 } }));
    mocks.createTools.mockReturnValue([{ name: 'add_transition', invoke }]);

    const response = await invokeDirectTool(request('/api/services/editron/chat/tool-call', {
      projectId: 'project-1',
      toolName: 'add_transition',
      params: { type: 'dissolve', applyToAll: true },
    }));

    expect(response.status).toBe(200);
    expect(mocks.loadProject).toHaveBeenCalledWith('user-1', 'project-1');
    expect(invoke).toHaveBeenCalledWith({ type: 'dissolve', applyToAll: true });
  });
});

describe('Editron Director internal dispatch authentication', () => {
  it('does not trust Upstash header presence when signature verification fails', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.receiverVerify.mockRejectedValue(new Error('invalid signature'));

    const response = await executeDirector(request('/api/services/editron/director/execute', {
      projectId: 'project-1',
      editProfileId: 'G-01',
      userId: 'victim-user',
      _internal: true,
    }, { 'upstash-signature': 'forged' }));

    expect(response.status).toBe(401);
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
  });

  it('fails closed when production signing keys are unavailable', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '');

    const response = await executeDirector(request('/api/services/editron/director/execute', {
      projectId: 'project-1',
      editProfileId: 'G-01',
      userId: 'signed-user',
      _internal: true,
    }, { 'upstash-signature': 'present' }));

    expect(response.status).toBe(503);
    expect(mocks.receiverVerify).not.toHaveBeenCalled();
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
  });

  it('uses the signed payload user only after Receiver verification succeeds', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await executeDirector(request('/api/services/editron/director/execute', {
      projectId: 'project-1',
      editProfileId: 'G-01',
      userId: 'signed-user',
      _internal: true,
    }, { 'upstash-signature': 'valid-signature' }));

    expect(response.status).toBe(200);
    expect(mocks.receiverVerify).toHaveBeenCalledOnce();
    expect(mocks.executeDirectorPlan).toHaveBeenCalledWith('project-1', 'signed-user', 'G-01', undefined);
  });

  it('never lets an authenticated caller impersonate the body user', async () => {
    mocks.auth.mockResolvedValue({ userId: 'clerk-user' });

    const response = await executeDirector(request('/api/services/editron/director/execute', {
      projectId: 'project-1',
      editProfileId: 'G-01',
      userId: 'victim-user',
    }));

    expect(response.status).toBe(200);
    expect(mocks.receiverVerify).not.toHaveBeenCalled();
    expect(mocks.executeDirectorPlan).toHaveBeenCalledWith('project-1', 'clerk-user', 'G-01', undefined);
  });
});
