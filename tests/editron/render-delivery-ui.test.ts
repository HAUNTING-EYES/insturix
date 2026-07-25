import { describe, expect, it } from "vitest";

import {
  formatCueTime,
  parseRenderHistoryItem,
} from "@/components/editron/editor/version-7.0.0/components/rendering/render-delivery-ui";

const DELIVERY_MANIFEST = {
  version: "editron-render-delivery-manifest-v1",
  mode: "platform-native",
  createdAt: "2026-07-26T00:00:00.000Z",
  completedAt: "2026-07-26T00:05:00.000Z",
  primaryArtifact: {
    kind: "clean-master",
    renderId: "render_1",
    status: "ready",
    url: "https://video.example/clean-master.mp4",
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
        timelineStartFrame: 15,
        timelineEndFrame: 9_150,
        timelineStartMs: 500,
        timelineEndMs: 305_000,
        timelineBeatEntryFrame: null,
        timelineBeatEntryMs: null,
        platformTrackSourceOffsetMs: null,
        cueStatus: "manual-cue-required",
      },
    },
  },
};

describe("render delivery UI contract", () => {
  it("parses a completed clean master without losing its handoff receipt", () => {
    const item = parseRenderHistoryItem({
      id: "render_1",
      status: "done",
      url: "https://video.example/clean-master.mp4",
      completedAt: "2026-07-26T00:05:00.000Z",
      expiresAt: "2026-08-02T00:05:00.000Z",
      deliveryManifest: DELIVERY_MANIFEST,
    });

    expect(item).toEqual(expect.objectContaining({
      id: "render_1",
      status: "success",
      url: "https://video.example/clean-master.mp4",
      deliveryManifest: DELIVERY_MANIFEST,
    }));
    expect(item?.timestamp.toISOString()).toBe("2026-07-26T00:05:00.000Z");
    expect(item?.expiresAt?.toISOString()).toBe("2026-08-02T00:05:00.000Z");
  });

  it("rejects impossible completed-history rows instead of inventing an artifact", () => {
    expect(parseRenderHistoryItem({
      id: "render_without_url",
      status: "done",
      completedAt: "2026-07-26T00:05:00.000Z",
    })).toBeNull();
    expect(parseRenderHistoryItem({
      id: "still_rendering",
      status: "rendering",
      completedAt: "2026-07-26T00:05:00.000Z",
    })).toBeNull();
  });

  it("formats cue windows beyond five minutes", () => {
    expect(formatCueTime(500)).toBe("0:00.5");
    expect(formatCueTime(305_000)).toBe("5:05");
  });
});
