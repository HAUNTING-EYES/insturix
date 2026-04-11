import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/uploaderx/twitter/status
 * Returns the current Twitter connection status for the authenticated user.
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        const user = await User.findOne(
            { clerkUserId: session.userId },
            { twitterTokens: 1 }
        );

        if (!user || !user.twitterTokens) {
            return NextResponse.json({
                connected: false,
                message: "Twitter not connected",
            });
        }

        // Check if token is expired
        const now = new Date();
        const isExpired = user.twitterTokens.expiresAt < now;

        return NextResponse.json({
            connected: true,
            userName: user.twitterTokens.userName,
            userId: user.twitterTokens.userId,
            connectedAt: user.twitterTokens.connectedAt,
            expiresAt: user.twitterTokens.expiresAt,
            isExpired,
        });
    } catch (error) {
        console.error("❌ Error checking Twitter status:", error);
        return NextResponse.json(
            { error: "Failed to check status" },
            { status: 500 }
        );
    }
}
