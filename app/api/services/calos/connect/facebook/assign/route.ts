import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * Per-brand Facebook Page binding. Facebook publishing is Page-only: POST validates that the
 * requested page is present in the signed-in user's existing UploaderX Facebook connection and
 * stores only a reference. The publisher resolves User.facebookTokens.pages[].pageAccessToken at
 * publish time.
 *
 *  GET    ?brandId=... -> the brand's current Facebook Page assignment(s) (no tokens)
 *  POST   {brandId, accountRef, displayName?} -> assign / re-assign a Page
 *  DELETE {brandId, accountRef} -> unassign (Facebook publishing then fails loud; no fallback)
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
    platform: "facebook",
    ...(session.orgId ? { orgId: session.orgId } : {}),
  })
    .select("accountRef accountType displayName ownerUserId")
    .lean<Array<{ accountRef?: string; accountType?: string; displayName?: string; ownerUserId?: string }>>();

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
  const user = await User.findOne({ clerkUserId: session.userId })
    .select("facebookTokens")
    .lean<{
      facebookTokens?: {
        pages?: Array<{ pageId?: string | number; pageName?: string; pageAccessToken?: string }>;
      } | null;
    } | null>();

  const page = user?.facebookTokens?.pages?.find((item) => String(item.pageId) === accountRef);
  if (!page?.pageAccessToken) {
    return NextResponse.json(
      { success: false, error: "Connect this Facebook Page first before assigning it to a brand" },
      { status: 409 },
    );
  }

  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  await CalosConnectedAccount.updateOne(
    { brandId, platform: "facebook", accountRef },
    {
      $set: {
        orgId: session.orgId || null,
        accountType: "organization",
        ownerUserId: session.userId,
        displayName: body.displayName?.trim() || page.pageName || null,
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
    platform: "facebook",
    accountRef,
    ...(session.orgId ? { orgId: session.orgId } : {}),
  });

  return NextResponse.json({ success: true, removed: res.deletedCount > 0 });
}