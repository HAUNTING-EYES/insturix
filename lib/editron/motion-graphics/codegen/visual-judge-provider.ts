import { SchemaType, type ResponseSchema } from '@google/generative-ai';

import { chatCompletionsUrl } from '@/lib/editron/reference-video/glm-vision-client';
import { getAnalysisModel } from '@/lib/editron/utils/gemini-model-factory';

import { MgProviderFailureError, mgProviderHttpError } from './codegen-service';

type EnvLike = Record<string, string | undefined>;

export type MgVisualJudgeProviderName = 'gemini' | 'zai';

export interface MgVisualJudgeImage {
  label: string;
  image: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface MgVisualJudgeRequest {
  images: readonly MgVisualJudgeImage[];
  prompt: string;
  seed: number;
  maxOutputTokens: number;
}

export interface MgVisualJudgeResponse {
  text: string;
  finishReason: string;
  totalTokens?: number;
  thoughtsTokens?: number;
}

export interface MgVisualJudgeProvider {
  name: MgVisualJudgeProviderName;
  model: string;
  generate(request: MgVisualJudgeRequest): Promise<MgVisualJudgeResponse>;
}

const GEMINI_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    faithful: { type: SchemaType.BOOLEAN },
    // Criterion-separated craft dimensions (taste-gate layer 2). The model scores EACH 0-10; `score` is the
    // disciplined holistic overall the gate reads. Mirrors JUDGE_PROMPT's dimensions — keep the two in sync.
    hierarchy: { type: SchemaType.NUMBER },
    typography: { type: SchemaType.NUMBER },
    color: { type: SchemaType.NUMBER },
    composition: { type: SchemaType.NUMBER },
    motion: { type: SchemaType.NUMBER },
    score: { type: SchemaType.NUMBER },
    issues: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    reasoning: { type: SchemaType.STRING },
  },
  required: ['faithful', 'hierarchy', 'typography', 'color', 'composition', 'motion', 'score', 'issues', 'reasoning'],
};
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';
const DEFAULT_ZAI_JUDGE_MODEL = 'glm-4.6v';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function required(env: EnvLike, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new MgProviderFailureError(`MG visual judge: missing ${name}`, {
      domain: 'provider',
      provider: 'zai',
      operation: 'visual-judge',
      code: 'configuration',
      disposition: 'terminal',
    });
  }
  return value;
}

function assertJudgeImages(images: readonly MgVisualJudgeImage[]): void {
  if (!images.length) throw new Error('MG visual judge requires at least one image');
  for (const image of images) {
    if (!image.label.trim()) throw new Error('MG visual judge image label cannot be empty');
    if (!image.image.length) throw new Error(`MG visual judge image ${image.label} cannot be empty`);
  }
}

function imageDataUrl(image: MgVisualJudgeImage): string {
  return `data:${image.mimeType};base64,${image.image.toString('base64')}`;
}

function providerMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const direct = readString(payload, 'message');
  if (direct) return direct;
  return isRecord(payload.error) ? readString(payload.error, 'message') : undefined;
}

export function resolveMgVisualJudgeProviderName(env: EnvLike = process.env): MgVisualJudgeProviderName {
  const configured = env.MG_VISUAL_JUDGE_PROVIDER?.trim().toLowerCase() || 'gemini';
  if (configured === 'gemini' || configured === 'zai') return configured;
  throw new Error(`MG visual judge: unsupported provider ${configured}`);
}

async function createGeminiProvider(env: EnvLike): Promise<MgVisualJudgeProvider> {
  const model = await getAnalysisModel();
  const modelName = env.LLM_ANALYSIS_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return {
    name: 'gemini',
    model: modelName,
    async generate(request) {
      assertJudgeImages(request.images);
      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { text: request.prompt },
            ...request.images.flatMap((image, index) => [
              { text: `JUDGE IMAGE ${index + 1}: ${image.label}` },
              { inlineData: { mimeType: image.mimeType, data: image.image.toString('base64') } },
            ]),
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
          temperature: 0,
          seed: request.seed,
          maxOutputTokens: request.maxOutputTokens,
        },
      });
      const usage = result.response?.usageMetadata as {
        totalTokenCount?: number;
        thoughtsTokenCount?: number;
      } | undefined;
      return {
        text: result.response?.text?.() ?? '',
        finishReason: String(result.response?.candidates?.[0]?.finishReason ?? 'unknown'),
        totalTokens: usage?.totalTokenCount,
        thoughtsTokens: usage?.thoughtsTokenCount,
      };
    },
  };
}

function invalidZaiResponse(message: string): MgProviderFailureError {
  return new MgProviderFailureError(message, {
    domain: 'provider',
    provider: 'zai',
    operation: 'visual-judge',
    code: 'invalid-response',
    disposition: 'terminal',
  });
}

function createZaiProvider(env: EnvLike): MgVisualJudgeProvider {
  const apiKey = required(env, 'ZAI_API_KEY');
  const baseUrl = env.ZAI_BASE_URL?.trim() || DEFAULT_ZAI_BASE_URL;
  const model = env.MG_VISUAL_JUDGE_MODEL?.trim() || DEFAULT_ZAI_JUDGE_MODEL;
  return {
    name: 'zai',
    model,
    async generate(request) {
      assertJudgeImages(request.images);
      const response = await fetch(chatCompletionsUrl(baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: request.prompt },
              ...request.images.flatMap((image, index) => [
                { type: 'text', text: `JUDGE IMAGE ${index + 1}: ${image.label}` },
                { type: 'image_url', image_url: { url: imageDataUrl(image) } },
              ]),
            ],
          }],
          stream: false,
          do_sample: false,
          max_tokens: request.maxOutputTokens,
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled', clear_thinking: true },
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = providerMessage(payload);
        throw mgProviderHttpError({
          provider: 'zai',
          operation: 'visual-judge',
          statusCode: response.status,
          message: `MG Z.AI visual judge failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        });
      }
      if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) {
        throw invalidZaiResponse('MG Z.AI visual judge returned an invalid completion payload');
      }
      const choice = payload.choices[0];
      const message = isRecord(choice.message) ? choice.message : null;
      const text = message ? readString(message, 'content') : undefined;
      if (!text) throw invalidZaiResponse('MG Z.AI visual judge returned no response text');
      const usage = isRecord(payload.usage) ? payload.usage : {};
      const completionDetails = isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : {};
      return {
        text,
        finishReason: readString(choice, 'finish_reason') ?? 'unknown',
        totalTokens: readNumber(usage, 'total_tokens'),
        thoughtsTokens: readNumber(completionDetails, 'reasoning_tokens'),
      };
    },
  };
}

export async function createMgVisualJudgeProvider(
  env: EnvLike = process.env,
): Promise<MgVisualJudgeProvider> {
  const provider = resolveMgVisualJudgeProviderName(env);
  return provider === 'zai' ? createZaiProvider(env) : createGeminiProvider(env);
}
