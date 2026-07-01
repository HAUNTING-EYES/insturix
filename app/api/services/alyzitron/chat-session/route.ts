import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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
import { AlyzitronR2Manager } from "../utils/r2-manager";
import { extractMediaUri, streamUrlToGCS } from "@/lib/alyzitron/transcription/downloader";
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
    const videoUrl = taskMediaUrl(task);
    if (!videoUrl) {
      return NextResponse.json({ error: "Task media URL missing" }, { status: 400 });
    }

    let session = await findChatSession(taskId, userId);
    const isNew = !session;
    if (!session) {
      session = await createChatSession(taskId, userId);
    }

    const existing = await findTranscription(taskId);
    const transcriptionReady = existing?.status === "completed" && !!existing.formattedTranscript;

    if (!transcriptionReady && existing?.status !== "processing") {
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
    if (error instanceof AlyzitronTaskOwnershipError) {
      return ownershipErrorResponse(error);
    }

    console.error("[Alyzitron/chat-session] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function triggerTranscription(
  taskId: string,
  videoUrl: string
): Promise<void> {
  try {
    await upsertTranscriptionProcessing(taskId, videoUrl);

    let deepgramUrl: string;

    if (videoUrl.startsWith("gs://")) {
      const bucketName = process.env.GCS_BUCKET_NAME || "";
      const objectPath = videoUrl.replace(`gs://${bucketName}/`, "");
      deepgramUrl = await GCSManager.getSignedReadUrl(objectPath);
    } else if (videoUrl.includes("r2.cloudflarestorage.com") || videoUrl.includes("r2.dev")) {
      console.log(`[ChatSession] Getting signed URL for R2 file: ${videoUrl}`);
      deepgramUrl = await AlyzitronR2Manager.getSignedReadUrl(videoUrl);
    } else {
      console.log(`[ChatSession] Extracting and streaming media: ${videoUrl}`);
      const extracted = await extractMediaUri(videoUrl);
      const gcsPath = `alyzitron/media/${taskId}.${extracted.mediaType === "audio" ? "mp3" : "mp4"}`;
      const mimeType = extracted.mediaType === "audio" ? "audio/mpeg" : "video/mp4";
      await streamUrlToGCS(extracted.downloadUrl, gcsPath, mimeType);
      deepgramUrl = await GCSManager.getSignedReadUrl(gcsPath);
    }

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

    console.log(`[ChatSession] Transcription completed for task: ${taskId}`);
  } catch (err: any) {
    console.error(`[ChatSession] Transcription failed: ${err.message}`);
    await upsertTranscriptionError(taskId, err.message).catch(() => {});
    throw err;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = req.nextUrl.searchParams.get("taskId");
    if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

    await requireOwnedAlyzitronTask(taskId, userId);
    const session = await findChatSession(taskId, userId);
    if (!session) return NextResponse.json({ session: null, messages: [] });

    return NextResponse.json({
      sessionId: session._id,
      messages: session.messages,
      hasSummary: !!session.summary,
      totalMessagesEver: session.totalMessagesEver,
    });
  } catch (error: any) {
    if (error instanceof AlyzitronTaskOwnershipError) {
      return ownershipErrorResponse(error);
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = req.nextUrl.searchParams.get("taskId");
    if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

    await requireOwnedAlyzitronTask(taskId, userId);
    await deleteChatSession(taskId, userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AlyzitronTaskOwnershipError) {
      return ownershipErrorResponse(error);
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
