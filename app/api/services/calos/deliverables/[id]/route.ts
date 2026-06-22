import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { orgMemberService } from "@/lib/services/orgMemberService";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosDeliverable from "@/schemas/calos-deliverable";
import {
  mergeContentCardUpdate,
  contentCardClientView,
  isContentCardValidationError,
} from "@/lib/thinkforge/planning/content-card-contract";
import { toContentCard } from "@/lib/calos/deliverable-mapper";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/services/calos/deliverables/[id]  { orgId, brandId, updates }
 * Update a deliverable's content. Scoped + membership-checked. editorialStatus is owned by
 * the CalOS approval flow (P4), not by the calendar's legacy status, so PATCH leaves it alone.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { orgId, brandId, updates } = body;
    if (!orgId || !brandId) {
      return NextResponse.json({ error: "orgId and brandId are required" }, { status: 400 });
    }
    if (!updates) {
      return NextResponse.json({ error: "updates are required" }, { status: 400 });
    }

    const isMember = await orgMemberService.isMember(userId, orgId);
    if (!isMember) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    await connectToDatabase();
    const existing = await CalosDeliverable.findOne({
      "card.id": id,
      orgId,
      brandId,
      deletedAt: null,
    });
    if (!existing) {
      return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
    }

    // Merge the content payload via the shared contract (DRY), then re-hoist the queryable columns.
    const mergedCard = contentCardClientView(
      mergeContentCardUpdate(existing.card, updates, { userId })
    );
    existing.card = mergedCard;
    existing.plannedDates = mergedCard.plannedDates;
    existing.platform = mergedCard.platform ?? "generic";
    existing.campaignId = mergedCard.campaignId ?? null;
    existing.version += 1;
    await existing.save();

    return NextResponse.json({ card: toContentCard(existing) });
  } catch (error) {
    if (isContentCardValidationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[CalOS] update deliverable error:", error);
    return NextResponse.json({ error: "Failed to update deliverable" }, { status: 500 });
  }
}

/**
 * DELETE /api/services/calos/deliverables/[id]?orgId=&brandId=
 * Soft-delete (sets deletedAt) — no hard data loss. Scoped + membership-checked.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
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
    const existing = await CalosDeliverable.findOne({
      "card.id": id,
      orgId,
      brandId,
      deletedAt: null,
    });
    if (!existing) {
      return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
    }

    existing.deletedAt = new Date();
    await existing.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CalOS] delete deliverable error:", error);
    return NextResponse.json({ error: "Failed to delete deliverable" }, { status: 500 });
  }
}
