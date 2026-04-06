import { NextRequest, NextResponse } from "next/server";
import {
  findChatSession,
  deleteChatSession,
  createChatSession,
  findTranscription,
  upsertTranscriptionProcessing,
  upsertTranscriptionCompleted,
  upsertTranscriptionError,
} from "@/lib/alyzitron";
import { transcribeAudio } from "@/lib/alyzitron/transcription/transcriptionService";
import { GCSManager } from "../utils/gcs";
import { extractMediaUri, streamUrlToGCS } from "@/lib/alyzitron/transcription/downloader";

/**
 * POST /api/alyzitron/chat-session
 */
export async function POST(req: NextRequest) {
  let taskId: string | undefined;

  try {
    const body = await req.json();
    taskId = body.taskId;
    const { videoUrl, userId } = body;

    if (!taskId || !videoUrl) {
      return NextResponse.json(
        { error: "taskId and videoUrl are required" },
        { status: 400 }
      );
    }

    // 1. Find or create chat session
    let session = await findChatSession(taskId, userId ?? null);
    const isNew = !session;
    if (!session) {
      session = await createChatSession(taskId, userId ?? null);
    }

    // 2. Check transcription — auto-trigger if missing
    const existing = await findTranscription(taskId);
    const transcriptionReady =
      existing?.status === "completed" && !!existing.formattedTranscript;

    if (!transcriptionReady && existing?.status !== "processing") {
      // 🚀 THE FIX: Resolve the correct URL for Deepgram
      triggerTranscription(taskId, videoUrl).catch((err) => {
        console.error("[Alyzitron/chat-session] Background transcription error:", err);
      });
    }

    return NextResponse.json({
      sessionId: session._id,
      isNew,
      transcriptionStatus: transcriptionReady ? "completed" : (existing?.status ?? "processing"),
      messages: session.messages,
      hasSummary: !!session.summary,
      totalMessagesEver: session.totalMessagesEver,
    });
  } catch (error: any) {
    console.error("[Alyzitron/chat-session] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Background transcription runner.
 * Now correctly handles YouTube vs GCS paths.
 */
async function triggerTranscription(
  taskId: string,
  videoUrl: string
): Promise<void> {
  try {
    await upsertTranscriptionProcessing(taskId, videoUrl);

    let deepgramUrl: string;

    if (videoUrl.startsWith("gs://")) {
      // Case A: File is in GCS, get signed URL
      const bucketName = process.env.GCS_BUCKET_NAME || "";
      const objectPath = videoUrl.replace(`gs://${bucketName}/`, "");
      deepgramUrl = await GCSManager.getSignedReadUrl(objectPath);
    } else {
      // Case B: External URL (YouTube, Instagram, etc) - Use Apify + Stream to GCS
      console.log(`[ChatSession] Extracting and streaming media: ${videoUrl}`);
      
      // 1. Extract direct URI
      const extracted = await extractMediaUri(videoUrl);
      
      // 2. Stream to GCS (consistent with main processor)
      const gcsPath = `alyzitron/media/${taskId}.${extracted.mediaType === "audio" ? "mp3" : "mp4"}`;
      const mimeType = extracted.mediaType === "audio" ? "audio/mpeg" : "video/mp4";
      
      const gcsRes = await streamUrlToGCS(extracted.downloadUrl, gcsPath, mimeType);
      
      // 3. Get signed URL for transcription service
      deepgramUrl = await GCSManager.getSignedReadUrl(gcsPath);
    }

    // Now call transcribeAudio with the resolved .mp3 URL
    const result = await transcribeAudio(deepgramUrl);

    await upsertTranscriptionCompleted(taskId, {
      deepgramRequestId: result.id,
      text: result.text,
      detectedLanguage: result.detectedLanguage,
      confidence: result.confidence,
      speakerSegments: result.speakerSegments,
      formattedTranscript: result.formattedTranscript,
      durationMs: result.durationMs,
      wordCount: result.wordCount,
    });

    console.log(`✅ [ChatSession] Transcription completed for task: ${taskId}`);

  } catch (err: any) {
    console.error(`❌ [ChatSession] Transcription failed: ${err.message}`);
    await upsertTranscriptionError(taskId, err.message).catch(() => { });
    throw err;
  }
}

/**
 * GET and DELETE handlers remain the same...
 */
export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const userId = req.nextUrl.searchParams.get("userId") ?? null;

    if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

    const session = await findChatSession(taskId, userId);
    if (!session) return NextResponse.json({ session: null, messages: [] });

    return NextResponse.json({
      sessionId: session._id,
      messages: session.messages,
      hasSummary: !!session.summary,
      totalMessagesEver: session.totalMessagesEver,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const userId = req.nextUrl.searchParams.get("userId") ?? null;

    if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

    await deleteChatSession(taskId, userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}