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
  error?: unknown;
}) {
  const inputTokens = input.usage?.inputTokens ?? estimateTokensFromChars(input.promptChars);
  const outputTokens = input.usage?.outputTokens ?? estimateTokensFromChars(input.outputChars);

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