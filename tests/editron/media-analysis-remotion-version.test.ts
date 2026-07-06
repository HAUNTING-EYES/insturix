import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  renderMediaOnLambda: vi.fn(),
  assertRemotionSiteFresh: vi.fn(),
}));

vi.mock("@remotion/lambda/client", () => ({
  renderMediaOnLambda: mocks.renderMediaOnLambda,
}));

vi.mock("@/lib/editron/services/remotion-site-version", () => ({
  assertRemotionSiteFresh: mocks.assertRemotionSiteFresh,
}));

vi.mock("../../lib/editron/services/media/transcription-service", () => ({
  getTranscription: vi.fn(),
}));

vi.mock("../../lib/editron/services/asset-resolver", () => ({
  assetResolver: { resolveAssetUrl: vi.fn() },
}));

import { sampleAudioClip, sampleVideoClip } from "../../lib/editron/services/media/analysis-service";

describe("media analysis Remotion site freshness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REMOTION_AWS_REGION = "us-east-1";
    process.env.REMOTION_LAMBDA_FUNCTION_NAME = "remotion-fn";
    process.env.REMOTION_LAMBDA_SERVE_URL = "https://remotion.example/site";
    mocks.assertRemotionSiteFresh.mockReturnValue({ reason: "verified_env_commit" });
    mocks.renderMediaOnLambda.mockResolvedValue({ bucketName: "bucket_1", renderId: "render_1" });
  });

  it("checks Remotion site freshness before timeline audio sampling", async () => {
    const output = await sampleAudioClip({
      projectId: "proj_1",
      source: "timeline",
      startFrame: 15,
      endFrame: 75,
      fps: 30,
      userId: "user_1",
    });

    expect(output).toBe("s3://bucket_1/render_1.wav");
    expect(mocks.assertRemotionSiteFresh).toHaveBeenCalledWith({
      serveUrl: "https://remotion.example/site",
      env: process.env,
    });
    expect(mocks.assertRemotionSiteFresh.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.renderMediaOnLambda.mock.invocationCallOrder[0],
    );
    expect(mocks.renderMediaOnLambda).toHaveBeenCalledWith(expect.objectContaining({
      composition: "AudioSampler",
      functionName: "remotion-fn",
      serveUrl: "https://remotion.example/site",
    }));
  });

  it("checks Remotion site freshness before timeline video sampling", async () => {
    const output = await sampleVideoClip({
      projectId: "proj_1",
      source: "timeline",
      startFrame: 30,
      endFrame: 180,
      fps: 30,
      userId: "user_1",
      targetSampleFps: 2,
    });

    expect(output).toBe("s3://bucket_1/render_1.mp4");
    expect(mocks.assertRemotionSiteFresh).toHaveBeenCalledWith({
      serveUrl: "https://remotion.example/site",
      env: process.env,
    });
    expect(mocks.assertRemotionSiteFresh.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.renderMediaOnLambda.mock.invocationCallOrder[0],
    );
    expect(mocks.renderMediaOnLambda).toHaveBeenCalledWith(expect.objectContaining({
      composition: "VisualSampler",
      functionName: "remotion-fn",
      serveUrl: "https://remotion.example/site",
    }));
  });
});