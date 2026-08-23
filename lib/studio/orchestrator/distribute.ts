/**
 * Studio orchestrator — DISTRIBUTE capability (Phase 4).
 *
 * v1 runs the REAL cadence suggestion (pure lib function over the brand's
 * niche) and renders it as a plan step + receipt. Queueing/publishing stays
 * behind the confirm gate — this executor never publishes.
 */

import { suggestCadence } from "@/lib/calos/cadence-suggest";
import { listUnifiedBrands } from "@/lib/shared/brand-registry";
import { listAuthorizedBrandScopes } from "@/lib/shared/brand-scope";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";
import { DISTRIBUTE_DOMAIN_MANIFEST } from "./manifests/distribute";

const TOOL = (name: string) => {
  const tool = DISTRIBUTE_DOMAIN_MANIFEST.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`distribute manifest missing tool: ${name}`);
  return tool;
};

export interface DistributeTurnContext {
  userId: string;
  orgId: string | null;
  brandId?: string | null;
}

export async function* runDistributeTurn(ctx: DistributeTurnContext, text: string): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  const cadence = TOOL("cadence-suggest");
  yield { type: "turn.received", turnId, deliverableId: "del_live" };
  yield {
    type: "turn.plan",
    turnId,
    planId: `${turnId}_p`,
    summary: "Planning the week — cadence first, nothing publishes without you.",
    steps: [{ stepId: "d1", capability: "distribute", toolName: cadence.name, label: cadence.label, riskLevel: cadence.riskLevel }],
  };

  yield { type: "step.start", turnId, stepId: "d1", toolName: cadence.name };

  let brandId = ctx.brandId ?? null;
  if (!brandId) {
    const scopes = await listAuthorizedBrandScopes({ userId: ctx.userId, orgId: ctx.orgId });
    brandId = scopes[0]?.brandId ?? null;
  }
  if (!brandId) {
    yield {
      type: "turn.capability_gap",
      turnId,
      reason: "No brand set up — cadence is brand-grounded.",
      alternative: { description: "Create a brand in the vault first, then ask again.", proposedSteps: [] },
    };
    return;
  }

  const brands = await listUnifiedBrands(ctx.userId);
  const brand = brands.find((b) => b.brandId === brandId) ?? null;
  const suggestion = suggestCadence(brand);
  const mix = suggestion.rules.map((r) => `${r.platform} ${r.perWeek}x/wk`).join(" · ");

  yield {
    type: "step.done",
    turnId,
    stepId: "d1",
    receipt: { label: cadence.receiptLabel, detail: mix, artifactIds: [], creditsConsumed: 0 },
  };
  yield {
    type: "turn.done",
    turnId,
    summary: `Cadence for the week: ${mix}. ${suggestion.rationale} Nothing queues until you confirm a schedule.`,
    creditsConsumedTotal: 0,
    artifactIds: [],
    stageFocus: null,
  };
  void text;
}
