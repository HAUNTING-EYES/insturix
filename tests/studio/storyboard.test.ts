import { describe, expect, it } from "vitest";
import { getCreditCost } from "@/lib/config/creditCosts";
import { planStoryboardScenes, storyboardIntent } from "@/lib/studio/orchestrator/storyboard-scenes";
import { storyboardQuote } from "@/lib/studio/orchestrator/storyboard";

describe("storyboard planner — beats come from the user, never invented", () => {
  it("detects storyboard intent", () => {
    expect(storyboardIntent("storyboard this script")).toBe(true);
    expect(storyboardIntent("make me a storyboard of the launch")).toBe(true);
    expect(storyboardIntent("make a carousel")).toBe(false);
  });

  it("parses numbered scene beats, reindexes sequentially, defaults the beat length", () => {
    const plan = planStoryboardScenes("storyboard it\nscene 2: hook lands — city night\nscene 1: opening — product on table");
    if (!("scenes" in plan)) throw new Error("expected scenes");
    expect(plan.scenes.map((s) => s.sceneIndex)).toEqual([0, 1]);
    expect(plan.scenes[0]?.narration).toBe("opening — product on table");
    expect(plan.scenes[0]?.durationSeconds).toBe(4);
    expect(plan.scenes[0]?.visualDescription).toBe("opening — product on table");
  });

  it("a storyboard ask without beats asks for them; one beat is not a board", () => {
    expect(planStoryboardScenes("storyboard the launch post")).toEqual({ need: "scene_beats" });
    expect(planStoryboardScenes("storyboard:\nscene 1: only scene")).toEqual({ need: "scene_beats" });
  });
});

describe("storyboardQuote — the card equals the pipeline's charge", () => {
  it("prices with the same resolver and options the generate route deducts", () => {
    const q = storyboardQuote("t_x", "sb1", 5);
    const charge = getCreditCost("pipeline", "storyboard_image_generation", { quantity: 5 });
    expect(q.lines[0].subtotal).toBe(charge);
    expect(q.lines[0].quantity).toBe(5);
    expect(q.totalByPool.media).toBe(charge);
    expect(q.lines[0].display).toBe("5 scenes · storyboard images");
  });
});
