import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/calos/connect/instagram/accounts
 *
 * Lists the Instagram accounts the signed-in user can assign to a brand, from their existing uploaderx
 * Instagram connection (User.instagramTokens.accounts). Model A — assign an account you already
 * control. No token leaves this route. connected:false → the UI sends them to the existing connect.
 */
export async function GET() {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const { User } = await import("@/schemas/user");
  const user = await User.findOne({ clerkUserId: session.userId })
    .select("instagramTokens")
    .lean<{
      instagramTokens?: {
        userName?: string;
        accounts?: Array<{ instagramAccountId?: string | number; instagramUsername?: string }>;
      } | null;
    } | null>();

  const tokens = user?.instagramTokens;
  if (!tokens) {
    return NextResponse.json({ success: true, connected: false, userName: null, accounts: [] });
  }

  const accounts = (tokens.accounts || [])
    .filter((a) => a?.instagramAccountId)
    .map((a) => ({
      accountRef: String(a.instagramAccountId),
      accountType: "organization" as const,
      displayName: a.instagramUsername ? `@${a.instagramUsername}` : `Instagram ${a.instagramAccountId}`,
    }));

  return NextResponse.json({ success: true, connected: true, userName: tokens.userName || null, accounts });
}
