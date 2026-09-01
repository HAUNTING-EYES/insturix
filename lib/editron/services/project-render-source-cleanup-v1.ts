import { z } from "zod";
import type { ClientSession, Collection } from "mongodb";

import {
  cloneCanonicalEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from "./canonical-json-v1";
import {
  ProjectRenderSnapshotBindingSchema,
  assertProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from "./project-render-snapshot-binding-v1";

export const PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1 =
  "editron_project_render_source_cleanup_outbox_v1" as const;

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const CLEANUP_OUTBOX_ID = /^project-render-source-cleanup_[a-f0-9]{64}$/;
const CLAIM_TOKEN = /^[A-Za-z0-9_-]{1,200}$/;
const PARENT_ADMISSION_ID = /^[A-Za-z0-9_.:-]{1,500}$/;
const PROVIDER_RENDER_ID = /^[A-Za-z0-9_-]{1,200}$/;
const AWS_BUCKET_NAME = /^(?!.*\.\.)(?!\d{1,3}(?:\.\d{1,3}){3}$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const MAX_CHAPTER_INDEX_V1 = 100_000;

const STANDARD_RENDER_ARTIFACT_KIND_V1 = "REMOTION_AWS_RENDER_OUTPUT" as const;
const CHAPTER_CHILD_RENDER_ARTIFACT_KIND_V1 =
  "REMOTION_AWS_CHAPTER_CHILD_RENDER_OUTPUT" as const;

export const ProjectRenderSourceCleanupAwsRegionSchemaV1 = z.enum([
  "eu-central-1",
  "eu-central-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-south-1",
  "eu-north-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "af-south-1",
  "ap-south-1",
  "ap-east-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-southeast-4",
  "ap-southeast-5",
  "ca-central-1",
  "sa-east-1",
]);

export const ProjectRenderSourceCleanupOutboxIdSchemaV1 = z.string()
  .regex(CLEANUP_OUTBOX_ID);

const ProjectRenderSourceCleanupDescriptorBaseShapeV1 = {
  schemaVersion: z.literal(1),
  scope: z.literal("PROJECT_RENDER_SOURCE_CLEANUP"),
  provider: z.literal("REMOTION_AWS_LAMBDA"),
  credentialScopeId: z.literal("EDITRON_REMOTION_AWS_PRIMARY"),
  binding: ProjectRenderSnapshotBindingSchema,
  providerRenderId: z.string().regex(PROVIDER_RENDER_ID),
  bucketName: z.string().regex(AWS_BUCKET_NAME).refine(
    (value) => value !== "chapter-render",
    "Chapter aggregate jobs require their own child-render cleanup contract.",
  ),
  region: ProjectRenderSourceCleanupAwsRegionSchemaV1,
  renderPrefix: z.string().min(1).max(220),
  sourceOutput: z.object({
    url: z.string().url().refine((value) => value.startsWith("https://"), {
      message: "Provider source output URL must use HTTPS.",
    }),
    sizeBytes: z.number().int().nonnegative(),
  }).strict(),
  createdAt: z.string().datetime(),
} as const;

function validateProjectRenderSourceCleanupRenderPrefixV1(
  descriptor: {
    providerRenderId: string;
    renderPrefix: string;
  },
  context: z.RefinementCtx,
): void {
  if (descriptor.renderPrefix !== `renders/${descriptor.providerRenderId}/`) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["renderPrefix"],
      message: "Render cleanup prefix must be derived from the provider render ID.",
    });
  }
}

const ProjectRenderSourceCleanupStandardDescriptorUnsignedSchemaV1 = z.object({
  ...ProjectRenderSourceCleanupDescriptorBaseShapeV1,
  artifactKind: z.literal(STANDARD_RENDER_ARTIFACT_KIND_V1),
}).strict().superRefine(validateProjectRenderSourceCleanupRenderPrefixV1);

const ProjectRenderSourceCleanupChapterChildDescriptorUnsignedSchemaV1 = z.object({
  ...ProjectRenderSourceCleanupDescriptorBaseShapeV1,
  artifactKind: z.literal(CHAPTER_CHILD_RENDER_ARTIFACT_KIND_V1),
  parentAdmissionId: z.string().regex(PARENT_ADMISSION_ID),
  chapterIndex: z.number().int().nonnegative().max(MAX_CHAPTER_INDEX_V1),
}).strict().superRefine((descriptor, context) => {
  validateProjectRenderSourceCleanupRenderPrefixV1(descriptor, context);
  if (descriptor.parentAdmissionId !== descriptor.binding.artifactId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["parentAdmissionId"],
      message: "Chapter child cleanup must name its exact parent render admission.",
    });
  }
});

const ProjectRenderSourceCleanupDescriptorUnsignedSchemaV1 = z.discriminatedUnion(
  "artifactKind",
  [
    ProjectRenderSourceCleanupStandardDescriptorUnsignedSchemaV1,
    ProjectRenderSourceCleanupChapterChildDescriptorUnsignedSchemaV1,
  ],
);

export const ProjectRenderSourceCleanupDescriptorSchemaV1 =
  z.discriminatedUnion("artifactKind", [
    ProjectRenderSourceCleanupStandardDescriptorUnsignedSchemaV1.safeExtend({
      descriptorId: ProjectRenderSourceCleanupOutboxIdSchemaV1,
      descriptorHash: z.string().regex(HEX_SHA256),
    }).strict(),
    ProjectRenderSourceCleanupChapterChildDescriptorUnsignedSchemaV1.safeExtend({
      descriptorId: ProjectRenderSourceCleanupOutboxIdSchemaV1,
      descriptorHash: z.string().regex(HEX_SHA256),
    }).strict(),
  ]);
export const ProjectRenderSourceCleanupStandardDescriptorSchemaV1 =
  ProjectRenderSourceCleanupStandardDescriptorUnsignedSchemaV1.safeExtend({
    descriptorId: ProjectRenderSourceCleanupOutboxIdSchemaV1,
    descriptorHash: z.string().regex(HEX_SHA256),
  }).strict();
export const ProjectRenderSourceCleanupChapterChildDescriptorSchemaV1 =
  ProjectRenderSourceCleanupChapterChildDescriptorUnsignedSchemaV1.safeExtend({
    descriptorId: ProjectRenderSourceCleanupOutboxIdSchemaV1,
    descriptorHash: z.string().regex(HEX_SHA256),
  }).strict();
export type ProjectRenderSourceCleanupDescriptorV1 = z.infer<
  typeof ProjectRenderSourceCleanupDescriptorSchemaV1
>;
export type ProjectRenderSourceCleanupStandardDescriptorV1 = z.infer<
  typeof ProjectRenderSourceCleanupStandardDescriptorSchemaV1
>;
export type ProjectRenderSourceCleanupChapterChildDescriptorV1 = z.infer<
  typeof ProjectRenderSourceCleanupChapterChildDescriptorSchemaV1
>;

/**
 * Standard rows predate the child contract and include createdAt in their
 * hash. Keep that legacy identity intact; child identity excludes its audit
 * timestamp so a retry of the same exact child tuple reuses one outbox row.
 */
function projectRenderSourceCleanupDescriptorHashV1(
  descriptor: z.infer<typeof ProjectRenderSourceCleanupDescriptorUnsignedSchemaV1>
    | ProjectRenderSourceCleanupDescriptorV1,
): string {
  if (descriptor.artifactKind === CHAPTER_CHILD_RENDER_ARTIFACT_KIND_V1) {
    const { createdAt, ...identity } = descriptor;
    return hashEditronCanonicalJsonV1(identity);
  }
  return hashEditronCanonicalJsonV1(descriptor);
}

const ProjectRenderSourceCleanupLeaseSchemaV1 = z.object({
  claimToken: z.string().regex(CLAIM_TOKEN),
  claimedAt: z.date(),
  leaseExpiresAt: z.date(),
}).strict().superRefine((lease, context) => {
  if (lease.leaseExpiresAt.getTime() <= lease.claimedAt.getTime()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["leaseExpiresAt"],
      message: "Cleanup lease must expire after it is claimed.",
    });
  }
});

const ProjectRenderSourceCleanupCompletionSchemaV1 = z.object({
  completedAt: z.date(),
  freedBytes: z.number().int().nonnegative(),
}).strict();

export const ProjectRenderSourceCleanupOutboxSchemaV1 = z.object({
  _id: ProjectRenderSourceCleanupOutboxIdSchemaV1,
  schemaVersion: z.literal(1),
  descriptor: ProjectRenderSourceCleanupDescriptorSchemaV1,
  status: z.enum(["PENDING", "RUNNING", "DONE"]),
  attempts: z.number().int().nonnegative(),
  availableAt: z.date(),
  lease: ProjectRenderSourceCleanupLeaseSchemaV1.optional(),
  completion: ProjectRenderSourceCleanupCompletionSchemaV1.optional(),
  lastError: z.string().min(1).max(2_000).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
}).strict().superRefine((outbox, context) => {
  if (outbox._id !== outbox.descriptor.descriptorId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["_id"],
      message: "Cleanup outbox identity must equal its immutable descriptor identity.",
    });
  }
  if (outbox.status === "RUNNING" && !outbox.lease) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lease"],
      message: "A running cleanup requires an active lease.",
    });
  }
  if (outbox.status !== "RUNNING" && outbox.lease) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lease"],
      message: "Only a running cleanup may retain a lease.",
    });
  }
  if (outbox.status === "DONE" && !outbox.completion) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completion"],
      message: "A completed cleanup requires a completion receipt.",
    });
  }
  if (outbox.status !== "DONE" && outbox.completion) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completion"],
      message: "An incomplete cleanup cannot carry a completion receipt.",
    });
  }
});
export type ProjectRenderSourceCleanupOutboxV1 = z.infer<
  typeof ProjectRenderSourceCleanupOutboxSchemaV1
>;

function createProjectRenderSourceCleanupOutboxFromUnsignedV1(
  unsigned: z.infer<typeof ProjectRenderSourceCleanupDescriptorUnsignedSchemaV1>,
  now: Date,
): ProjectRenderSourceCleanupOutboxV1 {
  const descriptorHash = projectRenderSourceCleanupDescriptorHashV1(unsigned);
  const descriptor = ProjectRenderSourceCleanupDescriptorSchemaV1.parse({
    ...unsigned,
    descriptorId: `project-render-source-cleanup_${descriptorHash}`,
    descriptorHash,
  });
  const outbox: ProjectRenderSourceCleanupOutboxV1 = {
    _id: descriptor.descriptorId,
    schemaVersion: 1,
    descriptor,
    status: "PENDING",
    attempts: 0,
    availableAt: now,
    createdAt: now,
    updatedAt: now,
  };
  assertProjectRenderSourceCleanupOutboxV1(outbox);
  return outbox;
}

function cleanupTimeV1(nowInput: Date | undefined): Date {
  const now = nowInput ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_TIME_INVALID");
  }
  return now;
}

type ProjectRenderSourceCleanupProviderInputV1 = {
  binding: ProjectRenderSnapshotBindingV1;
  providerRenderId: string;
  bucketName: string;
  region: string;
  sourceOutputUrl: string;
  sourceOutputSize: number;
  now?: Date;
};

function createUnsignedProjectRenderSourceCleanupDescriptorV1(
  input: ProjectRenderSourceCleanupProviderInputV1 & {
    artifactKind: typeof STANDARD_RENDER_ARTIFACT_KIND_V1;
  },
  now: Date,
): z.infer<typeof ProjectRenderSourceCleanupStandardDescriptorUnsignedSchemaV1>;
function createUnsignedProjectRenderSourceCleanupDescriptorV1(
  input: ProjectRenderSourceCleanupProviderInputV1 & {
    artifactKind: typeof CHAPTER_CHILD_RENDER_ARTIFACT_KIND_V1;
    parentAdmissionId: string;
    chapterIndex: number;
  },
  now: Date,
): z.infer<typeof ProjectRenderSourceCleanupChapterChildDescriptorUnsignedSchemaV1>;
function createUnsignedProjectRenderSourceCleanupDescriptorV1(
  input: ProjectRenderSourceCleanupProviderInputV1 & {
    artifactKind:
      | typeof STANDARD_RENDER_ARTIFACT_KIND_V1
      | typeof CHAPTER_CHILD_RENDER_ARTIFACT_KIND_V1;
    parentAdmissionId?: string;
    chapterIndex?: number;
  },
  now: Date,
): z.infer<typeof ProjectRenderSourceCleanupDescriptorUnsignedSchemaV1> {
  assertProjectRenderSnapshotBindingV1(input.binding);
  return ProjectRenderSourceCleanupDescriptorUnsignedSchemaV1.parse({
    schemaVersion: 1,
    scope: "PROJECT_RENDER_SOURCE_CLEANUP",
    artifactKind: input.artifactKind,
    provider: "REMOTION_AWS_LAMBDA",
    credentialScopeId: "EDITRON_REMOTION_AWS_PRIMARY",
    binding: cloneCanonicalEditronJsonV1(input.binding),
    ...(input.artifactKind === CHAPTER_CHILD_RENDER_ARTIFACT_KIND_V1
      ? {
          parentAdmissionId: input.parentAdmissionId?.trim(),
          chapterIndex: input.chapterIndex,
        }
      : {}),
    providerRenderId: input.providerRenderId.trim(),
    bucketName: input.bucketName.trim(),
    region: input.region.trim(),
    renderPrefix: `renders/${input.providerRenderId.trim()}/`,
    sourceOutput: {
      url: input.sourceOutputUrl,
      sizeBytes: input.sourceOutputSize,
    },
    createdAt: now.toISOString(),
  });
}

export function createProjectRenderSourceCleanupOutboxV1(input: {
  binding: ProjectRenderSnapshotBindingV1;
  providerRenderId: string;
  bucketName: string;
  region: string;
  sourceOutputUrl: string;
  sourceOutputSize: number;
  now?: Date;
}): ProjectRenderSourceCleanupOutboxV1 {
  const now = cleanupTimeV1(input.now);
  const unsigned = createUnsignedProjectRenderSourceCleanupDescriptorV1({
    ...input,
    artifactKind: STANDARD_RENDER_ARTIFACT_KIND_V1,
  }, now);
  return createProjectRenderSourceCleanupOutboxFromUnsignedV1(unsigned, now);
}

/**
 * Build one immutable handoff for a single chapter child render. The parent
 * binding and admission remain the authority; the child tuple is only the
 * exact Remotion resource that the cleanup consumer may delete.
 */
export function createProjectRenderChapterChildSourceCleanupOutboxV1(input: {
  binding: ProjectRenderSnapshotBindingV1;
  parentAdmissionId: string;
  chapterIndex: number;
  providerRenderId: string;
  bucketName: string;
  region: string;
  sourceOutputUrl: string;
  sourceOutputSize: number;
  now?: Date;
}): ProjectRenderSourceCleanupOutboxV1 {
  const now = cleanupTimeV1(input.now);
  const unsigned = createUnsignedProjectRenderSourceCleanupDescriptorV1({
    ...input,
    artifactKind: CHAPTER_CHILD_RENDER_ARTIFACT_KIND_V1,
  }, now);
  return createProjectRenderSourceCleanupOutboxFromUnsignedV1(unsigned, now);
}

export function assertProjectRenderSourceCleanupOutboxV1(
  input: unknown,
): asserts input is ProjectRenderSourceCleanupOutboxV1 {
  const parsed = ProjectRenderSourceCleanupOutboxSchemaV1.safeParse(input);
  if (!parsed.success) {
    throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_INVALID");
  }
  assertProjectRenderSnapshotBindingV1(parsed.data.descriptor.binding);
  const { descriptorId, descriptorHash, ...unsigned } = parsed.data.descriptor;
  const expectedHash = projectRenderSourceCleanupDescriptorHashV1(unsigned);
  if (
    descriptorHash !== expectedHash
    || descriptorId !== `project-render-source-cleanup_${expectedHash}`
  ) {
    throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_DESCRIPTOR_HASH_MISMATCH");
  }
}

export async function enqueueProjectRenderSourceCleanupOutboxV1(input: {
  outbox: ProjectRenderSourceCleanupOutboxV1;
  collection: Collection<ProjectRenderSourceCleanupOutboxV1>;
  session: ClientSession;
}): Promise<void> {
  assertProjectRenderSourceCleanupOutboxV1(input.outbox);
  const persisted = await input.collection.updateOne(
    {
      _id: input.outbox._id,
      "descriptor.descriptorHash": input.outbox.descriptor.descriptorHash,
    },
    { $setOnInsert: structuredClone(input.outbox) },
    { upsert: true, session: input.session },
  );
  if (persisted.matchedCount !== 1 && persisted.upsertedCount !== 1) {
    throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_WRITE_UNPROVED");
  }
}
