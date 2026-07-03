/**
 * Razorpay billing-safety regression guards.
 *
 * These are SOURCE-LEVEL assertions (the same idiom as credit-costs.test.ts): they fail
 * if a future edit removes an idempotency guard, re-introduces client-side subscription
 * activation, reverts the signature order, or de-idempotents the plan seed. True live
 * replay-safety is additionally proven by the Razorpay sandbox replay (deploy checklist).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("razorpay billing safety", () => {
  it("top-up credits are idempotent by Razorpay paymentId", () => {
    const src = read("lib/services/creditsService.ts");
    // Atomic dedup: only increment when no existing top-up txn carries this paymentId.
    expect(src).toMatch(/\$not:\s*\{\s*\$elemMatch:\s*\{\s*type:\s*'topup',\s*'metadata\.paymentId':\s*paymentId/);
    // Duplicate payment resolves to an idempotent no-op, not a second grant.
    expect(src).toContain("duplicate: true");
  });

  it("subscription credit grants are idempotent by billing-event key", () => {
    const src = read("lib/services/creditsService.ts");
    expect(src).toContain("idempotencyKey");
    expect(src).toMatch(/type:\s*'subscription_grant',\s*'metadata\.idempotencyKey':\s*idempotencyKey/);
  });

  it("webhook passes a stable event key to every subscription grant site", () => {
    const src = read("app/api/webhooks/razorpay/route.ts");
    expect(src).toContain("razorpay:subscription_activated:");
    expect(src).toContain("razorpay:subscription_charged:");
    // Every grant call must forward the idempotencyKey. Sites: (1) subscription_activated,
    // (2) renewal-extend on subscription_charged, (3) scheduled plan-change on
    // subscription_charged (a downgrade that Razorpay applies at cycle end).
    const grantCalls = src.match(/grantSubscriptionCredits\([^)]*idempotencyKey/g) || [];
    expect(grantCalls.length).toBe(3);
  });

  it("checkout modal routes plan verify to the pending-only subscription route", () => {
    const src = read("components/shared/BillingPaymentModal.tsx");
    expect(src).toContain("/api/verify-subscription");
    // The buggy client-activation route must not be the plan verify target anymore.
    expect(src).not.toContain("'/api/user/plans/verify'");
  });

  it("deprecated plans/verify no longer client-activates a subscription", () => {
    const src = read("app/api/user/plans/verify/route.ts");
    // No plan/credit mutation from the client path.
    expect(src).not.toContain("planHistory.push");
    expect(src).not.toContain("grantSubscriptionCredits");
    expect(src).not.toMatch(/CreditsService\.addCredits/);
    expect(src).toContain("pending: true");
    // Correct Razorpay subscription signature order.
    expect(src).toContain('razorpay_payment_id + "|" + razorpay_subscription_id');
  });

  it("pending-only verify-subscription uses the official signature order and stays pending", () => {
    const src = read("app/api/verify-subscription/route.ts");
    expect(src).toContain("${razorpay_payment_id}|${razorpay_subscription_id}");
    expect(src).toContain('status: "pending"');
  });

  it("plan seed reuses stored Razorpay plan IDs before creating new ones", () => {
    const src = read("app/api/admin/plans/seed/route.ts");
    // Idempotency anchor is read before any remote plan creation.
    const lookupIdx = src.indexOf("Plan.findOne({ type: planConfig.type })");
    const createIdx = src.indexOf("createPlan(");
    expect(lookupIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(lookupIdx).toBeLessThan(createIdx);
    expect(src).toContain("readExistingProviderId");
    expect(src).toContain("Reusing Razorpay");
    // Legacy plans are retired.
    expect(src).toContain("deactivatedLegacy");
  });

  it("public plans API exposes only free + agency plans", () => {
    const src = read("app/api/plans/route.ts");
    expect(src).toContain("PUBLIC_PLAN_TYPES");
    expect(src).toContain("agency_starter");
    expect(src).not.toMatch(/PUBLIC_PLAN_TYPES\s*=\s*\[[^\]]*"plus"/);
  });
});
