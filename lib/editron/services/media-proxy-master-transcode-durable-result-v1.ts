import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV1,
  buildMediaProxyMasterTranscodeDurableJobContractV1,
  type MediaProxyMasterTranscodeDurableJobInputV1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  assertMediaProxyMasterTrustedTranscodeReceiptV1,
  type MediaProxyMasterTrustedTranscodeReceiptV1,
} from './media-proxy-master-trusted-transcode-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_V1_1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_V1_1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_TERMINAL_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_TERMINAL_V1_1' as const;

const MAX_JSON_PAYLOAD_BYTES = 256 * 1_024;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterTranscodeDurableResultV1 = Readonly<{
  version: typeof MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_VERSION_V1;
  disposition: 'TRUSTED_TRANSCODE_PERSISTED';
  jobId: string;
  operationId: string;
  jobInputBindingSha256: string;
  commandSha256: string;
  runtimePolicyBindingSha256: string;
  publicationPolicySha256: string;
  budgetReservationId: string;
  budgetReservationBindingSha256: string;
  budgetAuthorizationReceiptSha256: string;
  trustedTranscodeReceipt: MediaProxyMasterTrustedTranscodeReceiptV1;
  resultSha256: string;
}>;

export class MediaProxyMasterTranscodeDurableResultErrorV1 extends Error {}

export function createMediaProxyMasterTranscodeDurableResultV1(input: Readonly<{
  jobId: string;
  operationId: string;
  jobInputBindingSha256: string;
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1;
  budgetAuthorizationReceiptSha256: string;
  trustedTranscodeReceipt: MediaProxyMasterTrustedTranscodeReceiptV1;
}>): MediaProxyMasterTranscodeDurableResultV1 {
  const jobInput = assertMediaProxyMasterTranscodeDurableJobInputV1(input.jobInput);
  const jobContract = contractForJobInput(jobInput);
  const trustedTranscodeReceipt =
    assertMediaProxyMasterTrustedTranscodeReceiptV1(input.trustedTranscodeReceipt);
  assertReceiptForJob(trustedTranscodeReceipt, jobInput);
  if (input.operationId !== jobContract.operationIdentity
    || input.jobInputBindingSha256 !== jobContract.bindingSha256) {
    fail('MEDIA_PROXY_MASTER_DURABLE_RESULT_JOB_BINDING_MISMATCH');
  }
  const material = {
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_VERSION_V1,
    disposition: 'TRUSTED_TRANSCODE_PERSISTED' as const,
    jobId: identity(input.jobId, 'JOB_ID'),
    operationId: identity(input.operationId, 'OPERATION_ID'),
    jobInputBindingSha256: sha256(input.jobInputBindingSha256, 'JOB_INPUT_BINDING'),
    commandSha256: jobInput.command.commandSha256,
    runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
    publicationPolicySha256: jobInput.publicationPolicy.policySha256,
    budgetReservationId: jobInput.budgetReservation.reservationId,
    budgetReservationBindingSha256: jobInput.budgetReservation.bindingSha256,
    budgetAuthorizationReceiptSha256: sha256(
      input.budgetAuthorizationReceiptSha256,
      'BUDGET_AUTHORIZATION_RECEIPT',
    ),
    trustedTranscodeReceipt,
  };
  assertPayloadSize(material);
  return deepFreezeEditronJsonV1({
    ...material,
    resultSha256: hashDurableWorkflowJobJsonV1(material),
  });
}

export function assertMediaProxyMasterTranscodeDurableResultV1(
  value: unknown,
): MediaProxyMasterTranscodeDurableResultV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_DURABLE_RESULT_INVALID');
  exactKeys(record, [
    'budgetAuthorizationReceiptSha256', 'budgetReservationBindingSha256',
    'budgetReservationId', 'commandSha256', 'disposition', 'jobId',
    'jobInputBindingSha256', 'operationId', 'publicationPolicySha256',
    'resultSha256', 'runtimePolicyBindingSha256', 'trustedTranscodeReceipt',
    'version',
  ], 'MEDIA_PROXY_MASTER_DURABLE_RESULT_FIELDS_INVALID');
  if (record.version !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_VERSION_V1
    || record.disposition !== 'TRUSTED_TRANSCODE_PERSISTED') {
    fail('MEDIA_PROXY_MASTER_DURABLE_RESULT_IDENTITY_INVALID');
  }
  let receipt: MediaProxyMasterTrustedTranscodeReceiptV1;
  try {
    receipt = assertMediaProxyMasterTrustedTranscodeReceiptV1(
      record.trustedTranscodeReceipt,
    );
  } catch {
    fail('MEDIA_PROXY_MASTER_DURABLE_RESULT_RECEIPT_INVALID');
  }
  const material = {
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESULT_VERSION_V1,
    disposition: 'TRUSTED_TRANSCODE_PERSISTED' as const,
    jobId: identity(record.jobId, 'JOB_ID'),
    operationId: identity(record.operationId, 'OPERATION_ID'),
    jobInputBindingSha256: sha256(record.jobInputBindingSha256, 'JOB_INPUT_BINDING'),
    commandSha256: sha256(record.commandSha256, 'COMMAND'),
    runtimePolicyBindingSha256: sha256(record.runtimePolicyBindingSha256, 'RUNTIME_POLICY'),
    publicationPolicySha256: sha256(record.publicationPolicySha256, 'PUBLICATION_POLICY'),
    budgetReservationId: identity(record.budgetReservationId, 'BUDGET_RESERVATION_ID'),
    budgetReservationBindingSha256: sha256(
      record.budgetReservationBindingSha256,
      'BUDGET_RESERVATION',
    ),
    budgetAuthorizationReceiptSha256: sha256(
      record.budgetAuthorizationReceiptSha256,
      'BUDGET_AUTHORIZATION_RECEIPT',
    ),
    trustedTranscodeReceipt: receipt,
  };
  if (material.commandSha256 !== receipt.command.commandSha256) {
    fail('MEDIA_PROXY_MASTER_DURABLE_RESULT_COMMAND_MISMATCH');
  }
  assertPayloadSize(material);
  const resultSha256 = sha256(record.resultSha256, 'RESULT');
  if (resultSha256 !== hashDurableWorkflowJobJsonV1(material)) {
    fail('MEDIA_PROXY_MASTER_DURABLE_RESULT_HASH_MISMATCH');
  }
  return deepFreezeEditronJsonV1({ ...material, resultSha256 });
}

export function assertMediaProxyMasterTranscodeDurableResultForJobV1(
  value: unknown,
  expected: Readonly<{
    jobId: string;
    operationId: string;
    jobInputBindingSha256: string;
    jobInput: MediaProxyMasterTranscodeDurableJobInputV1;
  }>,
): MediaProxyMasterTranscodeDurableResultV1 {
  const result = assertMediaProxyMasterTranscodeDurableResultV1(value);
  const jobInput = assertMediaProxyMasterTranscodeDurableJobInputV1(expected.jobInput);
  const jobContract = contractForJobInput(jobInput);
  assertReceiptForJob(result.trustedTranscodeReceipt, jobInput);
  if (result.jobId !== identity(expected.jobId, 'JOB_ID')
    || result.operationId !== identity(expected.operationId, 'OPERATION_ID')
    || result.jobInputBindingSha256
      !== sha256(expected.jobInputBindingSha256, 'JOB_INPUT_BINDING')
    || result.commandSha256 !== jobInput.command.commandSha256
    || result.runtimePolicyBindingSha256 !== jobInput.runtimePolicy.bindingSha256
    || result.publicationPolicySha256 !== jobInput.publicationPolicy.policySha256
    || result.budgetReservationId !== jobInput.budgetReservation.reservationId
    || result.budgetReservationBindingSha256
      !== jobInput.budgetReservation.bindingSha256
    || result.operationId !== jobContract.operationIdentity
    || result.jobInputBindingSha256 !== jobContract.bindingSha256) {
    fail('MEDIA_PROXY_MASTER_DURABLE_RESULT_JOB_BINDING_MISMATCH');
  }
  return result;
}

export function createMediaProxyMasterTranscodeDurableResumeStateV1(input: Readonly<{
  result: MediaProxyMasterTranscodeDurableResultV1;
  jobId: string;
  operationId: string;
  jobInputBindingSha256: string;
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1;
}>) {
  const payload = assertMediaProxyMasterTranscodeDurableResultForJobV1(
    input.result,
    input,
  );
  return deepFreezeEditronJsonV1({
    schemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V1,
    stateSha256: hashDurableWorkflowJobJsonV1(payload),
    payload,
  });
}

export function readMediaProxyMasterTranscodeDurableResumeResultV1(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
): MediaProxyMasterTranscodeDurableResultV1 | null {
  if (!job.resumeState) return null;
  const resume = object(
    job.resumeState,
    'MEDIA_PROXY_MASTER_DURABLE_RESUME_INVALID',
  );
  exactKeys(resume, [
    'committedAt', 'payload', 'schemaId', 'sequence', 'stateSha256',
  ], 'MEDIA_PROXY_MASTER_DURABLE_RESUME_FIELDS_INVALID');
  isoInstant(resume.committedAt, 'RESUME_COMMITTED_AT');
  if (resume.schemaId !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V1
    || !Number.isSafeInteger(resume.sequence) || Number(resume.sequence) < 1
    || resume.stateSha256 !== hashDurableWorkflowJobJsonV1(resume.payload)) {
    fail('MEDIA_PROXY_MASTER_DURABLE_RESUME_BINDING_MISMATCH');
  }
  return assertMediaProxyMasterTranscodeDurableResultForJobV1(resume.payload, {
    jobId: job.jobId,
    operationId: job.operationId,
    jobInputBindingSha256: job.input.bindingSha256,
    jobInput,
  });
}

function contractForJobInput(job: MediaProxyMasterTranscodeDurableJobInputV1) {
  const { version: _version, commandSha256: _commandSha256, ...request } = job;
  return buildMediaProxyMasterTranscodeDurableJobContractV1(request);
}

export function createMediaProxyMasterTranscodeDurableTerminalReceiptV1(
  input: Readonly<{
    jobId: string;
    operationId: string;
    jobInputBindingSha256: string;
    jobInput: MediaProxyMasterTranscodeDurableJobInputV1;
    result: MediaProxyMasterTranscodeDurableResultV1;
    completedAt: Date;
  }>,
): DurableWorkflowJobTerminalReceiptV1 {
  const result = assertMediaProxyMasterTranscodeDurableResultForJobV1(
    input.result,
    input,
  );
  const completedAt = validDate(input.completedAt, 'TERMINAL_COMPLETED_AT');
  if (completedAt.getTime()
    < Date.parse(result.trustedTranscodeReceipt.completedAt)) {
    fail('MEDIA_PROXY_MASTER_DURABLE_TERMINAL_TIME_INVALID');
  }
  const proofReferences = Object.freeze([
    proof('execution-budget-authorization', result.budgetAuthorizationReceiptSha256),
    proof('private-publication-policy', result.publicationPolicySha256),
    proof('trusted-proxy-transcode', result.trustedTranscodeReceipt.receiptSha256),
    proof('durable-transcode-result', result.resultSha256),
  ]);
  const material = {
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_TERMINAL_VERSION_V1,
    jobId: result.jobId,
    operationId: result.operationId,
    jobInputBindingSha256: result.jobInputBindingSha256,
    resultSha256: result.resultSha256,
    trustedTranscodeReceiptSha256: result.trustedTranscodeReceipt.receiptSha256,
    proofReferences,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return Object.freeze({
    disposition: 'PASS',
    receiptId: `mpmtrans_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences,
    completedAt,
  });
}

function assertReceiptForJob(
  receipt: MediaProxyMasterTrustedTranscodeReceiptV1,
  job: MediaProxyMasterTranscodeDurableJobInputV1,
): void {
  const runtime = job.runtimePolicy.executionProfile;
  if (hashEditronCanonicalJsonV1(receipt.command)
      !== hashEditronCanonicalJsonV1(job.command)
    || receipt.runtime.workerImageDigest !== runtime.workerImageDigest
    || receipt.runtime.platform !== runtime.platform
    || receipt.runtime.ffmpegVersion !== runtime.ffmpegVersion
    || receipt.runtime.ffprobeVersion !== runtime.ffprobeVersion
    || receipt.proxyEncode.sourceVersion.byteLength
      > job.publicationPolicy.maximumSingleRequestBytes) {
    fail('MEDIA_PROXY_MASTER_DURABLE_RESULT_RECEIPT_JOB_MISMATCH');
  }
}

function assertPayloadSize(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_PAYLOAD_BYTES) {
    fail('MEDIA_PROXY_MASTER_DURABLE_RESULT_PAYLOAD_TOO_LARGE');
  }
}

function proof(proofId: string, proofSha256: string) {
  return Object.freeze({
    proofId: identity(proofId, 'PROOF_ID'),
    proofSha256: sha256(proofSha256, 'PROOF'),
    disposition: 'PASS' as const,
  });
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
    || actual.some((key, index) => key !== sorted[index])) fail(code);
}

function identity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) {
    fail(`MEDIA_PROXY_MASTER_DURABLE_RESULT_${label}_INVALID`);
  }
  return normalized;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`MEDIA_PROXY_MASTER_DURABLE_RESULT_${label}_SHA256_INVALID`);
  }
  return value;
}

function validDate(value: unknown, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    fail(`MEDIA_PROXY_MASTER_DURABLE_RESULT_${label}_INVALID`);
  }
  return new Date(value);
}

function isoInstant(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    fail(`MEDIA_PROXY_MASTER_DURABLE_RESULT_${label}_INVALID`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`MEDIA_PROXY_MASTER_DURABLE_RESULT_${label}_INVALID`);
  }
  return value;
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeDurableResultErrorV1(code);
}
