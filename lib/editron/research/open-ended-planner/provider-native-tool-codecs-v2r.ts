import { canonicalizeJsonV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  FINISH_RESEARCH_EPISODE_TOOL_V2R,
  type ProviderNativeToolSetV2R,
} from './provider-native-tool-catalog-v2r';
import {
  bindProviderNativeReferenceInputV2R,
  type BoundProviderNativeReferenceInputV2R,
} from './provider-native-reference-input-v2r';
import {
  bindProviderNativeVideoReferenceInputV2R,
  isProviderNativeVideoReferenceInputV2R,
  type BoundProviderNativeVideoReferenceInputV2R,
  type ProviderNativeReferenceMediaInputV2R,
} from './provider-native-video-reference-input-v2r';

type JsonRecord = Record<string, unknown>;

export type ProviderNativeKindV2R = 'openai' | 'google';
export type ProviderNativeGoogleFlashModelV2R =
  | 'gemini-3.6-flash'
  | 'gemini-3.7-flash';

export interface ProviderNativeRouteV2R {
  routeId: 'OPENAI_LUNA' | 'OPENAI_TERRA' | 'GOOGLE_FLASH';
  provider: ProviderNativeKindV2R;
  model: 'gpt-5.6-luna' | 'gpt-5.6-terra' | ProviderNativeGoogleFlashModelV2R;
  claimedModelIdentity: string;
  reasoningMode: 'minimal' | 'low' | 'medium' | 'high';
}

export interface SerializedProviderNativeTurnV2R {
  provider: ProviderNativeKindV2R;
  endpoint: string;
  authMode: 'BEARER' | 'X_GOOG_API_KEY';
  body: Readonly<JsonRecord>;
  requestHash: string;
}

export interface ProviderNativeToolCallV2R {
  callId: string;
  name: string;
  arguments: JsonRecord | null;
  argumentError: 'INVALID_JSON' | 'INVALID_OBJECT' | null;
}

export interface NormalizedProviderNativeTurnV2R {
  provider: ProviderNativeKindV2R;
  providerRequestId: string | null;
  providerModel: string | null;
  finishReason: string | null;
  continuationItems: readonly unknown[];
  toolCalls: readonly Readonly<ProviderNativeToolCallV2R>[];
  text: string | null;
  refusal: string | null;
}

export function buildProviderNativeInitialHistoryV2R(
  provider: ProviderNativeKindV2R,
  prompt: string,
  referenceInput?: Readonly<ProviderNativeReferenceMediaInputV2R>,
): readonly unknown[] {
  const content = providerNativeInitialContent(provider, prompt, referenceInput);
  return provider === 'openai'
    ? [{ role: 'user', content }]
    : [{ type: 'user_input', content }];
}

function providerNativeInitialContent(
  provider: ProviderNativeKindV2R,
  prompt: string,
  referenceInput?: Readonly<ProviderNativeReferenceMediaInputV2R>,
): readonly Readonly<JsonRecord>[] {
  if (referenceInput && isProviderNativeVideoReferenceInputV2R(referenceInput)) {
    if (provider !== 'google') {
      throw new Error('PROVIDER_NATIVE_VIDEO_REFERENCE_UNSUPPORTED:openai');
    }
    const bound = bindProviderNativeVideoReferenceInputV2R(referenceInput);
    return [
      providerVideoItem(bound),
      providerTextItem(provider, canonicalizeJsonV1({
        type: 'EDITRON_NATIVE_VIDEO_REFERENCE_INPUT_MANIFEST_V2R',
        manifestSha256: bound.manifestSha256,
        manifest: bound.manifest,
      })),
      providerTextItem(provider, prompt),
    ];
  }
  const content: JsonRecord[] = [provider === 'openai'
    ? { type: 'input_text', text: prompt }
    : { type: 'text', text: prompt }];
  if (!referenceInput) return content;
  const bound = bindProviderNativeReferenceInputV2R(referenceInput);
  content.push(providerTextItem(provider, canonicalizeJsonV1({
    type: 'EDITRON_REFERENCE_INPUT_MANIFEST_V2R',
    manifestSha256: bound.manifestSha256,
    manifest: bound.manifest,
  })));
  for (const [index, frame] of bound.input.frames.entries()) {
    content.push(providerTextItem(provider, canonicalizeJsonV1({
      type: 'EDITRON_REFERENCE_FRAME_BINDING_V2R',
      manifestSha256: bound.manifestSha256,
      index,
      frame: bound.manifest.frames[index],
    })));
    content.push(providerImageItem(provider, bound, index, frame.bytesBase64));
  }
  return content;
}

function providerVideoItem(
  bound: Readonly<BoundProviderNativeVideoReferenceInputV2R>,
): JsonRecord {
  return {
    type: 'video',
    data: bound.input.bytesBase64,
    mime_type: bound.input.mimeType,
    resolution: bound.input.resolution,
  };
}

function providerTextItem(provider: ProviderNativeKindV2R, text: string): JsonRecord {
  return provider === 'openai' ? { type: 'input_text', text } : { type: 'text', text };
}

function providerImageItem(
  provider: ProviderNativeKindV2R,
  bound: Readonly<BoundProviderNativeReferenceInputV2R>,
  index: number,
  bytesBase64: string,
): JsonRecord {
  const frame = bound.input.frames[index];
  return provider === 'openai'
    ? {
        type: 'input_image',
        image_url: `data:${frame.mimeType};base64,${bytesBase64}`,
        detail: bound.input.resolution,
      }
    : {
        type: 'image',
        data: bytesBase64,
        mime_type: frame.mimeType,
        resolution: bound.input.resolution,
      };
}

export function serializeProviderNativeTurnV2R(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  toolSet: Readonly<ProviderNativeToolSetV2R>;
  history: readonly unknown[];
  maxOutputTokens: number;
}): Readonly<SerializedProviderNativeTurnV2R> {
  if (!input.history.length) throw new Error('PROVIDER_NATIVE_HISTORY_EMPTY');
  if (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 64) {
    throw new Error('PROVIDER_NATIVE_OUTPUT_BUDGET_INVALID');
  }
  const body = input.route.provider === 'openai'
    ? openAiBody(input)
    : googleBody(input);
  const endpoint = input.route.provider === 'openai'
    ? 'https://api.openai.com/v1/responses'
    : 'https://generativelanguage.googleapis.com/v1beta/interactions';
  return Object.freeze({
    provider: input.route.provider,
    endpoint,
    authMode: input.route.provider === 'openai' ? 'BEARER' : 'X_GOOG_API_KEY',
    body: Object.freeze(body),
    requestHash: hashCanonicalJsonV1({ endpoint, body }),
  });
}

export function normalizeProviderNativeTurnV2R(
  provider: ProviderNativeKindV2R,
  body: unknown,
): Readonly<NormalizedProviderNativeTurnV2R> {
  const response = record(body);
  return provider === 'openai'
    ? normalizeOpenAi(response)
    : normalizeGoogle(response);
}

export function appendProviderNativeTurnV2R(input: {
  provider: ProviderNativeKindV2R;
  history: readonly unknown[];
  response: Readonly<NormalizedProviderNativeTurnV2R>;
  call: Readonly<ProviderNativeToolCallV2R>;
  result: unknown;
}): readonly unknown[] {
  const resultItem = input.provider === 'openai'
    ? {
        type: 'function_call_output',
        call_id: input.call.callId,
        output: JSON.stringify(input.result),
      }
    : {
        type: 'function_result',
        name: input.call.name,
        call_id: input.call.callId,
        result: [{ type: 'text', text: JSON.stringify(input.result) }],
      };
  return Object.freeze([
    ...input.history,
    ...input.response.continuationItems,
    resultItem,
  ]);
}

function openAiBody(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  toolSet: Readonly<ProviderNativeToolSetV2R>;
  history: readonly unknown[];
  maxOutputTokens: number;
}): JsonRecord {
  return {
    model: input.route.model,
    store: false,
    input: [...input.history],
    tools: [
      ...input.toolSet.operators.map((tool) => ({
        type: 'function',
        name: tool.operatorId,
        description: tool.description,
        parameters: tool.openAiInputSchema,
        strict: tool.openAiStrict,
      })),
      {
        type: 'function',
        name: input.toolSet.finishControl.name,
        description: 'Finish the research episode with an honest typed disposition. This is not an Editron catalog operation.',
        parameters: input.toolSet.finishControl.providerInputSchema,
        strict: true,
      },
    ],
    tool_choice: 'auto',
    parallel_tool_calls: false,
    reasoning: { effort: input.route.reasoningMode },
    max_output_tokens: input.maxOutputTokens,
  };
}

function googleBody(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  toolSet: Readonly<ProviderNativeToolSetV2R>;
  history: readonly unknown[];
  maxOutputTokens: number;
}): JsonRecord {
  const tools = [
    ...input.toolSet.operators.map((tool) => ({
      type: 'function',
      name: tool.operatorId,
      description: tool.description,
      parameters: tool.providerInputSchema,
    })),
    {
      type: 'function',
      name: input.toolSet.finishControl.name,
      description: 'Finish the research episode with an honest typed disposition. This is not an Editron catalog operation.',
      parameters: input.toolSet.finishControl.providerInputSchema,
    },
  ];
  return {
    model: input.route.model,
    store: false,
    input: [...input.history],
    tools,
    generation_config: {
      max_output_tokens: input.maxOutputTokens,
      thinking_level: input.route.reasoningMode,
      tool_choice: input.toolSet.operators.length ? 'auto' : 'validated',
    },
  };
}

function normalizeOpenAi(body: JsonRecord): Readonly<NormalizedProviderNativeTurnV2R> {
  const output = Array.isArray(body.output) ? body.output : [];
  const calls = output.filter((item) => record(item).type === 'function_call')
    .map((item) => openAiCall(record(item)));
  const refusal = output.flatMap((item) => array(record(item).content))
    .map(record)
    .find((item) => item.type === 'refusal');
  const joinedText = output.flatMap((item) => array(record(item).content))
    .map(record)
    .filter((item) => item.type === 'output_text')
    .map((item) => text(item.text) ?? '')
    .join('');
  const textValue = text(body.output_text) ?? (joinedText || null);
  return Object.freeze({
    provider: 'openai',
    providerRequestId: text(body.id),
    providerModel: text(body.model),
    finishReason: text(record(body.incomplete_details).reason) ?? text(body.status),
    continuationItems: Object.freeze([...output]),
    toolCalls: Object.freeze(calls),
    text: textValue,
    refusal: refusal ? text(refusal.refusal) ?? 'PROVIDER_REFUSAL' : null,
  });
}

function normalizeGoogle(body: JsonRecord): Readonly<NormalizedProviderNativeTurnV2R> {
  const steps = Array.isArray(body.steps) ? body.steps : [];
  const calls = steps.filter((step) => record(step).type === 'function_call')
    .map((step) => googleCall(record(step)));
  const joinedText = steps.map((step) => googleStepText(record(step))).join('');
  const textValue = text(body.output_text) ?? (joinedText || null);
  return Object.freeze({
    provider: 'google',
    providerRequestId: text(body.id) ?? text(body.interaction_id),
    providerModel: text(body.model) ?? text(body.model_version),
    finishReason: text(body.status),
    continuationItems: Object.freeze([...steps]),
    toolCalls: Object.freeze(calls),
    text: textValue,
    refusal: isRecord(body.error) ? text(record(body.error).message) ?? 'PROVIDER_ERROR' : null,
  });
}

function googleStepText(step: JsonRecord): string {
  const direct = text(step.text);
  if (direct) return direct;
  return array(step.content)
    .map(record)
    .filter((item) => item.type === 'text' || item.type === 'output_text')
    .map((item) => text(item.text) ?? '')
    .join('');
}

function openAiCall(item: JsonRecord): Readonly<ProviderNativeToolCallV2R> {
  const rawArguments = item.arguments;
  try {
    const parsed = typeof rawArguments === 'string' ? JSON.parse(rawArguments) as unknown : rawArguments;
    return call(text(item.call_id) ?? text(item.id), text(item.name), parsed);
  } catch {
    return Object.freeze({
      callId: text(item.call_id) ?? text(item.id) ?? '', name: text(item.name) ?? '',
      arguments: null, argumentError: 'INVALID_JSON',
    });
  }
}

function googleCall(item: JsonRecord): Readonly<ProviderNativeToolCallV2R> {
  return call(text(item.id), text(item.name), item.arguments);
}

function call(callId: string | null, name: string | null, args: unknown): Readonly<ProviderNativeToolCallV2R> {
  return Object.freeze({
    callId: callId ?? '', name: name ?? '',
    arguments: isRecord(args) ? args : null,
    argumentError: isRecord(args) ? null : 'INVALID_OBJECT',
  });
}

export function isFinishResearchEpisodeCallV2R(call: Readonly<ProviderNativeToolCallV2R>): boolean {
  return call.name === FINISH_RESEARCH_EPISODE_TOOL_V2R;
}

function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown): string | null { return typeof value === 'string' && value ? value : null; }
