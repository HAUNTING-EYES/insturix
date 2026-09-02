import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

import { COLLECTIONS, connectToDatabase } from "../lib/editron/db/mongodb";
import { deleteFromGCS, fileExists, readGcsObjectVersionObservationV1, uploadToGCS } from "../lib/editron/services/gcs-service";
import { createMediaSourceStorageVersionV1 } from "../lib/editron/services/media-source-storage-version-v1";
import { createMediaSourceVersionV1 } from "../lib/editron/services/media-source-version-v1";
import { buildNativeVideoAudioRights, CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION }
  from "../lib/editron/services/native-video-audio-rights";
import { PROJECT_DELETION_TOMBSTONES_COLLECTION_V1 } from "../lib/editron/services/project-deletion-v1";
import { PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1 } from "../lib/editron/services/project-render-snapshot-invalidation-v1";
import { runProjectRenderSnapshotInvalidationWorkerV1 } from "../lib/editron/services/project-render-snapshot-invalidation-worker-v1";
import { ensureProjectSourceMediaRightsFromLegacyAttestationV1 } from "../lib/editron/services/project-source-media-rights-legacy-migration-v1";
import { PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1 } from "../lib/editron/services/project-whole-state-media-prerequisite-runtime-v1";
import { projectService } from "../lib/editron/services/project-service";
import { PROJECT_RENDER_JOBS_COLLECTION_V1 } from "../lib/editron/services/render-job-service";
import { createSourceMediaRightsLedgerMongoPortsV1, SOURCE_MEDIA_RIGHTS_EVENT_COLLECTION_V1,
  SOURCE_MEDIA_RIGHTS_HEAD_COLLECTION_V1 } from "../lib/editron/services/source-media-rights-ledger-v1";

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: process.cwd(),
  encoding: "utf8",
}).trim();
const executedAt = new Date();
const nonce = randomUUID().replaceAll("-", "");
const userId = `stage25-queue5-owner-${nonce}`;
const projectId = `stage25-queue5-project-${nonce}`;
let database: Awaited<ReturnType<typeof connectToDatabase>> | null = null;
let assetId: string | null = null;
let gcsPath: string | null = null;
let assetInserted = false;
let cleanupVerified = false;
let proof: Record<string, unknown> = { status: "FAIL", error: "QUEUE5_LIVE_PROOF_NOT_RUN" };
try {
  database = await connectToDatabase();
  const { db } = database;
  const projects = db.collection(COLLECTIONS.PROJECTS);
  const mediaAssets = db.collection(COLLECTIONS.MEDIA_ASSETS);
  const invalidations = db.collection(PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1);
  const prerequisites = db.collection(PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1);
  const tombstones = db.collection(PROJECT_DELETION_TOMBSTONES_COLLECTION_V1);
  const renderJobs = db.collection(PROJECT_RENDER_JOBS_COLLECTION_V1);

  if (await projects.countDocuments({ projectId, userId }) !== 0) {
    throw new Error("QUEUE5_LIVE_PROJECT_ID_COLLISION");
  }
  const videoBytes = execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=0x233047:s=64x64:r=30:d=1",
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "pipe:1",
  ], { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 });
  const contentSha256 = createHash("sha256").update(videoBytes).digest("hex");
  const uploaded = await uploadToGCS(videoBytes, userId, "queue5-source-proof.mp4", "video/mp4");
  assetId = uploaded.assetId;
  gcsPath = uploaded.gcsPath;
  if (await mediaAssets.countDocuments({ assetId, userId }) !== 0) {
    throw new Error("QUEUE5_LIVE_ASSET_ID_COLLISION");
  }
  const downloaded = await fetch(uploaded.signedUrl);
  if (!downloaded.ok) throw new Error("QUEUE5_LIVE_GCS_DOWNLOAD_FAILED");
  const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
  if (createHash("sha256").update(downloadedBytes).digest("hex") !== contentSha256) {
    throw new Error("QUEUE5_LIVE_GCS_CONTENT_HASH_MISMATCH");
  }
  const observation = await readGcsObjectVersionObservationV1(gcsPath);
  if (!observation || observation.byteLength !== videoBytes.length) {
    throw new Error("QUEUE5_LIVE_GCS_VERSION_UNAVAILABLE");
  }
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: "GCS", objectKey: gcsPath },
    byteLength: observation.byteLength,
    providerVersion: { kind: "GCS_GENERATION", value: observation.generation },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: "USER", userId },
    assetId,
    mediaKind: "video",
    byteLength: videoBytes.length,
    contentSha256,
    storageVersion,
  });
  const createdAt = new Date();
  const beforeRevision = {
    schemaVersion: 1 as const,
    value: 1,
    compatibilityUpdatedAt: createdAt.toISOString(),
  };
  const audioRights = buildNativeVideoAudioRights({
    sourceAssetId: assetId,
    userId,
    attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
    attestedAt: createdAt,
  });
  const asset = {
    assetId,
    userId,
    projectId,
    type: "video",
    source: "user-upload",
    status: "ready",
    contentType: "video/mp4",
    size: videoBytes.length,
    gcsPath,
    url: uploaded.signedUrl,
    uploadedAt: createdAt,
    lastUsedAt: createdAt,
    sourceVersionV1: sourceVersion,
    proxySourceVersionV1: null,
    audioRights,
  };
  await mediaAssets.insertOne(asset);
  assetInserted = true;
  await projects.insertOne({
    projectId,
    userId,
    name: "Queue 5 source-qualified live proof",
    overlays: [{
      id: 1,
      type: "video",
      assetId,
      content: uploaded.signedUrl,
      from: 0,
      durationInFrames: 30,
      row: 0,
      left: 0,
      top: 0,
      width: 64,
      height: 64,
      isDragging: false,
      rotation: 0,
      styles: { opacity: 1 },
      hasNativeAudio: false,
    }],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 30,
    visibility: "private",
    createdAt,
    updatedAt: createdAt,
    projectRevision: 1,
    timelineRangeChangeReceipts: [],
  });
  const rightsStore = await createSourceMediaRightsLedgerMongoPortsV1();
  const rights = await ensureProjectSourceMediaRightsFromLegacyAttestationV1({
    tenantId: userId,
    userId,
    orgId: null,
    projectId,
    projectOwnerId: userId,
    projectRevision: beforeRevision,
    sourceVersion,
    asset,
  }, { rightsStore, now: () => new Date() });
  if (rights.disposition !== "AUTHORIZED") throw new Error(`QUEUE5_LIVE_RIGHTS_${rights.diagnosticCode}`);
  if (rights.authorityDisposition !== "MIGRATED") throw new Error("QUEUE5_LIVE_RIGHTS_NOT_MIGRATED");
  const mutation = await projectService.updateOverlayAtRevisionV1(userId, projectId, {
    expectedRevision: beforeRevision,
    actorKind: "SYSTEM",
    overlayId: 1,
    updates: { styles: { opacity: 0.75 } },
  });
  const downstream = mutation.timelineChangeReceipt.downstreamInvalidation;
  if (downstream.status !== "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING") {
    throw new Error("QUEUE5_LIVE_MUTATION_INVALIDATION_NOT_DURABLE");
  }
  const mutationInvalidation = downstream.projectRenderSnapshotInvalidation;
  const mediaPrerequisite = mutation.timelineChangeReceipt.wholeStateMediaPrerequisite;
  if (!mediaPrerequisite || mediaPrerequisite.status !== "MATERIALIZED") {
    throw new Error("QUEUE5_LIVE_MUTATION_MEDIA_PREREQUISITE_MISSING");
  }
  const mutationWorker = await runProjectRenderSnapshotInvalidationWorkerV1({
    outboxId: mutationInvalidation.invalidationId,
    outboxCollection: invalidations as never,
    projectCollection: projects as never,
    deletionTombstoneCollection: tombstones as never,
    renderJobCollection: renderJobs as never,
    now: new Date(),
  });
  if (mutationWorker.status !== "MATERIALIZED") {
    throw new Error("QUEUE5_LIVE_MUTATION_INVALIDATION_NOT_MATERIALIZED");
  }
  const deletion = await projectService.deleteProject(userId, projectId, mutation.mutationReceipt.revision);
  const deletionInvalidation = deletion.tombstone.projectRenderSnapshotInvalidation;
  const deletionWorker = await runProjectRenderSnapshotInvalidationWorkerV1({
    outboxId: deletionInvalidation.invalidationId,
    outboxCollection: invalidations as never,
    projectCollection: projects as never,
    deletionTombstoneCollection: tombstones as never,
    renderJobCollection: renderJobs as never,
    now: new Date(),
  });
  const [projectCount, sharedMediaCount, prerequisiteCount, invalidationCount,
    tombstoneCount] = await Promise.all([
    projects.countDocuments({ projectId, userId }),
    mediaAssets.countDocuments({ assetId, userId }),
    prerequisites.countDocuments({ "receipt.projectId": projectId, "receipt.userId": userId }),
    invalidations.countDocuments({ "receipt.projectId": projectId, "receipt.ownerId": userId }),
    tombstones.countDocuments({ projectId, ownerId: userId }),
  ]);
  if (projectCount !== 0 || sharedMediaCount !== 1 || prerequisiteCount !== 1
    || invalidationCount !== 2 || tombstoneCount !== 1
    || deletionWorker.status !== "MATERIALIZED") {
    throw new Error("QUEUE5_LIVE_POST_DELETE_STATE_INVALID");
  }
  proof = {
    status: "PASS",
    atlasUri: required("MONGODB_URI").startsWith("mongodb+srv://"),
    sourceMedia: {
      playableMp4: true,
      byteLength: videoBytes.length,
      contentSha256,
      provider: "GCS",
      providerVersionObserved: true,
      exactDownloadHashMatched: true,
    },
    rights: {
      disposition: rights.disposition,
      authorityDisposition: rights.authorityDisposition,
      authorizationReceiptSha256: rights.authorization.receiptSha256,
    },
    mutation: {
      operation: mutation.timelineChangeReceipt.operation,
      beforeRevision: mutation.timelineChangeReceipt.beforeProjectRevision.value,
      afterRevision: mutation.mutationReceipt.revision.value,
      mediaPrerequisite: mediaPrerequisite.status,
      invalidationStatus: mutationWorker.status,
    },
    deletion: {
      disposition: deletion.status,
      tombstoneReceiptSha256: deletion.tombstone.receiptHash,
      invalidationStatus: deletionWorker.status,
      sharedMediaPreservedBeforeFixtureCleanup: true,
    },
  };
} catch (error) {
  proof = {
    status: "FAIL",
    error: error instanceof Error ? error.message.slice(0, 180) : "UNKNOWN",
  };
} finally {
  if (database) {
    await database.db.collection(COLLECTIONS.PROJECTS).deleteMany({ projectId, userId });
    if (assetInserted && assetId) {
      await database.db.collection(COLLECTIONS.MEDIA_ASSETS).deleteMany({ assetId, userId });
    }
    await database.db.collection(PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1)
      .deleteMany({ "receipt.projectId": projectId, "receipt.userId": userId });
    await database.db.collection(PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1)
      .deleteMany({ "receipt.projectId": projectId, "receipt.ownerId": userId });
    await database.db.collection(PROJECT_DELETION_TOMBSTONES_COLLECTION_V1).deleteMany({ projectId, ownerId: userId });
    await database.db.collection(SOURCE_MEDIA_RIGHTS_HEAD_COLLECTION_V1)
      .deleteMany({ "scope.projectId": projectId, "scope.tenantId": userId });
    await database.db.collection(SOURCE_MEDIA_RIGHTS_EVENT_COLLECTION_V1)
      .deleteMany({ "state.sourceMediaRightsV1.projectId": projectId,
        "state.sourceMediaRightsV1.tenantId": userId });
    const remaining = await Promise.all([
      database.db.collection(COLLECTIONS.PROJECTS).countDocuments({ projectId, userId }),
      database.db.collection(COLLECTIONS.MEDIA_ASSETS).countDocuments({ assetId, userId }),
      database.db.collection(PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1)
        .countDocuments({ "receipt.projectId": projectId, "receipt.userId": userId }),
      database.db.collection(PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1)
        .countDocuments({ "receipt.projectId": projectId, "receipt.ownerId": userId }),
      database.db.collection(PROJECT_DELETION_TOMBSTONES_COLLECTION_V1)
        .countDocuments({ projectId, ownerId: userId }),
      database.db.collection(SOURCE_MEDIA_RIGHTS_HEAD_COLLECTION_V1)
        .countDocuments({ "scope.projectId": projectId, "scope.tenantId": userId }),
      database.db.collection(SOURCE_MEDIA_RIGHTS_EVENT_COLLECTION_V1)
        .countDocuments({ "state.sourceMediaRightsV1.projectId": projectId,
          "state.sourceMediaRightsV1.tenantId": userId }),
    ]);
    cleanupVerified = remaining.every((count) => count === 0);
  }
  if (gcsPath) {
    if (await fileExists(gcsPath)) await deleteFromGCS(gcsPath);
    cleanupVerified = cleanupVerified && !(await fileExists(gcsPath));
  }
  await database?.client.close();
}

if (!cleanupVerified) proof = { ...proof, status: "FAIL", error: "QUEUE5_LIVE_CLEANUP_UNPROVED" };
const receipt = {
  schemaVersion: 1,
  scope: "QUEUE5_SOURCE_QUALIFIED_ATLAS_LIVE_PROOF",
  sourceCommit,
  executedAt: executedAt.toISOString(),
  decision: proof.status === "PASS" ? "PASS" : "MODIFY",
  proof: { ...proof, cleanupVerified },
};
const receiptHash = createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
console.log(JSON.stringify({ ...receipt, receiptHash }, null, 2));
if (receipt.decision !== "PASS") process.exitCode = 1;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`QUEUE5_LIVE_${name}_MISSING`);
  return value;
}
