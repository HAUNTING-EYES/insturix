import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getDatabase: vi.fn(),
}));

const renderJobMocks = vi.hoisted(() => ({
  claimFailedRetry: vi.fn(),
  claimInitial: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  failFromProvider: vi.fn(),
  fenceStaleWithCleanup: vi.fn(),
  fenceStaleProviderOutputWithCleanup: vi.fn(),
  releaseFailedRetry: vi.fn(),
  releaseInitial: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: {
    PROJECTS: "projects",
  },
  connectToDatabase: databaseMocks.connectToDatabase,
  getDatabase: databaseMocks.getDatabase,
}));

vi.mock("@/lib/services/orgMemberService", () => ({
  orgMemberService: {},
}));

vi.mock("@/lib/shared/project-links", () => ({
  removeProjectFromLinks: vi.fn(),
}));

vi.mock("@/lib/services/org-wallet-flag", () => ({
  isOrgWalletBillingEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/editron/services/render-job-service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/editron/services/render-job-service")
  >();
  return {
    ...actual,
    claimFailedProjectRenderJobFinalizationRetryV1: renderJobMocks.claimFailedRetry,
    claimProjectRenderJobFinalizationV1: renderJobMocks.claimInitial,
    completeProjectRenderJobFinalizationV1: renderJobMocks.complete,
    failProjectRenderJobFromProviderV1: renderJobMocks.failFromProvider,
    failProjectRenderJobFinalizationV1: renderJobMocks.fail,
    fenceStaleProjectRenderJobFinalizationWithCleanupV1:
      renderJobMocks.fenceStaleWithCleanup,
    fenceStaleProjectRenderJobProviderOutputWithCleanupV1:
      renderJobMocks.fenceStaleProviderOutputWithCleanup,
    releaseFailedProjectRenderJobFinalizationRetryClaimV1:
      renderJobMocks.releaseFailedRetry,
    releaseProjectRenderJobFinalizationClaimV1: renderJobMocks.releaseInitial,
  };
});

import { projectService } from "@/lib/editron/services/project-service";

const AUTHORIZATION = {
  schemaVersion: 1 as const,
  jobId: "project-render-finalization-transaction-job",
  ownerId: "project-render-finalization-owner",
  requestedByUserId: "project-render-finalization-requester",
  projectId: "project-render-finalization-project",
  projectRevision: {
    schemaVersion: 1 as const,
    value: 7,
    compatibilityUpdatedAt: "2026-09-01T00:00:00.000Z",
  },
  bindingHash: "a".repeat(64),
};

const FINALIZER_RESULT = {
  url: "https://render.example.test/final.mp4",
  sizeBytes: 100,
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

const FINALIZATION_CLAIM = {
  ok: true as const,
  status: "CURRENT" as const,
  jobId: AUTHORIZATION.jobId,
  providerRenderId: "provider-render-1",
  claimToken: "claim-transaction",
  sourceOutputUrl: "https://render.example.test/source.mp4",
  sourceOutputSize: 200,
  expectedDurationMs: 5_000,
  authorization: AUTHORIZATION,
  binding: { scope: "PROJECT_SNAPSHOT" },
};

type ProjectRevisionRow = {
  projectRevision: number;
  updatedAt: Date;
};

function createTransactionFixture() {
  const session = {
    withTransaction: vi.fn(async (callback: () => Promise<unknown>) => callback()),
    endSession: vi.fn(async () => undefined),
  };
  const projects = {
    findOneAndUpdate: vi.fn(async (): Promise<ProjectRevisionRow | null> => ({
      projectRevision: AUTHORIZATION.projectRevision.value,
      updatedAt: new Date(AUTHORIZATION.projectRevision.compatibilityUpdatedAt),
    })),
    findOne: vi.fn(async (): Promise<ProjectRevisionRow | null> => null),
    updateOne: vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 })),
  };
  const renderJobs = { collectionName: "editron_render_jobs" };
  const renderSourceCleanupOutbox = {
    collectionName: "editron_project_render_source_cleanup_outbox_v1",
  };
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "projects") return projects;
      if (name === "editron_render_jobs") return renderJobs;
      if (name === "editron_project_render_source_cleanup_outbox_v1") {
        return renderSourceCleanupOutbox;
      }
      throw new Error(`Unexpected collection: ${name}`);
    }),
  };
  const client = {
    startSession: vi.fn(() => session),
  };
  databaseMocks.connectToDatabase.mockResolvedValue({ client, db });
  return {
    client,
    db,
    projects,
    renderJobs,
    renderSourceCleanupOutbox,
    session,
  };
}

describe("project render finalization transaction owner v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.getDatabase.mockResolvedValue({ collection: vi.fn() });
    renderJobMocks.claimFailedRetry.mockResolvedValue(FINALIZATION_CLAIM);
    renderJobMocks.claimInitial.mockResolvedValue(FINALIZATION_CLAIM);
    renderJobMocks.complete.mockResolvedValue({ ok: true, status: "CURRENT" });
    renderJobMocks.fail.mockResolvedValue({ ok: true, status: "CURRENT" });
    renderJobMocks.failFromProvider.mockResolvedValue({ ok: true, status: "CURRENT" });
    renderJobMocks.fenceStaleWithCleanup.mockResolvedValue({
      ok: true,
      status: "STALE",
      cleanupOutboxId: `project-render-source-cleanup_${"a".repeat(64)}`,
    });
    renderJobMocks.fenceStaleProviderOutputWithCleanup.mockResolvedValue({
      ok: true,
      status: "STALE",
      cleanupOutboxId: `project-render-source-cleanup_${"b".repeat(64)}`,
    });
    renderJobMocks.releaseFailedRetry.mockResolvedValue({ ok: true, status: "CURRENT" });
    renderJobMocks.releaseInitial.mockResolvedValue({ ok: true, status: "CURRENT" });
  });

  it("serializes the exact project revision, final render publication, and fence release", async () => {
    const fixture = createTransactionFixture();
    const now = new Date("2026-09-01T00:01:00.000Z");

    await expect(projectService.completeProjectRenderJobFinalizationTransactionV1({
      authorization: AUTHORIZATION,
      claimToken: "claim-current",
      result: FINALIZER_RESULT,
      now,
    })).resolves.toEqual({ ok: true, status: "CURRENT" });

    expect(fixture.session.withTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      },
    );
    expect(fixture.projects.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: AUTHORIZATION.projectId,
        userId: AUTHORIZATION.ownerId,
        projectRevision: AUTHORIZATION.projectRevision.value,
        updatedAt: new Date(AUTHORIZATION.projectRevision.compatibilityUpdatedAt),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          renderFinalizationTransactionFenceV1: expect.objectContaining({
            schemaVersion: 1,
            jobId: AUTHORIZATION.jobId,
            kind: "complete",
            acquiredAt: now,
          }),
        }),
      }),
      expect.objectContaining({ session: fixture.session }),
    );
    expect(renderJobMocks.complete).toHaveBeenCalledWith(expect.objectContaining({
      authorization: AUTHORIZATION,
      currentProjectRevision: AUTHORIZATION.projectRevision,
      claimToken: "claim-current",
      result: FINALIZER_RESULT,
      now,
      session: fixture.session,
    }));
    expect(fixture.projects.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: AUTHORIZATION.projectId,
        userId: AUTHORIZATION.ownerId,
        "renderFinalizationTransactionFenceV1.transactionToken": expect.any(String),
      }),
      { $unset: { renderFinalizationTransactionFenceV1: "" } },
      { session: fixture.session },
    );
    expect(fixture.projects.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      renderJobMocks.complete.mock.invocationCallOrder[0],
    );
    expect(renderJobMocks.complete.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.projects.updateOne.mock.invocationCallOrder[0],
    );
    expect(fixture.session.endSession).toHaveBeenCalledOnce();
  });

  it("fences a stale render in the same transaction instead of publishing it", async () => {
    const fixture = createTransactionFixture();
    fixture.projects.findOneAndUpdate.mockResolvedValueOnce(null);
    fixture.projects.findOne.mockResolvedValueOnce({
      projectRevision: 8,
      updatedAt: new Date("2026-09-01T00:02:00.000Z"),
    });

    await expect(projectService.completeProjectRenderJobFinalizationTransactionV1({
      authorization: AUTHORIZATION,
      claimToken: "claim-stale",
      result: FINALIZER_RESULT,
    })).resolves.toMatchObject({ ok: true, status: "STALE" });

    expect(renderJobMocks.complete).not.toHaveBeenCalled();
    expect(renderJobMocks.fenceStaleWithCleanup).toHaveBeenCalledWith(expect.objectContaining({
      authorization: AUTHORIZATION,
      observedProjectRevision: {
        schemaVersion: 1,
        value: 8,
        compatibilityUpdatedAt: "2026-09-01T00:02:00.000Z",
      },
      claimToken: "claim-stale",
      collection: fixture.renderJobs,
      cleanupCollection: fixture.renderSourceCleanupOutbox,
      session: fixture.session,
    }));
    expect(fixture.projects.updateOne).not.toHaveBeenCalled();
  });

  it("fences a deleted project and never publishes the final artifact", async () => {
    const fixture = createTransactionFixture();
    fixture.projects.findOneAndUpdate.mockResolvedValueOnce(null);

    await expect(projectService.completeProjectRenderJobFinalizationTransactionV1({
      authorization: AUTHORIZATION,
      claimToken: "claim-deleted",
      result: FINALIZER_RESULT,
    })).resolves.toMatchObject({ ok: true, status: "STALE" });

    expect(renderJobMocks.fenceStaleWithCleanup).toHaveBeenCalledWith(expect.objectContaining({
      observedProjectRevision: null,
      collection: fixture.renderJobs,
      cleanupCollection: fixture.renderSourceCleanupOutbox,
      session: fixture.session,
    }));
    expect(renderJobMocks.complete).not.toHaveBeenCalled();
  });

  it("reconciles finalization failure under the same transaction fence", async () => {
    const fixture = createTransactionFixture();

    await expect(projectService.failProjectRenderJobFinalizationTransactionV1({
      authorization: AUTHORIZATION,
      claimToken: "claim-failed",
      error: "finalizer failed",
    })).resolves.toEqual({ ok: true, status: "CURRENT" });

    expect(renderJobMocks.fail).toHaveBeenCalledWith(expect.objectContaining({
      authorization: AUTHORIZATION,
      currentProjectRevision: AUTHORIZATION.projectRevision,
      claimToken: "claim-failed",
      error: "finalizer failed",
      session: fixture.session,
    }));
    expect(renderJobMocks.complete).not.toHaveBeenCalled();
  });

  it("serializes provider failure and initial finalization claim/release owners", async () => {
    const fixture = createTransactionFixture();
    const now = new Date("2026-09-01T00:03:00.000Z");

    await expect(projectService.failProjectRenderJobFromProviderTransactionV1({
      authorization: AUTHORIZATION,
      providerRenderId: "provider-render-1",
      bucketName: "render-bucket",
      error: "provider failed",
      now,
    })).resolves.toEqual({ ok: true, status: "CURRENT" });
    await expect(projectService.claimProjectRenderJobFinalizationTransactionV1({
      authorization: AUTHORIZATION,
      providerRenderId: "provider-render-1",
      bucketName: "render-bucket",
      sourceOutputUrl: FINALIZATION_CLAIM.sourceOutputUrl,
      sourceOutputSize: FINALIZATION_CLAIM.sourceOutputSize,
      claimToken: FINALIZATION_CLAIM.claimToken,
      now,
    })).resolves.toEqual(FINALIZATION_CLAIM);
    await expect(projectService.releaseProjectRenderJobFinalizationClaimTransactionV1({
      authorization: AUTHORIZATION,
      claimToken: FINALIZATION_CLAIM.claimToken,
      now,
    })).resolves.toEqual({ ok: true, status: "CURRENT" });

    expect(renderJobMocks.failFromProvider).toHaveBeenCalledWith(expect.objectContaining({
      authorization: AUTHORIZATION,
      currentProjectRevision: AUTHORIZATION.projectRevision,
      providerRenderId: "provider-render-1",
      bucketName: "render-bucket",
      now,
      session: fixture.session,
    }));
    expect(renderJobMocks.claimInitial).toHaveBeenCalledWith(expect.objectContaining({
      authorization: AUTHORIZATION,
      currentProjectRevision: AUTHORIZATION.projectRevision,
      claimToken: FINALIZATION_CLAIM.claimToken,
      now,
      collection: fixture.renderJobs,
      session: fixture.session,
    }));
    expect(renderJobMocks.releaseInitial).toHaveBeenCalledWith(expect.objectContaining({
      authorization: AUTHORIZATION,
      currentProjectRevision: AUTHORIZATION.projectRevision,
      claimToken: FINALIZATION_CLAIM.claimToken,
      collection: fixture.renderJobs,
      session: fixture.session,
    }));
  });

  it("persists cleanup for stale provider output and never exposes an enqueueable claim", async () => {
    const fixture = createTransactionFixture();
    fixture.projects.findOneAndUpdate.mockResolvedValueOnce(null);
    fixture.projects.findOne.mockResolvedValueOnce({
      projectRevision: 8,
      updatedAt: new Date("2026-09-01T00:05:00.000Z"),
    });

    await expect(projectService.claimProjectRenderJobFinalizationTransactionV1({
      authorization: AUTHORIZATION,
      providerRenderId: "provider-render-1",
      bucketName: "render-bucket",
      sourceOutputUrl: FINALIZATION_CLAIM.sourceOutputUrl,
      sourceOutputSize: FINALIZATION_CLAIM.sourceOutputSize,
    })).resolves.toEqual({
      ok: false,
      status: "NON_CURRENT",
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "PROJECT_REVISION_STALE",
    });

    expect(renderJobMocks.claimInitial).not.toHaveBeenCalled();
    expect(renderJobMocks.fenceStaleProviderOutputWithCleanup).toHaveBeenCalledWith(
      expect.objectContaining({
        authorization: AUTHORIZATION,
        observedProjectRevision: {
          schemaVersion: 1,
          value: 8,
          compatibilityUpdatedAt: "2026-09-01T00:05:00.000Z",
        },
        providerRenderId: "provider-render-1",
        bucketName: "render-bucket",
        sourceOutputUrl: FINALIZATION_CLAIM.sourceOutputUrl,
        sourceOutputSize: FINALIZATION_CLAIM.sourceOutputSize,
        collection: fixture.renderJobs,
        cleanupCollection: fixture.renderSourceCleanupOutbox,
        session: fixture.session,
      }),
    );
    expect(fixture.projects.updateOne).not.toHaveBeenCalled();
  });

  it("serializes failed-finalization retry claim and release owners", async () => {
    const fixture = createTransactionFixture();
    const now = new Date("2026-09-01T00:04:00.000Z");

    await expect(projectService.claimFailedProjectRenderJobFinalizationRetryTransactionV1({
      authorization: AUTHORIZATION,
      claimToken: FINALIZATION_CLAIM.claimToken,
      leaseMs: 60_000,
      now,
    })).resolves.toEqual(FINALIZATION_CLAIM);
    await expect(
      projectService.releaseFailedProjectRenderJobFinalizationRetryClaimTransactionV1({
        authorization: AUTHORIZATION,
        claimToken: FINALIZATION_CLAIM.claimToken,
        error: "dispatch failed",
        now,
      }),
    ).resolves.toEqual({ ok: true, status: "CURRENT" });

    expect(renderJobMocks.claimFailedRetry).toHaveBeenCalledWith(expect.objectContaining({
      authorization: AUTHORIZATION,
      currentProjectRevision: AUTHORIZATION.projectRevision,
      claimToken: FINALIZATION_CLAIM.claimToken,
      leaseMs: 60_000,
      now,
      session: fixture.session,
    }));
    expect(renderJobMocks.releaseFailedRetry).toHaveBeenCalledWith(expect.objectContaining({
      authorization: AUTHORIZATION,
      currentProjectRevision: AUTHORIZATION.projectRevision,
      claimToken: FINALIZATION_CLAIM.claimToken,
      error: "dispatch failed",
      now,
      session: fixture.session,
    }));
  });

  it("rejects a stale current-only provider mutation before its specialized owner", async () => {
    const fixture = createTransactionFixture();
    fixture.projects.findOneAndUpdate.mockResolvedValueOnce(null);
    fixture.projects.findOne.mockResolvedValueOnce({
      projectRevision: 8,
      updatedAt: new Date("2026-09-01T00:05:00.000Z"),
    });

    await expect(projectService.failProjectRenderJobFromProviderTransactionV1({
      authorization: AUTHORIZATION,
      providerRenderId: "provider-render-1",
      bucketName: "render-bucket",
      error: "stale provider callback",
    })).resolves.toEqual({
      ok: false,
      status: "NON_CURRENT",
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "PROJECT_REVISION_STALE",
    });

    expect(renderJobMocks.failFromProvider).not.toHaveBeenCalled();
    expect(fixture.projects.updateOne).not.toHaveBeenCalled();
  });

  it("rejects malformed authorization before opening a database transaction", async () => {
    await expect(projectService.completeProjectRenderJobFinalizationTransactionV1({
      authorization: { ...AUTHORIZATION, bindingHash: "forged" },
      claimToken: "claim-forged",
      result: FINALIZER_RESULT,
    })).resolves.toEqual({
      ok: false,
      status: "NON_CURRENT",
      code: "PROJECT_ARTIFACT_NOT_CURRENT",
      reason: "AUTHORIZATION_INVALID",
    });

    expect(databaseMocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it("aborts instead of reporting success when the project fence cannot be released", async () => {
    const fixture = createTransactionFixture();
    fixture.projects.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });

    await expect(projectService.completeProjectRenderJobFinalizationTransactionV1({
      authorization: AUTHORIZATION,
      claimToken: "claim-release-lost",
      result: FINALIZER_RESULT,
    })).rejects.toThrow("Render finalization transaction fence could not be released");

    expect(fixture.session.endSession).toHaveBeenCalledOnce();
  });
});
