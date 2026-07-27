import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getRenderProgress: vi.fn(),
  getChapterRenderProgress: vi.fn(),
  getJob: vi.fn(),
  setAWSCredentials: vi.fn(async () => {}),
  updateJobProgress: vi.fn(async () => {}),
  completeJob: vi.fn(async () => {}),
  failJob: vi.fn(async () => {}),
  addVideoToLink: vi.fn(async () => false),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@remotion/lambda/client", () => ({
  getRenderProgress: mocks.getRenderProgress,
}));

vi.mock("@/lib/editron/services/chapter-renderer", () => ({
  getChapterRenderProgress: mocks.getChapterRenderProgress,
}));

vi.mock("@/lib/editron/utils/aws-credentials", () => ({
  setAWSCredentials: mocks.setAWSCredentials,
}));

vi.mock("@/lib/editron/services/render-job-service", () => ({
  updateJobProgress: mocks.updateJobProgress,
  completeJob: mocks.completeJob,
  failJob: mocks.failJob,
  getJob: mocks.getJob,
}));

vi.mock("@/lib/shared/project-links", () => ({
  addVideoToLink: mocks.addVideoToLink,
}));

import { GET } from "@/app/api/services/editron/cloudrun/progress/route";

const DELIVERY_MANIFEST = {
  version: "editron-render-delivery-manifest-v1",
  mode: "platform-native",
  createdAt: "2026-07-26T00:00:00.000Z",
  completedAt: null,
  primaryArtifact: {
    kind: "clean-master",
    renderId: "chr_rendering",
    status: "rendering",
    url: null,
  },
  music: {
    embedded: false,
    removedOverlayIds: ["music_1"],
    handoff: {
      version: "editron-platform-native-music-handoff-v1",
      destinationPlatform: "instagram",
      attachmentOwner: "destination-platform",
      track: {
        status: "manual-selection-required",
        provider: null,
        providerTrackId: null,
        title: null,
        artists: [],
        sourceAssetId: null,
        usage: "reference-only",
      },
      timing: {
        timelineStartFrame: 0,
        timelineEndFrame: 300,
        timelineStartMs: 0,
        timelineEndMs: 10_000,
        timelineBeatEntryFrame: null,
        timelineBeatEntryMs: null,
        platformTrackSourceOffsetMs: null,
        cueStatus: "manual-cue-required",
      },
    },
  },
};

function chapterProgressRequest(renderId: string) {
  return new Request(
    `http://localhost/api/services/editron/cloudrun/progress?renderId=${renderId}&bucketName=chapter-render&region=us-east-1`,
  );
}

describe("Editron chapter render progress route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.getJob.mockResolvedValue({
      _id: "render_job",
      userId: "user_1",
      projectId: "project_1",
      deliveryManifest: DELIVERY_MANIFEST,
    });
    process.env.REMOTION_LAMBDA_FUNCTION_NAME = "remotion-render";
  });

  it("requires the persisted render owner before invoking AWS", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const unauthorized = await GET(chapterProgressRequest("chr_private"));

    expect(unauthorized.status).toBe(401);
    expect(mocks.getJob).not.toHaveBeenCalled();
    expect(mocks.setAWSCredentials).not.toHaveBeenCalled();

    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.getJob.mockResolvedValue({ userId: "user_2", projectId: "project_1" });
    const foreign = await GET(chapterProgressRequest("chr_private"));

    expect(foreign.status).toBe(404);
    expect(mocks.setAWSCredentials).not.toHaveBeenCalled();
  });

  it("routes chr renders to the chapter progress service", async () => {
    mocks.getChapterRenderProgress.mockResolvedValue({
      status: "rendering",
      overallProgress: 0.42,
      chapters: [{ index: 0, status: "rendering", progress: 0.42 }],
    });

    const response = await GET(chapterProgressRequest("chr_rendering"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe("success");
    expect(body.data.done).toBe(false);
    expect(body.data.progress).toBe(0.42);
    expect(body.data.deliveryManifest).toEqual(DELIVERY_MANIFEST);
    expect(mocks.getChapterRenderProgress).toHaveBeenCalledWith("chr_rendering");
    expect(mocks.getRenderProgress).not.toHaveBeenCalled();
    expect(mocks.updateJobProgress).toHaveBeenCalledWith("chr_rendering", 0.42);
  });

  it("returns chapter completion in the client progress contract", async () => {
    const completedManifest = {
      ...DELIVERY_MANIFEST,
      completedAt: "2026-07-26T00:05:00.000Z",
      primaryArtifact: {
        ...DELIVERY_MANIFEST.primaryArtifact,
        renderId: "chr_done",
        status: "ready",
        url: "https://video.example/render.mp4",
      },
    };
    mocks.getJob
      .mockResolvedValueOnce({
        _id: "chr_done",
        userId: "user_1",
        projectId: "project_1",
        deliveryManifest: DELIVERY_MANIFEST,
      })
      .mockResolvedValueOnce({
        _id: "chr_done",
        userId: "user_1",
        projectId: "project_1",
        deliveryManifest: completedManifest,
      });
    mocks.getChapterRenderProgress.mockResolvedValue({
      status: "completed",
      overallProgress: 1,
      outputUrl: "https://video.example/render.mp4",
      chapters: [
        {
          index: 0,
          status: "completed",
          progress: 1,
          outputUrl: "https://video.example/render.mp4",
        },
      ],
    });

    const response = await GET(chapterProgressRequest("chr_done"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.type).toBe("success");
    expect(body.data.done).toBe(true);
    expect(body.data.outputFile).toBe("https://video.example/render.mp4");
    expect(body.data.deliveryManifest).toEqual(completedManifest);
    expect(mocks.completeJob).toHaveBeenCalledWith(
      "chr_done",
      "https://video.example/render.mp4",
      0,
    );
    expect(mocks.getRenderProgress).not.toHaveBeenCalled();
  });

  it("does not fall through to Remotion progress when a chapter job is missing", async () => {
    mocks.getChapterRenderProgress.mockResolvedValue(null);

    const response = await GET(chapterProgressRequest("chr_missing"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      type: "error",
      message: "Chapter render job not found",
    });
    expect(mocks.getRenderProgress).not.toHaveBeenCalled();
  });
});
