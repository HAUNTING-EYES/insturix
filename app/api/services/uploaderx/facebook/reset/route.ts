import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * POST /api/services/uploaderx/facebook/reset
 * Clears existing Facebook tokens (useful when pages array is empty)
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
            { $unset: { facebookTokens: "" } }
        );

        if (result) {
            return NextResponse.json({ 
                success: true, 
                message: "Facebook connection cleared. Please reconnect." 
            });
        } else {
            return NextResponse.json({ 
                success: false, 
                message: "No Facebook tokens found to clear" 
            });
        }
    } catch (error) {
        console.error("❌ Error resetting Facebook connection:", error);
        return NextResponse.json({ error: "Failed to reset Facebook connection" }, { status: 500 });
    }
}
