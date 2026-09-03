import { describe, expect, it } from "vitest";
import { getCreditCost } from "@/lib/config/creditCosts";
import { designCanvasQuote } from "@/lib/studio/orchestrator/design";

describe("designCanvasQuote — the card must equal the charge (plan §11 spend quote)", () => {
  it("quotes exactly what the charge path computes: same resolver, same options", () => {
    const q = designCanvasQuote("t_x", "g2");
    const charge = getCreditCost("clickatron", "variation", { model: "fal-ai/flux-2/flash", quantity: 1 });
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0].subtotal).toBe(charge);
    expect(q.lines[0].quantity).toBe(1);
    expect(q.totalByPool.media).toBe(charge);
    expect(q.totalByPool.main).toBe(0);
  });

  it("premium models carry the config multiplier — no local mirror can drift", () => {
    const q = designCanvasQuote("t_x", "g2", 1, "fal-ai/nano-banana-pro");
    const base = getCreditCost("clickatron", "variation", { quantity: 1 });
    expect(q.lines[0].multiplier).toBe(getCreditCost("clickatron", "variation", { model: "fal-ai/nano-banana-pro", quantity: 1 }) / base);
    expect(q.lines[0].subtotal).toBeGreaterThan(designCanvasQuote("t_x", "g2").lines[0].subtotal);
  });

  it("display reads one variation as singular", () => {
    expect(designCanvasQuote("t_x", "g2").lines[0].display).toBe("1 variation · flash");
    expect(designCanvasQuote("t_x", "g2", 3).lines[0].display).toBe("3 variations · flash");
  });
});
