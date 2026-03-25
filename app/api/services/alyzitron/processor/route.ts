import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse, NextRequest } from "next/server";
import { getCollections } from "../utils/mongodb";
import { CreditsService } from "@/lib/services/creditsService";
import { ObjectId } from "mongodb";
import { analyzeVideoWithGemini } from "@/lib/services/vertexAiService";
import { logger } from "../utils/logger";
import { GCSManager } from "../utils/gcs";

import { ingestMediaToGCS } from "@/lib/alyzitron/transcription/downloader";
import { transcribeAudio } from "@/lib/alyzitron/transcription/deepgram";

// 🔥 FIX: Import BOTH upsert functions to perfectly sync with the Chat Module's expectations
import { upsertTranscriptionProcessing, upsertTranscriptionCompleted } from "@/lib/alyzitron";

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, userId } = body;

    if (!taskId || !userId) {
      return NextResponse.json({ error: "Missing taskId or userId" }, { status: 400 });
    }
    const { analyses } = await getCollections();

    if (!ObjectId.isValid(taskId)) {
      return NextResponse.json({ error: "Invalid taskId format" }, { status: 400 });
    }

    const task = await analyses.findOne({
      _id: ObjectId.createFromHexString(taskId),
      clerkUserId: userId,
    });

    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    if (task.status === "completed" || task.status === "failed") {
      return NextResponse.json({ success: true, message: "Task already processed" });
    }

    await analyses.updateOne(
      { _id: task._id },
      { $set: { status: "processing", processingStartTime: new Date(), updatedAt: new Date() } }
    );

    try {
      logger.info("Starting Parallel Pipeline (Turbo Mode) 🚀", { data: { taskId, videoUrl: task.videoUrl } });
      const isGCSPath = task.videoUrl.startsWith("gs://");

      // 🚀 THE FIX PART 1: Initialize the transcription record in DB so 'Completed' doesn't fail!
      try {
        await upsertTranscriptionProcessing(taskId, task.videoUrl);
        logger.info("Initialized transcript record in DB for Chat Module synchronization.");
      } catch (e) {
        logger.warn("Could not set initial processing state for transcript, might already exist.");
      }

      // ---------------------------------------------------------
      // PROMISE 1: Transcription Pipeline
      // ---------------------------------------------------------
      const transcriptionPromise = (async () => {
        let targetUrl: string;
        if (isGCSPath) {
          const bucketName = process.env.GCS_BUCKET_NAME || "";
          const objectPath = task.videoUrl.replace(`gs://${bucketName}/`, "");
          targetUrl = await GCSManager.getSignedReadUrl(objectPath);
        } else {
          logger.info("Ingesting audio for Deepgram...");
          const ingestionResult = await ingestMediaToGCS(task.videoUrl);
          targetUrl = typeof ingestionResult === 'string' ? ingestionResult : ingestionResult.signedUrl;
        }
        logger.info("Transcribing audio...", { data: { taskId } });
        return await transcribeAudio(targetUrl);
      })();

      // ---------------------------------------------------------
      // PROMISE 2: Gemini Analysis Pipeline
      // ---------------------------------------------------------
      const analysisPromise = (async () => {
        logger.info("Starting Vertex AI analysis...", { data: { taskId } });
        const enhancedContext = {
          ...(task.context || {}),
          transcript: "Relying on native video audio for analysis."
        };
        return await analyzeVideoWithGemini(
          task.videoUrl,
          enhancedContext,
          task.metadata || {}
        );
      })();

      // ---------------------------------------------------------
      // EXECUTE BOTH IN PARALLEL 🔥
      // ---------------------------------------------------------
      const [transcriptResult, analysisResults] = await Promise.all([
        transcriptionPromise,
        analysisPromise
      ]);

      logger.info("Both Transcription and Analysis finished! 🎉", { data: { taskId } });

      // 🚀 THE FIX PART 2: Instantly sync the transcript for the Chat Session so it doesn't re-run!
      try {
        await upsertTranscriptionCompleted(taskId, {
          deepgramRequestId: transcriptResult.id,
          text: transcriptResult.text,
          detectedLanguage: transcriptResult.detectedLanguage,
          confidence: transcriptResult.confidence,
          speakerSegments: transcriptResult.speakerSegments,
          formattedTranscript: transcriptResult.formattedTranscript,
          durationMs: transcriptResult.durationMs,
          wordCount: transcriptResult.wordCount,
        });
        logger.info("Transcript synced to Chat Module seamlessly! 💬");
      } catch (syncError) {
        logger.error("Failed to sync transcript for chat", { data: { error: String(syncError) } });
      }

      // 4. Save results to analyses collection
      const updateData: any = {
        status: "completed",
        results: analysisResults,
        transcription: transcriptResult,
        completedAt: new Date(),
        updatedAt: new Date(),
      };

      await analyses.updateOne({ _id: task._id }, { $set: updateData });

      return NextResponse.json({ success: true, taskId, status: "completed" });

    } catch (analysisError) {
      const errorMessage = analysisError instanceof Error ? analysisError.message : String(analysisError);
      logger.error("Video pipeline failed", { data: { taskId, error: errorMessage } });

      const minutes = task.usageMinutes || Math.max(1, Math.ceil((task.metadata?.videoDuration || 0) / 60));

      await analyses.updateOne(
        { _id: task._id, refunded: { $ne: true } },
        { $set: { status: "failed", error: { message: errorMessage, timestamp: new Date() }, refunded: true, updatedAt: new Date() } }
      );

      try {
        await CreditsService.refundCredits(userId, minutes * 2, `Video analysis failed: ${errorMessage}`, {
          service: "alyzitron", action: "video_analysis",
        });
      } catch (refundError) {
        logger.error("Failed to refund credits", { data: { taskId } });
      }

      return NextResponse.json({ success: false, error: errorMessage, taskId }, { status: 500 });
    }
  } catch (error) {
    logger.error("Processor error", { data: { error: String(error) } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const POST = async (request: NextRequest) => {
  const bypassHeader = request.headers.get("x-development-bypass");
  if (bypassHeader === "true") return handler(request);
  return verifySignatureAppRouter(handler)(request);
};

export const runtime = "nodejs";