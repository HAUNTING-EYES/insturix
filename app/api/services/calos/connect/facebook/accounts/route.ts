import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/calos/connect/facebook/accounts
 *
 * Lists the Facebook Pages the signed-in user can assign to a brand, read from their existing
 * UploaderX Facebook connection. Facebook is Page-only for CalOS: no personal profile target and
 * no token leaves this route.
 */
export async function GET() {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const { User } = await import("@/schemas/user");
  const user = await User.findOne({ clerkUserId: session.userId })
    .select("facebookTokens")
    .lean<{
      facebookTokens?: {
        userName?: string;
        pages?: Array<{ pageId?: string | number; pageName?: string; pageAccessToken?: string }>;
      } | null;
    } | null>();

  const tokens = user?.facebookTokens;
  if (!tokens) {
    return NextResponse.json({ success: true, connected: false, userName: null, pages: [] });
  }

  const pages = (tokens.pages || [])
    .filter((page) => page?.pageId)
    .map((page) => ({
      accountRef: String(page.pageId),
      accountType: "organization" as const,
      displayName: page.pageName || `Facebook Page ${page.pageId}`,
    }));

  return NextResponse.json({
    success: true,
    connected: true,
    userName: tokens.userName || null,
    pages,
  });
}