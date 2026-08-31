import { getDatabase } from '@/lib/editron/db/mongodb';
import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const ASSET_ANALYSIS_SOURCE_CACHE_COLLECTION_V2 = 'asset_analyses' as const;
export const ASSET_ANALYSIS_SOURCE_BINDING_KIND_V2 =
  'EDITRON_ASSET_ANALYSIS_SOURCE_BINDING_V2' as const;
export const ASSET_ANALYSIS_SOURCE_CACHE_RECORD_KIND_V2 =
  'EDITRON_ASSET_ANALYSIS_SOURCE_CACHE_RECORD_V2' as const;
export const FIVE_TRACK_ANALYSIS_CONTRACT_V2 =
  'EDITRON_FIVE_TRACK_ANALYSIS_V2' as const;
export const FIVE_TRACK_ANALYSIS_VERSION_V2 = 2 as const;

export type AssetAnalysisSourceBindingV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof ASSET_ANALYSIS_SOURCE_BINDING_KIND_V2;
  userId: string;
  assetId: string;
  sourceRole: 'PROXY' | 'MASTER';
  sourceVersionSha256: string;
  storageVersionSha256: string;
  analysisInputSha256: string;
  analyzerContract: typeof FIVE_TRACK_ANALYSIS_CONTRACT_V2;
  bindingSha256: string;
}>;

type AssetAnalysisSourceBindingMaterialV2 = Readonly<
Omit<AssetAnalysisSourceBindingV2, 'bindingSha256'>
>;

type CanonicalCompletedAnalysisV2 = Readonly<Record<string, unknown> & {
  assetId: string;
  userId: string;
  status: 'complete';
  analyzedAt: string;
  analysisVersion: typeof FIVE_TRACK_ANALYSIS_VERSION_V2;
}>;

export type AssetAnalysisSourceCacheRecordV2 = Readonly<{
  _id: string;
  schemaVersion: 2;
  kind: typeof ASSET_ANALYSIS_SOURCE_CACHE_RECORD_KIND_V2;
  sourceBindingV2: AssetAnalysisSourceBindingV2;
  analysis: CanonicalCompletedAnalysisV2;
  analysisSha256: string;
  recordSha256: string;
}>;

type AssetAnalysisSourceCacheRecordMaterialV2 = Readonly<
Omit<AssetAnalysisSourceCacheRecordV2, 'recordSha256'>
>;

export function createAssetAnalysisSourceBindingV2(input: Readonly<{
  userId: string;
  assetId: string;
  sourceRole: 'PROXY' | 'MASTER';
  sourceVersionSha256: string;
  storageVersionSha256: string;
  analysisInputSha256: string;
}>): AssetAnalysisSourceBindingV2 {
  const material = normalizeBindingMaterial({
    schemaVersion: 2,
    kind: ASSET_ANALYSIS_SOURCE_BINDING_KIND_V2,
    userId: input.userId,
    assetId: input.assetId,
    sourceRole: input.sourceRole,
    sourceVersionSha256: input.sourceVersionSha256,
    storageVersionSha256: input.storageVersionSha256,
    analysisInputSha256: input.analysisInputSha256,
    analyzerContract: FIVE_TRACK_ANALYSIS_CONTRACT_V2,
  });
  return assertAssetAnalysisSourceBindingV2({
    ...material,
    bindingSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertAssetAnalysisSourceBindingV2(
  value: unknown,
): AssetAnalysisSourceBindingV2 {
  const record = plainObject(value, 'ASSET_ANALYSIS_SOURCE_BINDING_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'userId', 'assetId', 'sourceRole',
    'sourceVersionSha256', 'storageVersionSha256', 'analysisInputSha256',
    'analyzerContract', 'bindingSha256',
  ], 'ASSET_ANALYSIS_SOURCE_BINDING_FIELDS_INVALID');
  const material = normalizeBindingMaterial(record);
  const bindingSha256 = sha256(
    record.bindingSha256,
    'ASSET_ANALYSIS_SOURCE_BINDING_HASH_INVALID',
  );
  if (bindingSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('ASSET_ANALYSIS_SOURCE_BINDING_HASH_MISMATCH');
  }
  return frozen({ ...material, bindingSha256 });
}

export async function getSourceBoundAnalysisV2<T extends object>(
  bindingInput: AssetAnalysisSourceBindingV2,
): Promise<T | null> {
  const binding = assertAssetAnalysisSourceBindingV2(bindingInput);
  const stored = await (await collection()).findOne(
    {
      _id: recordId(binding),
      'sourceBindingV2.userId': binding.userId,
      'sourceBindingV2.bindingSha256': binding.bindingSha256,
    },
    { readPreference: 'primary' },
  );
  if (!stored) return null;
  return hydrateAnalysis<T>(assertStoredRecord(stored, binding).analysis);
}

export async function saveSourceBoundAnalysisV2<T extends object>(
  bindingInput: AssetAnalysisSourceBindingV2,
  analysisInput: T,
): Promise<T> {
  const binding = assertAssetAnalysisSourceBindingV2(bindingInput);
  const analysis = normalizeCompletedAnalysis(analysisInput, binding);
  const analysisSha256 = hashEditronCanonicalJsonV1(analysis);
  const material: AssetAnalysisSourceCacheRecordMaterialV2 = {
    _id: recordId(binding),
    schemaVersion: 2,
    kind: ASSET_ANALYSIS_SOURCE_CACHE_RECORD_KIND_V2,
    sourceBindingV2: binding,
    analysis,
    analysisSha256,
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
  if (!stored) fail('ASSET_ANALYSIS_SOURCE_CACHE_WRITE_UNACKNOWLEDGED');
  return hydrateAnalysis<T>(assertStoredRecord(stored!, binding).analysis);
}

function normalizeBindingMaterial(
  value: Readonly<Record<string, unknown>>,
): AssetAnalysisSourceBindingMaterialV2 {
  if (value.schemaVersion !== 2
    || value.kind !== ASSET_ANALYSIS_SOURCE_BINDING_KIND_V2
    || value.analyzerContract !== FIVE_TRACK_ANALYSIS_CONTRACT_V2) {
    fail('ASSET_ANALYSIS_SOURCE_BINDING_CONTRACT_INVALID');
  }
  const sourceRole = value.sourceRole;
  if (sourceRole !== 'PROXY' && sourceRole !== 'MASTER') {
    fail('ASSET_ANALYSIS_SOURCE_BINDING_ROLE_INVALID');
  }
  return frozen({
    schemaVersion: 2,
    kind: ASSET_ANALYSIS_SOURCE_BINDING_KIND_V2,
    userId: identifier(value.userId, 'ASSET_ANALYSIS_SOURCE_BINDING_USER_INVALID'),
    assetId: identifier(value.assetId, 'ASSET_ANALYSIS_SOURCE_BINDING_ASSET_INVALID'),
    sourceRole,
    sourceVersionSha256: sha256(
      value.sourceVersionSha256,
      'ASSET_ANALYSIS_SOURCE_BINDING_SOURCE_HASH_INVALID',
    ),
    storageVersionSha256: sha256(
      value.storageVersionSha256,
      'ASSET_ANALYSIS_SOURCE_BINDING_STORAGE_HASH_INVALID',
    ),
    analysisInputSha256: sha256(
      value.analysisInputSha256,
      'ASSET_ANALYSIS_SOURCE_BINDING_INPUT_HASH_INVALID',
    ),
    analyzerContract: FIVE_TRACK_ANALYSIS_CONTRACT_V2,
  });
}

export function hashAssetAnalysisInputV2(value: unknown): string {
  return hashEditronCanonicalJsonV1(
    canonicalObject(value, 'ASSET_ANALYSIS_SOURCE_CACHE_INPUT_INVALID'),
  );
}

function assertStoredRecord(
  value: unknown,
  expectedBinding: AssetAnalysisSourceBindingV2,
): AssetAnalysisSourceCacheRecordV2 {
  const record = plainObject(value, 'ASSET_ANALYSIS_SOURCE_CACHE_RECORD_INVALID');
  exactKeys(record, [
    '_id', 'schemaVersion', 'kind', 'sourceBindingV2', 'analysis',
    'analysisSha256', 'recordSha256',
  ], 'ASSET_ANALYSIS_SOURCE_CACHE_RECORD_FIELDS_INVALID');
  if (record.schemaVersion !== 2
    || record.kind !== ASSET_ANALYSIS_SOURCE_CACHE_RECORD_KIND_V2) {
    fail('ASSET_ANALYSIS_SOURCE_CACHE_RECORD_CONTRACT_INVALID');
  }
  const sourceBindingV2 = assertAssetAnalysisSourceBindingV2(
    record.sourceBindingV2,
  );
  if (sourceBindingV2.bindingSha256 !== expectedBinding.bindingSha256
    || sourceBindingV2.userId !== expectedBinding.userId
    || sourceBindingV2.assetId !== expectedBinding.assetId) {
    fail('ASSET_ANALYSIS_SOURCE_CACHE_RECORD_SCOPE_MISMATCH');
  }
  const analysis = normalizeCompletedAnalysis(record.analysis, sourceBindingV2);
  const analysisSha256 = sha256(
    record.analysisSha256,
    'ASSET_ANALYSIS_SOURCE_CACHE_ANALYSIS_HASH_INVALID',
  );
  if (analysisSha256 !== hashEditronCanonicalJsonV1(analysis)) {
    fail('ASSET_ANALYSIS_SOURCE_CACHE_ANALYSIS_HASH_MISMATCH');
  }
  const _id = identifier(record._id, 'ASSET_ANALYSIS_SOURCE_CACHE_ID_INVALID');
  if (_id !== recordId(sourceBindingV2)) {
    fail('ASSET_ANALYSIS_SOURCE_CACHE_ID_MISMATCH');
  }
  const material: AssetAnalysisSourceCacheRecordMaterialV2 = {
    _id,
    schemaVersion: 2,
    kind: ASSET_ANALYSIS_SOURCE_CACHE_RECORD_KIND_V2,
    sourceBindingV2,
    analysis,
    analysisSha256,
  };
  const recordSha256 = sha256(
    record.recordSha256,
    'ASSET_ANALYSIS_SOURCE_CACHE_RECORD_HASH_INVALID',
  );
  if (recordSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('ASSET_ANALYSIS_SOURCE_CACHE_RECORD_HASH_MISMATCH');
  }
  return frozen({ ...material, recordSha256 });
}

function normalizeCompletedAnalysis(
  value: unknown,
  binding: AssetAnalysisSourceBindingV2,
): CanonicalCompletedAnalysisV2 {
  const analysis = canonicalObject(value, 'ASSET_ANALYSIS_SOURCE_CACHE_ANALYSIS_INVALID');
  if (analysis.assetId !== binding.assetId
    || analysis.userId !== binding.userId) {
    fail('ASSET_ANALYSIS_SOURCE_CACHE_ANALYSIS_SCOPE_MISMATCH');
  }
  if (analysis.status !== 'complete'
    || analysis.analysisVersion !== FIVE_TRACK_ANALYSIS_VERSION_V2) {
    fail('ASSET_ANALYSIS_SOURCE_CACHE_ANALYSIS_CONTRACT_INVALID');
  }
  const analyzedAt = isoString(
    analysis.analyzedAt,
    'ASSET_ANALYSIS_SOURCE_CACHE_ANALYZED_AT_INVALID',
  );
  return frozen({
    ...analysis,
    assetId: binding.assetId,
    userId: binding.userId,
    status: 'complete',
    analyzedAt,
    analysisVersion: FIVE_TRACK_ANALYSIS_VERSION_V2,
  });
}

function canonicalObject(value: unknown, code: string): Record<string, unknown> {
  const normalized = normalizeJsonValue(value, '$', false);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    fail(code);
  }
  return JSON.parse(canonicalizeEditronJsonV1(normalized)) as Record<string, unknown>;
}

function normalizeJsonValue(
  value: unknown,
  path: string,
  inArray: boolean,
): unknown {
  if (value === undefined) {
    if (inArray) fail(`ASSET_ANALYSIS_SOURCE_CACHE_UNDEFINED_ARRAY_VALUE:${path}`);
    return undefined;
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      fail(`ASSET_ANALYSIS_SOURCE_CACHE_DATE_INVALID:${path}`);
    }
    return value.toISOString();
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail(`ASSET_ANALYSIS_SOURCE_CACHE_NUMBER_INVALID:${path}`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeJsonValue(
      entry,
      `${path}[${index}]`,
      true,
    ));
  }
  const record = plainObject(
    value,
    `ASSET_ANALYSIS_SOURCE_CACHE_JSON_OBJECT_INVALID:${path}`,
  );
  if (Object.getOwnPropertySymbols(record).length > 0) {
    fail(`ASSET_ANALYSIS_SOURCE_CACHE_SYMBOL_KEY_INVALID:${path}`);
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    const next = normalizeJsonValue(entry, `${path}.${key}`, false);
    if (next !== undefined) normalized[key] = next;
  }
  return normalized;
}

function hydrateAnalysis<T extends object>(
  analysis: CanonicalCompletedAnalysisV2,
): T {
  const clone = JSON.parse(canonicalizeEditronJsonV1(analysis)) as Record<string, unknown>;
  return {
    ...clone,
    analyzedAt: new Date(analysis.analyzedAt),
  } as T;
}

function recordId(binding: AssetAnalysisSourceBindingV2): string {
  return `asset_analysis_v2_${binding.bindingSha256}`;
}

async function collection() {
  const db = await getDatabase();
  return db.collection<Record<string, unknown>>(
    ASSET_ANALYSIS_SOURCE_CACHE_COLLECTION_V2,
  );
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

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 512) {
    fail(code);
  }
  return value.normalize('NFC');
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code);
  return value;
}

function isoString(value: unknown, code: string): string {
  if (typeof value !== 'string') fail(code);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) fail(code);
  return value;
}

function frozen<T>(value: T): T {
  return deepFreezeEditronJsonV1(value) as T;
}

function fail(code: string): never {
  throw new Error(code);
}
