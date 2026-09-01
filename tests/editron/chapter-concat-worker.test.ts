import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  collection: vi.fn(),
  getDatabase: vi.fn(),
  concatenateChapters: vi.fn(),
  getProjectRevision: vi.fn(),
  currentJob: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/editron/security/internal-worker-auth", () => ({
  withInternalQStashWorkerAuth: (handler: unknown) => handler,
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  getDatabase: mocks.getDatabase,
}));

vi.mock("@/lib/editron/services/chapter-renderer", () => ({
  CHAPTERS_COLLECTION: "editron_render_chapters",
}));

vi.mock("@/lib/editron/services/chapter-concat-client", () => ({
  concatenateChapters: mocks.concatenateChapters,
}));

vi.mock("@/lib/editron/services/project-service", () => ({
  projectService: { getProjectRevision: mocks.getProjectRevision },
}));

import { NextRequest } from "next/server";

import { POST } from "@/app/api/internal/workers/chapter-concat/route";
import {
  createProjectChapterConcatWorkerMessageV1,
  createProjectChapterConcatTargetV1,
  projectChapterConcatOutputUrlV1,
} from "@/lib/editron/services/chapter-concat-contract-v1";
import { createProjectRenderSnapshotBindingV1 } from "@/lib/editron/services/project-render-snapshot-binding-v1";

const JOB_ID = "chr_123456789012";

function target() {
  const binding = createProjectRenderSnapshotBindingV1({
    artifactKind: "DELIVERY_PROOF",
    artifactId: JOB_ID,
    ownerId: "owner_1",
    projectId: "project_1",
    projectRevision: {
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: "2026-09-01T03:59:00.000Z",
    },
    sequenceId: "main",
    compositionId: "MainComposition",
    renderContract: { codec: "h264" },
    durationInFrames: 54_000,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: { schemaVersion: 1, overlays: [] },
    containedVideoTargets: [],
  });
  return createProjectChapterConcatTargetV1({
    parentAdmissionId: JOB_ID,
    projectRenderSnapshotBinding: binding,
    sources: [
      {
        index: 0,
        providerRenderId: "render_child_0",
        bucketName: "remotion-source-bucket",
        region: "us-east-1",
        sourceUrl: "https://remotion-source-bucket.s3.us-east-1.amazonaws.com/renders/render_child_0/out.mp4",
        sourceSizeBytes: 12_345,
      },
      {
        index: 1,
        providerRenderId: "render_child_1",
        bucketName: "remotion-source-bucket",
        region: "us-east-1",
        sourceUrl: "https://remotion-source-bucket.s3.us-east-1.amazonaws.com/renders/render_child_1/out.mp4",
        sourceSizeBytes: 23_456,
      },
    ],
    env: {
      ...process.env,
      EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET: "editron-concat-output",
      EDITRON_CHAPTER_CONCAT_OUTPUT_REGION: "us-east-1",
    },
  });
}

function queuedJob() {
  return {
    _id: JOB_ID,
    projectId: "project_1",
    userId: "requester_1",
    ownerId: "owner_1",
    status: "rendering",
    artifactLifecycleVersion: 1,
    artifactState: "ACTIVE",
    retentionState: "RETAINED",
    concatStatus: "queued",
    concatTarget: target(),
  };
}

function concatResult(concatTarget = target()) {
  return {
    generation: concatTarget.generation,
    sourceManifestHash: concatTarget.sourceManifestHash,
    outputBucket: concatTarget.outputBucket,
    outputRegion: concatTarget.outputRegion,
    outputKey: concatTarget.outputKey,
    url: projectChapterConcatOutputUrlV1(concatTarget),
    sizeBytes: 45_801,
    chapters: concatTarget.sources.length,
  };
}

function workerMessage(concatTarget = target()) {
  return createProjectChapterConcatWorkerMessageV1({
    jobId: JOB_ID,
    generation: concatTarget.generation,
  });
}

describe("chapter concat worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collection.mockReturnValue({
      findOne: mocks.findOne,
      findOneAndUpdate: mocks.findOneAndUpdate,
      updateOne: mocks.updateOne,
    });
    mocks.getDatabase.mockResolvedValue({ collection: mocks.collection });
    mocks.currentJob = queuedJob();
    mocks.findOne.mockImplementation(async () => structuredClone(mocks.currentJob));
    mocks.findOneAndUpdate.mockImplementation(async (
      _filter: unknown,
      update: { $set: Record<string, unknown> },
    ) => {
      mocks.currentJob = {
        ...mocks.currentJob,
        ...structuredClone(update.$set),
      };
      return structuredClone(mocks.currentJob);
    });
    mocks.updateOne.mockImplementation(async (
      _filter: unknown,
      update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> },
    ) => {
      if (mocks.currentJob) {
        Object.assign(mocks.currentJob, structuredClone(update.$set ?? {}));
        for (const key of Object.keys(update.$unset ?? {})) delete mocks.currentJob[key];
      }
      return { matchedCount: 1, modifiedCount: 1 };
    });
    mocks.concatenateChapters.mockResolvedValue(concatResult());
    mocks.getProjectRevision.mockResolvedValue(target().projectRenderSnapshotBinding.projectRevision);
  });

  it("leases before Modal and completes only the exact generation and claim", async () => {
    const response = await POST(request(workerMessage()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      generation: target().generation,
      outputBucket: "editron-concat-output",
      outputRegion: "us-east-1",
      sizeBytes: 45_801,
      chapters: 2,
    });
    expect(mocks.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.concatenateChapters.mock.invocationCallOrder[0],
    );
    const claimUpdate = mocks.findOneAndUpdate.mock.calls[0]![1];
    expect(claimUpdate).toMatchObject({
      $set: {
        concatStatus: "running",
        concatLease: {
          claimToken: expect.any(String),
          claimedAt: expect.any(Date),
          leaseExpiresAt: expect.any(Date),
        },
      },
      $inc: { concatAttempts: 1 },
    });
    const completionFilter = mocks.updateOne.mock.calls[0]![0];
    expect(completionFilter).toMatchObject({
      _id: JOB_ID,
      artifactLifecycleVersion: 1,
      artifactState: "ACTIVE",
      retentionState: "RETAINED",
      artifactInvalidatedAt: { $exists: false },
      cleanupMaterialization: { $exists: false },
      concatStatus: "running",
      "concatLease.claimToken": claimUpdate.$set.concatLease.claimToken,
      "concatTarget.generation": target().generation,
    });
  });

  it("rejects a concat delivery after cleanup invalidates the chapter row", async () => {
    const concatTarget = target();
    mocks.currentJob = {
      ...queuedJob(),
      status: "completed",
      concatStatus: "done",
      concatResult: {
        ...concatResult(concatTarget),
        completedAt: new Date("2026-09-01T04:59:00.000Z"),
      },
      outputUrl: projectChapterConcatOutputUrlV1(concatTarget),
      artifactState: "STALE",
      retentionState: "CLEANUP_PENDING",
      artifactInvalidatedAt: new Date("2026-09-01T05:00:00.000Z"),
      cleanupMaterialization: { schemaVersion: 1 },
    };

    const response = await POST(request(workerMessage()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      status: "stale",
      stale: true,
      error: "CHAPTER_CONCAT_ARTIFACT_NOT_ACTIVE",
    });
    expect(mocks.getProjectRevision).not.toHaveBeenCalled();
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.concatenateChapters).not.toHaveBeenCalled();
  });

  it("fences a stale project before claiming or invoking Modal", async () => {
    const expectedRevision = target().projectRenderSnapshotBinding.projectRevision;
    mocks.getProjectRevision.mockResolvedValueOnce({
      ...expectedRevision,
      value: expectedRevision.value + 1,
    });

    const response = await POST(request(workerMessage()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      status: "stale",
      stale: true,
      error: "PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE",
    });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.concatenateChapters).not.toHaveBeenCalled();
    expect(mocks.currentJob).toMatchObject({
      status: "failed",
      concatStatus: "failed",
      concatError: "PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE",
    });
  });

  it("fences a project that changes after claim but before Modal", async () => {
    const expectedRevision = target().projectRenderSnapshotBinding.projectRevision;
    mocks.getProjectRevision
      .mockResolvedValueOnce(expectedRevision)
      .mockResolvedValueOnce({ ...expectedRevision, value: expectedRevision.value + 1 });

    const response = await POST(request(workerMessage()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "stale",
      error: "PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE",
    });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledOnce();
    expect(mocks.concatenateChapters).not.toHaveBeenCalled();
    expect(mocks.currentJob).toMatchObject({ concatStatus: "failed" });
    expect(mocks.currentJob).not.toHaveProperty("concatLease");
  });

  it("fences a project that changes after Modal but before publication", async () => {
    const expectedRevision = target().projectRenderSnapshotBinding.projectRevision;
    mocks.getProjectRevision
      .mockResolvedValueOnce(expectedRevision)
      .mockResolvedValueOnce(expectedRevision)
      .mockResolvedValueOnce({ ...expectedRevision, value: expectedRevision.value + 1 });

    const response = await POST(request(workerMessage()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "stale",
      error: "PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE",
    });
    expect(mocks.concatenateChapters).toHaveBeenCalledOnce();
    expect(mocks.currentJob).toMatchObject({
      status: "failed",
      concatStatus: "failed",
      concatError: "PROJECT_CHAPTER_CONCAT_PROJECT_REVISION_STALE",
    });
    expect(mocks.currentJob).not.toHaveProperty("concatResult");
    expect(mocks.currentJob).not.toHaveProperty("outputUrl");
  });

  it("fails a drifted layout before claim or provider work", async () => {
    mocks.currentJob = {
      ...queuedJob(),
      chapterLayoutManifestHash: "c".repeat(64),
    };

    const response = await POST(request(workerMessage()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "PROJECT_CHAPTER_CONCAT_LAYOUT_STALE",
    });
    expect(mocks.getProjectRevision).not.toHaveBeenCalled();
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.concatenateChapters).not.toHaveBeenCalled();
  });

  it("acknowledges an exact DONE replay without invoking Modal", async () => {
    const concatTarget = target();
    mocks.currentJob = {
      ...queuedJob(),
      concatStatus: "done",
      concatResult: {
        ...concatResult(concatTarget),
        completedAt: new Date("2026-09-01T05:00:00.000Z"),
      },
    };

    const response = await POST(request(workerMessage()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, replayed: true });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.concatenateChapters).not.toHaveBeenCalled();
  });

  it("returns an active lease without starting a duplicate concat", async () => {
    mocks.currentJob = {
      ...queuedJob(),
      concatStatus: "running",
      concatLease: {
        claimToken: "claim_active",
        claimedAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 60_000),
      },
    };

    const response = await POST(request(workerMessage()));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ success: false, status: "running" });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.concatenateChapters).not.toHaveBeenCalled();
  });

  it("reclaims an expired lease and fences completion by expiry", async () => {
    const expiredAt = new Date(Date.now() - 60_000);
    mocks.currentJob = { ...queuedJob(), concatStatus: "running", concatLease: {
      claimToken: "claim_expired", claimedAt: expiredAt, leaseExpiresAt: expiredAt,
    } };
    const response = await POST(request(workerMessage()));
    expect(response.status).toBe(200);
    expect(mocks.concatenateChapters).toHaveBeenCalledTimes(1);
    expect(mocks.findOneAndUpdate.mock.calls[0]![0].$or).toContainEqual(
      expect.objectContaining({ concatStatus: "running", "concatLease.leaseExpiresAt": { $lte: expect.any(Date) } }),
    );
    expect(mocks.updateOne.mock.calls[0]![0]["concatLease.leaseExpiresAt"]).toEqual({ $gt: expect.any(Date) });
  });

  it("quarantines an unsigned legacy row before any provider call", async () => {
    mocks.currentJob = {
      _id: JOB_ID,
      status: "rendering",
      concatStatus: "queued",
    };

    const response = await POST(request({ jobId: JOB_ID }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "CHAPTER_CONCAT_LEGACY_REQUIRES_PROJECT_SNAPSHOT_MIGRATION",
    });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ concatTarget: { $exists: false } }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: "failed", concatStatus: "failed" }),
      }),
    );
    expect(mocks.concatenateChapters).not.toHaveBeenCalled();
  });

  it("rejects a target bound to a different job owner", async () => {
    mocks.currentJob = { ...queuedJob(), ownerId: "different_owner" };

    const response = await POST(request({ jobId: JOB_ID }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "PROJECT_CHAPTER_CONCAT_JOB_BINDING_MISMATCH",
    });
    expect(mocks.concatenateChapters).not.toHaveBeenCalled();
  });

  it("releases the exact lease for retry after a transient Modal failure", async () => {
    mocks.concatenateChapters.mockRejectedValueOnce(new Error("Modal transport unavailable"));

    const response = await POST(request(workerMessage()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "CHAPTER_CONCAT_TRANSIENT_FAILURE",
    });
    const claimToken = mocks.findOneAndUpdate.mock.calls[0]![1].$set.concatLease.claimToken;
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: JOB_ID,
        concatStatus: "running",
        "concatLease.claimToken": claimToken,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ concatStatus: "queued" }),
        $unset: { concatLease: "" },
      }),
    );
  });
});

function request(body: unknown): NextRequest {
  return new NextRequest("https://editron.example/api/internal/workers/chapter-concat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
