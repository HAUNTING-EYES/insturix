import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse, NextRequest } from "next/server";
import { getCollections } from "../utils/mongodb";
import { CreditsService } from "@/lib/services/creditsService";
import { ObjectId } from "mongodb";
import { analyzeVideoWithGemini } from "@/lib/services/vertexAiService";
import { logger } from "../utils/logger";

// Import our new ingestion and transcription pipeline
import { ingestMediaToGCS } from "@/lib/alyzitron/transcription/downloader";
import { transcribeAudio } from "@/lib/alyzitron/transcription/deepgram";

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, userId } = body;

    if (!taskId || !userId) {
      logger.error("Missing required fields in QStash payload", {
        data: { taskId, userId },
      });
      return NextResponse.json(
        { error: "Missing taskId or userId" },
        { status: 400 }
      );
    }
    const { analyses } = await getCollections();

    // Validate ObjectId format
    if (!ObjectId.isValid(taskId)) {
      return NextResponse.json(
        { error: "Invalid taskId format" },
        { status: 400 }
      );
    }

    // 1. Fetch the task
    const task = await analyses.findOne({
      _id: ObjectId.createFromHexString(taskId),
      clerkUserId: userId,
    });

    if (!task) {
      logger.error("Task not found", { data: { taskId, userId } });
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Prevent re-processing if already completed/failed
    if (task.status === "completed" || task.status === "failed") {
      logger.warn("Task already processed", {
        data: { taskId, userId, status: task.status },
      });
      return NextResponse.json({
        success: true,
        message: "Task already processed",
      });
    }

    // 2. Update status to processing (MongoDB)
    await analyses.updateOne(
      { _id: task._id },
      {
        $set: {
          status: "processing",
          processingStartTime: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    // 3. Perform Multi-Step Pipeline (Ingest -> Transcribe -> Analyze)
    try {
      logger.info("Starting Alyzitron Pipeline", {
        data: { taskId, userId, originalUrl: task.videoUrl },
      });

      // --- STEP 3.1: Download to GCS ---
      logger.info("Step 1: Ingesting media to GCS...", { data: { taskId } });
      const gcsSignedUrl = await ingestMediaToGCS(task.videoUrl);

      // --- STEP 3.2: Transcribe via Deepgram ---
      logger.info("Step 2: Transcribing audio from GCS...", { data: { taskId } });
      const transcriptResult = await transcribeAudio(gcsSignedUrl);

      // --- STEP 3.3: Analyze with Gemini ---
      logger.info("Step 3: Starting Vertex AI analysis...", { data: { taskId } });

      // Inject the Deepgram transcript into the context for Gemini
      const enhancedContext = {
        ...(task.context || {}),
        transcript: transcriptResult.formattedTranscript,
      };

      // Call Vertex AI using the stable GCS URL instead of the raw YouTube link
      const analysisResults = await analyzeVideoWithGemini(
        gcsSignedUrl,
        enhancedContext,
        task.metadata || {}
      );

      logger.info("Vertex AI analysis completed", {
        data: { taskId, userId },
      });

      // 4. Save ALL results and mark as completed (MongoDB)
      const updateData: any = {
        status: "completed",
        results: analysisResults,
        transcription: transcriptResult, // <-- Saving Deepgram output to DB
        completedAt: new Date(),
        updatedAt: new Date(),
      };

      await analyses.updateOne({ _id: task._id }, { $set: updateData });

      logger.info("Analysis pipeline completed successfully", {
        data: { taskId, userId },
      });

      return NextResponse.json({
        success: true,
        taskId,
        status: "completed",
      });

    } catch (analysisError) {
      // 5. Handle analysis failure with robust refund logic
      const errorMessage = (() => {
        if (analysisError instanceof Error) {
          const msg = analysisError.message;
          if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("SocketTimeout")) {
            return "Network error: Failed to reach AI analysis service. Please retry.";
          }
          if (msg.includes("permission") || msg.includes("API_KEY") || msg.includes("access denied")) {
            return "Configuration error: AI service access denied.";
          }
          if (msg.includes("quota") || msg.includes("429")) {
            return "Server busy: AI analysis quota exceeded. Please wait a few minutes.";
          }
          if (msg.includes("invalid") || msg.includes("format") || msg.includes("yt-dlp")) {
            return "Processing error: The video format is not supported, the link is invalid, or the file is corrupted.";
          }
          return msg;
        }
        return "Video analysis failed due to an unexpected error.";
      })();

      logger.error("Video pipeline failed", {
        data: {
          taskId,
          userId,
          error: errorMessage,
          videoUrl: task.videoUrl,
        },
      });

      // Compute refund minutes (fallback to 1 minute if unknown)
      const minutes =
        task.usageMinutes ||
        Math.max(1, Math.ceil((task.metadata?.videoDuration || 0) / 60));

      // Try to atomically mark task as failed and refunded when possible
      let shouldRefund = true;
      try {
        const updateResult = await analyses.updateOne(
          { _id: task._id, refunded: { $ne: true } },
          {
            $set: {
              status: "failed",
              error: { message: errorMessage, timestamp: new Date() },
              refunded: true,
              updatedAt: new Date(),
            },
          }
        );

        if (updateResult.modifiedCount === 0) {
          const fresh = await analyses.findOne({ _id: task._id });
          if (fresh?.refunded) {
            shouldRefund = false;
            logger.info("Task already marked refunded, skipping refund", {
              data: { taskId },
            });
          } else {
            logger.warn("Failed to mark task as refunded; proceeding to refund anyway", {
              data: { taskId },
            });
            shouldRefund = true;
          }
        }
      } catch (updateErr) {
        logger.error("Failed to update task status/refunded flag", {
          data: { taskId, error: updateErr instanceof Error ? updateErr.message : String(updateErr) },
        });
        shouldRefund = true;
      }

      if (shouldRefund) {
        try {
          const creditsToRefund = minutes * 2;
          await CreditsService.refundCredits(userId, creditsToRefund, `Video analysis failed: ${errorMessage}`, {
            service: "alyzitron",
            action: "video_analysis",
          });
          logger.info("Credits refunded after analysis failure", {
            data: { taskId, userId, minutes, creditsToRefund },
          });

          try {
            await analyses.updateOne(
              { _id: task._id },
              { $set: { refunded: true, updatedAt: new Date() } }
            );
          } catch (setFlagErr) {
            logger.warn("Failed to set refunded flag after refund", {
              data: { taskId, error: setFlagErr instanceof Error ? setFlagErr.message : String(setFlagErr) },
            });
          }
        } catch (refundError) {
          logger.error("Failed to refund credits", {
            data: {
              taskId,
              userId,
              error: refundError instanceof Error ? refundError.message : String(refundError),
            },
          });
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: "Analysis failed, credits refunded (or attempted)",
          taskId,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("Processor error", {
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Development bypass logic
export const POST = async (request: NextRequest) => {
  const bypassHeader = request.headers.get("x-development-bypass");
  const isDevelopmentBypass = bypassHeader === "true";

  if (isDevelopmentBypass) {
    logger.warn("Development bypass of QStash signature verification enabled");
    return handler(request);
  } else {
    return verifySignatureAppRouter(handler)(request);
  }
};

export const runtime = "nodejs";