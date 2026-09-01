import type { ClientSession, Collection } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editron/db/mongodb", () => ({ getDatabase: vi.fn() }));

import {
  createProjectChapterConcatTargetV1,
  projectChapterConcatOutputUrlV1,
  type ProjectChapterConcatTargetV1,
} from "@/lib/editron/services/chapter-concat-contract-v1";
import {
  type ChapterRenderCleanupChapterDocumentV1,
  type ChapterRenderCleanupMaterializerInputV1,
  type ChapterRenderCleanupParentDocumentV1,
  materializeChapterRenderCleanupV1,
} from "@/lib/editron/services/chapter-render-cleanup-materializer-v1";
import {
  type ProjectChapterConcatCleanupOutboxV1,
} from "@/lib/editron/services/chapter-concat-cleanup-v1";
import {
  type ProjectRenderJobAuthorizationV1,
} from "@/lib/editron/services/render-job-service";
import {
  createProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from "@/lib/editron/services/project-render-snapshot-binding-v1";
import {
  type ProjectRenderSourceCleanupOutboxV1,
} from "@/lib/editron/services/project-render-source-cleanup-v1";

const ADMISSION_ID = "chr_123456789012";
const OWNER_ID = "owner_1";
const REQUESTER_ID = "requester_1";
const PROJECT_ID = "project_1";
const REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: "2026-09-01T00:00:00.000Z",
};
const FIRST_MATERIALIZED_AT = new Date("2026-09-01T00:01:00.000Z");
const RETRY_MATERIALIZED_AT = new Date("2026-09-01T00:02:00.000Z");

type TestUpdate = {
  $set?: Record<string, unknown>;
  $setOnInsert?: Record<string, unknown>;
};

type MaterializerOverrides = Partial<Pick<
  ChapterRenderCleanupMaterializerInputV1,
  "boundary" | "expectedProviderOutput" | "now"
>>;

type MaterializerFixture = {
  authorization: ProjectRenderJobAuthorizationV1;
  binding: ProjectRenderSnapshotBindingV1;
  target?: ProjectChapterConcatTargetV1;
  chapter: Record<string, unknown>;
  parent: Record<string, unknown>;
  chapterCollection: Collection<ChapterRenderCleanupChapterDocumentV1>;
  parentRenderJobs: Collection<ChapterRenderCleanupParentDocumentV1>;
  childCleanupCollection: Collection<ProjectRenderSourceCleanupOutboxV1>;
  concatCleanupCollection: Collection<ProjectChapterConcatCleanupOutboxV1>;
  chapterUpdates: unknown[];
  parentUpdates: unknown[];
  childUpdates: unknown[];
  concatUpdates: unknown[];
  session: ClientSession;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createBinding(): ProjectRenderSnapshotBindingV1 {
  return createProjectRenderSnapshotBindingV1({
    artifactKind: "RENDERED_PREVIEW",
    artifactId: ADMISSION_ID,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision: REVISION,
    sequenceId: "sequence_1",
    compositionId: "composition_1",
    renderContract: { kind: "chapter-cleanup-test", fps: 30 },
    durationInFrames: 300,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSourceSnapshotHash: "a".repeat(64),
    containedVideoTargets: [],
  });
}

function createAuthorization(
  binding: ProjectRenderSnapshotBindingV1,
): ProjectRenderJobAuthorizationV1 {
  return {
    schemaVersion: 1,
    jobId: ADMISSION_ID,
    ownerId: OWNER_ID,
    requestedByUserId: REQUESTER_ID,
    projectId: PROJECT_ID,
    projectRevision: REVISION,
    bindingHash: binding.bindingHash,
  };
}

function createChild(index: number, outputSize: number): Record<string, unknown> {
  const bucketName = `remotion-child-bucket-${index}`;
  return {
    index,
    status: "completed",
    parentAdmissionId: ADMISSION_ID,
    renderId: `child-render-${index}`,
    bucketName,
    region: "us-east-1",
    outputUrl: `https://${bucketName}.example.test/chapter-${index}.mp4`,
    outputSize,
  };
}

function createTarget(
  binding: ProjectRenderSnapshotBindingV1,
  children: readonly Record<string, unknown>[],
): ProjectChapterConcatTargetV1 {
  return createProjectChapterConcatTargetV1({
    parentAdmissionId: ADMISSION_ID,
    projectRenderSnapshotBinding: binding,
    sources: children.map((child, index) => ({
      index,
      providerRenderId: child.renderId as string,
      bucketName: child.bucketName as string,
      region: child.region as string,
      sourceUrl: child.outputUrl as string,
      sourceSizeBytes: child.outputSize as number,
    })),
  });
}

function createConcatResult(
  target: ProjectChapterConcatTargetV1,
  sizeBytes: number,
): Record<string, unknown> {
  return {
    generation: target.generation,
    sourceManifestHash: target.sourceManifestHash,
    outputBucket: target.outputBucket,
    outputRegion: target.outputRegion,
    outputKey: target.outputKey,
    url: projectChapterConcatOutputUrlV1(target),
    sizeBytes,
    chapters: target.sources.length,
    completedAt: FIRST_MATERIALIZED_AT,
  };
}

function createOutboxCollection(updates: unknown[]) {
  const rows = new Map<string, unknown>();
  return {
    updateOne: vi.fn(async (filter: unknown, update: TestUpdate) => {
      updates.push({ filter, update });
      if (update.$setOnInsert) {
        const rowId = update.$setOnInsert._id;
        if (typeof rowId !== "string") {
          throw new Error("TEST_OUTBOX_ID_MISSING");
        }
        if (rows.has(rowId)) {
          return { acknowledged: true, matchedCount: 1, modifiedCount: 0, upsertedCount: 0 };
        }
        rows.set(rowId, clone(update.$setOnInsert));
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    }),
  };
}

function createFixture(childCount: 1 | 2): MaterializerFixture {
  const binding = createBinding();
  const authorization = createAuthorization(binding);
  const children = Array.from({ length: childCount }, (_, index) => (
    createChild(index, 100 + index * 25)
  ));
  const target = childCount === 2 ? createTarget(binding, children) : undefined;
  const concatResult = target ? createConcatResult(target, 333) : undefined;
  const chapter: Record<string, unknown> = {
    _id: ADMISSION_ID,
    projectId: PROJECT_ID,
    userId: REQUESTER_ID,
    ownerId: OWNER_ID,
    status: "completed",
    artifactLifecycleVersion: 1,
    artifactState: "ACTIVE",
    retentionState: "RETAINED",
    chapters: children,
    projectRenderSnapshotBinding: binding,
    ...(target
      ? { concatStatus: "done", concatTarget: target, concatResult, outputUrl: concatResult?.url }
      : { outputUrl: children[0]?.outputUrl }),
  };
  const parent: Record<string, unknown> = {
    _id: ADMISSION_ID,
    userId: OWNER_ID,
    requestedByUserId: REQUESTER_ID,
    projectId: PROJECT_ID,
    providerRenderId: ADMISSION_ID,
    bucketName: "chapter-render",
    region: "us-east-1",
    status: "done",
    artifactState: "ACTIVE",
    projectRenderSnapshotBinding: binding,
    finalization: {
      state: "done",
      sourceOutputUrl: target ? concatResult?.url : children[0]?.outputUrl,
      sourceOutputSize: target ? concatResult?.sizeBytes : children[0]?.outputSize,
      attempts: 0,
    },
  };
  const chapterUpdates: unknown[] = [];
  const parentUpdates: unknown[] = [];
  const childUpdates: unknown[] = [];
  const concatUpdates: unknown[] = [];
  const chapterCollection = {
    findOne: vi.fn(async () => clone(chapter)),
    updateOne: vi.fn(async (filter: unknown, update: TestUpdate) => {
      chapterUpdates.push({ filter, update });
      const materialization = update.$set?.cleanupMaterialization;
      if (materialization !== undefined) chapter.cleanupMaterialization = clone(materialization);
      if (update.$set?.artifactState !== undefined) chapter.artifactState = update.$set.artifactState;
      if (update.$set?.retentionState !== undefined) chapter.retentionState = update.$set.retentionState;
      if (update.$set?.artifactInvalidatedAt !== undefined) {
        chapter.artifactInvalidatedAt = clone(update.$set.artifactInvalidatedAt);
      }
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    }),
  };
  const parentRenderJobs = {
    findOne: vi.fn(async () => clone(parent)),
    updateOne: vi.fn(async (filter: unknown, update: TestUpdate) => {
      parentUpdates.push({ filter, update });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    }),
  };
  const childCleanupCollection = createOutboxCollection(childUpdates);
  const concatCleanupCollection = createOutboxCollection(concatUpdates);
  return {
    authorization,
    binding,
    target,
    chapter,
    parent,
    chapterCollection: chapterCollection as unknown as Collection<ChapterRenderCleanupChapterDocumentV1>,
    parentRenderJobs: parentRenderJobs as unknown as Collection<ChapterRenderCleanupParentDocumentV1>,
    childCleanupCollection: childCleanupCollection as unknown as Collection<ProjectRenderSourceCleanupOutboxV1>,
    concatCleanupCollection: concatCleanupCollection as unknown as Collection<ProjectChapterConcatCleanupOutboxV1>,
    chapterUpdates,
    parentUpdates,
    childUpdates,
    concatUpdates,
    session: {} as ClientSession,
  };
}

function materialize(
  fixture: MaterializerFixture,
  overrides: MaterializerOverrides = {},
) {
  return materializeChapterRenderCleanupV1({
    authorization: fixture.authorization,
    chapterCollection: fixture.chapterCollection,
    childCleanupCollection: fixture.childCleanupCollection,
    concatCleanupCollection: fixture.concatCleanupCollection,
    parentRenderJobs: fixture.parentRenderJobs,
    session: fixture.session,
    boundary: "CURRENT_SUCCESS",
    now: FIRST_MATERIALIZED_AT,
    ...overrides,
  });
}

describe("chapter render cleanup materializer V1", () => {
  beforeEach(() => {
    vi.stubEnv("EDITRON_CHAPTER_CONCAT_OUTPUT_BUCKET", "editron-concat-output");
    vi.stubEnv("EDITRON_CHAPTER_CONCAT_OUTPUT_REGION", "us-east-1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("materializes every child and the exact concat output for a multi-child chapter", async () => {
    const fixture = createFixture(2);

    const result = await materialize(fixture, {
      expectedProviderOutput: {
        providerRenderId: ADMISSION_ID,
        bucketName: "chapter-render",
        region: "us-east-1",
        sourceOutputUrl: fixture.target
          ? projectChapterConcatOutputUrlV1(fixture.target)
          : "https://unused.example.test/output.mp4",
        sourceOutputSize: 333,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      status: "MATERIALIZED",
      boundary: "CURRENT_SUCCESS",
      parentAdmissionId: ADMISSION_ID,
    });
    expect(result.childOutboxIds).toHaveLength(2);
    expect(result.childOutboxIds).toEqual(result.childOutboxes.map((outbox) => outbox._id));
    expect(result.concatOutboxId).toBe(result.concatOutbox?._id);
    expect(result.concatOutbox?.descriptor).toMatchObject({
      parentAdmissionId: ADMISSION_ID,
      generation: fixture.target?.generation,
      sourceManifestHash: fixture.target?.sourceManifestHash,
      outputBucket: "editron-concat-output",
      outputRegion: "us-east-1",
      outputKey: fixture.target?.outputKey,
      output: {
        url: fixture.target ? projectChapterConcatOutputUrlV1(fixture.target) : undefined,
        sizeBytes: 333,
      },
    });
    expect(result.childOutboxes.map((outbox) => ({
      artifactKind: outbox.descriptor.artifactKind,
      chapterIndex: outbox.descriptor.artifactKind === "REMOTION_AWS_CHAPTER_CHILD_RENDER_OUTPUT"
        ? outbox.descriptor.chapterIndex
        : undefined,
      providerRenderId: outbox.descriptor.providerRenderId,
      bucketName: outbox.descriptor.bucketName,
      sourceOutput: outbox.descriptor.sourceOutput,
    }))).toEqual([
      {
        artifactKind: "REMOTION_AWS_CHAPTER_CHILD_RENDER_OUTPUT",
        chapterIndex: 0,
        providerRenderId: "child-render-0",
        bucketName: "remotion-child-bucket-0",
        sourceOutput: {
          url: "https://remotion-child-bucket-0.example.test/chapter-0.mp4",
          sizeBytes: 100,
        },
      },
      {
        artifactKind: "REMOTION_AWS_CHAPTER_CHILD_RENDER_OUTPUT",
        chapterIndex: 1,
        providerRenderId: "child-render-1",
        bucketName: "remotion-child-bucket-1",
        sourceOutput: {
          url: "https://remotion-child-bucket-1.example.test/chapter-1.mp4",
          sizeBytes: 125,
        },
      },
    ]);
    expect(fixture.childUpdates).toHaveLength(2);
    expect(fixture.concatUpdates).toHaveLength(1);
    expect(fixture.chapterUpdates).toHaveLength(1);
    expect(fixture.parentUpdates).toHaveLength(0);
    expect(fixture.chapter.cleanupMaterialization).toMatchObject({
      schemaVersion: 1,
      boundary: "CURRENT_SUCCESS",
      childOutboxIds: result.childOutboxIds,
      concatOutboxId: result.concatOutboxId,
      materializedAt: FIRST_MATERIALIZED_AT,
    });
    expect(fixture.chapter).toMatchObject({
      artifactLifecycleVersion: 1,
      artifactState: "STALE",
      retentionState: "CLEANUP_PENDING",
      artifactInvalidatedAt: FIRST_MATERIALIZED_AT,
    });
  });

  it("materializes one child without creating a concat cleanup outbox", async () => {
    const fixture = createFixture(1);

    const result = await materialize(fixture, {
      expectedProviderOutput: {
        providerRenderId: ADMISSION_ID,
        bucketName: "chapter-render",
        region: "us-east-1",
        sourceOutputUrl: "https://remotion-child-bucket-0.example.test/chapter-0.mp4",
        sourceOutputSize: 100,
      },
    });

    expect(result.status).toBe("MATERIALIZED");
    expect(result.childOutboxIds).toHaveLength(1);
    expect(result.concatOutbox).toBeUndefined();
    expect(result.concatOutboxId).toBeUndefined();
    expect(fixture.concatUpdates).toHaveLength(0);
    expect(result.childOutboxes[0]?.descriptor).toMatchObject({
      artifactKind: "REMOTION_AWS_CHAPTER_CHILD_RENDER_OUTPUT",
      bucketName: "remotion-child-bucket-0",
      providerRenderId: "child-render-0",
      chapterIndex: 0,
      parentAdmissionId: ADMISSION_ID,
      sourceOutput: {
        url: "https://remotion-child-bucket-0.example.test/chapter-0.mp4",
        sizeBytes: 100,
      },
    });
    expect(result.childOutboxes[0]?.descriptor.bucketName).not.toBe("chapter-render");
  });

  it("replays with the original materialization time and stable IDs, then rejects a boundary conflict", async () => {
    const fixture = createFixture(2);
    const first = await materialize(fixture, { now: FIRST_MATERIALIZED_AT });
    const replay = await materialize(fixture, { now: RETRY_MATERIALIZED_AT });

    expect(replay.status).toBe("ALREADY_MATERIALIZED");
    expect(replay.childOutboxIds).toEqual(first.childOutboxIds);
    expect(replay.concatOutboxId).toBe(first.concatOutboxId);
    expect(replay.childOutboxes.map((outbox) => outbox.createdAt)).toEqual(
      first.childOutboxes.map((outbox) => outbox.createdAt),
    );
    expect(replay.childOutboxes[0]?.createdAt).toEqual(FIRST_MATERIALIZED_AT);
    expect(replay.childOutboxes[0]?.descriptor.createdAt).toBe(FIRST_MATERIALIZED_AT.toISOString());
    expect(replay.concatOutbox?.createdAt).toEqual(first.concatOutbox?.createdAt);
    expect(fixture.chapterUpdates).toHaveLength(1);

    await expect(materialize(fixture, {
      boundary: "STALE_FINALIZATION",
      now: RETRY_MATERIALIZED_AT,
    })).rejects.toThrow("CHAPTER_RENDER_CLEANUP_MATERIALIZATION_RECORD_INVALID");
    expect(fixture.chapterUpdates).toHaveLength(1);
  });

  it("rejects incomplete or mismatched evidence before any outbox or chapter link write", async () => {
    const cases: Array<{
      name: string;
      error: string;
      mutate: (fixture: MaterializerFixture) => void;
      overrides?: MaterializerOverrides;
    }> = [
      {
        name: "child output size is missing",
        error: "CHAPTER_RENDER_CLEANUP_CHILD_OUTPUT_SIZE_INVALID",
        mutate: (fixture) => {
          const chapters = fixture.chapter.chapters as Array<Record<string, unknown>>;
          chapters[0]!.outputSize = 0;
        },
      },
      {
        name: "concat target child tuple is mismatched",
        error: "CHAPTER_RENDER_CLEANUP_CONCAT_TARGET_CHILD_MISMATCH",
        mutate: (fixture) => {
          const chapters = fixture.chapter.chapters as Array<Record<string, unknown>>;
          chapters[1]!.outputSize = 999;
        },
      },
      {
        name: "concat terminal result is missing",
        error: "CHAPTER_RENDER_CLEANUP_CONCAT_RESULT_MISSING",
        mutate: (fixture) => {
          delete fixture.chapter.concatResult;
        },
      },
      {
        name: "finalization output identity is mismatched",
        error: "CHAPTER_RENDER_CLEANUP_PROVIDER_OUTPUT_MISMATCH",
        mutate: () => undefined,
        overrides: {
          expectedProviderOutput: {
            providerRenderId: ADMISSION_ID,
            bucketName: "chapter-render",
            region: "us-east-1",
            sourceOutputUrl: "https://wrong.example.test/output.mp4",
            sourceOutputSize: 333,
          },
        },
      },
    ];

    for (const testCase of cases) {
      const fixture = createFixture(2);
      testCase.mutate(fixture);

      await expect(materialize(fixture, testCase.overrides)).rejects.toThrow(testCase.error);
      expect(fixture.childUpdates, testCase.name).toHaveLength(0);
      expect(fixture.concatUpdates, testCase.name).toHaveLength(0);
      expect(fixture.chapterUpdates, testCase.name).toHaveLength(0);
      expect(fixture.parentUpdates, testCase.name).toHaveLength(0);
      expect(fixture.chapter.cleanupMaterialization, testCase.name).toBeUndefined();
    }
  });

  it("fails closed when a legacy chapter row has no explicit lifecycle", async () => {
    const fixture = createFixture(1);
    delete fixture.chapter.artifactLifecycleVersion;
    delete fixture.chapter.artifactState;
    delete fixture.chapter.retentionState;

    await expect(materialize(fixture)).rejects.toThrow(
      "CHAPTER_RENDER_CLEANUP_CHAPTER_LIFECYCLE_MIGRATION_REQUIRED",
    );
    expect(fixture.childUpdates).toHaveLength(0);
    expect(fixture.concatUpdates).toHaveLength(0);
    expect(fixture.chapterUpdates).toHaveLength(0);
  });
});
