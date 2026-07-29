import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { resolveOwnerYouTubeChannels } from "@/lib/calos/publish/youtube";

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

  const resolution = await resolveOwnerYouTubeChannels(session.userId);
  if (!resolution.ok) {
    if (resolution.state === "reconnect") {
      return NextResponse.json({
        success: true,
        connected: false,
        accounts: [],
        message: resolution.error,
      });
    }
    return NextResponse.json(
      {
        success: false,
        connected: false,
        accounts: [],
        error: resolution.error,
      },
      { status: resolution.retryable ? 503 : 502 },
    );
  }

  return NextResponse.json({
    success: true,
    connected: resolution.channels.length > 0,
    accounts: resolution.channels.map((channel) => ({
      accountRef: channel.accountRef,
      accountType: "organization" as const,
      displayName: channel.displayName,
    })),
  });
}
