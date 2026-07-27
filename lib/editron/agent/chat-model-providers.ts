import { getGenAI } from '@/lib/editron/utils/gemini-model-factory';
import type { TokenUsageMetadata } from '@/lib/editron/utils/token-tracker';

export interface ChatModelGenerationResult {
  text: string;
  usageMetadata?: TokenUsageMetadata;
}

type FetchLike = typeof fetch;

interface KimiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export interface KimiOwnerGeneratorOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  model?: string;
  reasoningEffort?: 'low' | 'high' | 'max';
  timeoutMs?: number;
}

export interface GeminiOwnerGeneratorOptions {
  model: string;
}

const DEFAULT_KIMI_BASE_URL = 'https://api.moonshot.ai/v1';
const DEFAULT_KIMI_MODEL = 'kimi-k3';

export function createKimiOwnerGenerator(
  options: KimiOwnerGeneratorOptions = {},
): (prompt: string, attempt: number) => Promise<ChatModelGenerationResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizeKimiBaseUrl(
    options.baseUrl ?? process.env.KIMI_API_BASE_URL ?? DEFAULT_KIMI_BASE_URL,
  );
  const model = options.model ?? process.env.KIMI_CHAT_MODEL ?? DEFAULT_KIMI_MODEL;
  const reasoningEffort = options.reasoningEffort
    ?? parseReasoningEffort(process.env.KIMI_CHAT_REASONING_EFFORT)
    ?? 'high';
  const timeoutMs = options.timeoutMs ?? 60_000;

  return async (prompt, attempt) => {
    const apiKey = options.apiKey
      ?? process.env.KIMI_API_KEY
      ?? process.env.MOONSHOT_API_KEY;
    if (!apiKey) {
      throw new Error('Kimi owner classification requires KIMI_API_KEY or MOONSHOT_API_KEY');
    }

    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Return only the JSON object requested by the user prompt. Do not add markdown or commentary.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        reasoning_effort: reasoningEffort,
        max_completion_tokens: 4_096,
        temperature: 1,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const payload = await readKimiResponse(response);
    if (!response.ok) {
      const providerMessage = payload.error?.message?.trim();
      throw new Error(
        `Kimi owner classification failed (${response.status})${
          providerMessage ? `: ${providerMessage.slice(0, 300)}` : ''
        }`,
      );
    }

    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('Kimi owner classification returned no JSON content');
    }

    return {
      text,
      usageMetadata: mapKimiUsage(payload.usage),
    };
  };
}

export function createGeminiOwnerGenerator(
  options: GeminiOwnerGeneratorOptions,
): (prompt: string, attempt: number) => Promise<ChatModelGenerationResult> {
  return async (prompt) => {
    const genAI = await getGenAI();
    const model = genAI.getGenerativeModel({ model: options.model });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1_200,
        responseMimeType: 'application/json',
      },
    });
    return {
      text: result.response.text(),
      usageMetadata: result.response.usageMetadata,
    };
  };
}

function normalizeKimiBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') {
    throw new Error('Kimi API base URL must use HTTPS');
  }
  return parsed.toString().replace(/\/$/, '');
}

function parseReasoningEffort(
  value: string | undefined,
): 'low' | 'high' | 'max' | undefined {
  return value === 'low' || value === 'high' || value === 'max'
    ? value
    : undefined;
}

async function readKimiResponse(response: Response): Promise<KimiChatCompletionResponse> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as KimiChatCompletionResponse;
  } catch {
    throw new Error(`Kimi owner classification returned invalid JSON (${response.status})`);
  }
}

function mapKimiUsage(
  usage: KimiChatCompletionResponse['usage'],
): TokenUsageMetadata | undefined {
  if (!usage) return undefined;
  return {
    promptTokenCount: usage.prompt_tokens,
    candidatesTokenCount: usage.completion_tokens,
    totalTokenCount: usage.total_tokens,
  };
}
