import type { Db } from "mongodb";

import { COLLECTIONS, getDatabase } from "../db/mongodb";
import {
  assertProjectWholeStateMediaPrerequisiteReceiptV1,
  type ProjectWholeStateMediaPrerequisiteReceiptV1,
} from "./project-whole-state-media-prerequisite-contract-v1";
import { PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1 } from
  "./project-whole-state-media-prerequisite-persistence-v1";

export { PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1 } from
  "./project-whole-state-media-prerequisite-persistence-v1";

export const PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_INITIAL_GRACE_MS_V1 =
  24 * 60 * 60 * 1_000;
export const PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_RECHECK_MS_V1 =
  24 * 60 * 60 * 1_000;
export const PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_QUARANTINE_MS_V1 =
  30 * 24 * 60 * 60 * 1_000;
export const MAX_PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_RETENTION_BATCH_V1 = 25;
export const DEFAULT_PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_RETENTION_BATCH_V1 = 10;

export type ProjectWholeStateMediaPrerequisiteRetentionStatusV1 =
  | "PENDING_REFERENCE"
  | "PINNED"
  | "QUARANTINED";

export interface ProjectWholeStateMediaPrerequisiteRetentionStateV1 {
  schemaVersion: 1;
  status: ProjectWholeStateMediaPrerequisiteRetentionStatusV1;
  checkedAt: Date;
  nextCheckAt: Date;
  expiresAt?: Date;
}

export interface StoredProjectWholeStateMediaPrerequisiteV1 {
  _id: string;
  receipt: ProjectWholeStateMediaPrerequisiteReceiptV1;
  createdAt: Date;
  retention?: ProjectWholeStateMediaPrerequisiteRetentionStateV1;
}

export interface ProjectWholeStateMediaPrerequisiteRetentionStoreV1 {
  listCandidates(input: {
    limit: number;
    legacyCreatedBefore: Date;
    now: Date;
  }): Promise<StoredProjectWholeStateMediaPrerequisiteV1[]>;
  hasAuthoritativeReference(receiptSha256: string): Promise<boolean>;
  recordRetention(input: {
    candidate: StoredProjectWholeStateMediaPrerequisiteV1;
    retention: ProjectWholeStateMediaPrerequisiteRetentionStateV1;
  }): Promise<void>;
}

export interface ProjectWholeStateMediaPrerequisiteRetentionResultV1 {
  scanned: number;
  pinned: number;
  quarantined: number;
  recovered: number;
  errors: number;
  results: Array<{
    receiptSha256: string;
    disposition: "PINNED" | "QUARANTINED" | "RECOVERED" | "ERROR";
    errorCode?: string;
  }>;
}

function retentionLimitV1(limit: number | undefined): number {
  const value = limit ?? DEFAULT_PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_RETENTION_BATCH_V1;
  if (!Number.isSafeInteger(value) || value <= 0
    || value > MAX_PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_RETENTION_BATCH_V1) {
    throw new Error("PROJECT_WHOLE_STATE_MEDIA_RETENTION_LIMIT_INVALID");
  }
  return value;
}

function assertDateV1(value: unknown, code: string): asserts value is Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(code);
  }
}

function assertCandidateV1(
  value: StoredProjectWholeStateMediaPrerequisiteV1,
): ProjectWholeStateMediaPrerequisiteReceiptV1 {
  assertDateV1(value.createdAt, "PROJECT_WHOLE_STATE_MEDIA_RETENTION_CREATED_AT_INVALID");
  const receipt = assertProjectWholeStateMediaPrerequisiteReceiptV1(value.receipt);
  if (value._id !== receipt.receiptSha256) {
    throw new Error("PROJECT_WHOLE_STATE_MEDIA_RETENTION_RECEIPT_ID_MISMATCH");
  }
  if (value.retention !== undefined) {
    assertProjectWholeStateMediaPrerequisiteRetentionStateV1(value.retention);
  }
  return receipt;
}

export function assertProjectWholeStateMediaPrerequisiteRetentionStateV1(
  value: unknown,
): asserts value is ProjectWholeStateMediaPrerequisiteRetentionStateV1 {
  if (!value || typeof value !== "object") {
    throw new Error("PROJECT_WHOLE_STATE_MEDIA_RETENTION_STATE_INVALID");
  }
  const retention = value as Partial<ProjectWholeStateMediaPrerequisiteRetentionStateV1>;
  assertDateV1(retention.checkedAt, "PROJECT_WHOLE_STATE_MEDIA_RETENTION_CHECKED_AT_INVALID");
  assertDateV1(retention.nextCheckAt, "PROJECT_WHOLE_STATE_MEDIA_RETENTION_NEXT_CHECK_INVALID");
  if (retention.schemaVersion !== 1
    || !["PENDING_REFERENCE", "PINNED", "QUARANTINED"].includes(retention.status ?? "")
    || retention.nextCheckAt.getTime() <= retention.checkedAt.getTime()
    || (retention.status === "QUARANTINED") !== (retention.expiresAt instanceof Date)
    || (retention.expiresAt instanceof Date
      && (Number.isNaN(retention.expiresAt.getTime())
        || retention.expiresAt.getTime() <= retention.nextCheckAt.getTime()))) {
    throw new Error("PROJECT_WHOLE_STATE_MEDIA_RETENTION_STATE_INVALID");
  }
}

export function createProjectWholeStateMediaPrerequisitePendingRetentionV1(
  checkedAt: Date,
): ProjectWholeStateMediaPrerequisiteRetentionStateV1 {
  assertDateV1(checkedAt, "PROJECT_WHOLE_STATE_MEDIA_RETENTION_CHECKED_AT_INVALID");
  const retention: ProjectWholeStateMediaPrerequisiteRetentionStateV1 = {
    schemaVersion: 1,
    status: "PENDING_REFERENCE",
    checkedAt,
    nextCheckAt: new Date(
      checkedAt.getTime() + PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_INITIAL_GRACE_MS_V1,
    ),
  };
  assertProjectWholeStateMediaPrerequisiteRetentionStateV1(retention);
  return retention;
}

function boundedErrorCodeV1(error: unknown): string {
  return error instanceof Error && error.message.startsWith("PROJECT_WHOLE_STATE_MEDIA_")
    ? error.message.slice(0, 200)
    : "PROJECT_WHOLE_STATE_MEDIA_RETENTION_ITEM_FAILED";
}

export async function sweepProjectWholeStateMediaPrerequisiteRetentionV1(input: {
  store?: ProjectWholeStateMediaPrerequisiteRetentionStoreV1;
  limit?: number;
  now?: Date;
} = {}): Promise<ProjectWholeStateMediaPrerequisiteRetentionResultV1> {
  const limit = retentionLimitV1(input.limit);
  const now = input.now ?? new Date();
  assertDateV1(now, "PROJECT_WHOLE_STATE_MEDIA_RETENTION_TIME_INVALID");
  const store = input.store ?? createProjectWholeStateMediaPrerequisiteRetentionMongoStoreV1(
    await getDatabase(),
  );
  const candidates = await store.listCandidates({
    limit,
    legacyCreatedBefore: new Date(
      now.getTime() - PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_INITIAL_GRACE_MS_V1,
    ),
    now,
  });
  if (candidates.length > limit) {
    throw new Error("PROJECT_WHOLE_STATE_MEDIA_RETENTION_CANDIDATES_INVALID");
  }
  const result: ProjectWholeStateMediaPrerequisiteRetentionResultV1 = {
    scanned: candidates.length,
    pinned: 0,
    quarantined: 0,
    recovered: 0,
    errors: 0,
    results: [],
  };
  for (const candidate of candidates) {
    try {
      const receipt = assertCandidateV1(candidate);
      const referenced = await store.hasAuthoritativeReference(receipt.receiptSha256);
      const recovered = referenced && candidate.retention?.status === "QUARANTINED";
      const retention: ProjectWholeStateMediaPrerequisiteRetentionStateV1 = referenced
        ? {
            schemaVersion: 1,
            status: "PINNED",
            checkedAt: now,
            nextCheckAt: new Date(
              now.getTime() + PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_RECHECK_MS_V1,
            ),
          }
        : {
            schemaVersion: 1,
            status: "QUARANTINED",
            checkedAt: now,
            nextCheckAt: new Date(
              now.getTime() + PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_RECHECK_MS_V1,
            ),
            expiresAt: new Date(
              now.getTime() + PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_QUARANTINE_MS_V1,
            ),
          };
      assertProjectWholeStateMediaPrerequisiteRetentionStateV1(retention);
      await store.recordRetention({ candidate, retention });
      if (recovered) result.recovered += 1;
      else if (referenced) result.pinned += 1;
      else result.quarantined += 1;
      result.results.push({
        receiptSha256: receipt.receiptSha256,
        disposition: recovered ? "RECOVERED" : referenced ? "PINNED" : "QUARANTINED",
      });
    } catch (error) {
      result.errors += 1;
      result.results.push({
        receiptSha256: typeof candidate?._id === "string"
          ? candidate._id.slice(0, 64)
          : "INVALID_RECEIPT",
        disposition: "ERROR",
        errorCode: boundedErrorCodeV1(error),
      });
    }
  }
  return result;
}

export function createProjectWholeStateMediaPrerequisiteRetentionMongoStoreV1(
  db: Db,
): ProjectWholeStateMediaPrerequisiteRetentionStoreV1 {
  const receipts = db.collection<StoredProjectWholeStateMediaPrerequisiteV1>(
    PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1,
  );
  const projects = db.collection(COLLECTIONS.PROJECTS);
  const checkpoints = db.collection(COLLECTIONS.CHECKPOINTS);
  return {
    async listCandidates({ limit, legacyCreatedBefore, now }) {
      return receipts.find({
        $or: [
          { retention: { $exists: false }, createdAt: { $lte: legacyCreatedBefore } },
          { "retention.nextCheckAt": { $lte: now } },
        ],
      }).sort({ "retention.nextCheckAt": 1, createdAt: 1, _id: 1 }).limit(limit).toArray();
    },
    async hasAuthoritativeReference(receiptSha256) {
      const [project, checkpoint] = await Promise.all([
        projects.findOne({
          "timelineRangeChangeReceipts.wholeStateMediaPrerequisite.receiptSha256": receiptSha256,
        }, { projection: { _id: 1 } }),
        checkpoints.findOne({
          "wholeStateMediaPrerequisite.receiptSha256": receiptSha256,
        }, { projection: { _id: 1 } }),
      ]);
      return Boolean(project || checkpoint);
    },
    async recordRetention({ candidate, retention }) {
      const result = await receipts.updateOne(
        { _id: candidate._id, createdAt: candidate.createdAt },
        { $set: { retention } },
      );
      if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
        throw new Error("PROJECT_WHOLE_STATE_MEDIA_RETENTION_CAS_FAILED");
      }
    },
  };
}
