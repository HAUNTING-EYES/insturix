export type ThinkForgeDocumentIdentity = {
  sessionId: string;
  scriptId: string;
};

type IdentityCarrier = {
  sessionId?: unknown;
  scriptId?: unknown;
  metadata?: unknown;
};

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function createThinkForgeDocumentKey(identity: ThinkForgeDocumentIdentity): string {
  return `${identity.sessionId}:${identity.scriptId}`;
}

export function readThinkForgeDocumentIdentity(value: unknown): ThinkForgeDocumentIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const carrier = value as IdentityCarrier;
  const metadata = carrier.metadata && typeof carrier.metadata === 'object'
    ? carrier.metadata as Record<string, unknown>
    : {};
  const sessionId = readNonEmptyString(carrier.sessionId)
    || readNonEmptyString(metadata.sessionId);
  const scriptId = readNonEmptyString(carrier.scriptId)
    || readNonEmptyString(metadata.scriptId);

  return sessionId && scriptId ? { sessionId, scriptId } : null;
}

export function matchesThinkForgeDocumentIdentity(
  value: unknown,
  expected: ThinkForgeDocumentIdentity,
): boolean {
  const actual = readThinkForgeDocumentIdentity(value);
  return actual?.sessionId === expected.sessionId && actual.scriptId === expected.scriptId;
}

export function stampThinkForgeDocumentIdentity<T extends Record<string, any>>(
  value: T,
  identity: ThinkForgeDocumentIdentity,
): T & ThinkForgeDocumentIdentity {
  const metadata = value.metadata && typeof value.metadata === 'object'
    ? value.metadata as Record<string, unknown>
    : {};

  return {
    ...value,
    sessionId: identity.sessionId,
    scriptId: identity.scriptId,
    metadata: {
      ...metadata,
      sessionId: identity.sessionId,
      scriptId: identity.scriptId,
    },
  };
}
