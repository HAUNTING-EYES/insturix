import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { randomBytes } from "crypto";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { getLinkedInScopes } from "@/lib/uploaderx/linkedinScopes";
import { getLinkedInDashboardUrl } from "@/lib/uploaderx/linkedinUrl";
import { getCalosLinkedInRedirectUri } from "@/lib/calos/publish/linkedin-oauth";
import { verifyCalosConnectState } from "@/lib/calos/publish/connect-state";
import { encryptToken } from "@/lib/calos/publish/token-crypto";
import { createOAuthPopupResponse } from "@/lib/oauth/popup-response";

/**
 * GET /api/services/calos/connect/linkedin/oauth/callback
 *
 * Model B callback: verifies the signed state, confirms the session user is the one who initiated,
 * exchanges the code for the CLIENT's token, discovers the accounts that token can post as, encrypts
 * the token, and stores a short-lived pending connect. Returns a popup that posts the pendingId +
 * available accounts back to the opener so the user can pick which account binds to the brand.
 *
 * It NEVER writes User.<platform>Tokens (that is the per-user connect job) and NEVER auto-binds;
 * binding happens explicitly at /select against an account the token actually has.
 */
interface PendingAccount {
  accountRef: string;
  accountType: "organization" | "personal";
  displayName: string;
}

function popupResponse(request: NextRequest, payload: Record<string, unknown>) {
  return createOAuthPopupResponse({
    request,
    source: "calos-linkedin-connect",
    payload,
    fallbackUrl: getLinkedInDashboardUrl("/dashboard/calos", request),
    title: "LinkedIn Connection",
    message: "Completing LinkedIn connection...",
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const stateRaw = searchParams.get("state");
    const oauthError = searchParams.get("error");
    const oauthErrorDesc = searchParams.get("error_description");

    if (oauthError) {
      return popupResponse(request, { success: false, error: "linkedin_auth_failed", message: oauthErrorDesc || oauthError });
    }
    if (!code || !stateRaw) {
      return popupResponse(request, { success: false, error: "linkedin_auth_invalid" });
    }

    const state = verifyCalosConnectState(stateRaw);
    if (!state) {
      return popupResponse(request, { success: false, error: "invalid_or_expired_state" });
    }

    // The callback rides the user browser session; confirm it is the same user who initiated.
    const session = await auth();
    if (!session.userId || session.userId !== state.ownerUserId) {
      return popupResponse(request, { success: false, error: "session_mismatch" });
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      return popupResponse(request, { success: false, error: "linkedin_config_error" });
    }

    // --- Exchange the authorization code for the client's token ---
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getCalosLinkedInRedirectUri(request),
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      return popupResponse(request, { success: false, error: "linkedin_token_exchange_failed" });
    }

    const accessToken: string = tokenData.access_token;
    const refreshToken: string | undefined = tokenData.refresh_token;
    const expiresIn: number | undefined = tokenData.expires_in;
    const { options } = getLinkedInScopes();

    // --- Discover the accounts this token can post as ---
    const accounts: PendingAccount[] = [];

    // Person (from the OIDC id_token if present, else /v2/userinfo).
    if (options.includeProfile) {
      let person: { id?: string; name?: string } = {};
      if (tokenData.id_token) {
        try {
          const [, payload] = String(tokenData.id_token).split(".");
          if (payload) {
            const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
            person = { id: decoded.sub, name: decoded.name };
          }
        } catch (err) {
          // TODO(CALOS_LOUD): remove once stable.
          console.error("[CALOS_LOUD] oauth/callback: id_token decode failed (falling through to userinfo):", err);
        }
      }
      if (!person.id) {
        try {
          const ui = await fetch("https://api.linkedin.com/v2/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (ui.ok) {
            const ud = await ui.json();
            if (ud?.sub) person = { id: ud.sub, name: ud.name };
          }
        } catch (err) {
          // TODO(CALOS_LOUD): remove once stable.
          console.error("[CALOS_LOUD] oauth/callback: /v2/userinfo failed (personal account dropped):", err);
        }
      }
      if (person.id) {
        accounts.push({ accountRef: person.id, accountType: "personal", displayName: person.name || "Personal profile" });
      }
    }

    // Organization pages the client admins (only if org scope was granted).
    if (options.includeOrganizationAdmin || options.includeOrganizationSocial) {
      try {
        const orgRes = await fetch("https://api.linkedin.com/v2/organizations?q=organizations", {
          headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" },
        });
        if (orgRes.ok) {
          const orgData = await orgRes.json();
          for (const org of orgData.elements || []) {
            if (org?.id) {
              accounts.push({
                accountRef: String(org.id),
                accountType: "organization",
                displayName: org.localizedName || org.vanityName || `Organization ${org.id}`,
              });
            }
          }
        }
      } catch (err) {
        // TODO(CALOS_LOUD): remove once stable.
        console.error("[CALOS_LOUD] oauth/callback: org discovery failed (company pages dropped):", err);
      }
    }

    if (accounts.length === 0) {
      return popupResponse(request, { success: false, error: "no_postable_accounts" });
    }

    // --- Encrypt + stash as a pending connect (token NEVER stored plaintext) ---
    let accessTokenEnc: string;
    let refreshTokenEnc: string | null;
    try {
      accessTokenEnc = encryptToken(accessToken);
      refreshTokenEnc = refreshToken ? encryptToken(refreshToken) : null;
    } catch (err) {
      // TODO(CALOS_LOUD): remove once stable.
      console.error("[CALOS_LOUD] oauth/callback: token encryption failed (CALOS_TOKEN_ENCRYPTION_KEY missing/invalid?):", err);
      return popupResponse(request, { success: false, error: "encryption_not_configured" });
    }

    await connectToDatabase();
    const { default: CalosPendingConnect } = await import("@/schemas/calos-pending-connect");
    const pendingId = randomBytes(18).toString("base64url");
    await CalosPendingConnect.create({
      pendingId,
      ownerUserId: state.ownerUserId,
      orgId: state.orgId,
      brandId: state.brandId,
      platform: "linkedin",
      accessTokenEnc,
      refreshTokenEnc,
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      availableAccounts: accounts,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    return popupResponse(request, { success: true, pendingId, brandId: state.brandId, accounts });
  } catch (error) {
    console.error("[calos-connect:linkedin] callback error", error);
    return popupResponse(request, { success: false, error: "linkedin_callback_error" });
  }
}
