import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { requireCalosBrandAccess } from "@/lib/calos/brand-access";
import { resolveOwnerYouTubeChannels } from "@/lib/calos/publish/youtube";

/**
 * Per-brand YouTube channel binding (Model A: assign the channel you already control). This route
 * stores the brand -> channel owner reference; final upload token resolution is owned by
 * lib/calos/publish/youtube.ts. v1 posts a card that already has a video; attaching that video to a
 * card is handled elsewhere.
 *
 *  GET    ?brandId=... -> current assignment(s) (no tokens)
 *  POST   {brandId, accountRef} -> validate the live channel, then assign / re-assign
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
  const accessResponse = await requireCalosBrandAccess(
    {
      userId: session.userId,
      orgId: session.orgId,
      isOrgAdmin: Boolean(session.orgId && session.has?.({ role: "org:admin" })),
    },
    brandId,
  );
  if (accessResponse) return accessResponse;

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

  let body: { brandId?: string; accountRef?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const brandId = body.brandId?.trim();
  const accountRef = body.accountRef?.trim();
  if (!brandId) return NextResponse.json({ success: false, error: "brandId is required" }, { status: 400 });
  if (!accountRef) return NextResponse.json({ success: false, error: "accountRef is required" }, { status: 400 });
  const accessResponse = await requireCalosBrandAccess(
    {
      userId: session.userId,
      orgId: session.orgId,
      isOrgAdmin: Boolean(session.orgId && session.has?.({ role: "org:admin" })),
    },
    brandId,
  );
  if (accessResponse) return accessResponse;

  const resolution = await resolveOwnerYouTubeChannels(session.userId);
  if (!resolution.ok) {
    return NextResponse.json(
      {
        success: false,
        error: resolution.state === "reconnect"
          ? "Connect your YouTube channel first before assigning it to a brand"
          : resolution.error,
      },
      { status: resolution.retryable ? 503 : 409 },
    );
  }
  const youtubeAccount = resolution.channels.find(
    (channel) => channel.accountRef === accountRef,
  );
  if (!youtubeAccount) {
    return NextResponse.json(
      {
        success: false,
        error: "Selected YouTube channel does not match a channel owned by the connected Google account",
      },
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
        displayName: youtubeAccount.displayName,
        accessTokenEnc: null,
      },
    },
    { upsert: true },
  );

  return NextResponse.json({
    success: true,
    brandId,
    accountRef,
    accountType: "organization",
    displayName: youtubeAccount.displayName,
  });
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
  const accessResponse = await requireCalosBrandAccess(
    {
      userId: session.userId,
      orgId: session.orgId,
      isOrgAdmin: Boolean(session.orgId && session.has?.({ role: "org:admin" })),
    },
    brandId,
  );
  if (accessResponse) return accessResponse;

  const { CalosConnectedAccount } = await getModels();
  const res = await CalosConnectedAccount.deleteOne({
    brandId,
    platform: "youtube",
    accountRef,
    ...(session.orgId ? { orgId: session.orgId } : {}),
  });

  return NextResponse.json({ success: true, removed: res.deletedCount > 0 });
}
