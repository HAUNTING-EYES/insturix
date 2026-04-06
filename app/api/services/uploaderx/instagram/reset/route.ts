import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * POST /api/services/uploaderx/instagram/reset
 * Clears existing Instagram tokens (useful when accounts array is empty)
 */
export async function POST() {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        const result = await User.findOneAndUpdate(
            { clerkUserId: session.userId },
            { $unset: { instagramTokens: "" } }
        );

        if (result) {
            console.log("✅ Instagram tokens cleared for user:", session.userId);
            return NextResponse.json({
                success: true,
                message: "Instagram connection cleared. Please reconnect."
            });
        } else {
            return NextResponse.json({
                success: false,
                message: "No Instagram tokens found to clear"
            });
        }
    } catch (error) {
        console.error("❌ Error resetting Instagram connection:", error);
        return NextResponse.json({ error: "Failed to reset Instagram connection" }, { status: 500 });
    }
}
