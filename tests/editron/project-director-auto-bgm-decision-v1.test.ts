import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  autoBgmDecisionEvidenceHashV1,
  buildAutoBgmDecisionEvidence,
} from "@/lib/editron/services/auto-bgm-decision";

const persistenceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: persistenceMocks.findOne,
      updateOne: persistenceMocks.updateOne,
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

const EVALUATED_AT = "2026-09-01T10:00:00.000Z";

function evidence() {
  return buildAutoBgmDecisionEvidence({
    recommendation: { shouldAddBgm: true, reason: "Signals license a music bed." },
    providerAvailable: true,
    durationSec: 75,
    totalFrames: 2_250,
    fps: 30,
    mood: "inspirational",
    pacing: "medium",
    musicPrompt: "Clean instrumental background music.",
    evaluatedAt: EVALUATED_AT,
  });
}

function command() {
  const decision = evidence();
  return {
    expectedRevision: {
      schemaVersion: 1 as const,
      value: 7,
      compatibilityUpdatedAt: "2026-09-01T09:59:00.000Z",
    },
    directorLeaseId: "director_lease_auto_bgm",
    evidence: decision,
    evidenceHash: autoBgmDecisionEvidenceHashV1(decision),
  };
}

function projectFixture(projectRevision = 8) {
  return {
    projectId: "proj_auto_bgm",
    userId: "user_auto_bgm",
    name: "Auto-BGM fixture",
    overlays: [],
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 2_250,
    createdAt: new Date("2026-09-01T09:00:00.000Z"),
    updatedAt: new Date("2026-09-01T10:00:01.000Z"),
    projectRevision,
    visibility: "private" as const,
    autoEditStatus: "ready_for_chat",
    directorLock: false,
  };
}

describe("ProjectService Director Auto-BGM decision V1", () => {
  beforeEach(() => {
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it("commits validated evidence under the exact Director lease and revision", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:01.000Z"));
    try {
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const input = command();

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.recordDirectorAutoBgmDecisionV1(
          "user_auto_bgm",
          "proj_auto_bgm",
          input,
        )
      ));

      expect(captured.value).toMatchObject({
        projectId: "proj_auto_bgm",
        revision: { value: 8, compatibilityUpdatedAt: "2026-09-01T10:00:01.000Z" },
      });
      expect(captured.receipts).toEqual([captured.value]);
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        {
          projectId: "proj_auto_bgm",
          userId: "user_auto_bgm",
          projectRevision: 7,
          updatedAt: new Date("2026-09-01T09:59:00.000Z"),
          directorLock: true,
          directorLockToken: "director_lease_auto_bgm",
          autoEditStatus: "directing",
        },
        {
          $set: expect.objectContaining({
            "intelligence.autoBgmDecision": input.evidence,
            "intelligence.audio.autoBgmDecision": input.evidence,
            "intelligence.autoBgmDecisionBinding": expect.objectContaining({
              schemaVersion: 1,
              evidenceHash: input.evidenceHash,
              predecessor: "ACTIVE_DIRECTOR_LEASE",
              affectedRange: null,
              rightsRequirement: "NOT_APPLICABLE_NO_MEDIA_ATTACHED",
              invalidationRequirement: "NOT_REQUIRED_NO_RENDERABLE_STATE_CHANGE",
            }),
            updatedAt: new Date("2026-09-01T10:00:01.000Z"),
          }),
          $inc: { projectRevision: 1 },
        },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits no receipt when the revision, lease, or Director state is stale", async () => {
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    persistenceMocks.findOne.mockResolvedValueOnce(projectFixture());
    const { projectService } = await import("@/lib/editron/services/project-service");
    let settled: readonly unknown[] | undefined;

    await expect(projectService.captureMutationReceipts(
      () => projectService.recordDirectorAutoBgmDecisionV1(
        "user_auto_bgm",
        "proj_auto_bgm",
        command(),
      ),
      (receipts) => { settled = receipts; },
    )).rejects.toMatchObject({
      code: "PROJECT_REVISION_CONFLICT",
      currentRevision: { value: 8 },
    });
    expect(settled).toEqual([]);
  });

  it("rejects forged or malformed evidence before any project access", async () => {
    const { ProjectMutationWriteError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await expect(projectService.recordDirectorAutoBgmDecisionV1(
      "user_auto_bgm",
      "proj_auto_bgm",
      { ...command(), evidenceHash: "f".repeat(64) },
    )).rejects.toBeInstanceOf(ProjectMutationWriteError);
    await expect(projectService.recordDirectorAutoBgmDecisionV1(
      "user_auto_bgm",
      "proj_auto_bgm",
      {
        ...command(),
        evidence: { ...evidence(), status: "dispatched" as const },
      },
    )).rejects.toBeInstanceOf(ProjectMutationWriteError);
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});
