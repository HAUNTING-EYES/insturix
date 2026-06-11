import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * POST /api/services/uploaderx/linkedin/reset
 * Disconnects LinkedIn by removing tokens from the database.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    const result = await User.findOneAndUpdate(
      { clerkUserId: session.userId },
      {
        $unset: {
          linkedinTokens: "",
        },
      }
    );

    if (!result) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "LinkedIn disconnected successfully",
    });
  } catch (error) {
    console.error(" LinkedIn disconnect error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect LinkedIn" },
      { status: 500 } 
    );
  }
}
