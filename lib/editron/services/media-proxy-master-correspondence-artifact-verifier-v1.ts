import { createHash } from 'node:crypto';

import { compareCanonicalMediaTimeV1, parseCanonicalMediaTimeV1 } from '../contracts/canonical-media-time-v1';

import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterCorrespondenceBasisV1,
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  expectedMediaProxyMasterCorrespondenceBatchObjectKeyV1,
  parseMediaProxyMasterCorrespondenceBatchV1,
  type MediaProxyMasterCorrespondenceBasisV1,
  type MediaProxyMasterCorrespondenceBatchSidecarV1,
} from './media-proxy-master-correspondence-batch-v1';
import {
  assertMediaProxyMasterCorrespondenceIndexReferenceV1,
  createMediaProxyMasterCorrespondenceIndexReferenceV1,
  createMediaProxyMasterCorrespondenceIndexV1,
  expectedMediaProxyMasterCorrespondenceIndexObjectKeyV1,
  parseMediaProxyMasterCorrespondenceIndexV1,
} from './media-proxy-master-correspondence-index-v1';
import type { MediaProxyMasterCorrespondenceIndexReferenceV1 } from './media-proxy-master-time-mapping-v1';

export const MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFIER_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFIER_V1' as const;
export const MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFICATION_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFICATION_V1' as const;

const MAX_TOTAL_ARTIFACT_BYTES = 16 * 1024 * 1024 * 1024;
const MAX_BATCH_READS = 100_000;

type StoredObjectReferenceV1 = Readonly<{
  objectKey: string;
  byteLength: number;
  contentSha256: string;
}>;

export type MediaProxyMasterCorrespondenceArtifactReaderV1 = Readonly<{
  read(reference: StoredObjectReferenceV1): Promise<Readonly<{
    canonicalJson: string;
    byteLength: number;
    contentSha256: string;
  }>>;
}>;

export type MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1 = Readonly<{
  policyVersion: string;
  maxBatchReads: number;
  maxTotalArtifactBytes: number;
}>;

export type MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFICATION_KIND_V1;
  disposition: 'CORRESPONDENCE_ARTIFACT_SET_VERIFIED';
  verifierVersion: typeof MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFIER_VERSION_V1;
  basis: MediaProxyMasterCorrespondenceBasisV1;
  verificationPolicy: MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1;
  indexReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
  verifiedBatchCount: number;
  totalSpanCount: string;
  mappedProxyFrameCount: string;
  mappedMasterFrameCount: string;
  canonicalEndExclusiveTime: Readonly<{ ticks: string; timescale: string }>;
  totalArtifactBytes: number;
  verifiedBatches: readonly Readonly<{
    batchSequence: number;
    objectKey: string;
    byteLength: number;
    contentSha256: string;
    spanCount: string;
  }>[];
  verificationSha256: string;
}>;

export type MediaProxyMasterCorrespondenceArtifactUnverifiableReasonV1 =
  | 'VERIFICATION_REQUEST_INVALID'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'BASIS_MISMATCH'
  | 'INDEX_READ_FAILED'
  | 'INDEX_STORED_OBJECT_INVALID'
  | 'INDEX_BYTE_LENGTH_MISMATCH'
  | 'INDEX_CONTENT_HASH_MISMATCH'
  | 'INDEX_PAYLOAD_INVALID'
  | 'INDEX_REFERENCE_MISMATCH'
  | 'BATCH_READ_FAILED'
  | 'BATCH_STORED_OBJECT_INVALID'
  | 'BATCH_BYTE_LENGTH_MISMATCH'
  | 'BATCH_CONTENT_HASH_MISMATCH'
  | 'BATCH_PAYLOAD_INVALID'
  | 'BATCH_SIDECAR_MISMATCH'
  | 'RECONSTRUCTED_INDEX_MISMATCH';

export type MediaProxyMasterCorrespondenceArtifactVerificationResultV1 =
  | MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      reason: MediaProxyMasterCorrespondenceArtifactUnverifiableReasonV1;
      failedObjectKey: string | null;
      failedBatchSequence: number | null;
      diagnostic: string | null;
    }>;

export async function verifyMediaProxyMasterCorrespondenceArtifactsV1(input: Readonly<{
  basis: MediaProxyMasterCorrespondenceBasisV1;
  indexReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
  verificationPolicy: MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1;
  reader: MediaProxyMasterCorrespondenceArtifactReaderV1;
}>): Promise<MediaProxyMasterCorrespondenceArtifactVerificationResultV1> {
  let basis: MediaProxyMasterCorrespondenceBasisV1;
  let indexReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
  let policy: MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1;
  try {
    basis = assertMediaProxyMasterCorrespondenceBasisV1(input.basis);
    indexReference = assertMediaProxyMasterCorrespondenceIndexReferenceV1(
      input.indexReference,
    );
    policy = assertMediaProxyMasterCorrespondenceArtifactVerificationPolicyV1(
      input.verificationPolicy,
    );
    if (!input.reader || typeof input.reader.read !== 'function') {
      throw new Error('CORRESPONDENCE_ARTIFACT_READER_INVALID');
    }
  } catch (error) {
    return unverifiable('VERIFICATION_REQUEST_INVALID', null, null, error);
  }
  if (indexReference.batchCount > policy.maxBatchReads
    || indexReference.byteLength > policy.maxTotalArtifactBytes) {
    return unverifiable(
      'RESOURCE_LIMIT_EXCEEDED', indexReference.objectKey, null, null,
    );
  }

  const storedIndex = await readStoredObject(
    input.reader,
    indexReference,
    'INDEX',
    null,
  );
  if (storedIndex.disposition === 'UNVERIFIABLE') return storedIndex.result;

  let index: ReturnType<typeof parseMediaProxyMasterCorrespondenceIndexV1>;
  try {
    index = parseMediaProxyMasterCorrespondenceIndexV1(
      storedIndex.object.canonicalJson,
    );
  } catch (error) {
    return unverifiable(
      'INDEX_PAYLOAD_INVALID', indexReference.objectKey, null, error,
    );
  }
  if (canonicalizeEditronJsonV1(index.basis) !== canonicalizeEditronJsonV1(basis)) {
    return unverifiable('BASIS_MISMATCH', indexReference.objectKey, null, null);
  }
  const storedIndexSerialization = {
    index,
    canonicalJson: storedIndex.object.canonicalJson,
    byteLength: storedIndex.object.byteLength,
    contentSha256: storedIndex.object.contentSha256,
  };
  let rebuiltReference: MediaProxyMasterCorrespondenceIndexReferenceV1;
  try {
    rebuiltReference = createMediaProxyMasterCorrespondenceIndexReferenceV1({
      serialization: storedIndexSerialization,
    });
  } catch (error) {
    return unverifiable(
      'INDEX_REFERENCE_MISMATCH', indexReference.objectKey, null, error,
    );
  }
  if (canonicalizeEditronJsonV1(rebuiltReference)
    !== canonicalizeEditronJsonV1(indexReference)) {
    return unverifiable('INDEX_REFERENCE_MISMATCH', indexReference.objectKey, null, null);
  }

  let totalArtifactBytes = storedIndex.object.byteLength;
  const batches: Array<{
    serialization: Readonly<{
      batch: ReturnType<typeof parseMediaProxyMasterCorrespondenceBatchV1>;
      canonicalJson: string;
      byteLength: number;
      contentSha256: string;
    }>;
    sidecar: MediaProxyMasterCorrespondenceBatchSidecarV1;
  }> = [];
  const verifiedBatches: MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1['verifiedBatches'][number][] = [];
  for (const sidecar of index.batches) {
    if (totalArtifactBytes + sidecar.byteLength > policy.maxTotalArtifactBytes) {
      return unverifiable(
        'RESOURCE_LIMIT_EXCEEDED', sidecar.objectKey, sidecar.batchSequence, null,
      );
    }
    const storedBatch = await readStoredObject(
      input.reader,
      sidecar,
      'BATCH',
      sidecar.batchSequence,
    );
    if (storedBatch.disposition === 'UNVERIFIABLE') return storedBatch.result;
    let batch: ReturnType<typeof parseMediaProxyMasterCorrespondenceBatchV1>;
    try {
      batch = parseMediaProxyMasterCorrespondenceBatchV1(
        storedBatch.object.canonicalJson,
      );
    } catch (error) {
      return unverifiable(
        'BATCH_PAYLOAD_INVALID', sidecar.objectKey, sidecar.batchSequence, error,
      );
    }
    const serialization = {
      batch,
      canonicalJson: storedBatch.object.canonicalJson,
      byteLength: storedBatch.object.byteLength,
      contentSha256: storedBatch.object.contentSha256,
    };
    let rebuiltSidecar: MediaProxyMasterCorrespondenceBatchSidecarV1;
    try {
      rebuiltSidecar = createMediaProxyMasterCorrespondenceBatchSidecarV1({
        serialization,
      });
    } catch (error) {
      return unverifiable(
        'BATCH_SIDECAR_MISMATCH', sidecar.objectKey, sidecar.batchSequence, error,
      );
    }
    if (canonicalizeEditronJsonV1(rebuiltSidecar) !== canonicalizeEditronJsonV1(sidecar)) {
      return unverifiable(
        'BATCH_SIDECAR_MISMATCH', sidecar.objectKey, sidecar.batchSequence, null,
      );
    }
    totalArtifactBytes += storedBatch.object.byteLength;
    batches.push({ serialization, sidecar });
    verifiedBatches.push({
      batchSequence: sidecar.batchSequence,
      objectKey: sidecar.objectKey,
      byteLength: sidecar.byteLength,
      contentSha256: sidecar.contentSha256,
      spanCount: sidecar.spanCount,
    });
  }

  let rebuiltIndex: ReturnType<typeof createMediaProxyMasterCorrespondenceIndexV1>;
  try {
    rebuiltIndex = createMediaProxyMasterCorrespondenceIndexV1({
      basis,
      resourcePolicy: index.resourcePolicy,
      batches,
    });
  } catch (error) {
    return unverifiable(
      'RECONSTRUCTED_INDEX_MISMATCH', indexReference.objectKey, null, error,
    );
  }
  if (rebuiltIndex.canonicalJson !== storedIndex.object.canonicalJson
    || rebuiltIndex.byteLength !== storedIndex.object.byteLength
    || rebuiltIndex.contentSha256 !== storedIndex.object.contentSha256) {
    return unverifiable(
      'RECONSTRUCTED_INDEX_MISMATCH', indexReference.objectKey, null, null,
    );
  }

  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFICATION_KIND_V1,
    disposition: 'CORRESPONDENCE_ARTIFACT_SET_VERIFIED' as const,
    verifierVersion: MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFIER_VERSION_V1,
    basis,
    verificationPolicy: policy,
    indexReference,
    verifiedBatchCount: verifiedBatches.length,
    totalSpanCount: index.totalSpanCount,
    mappedProxyFrameCount: index.mappedProxyFrameCount,
    mappedMasterFrameCount: index.mappedMasterFrameCount,
    canonicalEndExclusiveTime: index.canonicalEndExclusiveTime,
    totalArtifactBytes,
    verifiedBatches,
  };
  return assertMediaProxyMasterCorrespondenceArtifactVerificationReceiptV1({
    ...material,
    verificationSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterCorrespondenceArtifactVerificationReceiptV1(
  value: unknown,
): MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1 {
  const record = object(value, 'CORRESPONDENCE_ARTIFACT_RECEIPT_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'disposition', 'verifierVersion', 'basis',
    'verificationPolicy', 'indexReference', 'verifiedBatchCount',
    'totalSpanCount', 'mappedProxyFrameCount', 'mappedMasterFrameCount',
    'canonicalEndExclusiveTime', 'totalArtifactBytes', 'verifiedBatches',
    'verificationSha256',
  ], 'CORRESPONDENCE_ARTIFACT_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFICATION_KIND_V1
    || record.disposition !== 'CORRESPONDENCE_ARTIFACT_SET_VERIFIED'
    || record.verifierVersion !== MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFIER_VERSION_V1) {
    fail('CORRESPONDENCE_ARTIFACT_RECEIPT_HEADER_INVALID');
  }
  const basis = assertMediaProxyMasterCorrespondenceBasisV1(record.basis);
  const verificationPolicy = assertMediaProxyMasterCorrespondenceArtifactVerificationPolicyV1(
    record.verificationPolicy,
  );
  const indexReference = assertMediaProxyMasterCorrespondenceIndexReferenceV1(
    record.indexReference,
  );
  const verifiedBatches = assertVerifiedBatches(record.verifiedBatches);
  const verifiedBatchCount = positiveSafeInteger(
    record.verifiedBatchCount,
    MAX_BATCH_READS,
    'CORRESPONDENCE_ARTIFACT_RECEIPT_BATCH_COUNT_INVALID',
  );
  const totalSpanCount = positiveIntegerText(
    record.totalSpanCount,
    'CORRESPONDENCE_ARTIFACT_RECEIPT_SPAN_COUNT_INVALID',
  );
  const mappedProxyFrameCount = positiveIntegerText(
    record.mappedProxyFrameCount,
    'CORRESPONDENCE_ARTIFACT_RECEIPT_PROXY_COUNT_INVALID',
  );
  const mappedMasterFrameCount = positiveIntegerText(
    record.mappedMasterFrameCount,
    'CORRESPONDENCE_ARTIFACT_RECEIPT_MASTER_COUNT_INVALID',
  );
  const canonicalEndExclusiveTime = parseCanonicalMediaTimeV1(
    record.canonicalEndExclusiveTime,
  );
  const totalArtifactBytes = positiveSafeInteger(
    record.totalArtifactBytes,
    MAX_TOTAL_ARTIFACT_BYTES,
    'CORRESPONDENCE_ARTIFACT_RECEIPT_BYTES_INVALID',
  );
  const basisSha256 = hashEditronCanonicalJsonV1(basis);
  const expectedTotalArtifactBytes = verifiedBatches.reduce(
    (total, batch) => total + batch.byteLength,
    indexReference.byteLength,
  );
  const expectedTotalSpanCount = verifiedBatches.reduce(
    (total, batch) => total + BigInt(batch.spanCount),
    BigInt(0),
  ).toString();
  if (verifiedBatchCount !== verifiedBatches.length
    || verifiedBatchCount !== indexReference.batchCount
    || verifiedBatchCount > verificationPolicy.maxBatchReads
    || mappedProxyFrameCount !== indexReference.mappedProxyFrameCount
    || mappedMasterFrameCount !== indexReference.mappedMasterFrameCount
    || mappedProxyFrameCount !== basis.proxyTimeMap.totalFrameCount
    || mappedMasterFrameCount !== basis.masterTimeMap.totalFrameCount
    || totalSpanCount !== expectedTotalSpanCount
    || totalArtifactBytes !== expectedTotalArtifactBytes
    || totalArtifactBytes > verificationPolicy.maxTotalArtifactBytes
    || indexReference.objectKey !== expectedMediaProxyMasterCorrespondenceIndexObjectKeyV1(
      basisSha256,
      indexReference.contentSha256,
    )
    || verifiedBatches.some((batch) => batch.objectKey
      !== expectedMediaProxyMasterCorrespondenceBatchObjectKeyV1(
        basisSha256,
        batch.batchSequence,
        batch.contentSha256,
      ))
    || compareCanonicalMediaTimeV1(
      canonicalEndExclusiveTime,
      parseCanonicalMediaTimeV1({ ticks: '0', timescale: '1' }),
    ) <= 0) {
    fail('CORRESPONDENCE_ARTIFACT_RECEIPT_SCOPE_MISMATCH');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFICATION_KIND_V1,
    disposition: 'CORRESPONDENCE_ARTIFACT_SET_VERIFIED' as const,
    verifierVersion: MEDIA_PROXY_MASTER_CORRESPONDENCE_ARTIFACT_VERIFIER_VERSION_V1,
    basis,
    verificationPolicy,
    indexReference,
    verifiedBatchCount,
    totalSpanCount,
    mappedProxyFrameCount,
    mappedMasterFrameCount,
    canonicalEndExclusiveTime,
    totalArtifactBytes,
    verifiedBatches,
  };
  const verificationSha256 = sha256(
    record.verificationSha256,
    'CORRESPONDENCE_ARTIFACT_RECEIPT_HASH_INVALID',
  );
  if (verificationSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('CORRESPONDENCE_ARTIFACT_RECEIPT_HASH_MISMATCH');
  }
  return frozen({ ...material, verificationSha256 });
}

export function assertMediaProxyMasterCorrespondenceArtifactVerificationPolicyV1(
  value: unknown,
): MediaProxyMasterCorrespondenceArtifactVerificationPolicyV1 {
  const record = object(value, 'CORRESPONDENCE_ARTIFACT_POLICY_INVALID');
  exactKeys(record, ['policyVersion', 'maxBatchReads', 'maxTotalArtifactBytes'], 'CORRESPONDENCE_ARTIFACT_POLICY_FIELDS_INVALID');
  return frozen({
    policyVersion: text(record.policyVersion, 'CORRESPONDENCE_ARTIFACT_POLICY_VERSION_INVALID'),
    maxBatchReads: positiveSafeInteger(
      record.maxBatchReads,
      MAX_BATCH_READS,
      'CORRESPONDENCE_ARTIFACT_POLICY_BATCH_READS_INVALID',
    ),
    maxTotalArtifactBytes: positiveSafeInteger(
      record.maxTotalArtifactBytes,
      MAX_TOTAL_ARTIFACT_BYTES,
      'CORRESPONDENCE_ARTIFACT_POLICY_BYTES_INVALID',
    ),
  });
}

function assertVerifiedBatches(
  value: unknown,
): MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1['verifiedBatches'] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH_READS) {
    fail('CORRESPONDENCE_ARTIFACT_RECEIPT_BATCHES_INVALID');
  }
  return frozen(value.map((entry, batchSequence) => {
    const record = object(entry, 'CORRESPONDENCE_ARTIFACT_RECEIPT_BATCH_INVALID');
    exactKeys(record, [
      'batchSequence', 'objectKey', 'byteLength', 'contentSha256', 'spanCount',
    ], 'CORRESPONDENCE_ARTIFACT_RECEIPT_BATCH_FIELDS_INVALID');
    if (record.batchSequence !== batchSequence) {
      fail('CORRESPONDENCE_ARTIFACT_RECEIPT_BATCH_SEQUENCE_INVALID');
    }
    return {
      batchSequence,
      objectKey: text(record.objectKey, 'CORRESPONDENCE_ARTIFACT_RECEIPT_BATCH_KEY_INVALID', 1024),
      byteLength: positiveSafeInteger(record.byteLength, MAX_TOTAL_ARTIFACT_BYTES, 'CORRESPONDENCE_ARTIFACT_RECEIPT_BATCH_BYTES_INVALID'),
      contentSha256: sha256(record.contentSha256, 'CORRESPONDENCE_ARTIFACT_RECEIPT_BATCH_HASH_INVALID'),
      spanCount: positiveIntegerText(record.spanCount, 'CORRESPONDENCE_ARTIFACT_RECEIPT_BATCH_SPANS_INVALID'),
    };
  }));
}

type StoredReadV1 = Readonly<
  | {
      disposition: 'VERIFIED';
      object: Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;
    }
  | { disposition: 'UNVERIFIABLE'; result: MediaProxyMasterCorrespondenceArtifactVerificationResultV1 }
>;

async function readStoredObject(
  reader: MediaProxyMasterCorrespondenceArtifactReaderV1,
  reference: StoredObjectReferenceV1,
  family: 'INDEX' | 'BATCH',
  batchSequence: number | null,
): Promise<StoredReadV1> {
  let stored: Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;
  try {
    stored = await reader.read(reference);
  } catch (error) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        family === 'INDEX' ? 'INDEX_READ_FAILED' : 'BATCH_READ_FAILED',
        reference.objectKey,
        batchSequence,
        error,
      ),
    };
  }
  if (!stored || typeof stored !== 'object'
    || typeof stored.canonicalJson !== 'string'
    || !Number.isSafeInteger(stored.byteLength) || stored.byteLength <= 0
    || typeof stored.contentSha256 !== 'string') {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        family === 'INDEX'
          ? 'INDEX_STORED_OBJECT_INVALID' : 'BATCH_STORED_OBJECT_INVALID',
        reference.objectKey,
        batchSequence,
        null,
      ),
    };
  }
  if (stored.byteLength !== Buffer.byteLength(stored.canonicalJson, 'utf8')
    || stored.byteLength !== reference.byteLength) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        family === 'INDEX'
          ? 'INDEX_BYTE_LENGTH_MISMATCH' : 'BATCH_BYTE_LENGTH_MISMATCH',
        reference.objectKey,
        batchSequence,
        null,
      ),
    };
  }
  if (stored.contentSha256 !== digest(stored.canonicalJson)
    || stored.contentSha256 !== reference.contentSha256) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        family === 'INDEX'
          ? 'INDEX_CONTENT_HASH_MISMATCH' : 'BATCH_CONTENT_HASH_MISMATCH',
        reference.objectKey,
        batchSequence,
        null,
      ),
    };
  }
  return { disposition: 'VERIFIED', object: stored };
}

function unverifiable(
  reason: MediaProxyMasterCorrespondenceArtifactUnverifiableReasonV1,
  failedObjectKey: string | null,
  failedBatchSequence: number | null,
  error: unknown,
): MediaProxyMasterCorrespondenceArtifactVerificationResultV1 {
  return frozen({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    failedObjectKey,
    failedBatchSequence,
    diagnostic: error === null
      ? null
      : boundedDiagnostic(error instanceof Error ? error.message : String(error)),
  });
}

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(error);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], error: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) fail(error);
}

function text(value: unknown, error: string, max = 256): string {
  if (typeof value !== 'string' || value.trim() !== value
    || value.length === 0 || value.length > max) fail(error);
  return value;
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(error);
  return value;
}

function positiveSafeInteger(value: unknown, max: number, error: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0
    || (value as number) > max) fail(error);
  return value as number;
}

function positiveIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,127}$/.test(value)) fail(error);
  return value;
}

function boundedDiagnostic(value: string): string {
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return (normalized || 'UNSPECIFIED').slice(0, 512);
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(message: string): never {
  throw new Error(message);
}
