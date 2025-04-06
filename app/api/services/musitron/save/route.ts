import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Musitron from "@/schemas/Musitron";
import connectToDatabase from "@/schemas/ConnectToDatabase";

export async function POST(req: Request) {
  try {
    const session = await auth();
    
    if (!session?.userId) {
      return NextResponse.json(
        { error: "Unauthorized. User not authenticated." },
        { status: 401 }
      );
    }

    const { tracks } = await req.json();
    
    if (!tracks || !Array.isArray(tracks)) {
      return NextResponse.json(
        { error: "Invalid request. Tracks data is required." },
        { status: 400 }
      );
    }

    // Connect to database
    await connectToDatabase(process.env.MONGODB_URI as string);

    // Find existing user record or create a new one
    const existingRecord = await Musitron.findOne({ userId: session.userId });

    if (existingRecord) {
      // Add new tracks to the existing record, avoiding duplicates
      for (const track of tracks) {
        // Check if track with this ID already exists
        const trackExists = existingRecord.tracks.some(
          (existingTrack: { id: string }) => existingTrack.id === track.id
        );

        if (!trackExists) {
          existingRecord.tracks.push(track);
        }
      }

      await existingRecord.save();
      return NextResponse.json({
        success: true,
        message: "Tracks added to existing record",
      });
    } else {
      // Create a new record for this user
      const newRecord = new Musitron({
        userId: session.userId,
        tracks,
      });

      await newRecord.save();
      return NextResponse.json({
        success: true,
        message: "New tracks record created",
      });
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to save tracks" },
      { status: 500 }
    );
  }
} 