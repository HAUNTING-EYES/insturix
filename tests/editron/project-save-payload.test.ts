import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compactEditorStateForSave,
  isValidEditorTimelineMarkers,
  mergeServerOwnedOverlayDataForSave,
  serializeEditorStateForSave,
} from "@/lib/editron/shared/project-save-payload";
import { AUDIO_RIGHTS_ATTESTATION_VERSION } from "@/lib/editron/shared/render-request-payload";

const persistenceMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  bulkWrite: vi.fn(),
  endSession: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  COLLECTIONS: {
    PROJECTS: "editron_prev.projects",
    MG_DESIGN_JOBS: "editron_mg_design_jobs",
    MEDIA_ASSETS: "editron_prev.media_assets",
  },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: persistenceMocks.findOne,
      findOneAndUpdate: persistenceMocks.findOneAndUpdate,
      updateOne: persistenceMocks.updateOne,
      bulkWrite: persistenceMocks.bulkWrite,
    })),
  })),
  connectToDatabase: vi.fn(async () => ({
    client: {
      startSession: () => ({
        withTransaction: persistenceMocks.withTransaction,
        endSession: persistenceMocks.endSession,
      }),
    },
    db: {
      collection: vi.fn(() => ({
        bulkWrite: persistenceMocks.bulkWrite,
        findOne: persistenceMocks.findOne,
        updateOne: persistenceMocks.updateOne,
      })),
    },
  })),
}));

function mgDesignCompletionCommand() {
  return {
    expectedRevision: {
      schemaVersion: 1 as const,
      value: 7,
      compatibilityUpdatedAt: "2026-08-11T06:05:00.000Z",
    },
    leaseId: "mgdl_owned_lease",
    result: {
      jobId: "mgd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      decisionsExecuted: 1,
      decisionsSkipped: 0,
      renderJobsQueued: 1,
      approvedCount: 1,
      declinedCount: 0,
      unavailableCount: 0,
      completedAt: "2026-08-11T06:05:01.000Z",
      projectEvidence: {
        schemaVersion: 1 as const,
        mgCodegenRun: {
          version: "mg-codegen-run-v2" as const,
          queuedCount: 1,
          generatedCount: 0,
          failedCount: 0,
          outcomes: [{
            status: "queued" as const,
            frame: 45,
            candidateId: "candidate_1",
            factKind: "comparison",
            jobId: "mgr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          }],
          truncated: false,
          completedAt: new Date("2026-08-11T06:05:01.000Z"),
        },
        mgKineticSfxContexts: [{
          version: "mg-kinetic-sfx-context-v1" as const,
          momentId: "moment_1",
          policy: "subtle" as const,
          profileId: "A-01",
          policySource: "director-effective-profile" as const,
          speechEnergy: 0.4,
          speechSource: "moment-signals" as const,
          writtenAt: new Date("2026-08-11T06:05:00.000Z"),
        }],
        mgDeliveryRecords: [{
          videoId: "proj_1",
          momentId: "moment_1",
          status: "enqueued" as const,
          attempt: 1,
          jobId: "mgr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          idempotencyKey: "proj_1:moment_1:mgr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        }],
      },
    },
  };
}

function uploadedAudioOwnerFixture() {
  const attestedAt = "2026-08-11T05:59:00.000Z";
  const audioRights = {
    mediaRole: "sfx",
    source: "user-upload",
    userChoice: "attested",
    licensed: true,
    evidence: {
      kind: "user-attestation",
      sourceAssetId: "audio_source_1",
      attestationVersion: AUDIO_RIGHTS_ATTESTATION_VERSION,
      attestedAt,
      attestedBy: "user_1",
    },
  };
  const sfxAcousticMeasurement = {
    version: "sfx-acoustic-measurement-v1",
    algorithm: "ffmpeg-ebur128-v1",
    loudnessMetric: "integrated-lufs",
    loudnessDb: -18,
    integratedLufs: -18,
    truePeakDbtp: -3,
    sampleRateHz: 48_000,
    channelCount: 1,
    durationMs: 2_000,
    measuredAt: attestedAt,
    sourceHashSha256: "a".repeat(64),
  };
  const overlay = {
    id: 2,
    type: "sound",
    from: 45,
    row: 0,
    durationInFrames: 30,
    startFromSound: 3,
    assetId: "audio_use_1",
    content: "Impact hit",
    styles: { volume: 1 },
    audioRights,
    metadata: {
      source: "uploaded-audio-assignment",
      audioRole: "sfx",
      sourceAssetId: "audio_source_1",
      sfxAcousticMeasurement,
      uploadedAudioAssignment: {
        version: "editron-uploaded-audio-timeline-v1",
        idempotencyKey: "audio_use_001",
        sourceAssetId: "audio_source_1",
        derivativeAssetId: "audio_use_1",
        mediaRole: "sfx",
        placement: {
          from: 45,
          durationInFrames: 30,
          requestedRow: 6,
          startFromSound: 3,
          resolvedRow: 0,
        },
      },
    },
  };
  const asset = {
    assetId: "audio_use_1",
    userId: "user_1",
    projectId: "proj_1",
    type: "audio",
    source: "user-upload",
    parentAssetId: "audio_source_1",
    assignmentStatus: "attached",
    duration: 2,
    audioRights,
    sfxAcousticMeasurement,
    audioAssignmentReceipt: {
      version: "editron-uploaded-audio-assignment-v1",
      idempotencyKey: "audio_use_001",
      sourceAssetId: "audio_source_1",
      derivativeAssetId: "audio_use_1",
      mediaRole: "sfx",
      userId: "user_1",
      projectId: "proj_1",
      attestedAt,
    },
  };
  return { asset, overlay };
}

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
    persistenceMocks.bulkWrite.mockReset();
    persistenceMocks.endSession.mockReset();
    persistenceMocks.findOne.mockReset();
    persistenceMocks.findOneAndUpdate.mockReset();
    persistenceMocks.updateOne.mockReset();
    persistenceMocks.withTransaction.mockReset();
    persistenceMocks.withTransaction.mockImplementation(async (work) => work());
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

  it("preserves the stored duration when manual save and autosave omit it", async () => {
    const updatedAt = "2026-08-09T00:30:00.000Z";
    const revision = {
      schemaVersion: 1 as const,
      value: 7,
      compatibilityUpdatedAt: updatedAt,
    };
    persistenceMocks.findOne.mockResolvedValue({
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      fps: 30,
      durationInFrames: 300,
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
    });
    persistenceMocks.updateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );
    const state = {
      overlays: [],
      aspectRatio: "16:9" as const,
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
    };

    await projectService.saveProjectWithReceipt("user_1", "proj_1", state, {
      expectedRevision: revision,
    });
    await projectService.autosaveProject("user_1", "proj_1", state, {
      expectedRevision: revision,
    });

    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(2);
    for (const [, update] of persistenceMocks.updateOne.mock.calls) {
      expect(update.$set.durationInFrames).toBe(300);
    }
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

  it("commits metadata clears with editor state under one revision predicate", async () => {
    const updatedAt = "2026-09-01T04:00:00.000Z";
    const currentProject = {
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      aspectRatio: "16:9" as const,
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 300,
      updatedAt: new Date(updatedAt),
      projectRevision: 9,
    };
    persistenceMocks.findOne.mockResolvedValue(currentProject);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");
    const state = {
      overlays: [],
      aspectRatio: "16:9" as const,
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 300,
    };

    await projectService.saveProjectWithReceipt("user_1", "proj_1", state, {
      expectedRevision: {
        schemaVersion: 1,
        value: 9,
        compatibilityUpdatedAt: updatedAt,
      },
      projectUpdates: { rawFootageAnalysis: { version: 1 } },
      projectUnsets: ["segmentAnalysis", "autoEditError"],
    });

    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ projectRevision: 9, updatedAt: new Date(updatedAt) }),
      expect.objectContaining({
        $set: expect.objectContaining({ rawFootageAnalysis: { version: 1 }, overlays: [] }),
        $unset: { segmentAnalysis: "", autoEditError: "" },
        $inc: { projectRevision: 1 },
      }),
    );

    await expect(projectService.saveProjectWithReceipt("user_1", "proj_1", state, {
      projectUpdates: { segmentAnalysis: {} },
      projectUnsets: ["segmentAnalysis", "$where"],
    })).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("acquires a Director lease with the paired snapshot revision and a writer receipt", async () => {
    const acquiredAt = "2026-08-11T04:00:00.000Z";
    persistenceMocks.findOneAndUpdate.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      name: "Director fixture",
      overlays: [],
      aspectRatio: "16:9",
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 300,
      visibility: "private",
      createdAt: new Date(acquiredAt),
      updatedAt: new Date(acquiredAt),
      projectRevision: 8,
      directorLock: true,
      directorLockToken: "director_lease",
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const captured = await projectService.captureMutationReceipts(() =>
      projectService.acquireDirectorMutationLease("user_1", "proj_1", {
        kineticSfxPolicy: "full",
        profileId: "G-01",
      }),
    );

    expect(persistenceMocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj_1", userId: "user_1" }),
      expect.objectContaining({
        $set: expect.objectContaining({
          directorLock: true,
          directorLockToken: expect.stringMatching(/^director_/),
          "intelligence.kineticSfxPolicy": expect.objectContaining({
            profileId: "G-01",
            policy: "full",
          }),
        }),
        $inc: { projectRevision: 1 },
      }),
      { returnDocument: "after", includeResultMetadata: false },
    );
    expect(captured.value.revision).toEqual(
      expect.objectContaining({ value: 8 }),
    );
    expect(captured.receipts).toEqual([
      expect.objectContaining({
        projectId: "proj_1",
        revision: captured.value.revision,
      }),
    ]);
  });

  it("requires the Director lease token when committing the paired snapshot", async () => {
    const updatedAt = "2026-08-11T04:00:00.000Z";
    const revision = {
      schemaVersion: 1 as const,
      value: 8,
      compatibilityUpdatedAt: updatedAt,
    };
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      updatedAt: new Date(updatedAt),
      projectRevision: 8,
      directorLock: true,
      directorLockToken: "director_lease",
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await projectService.saveProjectWithReceipt(
      "user_1",
      "proj_1",
      {
        overlays: [],
        aspectRatio: "16:9",
        playerDimensions: { width: 1920, height: 1080 },
        fps: 30,
        durationInFrames: 300,
      },
      { expectedRevision: revision, directorLeaseId: "director_lease" },
    );

    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        userId: "user_1",
        projectRevision: 8,
        updatedAt: new Date(updatedAt),
        directorLockToken: "director_lease",
      }),
      expect.objectContaining({
        $unset: {
          directorLock: "",
          directorLockAt: "",
          directorLockToken: "",
        },
      }),
    );
  });

  it("does not let an old Director cleanup release a newer lease", async () => {
    persistenceMocks.findOneAndUpdate.mockResolvedValueOnce(null);
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(
      projectService.releaseDirectorMutationLease(
        "user_1",
        "proj_1",
        "expired_director_lease",
      ),
    ).resolves.toEqual({ disposition: "LEASE_NOT_OWNED_OR_PROJECT_NOT_FOUND" });

    expect(persistenceMocks.findOneAndUpdate).toHaveBeenCalledWith(
      {
        projectId: "proj_1",
        userId: "user_1",
        directorLock: true,
        directorLockToken: "expired_director_lease",
      },
      expect.objectContaining({
        $set: expect.objectContaining({ updatedAt: expect.any(Date) }),
        $unset: {
          directorLock: "",
          directorLockAt: "",
          directorLockToken: "",
        },
        $inc: { projectRevision: 1 },
      }),
      { returnDocument: "after", includeResultMetadata: false },
    );
  });

  it("issues the writer revision and receipt when releasing its active Director lease", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T04:05:06.000Z"));
    try {
      persistenceMocks.findOneAndUpdate.mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        updatedAt: new Date("2026-08-25T04:05:06.000Z"),
        projectRevision: 12,
      });
      const { projectService } = await import(
        "@/lib/editron/services/project-service",
      );

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.releaseDirectorMutationLease(
          "user_1",
          "proj_1",
          "director_lease",
        )
      ));

      expect(captured.value).toEqual({
        disposition: "RELEASED",
        receipt: {
          schemaVersion: 1,
          projectId: "proj_1",
          revision: {
            schemaVersion: 1,
            value: 12,
            compatibilityUpdatedAt: "2026-08-25T04:05:06.000Z",
          },
          committedAt: "2026-08-25T04:05:06.000Z",
        },
      });
      if (captured.value.disposition !== "RELEASED") {
        throw new Error("Fixture did not release the Director lease.");
      }
      expect(captured.receipts).toEqual([captured.value.receipt]);
      expect(persistenceMocks.findOneAndUpdate).toHaveBeenCalledWith(
        {
          projectId: "proj_1",
          userId: "user_1",
          directorLock: true,
          directorLockToken: "director_lease",
        },
        expect.objectContaining({
          $set: { updatedAt: new Date("2026-08-25T04:05:06.000Z") },
          $inc: { projectRevision: 1 },
        }),
        { returnDocument: "after", includeResultMetadata: false },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("binds Director phase-0 facts to the final writer receipt", async () => {
    const updatedAt = "2026-08-11T05:00:00.000Z";
    const finalReceipt = {
      schemaVersion: 1 as const,
      projectId: "proj_1",
      revision: {
        schemaVersion: 1 as const,
        value: 9,
        compatibilityUpdatedAt: updatedAt,
      },
      committedAt: updatedAt,
    };
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const captured = await projectService.captureMutationReceipts(() =>
      projectService.recordPhase0ProofFacts("user_1", "proj_1", {
        expectedRevision: finalReceipt.revision,
        targetReceipt: finalReceipt,
        facts: {
          qualityReview: { overallScore: 98 },
          liveTruth: { status: "pass" },
          renderedQualityEvidence: { renderedQualityStatus: "pending" },
          fixtureArtifact: { version: "fixture-v1" },
        },
      }),
    );

    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      {
        projectId: "proj_1",
        userId: "user_1",
        projectRevision: 9,
        updatedAt: new Date(updatedAt),
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          qualityReview: { overallScore: 98 },
          "intelligence.phase0ProofTargetReceipt": finalReceipt,
        }),
        $inc: { projectRevision: 1 },
      }),
    );
    expect(captured.value.revision).toEqual(
      expect.objectContaining({ value: 10 }),
    );
    expect(captured.receipts).toEqual([
      expect.objectContaining({ revision: captured.value.revision }),
    ]);
  });

  it("does not attach Director phase-0 facts after a newer edit", async () => {
    const finalRevision = {
      schemaVersion: 1 as const,
      value: 9,
      compatibilityUpdatedAt: "2026-08-11T05:00:00.000Z",
    };
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 0,
      modifiedCount: 0,
    });
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      updatedAt: new Date("2026-08-11T05:00:01.000Z"),
      projectRevision: 10,
    });
    const { ProjectMutationConflictError, projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(
      projectService.recordPhase0ProofFacts("user_1", "proj_1", {
        expectedRevision: finalRevision,
        targetReceipt: {
          schemaVersion: 1,
          projectId: "proj_1",
          revision: finalRevision,
          committedAt: finalRevision.compatibilityUpdatedAt,
        },
        facts: {
          qualityReview: { overallScore: 98 },
          liveTruth: { status: "pass" },
          renderedQualityEvidence: { renderedQualityStatus: "pending" },
          fixtureArtifact: { version: "fixture-v1" },
        },
      }),
    ).rejects.toBeInstanceOf(ProjectMutationConflictError);

    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("projects checkpoint-owned chat proof only while its writer receipt remains current", async () => {
    const updatedAt = "2026-08-11T07:00:00.000Z";
    const subjectReceipt = {
      schemaVersion: 1 as const,
      projectId: "proj_1",
      revision: { schemaVersion: 1 as const, value: 11, compatibilityUpdatedAt: updatedAt },
      committedAt: updatedAt,
    };
    const record = {
      version: "editron-chat-render-verification-result-v1" as const,
      operationId: "chatop_projection",
      sessionId: "sess_1",
      beforeCheckpointId: "ckpt_before",
      afterCheckpointId: "ckpt_after",
      subjectReceipt,
      status: "pending" as const,
      requestedAt: updatedAt,
      startedAt: null,
      completedAt: null,
      modalities: ["visual"] as Array<"visual">,
      targets: [],
      projectRenderEligibility: null,
      sampleFrames: [20],
      visual: null,
      audio: null,
      reasons: [],
      issues: [],
      dispatchMessageId: null,
      notificationStatus: "pending" as const,
      notificationSentAt: null,
      lifecycle: {
        version: "editron-chat-render-verification-lifecycle-v1" as const,
        state: "requested" as const,
        terminalStatus: null,
        attemptCount: 0,
        qstashMessageId: null,
        workerRequestId: null,
        attemptToken: null,
        reason: null,
        requestedAt: updatedAt,
        dispatchedAt: null,
        deliveredAt: null,
        renderingAt: null,
        terminalAt: null,
        updatedAt,
      },
    };
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await projectService.recordChatRenderVerificationProjection("user_1", "proj_1", {
      subjectReceipt,
      record,
      expectedLifecycleStates: ["requested"],
      expectedAttemptToken: null,
      allowReplacePriorSubject: true,
    });

    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        userId: "user_1",
        $and: expect.arrayContaining([
          expect.objectContaining({ projectRevision: 11, updatedAt: new Date(updatedAt) }),
          expect.objectContaining({
            $or: expect.arrayContaining([
              expect.objectContaining({
                "intelligence.latestChatEditRenderVerification.lifecycle.attemptToken": null,
              }),
            ]),
          }),
        ]),
      }),
      expect.objectContaining({
        $set: {
          "intelligence.latestChatEditRenderVerification": record,
        },
      }),
    );
    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.not.objectContaining({ $inc: expect.anything() }),
    );

    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      projectRevision: 12,
      updatedAt: new Date("2026-08-11T07:00:01.000Z"),
    });
    const { ProjectMutationConflictError } = await import("@/lib/editron/services/project-service");
    await expect(projectService.recordChatRenderVerificationProjection("user_1", "proj_1", {
      subjectReceipt,
      record,
      expectedLifecycleStates: ["requested"],
    })).rejects.toBeInstanceOf(ProjectMutationConflictError);
  });

  it("claims and records rendered evidence through one receipt-bound CAS chain", async () => {
    const targetAt = "2026-08-11T06:00:00.000Z";
    const claimedAt = "2026-08-11T06:00:01.000Z";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(claimedAt));
    try {
      const targetReceipt = {
        schemaVersion: 1 as const,
        projectId: "proj_1",
        revision: {
          schemaVersion: 1 as const,
          value: 9,
          compatibilityUpdatedAt: targetAt,
        },
        committedAt: targetAt,
      };
      persistenceMocks.findOneAndUpdate.mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        overlays: [],
        projectRevision: 10,
        updatedAt: new Date(claimedAt),
      });
      persistenceMocks.updateOne.mockResolvedValueOnce({
        matchedCount: 1,
        modifiedCount: 1,
      });
      const { projectService } = await import(
        "@/lib/editron/services/project-service",
      );

      const captured = await projectService.captureMutationReceipts(async () => {
        const claim = await projectService.claimPhase0RenderedEvidence("user_1", "proj_1", {
          targetReceipt,
          requestedAt: targetAt,
        });
        const evidenceReceipt = await projectService.recordPhase0RenderedEvidence("user_1", "proj_1", {
          expectedRevision: claim.claimReceipt.revision,
          targetReceipt: claim.targetReceipt,
          claimReceipt: claim.claimReceipt,
          facts: phase0RenderedEvidenceFacts(),
        });
        return { claim, evidenceReceipt };
      });

      expect(captured.value.claim.claimReceipt.revision).toEqual({
        schemaVersion: 1,
        value: 10,
        compatibilityUpdatedAt: claimedAt,
      });
      expect(captured.value.evidenceReceipt.revision).toEqual({
        schemaVersion: 1,
        value: 11,
        compatibilityUpdatedAt: claimedAt,
      });
      expect(captured.receipts).toHaveLength(2);
      expect(persistenceMocks.findOneAndUpdate).toHaveBeenCalledWith(
        {
          projectId: "proj_1",
          userId: "user_1",
          projectRevision: 9,
          updatedAt: new Date(targetAt),
        },
        expect.objectContaining({
          $set: expect.objectContaining({
            "intelligence.phase0RenderedEvidenceTargetReceipt": targetReceipt,
            "intelligence.phase0RenderedEvidenceClaimReceipt": expect.objectContaining({
              revision: expect.objectContaining({ value: 10 }),
            }),
          }),
          $inc: { projectRevision: 1 },
        }),
        { returnDocument: "after", includeResultMetadata: false },
      );
      expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "proj_1",
          userId: "user_1",
          projectRevision: 10,
          updatedAt: new Date(claimedAt),
          "intelligence.phase0RenderedEvidenceTargetReceipt.revision.value": 9,
          "intelligence.phase0RenderedEvidenceClaimReceipt.revision.value": 10,
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            "intelligence.phase0RenderedStillEvidence": { status: "completed" },
            "intelligence.phase0RenderedEvidenceTargetReceipt": targetReceipt,
          }),
          $inc: { projectRevision: 1 },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a stale Phase-0 render target before rendering can start", async () => {
    const targetAt = "2026-08-11T06:00:00.000Z";
    persistenceMocks.findOneAndUpdate.mockResolvedValueOnce(null);
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      projectRevision: 10,
      updatedAt: new Date("2026-08-11T06:00:01.000Z"),
    });
    const { ProjectMutationConflictError, projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(projectService.claimPhase0RenderedEvidence("user_1", "proj_1", {
      targetReceipt: {
        schemaVersion: 1,
        projectId: "proj_1",
        revision: {
          schemaVersion: 1,
          value: 9,
          compatibilityUpdatedAt: targetAt,
        },
        committedAt: targetAt,
      },
      requestedAt: targetAt,
    })).rejects.toBeInstanceOf(ProjectMutationConflictError);

    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
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

  it("captures writer-issued receipts from direct overlay writes with CAS predicates", async () => {
    const addedAt = "2026-08-11T02:00:00.000Z";
    const updatedAt = "2026-08-11T02:00:01.000Z";
    const deletedAt = "2026-08-11T02:00:02.000Z";
    persistenceMocks.findOne
      .mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        fps: 30,
        updatedAt: new Date(addedAt),
        projectRevision: 7,
      })
      .mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        fps: 30,
        overlays: [{ id: 1, type: "text", content: "before", from: 0, durationInFrames: 30 }],
        updatedAt: new Date(updatedAt),
        projectRevision: 8,
      })
      .mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        fps: 30,
        overlays: [{ id: 1, type: "text", content: "after", from: 0, durationInFrames: 30 }],
        updatedAt: new Date(deletedAt),
        projectRevision: 9,
      });
    persistenceMocks.updateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const captured = await projectService.captureMutationReceipts(async () => {
      await projectService.addOverlayAtRevisionV1("user_1", "proj_1", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: addedAt,
        },
        actorKind: "SYSTEM",
        overlay: {
          id: 2,
          type: "text",
          from: 0,
          row: 0,
          durationInFrames: 30,
          content: "added",
        } as any,
      });
      await projectService.updateOverlayAtRevisionV1("user_1", "proj_1", {
        expectedRevision: {
          schemaVersion: 1,
          value: 8,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "SYSTEM",
        overlayId: 1,
        updates: { content: "after" } as any,
      });
      await projectService.deleteOverlayAtRevisionV1("user_1", "proj_1", {
        expectedRevision: {
          schemaVersion: 1,
          value: 9,
          compatibilityUpdatedAt: deletedAt,
        },
        actorKind: "SYSTEM",
        overlayId: 1,
      });
    });

    expect(captured.receipts.map((receipt) => receipt.revision.value)).toEqual([
      8,
      9,
      10,
    ]);
    expect(persistenceMocks.updateOne.mock.calls[0][0]).toMatchObject({
      projectId: "proj_1",
      userId: "user_1",
      projectRevision: 7,
      updatedAt: new Date(addedAt),
    });
    expect(persistenceMocks.updateOne.mock.calls[1][0]).toMatchObject({
      projectId: "proj_1",
      userId: "user_1",
      "overlays.id": 1,
      projectRevision: 8,
      updatedAt: new Date(updatedAt),
    });
    expect(persistenceMocks.updateOne.mock.calls[2][0]).toMatchObject({
      projectId: "proj_1",
      userId: "user_1",
      "overlays.id": 1,
      projectRevision: 9,
      updatedAt: new Date(deletedAt),
    });
    for (const [, update] of persistenceMocks.updateOne.mock.calls) {
      expect(update).toEqual(expect.objectContaining({
        $inc: { projectRevision: 1 },
      }));
    }
    const [addUpdate, directUpdate, deleteUpdate] = persistenceMocks.updateOne.mock.calls
      .map(([, update]) => update as Record<string, any>);
    expect(addUpdate.$push.timelineRangeChangeReceipts.$each[0]).toMatchObject({
      operation: "ADD_OVERLAY",
      rangeObservation: "EXACT",
      writeFrameRangesBefore: [{ startFrame: 0, endFrame: 30 }],
      affectedFrameRangesAfter: [{ startFrame: 0, endFrame: 30 }],
      overlayTemporalChange: {
        beforeFrameRange: null,
        afterFrameRange: { startFrame: 0, endFrame: 30 },
        unionFrameRange: { startFrame: 0, endFrame: 30 },
      },
    });
    expect(directUpdate.$push.timelineRangeChangeReceipts.$each[0]).toMatchObject({
      operation: "UPDATE_OVERLAY",
      rangeObservation: "EXACT",
    });
    expect(deleteUpdate.$push.timelineRangeChangeReceipts.$each[0]).toMatchObject({
      operation: "DELETE_OVERLAY",
      rangeObservation: "EXACT",
      writeFrameRangesBefore: [{ startFrame: 0, endFrame: 30 }],
      affectedFrameRangesAfter: [],
      overlayTemporalChange: {
        beforeFrameRange: { startFrame: 0, endFrame: 30 },
        afterFrameRange: null,
        unionFrameRange: { startFrame: 0, endFrame: 30 },
      },
    });
  });

  it("adds an overlay only at the caller-bound project revision", async () => {
    const updatedAt = "2026-08-11T02:10:00.000Z";
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      durationInFrames: 300,
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

    const result = await projectService.addOverlayAtRevisionV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "AGENT",
        overlay: {
          id: 2,
          type: "text",
          from: 30,
          row: 1,
          durationInFrames: 60,
          content: "bound",
        } as any,
      },
    );

    expect(result.mutationReceipt.revision.value).toBe(8);
    expect(result.timelineChangeReceipt).toMatchObject({
      operation: "ADD_OVERLAY",
      actorKind: "AGENT",
      rangeObservation: "EXACT",
      writeFrameRangesBefore: [{ startFrame: 30, endFrame: 90 }],
    });
    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        userId: "user_1",
        "overlays.id": { $ne: 2 },
        projectRevision: 7,
        updatedAt: new Date(updatedAt),
      }),
      expect.objectContaining({ $inc: { projectRevision: 1 } }),
    );
  });

  it("rejects a stale caller-bound overlay addition before writing", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      overlays: [],
      updatedAt: new Date("2026-08-11T02:11:00.000Z"),
      projectRevision: 8,
    });
    const { ProjectMutationConflictError, projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(projectService.addOverlayAtRevisionV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: "2026-08-11T02:10:00.000Z",
        },
        actorKind: "AGENT",
        overlay: {
          id: 2,
          type: "text",
          from: 30,
          row: 1,
          durationInFrames: 60,
        } as any,
      },
    )).rejects.toBeInstanceOf(ProjectMutationConflictError);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a caller-bound overlay addition that overlaps an active range lock", async () => {
    const updatedAt = "2026-08-11T02:12:00.000Z";
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      overlays: [],
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
      timelineRangeCutLocks: [{
        schemaVersion: 1,
        lockId: "timeline-cut-lock_abcdefghijklmnopqr",
        actorKind: "USER",
        frameRange: { startFrame: 40, endFrame: 80 },
        acquiredAt: "2026-08-11T02:12:01.000Z",
        expiresAt: "2099-08-11T02:13:01.000Z",
      }],
    });
    const { ProjectTimelineRangeCutLockConflictError, projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(projectService.addOverlayAtRevisionV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "AGENT",
        overlay: {
          id: 2,
          type: "text",
          from: 30,
          row: 1,
          durationInFrames: 60,
        } as any,
      },
    )).rejects.toMatchObject({
      code: "PROJECT_TIMELINE_RANGE_LOCKED",
      blockingLockIds: ["timeline-cut-lock_abcdefghijklmnopqr"],
    } satisfies Partial<InstanceType<typeof ProjectTimelineRangeCutLockConflictError>>);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("updates an overlay only at the caller-bound project revision", async () => {
    const updatedAt = "2026-08-11T02:13:00.000Z";
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      overlays: [{
        id: 4,
        type: "text",
        from: 30,
        row: 1,
        durationInFrames: 60,
        content: "before",
      }],
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const result = await projectService.updateOverlayAtRevisionV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "USER",
        overlayId: 4,
        updates: { from: 75, durationInFrames: 45, content: "after" } as any,
      },
    );

    expect(result.timelineChangeReceipt).toMatchObject({
      operation: "UPDATE_OVERLAY",
      actorKind: "USER",
      writeFrameRangesBefore: [{ startFrame: 30, endFrame: 120 }],
      overlayTemporalChange: {
        beforeFrameRange: { startFrame: 30, endFrame: 90 },
        afterFrameRange: { startFrame: 75, endFrame: 120 },
        unionFrameRange: { startFrame: 30, endFrame: 120 },
      },
    });
    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        userId: "user_1",
        "overlays.id": 4,
        projectRevision: 7,
        updatedAt: new Date(updatedAt),
      }),
      expect.objectContaining({ $inc: { projectRevision: 1 } }),
      { arrayFilters: [{ "elem.id": 4 }] },
    );
  });

  it("rejects a stale caller-bound overlay update before writing", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      overlays: [{ id: 4, type: "text", from: 30, durationInFrames: 60 }],
      updatedAt: new Date("2026-08-11T02:14:00.000Z"),
      projectRevision: 8,
    });
    const { ProjectMutationConflictError, projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(projectService.updateOverlayAtRevisionV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: "2026-08-11T02:13:00.000Z",
        },
        actorKind: "AGENT",
        overlayId: 4,
        updates: { content: "stale" } as any,
      },
    )).rejects.toBeInstanceOf(ProjectMutationConflictError);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("deletes an overlay only at the caller-bound project revision", async () => {
    const updatedAt = "2026-08-11T02:15:00.000Z";
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      overlays: [{ id: 5, type: "image", from: 90, durationInFrames: 45 }],
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const result = await projectService.deleteOverlayAtRevisionV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "AGENT",
        overlayId: 5,
      },
    );

    expect(result.timelineChangeReceipt).toMatchObject({
      operation: "DELETE_OVERLAY",
      actorKind: "AGENT",
      writeFrameRangesBefore: [{ startFrame: 90, endFrame: 135 }],
      affectedFrameRangesAfter: [],
    });
    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        userId: "user_1",
        "overlays.id": 5,
        projectRevision: 7,
        updatedAt: new Date(updatedAt),
      }),
      expect.objectContaining({
        $pull: { overlays: { id: 5 } },
        $inc: { projectRevision: 1 },
      }),
    );
  });

  it("preserves an exact legacy string overlay identity across update and delete CAS writes", async () => {
    const updatedAt = "2026-08-11T02:15:30.000Z";
    const afterUpdateAt = "2026-08-11T02:15:31.000Z";
    const legacyOverlay = {
      id: "manual-clip",
      type: "video",
      from: 90,
      durationInFrames: 45,
    };
    persistenceMocks.findOne
      .mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        fps: 30,
        overlays: [legacyOverlay],
        updatedAt: new Date(updatedAt),
        projectRevision: 7,
      })
      .mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        fps: 30,
        overlays: [{ ...legacyOverlay, content: "updated" }],
        updatedAt: new Date(afterUpdateAt),
        projectRevision: 8,
      });
    persistenceMocks.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    const updated = await projectService.updateOverlayAtRevisionV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "AGENT",
        overlayId: "manual-clip",
        updates: { content: "updated" } as any,
      },
    );
    const deleted = await projectService.deleteOverlayAtRevisionV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 8,
          compatibilityUpdatedAt: afterUpdateAt,
        },
        actorKind: "AGENT",
        overlayId: "manual-clip",
      },
    );

    expect(updated.timelineChangeReceipt.affectedOverlayRefs).toEqual(["overlay:manual-clip"]);
    expect(deleted.timelineChangeReceipt.affectedOverlayRefs).toEqual(["overlay:manual-clip"]);
    expect(persistenceMocks.updateOne.mock.calls[0][0]).toMatchObject({
      "overlays.id": "manual-clip",
      projectRevision: 7,
    });
    expect(persistenceMocks.updateOne.mock.calls[0][2]).toEqual({
      arrayFilters: [{ "elem.id": "manual-clip" }],
    });
    expect(persistenceMocks.updateOne.mock.calls[1][0]).toMatchObject({
      "overlays.id": "manual-clip",
      projectRevision: 8,
    });
    expect(persistenceMocks.updateOne.mock.calls[1][1]).toMatchObject({
      $pull: { overlays: { id: "manual-clip" } },
    });
  });

  it("atomically replaces a source video with an auto-edit assembly and ripples later overlays", async () => {
    const updatedAt = "2026-08-11T02:15:40.000Z";
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      durationInFrames: 390,
      overlays: [
        {
          id: 10,
          type: "video",
          assetId: "asset_raw",
          from: 0,
          durationInFrames: 300,
          videoStartTime: 0,
        },
        {
          id: 20,
          type: "text",
          from: 360,
          durationInFrames: 30,
          content: "Later title",
        },
      ],
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    const result = await projectService.applyAutoEditAssemblyV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "SYSTEM",
        sourceOverlayId: 10,
        cuts: [
          { clipId: 101, sourceStartFrame: 0, sourceEndFrame: 60 },
          { clipId: 102, sourceStartFrame: 120, sourceEndFrame: 210 },
        ],
      },
    );

    expect(result).toMatchObject({
      clipIds: [101, 102],
      clipsCreated: 2,
      totalDurationInFrames: 150,
      timelineChangeReceipt: {
        operation: "AUTO_EDIT_ASSEMBLY",
        actorKind: "SYSTEM",
        writeFrameRangesBefore: [{ startFrame: 0, endFrame: 390 }],
        affectedFrameRangesAfter: [{ startFrame: 0, endFrame: 240 }],
        ripple: {
          kind: "REPLACE_SOURCE_WITH_ASSEMBLY",
          sourceBeforeFrameRange: { startFrame: 0, endFrame: 300 },
          assemblyAfterFrameRange: { startFrame: 0, endFrame: 150 },
          shiftedBeforeFrameRange: { startFrame: 300, endFrame: 390 },
          shiftedAfterFrameRange: { startFrame: 150, endFrame: 240 },
          deltaFrames: -150,
        },
      },
    });
    const update = persistenceMocks.updateOne.mock.calls[0][1];
    expect(update.$set.durationInFrames).toBe(240);
    expect(update.$set.overlays).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 101,
        from: 0,
        durationInFrames: 60,
        videoStartTime: 0,
      }),
      expect.objectContaining({
        id: 102,
        from: 60,
        durationInFrames: 90,
        videoStartTime: 120,
      }),
      expect.objectContaining({ id: 20, from: 210 }),
    ]));
    expect(persistenceMocks.updateOne.mock.calls[0][0]).toMatchObject({
      projectId: "proj_1",
      userId: "user_1",
      "overlays.id": 10,
      projectRevision: 7,
      updatedAt: new Date(updatedAt),
    });
  });

  it("blocks auto-edit assembly before writing when an overlay depends on the source video", async () => {
    const updatedAt = "2026-08-11T02:15:50.000Z";
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      durationInFrames: 300,
      overlays: [
        { id: 10, type: "video", from: 0, durationInFrames: 300, videoStartTime: 0 },
        { id: 11, type: "caption", sourceVideoId: 10, from: 0, durationInFrames: 300 },
      ],
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    await expect(projectService.applyAutoEditAssemblyV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "SYSTEM",
        sourceOverlayId: 10,
        cuts: [{ clipId: 101, sourceStartFrame: 0, sourceEndFrame: 60 }],
      },
    )).rejects.toThrow("depends on the source video");
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a caller-bound overlay deletion that overlaps an active range lock", async () => {
    const updatedAt = "2026-08-11T02:16:00.000Z";
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      overlays: [{ id: 5, type: "image", from: 90, durationInFrames: 45 }],
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
      timelineRangeCutLocks: [{
        schemaVersion: 1,
        lockId: "timeline-cut-lock_stuvwxyzabcdefghij",
        actorKind: "SYSTEM",
        frameRange: { startFrame: 100, endFrame: 130 },
        acquiredAt: "2026-08-11T02:16:01.000Z",
        expiresAt: "2099-08-11T02:17:01.000Z",
      }],
    });
    const { ProjectTimelineRangeCutLockConflictError, projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(projectService.deleteOverlayAtRevisionV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "AGENT",
        overlayId: 5,
      },
    )).rejects.toMatchObject({
      code: "PROJECT_TIMELINE_RANGE_LOCKED",
      blockingLockIds: ["timeline-cut-lock_stuvwxyzabcdefghij"],
    } satisfies Partial<InstanceType<typeof ProjectTimelineRangeCutLockConflictError>>);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("attaches rights-bound uploaded audio once and emits an exact receipt", async () => {
    const updatedAt = "2026-08-11T06:00:00.000Z";
    const { asset, overlay } = uploadedAudioOwnerFixture();
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      durationInFrames: 300,
      overlays: [],
      projectRevision: 7,
      updatedAt: new Date(updatedAt),
    }).mockResolvedValueOnce(asset);
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.attachUploadedAudioAtRevisionV1("user_1", "proj_1", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "USER",
        overlay: overlay as any,
      })
    ));

    expect(captured.value).toMatchObject({
      disposition: "APPLIED",
      mutationReceipt: {
        projectId: "proj_1",
        revision: { value: 8 },
      },
    });
    expect(captured.receipts).toMatchObject([{
      projectId: "proj_1",
      revision: { value: 8 },
    }]);
    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      {
        projectId: "proj_1",
        userId: "user_1",
        "overlays.id": { $ne: 2 },
        projectRevision: 7,
        updatedAt: new Date(updatedAt),
      },
      expect.objectContaining({
        $inc: { projectRevision: 1 },
      }),
    );
    const update = persistenceMocks.updateOne.mock.calls[0]?.[1] as Record<string, any>;
    expect(update.$push.timelineRangeChangeReceipts.$each[0]).toMatchObject({
      operation: "ADD_OVERLAY",
      actorKind: "USER",
      rangeObservation: "EXACT",
      writeFrameRangesBefore: [{ startFrame: 45, endFrame: 75 }],
      affectedFrameRangesAfter: [{ startFrame: 45, endFrame: 75 }],
      overlayTemporalChange: {
        beforeFrameRange: null,
        afterFrameRange: { startFrame: 45, endFrame: 75 },
        unionFrameRange: { startFrame: 45, endFrame: 75 },
      },
    });
  });

  it("recognizes only an identical uploaded-audio replay without a new receipt", async () => {
    const updatedAt = "2026-08-11T06:01:00.000Z";
    const { asset, overlay } = uploadedAudioOwnerFixture();
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      durationInFrames: 300,
      overlays: [overlay],
      projectRevision: 8,
      updatedAt: new Date("2026-08-11T06:01:01.000Z"),
    }).mockResolvedValueOnce(asset);
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.attachUploadedAudioAtRevisionV1("user_1", "proj_1", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "USER",
        overlay: overlay as any,
      })
    ));

    expect(captured.value).toMatchObject({
      disposition: "ALREADY_ATTACHED",
      currentRevision: { value: 8 },
      mutationReceipt: null,
      timelineChangeReceipt: null,
    });
    expect(captured.receipts).toEqual([]);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a stale uploaded-audio write when no identical replay exists", async () => {
    const updatedAt = "2026-08-11T06:01:30.000Z";
    const { asset, overlay } = uploadedAudioOwnerFixture();
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      durationInFrames: 300,
      overlays: [],
      projectRevision: 8,
      updatedAt: new Date("2026-08-11T06:01:31.000Z"),
    }).mockResolvedValueOnce(asset);
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(projectService.attachUploadedAudioAtRevisionV1("user_1", "proj_1", {
      expectedRevision: {
        schemaVersion: 1,
        value: 7,
        compatibilityUpdatedAt: updatedAt,
      },
      actorKind: "USER",
      overlay: overlay as any,
    })).rejects.toMatchObject({ code: "PROJECT_REVISION_CONFLICT" });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects uploaded audio without enough source handles", async () => {
    const updatedAt = "2026-08-11T06:01:40.000Z";
    const { asset, overlay } = uploadedAudioOwnerFixture();
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      durationInFrames: 300,
      overlays: [],
      projectRevision: 7,
      updatedAt: new Date(updatedAt),
    }).mockResolvedValueOnce({ ...asset, duration: 1 });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(projectService.attachUploadedAudioAtRevisionV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "USER",
        overlay: overlay as any,
      },
    )).rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects uploaded audio that overlaps an active range lock", async () => {
    const updatedAt = "2026-08-11T06:01:50.000Z";
    const { asset, overlay } = uploadedAudioOwnerFixture();
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      durationInFrames: 300,
      overlays: [],
      projectRevision: 7,
      updatedAt: new Date(updatedAt),
      timelineRangeCutLocks: [{
        schemaVersion: 1,
        lockId: "timeline-cut-lock_abcdefghijklmnopqr",
        actorKind: "AGENT",
        frameRange: { startFrame: 50, endFrame: 60 },
        acquiredAt: "2026-08-11T06:01:49.000Z",
        expiresAt: "2099-08-11T06:02:50.000Z",
      }],
    }).mockResolvedValueOnce(asset);
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(projectService.attachUploadedAudioAtRevisionV1(
      "user_1",
      "proj_1",
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        actorKind: "USER",
        overlay: overlay as any,
      },
    )).rejects.toMatchObject({
      code: "PROJECT_TIMELINE_RANGE_LOCKED",
      blockingLockIds: ["timeline-cut-lock_abcdefghijklmnopqr"],
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("commits an MG delivery, its selected SFX, and its worker outcome at one revision", async () => {
    const updatedAt = "2026-08-11T06:02:00.000Z";
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.commitMgRenderDelivery("user_1", "proj_1", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        jobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        overlays: [
          {
            id: 8_000_000_000_000_001,
            type: "mg-sequence",
            from: 45,
            row: 5,
            durationInFrames: 90,
            metadata: { mgRenderJobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
          },
          {
            id: 800_000_001,
            type: "sound",
            from: 60,
            row: 0,
            durationInFrames: 12,
          },
        ] as any,
        outcome: {
          jobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          status: "generated",
          candidateId: "candidate_1",
          factKind: "comparison",
          frame: 45,
          sequenceId: "seq_1",
          completedAt: new Date("2026-08-11T06:02:01.000Z"),
        },
      })
    ));

    expect(captured.value).toMatchObject({
      delivered: true,
      receipt: { projectId: "proj_1", revision: { value: 8 } },
    });
    expect(captured.receipts).toHaveLength(1);
    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      {
        projectId: "proj_1",
        userId: "user_1",
        "intelligence.mgCodegenRun.asyncOutcomes.jobId": { $ne: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        "overlays.metadata.mgRenderJobId": { $ne: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        projectRevision: 7,
        updatedAt: new Date(updatedAt),
      },
      expect.objectContaining({
        $inc: { projectRevision: 1 },
        $push: expect.objectContaining({
          overlays: expect.objectContaining({ $each: expect.arrayContaining([
            expect.objectContaining({ id: 8_000_000_000_000_001 }),
            expect.objectContaining({ id: 800_000_001 }),
          ]) }),
          "intelligence.mgCodegenRun.asyncOutcomes": expect.objectContaining({
            $each: [expect.objectContaining({
              jobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              status: "generated",
            })],
          }),
        }),
      }),
    );
  });

  it("treats an already-landed MG job as idempotent without a new receipt", async () => {
    const updatedAt = "2026-08-11T06:03:00.000Z";
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectRevision: 8,
      updatedAt: new Date(updatedAt),
      overlays: [{ metadata: { mgRenderJobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } }],
      intelligence: {
        mgCodegenRun: {
          asyncOutcomes: [{ jobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
        },
      },
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.commitMgRenderDelivery("user_1", "proj_1", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        jobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        overlays: [{
          id: 8_000_000_000_000_001,
          type: "mg-sequence",
          from: 45,
          row: 5,
          durationInFrames: 90,
          metadata: { mgRenderJobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        }] as any,
        outcome: {
          jobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          status: "generated",
          candidateId: "candidate_1",
          factKind: "comparison",
          frame: 45,
          sequenceId: "seq_1",
          completedAt: new Date("2026-08-11T06:03:01.000Z"),
        },
      })
    ));

    expect(captured).toEqual({ value: { delivered: false }, receipts: [] });
  });

  it("commits a terminal MG fallback as revision-fenced evidence without overlays", async () => {
    const updatedAt = "2026-08-11T06:03:30.000Z";
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import(
      "@/lib/editron/services/project-service"
    );

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.commitMgRenderDelivery("user_1", "proj_1", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: updatedAt,
        },
        jobId: "mgr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        overlays: [],
        outcome: {
          jobId: "mgr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          status: "fallback",
          candidateId: "candidate_2",
          factKind: "comparison",
          frame: 75,
          reason: "provider authentication rejected",
          completedAt: new Date("2026-08-11T06:03:31.000Z"),
        },
      })
    ));

    expect(captured.value).toMatchObject({
      delivered: true,
      receipt: { projectId: "proj_1", revision: { value: 8 } },
    });
    expect(captured.receipts).toHaveLength(1);
    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      {
        projectId: "proj_1",
        userId: "user_1",
        "intelligence.mgCodegenRun.asyncOutcomes.jobId": {
          $ne: "mgr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        projectRevision: 7,
        updatedAt: new Date(updatedAt),
      },
      expect.objectContaining({
        $inc: { projectRevision: 1 },
        $push: {
          "intelligence.mgCodegenRun.asyncOutcomes": expect.objectContaining({
            $each: [expect.objectContaining({
              jobId: "mgr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              status: "fallback",
            })],
          }),
        },
      }),
    );
  });

  it("rejects a stale MG delivery without changing project state", async () => {
    const expectedUpdatedAt = "2026-08-11T06:04:00.000Z";
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectRevision: 8,
      updatedAt: new Date("2026-08-11T06:04:01.000Z"),
      overlays: [],
    });
    const { ProjectMutationConflictError, projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(projectService.commitMgRenderDelivery("user_1", "proj_1", {
      expectedRevision: {
        schemaVersion: 1,
        value: 7,
        compatibilityUpdatedAt: expectedUpdatedAt,
      },
      jobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      overlays: [{
        id: 8_000_000_000_000_001,
        type: "mg-sequence",
        from: 45,
        row: 5,
        durationInFrames: 90,
        metadata: { mgRenderJobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      }] as any,
      outcome: {
        jobId: "mgr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "generated",
        candidateId: "candidate_1",
        factKind: "comparison",
        frame: 45,
        sequenceId: "seq_1",
        completedAt: new Date("2026-08-11T06:04:02.000Z"),
      },
    })).rejects.toBeInstanceOf(ProjectMutationConflictError);
    expect(persistenceMocks.updateOne).toHaveBeenCalledOnce();
  });

  it("atomically completes an MG design job with its exact-revision EDL evidence", async () => {
    persistenceMocks.findOne
      .mockResolvedValueOnce({ status: "running", leaseId: "mgdl_owned_lease" })
      .mockResolvedValueOnce({
        projectRevision: 7,
        updatedAt: new Date("2026-08-11T06:05:00.000Z"),
        intelligence: {
          mgKineticSfxContexts: [{ momentId: "older_moment", version: "legacy" }],
          mgDeliveryRecords: [{ momentId: "older_moment", status: "delivered" }],
        },
      });
    persistenceMocks.updateOne
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.completeMgDesignExecutionV1("user_1", "proj_1", mgDesignCompletionCommand())
    ));

    expect(captured.value).toMatchObject({
      disposition: "RECORDED",
      receipt: { projectId: "proj_1", revision: { value: 8 } },
    });
    expect(captured.receipts).toHaveLength(1);
    expect(persistenceMocks.withTransaction).toHaveBeenCalledOnce();
    expect(persistenceMocks.updateOne).toHaveBeenNthCalledWith(
      1,
      {
        projectId: "proj_1",
        userId: "user_1",
        projectRevision: 7,
        updatedAt: new Date("2026-08-11T06:05:00.000Z"),
      },
      expect.objectContaining({
        $inc: { projectRevision: 1 },
        $set: expect.objectContaining({
          "intelligence.mgCodegenRun.queuedCount": 1,
          "intelligence.mgKineticSfxContexts": expect.arrayContaining([
            expect.objectContaining({ momentId: "older_moment" }),
            expect.objectContaining({ momentId: "moment_1" }),
          ]),
          "intelligence.mgDeliveryRecords": expect.arrayContaining([
            expect.objectContaining({ momentId: "older_moment" }),
            expect.objectContaining({ momentId: "moment_1" }),
          ]),
        }),
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
    const projectSet = (
      persistenceMocks.updateOne.mock.calls[0]?.[1] as { $set?: Record<string, unknown> } | undefined
    )?.$set;
    expect(projectSet).not.toHaveProperty("intelligence.mgDesignJob");
    expect(persistenceMocks.updateOne).toHaveBeenNthCalledWith(
      2,
      {
        _id: "mgd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        projectId: "proj_1",
        userId: "user_1",
        status: "running",
        leaseId: "mgdl_owned_lease",
      },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "completed", leaseId: null }),
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(persistenceMocks.endSession).toHaveBeenCalledOnce();
  });

  it("does not complete an MG design job against a stale project revision", async () => {
    persistenceMocks.findOne
      .mockResolvedValueOnce({ status: "running", leaseId: "mgdl_owned_lease" })
      .mockResolvedValueOnce({
        projectRevision: 8,
        updatedAt: new Date("2026-08-11T06:05:02.000Z"),
        intelligence: {},
      });
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.completeMgDesignExecutionV1(
      "user_1",
      "proj_1",
      mgDesignCompletionCommand(),
    )).resolves.toMatchObject({
      disposition: "PROJECT_CONFLICT",
      currentRevision: { value: 8 },
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
    expect(persistenceMocks.endSession).toHaveBeenCalledOnce();
  });

  it("commits native-video rights and the timeline at one project revision", async () => {
    const updatedAt = new Date("2026-08-11T06:02:00.000Z");
    persistenceMocks.bulkWrite.mockResolvedValueOnce({ matchedCount: 1 });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const captured = await projectService.captureMutationReceipts(() => (
      projectService.commitAudioRightsAttestation("user_1", "proj_1", {
        kind: "native-video",
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: "2026-08-11T06:01:00.000Z",
        },
        updatedAt,
        overlays: [{
          id: 2,
          type: "video",
          from: 0,
          row: 0,
          durationInFrames: 30,
          assetId: "video_1",
        }] as any,
        rightsByAssetId: {
          video_1: {
            mediaRole: "native-video",
            source: "user-upload",
            userChoice: "attested",
            licensed: true,
            evidence: { kind: "user-attestation" },
          } as any,
        },
      })
    ));

    expect(captured.value).toMatchObject({
      projectId: "proj_1",
      revision: { value: 8 },
    });
    expect(captured.receipts).toHaveLength(1);
    expect(persistenceMocks.bulkWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: expect.objectContaining({
            assetId: "video_1",
            type: "video",
            source: "user-upload",
          }),
        }),
      }),
    ], expect.objectContaining({ ordered: true }));
    expect(persistenceMocks.updateOne).toHaveBeenCalledWith(
      {
        projectId: "proj_1",
        userId: "user_1",
        projectRevision: 7,
        updatedAt: new Date("2026-08-11T06:01:00.000Z"),
      },
      expect.objectContaining({
        $inc: { projectRevision: 1 },
      }),
      expect.objectContaining({ session: expect.anything() }),
    );
    expect(persistenceMocks.endSession).toHaveBeenCalledOnce();
  });

  it("commits uploaded-audio rights, storyboard copies, and timeline together", async () => {
    const updatedAt = new Date("2026-08-11T06:03:00.000Z");
    persistenceMocks.bulkWrite.mockResolvedValueOnce({ matchedCount: 1 });
    persistenceMocks.updateOne
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const receipt = await projectService.commitAudioRightsAttestation(
      "user_1",
      "proj_1",
      {
        kind: "uploaded-export-audio",
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: "2026-08-11T06:02:00.000Z",
        },
        updatedAt,
        overlays: [] as any,
        rightsByAssetId: {
          audio_1: {
            mediaRole: "voiceover",
            source: "user-upload",
            userChoice: "attested",
            licensed: true,
            evidence: { kind: "user-attestation" },
          } as any,
        },
        storyboardUpdates: [{ storyboardId: "board_1", scenes: [] }],
      },
    );

    expect(receipt).toMatchObject({ projectId: "proj_1", revision: { value: 8 } });
    expect(persistenceMocks.bulkWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: expect.objectContaining({
            assetId: "audio_1",
            type: "audio",
            audioRights: { $exists: false },
            musicRights: { $exists: false },
          }),
        }),
      }),
    ], expect.objectContaining({ ordered: true }));
    expect(persistenceMocks.updateOne.mock.calls[0]?.[0]).toEqual({
      storyboardId: "board_1",
      userId: "user_1",
      projectId: "proj_1",
    });
    expect(persistenceMocks.updateOne.mock.calls[1]?.[0]).toEqual({
      projectId: "proj_1",
      userId: "user_1",
      projectRevision: 7,
      updatedAt: new Date("2026-08-11T06:02:00.000Z"),
    });
    expect(persistenceMocks.endSession).toHaveBeenCalledOnce();
  });

  it("rejects a lost revision-bound overlay write without publishing a receipt", async () => {
    const before = "2026-08-11T03:00:00.000Z";
    const after = "2026-08-11T03:00:01.000Z";
    persistenceMocks.findOne
      .mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        fps: 30,
        overlays: [{
          id: 1,
          type: "text",
          content: "before",
          from: 0,
          durationInFrames: 30,
        }],
        updatedAt: new Date(before),
        projectRevision: 7,
      })
      .mockResolvedValueOnce({
        projectId: "proj_1",
        userId: "user_1",
        updatedAt: new Date(after),
        projectRevision: 8,
      });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 0,
      modifiedCount: 0,
    });
    const { ProjectMutationConflictError, projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    const captured = await projectService.captureMutationReceipts(async () => {
      await expect(
        projectService.updateOverlayAtRevisionV1("user_1", "proj_1", {
          expectedRevision: {
            schemaVersion: 1,
            value: 7,
            compatibilityUpdatedAt: before,
          },
          actorKind: "SYSTEM",
          overlayId: 1,
          updates: { content: "lost" } as any,
        }),
      ).rejects.toBeInstanceOf(ProjectMutationConflictError);
    });

    expect(captured.receipts).toEqual([]);
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.updateOne.mock.calls[0][0]).toMatchObject({
      projectRevision: 7,
      updatedAt: new Date(before),
    });
  });

  it("rejects a missing revision-bound overlay before it writes", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      overlays: [],
      updatedAt: new Date("2026-08-11T04:00:00.000Z"),
      projectRevision: 7,
    });
    const { ProjectMutationWriteError, projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(
      projectService.updateOverlayAtRevisionV1("user_1", "proj_1", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: "2026-08-11T04:00:00.000Z",
        },
        actorKind: "SYSTEM",
        overlayId: 404,
        updates: { content: "missing" } as any,
      }),
    ).rejects.toMatchObject({
      code: "PROJECT_MUTATION_WRITE_FAILED",
      message: expect.stringContaining("404"),
    } satisfies Partial<InstanceType<typeof ProjectMutationWriteError>>);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a revision-bound overlay update outside the project owner without writing", async () => {
    persistenceMocks.findOne.mockResolvedValueOnce(null);
    const { ProjectNotFoundOrForbiddenError, projectService } = await import(
      "@/lib/editron/services/project-service",
    );

    await expect(
      projectService.updateOverlayAtRevisionV1("attacker", "proj_1", {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: "2026-08-11T04:00:00.000Z",
        },
        actorKind: "SYSTEM",
        overlayId: 1,
        updates: { content: "blocked" } as any,
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundOrForbiddenError);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("does not publish a direct writer receipt when Mongo makes no durable change", async () => {
    const updatedAt = "2026-08-11T05:00:00.000Z";
    persistenceMocks.findOne.mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_1",
      fps: 30,
      overlays: [],
      updatedAt: new Date(updatedAt),
      projectRevision: 7,
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 0,
    });
    const { ProjectMutationWriteError, projectService } = await import(
      "@/lib/editron/services/project-service",
    );
    let observedReceipts: readonly unknown[] = [];

    await expect(
      projectService.captureMutationReceipts(
        () => projectService.addOverlayAtRevisionV1("user_1", "proj_1", {
          expectedRevision: {
            schemaVersion: 1,
            value: 7,
            compatibilityUpdatedAt: updatedAt,
          },
          actorKind: "SYSTEM",
          overlay: {
            id: 2,
            type: "text",
            from: 0,
            row: 0,
            durationInFrames: 30,
            content: "uncommitted",
          } as any,
        }),
        (receipts) => {
          observedReceipts = receipts;
        },
      ),
    ).rejects.toBeInstanceOf(ProjectMutationWriteError);

    expect(observedReceipts).toEqual([]);
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

  it("persists named timeline markers through manual save and returns them on GET", async () => {
    const updatedAt = "2026-08-26T01:00:00.000Z";
    const markers = [
      { id: "intro", frame: 0, label: "Intro" },
      { id: "cta", frame: 90, label: "Call to action" },
    ];
    const currentProject = {
      projectId: "proj_1",
      userId: "user_1",
      name: "Marker fixture",
      overlays: [],
      aspectRatio: "16:9",
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 180,
      visibility: "private",
      createdAt: new Date(updatedAt),
      updatedAt: new Date(updatedAt),
      projectRevision: 0,
    };
    persistenceMocks.auth.mockResolvedValue({ userId: "user_1" });
    persistenceMocks.findOne.mockResolvedValue(currentProject);
    persistenceMocks.updateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });

    const { POST } = await import(
      "@/app/api/services/editron/projects/[projectId]/save/route",
    );
    const response = await POST(
      new NextRequest(
        "http://localhost/api/services/editron/projects/proj_1/save",
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: {
              schemaVersion: 1,
              value: 0,
              compatibilityUpdatedAt: updatedAt,
            },
            overlays: [],
            aspectRatio: "16:9",
            playerDimensions: { width: 1920, height: 1080 },
            fps: 30,
            durationInFrames: 180,
            markers,
          }),
        },
      ),
      { params: Promise.resolve({ projectId: "proj_1" }) },
    );

    expect(response.status).toBe(200);
    expect(persistenceMocks.updateOne.mock.calls[0]?.[1]).toMatchObject({
      $set: expect.objectContaining({ markers }),
    });
    expect(
      JSON.parse(
        serializeEditorStateForSave({ overlays: [], markers } as any),
      ).markers,
    ).toEqual(markers);

    persistenceMocks.findOne.mockResolvedValueOnce({
      ...currentProject,
      markers,
    });
    const { GET } = await import(
      "@/app/api/services/editron/projects/[projectId]/route",
    );
    const reloadResponse = await GET(
      new NextRequest(
        "http://localhost/api/services/editron/projects/proj_1",
      ),
      { params: Promise.resolve({ projectId: "proj_1" }) },
    );

    expect(reloadResponse.status).toBe(200);
    await expect(reloadResponse.json()).resolves.toMatchObject({
      success: true,
      project: { markers },
    });
  });

  it("accepts named timeline markers through the strict autosave schema", async () => {
    const updatedAt = "2026-08-26T02:00:00.000Z";
    const markers = [{ id: "beat_1", frame: 12, label: "First beat" }];
    persistenceMocks.auth.mockResolvedValue({ userId: "user_1" });
    persistenceMocks.findOne.mockResolvedValue({
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      updatedAt: new Date(updatedAt),
      projectRevision: 4,
    });
    persistenceMocks.updateOne.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1,
    });

    const { POST } = await import(
      "@/app/api/services/editron/projects/[projectId]/autosave/route",
    );
    const response = await POST(
      new NextRequest(
        "http://localhost/api/services/editron/projects/proj_1/autosave",
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: {
              schemaVersion: 1,
              value: 4,
              compatibilityUpdatedAt: updatedAt,
            },
            overlays: [],
            aspectRatio: "16:9",
            playerDimensions: { width: 1920, height: 1080 },
            fps: 30,
            durationInFrames: 120,
            markers,
          }),
        },
      ),
      { params: Promise.resolve({ projectId: "proj_1" }) },
    );

    expect(response.status).toBe(200);
    expect(persistenceMocks.updateOne.mock.calls[0]?.[1]).toMatchObject({
      $set: { markers },
    });
  });

  it("rejects malformed markers in both routes and before direct service writes", async () => {
    const invalidMarkers = [{ id: "late_frame", frame: 120, label: "Late" }];
    expect(isValidEditorTimelineMarkers(invalidMarkers)).toBe(true);
    expect(isValidEditorTimelineMarkers(invalidMarkers, 120)).toBe(false);
    expect(
      isValidEditorTimelineMarkers([
        { id: "duplicate", frame: 0, label: "First" },
        { id: " duplicate ", frame: 1, label: "Second" },
      ]),
    ).toBe(false);
    persistenceMocks.auth.mockResolvedValue({ userId: "user_1" });
    const requestBody = {
      expectedRevision: {
        schemaVersion: 1,
        value: 0,
        compatibilityUpdatedAt: "2026-08-26T03:00:00.000Z",
      },
      overlays: [],
      aspectRatio: "16:9",
      playerDimensions: { width: 1920, height: 1080 },
      durationInFrames: 120,
      markers: invalidMarkers,
    };

    const { POST: save } = await import(
      "@/app/api/services/editron/projects/[projectId]/save/route",
    );
    const saveResponse = await save(
      new NextRequest(
        "http://localhost/api/services/editron/projects/proj_1/save",
        { method: "POST", body: JSON.stringify(requestBody) },
      ),
      { params: Promise.resolve({ projectId: "proj_1" }) },
    );
    expect(saveResponse.status).toBe(400);
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();

    const { POST: autosave } = await import(
      "@/app/api/services/editron/projects/[projectId]/autosave/route",
    );
    const autosaveResponse = await autosave(
      new NextRequest(
        "http://localhost/api/services/editron/projects/proj_1/autosave",
        { method: "POST", body: JSON.stringify(requestBody) },
      ),
      { params: Promise.resolve({ projectId: "proj_1" }) },
    );
    expect(autosaveResponse.status).toBe(400);
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();

    const { projectService } = await import(
      "@/lib/editron/services/project-service",
    );
    await expect(
      projectService.saveProject("user_1", "proj_1", {
        overlays: [],
        aspectRatio: "16:9",
        playerDimensions: { width: 1920, height: 1080 },
        durationInFrames: 120,
        markers: [
          { id: "valid", frame: 0, label: "First" },
          { id: "late", frame: 120, label: "Second" },
        ],
      }),
    ).rejects.toThrow("Invalid editor timeline markers");
    expect(persistenceMocks.findOne).not.toHaveBeenCalled();
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("binds direct-service marker ranges to the stored duration when duration is omitted", async () => {
    persistenceMocks.findOne.mockResolvedValue({
      projectId: "proj_1",
      userId: "user_1",
      overlays: [],
      durationInFrames: 120,
      updatedAt: new Date("2026-08-26T04:00:00.000Z"),
      projectRevision: 0,
    });

    const { projectService } = await import(
      "@/lib/editron/services/project-service"
    );
    await expect(
      projectService.saveProject("user_1", "proj_1", {
        overlays: [],
        aspectRatio: "16:9",
        playerDimensions: { width: 1920, height: 1080 },
        markers: [{ id: "late", frame: 120, label: "Out of range" }],
      }),
    ).rejects.toThrow("Invalid editor timeline markers");
    expect(persistenceMocks.findOne).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });
});

function phase0RenderedEvidenceFacts() {
  return {
    renderedStillEvidence: { status: "completed" },
    fixtureArtifact: {
      materialization: "lambda-stills-rendered",
      renderedStillEvidenceStatus: "completed",
      renderedStillEvidenceReason: null,
      renderedStillFrameCount: 3,
      renderedStillFailedFrameCount: 0,
      renderedStillCompletedAt: "2026-08-11T06:00:01.000Z",
      renderedAestheticStatus: "pass",
      renderedAestheticScore: 98,
      renderedAestheticIssueCount: 0,
      renderedAestheticFailFrameCount: 0,
      renderedAestheticWarnFrameCount: 0,
      renderedAestheticSampledFrames: 3,
    },
    renderedQualityEvidence: { qualityEvidenceSource: "rendered-aesthetic" },
    renderedQualityGate: { status: "pass" },
  };
}
