/**
 * Studio orchestrator — DISTRIBUTE capability (Phase 4c).
 *
 * v2: cadence suggestion (real) → the PUBLISH hard gate (quote-less
 * confirm via the continuation pattern) → on accept, queues real CalOS
 * deliverables. Nothing auto-publishes: queued cards still ride CalOS's
 * own approval-before-publish cron safety.
 */

import { suggestCadence } from "@/lib/calos/cadence-suggest";
import { listUnifiedBrands } from "@/lib/shared/brand-registry";
import { listAuthorizedBrandScopes } from "@/lib/shared/brand-scope";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";
import type { StudioArtifact } from "@/lib/studio/contracts/objects";
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
  forwardHeaders: Record<string, string>;
  origin: string;
}

const PLATFORM_ASPECT: Record<string, string> = {
  linkedin: "1:1",
  instagram: "4:5",
  tiktok: "9:16",
  youtube: "16:9",
  twitter: "16:9",
};

function nextWeekdayISO(weekday: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + (((weekday - d.getDay()) + 7) % 7 || 7));
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function scheduleArtifact(deliverableIds: string[]): StudioArtifact {
  const nowIso = new Date().toISOString();
  return {
    id: `art_cal_${deliverableIds[0]?.slice(0, 8) ?? Date.now()}`,
    kind: "schedule",
    status: "done",
    title: "Schedule",
    sourceRef: { engine: "calos", externalId: deliverableIds.join(","), manualHref: "/dashboard/calos" },
    revisions: [],
    updatedAt: nowIso,
    createdAt: nowIso,
  };
}

export async function* runDistributeTurn(
  ctx: DistributeTurnContext,
  text: string,
  signal?: AbortSignal,
  confirmAccepted?: boolean,
): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  const cadence = TOOL("cadence-suggest");
  const queue = TOOL("persist-deliverables");
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
    summary: "Planning the week — cadence first, nothing publishes without you.",
    steps: [
      { stepId: "d1", capability: "distribute", toolName: cadence.name, label: cadence.label, riskLevel: cadence.riskLevel },
      { stepId: "d2", capability: "distribute", toolName: queue.name, label: queue.label, riskLevel: queue.riskLevel },
    ],
  };

  yield { type: "step.start", turnId, stepId: "d1", toolName: cadence.name };
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

  /* the PUBLISH hard gate — quote-less confirm via continuation */
  const targets = suggestion.rules.flatMap((rule) =>
    Array.from({ length: Math.min(rule.perWeek, 2) }, (_, i) => ({
      platform: rule.platform,
      scheduledAt: nextWeekdayISO(2 + i * 2, 9 + i * 3),
    })),
  );

  if (!confirmAccepted) {
    yield {
      type: "turn.confirm_required",
      turnId,
      stepId: "d2",
      kind: "publish",
      quote: null,
      publishTargets: targets,
    };
    yield {
      type: "turn.done",
      turnId,
      summary: `Cadence: ${mix}. Confirm on the card to queue the week — nothing publishes by itself.`,
      creditsConsumedTotal: 0,
      artifactIds: [],
    };
    return;
  }

  /* accepted: queue real CalOS deliverables (idea-stage cards; CalOS's own
   * approval-before-publish stays the final gate) */
  yield { type: "step.start", turnId, stepId: "d2", toolName: queue.name, loadingMessage: queue.loadingMessages[0] };
  const createdIds: string[] = [];
  try {
    for (const target of targets) {
      const res = await fetch(new URL("/api/services/calos/deliverables", ctx.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.forwardHeaders },
        body: JSON.stringify({
          brandId,
          title: `${target.platform} post — ${new Date(target.scheduledAt).toLocaleDateString(undefined, { weekday: "short" })}`,
          platform: target.platform,
          plannedDates: [target.scheduledAt],
          editorialStatus: "idea",
          aspectRatio: PLATFORM_ASPECT[target.platform] ?? "1:1",
        }),
        signal,
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const id = (data.id as string) ?? (data.deliverableId as string) ?? (data._id as string);
        if (id) createdIds.push(id);
      }
    }
  } catch (error) {
    yield { type: "turn.error", turnId, message: error instanceof Error ? error.message : "calos bridge failed", retryable: true, refundIssued: false };
    return;
  }

  if (!createdIds.length) {
    yield { type: "turn.error", turnId, message: "calos rejected the queue (check connections)", retryable: true, refundIssued: false };
    return;
  }

  const artifact = scheduleArtifact(createdIds);
  yield {
    type: "step.done",
    turnId,
    stepId: "d2",
    receipt: { label: queue.receiptLabel, detail: `${createdIds.length} cards · idea stage`, artifactIds: [artifact.id], creditsConsumed: 0 },
  };
  yield {
    type: "turn.done",
    turnId,
    summary: `Queued ${createdIds.length} idea cards on the calendar — first one ${new Date(targets[0].scheduledAt).toLocaleString()}. Publishing still needs each card's approval.`,
    creditsConsumedTotal: 0,
    artifactIds: [artifact.id],
    artifactPayload: artifact,
    stageFocus: { artifactId: artifact.id, why: `${createdIds.length} cards queued` },
  };
  void text;
}
