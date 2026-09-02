import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

import { runProjectRenderR2LiveProofV1 } from "./helpers/project-render-r2-live-proof-v1";

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: process.cwd(), encoding: "utf8",
}).trim();
const executedAt = new Date();
const fixtureNonce = randomUUID().replaceAll("-", "");
const ownerId = `stage25-live-owner-${fixtureNonce}`;
const requesterId = `stage25-live-requester-${fixtureNonce}`;
const projectId = `stage25-live-project-${fixtureNonce}`;
const jobId = `stage25-live-render-${fixtureNonce}`;

const atlas = await runAtlasProofV1();
const r2 = await runProjectRenderR2LiveProofV1(fixtureNonce);
const decision = atlas.status === "PASS" && r2.status === "PASS" ? "PASS" : "MODIFY";
const receipt = {
  schemaVersion: 1,
  scope: "PROJECT_RENDER_INVALIDATION_ATLAS_R2_LIVE_PROOF",
  sourceCommit,
  executedAt: executedAt.toISOString(),
  decision,
  atlas,
  r2,
};
const receiptHash = createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
console.log(JSON.stringify({ ...receipt, receiptHash }, null, 2));
if (decision !== "PASS") process.exitCode = 1;

async function runAtlasProofV1(): Promise<Record<string, unknown>> {
  let database: Awaited<ReturnType<typeof import(
    "../lib/editron/db/mongodb"
  ).connectToDatabase>> | null = null;
  let cleanupVerified = false;
  let outcome: Record<string, unknown> = {
    status: "FAIL",
    error: "ATLAS_PROOF_NOT_RUN",
    temporaryFixtureOnly: true,
  };
  try {
    const mongodb = await import("../lib/editron/db/mongodb");
    const { RenderJobDispatchSchema, createPendingRenderJob } = await import(
      "../lib/editron/schemas/render-job"
    );
    const { createProjectRenderSnapshotBindingV1 } = await import(
      "../lib/editron/services/project-render-snapshot-binding-v1"
    );
    const {
      createProjectRenderDispatchIdentityV1,
      PROJECT_RENDER_JOBS_COLLECTION_V1,
    } = await import("../lib/editron/services/render-job-service");
    const {
      createProjectRenderSnapshotInvalidationOutboxV1,
      createProjectRenderSnapshotInvalidationReceiptV1,
      enqueueProjectRenderSnapshotInvalidationOutboxV1,
      projectRenderSnapshotInvalidationLinkV1,
      PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1,
    } = await import("../lib/editron/services/project-render-snapshot-invalidation-v1");
    const { runProjectRenderSnapshotInvalidationWorkerV1 } = await import("../lib/editron/services/project-render-snapshot-invalidation-worker-v1");
    const { materializeProjectRenderSnapshotInvalidationCleanupV1 } = await import("../lib/editron/services/project-render-snapshot-invalidation-cleanup-v1");
    const { PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1 } = await import("../lib/editron/services/project-render-source-cleanup-v1");

    database = await mongodb.connectToDatabase();
    const projects = database.db.collection(mongodb.COLLECTIONS.PROJECTS);
    const renders = database.db.collection<{ _id: string; artifactState?: string; artifactCleanup?: { state?: string } }>(PROJECT_RENDER_JOBS_COLLECTION_V1);
    const invalidations = database.db.collection<{ _id: string }>(PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1);
    const cleanupOutboxes = database.db.collection(PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1);
    const beforeRevision = {
      schemaVersion: 1 as const,
      value: 1,
      compatibilityUpdatedAt: new Date(executedAt.getTime() - 2_000).toISOString(),
    };
    const afterRevision = {
      schemaVersion: 1 as const,
      value: 2,
      compatibilityUpdatedAt: new Date(executedAt.getTime() - 1_000).toISOString(),
    };
    const binding = createProjectRenderSnapshotBindingV1({
      artifactKind: "RENDERED_PREVIEW",
      artifactId: jobId,
      ownerId,
      projectId,
      projectRevision: beforeRevision,
      sequenceId: "main",
      compositionId: "Main",
      renderContract: { renderer: "live-proof", codec: "h264" },
      durationInFrames: 30,
      fps: 30,
      width: 1920,
      height: 1080,
      projectRenderSourceSnapshotHash: createHash("sha256").update(`snapshot:${fixtureNonce}`).digest("hex"),
      containedVideoTargets: [],
    });
    const dispatchIdentity = createProjectRenderDispatchIdentityV1({
      jobId,
      bindingHash: binding.bindingHash,
    });
    const dispatch = RenderJobDispatchSchema.parse({
      version: 1,
      phase: "NOT_ATTEMPTED",
      billingState: "PENDING",
      attemptToken: dispatchIdentity.attemptToken,
      creditIdempotencyKey: dispatchIdentity.creditIdempotencyKey,
      billingWallet: { type: "user", clerkUserId: ownerId },
    });
    const job = createPendingRenderJob(
      jobId,
      ownerId,
      projectId,
      "us-east-1",
      1_000,
      undefined,
      binding,
      requesterId,
      dispatch,
    );
    const invalidationReceipt = createProjectRenderSnapshotInvalidationReceiptV1({
      ownerId,
      projectId,
      operation: "REPLACE_EDITOR_STATE",
      beforeRevision,
      afterRevision,
      issuedAt: new Date(afterRevision.compatibilityUpdatedAt),
    });
    const invalidationOutbox = createProjectRenderSnapshotInvalidationOutboxV1(invalidationReceipt);
    const committedLink = projectRenderSnapshotInvalidationLinkV1(invalidationReceipt);

    const collisionCount = await Promise.all([
      projects.countDocuments({ projectId, userId: ownerId }),
      renders.countDocuments({ _id: jobId }),
      invalidations.countDocuments({ _id: invalidationOutbox.outboxId }),
    ]);
    if (collisionCount.some((count) => count !== 0)) throw new Error("FIXTURE_ID_COLLISION");

    await enqueueProjectRenderSnapshotInvalidationOutboxV1({
      outbox: invalidationOutbox,
      collection: invalidations as never,
    });
    await renders.insertOne(job as never);
    await projects.insertOne({
      userId: ownerId,
      projectId,
      timelineRangeChangeReceipts: [{
        projectId,
        operation: invalidationReceipt.operation,
        committedAt: afterRevision.compatibilityUpdatedAt,
        beforeProjectRevision: beforeRevision,
        afterProjectRevision: afterRevision,
        downstreamInvalidation: {
          status: "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING",
          projectRenderSnapshotInvalidation: committedLink,
        },
      }],
    });

    const worker = await runProjectRenderSnapshotInvalidationWorkerV1({
      outboxId: invalidationOutbox.outboxId,
      outboxCollection: invalidations as never,
      projectCollection: projects as never,
      renderJobCollection: renders as never,
      now: executedAt,
    });
    if (
      worker.status !== "MATERIALIZED"
      || worker.renderFence?.fencedArtifactIds[0] !== jobId
      || worker.renderFence.unresolvedArtifactIds.length !== 0
    ) {
      throw new Error("INVALIDATION_NOT_MATERIALIZED");
    }

    const materialized = await withTransactionV1(database.client, async (session) => (
      materializeProjectRenderSnapshotInvalidationCleanupV1({
        receipt: invalidationReceipt,
        jobId,
        renderJobs: renders as never,
        cleanupOutboxes: cleanupOutboxes as never,
        session,
        now: executedAt,
      })
    ));
    const replay = await withTransactionV1(database.client, async (session) => (
      materializeProjectRenderSnapshotInvalidationCleanupV1({
        receipt: invalidationReceipt,
        jobId,
        renderJobs: renders as never,
        cleanupOutboxes: cleanupOutboxes as never,
        session,
        now: executedAt,
      })
    ));
    const stored = await renders.findOne({ _id: jobId });
    if (
      materialized.disposition !== "CLEANUP_DONE"
      || replay.disposition !== "CLEANUP_DONE"
      || stored?.artifactState !== "STALE"
      || stored.artifactCleanup?.state !== "DONE"
    ) {
      throw new Error("CLEANUP_REPLAY_UNPROVED");
    }
    outcome = {
      status: "PASS",
      atlasUri: required("MONGODB_URI").startsWith("mongodb+srv://"),
      invalidationStatus: worker.status,
      fencedArtifactCount: worker.renderFence.fencedArtifactIds.length,
      cleanupDisposition: materialized.disposition,
      replayDisposition: replay.disposition,
      temporaryFixtureOnly: true,
    };
  } catch (error) {
    outcome = {
      status: "FAIL",
      error: error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN",
      temporaryFixtureOnly: true,
    };
  } finally {
    if (database) {
      const mongodb = await import("../lib/editron/db/mongodb");
      const { PROJECT_RENDER_JOBS_COLLECTION_V1 } = await import(
        "../lib/editron/services/render-job-service"
      );
      const { PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1 } = await import(
        "../lib/editron/services/project-render-snapshot-invalidation-v1"
      );
      const { PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1 } = await import(
        "../lib/editron/services/project-render-source-cleanup-v1"
      );
      await database.db.collection(mongodb.COLLECTIONS.PROJECTS).deleteMany({
        userId: ownerId,
        projectId,
      });
      await database.db.collection<{ _id: string }>(
        PROJECT_RENDER_JOBS_COLLECTION_V1,
      ).deleteMany({ _id: jobId });
      await database.db.collection<{ _id: string }>(
        PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1,
      ).deleteMany({ "receipt.ownerId": ownerId, "receipt.projectId": projectId });
      await database.db.collection(
        PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
      ).deleteMany({
        "descriptor.binding.ownerId": ownerId,
        "descriptor.binding.projectId": projectId,
      });
      const remaining = await Promise.all([
        database.db.collection(mongodb.COLLECTIONS.PROJECTS).countDocuments({
          userId: ownerId,
          projectId,
        }),
        database.db.collection<{ _id: string }>(
          PROJECT_RENDER_JOBS_COLLECTION_V1,
        ).countDocuments({ _id: jobId }),
        database.db.collection<{ _id: string }>(
          PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1,
        ).countDocuments({ "receipt.ownerId": ownerId, "receipt.projectId": projectId }),
        database.db.collection(
          PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
        ).countDocuments({
          "descriptor.binding.ownerId": ownerId,
          "descriptor.binding.projectId": projectId,
        }),
      ]);
      cleanupVerified = remaining.every((count) => count === 0);
      await database.client.close();
      if (!cleanupVerified) {
        outcome = {
          status: "FAIL",
          error: "ATLAS_FIXTURE_CLEANUP_UNPROVED",
          temporaryFixtureOnly: true,
        };
      }
    }
  }
  return { ...outcome, cleanupVerified };
}

async function withTransactionV1<T>(
  client: Awaited<ReturnType<typeof import("../lib/editron/db/mongodb").connectToDatabase>>["client"],
  operation: (session: import("mongodb").ClientSession) => Promise<T>,
): Promise<T> {
  const session = client.startSession();
  try {
    const result = await session.withTransaction(() => operation(session), {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      readPreference: "primary",
    });
    if (result === undefined) throw new Error("ATLAS_TRANSACTION_UNPROVED");
    return result;
  } finally {
    await session.endSession();
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`LIVE_PROOF_${name}_MISSING`);
  return value;
}
