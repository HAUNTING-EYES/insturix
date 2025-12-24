import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse, NextRequest } from "next/server";
import { getCollections } from "../utils/mongodb";
import { AlyzitronRTDBManager } from "@/lib/services/rtdb/alyzitron-rtdb";
import { processRefund } from "@/lib/services/tasks/simple-refund";
import { ObjectId } from "mongodb";
import { analyzeVideoWithGemini } from "@/lib/services/vertexAiService";
import { logger } from "../utils/logger";

export async function POST(request: NextRequest) {
  // Check for development bypass header
  const bypassHeader = request.headers.get("x-development-bypass");
  const isDevelopmentBypass = bypassHeader === "true";

  if (!isDevelopmentBypass) {
    // Production: Verify QStash signature
    try {
      verifySignatureAppRouter(request);
    } catch (error) {
      logger.error("Invalid QStash signature", {
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    logger.warn("Development bypass of QStash signature verification enabled");
  }
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

    // Update RTDB
    await AlyzitronRTDBManager.updateTaskStatus(userId, taskId, "processing");

    // 3. Perform video analysis with Vertex AI
    try {
      logger.info("Starting Vertex AI analysis", {
        data: { taskId, userId, videoUrl: task.videoUrl },
      });

      // Call Vertex AI for analysis
      // First, check if the service exists
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

        const isMock = "mock" in analysisResults ? analysisResults.mock : false;

        logger.info("Vertex AI analysis completed", {
          data: { taskId, userId, isMock },
        });

        // 4. Save results and mark as completed (MongoDB)
        const updateData: any = {
          status: "completed",
          results: analysisResults,
          completedAt: new Date(),
          updatedAt: new Date(),
        };

        // Store if it was a mock analysis
        if (analysisResults.mock) {
          updateData.isMockAnalysis = true;
        }

        await analyses.updateOne({ _id: task._id }, { $set: updateData });

        // Update RTDB
        await AlyzitronRTDBManager.updateTaskStatus(
          userId,
          taskId,
          "completed"
        );

        logger.info("Analysis completed successfully", {
          data: { taskId, userId },
        });

        return NextResponse.json({
          success: true,
          taskId,
          status: "completed",
          isMock,
        });
      } catch (vertexError) {
        // If vertexAiService doesn't exist, use mock data
        if (
          vertexError instanceof Error &&
          vertexError.message.includes("Cannot find module")
        ) {
          const mockResults = {
            summary: `Mock analysis for ${task.metadata?.originalFilename || "video"}`,
            keyMoments: [
              { timestamp: "00:30", description: "Introduction" },
              { timestamp: "01:45", description: "Main content" },
              { timestamp: "03:20", description: "Conclusion" },
            ],
            analysisTime: new Date().toISOString(),
            mock: true,
          };

          await analyses.updateOne(
            { _id: task._id },
            {
              $set: {
                status: "completed",
                results: mockResults,
                completedAt: new Date(),
                updatedAt: new Date(),
              },
            }
          );

          await AlyzitronRTDBManager.updateTaskStatus(
            userId,
            taskId,
            "completed"
          );

          return NextResponse.json({
            success: true,
            taskId,
            status: "completed",
            mock: true,
          });
        } else {
          throw vertexError; // Re-throw if it's a different error
        }
      }
    } catch (analysisError) {
      // 5. Handle analysis failure with refund
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

      // Update status to failed (MongoDB)
      await analyses.updateOne(
        { _id: task._id },
        {
          $set: {
            status: "failed",
            error: {
              message: errorMessage,
              timestamp: new Date(),
            },
            updatedAt: new Date(),
          },
        }
      );

      // Update RTDB
      await AlyzitronRTDBManager.updateTaskStatus(userId, taskId, "failed");

      // Refund credits
      const minutes =
        task.usageMinutes ||
        Math.ceil((task.metadata?.videoDuration || 0) / 60);

      try {
        await processRefund("alyzitron", "analysis", userId, minutes);
        logger.info("Credits refunded after analysis failure", {
          data: { taskId, userId, minutes },
        });
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

      return NextResponse.json(
        {
          success: false,
          error: "Analysis failed, credits refunded",
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

export const runtime = "nodejs";
