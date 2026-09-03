import { describe, expect, it } from "vitest";
import { admitClickatronCarouselPlan } from "@/lib/thinkforge/schemas/clickatron-creative-contract";
import { buildCarouselCreativeSpec, carouselIntent, planCarouselFromText } from "@/lib/studio/orchestrator/design-carousel";

describe("carouselIntent", () => {
  it("fires on carousel asks and N-slide phrasings, not on single visuals", () => {
    expect(carouselIntent("make a carousel for the launch")).toBe(true);
    expect(carouselIntent("a 5-slide post")).toBe(true);
    expect(carouselIntent("make an instagram visual")).toBe(false);
  });
});

describe("planCarouselFromText — §11: slide copy comes from the user, never invented", () => {
  it("parses numbered slides, orders by stated number, renumbers the index", () => {
    const plan = planCarouselFromText("carousel please\nslide 2: the close — last call\nslide 1: the hook — big claim");
    if (!("slides" in plan)) throw new Error("expected slides");
    expect(plan.slides.map((s) => s.title)).toEqual(["the hook", "the close"]);
    expect(plan.slides.map((s) => s.index)).toEqual([0, 1]);
    expect(plan.slides[0]?.imagePrompt).toBe("the hook — big claim");
    expect(plan.slides[0]?.id).toBe("slide_1");
  });

  it("a carousel ask without per-slide copy asks for the copy instead of guessing", () => {
    const plan = planCarouselFromText("make a 4-slide carousel about the drop");
    expect(plan).toEqual({ need: "slide_copy" });
  });

  it("one lonely slide is not a carousel — admission floor is 2", () => {
    expect(planCarouselFromText("carousel:\nslide 1: only beat")).toEqual({ need: "slide_copy" });
  });

  it("caps at 10 slides", () => {
    const text = Array.from({ length: 14 }, (_, i) => `slide ${i + 1}: beat ${i + 1}`).join("\n");
    const plan = planCarouselFromText(text);
    if (!("slides" in plan)) throw new Error("expected slides");
    expect(plan.slides).toHaveLength(10);
  });
});

describe("buildCarouselCreativeSpec — the REAL Clickatron validator must admit it (audit 1b)", () => {
  it("the spec the bridge posts passes admission and returns the exact slides", () => {
    const plan = planCarouselFromText("carousel:\nslide 1: the hook\nslide 2: the close");
    if (!("slides" in plan)) throw new Error("expected slides");
    const metadata = buildCarouselCreativeSpec(plan.slides, "make a launch carousel");
    const spec = (metadata as { clickatron: { creativeSpec: unknown } }).clickatron.creativeSpec;
    /* the session route's exact admission call — this is the gate that 422'd
     * every studio carousel turn before the fix */
    const admitted = admitClickatronCarouselPlan({ creativeSpec: spec, requestedSlideCount: plan.slides.length });
    expect(admitted).toHaveLength(2);
    expect(admitted[0]?.imagePrompt).toBe("the hook");
    expect(admitted.map((s) => s.id)).toEqual(plan.slides.map((s) => s.id));
  });

  it("a slide-count mismatch is refused by the same validator (the contract holds)", () => {
    const plan = planCarouselFromText("carousel:\nslide 1: hook\nslide 2: body\nslide 3: close");
    if (!("slides" in plan)) throw new Error("expected slides");
    const metadata = buildCarouselCreativeSpec(plan.slides, "x");
    const spec = (metadata as { clickatron: { creativeSpec: unknown } }).clickatron.creativeSpec;
    expect(() => admitClickatronCarouselPlan({ creativeSpec: spec, requestedSlideCount: 2 })).toThrow();
  });
});
