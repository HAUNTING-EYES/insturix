import { describe, expect, it } from "vitest";
import { validatePublishReadiness } from "@/lib/calos/publish/contract";

describe("CalOS publisher media readiness", () => {
  it("treats a legacy LinkedIn card without a format as text", () => {
    expect(validatePublishReadiness({
      platform: "linkedin",
      copyText: "Launch copy",
    })).toEqual({ ok: true, format: "text", mediaKind: "none" });
  });

  it("rejects an explicit media format that a text-only publisher cannot send", () => {
    const result = validatePublishReadiness({
      platform: "linkedin",
      contentFormat: "image",
      assetUrl: "https://cdn.example.com/card.png",
      copyText: "Launch copy",
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("text posts only");
  });

  it("requires an image for Instagram image posts", () => {
    const missing = validatePublishReadiness({
      platform: "instagram",
      contentFormat: "image",
      assetUrl: "   ",
    });
    const ready = validatePublishReadiness({
      platform: "instagram",
      contentFormat: "IMAGE",
      assetUrl: "https://cdn.example.com/card.png",
    });

    expect(missing).toMatchObject({ ok: false });
    if (!missing.ok) expect(missing.error).toContain("image before approval");
    expect(ready).toEqual({ ok: true, format: "image", mediaKind: "image" });
  });

  it("requires a video for supported YouTube formats", () => {
    const missing = validatePublishReadiness({
      platform: "youtube",
      contentFormat: "long_video",
    });
    const ready = validatePublishReadiness({
      platform: "youtube",
      contentFormat: "long_video",
      assetUrl: "https://cdn.example.com/video.mp4",
    });

    expect(missing).toMatchObject({ ok: false });
    if (!missing.ok) expect(missing.error).toContain("video before approval");
    expect(ready).toEqual({ ok: true, format: "long_video", mediaKind: "video" });
  });

  it("rejects a text card for the video-only YouTube publisher", () => {
    const result = validatePublishReadiness({
      platform: "youtube",
      contentFormat: "text",
      copyText: "A finished script is not a rendered video.",
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("video, short video, long video posts only");
  });

  it("requires copy for text-only publishers", () => {
    const result = validatePublishReadiness({
      platform: "twitter",
      contentFormat: "text",
      copyText: "   ",
    });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("require copy before approval");
  });
});
