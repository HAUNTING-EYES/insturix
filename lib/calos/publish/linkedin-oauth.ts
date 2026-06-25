import type { NextRequest } from "next/server";
import { getLinkedInAppOrigin } from "@/lib/uploaderx/linkedinUrl";

/**
 * The CalOS client-connect (Model B) OAuth redirect URI. It MUST be identical between the init
 * redirect and the token exchange (LinkedIn rejects a mismatch), so both import this one helper.
 *
 * OPS PRECONDITION: this URI must be registered in the LinkedIn app's authorized redirect URLs
 * (it is distinct from the uploaderx per-user callback). Override with CALOS_LINKEDIN_REDIRECT_URI.
 */
export function getCalosLinkedInRedirectUri(request: NextRequest): string {
  const explicit = process.env.CALOS_LINKEDIN_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL(
    "/api/services/calos/connect/linkedin/oauth/callback",
    getLinkedInAppOrigin(request),
  ).toString();
}
