import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  normalizeProviderNativeTurnV2R,
  type ProviderNativeRouteV2R,
  type SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  ProviderNativeTransportErrorV2R,
  type ProviderNativeInvokeResponseV2R,
} from './provider-native-tool-episode-v2r';
import type { ProviderNativeDurableTransportOwnerV2R }
  from './provider-native-episode-owner-artifact-resolver-v2r';

type JsonRecord = Record<string, unknown>;
type FetchV2R = typeof fetch;

export interface ProviderNativeLiveTransportReceiptV2R {
  authority: 'RESEARCH_PROVIDER_TRANSPORT_NO_PROJECT_MUTATION';
  calls: readonly Readonly<{
    attempt: number;
    requestHash: string;
    provider: 'openai' | 'google';
    endpoint: string;
    responseStatus: number;
    responseSha256: string;
    returnedModelIdentity: string | null;
    usage: Readonly<JsonRecord>;
  }>[];
  secretsPersisted: false;
  receiptSha256: string;
}

export interface ProviderNativeCredentialSelectionV2R {
  openAiKey: string;
  googleKey: string;
  googleCredentialSource:
    | 'GOOGLE_GENERATIVE_AI_API_KEY'
    | 'GEMINI_API_KEY'
    | 'GOOGLE_API_KEY';
}

export function resolveProviderNativeCredentialsV2R(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<ProviderNativeCredentialSelectionV2R> {
  const googleCandidates = [
    ['GOOGLE_GENERATIVE_AI_API_KEY', environment.GOOGLE_GENERATIVE_AI_API_KEY],
    ['GEMINI_API_KEY', environment.GEMINI_API_KEY],
    ['GOOGLE_API_KEY', environment.GOOGLE_API_KEY],
  ] as const;
  const google = googleCandidates.find(([, value]) => Boolean(value?.trim()));
  if (!google) {
    throw new Error('PROVIDER_NATIVE_LIVE_SECRET_MISSING:GOOGLE_GENERATIVE_AI_API_KEY_OR_GEMINI_API_KEY_OR_GOOGLE_API_KEY');
  }
  return deepFreezeV1({
    openAiKey: secret(environment.OPENAI_API_KEY, 'OPENAI_API_KEY'),
    googleKey: secret(google[1], google[0]),
    googleCredentialSource: google[0],
  });
}

export function createProviderNativeLiveTransportV2R(input: {
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: FetchV2R;
  timeoutMs?: number;
  maxTransientAttempts?: number;
}): Readonly<{
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>) => Promise<ProviderNativeInvokeResponseV2R>;
  snapshot: () => Readonly<ProviderNativeLiveTransportReceiptV2R>;
}> {
  const { openAiKey, googleKey } = resolveProviderNativeCredentialsV2R(input.environment);
  return createLiveTransport({
    ...input,
    credentialFor: (provider) => provider === 'openai' ? openAiKey : googleKey,
  });
}

/**
 * Resolves one exact durable route with only that provider's credential. The
 * wrapper binds the serialized request and successful response model to the
 * route frozen in the durable checkpoint before the worker can consume it.
 */
export function createProviderNativeDurableLiveTransportOwnerV2R(input: {
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: FetchV2R;
  timeoutMs?: number;
}): Readonly<ProviderNativeDurableTransportOwnerV2R> {
  return {
    resolve: async ({ route, episodeId }) => {
      validateDurableRoute(route);
      if (!episodeId.trim()) throw new Error('PROVIDER_NATIVE_DURABLE_EPISODE_ID_INVALID');
      const credential = resolveRouteCredential(route.provider, input.environment);
      const transport = createLiveTransport({
        ...input,
        // Durable provider attempts are authorized and receipted outside the
        // HTTP client. An internal retry would be an unrecorded paid attempt.
        maxTransientAttempts: 1,
        credentialFor: (provider) => {
          if (provider !== route.provider) {
            throw new Error('PROVIDER_NATIVE_DURABLE_PROVIDER_SUBSTITUTION');
          }
          return credential;
        },
      });
      return async (request) => {
        validateDurableRequest(route, request);
        const response = await transport.invoke(request);
        validateDurableResponse(route, response);
        return response;
      };
    },
  };
}

function createLiveTransport(input: {
  fetchImpl?: FetchV2R;
  timeoutMs?: number;
  maxTransientAttempts?: number;
  credentialFor: (provider: SerializedProviderNativeTurnV2R['provider']) => string;
}): Readonly<{
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>) => Promise<ProviderNativeInvokeResponseV2R>;
  snapshot: () => Readonly<ProviderNativeLiveTransportReceiptV2R>;
}> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 240_000;
  const maxTransientAttempts = input.maxTransientAttempts ?? 3;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error('PROVIDER_NATIVE_LIVE_TIMEOUT_INVALID');
  }
  if (!Number.isSafeInteger(maxTransientAttempts)
    || maxTransientAttempts < 1 || maxTransientAttempts > 3) {
    throw new Error('PROVIDER_NATIVE_LIVE_TRANSIENT_ATTEMPTS_INVALID');
  }
  const calls: ProviderNativeLiveTransportReceiptV2R['calls'][number][] = [];
  const invoke = async (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ): Promise<ProviderNativeInvokeResponseV2R> => {
    validateEndpoint(request);
    const apiKey = input.credentialFor(request.provider);
    for (let attempt = 1; attempt <= maxTransientAttempts; attempt += 1) {
      try {
        const response = await fetchImpl(request.endpoint, {
          method: 'POST',
          headers: request.provider === 'openai'
            ? { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }
            : { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify(request.body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await responseBody(response);
        const responseRecord = record(body);
        calls.push({
          attempt,
          requestHash: request.requestHash,
          provider: request.provider,
          endpoint: request.endpoint,
          responseStatus: response.status,
          responseSha256: hashCanonicalJsonV1(body),
          returnedModelIdentity: text(responseRecord.model) ?? text(responseRecord.model_version),
          usage: clone(record(responseRecord.usage ?? responseRecord.usageMetadata)),
        });
        if (isTransientStatus(response.status) && attempt < maxTransientAttempts) {
          await wait(retryDelayMs(response, body, attempt));
          continue;
        }
        return { status: response.status, body };
      } catch (error) {
        const timeout = error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name);
        throw new ProviderNativeTransportErrorV2R(
          timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
          error instanceof Error ? error.message : 'Unknown live provider transport error',
        );
      }
    }
    throw new ProviderNativeTransportErrorV2R('PROVIDER_ERROR', 'Transient retry loop exhausted unexpectedly');
  };
  return {
    invoke,
    snapshot: () => {
      const material = {
        authority: 'RESEARCH_PROVIDER_TRANSPORT_NO_PROJECT_MUTATION' as const,
        calls: clone(calls), secretsPersisted: false as const,
      };
      return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
    },
  };
}

function validateDurableRoute(route: Readonly<ProviderNativeRouteV2R>): void {
  const expected = {
    OPENAI_LUNA: { provider: 'openai', model: 'gpt-5.6-luna' },
    OPENAI_TERRA: { provider: 'openai', model: 'gpt-5.6-terra' },
    GOOGLE_FLASH: { provider: 'google', model: 'gemini-3.7-flash' },
  } as const;
  const exact = expected[route.routeId as keyof typeof expected];
  if (!exact || route.provider !== exact.provider || route.model !== exact.model
    || route.claimedModelIdentity !== exact.model) {
    throw new Error('PROVIDER_NATIVE_DURABLE_ROUTE_IDENTITY_INVALID');
  }
}

function validateDurableRequest(
  route: Readonly<ProviderNativeRouteV2R>,
  request: Readonly<SerializedProviderNativeTurnV2R>,
): void {
  if (request.provider !== route.provider || request.body.model !== route.model) {
    throw new Error('PROVIDER_NATIVE_DURABLE_REQUEST_ROUTE_MISMATCH');
  }
  const expectedHash = hashCanonicalJsonV1({
    endpoint: request.endpoint,
    body: request.body,
  });
  if (request.requestHash !== expectedHash) {
    throw new Error('PROVIDER_NATIVE_DURABLE_REQUEST_HASH_MISMATCH');
  }
}

function validateDurableResponse(
  route: Readonly<ProviderNativeRouteV2R>,
  response: Readonly<ProviderNativeInvokeResponseV2R>,
): void {
  if (response.status < 200 || response.status >= 300) return;
  const returned = normalizeProviderNativeTurnV2R(route.provider, response.body).providerModel;
  if (returned !== route.claimedModelIdentity) {
    throw new Error('PROVIDER_NATIVE_DURABLE_RETURNED_MODEL_IDENTITY_MISMATCH');
  }
}

function resolveRouteCredential(
  provider: ProviderNativeRouteV2R['provider'],
  environment: Readonly<Record<string, string | undefined>>,
): string {
  if (provider === 'openai') return secret(environment.OPENAI_API_KEY, 'OPENAI_API_KEY');
  const candidates = [
    ['GOOGLE_GENERATIVE_AI_API_KEY', environment.GOOGLE_GENERATIVE_AI_API_KEY],
    ['GEMINI_API_KEY', environment.GEMINI_API_KEY],
    ['GOOGLE_API_KEY', environment.GOOGLE_API_KEY],
  ] as const;
  const selected = candidates.find(([, value]) => Boolean(value?.trim()));
  if (!selected) {
    throw new Error('PROVIDER_NATIVE_LIVE_SECRET_MISSING:GOOGLE_GENERATIVE_AI_API_KEY_OR_GEMINI_API_KEY_OR_GOOGLE_API_KEY');
  }
  return secret(selected[1], selected[0]);
}

function validateEndpoint(request: Readonly<SerializedProviderNativeTurnV2R>): void {
  const expected = request.provider === 'openai'
    ? 'https://api.openai.com/v1/responses'
    : 'https://generativelanguage.googleapis.com/v1beta/interactions';
  if (request.endpoint !== expected) throw new Error('PROVIDER_NATIVE_LIVE_ENDPOINT_INVALID');
  if ((request.provider === 'openai' && request.authMode !== 'BEARER')
    || (request.provider === 'google' && request.authMode !== 'X_GOOG_API_KEY')) {
    throw new Error('PROVIDER_NATIVE_LIVE_AUTH_MODE_INVALID');
  }
}

async function responseBody(response: Response): Promise<unknown> {
  const textBody = await response.text();
  if (!textBody) return {};
  try { return JSON.parse(textBody) as unknown; }
  catch { return { nonJsonBody: textBody.slice(0, 4_000) }; }
}
function isTransientStatus(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}
function retryDelayMs(response: Response, body: unknown, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return boundedDelay(seconds * 1_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return boundedDelay(at - Date.now());
  }
  const bodyMatch = JSON.stringify(body).match(/retry(?:\s+request)?\s+in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  if (bodyMatch) return boundedDelay(Number(bodyMatch[1]) * 1_000);
  return boundedDelay(1_000 * (2 ** (attempt - 1)));
}
function boundedDelay(value: number): number {
  return Math.max(0, Math.min(60_000, Math.ceil(value)));
}
async function wait(delayMs: number): Promise<void> {
  if (!delayMs) return;
  await new Promise<void>((resolve) => { setTimeout(resolve, delayMs); });
}
function secret(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`PROVIDER_NATIVE_LIVE_SECRET_MISSING:${label}`);
  return normalized;
}
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown): string | null { return typeof value === 'string' && value ? value : null; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
