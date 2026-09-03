/**
 * Studio orchestrator — SOCIALIZE low-risk commands (§17 Phase 9): update
 * the brand's public profile status/bio straight from the Project
 * conversation. Low-risk by design: one reversible text field, no spend, no
 * publish. Authority is the Brand Vault scope (same as the profile route);
 * if the brand has no public page yet the turn says so instead of creating
 * a half-profile (a username claim is a deliberate act in Brands).
 */

import Socialize from "@/schemas/Socialize";
import { getProject } from "@/lib/studio/persist/db";
import { listAuthorizedBrandScopes } from "@/lib/shared/brand-scope";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";

export interface SocializeTurnContext {
  userId: string;
  orgId: string | null;
  brandId?: string | null;
  projectId: string | null;
}

export function socializeCommandIntent(text: string): boolean {
  return /\b(set|update|change)\s+(my\s+|the\s+)?(status|bio)\b/i.test(text);
}

const FIELD_RE = /\b(status|bio)\b\s*(?:to|:|-)?\s*([\s\S]+)$/i;

export async function* runSocializeCommandTurn(ctx: SocializeTurnContext, text: string): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  yield { type: "turn.received", turnId, deliverableId: "del_live" };

  const match = FIELD_RE.exec(text);
  const field = match?.[1]?.toLowerCase() === "bio" ? "bio" : "status";
  const value = match?.[2]?.trim().slice(0, field === "bio" ? 256 : 50) ?? "";

  let brandId = ctx.brandId ?? null;
  if (!brandId && ctx.projectId) {
    const project = await getProject(ctx.projectId);
    brandId = project?.brandId ?? null;
  }
  if (!brandId) {
    yield { type: "turn.capability_gap", turnId, reason: "This project has no brand — the public page is brand-grounded.", alternative: { description: "Create a brand in the vault first.", proposedSteps: [] } };
    return;
  }

  const scopes = await listAuthorizedBrandScopes({ userId: ctx.userId, orgId: ctx.orgId });
  const scope = scopes.find((s) => s.brandId === brandId);
  if (!scope) {
    yield { type: "turn.error", turnId, message: "you're not authorized on this brand's vault scope", retryable: false, refundIssued: false };
    return;
  }

  const existing = (await Socialize.findOne({ brandId }).lean()) as unknown as { username?: string } | null;
  if (!existing?.username) {
    yield { type: "turn.done", turnId, summary: `${scope.brandName} has no public page yet — claim a username in the Brands place first, then status updates land from chat.`, creditsConsumedTotal: 0, artifactIds: [] };
    return;
  }
  if (!value) {
    yield { type: "turn.done", turnId, summary: `Say it like "set my status to shipping" or "set my bio to launch content weekly" — the ${field} goes live on /profile/${existing.username} the moment you do.`, creditsConsumedTotal: 0, artifactIds: [] };
    return;
  }

  await Socialize.updateOne({ brandId }, { $set: { [field]: value } });
  yield {
    type: "turn.done",
    turnId,
    summary: `${field === "status" ? "Status" : "Bio"} live on /profile/${existing.username} — "${value}"${field === "status" ? "" : ""}. Change it any time, here or in Brands.`,
    creditsConsumedTotal: 0,
    artifactIds: [],
  };
}
