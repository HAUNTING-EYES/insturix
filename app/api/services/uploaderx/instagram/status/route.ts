import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { getInstagramTokenHealth } from "@/lib/uploaderx/instagram-token-health";

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

        const user = await User.findOne({ clerkUserId: session.userId })
            .select("instagramTokens")
            .lean<{
                instagramTokens?: {
                    userAccessToken?: string;
                    userName?: string;
                    userId?: string;
                    expiresAt?: Date | string | null;
                    connectedAt?: Date | string;
                    accounts?: Array<{
                        instagramAccountId?: string;
                        instagramUsername?: string;
                        profilePictureUrl?: string | null;
                    }>;
                } | null;
            } | null>();
        const ig = user?.instagramTokens;
        const health = getInstagramTokenHealth(ig);
        if (!health.connected || !ig) {
            return NextResponse.json({ ...health, userName: null, userId: null, accounts: [] });
        }

        return NextResponse.json({
            ...health,
            userName: ig.userName || "Unknown",
            userId: ig.userId,
            accounts: (ig.accounts || []).map((a) => ({
                instagramAccountId: a.instagramAccountId,
                instagramUsername: a.instagramUsername,
                profilePictureUrl: a.profilePictureUrl,
            })),
            connectedAt: ig.connectedAt,
        });
    } catch (error) {
        console.error("❌ Error fetching Instagram status:", error);
        return NextResponse.json({ error: "Failed to fetch Instagram status" }, { status: 500 });
    }
}
