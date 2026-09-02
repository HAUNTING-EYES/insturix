import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { StudioTurnRequestSchema } from "@/lib/studio/contracts/turn";
import { runWriteTurn, type WriteTurnState } from "@/lib/studio/orchestrator/write";
import { runEditTurn } from "@/lib/studio/orchestrator/edit";
import { runDistributeTurn } from "@/lib/studio/orchestrator/distribute";
import { runDesignTurn } from "@/lib/studio/orchestrator/design";
import { runAnalyzeTurn } from "@/lib/studio/orchestrator/analyze";
import { runAutoEditTurn } from "@/lib/studio/orchestrator/auto-edit";
import { appendTurnEvent, claimOperation, connectSpine, getOrCreateProject, markOperation, spineProjectIdOrNull } from "@/lib/studio/persist/db";
import { ensureThreadBootstrapped } from "@/lib/studio/persist/tf-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/studio/turns — the vibe turn protocol over SSE.
 * Flag-gated: set STUDIO_REAL_TURNS=1 to enable. While off, the studio runs
 * on the mock orchestrator (Phase 1) — this keeps default dev/deploys safe.
 *
 * Phase 2 scope: WRITE capability only (ThinkForge). The deliverable is
 * live-scoped: turn state (thinkforge session/script ids) is kept in the
 * client and round-tripped via the request until the Deliverable adapter
 * lands (Phase 6).
 */
export async function POST(req: Request) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }

  const { userId, orgId, has } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = StudioTurnRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }
  const request = parsed.data;

  /* live turn state until the Deliverable adapter persists it — the client
   * round-trips the engine ids via artifact sourceRefs in attachments */
  const state: WriteTurnState = { thinkforgeSessionId: null, scriptId: null };

  /* the spine (Phase 1): resolve or mint the persisted Project for this turn,
   * save the user's message, then persist every streamed event server-side
   * before it is sent — reload reconstructs the conversation from the event
   * log (GET /api/studio/threads/[threadId]/events). Persistence gate: if the
   * project or the first event cannot be saved (after retries), REFUSE the
   * turn — already-saved projects are untouched and the user sees an honest
   * error instead of work that would vanish on reload. Mid-turn failures are
   * the only degrade path: the running work is kept alive and Phase 2
   * receipts reconcile what the log missed. */
  let spineProjectId: string | null = null;
  let spineOperationId: string | null = null;
  try {
    await connectSpine();
    const project = await getOrCreateProject({
      projectId: spineProjectIdOrNull(request.deliverableId),
      organizationId: orgId ?? null,
      brandId: request.brandId ?? null,
      title: request.text.trim().slice(0, 80) || "Studio draft",
    });
    /* old TF sessions: their chat history enters the log BEFORE this turn's
     * first event, so imported and new messages stay in true order */
    await ensureThreadBootstrapped(project.projectId);
    /* idempotency (plan §3): one operationId per logical turn — an in-flight
     * or completed claim is refused (409), so a retry can never charge or
     * publish twice; the confirm answer resumes its own claim. */
    const operationId = request.operationId || `op_${crypto.randomUUID()}`;
    const claim = await claimOperation(project.projectId, operationId, request.text.slice(0, 200), Boolean(request.confirmAcceptedQuoteId));
    if (!claim.ok) {
      return NextResponse.json(
        { error: claim.reason === "in_flight" ? "operation_in_flight" : "operation_already_done", operationId },
        { status: 409 },
      );
    }
    spineOperationId = operationId;
    const firstEvent = await appendTurnEvent(project.projectId, {
      actor: "user",
      kind: "user",
      turnId: null,
      payload: {
        kind: "user",
        id: `u_${Date.now()}`,
        text: request.text,
        attachments: request.attachments,
        mentions: request.mentions ?? [],
        createdAt: new Date().toISOString(),
      },
    });
    if (!firstEvent) {
      return NextResponse.json({ error: "spine_unavailable" }, { status: 503 });
    }
    spineProjectId = project.projectId;
  } catch (error) {
    console.error("[spine] project resolution failed — refusing unrecorded turn", error);
    return NextResponse.json({ error: "spine_unavailable" }, { status: 503 });
  }

  const scriptAttachment = request.attachments.find((a) => a.role === "script");
  if (scriptAttachment) {
    const [sessionId, scriptId] = scriptAttachment.ref.split(":");
    if (sessionId && scriptId) {
      state.thinkforgeSessionId = sessionId;
      state.scriptId = scriptId;
    }
  }
  /* capability dispatch, in priority order:
   * 1. reel attachment → EDIT (the deliverable's reel is the target)
   * 2. schedule/publish keywords → DISTRIBUTE (cadence + gates)
   * 3. default → WRITE */
  const reelAttachment = request.attachments.find((a) => a.role === "reel");
  const editProjectId = reelAttachment?.ref ?? null;
  const wantsDistribute = /\b(schedul|publish|cadence|post it|queue|calendar|week)\b/i.test(request.text) && !editProjectId;
  const wantsDesign = /\b(thumbnail|design|image|visual|carousel|logo|canvas)\b/i.test(request.text) && !editProjectId && !wantsDistribute;
  /* A2: a composer media attachment routes to the auto-edit pipeline
   * (unless a real project is already the target via a reel attachment). */
  const mediaAttachment = request.attachments.find((a) => a.role === "media");
  const wantsAnalyze = /\b(analyz|teardown|score|audit|grade)\b/i.test(request.text) && !editProjectId && !wantsDistribute && !wantsDesign;

  /* forward auth for the engine bridge (same-origin, same Clerk session) */
  const forwardHeaders: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  if (cookie) forwardHeaders.cookie = cookie;
  const authorization = req.headers.get("authorization");
  if (authorization) forwardHeaders.authorization = authorization;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      let opFinal = false; // set when the operation reaches a non-running end state below
      try {
        const events = editProjectId
          ? runEditTurn(
              { userId, orgId: orgId ?? null, projectId: editProjectId, forwardHeaders, origin: new URL(req.url).origin },
              request.text,
              req.signal,
            )
          : mediaAttachment
            ? runAutoEditTurn(
                { userId, orgId: orgId ?? null, assetId: mediaAttachment.ref, assetLabel: mediaAttachment.ref.slice(0, 24), brandId: request.brandId ?? null, forwardHeaders, origin: new URL(req.url).origin },
                request.text,
                req.signal,
              )
          : wantsDistribute
            ? runDistributeTurn({ userId, orgId: orgId ?? null, brandId: request.brandId ?? null, forwardHeaders, origin: new URL(req.url).origin }, request.text, req.signal, request.confirmAccepted)
            : wantsDesign
              ? runDesignTurn({ userId, orgId: orgId ?? null, brandId: request.brandId ?? null, forwardHeaders, origin: new URL(req.url).origin }, request.text, req.signal, request.confirmAcceptedQuoteId)
              : wantsAnalyze
                ? runAnalyzeTurn({ userId, orgId: orgId ?? null, brandId: request.brandId ?? null, forwardHeaders, origin: new URL(req.url).origin }, request.text, req.signal, request.confirmAcceptedQuoteId)
                : runWriteTurn(
                    {
                      userId,
                      orgId: orgId ?? null,
                      isOrgAdmin: Boolean(orgId && has?.({ role: "org:admin" })),
                      deliverableTitle: "Studio draft",
                      brandId: request.brandId ?? null,
                      ...state,
                    },
                    request.text,
                    req.signal,
                  );
        for await (const rawEvent of events) {
          /* the client adopts the spine identity from turn.received — a minted
           * project id (first turn on "live") replaces the del_live placeholder */
          const event =
            spineProjectId && rawEvent.type === "turn.received" ? { ...rawEvent, deliverableId: spineProjectId } : rawEvent;
          if (spineProjectId) {
            await appendTurnEvent(spineProjectId, {
              actor: "system",
              kind: event.type,
              turnId: (event as { turnId?: string }).turnId ?? null,
              payload: event,
            });
          }
          if (event.type === "turn.confirm_required" && spineOperationId) {
            opFinal = true;
            await markOperation(spineOperationId, "awaiting_confirmation");
          }
          send(event);
        }
      } catch (error) {
        /* an abort after a confirm gate is the designed close (the answer
         * resumes the claim) — never overwrite awaiting_confirmation */
        if (spineOperationId && !opFinal) {
          opFinal = true;
          await markOperation(spineOperationId, "error", { error: error instanceof Error ? error.message : "orchestrator crashed" });
        }
        send({
          type: "turn.error",
          turnId: "t_unknown",
          message: error instanceof Error ? error.message : "orchestrator crashed",
          retryable: true,
          refundIssued: false,
        });
      } finally {
        if (spineOperationId && !opFinal) await markOperation(spineOperationId, "done");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
