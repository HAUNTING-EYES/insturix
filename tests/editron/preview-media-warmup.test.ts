import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PreviewMediaWarmup,
  selectPreviewWarmSources,
} from "../../components/editron/editor/version-7.0.0/remotion/preview-media-warmup";
import {
  OverlayType,
  type ClipOverlay,
  type Overlay,
  type SoundOverlay,
} from "../../components/editron/editor/version-7.0.0/types";

function video(
  id: number,
  from: number,
  durationInFrames: number,
  url: string,
): ClipOverlay {
  return {
    content: url,
    durationInFrames,
    from,
    height: 1080,
    id,
    isDragging: false,
    left: 0,
    rotation: 0,
    row: 2,
    styles: {},
    top: 0,
    type: OverlayType.VIDEO,
    width: 1920,
  };
}

function sound(
  id: number,
  from: number,
  durationInFrames: number,
  url: string,
): SoundOverlay {
  return {
    content: url,
    durationInFrames,
    from,
    height: 0,
    id,
    isDragging: false,
    left: 0,
    rotation: 0,
    row: 0,
    styles: {},
    top: 0,
    type: OverlayType.SOUND,
    width: 0,
  };
}

describe("preview media warmup", () => {
  it("keeps the active source first and warms only nearby sources", () => {
    const overlays: Overlay[] = [
      video(1, 0, 300, "https://cdn.example.com/past.mp4"),
      video(2, 300, 300, "https://cdn.example.com/active.mp4"),
      sound(3, 450, 300, "https://cdn.example.com/music.mp3"),
      video(4, 620, 90, "https://cdn.example.com/upcoming.mp4"),
      video(5, 1_200, 300, "https://cdn.example.com/distant.mp4"),
    ];

    expect(selectPreviewWarmSources({
      currentFrame: 450,
      fps: 30,
      overlays,
    })).toEqual([
      { kind: "video", url: "https://cdn.example.com/active.mp4" },
      { kind: "audio", url: "https://cdn.example.com/music.mp3" },
      { kind: "video", url: "https://cdn.example.com/upcoming.mp4" },
    ]);
  });

  it("deduplicates reused assets and never warms ephemeral blob URLs", () => {
    const sharedUrl = "https://cdn.example.com/shared.mp4";
    const overlays: Overlay[] = [
      video(1, 0, 300, sharedUrl),
      video(2, 300, 300, sharedUrl),
      video(3, 450, 300, "blob:https://app.example.com/revoked"),
    ];

    expect(selectPreviewWarmSources({
      currentFrame: 290,
      fps: 30,
      overlays,
    })).toEqual([{ kind: "video", url: sharedUrl }]);
  });

  it("bounds decoder pressure with a source limit", () => {
    const overlays = Array.from({ length: 8 }, (_, index) =>
      video(
        index + 1,
        index * 15,
        300,
        `https://cdn.example.com/${index}.mp4`,
      ));

    expect(selectPreviewWarmSources({
      currentFrame: 30,
      fps: 30,
      maxSources: 3,
      overlays,
    })).toHaveLength(3);
  });

  it("mounts native streaming media instead of allocating blob URLs", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewMediaWarmup, {
        sources: [
          { kind: "video", url: "https://cdn.example.com/clip.mp4" },
          { kind: "audio", url: "https://cdn.example.com/music.mp3" },
        ],
      }),
    );

    expect(html).toContain('preload="auto"');
    expect(html).toContain('src="https://cdn.example.com/clip.mp4"');
    expect(html).toContain('src="https://cdn.example.com/music.mp3"');
    expect(html).not.toContain("blob:");
  });
});
