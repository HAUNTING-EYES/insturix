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

export const dynamic = "force-dynamic";

/**
 * GET /api/services/calos/deliverables?brandId=
 * List the caller's deliverables for a client/brand. Scoped by ownerUserId (from the Clerk
 * session) + brandId — a user only ever sees their own deliverables, never another user's.
 * (orgId is an optional future agency/team-share layer; not required here.)
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
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
      ownerUserId: userId,
      brandId,
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
 * POST /api/services/calos/deliverables  { brandId, card, orgId? }
 * Create a deliverable for a client/brand. The card payload is validated by the shared
 * content-card contract (DRY) before it is wrapped into a deliverable.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { brandId, card, orgId } = body;
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
