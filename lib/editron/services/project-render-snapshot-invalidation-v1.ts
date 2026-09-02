import { z } from "zod";

import {
  cloneCanonicalEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from "./canonical-json-v1";
import {
  ProjectArtifactInvalidationDerivativeClassSchema,
  ProjectArtifactProjectRevisionSchema,
  sameProjectArtifactRevisionV1,
  type ProjectArtifactInvalidationDerivativeClassV1,
  type ProjectArtifactProjectRevisionV1,
} from "./project-artifact-invalidation-v1";

export const PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1 =
  "editron_project_render_snapshot_invalidation_outbox_v1" as const;

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const RECEIPT_ID = /^project-snapshot-invalidation_[a-f0-9]{64}$/;
const MAX_IDENTIFIER_LENGTH = 200;
const ACTIVATION_TTL_MS = 5 * 60 * 1000;

export const PROJECT_RENDER_SNAPSHOT_DERIVATIVE_CLASSES_V1 = [
  "RENDERED_PREVIEW",
  "DELIVERY_PROOF",
] as const satisfies readonly ProjectArtifactInvalidationDerivativeClassV1[];

const ReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().regex(RECEIPT_ID),
  receiptHash: z.string().regex(HEX_SHA256),
  ownerId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  projectId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  operation: z.string().min(1).max(100),
  beforeRevision: ProjectArtifactProjectRevisionSchema,
  afterRevision: ProjectArtifactProjectRevisionSchema,
  affectedDerivativeClasses: z.array(ProjectArtifactInvalidationDerivativeClassSchema)
    .length(PROJECT_RENDER_SNAPSHOT_DERIVATIVE_CLASSES_V1.length),
  issuedAt: z.string().datetime(),
  activationExpiresAt: z.string().datetime(),
}).strict().superRefine((receipt, context) => {
  if (receipt.afterRevision.value !== receipt.beforeRevision.value + 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["afterRevision", "value"],
      message: "Snapshot invalidation must advance exactly one project revision.",
    });
  }
  if (new Date(receipt.activationExpiresAt).getTime() <= new Date(receipt.issuedAt).getTime()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["activationExpiresAt"],
      message: "Snapshot invalidation activation expiry must follow issuance.",
    });
  }
  if (!sameStringArray(
    receipt.affectedDerivativeClasses,
    PROJECT_RENDER_SNAPSHOT_DERIVATIVE_CLASSES_V1,
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["affectedDerivativeClasses"],
      message: "Snapshot invalidation must cover every current project-render derivative class.",
    });
  }
});

export type ProjectRenderSnapshotInvalidationReceiptV1 = z.infer<typeof ReceiptSchema>;

export const ProjectRenderSnapshotInvalidationLinkSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  invalidationId: z.string().regex(RECEIPT_ID),
  receiptHash: z.string().regex(HEX_SHA256),
  beforeRevision: ProjectArtifactProjectRevisionSchema,
  afterRevision: ProjectArtifactProjectRevisionSchema,
}).strict().superRefine((link, context) => {
  if (link.afterRevision.value !== link.beforeRevision.value + 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["afterRevision", "value"],
      message: "Snapshot invalidation link must advance exactly one project revision.",
    });
  }
});
export type ProjectRenderSnapshotInvalidationLinkV1 = z.infer<
  typeof ProjectRenderSnapshotInvalidationLinkSchemaV1
>;

const OutboxSchema = z.object({
  _id: z.string().regex(RECEIPT_ID).optional(),
  schemaVersion: z.literal(1),
  outboxId: z.string().regex(RECEIPT_ID),
  receipt: ReceiptSchema,
  status: z.enum(["AWAITING_PROJECT_COMMIT", "PENDING", "MATERIALIZED", "ABANDONED"]),
  resolvedDerivativeClasses: z.array(ProjectArtifactInvalidationDerivativeClassSchema),
  pendingDerivativeClasses: z.array(ProjectArtifactInvalidationDerivativeClassSchema),
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  outboxHash: z.string().regex(HEX_SHA256),
}).strict();
export type ProjectRenderSnapshotInvalidationOutboxV1 = z.infer<typeof OutboxSchema>;

export interface ProjectRenderSnapshotInvalidationOutboxCollectionV1 {
  findOne(filter: Record<string, unknown>): Promise<ProjectRenderSnapshotInvalidationOutboxV1 | null>;
  insertOne(document: ProjectRenderSnapshotInvalidationOutboxV1): Promise<{ acknowledged?: boolean }>;
  replaceOne(
    filter: Record<string, unknown>,
    replacement: ProjectRenderSnapshotInvalidationOutboxV1,
  ): Promise<{ matchedCount: number; modifiedCount?: number }>;
}

export function createProjectRenderSnapshotInvalidationReceiptV1(input: {
  ownerId: string;
  projectId: string;
  operation: string;
  beforeRevision: ProjectArtifactProjectRevisionV1;
  afterRevision: ProjectArtifactProjectRevisionV1;
  issuedAt?: Date;
}): ProjectRenderSnapshotInvalidationReceiptV1 {
  const issuedAt = input.issuedAt ?? new Date();
  if (Number.isNaN(issuedAt.getTime())) throw new Error("PROJECT_SNAPSHOT_INVALIDATION_TIME_INVALID");
  const unsigned = {
    schemaVersion: 1 as const,
    ownerId: input.ownerId,
    projectId: input.projectId,
    operation: input.operation,
    beforeRevision: cloneCanonicalEditronJsonV1(input.beforeRevision),
    afterRevision: cloneCanonicalEditronJsonV1(input.afterRevision),
    affectedDerivativeClasses: [...PROJECT_RENDER_SNAPSHOT_DERIVATIVE_CLASSES_V1],
    issuedAt: issuedAt.toISOString(),
    activationExpiresAt: new Date(issuedAt.getTime() + ACTIVATION_TTL_MS).toISOString(),
  };
  const receiptHash = hashEditronCanonicalJsonV1(unsigned);
  const receipt = {
    ...unsigned,
    receiptId: `project-snapshot-invalidation_${receiptHash}`,
    receiptHash,
  };
  assertProjectRenderSnapshotInvalidationReceiptV1(receipt);
  return receipt;
}

export function assertProjectRenderSnapshotInvalidationReceiptV1(
  input: unknown,
): asserts input is ProjectRenderSnapshotInvalidationReceiptV1 {
  const parsed = ReceiptSchema.safeParse(input);
  if (!parsed.success) throw new Error("PROJECT_SNAPSHOT_INVALIDATION_RECEIPT_INVALID");
  const { receiptId: _receiptId, receiptHash, ...unsigned } = parsed.data;
  if (
    hashEditronCanonicalJsonV1(unsigned) !== receiptHash
    || parsed.data.receiptId !== `project-snapshot-invalidation_${receiptHash}`
  ) {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_RECEIPT_HASH_MISMATCH");
  }
}

export function projectRenderSnapshotInvalidationLinkV1(
  receipt: ProjectRenderSnapshotInvalidationReceiptV1,
): ProjectRenderSnapshotInvalidationLinkV1 {
  assertProjectRenderSnapshotInvalidationReceiptV1(receipt);
  return {
    schemaVersion: 1,
    invalidationId: receipt.receiptId,
    receiptHash: receipt.receiptHash,
    beforeRevision: cloneCanonicalEditronJsonV1(receipt.beforeRevision),
    afterRevision: cloneCanonicalEditronJsonV1(receipt.afterRevision),
  };
}

export function createProjectRenderSnapshotInvalidationOutboxV1(
  receipt: ProjectRenderSnapshotInvalidationReceiptV1,
): ProjectRenderSnapshotInvalidationOutboxV1 {
  assertProjectRenderSnapshotInvalidationReceiptV1(receipt);
  return sealOutbox({
    _id: receipt.receiptId,
    schemaVersion: 1,
    outboxId: receipt.receiptId,
    receipt: cloneCanonicalEditronJsonV1(receipt),
    status: "AWAITING_PROJECT_COMMIT",
    resolvedDerivativeClasses: [],
    pendingDerivativeClasses: [...receipt.affectedDerivativeClasses],
    attempts: 0,
    createdAt: receipt.issuedAt,
    updatedAt: receipt.issuedAt,
  });
}

export function activateProjectRenderSnapshotInvalidationOutboxV1(input: {
  outbox: ProjectRenderSnapshotInvalidationOutboxV1;
  committedLink?: ProjectRenderSnapshotInvalidationLinkV1;
  now?: Date;
}): ProjectRenderSnapshotInvalidationOutboxV1 {
  assertProjectRenderSnapshotInvalidationOutboxV1(input.outbox);
  if (input.committedLink) {
    assertProjectRenderSnapshotInvalidationLinkMatchesReceiptV1(
      input.committedLink,
      input.outbox.receipt,
    );
  }
  if (input.outbox.status !== "AWAITING_PROJECT_COMMIT") return structuredClone(input.outbox);
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("PROJECT_SNAPSHOT_INVALIDATION_TIME_INVALID");
  if (input.committedLink) {
    return sealOutbox({
      ...withoutOutboxHash(input.outbox),
      status: "PENDING",
      attempts: input.outbox.attempts + 1,
      updatedAt: now.toISOString(),
    });
  }
  if (now.getTime() < new Date(input.outbox.receipt.activationExpiresAt).getTime()) {
    return structuredClone(input.outbox);
  }
  return sealOutbox({
    ...withoutOutboxHash(input.outbox),
    status: "ABANDONED",
    pendingDerivativeClasses: [],
    attempts: input.outbox.attempts + 1,
    updatedAt: now.toISOString(),
  });
}

export function applyProjectRenderSnapshotInvalidationProgressV1(input: {
  outbox: ProjectRenderSnapshotInvalidationOutboxV1;
  resolvedDerivativeClasses: readonly ProjectArtifactInvalidationDerivativeClassV1[];
  now?: Date;
}): ProjectRenderSnapshotInvalidationOutboxV1 {
  assertProjectRenderSnapshotInvalidationOutboxV1(input.outbox);
  if (input.outbox.status === "MATERIALIZED") {
    if (input.resolvedDerivativeClasses.every((item) => (
      input.outbox.resolvedDerivativeClasses.includes(item)
    ))) return structuredClone(input.outbox);
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_NOT_ACTIVE");
  }
  if (input.outbox.status !== "PENDING") {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_NOT_ACTIVE");
  }
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("PROJECT_SNAPSHOT_INVALIDATION_TIME_INVALID");
  const resolved = new Set(input.outbox.resolvedDerivativeClasses);
  for (const derivativeClass of input.resolvedDerivativeClasses) {
    ProjectArtifactInvalidationDerivativeClassSchema.parse(derivativeClass);
    if (!input.outbox.receipt.affectedDerivativeClasses.includes(derivativeClass)) {
      throw new Error("PROJECT_SNAPSHOT_INVALIDATION_DERIVATIVE_CLASS_MISMATCH");
    }
    resolved.add(derivativeClass);
  }
  const resolvedDerivativeClasses = input.outbox.receipt.affectedDerivativeClasses
    .filter((item) => resolved.has(item));
  const pendingDerivativeClasses = input.outbox.receipt.affectedDerivativeClasses
    .filter((item) => !resolved.has(item));
  return sealOutbox({
    ...withoutOutboxHash(input.outbox),
    status: pendingDerivativeClasses.length === 0 ? "MATERIALIZED" : "PENDING",
    resolvedDerivativeClasses,
    pendingDerivativeClasses,
    attempts: input.outbox.attempts + 1,
    updatedAt: now.toISOString(),
  });
}

export async function enqueueProjectRenderSnapshotInvalidationOutboxV1(input: {
  outbox: ProjectRenderSnapshotInvalidationOutboxV1;
  collection: ProjectRenderSnapshotInvalidationOutboxCollectionV1;
}): Promise<ProjectRenderSnapshotInvalidationOutboxV1> {
  assertProjectRenderSnapshotInvalidationOutboxV1(input.outbox);
  const existing = await input.collection.findOne({ _id: input.outbox.outboxId });
  if (existing) {
    assertProjectRenderSnapshotInvalidationOutboxV1(existing);
    if (existing.receipt.receiptHash !== input.outbox.receipt.receiptHash) {
      throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_REPLAY_MISMATCH");
    }
    return structuredClone(existing);
  }
  try {
    const inserted = await input.collection.insertOne(structuredClone(input.outbox));
    if (inserted.acknowledged === false) {
      throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_INSERT_FAILED");
    }
    return structuredClone(input.outbox);
  } catch (error) {
    const raced = await input.collection.findOne({ _id: input.outbox.outboxId });
    if (!raced) throw error;
    assertProjectRenderSnapshotInvalidationOutboxV1(raced);
    if (raced.receipt.receiptHash !== input.outbox.receipt.receiptHash) {
      throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_REPLAY_MISMATCH");
    }
    return structuredClone(raced);
  }
}

export async function replaceProjectRenderSnapshotInvalidationOutboxV1(input: {
  expected: ProjectRenderSnapshotInvalidationOutboxV1;
  next: ProjectRenderSnapshotInvalidationOutboxV1;
  collection: ProjectRenderSnapshotInvalidationOutboxCollectionV1;
}): Promise<ProjectRenderSnapshotInvalidationOutboxV1> {
  assertProjectRenderSnapshotInvalidationOutboxV1(input.expected);
  assertProjectRenderSnapshotInvalidationOutboxV1(input.next);
  if (input.expected.outboxId !== input.next.outboxId
    || input.expected.receipt.receiptHash !== input.next.receipt.receiptHash) {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_SCOPE_MISMATCH");
  }
  if (input.expected.outboxHash === input.next.outboxHash) return structuredClone(input.expected);
  const result = await input.collection.replaceOne(
    { _id: input.expected.outboxId, outboxHash: input.expected.outboxHash },
    structuredClone(input.next),
  );
  if (result.matchedCount === 1) return structuredClone(input.next);
  const latest = await input.collection.findOne({ _id: input.expected.outboxId });
  if (!latest) throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_MISSING");
  assertProjectRenderSnapshotInvalidationOutboxV1(latest);
  if (latest.outboxHash === input.next.outboxHash) return structuredClone(latest);
  throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_CONFLICT");
}

export function assertProjectRenderSnapshotInvalidationOutboxV1(
  input: unknown,
): asserts input is ProjectRenderSnapshotInvalidationOutboxV1 {
  const parsed = OutboxSchema.safeParse(input);
  if (!parsed.success) throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_INVALID");
  assertProjectRenderSnapshotInvalidationReceiptV1(parsed.data.receipt);
  if (parsed.data._id !== undefined && parsed.data._id !== parsed.data.outboxId) {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_ID_MISMATCH");
  }
  if (parsed.data.outboxId !== parsed.data.receipt.receiptId) {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_RECEIPT_MISMATCH");
  }
  const { outboxHash, ...unsigned } = parsed.data;
  if (hashEditronCanonicalJsonV1(unsigned) !== outboxHash) {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_HASH_MISMATCH");
  }
  const resolved = new Set(parsed.data.resolvedDerivativeClasses);
  const pending = new Set(parsed.data.pendingDerivativeClasses);
  if (resolved.size !== parsed.data.resolvedDerivativeClasses.length
    || pending.size !== parsed.data.pendingDerivativeClasses.length
    || parsed.data.resolvedDerivativeClasses.some((item) => pending.has(item))) {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_COVERAGE_INVALID");
  }
  const covered = new Set([
    ...parsed.data.resolvedDerivativeClasses,
    ...parsed.data.pendingDerivativeClasses,
  ]);
  const abandoned = parsed.data.status === "ABANDONED";
  if ((!abandoned && (
    covered.size !== parsed.data.receipt.affectedDerivativeClasses.length
    || parsed.data.receipt.affectedDerivativeClasses.some((item) => !covered.has(item))
  )) || (abandoned && covered.size !== 0)) {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_COVERAGE_INVALID");
  }
  if (parsed.data.status === "MATERIALIZED" && parsed.data.pendingDerivativeClasses.length > 0) {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_OUTBOX_STATE_INVALID");
  }
}

function assertProjectRenderSnapshotInvalidationLinkMatchesReceiptV1(
  link: ProjectRenderSnapshotInvalidationLinkV1,
  receipt: ProjectRenderSnapshotInvalidationReceiptV1,
): void {
  const parsed = ProjectRenderSnapshotInvalidationLinkSchemaV1.safeParse(link);
  if (!parsed.success
    || parsed.data.invalidationId !== receipt.receiptId
    || parsed.data.receiptHash !== receipt.receiptHash
    || !sameProjectArtifactRevisionV1(parsed.data.beforeRevision, receipt.beforeRevision)
    || !sameProjectArtifactRevisionV1(parsed.data.afterRevision, receipt.afterRevision)) {
    throw new Error("PROJECT_SNAPSHOT_INVALIDATION_COMMIT_LINK_MISMATCH");
  }
}

function sealOutbox(
  unsigned: Omit<ProjectRenderSnapshotInvalidationOutboxV1, "outboxHash">,
): ProjectRenderSnapshotInvalidationOutboxV1 {
  const outbox = {
    ...unsigned,
    outboxHash: hashEditronCanonicalJsonV1(unsigned),
  };
  assertProjectRenderSnapshotInvalidationOutboxV1(outbox);
  return outbox;
}

function withoutOutboxHash(
  outbox: ProjectRenderSnapshotInvalidationOutboxV1,
): Omit<ProjectRenderSnapshotInvalidationOutboxV1, "outboxHash"> {
  const { outboxHash: _outboxHash, ...unsigned } = outbox;
  return unsigned;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
