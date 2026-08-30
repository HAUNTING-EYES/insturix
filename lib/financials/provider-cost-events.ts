import { randomUUID } from 'node:crypto';
import {
  estimateProviderCost,
  estimateRevenueUsdFromCredits,
  PROVIDER_COST_PRICING_VERSION,
  type ProviderCostBasis,
  type ProviderCostUnits,
} from '@/lib/financials/provider-cost-estimates';

export const PROVIDER_COST_EVENTS_COLLECTION = 'provider_cost_events';

export type ProviderCostEventStatus = 'started' | 'success' | 'failed' | 'skipped' | 'refunded';

export interface ProviderCostEventInput {
  eventId?: string;
  idempotencyKey?: string;
  createdAt?: Date;
  status?: ProviderCostEventStatus;

  userId?: string;
  orgId?: string;
  projectId?: string;
  taskId?: string;
  assetId?: string;
  creditTransactionId?: string;

  service: string;
  action: string;
  route?: string;

  provider: string;
  model?: string;
  operation: string;

  chargedCredits?: number;
  revenueUsdEstimate?: number | null;
  estimatedCostUsd?: number | null;
  actualCostUsd?: number | null;
  pricingVersion?: string;
  costBasis?: ProviderCostBasis;

  vendorRequestId?: string;
  providerJobId?: string;
  units?: ProviderCostUnits;
  metadata?: Record<string, unknown>;
}

export interface ProviderCostEventDocument extends Required<Pick<ProviderCostEventInput, 'eventId' | 'createdAt' | 'status' | 'service' | 'action' | 'provider' | 'operation'>> {
  idempotencyKey?: string;
  userId?: string;
  orgId?: string;
  projectId?: string;
  taskId?: string;
  assetId?: string;
  creditTransactionId?: string;
  route?: string;
  model?: string;
  chargedCredits?: number;
  revenueUsdEstimate?: number | null;
  estimatedCostUsd: number | null;
  actualCostUsd?: number | null;
  pricingVersion: string;
  costBasis: ProviderCostBasis;
  missingPricing: boolean;
  vendorRequestId?: string;
  providerJobId?: string;
  units: ProviderCostUnits;
  metadata?: Record<string, unknown>;
}

export interface ProviderCostRecordResult {
  ok: boolean;
  eventId: string;
  inserted: boolean;
  duplicate: boolean;
  error?: string;
}

const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|cookie|api.?key|signature|signed.?url|url|uri|prompt|transcript|content|payload|body|base64|access.?token|refresh.?token)/i;
const URL_LIKE_PATTERN = /^https?:\/\//i;
const SECRET_LIKE_PATTERN = /\b(?:bearer\s+|sk-[A-Za-z0-9]|rzp_|xox[baprs]-|ghp_)/i;
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_KEYS = 60;
const MAX_ARRAY_ITEMS = 25;
const MAX_STRING_LENGTH = 500;

export function normalizeProviderCostEvent(input: ProviderCostEventInput): ProviderCostEventDocument {
  const units = sanitizeUnits(input.units);
  const estimate = estimateProviderCost(
    {
      provider: input.provider,
      model: input.model,
      operation: input.operation,
      units,
    },
    { pricingVersion: input.pricingVersion },
  );
  const chargedCredits = cleanNumber(input.chargedCredits);
  const hasNoProviderRequests = units.requestCount === 0;
  const costBasis = input.costBasis
    ?? (hasNoProviderRequests ? 'provider_usage' : estimate.costBasis);

  return stripUndefined({
    eventId: input.eventId ?? `pce_${randomUUID()}`,
    idempotencyKey: cleanString(input.idempotencyKey),
    createdAt: input.createdAt ?? new Date(),
    status: input.status ?? 'success',
    userId: cleanString(input.userId),
    orgId: cleanString(input.orgId),
    projectId: cleanString(input.projectId),
    taskId: cleanString(input.taskId),
    assetId: cleanString(input.assetId),
    creditTransactionId: cleanString(input.creditTransactionId),
    service: input.service,
    action: input.action,
    route: cleanString(input.route),
    provider: estimate.provider,
    model: estimate.model,
    operation: estimate.operation,
    chargedCredits,
    revenueUsdEstimate:
      input.revenueUsdEstimate !== undefined
        ? cleanNullableNumber(input.revenueUsdEstimate)
        : estimateRevenueUsdFromCredits(chargedCredits),
    estimatedCostUsd:
      (input.estimatedCostUsd !== undefined
        ? cleanNullableNumber(input.estimatedCostUsd)
        : hasNoProviderRequests
          ? 0
          : estimate.estimatedCostUsd) ?? null,
    actualCostUsd: input.actualCostUsd !== undefined
      ? cleanNullableNumber(input.actualCostUsd)
      : hasNoProviderRequests
        ? 0
        : undefined,
    pricingVersion: input.pricingVersion ?? estimate.pricingVersion ?? PROVIDER_COST_PRICING_VERSION,
    costBasis,
    missingPricing: hasNoProviderRequests
      ? false
      : costBasis === 'pricing_to_be_seen' || estimate.missingPricing,
    vendorRequestId: cleanString(input.vendorRequestId),
    providerJobId: cleanString(input.providerJobId),
    units,
    metadata: sanitizeProviderCostMetadata(input.metadata),
  });
}

export async function recordProviderCostEvent(input: ProviderCostEventInput): Promise<ProviderCostRecordResult> {
  const doc = normalizeProviderCostEvent(input);

  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    const collection = db.collection<ProviderCostEventDocument>(PROVIDER_COST_EVENTS_COLLECTION);

    if (doc.idempotencyKey) {
      const result = await collection.updateOne(
        { idempotencyKey: doc.idempotencyKey },
        { $setOnInsert: doc },
        { upsert: true },
      );
      const inserted = Boolean(result.upsertedCount);
      return {
        ok: true,
        eventId: doc.eventId,
        inserted,
        duplicate: !inserted,
      };
    }

    await collection.insertOne(doc);
    return { ok: true, eventId: doc.eventId, inserted: true, duplicate: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[ProviderCostEvents] write failed (non-fatal): ${message}`);
    return { ok: false, eventId: doc.eventId, inserted: false, duplicate: false, error: message };
  }
}

export async function recordProviderCostAttempt(
  input: Omit<ProviderCostEventInput, 'status'> & { status?: ProviderCostEventStatus },
): Promise<ProviderCostRecordResult> {
  return recordProviderCostEvent({ ...input, status: input.status ?? 'started' });
}

export function sanitizeProviderCostMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const sanitized = sanitizeValue(metadata, '', 0);
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : undefined;
}

function sanitizeValue(value: unknown, key: string, depth: number): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[redacted]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) {
    if (depth >= MAX_METADATA_DEPTH) return '[truncated-depth]';
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, key, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= MAX_METADATA_DEPTH) return '[truncated-depth]';
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, MAX_METADATA_KEYS)) {
      const sanitized = sanitizeValue(childValue, childKey, depth + 1);
      if (sanitized !== undefined) out[childKey] = sanitized;
    }
    return out;
  }
  return String(value);
}

function sanitizeString(value: string): string {
  if (URL_LIKE_PATTERN.test(value)) return '[redacted-url]';
  if (SECRET_LIKE_PATTERN.test(value)) return '[redacted]';
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`
    : value;
}

function sanitizeUnits(units: ProviderCostUnits = {}): ProviderCostUnits {
  return stripUndefined({
    inputTokens: cleanNumber(units.inputTokens),
    outputTokens: cleanNumber(units.outputTokens),
    totalTokens: cleanNumber(units.totalTokens),
    mediaSeconds: cleanNumber(units.mediaSeconds),
    mediaMinutes: cleanNumber(units.mediaMinutes),
    imageCount: cleanNumber(units.imageCount),
    audioCharacters: cleanNumber(units.audioCharacters),
    bytesIn: cleanNumber(units.bytesIn),
    bytesOut: cleanNumber(units.bytesOut),
    storageBytes: cleanNumber(units.storageBytes),
    queueMessages: cleanNumber(units.queueMessages),
    retryCount: cleanNumber(units.retryCount),
    functionMs: cleanNumber(units.functionMs),
    gpuSeconds: cleanNumber(units.gpuSeconds),
    requestCount: cleanNumber(units.requestCount),
    emailCount: cleanNumber(units.emailCount),
  });
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function cleanNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return cleanNumber(value);
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stripUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}
