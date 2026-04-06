import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/uploaderx/instagram/status
 * Returns the Instagram connection status.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        // Find the user document that has Instagram tokens
        const user = await User.findOne({
            clerkUserId: session.userId,
            instagramTokens: { $exists: true, $ne: null },
        });

        if (!user || !user.instagramTokens) {
            return NextResponse.json({
                connected: false,
                accounts: [],
            });
        }

        const ig = user.instagramTokens as any;

        return NextResponse.json({
            connected: true,
            userName: ig.userName,
            userId: ig.userId,
            accounts: (ig.accounts || []).map((a: any) => ({
                instagramAccountId: a.instagramAccountId,
                instagramUsername: a.instagramUsername,
                facebookPageName: a.facebookPageName,
            })),
        });
    } catch (error) {
        console.error("❌ Error fetching Instagram status:", error);
        return NextResponse.json({ error: "Failed to fetch Instagram status" }, { status: 500 });
    }
}
