import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compactEditorStateForSave,
  mergeServerOwnedOverlayDataForSave,
  serializeEditorStateForSave,
} from "@/lib/editron/shared/project-save-payload";

const persistenceMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: { PROJECTS: "editron_prev.projects" },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: persistenceMocks.findOne,
      updateOne: persistenceMocks.updateOne,
    })),
  })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: persistenceMocks.auth,
}));

vi.mock("@/lib/editron/services/asset-resolver", () => ({
  assetResolver: {
    stripUrlsForLLM: vi.fn((overlays) => overlays),
    resolveProjectAssets: vi.fn(async (overlays) => overlays),
  },
}));

vi.mock("@/lib/services/orgMemberService", () => ({
  orgMemberService: {},
}));

vi.mock("@/lib/shared/project-links", () => ({
  removeProjectFromLinks: vi.fn(),
}));

describe("Editron project save payload compaction", () => {
  beforeEach(() => {
    persistenceMocks.auth.mockReset();
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it("removes server-owned generated evidence before autosave/manual save requests", () => {
    const heavyEvidence = "x".repeat(50_000);
    const state = {
      overlays: [
        {
          id: "mg_1",
          type: "motion-graphic",
          from: 10,
          row: 5,
          durationInFrames: 90,
          assetId: "asset_1",
          src: "https://signed.example.test/video.mp4?signature=large",
          content: { value: "42", label: "users" },
          recipe: { elements: [{ text: heavyEvidence }] },
          contentSignals: { speech_energy: 0.9, emotion: 0.7 },
          semanticAtoms: [
            { kind: "scalar", value: "42", evidence: heavyEvidence },
          ],
          audioRights: { source: "library", licensed: true },
          musicRights: { source: "library", licensed: true },
          metadata: {
            sceneIndex: 3,
            atomicTransitionForm: {
              version: "atomic-transition-form-v1",
              compatibilityType: "dissolve",
              direction: { axis: "none" },
            },
            atomicOverlayReceipt: { evidence: heavyEvidence },
            atomicOverlayForm: { text: { glyphs: heavyEvidence } },
            debugDump: heavyEvidence,
          },
        },
      ],
      aspectRatio: "16:9",
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 100,
    };

    const compact = compactEditorStateForSave(state as any) as any;
    const serialized = serializeEditorStateForSave(state as any);

    expect(serialized.length).toBeLessThan(JSON.stringify(state).length * 0.1);
    expect(compact.overlays[0].src).toBeUndefined();
    expect(compact.overlays[0].recipe).toBeUndefined();
    expect(compact.overlays[0].contentSignals).toBeUndefined();
    expect(compact.overlays[0].semanticAtoms).toBeUndefined();
    expect(compact.overlays[0].audioRights).toBeUndefined();
    expect(compact.overlays[0].musicRights).toBeUndefined();
    expect(compact.overlays[0].metadata.sceneIndex).toBe(3);
    expect(compact.overlays[0].metadata.atomicTransitionForm).toEqual(
      expect.objectContaining({
        version: "atomic-transition-form-v1",
      }),
    );
    expect(compact.overlays[0].metadata.atomicOverlayReceipt).toBeUndefined();
    expect(compact.overlays[0].metadata.debugDump).toBeUndefined();
  });

  it("merges omitted server-owned overlay data back before persistence", () => {
    const current = [
      {
        id: "transition_1",
        type: "transition",
        from: 30,
        row: 2,
        durationInFrames: 18,
        transitionStyle: "dissolve",
        contentSignals: { visual_motion: 0.8 },
        recipe: { elements: [{ type: "kept-render-recipe" }] },
        audioRights: {
          source: "library",
          licensed: true,
          evidence: { licenseId: "stored-license" },
        },
        musicRights: {
          source: "library",
          licensed: true,
          evidence: { licenseId: "stored-license" },
        },
        metadata: {
          sceneIndex: 1,
          atomicOverlayReceipt: { atoms: ["kept"] },
          atomicOverlayForm: { version: "overlay-atomic-form-v1" },
          atomicTransitionForm: {
            version: "atomic-transition-form-v1",
            compatibilityType: "dissolve",
          },
          debugEvidence: { huge: true },
        },
      },
    ];
    const incoming = [
      {
        id: "transition_1",
        type: "transition",
        from: 42,
        row: 2,
        durationInFrames: 20,
        transitionStyle: "zoom-punch",
        audioRights: { source: "preview-only", licensed: false },
        musicRights: { source: "preview-only", licensed: false },
        metadata: {
          sceneIndex: 2,
          atomicTransitionForm: {
            version: "atomic-transition-form-v1",
            compatibilityType: "zoom-punch",
          },
        },
      },
    ];

    const [merged] = mergeServerOwnedOverlayDataForSave(
      incoming as any,
      current as any,
    ) as any[];

    expect(merged.from).toBe(42);
    expect(merged.durationInFrames).toBe(20);
    expect(merged.transitionStyle).toBe("zoom-punch");
    expect(merged.contentSignals).toEqual({ visual_motion: 0.8 });
    expect(merged.recipe).toEqual({
      elements: [{ type: "kept-render-recipe" }],
    });
    expect(merged.audioRights.evidence.licenseId).toBe("stored-license");
    expect(merged.musicRights.evidence.licenseId).toBe("stored-license");
    expect(merged.metadata.sceneIndex).toBe(2);
    expect(merged.metadata.atomicTransitionForm.compatibilityType).toBe(
      "zoom-punch",
    );
    expect(merged.metadata.atomicOverlayReceipt).toEqual({ atoms: ["kept"] });
    expect(merged.metadata.atomicOverlayForm).toEqual({
      version: "overlay-atomic-form-v1",
    });
    expect(merged.metadata.debugEvidence).toEqual({ huge: true });
  });

  it("strips forged server-owned rights from newly injected browser overlays", () => {
    const incoming = [
      {
        id: "forged_music",
        type: "sound",
        from: 0,
        row: 1,
        durationInFrames: 120,
        audioRights: {
          source: "library",
          licensed: true,
          evidence: { licenseId: "browser-forged-license" },
        },
        musicRights: {
          source: "library",
          licensed: true,
          evidence: { licenseId: "browser-forged-license" },
        },
      },
    ];

    const [merged] = mergeServerOwnedOverlayDataForSave(
      incoming as any,
      [],
    ) as any[];

    expect(merged.audioRights).toBeUndefined();
    expect(merged.musicRights).toBeUndefined();
  });

  it("preserves verified rights introduced by a trusted server timeline save", () => {
    const verifiedRights = {
      source: "user-upload",
      licensed: true,
      evidence: {
        assetId: "video_1",
        receiptId: "native-audio-rights-video_1",
      },
    };
    const incoming = [
      {
        id: "source_video",
        type: "video",
        from: 0,
        row: 0,
        durationInFrames: 300,
        assetId: "video_1",
        hasNativeAudio: true,
        audioRights: verifiedRights,
      },
    ];

    const [merged] = mergeServerOwnedOverlayDataForSave(
      incoming as any,
      [],
      "server",
    ) as any[];

    expect(merged.audioRights).toEqual(verifiedRights);
  });

  it("persists verified rights on the first trusted server project save", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      updatedAt: new Date("2026-08-09T00:00:00.000Z"),
      projectRevision: 0,
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await projectService.saveProject("user_1", "proj_1", {
      overlays: [
        {
          id: "source_video",
          type: "video",
          from: 0,
          row: 0,
          durationInFrames: 300,
          assetId: "video_1",
          hasNativeAudio: true,
          audioRights: {
            source: "user-upload",
            licensed: true,
            evidence: { receiptId: "native-audio-rights-video_1" },
          },
        } as any,
      ],
      aspectRatio: "16:9",
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 300,
    });

    const persistedOverlays =
      persistenceMocks.updateOne.mock.calls[0][1].$set.overlays;
    expect(persistedOverlays[0].audioRights).toEqual(
      expect.objectContaining({
        licensed: true,
        evidence: { receiptId: "native-audio-rights-video_1" },
      }),
    );
  });

  it("binds a manual save to owner, numeric revision, and compatibility timestamp in one write predicate", async () => {
    const updatedAt = "2026-08-09T01:00:00.000Z";
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    const receipt = await projectService.saveProjectWithReceipt(
      "user_1",
      "proj_1",
      {
        overlays: [],
        aspectRatio: "16:9",
        playerDimensions: { width: 1920, height: 1080 },
        fps: 30,
        durationInFrames: 0,
      },
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        overlayAuthority: "client",
      },
    );

    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      {
        projectId: "proj_1",
        userId: "user_1",
        projectRevision: 7,
        updatedAt: new Date(updatedAt),
      },
      expect.objectContaining({ $inc: { projectRevision: 1 } }),
    );
    expect(receipt.revision).toEqual(
      expect.objectContaining({ schemaVersion: 1, value: 8 }),
    );
  });

  it("carries an owner-scoped mutation snapshot revision into the canonical writer", async () => {
    const updatedAt = "2026-08-11T03:00:00.000Z";
    const currentProject = {
      projectId: "proj_1",
      userId: "user_1",
      name: "Dubbing fixture",
      overlays: [],
      aspectRatio: "16:9" as const,
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 300,
      visibility: "private" as const,
      createdAt: new Date(updatedAt),
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
    };
    persistenceMocks.findOne.mockResolvedValue(currentProject);
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const snapshot = await projectService.loadProjectForMutation("user_1", "proj_1");
    await projectService.saveProjectWithReceipt(
      "user_1",
      "proj_1",
      {
        overlays: [],
        aspectRatio: snapshot.project.aspectRatio,
        playerDimensions: snapshot.project.playerDimensions,
        fps: snapshot.project.fps,
        durationInFrames: snapshot.project.durationInFrames,
      },
      {
        expectedRevision: snapshot.revision,
        projectUpdates: {
          "intelligence.lastDubbingJob": { jobId: "dub_job_1" },
        },
      },
    );

    expect(snapshot.revision).toEqual({
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: updatedAt,
    });
    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ projectRevision: 7, updatedAt: new Date(updatedAt) }),
      expect.objectContaining({
        $set: expect.objectContaining({
          "intelligence.lastDubbingJob": { jobId: "dub_job_1" },
          overlays: [],
        }),
        $inc: { projectRevision: 1 },
      }),
    );
  });

  it("captures the writer-issued save receipt without a post-write revision read", async () => {
    const updatedAt = "2026-08-11T01:00:00.000Z";
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const captured = await projectService.captureMutationReceipts(async () => {
      await projectService.saveProjectWithReceipt("user_1", "proj_1", {
        overlays: [],
        aspectRatio: "16:9",
        playerDimensions: { width: 1920, height: 1080 },
        fps: 30,
        durationInFrames: 0,
      }, {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
      });
      return "writer-completed";
    });

    expect(captured).toMatchObject({
      value: "writer-completed",
      receipts: [{
        schemaVersion: 1,
        projectId: "proj_1",
        revision: { schemaVersion: 1, value: 8 },
      }],
    });
    expect(persistenceMocks.findOne).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("retains writer-issued receipts for rollback when the surrounding operation throws", async () => {
    const updatedAt = "2026-08-11T01:00:00.000Z";
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );
    let observedReceipts: readonly unknown[] = [];

    await expect(projectService.captureMutationReceipts(async () => {
      await projectService.saveProjectWithReceipt("user_1", "proj_1", {
        overlays: [],
        aspectRatio: "16:9",
        playerDimensions: { width: 1920, height: 1080 },
        fps: 30,
        durationInFrames: 0,
      }, {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
      });
      throw new Error("agent failed after the write");
    }, (receipts) => {
      observedReceipts = receipts;
    })).rejects.toThrow("agent failed after the write");

    expect(observedReceipts).toMatchObject([{
      schemaVersion: 1,
      projectId: "proj_1",
      revision: { schemaVersion: 1, value: 8 },
    }]);
    expect(persistenceMocks.findOne).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-user autosave without issuing a write", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(null);
    const { ProjectNotFoundOrForbiddenError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await expect(
      projectService.autosaveProject(
        "attacker",
        "proj_1",
        {
          overlays: [],
          aspectRatio: "16:9",
          playerDimensions: { width: 1920, height: 1080 },
          fps: 30,
          durationInFrames: 0,
        },
        {
          expectedRevision: {
            schemaVersion: 1,
            value: 3,
            compatibilityUpdatedAt: "2026-08-09T01:00:00.000Z",
          },
        },
      ),
    ).rejects.toBeInstanceOf(ProjectNotFoundOrForbiddenError);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("returns a structured 409 for a stale manual browser save with zero mutation", async () => {
    const current = {
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      updatedAt: new Date("2026-08-09T02:00:00.000Z"),
      projectRevision: 4,
    };
    persistenceMocks.auth.mockResolvedValue({ userId: "user_1" });
    persistenceMocks.findOne.mockResolvedValue(current);
    const { POST } = await import(
      "@/app/api/services/editron/projects/[projectId]/save/route"
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/services/editron/projects/proj_1/save",
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: {
              schemaVersion: 1,
              value: 3,
              compatibilityUpdatedAt: "2026-08-09T01:00:00.000Z",
            },
            overlays: [],
            aspectRatio: "16:9",
            playerDimensions: { width: 1920, height: 1080 },
            fps: 30,
            durationInFrames: 0,
          }),
        },
      ),
      { params: Promise.resolve({ projectId: "proj_1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "PROJECT_REVISION_CONFLICT",
        currentRevision: { value: 4 },
      },
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
    expect(current).toMatchObject({ projectRevision: 4, overlays: [] });
  });

  it("returns a structured 409 for a stale autosave with zero mutation", async () => {
    persistenceMocks.auth.mockResolvedValue({ userId: "user_1" });
    persistenceMocks.findOne.mockResolvedValue({
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      updatedAt: new Date("2026-08-09T02:00:00.000Z"),
      projectRevision: 4,
    });
    const { POST } = await import(
      "@/app/api/services/editron/projects/[projectId]/autosave/route"
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/services/editron/projects/proj_1/autosave",
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: {
              schemaVersion: 1,
              value: 3,
              compatibilityUpdatedAt: "2026-08-09T01:00:00.000Z",
            },
            overlays: [],
            aspectRatio: "16:9",
            playerDimensions: { width: 1920, height: 1080 },
            fps: 30,
            durationInFrames: 0,
          }),
        },
      ),
      { params: Promise.resolve({ projectId: "proj_1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "PROJECT_REVISION_CONFLICT",
        currentRevision: { value: 4 },
      },
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a stale browser retry after a chat or worker mutation changed updatedAt without changing the counter", async () => {
    const browserRevision = {
      schemaVersion: 1 as const,
      value: 4,
      compatibilityUpdatedAt: "2026-08-09T01:00:00.000Z",
    };
    persistenceMocks.findOne
      .mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        overlays: [],
        updatedAt: new Date(browserRevision.compatibilityUpdatedAt),
        projectRevision: 4,
      })
      .mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        overlays: [{ id: "chat-change" }],
        updatedAt: new Date("2026-08-09T01:00:01.000Z"),
        projectRevision: 4,
      });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 0,
      modifiedCount: 0,
    });
    const { ProjectMutationConflictError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await expect(
      projectService.saveProjectWithReceipt(
        "user_1",
        "proj_1",
        {
          overlays: [],
          aspectRatio: "16:9",
          playerDimensions: { width: 1920, height: 1080 },
          fps: 30,
          durationInFrames: 0,
        },
        { expectedRevision: browserRevision, overlayAuthority: "client" },
      ),
    ).rejects.toBeInstanceOf(ProjectMutationConflictError);

    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.updateOne.mock.calls[0][0]).toMatchObject({
      projectId: "proj_1",
      userId: "user_1",
      projectRevision: 4,
      updatedAt: new Date(browserRevision.compatibilityUpdatedAt),
    });
  });

  it("does not apply a duplicate retry after the original browser write has advanced the revision", async () => {
    const initialRevision = {
      schemaVersion: 1 as const,
      value: 4,
      compatibilityUpdatedAt: "2026-08-09T01:00:00.000Z",
    };
    persistenceMocks.findOne
      .mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        overlays: [],
        updatedAt: new Date(initialRevision.compatibilityUpdatedAt),
        projectRevision: 4,
      })
      .mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        overlays: [{ id: "first-write" }],
        updatedAt: new Date("2026-08-09T01:00:01.000Z"),
        projectRevision: 5,
      });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { ProjectMutationConflictError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );
    const state = {
      overlays: [],
      aspectRatio: "16:9" as const,
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 0,
    };

    await projectService.saveProjectWithReceipt("user_1", "proj_1", state, {
      expectedRevision: initialRevision,
      overlayAuthority: "client",
    });
    await expect(
      projectService.saveProjectWithReceipt("user_1", "proj_1", state, {
        expectedRevision: initialRevision,
        overlayAuthority: "client",
      }),
    ).rejects.toBeInstanceOf(ProjectMutationConflictError);
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when Mongo matches but does not modify the editor-state write", async () => {
    const revision = {
      schemaVersion: 1 as const,
      value: 6,
      compatibilityUpdatedAt: "2026-08-09T01:00:00.000Z",
    };
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      updatedAt: new Date(revision.compatibilityUpdatedAt),
      projectRevision: 6,
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 0,
    });
    const { ProjectMutationWriteError, projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await expect(
      projectService.autosaveProject(
        "user_1",
        "proj_1",
        {
          overlays: [],
          aspectRatio: "16:9",
          playerDimensions: { width: 1920, height: 1080 },
          fps: 30,
          durationInFrames: 0,
        },
        { expectedRevision: revision },
      ),
    ).rejects.toBeInstanceOf(ProjectMutationWriteError);
  });
});
