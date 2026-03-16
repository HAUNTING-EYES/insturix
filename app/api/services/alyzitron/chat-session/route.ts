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
import { transcribeAudio } from "@/lib/alyzitron/transcription/deepgram";
import { getGcsSignedUrl } from "@/app/dashboard/alyzitron/utils/GcsSignedUrl"; // Your existing file with getGcsSignedUrl

/**
 * POST /api/alyzitron/chat-session
 *
 * Creates (or returns existing) chat session for a task.
 * Automatically triggers transcription if not already available:
 *   - YouTube URLs are passed directly to Deepgram (public)
 *   - GCS URLs (gs://...) are converted to a signed URL first
 *
 * Body: { taskId: string, videoUrl: string, userId?: string }
 * Returns: { sessionId, isNew, transcriptionStatus, messages, hasSummary }
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

    if (!transcriptionReady) {
      // Resolve the public URL to pass to Deepgram
      let publicUrl: string;
      if (videoUrl.startsWith("gs://")) {
        publicUrl = await getGcsSignedUrl(videoUrl);
      } else {
        // YouTube or any other public URL — pass directly
        publicUrl = videoUrl;
      }

      // Fire transcription in the background — don't await so session creation
      // returns immediately. The chat route reads transcription from DB each turn,
      // so it will pick it up once ready.
      triggerTranscription(taskId, videoUrl, publicUrl).catch((err) => {
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
 * Marks as processing → calls Deepgram → saves result.
 * Errors are caught and saved to DB without crashing the session response.
 */
async function triggerTranscription(
  taskId: string,
  videoUrl: string,   // original URL (stored in DB)
  publicUrl: string   // resolved public URL (passed to Deepgram)
): Promise<void> {
  try {
    await upsertTranscriptionProcessing(taskId, videoUrl);
    const result = await transcribeAudio(publicUrl);
    await upsertTranscriptionCompleted(taskId, {
      deepgramRequestId:  result.id,
      text: result.text,
      detectedLanguage:   result.detectedLanguage,
      confidence: result.confidence,
      speakerSegments: result.speakerSegments,
      formattedTranscript: result.formattedTranscript,
      durationMs: result.durationMs,
      wordCount: result.wordCount,
    });
  } catch (err: any) {
    await upsertTranscriptionError(taskId, err.message).catch(() => {});
    throw err; // re-throw so the caller's .catch() can log it
  }
}

/**
 * GET /api/alyzitron/chat-session?taskId=xxx&userId=xxx
 *
 * Returns stored chat history for a task.
 * Response: { sessionId, messages, hasSummary, totalMessagesEver }
 *           or { session: null, messages: [] } if no session exists yet.
 */
export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const userId  = req.nextUrl.searchParams.get("userId") ?? null;

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const session = await findChatSession(taskId, userId);

    if (!session) {
      return NextResponse.json({ session: null, messages: [] });
    }

    return NextResponse.json({
      sessionId:         session._id,
      messages:          session.messages,
      hasSummary:        !!session.summary,
      totalMessagesEver: session.totalMessagesEver,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/alyzitron/chat-session?taskId=xxx&userId=xxx
 *
 * Clears the chat history and summary for a task.
 * The transcription record is unaffected.
 */
export async function DELETE(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const userId  = req.nextUrl.searchParams.get("userId") ?? null;

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    await deleteChatSession(taskId, userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}