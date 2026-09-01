import type { ClientSession, Collection } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({ connectToDatabase: vi.fn() }));
const renderJobMocks = vi.hoisted(() => ({ claimInitial: vi.fn() }));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  connectToDatabase: databaseMocks.connectToDatabase,
  getDatabase: vi.fn(),
}));
vi.mock("@/lib/services/orgMemberService", () => ({ orgMemberService: {} }));
vi.mock("@/lib/shared/project-links", () => ({ removeProjectFromLinks: vi.fn() }));
vi.mock("@/lib/services/org-wallet-flag", () => ({
  isOrgWalletBillingEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/editron/services/render-job-service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/editron/services/render-job-service")
  >();
  return { ...actual, claimProjectRenderJobFinalizationV1: renderJobMocks.claimInitial };
});

import {
  RenderJobChapterOrchestrationSchema,
  RenderJobDispatchSchema,
  RenderJobSchema,
  createPendingRenderJob,
  createRenderJobChapterOrchestrationV1,
} from "@/lib/editron/schemas/render-job";
import {
  createProjectRenderSnapshotBindingV1,
} from "@/lib/editron/services/project-render-snapshot-binding-v1";
import {
  ChapterChildDispatchSchemaV1,
  createChapterChildDispatchV1,
} from "@/lib/editron/services/chapter-render-dispatch-v1";
import {
  materializeChapterRenderCleanupV1,
  type ChapterRenderCleanupChapterDocumentV1,
  type ChapterRenderCleanupParentDocumentV1,
} from "@/lib/editron/services/chapter-render-cleanup-materializer-v1";
import type { ProjectChapterConcatCleanupOutboxV1 } from "@/lib/editron/services/chapter-concat-cleanup-v1";
import type { ProjectRenderSourceCleanupOutboxV1 } from "@/lib/editron/services/project-render-source-cleanup-v1";
import {
  createProjectRenderDispatchIdentityV1,
  createProjectRenderJobAuthorizationV1,
} from "@/lib/editron/services/render-job-service";
import { projectService } from "@/lib/editron/services/project-service";

const ID = "chr_123456789012";
const OWNER = "provider-free-owner";
const REQUESTER = "provider-free-requester";
const PROJECT = "provider-free-project";
const REGION = "us-east-1";
const REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: "2026-09-01T00:00:00.000Z",
};
const NOW = new Date("2026-09-01T00:01:00.000Z");
const OUTPUT = { url: "https://chapter.example.test/aggregate.mp4", sizeBytes: 101 };
const FINALIZED_OUTPUT = {
  url: "https://chapter.example.test/final.mp4",
  sizeBytes: 202,
  expectedDurationMs: 5_000,
  receipt: {
    expectedDurationMs: 5_000,
    formatDurationMs: 5_000,
    videoDurationMs: 5_000,
    audioDurationMs: 5_000,
    videoCodec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    fps: 30,
    sampleRate: 48_000,
    channels: 2,
    verificationToleranceMs: 1,
  },
};

function clone<T>(value: T): T { return structuredClone(value); }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyMongoSetV1(
  target: Record<string, unknown>,
  set: Record<string, unknown>,
): void {
  for (const [path, value] of Object.entries(set)) {
    const parts = path.split(".");
    let cursor = target;
    for (const part of parts.slice(0, -1)) {
      const nested = cursor[part];
      if (!isRecord(nested)) cursor[part] = {};
      cursor = cursor[part] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1];
    if (leaf !== undefined) cursor[leaf] = clone(value);
  }
}

function applyMongoUnsetV1(
  target: Record<string, unknown>,
  unset: Record<string, unknown>,
): void {
  for (const path of Object.keys(unset)) {
    const parts = path.split(".");
    let cursor: Record<string, unknown> | undefined = target;
    for (const part of parts.slice(0, -1)) {
      const nested: unknown = cursor?.[part];
      if (!isRecord(nested)) {
        cursor = undefined;
        break;
      }
      cursor = nested;
    }
    const leaf = parts[parts.length - 1];
    if (cursor && leaf !== undefined) delete cursor[leaf];
  }
}

function createFixture(currentProjectRevision = 8) {
  const binding = createProjectRenderSnapshotBindingV1({
    artifactKind: "RENDERED_PREVIEW",
    artifactId: ID,
    ownerId: OWNER,
    projectId: PROJECT,
    projectRevision: REVISION,
    sequenceId: "provider-free-sequence",
    compositionId: "provider-free-composition",
    renderContract: { kind: "provider-free-finalization-test" },
    durationInFrames: 300,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSourceSnapshotHash: "a".repeat(64),
    containedVideoTargets: [],
  });
  const authorization = createProjectRenderJobAuthorizationV1({
    jobId: ID,
    ownerId: OWNER,
    requestedByUserId: REQUESTER,
    projectId: PROJECT,
    projectRevision: REVISION,
    binding,
  });
  const dispatchIdentity = createProjectRenderDispatchIdentityV1({
    jobId: ID,
    bindingHash: binding.bindingHash,
  });
  const dispatch = RenderJobDispatchSchema.parse({
    version: 1,
    phase: "NOT_ATTEMPTED",
    billingState: "PENDING",
    attemptToken: dispatchIdentity.attemptToken,
    creditIdempotencyKey: dispatchIdentity.creditIdempotencyKey,
    billingWallet: { type: "user", clerkUserId: OWNER },
  });
  const orchestration = RenderJobChapterOrchestrationSchema.parse({
    version: 1,
    scope: "CHAPTER_ORCHESTRATION",
    aggregateJobId: ID,
    bindingHash: binding.bindingHash,
    selectedRegion: REGION,
    state: "READY_FOR_FINALIZATION",
    reservedAt: NOW,
    startingAt: NOW,
    runningAt: NOW,
    concatenatingAt: NOW,
    readyForFinalizationAt: NOW,
    chapterCount: 1,
    progress: 1,
    completedChapterCount: 1,
    chapterLayoutManifestHash: "b".repeat(64),
    aggregateOutput: OUTPUT,
  });
  const deliveryManifest = {
    version: "editron-render-delivery-manifest-v1",
    mode: "embedded",
    createdAt: NOW.toISOString(),
    completedAt: null,
    primaryArtifact: { kind: "mixed-master", renderId: ID, status: "rendering", url: null },
    music: { embedded: true, removedOverlayIds: [], handoff: null },
  };
  const parent = RenderJobSchema.parse({
    ...createPendingRenderJob(
      ID,
      OWNER,
      PROJECT,
      REGION,
      5_000,
      undefined,
      binding,
      REQUESTER,
      dispatch,
      createRenderJobChapterOrchestrationV1({
        aggregateJobId: ID,
        bindingHash: binding.bindingHash,
        selectedRegion: REGION,
        reservedAt: NOW,
      }),
    ),
    status: "rendering",
    progress: 1,
    deliveryManifest,
    chapterOrchestration: orchestration,
  });
  const childDispatch = ChapterChildDispatchSchemaV1.parse({
    ...createChapterChildDispatchV1({
      parentAdmissionId: ID,
      childIndex: 0,
      bindingHash: binding.bindingHash,
    }),
    phase: "BOUND",
    attemptStartedAt: NOW,
    providerAcceptedAt: NOW,
    providerBoundAt: NOW,
    providerRenderId: "child-render-0",
    providerBucketName: "child-output-bucket-0",
    providerRegion: REGION,
  });
  const chapter = {
    _id: ID,
    projectId: PROJECT,
    userId: REQUESTER,
    ownerId: OWNER,
    status: "completed",
    chapters: [{
      index: 0,
      status: "completed",
      parentAdmissionId: ID,
      renderId: "child-render-0",
      bucketName: "child-output-bucket-0",
      region: REGION,
      outputUrl: "https://child.example.test/chapter-0.mp4",
      outputSize: 101,
      dispatch: childDispatch,
    }],
    projectRenderSnapshotBinding: binding,
    outputUrl: "https://child.example.test/chapter-0.mp4",
  };
  let parentRow = clone(parent);
  const childUpdates: unknown[] = [];
  const chapterUpdates: unknown[] = [];
  const renderUpdates: unknown[] = [];
  const outbox = (updates: unknown[]) => {
    const seenIds = new Set<string>();
    return {
      updateOne: vi.fn(async (filter: unknown, update: unknown) => {
        const id = isRecord(filter) && typeof filter._id === "string" ? filter._id : undefined;
        if (id !== undefined && seenIds.has(id)) {
          return { acknowledged: true, matchedCount: 1, modifiedCount: 0, upsertedCount: 0 };
        }
        if (id !== undefined) seenIds.add(id);
        updates.push({ filter, update });
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }),
    };
  };
  const renderJobs = {
    findOne: vi.fn(async () => clone(parentRow)),
    findOneAndUpdate: vi.fn(async (
      _filter: unknown,
      update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> },
      _options?: unknown,
    ) => {
      renderUpdates.push(update);
      applyMongoSetV1(parentRow as unknown as Record<string, unknown>, update.$set ?? {});
      applyMongoUnsetV1(parentRow as unknown as Record<string, unknown>, update.$unset ?? {});
      return clone(parentRow);
    }),
    updateOne: vi.fn(async (
      _filter: unknown,
      update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> },
      _options?: unknown,
    ) => {
      renderUpdates.push(update);
      applyMongoSetV1(parentRow as unknown as Record<string, unknown>, update.$set ?? {});
      applyMongoUnsetV1(parentRow as unknown as Record<string, unknown>, update.$unset ?? {});
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    }),
  };
  const chapterCollection = {
    findOne: vi.fn(async () => clone(chapter)),
    updateOne: vi.fn(async (_filter: unknown, update: { $set?: Record<string, unknown> }) => {
      chapterUpdates.push(update);
      applyMongoSetV1(chapter as unknown as Record<string, unknown>, update.$set ?? {});
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    }),
  };
  const childCleanup = outbox(childUpdates);
  const concatCleanup = outbox([]);
  const projects = {
    findOneAndUpdate: vi.fn(async () => currentProjectRevision === REVISION.value
      ? { projectRevision: REVISION.value, updatedAt: new Date(REVISION.compatibilityUpdatedAt) }
      : null),
    findOne: vi.fn(async () => ({
      projectRevision: currentProjectRevision,
      updatedAt: new Date("2026-09-01T00:02:00.000Z"),
    })),
    updateOne: vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 })),
  };
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "projects") return projects;
      if (name === "editron_render_jobs") return renderJobs;
      if (name === "editron_render_chapters") return chapterCollection;
      if (name === "editron_project_render_source_cleanup_outbox_v1") return childCleanup;
      if (name === "editron_project_chapter_concat_cleanup_outbox_v1") return concatCleanup;
      throw new Error(`Unexpected collection: ${name}`);
    }),
  };
  const session = {
    withTransaction: vi.fn(async (callback: () => Promise<unknown>) => callback()),
    endSession: vi.fn(async () => undefined),
  };
  databaseMocks.connectToDatabase.mockResolvedValue({
    client: { startSession: vi.fn(() => session) },
    db,
  });
  return {
    authorization,
    parentRow,
    chapter,
    renderJobsMock: renderJobs,
    renderJobs: renderJobs as unknown as Collection<ChapterRenderCleanupParentDocumentV1>,
    chapterCollection: chapterCollection as unknown as Collection<ChapterRenderCleanupChapterDocumentV1>,
    childCleanup: childCleanup as unknown as Collection<ProjectRenderSourceCleanupOutboxV1>,
    concatCleanup: concatCleanup as unknown as Collection<ProjectChapterConcatCleanupOutboxV1>,
    childUpdates,
    chapterUpdates,
    renderUpdates,
    projects,
    session,
  };
}

describe("provider-free chapter finalization cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderJobMocks.claimInitial.mockResolvedValue({ ok: true, status: "CURRENT" });
  });

  it("fences stale aggregate output and materializes the exact child cleanup", async () => {
    const fixture = createFixture();
    const result = await projectService.claimProjectRenderJobFinalizationTransactionV1({
      authorization: fixture.authorization,
      sourceOutputUrl: OUTPUT.url,
      sourceOutputSize: OUTPUT.sizeBytes,
      now: NOW,
    });

    expect(result).toEqual({
      ok: false,
      status: "NON_CURRENT",
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "PROJECT_REVISION_STALE",
    });
    expect(renderJobMocks.claimInitial).not.toHaveBeenCalled();
    expect(fixture.renderJobs.updateOne).toHaveBeenCalledOnce();
    expect(fixture.renderUpdates).toHaveLength(1);
    const parentUpdate = fixture.renderUpdates[0] as { $set: Record<string, unknown> };
    expect(parentUpdate.$set).toMatchObject({
      "chapterOrchestration.state": "STALE",
      "chapterOrchestration.staleAt": NOW,
      "chapterOrchestration.failure": {
        code: "CHAPTER_ORCHESTRATION_STALE",
        message: expect.any(String),
      },
    });
    expect(parentUpdate.$set).not.toHaveProperty("chapterOrchestration.chapterCount");
    expect(parentUpdate.$set).not.toHaveProperty("chapterOrchestration.completedChapterCount");
    expect(parentUpdate.$set).not.toHaveProperty("chapterOrchestration.progress");
    expect(parentUpdate.$set).not.toHaveProperty("chapterOrchestration.chapterLayoutManifestHash");
    expect(parentUpdate.$set).not.toHaveProperty("chapterOrchestration.aggregateOutput");
    expect(fixture.parentRow.chapterOrchestration).toMatchObject({
      state: "STALE",
      staleAt: NOW,
      failure: {
        code: "CHAPTER_ORCHESTRATION_STALE",
        message: expect.any(String),
      },
      chapterCount: 1,
      completedChapterCount: 1,
      progress: 1,
      chapterLayoutManifestHash: "b".repeat(64),
      aggregateOutput: OUTPUT,
    });
    expect(fixture.childUpdates).toHaveLength(1);
    const childInsert = fixture.childUpdates[0] as { update: { $setOnInsert: Record<string, unknown> } };
    expect(childInsert.update.$setOnInsert.descriptor).toMatchObject({
      artifactKind: "REMOTION_AWS_CHAPTER_CHILD_RENDER_OUTPUT",
      providerRenderId: "child-render-0",
      bucketName: "child-output-bucket-0",
      sourceOutput: { url: "https://child.example.test/chapter-0.mp4", sizeBytes: 101 },
    });
    expect(fixture.projects.updateOne).not.toHaveBeenCalled();
  });

  it("replays the exact stale boundary without a second parent transition", async () => {
    const fixture = createFixture();
    const input = {
      authorization: fixture.authorization,
      sourceOutputUrl: OUTPUT.url,
      sourceOutputSize: OUTPUT.sizeBytes,
      now: NOW,
    };
    const first = await projectService.claimProjectRenderJobFinalizationTransactionV1(input);
    const second = await projectService.claimProjectRenderJobFinalizationTransactionV1(input);

    expect(second).toEqual(first);
    expect(fixture.renderJobs.updateOne).toHaveBeenCalledOnce();
    expect(fixture.renderUpdates).toHaveLength(1);
    expect(fixture.childUpdates).toHaveLength(1);
    expect(fixture.chapterUpdates).toHaveLength(1);
    expect(fixture.parentRow.chapterOrchestration?.state).toBe("STALE");
  });

  it("fails closed for partial identity, provider-free standard auth, and wrong aggregate output", async () => {
    const fixture = createFixture();
    await expect(projectService.claimProjectRenderJobFinalizationTransactionV1({
      authorization: fixture.authorization,
      providerRenderId: "partial-provider",
      sourceOutputUrl: OUTPUT.url,
      sourceOutputSize: OUTPUT.sizeBytes,
    })).resolves.toMatchObject({ reason: "INPUT_INVALID" });
    expect(databaseMocks.connectToDatabase).not.toHaveBeenCalled();

    const standardAuthorization = { ...fixture.authorization, jobId: "standard-admission" };
    await expect(projectService.claimProjectRenderJobFinalizationTransactionV1({
      authorization: standardAuthorization,
      sourceOutputUrl: OUTPUT.url,
      sourceOutputSize: OUTPUT.sizeBytes,
    })).resolves.toMatchObject({ reason: "INPUT_INVALID" });

    const wrongFixture = createFixture();
    wrongFixture.parentRow.chapterOrchestration = {
      ...wrongFixture.parentRow.chapterOrchestration!,
      aggregateOutput: { url: "https://wrong.example.test/output.mp4", sizeBytes: 101 },
    };
    await expect(projectService.claimProjectRenderJobFinalizationTransactionV1({
      authorization: wrongFixture.authorization,
      sourceOutputUrl: OUTPUT.url,
      sourceOutputSize: OUTPUT.sizeBytes,
    })).resolves.toMatchObject({ reason: "JOB_STATE_NOT_ACTIVE" });
    expect(wrongFixture.renderJobs.updateOne).not.toHaveBeenCalled();
    expect(wrongFixture.childUpdates).toHaveLength(0);
  });

  it("does not claim aggregate output from a terminal orchestration state", async () => {
    const fixture = createFixture(7);
    fixture.parentRow.chapterOrchestration = RenderJobChapterOrchestrationSchema.parse({
      ...fixture.parentRow.chapterOrchestration,
      state: "COMPLETED",
      finalizingAt: NOW,
      completedAt: NOW,
    });

    await expect(projectService.claimProjectRenderJobFinalizationTransactionV1({
      authorization: fixture.authorization,
      sourceOutputUrl: OUTPUT.url,
      sourceOutputSize: OUTPUT.sizeBytes,
      now: NOW,
    })).resolves.toMatchObject({ reason: "JOB_STATE_NOT_ACTIVE" });
    expect(renderJobMocks.claimInitial).not.toHaveBeenCalled();
    expect(fixture.renderJobs.updateOne).not.toHaveBeenCalled();
    expect(fixture.childUpdates).toHaveLength(0);
  });

  it("materializes a provider-free terminal replay after marking its parent stale", async () => {
    const fixture = createFixture();
    fixture.parentRow.status = "error";
    fixture.parentRow.artifactState = "ACTIVE";
    fixture.parentRow.finalization = {
      version: "editron-render-finalization-v1",
      state: "failed",
      sourceOutputUrl: OUTPUT.url,
      sourceOutputSize: OUTPUT.sizeBytes,
      attempts: 3,
      completedAt: NOW,
      error: "finalizer failed",
    };
    const result = await materializeChapterRenderCleanupV1({
      authorization: fixture.authorization,
      chapterCollection: fixture.chapterCollection,
      childCleanupCollection: fixture.childCleanup,
      concatCleanupCollection: fixture.concatCleanup,
      parentRenderJobs: fixture.renderJobs,
      session: fixture.session as unknown as ClientSession,
      boundary: "TERMINAL_FINALIZATION_FAILURE",
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: true,
      status: "MATERIALIZED",
      boundary: "TERMINAL_FINALIZATION_FAILURE",
    });
    expect(fixture.childUpdates).toHaveLength(1);
    expect(fixture.chapterUpdates).toHaveLength(1);
  });

  it("commits final output, parent completion, and cleanup in one project transaction", async () => {
    const fixture = createFixture(REVISION.value);
    fixture.parentRow.status = "finalizing";
    fixture.parentRow.chapterOrchestration = RenderJobChapterOrchestrationSchema.parse({
      ...fixture.parentRow.chapterOrchestration,
      state: "FINALIZING",
      finalizingAt: NOW,
    });
    fixture.parentRow.finalization = {
      version: "editron-render-finalization-v1",
      state: "running",
      claimToken: "provider-free-final-claim",
      sourceOutputUrl: OUTPUT.url,
      sourceOutputSize: OUTPUT.sizeBytes,
      attempts: 1,
    };

    await expect(projectService.completeProjectRenderJobFinalizationTransactionV1({
      authorization: fixture.authorization,
      claimToken: "provider-free-final-claim",
      result: FINALIZED_OUTPUT,
      now: NOW,
    })).resolves.toEqual({ ok: true, status: "CURRENT" });

    expect(fixture.parentRow).toMatchObject({
      status: "done",
      artifactState: "ACTIVE",
      chapterOrchestration: { state: "COMPLETED", completedAt: NOW },
      finalization: {
        state: "done",
        sourceOutputUrl: OUTPUT.url,
        sourceOutputSize: OUTPUT.sizeBytes,
        outputUrl: FINALIZED_OUTPUT.url,
        outputSize: FINALIZED_OUTPUT.sizeBytes,
      },
    });
    expect(fixture.childUpdates).toHaveLength(1);
    expect(fixture.chapterUpdates).toHaveLength(1);
    expect(fixture.projects.updateOne).toHaveBeenCalledOnce();
    for (const call of fixture.renderJobsMock.updateOne.mock.calls) {
      expect(call[2]).toEqual({ session: fixture.session });
    }
    expect(fixture.renderJobsMock.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ session: fixture.session }),
    );
  });

  it("commits exhausted failure, parent failure, and stale cleanup atomically", async () => {
    const fixture = createFixture(REVISION.value);
    fixture.parentRow.status = "finalizing";
    fixture.parentRow.chapterOrchestration = RenderJobChapterOrchestrationSchema.parse({
      ...fixture.parentRow.chapterOrchestration,
      state: "FINALIZING",
      finalizingAt: NOW,
    });
    fixture.parentRow.finalization = {
      version: "editron-render-finalization-v1",
      state: "running",
      claimToken: "provider-free-failed-claim",
      sourceOutputUrl: OUTPUT.url,
      sourceOutputSize: OUTPUT.sizeBytes,
      attempts: 3,
    };

    await expect(projectService.failProjectRenderJobFinalizationTransactionV1({
      authorization: fixture.authorization,
      claimToken: "provider-free-failed-claim",
      error: "finalizer exhausted",
      now: NOW,
    })).resolves.toEqual({ ok: true, status: "CURRENT" });

    expect(fixture.parentRow).toMatchObject({
      status: "error",
      artifactState: "STALE",
      chapterOrchestration: {
        state: "FAILED",
        failedAt: NOW,
        failure: {
          code: "CHAPTER_ORCHESTRATION_FAILED",
          message: "finalizer exhausted",
        },
      },
      finalization: {
        state: "failed",
        attempts: 3,
        sourceOutputUrl: OUTPUT.url,
        sourceOutputSize: OUTPUT.sizeBytes,
      },
    });
    expect(fixture.childUpdates).toHaveLength(1);
    expect(fixture.chapterUpdates).toHaveLength(1);
    expect(fixture.projects.updateOne).toHaveBeenCalledOnce();
    expect(fixture.renderUpdates).toHaveLength(3);
    expect((fixture.renderUpdates[1] as { $set: Record<string, unknown> }).$set)
      .toMatchObject({ "chapterOrchestration.state": "FAILED" });
    expect((fixture.renderUpdates[2] as { $set: Record<string, unknown> }).$set)
      .toMatchObject({ artifactState: "STALE" });
    for (const call of fixture.renderJobsMock.updateOne.mock.calls) {
      expect(call[2]).toEqual({ session: fixture.session });
    }
  });

  it("atomically stales the parent when the project changes during finalization", async () => {
    const fixture = createFixture(REVISION.value + 1);
    fixture.parentRow.status = "finalizing";
    fixture.parentRow.chapterOrchestration = RenderJobChapterOrchestrationSchema.parse({
      ...fixture.parentRow.chapterOrchestration,
      state: "FINALIZING",
      finalizingAt: NOW,
    });
    fixture.parentRow.finalization = {
      version: "editron-render-finalization-v1",
      state: "running",
      claimToken: "provider-free-stale-claim",
      sourceOutputUrl: OUTPUT.url,
      sourceOutputSize: OUTPUT.sizeBytes,
      attempts: 1,
    };

    await expect(projectService.completeProjectRenderJobFinalizationTransactionV1({
      authorization: fixture.authorization,
      claimToken: "provider-free-stale-claim",
      result: FINALIZED_OUTPUT,
      now: NOW,
    })).resolves.toEqual({ ok: true, status: "STALE" });

    expect(fixture.parentRow).toMatchObject({
      status: "error",
      artifactState: "STALE",
      chapterOrchestration: {
        state: "STALE",
        staleAt: NOW,
        failure: {
          code: "CHAPTER_ORCHESTRATION_STALE",
          message: expect.any(String),
        },
      },
      finalization: {
        state: "failed",
        sourceOutputUrl: OUTPUT.url,
        sourceOutputSize: OUTPUT.sizeBytes,
      },
    });
    expect(fixture.childUpdates).toHaveLength(1);
    expect(fixture.chapterUpdates).toHaveLength(1);
    expect(fixture.projects.updateOne).not.toHaveBeenCalled();
    expect(fixture.renderUpdates).toHaveLength(2);
    expect((fixture.renderUpdates[0] as { $set: Record<string, unknown> }).$set)
      .toMatchObject({ artifactState: "STALE" });
    expect((fixture.renderUpdates[1] as { $set: Record<string, unknown> }).$set)
      .toMatchObject({ "chapterOrchestration.state": "STALE" });
    for (const call of fixture.renderJobsMock.updateOne.mock.calls) {
      expect(call[2]).toEqual({ session: fixture.session });
    }
  });

  it("fails closed before writes when a child dispatch tuple is mixed", async () => {
    const fixture = createFixture();
    fixture.parentRow.status = "error";
    fixture.parentRow.artifactState = "ACTIVE";
    fixture.parentRow.finalization = {
      version: "editron-render-finalization-v1",
      state: "failed",
      sourceOutputUrl: OUTPUT.url,
      sourceOutputSize: OUTPUT.sizeBytes,
      attempts: 3,
      completedAt: NOW,
      error: "finalizer failed",
    };
    fixture.chapter.chapters[0]!.dispatch = {
      ...fixture.chapter.chapters[0]!.dispatch,
      providerBucketName: "other-output-bucket-0",
    };

    await expect(materializeChapterRenderCleanupV1({
      authorization: fixture.authorization,
      chapterCollection: fixture.chapterCollection,
      childCleanupCollection: fixture.childCleanup,
      concatCleanupCollection: fixture.concatCleanup,
      parentRenderJobs: fixture.renderJobs,
      session: fixture.session as unknown as ClientSession,
      boundary: "TERMINAL_FINALIZATION_FAILURE",
      now: NOW,
    })).rejects.toThrow("CHAPTER_RENDER_CLEANUP_CHILD_DISPATCH_MISMATCH");
    expect(fixture.childUpdates).toHaveLength(0);
    expect(fixture.chapterUpdates).toHaveLength(0);
  });
});
