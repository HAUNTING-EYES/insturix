/**
 * Studio orchestrator — DISTRIBUTE capability (Phase 6, §12).
 *
 * v3: "Plan four launch posts for next week" → the user's window + count
 * parsed honestly, slots projected by CalOS's OWN cadence engine
 * (proposeCadenceCards over the brand's suggested rules — never local
 * weekday guesses), and a Plan artifact whose entries are PROPOSALS: a
 * proposed entry is not yet a CalOS card. Only per-entry accepts (the
 * plan-entry route) write idea-stage deliverables via CalOS's single draft
 * write path. Nothing here schedules or publishes anything — CalOS
 * editorial approval stays the only publish authorization.
 */

import { proposeCadenceCards } from "@/lib/calos/cadence";
import { suggestCadence } from "@/lib/calos/cadence-suggest";
import { listUnifiedBrands } from "@/lib/shared/brand-registry";
import { listAuthorizedBrandScopes } from "@/lib/shared/brand-scope";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";
import type { StudioArtifact } from "@/lib/studio/contracts/objects";
import { DISTRIBUTE_DOMAIN_MANIFEST } from "./manifests/distribute";
import { parsePlanWindow } from "./distribute-plan";

const TOOL = (name: string) => {
  const tool = DISTRIBUTE_DOMAIN_MANIFEST.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`distribute manifest missing tool: ${name}`);
  return tool;
};

export interface DistributeTurnContext {
  userId: string;
  orgId: string | null;
  brandId?: string | null;
  /** the user's wall-clock zone (IANA), when the client sent it — "next
   *  week" computes in THEIR Monday, not UTC */
  timezone?: string | null;
  forwardHeaders: Record<string, string>;
  origin: string;
}

function planArtifact(turnId: string, entries: Array<{ id: string; platform: string; scheduledAt: string; title: string }>, mix: string): StudioArtifact {
  const nowIso = new Date().toISOString();
  return {
    id: `art_plan_${turnId}`,
    kind: "plan",
    status: "done",
    title: "Week plan",
    sourceRef: { engine: "calos", externalId: turnId, manualHref: null },
    progress: { stage: mix, percent: null },
    planEntries: entries,
    revisions: [],
    updatedAt: nowIso,
    createdAt: nowIso,
  };
}

export async function* runDistributeTurn(
  _ctx: DistributeTurnContext,
  text: string,
  _signal?: AbortSignal,
  _confirmAccepted?: boolean,
): AsyncGenerator<StudioTurnEvent> {
  const ctx = _ctx;
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  const cadence = TOOL("cadence-suggest");
  yield { type: "turn.received", turnId, deliverableId: "del_live" };

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

  yield {
    type: "turn.plan",
    turnId,
    planId: `${turnId}_p`,
    summary: "Planning the week on your brand's cadence — proposals first, nothing is written until you accept entries.",
    steps: [{ stepId: "d1", capability: "distribute", toolName: cadence.name, label: cadence.label, riskLevel: cadence.riskLevel }],
  };

  yield { type: "step.start", turnId, stepId: "d1", toolName: cadence.name };
  const brands = await listUnifiedBrands(ctx.userId);
  const brand = brands.find((b) => b.brandId === brandId) ?? null;
  const suggestion = suggestCadence(brand);
  const mix = suggestion.rules.map((r) => `${r.platform} ${r.perWeek}x/wk`).join(" · ");

  /* §12: CalOS owns dates and cadence — the slots come from its projector,
   * capped to the user's stated count when they named one */
  const { from, to, count } = parsePlanWindow(text, new Date(), ctx.timezone);
  let proposals = proposeCadenceCards(suggestion.rules, { from, to });
  if (count !== null) proposals = proposals.slice(0, count);
  if (proposals.length === 0) {
    yield {
      type: "turn.needs_clarification",
      turnId,
      question: `Your cadence (${mix}) has no free slot in that window. Widen the dates or adjust the brand's cadence first?`,
      options: [
        { id: "widen", label: "Plan the next two weeks instead" },
        { id: "adjust", label: "Open the brand's cadence settings" },
      ],
    };
    return;
  }

  const entries = proposals.map((p, i) => ({
    id: `pe_${turnId}_${i}`,
    platform: p.platform,
    scheduledAt: p.plannedDates[0] ?? p.date,
    title: p.title,
  }));
  const artifact = planArtifact(turnId, entries, mix);

  yield {
    type: "step.done",
    turnId,
    stepId: "d1",
    receipt: { label: cadence.receiptLabel, detail: `${entries.length} slots projected · ${mix}`, artifactIds: [artifact.id], creditsConsumed: 0 },
  };
  yield {
    type: "turn.done",
    turnId,
    summary: `${entries.length} slots on the board — ${mix}. Accept the ones you want; each accepted entry becomes a CalOS card. Nothing is scheduled or published by this.`,
    creditsConsumedTotal: 0,
    artifactIds: [artifact.id],
    artifactPayload: artifact,
    stageFocus: { artifactId: artifact.id, why: `${entries.length} slots proposed` },
  };
}
