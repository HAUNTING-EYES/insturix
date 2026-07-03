import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

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

function hasYoutubeUploadScope(account: ClerkExternalAccount): boolean {
  return account.approvedScopes?.includes(YOUTUBE_UPLOAD_SCOPE) !== false;
}

/**
 * GET /api/services/calos/connect/youtube/accounts
 *
 * UploaderX uses Clerk's Google external account as the YouTube source of truth. CalOS reads the
 * same source so a channel connected in UploaderX appears in the content calendar's Publishing UI.
 */
export async function GET() {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(session.userId);
  const googleAccount = findGoogleAccount(user.externalAccounts as unknown as ClerkExternalAccount[] | undefined);
  if (!googleAccount || !hasYoutubeUploadScope(googleAccount)) {
    return NextResponse.json({ success: true, connected: false, accounts: [] });
  }

  const displayName = googleAccount.username || googleAccount.emailAddress || "YouTube channel";
  return NextResponse.json({
    success: true,
    connected: true,
    accounts: [{ accountRef: "youtube", accountType: "organization" as const, displayName }],
  });
}
