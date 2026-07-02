import { describe, expect, it } from "vitest";

import { DURATION_IN_FRAMES, FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "@/components/editron/editor/version-7.0.0/constants";
import { resolveEditronRenderMetadata } from "@/components/editron/editor/version-7.0.0/remotion/metadata";

describe("Editron Remotion metadata", () => {
  it("honors render props for duration, fps, and dimensions", () => {
    expect(resolveEditronRenderMetadata({
      durationInFrames: 360,
      fps: 24,
      width: 1080,
      height: 1920,
    })).toEqual({
      durationInFrames: 360,
      fps: 24,
      width: 1080,
      height: 1920,
    });
  });

  it("falls back to safe composition defaults for invalid values", () => {
    expect(resolveEditronRenderMetadata({
      durationInFrames: 0,
      fps: -1,
      width: Number.NaN,
      height: 0,
    })).toEqual({
      durationInFrames: DURATION_IN_FRAMES,
      fps: FPS,
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
    });
  });
});