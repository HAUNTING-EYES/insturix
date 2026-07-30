import { describe, expect, it } from "vitest";
import {
  resolveCaptionWordTextShadow,
} from "../../components/editron/editor/version-7.0.0/components/overlays/captions/caption-layer-content";

describe("caption word render styling", () => {
  it("inherits the canonical readability shadow when the active style omits one", () => {
    expect(resolveCaptionWordTextShadow(
      true,
      undefined,
      "0 4px 16px rgba(0,0,0,0.9)",
    )).toBe("0 4px 16px rgba(0,0,0,0.9)");
  });

  it("preserves an explicit active-word shadow, including an intentional none value", () => {
    expect(resolveCaptionWordTextShadow(
      true,
      "0 0 8px rgba(255,255,255,0.8)",
      "0 4px 16px rgba(0,0,0,0.9)",
    )).toBe("0 0 8px rgba(255,255,255,0.8)");
    expect(resolveCaptionWordTextShadow(
      true,
      "none",
      "0 4px 16px rgba(0,0,0,0.9)",
    )).toBe("none");
  });

  it("uses the base shadow for inactive words", () => {
    expect(resolveCaptionWordTextShadow(
      false,
      "0 0 8px rgba(255,255,255,0.8)",
      "0 4px 16px rgba(0,0,0,0.9)",
    )).toBe("0 4px 16px rgba(0,0,0,0.9)");
  });
});
