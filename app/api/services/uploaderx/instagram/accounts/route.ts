import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/uploaderx/instagram/accounts
 * Returns the user's connected Instagram Business accounts and connection status.
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

        console.log("📄 Instagram Accounts API - User lookup:", {
            userFound: !!user,
            hasTokens: !!user?.instagramTokens,
            accountsCount: user?.instagramTokens?.accounts?.length || 0,
            clerkUserId: session.userId,
            accounts: user?.instagramTokens?.accounts?.map((a: any) => ({
                instagramAccountId: a.instagramAccountId,
                instagramUsername: a.instagramUsername,
            })) || []
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
                profilePictureUrl: a.profilePictureUrl,
            })),
            connectedAt: ig.connectedAt,
        });
    } catch (error) {
        console.error("❌ Error fetching Instagram accounts:", error);
        return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }
}

/**
 * DELETE /api/services/uploaderx/instagram/accounts
 * Disconnects Instagram by removing stored tokens.
 */
export async function DELETE() {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        await User.findOneAndUpdate(
            { clerkUserId: session.userId },
            { $unset: { instagramTokens: "" } }
        );

        return NextResponse.json({ success: true, message: "Instagram disconnected" });
    } catch (error) {
        console.error("❌ Error disconnecting Instagram:", error);
        return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
    }
}
