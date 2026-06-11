import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";

/**
 * GET /api/services/uploaderx/facebook/pages
 * Returns the user's connected Facebook Pages and connection status.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        // Find the user document that has Facebook tokens
        const user = await User.findOne({
            clerkUserId: session.userId,
            facebookTokens: { $exists: true, $ne: null },
        });

        if (!user || !user.facebookTokens) {
            return NextResponse.json({
                connected: false,
                pages: [],
            });
        }

        const fb = user.facebookTokens as any;

        return NextResponse.json({
            connected: true,
            userName: fb.userName,
            userId: fb.userId,
            pages: (fb.pages || []).map((p: any) => ({
                pageId: p.pageId,
                pageName: p.pageName,
            })),
            connectedAt: fb.connectedAt,
        });
    } catch (error) {
        console.error("❌ Error fetching Facebook pages:", error);
        return NextResponse.json({ error: "Failed to fetch pages" }, { status: 500 });
    }
}

/**
 * DELETE /api/services/uploaderx/facebook/pages
 * Disconnects Facebook by removing stored tokens.
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
            { $unset: { facebookTokens: "" } }
        );

        return NextResponse.json({ success: true, message: "Facebook disconnected" });
    } catch (error) {
        console.error("❌ Error disconnecting Facebook:", error);
        return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
    }
}
