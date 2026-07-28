import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import type { ICalosPendingAccount } from "@/schemas/calos-pending-connect";
import { requireCalosBrandAccess } from "@/lib/calos/brand-access";

/**
 * POST /api/services/calos/connect/linkedin/oauth/select  { pendingId, accountRef }
 *
 * Model B finalize: promotes a pending client-connect into an active per-brand connected account,
 * binding the encrypted token to the chosen account. The account MUST be one the token actually has
 * (looked up in the pending record's availableAccounts — never trusted from the request), and the
 * caller MUST own the pending record and retain access to its target brand. The record is consumed
 * only after the authorized connection is promoted successfully.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { pendingId?: string; accountRef?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const pendingId = body.pendingId?.trim();
  const accountRef = body.accountRef?.trim();
  if (!pendingId) return NextResponse.json({ success: false, error: "pendingId is required" }, { status: 400 });
  if (!accountRef) return NextResponse.json({ success: false, error: "accountRef is required" }, { status: 400 });

  await connectToDatabase();
  const { default: CalosPendingConnect } = await import("@/schemas/calos-pending-connect");
  const pending = await CalosPendingConnect.findOne({ pendingId });

  // Ownership: only the user who initiated this connect can finalize it.
  if (!pending || pending.ownerUserId !== session.userId) {
    return NextResponse.json({ success: false, error: "Pending connect not found" }, { status: 404 });
  }
  const accessResponse = await requireCalosBrandAccess(
    {
      userId: session.userId,
      orgId: session.orgId,
      isOrgAdmin: Boolean(session.orgId && session.has?.({ role: "org:admin" })),
    },
    pending.brandId,
  );
  if (accessResponse) return accessResponse;

  // The account must be one the token actually has (don't trust a client-supplied accountType).
  const chosen = pending.availableAccounts.find((a: ICalosPendingAccount) => a.accountRef === accountRef);
  if (!chosen) {
    return NextResponse.json({ success: false, error: "Account is not part of this connection" }, { status: 400 });
  }

  const { default: CalosConnectedAccount } = await import("@/schemas/calos-connected-account");
  await CalosConnectedAccount.updateOne(
    { brandId: pending.brandId, platform: pending.platform, accountRef: chosen.accountRef },
    {
      $set: {
        orgId: pending.orgId ?? null,
        accountType: chosen.accountType,
        displayName: chosen.displayName || null,
        ownerUserId: pending.ownerUserId,
        accessTokenEnc: pending.accessTokenEnc, // Model B — the client's own encrypted token
        refreshTokenEnc: pending.refreshTokenEnc ?? null,
        expiresAt: pending.tokenExpiresAt ?? null,
      },
    },
    { upsert: true },
  );

  await CalosPendingConnect.deleteOne({ pendingId });

  return NextResponse.json({
    success: true,
    brandId: pending.brandId,
    accountRef: chosen.accountRef,
    accountType: chosen.accountType,
  });
}
