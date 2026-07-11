import { describe, expect, it } from "vitest";
import { resolveSceneNarration } from "@/lib/editron/saas-explainer/script-plan";
import type { SceneDescriptor } from "@/lib/pipeline/schemas/storyboard";

/**
 * VO integrity for the SaaS explainer premium plan. The plan is scene-driven (vo = narration), so a scene with
 * empty narration renders SILENT. The shared script author can legitimately mark a scene "Text Overlay" (silent),
 * which is what produced the "no voiceover on most scenes" bug. resolveSceneNarration is the deterministic safety
 * net: prefer authored VO, else speak the scene's own on-screen text, else report empty (never fabricate).
 */
function scene(overrides: Partial<SceneDescriptor>): SceneDescriptor {
  return {
    sceneIndex: 0,
    title: "Scene",
    narration: "",
    visualDescription: "A clean SaaS dashboard.",
    ...overrides,
  } as SceneDescriptor;
}

describe("resolveSceneNarration", () => {
  it("uses the authored voiceover when present", () => {
    const result = resolveSceneNarration(scene({ narration: "One platform. Entire production." }));
    expect(result).toEqual({ narration: "One platform. Entire production.", source: "authored" });
  });

  it("strips a leading VO: label from authored narration", () => {
    const result = resolveSceneNarration(scene({ narration: "VO: Your desktop is chaos." }));
    expect(result.source).toBe("authored");
    expect(result.narration).toBe("Your desktop is chaos.");
  });

  it("falls back to the scene's own on-screen text when narration is empty (the Text-Overlay bug)", () => {
    const result = resolveSceneNarration(
      scene({ narration: "", editDirections: { onScreenText: ["Make content easy", "Ship faster"] } }),
    );
    expect(result.source).toBe("onscreen_text");
    expect(result.narration).toBe("Make content easy. Ship faster");
  });

  it("reports empty (never fabricates) when there is neither narration nor on-screen text", () => {
    const result = resolveSceneNarration(scene({ narration: "", editDirections: { onScreenText: [] } }));
    expect(result).toEqual({ narration: "", source: "empty" });
  });

  it("treats whitespace-only on-screen text as empty", () => {
    const result = resolveSceneNarration(
      scene({ narration: "   ", editDirections: { onScreenText: ["   ", ""] } }),
    );
    expect(result.source).toBe("empty");
    expect(result.narration).toBe("");
  });
});
