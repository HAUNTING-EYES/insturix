import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/calos/connect/twitter/accounts
 *
 * Lists the X account the signed-in user can assign to a brand. X is one account per connection, so
 * this returns at most one, read from their existing uploaderx X connection (User.twitterTokens).
 * Model A — assign an account you already control. connected:false → the UI sends them to connect.
 */
export async function GET() {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const { User } = await import("@/schemas/user");
  const user = await User.findOne({ clerkUserId: session.userId })
    .select("twitterTokens")
    .lean<{ twitterTokens?: { accessToken?: string; userId?: string; userName?: string } | null } | null>();

  const tokens = user?.twitterTokens;
  if (!tokens?.accessToken) {
    return NextResponse.json({ success: true, connected: false, accounts: [] });
  }

  const accounts = tokens.userId
    ? [
        {
          accountRef: String(tokens.userId),
          accountType: "personal" as const,
          displayName: tokens.userName ? `@${tokens.userName}` : "X account",
        },
      ]
    : [];

  return NextResponse.json({ success: true, connected: true, accounts });
}
