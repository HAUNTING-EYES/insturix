import type { ClientSession, Collection } from "mongodb";
import { z } from "zod";

import {
  cloneCanonicalEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from "./canonical-json-v1";
import {
  ProjectRenderSnapshotBindingSchema,
  assertProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from "./project-render-snapshot-binding-v1";
import {
  assertProjectChapterConcatTargetV1,
  projectChapterConcatOutputUrlV1,
  type ProjectChapterConcatTargetV1,
} from "./chapter-concat-contract-v1";

export const PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX_COLLECTION_V1 =
  "editron_project_chapter_concat_cleanup_outbox_v1" as const;
export const CHAPTER_CONCAT_CLEANUP_OUTBOX_COLLECTION_V1 =
  PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX_COLLECTION_V1;
export const PROJECT_CHAPTER_CONCAT_CLEANUP_SCOPE_V1 =
  "PROJECT_CHAPTER_CONCAT_CLEANUP" as const;
export const PROJECT_CHAPTER_CONCAT_CLEANUP_ARTIFACT_KIND_V1 =
  "REMOTION_AWS_CHAPTER_CONCAT_OUTPUT" as const;
export const PROJECT_CHAPTER_CONCAT_CLEANUP_CREDENTIAL_SCOPE_ID_V1 =
  "EDITRON_CHAPTER_CONCAT_CLEANUP_AWS" as const;

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const CLEANUP_OUTBOX_ID = /^project-chapter-concat-cleanup_[a-f0-9]{64}$/;
const CLAIM_TOKEN = /^[A-Za-z0-9_-]{1,200}$/;
const PARENT_ADMISSION_ID = /^[A-Za-z0-9_.:-]{1,500}$/;
const AWS_BUCKET_NAME = /^(?!.*\.\.)(?!\d{1,3}(?:\.\d{1,3}){3}$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const AWS_REGION = /^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/;
const OUTPUT_KEY = /^editron-concat\/v1\/[a-f0-9]{64}\.mp4$/;
const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001F\u007F]*$/;

const ProjectChapterConcatCleanupOutputSchemaV1 = z.object({
  url: z.string().url().max(4_096).refine((value) => value.startsWith("https://"), {
    message: "Concat output URL must use HTTPS.",
  }),
  sizeBytes: z.number().int().nonnegative().refine(Number.isSafeInteger, {
    message: "Concat output size must be a safe integer.",
  }),
}).strict();
const ProjectChapterConcatCleanupVersionIdSchemaV1 = z.string()
  .min(1).max(1_024)
  .refine((value) => NO_CONTROL_CHARACTERS.test(value), {
    message: "S3 version ID contains a control character.",
  });

const ProjectChapterConcatCleanupDescriptorUnsignedSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  scope: z.literal(PROJECT_CHAPTER_CONCAT_CLEANUP_SCOPE_V1),
  artifactKind: z.literal(PROJECT_CHAPTER_CONCAT_CLEANUP_ARTIFACT_KIND_V1),
  provider: z.literal("AWS_S3"),
  credentialScopeId: z.literal(PROJECT_CHAPTER_CONCAT_CLEANUP_CREDENTIAL_SCOPE_ID_V1),
  binding: ProjectRenderSnapshotBindingSchema,
  parentAdmissionId: z.string().regex(PARENT_ADMISSION_ID),
  generation: z.string().regex(HEX_SHA256),
  sourceManifestHash: z.string().regex(HEX_SHA256),
  outputBucket: z.string().regex(AWS_BUCKET_NAME).refine(
    (value) => value !== "chapter-render",
    "Concat cleanup cannot target the synthetic chapter-render bucket.",
  ),
  outputRegion: z.string().regex(AWS_REGION),
  outputKey: z.string().regex(OUTPUT_KEY),
  versionId: ProjectChapterConcatCleanupVersionIdSchemaV1.optional(),
  output: ProjectChapterConcatCleanupOutputSchemaV1,
  createdAt: z.string().datetime(),
}).strict().superRefine((descriptor, context) => {
  if (descriptor.parentAdmissionId !== descriptor.binding.artifactId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["parentAdmissionId"],
      message: "Concat cleanup must name its exact parent render admission.",
    });
  }
  if (descriptor.outputKey !== `editron-concat/v1/${descriptor.generation}.mp4`) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["outputKey"],
      message: "Concat cleanup key must be derived from the concat generation.",
    });
  }
});

export const ProjectChapterConcatCleanupDescriptorSchemaV1 =
  ProjectChapterConcatCleanupDescriptorUnsignedSchemaV1.safeExtend({
    descriptorId: z.string().regex(CLEANUP_OUTBOX_ID),
    descriptorHash: z.string().regex(HEX_SHA256),
  }).strict();
export type ProjectChapterConcatCleanupDescriptorV1 = z.infer<
  typeof ProjectChapterConcatCleanupDescriptorSchemaV1
>;

const LeaseSchemaV1 = z.object({
  claimToken: z.string().regex(CLAIM_TOKEN),
  claimedAt: z.date(),
  leaseExpiresAt: z.date(),
}).strict().superRefine((lease, context) => {
  if (lease.leaseExpiresAt.getTime() <= lease.claimedAt.getTime()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["leaseExpiresAt"] });
  }
});
const CompletionSchemaV1 = z.object({
  completedAt: z.date(),
  freedBytes: z.number().int().nonnegative().refine(Number.isSafeInteger),
}).strict();

export const ProjectChapterConcatCleanupOutboxSchemaV1 = z.object({
  _id: z.string().regex(CLEANUP_OUTBOX_ID),
  schemaVersion: z.literal(1),
  descriptor: ProjectChapterConcatCleanupDescriptorSchemaV1,
  status: z.enum(["PENDING", "RUNNING", "DONE"]),
  attempts: z.number().int().nonnegative(),
  availableAt: z.date(),
  lease: LeaseSchemaV1.optional(),
  completion: CompletionSchemaV1.optional(),
  lastError: z.string().min(1).max(200).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
}).strict().superRefine((outbox, context) => {
  if (outbox._id !== outbox.descriptor.descriptorId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["_id"] });
  }
  if (outbox.status === "RUNNING" && !outbox.lease) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["lease"] });
  }
  if (outbox.status !== "RUNNING" && outbox.lease) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["lease"] });
  }
  if (outbox.status === "DONE" && !outbox.completion) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["completion"] });
  }
  if (outbox.status !== "DONE" && outbox.completion) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["completion"] });
  }
});
export type ProjectChapterConcatCleanupOutboxV1 = z.infer<
  typeof ProjectChapterConcatCleanupOutboxSchemaV1
>;

function descriptorHashV1(descriptor: Record<string, unknown>): string {
  const identity = { ...descriptor };
  delete identity.createdAt;
  delete identity.descriptorId;
  delete identity.descriptorHash;
  return hashEditronCanonicalJsonV1(identity);
}
function cleanupTimeV1(nowInput: Date | undefined): Date {
  const now = nowInput ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_TIME_INVALID");
  return now;
}

type BindingInputV1 =
  | { binding: ProjectRenderSnapshotBindingV1 }
  | { projectRenderSnapshotBinding: ProjectRenderSnapshotBindingV1 };
type OutputInputV1 =
  | { output: { url: string; sizeBytes: number } }
  | { outputUrl: string; outputSizeBytes: number }
  | { url: string; sizeBytes: number };
export type ProjectChapterConcatCleanupOutboxInputV1 = BindingInputV1 & OutputInputV1 & {
  parentAdmissionId: string;
  generation: string;
  sourceManifestHash: string;
  outputBucket: string;
  outputRegion: string;
  outputKey: string;
  versionId?: string;
  now?: Date;
};

function outputFromInputV1(input: ProjectChapterConcatCleanupOutboxInputV1) {
  if ("output" in input) return input.output;
  if ("outputUrl" in input) return { url: input.outputUrl, sizeBytes: input.outputSizeBytes };
  return { url: input.url, sizeBytes: input.sizeBytes };
}

export function createProjectChapterConcatCleanupOutboxV1(
  input: ProjectChapterConcatCleanupOutboxInputV1,
): ProjectChapterConcatCleanupOutboxV1 {
  const now = cleanupTimeV1(input.now);
  const binding = "binding" in input ? input.binding : input.projectRenderSnapshotBinding;
  assertProjectRenderSnapshotBindingV1(binding);
  const output = outputFromInputV1(input);
  const versionId = input.versionId === undefined ? undefined : input.versionId.trim();
  const unsigned = ProjectChapterConcatCleanupDescriptorUnsignedSchemaV1.parse({
    schemaVersion: 1,
    scope: PROJECT_CHAPTER_CONCAT_CLEANUP_SCOPE_V1,
    artifactKind: PROJECT_CHAPTER_CONCAT_CLEANUP_ARTIFACT_KIND_V1,
    provider: "AWS_S3",
    credentialScopeId: PROJECT_CHAPTER_CONCAT_CLEANUP_CREDENTIAL_SCOPE_ID_V1,
    binding: cloneCanonicalEditronJsonV1(binding),
    parentAdmissionId: input.parentAdmissionId.trim(),
    generation: input.generation.trim(),
    sourceManifestHash: input.sourceManifestHash.trim(),
    outputBucket: input.outputBucket.trim(),
    outputRegion: input.outputRegion.trim(),
    outputKey: input.outputKey.trim(),
    ...(versionId === undefined ? {} : { versionId }),
    output: { url: output.url.trim(), sizeBytes: output.sizeBytes },
    createdAt: now.toISOString(),
  });
  const descriptorHash = descriptorHashV1(unsigned);
  const descriptor = ProjectChapterConcatCleanupDescriptorSchemaV1.parse({
    ...unsigned,
    descriptorId: `project-chapter-concat-cleanup_${descriptorHash}`,
    descriptorHash,
  });
  const outbox: ProjectChapterConcatCleanupOutboxV1 = {
    _id: descriptor.descriptorId,
    schemaVersion: 1,
    descriptor,
    status: "PENDING",
    attempts: 0,
    availableAt: now,
    createdAt: now,
    updatedAt: now,
  };
  assertProjectChapterConcatCleanupOutboxV1(outbox);
  return outbox;
}

export function createProjectChapterConcatCleanupOutboxFromTargetV1(input: {
  target: ProjectChapterConcatTargetV1;
  result: {
    generation: string;
    sourceManifestHash: string;
    outputBucket: string;
    outputRegion: string;
    outputKey: string;
    url: string;
    sizeBytes: number;
  };
  versionId?: string;
  now?: Date;
}): ProjectChapterConcatCleanupOutboxV1 {
  assertProjectChapterConcatTargetV1(input.target);
  const { target, result } = input;
  if (
    result.generation !== target.generation
    || result.sourceManifestHash !== target.sourceManifestHash
    || result.outputBucket !== target.outputBucket
    || result.outputRegion !== target.outputRegion
    || result.outputKey !== target.outputKey
    || result.url !== projectChapterConcatOutputUrlV1(target)
    || !Number.isSafeInteger(result.sizeBytes)
    || result.sizeBytes < 0
  ) throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_RESULT_IDENTITY_MISMATCH");
  return createProjectChapterConcatCleanupOutboxV1({
    binding: target.projectRenderSnapshotBinding,
    parentAdmissionId: target.parentAdmissionId,
    generation: target.generation,
    sourceManifestHash: target.sourceManifestHash,
    outputBucket: target.outputBucket,
    outputRegion: target.outputRegion,
    outputKey: target.outputKey,
    outputUrl: result.url,
    outputSizeBytes: result.sizeBytes,
    versionId: input.versionId,
    now: input.now,
  });
}
export const createChapterConcatCleanupOutboxV1 = createProjectChapterConcatCleanupOutboxV1;
export function assertProjectChapterConcatCleanupDescriptorV1(
  input: unknown,
): asserts input is ProjectChapterConcatCleanupDescriptorV1 {
  const parsed = ProjectChapterConcatCleanupDescriptorSchemaV1.safeParse(input);
  if (!parsed.success) throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_DESCRIPTOR_INVALID");
  assertProjectRenderSnapshotBindingV1(parsed.data.binding);
  if (descriptorHashV1(parsed.data) !== parsed.data.descriptorHash) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_DESCRIPTOR_HASH_MISMATCH");
  }
}
export function assertProjectChapterConcatCleanupOutboxV1(
  input: unknown,
): asserts input is ProjectChapterConcatCleanupOutboxV1 {
  const parsed = ProjectChapterConcatCleanupOutboxSchemaV1.safeParse(input);
  if (!parsed.success) throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX_INVALID");
  assertProjectChapterConcatCleanupDescriptorV1(parsed.data.descriptor);
}

export async function enqueueProjectChapterConcatCleanupOutboxV1(input: {
  outbox: ProjectChapterConcatCleanupOutboxV1;
  collection: Collection<ProjectChapterConcatCleanupOutboxV1>;
  session?: ClientSession;
}): Promise<void> {
  assertProjectChapterConcatCleanupOutboxV1(input.outbox);
  const persisted = await input.collection.updateOne(
    { _id: input.outbox._id, "descriptor.descriptorHash": input.outbox.descriptor.descriptorHash },
    { $setOnInsert: structuredClone(input.outbox) },
    input.session ? { upsert: true, session: input.session } : { upsert: true },
  );
  if (persisted.matchedCount !== 1 && persisted.upsertedCount !== 1) {
    throw new Error("PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX_WRITE_UNPROVED");
  }
}
