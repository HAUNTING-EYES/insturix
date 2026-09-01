type UnknownRecord = Record<string, unknown>;

export interface DirectorDeliveryFailure {
  projectId: string;
  userId: string;
  sourceMessageId: string;
  pipelineDirectorDispatchToken: string;
  status: number;
  retried: number;
  maxRetries: number;
  dlqId?: string;
  errorMessage: string;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function boundedInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function decodeBase64Text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return boundedString(Buffer.from(value, 'base64').toString('utf8'), maxLength);
  } catch {
    return undefined;
  }
}

function decodeSourcePayload(value: unknown): UnknownRecord | null {
  const decoded = decodeBase64Text(value, 64_000);
  if (!decoded) return null;
  try {
    return asRecord(JSON.parse(decoded));
  } catch {
    return null;
  }
}

export function parseDirectorDeliveryFailure(raw: unknown): DirectorDeliveryFailure {
  const envelope = asRecord(raw);
  if (!envelope) throw new Error('Director failure callback body must be an object');

  const source = decodeSourcePayload(envelope.sourceBody);
  if (!source) throw new Error('Director failure callback is missing a valid sourceBody');

  const projectId = boundedString(source.projectId, 160);
  const userId = boundedString(source.userId, 160);
  const sourceMessageId = boundedString(envelope.sourceMessageId, 200);
  const pipelineDirectorDispatchToken = boundedString(source.pipelineDirectorDispatchToken, 200);
  if (!projectId || !userId || !sourceMessageId || !pipelineDirectorDispatchToken) {
    throw new Error(
      'Director failure callback is missing projectId, userId, sourceMessageId, or pipelineDirectorDispatchToken',
    );
  }

  const status = boundedInteger(envelope.status);
  const responseDetail = decodeBase64Text(envelope.body, 320);
  const statusLabel = status > 0 ? `HTTP ${status}` : 'an unknown delivery error';
  const errorMessage = boundedString(
    `Director delivery failed with ${statusLabel}${responseDetail ? `: ${responseDetail}` : ''}`,
    500,
  ) as string;

  return {
    projectId,
    userId,
    sourceMessageId,
    pipelineDirectorDispatchToken,
    status,
    retried: boundedInteger(envelope.retried),
    maxRetries: boundedInteger(envelope.maxRetries),
    dlqId: boundedString(envelope.dlqId, 200),
    errorMessage,
  };
}

export function buildDirectorDeliveryFailureAudit(
  failure: DirectorDeliveryFailure,
  failedAt: Date,
): Record<string, unknown> {
  return {
    source: 'qstash-failure-callback',
    sourceMessageId: failure.sourceMessageId,
    pipelineDirectorDispatchToken: failure.pipelineDirectorDispatchToken,
    status: failure.status,
    retried: failure.retried,
    maxRetries: failure.maxRetries,
    ...(failure.dlqId ? { dlqId: failure.dlqId } : {}),
    error: failure.errorMessage,
    failedAt,
  };
}
