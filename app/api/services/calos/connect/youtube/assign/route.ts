import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * Per-brand YouTube channel binding (Model A — assign the channel you already control). The publish
 * queue uploads a video card's video to the assigned channel using the owner's UploaderX.youtubeTokens
 * at publish time. v1: posts a card that already has a video (the "attach a video to a card" UX is a
 * separate piece), so most cards (text/image/script) won't target YouTube.
 *
 *  GET    ?brandId=…   → current assignment(s) (no tokens)
 *  POST   {brandId, accountRef, displayName?} → assign / re-assign
 *  DELETE {brandId, accountRef} → unassign
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
    platform: "youtube",
    ...(session.orgId ? { orgId: session.orgId } : {}),
  })
    .select("accountRef accountType displayName ownerUserId")
    .lean<Array<{ accountRef?: string; displayName?: string }>>();

  const assignments = rows.map((row) => ({
    accountRef: row.accountRef,
    accountType: "organization" as const,
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
  const user = await User.findOne({ clerkUserId: session.userId }).select("email").lean<{ email?: string } | null>();
  if (!user?.email) {
    return NextResponse.json({ success: false, error: "No email on file to resolve YouTube" }, { status: 409 });
  }
  const { default: UploaderX } = await import("@/schemas/uploaderx");
  const ux = await UploaderX.findOne({ email: user.email }).select("youtubeTokens").lean<{ youtubeTokens?: object } | null>();
  if (!ux?.youtubeTokens) {
    return NextResponse.json(
      { success: false, error: "Connect your YouTube channel first before assigning it to a brand" },
      { status: 409 },
    );
  }

  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  await CalosConnectedAccount.updateOne(
    { brandId, platform: "youtube", accountRef },
    {
      $set: {
        orgId: session.orgId || null,
        accountType: "organization",
        ownerUserId: session.userId,
        displayName: body.displayName?.trim() || "YouTube channel",
        accessTokenEnc: null, // Model A — reference; token lives in UploaderX.youtubeTokens (by email)
      },
    },
    { upsert: true },
  );

  return NextResponse.json({ success: true, brandId, accountRef, accountType: "organization" });
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
    platform: "youtube",
    accountRef,
    ...(session.orgId ? { orgId: session.orgId } : {}),
  });

  return NextResponse.json({ success: true, removed: res.deletedCount > 0 });
}
