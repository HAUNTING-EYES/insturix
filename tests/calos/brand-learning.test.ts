import { describe, it, expect } from "vitest";
import { createCalosDecisionLearningEvent } from "@/lib/calos/calos-brand-learning-events";

describe("createCalosDecisionLearningEvent", () => {
  const base = {
    userId: "u1",
    brandId: "b1",
    contentId: "card_1",
    title: "5 CI mistakes killing your deploy speed",
    observedAt: "2026-07-01T00:00:00.000Z",
  };

  it("approved -> accepted_output_confirmation / affirm", () => {
    const ev = createCalosDecisionLearningEvent({ ...base, decision: "approved" });
    expect(ev.editType).toBe("accepted_output_confirmation");
    expect(ev.polarity).toBe("affirm");
    expect(ev.signalPath).toBe("voice.hookArchetypes");
    expect(ev.afterValue).toBe(base.title);
    expect(ev.service).toBe("thinkforge");
  });

  it("changes_requested + rejected -> rejected_candidate / reject", () => {
    for (const decision of ["changes_requested", "rejected"] as const) {
      const ev = createCalosDecisionLearningEvent({ ...base, decision });
      expect(ev.editType).toBe("rejected_candidate");
      expect(ev.polarity).toBe("reject");
    }
  });

  it("rejection carries more learning weight than acceptance", () => {
    const approved = createCalosDecisionLearningEvent({ ...base, decision: "approved" });
    const rejected = createCalosDecisionLearningEvent({ ...base, decision: "rejected" });
    expect(rejected.learningWeight.value).toBeGreaterThan(approved.learningWeight.value);
  });
});
