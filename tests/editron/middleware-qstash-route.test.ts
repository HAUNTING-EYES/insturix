import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  protect: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  createRouteMatcher: (patterns: string[]) => {
    const regexes = patterns.map((pattern) => new RegExp(`^${pattern.replace(/\(\.\*\)/g, '.*')}$`));
    return (request: { nextUrl: { pathname: string } }) => regexes.some((regex) => regex.test(request.nextUrl.pathname));
  },
  clerkMiddleware: (
    handler: (auth: { protect: typeof mocks.protect }, request: { nextUrl: { pathname: string } }) => unknown,
  ) => (request: { nextUrl: { pathname: string } }) => handler({ protect: mocks.protect }, request),
}));

describe('Clerk middleware QStash boundaries', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.protect.mockReset();
    mocks.protect.mockResolvedValue(undefined);
  });

  it('lets the signed Editron batch callback reach its route-level Receiver verification', async () => {
    const middleware = (await import('../../middleware')).default as unknown as (
      request: { nextUrl: { pathname: string } },
    ) => Promise<void>;

    await middleware({ nextUrl: { pathname: '/api/services/editron/auto-edit/from-batch' } });

    expect(mocks.protect).not.toHaveBeenCalled();
  });

  it('continues protecting normal Editron service routes', async () => {
    const middleware = (await import('../../middleware')).default as unknown as (
      request: { nextUrl: { pathname: string } },
    ) => Promise<void>;

    await middleware({ nextUrl: { pathname: '/api/services/editron/projects/proj_1' } });

    expect(mocks.protect).toHaveBeenCalledOnce();
  });
});
