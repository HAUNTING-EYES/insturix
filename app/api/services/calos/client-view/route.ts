import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { signClientViewToken } from "@/lib/calos/client-view";

export const dynamic = "force-dynamic";

/**
 * POST /api/services/calos/client-view  { brandId }
 * Mint a read-only share URL for the caller's brand calendar. The token is bound to the caller's
 * exact read scope — org when the caller is in a Clerk org (the whole team's calendar), else the
 * creator's. The scope is taken from the trusted session (never the body), and the scope binding is
 * itself the access control: a token minted for a brand the caller can't see resolves to an EMPTY
 * calendar, so there is no cross-tenant leak. Returns { url, token }.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { brandId } = await req.json();
    if (!brandId || typeof brandId !== "string") {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }

    let token: string;
    try {
      token = signClientViewToken({ brandId, orgId: orgId ?? null, ownerUserId: userId });
    } catch (e) {
      // Signing key missing — fail loud + honest (R18N), don't hand back an unsigned/forgeable link.
      console.error("[CALOS_LOUD] client-view mint failed (CALOS_TOKEN_ENCRYPTION_KEY missing?):", e);
      return NextResponse.json(
        { error: "Sharing is not configured on this environment (missing signing key)." },
        { status: 503 },
      );
    }

    const url = `${req.nextUrl.origin}/share/calendar/${token}`;
    return NextResponse.json({ url, token });
  } catch (error) {
    console.error("[CalOS] client-view mint error:", error);
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }
}
