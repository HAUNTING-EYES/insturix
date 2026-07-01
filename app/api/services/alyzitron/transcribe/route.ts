import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { transcribeAudio } from "@/lib/alyzitron/transcription/transcriptionService";
import {
  findTranscription,
  upsertTranscriptionProcessing,
  upsertTranscriptionCompleted,
  upsertTranscriptionError,
} from "@/lib/alyzitron";
import {
  AlyzitronTaskOwnershipError,
  requireOwnedAlyzitronTask,
} from "../utils/task-ownership";

function taskMediaUrl(task: any): string | null {
  return typeof task?.videoUrl === "string" && task.videoUrl.trim() ? task.videoUrl : null;
}

function ownershipErrorResponse(error: AlyzitronTaskOwnershipError) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

export async function POST(req: NextRequest) {
  let taskId: string | undefined;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    taskId = body.taskId;

    if (!taskId) {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }

    const task = await requireOwnedAlyzitronTask(taskId, userId);
    const audioUrl = taskMediaUrl(task);
    if (!audioUrl) {
      return NextResponse.json({ error: "Task media URL missing" }, { status: 400 });
    }

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
    if (error instanceof AlyzitronTaskOwnershipError) {
      return ownershipErrorResponse(error);
    }

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

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = req.nextUrl.searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    await requireOwnedAlyzitronTask(taskId, userId);
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
    if (error instanceof AlyzitronTaskOwnershipError) {
      return ownershipErrorResponse(error);
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
