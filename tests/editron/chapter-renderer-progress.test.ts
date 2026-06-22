import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRenderProgress: vi.fn(),
  renderMediaOnLambda: vi.fn(),
  getDatabase: vi.fn(),
  setAWSCredentials: vi.fn(async () => {}),
  findOne: vi.fn(),
  updateOne: vi.fn(async () => ({})),
  collection: vi.fn(),
}));

vi.mock("@remotion/lambda/client", () => ({
  getRenderProgress: mocks.getRenderProgress,
  renderMediaOnLambda: mocks.renderMediaOnLambda,
}));

vi.mock("@/lib/editron/db/mongodb", () => ({
  getDatabase: mocks.getDatabase,
}));

vi.mock("@/lib/editron/utils/aws-credentials", () => ({
  setAWSCredentials: mocks.setAWSCredentials,
}));

import { getChapterRenderProgress } from "@/lib/editron/services/chapter-renderer";

describe("chapter renderer progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REMOTION_AWS_REGION = "us-east-1";
    process.env.REMOTION_LAMBDA_FUNCTION_NAME = "remotion-render-4-0-398-mem2048mb-disk2048mb-120sec";
    mocks.collection.mockReturnValue({
      findOne: mocks.findOne,
      updateOne: mocks.updateOne,
    });
    mocks.getDatabase.mockResolvedValue({
      collection: mocks.collection,
    });
  });

  it("polls chapter progress through S3 state instead of Lambda status invocation", async () => {
    mocks.findOne.mockResolvedValue({
      _id: "chr_test",
      status: "rendering",
      chapters: [
        {
          index: 0,
          status: "rendering",
          renderId: "chapter_render_1",
          bucketName: "remotionlambda-us-east-1-realbucket",
        },
      ],
    });
    mocks.getRenderProgress.mockResolvedValue({
      overallProgress: 0.5,
      done: false,
      fatalErrorEncountered: false,
    });

    const progress = await getChapterRenderProgress("chr_test");

    expect(progress?.overallProgress).toBe(0.5);
    expect(progress?.chapters).toEqual([
      {
        index: 0,
        status: "rendering",
        progress: 0.5,
        outputUrl: undefined,
        error: undefined,
      },
    ]);
    expect(mocks.getRenderProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        renderId: "chapter_render_1",
        bucketName: "remotionlambda-us-east-1-realbucket",
        skipLambdaInvocation: true,
      }),
    );
  });
  it("marks missing render buckets as failed instead of polling forever", async () => {
    mocks.findOne.mockResolvedValue({
      _id: "chr_missing_bucket",
      status: "rendering",
      chapters: [
        {
          index: 0,
          status: "rendering",
          renderId: "chapter_render_missing_bucket",
          bucketName: "remotionlambda-us-east-1-deletedbucket",
        },
      ],
    });
    mocks.getRenderProgress.mockRejectedValue(new Error("The specified bucket does not exist"));

    const progress = await getChapterRenderProgress("chr_missing_bucket");

    expect(progress?.status).toBe("failed");
    expect(progress?.chapters).toEqual([
      {
        index: 0,
        status: "failed",
        progress: 0,
        outputUrl: undefined,
        error: "The specified bucket does not exist",
      },
    ]);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: "chr_missing_bucket", "chapters.index": 0 },
      expect.objectContaining({
        $set: expect.objectContaining({
          "chapters.$.status": "failed",
          "chapters.$.error": "The specified bucket does not exist",
        }),
      }),
    );
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: "chr_missing_bucket" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "failed" }),
      }),
    );
  });
});
