import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse, NextRequest } from "next/server";
import { getCollections } from "../utils/mongodb";
import { processRefund } from "@/lib/services/tasks/simple-refund";
import { ObjectId } from "mongodb";
import { analyzeVideoWithGemini } from "@/lib/services/vertexAiService";
import { logger } from "../utils/logger";


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

    // 3. Perform video analysis with Vertex AI
    try {
      logger.info("Starting Vertex AI analysis", {
        data: { taskId, userId, videoUrl: task.videoUrl },
      });

      // Call Vertex AI for analysis with all required data
      const analysisResults = await analyzeVideoWithGemini(
        task.videoUrl,
        task.context || {},
        task.metadata || {}
      );

      logger.info("Vertex AI analysis completed", {
        data: { taskId, userId },
      });

      // 4. Save results and mark as completed (MongoDB)
      const updateData: any = {
        status: "completed",
        results: analysisResults,
        completedAt: new Date(),
        updatedAt: new Date(),
      };

      await analyses.updateOne({ _id: task._id }, { $set: updateData });

      logger.info("Analysis completed successfully", {
        data: { taskId, userId },
      });

      return NextResponse.json({
        success: true,
        taskId,
        status: "completed",
      });
    } catch (analysisError) {
      // 5. Handle analysis failure with robust refund logic
      const errorMessage =
        analysisError instanceof Error
          ? analysisError.message
          : "Analysis failed";
      logger.error("Video analysis failed", {
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
          // No modification: either already refunded or update didn't match
          const fresh = await analyses.findOne({ _id: task._id });
          if (fresh?.refunded) {
            shouldRefund = false;
            logger.info("Task already marked refunded, skipping refund", {
              data: { taskId },
            });
          } else {
            // Update didn't modify but refunded not set; we'll still attempt refund
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
        // Proceed to refund as a best-effort
        shouldRefund = true;
      }

      if (shouldRefund) {
        try {
          // Perform refund
          await processRefund("alyzitron", "analysis", userId, minutes);
          logger.info("Credits refunded after analysis failure", {
            data: { taskId, userId, minutes },
          });

          // Ensure task has refunded flag set (best-effort)
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
              error:
                refundError instanceof Error
                  ? refundError.message
                  : String(refundError),
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
    // Correct usage: wrap the handler
    return verifySignatureAppRouter(handler)(request);
  }
};

export const runtime = "nodejs";
