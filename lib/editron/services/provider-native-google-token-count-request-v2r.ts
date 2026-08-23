import {
  canonicalizeJsonV1,
  hashCanonicalJsonV1,
} from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;
type GoogleRole = 'user' | 'model';

export const PROVIDER_NATIVE_GOOGLE_COUNT_REQUEST_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_GOOGLE_COUNT_REQUEST_V2R_1' as const;
const INTERACTIONS_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/interactions';

export interface ProviderNativeGoogleCountRequestV2R {
  version: typeof PROVIDER_NATIVE_GOOGLE_COUNT_REQUEST_VERSION_V2R;
  endpoint: string;
  body: Readonly<{ generateContentRequest: Readonly<JsonRecord> }>;
  generationRequestHash: string;
  translationSha256: string;
  protocolOverheadTokenAllowance: number;
  requestHash: string;
}

export function buildProviderNativeGoogleCountRequestV2R(input: Readonly<{
  route: Readonly<ProviderNativeRouteV2R>;
  routeSha256: string;
  request: Readonly<SerializedProviderNativeTurnV2R>;
}>): Readonly<ProviderNativeGoogleCountRequestV2R> {
  assertRouteRequest(input.route, input.routeSha256, input.request);
  const source = record(input.request.body, 'GOOGLE_COUNT_SOURCE_BODY');
  exactKeys(source, ['model', 'store', 'input', 'tools', 'generation_config'],
    'GOOGLE_COUNT_SOURCE_BODY');
  if (source.model !== input.route.model || source.store !== false) {
    fail('GOOGLE_COUNT_SOURCE_BODY_INVALID');
  }
  const generation = record(source.generation_config, 'GOOGLE_COUNT_GENERATION');
  exactKeys(generation, ['max_output_tokens', 'thinking_level', 'tool_choice'],
    'GOOGLE_COUNT_GENERATION');
  if (!Number.isSafeInteger(generation.max_output_tokens)
    || Number(generation.max_output_tokens) < 64
    || generation.thinking_level !== input.route.reasoningMode
    || !['auto', 'validated'].includes(String(generation.tool_choice))) {
    fail('GOOGLE_COUNT_GENERATION_INVALID');
  }
  const steps = array(source.input, 'GOOGLE_COUNT_INPUT');
  if (!steps.length) fail('GOOGLE_COUNT_INPUT_EMPTY');
  const tools = mapTools(array(source.tools, 'GOOGLE_COUNT_TOOLS'));
  const contents = mapSteps(steps);
  if (!contents.length) fail('GOOGLE_COUNT_CONTENTS_EMPTY');
  const generateContentRequest = Object.freeze({
    model: `models/${input.route.model}`,
    contents,
    tools: [Object.freeze({ functionDeclarations: tools })],
    toolConfig: {
      functionCallingConfig: {
        mode: String(generation.tool_choice).toUpperCase(),
      },
    },
  });
  const body = Object.freeze({ generateContentRequest });
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.route.model)}:countTokens`;
  const translationMaterial = {
    version: PROVIDER_NATIVE_GOOGLE_COUNT_REQUEST_VERSION_V2R,
    routeSha256: input.routeSha256,
    generationRequestHash: input.request.requestHash,
    generateContentRequest,
  };
  const protocolOverheadTokenAllowance = Buffer.byteLength(
    canonicalizeJsonV1(redactSemanticPayload(source)),
    'utf8',
  ) + 512;
  return Object.freeze({
    version: PROVIDER_NATIVE_GOOGLE_COUNT_REQUEST_VERSION_V2R,
    endpoint,
    body,
    generationRequestHash: input.request.requestHash,
    translationSha256: hashCanonicalJsonV1(translationMaterial),
    protocolOverheadTokenAllowance,
    requestHash: hashCanonicalJsonV1({ endpoint, body }),
  });
}

function mapSteps(values: readonly unknown[]): readonly Readonly<JsonRecord>[] {
  const contents: Array<{ role: GoogleRole; parts: JsonRecord[] }> = [];
  const push = (role: GoogleRole, parts: readonly JsonRecord[]) => {
    if (!parts.length) return;
    const current = contents[contents.length - 1];
    if (current?.role === role) current.parts.push(...parts);
    else contents.push({ role, parts: [...parts] });
  };
  for (const value of values) {
    const step = record(value, 'GOOGLE_COUNT_STEP');
    const type = string(step.type, 'GOOGLE_COUNT_STEP_TYPE');
    if (type === 'user_input') {
      onlyKeys(step, ['type', 'content', 'status'], 'GOOGLE_COUNT_USER_STEP');
      push('user', mapContent(array(step.content, 'GOOGLE_COUNT_USER_CONTENT')));
    } else if (type === 'model_output') {
      onlyKeys(step, ['type', 'content', 'status'], 'GOOGLE_COUNT_MODEL_STEP');
      push('model', mapContent(array(step.content ?? [], 'GOOGLE_COUNT_MODEL_CONTENT')));
    } else if (type === 'thought') {
      onlyKeys(step, ['type', 'summary', 'signature', 'status'], 'GOOGLE_COUNT_THOUGHT_STEP');
      push('model', thoughtParts(step));
    } else if (type === 'function_call') {
      onlyKeys(step, ['type', 'id', 'name', 'arguments', 'signature', 'status'],
        'GOOGLE_COUNT_CALL_STEP');
      const part: JsonRecord = { functionCall: {
        id: string(step.id, 'GOOGLE_COUNT_CALL_ID'),
        name: string(step.name, 'GOOGLE_COUNT_CALL_NAME'),
        args: record(step.arguments, 'GOOGLE_COUNT_CALL_ARGUMENTS'),
      } };
      if (step.signature !== undefined) {
        part.thoughtSignature = string(step.signature, 'GOOGLE_COUNT_CALL_SIGNATURE');
      }
      push('model', [part]);
    } else if (type === 'function_result') {
      onlyKeys(step, ['type', 'call_id', 'name', 'result', 'is_error', 'signature', 'status'],
        'GOOGLE_COUNT_RESULT_STEP');
      const parsed = parseFunctionResult(step.result);
      const part: JsonRecord = { functionResponse: {
        id: string(step.call_id, 'GOOGLE_COUNT_RESULT_CALL_ID'),
        name: string(step.name, 'GOOGLE_COUNT_RESULT_NAME'),
        response: step.is_error === true ? { error: parsed } : { output: parsed },
      } };
      if (step.signature !== undefined) {
        part.thoughtSignature = string(step.signature, 'GOOGLE_COUNT_RESULT_SIGNATURE');
      }
      push('user', [part]);
    } else {
      fail(`GOOGLE_COUNT_STEP_UNSUPPORTED:${type}`);
    }
  }
  return Object.freeze(contents.map(({ role, parts }) => Object.freeze({
    role, parts: Object.freeze(parts.map((part) => Object.freeze(part))),
  })));
}

function mapContent(values: readonly unknown[]): readonly JsonRecord[] {
  return values.map((value) => {
    const content = record(value, 'GOOGLE_COUNT_CONTENT');
    const type = string(content.type, 'GOOGLE_COUNT_CONTENT_TYPE');
    if (type === 'text') {
      exactKeys(content, ['type', 'text'], 'GOOGLE_COUNT_TEXT_CONTENT');
      return { text: string(content.text, 'GOOGLE_COUNT_TEXT') };
    }
    if (type !== 'image' && type !== 'video') {
      fail(`GOOGLE_COUNT_CONTENT_UNSUPPORTED:${type}`);
    }
    exactKeys(content, ['type', 'data', 'mime_type', 'resolution'],
      'GOOGLE_COUNT_MEDIA_CONTENT');
    const mimeType = string(content.mime_type, 'GOOGLE_COUNT_MEDIA_MIME');
    if (content.resolution !== 'high'
      || (type === 'image' && !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType))
      || (type === 'video' && mimeType !== 'video/mp4')) {
      fail('GOOGLE_COUNT_MEDIA_UNSUPPORTED');
    }
    const data = canonicalBase64(content.data);
    return {
      inlineData: { mimeType, data },
      mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' },
    };
  });
}

function thoughtParts(step: JsonRecord): readonly JsonRecord[] {
  const summary = array(step.summary ?? [], 'GOOGLE_COUNT_THOUGHT_SUMMARY');
  const parts: JsonRecord[] = mapContent(summary)
    .map((part) => ({ ...part, thought: true }));
  const signature = step.signature === undefined
    ? null : string(step.signature, 'GOOGLE_COUNT_THOUGHT_SIGNATURE');
  if (!parts.length && signature) parts.push({ text: '', thought: true });
  if (signature && parts[0]) parts[0].thoughtSignature = signature;
  return parts;
}

function mapTools(values: readonly unknown[]): readonly Readonly<JsonRecord>[] {
  if (!values.length) fail('GOOGLE_COUNT_TOOLS_EMPTY');
  return Object.freeze(values.map((value) => {
    const tool = record(value, 'GOOGLE_COUNT_TOOL');
    exactKeys(tool, ['type', 'name', 'description', 'parameters'], 'GOOGLE_COUNT_TOOL');
    if (tool.type !== 'function') fail('GOOGLE_COUNT_TOOL_UNSUPPORTED');
    return Object.freeze({
      name: string(tool.name, 'GOOGLE_COUNT_TOOL_NAME'),
      description: string(tool.description, 'GOOGLE_COUNT_TOOL_DESCRIPTION'),
      parameters: record(tool.parameters, 'GOOGLE_COUNT_TOOL_PARAMETERS'),
    });
  }));
}

function parseFunctionResult(value: unknown): unknown {
  const result = array(value, 'GOOGLE_COUNT_RESULT');
  if (result.length !== 1) fail('GOOGLE_COUNT_RESULT_SHAPE_INVALID');
  const item = record(result[0], 'GOOGLE_COUNT_RESULT_ITEM');
  exactKeys(item, ['type', 'text'], 'GOOGLE_COUNT_RESULT_ITEM');
  if (item.type !== 'text') fail('GOOGLE_COUNT_RESULT_CONTENT_UNSUPPORTED');
  try { return JSON.parse(string(item.text, 'GOOGLE_COUNT_RESULT_TEXT')) as unknown; }
  catch { fail('GOOGLE_COUNT_RESULT_JSON_INVALID'); }
}

function assertRouteRequest(route: Readonly<ProviderNativeRouteV2R>, routeSha256: string,
  request: Readonly<SerializedProviderNativeTurnV2R>): void {
  if (route.routeId !== 'GOOGLE_FLASH' || route.provider !== 'google'
    || route.claimedModelIdentity !== route.model
    || routeSha256 !== hashCanonicalJsonV1(route)
    || request.provider !== 'google' || request.endpoint !== INTERACTIONS_ENDPOINT
    || request.authMode !== 'X_GOOG_API_KEY'
    || request.requestHash !== hashCanonicalJsonV1({ endpoint: request.endpoint, body: request.body })) {
    fail('GOOGLE_COUNT_ROUTE_OR_REQUEST_INVALID');
  }
}

function redactSemanticPayload(value: JsonRecord): unknown {
  return JSON.parse(JSON.stringify(value, (key, item: unknown) =>
    ['data', 'text', 'description', 'parameters', 'arguments', 'result', 'signature']
      .includes(key) ? `[${key.toUpperCase()}]` : item)) as unknown;
}
function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as JsonRecord;
}
function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${label}_INVALID`); return value;
}
function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) fail(`${label}_INVALID`); return value;
}
function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  if (Object.keys(value).sort().join('\n') !== [...keys].sort().join('\n')) fail(`${label}_FIELDS_INVALID`);
}
function onlyKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) fail(`${label}_FIELDS_INVALID`);
}
function canonicalBase64(value: unknown): string {
  const text = string(value, 'GOOGLE_COUNT_MEDIA_DATA'); const bytes = Buffer.from(text, 'base64');
  if (!bytes.length || bytes.toString('base64') !== text) fail('GOOGLE_COUNT_MEDIA_DATA_INVALID');
  return text;
}
function fail(code: string): never { throw new Error(code); }
