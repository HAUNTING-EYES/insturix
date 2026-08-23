import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { StudioTurnRequestSchema } from "@/lib/studio/contracts/turn";
import { runWriteTurn, type WriteTurnState } from "@/lib/studio/orchestrator/write";
import { runEditTurn } from "@/lib/studio/orchestrator/edit";

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

  const { userId, orgId } = await auth();
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
  const scriptAttachment = request.attachments.find((a) => a.role === "script");
  if (scriptAttachment) {
    const [sessionId, scriptId] = scriptAttachment.ref.split(":");
    if (sessionId && scriptId) {
      state.thinkforgeSessionId = sessionId;
      state.scriptId = scriptId;
    }
  }
  /* capability dispatch: a reel attachment routes the turn to EDIT */
  const reelAttachment = request.attachments.find((a) => a.role === "reel");
  const editProjectId = reelAttachment?.ref ?? null;

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
      try {
        const events = editProjectId
          ? runEditTurn(
              { userId, orgId: orgId ?? null, projectId: editProjectId, forwardHeaders, origin: new URL(req.url).origin },
              request.text,
              req.signal,
            )
          : runWriteTurn(
              {
                userId,
                orgId: orgId ?? null,
                isOrgAdmin: Boolean(orgId),
                deliverableTitle: "Studio draft",
                brandId: request.brandId ?? null,
                ...state,
              },
              request.text,
              req.signal,
            );
        for await (const event of events) {
          send(event);
        }
      } catch (error) {
        send({
          type: "turn.error",
          turnId: "t_unknown",
          message: error instanceof Error ? error.message : "orchestrator crashed",
          retryable: true,
          refundIssued: false,
        });
      } finally {
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
