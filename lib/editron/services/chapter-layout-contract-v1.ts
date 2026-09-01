import { z } from 'zod';

import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  parseExactRationalRateV1,
  rationalRateComponentsSchemaV1,
  type ExactRationalRateV1,
} from '../contracts/canonical-media-time-v1';

/**
 * Provider-free identity for the frame layout handed to chapter execution.
 * Provider attempts, output objects and concat inputs are deliberately owned by
 * later contracts; changing any of those must not change this identity.
 */
export const EDITRON_CHAPTER_LAYOUT_SCHEMA_VERSION_V1 = 1 as const;
export const EDITRON_CHAPTER_LAYOUT_SCOPE_V1 = 'EDITRON_CHAPTER_LAYOUT' as const;
export const EDITRON_CHAPTER_LAYOUT_MAX_CHAPTER_COUNT_V1 = 100_000;

// Aliases keep the scope/version vocabulary discoverable beside the type name.
export const CHAPTER_LAYOUT_MANIFEST_SCHEMA_VERSION_V1 =
  EDITRON_CHAPTER_LAYOUT_SCHEMA_VERSION_V1;
export const CHAPTER_LAYOUT_MANIFEST_SCOPE_V1 = EDITRON_CHAPTER_LAYOUT_SCOPE_V1;

const SHA256 = /^[a-f0-9]{64}$/;
const PARENT_ADMISSION_ID = /^chr_[A-Za-z0-9_-]{12}$/;
const IDENTIFIER = z.string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value, 'Identifier must not have surrounding whitespace.')
  .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), 'Identifier contains a control character.');
const NON_NEGATIVE_SAFE_INTEGER = z.number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger, 'Value must be a safe integer.');
const POSITIVE_SAFE_INTEGER = z.number()
  .int()
  .positive()
  .refine(Number.isSafeInteger, 'Value must be a positive safe integer.');

/** Exact reduced rational rate components from the canonical media-time owner. */
export const ChapterLayoutProjectTimebaseSchemaV1 = z.object({
  timebaseId: IDENTIFIER,
  version: IDENTIFIER,
  rate: rationalRateComponentsSchemaV1,
}).strict();

export type ChapterLayoutProjectTimebaseV1 = Readonly<{
  timebaseId: string;
  version: string;
  rate: ExactRationalRateV1;
}>;

/**
 * The policy records the complete frame-domain knobs used by the layout
 * derivation owner. Its identity names the strategy; this contract does not
 * derive or otherwise shadow that strategy.
 */
export const ChapterLayoutPolicySchemaV1 = z.object({
  policyId: IDENTIFIER,
  policyVersion: IDENTIFIER,
  splitThresholdFrames: POSITIVE_SAFE_INTEGER,
  targetFrames: POSITIVE_SAFE_INTEGER,
  minimumFrames: POSITIVE_SAFE_INTEGER,
}).strict();

export type ChapterLayoutPolicyV1 = Readonly<{
  policyId: string;
  policyVersion: string;
  splitThresholdFrames: number;
  targetFrames: number;
  minimumFrames: number;
}>;

export const ChapterLayoutChapterSchemaV1 = z.object({
  index: NON_NEGATIVE_SAFE_INTEGER,
  startFrame: NON_NEGATIVE_SAFE_INTEGER,
  endFrame: POSITIVE_SAFE_INTEGER,
  durationFrames: POSITIVE_SAFE_INTEGER,
}).strict();

export type ChapterLayoutChapterV1 = Readonly<{
  index: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
}>;

const ChapterLayoutManifestMaterialSchemaV1 = z.object({
  schemaVersion: z.literal(EDITRON_CHAPTER_LAYOUT_SCHEMA_VERSION_V1),
  scope: z.literal(EDITRON_CHAPTER_LAYOUT_SCOPE_V1),
  parentAdmissionId: z.string().regex(PARENT_ADMISSION_ID),
  bindingHash: z.string().regex(SHA256),
  totalFrames: POSITIVE_SAFE_INTEGER,
  projectTimebase: ChapterLayoutProjectTimebaseSchemaV1,
  policy: ChapterLayoutPolicySchemaV1,
  chapterCount: POSITIVE_SAFE_INTEGER.max(EDITRON_CHAPTER_LAYOUT_MAX_CHAPTER_COUNT_V1),
  chapters: z.array(ChapterLayoutChapterSchemaV1)
    .min(1)
    .max(EDITRON_CHAPTER_LAYOUT_MAX_CHAPTER_COUNT_V1),
}).strict();

export const ChapterLayoutManifestSchemaV1 = ChapterLayoutManifestMaterialSchemaV1.extend({
  layoutManifestHash: z.string().regex(SHA256),
}).strict();

export type ChapterLayoutManifestV1 = Readonly<{
  schemaVersion: typeof EDITRON_CHAPTER_LAYOUT_SCHEMA_VERSION_V1;
  scope: typeof EDITRON_CHAPTER_LAYOUT_SCOPE_V1;
  parentAdmissionId: string;
  bindingHash: string;
  totalFrames: number;
  projectTimebase: ChapterLayoutProjectTimebaseV1;
  policy: ChapterLayoutPolicyV1;
  chapterCount: number;
  chapters: readonly ChapterLayoutChapterV1[];
  layoutManifestHash: string;
}>;

export type ProjectChapterLayoutManifestV1 = ChapterLayoutManifestV1;

export type ChapterLayoutManifestInputV1 = Readonly<{
  parentAdmissionId: string;
  bindingHash: string;
  totalFrames: number;
  projectTimebase: ChapterLayoutProjectTimebaseV1;
  policy: ChapterLayoutPolicyV1;
  chapters: readonly ChapterLayoutChapterV1[];
  chapterCount?: number;
  layoutManifestHash?: string;
}>;

export class ChapterLayoutManifestValidationErrorV1 extends Error {
  constructor(readonly code: string) {
    super(`Editron chapter layout validation failed: ${code}`);
    this.name = 'ChapterLayoutManifestValidationErrorV1';
  }
}

const CREATE_REQUIRED_KEYS = [
  'bindingHash', 'chapters', 'parentAdmissionId', 'policy',
  'projectTimebase', 'totalFrames',
] as const;
const CREATE_OPTIONAL_KEYS = ['chapterCount', 'layoutManifestHash'] as const;
const MANIFEST_KEYS = [
  'bindingHash', 'chapterCount', 'chapters', 'layoutManifestHash',
  'parentAdmissionId', 'policy', 'projectTimebase', 'scope', 'schemaVersion',
  'totalFrames',
] as const;

/** Create one immutable, provider-free chapter layout manifest. */
export function createChapterLayoutManifestV1(
  input: ChapterLayoutManifestInputV1,
): ChapterLayoutManifestV1 {
  const source = cloneOrFail(input, 'EDITRON_CHAPTER_LAYOUT_INPUT_INVALID');
  const record = object(source, 'EDITRON_CHAPTER_LAYOUT_INPUT_INVALID');
  exactKeys(
    record,
    CREATE_REQUIRED_KEYS,
    'EDITRON_CHAPTER_LAYOUT_INPUT_FIELDS_INVALID',
    CREATE_OPTIONAL_KEYS,
  );
  const chapters = record.chapters;
  if (!Array.isArray(chapters)) fail('EDITRON_CHAPTER_LAYOUT_CHAPTERS_INVALID');
  const material = validateMaterial({
    schemaVersion: EDITRON_CHAPTER_LAYOUT_SCHEMA_VERSION_V1,
    scope: EDITRON_CHAPTER_LAYOUT_SCOPE_V1,
    parentAdmissionId: record.parentAdmissionId,
    bindingHash: record.bindingHash,
    totalFrames: record.totalFrames,
    projectTimebase: record.projectTimebase,
    policy: record.policy,
    chapterCount: record.chapterCount === undefined ? chapters.length : record.chapterCount,
    chapters,
  });
  const layoutManifestHash = hashEditronCanonicalJsonV1(material);
  if (record.layoutManifestHash !== undefined) {
    assertSha256(record.layoutManifestHash, 'EDITRON_CHAPTER_LAYOUT_HASH_INVALID');
    if (record.layoutManifestHash !== layoutManifestHash) {
      fail('EDITRON_CHAPTER_LAYOUT_HASH_MISMATCH');
    }
  }
  return immutable({ ...material, layoutManifestHash });
}

/** Parse, verify and return a detached immutable manifest. */
export function parseChapterLayoutManifestV1(
  input: unknown,
): ChapterLayoutManifestV1 {
  const source = cloneOrFail(input, 'EDITRON_CHAPTER_LAYOUT_MANIFEST_INVALID');
  const record = object(source, 'EDITRON_CHAPTER_LAYOUT_MANIFEST_INVALID');
  exactKeys(record, MANIFEST_KEYS, 'EDITRON_CHAPTER_LAYOUT_MANIFEST_FIELDS_INVALID');
  const parsed = ChapterLayoutManifestSchemaV1.safeParse(record);
  if (!parsed.success) fail('EDITRON_CHAPTER_LAYOUT_MANIFEST_INVALID');
  const { layoutManifestHash, ...unsigned } = parsed.data;
  const material = validateMaterial(unsigned);
  const expectedHash = hashEditronCanonicalJsonV1(material);
  if (layoutManifestHash !== expectedHash) {
    fail('EDITRON_CHAPTER_LAYOUT_HASH_MISMATCH');
  }
  return immutable({ ...material, layoutManifestHash });
}

/** Assertion alias retained for defensive readers and mutation owners. */
export function assertChapterLayoutManifestV1(
  input: unknown,
): ChapterLayoutManifestV1 {
  return parseChapterLayoutManifestV1(input);
}

// Project-prefixed aliases mirror the adjacent concat contract vocabulary.
export const createProjectChapterLayoutManifestV1 = createChapterLayoutManifestV1;
export const parseProjectChapterLayoutManifestV1 = parseChapterLayoutManifestV1;
export const assertProjectChapterLayoutManifestV1 = assertChapterLayoutManifestV1;

function validateMaterial(value: unknown): Omit<ChapterLayoutManifestV1, 'layoutManifestHash'> {
  const parsed = ChapterLayoutManifestMaterialSchemaV1.safeParse(value);
  if (!parsed.success) fail('EDITRON_CHAPTER_LAYOUT_MANIFEST_INVALID');
  try {
    parseExactRationalRateV1(parsed.data.projectTimebase.rate);
  } catch {
    fail('EDITRON_CHAPTER_LAYOUT_TIMEBASE_RATE_INVALID');
  }
  validateChapterCoverage(parsed.data.totalFrames, parsed.data.chapterCount, parsed.data.chapters);
  return parsed.data as Omit<ChapterLayoutManifestV1, 'layoutManifestHash'>;
}

function validateChapterCoverage(
  totalFrames: number,
  chapterCount: number,
  chapters: readonly ChapterLayoutChapterV1[],
): void {
  if (chapters.length !== chapterCount) fail('EDITRON_CHAPTER_LAYOUT_CHAPTER_COUNT_MISMATCH');
  let expectedStartFrame = 0;
  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index]!;
    if (chapter.index !== index) fail('EDITRON_CHAPTER_LAYOUT_CHAPTER_INDEX_INVALID');
    if (chapter.startFrame !== expectedStartFrame) {
      fail('EDITRON_CHAPTER_LAYOUT_CHAPTER_COVERAGE_INVALID');
    }
    if (chapter.endFrame <= chapter.startFrame || chapter.endFrame > totalFrames) {
      fail('EDITRON_CHAPTER_LAYOUT_CHAPTER_RANGE_INVALID');
    }
    if (chapter.durationFrames !== chapter.endFrame - chapter.startFrame) {
      fail('EDITRON_CHAPTER_LAYOUT_CHAPTER_DURATION_INVALID');
    }
    expectedStartFrame = chapter.endFrame;
  }
  if (expectedStartFrame !== totalFrames) {
    fail('EDITRON_CHAPTER_LAYOUT_CHAPTER_COVERAGE_INVALID');
  }
}

function cloneOrFail(value: unknown, code: string): unknown {
  try {
    return cloneCanonicalEditronJsonV1(value);
  } catch {
    fail(code);
  }
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
  optional: readonly string[] = [],
): void {
  const actual = Object.keys(value);
  const allowed = new Set([...expected, ...optional]);
  if (actual.some((key) => !allowed.has(key))
    || expected.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(code);
}

function assertSha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
  return value;
}

function immutable<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(code: string): never {
  throw new ChapterLayoutManifestValidationErrorV1(code);
}
