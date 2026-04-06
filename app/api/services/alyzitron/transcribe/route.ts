import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/alyzitron/transcription/transcriptionService";
import {
  findTranscription,
  upsertTranscriptionProcessing,
  upsertTranscriptionCompleted,
  upsertTranscriptionError,
} from "@/lib/alyzitron";

/**
 * POST /api/alyzitron/transcribe
 *
 * Triggers transcription for a video. Idempotent — returns the cached result
 * if already completed. Deepgram's prerecorded API is synchronous so this
 * resolves in a single call (no polling). For very long videos consider
 * offloading to a background job.
 *
 * Body:    { taskId: string, audioUrl: string }
 * Returns: { status, detectedLanguage, wordCount, durationMs, cached }
 */
export async function POST(req: NextRequest) {
  let taskId: string | undefined;

  try {
    const body = await req.json();
    taskId = body.taskId;
    const { audioUrl } = body;

    if (!taskId || !audioUrl) {
      return NextResponse.json(
        { error: "taskId and audioUrl are required" },
        { status: 400 }
      );
    }

    // Return cached result only if completed AND has real transcript content.
    // Guards against docs left in a "completed" state with empty data from a
    // prior partial failure (e.g. process died before upsertTranscriptionCompleted ran).
    const existing = await findTranscription(taskId);
    if (existing?.status === "completed" && existing.formattedTranscript) {
      return NextResponse.json({
        status: "completed",
        detectedLanguage: existing.detectedLanguage,
        wordCount: existing.wordCount,
        durationMs: existing.durationMs,
        cached: true,
      });
    }

    // Mark as processing — upsert so re-triggering a failed/partial job works cleanly
    await upsertTranscriptionProcessing(taskId, audioUrl);

    const result = await transcribeAudio(audioUrl);

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

    return NextResponse.json({
      status: "completed",
      detectedLanguage: result.detectedLanguage,
      wordCount: result.wordCount,
      durationMs: result.durationMs,
      cached: false,
    });
  } catch (error: any) {
    console.error("[Alyzitron/transcribe] Error:", error);

    if (taskId) {
      await upsertTranscriptionError(taskId, error.message).catch(() => {});
    }

    return NextResponse.json(
      { error: "Transcription failed", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/alyzitron/transcribe?taskId=xxx
 *
 * Returns transcription status and metadata.
 * The full transcript is intentionally excluded — it is loaded server-side
 * by the chat route to keep response payloads small.
 *
 * Possible status values: not_found | processing | completed | error
 */
export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const transcription = await findTranscription(taskId);
    if (!transcription) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    return NextResponse.json({
      status: transcription.status,
      detectedLanguage: transcription.detectedLanguage,
      confidence: transcription.confidence,
      wordCount: transcription.wordCount,
      durationMs: transcription.durationMs,
      ...(transcription.status === "error" && {
        errorMessage: transcription.errorMessage,
      }),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}