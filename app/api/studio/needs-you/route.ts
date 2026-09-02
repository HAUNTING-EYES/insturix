import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosConnectedAccount from "@/schemas/calos-connected-account";
import { loadCalosAssignmentHealth, type CalosAssignmentLike } from "@/lib/calos/publishing-assignment-health";
import { listNeedsYouProjects } from "@/lib/studio/persist/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/needs-you — ONE merged queue for the bell (Phase 4):
 * open decisions from the spine (operations awaiting confirmation) PLUS
 * connection health from CalOS (attention/reconnect states — expired tokens,
 * missing author assignments). Healthy connections never surface; nothing
 * here is invented severity, every row comes from a real record.
 */

export async function GET() {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const [projects, connections] = await Promise.all([
      listNeedsYouProjects(orgId ?? null).catch(() => []),
      loadConnections(userId, orgId ?? null),
    ]);
    return NextResponse.json({ projects, connections });
  } catch (error) {
    console.error("[studio] needs-you read failed", error);
    return NextResponse.json({ error: "needs_you_unavailable" }, { status: 503 });
  }
}

async function loadConnections(userId: string, orgId: string | null) {
  await connectToDatabase();
  const accounts = (await CalosConnectedAccount.find({
    $or: [{ orgId }, { ownerUserId: userId }],
  })
    .limit(50)
    .lean()) as unknown as Array<CalosAssignmentLike>;
  if (!accounts.length) return [];
  /* keyed by platform (multiple accounts on one platform is itself an
   * attention state the loader reports) */
  const health = await loadCalosAssignmentHealth(accounts);
  return Object.entries(health)
    .filter(([, h]) => h.state !== "assigned")
    .map(([platform, h]) => ({
      platform,
      state: h.state as "attention" | "reconnect",
      displayName: h.displayName ?? null,
      message: h.message ?? null,
    }));
}
