import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  signClientViewToken,
  recordShareLink,
  listShareLinks,
  revokeShareLink,
} from "@/lib/calos/client-view";

export const dynamic = "force-dynamic";

/**
 * POST /api/services/calos/client-view  { brandId, label? }
 * Mint a read-only share URL for the caller's brand calendar. The token is bound to the caller's
 * exact read scope — org when the caller is in a Clerk org (the whole team's calendar), else the
 * creator's. The scope is taken from the trusted session (never the body), and the scope binding is
 * itself the access control: a token minted for a brand the caller can't see resolves to an EMPTY
 * calendar, so there is no cross-tenant leak. Also writes a CalosShareLink record so the link can be
 * revoked + tracked later. Returns { url, token, tokenId }.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const brandId = body?.brandId;
    if (!brandId || typeof brandId !== "string") {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }
    const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : null;

    const scope = { brandId, orgId: orgId ?? null, ownerUserId: userId };
    let minted: ReturnType<typeof signClientViewToken>;
    try {
      minted = signClientViewToken(scope);
    } catch (e) {
      // Signing key missing — fail loud + honest (R18N), don't hand back an unsigned/forgeable link.
      console.error("[CALOS_LOUD] client-view mint failed (CALOS_TOKEN_ENCRYPTION_KEY missing?):", e);
      return NextResponse.json(
        { error: "Sharing is not configured on this environment (missing signing key)." },
        { status: 503 },
      );
    }

    await recordShareLink({
      tokenId: minted.tokenId,
      scope,
      createdBy: userId,
      expiresAt: minted.expiresAt,
      label,
    });

    const url = `${req.nextUrl.origin}/share/calendar/${minted.token}`;
    return NextResponse.json({ url, token: minted.token, tokenId: minted.tokenId });
  } catch (error) {
    console.error("[CalOS] client-view mint error:", error);
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }
}

/**
 * GET /api/services/calos/client-view?brandId=
 * List the brand's share links for the caller's scope (the manage-links UI). No token material — just
 * tokenId + label + status + usage. Each row's URL is rebuilt by the client from the origin (the page
 * doesn't store the full token after minting; only the active token holder has the URL).
 */
export async function GET(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const brandId = req.nextUrl.searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

    const links = await listShareLinks({ userId, orgId: orgId ?? null }, brandId);
    return NextResponse.json({ links });
  } catch (error) {
    console.error("[CalOS] client-view list error:", error);
    return NextResponse.json({ error: "Failed to list share links" }, { status: 500 });
  }
}

/**
 * DELETE /api/services/calos/client-view  { brandId, tokenId }
 * Revoke a share link — flips its record to revoked so the next view (touchAndCheckShareLink) fails.
 * Scoped to the caller via calosScope, so a user can only revoke their own org's / their own links.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const brandId = body?.brandId;
    const tokenId = body?.tokenId;
    if (!brandId || typeof brandId !== "string") {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }
    if (!tokenId || typeof tokenId !== "string") {
      return NextResponse.json({ error: "tokenId is required" }, { status: 400 });
    }

    const revoked = await revokeShareLink({ userId, orgId: orgId ?? null }, brandId, tokenId);
    if (!revoked) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CalOS] client-view revoke error:", error);
    return NextResponse.json({ error: "Failed to revoke share link" }, { status: 500 });
  }
}
