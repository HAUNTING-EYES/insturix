import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Musitron from "@/schemas/Musitron";
import connectToDatabase from "@/schemas/ConnectToDatabase";

const MUSITRON_DB = process.env.MONGODB_URI as string;

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.userId) {
      return NextResponse.json(
        { error: "Unauthorized. User not authenticated." },
        { status: 401 }
      );
    }
    // Connect to database
    if (!MUSITRON_DB) {
      return NextResponse.json(
        { error: "Database connection string not configured." },
        { status: 500 }
      );
    }
    
    await connectToDatabase(MUSITRON_DB as string);

    // Find tracks for this user
    const userRecord = await Musitron.findOne({ userId: session.userId });

    if (!userRecord) {
      return NextResponse.json({
        success: true,
        tracks: [], // Return empty array if no records found
      });
    }

    return NextResponse.json({
      success: true,
      tracks: userRecord.tracks,
    });
  } catch (error) {
    console.error("Error fetching Musitron history:", error);
    return NextResponse.json(
      { error: "Failed to fetch track history" },
      { status: 500 }
    );
  }
} 