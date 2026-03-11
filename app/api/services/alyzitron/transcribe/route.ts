import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/alyzitron/transcription/deepgram";
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
 * Body:    { videoId: string, audioUrl: string }
 * Returns: { status, detectedLanguage, wordCount, durationMs, cached }
 */
export async function POST(req: NextRequest) {
  let videoId: string | undefined;

  try {
    const body = await req.json();
    videoId = body.videoId;
    const { audioUrl } = body;

    if (!videoId || !audioUrl) {
      return NextResponse.json(
        { error: "videoId and audioUrl are required" },
        { status: 400 }
      );
    }

    // Return cached result if already transcribed
    const existing = await findTranscription(videoId);
    if (existing?.status === "completed") {
      return NextResponse.json({
        status: "completed",
        detectedLanguage: existing.detectedLanguage,
        wordCount: existing.wordCount,
        durationMs: existing.durationMs,
        cached: true,
      });
    }

    // Mark as processing — upsert so re-triggering a failed job works cleanly
    await upsertTranscriptionProcessing(videoId, audioUrl);

    const result = await transcribeAudio(audioUrl);

    await upsertTranscriptionCompleted(videoId, {
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

    if (videoId) {
      await upsertTranscriptionError(videoId, error.message).catch(() => {});
    }

    return NextResponse.json(
      { error: "Transcription failed", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/alyzitron/transcribe?videoId=xxx
 *
 * Returns transcription status and metadata.
 * The full transcript is intentionally excluded — it is loaded server-side
 * by the chat route to keep response payloads small.
 *
 * Possible status values: not_found | processing | completed | error
 */
export async function GET(req: NextRequest) {
  try {
    const videoId = req.nextUrl.searchParams.get("videoId");
    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    const transcription = await findTranscription(videoId);
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