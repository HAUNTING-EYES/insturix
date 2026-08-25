import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: persistenceMocks.findOne,
      findOneAndUpdate: persistenceMocks.findOneAndUpdate,
    })),
  })),
  connectToDatabase: vi.fn(),
}));

vi.mock("@/lib/editron/services/asset-resolver", () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
  },
}));

vi.mock("@/lib/services/orgMemberService", () => ({ orgMemberService: {} }));
vi.mock("@/lib/shared/project-links", () => ({ removeProjectFromLinks: vi.fn() }));

const PROJECT_ID = "proj_pipeline_intent";
const USER_ID = "user_pipeline_intent";
const BASE_UPDATED_AT = "2026-08-25T00:00:00.000Z";

function projectFixture(
  projectRevision = 7,
  updatedAt = BASE_UPDATED_AT,
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Pipeline Director intent fixture",
    overlays: [],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 0,
    createdAt: new Date(BASE_UPDATED_AT),
    updatedAt: new Date(updatedAt),
    projectRevision,
    visibility: "private" as const,
    editMode: "auto",
    ...overrides,
  };
}

function revision(value = 7, compatibilityUpdatedAt = BASE_UPDATED_AT) {
  return {
    schemaVersion: 1 as const,
    value,
    compatibilityUpdatedAt,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  for (const mock of Object.values(persistenceMocks)) mock.mockReset();
});

describe("ProjectService pipeline Director intent V1", () => {
  it("records the finalize intent through an exact user-scoped CAS receipt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:01.000Z"));
    try {
      persistenceMocks.findOne.mockResolvedValueOnce(projectFixture());
      persistenceMocks.findOneAndUpdate.mockImplementationOnce(
        async (_filter: unknown, update: { $set: Record<string, unknown> }) => projectFixture(
          8,
          "2026-08-25T00:00:01.000Z",
          {
            pendingDirectorProfileId: update.$set.pendingDirectorProfileId,
            pendingDirectorUserId: update.$set.pendingDirectorUserId,
          },
        ),
      );
      const { projectService } = await import("@/lib/editron/services/project-service");

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.recordPipelineDirectorIntentV1(USER_ID, PROJECT_ID, {
          expectedRevision: revision(),
          profileId: "G-01",
        })
      ));
      if (captured.value.disposition !== "RECORDED") {
        throw new Error(`Expected RECORDED, got ${captured.value.disposition}.`);
      }

      expect(captured.value.receipt).toMatchObject({
        projectId: PROJECT_ID,
        revision: revision(8, "2026-08-25T00:00:01.000Z"),
      });
      expect(captured.receipts).toEqual([captured.value.receipt]);

      const [filter, update] = persistenceMocks.findOneAndUpdate.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, { pendingDirectorProfileId: string; pendingDirectorUserId: string }>,
      ];
      expect(filter).toMatchObject({
        projectId: PROJECT_ID,
        userId: USER_ID,
        pendingDirectorProfileId: { $exists: false },
        pendingDirectorUserId: { $exists: false },
        directorRunToken: { $exists: false },
        pipelineDirectorDispatch: { $exists: false },
        editMode: { $ne: "assist" },
      });
      expect((filter.$and as unknown[])).toEqual(expect.arrayContaining([
        expect.objectContaining({
          projectRevision: 7,
          updatedAt: new Date(BASE_UPDATED_AT),
        }),
        {
          $or: [
            { autoEditStatus: { $exists: false } },
            { autoEditStatus: "analysis_complete" },
          ],
        },
      ]));
      expect(update.$set).toMatchObject({
        pendingDirectorProfileId: "G-01",
        pendingDirectorUserId: USER_ID,
        updatedAt: new Date("2026-08-25T00:00:01.000Z"),
      });
      expect(update.$inc).toEqual({ projectRevision: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("replays only the identical pending intent and rejects malformed or competing lifecycle state", async () => {
    const { projectService } = await import("@/lib/editron/services/project-service");
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(7, BASE_UPDATED_AT, {
      pendingDirectorProfileId: "G-01",
      pendingDirectorUserId: USER_ID,
    }));
    await expect(projectService.recordPipelineDirectorIntentV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      profileId: "G-01",
    })).resolves.toEqual({ disposition: "ALREADY_RECORDED", currentRevision: revision() });

    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(7, BASE_UPDATED_AT, {
      pendingDirectorProfileId: "G-02",
      pendingDirectorUserId: USER_ID,
    }));
    await expect(projectService.recordPipelineDirectorIntentV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      profileId: "G-01",
    })).resolves.toEqual({ disposition: "NOT_ELIGIBLE" });

    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(7, BASE_UPDATED_AT, {
      directorRunToken: "director_run_active",
    }));
    await expect(projectService.recordPipelineDirectorIntentV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      profileId: "G-01",
    })).resolves.toEqual({ disposition: "NOT_ELIGIBLE" });

    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(7, BASE_UPDATED_AT, {
      pipelineDirectorDispatch: { malformed: true },
    }));
    await expect(projectService.recordPipelineDirectorIntentV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      profileId: "G-01",
    })).resolves.toEqual({ disposition: "NOT_ELIGIBLE" });

    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(7, BASE_UPDATED_AT, {
      editMode: "assist",
    }));
    await expect(projectService.recordPipelineDirectorIntentV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      profileId: "G-01",
    })).resolves.toEqual({ disposition: "NOT_ELIGIBLE" });

    expect(persistenceMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects stale input and returns the exact winning intent after a CAS race", async () => {
    const { projectService } = await import("@/lib/editron/services/project-service");
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture(8, "2026-08-25T00:00:02.000Z"));
    await expect(projectService.recordPipelineDirectorIntentV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      profileId: "G-01",
    })).rejects.toMatchObject({ code: "PROJECT_REVISION_CONFLICT" });
    expect(persistenceMocks.findOneAndUpdate).not.toHaveBeenCalled();

    const winner = projectFixture(8, "2026-08-25T00:00:03.000Z", {
      pendingDirectorProfileId: "G-01",
      pendingDirectorUserId: USER_ID,
    });
    persistenceMocks.findOne
      .mockResolvedValueOnce(projectFixture())
      .mockResolvedValueOnce(winner);
    persistenceMocks.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(projectService.recordPipelineDirectorIntentV1(USER_ID, PROJECT_ID, {
      expectedRevision: revision(),
      profileId: "G-01",
    })).resolves.toEqual({
      disposition: "ALREADY_RECORDED",
      currentRevision: revision(8, "2026-08-25T00:00:03.000Z"),
    });
  });

  it("makes the finalize route record an intent after status and report a truthful queue state", () => {
    const route = readFileSync(
      "app/api/services/pipeline/storyboard/[id]/finalize/route.ts",
      "utf8",
    );
    const intentStart = route.indexOf("const directorIntentSnapshot = await projectService.loadProjectForMutation(");
    const statusStart = route.indexOf("await transitionProjectStatus(");
    const responseStart = route.indexOf("return NextResponse.json({", intentStart);
    const intentBlock = route.slice(intentStart, responseStart);

    expect(intentStart).toBeGreaterThan(statusStart);
    expect(intentBlock).toContain("projectService.loadProjectForMutation(");
    expect(intentBlock).toContain("recordPipelineDirectorIntentV1(");
    expect(intentBlock).not.toContain("db.collection(COLLECTIONS.PROJECTS).updateOne(");
    expect(route).toContain("directorQueued: directorIntentQueued");
    expect(route).toContain("directorQueueState");
  });
});
