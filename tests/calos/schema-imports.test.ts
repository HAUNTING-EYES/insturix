import { describe, expect, it } from "vitest";

function ensureMongoEnv() {
  process.env.MONGODB_URI ??= "mongodb://127.0.0.1/test";
  process.env.MONGODB_DB_NAME ??= "test";
}

describe("CalOS schema modules", () => {
  it("load under the app ESM runtime", async () => {
    ensureMongoEnv();

    const [
      { default: CalosCampaign },
      { default: CalosDeliverable },
      { default: CalosScheduledPublish },
    ] = await Promise.all([
      import("@/schemas/calos-campaign"),
      import("@/schemas/calos-deliverable"),
      import("@/schemas/calos-scheduled-publish"),
    ]);

    expect(CalosCampaign.modelName).toBe("CalosCampaign");
    expect(CalosDeliverable.modelName).toBe("CalosDeliverable");
    expect(CalosScheduledPublish.modelName).toBe("CalosScheduledPublish");
  });

  it("validates the campaign payload sent by the create form", async () => {
    ensureMongoEnv();
    const { default: CalosCampaign } = await import("@/schemas/calos-campaign");

    const campaign = new CalosCampaign({
      ownerUserId: "user_1",
      brandId: "default",
      name: "Q3 launch",
      objective: "awareness",
      theme: "",
      cadenceRules: [
        { platform: "linkedin", perWeek: 3, preferredDays: [1, 3, 5] },
      ],
      startDate: null,
      endDate: null,
    });

    await expect(campaign.validate()).resolves.toBeUndefined();
  });
});