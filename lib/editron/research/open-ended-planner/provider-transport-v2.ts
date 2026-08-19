import { deepFreezeV1, hashCanonicalJsonV1, sha256TextV1 } from './contracts-v1';
import { perAttemptStageBudgetV2R } from './per-attempt-budget-v2r';
import {
  mapProviderHttpFailureV2,
  normalizeProviderResponseV2,
  ProviderCodecErrorV2,
  serializeProviderRequestV2,
  type ProviderRouteV2,
  type SerializedProviderRequestV2,
  type ProviderUsageV2,
  type SchemaModeV2,
} from './provider-codecs-v2';
import type { HashedStagePacketV2 } from './staged-packet-v2';
type FetchV2 = typeof fetch;
type NullableNumber = number | null;
type TrialDispositionV2 =
  | 'ARTIFACT_ACCEPTED' | 'NOT_APPLICABLE' | 'BUDGET_EXCEEDED' | 'TELEMETRY_UNVERIFIABLE'
  | 'PROVIDER_TIMEOUT' | 'PROVIDER_RATE_LIMIT' | 'PROVIDER_REFUSAL' | 'PROVIDER_ERROR'
  | 'TRUNCATED' | 'MALFORMED_JSON' | 'SCHEMA_INVALID' | 'TRANSPORT_INVALID';
export interface ProviderPricingV2 {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
  cacheWriteUsdPerMillion?: number;
}
export interface ProviderAttemptRecordV2 {
  provider: string;
  model: string;
  requestedModel: string;
  providerModel: string | null;
  providerSystemFingerprint: string | null;
  providerRequestId: string | null;
  inputArm: string;
  executionFormArm: string;
  attempt: 1 | 2;
  inputTokens: NullableNumber;
  cachedInputTokens: NullableNumber;
  cacheWriteInputTokens: NullableNumber;
  cacheMissInputTokens: NullableNumber;
  visibleOutputTokens: NullableNumber;
  reasoningTokens: NullableNumber;
  totalTokens: NullableNumber;
  finishReason: string | null;
  truncated: boolean | null;
  latencyMs: number;
  providerCostUsd: NullableNumber;
  parseStatus: string;
  schemaDiagnostics: string[];
  artifactSha256: string | null;
  disposition: TrialDispositionV2;
  schemaMode: SchemaModeV2 | null;
  promptHash: string | null;
  requestHash: string | null;
  providerResponseEnvelopeHash: string | null;
  rawResponse: string | null;
  rawResponseHash: string | null;
  detail?: string;
}
export interface ProviderStageRunV2 {
  runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  packetHash: string;
  disposition: TrialDispositionV2;
  attempts: ReadonlyArray<Readonly<ProviderAttemptRecordV2>>;
  artifact?: Readonly<Record<string, unknown>>;
}
export type ProviderInputTokenCounterV2 = (input: {
  attempt: 1 | 2;
  request: SerializedProviderRequestV2;
  priorRequest?: SerializedProviderRequestV2;
  priorInputTokens?: number;
}) => Promise<number>;
export async function runProviderStageV2(input: {
  artifact: HashedStagePacketV2;
  route: ProviderRouteV2;
  pricing: ProviderPricingV2;
  preflightInputTokens: readonly [number, number] | ProviderInputTokenCounterV2;
  fetchImpl: FetchV2;
  readAttachmentBytes?: (path: string) => Promise<Uint8Array>;
  signal?: AbortSignal;
  nowMs?: () => number;
}): Promise<Readonly<ProviderStageRunV2>> {
  validateConfiguration(input);
  const fetchImpl = input.fetchImpl;
  const now = input.nowMs ?? Date.now;
  const limit = input.artifact.packet.stageBudget;
  const attempts: ProviderAttemptRecordV2[] = [];
  let repair: { diagnostics: string[]; priorResponse: string } | undefined;
  let priorRequest: SerializedProviderRequestV2 | undefined;
  let priorInputTokens: number | undefined;
  let acceptedArtifact: Record<string, unknown> | undefined;
  for (const attempt of [1, 2] as const) {
    if (attempt === 2 && !repair) break;
    // V2-1R per-attempt budget law: every permitted attempt receives its own
    // declared budget freshly allocated from the stage budget, never the residue
    // of a prior attempt. A slow first attempt can no longer starve the repair
    // into a false PROVIDER_TIMEOUT.
    const remaining = perAttemptStageBudgetV2R(limit);
    let request;
    try {
      request = await serializeProviderRequestV2({
        route: input.route, artifact: input.artifact, attempt,
        outputBudget: { visible: remaining.visible, reasoning: remaining.reasoning }, repair,
        readAttachmentBytes: input.readAttachmentBytes,
      });
    } catch (error) {
      const unsupported = error instanceof ProviderCodecErrorV2 && error.code === 'UNSUPPORTED_MODALITY';
      attempts.push(emptyRecord(
        input, attempt, unsupported ? 'NOT_APPLICABLE' : 'TRANSPORT_INVALID', 'NOT_ATTEMPTED',
        [error instanceof ProviderCodecErrorV2 ? error.code : 'SERIALIZATION_ERROR'], errorDetail(error),
      ));
      break;
    }
    let estimatedInput: number;
    let preflightLatency = 0;
    const preflightStarted = typeof input.preflightInputTokens === 'function' ? now() : 0;
    try {
      estimatedInput = await resolvePreflightInputTokens(
        input.preflightInputTokens, attempt, request, priorRequest, priorInputTokens,
      );
      preflightLatency = typeof input.preflightInputTokens === 'function'
        ? Math.max(0, now() - preflightStarted)
        : 0;
    } catch (error) {
      preflightLatency = typeof input.preflightInputTokens === 'function'
        ? Math.max(0, now() - preflightStarted)
        : 0;
      attempts.push(requestRecord(
        input, attempt, request, 'TRANSPORT_INVALID', 'PREFLIGHT_INPUT_COUNT_FAILED', preflightLatency, {},
        ['PREFLIGHT_INPUT_COUNT_FAILED'], undefined, errorDetail(error),
      ));
      break;
    }
    if (preflightLatency > remaining.wall) {
      attempts.push(requestRecord(
        input, attempt, request, 'BUDGET_EXCEEDED', 'PREFLIGHT_BLOCKED', preflightLatency, {},
        ['WALL_CLOCK_LIMIT'],
      ));
      break;
    }
    remaining.wall -= preflightLatency;
    const worstCost = estimateWorstCaseCost(
      estimatedInput, remaining.visible, remaining.reasoning, input.pricing,
    );
    if (estimatedInput > remaining.input || worstCost === undefined || worstCost > remaining.cost) {
      attempts.push(requestRecord(input, attempt, request, 'BUDGET_EXCEEDED', 'PREFLIGHT_BLOCKED', preflightLatency, {}, [
        estimatedInput > remaining.input ? 'PREFLIGHT_INPUT_LIMIT' : 'PREFLIGHT_COST_LIMIT',
      ]));
      break;
    }
    const started = now();
    let response: Response;
    try {
      response = await fetchImpl(request.endpoint, {
        method: 'POST', headers: request.headers, body: JSON.stringify(request.body),
        signal: combineSignals(input.signal, remaining.wall),
      });
    } catch (error) {
      const disposition = isAbort(error) ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR';
      attempts.push(requestRecord(input, attempt, request, disposition, 'NOT_ATTEMPTED', preflightLatency + now() - started, {}, [], undefined, errorDetail(error)));
      break;
    }
    const providerLatency = Math.max(0, now() - started);
    const latency = preflightLatency + providerLatency;
    const wallExceeded = providerLatency > remaining.wall;
    remaining.wall = Math.max(0, remaining.wall - providerLatency);
    if (wallExceeded) {
      attempts.push(requestRecord(input, attempt, request, 'BUDGET_EXCEEDED', 'NOT_ATTEMPTED', latency, {}, ['WALL_CLOCK_LIMIT']));
      break;
    }
    if (!response.ok) {
      const disposition = mapProviderHttpFailureV2(response.status) as TrialDispositionV2;
      attempts.push(requestRecord(input, attempt, request, disposition, 'NOT_ATTEMPTED', latency, {}, [], undefined, `HTTP_${response.status}`));
      break;
    }
    let responseBody: Record<string, unknown>;
    try {
      const value = await response.json() as unknown;
      responseBody = isRecord(value) ? value : {};
    } catch (error) {
      attempts.push(requestRecord(input, attempt, request, 'PROVIDER_ERROR', 'PROVIDER_BODY_INVALID', latency, {}, ['NON_JSON_PROVIDER_BODY'], undefined, errorDetail(error)));
      break;
    }
    const normalized = normalizeProviderResponseV2(input.route.kind, responseBody);
    if (normalized.disposition !== 'SUCCESS') {
      attempts.push(requestRecord(
        input, attempt, request, normalized.disposition, 'NOT_ATTEMPTED', latency,
        normalized.usage, [], normalized, normalized.detail, undefined, normalized.text,
      ));
      break;
    }
    const telemetryDiagnostics = inspectTelemetry(normalized, input.pricing);
    const providerCost = estimateCost(normalized.usage, input.pricing);
    if (telemetryDiagnostics.length || providerCost === undefined) {
      attempts.push(requestRecord(
        input, attempt, request, 'TELEMETRY_UNVERIFIABLE', 'NOT_ATTEMPTED', latency,
        normalized.usage, telemetryDiagnostics, normalized, undefined, undefined, normalized.text,
      ));
      break;
    }
    const usage = requiredUsage(normalized.usage);
    const budgetDiagnostics = inspectBudget(usage, providerCost, remaining);
    if (budgetDiagnostics.length) {
      attempts.push(requestRecord(
        input, attempt, request, 'BUDGET_EXCEEDED', 'NOT_ATTEMPTED', latency,
        usage, budgetDiagnostics, normalized, undefined, providerCost, normalized.text,
      ));
      break;
    }
    remaining.input -= usage.inputTokens;
    remaining.visible -= usage.visibleOutputTokens;
    remaining.reasoning -= usage.reasoningTokens;
    remaining.cost -= providerCost;
    if (normalized.truncated) {
      attempts.push(requestRecord(
        input, attempt, request, 'TRUNCATED', 'NOT_ATTEMPTED', latency,
        usage, [], normalized, undefined, providerCost, normalized.text,
      ));
      break;
    }
    const raw = normalized.text ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const record = requestRecord(input, attempt, request, 'MALFORMED_JSON', 'MALFORMED_JSON', latency, usage, ['INVALID_JSON'], normalized, undefined, providerCost, raw);
      attempts.push(record);
      if (attempt === 1) {
        repair = { diagnostics: record.schemaDiagnostics, priorResponse: raw };
        priorRequest = request;
        priorInputTokens = usage.inputTokens;
        continue;
      }
      break;
    }
    const schemaDiagnostics = validateSchema(parsed, input.artifact.packet.outputContract, '$');
    if (schemaDiagnostics.length) {
      const record = requestRecord(input, attempt, request, 'SCHEMA_INVALID', 'SCHEMA_INVALID', latency, usage, schemaDiagnostics, normalized, undefined, providerCost, raw);
      attempts.push(record);
      if (attempt === 1) {
        repair = { diagnostics: schemaDiagnostics, priorResponse: raw };
        priorRequest = request;
        priorInputTokens = usage.inputTokens;
        continue;
      }
      break;
    }
    acceptedArtifact = parsed as Record<string, unknown>;
    attempts.push(requestRecord(input, attempt, request, 'ARTIFACT_ACCEPTED', 'SCHEMA_VALID', latency, usage, [], normalized, undefined, providerCost, raw, hashCanonicalJsonV1(parsed)));
    break;
  }
  const disposition = attempts.at(-1)?.disposition ?? 'TRANSPORT_INVALID';
  return deepFreezeV1({
    runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
    packetHash: input.artifact.packetHash, disposition, attempts,
    ...(acceptedArtifact ? { artifact: acceptedArtifact } : {}),
  });
}
function requestRecord(
  input: Parameters<typeof runProviderStageV2>[0], attempt: 1 | 2,
  request: Awaited<ReturnType<typeof serializeProviderRequestV2>>, disposition: TrialDispositionV2,
  parseStatus: string, latencyMs: number, usage: ProviderUsageV2, diagnostics: string[],
  response?: {
    providerRequestId?: string;
    providerModel?: string;
    providerSystemFingerprint?: string;
    finishReason?: string;
    truncated?: boolean;
  }, detail?: string,
  cost?: number, raw?: string, artifactSha256?: string,
): ProviderAttemptRecordV2 {
  return {
    ...emptyRecord(input, attempt, disposition, parseStatus, diagnostics, detail),
    providerRequestId: response?.providerRequestId ?? null,
    providerModel: response?.providerModel ?? null,
    providerSystemFingerprint: response?.providerSystemFingerprint ?? null,
    inputTokens: usage.inputTokens ?? null, cachedInputTokens: usage.cachedInputTokens ?? null,
    cacheWriteInputTokens: usage.cacheWriteInputTokens ?? null, cacheMissInputTokens: usage.cacheMissInputTokens ?? null,
    visibleOutputTokens: usage.visibleOutputTokens ?? null, reasoningTokens: usage.reasoningTokens ?? null,
    totalTokens: usage.totalTokens ?? deriveTotal(usage), finishReason: response?.finishReason ?? null,
    truncated: response?.truncated ?? null, latencyMs, providerCostUsd: cost ?? null,
    artifactSha256: artifactSha256 ?? null, schemaMode: request.schemaMode,
    promptHash: request.promptHash, requestHash: request.requestHash,
    providerResponseEnvelopeHash: null,
    rawResponse: raw ?? null,
    rawResponseHash: raw === undefined ? null : sha256TextV1(raw),
  };
}
function emptyRecord(
  input: Parameters<typeof runProviderStageV2>[0], attempt: 1 | 2, disposition: TrialDispositionV2,
  parseStatus: string, schemaDiagnostics: string[], detail?: string,
): ProviderAttemptRecordV2 {
  return {
    provider: input.route.kind, model: input.route.modelSnapshot,
    requestedModel: input.route.model, providerModel: null, providerSystemFingerprint: null,
    providerRequestId: null,
    inputArm: input.artifact.packet.inputArm, executionFormArm: input.artifact.packet.executionFormArm,
    attempt, inputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null,
    cacheMissInputTokens: null, visibleOutputTokens: null, reasoningTokens: null, totalTokens: null,
    finishReason: null, truncated: null, latencyMs: 0, providerCostUsd: null, parseStatus,
    schemaDiagnostics, artifactSha256: null, disposition, schemaMode: null, promptHash: null,
    requestHash: null, providerResponseEnvelopeHash: null,
    rawResponse: null, rawResponseHash: null,
    ...(detail ? { detail: detail.slice(0, 500) } : {}),
  };
}
function inspectTelemetry(
  response: { providerRequestId?: string; providerModel?: string; finishReason?: string; usage: ProviderUsageV2 },
  pricing: ProviderPricingV2,
): string[] {
  const diagnostics: string[] = [];
  if (!response.providerRequestId) diagnostics.push('MISSING_PROVIDER_REQUEST_ID');
  if (!response.providerModel) diagnostics.push('MISSING_PROVIDER_MODEL_IDENTITY');
  if (!response.finishReason) diagnostics.push('MISSING_FINISH_REASON');
  for (const field of ['inputTokens', 'visibleOutputTokens', 'reasoningTokens'] as const) {
    if (response.usage[field] === undefined) diagnostics.push(`MISSING_${field.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);
  }
  if (response.usage.cachedInputTokens !== undefined && response.usage.inputTokens !== undefined
    && response.usage.cachedInputTokens > response.usage.inputTokens) diagnostics.push('CACHED_INPUT_EXCEEDS_INPUT');
  const cached = response.usage.cachedInputTokens ?? 0;
  const cacheWrite = response.usage.cacheWriteInputTokens ?? 0;
  if (response.usage.inputTokens !== undefined && cached + cacheWrite > response.usage.inputTokens) {
    diagnostics.push('CACHE_INPUT_CATEGORIES_EXCEED_INPUT');
  }
  if (cacheWrite > 0 && pricing.cacheWriteUsdPerMillion === undefined) {
    diagnostics.push('MISSING_CACHE_WRITE_PRICE');
  }
  return diagnostics;
}
function inspectBudget(
  usage: Required<Pick<ProviderUsageV2, 'inputTokens' | 'visibleOutputTokens' | 'reasoningTokens'>>,
  cost: number, remaining: { input: number; visible: number; reasoning: number; cost: number },
): string[] {
  return [
    ...(usage.inputTokens > remaining.input ? ['INPUT_TOKEN_LIMIT'] : []),
    ...(usage.visibleOutputTokens > remaining.visible ? ['VISIBLE_OUTPUT_TOKEN_LIMIT'] : []),
    ...(usage.reasoningTokens > remaining.reasoning ? ['REASONING_TOKEN_LIMIT'] : []),
    ...(cost > remaining.cost ? ['PROVIDER_COST_LIMIT'] : []),
  ];
}
function validateSchema(value: unknown, schema: unknown, path: string): string[] {
  if (!isRecord(schema)) return [`${path}:INVALID_SCHEMA`];
  if (Array.isArray(schema.anyOf)) {
    const alternatives = schema.anyOf.map((candidate) => validateSchema(value, candidate, path));
    return alternatives.some((diagnostics) => diagnostics.length === 0)
      ? []
      : (alternatives[0] ?? [`${path}:ANY_OF`]);
  }
  if ('const' in schema && value !== schema.const) return [`${path}:CONST`];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [`${path}:ENUM`];
  if (schema.type === 'null') return value === null ? [] : [`${path}:NULL`];
  if (schema.type === 'string') return typeof value === 'string' && (!schema.minLength || value.length >= Number(schema.minLength)) ? [] : [`${path}:STRING`];
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${path}:ARRAY`];
    const nested = value.flatMap((entry, index) => validateSchema(entry, schema.items, `${path}[${index}]`));
    if (schema.uniqueItems === true && new Set(value.map((entry) => hashCanonicalJsonV1(entry))).size !== value.length) nested.push(`${path}:UNIQUE`);
    return nested;
  }
  if (schema.type === 'object') {
    if (!isRecord(value)) return [`${path}:OBJECT`];
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const diagnostics = (Array.isArray(schema.required) ? schema.required : [])
      .filter((field): field is string => typeof field === 'string' && !(field in value)).map((field) => `${path}.${field}:REQUIRED`);
    if (schema.additionalProperties === false) for (const field of Object.keys(value)) if (!(field in properties)) diagnostics.push(`${path}.${field}:ADDITIONAL`);
    for (const [field, child] of Object.entries(value)) if (field in properties) diagnostics.push(...validateSchema(child, properties[field], `${path}.${field}`));
    return diagnostics;
  }
  return [];
}
function estimateCost(usage: ProviderUsageV2, pricing: ProviderPricingV2): number | undefined {
  if (usage.inputTokens === undefined || usage.visibleOutputTokens === undefined || usage.reasoningTokens === undefined) return undefined;
  const cached = usage.cachedInputTokens ?? 0;
  const cacheWrite = usage.cacheWriteInputTokens ?? 0;
  if (cached + cacheWrite > usage.inputTokens) return undefined;
  if (cacheWrite > 0 && pricing.cacheWriteUsdPerMillion === undefined) return undefined;
  const value = (usage.inputTokens - cached - cacheWrite) * pricing.inputUsdPerMillion
    + cached * (pricing.cachedInputUsdPerMillion ?? pricing.inputUsdPerMillion)
    + cacheWrite * (pricing.cacheWriteUsdPerMillion ?? pricing.inputUsdPerMillion)
    + (usage.visibleOutputTokens + usage.reasoningTokens) * pricing.outputUsdPerMillion;
  return Number((value / 1_000_000).toFixed(12));
}
function estimateWorstCaseCost(
  inputTokens: number,
  visibleOutputTokens: number,
  reasoningTokens: number,
  pricing: ProviderPricingV2,
): number {
  const inputRate = Math.max(
    pricing.inputUsdPerMillion,
    pricing.cachedInputUsdPerMillion ?? pricing.inputUsdPerMillion,
    pricing.cacheWriteUsdPerMillion ?? pricing.inputUsdPerMillion,
  );
  const value = inputTokens * inputRate
    + (visibleOutputTokens + reasoningTokens) * pricing.outputUsdPerMillion;
  return Number((value / 1_000_000).toFixed(12));
}
function requiredUsage(usage: ProviderUsageV2) {
  return { inputTokens: usage.inputTokens!, visibleOutputTokens: usage.visibleOutputTokens!, reasoningTokens: usage.reasoningTokens! };
}
function deriveTotal(usage: ProviderUsageV2): number | null {
  return usage.inputTokens === undefined || usage.visibleOutputTokens === undefined || usage.reasoningTokens === undefined
    ? null : usage.inputTokens + usage.visibleOutputTokens + usage.reasoningTokens;
}
function validateConfiguration(input: Parameters<typeof runProviderStageV2>[0]): void {
  for (const [name, value] of Object.entries(input.pricing)) if (!Number.isFinite(value) || value < 0) throw new TypeError(`Invalid ${name}`);
  if (Array.isArray(input.preflightInputTokens)) {
    for (const value of input.preflightInputTokens) if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Invalid preflight token count');
  } else if (typeof input.preflightInputTokens !== 'function') throw new TypeError('Invalid preflight token counter');
}
async function resolvePreflightInputTokens(
  source: readonly [number, number] | ProviderInputTokenCounterV2,
  attempt: 1 | 2,
  request: SerializedProviderRequestV2,
  priorRequest?: SerializedProviderRequestV2,
  priorInputTokens?: number,
): Promise<number> {
  const value = typeof source === 'function'
    ? await source({ attempt, request, priorRequest, priorInputTokens })
    : source[attempt - 1];
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Invalid preflight token count');
  return value;
}
function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, timeoutMs));
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
function isAbort(error: unknown): boolean { return error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name); }
function errorDetail(error: unknown): string { return error instanceof Error ? `${error.name}: ${error.message}` : 'NonErrorFailure'; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
