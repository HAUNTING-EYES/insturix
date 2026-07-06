import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countActiveRenders: vi.fn(),
  createJob: vi.fn(async () => {}),
  renderMediaOnLambda: vi.fn(),
  assertRemotionSiteFresh: vi.fn(),
  rpush: vi.fn(async () => 1),
  llen: vi.fn(async () => 1),
  lpop: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(() => ({
    rpush: mocks.rpush,
    llen: mocks.llen,
    lpop: mocks.lpop,
  })),
}));

vi.mock("@/lib/editron/services/render-job-service", () => ({
  countActiveRenders: mocks.countActiveRenders,
  createJob: mocks.createJob,
}));

vi.mock("@remotion/lambda/client", () => ({
  renderMediaOnLambda: mocks.renderMediaOnLambda,
}));

vi.mock("@/lib/editron/services/remotion-site-version", () => ({
  assertRemotionSiteFresh: mocks.assertRemotionSiteFresh,
}));

import { enqueueRender, processQueue } from "@/lib/editron/services/render-queue-service";

const bloatedInputProps = {
  overlays: [
    {
      id: "caption-track",
      type: "caption",
      from: 0,
      durationInFrames: 120,
      captions: [{ text: "hello", startMs: 0, endMs: 800 }],
      metadata: {
        atomicOverlayReceipt: { version: "overlay-atomic-form-v1" },
        unifiedDecisionBundle: { candidates: ["x".repeat(20_000)] },
        semanticMgCandidateLedger: { candidates: ["x".repeat(20_000)] },
      },
    },
  ],
  durationInFrames: 120,
  fps: 30,
  width: 1920,
  height: 1080,
};

describe("render queue payload slimming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    process.env.REMOTION_LAMBDA_FUNCTION_NAME = "remotion-fn";
    process.env.REMOTION_LAMBDA_SERVE_URL = "https://remotion.example/site";
    process.env.REMOTION_AWS_REGION = "us-east-1";
    mocks.renderMediaOnLambda.mockResolvedValue({ renderId: "render_1", bucketName: "bucket_1" });
  });

  it("slims immediate Lambda renders before handing props to Remotion", async () => {
    mocks.countActiveRenders.mockResolvedValue(0);

    await enqueueRender({
      userId: "user_1",
      projectId: "proj_1",
      inputProps: bloatedInputProps,
    });

    const renderCall = mocks.renderMediaOnLambda.mock.calls[0]?.[0];
    expect(renderCall.inputProps.overlays[0].metadata).toEqual({
      atomicOverlayReceipt: { version: "overlay-atomic-form-v1" },
    });
    expect(JSON.stringify(renderCall.inputProps)).not.toContain("x".repeat(1000));
  });

  it("stores slim props when a render has to wait in Redis", async () => {
    mocks.countActiveRenders.mockResolvedValue(3);

    await enqueueRender({
      userId: "user_1",
      projectId: "proj_1",
      inputProps: bloatedInputProps,
    });

    const queuedJson = String((mocks.rpush.mock.calls as any[])[0]?.[1] ?? "");
    expect(queuedJson).toContain("atomicOverlayReceipt");
    expect(queuedJson).not.toContain("x".repeat(1000));
  });

  it("re-slims dequeued jobs before Lambda in case old queue entries were bloated", async () => {
    mocks.countActiveRenders.mockResolvedValue(0);
    mocks.lpop.mockResolvedValue(JSON.stringify({
      userId: "user_1",
      projectId: "proj_1",
      inputProps: bloatedInputProps,
      queuedAt: Date.now(),
    }));

    await processQueue();

    const renderCall = mocks.renderMediaOnLambda.mock.calls[0]?.[0];
    expect(renderCall.inputProps.overlays[0].metadata).toEqual({
      atomicOverlayReceipt: { version: "overlay-atomic-form-v1" },
    });
    expect(JSON.stringify(renderCall.inputProps)).not.toContain("x".repeat(1000));
  });
});