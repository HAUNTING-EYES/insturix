import type { Collection } from "mongodb";

import { RenderJobSchema } from "../schemas/render-job";
import {
  ProjectArtifactProjectRevisionSchema,
  sameProjectArtifactRevisionV1,
} from "./project-artifact-invalidation-v1";
import { hashEditronCanonicalJsonV1 } from "./canonical-json-v1";
import {
  ProjectRenderLifecycleMigrationAssessmentSchemaV1,
  type ProjectRenderLifecycleMigrationAssessmentV1,
  type ProjectRenderLifecycleMigrationDispositionV1,
} from "./project-render-lifecycle-migration-contract-v1";
import { assertProjectRenderSnapshotBindingV1 } from "./project-render-snapshot-binding-v1";
import {
  createProjectRenderJobAuthorizationV1,
  validateCurrentProjectRenderJob,
} from "./render-job-service";

export type ProjectRenderLifecycleMigrationDocumentV1 = {
  _id: string;
  userId?: unknown;
  requestedByUserId?: unknown;
  projectId?: unknown;
  status?: unknown;
  projectRenderSnapshotBinding?: unknown;
  artifactBinding?: unknown;
  artifactState?: unknown;
  artifactCleanup?: unknown;
  artifactInvalidation?: unknown;
  projectRenderSnapshotInvalidation?: unknown;
  projectRenderSourceCleanupOutboxId?: unknown;
  artifactInvalidatedAt?: unknown;
  projectRenderLifecycleMigration?: unknown;
  [key: string]: unknown;
};

export type ProjectRenderLifecycleMigrationResultV1 =
  | {
      ok: true;
      status: "MIGRATED" | "ALREADY_MIGRATED" | "ALREADY_ASSESSED" | "BLOCKED";
      disposition: ProjectRenderLifecycleMigrationDispositionV1;
    }
  | { ok: false; status: "NOT_FOUND" };

export type ProjectRenderLifecycleMigrationProjectRevisionReaderV1 = (
  ownerId: string,
  projectId: string,
) => Promise<unknown>;

function fail(code: string): never {
  throw new Error(`PROJECT_RENDER_LIFECYCLE_MIGRATION_${code}`);
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function assessmentV1(
  jobId: string,
  disposition: ProjectRenderLifecycleMigrationDispositionV1,
  assessedAt: Date,
): ProjectRenderLifecycleMigrationAssessmentV1 {
  return {
    schemaVersion: 1,
    disposition,
    assessedAt,
    assessmentHash: hashEditronCanonicalJsonV1({
      schemaVersion: 1,
      jobId,
      disposition,
      assessedAt: assessedAt.toISOString(),
    }),
  };
}

function parseAssessmentV1(
  value: unknown,
  jobId: string,
): ProjectRenderLifecycleMigrationAssessmentV1 | null {
  if (value === undefined) return null;
  const parsed = ProjectRenderLifecycleMigrationAssessmentSchemaV1.safeParse(value);
  if (!parsed.success) fail("ASSESSMENT_INVALID");
  const expected = assessmentV1(jobId, parsed.data.disposition, parsed.data.assessedAt);
  if (expected.assessmentHash !== parsed.data.assessmentHash) {
    fail("ASSESSMENT_HASH_MISMATCH");
  }
  return parsed.data;
}

function hasLifecycleV1(row: ProjectRenderLifecycleMigrationDocumentV1): boolean {
  return row.artifactState !== undefined
    || row.artifactCleanup !== undefined
    || row.artifactInvalidation !== undefined
    || row.projectRenderSnapshotInvalidation !== undefined
    || row.projectRenderSourceCleanupOutboxId !== undefined
    || row.artifactInvalidatedAt !== undefined;
}

async function writeAssessmentV1(input: {
  collection: Pick<Collection<ProjectRenderLifecycleMigrationDocumentV1>, "updateOne">;
  row: ProjectRenderLifecycleMigrationDocumentV1;
  migration: ProjectRenderLifecycleMigrationAssessmentV1;
  activate: boolean;
}): Promise<void> {
  const written = await input.collection.updateOne(
    {
      _id: input.row._id,
      artifactState: { $exists: false },
      artifactCleanup: { $exists: false },
      artifactInvalidation: { $exists: false },
      projectRenderSnapshotInvalidation: { $exists: false },
      projectRenderSourceCleanupOutboxId: { $exists: false },
      artifactInvalidatedAt: { $exists: false },
      projectRenderLifecycleMigration: { $exists: false },
      projectRenderSnapshotBinding: input.row.projectRenderSnapshotBinding === undefined
        ? { $exists: false }
        : input.row.projectRenderSnapshotBinding,
      artifactBinding: input.row.artifactBinding === undefined
        ? { $exists: false }
        : input.row.artifactBinding,
    },
    {
      $set: {
        projectRenderLifecycleMigration: input.migration,
        ...(input.activate ? { artifactState: "ACTIVE" } : {}),
      },
    },
  );
  if (written.modifiedCount !== 1) fail("WRITE_UNPROVED");
}

async function blockV1(input: {
  collection: Pick<Collection<ProjectRenderLifecycleMigrationDocumentV1>, "updateOne">;
  row: ProjectRenderLifecycleMigrationDocumentV1;
  disposition: Exclude<ProjectRenderLifecycleMigrationDispositionV1, "MIGRATED_ACTIVE">;
  now: Date;
}): Promise<ProjectRenderLifecycleMigrationResultV1> {
  await writeAssessmentV1({
    collection: input.collection,
    row: input.row,
    migration: assessmentV1(input.row._id, input.disposition, input.now),
    activate: false,
  });
  return { ok: true, status: "BLOCKED", disposition: input.disposition };
}

export async function migrateProjectRenderLifecycleV1(input: {
  jobId: string;
  collection: Pick<
    Collection<ProjectRenderLifecycleMigrationDocumentV1>,
    "findOne" | "updateOne"
  >;
  projectRevisionReader: ProjectRenderLifecycleMigrationProjectRevisionReaderV1;
  now?: Date;
}): Promise<ProjectRenderLifecycleMigrationResultV1> {
  if (
    typeof input.jobId !== "string"
    || input.jobId.length < 1
    || input.jobId.length > 500
    || /[\u0000-\u001F\u007F]/.test(input.jobId)
  ) {
    fail("JOB_ID_INVALID");
  }
  const now = input.now ?? new Date();
  if (!validDate(now)) fail("TIME_INVALID");
  const row = await input.collection.findOne({ _id: input.jobId });
  if (!row) return { ok: false, status: "NOT_FOUND" };
  const existingAssessment = parseAssessmentV1(row.projectRenderLifecycleMigration, row._id);

  if (hasLifecycleV1(row)) {
    const parsed = RenderJobSchema.safeParse(row);
    if (
      existingAssessment?.disposition === "MIGRATED_ACTIVE"
      && parsed.success
      && parsed.data.artifactState === "ACTIVE"
      && parsed.data.projectRenderSnapshotBinding !== undefined
      && parsed.data.artifactBinding === undefined
    ) {
      return { ok: true, status: "ALREADY_MIGRATED", disposition: "MIGRATED_ACTIVE" };
    }
    fail("LIFECYCLE_CONFLICT");
  }
  if (existingAssessment) {
    return {
      ok: true,
      status: "ALREADY_ASSESSED",
      disposition: existingAssessment.disposition,
    };
  }
  if (row.artifactBinding !== undefined) {
    return blockV1({
      collection: input.collection,
      row,
      disposition: "BLOCKED_CONTRACT_INVALID",
      now,
    });
  }
  if (row.projectRenderSnapshotBinding === undefined) {
    return blockV1({
      collection: input.collection,
      row,
      disposition: "BLOCKED_UNBOUND_LEGACY",
      now,
    });
  }

  try {
    assertProjectRenderSnapshotBindingV1(row.projectRenderSnapshotBinding);
    const migration = assessmentV1(row._id, "MIGRATED_ACTIVE", now);
    const parsed = RenderJobSchema.safeParse({
      ...row,
      artifactState: "ACTIVE",
      projectRenderLifecycleMigration: migration,
    });
    if (
      !parsed.success
      || !parsed.data.projectRenderSnapshotBinding
      || !parsed.data.requestedByUserId
    ) {
      throw new Error();
    }
    const authorization = createProjectRenderJobAuthorizationV1({
      jobId: parsed.data._id,
      ownerId: parsed.data.userId,
      requestedByUserId: parsed.data.requestedByUserId,
      projectId: parsed.data.projectId,
      projectRevision: parsed.data.projectRenderSnapshotBinding.projectRevision,
      binding: parsed.data.projectRenderSnapshotBinding,
    });
    if (validateCurrentProjectRenderJob(parsed.data, authorization) !== null) throw new Error();
  } catch {
    return blockV1({
      collection: input.collection,
      row,
      disposition: "BLOCKED_CONTRACT_INVALID",
      now,
    });
  }

  const binding = row.projectRenderSnapshotBinding;
  assertProjectRenderSnapshotBindingV1(binding);
  let liveRevision: unknown;
  try {
    liveRevision = await input.projectRevisionReader(binding.ownerId, binding.projectId);
  } catch {
    fail("PROJECT_REVISION_UNAVAILABLE");
  }
  const parsedRevision = ProjectArtifactProjectRevisionSchema.safeParse(liveRevision);
  if (!parsedRevision.success) fail("PROJECT_REVISION_UNAVAILABLE");
  if (!sameProjectArtifactRevisionV1(binding.projectRevision, parsedRevision.data)) {
    return blockV1({
      collection: input.collection,
      row,
      disposition: "BLOCKED_PROJECT_REVISION_STALE",
      now,
    });
  }

  await writeAssessmentV1({
    collection: input.collection,
    row,
    migration: assessmentV1(row._id, "MIGRATED_ACTIVE", now),
    activate: true,
  });
  return { ok: true, status: "MIGRATED", disposition: "MIGRATED_ACTIVE" };
}
