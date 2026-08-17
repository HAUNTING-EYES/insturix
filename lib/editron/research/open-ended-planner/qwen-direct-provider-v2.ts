import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';

export interface QwenProviderExecutionV2 {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  latencyMs: number;
  transportKind?: 'ALIBABA_DIRECT_CHAT_COMPLETIONS' | 'OPENCODE_AGENT_SHELL';
  providerModel?: string;
  providerRequestId?: string;
  providerRequestHash?: string;
  providerResponseHash?: string;
  failureDisposition?: 'PROVIDER_TIMEOUT' | 'PROVIDER_RATE_LIMIT' | 'PROVIDER_REFUSAL' | 'PROVIDER_ERROR';
}

export type QwenProviderExecutorV2 = (input: {
  prompt: string;
  attempt: 1 | 2;
  sessionId?: string;
  attachmentPaths: readonly string[];
  workingDirectory: string;
  apiKey: string;
  timeoutMs: number;
  reasoningBudgetTokens: number;
  visibleOutputBudgetTokens: number;
}) => Promise<Readonly<QwenProviderExecutionV2>>;

type FetchV2 = typeof fetch;
type JsonRecord = Record<string, unknown>;

const QWEN_ENDPOINT = 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions';

export async function executeQwenDirectProviderV2(
  input: Parameters<QwenProviderExecutorV2>[0],
  fetchImpl: FetchV2 = fetch,
): Promise<QwenProviderExecutionV2> {
  const started = Date.now();
  const body = {
    model: 'qwen3.8-max',
    messages: [{
      role: 'user',
      content: await buildContent(input.prompt, input.attachmentPaths),
    }],
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: input.reasoningBudgetTokens + input.visibleOutputBudgetTokens,
    thinking_budget: input.reasoningBudgetTokens,
  };
  const providerRequestHash = hashCanonicalJsonV1({ endpoint: QWEN_ENDPOINT, body });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetchImpl(QWEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const latencyMs = Date.now() - started;
      const failureDisposition = mapHttpFailure(response.status);
      return {
        stdout: JSON.stringify({ type: 'error', part: { status: response.status } }),
        stderr: `QWEN_HTTP_${response.status}`,
        exitCode: 1,
        timedOut: false,
        latencyMs,
        transportKind: 'ALIBABA_DIRECT_CHAT_COMPLETIONS',
        providerRequestHash,
        failureDisposition,
      };
    }
    const streamed = await readStreamingResponse(response);
    const latencyMs = Date.now() - started;
    return {
      stdout: streamed.events,
      stderr: '',
      exitCode: 0,
      timedOut: false,
      latencyMs,
      transportKind: 'ALIBABA_DIRECT_CHAT_COMPLETIONS',
      providerModel: streamed.providerModel,
      providerRequestId: streamed.providerRequestId,
      providerRequestHash,
      providerResponseHash: hashCanonicalJsonV1(streamed.responseHashMaterial),
    };
  } catch (error) {
    const timedOut = controller.signal.aborted || isAbort(error);
    return {
      stdout: '',
      stderr: timedOut ? 'QWEN_DIRECT_TIMEOUT' : `QWEN_DIRECT_ERROR:${safeMessage(error)}`,
      exitCode: timedOut ? null : 1,
      timedOut,
      latencyMs: Date.now() - started,
      transportKind: 'ALIBABA_DIRECT_CHAT_COMPLETIONS',
      providerRequestHash,
      failureDisposition: timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readStreamingResponse(response: Response): Promise<{
  events: string;
  providerModel: string;
  providerRequestId: string;
  responseHashMaterial: JsonRecord;
}> {
  if (!response.body) throw new Error('QWEN_STREAM_BODY_MISSING');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const frames: JsonRecord[] = [];
  let pending = '';
  let completed = false;
  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) return;
    if (!trimmed.startsWith('data:')) throw new Error('QWEN_STREAM_LINE_INVALID');
    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') {
      if (completed) throw new Error('QWEN_STREAM_DONE_DUPLICATE');
      completed = true;
      return;
    }
    if (completed) throw new Error('QWEN_STREAM_DATA_AFTER_DONE');
    const parsed = JSON.parse(data) as unknown;
    if (!isRecord(parsed)) throw new Error('QWEN_STREAM_FRAME_INVALID');
    frames.push(parsed);
  };
  for (;;) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    lines.forEach(consume);
    if (done) break;
  }
  if (pending.trim()) consume(pending);
  if (!completed) throw new Error('QWEN_STREAM_NOT_COMPLETED');
  const normalized = normalizeStreamingFrames(frames);
  return {
    ...normalized,
    responseHashMaterial: { frames, completed },
  };
}

function normalizeStreamingFrames(frames: readonly JsonRecord[]): {
  events: string;
  providerModel: string;
  providerRequestId: string;
} {
  let providerModel: string | undefined;
  let providerRequestId: string | undefined;
  let finishReason: string | undefined;
  let usage: JsonRecord | undefined;
  const content: string[] = [];
  for (const frame of frames) {
    if ('error' in frame) throw new Error('QWEN_STREAM_PROVIDER_ERROR');
    providerModel = consistentString(providerModel, frame.model, 'MODEL');
    providerRequestId = consistentString(providerRequestId, frame.id, 'REQUEST_ID');
    const choice = record(Array.isArray(frame.choices) ? frame.choices[0] : undefined);
    const delta = record(choice.delta);
    if (typeof delta.content === 'string') content.push(delta.content);
    else if (delta.content !== undefined && delta.content !== null) {
      throw new Error('QWEN_STREAM_CONTENT_INVALID');
    }
    finishReason = consistentString(finishReason, choice.finish_reason, 'FINISH_REASON');
    if (isRecord(frame.usage)) usage = frame.usage;
  }
  if (!providerModel) throw new Error('QWEN_STREAM_MODEL_MISSING');
  if (!providerRequestId) throw new Error('QWEN_STREAM_REQUEST_ID_MISSING');
  if (!finishReason) throw new Error('QWEN_STREAM_FINISH_REASON_MISSING');
  if (!usage) throw new Error('QWEN_STREAM_USAGE_MISSING');
  return normalizeResponse({
    id: providerRequestId,
    model: providerModel,
    choices: [{ finish_reason: finishReason, message: { content: content.join('') } }],
    usage,
  });
}

async function buildContent(prompt: string, attachmentPaths: readonly string[]): Promise<unknown> {
  if (!attachmentPaths.length) return prompt;
  const media = await Promise.all(attachmentPaths.map(async (attachmentPath) => ({
    type: 'image_url',
    image_url: {
      url: `data:${mimeType(attachmentPath)};base64,${Buffer.from(await readFile(attachmentPath)).toString('base64')}`,
    },
  })));
  return [{ type: 'text', text: prompt }, ...media];
}

function mimeType(attachmentPath: string): string {
  switch (path.extname(attachmentPath).toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    default: throw new Error(`QWEN_DIRECT_ATTACHMENT_UNSUPPORTED:${path.extname(attachmentPath)}`);
  }
}

function normalizeResponse(body: JsonRecord): {
  events: string;
  providerModel: string;
  providerRequestId: string;
} {
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const choice = record(choices[0]);
  const message = record(choice.message);
  const usage = record(body.usage);
  const promptDetails = record(usage.prompt_tokens_details);
  const completionDetails = record(usage.completion_tokens_details);
  const input = requiredCount(usage.prompt_tokens, 'prompt_tokens');
  const completion = requiredCount(usage.completion_tokens, 'completion_tokens');
  const reasoning = requiredCount(completionDetails.reasoning_tokens, 'reasoning_tokens');
  if (reasoning > completion) throw new Error('QWEN_USAGE_REASONING_EXCEEDS_COMPLETION');
  const output = Math.max(0, completion - reasoning);
  const total = requiredCount(usage.total_tokens, 'total_tokens');
  if (total !== input + completion) throw new Error('QWEN_USAGE_TOTAL_MISMATCH');
  const text = typeof message.content === 'string' ? message.content : '';
  const finishReason = requiredString(choice.finish_reason, 'FINISH_REASON');
  const sessionId = requiredString(body.id, 'REQUEST_ID');
  const providerModel = requiredString(body.model, 'MODEL');
  const events = [
    JSON.stringify({ type: 'text', sessionID: sessionId, part: { text } }),
    JSON.stringify({
      type: 'step_finish',
      sessionID: sessionId,
      part: {
        tokens: {
          input,
          output,
          reasoning,
          total,
          cache: { read: count(promptDetails.cached_tokens), write: 0 },
        },
        reason: finishReason,
      },
    }),
  ].join('\n');
  return {
    events,
    providerModel,
    providerRequestId: sessionId,
  };
}

function consistentString(current: string | undefined, value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return current;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`QWEN_STREAM_${field}_INVALID`);
  if (current !== undefined && current !== value) throw new Error(`QWEN_STREAM_${field}_CONFLICT`);
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`QWEN_STREAM_${field}_MISSING`);
  return value;
}

function count(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function requiredCount(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`QWEN_USAGE_INVALID:${field}`);
  }
  return Number(value);
}

function mapHttpFailure(status: number): QwenProviderExecutionV2['failureDisposition'] {
  if (status === 429) return 'PROVIDER_RATE_LIMIT';
  if (status === 401 || status === 403) return 'PROVIDER_REFUSAL';
  if (status === 408 || status === 504) return 'PROVIDER_TIMEOUT';
  return 'PROVIDER_ERROR';
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 300);
}
