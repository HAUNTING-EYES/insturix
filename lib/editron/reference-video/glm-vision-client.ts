export type GlmVisionRole = 'system' | 'user' | 'assistant';

export type GlmVisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }
  | { type: 'video_url'; video_url: { url: string } };

export interface GlmVisionMessage {
  role: GlmVisionRole;
  content: string | readonly GlmVisionContentPart[];
}

export interface GlmVisionJsonRequest {
  model?: string;
  messages: readonly GlmVisionMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  cacheKey?: string;
  thinking?: 'enabled' | 'disabled';
}

export type GlmVisionJsonResult =
  | {
    ok: true;
    json: unknown;
    content: string;
    raw: unknown;
    model: string;
    usage?: GlmVisionUsage;
    cacheKey?: string;
  }
  | {
    ok: false;
    error: string;
    status?: number;
    raw?: unknown;
    model?: string;
    cacheKey?: string;
  };

export interface GlmVisionJsonClient {
  analyzeJson(request: GlmVisionJsonRequest): Promise<GlmVisionJsonResult>;
}

export interface GlmVisionUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
}

export type FetchLike = typeof fetch;

export interface GlmVisionClientOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

interface ChatCompletionPayload {
  model: string;
  messages: readonly GlmVisionMessage[];
  stream: false;
  temperature: number;
  response_format: { type: 'json_object' };
  thinking: { type: 'enabled' | 'disabled' };
  max_tokens?: number;
}

const DEFAULT_ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';
const DEFAULT_GLM_VISION_MODEL = 'glm-4.6v';
const DEFAULT_TIMEOUT_MS = 60_000;

export function createGlmVisionClient(
  options: GlmVisionClientOptions = {},
): GlmVisionJsonClient {
  return new GlmVisionClient(options);
}

export class GlmVisionClient implements GlmVisionJsonClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: GlmVisionClientOptions = {}) {
    this.apiKey = options.apiKey ?? envValue('ZAI_API_KEY') ?? envValue('GLM_VISION_API_KEY');
    this.baseUrl = options.baseUrl
      ?? envValue('ZAI_BASE_URL')
      ?? envValue('GLM_VISION_BASE_URL')
      ?? DEFAULT_ZAI_BASE_URL;
    this.model = options.model
      ?? envValue('GLM_VISION_MODEL')
      ?? envValue('GLM_REFERENCE_ANALYSIS_MODEL')
      ?? DEFAULT_GLM_VISION_MODEL;
    this.timeoutMs = options.timeoutMs ?? readPositiveIntEnv('GLM_VISION_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async analyzeJson(request: GlmVisionJsonRequest): Promise<GlmVisionJsonResult> {
    const model = request.model ?? this.model;
    if (!this.apiKey) {
      return {
        ok: false,
        error: 'GLM vision API key is not configured. Set ZAI_API_KEY or GLM_VISION_API_KEY.',
        model,
        cacheKey: request.cacheKey,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? this.timeoutMs);
    const payload: ChatCompletionPayload = {
      model,
      messages: request.messages,
      stream: false,
      temperature: request.temperature ?? 0,
      response_format: { type: 'json_object' },
      thinking: { type: request.thinking ?? 'disabled' },
      ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
    };

    try {
      const response = await this.fetchImpl(chatCompletionsUrl(this.baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const raw = await readJsonSafely(response);

      if (!response.ok) {
        return {
          ok: false,
          error: `GLM vision request failed with HTTP ${response.status}.`,
          status: response.status,
          raw,
          model,
          cacheKey: request.cacheKey,
        };
      }

      const content = readContent(raw);
      if (!content.trim()) {
        return {
          ok: false,
          error: 'GLM vision returned an empty response.',
          status: response.status,
          raw,
          model,
          cacheKey: request.cacheKey,
        };
      }

      const parsed = parseJsonContent(content);
      if (!parsed.ok) {
        return {
          ok: false,
          error: parsed.error,
          status: response.status,
          raw,
          model,
          cacheKey: request.cacheKey,
        };
      }

      return {
        ok: true,
        json: parsed.json,
        content,
        raw,
        model,
        usage: readUsage(raw),
        cacheKey: request.cacheKey,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error && error.name === 'AbortError'
          ? 'GLM vision request timed out.'
          : `GLM vision request failed: ${error instanceof Error ? error.message : String(error)}`,
        model,
        cacheKey: request.cacheKey,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

export function parseJsonContent(content: string): { ok: true; json: unknown } | { ok: false; error: string } {
  const cleaned = stripJsonFence(content);
  try {
    return { ok: true, json: JSON.parse(cleaned) };
  } catch (error) {
    return {
      ok: false,
      error: `GLM vision returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const fullFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fullFence) return fullFence[1].trim();

  const firstFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (firstFence?.[1] ?? trimmed).trim();
}

function envValue(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env[name];
}

function readPositiveIntEnv(name: string): number | undefined {
  const value = envValue(name);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function readContent(payload: unknown): string {
  if (!isRecord(payload)) return '';
  const choices = payload.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!isRecord(choice)) continue;
      const messageContent = readTextContent(choice.message);
      if (messageContent.trim()) return messageContent;
      const deltaContent = readTextContent(choice.delta);
      if (deltaContent.trim()) return deltaContent;
      const choiceContent = readTextContent(choice.content);
      if (choiceContent.trim()) return choiceContent;
    }
  }

  const messageContent = readTextContent(payload.message);
  if (messageContent.trim()) return messageContent;
  return readTextContent(payload.content);
}

function readTextContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(readTextPart).filter(Boolean).join('\n');
  }
  if (isRecord(value)) return readTextContent(value.content);
  return '';
}

function readTextPart(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return '';
  if (typeof value.text === 'string') return value.text;
  if (typeof value.content === 'string') return value.content;
  return '';
}

function readUsage(payload: unknown): GlmVisionUsage | undefined {
  if (!isRecord(payload) || !isRecord(payload.usage)) return undefined;
  const usage = payload.usage;
  const promptDetails = usage.prompt_tokens_details;
  return {
    promptTokens: readNumber(usage, 'prompt_tokens'),
    completionTokens: readNumber(usage, 'completion_tokens'),
    totalTokens: readNumber(usage, 'total_tokens'),
    cachedTokens: isRecord(promptDetails) ? readNumber(promptDetails, 'cached_tokens') : undefined,
  };
}

function readNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
