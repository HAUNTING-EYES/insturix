import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bearerIdentity,
  readRotatingChatBattleAuthHeaders,
} from '../../scripts/chat-edit-battle-auth';

const originalSecret = process.env.CLERK_SECRET_KEY;

afterEach(() => {
  process.env.CLERK_SECRET_KEY = originalSecret;
  vi.restoreAllMocks();
});

describe('chat battle rotating auth', () => {
  it('reuses a bearer token that is not near expiry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'chat-battle-auth-'));
    const authPath = path.join(root, 'live-auth.json');
    const token = jwt({ sub: 'user-a', exp: 2_000 });
    await writeFile(authPath, JSON.stringify({ authorization: `Bearer ${token}` }));
    const fetchImpl = vi.fn();

    const headers = await readRotatingChatBattleAuthHeaders(authPath, {
      now: () => 1_000_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(headers.authorization).toBe(`Bearer ${token}`);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rotates an expired token and persists the replacement', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'chat-battle-auth-'));
    const authPath = path.join(root, 'live-auth.json');
    const sessionPath = path.join(root, 'live-auth-session.json');
    await writeFile(authPath, JSON.stringify({
      authorization: `Bearer ${jwt({ sub: 'user-a', exp: 900 })}`,
    }));
    await writeFile(sessionPath, JSON.stringify({ sessionId: 'sess-a', userId: 'user-a' }));
    process.env.CLERK_SECRET_KEY = 'sk_test_secret';
    const replacement = jwt({ sub: 'user-a', exp: 2_000 });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ jwt: replacement })));

    const headers = await readRotatingChatBattleAuthHeaders(authPath, {
      now: () => 1_000_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.clerk.com/v1/sessions/sess-a/tokens',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
    expect(headers.authorization).toBe(`Bearer ${replacement}`);
    expect(JSON.parse(await readFile(authPath, 'utf8'))).toEqual(headers);
  });

  it('rejects a refreshed token for a different user', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'chat-battle-auth-'));
    const authPath = path.join(root, 'live-auth.json');
    await writeFile(authPath, JSON.stringify({
      authorization: `Bearer ${jwt({ sub: 'user-a', exp: 900 })}`,
    }));
    await writeFile(
      path.join(root, 'live-auth-session.json'),
      JSON.stringify({ sessionId: 'sess-a', userId: 'user-a' }),
    );
    process.env.CLERK_SECRET_KEY = 'sk_test_secret';
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      jwt: jwt({ sub: 'user-b', exp: 2_000 }),
    })));

    await expect(readRotatingChatBattleAuthHeaders(authPath, {
      now: () => 1_000_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('expected user-a, received user-b');
  });

  it('parses Clerk bearer identity without exposing the token', () => {
    expect(bearerIdentity(`Bearer ${jwt({ sub: 'user-a', exp: 123 })}`)).toEqual({
      subject: 'user-a',
      expiresAtMs: 123_000,
    });
  });
});

function jwt(payload: Record<string, unknown>): string {
  return [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');
}
