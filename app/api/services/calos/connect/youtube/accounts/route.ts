import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/calos/connect/youtube/accounts
 *
 * Whether the signed-in user has a connected YouTube channel (own-OAuth tokens live in the UploaderX
 * collection keyed by email). YouTube is one channel per connection, so this returns at most one,
 * resolved via User.email → UploaderX.youtubeTokens. Model A. The channel name is not fetched here
 * (kept lightweight — the publisher posts to the connected channel regardless of label).
 */
export async function GET() {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const { User } = await import("@/schemas/user");
  const user = await User.findOne({ clerkUserId: session.userId })
    .select("email")
    .lean<{ email?: string } | null>();

  if (!user?.email) {
    return NextResponse.json({ success: true, connected: false, accounts: [] });
  }

  const { default: UploaderX } = await import("@/schemas/uploaderx");
  const ux = await UploaderX.findOne({ email: user.email })
    .select("youtubeTokens")
    .lean<{ youtubeTokens?: object } | null>();

  if (!ux?.youtubeTokens) {
    return NextResponse.json({ success: true, connected: false, accounts: [] });
  }

  return NextResponse.json({
    success: true,
    connected: true,
    accounts: [{ accountRef: "youtube", accountType: "organization" as const, displayName: "YouTube channel" }],
  });
}
