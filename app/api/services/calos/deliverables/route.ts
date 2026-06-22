import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { orgMemberService } from "@/lib/services/orgMemberService";
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
 * GET /api/services/calos/deliverables?orgId=&brandId=
 * List a client/brand's deliverables. Scoped: requires org membership; never returns
 * another org's content.
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const brandId = searchParams.get("brandId");
    if (!orgId || !brandId) {
      return NextResponse.json({ error: "orgId and brandId are required" }, { status: 400 });
    }

    const isMember = await orgMemberService.isMember(userId, orgId);
    if (!isMember) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    await connectToDatabase();
    const docs = await CalosDeliverable.find({ orgId, brandId, deletedAt: null }).lean<ICalosDeliverable[]>();
    const cards = docs.map((doc) => toContentCard(doc));

    return NextResponse.json({ cards });
  } catch (error) {
    console.error("[CalOS] list deliverables error:", error);
    return NextResponse.json({ error: "Failed to fetch deliverables" }, { status: 500 });
  }
}

/**
 * POST /api/services/calos/deliverables  { orgId, brandId, card }
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
    const { orgId, brandId, card } = body;
    if (!orgId || !brandId) {
      return NextResponse.json({ error: "orgId and brandId are required" }, { status: 400 });
    }
    if (!card || !card.title) {
      return NextResponse.json({ error: "Invalid card data. Title is required." }, { status: 400 });
    }

    const isMember = await orgMemberService.isMember(userId, orgId);
    if (!isMember) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    // Validate + normalize the content payload with the shared contract.
    const normalized = normalizeContentCardForStorage(card, { userId });
    const contentCard = contentCardClientView(normalized);

    await connectToDatabase();
    const doc = await CalosDeliverable.create(
      toDeliverableDoc({ ...contentCard, brandId }, { ownerUserId: userId, orgId, brandId })
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
