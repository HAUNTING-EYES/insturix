import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  projectPipelineAudioTimelineBindingHashV1,
} from "@/lib/editron/services/pipeline-audio-project-delivery-v1";

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

vi.mock("@/lib/services/orgMemberService", () => ({
  orgMemberService: {},
}));

vi.mock("@/lib/shared/project-links", () => ({
  removeProjectFromLinks: vi.fn(),
}));

const PROJECT_ID = "proj_audio_delivery";
const USER_ID = "user_audio_delivery";
const DELIVERY_ID = "audio-delivery_abcdefghijklmnopqr";
const BASE_UPDATED_AT = "2026-08-25T00:00:00.000Z";

function visualOverlay(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: "video",
    row: 2,
    from: 0,
    durationInFrames: 180,
    sourceStartFrame: 0,
    assetId: "visual-source-a",
    content: "visual-source-a",
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    isDragging: false,
    rotation: 0,
    styles: { objectFit: "cover" },
    ...overrides,
  };
}

function audioOverlay(input: {
  id: number;
  row: number;
  assetId: string;
  volume?: number;
}) {
  return {
    id: input.id,
    type: "sound",
    row: input.row,
    from: 0,
    durationInFrames: 180,
    assetId: input.assetId,
    src: `https://assets.example.test/${input.assetId}.mp3`,
    content: input.assetId,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    isDragging: false,
    rotation: 0,
    styles: { volume: input.volume ?? 0.3, opacity: 1 },
    audioRights: {
      source: "licensed-library",
      licensed: true,
      evidence: { licenceId: `licence-${input.assetId}` },
    },
  };
}

function projectFixture(
  projectRevision = 7,
  updatedAt = BASE_UPDATED_AT,
  overlays: unknown[] = [visualOverlay()],
) {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: "Pipeline audio delivery fixture",
    overlays,
    aspectRatio: "16:9",
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 180,
    createdAt: new Date(BASE_UPDATED_AT),
    updatedAt: new Date(updatedAt),
    projectRevision,
    visibility: "private" as const,
  };
}

function revisionFor(project: ReturnType<typeof projectFixture>) {
  return {
    schemaVersion: 1 as const,
    value: project.projectRevision,
    compatibilityUpdatedAt: project.updatedAt.toISOString(),
  };
}

function sfxCommand(
  project: ReturnType<typeof projectFixture>,
  overrides: Record<string, unknown> = {},
) {
  return {
    expectedRevision: revisionFor(project),
    planningTimelineBindingHash: projectPipelineAudioTimelineBindingHashV1(project),
    deliveryId: DELIVERY_ID,
    kind: "SFX",
    outcome: "ATTACHED",
    overlays: [audioOverlay({ id: 20, row: 0, assetId: "sfx-hit" })],
    ...overrides,
  } as any;
}

function bgmCommand(
  project: ReturnType<typeof projectFixture>,
  overrides: Record<string, unknown> = {},
) {
  return {
    expectedRevision: revisionFor(project),
    planningTimelineBindingHash: projectPipelineAudioTimelineBindingHashV1(project),
    deliveryId: "audio-delivery_qrstuvwxyzABCDEFGH",
    kind: "BGM",
    outcome: "ATTACHED",
    overlays: [audioOverlay({ id: 21, row: 1, assetId: "bgm-bed", volume: 0.2 })],
    musicCoveragePlan: { schemaVersion: 1, mode: "full", source: "fixture" },
    beatFrames: [],
    ...overrides,
  } as any;
}

describe("ProjectService pipeline audio delivery V1", () => {
  beforeEach(() => {
    vi.useRealTimers();
    persistenceMocks.findOne.mockReset();
    persistenceMocks.updateOne.mockReset();
  });

  it("derives a stable visual binding that ignores audio-only writes", () => {
    const baseline = projectFixture();
    const reordered = projectFixture(7, BASE_UPDATED_AT, [visualOverlay({ id: 2 }), visualOverlay()]);
    const reorderedAgain = projectFixture(7, BASE_UPDATED_AT, [visualOverlay(), visualOverlay({ id: 2 })]);
    const withAudio = projectFixture(7, BASE_UPDATED_AT, [
      visualOverlay(),
      audioOverlay({ id: 99, row: 0, assetId: "already-attached" }),
    ]);
    const changedVisual = projectFixture(7, BASE_UPDATED_AT, [visualOverlay({ from: 12 })]);

    expect(projectPipelineAudioTimelineBindingHashV1(baseline))
      .toBe(projectPipelineAudioTimelineBindingHashV1(withAudio));
    expect(projectPipelineAudioTimelineBindingHashV1(reordered))
      .toBe(projectPipelineAudioTimelineBindingHashV1(reorderedAgain));
    expect(projectPipelineAudioTimelineBindingHashV1(baseline))
      .not.toBe(projectPipelineAudioTimelineBindingHashV1(changedVisual));
  });

  it("attaches a fresh SFX delivery with one writer-issued receipt and unverified render proof", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T01:02:03.000Z"));
    try {
      const project = projectFixture();
      persistenceMocks.findOne.mockResolvedValueOnce(project);
      persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
      const { projectService } = await import("@/lib/editron/services/project-service");
      const command = sfxCommand(project);

      const captured = await projectService.captureMutationReceipts(() => (
        projectService.commitPipelineAudioDeliveryV1(USER_ID, PROJECT_ID, command)
      ));

      expect(captured.value).toMatchObject({
        disposition: "APPLIED",
        deliveryReceipt: {
          deliveryId: DELIVERY_ID,
          kind: "SFX",
          outcome: "ATTACHED",
          rebase: "FRESH",
          attachedOverlayIds: ["20"],
          proof: {
            required: true,
            status: "UNVERIFIABLE",
            reason: "NO_RENDERED_AUDIO_OR_MIX_PROOF",
          },
          beforeRevision: { value: 7 },
          afterRevision: { value: 8 },
        },
      });
      expect(captured.receipts).toEqual([
        captured.value.deliveryReceipt.mutationReceipt,
      ]);

      const [filter, update] = persistenceMocks.updateOne.mock.calls[0] as [Record<string, any>, Record<string, any>];
      expect(filter).toMatchObject({
        projectId: PROJECT_ID,
        userId: USER_ID,
        projectRevision: 7,
        "pipelineAudioDeliveryReceipts.deliveryId": { $ne: DELIVERY_ID },
      });
      expect(update).toMatchObject({
        $inc: { projectRevision: 1 },
        $set: { updatedAt: new Date("2026-08-25T01:02:03.000Z") },
      });
      expect(update.$push.overlays.$each[0]).toMatchObject({
        id: 20,
        _workerAdded: true,
        metadata: {
          pipelineAudioDeliveryV1: {
            deliveryId: DELIVERY_ID,
            kind: "SFX",
            materialHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        },
      });
      expect(update.$push.pipelineAudioDeliveryReceipts.$each[0]).toMatchObject({
        deliveryId: DELIVERY_ID,
        changedPaths: ["pipelineAudioDeliveryReceipts", "overlays"],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("replays only byte-identical delivery material and rejects a changed mix under the same delivery ID", async () => {
    const project = projectFixture();
    persistenceMocks.findOne.mockResolvedValueOnce(project);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");
    const command = sfxCommand(project);
    const first = await projectService.commitPipelineAudioDeliveryV1(USER_ID, PROJECT_ID, command);
    const deliveredProject = {
      ...project,
      pipelineAudioDeliveryReceipts: [first.deliveryReceipt],
    };

    persistenceMocks.findOne.mockResolvedValueOnce(deliveredProject);
    await expect(projectService.commitPipelineAudioDeliveryV1(USER_ID, PROJECT_ID, command))
      .resolves.toMatchObject({ disposition: "ALREADY_APPLIED" });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);

    persistenceMocks.findOne.mockResolvedValueOnce(deliveredProject);
    const changedMix = sfxCommand(project, {
      overlays: [audioOverlay({ id: 20, row: 0, assetId: "sfx-hit", volume: 0.8 })],
    });
    await expect(projectService.commitPipelineAudioDeliveryV1(USER_ID, PROJECT_ID, changedMix))
      .rejects.toMatchObject({ code: "PROJECT_MUTATION_WRITE_FAILED" });
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(1);
  });

  it("safely rebases an audio delivery after an audio-only intervening write", async () => {
    const base = projectFixture();
    const current = projectFixture(8, "2026-08-25T00:00:01.000Z", [
      visualOverlay(),
      audioOverlay({ id: 91, row: 0, assetId: "concurrent-sfx" }),
    ]);
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    persistenceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    const result = await projectService.commitPipelineAudioDeliveryV1(
      USER_ID,
      PROJECT_ID,
      sfxCommand(base),
    );

    expect(result.deliveryReceipt.rebase).toBe("SAFE_REBASED_AUDIO_ONLY");
    expect(persistenceMocks.updateOne.mock.calls[0]?.[0]).toMatchObject({
      projectRevision: 8,
      updatedAt: new Date("2026-08-25T00:00:01.000Z"),
    });
  });

  it("blocks an audio delivery when the planned visual timeline changed", async () => {
    const base = projectFixture();
    const current = projectFixture(8, "2026-08-25T00:00:01.000Z", [visualOverlay({ from: 12 })]);
    persistenceMocks.findOne.mockResolvedValueOnce(current);
    const { projectService } = await import("@/lib/editron/services/project-service");

    await expect(projectService.commitPipelineAudioDeliveryV1(
      USER_ID,
      PROJECT_ID,
      sfxCommand(base),
    )).rejects.toMatchObject({
      code: "PROJECT_PIPELINE_AUDIO_DELIVERY_REBASE_BLOCKED",
      reason: "TIMELINE_BINDING_CHANGED",
      currentRevision: { value: 8 },
    });
    expect(persistenceMocks.updateOne).not.toHaveBeenCalled();
  });

  it("retries a BGM delivery from a fresh CAS snapshot and preserves an intervening SFX", async () => {
    const base = projectFixture();
    const afterConcurrentSfx = projectFixture(8, "2026-08-25T00:00:01.000Z", [
      visualOverlay(),
      audioOverlay({ id: 91, row: 0, assetId: "concurrent-sfx" }),
    ]);
    persistenceMocks.findOne
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce(afterConcurrentSfx);
    persistenceMocks.updateOne
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import("@/lib/editron/services/project-service");

    const result = await projectService.commitPipelineAudioDeliveryV1(
      USER_ID,
      PROJECT_ID,
      bgmCommand(base),
    );

    expect(result.deliveryReceipt.rebase).toBe("SAFE_REBASED_AUDIO_ONLY");
    expect(persistenceMocks.updateOne).toHaveBeenCalledTimes(2);
    const finalUpdate = persistenceMocks.updateOne.mock.calls[1]?.[1] as Record<string, any>;
    expect(finalUpdate.$set.overlays.map((overlay: { assetId?: string }) => overlay.assetId))
      .toEqual(expect.arrayContaining(["concurrent-sfx", "bgm-bed"]));
    expect(finalUpdate.$set.musicCoveragePlan).toEqual({
      schemaVersion: 1,
      mode: "full",
      source: "fixture",
    });
  });
});
