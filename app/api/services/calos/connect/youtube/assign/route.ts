import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

type ClerkExternalAccount = {
  provider?: string | null;
  username?: string | null;
  emailAddress?: string | null;
  approvedScopes?: string | string[] | null;
  verification?: { strategy?: string | null } | null;
};

function findGoogleAccount(accounts: ClerkExternalAccount[] | undefined): ClerkExternalAccount | undefined {
  return accounts?.find(
    (account) =>
      account.provider?.includes("google") ||
      account.verification?.strategy === "oauth_google",
  );
}

async function getAssignableYoutubeAccount(userId: string): Promise<{ displayName: string } | null> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const googleAccount = findGoogleAccount(user.externalAccounts as unknown as ClerkExternalAccount[] | undefined);
  if (!googleAccount || googleAccount.approvedScopes?.includes(YOUTUBE_UPLOAD_SCOPE) === false) {
    return null;
  }
  return { displayName: googleAccount.username || googleAccount.emailAddress || "YouTube channel" };
}

/**
 * Per-brand YouTube channel binding (Model A: assign the channel you already control). The publish
 * queue later uses the assigning owner's Clerk Google connection. v1 posts a card that already has a
 * video; attaching that video to a card is handled elsewhere.
 *
 *  GET    ?brandId=... -> current assignment(s) (no tokens)
 *  POST   {brandId, accountRef, displayName?} -> assign / re-assign
 *  DELETE {brandId, accountRef} -> unassign
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

  const youtubeAccount = await getAssignableYoutubeAccount(session.userId);
  if (!youtubeAccount) {
    return NextResponse.json(
      { success: false, error: "Connect your YouTube channel first before assigning it to a brand" },
      { status: 409 },
    );
  }

  const { CalosConnectedAccount } = await getModels();
  await CalosConnectedAccount.updateOne(
    { brandId, platform: "youtube", accountRef },
    {
      $set: {
        orgId: session.orgId || null,
        accountType: "organization",
        ownerUserId: session.userId,
        displayName: body.displayName?.trim() || youtubeAccount.displayName,
        accessTokenEnc: null,
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
