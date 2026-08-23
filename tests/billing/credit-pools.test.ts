/**
 * Two-pool credit system guards.
 *
 * The wallet has two independent pools: MAIN (everyday workflow) and MEDIA
 * (image/video/audio generation, granted on top of the plan). These tests pin:
 *  - the action -> pool classifier (getCreditPool / MEDIA_POOL_ACTIONS)
 *  - the per-plan media allocations
 *  - that every media action is actually a configured cost (no typos in the set)
 *  - source-level: deduct/grant/expire/refund/topup all route by pool
 *
 * Source-level idiom matches razorpay-idempotency.test.ts — a future edit that
 * de-routes a pool (e.g. reverts deduct to a single hard-coded field) fails here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CREDIT_COSTS,
  CREDIT_PACKAGES,
  CREDITS_PER_USD,
  MEDIA_POOL_ACTIONS,
  PLAN_MEDIA_CREDIT_ALLOCATIONS,
  getCreditPool,
  getPackagePool,
  getPlanMediaCreditAllocation,
} from "@/lib/config/creditCosts";

const read = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("credit pool classifier", () => {
  it("routes AI media generation to the media pool", () => {
    expect(getCreditPool("clickatron", "variation")).toBe("media");
    expect(getCreditPool("thinkforge", "image_generation")).toBe("media");
    expect(getCreditPool("musitron", "music_generation")).toBe("media");
    expect(getCreditPool("pipeline", "video_generation")).toBe("media");
    expect(getCreditPool("pipeline", "voiceover_generation")).toBe("media");
    expect(getCreditPool("pipeline", "bgm_generation")).toBe("media");
    expect(getCreditPool("pipeline", "sfx_generation")).toBe("media");
    expect(getCreditPool("pipeline", "storyboard_image_generation")).toBe("media");
    expect(getCreditPool("pipeline", "reference_image")).toBe("media");
  });

  it("routes everyday workflow to the main pool", () => {
    expect(getCreditPool("editron", "ai_chat")).toBe("main");
    expect(getCreditPool("editron", "render_export")).toBe("main");
    expect(getCreditPool("editron", "auto_edit_analysis")).toBe("main");
    expect(getCreditPool("editron", "asset_analysis")).toBe("main");
    expect(getCreditPool("thinkforge", "chat_message")).toBe("main");
    expect(getCreditPool("thinkforge", "document_creation")).toBe("main");
    expect(getCreditPool("alyzitron", "transcription")).toBe("main");
    expect(getCreditPool("calos", "ai_plan")).toBe("main");
    expect(getCreditPool("brand_vault", "brand_scan")).toBe("main");
    expect(getCreditPool("uploaderx", "platform_publish")).toBe("main");
    // Orchestration/assembly steps are main, not media generation.
    expect(getCreditPool("pipeline", "storyboard_finalize")).toBe("main");
    expect(getCreditPool("pipeline", "script_import")).toBe("main");
  });

  it("defaults unknown actions to the main pool (fail-safe)", () => {
    expect(getCreditPool("nonexistent", "whatever")).toBe("main");
  });

  it("every MEDIA_POOL_ACTIONS entry is a real configured cost (no typos)", () => {
    const configured = new Set<string>();
    for (const configs of Object.values(CREDIT_COSTS)) {
      for (const c of configs) configured.add(`${c.service}.${c.action}`);
    }
    for (const key of MEDIA_POOL_ACTIONS) {
      expect(configured.has(key), `media action "${key}" is not in CREDIT_COSTS`).toBe(true);
    }
  });
});

describe("plan media allocations (monthly welcome sample; rest is recharge)", () => {
  it("grants a small media sample on top of the main pool", () => {
    expect(getPlanMediaCreditAllocation("agency_starter")).toBe(300);
    expect(getPlanMediaCreditAllocation("agency_growth")).toBe(900);
    expect(getPlanMediaCreditAllocation("agency_scale")).toBe(1500);
  });

  it("normalizes plan names with spaces and the ' Plan' suffix", () => {
    expect(getPlanMediaCreditAllocation("Agency Scale Plan")).toBe(1500);
  });

  it("free and retired legacy plans get zero media (main pool only)", () => {
    expect(getPlanMediaCreditAllocation("free")).toBe(0);
    expect(getPlanMediaCreditAllocation("plus")).toBe(0);
    expect(getPlanMediaCreditAllocation("pro")).toBe(0);
    expect(getPlanMediaCreditAllocation("premium")).toBe(0);
    expect(PLAN_MEDIA_CREDIT_ALLOCATIONS.free).toBe(0);
  });

  it("defaults unknown plans to zero media", () => {
    expect(getPlanMediaCreditAllocation("mystery_plan")).toBe(0);
  });
});

describe("media recharge packages ($1 = 30 credits, never expire)", () => {
  const mediaPacks = CREDIT_PACKAGES.filter((p) => p.pool === "media");

  it("exposes media recharge packages that route to the media pool", () => {
    expect(mediaPacks.length).toBeGreaterThan(0);
    for (const pack of mediaPacks) {
      expect(getPackagePool(pack.id)).toBe("media");
      // Priced at the $1 = 30 credit rate.
      expect(pack.credits).toBe(pack.prices.USD * CREDITS_PER_USD);
    }
  });

  it("routes main/workflow packages to the main pool by default", () => {
    for (const pack of CREDIT_PACKAGES.filter((p) => p.pool !== "media")) {
      expect(getPackagePool(pack.id)).toBe("main");
    }
    expect(getPackagePool("topup_150")).toBe("main");
    expect(getPackagePool("unknown_pack")).toBe("main"); // fail-safe default
  });

  it("wires media-pool routing into the purchase grant sites", () => {
    const verify = read("app/api/user/credits/verify/route.ts");
    const webhook = read("app/api/webhooks/razorpay/route.ts");
    expect(verify).toContain("getPackagePool");
    expect(verify).toContain("pool: creditPackage.pool");
    expect(webhook).toContain("pool: getPackagePool(packageId)");
  });
});

describe("creditsService pool routing (source-level)", () => {
  const src = read("lib/services/creditsService.ts");

  it("deduct routes to the pool selected by getCreditPool", () => {
    expect(src).toContain("const pool = getCreditPool(service, action)");
    expect(src).toContain("const fields = POOL_FIELDS[pool]");
    // Atomic guard + inc use the pool's dynamic field paths, not hard-coded ones.
    expect(src).toContain("const subPath = `creditsBalance.${fields.subscription}`");
    expect(src).toContain("[subPath]: -fromSubscription");
    expect(src).toContain("$ifNull");
  });

  it("grant tops up BOTH pools atomically", () => {
    expect(src).toContain("getPlanMediaCreditAllocation(planType)");
    expect(src).toContain("'creditsBalance.mediaCredits': mediaAllocation");
    expect(src).toContain("'creditsBalance.mediaCreditsExpiry': expiry");
  });

  it("expiry clears BOTH pools' subscription balances", () => {
    expect(src).toContain("'creditsBalance.mediaCredits': 0");
    expect(src).toContain("'creditsBalance.mediaCreditsExpiry': null");
  });

  it("refund routes back to the originating pool", () => {
    expect(src).toContain("const subscriptionPath = `creditsBalance.${POOL_FIELDS[pool].subscription}`");
    expect(src).toContain("const topupPath = `creditsBalance.${POOL_FIELDS[pool].topup}`");
    expect(src).toContain("[subscriptionPath]: fromSubscription");
    expect(src).toContain("[topupPath]: fromTopup");
  });

  it("top-up can target a specific pool", () => {
    expect(src).toContain("const topupPath = `creditsBalance.${POOL_FIELDS[pool].topup}`");
    expect(src).toContain("[topupPath]: amount");
  });

  it("balance info exposes both pools", () => {
    expect(src).toContain("totalMediaCredits");
    expect(src).toContain("mediaCredits,");
  });
});
