import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable, { type ICalosDeliverable } from "@/schemas/calos-deliverable";
import {
  normalizeContentCardForStorage,
  contentCardClientView,
  isContentCardValidationError,
} from "@/lib/thinkforge/planning/content-card-contract";
import { toDeliverableDoc, toContentCard } from "@/lib/calos/deliverable-mapper";
import { calosScope } from "@/lib/calos/scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/services/calos/deliverables?brandId=
 * List deliverables for a client/brand. Scoped via calosScope: org-shared when the caller is in a
 * Clerk org (any member sees the org's brand calendar — Phase D team calendar), else creator-scoped
 * (solo users see only their own), always intersected with brandId. orgId comes only from the trusted
 * session, never the request — no cross-org leak.
 */
export async function GET(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId");
    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }

    await connectToDatabase();
    const docs = await CalosDeliverable.find({
      ...calosScope({ userId, orgId }, brandId),
      deletedAt: null,
    }).lean<ICalosDeliverable[]>();
    const cards = docs.map((doc) => toContentCard(doc));

    return NextResponse.json({ cards });
  } catch (error) {
    console.error("[CalOS] list deliverables error:", error);
    return NextResponse.json({ error: "Failed to fetch deliverables" }, { status: 500 });
  }
}

/**
 * POST /api/services/calos/deliverables  { brandId, card }
 * Create a deliverable for a client/brand. The card payload is validated by the shared
 * content-card contract (DRY) before it is wrapped into a deliverable. The deliverable is stamped
 * with the creator's session orgId (Phase D) so org teammates see it on the shared calendar;
 * ownerUserId stays the creator (attribution + whose connected account posts it).
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { brandId, card } = body;
    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }
    if (!card || !card.title) {
      return NextResponse.json({ error: "Invalid card data. Title is required." }, { status: 400 });
    }

    // Validate + normalize the content payload with the shared contract.
    const normalized = normalizeContentCardForStorage(card, { userId });
    const contentCard = contentCardClientView(normalized);

    await connectToDatabase();
    const doc = await CalosDeliverable.create(
      toDeliverableDoc(
        { ...contentCard, brandId },
        { ownerUserId: userId, brandId, orgId: orgId ?? null }
      )
    );

    return NextResponse.json({ card: toContentCard(doc) }, { status: 201 });
  } catch (error) {
    if (isContentCardValidationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[CalOS] create deliverable error:", error);
    return NextResponse.json({ error: "Failed to create deliverable" }, { status: 500 });
  }
}
