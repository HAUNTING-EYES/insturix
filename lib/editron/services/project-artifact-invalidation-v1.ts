import { z } from "zod";

import {
  cloneCanonicalEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from "./canonical-json-v1";

/**
 * The artifact invalidation owner is deliberately separate from the project
 * document.  ProjectService issues the decision and this record is the
 * durable, retryable hand-off to every artifact owner.  A receipt is not an
 * authorization token until every required derivative class has been fenced.
 */
export const PROJECT_ARTIFACT_INVALIDATION_OUTBOX_COLLECTION_V1 =
  "editron_project_artifact_invalidation_outbox_v1" as const;

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_ID = /^[A-Za-z0-9_.:-]{1,500}$/;
const PROJECT_ID_MAX_LENGTH = 200;
const OWNER_ID_MAX_LENGTH = 200;

const ProjectArtifactInvalidationDerivativeClassSchema = z.enum([
  "RENDERED_PREVIEW",
  "DELIVERY_PROOF",
]);
export type ProjectArtifactInvalidationDerivativeClassV1 = z.infer<
  typeof ProjectArtifactInvalidationDerivativeClassSchema
>;

const ProjectArtifactProjectRevisionSchema = z.object({
  schemaVersion: z.literal(1),
  value: z.number().int().nonnegative(),
  compatibilityUpdatedAt: z.string().datetime(),
}).strict();
type ProjectArtifactProjectRevisionV1 = z.infer<
  typeof ProjectArtifactProjectRevisionSchema
>;

const ProjectArtifactTargetSchema = z.object({
  overlayId: z.number().int().nonnegative(),
  expectedAssetId: z.string().min(1).max(500),
  exactFrameRange: z.object({
    startFrame: z.number().int().nonnegative(),
    endFrame: z.number().int().positive(),
  }).strict().superRefine((range, context) => {
    if (range.endFrame <= range.startFrame) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endFrame"],
        message: "The exact artifact range must have a positive duration.",
      });
    }
  }),
  targetFingerprint: z.string().regex(HEX_SHA256),
}).strict();
export type ProjectArtifactTargetV1 = z.infer<typeof ProjectArtifactTargetSchema>;

export const ProjectArtifactBindingSchema = z.object({
  schemaVersion: z.literal(1),
  artifactKind: ProjectArtifactInvalidationDerivativeClassSchema,
  /** Immutable identity of the job/artifact, never a URL or mutable pointer. */
  artifactId: z.string().regex(ARTIFACT_ID),
  ownerId: z.string().min(1).max(OWNER_ID_MAX_LENGTH),
  projectId: z.string().min(1).max(PROJECT_ID_MAX_LENGTH),
  projectRevision: ProjectArtifactProjectRevisionSchema,
  target: ProjectArtifactTargetSchema,
  bindingHash: z.string().regex(HEX_SHA256),
}).strict();
export type ProjectArtifactBindingV1 = z.infer<typeof ProjectArtifactBindingSchema>;

export const ProjectArtifactStateSchema = z.enum([
  "ACTIVE",
  "STALE",
  "HISTORY_ONLY",
]);
type ProjectArtifactStateV1 = z.infer<typeof ProjectArtifactStateSchema>;

export const ProjectArtifactCleanupSchema = z.object({
  state: z.enum(["NOT_REQUIRED", "PENDING", "DONE"]),
  pendingArtifactIds: z.array(z.string().regex(ARTIFACT_ID)),
}).strict();
type ProjectArtifactCleanupV1 = z.infer<typeof ProjectArtifactCleanupSchema>;

const ProjectArtifactInvalidationFenceSchema = z.object({
  schemaVersion: z.literal(1),
  binding: ProjectArtifactBindingSchema,
  priorState: z.literal("ACTIVE"),
  nextState: z.enum(["STALE", "HISTORY_ONLY"]),
  cleanup: z.literal("PENDING"),
  fencedAt: z.string().datetime(),
}).strict();
export type ProjectArtifactInvalidationFenceV1 = z.infer<
  typeof ProjectArtifactInvalidationFenceSchema
>;

const ProjectArtifactInvalidationReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().regex(/^artifact-invalidation_[a-f0-9]{64}$/),
  admissionId: z.string().regex(/^pipeline-video-invalidation_[a-f0-9]{64}$/),
  admissionHash: z.string().regex(HEX_SHA256),
  ownerId: z.string().min(1).max(OWNER_ID_MAX_LENGTH),
  projectId: z.string().min(1).max(PROJECT_ID_MAX_LENGTH),
  beforeRevision: ProjectArtifactProjectRevisionSchema,
  afterRevision: ProjectArtifactProjectRevisionSchema,
  target: ProjectArtifactTargetSchema,
  affectedDerivativeClasses: z.array(ProjectArtifactInvalidationDerivativeClassSchema)
    .min(1)
    .max(2),
  receiptHash: z.string().regex(HEX_SHA256),
}).strict().superRefine((receipt, context) => {
  if (receipt.afterRevision.value !== receipt.beforeRevision.value + 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["afterRevision", "value"],
      message: "Artifact invalidation must advance exactly one project revision.",
    });
  }
  if (new Set(receipt.affectedDerivativeClasses).size !== receipt.affectedDerivativeClasses.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["affectedDerivativeClasses"],
      message: "Artifact derivative classes must be unique.",
    });
  }
});
export type ProjectArtifactInvalidationReceiptV1 = z.infer<
  typeof ProjectArtifactInvalidationReceiptSchema
>;

export const ProjectArtifactInvalidationLinkSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().regex(/^artifact-invalidation_[a-f0-9]{64}$/),
  receiptHash: z.string().regex(HEX_SHA256),
  state: z.enum(["PENDING", "MATERIALIZED"]),
}).strict();
type ProjectArtifactInvalidationLinkV1 = z.infer<
  typeof ProjectArtifactInvalidationLinkSchema
>;

const ProjectArtifactInvalidationOutboxSchema = z.object({
  /** Mongo stores the deterministic outbox ID as _id for duplicate safety. */
  _id: z.string().optional(),
  schemaVersion: z.literal(1),
  outboxId: z.string().regex(/^artifact-invalidation_[a-f0-9]{64}$/),
  receipt: ProjectArtifactInvalidationReceiptSchema,
  status: z.enum(["PENDING", "MATERIALIZED"]),
  resolvedDerivativeClasses: z.array(ProjectArtifactInvalidationDerivativeClassSchema),
  pendingDerivativeClasses: z.array(ProjectArtifactInvalidationDerivativeClassSchema),
  fencedArtifacts: z.array(ProjectArtifactInvalidationFenceSchema),
  cleanup: z.object({
    state: z.enum(["PENDING", "DONE"]),
    pendingArtifactIds: z.array(z.string().regex(ARTIFACT_ID)),
  }).strict(),
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  outboxHash: z.string().regex(HEX_SHA256),
}).strict().superRefine((outbox, context) => {
  if (outbox.outboxId !== outbox.receipt.receiptId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["outboxId"],
      message: "Outbox identity must equal its immutable receipt identity.",
    });
  }
  if (outbox._id !== undefined && outbox._id !== outbox.outboxId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["_id"],
      message: "Mongo outbox identity must equal outboxId.",
    });
  }
  if (outbox.status === "MATERIALIZED" && outbox.pendingDerivativeClasses.length !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pendingDerivativeClasses"],
      message: "A materialized invalidation cannot retain pending derivative classes.",
    });
  }
  if (new Set(outbox.resolvedDerivativeClasses).size !== outbox.resolvedDerivativeClasses.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resolvedDerivativeClasses"],
      message: "Resolved derivative classes must be unique.",
    });
  }
  if (new Set(outbox.pendingDerivativeClasses).size !== outbox.pendingDerivativeClasses.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pendingDerivativeClasses"],
      message: "Pending derivative classes must be unique.",
    });
  }
});
export type ProjectArtifactInvalidationOutboxV1 = z.infer<
  typeof ProjectArtifactInvalidationOutboxSchema
>;

export interface ProjectArtifactInvalidationOutboxCollectionV1 {
  findOne(
    filter: Record<string, unknown>,
  ): Promise<ProjectArtifactInvalidationOutboxV1 | null>;
  insertOne(
    document: ProjectArtifactInvalidationOutboxV1,
  ): Promise<{ acknowledged?: boolean }>;
  replaceOne(
    filter: Record<string, unknown>,
    replacement: ProjectArtifactInvalidationOutboxV1,
  ): Promise<{ matchedCount: number; modifiedCount?: number }>;
}

export function projectArtifactInvalidationReceiptHashV1(
  input: Omit<ProjectArtifactInvalidationReceiptV1, "receiptHash" | "receiptId">,
): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    admissionId: input.admissionId,
    admissionHash: input.admissionHash,
    ownerId: input.ownerId,
    projectId: input.projectId,
    beforeRevision: input.beforeRevision,
    afterRevision: input.afterRevision,
    target: input.target,
    affectedDerivativeClasses: input.affectedDerivativeClasses,
  });
}

export function projectArtifactInvalidationOutboxHashV1(
  input: Omit<ProjectArtifactInvalidationOutboxV1, "outboxHash">,
): string {
  const { _id: _ignoredMongoId, ...canonical } = input;
  return hashEditronCanonicalJsonV1(canonical);
}

export function projectArtifactBindingHashV1(
  input: Omit<ProjectArtifactBindingV1, "bindingHash">,
): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    artifactKind: input.artifactKind,
    artifactId: input.artifactId,
    ownerId: input.ownerId,
    projectId: input.projectId,
    projectRevision: input.projectRevision,
    target: input.target,
  });
}

export function createProjectArtifactBindingV1(input: {
  artifactKind: ProjectArtifactInvalidationDerivativeClassV1;
  artifactId: string;
  ownerId: string;
  projectId: string;
  projectRevision: ProjectArtifactProjectRevisionV1;
  target: ProjectArtifactTargetV1;
}): ProjectArtifactBindingV1 {
  const unsigned = {
    schemaVersion: 1 as const,
    artifactKind: input.artifactKind,
    artifactId: input.artifactId,
    ownerId: input.ownerId,
    projectId: input.projectId,
    projectRevision: cloneCanonicalEditronJsonV1(input.projectRevision),
    target: cloneCanonicalEditronJsonV1(input.target),
  };
  const binding: ProjectArtifactBindingV1 = {
    ...unsigned,
    bindingHash: projectArtifactBindingHashV1(unsigned),
  };
  assertProjectArtifactBindingV1(binding);
  return binding;
}

export function assertProjectArtifactBindingV1(
  input: unknown,
): asserts input is ProjectArtifactBindingV1 {
  const parsed = ProjectArtifactBindingSchema.safeParse(input);
  if (!parsed.success || projectArtifactBindingHashV1(parsed.data) !== parsed.data.bindingHash) {
    throw new Error("PROJECT_ARTIFACT_BINDING_INVALID");
  }
}

export function createProjectArtifactInvalidationReceiptV1(input: {
  admissionId: string;
  admissionHash: string;
  ownerId: string;
  projectId: string;
  beforeRevision: ProjectArtifactProjectRevisionV1;
  afterRevision: ProjectArtifactProjectRevisionV1;
  target: ProjectArtifactTargetV1;
  affectedDerivativeClasses: readonly ProjectArtifactInvalidationDerivativeClassV1[];
}): ProjectArtifactInvalidationReceiptV1 {
  const unsigned = {
    schemaVersion: 1 as const,
    admissionId: input.admissionId,
    admissionHash: input.admissionHash,
    ownerId: input.ownerId,
    projectId: input.projectId,
    beforeRevision: cloneCanonicalEditronJsonV1(input.beforeRevision),
    afterRevision: cloneCanonicalEditronJsonV1(input.afterRevision),
    target: cloneCanonicalEditronJsonV1(input.target),
    affectedDerivativeClasses: [...input.affectedDerivativeClasses],
  };
  const receiptHash = projectArtifactInvalidationReceiptHashV1(unsigned);
  const receipt: ProjectArtifactInvalidationReceiptV1 = {
    ...unsigned,
    receiptId: `artifact-invalidation_${receiptHash}`,
    receiptHash,
  };
  assertProjectArtifactInvalidationReceiptV1(receipt);
  return receipt;
}

export function assertProjectArtifactInvalidationReceiptV1(
  input: unknown,
): asserts input is ProjectArtifactInvalidationReceiptV1 {
  const parsed = ProjectArtifactInvalidationReceiptSchema.safeParse(input);
  if (!parsed.success) throw new Error("PROJECT_ARTIFACT_INVALIDATION_RECEIPT_INVALID");
  const { receiptHash, receiptId: _receiptId, ...unsigned } = parsed.data;
  if (
    projectArtifactInvalidationReceiptHashV1(unsigned) !== receiptHash
    || parsed.data.receiptId !== `artifact-invalidation_${receiptHash}`
  ) {
    throw new Error("PROJECT_ARTIFACT_INVALIDATION_RECEIPT_HASH_MISMATCH");
  }
}

export function createProjectArtifactInvalidationOutboxV1(input: {
  receipt: ProjectArtifactInvalidationReceiptV1;
  now?: Date;
}): ProjectArtifactInvalidationOutboxV1 {
  assertProjectArtifactInvalidationReceiptV1(input.receipt);
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("PROJECT_ARTIFACT_INVALIDATION_TIME_INVALID");
  const classes = [...input.receipt.affectedDerivativeClasses];
  const unsigned = {
    schemaVersion: 1 as const,
    outboxId: input.receipt.receiptId,
    receipt: cloneCanonicalEditronJsonV1(input.receipt),
    status: "PENDING" as const,
    resolvedDerivativeClasses: [] as ProjectArtifactInvalidationDerivativeClassV1[],
    pendingDerivativeClasses: classes,
    fencedArtifacts: [] as ProjectArtifactInvalidationFenceV1[],
    cleanup: {
      state: "PENDING" as const,
      pendingArtifactIds: [] as string[],
    },
    attempts: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const outbox: ProjectArtifactInvalidationOutboxV1 = {
    ...unsigned,
    outboxHash: projectArtifactInvalidationOutboxHashV1(unsigned),
  };
  assertProjectArtifactInvalidationOutboxV1(outbox);
  return outbox;
}

export function assertProjectArtifactInvalidationOutboxV1(
  input: unknown,
): asserts input is ProjectArtifactInvalidationOutboxV1 {
  const parsed = ProjectArtifactInvalidationOutboxSchema.safeParse(input);
  if (!parsed.success) throw new Error("PROJECT_ARTIFACT_INVALIDATION_OUTBOX_INVALID");
  assertProjectArtifactInvalidationReceiptV1(parsed.data.receipt);
  const { outboxHash, ...unsigned } = parsed.data;
  if (projectArtifactInvalidationOutboxHashV1(unsigned) !== outboxHash) {
    throw new Error("PROJECT_ARTIFACT_INVALIDATION_OUTBOX_HASH_MISMATCH");
  }
  const affected = new Set(parsed.data.receipt.affectedDerivativeClasses);
  for (const derivativeClass of [
    ...parsed.data.resolvedDerivativeClasses,
    ...parsed.data.pendingDerivativeClasses,
  ]) {
    if (!affected.has(derivativeClass)) {
      throw new Error("PROJECT_ARTIFACT_INVALIDATION_DERIVATIVE_CLASS_MISMATCH");
    }
  }
  if (new Set([
    ...parsed.data.resolvedDerivativeClasses,
    ...parsed.data.pendingDerivativeClasses,
  ]).size !== affected.size) {
    throw new Error("PROJECT_ARTIFACT_INVALIDATION_DERIVATIVE_CLASS_COVERAGE_INVALID");
  }
  const seenArtifactIds = new Set<string>();
  for (const fence of parsed.data.fencedArtifacts) {
    assertProjectArtifactInvalidationFenceV1(fence, parsed.data.receipt);
    if (seenArtifactIds.has(fence.binding.artifactId)) {
      throw new Error("PROJECT_ARTIFACT_INVALIDATION_ARTIFACT_ID_NOT_UNIQUE");
    }
    seenArtifactIds.add(fence.binding.artifactId);
  }
  const cleanupIds = new Set(parsed.data.cleanup.pendingArtifactIds);
  for (const artifactId of seenArtifactIds) {
    if (!cleanupIds.has(artifactId)) {
      throw new Error("PROJECT_ARTIFACT_INVALIDATION_CLEANUP_COVERAGE_INVALID");
    }
  }
}

function assertProjectArtifactInvalidationFenceV1(
  input: unknown,
  receipt: ProjectArtifactInvalidationReceiptV1,
): asserts input is ProjectArtifactInvalidationFenceV1 {
  assertProjectArtifactInvalidationReceiptV1(receipt);
  const parsed = ProjectArtifactInvalidationFenceSchema.safeParse(input);
  if (!parsed.success) throw new Error("PROJECT_ARTIFACT_INVALIDATION_FENCE_INVALID");
  const { binding } = parsed.data;
  if (
    binding.ownerId !== receipt.ownerId
    || binding.projectId !== receipt.projectId
    || !sameRevisionV1(binding.projectRevision, receipt.beforeRevision)
    || !sameTargetV1(binding.target, receipt.target)
    || !receipt.affectedDerivativeClasses.includes(binding.artifactKind)
  ) {
    throw new Error("PROJECT_ARTIFACT_INVALIDATION_FENCE_SCOPE_MISMATCH");
  }
}

/**
 * Apply one worker checkpoint.  This function is pure so retries can safely
 * replay the exact same fence report.  A class with no active rows must be
 * explicitly reported in resolvedDerivativeClasses; absence is never treated
 * as an empty registry.
 */
export function applyProjectArtifactInvalidationProgressV1(input: {
  outbox: ProjectArtifactInvalidationOutboxV1;
  fences?: readonly ProjectArtifactInvalidationFenceV1[];
  resolvedDerivativeClasses?: readonly ProjectArtifactInvalidationDerivativeClassV1[];
  now?: Date;
}): ProjectArtifactInvalidationOutboxV1 {
  assertProjectArtifactInvalidationOutboxV1(input.outbox);
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("PROJECT_ARTIFACT_INVALIDATION_TIME_INVALID");

  const fences = input.fences ?? [];
  const nextFences = [...input.outbox.fencedArtifacts];
  const existingById = new Map(nextFences.map((fence) => [fence.binding.artifactId, fence]));
  let changed = false;
  for (const fence of fences) {
    assertProjectArtifactInvalidationFenceV1(fence, input.outbox.receipt);
    const existing = existingById.get(fence.binding.artifactId);
    if (existing) {
      if (existing.binding.bindingHash !== fence.binding.bindingHash) {
        throw new Error("PROJECT_ARTIFACT_INVALIDATION_FENCE_REPLAY_MISMATCH");
      }
      continue;
    }
    existingById.set(fence.binding.artifactId, fence);
    nextFences.push(cloneCanonicalEditronJsonV1(fence));
    changed = true;
  }

  const resolved = new Set(input.outbox.resolvedDerivativeClasses);
  for (const derivativeClass of input.resolvedDerivativeClasses ?? []) {
    if (!input.outbox.receipt.affectedDerivativeClasses.includes(derivativeClass)) {
      throw new Error("PROJECT_ARTIFACT_INVALIDATION_DERIVATIVE_CLASS_MISMATCH");
    }
    if (!resolved.has(derivativeClass)) changed = true;
    resolved.add(derivativeClass);
  }
  if (!changed) return structuredClone(input.outbox);

  const affected = input.outbox.receipt.affectedDerivativeClasses;
  const resolvedDerivativeClasses = affected.filter((item) => resolved.has(item));
  const pendingDerivativeClasses = affected.filter((item) => !resolved.has(item));
  const pendingArtifactIds = nextFences.map((fence) => fence.binding.artifactId);
  const unsigned = {
    ...input.outbox,
    resolvedDerivativeClasses,
    pendingDerivativeClasses,
    fencedArtifacts: nextFences,
    status: pendingDerivativeClasses.length === 0 ? "MATERIALIZED" as const : "PENDING" as const,
    cleanup: {
      state: input.outbox.cleanup.state === "DONE" ? "DONE" as const : "PENDING" as const,
      pendingArtifactIds,
    },
    attempts: input.outbox.attempts + 1,
    updatedAt: now.toISOString(),
  };
  const { outboxHash: _outboxHash, ...withoutHash } = unsigned;
  const next: ProjectArtifactInvalidationOutboxV1 = {
    ...withoutHash,
    outboxHash: projectArtifactInvalidationOutboxHashV1(withoutHash),
  };
  assertProjectArtifactInvalidationOutboxV1(next);
  return next;
}

export function canAuthorizeProjectArtifactInvalidationV1(
  outbox: ProjectArtifactInvalidationOutboxV1,
): boolean {
  assertProjectArtifactInvalidationOutboxV1(outbox);
  return outbox.status === "MATERIALIZED" && outbox.pendingDerivativeClasses.length === 0;
}

export function projectArtifactBindingMatchesInvalidationV1(
  binding: ProjectArtifactBindingV1,
  receipt: ProjectArtifactInvalidationReceiptV1,
): boolean {
  try {
    assertProjectArtifactBindingV1(binding);
    assertProjectArtifactInvalidationReceiptV1(receipt);
  } catch {
    return false;
  }
  return binding.ownerId === receipt.ownerId
    && binding.projectId === receipt.projectId
    && sameRevisionV1(binding.projectRevision, receipt.beforeRevision)
    && sameTargetV1(binding.target, receipt.target)
    && receipt.affectedDerivativeClasses.includes(binding.artifactKind);
}

export function projectArtifactBindingMatchesCurrentV1(
  binding: ProjectArtifactBindingV1,
  expected: {
    artifactKind: ProjectArtifactInvalidationDerivativeClassV1;
    artifactId: string;
    ownerId: string;
    projectId: string;
    projectRevision: ProjectArtifactProjectRevisionV1;
    target: ProjectArtifactTargetV1;
  },
): boolean {
  try {
    assertProjectArtifactBindingV1(binding);
    ProjectArtifactInvalidationDerivativeClassSchema.parse(expected.artifactKind);
    ProjectArtifactProjectRevisionSchema.parse(expected.projectRevision);
    ProjectArtifactTargetSchema.parse(expected.target);
  } catch {
    return false;
  }
  return binding.artifactKind === expected.artifactKind
    && binding.artifactId === expected.artifactId
    && binding.ownerId === expected.ownerId
    && binding.projectId === expected.projectId
    && sameRevisionV1(binding.projectRevision, expected.projectRevision)
    && sameTargetV1(binding.target, expected.target);
}

/**
 * Insert the deterministic outbox document using Mongo's unique _id.  The
 * duplicate path verifies the immutable receipt hash, so a forged replay can
 * never replace the original work item.
 */
export async function enqueueProjectArtifactInvalidationOutboxV1(input: {
  outbox: ProjectArtifactInvalidationOutboxV1;
  collection: ProjectArtifactInvalidationOutboxCollectionV1;
}): Promise<{
  disposition: "ENQUEUED" | "ALREADY_ENQUEUED";
  outbox: ProjectArtifactInvalidationOutboxV1;
}> {
  assertProjectArtifactInvalidationOutboxV1(input.outbox);
  const document = {
    ...cloneCanonicalEditronJsonV1(input.outbox),
    _id: input.outbox.outboxId,
  };
  const existing = await input.collection.findOne({ _id: input.outbox.outboxId });
  if (existing) {
    assertProjectArtifactInvalidationOutboxV1(existing);
    if (existing.outboxHash !== input.outbox.outboxHash) {
      throw new Error("PROJECT_ARTIFACT_INVALIDATION_OUTBOX_REPLAY_MISMATCH");
    }
    return { disposition: "ALREADY_ENQUEUED", outbox: structuredClone(existing) };
  }
  try {
    await input.collection.insertOne(document);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const raced = await input.collection.findOne({ _id: input.outbox.outboxId });
    if (!raced) throw new Error("PROJECT_ARTIFACT_INVALIDATION_OUTBOX_DUPLICATE_UNVERIFIABLE");
    assertProjectArtifactInvalidationOutboxV1(raced);
    if (raced.outboxHash !== input.outbox.outboxHash) {
      throw new Error("PROJECT_ARTIFACT_INVALIDATION_OUTBOX_REPLAY_MISMATCH");
    }
    return { disposition: "ALREADY_ENQUEUED", outbox: structuredClone(raced) };
  }
  return { disposition: "ENQUEUED", outbox: document };
}

export async function replaceProjectArtifactInvalidationOutboxV1(input: {
  expected: ProjectArtifactInvalidationOutboxV1;
  next: ProjectArtifactInvalidationOutboxV1;
  collection: ProjectArtifactInvalidationOutboxCollectionV1;
}): Promise<"APPLIED" | "ALREADY_APPLIED" | "CAS_LOST"> {
  assertProjectArtifactInvalidationOutboxV1(input.expected);
  assertProjectArtifactInvalidationOutboxV1(input.next);
  if (
    input.expected.outboxId !== input.next.outboxId
    || input.expected.receipt.receiptHash !== input.next.receipt.receiptHash
  ) {
    throw new Error("PROJECT_ARTIFACT_INVALIDATION_OUTBOX_SCOPE_MISMATCH");
  }
  const result = await input.collection.replaceOne(
    { _id: input.expected.outboxId, outboxHash: input.expected.outboxHash },
    { ...input.next, _id: input.next.outboxId },
  );
  if (result.matchedCount === 1) return "APPLIED";
  const current = await input.collection.findOne({ _id: input.expected.outboxId });
  if (current?.outboxHash === input.next.outboxHash) return "ALREADY_APPLIED";
  return "CAS_LOST";
}

function sameRevisionV1(
  left: ProjectArtifactProjectRevisionV1,
  right: ProjectArtifactProjectRevisionV1,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function sameTargetV1(
  left: ProjectArtifactTargetV1,
  right: ProjectArtifactTargetV1,
): boolean {
  return left.overlayId === right.overlayId
    && left.expectedAssetId === right.expectedAssetId
    && left.exactFrameRange.startFrame === right.exactFrameRange.startFrame
    && left.exactFrameRange.endFrame === right.exactFrameRange.endFrame
    && left.targetFingerprint === right.targetFingerprint;
}

function isDuplicateKeyError(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === 11000;
}
