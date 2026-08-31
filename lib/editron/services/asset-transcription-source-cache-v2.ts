import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceOwnerV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import type {
  TranscriptionData,
  TranscriptionWord,
} from './media/types';

const ASSET_TRANSCRIPTION_SOURCE_CACHE_COLLECTION_V2 =
  'asset_transcriptions_v2' as const;
const ASSET_TRANSCRIPTION_SOURCE_BINDING_KIND_V2 =
  'EDITRON_ASSET_TRANSCRIPTION_SOURCE_BINDING_V2' as const;
const ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_KIND_V2 =
  'EDITRON_ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_V2' as const;
const ASSET_TRANSCRIPTION_CONTRACT_V2 =
  'EDITRON_ASSET_TRANSCRIPTION_V2' as const;

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_TRANSCRIPT_CHARACTERS = 20_000_000;
const MAX_TRANSCRIPTION_WORDS = 500_000;

export type AssetTranscriptionSourceRoleV2 =
  | 'DIRECT'
  | 'PROXY'
  | 'MASTER';
export type AssetTranscriptionPrecisionV2 =
  | 'TEXT_ALLOWED'
  | 'MEASURED_WORD_REQUIRED';
export type AssetTranscriptionTimingBasisV2 =
  | 'MEASURED_WORD'
  | 'SEGMENT_ESTIMATED'
  | 'SYNTHETIC_NARRATION'
  | 'NO_SPEECH';

export type AssetTranscriptionSourceReferenceV2 = Readonly<{
  owner: MediaSourceOwnerV1;
  assetId: string;
  mediaKind: 'video' | 'audio';
  contentSha256: string;
  storageVersionSha256: string;
  sourceVersionSha256: string;
}>;

export type AssetTranscriptionSourceBindingV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof ASSET_TRANSCRIPTION_SOURCE_BINDING_KIND_V2;
  userId: string;
  assetId: string;
  sourceRole: AssetTranscriptionSourceRoleV2;
  source: AssetTranscriptionSourceReferenceV2;
  requestedLanguage: string | null;
  precision: AssetTranscriptionPrecisionV2;
  transcriberContract: typeof ASSET_TRANSCRIPTION_CONTRACT_V2;
  bindingSha256: string;
}>;

type AssetTranscriptionSourceBindingMaterialV2 = Readonly<
  Omit<AssetTranscriptionSourceBindingV2, 'bindingSha256'>
>;

export type AssetTranscriptionTimingEvidenceV2 = Readonly<{
  timingBasis: AssetTranscriptionTimingBasisV2;
  providerId: string;
  modelId: string;
  strategy: string;
  providerContractVersion: string;
}>;

type CanonicalTranscriptionWordV2 = Readonly<{
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
  speaker?: number;
}>;

type CanonicalTranscriptionDataV2 = Readonly<{
  words: readonly CanonicalTranscriptionWordV2[];
  transcript: string;
  language: string;
  confidence: number;
  generatedAt: string;
  speakerCount?: number;
}>;

type AssetTranscriptionSourceCacheRecordV2 = Readonly<{
  _id: string;
  schemaVersion: 2;
  kind: typeof ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_KIND_V2;
  sourceBindingV2: AssetTranscriptionSourceBindingV2;
  transcription: CanonicalTranscriptionDataV2;
  timingEvidence: AssetTranscriptionTimingEvidenceV2;
  transcriptionSha256: string;
  recordSha256: string;
}>;

type AssetTranscriptionSourceCacheRecordMaterialV2 = Readonly<
  Omit<AssetTranscriptionSourceCacheRecordV2, 'recordSha256'>
>;

export type AssetTranscriptionEvidenceV2 = Readonly<{
  sourceBindingV2: AssetTranscriptionSourceBindingV2;
  transcription: TranscriptionData;
  timingEvidence: AssetTranscriptionTimingEvidenceV2;
  transcriptionSha256: string;
  recordSha256: string;
}>;

type AssetTranscriptionSourceCacheMongoDocumentV2 = {
  _id: string;
  [key: string]: unknown;
};

export function createAssetTranscriptionSourceBindingV2(input: Readonly<{
  userId: string;
  assetId: string;
  sourceRole: AssetTranscriptionSourceRoleV2;
  sourceVersion: MediaSourceVersionV1;
  requestedLanguage?: string | null;
  precision: AssetTranscriptionPrecisionV2;
}>): AssetTranscriptionSourceBindingV2 {
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  if (sourceVersion.assetId !== input.assetId
    || (sourceVersion.mediaKind !== 'video'
      && sourceVersion.mediaKind !== 'audio')) {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_SOURCE_SCOPE_MISMATCH');
  }
  const material = normalizeBindingMaterial({
    schemaVersion: 2,
    kind: ASSET_TRANSCRIPTION_SOURCE_BINDING_KIND_V2,
    userId: input.userId,
    assetId: input.assetId,
    sourceRole: input.sourceRole,
    source: {
      owner: sourceVersion.owner,
      assetId: sourceVersion.assetId,
      mediaKind: sourceVersion.mediaKind,
      contentSha256: sourceVersion.contentSha256,
      storageVersionSha256:
        sourceVersion.storageVersion.storageVersionSha256,
      sourceVersionSha256: sourceVersion.sourceVersionSha256,
    },
    requestedLanguage: input.requestedLanguage ?? null,
    precision: input.precision,
    transcriberContract: ASSET_TRANSCRIPTION_CONTRACT_V2,
  });
  return assertAssetTranscriptionSourceBindingV2({
    ...material,
    bindingSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertAssetTranscriptionSourceBindingV2(
  value: unknown,
): AssetTranscriptionSourceBindingV2 {
  const record = plainObject(
    value,
    'ASSET_TRANSCRIPTION_SOURCE_BINDING_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'userId', 'assetId', 'sourceRole', 'source',
    'requestedLanguage', 'precision', 'transcriberContract', 'bindingSha256',
  ], 'ASSET_TRANSCRIPTION_SOURCE_BINDING_FIELDS_INVALID');
  const material = normalizeBindingMaterial(record);
  const bindingSha256 = sha256(
    record.bindingSha256,
    'ASSET_TRANSCRIPTION_SOURCE_BINDING_HASH_INVALID',
  );
  if (bindingSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_HASH_MISMATCH');
  }
  return frozen({ ...material, bindingSha256 });
}

export function isAssetTranscriptionFrameAddressableV2(
  evidence: AssetTranscriptionEvidenceV2,
): boolean {
  const normalized = normalizeEvidence(evidence);
  return normalized.sourceBindingV2.precision === 'MEASURED_WORD_REQUIRED'
    && normalized.timingEvidence.timingBasis === 'MEASURED_WORD'
    && normalized.transcription.words.length > 0;
}

export async function getSourceBoundTranscriptionV2(
  bindingInput: AssetTranscriptionSourceBindingV2,
): Promise<AssetTranscriptionEvidenceV2 | null> {
  const binding = assertAssetTranscriptionSourceBindingV2(bindingInput);
  const stored = await (await collection()).findOne({
    _id: recordId(binding),
    'sourceBindingV2.userId': binding.userId,
    'sourceBindingV2.bindingSha256': binding.bindingSha256,
  }, { readPreference: 'primary' });
  if (!stored) return null;
  return hydrateEvidence(assertStoredRecord(stored, binding));
}

export async function saveSourceBoundTranscriptionV2(
  bindingInput: AssetTranscriptionSourceBindingV2,
  input: Readonly<{
    transcription: TranscriptionData;
    timingEvidence: AssetTranscriptionTimingEvidenceV2;
  }>,
): Promise<AssetTranscriptionEvidenceV2> {
  const binding = assertAssetTranscriptionSourceBindingV2(bindingInput);
  const transcription = normalizeTranscription(input.transcription);
  const timingEvidence = normalizeTimingEvidence(input.timingEvidence);
  assertTimingCompatibility(binding, transcription, timingEvidence);
  const transcriptionSha256 = hashEditronCanonicalJsonV1({
    transcription,
    timingEvidence,
  });
  const material: AssetTranscriptionSourceCacheRecordMaterialV2 = {
    _id: recordId(binding),
    schemaVersion: 2,
    kind: ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_KIND_V2,
    sourceBindingV2: binding,
    transcription,
    timingEvidence,
    transcriptionSha256,
  };
  const candidate = frozen({
    ...material,
    recordSha256: hashEditronCanonicalJsonV1(material),
  });
  const owner = await collection();
  await owner.updateOne(
    { _id: candidate._id },
    { $setOnInsert: candidate },
    { upsert: true, writeConcern: { w: 'majority' } },
  );
  const stored = await owner.findOne(
    { _id: candidate._id },
    { readPreference: 'primary' },
  );
  if (!stored) fail('ASSET_TRANSCRIPTION_SOURCE_CACHE_WRITE_UNACKNOWLEDGED');
  return hydrateEvidence(assertStoredRecord(stored, binding));
}

function normalizeEvidence(value: unknown): AssetTranscriptionEvidenceV2 {
  const record = plainObject(value, 'ASSET_TRANSCRIPTION_EVIDENCE_INVALID');
  exactKeys(record, [
    'sourceBindingV2', 'transcription', 'timingEvidence',
    'transcriptionSha256', 'recordSha256',
  ], 'ASSET_TRANSCRIPTION_EVIDENCE_FIELDS_INVALID');
  const sourceBindingV2 = assertAssetTranscriptionSourceBindingV2(
    record.sourceBindingV2,
  );
  const transcription = normalizeTranscription(record.transcription);
  const timingEvidence = normalizeTimingEvidence(record.timingEvidence);
  assertTimingCompatibility(sourceBindingV2, transcription, timingEvidence);
  const expectedTranscriptionSha256 = hashEditronCanonicalJsonV1({
    transcription,
    timingEvidence,
  });
  const transcriptionSha256 = sha256(
    record.transcriptionSha256,
    'ASSET_TRANSCRIPTION_EVIDENCE_TRANSCRIPTION_HASH_INVALID',
  );
  if (transcriptionSha256 !== expectedTranscriptionSha256) {
    fail('ASSET_TRANSCRIPTION_EVIDENCE_TRANSCRIPTION_HASH_MISMATCH');
  }
  const material: AssetTranscriptionSourceCacheRecordMaterialV2 = {
    _id: recordId(sourceBindingV2),
    schemaVersion: 2,
    kind: ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_KIND_V2,
    sourceBindingV2,
    transcription,
    timingEvidence,
    transcriptionSha256,
  };
  const recordSha256 = sha256(
    record.recordSha256,
    'ASSET_TRANSCRIPTION_EVIDENCE_RECORD_HASH_INVALID',
  );
  if (recordSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('ASSET_TRANSCRIPTION_EVIDENCE_RECORD_HASH_MISMATCH');
  }
  return Object.freeze({
    sourceBindingV2,
    transcription: hydrateTranscription(transcription),
    timingEvidence,
    transcriptionSha256,
    recordSha256,
  });
}

function normalizeBindingMaterial(
  value: Readonly<Record<string, unknown>>,
): AssetTranscriptionSourceBindingMaterialV2 {
  if (value.schemaVersion !== 2
    || value.kind !== ASSET_TRANSCRIPTION_SOURCE_BINDING_KIND_V2
    || value.transcriberContract !== ASSET_TRANSCRIPTION_CONTRACT_V2) {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_CONTRACT_INVALID');
  }
  const sourceRole = value.sourceRole;
  if (sourceRole !== 'DIRECT'
    && sourceRole !== 'PROXY'
    && sourceRole !== 'MASTER') {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_ROLE_INVALID');
  }
  const precision = value.precision;
  if (precision !== 'TEXT_ALLOWED'
    && precision !== 'MEASURED_WORD_REQUIRED') {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_PRECISION_INVALID');
  }
  const assetId = identifier(
    value.assetId,
    'ASSET_TRANSCRIPTION_SOURCE_BINDING_ASSET_INVALID',
  );
  const source = normalizeSourceReference(value.source);
  if (source.assetId !== assetId) {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_SOURCE_SCOPE_MISMATCH');
  }
  return frozen({
    schemaVersion: 2,
    kind: ASSET_TRANSCRIPTION_SOURCE_BINDING_KIND_V2,
    userId: identifier(
      value.userId,
      'ASSET_TRANSCRIPTION_SOURCE_BINDING_USER_INVALID',
    ),
    assetId,
    sourceRole,
    source,
    requestedLanguage: language(value.requestedLanguage),
    precision,
    transcriberContract: ASSET_TRANSCRIPTION_CONTRACT_V2,
  });
}

function normalizeSourceReference(
  value: unknown,
): AssetTranscriptionSourceReferenceV2 {
  const source = plainObject(
    value,
    'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_INVALID',
  );
  exactKeys(source, [
    'owner', 'assetId', 'mediaKind', 'contentSha256',
    'storageVersionSha256', 'sourceVersionSha256',
  ], 'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_FIELDS_INVALID');
  const mediaKind = source.mediaKind;
  if (mediaKind !== 'video' && mediaKind !== 'audio') {
    fail('ASSET_TRANSCRIPTION_SOURCE_REFERENCE_MEDIA_KIND_INVALID');
  }
  return frozen({
    owner: normalizeOwner(source.owner),
    assetId: identifier(
      source.assetId,
      'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_ASSET_INVALID',
    ),
    mediaKind,
    contentSha256: sha256(
      source.contentSha256,
      'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_CONTENT_HASH_INVALID',
    ),
    storageVersionSha256: sha256(
      source.storageVersionSha256,
      'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_STORAGE_HASH_INVALID',
    ),
    sourceVersionSha256: sha256(
      source.sourceVersionSha256,
      'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_SOURCE_HASH_INVALID',
    ),
  });
}

function normalizeOwner(value: unknown): MediaSourceOwnerV1 {
  const owner = plainObject(value, 'ASSET_TRANSCRIPTION_SOURCE_OWNER_INVALID');
  if (owner.kind === 'USER') {
    exactKeys(owner, ['kind', 'userId'], 'ASSET_TRANSCRIPTION_SOURCE_OWNER_FIELDS_INVALID');
    return frozen({
      kind: 'USER' as const,
      userId: identifier(
        owner.userId,
        'ASSET_TRANSCRIPTION_SOURCE_OWNER_USER_INVALID',
      ),
    });
  }
  if (owner.kind === 'ORG') {
    exactKeys(owner, ['kind', 'orgId'], 'ASSET_TRANSCRIPTION_SOURCE_OWNER_FIELDS_INVALID');
    return frozen({
      kind: 'ORG' as const,
      orgId: identifier(
        owner.orgId,
        'ASSET_TRANSCRIPTION_SOURCE_OWNER_ORG_INVALID',
      ),
    });
  }
  fail('ASSET_TRANSCRIPTION_SOURCE_OWNER_KIND_INVALID');
}

function normalizeTimingEvidence(
  value: unknown,
): AssetTranscriptionTimingEvidenceV2 {
  const evidence = plainObject(
    value,
    'ASSET_TRANSCRIPTION_TIMING_EVIDENCE_INVALID',
  );
  exactKeys(evidence, [
    'timingBasis', 'providerId', 'modelId', 'strategy',
    'providerContractVersion',
  ], 'ASSET_TRANSCRIPTION_TIMING_EVIDENCE_FIELDS_INVALID');
  const timingBasis = evidence.timingBasis;
  if (timingBasis !== 'MEASURED_WORD'
    && timingBasis !== 'SEGMENT_ESTIMATED'
    && timingBasis !== 'SYNTHETIC_NARRATION'
    && timingBasis !== 'NO_SPEECH') {
    fail('ASSET_TRANSCRIPTION_TIMING_BASIS_INVALID');
  }
  return frozen({
    timingBasis,
    providerId: identifier(
      evidence.providerId,
      'ASSET_TRANSCRIPTION_PROVIDER_INVALID',
    ),
    modelId: identifier(
      evidence.modelId,
      'ASSET_TRANSCRIPTION_MODEL_INVALID',
    ),
    strategy: identifier(
      evidence.strategy,
      'ASSET_TRANSCRIPTION_STRATEGY_INVALID',
    ),
    providerContractVersion: identifier(
      evidence.providerContractVersion,
      'ASSET_TRANSCRIPTION_PROVIDER_CONTRACT_INVALID',
    ),
  });
}

function normalizeTranscription(value: unknown): CanonicalTranscriptionDataV2 {
  const record = plainObject(value, 'ASSET_TRANSCRIPTION_RESULT_INVALID');
  const expectedKeys = record.speakerCount === undefined
    ? ['words', 'transcript', 'language', 'confidence', 'generatedAt']
    : [
        'words', 'transcript', 'language', 'confidence', 'generatedAt',
        'speakerCount',
      ];
  exactKeys(record, expectedKeys, 'ASSET_TRANSCRIPTION_RESULT_FIELDS_INVALID');
  if (!Array.isArray(record.words)
    || record.words.length > MAX_TRANSCRIPTION_WORDS) {
    fail('ASSET_TRANSCRIPTION_WORDS_INVALID');
  }
  let previousStartMs = -1;
  const words = record.words.map((entry) => {
    const word = normalizeWord(entry, previousStartMs);
    previousStartMs = word.startMs;
    return word;
  });
  const transcript = transcriptText(
    record.transcript,
    MAX_TRANSCRIPT_CHARACTERS,
    'ASSET_TRANSCRIPTION_TEXT_INVALID',
  );
  const output: CanonicalTranscriptionDataV2 = {
    words: Object.freeze(words),
    transcript,
    language: boundedText(
      record.language,
      64,
      'ASSET_TRANSCRIPTION_LANGUAGE_INVALID',
    ),
    confidence: probability(
      record.confidence,
      'ASSET_TRANSCRIPTION_CONFIDENCE_INVALID',
    ),
    generatedAt: isoDate(
      record.generatedAt,
      'ASSET_TRANSCRIPTION_GENERATED_AT_INVALID',
    ),
    ...(record.speakerCount === undefined
      ? {}
      : {
          speakerCount: nonNegativeInteger(
            record.speakerCount,
            'ASSET_TRANSCRIPTION_SPEAKER_COUNT_INVALID',
          ),
        }),
  };
  return frozen(output);
}

function normalizeWord(
  value: unknown,
  previousStartMs: number,
): CanonicalTranscriptionWordV2 {
  const record = plainObject(value, 'ASSET_TRANSCRIPTION_WORD_INVALID');
  const expectedKeys = record.speaker === undefined
    ? ['word', 'startMs', 'endMs', 'confidence']
    : ['word', 'startMs', 'endMs', 'confidence', 'speaker'];
  exactKeys(record, expectedKeys, 'ASSET_TRANSCRIPTION_WORD_FIELDS_INVALID');
  const startMs = nonNegativeInteger(
    record.startMs,
    'ASSET_TRANSCRIPTION_WORD_START_INVALID',
  );
  const endMs = nonNegativeInteger(
    record.endMs,
    'ASSET_TRANSCRIPTION_WORD_END_INVALID',
  );
  if (startMs < previousStartMs || endMs <= startMs) {
    fail('ASSET_TRANSCRIPTION_WORD_TIMING_INVALID');
  }
  return frozen({
    word: boundedText(record.word, 512, 'ASSET_TRANSCRIPTION_WORD_TEXT_INVALID'),
    startMs,
    endMs,
    confidence: probability(
      record.confidence,
      'ASSET_TRANSCRIPTION_WORD_CONFIDENCE_INVALID',
    ),
    ...(record.speaker === undefined
      ? {}
      : {
          speaker: nonNegativeInteger(
            record.speaker,
            'ASSET_TRANSCRIPTION_WORD_SPEAKER_INVALID',
          ),
        }),
  });
}

function assertTimingCompatibility(
  binding: AssetTranscriptionSourceBindingV2,
  transcription: CanonicalTranscriptionDataV2,
  timing: AssetTranscriptionTimingEvidenceV2,
): void {
  if (timing.timingBasis === 'NO_SPEECH') {
    if (transcription.words.length !== 0 || transcription.transcript.trim()) {
      fail('ASSET_TRANSCRIPTION_NO_SPEECH_RESULT_INVALID');
    }
    return;
  }
  if (transcription.words.length === 0) {
    fail('ASSET_TRANSCRIPTION_TIMED_RESULT_EMPTY');
  }
  if (binding.precision === 'MEASURED_WORD_REQUIRED'
    && timing.timingBasis !== 'MEASURED_WORD') {
    fail('ASSET_TRANSCRIPTION_PRECISION_UNSATISFIED');
  }
}

function assertStoredRecord(
  value: unknown,
  expectedBinding: AssetTranscriptionSourceBindingV2,
): AssetTranscriptionSourceCacheRecordV2 {
  const record = plainObject(
    value,
    'ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_INVALID',
  );
  exactKeys(record, [
    '_id', 'schemaVersion', 'kind', 'sourceBindingV2', 'transcription',
    'timingEvidence', 'transcriptionSha256', 'recordSha256',
  ], 'ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_FIELDS_INVALID');
  if (record.schemaVersion !== 2
    || record.kind !== ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_KIND_V2) {
    fail('ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_CONTRACT_INVALID');
  }
  const sourceBindingV2 = assertAssetTranscriptionSourceBindingV2(
    record.sourceBindingV2,
  );
  if (sourceBindingV2.bindingSha256 !== expectedBinding.bindingSha256
    || sourceBindingV2.userId !== expectedBinding.userId
    || sourceBindingV2.assetId !== expectedBinding.assetId) {
    fail('ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_SCOPE_MISMATCH');
  }
  const transcription = normalizeTranscription(record.transcription);
  const timingEvidence = normalizeTimingEvidence(record.timingEvidence);
  assertTimingCompatibility(sourceBindingV2, transcription, timingEvidence);
  const transcriptionSha256 = sha256(
    record.transcriptionSha256,
    'ASSET_TRANSCRIPTION_SOURCE_CACHE_TRANSCRIPTION_HASH_INVALID',
  );
  if (transcriptionSha256 !== hashEditronCanonicalJsonV1({
    transcription,
    timingEvidence,
  })) {
    fail('ASSET_TRANSCRIPTION_SOURCE_CACHE_TRANSCRIPTION_HASH_MISMATCH');
  }
  const _id = identifier(
    record._id,
    'ASSET_TRANSCRIPTION_SOURCE_CACHE_ID_INVALID',
  );
  if (_id !== recordId(sourceBindingV2)) {
    fail('ASSET_TRANSCRIPTION_SOURCE_CACHE_ID_MISMATCH');
  }
  const material: AssetTranscriptionSourceCacheRecordMaterialV2 = {
    _id,
    schemaVersion: 2,
    kind: ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_KIND_V2,
    sourceBindingV2,
    transcription,
    timingEvidence,
    transcriptionSha256,
  };
  const recordSha256 = sha256(
    record.recordSha256,
    'ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_HASH_INVALID',
  );
  if (recordSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('ASSET_TRANSCRIPTION_SOURCE_CACHE_RECORD_HASH_MISMATCH');
  }
  return frozen({ ...material, recordSha256 });
}

function hydrateEvidence(
  record: AssetTranscriptionSourceCacheRecordV2,
): AssetTranscriptionEvidenceV2 {
  return Object.freeze({
    sourceBindingV2: record.sourceBindingV2,
    transcription: hydrateTranscription(record.transcription),
    timingEvidence: record.timingEvidence,
    transcriptionSha256: record.transcriptionSha256,
    recordSha256: record.recordSha256,
  });
}

function hydrateTranscription(
  value: CanonicalTranscriptionDataV2,
): TranscriptionData {
  return Object.freeze({
    words: Object.freeze(
      value.words.map((word) => Object.freeze({ ...word })),
    ) as unknown as TranscriptionWord[],
    transcript: value.transcript,
    language: value.language,
    confidence: value.confidence,
    generatedAt: new Date(value.generatedAt),
    ...(value.speakerCount === undefined
      ? {}
      : { speakerCount: value.speakerCount }),
  });
}

function recordId(binding: AssetTranscriptionSourceBindingV2): string {
  return `asset_transcription_v2_${binding.bindingSha256}`;
}

async function collection() {
  const { getDatabase } = await import('../db/mongodb');
  const db = await getDatabase();
  return db.collection<AssetTranscriptionSourceCacheMongoDocumentV2>(
    ASSET_TRANSCRIPTION_SOURCE_CACHE_COLLECTION_V2,
  );
}

function language(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return boundedText(value, 64, 'ASSET_TRANSCRIPTION_REQUEST_LANGUAGE_INVALID');
}

function transcriptText(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string' || value.length > maximum) fail(code);
  return value.normalize('NFC');
}

function boundedText(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > maximum) {
    fail(code);
  }
  return value.normalize('NFC');
}

function probability(value: unknown, code: string): number {
  if (typeof value !== 'number'
    || !Number.isFinite(value)
    || value < 0
    || value > 1) {
    fail(code);
  }
  return Object.is(value, -0) ? 0 : value;
}

function nonNegativeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(code);
  return value as number;
}

function isoDate(value: unknown, code: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) fail(code);
  return date.toISOString();
}

function identifier(value: unknown, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) fail(code);
  return normalized;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
  return value;
}

function plainObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length
    || actual.some((key, index) => key !== required[index])) {
    fail(code);
  }
}

function frozen<T>(value: T): T {
  return deepFreezeEditronJsonV1(value) as T;
}

function fail(code: string): never {
  throw new Error(code);
}
