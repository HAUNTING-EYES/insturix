import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Collection } from "mongodb";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editron/db/mongodb", () => ({ getDatabase: vi.fn() }));

import { handleProjectChapterConcatCleanupCronV1 }
  from "@/app/api/cron/cleanup-editron-chapter-concat/route";
import {
  createProjectChapterConcatTargetV1,
  projectChapterConcatOutputUrlV1,
} from "@/lib/editron/services/chapter-concat-contract-v1";
import {
  assertProjectChapterConcatCleanupOutboxV1,
  createProjectChapterConcatCleanupOutboxFromTargetV1,
  type ProjectChapterConcatCleanupOutboxV1,
} from "@/lib/editron/services/chapter-concat-cleanup-v1";
import {
  resolveProjectChapterConcatCleanupAwsCredentialsV1,
  runProjectChapterConcatCleanupBatchV1,
  type ProjectChapterConcatCleanupDeleteInputV1,
  type ProjectChapterConcatCleanupBatchResultV1,
} from "@/lib/editron/services/chapter-concat-cleanup-runtime-v1";
import { createProjectRenderSnapshotBindingV1 }
  from "@/lib/editron/services/project-render-snapshot-binding-v1";

const NOW = new Date("2026-09-01T08:00:00.000Z");
const JOB_ID = "chr_123456789012";
const REPO_ROOT = resolve(__dirname, "../..");

function target() {
  const binding = createProjectRenderSnapshotBindingV1({
    artifactKind: "DELIVERY_PROOF",
    artifactId: JOB_ID,
    ownerId: "owner_cleanup_1",
    projectId: "project_cleanup_1",
    projectRevision: {
      schemaVersion: 1,
      value: 12,
      compatibilityUpdatedAt: "2026-09-01T07:59:00.000Z",
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
        sourceUrl: "https://remotion-source-bucket.example.test/child-0.mp4",
        sourceSizeBytes: 10_000,
      },
      {
        index: 1,
        providerRenderId: "render_child_1",
        bucketName: "remotion-source-bucket",
        region: "us-east-1",
        sourceUrl: "https://remotion-source-bucket.example.test/child-1.mp4",
        sourceSizeBytes: 20_000,
      },
    ],
    env: {
      ...process.env,
      EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET: "editron-concat-output",
      EDITRON_CHAPTER_CONCAT_OUTPUT_REGION: "us-east-1",
    },
  });
}

function pendingOutbox(): ProjectChapterConcatCleanupOutboxV1 {
  const concatTarget = target();
  return createProjectChapterConcatCleanupOutboxFromTargetV1({
    target: concatTarget,
    result: {
      generation: concatTarget.generation,
      sourceManifestHash: concatTarget.sourceManifestHash,
      outputBucket: concatTarget.outputBucket,
      outputRegion: concatTarget.outputRegion,
      outputKey: concatTarget.outputKey,
      url: projectChapterConcatOutputUrlV1(concatTarget),
      sizeBytes: 987_654,
    },
    now: NOW,
  });
}

type CleanupCollectionMock = Collection<ProjectChapterConcatCleanupOutboxV1> & {
  findOneAndUpdate: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
};

function cleanupCollectionMock(
  outbox = pendingOutbox(),
): CleanupCollectionMock {
  let delivered = false;
  return {
    findOneAndUpdate: vi.fn(async (_filter, update) => {
      if (delivered) return null;
      delivered = true;
      const set = (update as {
        $set: {
          lease: ProjectChapterConcatCleanupOutboxV1["lease"];
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

function request(secret?: string): Request {
  return new Request(
    "https://editron.example.test/api/cron/cleanup-editron-chapter-concat",
    { headers: secret ? { authorization: `Bearer ${secret}` } : {} },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("project chapter concat cleanup V1", () => {
  it("creates one deterministic immutable cleanup identity from the exact concat result", () => {
    const first = pendingOutbox();
    const replay = pendingOutbox();

    expect(replay).toEqual(first);
    expect(first._id).toMatch(/^project-chapter-concat-cleanup_[a-f0-9]{64}$/);
    expect(first.descriptor).toMatchObject({
      scope: "PROJECT_CHAPTER_CONCAT_CLEANUP",
      artifactKind: "REMOTION_AWS_CHAPTER_CONCAT_OUTPUT",
      provider: "AWS_S3",
      credentialScopeId: "EDITRON_CHAPTER_CONCAT_CLEANUP_AWS",
      parentAdmissionId: JOB_ID,
      outputBucket: "editron-concat-output",
      outputRegion: "us-east-1",
      outputKey: `editron-concat/v1/${first.descriptor.generation}.mp4`,
      output: {
        url: projectChapterConcatOutputUrlV1(target()),
        sizeBytes: 987_654,
      },
    });
    expect(() => assertProjectChapterConcatCleanupOutboxV1(first)).not.toThrow();
  });

  it("rejects descriptor tampering and a result that does not match the signed target", () => {
    const original = pendingOutbox();
    expect(() => assertProjectChapterConcatCleanupOutboxV1({
      ...original,
      descriptor: {
        ...original.descriptor,
        output: { ...original.descriptor.output, sizeBytes: 987_655 },
      },
    })).toThrow("PROJECT_CHAPTER_CONCAT_CLEANUP_DESCRIPTOR_HASH_MISMATCH");

    const concatTarget = target();
    expect(() => createProjectChapterConcatCleanupOutboxFromTargetV1({
      target: concatTarget,
      result: {
        generation: concatTarget.generation,
        sourceManifestHash: concatTarget.sourceManifestHash,
        outputBucket: "attacker-bucket",
        outputRegion: concatTarget.outputRegion,
        outputKey: concatTarget.outputKey,
        url: projectChapterConcatOutputUrlV1(concatTarget),
        sizeBytes: 1,
      },
      now: NOW,
    })).toThrow("PROJECT_CHAPTER_CONCAT_CLEANUP_RESULT_IDENTITY_MISMATCH");
  });

  it("claims first, deletes only the immutable S3 tuple, and commits the exact receipt", async () => {
    const outbox = pendingOutbox();
    const collection = cleanupCollectionMock(outbox);
    const prepareCredentials = vi.fn(async () => undefined);
    const deleteObject = vi.fn(async (
      _input: ProjectChapterConcatCleanupDeleteInputV1,
    ) => ({ freedBytes: 987_654 }));

    await expect(runProjectChapterConcatCleanupBatchV1({
      collection,
      limit: 1,
      now: NOW,
      prepareCredentials,
      deleteObject,
    })).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      failed: 0,
      results: [{ state: "DONE", freedBytes: 987_654 }],
    });

    expect(collection.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      deleteObject.mock.invocationCallOrder[0],
    );
    expect(deleteObject).toHaveBeenCalledWith({
      region: "us-east-1",
      bucket: "editron-concat-output",
      key: outbox.descriptor.outputKey,
      outputSizeBytes: 987_654,
    });
    expect(JSON.stringify(deleteObject.mock.calls[0]?.[0])).not.toContain(
      outbox.descriptor.output.url,
    );
    const completionWrite = collection.updateOne.mock.calls[0]!;
    expect(completionWrite[0]).toMatchObject({
      _id: outbox._id,
      status: "RUNNING",
      "descriptor.descriptorHash": outbox.descriptor.descriptorHash,
    });
    expect(completionWrite[1]).toMatchObject({
      $set: {
        status: "DONE",
        completion: { completedAt: NOW, freedBytes: 987_654 },
      },
    });
  });

  it("fails closed without cleanup credentials and sanitizes provider failures", async () => {
    expect(() => resolveProjectChapterConcatCleanupAwsCredentialsV1({
      NODE_ENV: "test",
    })).toThrow(
      "PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_CREDENTIALS_NOT_CONFIGURED",
    );
    expect(() => resolveProjectChapterConcatCleanupAwsCredentialsV1({
      NODE_ENV: "test",
      EDITRON_CHAPTER_CONCAT_CLEANUP_AWS_ACCESS_KEY_ID: "key-only",
    })).toThrow("PROJECT_CHAPTER_CONCAT_CLEANUP_AWS_CREDENTIALS_INCOMPLETE");

    const collection = cleanupCollectionMock();
    const providerError = new Error("secret=must-never-be-persisted");
    providerError.name = "AccessDeniedException";
    await expect(runProjectChapterConcatCleanupBatchV1({
      collection,
      limit: 1,
      now: NOW,
      prepareCredentials: vi.fn(async () => undefined),
      deleteObject: vi.fn(async () => { throw providerError; }),
    })).resolves.toMatchObject({
      claimed: 1,
      completed: 0,
      failed: 1,
      results: [{ state: "RETRY_SCHEDULED" }],
    });
    const releaseUpdate = collection.updateOne.mock.calls[0]![1];
    expect(releaseUpdate).toMatchObject({
      $set: {
        status: "PENDING",
        availableAt: new Date(NOW.getTime() + 30_000),
        lastError: "PROJECT_CHAPTER_CONCAT_CLEANUP_PROVIDER_AccessDeniedException",
      },
    });
    expect(JSON.stringify(releaseUpdate)).not.toContain("must-never-be-persisted");
  });

  it("fails loudly if completion ownership is lost after object deletion", async () => {
    const collection = cleanupCollectionMock();
    collection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    await expect(runProjectChapterConcatCleanupBatchV1({
      collection,
      limit: 1,
      now: NOW,
      prepareCredentials: vi.fn(async () => undefined),
      deleteObject: vi.fn(async () => ({ freedBytes: 987_654 })),
    })).rejects.toThrow("PROJECT_CHAPTER_CONCAT_CLEANUP_RELEASE_WRITE_UNPROVED");
    expect(collection.findOne).toHaveBeenCalledWith({
      _id: pendingOutbox()._id,
      "descriptor.descriptorHash": pendingOutbox().descriptor.descriptorHash,
    });
  });

  it("protects the cron and registers its bounded schedule and lease indexes", async () => {
    const runner = vi.fn(async (): Promise<ProjectChapterConcatCleanupBatchResultV1> => ({
      claimed: 1,
      completed: 1,
      failed: 0,
      results: [{ outboxId: pendingOutbox()._id, state: "DONE", freedBytes: 987_654 }],
    }));
    vi.stubEnv("CRON_SECRET", "concat-cleanup-secret");

    expect((await handleProjectChapterConcatCleanupCronV1(request(), runner)).status).toBe(401);
    expect(runner).not.toHaveBeenCalled();
    const success = await handleProjectChapterConcatCleanupCronV1(
      request("concat-cleanup-secret"),
      runner,
    );
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toMatchObject({ success: true });

    const configuration = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(configuration.crons).toContainEqual({
      path: "/api/cron/cleanup-editron-chapter-concat",
      schedule: "*/5 * * * *",
    });
    const mongoSource = readFileSync(
      resolve(REPO_ROOT, "lib/editron/db/mongodb.ts"),
      "utf8",
    );
    expect(mongoSource).toContain("chapter_concat_status_available_createdAt");
    expect(mongoSource).toContain("chapter_concat_status_leaseExpiresAt");
  });
});
