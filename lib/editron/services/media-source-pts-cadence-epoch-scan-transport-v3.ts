import {
  assertMediaSourcePtsCadenceScanSubmissionIdV1,
  isMediaSourcePtsCadenceScanFunctionCallIdV1,
  postMediaSourcePtsCadenceScanJsonV1,
  readMediaSourcePtsCadenceScanJsonBoundedV1,
  resolveMediaSourcePtsCadenceScanHttpConfigurationV1,
  type MediaSourcePtsCadenceScanHttpDependenciesV1,
} from './media-source-pts-cadence-scan-http-transport-v1';
import {
  assertMediaSourcePtsCadenceEpochScanResultV3,
  type MediaSourcePtsCadenceScanResultV1,
} from './media-source-pts-cadence-scan-result-v1';
import {
  assertScanExactKeysV1,
  assertScanRecordV1,
  assertScanSha256V1,
  freezeMediaSourcePtsCadenceScanV1,
} from './media-source-pts-cadence-scan-staging-v1';
import {
  assertMediaSourcePtsCadenceScanRequestV1,
  type MediaSourcePtsCadenceScanRequestV1,
  type ScanTransportDiagnosticV1,
} from './media-source-pts-cadence-scan-transport-v1';
import type { ModalProxyAuthEnvironmentV1 } from './modal-proxy-auth-v1';

export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3 =
  'epoch-ffprobe-v3' as const;
export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3 =
  'epoch-ffprobe-v3' as const;
export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_SCAN_SUBMISSION_KIND_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_SUBMISSION_V3' as const;
export const EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_SUBMIT_ENDPOINT_ENV_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_SUBMIT_ENDPOINT' as const;
export const EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_POLL_ENDPOINT_ENV_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_POLL_ENDPOINT' as const;

const MAX_SUBMIT_RESPONSE_BYTES = 64 * 1024;
const MAX_POLL_RESPONSE_BYTES = 16 * 1024 * 1024;

export type MediaSourcePtsCadenceEpochScanSubmissionV3 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_SCAN_SUBMISSION_KIND_V3;
  submissionId: string;
  request: MediaSourcePtsCadenceScanRequestV1;
}>;

export type MediaSourcePtsCadenceEpochScanJobV3 = Readonly<{
  submissionId: string;
  functionCallId: string;
  mapBindingSha256: string;
  mapperVersion: typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3;
  commandPolicyVersion: typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3;
}>;

export type MediaSourcePtsCadenceEpochScanSubmitResultV3 =
  | Readonly<{ disposition: 'ACCEPTED'; job: MediaSourcePtsCadenceEpochScanJobV3 }>
  | Readonly<{ disposition: 'UNVERIFIABLE'; diagnostic: ScanTransportDiagnosticV1 }>;

export type MediaSourcePtsCadenceEpochScanPollResultV3 =
  | Readonly<{ disposition: 'PENDING'; job: MediaSourcePtsCadenceEpochScanJobV3 }>
  | Readonly<{ disposition: 'TERMINAL'; result: MediaSourcePtsCadenceScanResultV1 }>
  | Readonly<{ disposition: 'UNVERIFIABLE'; diagnostic: ScanTransportDiagnosticV1 }>;

export function createMediaSourcePtsCadenceEpochScanSubmissionV3(input: Readonly<{
  submissionId: string;
  request: MediaSourcePtsCadenceScanRequestV1;
}>): MediaSourcePtsCadenceEpochScanSubmissionV3 {
  return freezeMediaSourcePtsCadenceScanV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_SCAN_SUBMISSION_KIND_V3,
    submissionId: assertMediaSourcePtsCadenceScanSubmissionIdV1(input.submissionId),
    request: assertMediaSourcePtsCadenceEpochScanRequestV3(input.request),
  });
}

export function isMediaSourcePtsCadenceEpochScanTransportConfiguredV3(
  environment: ModalProxyAuthEnvironmentV1 = process.env,
): boolean {
  return Boolean(configuration(environment));
}

export async function submitMediaSourcePtsCadenceEpochScanV3(
  submission: MediaSourcePtsCadenceEpochScanSubmissionV3,
  dependencies: MediaSourcePtsCadenceScanHttpDependenciesV1 = {},
): Promise<MediaSourcePtsCadenceEpochScanSubmitResultV3> {
  const config = configuration(dependencies.environment ?? process.env);
  if (!config) return unverifiable('SCAN_TRANSPORT_NOT_CONFIGURED');
  const validated = assertSubmission(submission);
  const response = await postMediaSourcePtsCadenceScanJsonV1({
    endpoint: config.submitEndpoint,
    body: validated,
    authHeaders: config.headers,
    dependencies,
  });
  if (!response) return unverifiable('SCAN_TRANSPORT_REQUEST_FAILED');
  if (!response.ok) return unverifiable('SCAN_TRANSPORT_HTTP_FAILURE');
  const payload = await readMediaSourcePtsCadenceScanJsonBoundedV1(
    response,
    MAX_SUBMIT_RESPONSE_BYTES,
  );
  if (payload === undefined) return unverifiable('SCAN_TRANSPORT_RESPONSE_TOO_LARGE');
  if (payload === null) return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
  try {
    const record = assertScanRecordV1(payload, 'SCAN_TRANSPORT_RESPONSE_INVALID');
    assertScanExactKeysV1(record, [
      'commandPolicyVersion', 'functionCallId', 'mapBindingSha256',
      'mapperVersion', 'ok', 'submissionId',
    ], 'SCAN_TRANSPORT_RESPONSE_INVALID');
    if (record.ok !== true
      || record.submissionId !== validated.submissionId
      || record.mapperVersion !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3
      || record.commandPolicyVersion
        !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3
      || assertScanSha256V1(record.mapBindingSha256, 'SCAN_TRANSPORT_RESPONSE_INVALID')
        !== validated.request.mapBindingSha256
      || !isMediaSourcePtsCadenceScanFunctionCallIdV1(record.functionCallId)) {
      return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
    }
    return freezeMediaSourcePtsCadenceScanV1({
      disposition: 'ACCEPTED',
      job: {
        submissionId: validated.submissionId,
        functionCallId: record.functionCallId,
        mapBindingSha256: validated.request.mapBindingSha256,
        mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
        commandPolicyVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
      },
    });
  } catch {
    return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
  }
}

export async function pollMediaSourcePtsCadenceEpochScanV3(
  job: MediaSourcePtsCadenceEpochScanJobV3,
  dependencies: MediaSourcePtsCadenceScanHttpDependenciesV1 = {},
): Promise<MediaSourcePtsCadenceEpochScanPollResultV3> {
  const config = configuration(dependencies.environment ?? process.env);
  if (!config) return unverifiable('SCAN_TRANSPORT_NOT_CONFIGURED');
  const validatedJob = assertMediaSourcePtsCadenceEpochScanJobV3(job);
  const response = await postMediaSourcePtsCadenceScanJsonV1({
    endpoint: config.pollEndpoint,
    body: validatedJob,
    authHeaders: config.headers,
    dependencies,
  });
  if (!response) return unverifiable('SCAN_TRANSPORT_REQUEST_FAILED');
  if (response.status !== 200 && response.status !== 202) {
    return unverifiable('SCAN_TRANSPORT_HTTP_FAILURE');
  }
  const payload = await readMediaSourcePtsCadenceScanJsonBoundedV1(
    response,
    MAX_POLL_RESPONSE_BYTES,
  );
  if (payload === undefined) return unverifiable('SCAN_TRANSPORT_RESPONSE_TOO_LARGE');
  if (payload === null) return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
  try {
    const record = assertScanRecordV1(payload, 'SCAN_TRANSPORT_RESPONSE_INVALID');
    const identityValid = record.mapperVersion
      === MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3
      && record.commandPolicyVersion
        === MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3;
    if (response.status === 202) {
      assertScanExactKeysV1(record, [
        'commandPolicyVersion', 'mapBindingSha256', 'mapperVersion',
        'ok', 'status', 'submissionId',
      ], 'SCAN_TRANSPORT_RESPONSE_INVALID');
      if (!identityValid || record.ok !== true || record.status !== 'PENDING'
        || record.submissionId !== validatedJob.submissionId
        || record.mapBindingSha256 !== validatedJob.mapBindingSha256) {
        return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
      }
      return freezeMediaSourcePtsCadenceScanV1({ disposition: 'PENDING', job: validatedJob });
    }
    assertScanExactKeysV1(record, [
      'commandPolicyVersion', 'mapBindingSha256', 'mapperVersion',
      'ok', 'result', 'status', 'submissionId',
    ], 'SCAN_TRANSPORT_RESPONSE_INVALID');
    if (!identityValid || record.ok !== true || record.status !== 'TERMINAL'
      || record.submissionId !== validatedJob.submissionId
      || record.mapBindingSha256 !== validatedJob.mapBindingSha256) {
      return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
    }
    const result = assertMediaSourcePtsCadenceEpochScanResultV3(record.result);
    return result.mapBindingSha256 === validatedJob.mapBindingSha256
      ? freezeMediaSourcePtsCadenceScanV1({ disposition: 'TERMINAL', result })
      : unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
  } catch {
    return unverifiable('SCAN_TRANSPORT_RESPONSE_INVALID');
  }
}

export function assertMediaSourcePtsCadenceEpochScanRequestV3(
  value: unknown,
): MediaSourcePtsCadenceScanRequestV1 {
  const request = assertMediaSourcePtsCadenceScanRequestV1(value);
  if (request.mapBinding.mapper.mapperVersion
      !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3
    || request.mapBinding.mapper.commandPolicyVersion
      !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3) {
    throw new Error('EPOCH_SCAN_REQUEST_MAPPER_IDENTITY_INVALID');
  }
  return request;
}

export function assertMediaSourcePtsCadenceEpochScanJobV3(
  value: unknown,
): MediaSourcePtsCadenceEpochScanJobV3 {
  const record = assertScanRecordV1(value, 'EPOCH_SCAN_JOB_INVALID');
  assertScanExactKeysV1(record, [
    'commandPolicyVersion', 'functionCallId', 'mapBindingSha256',
    'mapperVersion', 'submissionId',
  ], 'EPOCH_SCAN_JOB_INVALID');
  if (record.mapperVersion !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3
    || record.commandPolicyVersion
      !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3
    || !isMediaSourcePtsCadenceScanFunctionCallIdV1(record.functionCallId)) {
    throw new Error('EPOCH_SCAN_JOB_INVALID');
  }
  return freezeMediaSourcePtsCadenceScanV1({
    submissionId: assertMediaSourcePtsCadenceScanSubmissionIdV1(record.submissionId),
    functionCallId: record.functionCallId,
    mapBindingSha256: assertScanSha256V1(record.mapBindingSha256, 'EPOCH_SCAN_JOB_INVALID'),
    mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
    commandPolicyVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
  });
}

function assertSubmission(value: unknown): MediaSourcePtsCadenceEpochScanSubmissionV3 {
  const record = assertScanRecordV1(value, 'EPOCH_SCAN_SUBMISSION_INVALID');
  assertScanExactKeysV1(
    record,
    ['kind', 'request', 'schemaVersion', 'submissionId'],
    'EPOCH_SCAN_SUBMISSION_INVALID',
  );
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_SCAN_SUBMISSION_KIND_V3) {
    throw new Error('EPOCH_SCAN_SUBMISSION_INVALID');
  }
  return createMediaSourcePtsCadenceEpochScanSubmissionV3({
    submissionId: assertMediaSourcePtsCadenceScanSubmissionIdV1(record.submissionId),
    request: assertMediaSourcePtsCadenceEpochScanRequestV3(record.request),
  });
}

function configuration(environment: ModalProxyAuthEnvironmentV1) {
  return resolveMediaSourcePtsCadenceScanHttpConfigurationV1({
    environment,
    submitEndpointEnvironmentName: EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_SUBMIT_ENDPOINT_ENV_V3,
    pollEndpointEnvironmentName: EDITRON_MEDIA_SOURCE_PTS_EPOCH_SCAN_POLL_ENDPOINT_ENV_V3,
  });
}

function unverifiable(diagnostic: ScanTransportDiagnosticV1) {
  return freezeMediaSourcePtsCadenceScanV1({ disposition: 'UNVERIFIABLE' as const, diagnostic });
}
