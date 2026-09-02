import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV2,
  type MediaProxyMasterTranscodeDurableJobInputV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  assertMediaProxyMasterTranscodeOutputProbeV1,
  type MediaProxyMasterTranscodeOutputProbeV1,
} from './media-proxy-master-transcode-output-probe-v1';
import type { VerifiedMediaSourceLocalFileEvidenceV1 }
  from './verified-media-source-local-file-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_PREPARED_EVIDENCE_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_PREPARED_EVIDENCE_V2' as const;

const MAX_JSON_PAYLOAD_BYTES = 256 * 1_024;
const MAX_STDERR_BYTES = 64 * 1_024 * 1_024;
const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterTranscodePreparedProcessEvidenceV2 = Readonly<{
  startedAt: string;
  completedAt: string;
  exitCode: 0;
  stderrByteLength: number;
  stderrSha256: string;
}>;

export type MediaProxyMasterTranscodePreparedEvidenceV2 = Readonly<{
  version: typeof MEDIA_PROXY_MASTER_TRANSCODE_PREPARED_EVIDENCE_VERSION_V2;
  disposition: 'PREPUBLICATION_TRANSCODE_EVIDENCE_PERSISTABLE';
  commandSha256: string;
  runtimePolicyBindingSha256: string;
  process: MediaProxyMasterTranscodePreparedProcessEvidenceV2;
  masterLocalFileEvidence: VerifiedMediaSourceLocalFileEvidenceV1;
  outputProbe: MediaProxyMasterTranscodeOutputProbeV1;
  outputVideoStreamIndex: 0;
  outputAudioStreamIndexes: readonly number[];
  evidenceSha256: string;
}>;

export function createMediaProxyMasterTranscodePreparedEvidenceV2(
  input: Readonly<{
    jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
    process: MediaProxyMasterTranscodePreparedProcessEvidenceV2;
    masterLocalFileEvidence: VerifiedMediaSourceLocalFileEvidenceV1;
    outputProbe: MediaProxyMasterTranscodeOutputProbeV1;
    outputVideoStreamIndex: number;
    outputAudioStreamIndexes: readonly number[];
  }>,
): MediaProxyMasterTranscodePreparedEvidenceV2 {
  const jobInput = assertJobInput(input.jobInput);
  const process = normalizeProcess(input.process);
  const masterLocalFileEvidence = normalizeMasterLocalFileEvidence(
    input.masterLocalFileEvidence,
    jobInput,
  );
  let outputProbe: MediaProxyMasterTranscodeOutputProbeV1;
  try {
    outputProbe = assertMediaProxyMasterTranscodeOutputProbeV1(
      input.outputProbe,
    );
  } catch {
    fail('OUTPUT_PROBE_INVALID');
  }
  const outputVideoStreamIndex = exactInteger(
    input.outputVideoStreamIndex,
    0,
    'OUTPUT_VIDEO_STREAM',
  );
  const outputAudioStreamIndexes = normalizeOutputAudioStreamIndexes(
    input.outputAudioStreamIndexes,
    jobInput.command.masterAudioStreamIndexes.length,
  );
  const expectedAudioStreamIndexes = outputProbe.audio.map(
    ({ streamIndex }) => streamIndex,
  );
  if (outputProbe.commandSha256 !== jobInput.command.commandSha256
    || outputProbe.ffprobeVersion
      !== jobInput.runtimePolicy.executionProfile.ffprobeVersion
    || outputProbe.proxyByteLength > jobInput.command.policy.maxOutputBytes
    || outputProbe.video.streamIndex !== outputVideoStreamIndex
    || Date.parse(outputProbe.probedAt) < Date.parse(process.completedAt)
    || canonicalizeEditronJsonV1(expectedAudioStreamIndexes)
      !== canonicalizeEditronJsonV1(outputAudioStreamIndexes)) {
    fail('OUTPUT_PROBE_JOB_MISMATCH');
  }
  const material = {
    version: MEDIA_PROXY_MASTER_TRANSCODE_PREPARED_EVIDENCE_VERSION_V2,
    disposition: 'PREPUBLICATION_TRANSCODE_EVIDENCE_PERSISTABLE' as const,
    commandSha256: jobInput.command.commandSha256,
    runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
    process,
    masterLocalFileEvidence,
    outputProbe,
    outputVideoStreamIndex,
    outputAudioStreamIndexes,
  };
  assertPayloadSize(material);
  return deepFreezeEditronJsonV1({
    ...material,
    evidenceSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterTranscodePreparedEvidenceForJobV2(
  value: unknown,
  jobInputValue: unknown,
): MediaProxyMasterTranscodePreparedEvidenceV2 {
  const candidate = object(value, 'EVIDENCE_INVALID');
  exactKeys(candidate, [
    'commandSha256', 'disposition', 'evidenceSha256',
    'masterLocalFileEvidence', 'outputAudioStreamIndexes', 'outputProbe',
    'outputVideoStreamIndex', 'process', 'runtimePolicyBindingSha256',
    'version',
  ], 'EVIDENCE_FIELDS_INVALID');
  if (candidate.version
      !== MEDIA_PROXY_MASTER_TRANSCODE_PREPARED_EVIDENCE_VERSION_V2
    || candidate.disposition
      !== 'PREPUBLICATION_TRANSCODE_EVIDENCE_PERSISTABLE') {
    fail('EVIDENCE_IDENTITY_INVALID');
  }
  const jobInput = assertJobInput(jobInputValue);
  let rebound: MediaProxyMasterTranscodePreparedEvidenceV2;
  try {
    rebound = createMediaProxyMasterTranscodePreparedEvidenceV2({
      jobInput,
      process: candidate.process as never,
      masterLocalFileEvidence: candidate.masterLocalFileEvidence as never,
      outputProbe: candidate.outputProbe as never,
      outputVideoStreamIndex: candidate.outputVideoStreamIndex as number,
      outputAudioStreamIndexes: candidate.outputAudioStreamIndexes as number[],
    });
  } catch (error) {
    if (error instanceof MediaProxyMasterTranscodePreparedEvidenceErrorV2) {
      throw error;
    }
    fail('EVIDENCE_NESTED_INVALID');
  }
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(rebound)) {
    fail('EVIDENCE_BINDING_INVALID');
  }
  return rebound;
}

function normalizeProcess(
  value: unknown,
): MediaProxyMasterTranscodePreparedProcessEvidenceV2 {
  const candidate = object(value, 'PROCESS_INVALID');
  exactKeys(candidate, [
    'completedAt', 'exitCode', 'startedAt', 'stderrByteLength', 'stderrSha256',
  ], 'PROCESS_FIELDS_INVALID');
  const startedAt = instant(candidate.startedAt, 'PROCESS_STARTED_AT');
  const completedAt = instant(candidate.completedAt, 'PROCESS_COMPLETED_AT');
  if (Date.parse(completedAt) < Date.parse(startedAt)) {
    fail('PROCESS_TIME_ORDER_INVALID');
  }
  const exitCode = exactInteger(candidate.exitCode, 0, 'PROCESS_EXIT_CODE');
  return deepFreezeEditronJsonV1({
    startedAt,
    completedAt,
    exitCode,
    stderrByteLength: nonNegativeSafeInteger(
      candidate.stderrByteLength,
      MAX_STDERR_BYTES,
      'PROCESS_STDERR_BYTES',
    ),
    stderrSha256: sha256(candidate.stderrSha256, 'PROCESS_STDERR'),
  });
}

function normalizeMasterLocalFileEvidence(
  value: unknown,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
): VerifiedMediaSourceLocalFileEvidenceV1 {
  const candidate = object(value, 'MASTER_LOCAL_FILE_EVIDENCE_INVALID');
  exactKeys(candidate, [
    'byteLength', 'contentSha256', 'sourceVersionSha256',
    'storageVersionSha256',
  ], 'MASTER_LOCAL_FILE_EVIDENCE_FIELDS_INVALID');
  const evidence = deepFreezeEditronJsonV1({
    sourceVersionSha256: sha256(
      candidate.sourceVersionSha256,
      'MASTER_SOURCE_VERSION',
    ),
    storageVersionSha256: sha256(
      candidate.storageVersionSha256,
      'MASTER_STORAGE_VERSION',
    ),
    byteLength: positiveSafeInteger(
      candidate.byteLength,
      jobInput.command.policy.maxSourceBytes,
      'MASTER_BYTE_LENGTH',
    ),
    contentSha256: sha256(candidate.contentSha256, 'MASTER_CONTENT'),
  });
  const source = jobInput.command.masterSourceVersion;
  if (evidence.sourceVersionSha256 !== source.sourceVersionSha256
    || evidence.storageVersionSha256
      !== source.storageVersion.storageVersionSha256
    || evidence.byteLength !== source.byteLength
    || evidence.contentSha256 !== source.contentSha256) {
    fail('MASTER_LOCAL_FILE_EVIDENCE_JOB_MISMATCH');
  }
  return evidence;
}

function normalizeOutputAudioStreamIndexes(
  value: unknown,
  expectedCount: number,
): readonly number[] {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    fail('OUTPUT_AUDIO_STREAMS_INVALID');
  }
  const normalized = value.map((entry, index) => exactInteger(
    entry,
    index + 1,
    'OUTPUT_AUDIO_STREAM',
  ));
  return Object.freeze(normalized);
}

function assertJobInput(value: unknown): MediaProxyMasterTranscodeDurableJobInputV2 {
  try {
    return assertMediaProxyMasterTranscodeDurableJobInputV2(value);
  } catch {
    fail('JOB_INPUT_INVALID');
  }
}

function assertPayloadSize(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_PAYLOAD_BYTES) {
    fail('EVIDENCE_PAYLOAD_TOO_LARGE');
  }
}

function exactInteger<T extends number>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) fail(`${label}_INVALID`);
  return expected;
}

function positiveSafeInteger(
  value: unknown,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1
    || (value as number) > maximum) {
    fail(`${label}_INVALID`);
  }
  return value as number;
}

function nonNegativeSafeInteger(
  value: unknown,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0
    || (value as number) > maximum) {
    fail(`${label}_INVALID`);
  }
  return value as number;
}

function instant(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`${label}_SHA256_INVALID`);
  }
  return value;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) {
    fail(code);
  }
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodePreparedEvidenceErrorV2(code);
}

export class MediaProxyMasterTranscodePreparedEvidenceErrorV2 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_PREPARED_EVIDENCE_V2_${code}`);
    this.name = 'MediaProxyMasterTranscodePreparedEvidenceErrorV2';
  }
}
