import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  isModalProxyEndpointV1,
  modalProxyAuthHeadersV1,
  readModalProxyAuthV1,
  type ModalProxyAuthEnvironmentV1,
} from './modal-proxy-auth-v1';
import { MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1 } from './media-source-pts-cadence-map-lifecycle-v1';
import type { MediaSourcePtsCadenceMapperV1 } from './media-source-pts-cadence-shard-v1';
import type { MediaRationalV1 } from './media-source-probe-v1';
import {
  assertMediaSourcePtsCadenceScanResultV1,
  type MediaSourcePtsCadenceScanResultV1,
} from './media-source-pts-cadence-scan-result-v1';
import {
  assertScanExactKeysV1,
  assertScanRecordV1,
  assertScanReducedRationalV1,
  assertScanResourcePolicyV1,
  assertScanSafeIntegerV1,
  assertScanSha256V1,
  assertScanTextV1,
  freezeMediaSourcePtsCadenceScanV1,
  type MediaSourcePtsCadenceScanResourcePolicyV1,
} from './media-source-pts-cadence-scan-staging-v1';

export const MEDIA_SOURCE_PTS_CADENCE_SCAN_REQUEST_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_SCAN_REQUEST_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_SCAN_SUBMISSION_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_SCAN_SUBMISSION_V1' as const;
export const EDITRON_MEDIA_SOURCE_PTS_SCAN_SUBMIT_ENDPOINT_ENV_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_SCAN_SUBMIT_ENDPOINT' as const;
export const EDITRON_MEDIA_SOURCE_PTS_SCAN_POLL_ENDPOINT_ENV_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_SCAN_POLL_ENDPOINT' as const;

const MAX_SUBMIT_RESPONSE_BYTES = 64 * 1024;
const MAX_POLL_RESPONSE_BYTES = 16 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const FUNCTION_CALL_ID = /^fc-[A-Za-z0-9_-]{8,128}$/;
const SUBMISSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
export type MediaSourcePtsCadenceScanMapBindingV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
  videoStreamIndex: number;
  sourceTimebase: MediaRationalV1;
  mapper: MediaSourcePtsCadenceMapperV1;
}>;
export type MediaSourcePtsCadenceScanRequestV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_SCAN_REQUEST_KIND_V1;
  mapBinding: MediaSourcePtsCadenceScanMapBindingV1;
  mapBindingSha256: string;
  resourcePolicy: MediaSourcePtsCadenceScanResourcePolicyV1;
  source_url: string;
}>;
export type MediaSourcePtsCadenceScanSubmissionV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_SCAN_SUBMISSION_KIND_V1;
  submissionId: string;
  request: MediaSourcePtsCadenceScanRequestV1;
}>;
export type MediaSourcePtsCadenceScanJobV1 = Readonly<{
  submissionId: string;
  functionCallId: string;
  mapBindingSha256: string;
}>;
export type MediaSourcePtsCadenceScanSubmitResultV1 =
  | Readonly<{ disposition: 'ACCEPTED'; job: MediaSourcePtsCadenceScanJobV1 }>
  | Readonly<{ disposition: 'UNVERIFIABLE'; diagnostic: ScanTransportDiagnosticV1 }>;

export type MediaSourcePtsCadenceScanPollResultV1 =
  | Readonly<{ disposition: 'PENDING'; job: MediaSourcePtsCadenceScanJobV1 }>
  | Readonly<{ disposition: 'TERMINAL'; result: MediaSourcePtsCadenceScanResultV1 }>
  | Readonly<{ disposition: 'UNVERIFIABLE'; diagnostic: ScanTransportDiagnosticV1 }>;
export type ScanTransportDiagnosticV1 =
  | 'SCAN_TRANSPORT_NOT_CONFIGURED'
  | 'SCAN_TRANSPORT_REQUEST_FAILED'
  | 'SCAN_TRANSPORT_HTTP_FAILURE'
  | 'SCAN_TRANSPORT_RESPONSE_TOO_LARGE'
  | 'SCAN_TRANSPORT_RESPONSE_INVALID';
type TransportDependenciesV1 = Readonly<{
  environment?: ModalProxyAuthEnvironmentV1;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>;

export function createMediaSourcePtsCadenceScanRequestV1(input: {
  mapBinding: MediaSourcePtsCadenceScanMapBindingV1;
  resourcePolicy: MediaSourcePtsCadenceScanResourcePolicyV1;
  sourceUrl: string;
}): MediaSourcePtsCadenceScanRequestV1 {
  const mapBinding = assertMapBinding(input.mapBinding);
  const sourceUrl = assertHttpsSourceUrl(input.sourceUrl);
  const resourcePolicy = assertBoundPolicy(input.resourcePolicy, mapBinding);
  return freezeMediaSourcePtsCadenceScanV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_REQUEST_KIND_V1,
    mapBinding,
    mapBindingSha256: hashEditronCanonicalJsonV1(mapBinding),
    resourcePolicy,
    source_url: sourceUrl,
  });
}

export function createMediaSourcePtsCadenceScanSubmissionV1(input: Readonly<{
  submissionId: string;
  request: MediaSourcePtsCadenceScanRequestV1;
}>): MediaSourcePtsCadenceScanSubmissionV1 {
  return freezeMediaSourcePtsCadenceScanV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_SUBMISSION_KIND_V1,
    submissionId: assertSubmissionId(input.submissionId),
    request: assertMediaSourcePtsCadenceScanRequestV1(input.request),
  });
}

export function isMediaSourcePtsCadenceScanTransportConfiguredV1(
  environment: ModalProxyAuthEnvironmentV1 = process.env,
): boolean {
  return Boolean(configuration(environment));
}

export async function submitMediaSourcePtsCadenceScanV1(
  submission: MediaSourcePtsCadenceScanSubmissionV1,
  dependencies: TransportDependenciesV1 = {},
): Promise<MediaSourcePtsCadenceScanSubmitResultV1> {
  const environment = dependencies.environment ?? process.env;
  const config = configuration(environment);
  if (!config) return unverifiable('SCAN_TRANSPORT_NOT_CONFIGURED');
  const validated = assertSubmission(submission);
  const response = await post(config.submitEndpoint, validated, config.headers, dependencies);
  if (!response) return unverifiable('SCAN_TRANSPORT_REQUEST_FAILED');
  if (!response.ok) return unverifiable('SCAN_TRANSPORT_HTTP_FAILURE');
  const payload = await readJsonBounded(response, MAX_SUBMIT_RESPONSE_BYTES);
  if (payload === undefined) return unverifiable('SCAN_TRANSPORT_RESPONSE_TOO_LARGE');
  if (payload === null) return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
  try {
    const record = assertScanRecordV1(payload, 'SCAN_TRANSPORT_RESPONSE_INVALID');
    assertScanExactKeysV1(record, ['functionCallId', 'mapBindingSha256', 'ok', 'submissionId'], 'SCAN_TRANSPORT_RESPONSE_INVALID');
    if (record.ok !== true
      || record.submissionId !== validated.submissionId
      || assertScanSha256V1(record.mapBindingSha256, 'SCAN_TRANSPORT_RESPONSE_INVALID') !== validated.request.mapBindingSha256
      || typeof record.functionCallId !== 'string'
      || !FUNCTION_CALL_ID.test(record.functionCallId)) {
      return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
    }
    return freezeMediaSourcePtsCadenceScanV1({
      disposition: 'ACCEPTED',
      job: {
        submissionId: validated.submissionId,
        functionCallId: record.functionCallId,
        mapBindingSha256: validated.request.mapBindingSha256,
      },
    });
  } catch {
    return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
  }
}

export async function pollMediaSourcePtsCadenceScanV1(
  job: MediaSourcePtsCadenceScanJobV1,
  dependencies: TransportDependenciesV1 = {},
): Promise<MediaSourcePtsCadenceScanPollResultV1> {
  const environment = dependencies.environment ?? process.env;
  const config = configuration(environment);
  if (!config) return unverifiable('SCAN_TRANSPORT_NOT_CONFIGURED');
  const validatedJob = assertMediaSourcePtsCadenceScanJobV1(job);
  const response = await post(config.pollEndpoint, validatedJob, config.headers, dependencies);
  if (!response) return unverifiable('SCAN_TRANSPORT_REQUEST_FAILED');
  if (response.status !== 200 && response.status !== 202) {
    return unverifiable('SCAN_TRANSPORT_HTTP_FAILURE');
  }
  const payload = await readJsonBounded(response, MAX_POLL_RESPONSE_BYTES);
  if (payload === undefined) return unverifiable('SCAN_TRANSPORT_RESPONSE_TOO_LARGE');
  if (payload === null) return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
  try {
    const record = assertScanRecordV1(payload, 'SCAN_TRANSPORT_RESPONSE_INVALID');
    if (response.status === 202) {
      assertScanExactKeysV1(record, ['mapBindingSha256', 'ok', 'status', 'submissionId'], 'SCAN_TRANSPORT_RESPONSE_INVALID');
      if (record.ok !== true || record.status !== 'PENDING'
        || record.submissionId !== validatedJob.submissionId
        || record.mapBindingSha256 !== validatedJob.mapBindingSha256) {
        return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
      }
      return freezeMediaSourcePtsCadenceScanV1({ disposition: 'PENDING', job: validatedJob });
    }
    assertScanExactKeysV1(record, ['mapBindingSha256', 'ok', 'result', 'status', 'submissionId'], 'SCAN_TRANSPORT_RESPONSE_INVALID');
    if (record.ok !== true || record.status !== 'TERMINAL'
      || record.submissionId !== validatedJob.submissionId
      || record.mapBindingSha256 !== validatedJob.mapBindingSha256) {
      return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
    }
    const result = assertMediaSourcePtsCadenceScanResultV1(record.result);
    return result.mapBindingSha256 === validatedJob.mapBindingSha256
      ? freezeMediaSourcePtsCadenceScanV1({ disposition: 'TERMINAL', result })
      : unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
  } catch {
    return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
  }
}

export function assertMediaSourcePtsCadenceScanRequestV1(value: unknown): MediaSourcePtsCadenceScanRequestV1 {
  const record = assertScanRecordV1(value, 'SCAN_REQUEST_INVALID');
  assertScanExactKeysV1(record, ['kind', 'mapBinding', 'mapBindingSha256', 'resourcePolicy', 'schemaVersion', 'source_url'], 'SCAN_REQUEST_INVALID');
  if (record.schemaVersion !== 1 || record.kind !== MEDIA_SOURCE_PTS_CADENCE_SCAN_REQUEST_KIND_V1) {
    throw new Error('SCAN_REQUEST_INVALID');
  }
  const mapBinding = assertMapBinding(record.mapBinding);
  const mapBindingSha256 = assertScanSha256V1(record.mapBindingSha256, 'SCAN_REQUEST_INVALID');
  if (hashEditronCanonicalJsonV1(mapBinding) !== mapBindingSha256) throw new Error('SCAN_REQUEST_INVALID');
  const resourcePolicy = assertBoundPolicy(record.resourcePolicy, mapBinding);
  return freezeMediaSourcePtsCadenceScanV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_REQUEST_KIND_V1,
    mapBinding,
    mapBindingSha256,
    resourcePolicy,
    source_url: assertHttpsSourceUrl(record.source_url),
  });
}

/** Validates the URL-free immutable map identity used by durable orchestration. */
export function assertMediaSourcePtsCadenceScanMapBindingV1(
  value: unknown,
): MediaSourcePtsCadenceScanMapBindingV1 {
  return assertMapBinding(value);
}

function assertMapBinding(value: unknown): MediaSourcePtsCadenceScanMapBindingV1 {
  const record = assertScanRecordV1(value, 'SCAN_MAP_BINDING_INVALID');
  assertScanExactKeysV1(record, ['kind', 'mapper', 'schemaVersion', 'sourceBindingSha256', 'sourceTimebase', 'sourceVersionSha256', 'storageVersionSha256', 'technicalObservationSha256', 'videoStreamIndex'], 'SCAN_MAP_BINDING_INVALID');
  const mapper = assertScanRecordV1(record.mapper, 'SCAN_MAP_BINDING_INVALID');
  assertScanExactKeysV1(mapper, ['commandPolicyVersion', 'ffprobeVersion', 'mapperVersion', 'timestampOrigin'], 'SCAN_MAP_BINDING_INVALID');
  if (record.schemaVersion !== 1 || record.kind !== MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1
    || mapper.timestampOrigin !== 'FFPROBE_BEST_EFFORT_TIMESTAMP') throw new Error('SCAN_MAP_BINDING_INVALID');
  return freezeMediaSourcePtsCadenceScanV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1,
    sourceVersionSha256: assertScanSha256V1(record.sourceVersionSha256, 'SCAN_MAP_BINDING_INVALID'),
    storageVersionSha256: assertScanSha256V1(record.storageVersionSha256, 'SCAN_MAP_BINDING_INVALID'),
    sourceBindingSha256: assertScanSha256V1(record.sourceBindingSha256, 'SCAN_MAP_BINDING_INVALID'),
    technicalObservationSha256: assertScanSha256V1(record.technicalObservationSha256, 'SCAN_MAP_BINDING_INVALID'),
    videoStreamIndex: assertScanSafeIntegerV1(record.videoStreamIndex, false, 'SCAN_MAP_BINDING_INVALID'),
    sourceTimebase: assertScanReducedRationalV1(record.sourceTimebase),
    mapper: {
      mapperVersion: assertScanTextV1(mapper.mapperVersion, 'SCAN_MAP_BINDING_INVALID'),
      ffprobeVersion: assertScanTextV1(mapper.ffprobeVersion, 'SCAN_MAP_BINDING_INVALID'),
      commandPolicyVersion: assertScanTextV1(mapper.commandPolicyVersion, 'SCAN_MAP_BINDING_INVALID'),
      timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    },
  });
}

export function assertMediaSourcePtsCadenceScanJobV1(
  value: unknown,
): MediaSourcePtsCadenceScanJobV1 {
  const record = assertScanRecordV1(value, 'SCAN_JOB_INVALID');
  assertScanExactKeysV1(record, ['functionCallId', 'mapBindingSha256', 'submissionId'], 'SCAN_JOB_INVALID');
  if (typeof record.functionCallId !== 'string' || !FUNCTION_CALL_ID.test(record.functionCallId)) {
    throw new Error('SCAN_JOB_INVALID');
  }
  return freezeMediaSourcePtsCadenceScanV1({
    submissionId: assertSubmissionId(record.submissionId),
    functionCallId: record.functionCallId,
    mapBindingSha256: assertScanSha256V1(record.mapBindingSha256, 'SCAN_JOB_INVALID'),
  });
}

function assertSubmission(value: unknown): MediaSourcePtsCadenceScanSubmissionV1 {
  const record = assertScanRecordV1(value, 'SCAN_SUBMISSION_INVALID');
  assertScanExactKeysV1(
    record,
    ['kind', 'request', 'schemaVersion', 'submissionId'],
    'SCAN_SUBMISSION_INVALID',
  );
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_PTS_CADENCE_SCAN_SUBMISSION_KIND_V1) {
    throw new Error('SCAN_SUBMISSION_INVALID');
  }
  return createMediaSourcePtsCadenceScanSubmissionV1({
    submissionId: assertSubmissionId(record.submissionId),
    request: assertMediaSourcePtsCadenceScanRequestV1(record.request),
  });
}

function assertSubmissionId(value: unknown): string {
  if (typeof value !== 'string' || !SUBMISSION_ID.test(value.trim())) {
    throw new Error('SCAN_SUBMISSION_ID_INVALID');
  }
  return value.trim();
}

function assertBoundPolicy(value: unknown, binding: MediaSourcePtsCadenceScanMapBindingV1) {
  const policy = assertScanResourcePolicyV1(value);
  if (policy.policyVersion !== binding.mapper.commandPolicyVersion) {
    throw new Error('SCAN_POLICY_BINDING_MISMATCH');
  }
  return policy;
}

function configuration(environment: ModalProxyAuthEnvironmentV1) {
  const submitEndpoint = environment[EDITRON_MEDIA_SOURCE_PTS_SCAN_SUBMIT_ENDPOINT_ENV_V1]?.trim();
  const pollEndpoint = environment[EDITRON_MEDIA_SOURCE_PTS_SCAN_POLL_ENDPOINT_ENV_V1]?.trim();
  const auth = readModalProxyAuthV1(environment);
  return submitEndpoint && pollEndpoint && auth
    && isModalProxyEndpointV1(submitEndpoint) && isModalProxyEndpointV1(pollEndpoint)
    ? { submitEndpoint, pollEndpoint, headers: modalProxyAuthHeadersV1(auth) }
    : null;
}

async function post(endpoint: string, body: unknown, authHeaders: Readonly<Record<string, string>>, dependencies: TransportDependenciesV1) {
  try {
    return await (dependencies.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(dependencies.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

async function readJsonBounded(response: Response, maximum: number): Promise<unknown | null | undefined> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maximum) return undefined;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return null; }
}

function assertHttpsSourceUrl(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 16_384) throw new Error('SCAN_SOURCE_URL_INVALID');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('SCAN_SOURCE_URL_INVALID'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
    throw new Error('SCAN_SOURCE_URL_INVALID');
  }
  return value;
}

function unverifiable(diagnostic: ScanTransportDiagnosticV1) {
  return freezeMediaSourcePtsCadenceScanV1({ disposition: 'UNVERIFIABLE' as const, diagnostic });
}
