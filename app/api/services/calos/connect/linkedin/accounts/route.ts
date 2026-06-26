import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/calos/connect/linkedin/accounts
 *
 * Lists the LinkedIn accounts the signed-in user can assign to a brand — their personal profile and
 * any organization pages they admin — read from their EXISTING per-user connection
 * (User.linkedinTokens, populated by the uploaderx LinkedIn connect). This powers the "assign an
 * account you already control" model (Model A): no fresh OAuth, the operator binds an account they
 * control to a brand. If the user has not connected LinkedIn at all, returns connected:false so the
 * UI can send them through the existing connect first.
 */
export async function GET() {
  const session = await auth();
  if (!session.userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const { User } = await import("@/schemas/user");
  const user = await User.findOne({ clerkUserId: session.userId })
    .select("linkedinTokens")
    .lean<{
      linkedinTokens?: {
        userId?: string;
        userName?: string;
        organizations?: Array<{ id: string | number; name?: string; vanityName?: string }>;
      } | null;
    } | null>();

  const tokens = user?.linkedinTokens;
  if (!tokens) {
    return NextResponse.json({ success: true, connected: false, person: null, organizations: [] });
  }

  const person = tokens.userId
    ? {
        accountRef: tokens.userId,
        accountType: "personal" as const,
        displayName: tokens.userName || "Personal profile",
      }
    : null;

  const organizations = (tokens.organizations || [])
    .filter((o) => o?.id)
    .map((o) => ({
      accountRef: String(o.id),
      accountType: "organization" as const,
      displayName: o.name || o.vanityName || `Organization ${o.id}`,
    }));

  return NextResponse.json({ success: true, connected: true, person, organizations });
}
