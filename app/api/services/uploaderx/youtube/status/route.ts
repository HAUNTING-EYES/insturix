import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

/**
 * GET /api/services/uploaderx/youtube/status
 * Returns the YouTube connection status by checking Clerk external accounts.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get user from Clerk to check external accounts
        const client = await clerkClient();
        const user = await client.users.getUser(session.userId);

        // Check if user has Google external account
        const googleAccount = user.externalAccounts.find(
            (acc) => acc.provider.includes("google")
        );

        if (!googleAccount) {
            return NextResponse.json({
                connected: false,
                channelName: null,
                channelId: null,
            });
        }

        // Check for YouTube upload scope
        const SCOPE = "https://www.googleapis.com/auth/youtube.upload";
        const hasScope = googleAccount.approvedScopes?.includes(SCOPE);

        return NextResponse.json({
            connected: hasScope !== false,
            channelName: googleAccount.username || googleAccount.emailAddress,
            channelId: googleAccount.id,
            provider: googleAccount.provider,
        });
    } catch (error) {
        console.error("❌ Error fetching YouTube status:", error);
        return NextResponse.json({ error: "Failed to fetch YouTube status" }, { status: 500 });
    }
}
