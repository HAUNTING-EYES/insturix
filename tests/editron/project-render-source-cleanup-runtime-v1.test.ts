import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Collection } from "mongodb";

vi.mock("@/lib/editron/db/mongodb", () => ({ getDatabase: vi.fn() }));

import { handleProjectRenderSourceCleanupCronV1 }
  from "@/app/api/cron/cleanup-editron-render-sources/route";
import {
  runProjectRenderSourceCleanupBatchV1,
  type ProjectRenderSourceCleanupBatchResultV1,
} from "@/lib/editron/services/project-render-source-cleanup-runtime-v1";
import {
  createProjectRenderChapterChildSourceCleanupOutboxV1,
  createProjectRenderSourceCleanupOutboxV1,
  type ProjectRenderSourceCleanupOutboxV1,
} from "@/lib/editron/services/project-render-source-cleanup-v1";
import { createProjectRenderSnapshotBindingV1 }
  from "@/lib/editron/services/project-render-snapshot-binding-v1";

const NOW = new Date("2026-09-01T06:00:00.000Z");
const REPO_ROOT = resolve(__dirname, "../..");

function pendingOutbox(): ProjectRenderSourceCleanupOutboxV1 {
  const binding = createProjectRenderSnapshotBindingV1({
    artifactKind: "DELIVERY_PROOF",
    artifactId: "cleanup-runtime-render-1",
    ownerId: "cleanup-runtime-owner",
    projectId: "cleanup-runtime-project",
    projectRevision: {
      schemaVersion: 1,
      value: 9,
      compatibilityUpdatedAt: "2026-09-01T05:59:00.000Z",
    },
    sequenceId: "main",
    compositionId: "TestComponent",
    renderContract: { codec: "h264" },
    durationInFrames: 150,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: { schemaVersion: 1, overlays: [] },
    containedVideoTargets: [],
  });
  return createProjectRenderSourceCleanupOutboxV1({
    binding,
    providerRenderId: "provider-render-cleanup-1",
    bucketName: "remotion-cleanup-bucket",
    region: "us-east-1",
    sourceOutputUrl: "https://remotion-cleanup-bucket.example.test/output.mp4",
    sourceOutputSize: 987_654,
    now: NOW,
  });
}

function pendingChapterChildOutbox(now = NOW): ProjectRenderSourceCleanupOutboxV1 {
  const parent = pendingOutbox();
  return createProjectRenderChapterChildSourceCleanupOutboxV1({
    binding: parent.descriptor.binding,
    parentAdmissionId: parent.descriptor.binding.artifactId,
    chapterIndex: 3,
    providerRenderId: "provider-chapter-child-3",
    bucketName: "remotion-chapter-bucket",
    region: "eu-west-1",
    sourceOutputUrl: "https://remotion-chapter-bucket.example.test/chapter-3.mp4",
    sourceOutputSize: 456_789,
    now,
  });
}

type CleanupCollectionMock = Collection<ProjectRenderSourceCleanupOutboxV1> & {
  findOneAndUpdate: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
};

function cleanupCollectionMock(outbox = pendingOutbox()): CleanupCollectionMock {
  let delivered = false;
  return {
    findOneAndUpdate: vi.fn(async (_filter, update) => {
      if (delivered) return null;
      delivered = true;
      const set = (update as {
        $set: {
          lease: ProjectRenderSourceCleanupOutboxV1["lease"];
          updatedAt: Date;
        };
      }).$set;
      return {
        ...outbox,
        status: "RUNNING" as const,
        attempts: outbox.attempts + 1,
        lease: set.lease,
        updatedAt: set.updatedAt,
      };
    }),
    findOne: vi.fn(async () => null),
    updateOne: vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 })),
  } as unknown as CleanupCollectionMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("project render source cleanup runtime V1", () => {
  it("cleans one exact chapter child tuple through the standard lease consumer", async () => {
    const child = pendingChapterChildOutbox();
    const replay = pendingChapterChildOutbox(new Date(NOW.getTime() + 60_000));
    const collection = cleanupCollectionMock(child);
    const deleteProviderRender = vi.fn(async () => ({ freedBytes: 456_789 }));

    await expect(runProjectRenderSourceCleanupBatchV1({
      collection,
      limit: 1,
      now: NOW,
      prepareCredentials: vi.fn(async () => undefined),
      deleteProviderRender,
    })).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      failed: 0,
      results: [{ state: "DONE", freedBytes: 456_789 }],
    });

    expect(child.descriptor).toMatchObject({
      artifactKind: "REMOTION_AWS_CHAPTER_CHILD_RENDER_OUTPUT",
      parentAdmissionId: child.descriptor.binding.artifactId,
      chapterIndex: 3,
      providerRenderId: "provider-chapter-child-3",
      bucketName: "remotion-chapter-bucket",
      region: "eu-west-1",
      renderPrefix: "renders/provider-chapter-child-3/",
      sourceOutput: {
        url: "https://remotion-chapter-bucket.example.test/chapter-3.mp4",
        sizeBytes: 456_789,
      },
    });
    expect(replay._id).toBe(child._id);
    expect(replay.descriptor.createdAt).not.toBe(child.descriptor.createdAt);
    expect(deleteProviderRender).toHaveBeenCalledWith({
      region: "eu-west-1",
      bucketName: "remotion-chapter-bucket",
      renderId: "provider-chapter-child-3",
    });
  });

  it("rejects a child whose admission is not the parent binding or whose bucket is aggregate", () => {
    const parent = pendingOutbox();
    const input = {
      binding: parent.descriptor.binding,
      parentAdmissionId: parent.descriptor.binding.artifactId,
      chapterIndex: 0,
      providerRenderId: "provider-chapter-child-0",
      bucketName: "remotion-chapter-bucket",
      region: "us-east-1",
      sourceOutputUrl: "https://remotion-chapter-bucket.example.test/chapter-0.mp4",
      sourceOutputSize: 1,
      now: NOW,
    };
    expect(() => createProjectRenderChapterChildSourceCleanupOutboxV1({
      ...input,
      parentAdmissionId: "another-parent",
    })).toThrow();
    expect(() => createProjectRenderChapterChildSourceCleanupOutboxV1({
      ...input,
      bucketName: "chapter-render",
    })).toThrow();
  });

  it("claims before calling the provider and commits an exact deletion receipt", async () => {
    const collection = cleanupCollectionMock();
    const prepareCredentials = vi.fn(async () => undefined);
    const deleteProviderRender = vi.fn(async () => ({ freedBytes: 123_456 }));

    await expect(runProjectRenderSourceCleanupBatchV1({
      collection,
      limit: 2,
      now: NOW,
      prepareCredentials,
      deleteProviderRender,
    })).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      failed: 0,
      results: [{ state: "DONE", freedBytes: 123_456 }],
    });

    expect(collection.findOneAndUpdate).toHaveBeenCalledTimes(2);
    const [claimFilter, claimUpdate] = collection.findOneAndUpdate.mock.calls[0]!;
    expect(claimFilter).toEqual({
      $or: [
        { status: "PENDING", availableAt: { $lte: NOW } },
        { status: "RUNNING", "lease.leaseExpiresAt": { $lte: NOW } },
      ],
    });
    const claimToken = claimUpdate.$set.lease.claimToken;
    expect(collection.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      prepareCredentials.mock.invocationCallOrder[0],
    );
    expect(prepareCredentials.mock.invocationCallOrder[0]).toBeLessThan(
      deleteProviderRender.mock.invocationCallOrder[0],
    );
    expect(deleteProviderRender).toHaveBeenCalledWith({
      region: "us-east-1",
      bucketName: "remotion-cleanup-bucket",
      renderId: "provider-render-cleanup-1",
    });
    expect(collection.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "RUNNING",
        "lease.claimToken": claimToken,
      }),
      {
        $set: expect.objectContaining({
          status: "DONE",
          completion: { completedAt: NOW, freedBytes: 123_456 },
        }),
        $unset: { lease: "", lastError: "" },
      },
    );
  });

  it("sanitizes provider failure and deterministically reschedules the claimed row", async () => {
    const collection = cleanupCollectionMock();
    const providerError = new Error("credential=must-never-be-persisted");
    providerError.name = "AccessDeniedException";

    await expect(runProjectRenderSourceCleanupBatchV1({
      collection,
      limit: 1,
      now: NOW,
      prepareCredentials: vi.fn(async () => undefined),
      deleteProviderRender: vi.fn(async () => { throw providerError; }),
    })).resolves.toMatchObject({
      claimed: 1,
      completed: 0,
      failed: 1,
      results: [{ state: "RETRY_SCHEDULED" }],
    });

    const releaseUpdate = collection.updateOne.mock.calls[0]![1];
    expect(releaseUpdate).toEqual({
      $set: {
        status: "PENDING",
        availableAt: new Date(NOW.getTime() + 30_000),
        updatedAt: NOW,
        lastError: "PROJECT_RENDER_SOURCE_CLEANUP_PROVIDER_AccessDeniedException",
      },
      $unset: { lease: "", completion: "" },
    });
    expect(JSON.stringify(releaseUpdate)).not.toContain("must-never-be-persisted");
  });

  it("fails closed when completion ownership is lost after provider deletion", async () => {
    const collection = cleanupCollectionMock();
    collection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    await expect(runProjectRenderSourceCleanupBatchV1({
      collection,
      limit: 1,
      now: NOW,
      prepareCredentials: vi.fn(async () => undefined),
      deleteProviderRender: vi.fn(async () => ({ freedBytes: 0 })),
    })).rejects.toThrow("PROJECT_RENDER_SOURCE_CLEANUP_RELEASE_WRITE_UNPROVED");
    expect(collection.findOne).toHaveBeenCalledWith({ _id: pendingOutbox()._id });
  });

  it("protects the cron and reports retryable cleanup outcomes without leaking errors", async () => {
    const runner = vi.fn(async (): Promise<ProjectRenderSourceCleanupBatchResultV1> => ({
      claimed: 1,
      completed: 1,
      failed: 0,
      results: [{ outboxId: pendingOutbox()._id, state: "DONE" as const, freedBytes: 10 }],
    }));
    vi.stubEnv("CRON_SECRET", "cleanup-cron-secret");

    expect((await handleProjectRenderSourceCleanupCronV1(request(), runner)).status).toBe(401);
    expect(runner).not.toHaveBeenCalled();
    const success = await handleProjectRenderSourceCleanupCronV1(
      request("cleanup-cron-secret"),
      runner,
    );
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toMatchObject({ success: true });

    runner.mockResolvedValueOnce({
      claimed: 1,
      completed: 0,
      failed: 1,
      results: [{ outboxId: pendingOutbox()._id, state: "RETRY_SCHEDULED" as const }],
    });
    const retry = await handleProjectRenderSourceCleanupCronV1(
      request("cleanup-cron-secret"),
      runner,
    );
    expect(retry.status).toBe(503);
    expect(retry.headers.get("retry-after")).toBe("300");

    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runner.mockRejectedValueOnce(new Error("provider-secret-detail"));
    const outage = await handleProjectRenderSourceCleanupCronV1(
      request("cleanup-cron-secret"),
      runner,
    );
    expect(outage.status).toBe(503);
    const body = await outage.json();
    expect(body).toEqual({
      success: false,
      error: { code: "PROJECT_RENDER_SOURCE_CLEANUP_UNAVAILABLE" },
    });
    expect(JSON.stringify(body)).not.toContain("provider-secret-detail");
    errorLog.mockRestore();
  });

  it("fails closed without a cron secret and registers schedule plus query indexes", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const runner = vi.fn();
    expect((await handleProjectRenderSourceCleanupCronV1(request(), runner)).status).toBe(503);
    expect(runner).not.toHaveBeenCalled();

    const configuration = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(configuration.crons).toContainEqual({
      path: "/api/cron/cleanup-editron-render-sources",
      schedule: "*/5 * * * *",
    });
    const mongoSource = readFileSync(
      resolve(REPO_ROOT, "lib/editron/db/mongodb.ts"),
      "utf8",
    );
    expect(mongoSource).toContain("status_available_createdAt");
    expect(mongoSource).toContain("status_leaseExpiresAt");
  });
});

function request(secret?: string): Request {
  return new Request(
    "https://editron.example.test/api/cron/cleanup-editron-render-sources",
    { headers: secret ? { authorization: `Bearer ${secret}` } : {} },
  );
}
