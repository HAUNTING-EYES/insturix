import type { Collection } from 'mongodb';

import { ProjectArtifactProjectRevisionSchema, sameProjectArtifactRevisionV1 } from './project-artifact-invalidation-v1';
import { parseChapterLayoutManifestV1 } from './chapter-layout-contract-v1';
import {
  assertChapterChildDispatchV1,
  type ChapterChildProjectRevisionReaderV1,
} from './chapter-render-dispatch-v1';
import { createChapterLayoutManifestForRenderV1 } from './chapter-renderer';
import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import { assertProjectRenderSnapshotBindingV1 } from './project-render-snapshot-binding-v1';

export const CHAPTER_RENDER_LIFECYCLE_MIGRATION_VERSION_V1 = 1 as const;

export type ChapterRenderLifecycleMigrationDispositionV1 =
  | 'MIGRATED_ACTIVE'
  | 'MIGRATED_CLEANUP_PENDING'
  | 'BLOCKED_UNBOUND_LEGACY'
  | 'BLOCKED_CONTRACT_INVALID'
  | 'BLOCKED_PROJECT_REVISION_STALE';

export type ChapterRenderLifecycleMigrationAssessmentV1 = {
  schemaVersion: 1;
  disposition: ChapterRenderLifecycleMigrationDispositionV1;
  assessedAt: Date;
  assessmentHash: string;
};

export type ChapterRenderLifecycleMigrationDocumentV1 = {
  _id: string;
  projectId?: unknown;
  userId?: unknown;
  ownerId?: unknown;
  region?: unknown;
  status?: unknown;
  totalFrames?: unknown;
  fps?: unknown;
  chapters?: unknown;
  projectRenderSnapshotBinding?: unknown;
  chapterLayoutManifest?: unknown;
  cleanupMaterialization?: unknown;
  artifactLifecycleVersion?: unknown;
  artifactState?: unknown;
  retentionState?: unknown;
  artifactInvalidatedAt?: unknown;
  lifecycleMigration?: unknown;
};

export type ChapterRenderLifecycleMigrationResultV1 =
  | { ok: true; status: 'MIGRATED' | 'ALREADY_MIGRATED' | 'ALREADY_ASSESSED'; disposition: ChapterRenderLifecycleMigrationDispositionV1 }
  | { ok: true; status: 'BLOCKED'; disposition: ChapterRenderLifecycleMigrationDispositionV1 }
  | { ok: false; status: 'NOT_FOUND' };

const JOB_ID = /^chr_[A-Za-z0-9_-]{12}$/;
const CHILD_CLEANUP_ID = /^project-render-source-cleanup_[a-f0-9]{64}$/;
const CONCAT_CLEANUP_ID = /^project-chapter-concat-cleanup_[a-f0-9]{64}$/;
const CLEANUP_BOUNDARIES = new Set([
  'CURRENT_SUCCESS',
  'STALE_FINALIZATION',
  'STALE_PROVIDER_OUTPUT',
  'TERMINAL_FINALIZATION_FAILURE',
]);

function fail(code: string): never {
  throw new Error(`CHAPTER_RENDER_LIFECYCLE_MIGRATION_${code}`);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function assessment(
  jobId: string,
  disposition: ChapterRenderLifecycleMigrationDispositionV1,
  assessedAt: Date,
): ChapterRenderLifecycleMigrationAssessmentV1 {
  const identity = {
    schemaVersion: 1,
    jobId,
    disposition,
    assessedAt: assessedAt.toISOString(),
  };
  return {
    schemaVersion: 1,
    disposition,
    assessedAt,
    assessmentHash: hashEditronCanonicalJsonV1(identity),
  };
}

function parseAssessment(
  value: unknown,
  jobId: string,
): ChapterRenderLifecycleMigrationAssessmentV1 | null {
  const candidate = record(value);
  if (!candidate) return null;
  const disposition = candidate.disposition;
  if (
    candidate.schemaVersion !== 1
    || typeof disposition !== 'string'
    || ![
      'MIGRATED_ACTIVE',
      'MIGRATED_CLEANUP_PENDING',
      'BLOCKED_UNBOUND_LEGACY',
      'BLOCKED_CONTRACT_INVALID',
      'BLOCKED_PROJECT_REVISION_STALE',
    ].includes(disposition)
    || !validDate(candidate.assessedAt)
    || typeof candidate.assessmentHash !== 'string'
  ) fail('ASSESSMENT_INVALID');
  const parsed = assessment(
    jobId,
    disposition as ChapterRenderLifecycleMigrationDispositionV1,
    candidate.assessedAt,
  );
  if (candidate.assessmentHash !== parsed.assessmentHash) fail('ASSESSMENT_HASH_MISMATCH');
  return parsed;
}

function cleanupMaterializedAt(value: unknown): Date | null {
  if (value === undefined) return null;
  const cleanup = record(value);
  if (
    cleanup?.schemaVersion !== 1
    || typeof cleanup.boundary !== 'string'
    || !CLEANUP_BOUNDARIES.has(cleanup.boundary)
    || !validDate(cleanup.materializedAt)
    || !Array.isArray(cleanup.childOutboxIds)
    || cleanup.childOutboxIds.length === 0
    || cleanup.childOutboxIds.length > 64
    || cleanup.childOutboxIds.some((id) => typeof id !== 'string' || !CHILD_CLEANUP_ID.test(id))
    || new Set(cleanup.childOutboxIds).size !== cleanup.childOutboxIds.length
    || cleanup.concatOutboxId !== undefined
      && (typeof cleanup.concatOutboxId !== 'string' || !CONCAT_CLEANUP_ID.test(cleanup.concatOutboxId))
  ) fail('CLEANUP_MATERIALIZATION_INVALID');
  return cleanup.materializedAt;
}

function validateStrictRow(row: ChapterRenderLifecycleMigrationDocumentV1) {
  const bindingValue = row.projectRenderSnapshotBinding;
  assertProjectRenderSnapshotBindingV1(bindingValue);
  const binding = bindingValue;
  const manifest = parseChapterLayoutManifestV1(row.chapterLayoutManifest);
  if (
    binding.artifactId !== row._id
    || binding.projectId !== row.projectId
    || binding.ownerId !== row.ownerId
    || typeof row.userId !== 'string'
    || row.userId.length === 0
    || typeof row.region !== 'string'
    || row.region.length === 0
    || !Number.isSafeInteger(row.totalFrames)
    || typeof row.fps !== 'number'
    || !Number.isFinite(row.fps)
    || binding.durationInFrames !== row.totalFrames
    || binding.fps !== row.fps
    || manifest.parentAdmissionId !== row._id
    || manifest.bindingHash !== binding.bindingHash
    || manifest.totalFrames !== row.totalFrames
  ) fail('STRICT_CONTRACT_SCOPE_MISMATCH');

  const renderContract = record(binding.renderContract);
  const chapterPolicy = record(renderContract?.chapterPolicy);
  const rawBoundaries = chapterPolicy?.boundaries;
  if (renderContract?.routeMode !== 'chapter' || !Array.isArray(rawBoundaries)) {
    fail('STRICT_CONTRACT_BOUNDARIES_INVALID');
  }
  const boundaries = rawBoundaries.map((value) => {
    const boundary = record(value);
    if (
      !boundary
      || !Number.isSafeInteger(boundary.startFrame)
      || !Number.isSafeInteger(boundary.endFrame)
    ) fail('STRICT_CONTRACT_BOUNDARIES_INVALID');
    return { startFrame: boundary.startFrame as number, endFrame: boundary.endFrame as number };
  });
  const expectedManifest = createChapterLayoutManifestForRenderV1({
    parentAdmissionId: row._id,
    bindingHash: binding.bindingHash,
    projectId: binding.projectId,
    totalFrames: row.totalFrames as number,
    fps: row.fps,
    boundaries,
  });
  if (expectedManifest.layoutManifestHash !== manifest.layoutManifestHash) {
    fail('STRICT_CONTRACT_LAYOUT_MISMATCH');
  }
  if (!Array.isArray(row.chapters) || row.chapters.length !== manifest.chapterCount) {
    fail('STRICT_CONTRACT_CHAPTERS_INVALID');
  }
  for (const [index, expected] of manifest.chapters.entries()) {
    const chapter = record(row.chapters[index]);
    if (
      !chapter
      || chapter.index !== expected.index
      || chapter.startFrame !== expected.startFrame
      || chapter.endFrame !== expected.endFrame
      || chapter.durationFrames !== expected.durationFrames
      || chapter.parentAdmissionId !== row._id
      || chapter.region !== row.region
    ) fail('STRICT_CONTRACT_CHAPTERS_INVALID');
    assertChapterChildDispatchV1(chapter.dispatch);
    if (
      chapter.dispatch.parentAdmissionId !== row._id
      || chapter.dispatch.childIndex !== index
      || chapter.dispatch.bindingHash !== binding.bindingHash
    ) fail('STRICT_CONTRACT_DISPATCH_MISMATCH');
  }
  return binding;
}

async function writeAssessment(input: {
  collection: Pick<Collection<ChapterRenderLifecycleMigrationDocumentV1>, 'updateOne'>;
  row: ChapterRenderLifecycleMigrationDocumentV1;
  migration: ChapterRenderLifecycleMigrationAssessmentV1;
  lifecycle?: 'ACTIVE' | 'CLEANUP_PENDING';
  invalidatedAt?: Date;
}): Promise<void> {
  const filter: Record<string, unknown> = {
    _id: input.row._id,
    artifactLifecycleVersion: { $exists: false },
    artifactState: { $exists: false },
    retentionState: { $exists: false },
    artifactInvalidatedAt: { $exists: false },
    lifecycleMigration: { $exists: false },
    projectRenderSnapshotBinding: input.row.projectRenderSnapshotBinding === undefined
      ? { $exists: false }
      : input.row.projectRenderSnapshotBinding,
    cleanupMaterialization: input.row.cleanupMaterialization === undefined
      ? { $exists: false }
      : input.row.cleanupMaterialization,
  };
  const set: Record<string, unknown> = { lifecycleMigration: input.migration };
  if (input.lifecycle === 'ACTIVE') {
    Object.assign(set, {
      artifactLifecycleVersion: 1,
      artifactState: 'ACTIVE',
      retentionState: 'RETAINED',
    });
  } else if (input.lifecycle === 'CLEANUP_PENDING') {
    Object.assign(set, {
      artifactLifecycleVersion: 1,
      artifactState: 'STALE',
      retentionState: 'CLEANUP_PENDING',
      artifactInvalidatedAt: input.invalidatedAt,
    });
  }
  const written = await input.collection.updateOne(filter, { $set: set });
  if (written.modifiedCount !== 1) fail('WRITE_UNPROVED');
}

export async function migrateChapterRenderLifecycleV1(input: {
  chapterJobId: string;
  collection: Pick<Collection<ChapterRenderLifecycleMigrationDocumentV1>, 'findOne' | 'updateOne'>;
  projectRevisionReader: ChapterChildProjectRevisionReaderV1;
  now?: Date;
}): Promise<ChapterRenderLifecycleMigrationResultV1> {
  if (!JOB_ID.test(input.chapterJobId)) fail('JOB_ID_INVALID');
  const now = input.now ?? new Date();
  if (!validDate(now)) fail('TIME_INVALID');
  const row = await input.collection.findOne({ _id: input.chapterJobId });
  if (!row) return { ok: false, status: 'NOT_FOUND' };

  const existingAssessment = parseAssessment(row.lifecycleMigration, row._id);
  if (row.artifactLifecycleVersion === 1) {
    if (
      row.artifactState === 'ACTIVE' && row.retentionState === 'RETAINED'
      || row.artifactState === 'STALE'
        && row.retentionState === 'CLEANUP_PENDING'
        && validDate(row.artifactInvalidatedAt)
    ) {
      return {
        ok: true,
        status: 'ALREADY_MIGRATED',
        disposition: row.artifactState === 'ACTIVE' ? 'MIGRATED_ACTIVE' : 'MIGRATED_CLEANUP_PENDING',
      };
    }
    fail('LIFECYCLE_CONFLICT');
  }
  if (
    row.artifactLifecycleVersion !== undefined
    || row.artifactState !== undefined
    || row.retentionState !== undefined
    || row.artifactInvalidatedAt !== undefined
  ) fail('LIFECYCLE_CONFLICT');
  if (existingAssessment) {
    return { ok: true, status: 'ALREADY_ASSESSED', disposition: existingAssessment.disposition };
  }

  if (row.projectRenderSnapshotBinding === undefined) {
    const disposition = 'BLOCKED_UNBOUND_LEGACY' as const;
    await writeAssessment({ collection: input.collection, row, migration: assessment(row._id, disposition, now) });
    return { ok: true, status: 'BLOCKED', disposition };
  }

  let binding: ReturnType<typeof validateStrictRow>;
  try {
    binding = validateStrictRow(row);
  } catch {
    const disposition = 'BLOCKED_CONTRACT_INVALID' as const;
    await writeAssessment({ collection: input.collection, row, migration: assessment(row._id, disposition, now) });
    return { ok: true, status: 'BLOCKED', disposition };
  }
  const materializedAt = cleanupMaterializedAt(row.cleanupMaterialization);
  if (materializedAt) {
    const disposition = 'MIGRATED_CLEANUP_PENDING' as const;
    await writeAssessment({
      collection: input.collection,
      row,
      migration: assessment(row._id, disposition, now),
      lifecycle: 'CLEANUP_PENDING',
      invalidatedAt: materializedAt,
    });
    return { ok: true, status: 'MIGRATED', disposition };
  }

  let liveRevision: unknown;
  try {
    liveRevision = await input.projectRevisionReader(binding.ownerId, binding.projectId);
  } catch {
    fail('PROJECT_REVISION_UNAVAILABLE');
  }
  const parsedRevision = ProjectArtifactProjectRevisionSchema.safeParse(liveRevision);
  if (!parsedRevision.success) fail('PROJECT_REVISION_UNAVAILABLE');
  if (!sameProjectArtifactRevisionV1(binding.projectRevision, parsedRevision.data)) {
    const disposition = 'BLOCKED_PROJECT_REVISION_STALE' as const;
    await writeAssessment({ collection: input.collection, row, migration: assessment(row._id, disposition, now) });
    return { ok: true, status: 'BLOCKED', disposition };
  }

  const disposition = 'MIGRATED_ACTIVE' as const;
  await writeAssessment({
    collection: input.collection,
    row,
    migration: assessment(row._id, disposition, now),
    lifecycle: 'ACTIVE',
  });
  return { ok: true, status: 'MIGRATED', disposition };
}
