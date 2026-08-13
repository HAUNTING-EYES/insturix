import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { canonicalizeJsonV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HashedStagePacketV2 } from './staged-packet-v2';

export type ProviderKindV2 = 'openai' | 'google' | 'deepseek';
export type SchemaModeV2 = 'NATIVE_JSON_SCHEMA' | 'NATIVE_JSON_SCHEMA_NON_STRICT' | 'NATIVE_JSON_OBJECT';

export interface ProviderRouteV2 {
  kind: ProviderKindV2;
  apiKey: string;
  model: string;
  modelSnapshot: string;
  reasoningMode: string;
}

export interface ProviderUsageV2 {
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  cacheMissInputTokens?: number;
  visibleOutputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface NormalizedProviderResponseV2 {
  disposition: 'SUCCESS' | 'PROVIDER_REFUSAL' | 'PROVIDER_ERROR';
  text?: string;
  providerRequestId?: string;
  providerModel?: string;
  providerSystemFingerprint?: string;
  finishReason?: string;
  truncated?: boolean;
  usage: ProviderUsageV2;
  detail?: string;
}

export interface SerializedProviderRequestV2 {
  endpoint: string;
  headers: Readonly<Record<string, string>>;
  body: Readonly<Record<string, unknown>>;
  promptHash: string;
  requestHash: string;
  schemaMode: SchemaModeV2;
}

export interface SerializedGoogleCountTokensRequestV2 {
  endpoint: string;
  headers: Readonly<Record<string, string>>;
  body: Readonly<{ generateContentRequest: Readonly<Record<string, unknown>> }>;
  generationRequestHash: string;
  requestHash: string;
}

export class ProviderCodecErrorV2 extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ProviderCodecErrorV2';
  }
}

const SUPPORTED_MEDIA: Record<ProviderKindV2, ReadonlySet<string>> = {
  openai: new Set(['image/png', 'image/jpeg', 'image/webp']),
  google: new Set(['image/png', 'image/jpeg', 'image/webp', 'audio/wav', 'video/mp4']),
  deepseek: new Set(),
};

export async function serializeProviderRequestV2(input: {
  route: ProviderRouteV2;
  artifact: HashedStagePacketV2;
  attempt: 1 | 2;
  outputBudget: { visible: number; reasoning: number };
  repair?: { diagnostics: string[]; priorResponse: string };
  readAttachmentBytes?: (path: string) => Promise<Uint8Array>;
}): Promise<SerializedProviderRequestV2> {
  if (!input.route.apiKey || !input.route.model || !input.route.modelSnapshot) {
    throw new ProviderCodecErrorV2('INVALID_ROUTE', 'Provider route requires credentials and pinned model identity');
  }
  const media = await loadVerifiedMedia(input.artifact, input.route.kind, input.readAttachmentBytes ?? readFile);
  const prompt = canonicalizeJsonV1({
    version: 'EDITRON_OE_PROVIDER_PROMPT_V2',
    authority: 'RESEARCH_ONLY_NO_TOOLS_NO_NETWORK_NO_PROJECT_MUTATION',
    attempt: input.attempt,
    instructions: [
      'Return exactly one JSON object matching outputContract.',
      'Use only the packet evidence and declared public operators.',
      'Do not browse, call tools, mutate state, or claim rendered success.',
    ],
    packet: input.artifact.packet,
    ...(input.repair ? { repair: input.repair } : {}),
  });
  const common = { model: input.route.model, stream: false };
  const maximumOutput = input.outputBudget.visible + input.outputBudget.reasoning;
  let endpoint: string;
  let body: Record<string, unknown>;
  let headers: Record<string, string>;
  let schemaMode: SchemaModeV2;

  if (input.route.kind === 'openai') {
    endpoint = 'https://api.openai.com/v1/responses';
    headers = { Authorization: `Bearer ${input.route.apiKey}`, 'Content-Type': 'application/json' };
    schemaMode = 'NATIVE_JSON_SCHEMA_NON_STRICT';
    body = {
      ...common,
      store: false,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          ...media.map(({ mimeType, base64 }) => ({
            type: 'input_image', image_url: `data:${mimeType};base64,${base64}`, detail: 'auto',
          })),
        ],
      }],
      reasoning: { effort: input.route.reasoningMode },
      max_output_tokens: maximumOutput,
      text: { format: { type: 'json_schema', name: schemaName(input.artifact), strict: false, schema: input.artifact.packet.outputContract } },
    };
  } else if (input.route.kind === 'google') {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.route.model)}:generateContent`;
    headers = { 'x-goog-api-key': input.route.apiKey, 'Content-Type': 'application/json' };
    schemaMode = 'NATIVE_JSON_SCHEMA';
    body = {
      contents: [{ role: 'user', parts: [{ text: prompt }, ...media.map(({ mimeType, base64 }) => ({ inlineData: { mimeType, data: base64 } }))] }],
      generationConfig: {
        responseMimeType: 'application/json', responseJsonSchema: input.artifact.packet.outputContract,
        maxOutputTokens: maximumOutput, thinkingConfig: { thinkingBudget: input.outputBudget.reasoning },
      },
    };
  } else {
    endpoint = 'https://api.deepseek.com/v1/chat/completions';
    headers = { Authorization: `Bearer ${input.route.apiKey}`, 'Content-Type': 'application/json' };
    schemaMode = 'NATIVE_JSON_OBJECT';
    body = {
      ...common, messages: [{ role: 'user', content: prompt }], max_tokens: maximumOutput,
      response_format: { type: 'json_object' }, thinking: { type: 'enabled' },
      reasoning_effort: input.route.reasoningMode,
    };
  }
  const frozenBody = Object.freeze(body);
  return Object.freeze({
    endpoint, headers: Object.freeze(headers), body: frozenBody,
    promptHash: hashCanonicalJsonV1(JSON.parse(prompt) as unknown),
    requestHash: hashCanonicalJsonV1({ endpoint, body: frozenBody }), schemaMode,
  });
}

export function serializeGoogleCountTokensRequestV2(input: {
  route: ProviderRouteV2;
  generationRequest: SerializedProviderRequestV2;
}): SerializedGoogleCountTokensRequestV2 {
  if (input.route.kind !== 'google') {
    throw new ProviderCodecErrorV2('COUNT_TOKENS_PROVIDER_MISMATCH', 'Google countTokens requires a Google provider route');
  }
  const encodedModel = encodeURIComponent(input.route.model);
  const expectedGenerationEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent`;
  if (input.generationRequest.endpoint !== expectedGenerationEndpoint) {
    throw new ProviderCodecErrorV2(
      'COUNT_TOKENS_REQUEST_MISMATCH',
      'Google countTokens must be derived from the generation request for the same model',
    );
  }
  const generateContentRequest = Object.freeze({
    model: `models/${input.route.model}`,
    ...input.generationRequest.body,
  });
  const body = Object.freeze({ generateContentRequest });
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:countTokens`;
  return Object.freeze({
    endpoint,
    headers: Object.freeze({ 'x-goog-api-key': input.route.apiKey, 'Content-Type': 'application/json' }),
    body,
    generationRequestHash: input.generationRequest.requestHash,
    requestHash: hashCanonicalJsonV1({ endpoint, body }),
  });
}

export function normalizeProviderResponseV2(
  kind: ProviderKindV2,
  body: Record<string, unknown>,
): NormalizedProviderResponseV2 {
  if (kind === 'openai') return normalizeOpenAI(body);
  if (kind === 'google') return normalizeGoogle(body);
  return normalizeDeepSeek(body);
}

export function mapProviderHttpFailureV2(status: number): string {
  if (status === 429) return 'PROVIDER_RATE_LIMIT';
  if (status === 408 || status === 504) return 'PROVIDER_TIMEOUT';
  if (status === 401 || status === 403) return 'PROVIDER_REFUSAL';
  return 'PROVIDER_ERROR';
}

function normalizeOpenAI(body: Record<string, unknown>): NormalizedProviderResponseV2 {
  const usage = record(body.usage);
  const inputDetails = record(usage.input_tokens_details);
  const outputDetails = record(usage.output_tokens_details);
  const outputTokens = count(usage.output_tokens);
  const reasoningTokens = count(outputDetails.reasoning_tokens);
  const refusal = findOpenAIContent(body.output, 'refusal');
  const incompleteReason = string(record(body.incomplete_details).reason);
  const finishReason = incompleteReason ?? string(body.status);
  return {
    disposition: refusal ? 'PROVIDER_REFUSAL' : 'SUCCESS',
    text: refusal ? undefined : findOpenAIContent(body.output, 'output_text') ?? string(body.output_text),
    providerRequestId: string(body.id), providerModel: string(body.model),
    providerSystemFingerprint: string(body.system_fingerprint), finishReason,
    truncated: finishReason === undefined ? undefined : body.status === 'incomplete' || incompleteReason === 'max_output_tokens',
    usage: compactUsage({
      inputTokens: count(usage.input_tokens), cachedInputTokens: count(inputDetails.cached_tokens),
      cacheWriteInputTokens: count(inputDetails.cache_write_tokens),
      visibleOutputTokens: subtract(outputTokens, reasoningTokens), reasoningTokens,
      totalTokens: count(usage.total_tokens),
    }),
    ...(refusal ? { detail: refusal } : {}),
  };
}

function normalizeGoogle(body: Record<string, unknown>): NormalizedProviderResponseV2 {
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const candidate = record(candidates[0]);
  const finishReason = string(candidate.finishReason);
  const blockReason = string(record(body.promptFeedback).blockReason);
  const usage = record(body.usageMetadata);
  const parts = Array.isArray(record(candidate.content).parts) ? record(candidate.content).parts as unknown[] : [];
  const text = parts.filter((part) => record(part).thought !== true).map((part) => string(record(part).text) ?? '').join('');
  const refused = Boolean(blockReason) || ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(finishReason ?? '');
  return {
    disposition: refused ? 'PROVIDER_REFUSAL' : 'SUCCESS', text: refused ? undefined : text,
    providerRequestId: string(body.responseId), providerModel: string(body.modelVersion),
    finishReason: blockReason ?? finishReason,
    truncated: finishReason === undefined && blockReason === undefined ? undefined : finishReason === 'MAX_TOKENS',
    usage: compactUsage({
      inputTokens: count(usage.promptTokenCount), cachedInputTokens: count(usage.cachedContentTokenCount),
      visibleOutputTokens: count(usage.candidatesTokenCount), reasoningTokens: count(usage.thoughtsTokenCount),
      totalTokens: count(usage.totalTokenCount),
    }),
    ...(refused ? { detail: blockReason ?? finishReason } : {}),
  };
}

function normalizeDeepSeek(body: Record<string, unknown>): NormalizedProviderResponseV2 {
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const choice = record(choices[0]);
  const message = record(choice.message);
  const usage = record(body.usage);
  const completion = count(usage.completion_tokens);
  const reasoning = count(record(usage.completion_tokens_details).reasoning_tokens);
  const finishReason = string(choice.finish_reason);
  const refused = finishReason === 'content_filter' || typeof message.refusal === 'string';
  return {
    disposition: refused ? 'PROVIDER_REFUSAL' : 'SUCCESS',
    text: refused ? undefined : string(message.content), providerRequestId: string(body.id),
    providerModel: string(body.model), providerSystemFingerprint: string(body.system_fingerprint), finishReason,
    truncated: finishReason === undefined ? undefined : finishReason === 'length',
    usage: compactUsage({
      inputTokens: count(usage.prompt_tokens), cachedInputTokens: count(usage.prompt_cache_hit_tokens),
      cacheMissInputTokens: count(usage.prompt_cache_miss_tokens), visibleOutputTokens: subtract(completion, reasoning),
      reasoningTokens: reasoning, totalTokens: count(usage.total_tokens),
    }),
    ...(refused ? { detail: string(message.refusal) ?? finishReason } : {}),
  };
}

async function loadVerifiedMedia(
  artifact: HashedStagePacketV2,
  kind: ProviderKindV2,
  reader: (path: string) => Promise<Uint8Array>,
): Promise<Array<{ mimeType: string; base64: string }>> {
  if (artifact.packet.inputArm === 'TEXT_EVIDENCE_ONLY' && artifact.transportAttachments.length) {
    throw new ProviderCodecErrorV2('TEXT_ARM_ATTACHMENT', 'Text-only packets cannot carry attachments');
  }
  const supported = SUPPORTED_MEDIA[kind];
  const descriptors = Array.isArray(artifact.packet.modelInput.mediaDescriptors)
    ? artifact.packet.modelInput.mediaDescriptors.map(record) : [];
  return Promise.all(artifact.transportAttachments.map(async (attachment) => {
    if (!supported.has(attachment.mimeType)) {
      throw new ProviderCodecErrorV2('UNSUPPORTED_MODALITY', `${kind} cannot accept ${attachment.mimeType}`);
    }
    const descriptor = descriptors.find((entry) => entry.assetId === attachment.assetId);
    if (descriptor?.artifactSha256 !== attachment.artifactSha256) {
      throw new ProviderCodecErrorV2('MEDIA_DESCRIPTOR_DRIFT', attachment.assetId);
    }
    const bytes = await reader(attachment.artifactPath);
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (bytes.byteLength !== attachment.bytes || digest !== attachment.artifactSha256) {
      throw new ProviderCodecErrorV2('ATTACHMENT_INTEGRITY', attachment.assetId);
    }
    return { mimeType: attachment.mimeType, base64: Buffer.from(bytes).toString('base64') };
  }));
}

function schemaName(artifact: HashedStagePacketV2): string {
  return `editron_oe_stage_${artifact.packet.stage}_${artifact.packet.taskId}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}
function findOpenAIContent(output: unknown, type: string): string | undefined {
  if (!Array.isArray(output)) return undefined;
  for (const item of output) for (const part of Array.isArray(record(item).content) ? record(item).content as unknown[] : []) {
    if (record(part).type === type && typeof record(part).text === 'string') return record(part).text as string;
    if (record(part).type === type && typeof record(part).refusal === 'string') return record(part).refusal as string;
  }
  return undefined;
}
function compactUsage(value: ProviderUsageV2): ProviderUsageV2 {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as ProviderUsageV2;
}
function subtract(total: number | undefined, part: number | undefined): number | undefined {
  return total === undefined || part === undefined || part > total ? undefined : total - part;
}
function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
function string(value: unknown): string | undefined { return typeof value === 'string' && value ? value : undefined; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
