import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/mode — the SERVER's real-mode flag. The client gates on
 * NEXT_PUBLIC_STUDIO_REAL_TURNS (inlined at build time); when the two flags
 * disagree you get a demo UI over armed APIs (or vice versa). This endpoint
 * lets the client detect the split and say so instead of silently showing
 * the wrong mode. Returns a boolean only — nothing else.
 */
export async function GET() {
  return NextResponse.json({ real: process.env.STUDIO_REAL_TURNS === "1" });
}
