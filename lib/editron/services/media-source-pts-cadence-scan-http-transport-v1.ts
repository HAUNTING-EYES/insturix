import {
  isModalProxyEndpointV1,
  modalProxyAuthHeadersV1,
  readModalProxyAuthV1,
  type ModalProxyAuthEnvironmentV1,
} from './modal-proxy-auth-v1';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const FUNCTION_CALL_ID = /^fc-[A-Za-z0-9_-]{8,128}$/;
const SUBMISSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

export type MediaSourcePtsCadenceScanHttpDependenciesV1 = Readonly<{
  environment?: ModalProxyAuthEnvironmentV1;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>;

export type MediaSourcePtsCadenceScanHttpConfigurationV1 = Readonly<{
  submitEndpoint: string;
  pollEndpoint: string;
  headers: Readonly<Record<string, string>>;
}>;

export function isMediaSourcePtsCadenceScanFunctionCallIdV1(
  value: unknown,
): value is string {
  return typeof value === 'string' && FUNCTION_CALL_ID.test(value);
}

export function assertMediaSourcePtsCadenceScanSubmissionIdV1(
  value: unknown,
  diagnostic = 'SCAN_SUBMISSION_ID_INVALID',
): string {
  if (typeof value !== 'string' || !SUBMISSION_ID.test(value.trim())) {
    throw new Error(diagnostic);
  }
  return value.trim();
}

export function resolveMediaSourcePtsCadenceScanHttpConfigurationV1(input: Readonly<{
  environment: ModalProxyAuthEnvironmentV1;
  submitEndpointEnvironmentName: string;
  pollEndpointEnvironmentName: string;
}>): MediaSourcePtsCadenceScanHttpConfigurationV1 | null {
  const submitEndpoint = input.environment[input.submitEndpointEnvironmentName]?.trim();
  const pollEndpoint = input.environment[input.pollEndpointEnvironmentName]?.trim();
  const auth = readModalProxyAuthV1(input.environment);
  return submitEndpoint && pollEndpoint && auth
    && isModalProxyEndpointV1(submitEndpoint) && isModalProxyEndpointV1(pollEndpoint)
    ? { submitEndpoint, pollEndpoint, headers: modalProxyAuthHeadersV1(auth) }
    : null;
}

export async function postMediaSourcePtsCadenceScanJsonV1(input: Readonly<{
  endpoint: string;
  body: unknown;
  authHeaders: Readonly<Record<string, string>>;
  dependencies: MediaSourcePtsCadenceScanHttpDependenciesV1;
}>): Promise<Response | null> {
  try {
    return await (input.dependencies.fetchImpl ?? fetch)(input.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...input.authHeaders },
      body: JSON.stringify(input.body),
      signal: AbortSignal.timeout(input.dependencies.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

export async function readMediaSourcePtsCadenceScanJsonBoundedV1(
  response: Response,
  maximumBytes: number,
): Promise<unknown | null | undefined> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maximumBytes) return undefined;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
