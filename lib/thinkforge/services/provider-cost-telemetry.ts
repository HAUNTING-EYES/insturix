import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';
import type { ThinkForgeModelProvider } from '@/lib/thinkforge/agents/model-factory';

export type ThinkForgeDirectOperation =
  | 'llm_stream_direct'
  | 'llm_structured_direct'
  | 'llm_text_direct'
  | 'llm_search_grounded_direct';

export type ThinkForgeProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

const SAFE_TELEMETRY_REDACTIONS = new Set([
  'email',
  'phone',
  'tax_id',
  'aadhaar',
  'pan',
  'person_name',
  'contact_name',
  'date_of_birth',
  'street_address',
]);

export async function recordThinkForgeDirectCost(input: {
  status: ProviderCostEventStatus;
  action: string;
  route: string;
  provider: ThinkForgeModelProvider | string;
  modelName: string;
  operation: ThinkForgeDirectOperation;
  userId?: string;
  projectId?: string;
  taskId?: string;
  creditTransactionId?: string;
  chargedCredits?: number;
  promptChars?: number;
  outputChars?: number;
  functionMs?: number;
  usage?: ThinkForgeProviderUsage;
  routePurpose?: string;
  privacyClass?: string;
  temperature?: number;
  maxTokens?: number;
  sourceKind?: string;
  resultCount?: number;
  acceptedCount?: number;
  finishReason?: string;
  correlationId?: string;
  profileRecordId?: string;
  profileUpdatedAt?: string;
  profileFingerprint?: string;
  factIds?: readonly string[];
  sourceIds?: readonly string[];
  redactions?: readonly string[];
  redactionCount?: number;
  attempt?: number;
  retryCount?: number;
  failureCode?: string;
  error?: unknown;
}) {
  const inputTokens = input.usage?.inputTokens ?? estimateTokensFromChars(input.promptChars);
  const outputTokens = input.usage?.outputTokens ?? estimateTokensFromChars(input.outputChars);
  const retryCount = cleanInteger(input.retryCount, 0);

  await recordProviderCostEvent({
    status: input.status,
    service: 'thinkforge',
    action: input.action,
    route: input.route,
    provider: input.provider,
    model: cleanModelName(input.modelName),
    operation: input.operation,
    userId: input.userId,
    projectId: input.projectId,
    taskId: input.taskId,
    creditTransactionId: input.creditTransactionId,
    chargedCredits: input.chargedCredits,
    units: {
      requestCount: 1,
      inputTokens,
      outputTokens,
      totalTokens: input.usage?.totalTokens ?? sumOptional(inputTokens, outputTokens),
      functionMs: input.functionMs,
      retryCount,
    },
    metadata: {
      routePurpose: input.routePurpose,
      privacyClass: input.privacyClass,
      sourceKind: input.sourceKind,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      resultCount: input.resultCount,
      acceptedCount: input.acceptedCount,
      outputChars: input.outputChars,
      finishReason: input.finishReason,
      correlationId: cleanOpaqueIdentifier(input.correlationId),
      profileRecordId: cleanOpaqueIdentifier(input.profileRecordId),
      profileUpdatedAt: cleanIsoTimestamp(input.profileUpdatedAt),
      profileFingerprint: cleanProfileFingerprint(input.profileFingerprint),
      factIds: cleanOpaqueIdentifiers(input.factIds),
      sourceIds: cleanOpaqueIdentifiers(input.sourceIds),
      redactions: cleanRedactionNames(input.redactions),
      redactionCount: cleanInteger(input.redactionCount, 0),
      attempt: cleanInteger(input.attempt, 1),
      failureCode: cleanTelemetryCode(input.failureCode),
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}

export async function readAiSdkUsage(value: unknown): Promise<ThinkForgeProviderUsage | undefined> {
  const resolved = await Promise.resolve(value);
  const usage = asRecord(resolved);
  if (!usage) return undefined;

  const inputTokens = readNumber(usage.promptTokens ?? usage.inputTokens ?? usage.prompt_tokens);
  const outputTokens = readNumber(usage.completionTokens ?? usage.outputTokens ?? usage.completion_tokens);
  const totalTokens = readNumber(usage.totalTokens ?? usage.total_tokens);
  return inputTokens || outputTokens || totalTokens ? { inputTokens, outputTokens, totalTokens } : undefined;
}

export function safeJsonLength(value: unknown): number | undefined {
  try {
    return JSON.stringify(value ?? {}).length;
  } catch {
    return undefined;
  }
}

function cleanModelName(modelName: string): string {
  return modelName.replace(/^models\//, '');
}

function estimateTokensFromChars(chars?: number): number | undefined {
  return typeof chars === 'number' && Number.isFinite(chars) && chars > 0 ? Math.max(1, Math.ceil(chars / 4)) : undefined;
}

function sumOptional(a?: number, b?: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function cleanInteger(value: number | undefined, minimum: number): number | undefined {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= 1_000
    ? value
    : undefined;
}

function cleanOpaqueIdentifier(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 128) return undefined;
  const mongoId = /^[a-f\d]{24}$/i.test(normalized);
  const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(normalized);
  const scopedId = /^[A-Za-z][A-Za-z0-9.-]{0,31}[_:][A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/.test(normalized);
  return mongoId || uuid || scopedId ? normalized : undefined;
}

function cleanOpaqueIdentifiers(values: readonly string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const identifiers = values
    .map((value) => cleanOpaqueIdentifier(value))
    .filter((value): value is string => Boolean(value));
  const unique = Array.from(new Set(identifiers)).slice(0, 100);
  return unique.length > 0 ? unique : undefined;
}

function cleanIsoTimestamp(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function cleanProfileFingerprint(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-f\d]{64}$/.test(normalized) ? normalized : undefined;
}

function cleanRedactionNames(values: readonly string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const names = Array.from(new Set(values.filter((value) => SAFE_TELEMETRY_REDACTIONS.has(value))));
  return names.length > 0 ? names : undefined;
}

function cleanTelemetryCode(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && /^[a-z][a-z0-9_.-]{0,63}$/.test(normalized) ? normalized : undefined;
}
