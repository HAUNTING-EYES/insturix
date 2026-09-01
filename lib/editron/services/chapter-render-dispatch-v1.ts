import type { Collection } from "mongodb";
import { z } from "zod";

import {
  assertProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from "./project-render-snapshot-binding-v1";
import { hashEditronCanonicalJsonV1 } from "./canonical-json-v1";

/**
 * One durable child-render attempt lives inside the aggregate chapter row.
 * The aggregate admission remains the parent authority; this owner only
 * fences a single child provider call and records the evidence needed for a
 * later signed/operator recovery path.
 */

export const CHAPTER_RENDER_DISPATCH_CHAPTERS_COLLECTION_V1 =
  "editron_render_chapters" as const;
export const CHAPTER_CHILD_DISPATCH_CONTRACT_VERSION_V1 = 1 as const;
export const CHAPTER_CHILD_DISPATCH_SCOPE_V1 = "CHAPTER_CHILD_RENDER" as const;

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const PARENT_ADMISSION_ID = /^chr_[A-Za-z0-9_-]{12}$/;
const PROVIDER_RENDER_ID = /^[A-Za-z0-9_-]{1,200}$/;
const AWS_BUCKET_NAME = /^(?!.*\.\.)(?!\d{1,3}(?:\.\d{1,3}){3}$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const AWS_REGION = /^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/;
const ATTEMPT_TOKEN = /^editron_chapter_child_attempt_v1_[a-f0-9]{64}$/;
const MAX_CHILD_INDEX = 100_000;

export const ChapterChildDispatchPhaseSchemaV1 = z.enum([
  "NOT_ATTEMPTED",
  "ATTEMPTING",
  "UNKNOWN",
  "BOUND",
]);
export type ChapterChildDispatchPhaseV1 = z.infer<
  typeof ChapterChildDispatchPhaseSchemaV1
>;

export const ChapterChildProviderTupleSchemaV1 = z.object({
  providerRenderId: z.string().regex(PROVIDER_RENDER_ID),
  bucketName: z.string().regex(AWS_BUCKET_NAME).refine(
    (value) => value !== "chapter-render",
    "The chapter aggregate is not a provider child output.",
  ),
  region: z.string().regex(AWS_REGION),
}).strict();
export type ChapterChildProviderTupleV1 = z.infer<
  typeof ChapterChildProviderTupleSchemaV1
>;

const ChapterChildDispatchUnsignedSchemaV1 = z.object({
  version: z.literal(CHAPTER_CHILD_DISPATCH_CONTRACT_VERSION_V1),
  scope: z.literal(CHAPTER_CHILD_DISPATCH_SCOPE_V1),
  phase: ChapterChildDispatchPhaseSchemaV1,
  parentAdmissionId: z.string().regex(PARENT_ADMISSION_ID),
  childIndex: z.number().int().nonnegative().max(MAX_CHILD_INDEX),
  bindingHash: z.string().regex(HEX_SHA256),
  attemptToken: z.string().regex(ATTEMPT_TOKEN),
  attemptStartedAt: z.date().optional(),
  providerAcceptedAt: z.date().optional(),
  providerBoundAt: z.date().optional(),
  unknownAt: z.date().optional(),
  unknownReason: z.string().min(1).max(1_000).optional(),
  providerRenderId: z.string().regex(PROVIDER_RENDER_ID).optional(),
  providerBucketName: z.string().regex(AWS_BUCKET_NAME).refine(
    (value) => value !== "chapter-render",
    "The chapter aggregate is not a provider child output.",
  ).optional(),
  providerRegion: z.string().regex(AWS_REGION).optional(),
}).strict();

export const ChapterChildDispatchSchemaV1 =
  ChapterChildDispatchUnsignedSchemaV1.superRefine((dispatch, context) => {
    const providerValues = [
      dispatch.providerRenderId,
      dispatch.providerBucketName,
      dispatch.providerRegion,
    ];
    const providerCount = providerValues.filter((value) => value !== undefined).length;
    if (providerCount !== 0 && providerCount !== providerValues.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerRenderId"],
        message: "Child provider identity must be an exact tuple.",
      });
    }

    if (dispatch.phase === "NOT_ATTEMPTED") {
      if (
        dispatch.attemptStartedAt
        || dispatch.providerAcceptedAt
        || dispatch.providerBoundAt
        || dispatch.unknownAt
        || dispatch.unknownReason
        || providerCount !== 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phase"],
          message: "A not-attempted child cannot carry attempt evidence.",
        });
      }
    }

    if (dispatch.phase === "ATTEMPTING" && !dispatch.attemptStartedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["attemptStartedAt"],
        message: "An attempting child requires a durable start timestamp.",
      });
    }

    if (
      dispatch.phase === "ATTEMPTING"
      && (
        providerCount !== 0
        || dispatch.providerAcceptedAt
        || dispatch.providerBoundAt
        || dispatch.unknownAt
        || dispatch.unknownReason
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phase"],
        message: "An attempting child cannot carry provider or unknown evidence.",
      });
    }

    if (dispatch.phase === "UNKNOWN") {
      if (!dispatch.unknownAt || !dispatch.unknownReason) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["unknownAt"],
          message: "An unknown child requires a timestamp and reason.",
        });
      }
      if (providerCount === 0 && dispatch.providerAcceptedAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["providerAcceptedAt"],
          message: "Unknown without a provider tuple cannot carry acceptance evidence.",
        });
      }
      if (providerCount === providerValues.length && !dispatch.attemptStartedAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attemptStartedAt"],
          message: "A retained child tuple requires a durable attempt timestamp.",
        });
      }
      if (providerCount === providerValues.length && !dispatch.providerAcceptedAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["providerAcceptedAt"],
          message: "A child tuple retained in UNKNOWN requires acceptance evidence.",
        });
      }
      if (dispatch.providerBoundAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["providerBoundAt"],
          message: "An unknown child cannot carry a bound timestamp.",
        });
      }
    }

    if (dispatch.phase === "BOUND") {
      if (
        !dispatch.attemptStartedAt
        || !dispatch.providerAcceptedAt
        || !dispatch.providerBoundAt
        || providerCount !== providerValues.length
        || dispatch.unknownAt
        || dispatch.unknownReason
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phase"],
          message: "A bound child requires complete provider and timestamp evidence.",
        });
      }
    }

    const attemptTime = dispatch.attemptStartedAt?.getTime();
    const acceptedTime = dispatch.providerAcceptedAt?.getTime();
    const boundTime = dispatch.providerBoundAt?.getTime();
    if (
      attemptTime !== undefined
      && acceptedTime !== undefined
      && acceptedTime < attemptTime
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerAcceptedAt"],
        message: "Provider acceptance cannot precede the durable attempt marker.",
      });
    }
    if (
      acceptedTime !== undefined
      && boundTime !== undefined
      && boundTime < acceptedTime
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerBoundAt"],
        message: "Provider binding cannot precede provider acceptance.",
      });
    }
  });
export type ChapterChildDispatchV1 = z.infer<
  typeof ChapterChildDispatchSchemaV1
>;

export type ChapterChildDispatchIdentityV1 = {
  attemptToken: string;
};

export type ChapterChildDispatchMutationResultV1 =
  | {
      ok: true;
      status: "CURRENT";
      phase: ChapterChildDispatchPhaseV1;
    }
  | {
      ok: false;
      status: "NOT_CURRENT";
      reason: ChapterChildDispatchNotCurrentReasonV1;
    };

export type ChapterChildDispatchNotCurrentReasonV1 =
  | "INPUT_INVALID"
  | "BINDING_INVALID"
  | "DISPATCH_NOT_READY"
  | "DISPATCH_LEDGER_INVALID";

type ChapterChildDispatchCollection = Collection<Record<string, unknown>>;

function validDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function validChildIndex(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_CHILD_INDEX;
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || "CHAPTER_RENDER_DISPATCH_UNKNOWN").slice(0, 1_000);
}

function inputString(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= maximum
    && !/[\u0000-\u001F\u007F]/.test(value);
}

function notCurrent(
  reason: ChapterChildDispatchNotCurrentReasonV1,
): ChapterChildDispatchMutationResultV1 {
  return { ok: false, status: "NOT_CURRENT", reason };
}

function current(phase: ChapterChildDispatchPhaseV1): ChapterChildDispatchMutationResultV1 {
  return { ok: true, status: "CURRENT", phase };
}

function transitionWriteWasProved(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const record = result as { acknowledged?: unknown; modifiedCount?: unknown };
  return record.acknowledged !== false && record.modifiedCount === 1;
}

function acknowledgedWriteWasReceived(result: unknown): boolean {
  return result !== null
    && typeof result === "object"
    && (result as { acknowledged?: unknown }).acknowledged !== false;
}

function hasMongoMatchCount(result: unknown): boolean {
  return result !== null
    && typeof result === "object"
    && "matchedCount" in result;
}

async function resolveCollection(
  collection?: ChapterChildDispatchCollection,
): Promise<ChapterChildDispatchCollection> {
  if (collection) return collection;
  const { getDatabase } = await import("@/lib/editron/db/mongodb");
  const db = await getDatabase();
  return db.collection<Record<string, unknown>>(
    CHAPTER_RENDER_DISPATCH_CHAPTERS_COLLECTION_V1,
  );
}

function bindingForParent(
  binding: unknown,
  parentAdmissionId: string,
): ProjectRenderSnapshotBindingV1 | null {
  if (!inputString(parentAdmissionId, 500) || !PARENT_ADMISSION_ID.test(parentAdmissionId.trim())) {
    return null;
  }
  try {
    assertProjectRenderSnapshotBindingV1(binding);
  } catch {
    return null;
  }
  const parsed = binding as ProjectRenderSnapshotBindingV1;
  return parsed.scope === "PROJECT_SNAPSHOT"
    && parsed.artifactId === parentAdmissionId.trim()
    ? parsed
    : null;
}

function preparedInput(input: {
  parentAdmissionId: string;
  childIndex: number;
  binding: unknown;
  attemptToken?: string;
}): {
  parentAdmissionId: string;
  childIndex: number;
  binding: ProjectRenderSnapshotBindingV1;
  identity: ChapterChildDispatchIdentityV1;
} | null {
  const parentAdmissionId = input.parentAdmissionId.trim();
  const binding = bindingForParent(input.binding, parentAdmissionId);
  if (!binding || !validChildIndex(input.childIndex)) return null;
  const identity = createChapterChildDispatchIdentityV1({
    parentAdmissionId,
    childIndex: input.childIndex,
    bindingHash: binding.bindingHash,
  });
  if (
    input.attemptToken !== undefined
    && (!inputString(input.attemptToken, 240) || input.attemptToken.trim() !== identity.attemptToken)
  ) {
    return null;
  }
  return {
    parentAdmissionId,
    childIndex: input.childIndex,
    binding,
    identity,
  };
}

function providerTuple(input: {
  providerRenderId: string;
  bucketName: string;
  region: string;
}): ChapterChildProviderTupleV1 | null {
  if (
    !inputString(input.providerRenderId, 200)
    || !inputString(input.bucketName, 100)
    || !inputString(input.region, 100)
  ) {
    return null;
  }
  const parsed = ChapterChildProviderTupleSchemaV1.safeParse({
    providerRenderId: input.providerRenderId.trim(),
    bucketName: input.bucketName.trim(),
    region: input.region.trim(),
  });
  return parsed.success ? parsed.data : null;
}

function tupleFilter(tuple: ChapterChildProviderTupleV1): Record<string, unknown> {
  return {
    "dispatch.providerRenderId": tuple.providerRenderId,
    "dispatch.providerBucketName": tuple.bucketName,
    "dispatch.providerRegion": tuple.region,
  };
}

function noTupleFilter(): Record<string, unknown> {
  return {
    "dispatch.providerRenderId": { $exists: false },
    "dispatch.providerBucketName": { $exists: false },
    "dispatch.providerRegion": { $exists: false },
  };
}

function parentBindingFilter(
  parentAdmissionId: string,
  binding: ProjectRenderSnapshotBindingV1,
): Record<string, unknown> {
  return {
    _id: parentAdmissionId,
    "projectRenderSnapshotBinding.scope": "PROJECT_SNAPSHOT",
    "projectRenderSnapshotBinding.artifactId": parentAdmissionId,
    "projectRenderSnapshotBinding.ownerId": binding.ownerId,
    "projectRenderSnapshotBinding.projectId": binding.projectId,
    "projectRenderSnapshotBinding.bindingHash": binding.bindingHash,
  };
}

async function proveBoundReplay(input: {
  collection: ChapterChildDispatchCollection;
  parentAdmissionId: string;
  childIndex: number;
  binding: ProjectRenderSnapshotBindingV1;
  identity: ChapterChildDispatchIdentityV1;
  bindingHash: string;
  tuple: ChapterChildProviderTupleV1;
}): Promise<boolean> {
  const replay = await input.collection.findOne(
    {
      ...parentBindingFilter(input.parentAdmissionId, input.binding),
      chapters: {
        $elemMatch: {
          index: input.childIndex,
          status: { $in: ["rendering", "completed"] },
          "dispatch.version": CHAPTER_CHILD_DISPATCH_CONTRACT_VERSION_V1,
          "dispatch.scope": CHAPTER_CHILD_DISPATCH_SCOPE_V1,
          "dispatch.phase": "BOUND",
          "dispatch.parentAdmissionId": input.parentAdmissionId,
          "dispatch.childIndex": input.childIndex,
          "dispatch.bindingHash": input.bindingHash,
          "dispatch.attemptToken": input.identity.attemptToken,
          "dispatch.attemptStartedAt": { $exists: true },
          "dispatch.providerAcceptedAt": { $exists: true },
          "dispatch.providerBoundAt": { $exists: true },
          ...tupleFilter(input.tuple),
          renderId: input.tuple.providerRenderId,
          bucketName: input.tuple.bucketName,
          region: input.tuple.region,
        },
      },
    } as never,
  );
  if (!replay || typeof replay !== "object") return false;
  const chapters = (replay as { chapters?: unknown }).chapters;
  if (!Array.isArray(chapters)) return false;
  return chapters.some((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const child = candidate as Record<string, unknown>;
    if (
      child.index !== input.childIndex
      || child.renderId !== input.tuple.providerRenderId
      || child.bucketName !== input.tuple.bucketName
      || child.region !== input.tuple.region
    ) {
      return false;
    }
    try {
      assertChapterChildDispatchV1(child.dispatch);
    } catch {
      return false;
    }
    const dispatch = child.dispatch as ChapterChildDispatchV1;
    return dispatch.phase === "BOUND"
      && dispatch.parentAdmissionId === input.parentAdmissionId
      && dispatch.childIndex === input.childIndex
      && dispatch.bindingHash === input.bindingHash
      && dispatch.attemptToken === input.identity.attemptToken
      && dispatch.providerRenderId === input.tuple.providerRenderId
      && dispatch.providerBucketName === input.tuple.bucketName
      && dispatch.providerRegion === input.tuple.region;
  });
}

export function createChapterChildDispatchIdentityV1(input: {
  parentAdmissionId: string;
  childIndex: number;
  bindingHash: string;
}): ChapterChildDispatchIdentityV1 {
  const parentAdmissionId = input.parentAdmissionId.trim();
  const bindingHash = input.bindingHash.trim();
  if (
    !PARENT_ADMISSION_ID.test(parentAdmissionId)
    || !validChildIndex(input.childIndex)
    || !HEX_SHA256.test(bindingHash)
  ) {
    throw new Error("CHAPTER_CHILD_DISPATCH_IDENTITY_INPUT_INVALID");
  }
  const digest = hashEditronCanonicalJsonV1({
    version: CHAPTER_CHILD_DISPATCH_CONTRACT_VERSION_V1,
    scope: CHAPTER_CHILD_DISPATCH_SCOPE_V1,
    parentAdmissionId,
    childIndex: input.childIndex,
    bindingHash,
  });
  return { attemptToken: `editron_chapter_child_attempt_v1_${digest}` };
}

export function createChapterChildDispatchV1(input: {
  parentAdmissionId: string;
  childIndex: number;
  bindingHash: string;
}): ChapterChildDispatchV1 {
  const parentAdmissionId = input.parentAdmissionId.trim();
  const bindingHash = input.bindingHash.trim();
  const identity = createChapterChildDispatchIdentityV1({
    parentAdmissionId,
    childIndex: input.childIndex,
    bindingHash,
  });
  const dispatch = ChapterChildDispatchSchemaV1.parse({
    version: CHAPTER_CHILD_DISPATCH_CONTRACT_VERSION_V1,
    scope: CHAPTER_CHILD_DISPATCH_SCOPE_V1,
    phase: "NOT_ATTEMPTED",
    parentAdmissionId,
    childIndex: input.childIndex,
    bindingHash,
    attemptToken: identity.attemptToken,
  });
  assertChapterChildDispatchV1(dispatch);
  return dispatch;
}

export function assertChapterChildDispatchV1(
  input: unknown,
): asserts input is ChapterChildDispatchV1 {
  const parsed = ChapterChildDispatchSchemaV1.safeParse(input);
  if (!parsed.success) throw new Error("CHAPTER_CHILD_DISPATCH_LEDGER_INVALID");
  const expected = createChapterChildDispatchIdentityV1({
    parentAdmissionId: parsed.data.parentAdmissionId,
    childIndex: parsed.data.childIndex,
    bindingHash: parsed.data.bindingHash,
  });
  if (parsed.data.attemptToken !== expected.attemptToken) {
    throw new Error("CHAPTER_CHILD_DISPATCH_ATTEMPT_TOKEN_MISMATCH");
  }
}

/**
 * Atomically persist ATTEMPTING and the child status transition. A returned
 * rejection proves the provider call must not begin; a thrown/unacknowledged
 * write is left to the caller's UNKNOWN quarantine path.
 */
export async function markChapterChildDispatchAttemptingV1(input: {
  parentAdmissionId: string;
  childIndex: number;
  binding: unknown;
  attemptToken: string;
  now?: Date;
  collection?: ChapterChildDispatchCollection;
}): Promise<ChapterChildDispatchMutationResultV1> {
  const prepared = preparedInput(input);
  if (!prepared || !inputString(input.attemptToken, 240)) {
    return notCurrent("INPUT_INVALID");
  }
  const now = input.now ?? new Date();
  if (!validDate(now)) return notCurrent("INPUT_INVALID");
  const collection = await resolveCollection(input.collection);
  const transitioned = await collection.updateOne(
    {
      ...parentBindingFilter(prepared.parentAdmissionId, prepared.binding),
      chapters: {
        $elemMatch: {
          index: prepared.childIndex,
          status: "pending",
          "dispatch.version": CHAPTER_CHILD_DISPATCH_CONTRACT_VERSION_V1,
          "dispatch.scope": CHAPTER_CHILD_DISPATCH_SCOPE_V1,
          "dispatch.phase": "NOT_ATTEMPTED",
          "dispatch.parentAdmissionId": prepared.parentAdmissionId,
          "dispatch.childIndex": prepared.childIndex,
          "dispatch.bindingHash": prepared.binding.bindingHash,
          "dispatch.attemptToken": prepared.identity.attemptToken,
          ...noTupleFilter(),
        },
      },
    } as never,
    {
      $set: {
        "chapters.$.status": "rendering",
        "chapters.$.dispatch.phase": "ATTEMPTING",
        "chapters.$.dispatch.attemptStartedAt": now,
        updatedAt: now,
      },
    },
  );
  if (!transitionWriteWasProved(transitioned)) {
    if (!acknowledgedWriteWasReceived(transitioned)) {
      throw new Error("CHAPTER_CHILD_DISPATCH_ATTEMPT_WRITE_UNPROVED");
    }
    if (hasMongoMatchCount(transitioned)) return notCurrent("DISPATCH_NOT_READY");
    throw new Error("CHAPTER_CHILD_DISPATCH_ATTEMPT_WRITE_UNPROVED");
  }
  return current("ATTEMPTING");
}

/**
 * Bind only the exact provider tuple returned after ATTEMPTING was durable.
 * UNKNOWN rows may be repaired only when they already retain that same tuple;
 * no provider invocation or automatic retry is performed here.
 */
export async function bindChapterChildDispatchV1(input: {
  parentAdmissionId: string;
  childIndex: number;
  binding: unknown;
  attemptToken: string;
  providerRenderId: string;
  bucketName: string;
  region: string;
  now?: Date;
  collection?: ChapterChildDispatchCollection;
}): Promise<ChapterChildDispatchMutationResultV1> {
  const prepared = preparedInput(input);
  const tuple = providerTuple(input);
  if (!prepared || !tuple || !inputString(input.attemptToken, 240)) {
    return notCurrent("INPUT_INVALID");
  }
  const now = input.now ?? new Date();
  if (!validDate(now)) return notCurrent("INPUT_INVALID");
  const collection = await resolveCollection(input.collection);
  const childIdentityFilter = {
    index: prepared.childIndex,
    status: { $in: ["rendering", "completed"] },
    "dispatch.version": CHAPTER_CHILD_DISPATCH_CONTRACT_VERSION_V1,
    "dispatch.scope": CHAPTER_CHILD_DISPATCH_SCOPE_V1,
    "dispatch.parentAdmissionId": prepared.parentAdmissionId,
    "dispatch.childIndex": prepared.childIndex,
    "dispatch.bindingHash": prepared.binding.bindingHash,
    "dispatch.attemptToken": prepared.identity.attemptToken,
  };
  const chapterTupleFilter = {
    $or: [
      {
        renderId: { $exists: false },
        bucketName: { $exists: false },
        region: tuple.region,
      },
      {
        renderId: tuple.providerRenderId,
        bucketName: tuple.bucketName,
        region: tuple.region,
      },
    ],
  };
  const unacceptedBound = await collection.updateOne(
    {
      ...parentBindingFilter(prepared.parentAdmissionId, prepared.binding),
      chapters: {
        $elemMatch: {
          ...childIdentityFilter,
          "dispatch.phase": { $in: ["ATTEMPTING", "UNKNOWN"] },
          ...noTupleFilter(),
          $and: [chapterTupleFilter],
        },
      },
    } as never,
    {
      $set: {
        "chapters.$.renderId": tuple.providerRenderId,
        "chapters.$.bucketName": tuple.bucketName,
        "chapters.$.region": tuple.region,
        "chapters.$.dispatch.phase": "BOUND",
        "chapters.$.dispatch.providerAcceptedAt": now,
        "chapters.$.dispatch.providerBoundAt": now,
        "chapters.$.dispatch.providerRenderId": tuple.providerRenderId,
        "chapters.$.dispatch.providerBucketName": tuple.bucketName,
        "chapters.$.dispatch.providerRegion": tuple.region,
        updatedAt: now,
      },
      $unset: {
        "chapters.$.dispatch.unknownAt": "",
        "chapters.$.dispatch.unknownReason": "",
      },
    },
  );
  if (transitionWriteWasProved(unacceptedBound)) return current("BOUND");
  if (!acknowledgedWriteWasReceived(unacceptedBound)) {
    throw new Error("CHAPTER_CHILD_DISPATCH_BIND_WRITE_UNPROVED");
  }

  const retainedBound = await collection.updateOne(
    {
      ...parentBindingFilter(prepared.parentAdmissionId, prepared.binding),
      chapters: {
        $elemMatch: {
          ...childIdentityFilter,
          "dispatch.phase": "UNKNOWN",
          ...tupleFilter(tuple),
          "dispatch.attemptStartedAt": { $exists: true },
          "dispatch.providerAcceptedAt": { $exists: true },
          $and: [chapterTupleFilter],
        },
      },
    } as never,
    {
      $set: {
        "chapters.$.renderId": tuple.providerRenderId,
        "chapters.$.bucketName": tuple.bucketName,
        "chapters.$.region": tuple.region,
        "chapters.$.dispatch.phase": "BOUND",
        "chapters.$.dispatch.providerBoundAt": now,
        "chapters.$.dispatch.providerRenderId": tuple.providerRenderId,
        "chapters.$.dispatch.providerBucketName": tuple.bucketName,
        "chapters.$.dispatch.providerRegion": tuple.region,
        updatedAt: now,
      },
      $unset: {
        "chapters.$.dispatch.unknownAt": "",
        "chapters.$.dispatch.unknownReason": "",
      },
    },
  );
  if (transitionWriteWasProved(retainedBound)) return current("BOUND");
  if (!acknowledgedWriteWasReceived(retainedBound)) {
    throw new Error("CHAPTER_CHILD_DISPATCH_BIND_WRITE_UNPROVED");
  }
  if (
    await proveBoundReplay({
      collection,
      parentAdmissionId: prepared.parentAdmissionId,
      childIndex: prepared.childIndex,
      binding: prepared.binding,
      identity: prepared.identity,
      bindingHash: prepared.binding.bindingHash,
      tuple,
    })
  ) {
    return current("BOUND");
  }
  if (hasMongoMatchCount(retainedBound) || hasMongoMatchCount(unacceptedBound)) {
    return notCurrent("DISPATCH_NOT_READY");
  }
  throw new Error("CHAPTER_CHILD_DISPATCH_BIND_WRITE_UNPROVED");
}

/**
 * Quarantine an uncertain marker/provider boundary. This owner never changes
 * BOUND back to UNKNOWN and never clears an already retained provider tuple.
 */
export async function quarantineChapterChildDispatchV1(input: {
  parentAdmissionId: string;
  childIndex: number;
  binding: unknown;
  attemptToken: string;
  error: unknown;
  providerRenderId?: string;
  bucketName?: string;
  region?: string;
  now?: Date;
  collection?: ChapterChildDispatchCollection;
}): Promise<ChapterChildDispatchMutationResultV1> {
  const prepared = preparedInput(input);
  if (!prepared || !inputString(input.attemptToken, 240)) {
    return notCurrent("INPUT_INVALID");
  }
  const hasProviderValue = input.providerRenderId !== undefined
    || input.bucketName !== undefined
    || input.region !== undefined;
  const tuple = hasProviderValue
    ? input.providerRenderId !== undefined
      && input.bucketName !== undefined
      && input.region !== undefined
      ? providerTuple({
          providerRenderId: input.providerRenderId,
          bucketName: input.bucketName,
          region: input.region,
        })
      : null
    : undefined;
  if (hasProviderValue && !tuple) return notCurrent("INPUT_INVALID");
  const now = input.now ?? new Date();
  if (!validDate(now)) return notCurrent("INPUT_INVALID");
  const collection = await resolveCollection(input.collection);
  const childIdentityFilter = {
    index: prepared.childIndex,
    status: { $in: ["pending", "rendering"] },
    "dispatch.version": CHAPTER_CHILD_DISPATCH_CONTRACT_VERSION_V1,
    "dispatch.scope": CHAPTER_CHILD_DISPATCH_SCOPE_V1,
    "dispatch.parentAdmissionId": prepared.parentAdmissionId,
    "dispatch.childIndex": prepared.childIndex,
    "dispatch.bindingHash": prepared.binding.bindingHash,
    "dispatch.attemptToken": prepared.identity.attemptToken,
  };
  const unknownUpdate = {
    $set: {
      "chapters.$.status": "rendering",
      "chapters.$.dispatch.phase": "UNKNOWN",
      "chapters.$.dispatch.unknownAt": now,
      "chapters.$.dispatch.unknownReason": errorText(input.error),
      updatedAt: now,
    },
    $unset: {
      "chapters.$.dispatch.providerBoundAt": "" as const,
    },
  };
  let quarantined = tuple
    ? await collection.updateOne(
        {
          ...parentBindingFilter(prepared.parentAdmissionId, prepared.binding),
          chapters: {
            $elemMatch: {
              ...childIdentityFilter,
              "dispatch.phase": { $in: ["ATTEMPTING", "UNKNOWN"] },
              "dispatch.attemptStartedAt": { $exists: true },
              ...noTupleFilter(),
            },
          },
        } as never,
        {
          ...unknownUpdate,
          $set: {
            ...unknownUpdate.$set,
            "chapters.$.renderId": tuple.providerRenderId,
            "chapters.$.bucketName": tuple.bucketName,
            "chapters.$.region": tuple.region,
            "chapters.$.dispatch.providerAcceptedAt": now,
            "chapters.$.dispatch.providerRenderId": tuple.providerRenderId,
            "chapters.$.dispatch.providerBucketName": tuple.bucketName,
            "chapters.$.dispatch.providerRegion": tuple.region,
          },
        },
      )
    : await collection.updateOne(
        {
          ...parentBindingFilter(prepared.parentAdmissionId, prepared.binding),
          chapters: {
            $elemMatch: {
              ...childIdentityFilter,
              "dispatch.phase": { $in: ["NOT_ATTEMPTED", "ATTEMPTING", "UNKNOWN"] },
              ...noTupleFilter(),
            },
          },
        } as never,
        unknownUpdate,
      );

  if (tuple && !transitionWriteWasProved(quarantined)) {
    if (!acknowledgedWriteWasReceived(quarantined)) {
      throw new Error("CHAPTER_CHILD_DISPATCH_UNKNOWN_WRITE_UNPROVED");
    }
    quarantined = await collection.updateOne(
      {
        ...parentBindingFilter(prepared.parentAdmissionId, prepared.binding),
        chapters: {
          $elemMatch: {
            ...childIdentityFilter,
            "dispatch.phase": { $in: ["ATTEMPTING", "UNKNOWN"] },
            ...tupleFilter(tuple),
            "dispatch.attemptStartedAt": { $exists: true },
            "dispatch.providerAcceptedAt": { $exists: true },
          },
        },
      } as never,
      {
        ...unknownUpdate,
        $set: {
          ...unknownUpdate.$set,
          "chapters.$.renderId": tuple.providerRenderId,
          "chapters.$.bucketName": tuple.bucketName,
          "chapters.$.region": tuple.region,
          "chapters.$.dispatch.providerRenderId": tuple.providerRenderId,
          "chapters.$.dispatch.providerBucketName": tuple.bucketName,
          "chapters.$.dispatch.providerRegion": tuple.region,
        },
      },
    );
  }

  if (!transitionWriteWasProved(quarantined)) {
    if (!acknowledgedWriteWasReceived(quarantined)) {
      throw new Error("CHAPTER_CHILD_DISPATCH_UNKNOWN_WRITE_UNPROVED");
    }
    if (hasMongoMatchCount(quarantined)) return notCurrent("DISPATCH_NOT_READY");
    throw new Error("CHAPTER_CHILD_DISPATCH_UNKNOWN_WRITE_UNPROVED");
  }
  return current("UNKNOWN");
}

export const recordChapterChildDispatchUnknownV1 = quarantineChapterChildDispatchV1;
