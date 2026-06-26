import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * Per-brand LinkedIn account binding (Model A — assign an account you already control to a brand).
 * The publish queue then posts that brand's LinkedIn content from the assigned identity (an org page
 * you admin, or your personal profile), resolving your live token at publish time.
 *
 *  GET    ?brandId=…   → the brand's current assignment(s) (no tokens)
 *  POST   {brandId, accountRef, accountType, displayName?} → assign / re-assign (idempotent upsert)
 *  DELETE {brandId, accountRef} (body or query) → unassign (brand falls back to the per-user token)
 *
 * Tenancy: bindings are stamped with the signed-in user's active org + ownerUserId. A deep
 * canAccessBrand check folds into Phase C (brandMembership); v1 binds under the signed-in owner and
 * the publisher isolates per brand.
 */

async function getModels() {
  await connectToDatabase();
  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  return { CalosConnectedAccount };
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const brandId = new URL(request.url).searchParams.get("brandId")?.trim();
  if (!brandId) {
    return NextResponse.json({ success: false, error: "brandId is required" }, { status: 400 });
  }

  const { CalosConnectedAccount } = await getModels();
  const rows = await CalosConnectedAccount.find({
    brandId,
    platform: "linkedin",
    ...(session.orgId ? { orgId: session.orgId } : {}),
  })
    .select("accountRef accountType displayName ownerUserId")
    .lean<Array<{ accountRef?: string; accountType?: string; displayName?: string; ownerUserId?: string }>>();

  const assignments = rows.map((r) => ({
    accountRef: r.accountRef,
    accountType: r.accountType || "organization",
    displayName: r.displayName || null,
  }));

  return NextResponse.json({ success: true, brandId, assignments });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { brandId?: string; accountRef?: string; accountType?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const brandId = body.brandId?.trim();
  const accountRef = body.accountRef?.trim();
  const accountType = body.accountType === "personal" ? "personal" : "organization";
  if (!brandId) return NextResponse.json({ success: false, error: "brandId is required" }, { status: 400 });
  if (!accountRef) return NextResponse.json({ success: false, error: "accountRef is required" }, { status: 400 });

  await connectToDatabase();
  const { User } = await import("@/schemas/user");

  // Model A resolves THIS user's live LinkedIn token at publish time, so they must be connected.
  const user = await User.findOne({ clerkUserId: session.userId })
    .select("linkedinTokens")
    .lean<{ linkedinTokens?: { accessToken?: string } | null } | null>();
  if (!user?.linkedinTokens?.accessToken) {
    return NextResponse.json(
      { success: false, error: "Connect your LinkedIn first before assigning it to a brand" },
      { status: 409 },
    );
  }

  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  await CalosConnectedAccount.updateOne(
    { brandId, platform: "linkedin", accountRef },
    {
      $set: {
        orgId: session.orgId || null,
        accountType,
        ownerUserId: session.userId,
        displayName: body.displayName?.trim() || null,
        accessTokenEnc: null, // Model A — reference, no stored token
      },
    },
    { upsert: true },
  );

  return NextResponse.json({ success: true, brandId, accountRef, accountType });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  let brandId = url.searchParams.get("brandId")?.trim();
  let accountRef = url.searchParams.get("accountRef")?.trim();
  if (!brandId || !accountRef) {
    try {
      const body = await request.json();
      brandId = brandId || body.brandId?.trim();
      accountRef = accountRef || body.accountRef?.trim();
    } catch {
      // body optional — query params may have provided both
    }
  }
  if (!brandId) return NextResponse.json({ success: false, error: "brandId is required" }, { status: 400 });
  if (!accountRef) return NextResponse.json({ success: false, error: "accountRef is required" }, { status: 400 });

  const { CalosConnectedAccount } = await getModels();
  const res = await CalosConnectedAccount.deleteOne({
    brandId,
    platform: "linkedin",
    accountRef,
    ...(session.orgId ? { orgId: session.orgId } : {}),
  });

  return NextResponse.json({ success: true, removed: res.deletedCount > 0 });
}
