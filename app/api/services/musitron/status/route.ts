import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

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
            createTime: item.createTime?.toString(),
            duration: item.duration,
          })
        );

        // Get the user ID from Clerk
        const session = await auth();
        
        // Save tracks to MongoDB if user is authenticated
        if (session?.userId && formattedTracks.length > 0) {
          try {
            // Use internal fetch on server side
            await fetch(`${SITE_URL}/api/services/musitron/save`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                // Include cookies to pass authentication
                "Cookie": req.headers.get("cookie") || ""
              },
              body: JSON.stringify({ tracks: formattedTracks }),
              credentials: "include",
            });
          } catch (error) {
            console.error("Error saving tracks to database:", error);
            // Continue with the response even if saving fails
          }
        }

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
