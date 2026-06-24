import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRenderProgress: vi.fn(),
  getChapterRenderProgress: vi.fn(),
  setAWSCredentials: vi.fn(async () => {}),
  updateJobProgress: vi.fn(async () => {}),
  completeJob: vi.fn(async () => {}),
  failJob: vi.fn(async () => {}),
  addVideoToLink: vi.fn(async () => false),
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
}));

vi.mock("@/lib/shared/project-links", () => ({
  addVideoToLink: mocks.addVideoToLink,
}));

import { GET } from "@/app/api/services/editron/cloudrun/progress/route";

function chapterProgressRequest(renderId: string) {
  return new Request(
    `http://localhost/api/services/editron/cloudrun/progress?renderId=${renderId}&bucketName=chapter-render&region=us-east-1`,
  );
}

describe("Editron chapter render progress route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REMOTION_LAMBDA_FUNCTION_NAME = "remotion-render";
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
    expect(mocks.getChapterRenderProgress).toHaveBeenCalledWith("chr_rendering");
    expect(mocks.getRenderProgress).not.toHaveBeenCalled();
    expect(mocks.updateJobProgress).toHaveBeenCalledWith("chr_rendering", 0.42);
  });

  it("returns chapter completion in the client progress contract", async () => {
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
