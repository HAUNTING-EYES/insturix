/**
 * Studio orchestrator — WRITE capability (Phase 2).
 *
 * Runs a real turn against ThinkForge, server-side, emitting contract-typed
 * StudioTurnEvents. Mirrors the ThinkForge chat route's admission sequence
 * exactly (brand scope → session → migration → wallet → credits →
 * setActiveGeneration → processChat) so billing, single-flight, and refund
 * semantics are identical to production paths.
 *
 * The planner owns intent routing and step framing ONLY — final content form
 * belongs to the engine agents (AGENTS.md §12).
 */

import { processChat } from "@/lib/thinkforge/services/chat-service";
import * as db from "@/lib/thinkforge/services/db";
import { checkCredits } from "@/lib/services/creditsMiddleware";
import { CreditsMigrationService } from "@/lib/services/creditsMigrationService";
import { getCreditCost } from "@/lib/config/creditCosts";
import { resolveContextBillingOwner } from "@/lib/editron/services/project-ownership";
import { isOrgWalletBillingEnabled } from "@/lib/services/org-wallet-flag";
import { authorizeBrandScope, listAuthorizedBrandScopes } from "@/lib/shared/brand-scope";
import { createThinkForgeSessionBrandBinding } from "@/lib/thinkforge/context/brand-authoring-context";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";
import type { StudioArtifact } from "@/lib/studio/contracts/objects";
import { WRITE_DOMAIN_MANIFEST } from "./manifests/write";
import { createIdeasAgent } from "@/lib/thinkforge/agents/ideas-agent";
import { buildThinkForgeEditorialPlan } from "@/lib/thinkforge/agents/editorial-plan";
import { resolveContentSignalProfile } from "@/lib/thinkforge/signals";

const WRITE_TOOL = (name: string) => {
  const tool = WRITE_DOMAIN_MANIFEST.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`write manifest missing tool: ${name}`);
  return tool;
};

export interface WriteTurnContext {
  userId: string;
  orgId: string | null;
  isOrgAdmin: boolean;
  deliverableTitle: string;
  brandId?: string | null;
  /** set after the first turn so follow-ups land in the same ThinkForge session */
  thinkforgeSessionId?: string | null;
}

/** Mutable turn state the route keeps between turns of one studio session. */
export interface WriteTurnState {
  thinkforgeSessionId: string | null;
  scriptId: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface EngineFrame {
  event?: string;
  data?: unknown;
}

/** Parse ThinkForge's SSE frames (`id:/event:/data:` blocks) from its stream. */
async function* engineFrames(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<EngineFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const frame: EngineFrame = {};
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event:")) frame.event = line.slice(6).trim();
          else if (line.startsWith("data:")) {
            const raw = line.slice(5).trim();
            try {
              frame.data = JSON.parse(raw);
            } catch {
              frame.data = raw;
            }
          }
        }
        if (frame.event) yield frame;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function scriptToArtifact(sessionId: string, script: { scriptId: string; title?: string; content?: string }): StudioArtifact {
  const nowIso = new Date().toISOString();
  return {
    id: `art_tf_${script.scriptId}`,
    kind: "script",
    status: "done",
    title: script.title?.trim() || "Draft",
    sourceRef: { engine: "thinkforge", externalId: `${sessionId}:${script.scriptId}`, manualHref: null },
    contentMarkdown: script.content ?? "",
    revisions: [],
    updatedAt: nowIso,
    createdAt: nowIso,
  };
}

export async function* runWriteTurn(
  ctx: WriteTurnState & WriteTurnContext,
  text: string,
  signal?: AbortSignal,
): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  yield { type: "turn.received", turnId, deliverableId: "del_live" };

  /* plan metadata comes from the write domain manifest — never inlined */
  const mFormat = WRITE_TOOL("inferOutputFormat");
  const mSession = WRITE_TOOL("thinkforge/session");
  const mWriter = WRITE_TOOL("post-writer-agent");
  const writerCost = getCreditCost("thinkforge", "chat_message");

  yield {
    type: "turn.plan",
    turnId,
    planId: `${turnId}_p`,
    summary: ctx.thinkforgeSessionId ? "Continuing the draft." : "Writing it — one document, on brand.",
    steps: [
      { stepId: "w1", capability: "write", toolName: mFormat.name, label: mFormat.label, riskLevel: mFormat.riskLevel },
      { stepId: "w2", capability: "write", toolName: mSession.name, label: ctx.thinkforgeSessionId ? "Opened the doc" : "Opened a new doc", riskLevel: mSession.riskLevel },
      { stepId: "w3", capability: "write", toolName: mWriter.name, label: mWriter.label, riskLevel: mWriter.riskLevel, quotedCost: writerCost },
    ],
  };

  /* step 1 — format resolution is the engine's job; surfaced as a read step */
  yield { type: "step.start", turnId, stepId: "w1", toolName: mFormat.name };
  await sleep(350);
  yield { type: "step.done", turnId, stepId: "w1", receipt: { label: mFormat.receiptLabel, detail: "from the brief", artifactIds: [], creditsConsumed: 0 } };

  /* Minimal format routing: the engine requires a confirmed authoring
   * request; the orchestrator infers the writer kind from the ask. Full
   * signal-driven routing is the engine's resolver, not ours. */
  const wantsVideo = /\b(reels?|video|script|explainer|shorts)\b/i.test(text);
  const authoringRequest = wantsVideo
    ? {
        version: 1,
        contentContract: { version: 1, documentKind: "script", outputKind: "video_script", artifactType: "screenplay" } as const,
        platformSurface: { id: "instagram" } as const,
        publishingSurface: "instagram_reels" as const,
      }
    : {
        version: 1,
        contentContract: { version: 1, documentKind: "post", outputKind: "social_post", artifactType: "social_post" } as const,
        platformSurface: { id: "instagram" } as const,
        publishingSurface: "instagram_feed" as const,
        postControls: { version: 1, cta: { preference: "editorial" }, hashtags: { preference: "editorial" }, emoji: { preference: "editorial" } } as const,
      };

  /* ideation intent — the REAL ideas agent, no session needed */
  if (/(give me \d? ?ideas?|brainstorm|ideas for)/i.test(text)) {
    yield { type: "step.start", turnId, stepId: "w2", toolName: "ideas-agent", loadingMessage: "thinking up angles…" };
    let brandIdI = ctx.brandId ?? null;
    if (!brandIdI) {
      const scopes = await listAuthorizedBrandScopes({ userId: ctx.userId, orgId: ctx.orgId });
      brandIdI = scopes[0]?.brandId ?? null;
    }
    if (!brandIdI) {
      yield { type: "turn.capability_gap", turnId, reason: "No brand set up — ideas are brand-grounded.", alternative: { description: "Create a brand in the vault first, then ask again.", proposedSteps: [] } };
      return;
    }
    await CreditsMigrationService.ensureMigrated(ctx.userId);
    const walletI = resolveContextBillingOwner(ctx.userId, ctx.orgId, isOrgWalletBillingEnabled());
    const checkI = await checkCredits(ctx.userId, "thinkforge", "chat_message", {}, walletI);
    if (!checkI.allowed) {
      yield { type: "turn.error", turnId, message: "Not enough credits for ideation.", retryable: false, refundIssued: false };
      return;
    }
    let deductedI: { transactionId: string } | null = null;
    try {
      deductedI = await checkI.deduct();
      const signalProfile = resolveContentSignalProfile({ userPrompt: text, authoringRequest, brandId: brandIdI });
      const editorialPlan = buildThinkForgeEditorialPlan({ userPrompt: text, authoringRequest, authorizedFactIds: [], sourceLedgerEntryIds: [] });
      const ideas = await createIdeasAgent().generateIdeas(text, { authoringRequest, editorialPlan, brandId: brandIdI });
      yield {
        type: "step.done",
        turnId,
        stepId: "w2",
        receipt: { label: "Ideas generated", detail: `${ideas.length} angles`, riskLevel: "medium", artifactIds: [], creditsConsumed: getCreditCost("thinkforge", "chat_message") },
      };
      yield {
        type: "turn.ideas",
        turnId,
        ideas: ideas.map((i, n) => ({ id: i.id ?? `idea_${n + 1}`, idea: i.idea, purpose: i.purpose, style: i.style, tone: i.tone })),
      };
      yield { type: "turn.done", turnId, summary: "Four angles — pick one and I'll draft it on brand.", creditsConsumedTotal: getCreditCost("thinkforge", "chat_message"), artifactIds: [] };
    } catch (error) {
      if (deductedI) await checkI.refund(`ideation failed: ${error instanceof Error ? error.message : "unknown"}`);
      yield { type: "turn.error", turnId, message: error instanceof Error ? error.message : "ideation failed", retryable: true, refundIssued: Boolean(deductedI) };
    }
    return;
  }

  /* step 2 — brand scope + session */
  yield { type: "step.start", turnId, stepId: "w2", toolName: mSession.name };
  let brandId = ctx.brandId ?? null;
  try {
    if (!brandId) {
      const scopes = await listAuthorizedBrandScopes({ userId: ctx.userId, orgId: ctx.orgId });
      brandId = scopes[0]?.brandId ?? null;
    } else {
      await authorizeBrandScope({ userId: ctx.userId, orgId: ctx.orgId, isOrgAdmin: ctx.isOrgAdmin, brandId });
    }
  } catch {
    yield {
      type: "turn.capability_gap",
      turnId,
      reason: "Brand context unavailable — the selected brand has no accepted profile right now.",
      alternative: { description: "Pick another brand in the switcher, or rescan the brand in the vault, then ask again.", proposedSteps: [] },
    };
    return;
  }
  if (!brandId) {
    yield {
      type: "turn.capability_gap",
      turnId,
      reason: "No brand is set up yet — writing is brand-grounded by design.",
      alternative: { description: "Create a brand in the vault first (a website URL is enough), then come back and just ask again.", proposedSteps: [] },
    };
    return;
  }

  const session = await db.getOrCreateSession(
    ctx.userId,
    ctx.thinkforgeSessionId ?? undefined,
    {
      projectName: ctx.deliverableTitle,
      brandBinding: createThinkForgeSessionBrandBinding({ brandId, orgId: ctx.orgId }),
      authoringRequest,
    },
    ctx.orgId,
  );
  const sessionId = session._id;
  if (!sessionId) throw new Error("ThinkForge session could not be resolved.");
  ctx.thinkforgeSessionId = sessionId;
  await sleep(250);
  yield { type: "step.done", turnId, stepId: "w2", receipt: { label: mSession.receiptLabel, detail: brandId, artifactIds: [], creditsConsumed: 0 } };

  /* step 3 — admission (mirrors the ThinkForge chat route) + generation */
  yield { type: "step.start", turnId, stepId: "w3", toolName: mWriter.name, loadingMessage: mWriter.loadingMessages[0] };
  await CreditsMigrationService.ensureMigrated(ctx.userId);
  const billingWallet = resolveContextBillingOwner(ctx.userId, ctx.orgId, isOrgWalletBillingEnabled());
  const creditCheck = await checkCredits(ctx.userId, "thinkforge", "chat_message", { taskId: ctx.thinkforgeSessionId }, billingWallet);
  if (!creditCheck.allowed) {
    yield {
      type: "turn.error",
      turnId,
      message: "Not enough credits for this turn.",
      retryable: false,
      refundIssued: false,
    };
    return;
  }

  let admitted = false;
  let deduction: { transactionId: string } | null = null;
  try {
    deduction = await creditCheck.deduct();
    const generationId = `gen_${crypto.randomUUID()}`;
    const now = new Date();
    admitted = await db.setActiveGeneration(ctx.thinkforgeSessionId, ctx.userId, {
      id: generationId,
      type: "chat",
      status: "running",
      intent: "chat_request",
      progress: 0,
      message: "Request accepted",
      startedAt: now,
      updatedAt: now,
      billing: {
        transactionId: deduction.transactionId,
        userId: ctx.userId,
        amount: getCreditCost("thinkforge", "chat_message"),
        service: "thinkforge",
        action: "chat_message",
        status: "reserved",
        updatedAt: now,
        billedWallet: billingWallet,
      },
    });
    if (!admitted) throw new Error("This session is finishing another generation. Please retry in a moment.");

    const existingScript = ctx.scriptId ? await db.getScript(ctx.thinkforgeSessionId, ctx.scriptId) : null;
    /* ChatRequest requires a non-empty scriptId; a fresh one lets processChat
     * create the document (its script_created path). */
    const scriptId = existingScript?.scriptId ?? ctx.scriptId ?? crypto.randomUUID();
    ctx.scriptId = scriptId;
    const stream = await processChat({
      sessionId: ctx.thinkforgeSessionId,
      orgId: ctx.orgId ?? undefined,
      isOrgAdmin: ctx.isOrgAdmin,
      prompt: text,
      userId: ctx.userId,
      script: existingScript ?? undefined,
      scriptId,
      generationId,
      authoringContext: undefined,
      abortSignal: signal,
    });

    let tokenCount = 0;
    let lastProgressAt = 0;
    for await (const frame of engineFrames(stream, signal)) {
      if (frame.event === "token") {
        tokenCount++;
        if (Date.now() - lastProgressAt > 600) {
          lastProgressAt = Date.now();
          yield { type: "step.progress", turnId, stepId: "w3", stage: `writing · ${tokenCount} tokens`, percent: null };
        }
      } else if (frame.event === "progress" || frame.event === "thinking" || frame.event === "intent") {
        const stage = typeof frame.data === "object" && frame.data && "message" in (frame.data as Record<string, unknown>)
          ? String((frame.data as Record<string, unknown>).message)
          : frame.event;
        yield { type: "step.progress", turnId, stepId: "w3", stage, percent: null };
      } else if (frame.event === "script_created" && frame.data && typeof frame.data === "object") {
        const created = frame.data as { scriptId?: string };
        if (created.scriptId) ctx.scriptId = created.scriptId;
      } else if (frame.event === "error") {
        const message = typeof frame.data === "object" && frame.data && "message" in (frame.data as Record<string, unknown>)
          ? String((frame.data as Record<string, unknown>).message)
          : "The writer failed.";
        throw new Error(message);
      }
      // `done` falls through — script fetch below is authoritative
    }

    /* authoritative read-back from the engine's own store */
    const finalScriptId = ctx.scriptId ?? (await db.listScripts(ctx.thinkforgeSessionId))[0]?.scriptId ?? null;
    if (!finalScriptId) throw new Error("Generation finished but no document was stored.");
    ctx.scriptId = finalScriptId;
    const script = await db.getScript(ctx.thinkforgeSessionId, finalScriptId);
    const artifact = script ? scriptToArtifact(ctx.thinkforgeSessionId, script) : null;
    const wordCount = script?.content?.trim().split(/\s+/).length ?? 0;

    yield {
      type: "step.done",
      turnId,
      stepId: "w3",
      receipt: {
        label: mWriter.receiptLabel,
        detail: `${wordCount} words · v${script?.version ?? 1}`,
        artifactIds: artifact ? [artifact.id] : [],
        creditsConsumed: getCreditCost("thinkforge", "chat_message"),
      },
    };
    yield {
      type: "turn.done",
      turnId,
      summary: artifact ? `Draft's ready — ${wordCount} words, showing it. Keep talking to reshape it.` : "Draft's ready.",
      creditsConsumedTotal: getCreditCost("thinkforge", "chat_message"),
      artifactIds: artifact ? [artifact.id] : [],
      artifactPayload: artifact ?? null,
      stageFocus: artifact ? { artifactId: artifact.id, why: "just written" } : null,
    };
  } catch (error) {
    if (deduction) await creditCheck.refund(`studio write turn failed: ${error instanceof Error ? error.message : "unknown"}`);
    yield {
      type: "turn.error",
      turnId,
      message: error instanceof Error ? error.message : "The turn failed.",
      retryable: true,
      refundIssued: Boolean(deduction),
    };
  }
}
