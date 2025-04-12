import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Musitron from "@/schemas/Musitron";
import connectToDatabase from "@/schemas/ConnectToDatabase";

const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_API_URL = process.env.SUNO_URI as string;
const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

if (!SUNO_API_KEY) {
  throw new Error("SUNO_API_KEY environment variable is not set");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 }
      );
    }
    const response = await fetch(
      `${SUNO_API_URL}/generate/record-info?taskId=${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${SUNO_API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    if (response.status === 401) {
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 }
      );
    }

    if (response.status === 404) {
      return NextResponse.json(
        {
          status: "failed",
          error:
            "Task not found. The music generation might have failed or timed out.",
        },
        { status: 404 }
      );
    }

    if (!response.ok) {
      let errorMessage = "Failed to check task status";
      try {
        const errorData = await response.json();
        errorMessage = errorData.msg || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }
    const data = await response.json();
    if (data.code === 200) {
      if (data.data?.status === "SUCCESS") {
        const musicData = data.data.response?.sunoData || [];
        const formattedTracks = musicData.map(
          (item: {
            id: string;
            audioUrl: string;
            sourceAudioUrl: string;
            streamAudioUrl: string;
            sourceStreamAudioUrl: string;
            imageUrl: string;
            sourceImageUrl: string;
            prompt: string;
            modelName: string;
            title: string;
            tags: string[];
            createTime?: number;
            duration: number;
          }) => ({
            id: item.id,
            audio_url: item.audioUrl,
            source_audio_url: item.sourceAudioUrl,
            stream_audio_url: item.streamAudioUrl,
            source_stream_audio_url: item.sourceStreamAudioUrl,
            image_url: item.imageUrl,
            source_image_url: item.sourceImageUrl,
            prompt: item.prompt,
            model_name: item.modelName,
            title: item.title,
            tags: Array.isArray(item.tags) ? item.tags.join(", ") : item.tags,
            createTime: item.createTime?.toString() || new Date().toString(),
            duration: item.duration,
          })
        );

        // Get the user ID from Clerk
        const { userId } = await auth();
        
        // Save tracks to MongoDB if user is authenticated
        if (userId && formattedTracks.length > 0) {
          try {
            // Connect to database directly
            await connectToDatabase(process.env.MONGODB_URI as string);
            
            // Find existing user record or create a new one
            const existingRecord = await Musitron.findOne({ userId });
            
            if (existingRecord) {
              // Add new tracks to the existing record, avoiding duplicates
              for (const track of formattedTracks) {
                // Check if track with this ID already exists
                const trackExists = existingRecord.tracks.some(
                  (existingTrack: { id: string }) => existingTrack.id === track.id
                );
                
                if (!trackExists) {
                  existingRecord.tracks.push(track);
                }
              }
              
              await existingRecord.save();
              console.log("Tracks added to existing record");
            } else {
              // Create a new record for this user
              const newRecord = new Musitron({
                userId,
                tracks: formattedTracks,
              });
              
              await newRecord.save();
              console.log("New tracks record created");
            }
          } catch (error) {
            console.error("Error saving tracks to database:", error);
            // Continue with the response even if saving fails
          }
        } else if (!userId) {
          console.log("User not authenticated, skipping database save");
        } else if (formattedTracks.length === 0) {
          console.log("No tracks to save");
        }

        // Log the formatted tracks for debugging
        console.log(`Returning ${formattedTracks.length} tracks to client`);
        console.log("Track details:", formattedTracks.map((t: { id: string; title: string }) => ({id: t.id, title: t.title})));

        return NextResponse.json({
          status: "complete",
          data: formattedTracks,
        });
      } else if (data.data?.status === "FAILED" || data.data?.errorMessage) {
        return NextResponse.json({
          status: "failed",
          error: data.data.errorMessage || data.msg || "Task failed",
        });
      } else {
        return NextResponse.json({
          status: "pending",
          message: "Generating your music...",
        });
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: data.msg || "Failed to check task status" },
        { status: response.status }
      );
    }
    return NextResponse.json({
      status: "pending",
      message: "Waiting for task status...",
    });
  } catch (error) {
    console.error("Error checking task status:", error);
    return NextResponse.json(
      { error: "Failed to check task status" },
      { status: 500 }
    );
  }
}
