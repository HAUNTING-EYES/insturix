import { describe, expect, it } from "vitest";
import { buildClickatronImageJobPlan } from "@/lib/clickatron/create-image-job";

/**
 * The kickoff's ONLY job is to hand the worker a payload it can route back to the CalOS card.
 * The worker (workers/clickatron/variation/route.ts) resolves the card via
 * `metadata.sourceContext.calosDeliverableId` and REQUIRES `task.brandId` — so if either is missing
 * or mis-shaped, the image generates but never lands on the card. These assert that contract on the
 * pure plan, with no DB/Redis/QStash.
 */
describe("buildClickatronImageJobPlan", () => {
  const base = {
    userId: "user_1",
    orgId: "org_1",
    brandId: "brand_9",
    prompt: "A crisp product still on a warm editorial backdrop, headline 'Ship it'.",
    sourceContext: { calosDeliverableId: "card_abc", brandId: "brand_9" },
  };

  it("stamps calosDeliverableId on the JOB metadata (worker's success/fail read path)", () => {
    const plan = buildClickatronImageJobPlan(base);
    const sc = (plan.jobDataBase.metadata as { sourceContext?: { calosDeliverableId?: string } })
      ?.sourceContext;
    expect(sc?.calosDeliverableId).toBe("card_abc");
  });

  it("stamps calosDeliverableId on the TASK metadata too (worker merges task+job metadata)", () => {
    const plan = buildClickatronImageJobPlan(base);
    const sc = (plan.taskFields.metadata as { sourceContext?: { calosDeliverableId?: string } })
      ?.sourceContext;
    expect(sc?.calosDeliverableId).toBe("card_abc");
  });

  it("sets task.brandId — the worker gates the card write-back on it", () => {
    const plan = buildClickatronImageJobPlan(base);
    expect(plan.taskFields.brandId).toBe("brand_9");
  });

  it("creates exactly one generating variation whose id matches the job", () => {
    const plan = buildClickatronImageJobPlan(base);
    const variations = plan.taskFields.details.canvas.variations;
    expect(variations).toHaveLength(1);
    expect(variations[0].status).toBe("generating");
    expect(variations[0].id).toBe(plan.jobDataBase.variationId);
    expect(variations[0].id).toBe(plan.variationId);
  });

  it("resolves a non-empty model for a from-scratch t2i still (0 reference images)", () => {
    const plan = buildClickatronImageJobPlan(base);
    expect(typeof plan.modelId).toBe("string");
    expect(plan.modelId.length).toBeGreaterThan(0);
    expect(plan.jobDataBase.modelId).toBe(plan.modelId);
  });

  it("defaults aspect ratio to 1:1 (universal social still) when unspecified", () => {
    const plan = buildClickatronImageJobPlan(base);
    expect(plan.aspectRatio).toBe("1:1");
    expect(plan.taskFields.details.aspectRatio).toBe("1:1");
    expect(plan.jobDataBase.aspectRatio).toBe("1:1");
  });

  it("honours an explicit aspect ratio", () => {
    const plan = buildClickatronImageJobPlan({ ...base, aspectRatio: "4:5" });
    expect(plan.aspectRatio).toBe("4:5");
  });

  it("carries no metadata when no sourceContext is supplied (plain image job)", () => {
    const { sourceContext: _sc, ...noContext } = base;
    const plan = buildClickatronImageJobPlan(noContext);
    expect(plan.metadata).toBeUndefined();
    expect(plan.taskFields.metadata).toBeUndefined();
    expect(plan.jobDataBase.metadata).toBeUndefined();
  });

  it("passes the prompt through to task, variation, and job unchanged", () => {
    const plan = buildClickatronImageJobPlan(base);
    expect(plan.taskFields.details.videoIdea).toBe(base.prompt);
    expect(plan.taskFields.details.canvas.variations[0].prompt).toBe(base.prompt);
    expect(plan.jobDataBase.prompt).toBe(base.prompt);
  });
});
