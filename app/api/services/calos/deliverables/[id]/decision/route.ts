import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable, { type CalosEditorialStatus } from "@/schemas/calos-deliverable";
import { toContentCard } from "@/lib/calos/deliverable-mapper";
import { emitBrandEvent } from "@/lib/shared/brand-events";
import { createCalosDecisionLearningEvent } from "@/lib/calos/calos-brand-learning-events";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const DECISIONS = ["approved", "rejected", "changes_requested"] as const;
type Decision = (typeof DECISIONS)[number];

// decision -> editorial stage. 'rejected'/'changes_requested' both kick the card back to
// changes_requested; only 'approved' advances it to approved.
const DECISION_STATUS: Record<Decision, CalosEditorialStatus> = {
  approved: "approved",
  rejected: "changes_requested",
  changes_requested: "changes_requested",
};

/**
 * POST /api/services/calos/deliverables/[id]/decision  { brandId, decision, notes? }
 * Record an editorial decision on a deliverable (id = card.id). Scoped by ownerUserId + brandId.
 * Appends a version-bound approval and transitions editorialStatus. This is the hook where brand
 * learning will emit (approve -> affirm, changes -> reject) — wired in the brand-learning pass.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { brandId, decision, notes } = body;
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    if (!DECISIONS.includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }

    await connectToDatabase();
    const deliverable = await CalosDeliverable.findOne({
      "card.id": id,
      ownerUserId: userId,
      brandId,
      deletedAt: null,
    });
    if (!deliverable) return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });

    deliverable.editorialStatus = DECISION_STATUS[decision as Decision];
    deliverable.approvals.push({
      actor: userId,
      decision: decision as Decision,
      version: deliverable.version, // version-bound: a later content edit bumps version, staling this
      at: new Date(),
      notes: typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 1000) : undefined,
    });
    await deliverable.save();

    // Teach the brand vault from the decision (staged as a DRAFT by the brand-learning worker;
    // applied only after a human accepts it). Best-effort: a learning-emit failure must never fail
    // the decision itself.
    try {
      const learningEvent = createCalosDecisionLearningEvent({
        userId,
        brandId,
        campaignId: deliverable.campaignId,
        contentId: id,
        title: deliverable.card.title,
        decision: decision as Decision,
        observedAt: new Date().toISOString(),
        notes: typeof notes === "string" ? notes : undefined,
      });
      await emitBrandEvent({
        userId,
        brandId,
        service: "thinkforge",
        type: "user_override",
        payload: { learningEvents: [learningEvent] },
      });
    } catch (e) {
      console.warn("[CalOS] decision brand-learning emit failed (non-fatal):", e);
    }

    return NextResponse.json({ card: toContentCard(deliverable) });
  } catch (error) {
    console.error("[CalOS] decision error:", error);
    return NextResponse.json({ error: "Failed to record decision" }, { status: 500 });
  }
}
