import { randomUUID } from "node:crypto";

import { deleteRender } from "@remotion/lambda/client";
import type { Collection } from "mongodb";

import { getDatabase } from "@/lib/editron/db/mongodb";
import { setAWSCredentials } from "@/lib/editron/utils/aws-credentials";
import {
  PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
  ProjectRenderSourceCleanupOutboxSchemaV1,
  assertProjectRenderSourceCleanupOutboxV1,
  type ProjectRenderSourceCleanupDescriptorV1,
  type ProjectRenderSourceCleanupOutboxV1,
} from "./project-render-source-cleanup-v1";

const DEFAULT_LEASE_MS = 5 * 60_000;
const MAX_LEASE_MS = 15 * 60_000;
const MAX_BATCH_SIZE = 10;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60_000;

type DeleteProviderRenderV1 = (input: {
  region: ProjectRenderSourceCleanupOutboxV1["descriptor"]["region"];
  bucketName: string;
  renderId: string;
}) => Promise<{ freedBytes: number }>;

export type ProjectRenderSourceCleanupBatchResultV1 = {
  claimed: number;
  completed: number;
  failed: number;
  results: Array<{
    outboxId: string;
    state: "DONE" | "RETRY_SCHEDULED";
    freedBytes?: number;
  }>;
};

function validDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function boundedLeaseMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LEASE_MS;
  if (!Number.isInteger(value) || value <= 0 || value > MAX_LEASE_MS) {
    throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_LEASE_INVALID");
  }
  return value;
}

function boundedBatchSize(value: number | undefined): number {
  if (value === undefined) return 5;
  if (!Number.isInteger(value) || value <= 0 || value > MAX_BATCH_SIZE) {
    throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_BATCH_SIZE_INVALID");
  }
  return value;
}

function sanitizedProviderError(error: unknown): string {
  const name = error instanceof Error && error.name.trim()
    ? error.name.trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80)
    : "UNKNOWN";
  return `PROJECT_RENDER_SOURCE_CLEANUP_PROVIDER_${name}`;
}

function retryDelayMs(attempts: number): number {
  return Math.min(
    MAX_RETRY_DELAY_MS,
    30_000 * (2 ** Math.max(0, Math.min(attempts - 1, 10))),
  );
}

/**
 * The descriptor schema has already validated the discriminator and all
 * provider coordinates. Keep the Remotion call limited to that exact tuple;
 * chapter concat output is never a deleteRender target.
 */
function exactProviderRenderDeleteInputV1(
  descriptor: ProjectRenderSourceCleanupDescriptorV1,
): Parameters<DeleteProviderRenderV1>[0] {
  switch (descriptor.artifactKind) {
    case "REMOTION_AWS_RENDER_OUTPUT":
    case "REMOTION_AWS_CHAPTER_CHILD_RENDER_OUTPUT":
      return {
        region: descriptor.region,
        bucketName: descriptor.bucketName,
        renderId: descriptor.providerRenderId,
      };
    default:
      throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_DESCRIPTOR_INVALID");
  }
}

async function cleanupCollection(): Promise<Collection<ProjectRenderSourceCleanupOutboxV1>> {
  const db = await getDatabase();
  return db.collection<ProjectRenderSourceCleanupOutboxV1>(
    PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
  );
}

export async function claimProjectRenderSourceCleanupV1(input: {
  collection?: Collection<ProjectRenderSourceCleanupOutboxV1>;
  claimToken?: string;
  leaseMs?: number;
  now?: Date;
} = {}): Promise<ProjectRenderSourceCleanupOutboxV1 | null> {
  const now = input.now ?? new Date();
  if (!validDate(now)) throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_TIME_INVALID");
  const claimToken = (input.claimToken ?? randomUUID()).trim();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(claimToken)) {
    throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_CLAIM_TOKEN_INVALID");
  }
  const leaseMs = boundedLeaseMs(input.leaseMs);
  const collection = input.collection ?? await cleanupCollection();
  const claimed = await collection.findOneAndUpdate(
    {
      $or: [
        { status: "PENDING", availableAt: { $lte: now } },
        { status: "RUNNING", "lease.leaseExpiresAt": { $lte: now } },
      ],
    },
    {
      $set: {
        status: "RUNNING",
        lease: {
          claimToken,
          claimedAt: now,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
        },
        updatedAt: now,
      },
      $inc: { attempts: 1 },
      $unset: { completion: "", lastError: "" },
    },
    {
      sort: { availableAt: 1, createdAt: 1, _id: 1 },
      returnDocument: "after",
    },
  );
  if (!claimed) return null;
  const parsed = ProjectRenderSourceCleanupOutboxSchemaV1.parse(claimed);
  assertProjectRenderSourceCleanupOutboxV1(parsed);
  return parsed;
}

export async function completeProjectRenderSourceCleanupV1(input: {
  outbox: ProjectRenderSourceCleanupOutboxV1;
  claimToken: string;
  freedBytes: number;
  collection?: Collection<ProjectRenderSourceCleanupOutboxV1>;
  now?: Date;
}): Promise<{ completedAt: Date; freedBytes: number }> {
  assertProjectRenderSourceCleanupOutboxV1(input.outbox);
  const completedAt = input.now ?? new Date();
  if (!validDate(completedAt) || !Number.isInteger(input.freedBytes) || input.freedBytes < 0) {
    throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_COMPLETION_INVALID");
  }
  const collection = input.collection ?? await cleanupCollection();
  const completion = { completedAt, freedBytes: input.freedBytes };
  const completed = await collection.updateOne(
    {
      _id: input.outbox._id,
      status: "RUNNING",
      "descriptor.descriptorHash": input.outbox.descriptor.descriptorHash,
      "lease.claimToken": input.claimToken,
    },
    {
      $set: { status: "DONE", completion, updatedAt: completedAt },
      $unset: { lease: "", lastError: "" },
    },
  );
  if (completed.modifiedCount === 1) return completion;
  const existing = await collection.findOne({ _id: input.outbox._id });
  if (
    existing?.status === "DONE"
    && existing.descriptor.descriptorHash === input.outbox.descriptor.descriptorHash
    && existing.completion
  ) {
    return existing.completion;
  }
  throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_COMPLETION_WRITE_UNPROVED");
}

export async function releaseProjectRenderSourceCleanupV1(input: {
  outbox: ProjectRenderSourceCleanupOutboxV1;
  claimToken: string;
  error: unknown;
  collection?: Collection<ProjectRenderSourceCleanupOutboxV1>;
  now?: Date;
}): Promise<Date> {
  assertProjectRenderSourceCleanupOutboxV1(input.outbox);
  const now = input.now ?? new Date();
  if (!validDate(now)) throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_TIME_INVALID");
  const availableAt = new Date(now.getTime() + retryDelayMs(input.outbox.attempts));
  const collection = input.collection ?? await cleanupCollection();
  const released = await collection.updateOne(
    {
      _id: input.outbox._id,
      status: "RUNNING",
      "descriptor.descriptorHash": input.outbox.descriptor.descriptorHash,
      "lease.claimToken": input.claimToken,
    },
    {
      $set: {
        status: "PENDING",
        availableAt,
        updatedAt: now,
        lastError: sanitizedProviderError(input.error),
      },
      $unset: { lease: "", completion: "" },
    },
  );
  if (released.modifiedCount !== 1) {
    throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_RELEASE_WRITE_UNPROVED");
  }
  return availableAt;
}

export async function runProjectRenderSourceCleanupBatchV1(input: {
  collection?: Collection<ProjectRenderSourceCleanupOutboxV1>;
  limit?: number;
  leaseMs?: number;
  now?: Date;
  prepareCredentials?: () => Promise<void>;
  deleteProviderRender?: DeleteProviderRenderV1;
} = {}): Promise<ProjectRenderSourceCleanupBatchResultV1> {
  const now = input.now ?? new Date();
  if (!validDate(now)) throw new Error("PROJECT_RENDER_SOURCE_CLEANUP_TIME_INVALID");
  const collection = input.collection ?? await cleanupCollection();
  const limit = boundedBatchSize(input.limit);
  const prepareCredentials = input.prepareCredentials ?? setAWSCredentials;
  const deleteProviderRender = input.deleteProviderRender ?? deleteRender;
  const result: ProjectRenderSourceCleanupBatchResultV1 = {
    claimed: 0,
    completed: 0,
    failed: 0,
    results: [],
  };

  for (let index = 0; index < limit; index += 1) {
    const claimToken = randomUUID();
    const outbox = await claimProjectRenderSourceCleanupV1({
      collection,
      claimToken,
      leaseMs: input.leaseMs,
      now,
    });
    if (!outbox) break;
    result.claimed += 1;
    try {
      await prepareCredentials();
      const deletion = await deleteProviderRender(
        exactProviderRenderDeleteInputV1(outbox.descriptor),
      );
      const completion = await completeProjectRenderSourceCleanupV1({
        outbox,
        claimToken,
        freedBytes: deletion.freedBytes,
        collection,
        now,
      });
      result.completed += 1;
      result.results.push({
        outboxId: outbox._id,
        state: "DONE",
        freedBytes: completion.freedBytes,
      });
    } catch (error: unknown) {
      await releaseProjectRenderSourceCleanupV1({
        outbox,
        claimToken,
        error,
        collection,
        now,
      });
      result.failed += 1;
      result.results.push({ outboxId: outbox._id, state: "RETRY_SCHEDULED" });
    }
  }
  return result;
}
