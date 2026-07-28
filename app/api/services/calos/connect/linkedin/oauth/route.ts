import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getLinkedInScopes } from "@/lib/uploaderx/linkedinScopes";
import { getCalosLinkedInRedirectUri } from "@/lib/calos/publish/linkedin-oauth";
import { signCalosConnectState } from "@/lib/calos/publish/connect-state";
import { requireCalosBrandAccess } from "@/lib/calos/brand-access";

/**
 * GET /api/services/calos/connect/linkedin/oauth?brandId=…
 *
 * Model B init: starts a fresh LinkedIn OAuth so a CLIENT can connect their OWN account to a brand
 * (vs Model A, where the operator assigns an account they already control). Uses a SIGNED state nonce
 * binding {ownerUserId, orgId, brandId} (eng-review R3 — not the forgeable raw userId). The callback
 * stores the client's encrypted token as a pending connect for the user to bind to an account.
 *
 * OPS PRECONDITION: the redirect URI (lib/calos/publish/linkedin-oauth) must be registered in the
 * LinkedIn app's authorized redirect URLs, and CALOS_TOKEN_ENCRYPTION_KEY must be set.
 */
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

  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ success: false, error: "LinkedIn integration not configured" }, { status: 500 });
  }

  let state: string;
  try {
    state = signCalosConnectState({
      ownerUserId: session.userId,
      orgId: session.orgId || null,
      brandId,
      platform: "linkedin",
    });
  } catch {
    // CALOS_TOKEN_ENCRYPTION_KEY missing → the client-connect feature isn't configured.
    return NextResponse.json({ success: false, error: "Client connect is not configured on this server" }, { status: 500 });
  }

  const { scopes } = getLinkedInScopes();
  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", getCalosLinkedInRedirectUri(request));
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
