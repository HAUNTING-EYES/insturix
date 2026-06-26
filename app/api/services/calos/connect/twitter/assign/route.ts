import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * Per-brand X (Twitter) account binding (Model A — assign the account you already control). The
 * publish queue posts the brand's approved cards to the assigned X account using the owner's live
 * token at publish time. X is text-native (no media required for v1).
 *
 *  GET    ?brandId=…   → current assignment(s) (no tokens)
 *  POST   {brandId, accountRef, displayName?} → assign / re-assign
 *  DELETE {brandId, accountRef} → unassign
 *
 * Tenancy: bound under the signed-in user's active org + ownerUserId (canAccessBrand folds into Phase C).
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
    platform: "twitter",
    ...(session.orgId ? { orgId: session.orgId } : {}),
  })
    .select("accountRef accountType displayName ownerUserId")
    .lean<Array<{ accountRef?: string; displayName?: string }>>();

  const assignments = rows.map((row) => ({
    accountRef: row.accountRef,
    accountType: "personal" as const,
    displayName: row.displayName || null,
  }));

  return NextResponse.json({ success: true, brandId, assignments });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { brandId?: string; accountRef?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const brandId = body.brandId?.trim();
  const accountRef = body.accountRef?.trim();
  if (!brandId) return NextResponse.json({ success: false, error: "brandId is required" }, { status: 400 });
  if (!accountRef) return NextResponse.json({ success: false, error: "accountRef is required" }, { status: 400 });

  await connectToDatabase();
  const { User } = await import("@/schemas/user");
  const user = await User.findOne({ clerkUserId: session.userId })
    .select("twitterTokens")
    .lean<{ twitterTokens?: { accessToken?: string; userId?: string; userName?: string } | null } | null>();

  const tokens = user?.twitterTokens;
  if (!tokens?.accessToken) {
    return NextResponse.json(
      { success: false, error: "Connect your X account first before assigning it to a brand" },
      { status: 409 },
    );
  }
  // X is one account per connection — only the connected account can be assigned.
  if (tokens.userId && String(tokens.userId) !== accountRef) {
    return NextResponse.json(
      { success: false, error: "That X account is not the one connected for this user" },
      { status: 400 },
    );
  }

  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  await CalosConnectedAccount.updateOne(
    { brandId, platform: "twitter", accountRef },
    {
      $set: {
        orgId: session.orgId || null,
        accountType: "personal",
        ownerUserId: session.userId,
        displayName: body.displayName?.trim() || (tokens.userName ? `@${tokens.userName}` : null),
        accessTokenEnc: null, // Model A — reference, no stored token
      },
    },
    { upsert: true },
  );

  return NextResponse.json({ success: true, brandId, accountRef, accountType: "personal" });
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
      // Body optional; query params may have provided both.
    }
  }
  if (!brandId) return NextResponse.json({ success: false, error: "brandId is required" }, { status: 400 });
  if (!accountRef) return NextResponse.json({ success: false, error: "accountRef is required" }, { status: 400 });

  const { CalosConnectedAccount } = await getModels();
  const res = await CalosConnectedAccount.deleteOne({
    brandId,
    platform: "twitter",
    accountRef,
    ...(session.orgId ? { orgId: session.orgId } : {}),
  });

  return NextResponse.json({ success: true, removed: res.deletedCount > 0 });
}
