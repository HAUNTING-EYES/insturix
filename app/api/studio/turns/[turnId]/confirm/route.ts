import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { resolveConfirm } from "@/lib/studio/orchestrator/confirm-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Answers a turn.confirm_required card. Same-origin, authed, flag-gated. */
export async function POST(_req: Request, { params }: { params: Promise<{ turnId: string }> }) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { turnId } = await params;
  let body: { accepted?: boolean } = {};
  try {
    body = (await _req.json()) as { accepted?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ok = resolveConfirm(turnId, { accepted: Boolean(body.accepted) });
  return NextResponse.json({ resolved: ok }, { status: ok ? 200 : 409 });
}
