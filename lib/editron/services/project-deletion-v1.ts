import type { ClientSession, Collection, Document } from "mongodb";
import { z } from "zod";

import { hashEditronCanonicalJsonV1 } from "./canonical-json-v1";
import {
  ProjectArtifactProjectRevisionSchema,
  sameProjectArtifactRevisionV1,
  type ProjectArtifactProjectRevisionV1,
} from "./project-artifact-invalidation-v1";
import {
  ProjectRenderSnapshotInvalidationLinkSchemaV1,
  type ProjectRenderSnapshotInvalidationLinkV1,
} from "./project-render-snapshot-invalidation-v1";
import { projectRevisionPredicate } from "./project-revision-v1";

export const PROJECT_DELETION_TOMBSTONES_COLLECTION_V1 =
  "editron_project_deletion_tombstones_v1" as const;

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const TOMBSTONE_ID = /^project-deletion_[a-f0-9]{64}$/;
const MAX_IDENTIFIER_LENGTH = 200;

const DeletedCollectionSchema = z.object({
  state: z.literal("DELETED"),
  deletedCount: z.number().int().nonnegative(),
}).strict();

const ProjectDeletionTombstoneSchemaV1 = z.object({
  _id: z.string().regex(TOMBSTONE_ID),
  schemaVersion: z.literal(1),
  tombstoneId: z.string().regex(TOMBSTONE_ID),
  scope: z.literal("PROJECT_DELETION"),
  ownerId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  projectId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  operation: z.literal("DELETE_PROJECT"),
  beforeRevision: ProjectArtifactProjectRevisionSchema,
  afterRevision: ProjectArtifactProjectRevisionSchema,
  projectRenderSnapshotInvalidation: ProjectRenderSnapshotInvalidationLinkSchemaV1,
  cleanup: z.object({
    project: DeletedCollectionSchema,
    checkpoints: DeletedCollectionSchema,
    chatSessions: DeletedCollectionSchema,
    projectLinks: z.object({
      state: z.literal("REMOVED"),
      modifiedCount: z.number().int().nonnegative(),
    }).strict(),
    sharedMedia: z.object({
      state: z.literal("PRESERVED_SHARED"),
    }).strict(),
    renderArtifacts: z.object({
      state: z.literal("PENDING_DURABLE_INVALIDATION"),
      invalidationId: z.string().min(1).max(200),
    }).strict(),
  }).strict(),
  deletedAt: z.string().datetime(),
  receiptHash: z.string().regex(HEX_SHA256),
}).strict().superRefine((tombstone, context) => {
  if (tombstone._id !== tombstone.tombstoneId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["_id"],
      message: "Project deletion storage identity must match its tombstone identity.",
    });
  }
  if (tombstone.afterRevision.value !== tombstone.beforeRevision.value + 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["afterRevision", "value"],
      message: "Project deletion must advance exactly one terminal revision.",
    });
  }
  if (tombstone.afterRevision.compatibilityUpdatedAt !== tombstone.deletedAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["deletedAt"],
      message: "Project deletion time must equal the terminal revision time.",
    });
  }
  if (
    tombstone.projectRenderSnapshotInvalidation.invalidationId
      !== tombstone.cleanup.renderArtifacts.invalidationId
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cleanup", "renderArtifacts", "invalidationId"],
      message: "Project deletion render cleanup must retain its exact invalidation identity.",
    });
  }
});

export type ProjectDeletionTombstoneV1 = z.infer<
  typeof ProjectDeletionTombstoneSchemaV1
>;

export type ProjectDeletionCommitResultV1 = {
  status: "DELETED" | "ALREADY_DELETED";
  tombstone: ProjectDeletionTombstoneV1;
};

type ProjectDocumentV1 = Document & {
  projectId: string;
  userId: string;
  projectRevision?: unknown;
  updatedAt?: unknown;
};

type ProjectLinkDocumentV1 = Document & {
  userId: string;
  projectIds: string[];
  updatedAt: Date;
};

function fail(code: string): never {
  throw new Error(`PROJECT_DELETION_${code}`);
}

function sameDeletionBasisV1(input: {
  tombstone: ProjectDeletionTombstoneV1;
  ownerId: string;
  projectId: string;
  beforeRevision: ProjectArtifactProjectRevisionV1;
  afterRevision: ProjectArtifactProjectRevisionV1;
  invalidation: ProjectRenderSnapshotInvalidationLinkV1;
}): boolean {
  return input.tombstone.ownerId === input.ownerId
    && input.tombstone.projectId === input.projectId
    && sameProjectArtifactRevisionV1(input.tombstone.beforeRevision, input.beforeRevision)
    && sameProjectArtifactRevisionV1(input.tombstone.afterRevision, input.afterRevision)
    && input.tombstone.projectRenderSnapshotInvalidation.invalidationId
      === input.invalidation.invalidationId
    && input.tombstone.projectRenderSnapshotInvalidation.receiptHash
      === input.invalidation.receiptHash;
}

function deletionIdentityV1(input: {
  ownerId: string;
  projectId: string;
  beforeRevision: ProjectArtifactProjectRevisionV1;
  afterRevision: ProjectArtifactProjectRevisionV1;
  invalidation: ProjectRenderSnapshotInvalidationLinkV1;
}): string {
  return `project-deletion_${hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    scope: "PROJECT_DELETION",
    operation: "DELETE_PROJECT",
    ownerId: input.ownerId,
    projectId: input.projectId,
    beforeRevision: input.beforeRevision,
    afterRevision: input.afterRevision,
    projectRenderSnapshotInvalidation: input.invalidation,
  })}`;
}

function sealProjectDeletionTombstoneV1(
  unsigned: Omit<ProjectDeletionTombstoneV1, "receiptHash">,
): ProjectDeletionTombstoneV1 {
  const tombstone: ProjectDeletionTombstoneV1 = {
    ...unsigned,
    receiptHash: hashEditronCanonicalJsonV1(unsigned),
  };
  assertProjectDeletionTombstoneV1(tombstone);
  return tombstone;
}

export function assertProjectDeletionTombstoneV1(
  input: unknown,
): asserts input is ProjectDeletionTombstoneV1 {
  const parsed = ProjectDeletionTombstoneSchemaV1.safeParse(input);
  if (!parsed.success) fail("TOMBSTONE_INVALID");
  const { receiptHash, ...unsigned } = parsed.data;
  if (hashEditronCanonicalJsonV1(unsigned) !== receiptHash) {
    fail("TOMBSTONE_HASH_MISMATCH");
  }
}

/**
 * Commit one whole-project deletion inside the caller's Mongo transaction.
 * The project and its project-owned documents cannot be left partially deleted;
 * shared media is intentionally excluded because it may serve other projects.
 */
export async function commitProjectDeletionV1(input: {
  ownerId: string;
  projectId: string;
  beforeRevision: ProjectArtifactProjectRevisionV1;
  afterRevision: ProjectArtifactProjectRevisionV1;
  invalidation: ProjectRenderSnapshotInvalidationLinkV1;
  projectCollection: Pick<Collection<ProjectDocumentV1>, "findOne" | "deleteOne">;
  checkpointCollection: Pick<Collection<Document>, "deleteMany">;
  chatSessionCollection: Pick<Collection<Document>, "deleteMany">;
  projectLinkCollection: Pick<Collection<ProjectLinkDocumentV1>, "updateMany">;
  tombstoneCollection: Pick<Collection<ProjectDeletionTombstoneV1>, "findOne" | "insertOne">;
  session: ClientSession;
  now?: Date;
}): Promise<ProjectDeletionCommitResultV1> {
  if (!input.session.inTransaction()) fail("TRANSACTION_REQUIRED");
  ProjectArtifactProjectRevisionSchema.parse(input.beforeRevision);
  ProjectArtifactProjectRevisionSchema.parse(input.afterRevision);
  const parsedInvalidation = ProjectRenderSnapshotInvalidationLinkSchemaV1.safeParse(
    input.invalidation,
  );
  if (!parsedInvalidation.success) fail("INVALIDATION_LINK_INVALID");
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) fail("TIME_INVALID");
  if (
    input.afterRevision.value !== input.beforeRevision.value + 1
    || input.afterRevision.compatibilityUpdatedAt !== now.toISOString()
    || !sameProjectArtifactRevisionV1(
      input.invalidation.beforeRevision,
      input.beforeRevision,
    )
    || !sameProjectArtifactRevisionV1(
      input.invalidation.afterRevision,
      input.afterRevision,
    )
  ) fail("REVISION_BASIS_INVALID");

  const tombstoneId = deletionIdentityV1(input);
  const project = await input.projectCollection.findOne(
    {
      projectId: input.projectId,
      userId: input.ownerId,
      ...projectRevisionPredicate(input.beforeRevision),
    },
    { session: input.session },
  );
  if (!project) {
    const existing = await input.tombstoneCollection.findOne(
      { _id: tombstoneId, ownerId: input.ownerId, projectId: input.projectId },
      { session: input.session },
    );
    if (!existing) fail("PROJECT_NOT_CURRENT");
    assertProjectDeletionTombstoneV1(existing);
    if (!sameDeletionBasisV1({ ...input, tombstone: existing })) {
      fail("TOMBSTONE_REPLAY_MISMATCH");
    }
    return { status: "ALREADY_DELETED", tombstone: structuredClone(existing) };
  }

  const checkpoints = await input.checkpointCollection.deleteMany(
    { projectId: input.projectId },
    { session: input.session },
  );
  const chatSessions = await input.chatSessionCollection.deleteMany(
    { projectId: input.projectId },
    { session: input.session },
  );
  const projectLinks = await input.projectLinkCollection.updateMany(
    { userId: input.ownerId, projectIds: input.projectId },
    [{
      $set: {
        projectIds: {
          $filter: {
            input: "$projectIds",
            as: "linkedProjectId",
            cond: { $ne: ["$$linkedProjectId", input.projectId] },
          },
        },
        updatedAt: now,
      },
    }],
    { session: input.session },
  );
  const deletedProject = await input.projectCollection.deleteOne(
    {
      projectId: input.projectId,
      userId: input.ownerId,
      ...projectRevisionPredicate(input.beforeRevision),
    },
    { session: input.session },
  );
  if (deletedProject.deletedCount !== 1) fail("PROJECT_DELETE_UNPROVED");

  const tombstone = sealProjectDeletionTombstoneV1({
    _id: tombstoneId,
    schemaVersion: 1,
    tombstoneId,
    scope: "PROJECT_DELETION",
    ownerId: input.ownerId,
    projectId: input.projectId,
    operation: "DELETE_PROJECT",
    beforeRevision: structuredClone(input.beforeRevision),
    afterRevision: structuredClone(input.afterRevision),
    projectRenderSnapshotInvalidation: structuredClone(input.invalidation),
    cleanup: {
      project: { state: "DELETED", deletedCount: 1 },
      checkpoints: { state: "DELETED", deletedCount: checkpoints.deletedCount },
      chatSessions: { state: "DELETED", deletedCount: chatSessions.deletedCount },
      projectLinks: { state: "REMOVED", modifiedCount: projectLinks.modifiedCount },
      sharedMedia: { state: "PRESERVED_SHARED" },
      renderArtifacts: {
        state: "PENDING_DURABLE_INVALIDATION",
        invalidationId: input.invalidation.invalidationId,
      },
    },
    deletedAt: now.toISOString(),
  });
  try {
    const inserted = await input.tombstoneCollection.insertOne(
      structuredClone(tombstone),
      { session: input.session },
    );
    if (inserted.acknowledged === false) fail("TOMBSTONE_WRITE_UNPROVED");
  } catch (error) {
    const existing = await input.tombstoneCollection.findOne(
      { _id: tombstoneId },
      { session: input.session },
    );
    if (!existing) throw error;
    assertProjectDeletionTombstoneV1(existing);
    if (existing.receiptHash !== tombstone.receiptHash) fail("TOMBSTONE_REPLAY_MISMATCH");
    return { status: "ALREADY_DELETED", tombstone: structuredClone(existing) };
  }
  return { status: "DELETED", tombstone };
}
