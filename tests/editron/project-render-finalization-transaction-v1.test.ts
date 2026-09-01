import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getDatabase: vi.fn(),
}));

const renderJobMocks = vi.hoisted(() => ({
  complete: vi.fn(),
  fail: vi.fn(),
  fenceStale: vi.fn(),
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
    completeProjectRenderJobFinalizationV1: renderJobMocks.complete,
    failProjectRenderJobFinalizationV1: renderJobMocks.fail,
    fenceStaleProjectRenderJobFinalizationV1: renderJobMocks.fenceStale,
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
  const db = {
    collection: vi.fn(() => projects),
  };
  const client = {
    startSession: vi.fn(() => session),
  };
  databaseMocks.connectToDatabase.mockResolvedValue({ client, db });
  return { client, db, projects, session };
}

describe("project render finalization transaction owner v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.getDatabase.mockResolvedValue({ collection: vi.fn() });
    renderJobMocks.complete.mockResolvedValue({ ok: true, status: "CURRENT" });
    renderJobMocks.fail.mockResolvedValue({ ok: true, status: "CURRENT" });
    renderJobMocks.fenceStale.mockResolvedValue({ ok: true, status: "STALE" });
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
    })).resolves.toEqual({ ok: true, status: "STALE" });

    expect(renderJobMocks.complete).not.toHaveBeenCalled();
    expect(renderJobMocks.fenceStale).toHaveBeenCalledWith(expect.objectContaining({
      authorization: AUTHORIZATION,
      observedProjectRevision: {
        schemaVersion: 1,
        value: 8,
        compatibilityUpdatedAt: "2026-09-01T00:02:00.000Z",
      },
      claimToken: "claim-stale",
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
    })).resolves.toEqual({ ok: true, status: "STALE" });

    expect(renderJobMocks.fenceStale).toHaveBeenCalledWith(expect.objectContaining({
      observedProjectRevision: null,
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
