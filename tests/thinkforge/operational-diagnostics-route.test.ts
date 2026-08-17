import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyAdminForApi: vi.fn(),
  getDiagnostics: vi.fn(),
}));

vi.mock('@/lib/auth/adminAuth', () => ({ verifyAdminForApi: mocks.verifyAdminForApi }));
vi.mock('@/lib/thinkforge/operations/operational-diagnostics', () => ({
  getThinkForgeOperationalDiagnostics: mocks.getDiagnostics,
}));

describe('ThinkForge operational diagnostics route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.verifyAdminForApi.mockResolvedValue({ isAdmin: true });
    mocks.getDiagnostics.mockResolvedValue({ version: 1, alerts: [] });
  });

  it('fails closed before querying diagnostics when the caller is not an admin', async () => {
    const denied = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    mocks.verifyAdminForApi.mockResolvedValue({ isAdmin: false, response: denied });
    const { GET } = await import('@/app/api/admin/thinkforge/diagnostics/route');

    const response = await GET(new Request('http://localhost/api/admin/thinkforge/diagnostics'));

    expect(response).toBe(denied);
    expect(mocks.getDiagnostics).not.toHaveBeenCalled();
  });

  it('requires an exact session/document pair for trace inspection', async () => {
    const { GET } = await import('@/app/api/admin/thinkforge/diagnostics/route');

    const response = await GET(new Request(
      'http://localhost/api/admin/thinkforge/diagnostics?sessionId=session_1',
    ));

    expect(response.status).toBe(400);
    expect(mocks.getDiagnostics).not.toHaveBeenCalled();
  });

  it('returns projected operational evidence for an admin', async () => {
    const { GET } = await import('@/app/api/admin/thinkforge/diagnostics/route');

    const response = await GET(new Request(
      'http://localhost/api/admin/thinkforge/diagnostics?sessionId=session_1&scriptId=script_1',
    ));

    expect(response.status).toBe(200);
    expect(mocks.getDiagnostics).toHaveBeenCalledWith({
      sessionId: 'session_1',
      scriptId: 'script_1',
    });
    expect(await response.json()).toEqual({
      ok: true,
      diagnostics: { version: 1, alerts: [] },
    });
  });

  it('redacts operational exceptions from the response', async () => {
    mocks.getDiagnostics.mockRejectedValue(new Error('mongodb://user:secret@internal/private'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { GET } = await import('@/app/api/admin/thinkforge/diagnostics/route');

    const response = await GET(new Request('http://localhost/api/admin/thinkforge/diagnostics'));

    expect(response.status).toBe(503);
    const responseText = await response.text();
    expect(JSON.parse(responseText)).toEqual({
      ok: false,
      error: 'ThinkForge operational diagnostics are unavailable.',
    });
    expect(responseText).not.toContain('mongodb://');
    errorSpy.mockRestore();
  });
});
