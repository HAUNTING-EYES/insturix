import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRenderProgress: vi.fn(),
  renderMediaOnLambda: vi.fn(),
  getDatabase: vi.fn(),
  setAWSCredentials: vi.fn(async () => {}),
  findOne: vi.fn(),
  updateOne: vi.fn(async () => ({})),
  insertOne: vi.fn(async (_job?: unknown) => ({})),
  collection: vi.fn(),
  isChapterConcatConfigured: vi.fn(() => false),
  enqueueChapterConcat: vi.fn(async () => {}),
  assertRemotionSiteFresh: vi.fn(),
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

vi.mock("@/lib/editron/services/chapter-concat-client", () => ({
  isChapterConcatConfigured: mocks.isChapterConcatConfigured,
  enqueueChapterConcat: mocks.enqueueChapterConcat,
}));

vi.mock("@/lib/editron/services/remotion-site-version", () => ({
  assertRemotionSiteFresh: mocks.assertRemotionSiteFresh,
}));
vi.mock("@/lib/services/planService", () => ({
  getUserPlanWithServiceLimits: vi.fn(async () => ({ type: "base" })),
}));

vi.mock("@/lib/editron/services/render-chapter-retention", () => ({
  renderChapterExpiresAt: vi.fn((createdAt: Date) => createdAt),
}));

import {
  detectChapterBoundaries,
  getChapterRenderProgress,
  shouldUseChapterRendering,
  startChapterRender,
} from "@/lib/editron/services/chapter-renderer";

describe("chapter renderer progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REMOTION_AWS_REGION = "us-east-1";
    process.env.REMOTION_LAMBDA_FUNCTION_NAME = "remotion-render-4-0-398-mem2048mb-disk2048mb-120sec";
    mocks.collection.mockReturnValue({
      findOne: mocks.findOne,
      updateOne: mocks.updateOne,
      insertOne: mocks.insertOne,
    });

    mocks.getDatabase.mockResolvedValue({
      collection: mocks.collection,
    });
    // Defaults: concat NOT configured (→ fail-loud), claim updateOne returns no match.
    // Tests that exercise the concat path override these.
    mocks.isChapterConcatConfigured.mockReturnValue(false);
    mocks.enqueueChapterConcat.mockResolvedValue(undefined);
    mocks.assertRemotionSiteFresh.mockReturnValue({ reason: "verified_env_commit" });
    mocks.updateOne.mockResolvedValue({});
  });

  it("keeps chapter duration policy stable across supplied numeric FPS values", () => {
    expect(shouldUseChapterRendering(21_600, 24)).toBe(false);
    expect(shouldUseChapterRendering(21_601, 24)).toBe(true);
    expect(shouldUseChapterRendering(26_973, 29.97)).toBe(false);
    expect(shouldUseChapterRendering(26_974, 29.97)).toBe(true);
    expect(shouldUseChapterRendering(53_999, 60)).toBe(false);
    expect(shouldUseChapterRendering(54_001, 60)).toBe(true);

    const boundaries = detectChapterBoundaries([
      { id: "a", type: "video", row: 2, from: 0, durationInFrames: 3_600 },
      { id: "b", type: "video", row: 2, from: 3_600, durationInFrames: 3_600 },
      { id: "c", type: "video", row: 2, from: 7_200, durationInFrames: 3_600 },
    ] as any, 30_000, 24);

    expect(boundaries.slice(0, 2)).toEqual([
      { startFrame: 0, endFrame: 3_600 },
      { startFrame: 3_600, endFrame: 7_200 },
    ]);
    expect(() => shouldUseChapterRendering(30_000, 0))
      .toThrow("positive finite FPS");
  });

  it("starts chapter renders from absolute composition overlays using slim Lambda props", async () => {
    let insertedJob: any = null;
    mocks.insertOne.mockImplementation(async (job: any) => {
      insertedJob = job;
      mocks.findOne.mockResolvedValue(job);
      return {};
    });
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.renderMediaOnLambda.mockResolvedValue({ renderId: "render_chapter", bucketName: "remotion-bucket" });
    mocks.assertRemotionSiteFresh.mockReturnValue({ reason: "verified_env_commit" });

    const overlays: any[] = [
      { id: "clip-a", type: "video", row: 2, from: 0, durationInFrames: 15_000, videoStartTime: 300 },
      { id: "clip-b", type: "video", row: 2, from: 15_000, durationInFrames: 15_000, videoStartTime: 900 },
      {
        id: "caption-track",
        type: "caption",
        row: 4,
        from: 0,
        durationInFrames: 30_000,
        captions: [{ text: "chapter two words", startMs: 16_000, endMs: 17_000 }],
        metadata: {
          atomicOverlayReceipt: { version: "overlay-atomic-form-v1" },
          unifiedDecisionBundle: { candidates: ["x".repeat(20_000)] },
          semanticMgCandidateLedger: { candidates: ["x".repeat(20_000)] },
        },
      },
      {
        id: "bgm",
        type: "sound",
        row: 1,
        from: 0,
        durationInFrames: 30_000,
        startFromSound: 1234,
        assetId: "bgm_fixture_derivative",
        musicRights: {
          mediaRole: "music",
          source: "generated",
          userChoice: "attested",
          licensed: true,
          evidence: {
            kind: "generated-provider",
            sourceAssetId: "bgm_fixture_source",
            licenseId: "fixture-provider-license",
          },
        },
      },
      {
        id: "transition-at-seam",
        type: "transition",
        row: 5,
        from: 14_985,
        durationInFrames: 30,
        clipAId: "clip-a",
        clipBId: "clip-b",
      },
    ];

    await startChapterRender(
      "chr_123456789012",
      "proj_long",
      "user_1",
      overlays,
      30_000,
      30,
      1920,
      1080,
      "https://remotion.example/site",
      "remotion-fn",
    );

    expect(insertedJob._id).toBe("chr_123456789012");
    expect(insertedJob.overlays).not.toBe(overlays);
    expect(JSON.stringify(insertedJob.overlays)).not.toContain("x".repeat(1000));
    expect(insertedJob.overlays.find((overlay: any) => overlay.id === "caption-track").captions[0]).toEqual({
      text: "chapter two words",
      startMs: 16_000,
      endMs: 17_000,
    });
    expect(insertedJob.overlays.find((overlay: any) => overlay.id === "caption-track").metadata).toEqual({
      atomicOverlayReceipt: { version: "overlay-atomic-form-v1" },
    });
    expect(insertedJob.chapters).toEqual([
      expect.objectContaining({ index: 0, startFrame: 0, endFrame: 15_000, durationFrames: 15_000 }),
      expect.objectContaining({ index: 1, startFrame: 15_000, endFrame: 30_000, durationFrames: 15_000 }),
    ]);
    expect(insertedJob.chapters[0]).not.toHaveProperty("overlays");
    expect(mocks.assertRemotionSiteFresh).toHaveBeenCalledWith({
      serveUrl: "https://remotion.example/site",
      env: process.env,
    });
    expect(mocks.renderMediaOnLambda).toHaveBeenCalledTimes(2);
    expect(mocks.renderMediaOnLambda).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        audioCodec: "aac",
        frameRange: [0, 14_999],
        inputProps: expect.objectContaining({ durationInFrames: 30_000, overlays: insertedJob.overlays }),
      }),
    );
    expect(mocks.renderMediaOnLambda).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        audioCodec: "aac",
        frameRange: [15_000, 29_999],
        inputProps: expect.objectContaining({ durationInFrames: 30_000, overlays: insertedJob.overlays }),
      }),
    );
  });

  it("rejects a chapter job without a caller-owned admission ID before persistence", async () => {
    await expect(startChapterRender(
      "chr_short",
      "proj_long",
      "user_1",
      [],
      30_000,
      30,
      1920,
      1080,
      "https://remotion.example/site",
      "remotion-fn",
    )).rejects.toThrow("caller-owned chr_ admission ID");

    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.insertOne).not.toHaveBeenCalled();
    expect(mocks.renderMediaOnLambda).not.toHaveBeenCalled();
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

  it("fails loud when a multi-chapter job finishes but cannot be stitched into one file", async () => {
    mocks.findOne.mockResolvedValue({
      _id: "chr_multi_done",
      status: "rendering",
      chapters: [
        {
          index: 0,
          status: "completed",
          renderId: "chapter_render_0",
          bucketName: "remotionlambda-us-east-1-realbucket",
          outputUrl: "https://video.example/chapter-0.mp4",
        },
        {
          index: 1,
          status: "completed",
          renderId: "chapter_render_1",
          bucketName: "remotionlambda-us-east-1-realbucket",
          outputUrl: "https://video.example/chapter-1.mp4",
        },
      ],
    });

    const progress = await getChapterRenderProgress("chr_multi_done");

    // Multi-chapter jobs have no assembled output yet — they must NOT report success with a
    // truncated single-chapter clip (the old silent-truncation bug).
    expect(progress?.status).toBe("failed");
    expect(progress?.outputUrl).toBeUndefined();
    expect(progress?.outputUrl).not.toBe("https://video.example/chapter-0.mp4");
    expect(progress?.error).toContain("2 render chapters");
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: "chr_multi_done" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("completes normally when a single-chapter job finishes (no stitching needed)", async () => {
    mocks.findOne.mockResolvedValue({
      _id: "chr_single_done",
      status: "rendering",
      chapters: [
        {
          index: 0,
          status: "completed",
          renderId: "chapter_render_0",
          bucketName: "remotionlambda-us-east-1-realbucket",
          outputUrl: "https://video.example/only-chapter.mp4",
        },
      ],
    });

    const progress = await getChapterRenderProgress("chr_single_done");

    expect(progress?.status).toBe("completed");
    expect(progress?.outputUrl).toBe("https://video.example/only-chapter.mp4");
    expect(progress?.error).toBeUndefined();
  });

  it("enqueues async concat for a completed multi-chapter job when concat is configured", async () => {
    mocks.isChapterConcatConfigured.mockReturnValue(true);
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 }); // claim succeeds
    mocks.findOne.mockResolvedValue({
      _id: "chr_concat",
      status: "rendering",
      chapters: [
        { index: 0, status: "completed", outputUrl: "https://video.example/0.mp4" },
        { index: 1, status: "completed", outputUrl: "https://video.example/1.mp4" },
      ],
    });

    const progress = await getChapterRenderProgress("chr_concat");

    // Concat dispatched; job is still in-progress (NOT failed, NOT completed) until the worker writes back.
    expect(mocks.enqueueChapterConcat).toHaveBeenCalledWith("chr_concat");
    expect(progress?.status).not.toBe("failed");
    expect(progress?.status).not.toBe("completed");
    expect(progress?.outputUrl).toBeUndefined();
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: "chr_concat", concatStatus: { $exists: false } },
      expect.objectContaining({ $set: expect.objectContaining({ concatStatus: "queued" }) }),
    );
  });

  it("completes a multi-chapter job once the concat worker wrote the assembled URL", async () => {
    mocks.isChapterConcatConfigured.mockReturnValue(true);
    mocks.findOne.mockResolvedValue({
      _id: "chr_concat_done",
      status: "rendering",
      concatStatus: "done",
      outputUrl: "https://video.example/full.mp4",
      chapters: [
        { index: 0, status: "completed", outputUrl: "https://video.example/0.mp4" },
        { index: 1, status: "completed", outputUrl: "https://video.example/1.mp4" },
      ],
    });

    const progress = await getChapterRenderProgress("chr_concat_done");

    expect(progress?.status).toBe("completed");
    expect(progress?.outputUrl).toBe("https://video.example/full.mp4");
    expect(mocks.enqueueChapterConcat).not.toHaveBeenCalled(); // already done, no re-dispatch
  });

  it("fails a multi-chapter job when the concat worker reported a failure", async () => {
    mocks.isChapterConcatConfigured.mockReturnValue(true);
    mocks.findOne.mockResolvedValue({
      _id: "chr_concat_failed",
      status: "rendering",
      concatStatus: "failed",
      concatError: "ffmpeg concat failed: moov atom not found",
      chapters: [
        { index: 0, status: "completed", outputUrl: "https://video.example/0.mp4" },
        { index: 1, status: "completed", outputUrl: "https://video.example/1.mp4" },
      ],
    });

    const progress = await getChapterRenderProgress("chr_concat_failed");

    expect(progress?.status).toBe("failed");
    expect(progress?.error).toContain("moov atom");
    expect(mocks.enqueueChapterConcat).not.toHaveBeenCalled();
  });

  it("fails a multi-chapter concat that has been stuck without the worker reporting back", async () => {
    mocks.isChapterConcatConfigured.mockReturnValue(true);
    mocks.findOne.mockResolvedValue({
      _id: "chr_concat_stuck",
      status: "rendering",
      concatStatus: "running",
      updatedAt: new Date(Date.now() - 21 * 60 * 1000), // 21 min ago — past the 20-min ceiling
      chapters: [
        { index: 0, status: "completed", outputUrl: "https://video.example/0.mp4" },
        { index: 1, status: "completed", outputUrl: "https://video.example/1.mp4" },
      ],
    });

    const progress = await getChapterRenderProgress("chr_concat_stuck");

    expect(progress?.status).toBe("failed");
    expect(progress?.error).toContain("timed out");
    expect(mocks.enqueueChapterConcat).not.toHaveBeenCalled();
  });
});
