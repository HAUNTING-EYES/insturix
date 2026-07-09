import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosBrandReferences from "@/schemas/calos-brand-references";
import type { CalosCampaignReference } from "@/schemas/calos-campaign";
import { buildReferenceFromRequest, ReferenceInputError } from "@/lib/calos/references/build-reference";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // link fetch + document parse + an IngestorAgent LLM call

/**
 * Brand-level references — source material attached to a BRAND, usable by all generation with or
 * without a campaign (the fix for "what if the user never makes a campaign"). Same shape + ingestion
 * as campaign references (shared buildReferenceFromRequest). Scoped by ownerUserId + brandId.
 *
 * GET    ?brandId=            → { references }
 * POST   ?brandId=  (file | { type:'link'|'text', ... }) → { reference }
 * DELETE ?brandId=&refId=     → { ok }
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const brandId = new URL(req.url).searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

    await connectToDatabase();
    const doc = await CalosBrandReferences.findOne({ ownerUserId: userId, brandId }).lean<{ references?: CalosCampaignReference[] }>();
    return NextResponse.json({ references: doc?.references ?? [] });
  } catch (error) {
    console.error("[CalOS] list brand references error:", error);
    return NextResponse.json({ error: "Failed to fetch references" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const brandId = new URL(req.url).searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

    await connectToDatabase();

    let ref: CalosCampaignReference;
    try {
      ref = await buildReferenceFromRequest(req, { userId, label: "Brand references" });
    } catch (e) {
      if (e instanceof ReferenceInputError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    await CalosBrandReferences.findOneAndUpdate(
      { ownerUserId: userId, brandId },
      { $push: { references: ref }, $setOnInsert: { ownerUserId: userId, brandId, orgId: orgId ?? null } },
      { new: true, upsert: true },
    );
    return NextResponse.json({ reference: ref }, { status: 201 });
  } catch (error) {
    console.error("[CalOS] add brand reference error:", error);
    return NextResponse.json({ error: "Failed to add reference" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId");
    const refId = searchParams.get("refId");
    if (!brandId || !refId) return NextResponse.json({ error: "brandId and refId are required" }, { status: 400 });

    await connectToDatabase();
    const res = await CalosBrandReferences.updateOne(
      { ownerUserId: userId, brandId },
      { $pull: { references: { id: refId } } },
    );
    if (!res.modifiedCount) return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[CalOS] delete brand reference error:", error);
    return NextResponse.json({ error: "Failed to remove reference" }, { status: 500 });
  }
}
