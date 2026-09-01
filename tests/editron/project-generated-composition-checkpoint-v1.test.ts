import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHAT_RESTORABLE_PROJECT_FIELDS,
  CheckpointService,
  captureRestorableProjectState,
  projectStateFingerprint,
} from "@/lib/editron/services/checkpoint-service";
import {
  ProjectGeneratedCompositionEntryValidationErrorV1,
} from "@/lib/editron/services/project-generated-composition-entry-v1";
import {
  ProjectMutationWriteError,
  projectService,
  type ProjectRevisionV1,
} from "@/lib/editron/services/project-service";

const persistence = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: {
    CHECKPOINTS: "editron_prev.checkpoints",
    PROJECTS: "editron_prev.projects",
  },
  connectToDatabase: vi.fn(),
  getDatabase: persistence.getDatabase,
}));
vi.mock("@/lib/editron/services/asset-resolver", () => ({
  assetResolver: {
    resolveProjectAssets: vi.fn(async (overlays) => overlays),
    stripUrlsForLLM: vi.fn((overlays) => overlays),
  },
}));
vi.mock("@/lib/services/orgMemberService", () => ({
  orgMemberService: { isMember: vi.fn() },
}));
vi.mock("@/lib/shared/project-links", () => ({ removeProjectFromLinks: vi.fn() }));
vi.mock("@/lib/services/org-wallet-flag", () => ({
  isOrgWalletBillingEnabled: vi.fn(() => false),
}));

const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 4,
  compatibilityUpdatedAt: "2026-08-15T10:00:00.000Z",
};

describe("generated composition checkpoint participation", () => {
  beforeEach(() => {
    persistence.findOne.mockReset();
    persistence.findOneAndUpdate.mockReset();
    persistence.getDatabase.mockReset();
    persistence.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({
        findOne: persistence.findOne,
        findOneAndUpdate: persistence.findOneAndUpdate,
      })),
    });
  });

  it("captures generated composition state in the canonical checkpoint snapshot", () => {
    const generatedCompositions = [{ compositionId: "composition-1" }];
    const state = captureRestorableProjectState({
      overlays: [],
      generatedCompositions,
    });

    expect(CHAT_RESTORABLE_PROJECT_FIELDS).toContain("generatedCompositions");
    expect(state.presentFields).toContain("generatedCompositions");
    expect(state.fields.generatedCompositions).toEqual(generatedCompositions);
  });

  it("restores the whole field through ProjectService and advances once", async () => {
    persistence.findOne.mockResolvedValue({
      projectId: "project-1",
      userId: "user-1",
      overlays: [],
      generatedCompositions: [],
      aspectRatio: "16:9",
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 0,
      projectRevision: REVISION.value,
      updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    });
    persistence.findOneAndUpdate.mockResolvedValue({
      projectId: "project-1",
      generatedCompositions: [],
      projectRevision: 5,
    });

    const result = await projectService.restoreCheckpointState(
      "user-1",
      "project-1",
      {
        checkpointId: "checkpoint-generated-composition",
        actorKind: "SYSTEM",
        expectedRevision: REVISION,
        setFields: { generatedCompositions: [] },
        unsetFields: [],
      },
    );

    expect(result.receipt.revision.value).toBe(5);
    expect(persistence.findOneAndUpdate.mock.calls[0][1]).toMatchObject({
      $set: { generatedCompositions: [] },
      $inc: { projectRevision: 1 },
    });
  });

  it("fails closed for older checkpoints that never captured composition state", async () => {
    const legacyState = {
      presentFields: ["overlays" as const],
      fields: { overlays: [] },
    };
    const service = new CheckpointService();
    vi.spyOn(service, "getCheckpoint").mockResolvedValue({
      checkpointId: "checkpoint-legacy",
      sessionId: "session-1",
      projectId: "project-1",
      userId: "user-1",
      overlays: [],
      projectState: legacyState,
      stateHash: projectStateFingerprint(legacyState),
      stateHashVersion: 2,
      timestamp: new Date(),
      description: "Legacy checkpoint",
      type: "before-llm",
      createdAt: new Date(),
    });

    const result = await service.restoreProjectCheckpoint(
      "checkpoint-legacy",
      "user-1",
      { projectId: "project-1", expectedRevision: REVISION, actorKind: "SYSTEM" },
    );

    expect(result).toMatchObject({
      restored: false,
      reason: "legacy-checkpoint-missing-generated-composition-state",
    });
    expect(persistence.getDatabase).not.toHaveBeenCalled();
  });

  it("rejects partial and invalid checkpoint state before persistence", async () => {
    await expect(projectService.restoreCheckpointState(
      "user-1",
      "project-1",
      {
        checkpointId: "checkpoint-partial-composition",
        actorKind: "SYSTEM",
        expectedRevision: REVISION,
        setFields: { "generatedCompositions.0": {} },
        unsetFields: [],
      },
    )).rejects.toBeInstanceOf(ProjectMutationWriteError);
    await expect(projectService.restoreCheckpointState(
      "user-1",
      "project-1",
      {
        checkpointId: "checkpoint-invalid-composition",
        actorKind: "SYSTEM",
        expectedRevision: REVISION,
        setFields: { generatedCompositions: [{}] },
        unsetFields: [],
      },
    )).rejects.toBeInstanceOf(ProjectGeneratedCompositionEntryValidationErrorV1);
    expect(persistence.getDatabase).not.toHaveBeenCalled();
  });
});
