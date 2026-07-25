import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface ChatBattleSessionDescriptor {
  sessionId: string;
  userId?: string;
}

interface BearerIdentity {
  subject?: string;
  expiresAtMs?: number;
}

interface ReadChatBattleAuthOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  sessionFile?: string;
}

const REFRESH_SKEW_MS = 20_000;

export async function readRotatingChatBattleAuthHeaders(
  headerFile: string,
  options: ReadChatBattleAuthOptions = {},
): Promise<Record<string, string>> {
  const authPath = path.resolve(headerFile);
  const headers = stringEntries(JSON.parse(await readFile(authPath, 'utf8')));
  if (!headers.cookie && !headers.authorization) {
    throw new Error('Auth header file must contain cookie or authorization.');
  }

  const bearer = bearerIdentity(headers.authorization);
  if (!bearer) return headers;

  const now = options.now?.() ?? Date.now();
  if (bearer.expiresAtMs == null || bearer.expiresAtMs - now > REFRESH_SKEW_MS) {
    return headers;
  }

  const sessionPath = options.sessionFile
    ? path.resolve(options.sessionFile)
    : companionSessionPath(authPath);
  const descriptor = await readSessionDescriptor(sessionPath);
  if (!descriptor) {
    throw new Error(
      `Clerk bearer token is expired or near expiry and ${sessionPath} is missing. `
      + 'Provide the server-owned battle session descriptor instead of reusing a static token.',
    );
  }

  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY is required to rotate the chat battle session token.');
  }

  const response = await (options.fetchImpl ?? fetch)(
    `https://api.clerk.com/v1/sessions/${encodeURIComponent(descriptor.sessionId)}/tokens`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secretKey}`,
        'content-type': 'application/json',
      },
      body: '{}',
    },
  );
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `Clerk session token refresh failed HTTP ${response.status}: ${raw.slice(0, 500)}`,
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = asRecord(JSON.parse(raw));
  } catch {
    throw new Error('Clerk session token refresh returned invalid JSON.');
  }
  const jwt = stringValue(payload.jwt) ?? stringValue(payload.token);
  if (!jwt) throw new Error('Clerk session token refresh did not return a JWT.');

  const refreshed = bearerIdentity(`Bearer ${jwt}`);
  if (!refreshed?.subject || refreshed.expiresAtMs == null || refreshed.expiresAtMs <= now) {
    throw new Error('Clerk session token refresh returned an invalid or expired JWT.');
  }
  const expectedUserId = descriptor.userId ?? bearer.subject;
  if (expectedUserId && refreshed.subject !== expectedUserId) {
    throw new Error(
      `Clerk session user mismatch: expected ${expectedUserId}, received ${refreshed.subject}.`,
    );
  }

  const rotated = { ...headers, authorization: `Bearer ${jwt}` };
  await writeFile(authPath, `${JSON.stringify(rotated, null, 2)}\n`, 'utf8');
  return rotated;
}

export function bearerIdentity(authorization: string | undefined): BearerIdentity | null {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const parts = match[1].split('.');
  if (parts.length !== 3) return { };
  try {
    const payload = asRecord(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')));
    const expiresAt = numberValue(payload.exp);
    return {
      ...(stringValue(payload.sub) ? { subject: stringValue(payload.sub) } : {}),
      ...(expiresAt != null ? { expiresAtMs: expiresAt * 1_000 } : {}),
    };
  } catch {
    return { };
  }
}

function companionSessionPath(authPath: string): string {
  return authPath.toLowerCase().endsWith('.json')
    ? `${authPath.slice(0, -5)}-session.json`
    : `${authPath}.session.json`;
}

async function readSessionDescriptor(filePath: string): Promise<ChatBattleSessionDescriptor | null> {
  try {
    const value = asRecord(JSON.parse(await readFile(filePath, 'utf8')));
    const sessionId = stringValue(value.sessionId);
    if (!sessionId) throw new Error(`${filePath} is missing sessionId.`);
    return {
      sessionId,
      ...(stringValue(value.userId) ? { userId: stringValue(value.userId) } : {}),
    };
  } catch (error) {
    if (asRecord(error).code === 'ENOENT') return null;
    throw error;
  }
}

function stringEntries(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asRecord(value))
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
