import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { logger } from "../utils/logger";
import { validateYouTubeVideo } from "../utils/youtube";
import { GCSManager } from "../utils/gcs";
import {
  checkAlyzitronLimits,
  incrementAlyzitronUsage,
  createAlyzitronLimitResponse,
} from "@/lib/middleware/services/alyzitron";
import { getCollections } from "../utils/mongodb";
import { AlyzitronRTDBManager } from "@/lib/services/rtdb/alyzitron-rtdb";
import { ObjectId } from "mongodb";
import { Client } from "@upstash/qstash";
import { processRefund } from "@/lib/services/tasks/simple-refund";
import { ContextValues } from "@/components/dashboard/Alyzitron/ContextSelector";

interface MetadataModel {
  originalFilename: string;
  videoSize: number;
  videoDuration: number;
  mimeType: string;
  isPublic: boolean;
  filename?: string;
  fileSize?: number;
  duration?: number;
}

function getGcsUrl(gcsPath: string): string {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    logger.error("GCS_BUCKET_NAME environment variable is not set.");
    throw new Error("Server configuration error: GCS bucket name missing.");
  }
  return `gs://${bucketName}/${gcsPath}`;
}

// Initialize QStash client
let qstash: Client;
try {
  if (!process.env.QSTASH_TOKEN) {
    throw new Error("QSTASH_TOKEN environment variable is not set");
  }
  
  // Use local QStash URL for development
  const qstashBaseUrl = process.env.QSTASH_URL || 
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8080" : undefined);

  qstash = new Client({
    token: process.env.QSTASH_TOKEN!,
    baseUrl: qstashBaseUrl,
  });
  
  console.log('✅ QStash client initialized', {
    baseUrl: qstashBaseUrl || 'default (production)',
    tokenPrefix: process.env.QSTASH_TOKEN.substring(0, 20) + '...'
  });
  
} catch (error) {
  console.error("Failed to initialize QStash client:", error);
  throw error;
}

function normalizeContext(context: any): ContextValues {
  if (typeof context === "object" && context !== null) {
    return {
      niche: context.niche || "",
      audience: context.audience || "",
      tone: context.tone || "",
      additionalDetails: context.additionalDetails || context.details || "",
    };
  }
  return { niche: "", audience: "", tone: "", additionalDetails: "" };
}

function normalizeMetadata(
  metadata: any,
  isGCS: boolean,
  isYouTube: boolean,
  videoDuration: number,
  title?: string
): MetadataModel {
  // If metadata is provided, use it with fallbacks
  if (metadata && typeof metadata === "object") {
    return {
      originalFilename:
        metadata.originalFilename ||
        metadata.filename ||
        title ||
        "Untitled Video",
      videoSize: metadata.videoSize || metadata.fileSize || 0,
      videoDuration:
        metadata.videoDuration || metadata.duration || videoDuration,
      mimeType: metadata.mimeType || "video/mp4",
      isPublic: metadata.isPublic || false,
      filename:
        metadata.filename ||
        metadata.originalFilename ||
        title ||
        "Untitled Video",
      fileSize: metadata.fileSize || metadata.videoSize || 0,
      duration: metadata.duration || metadata.videoDuration || videoDuration,
    };
  }

  // Default metadata
  return {
    originalFilename: title || "Untitled Video",
    videoSize: 0,
    videoDuration: videoDuration,
    mimeType: "video/mp4",
    isPublic: false,
    filename: title || "Untitled Video",
    fileSize: 0,
    duration: videoDuration,
  };
}

export async function POST(request: Request) {
  try {
    console.log("=== ALYZITRON ANALYZE API CALLED ===");

    const session = await auth();
    if (!session?.userId) {
      console.log("No session or userId found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("User authenticated:", session.userId);

    const body = await request.json();
    console.log("Request body received:", JSON.stringify(body, null, 2));

    const { video_url, context, metadata } = body;

    // Normalize context and metadata
    const parsedContext = normalizeContext(context);
    console.log("Parsed context:", parsedContext);

    if (!video_url) {
      console.log("Missing video_url in request");
      return NextResponse.json(
        { error: "Missing required field: video_url" },
        { status: 400 }
      );
    }

    // Determine if it's a GCS path or a potential YouTube URL
    const isGCS =
      video_url.startsWith("gs://") ||
      (video_url.startsWith("user_") &&
        video_url.includes("/alyzitron-uploads/"));
    const isMaybeYouTube =
      !isGCS &&
      (video_url.includes("youtube.com") || video_url.includes("youtu.be"));

    console.log("Video URL analysis:", {
      video_url,
      isGCS,
      isMaybeYouTube,
      startsWithGs: video_url.startsWith("gs://"),
      startsWithUser: video_url.startsWith("user_"),
      hasAlyzitronPath: video_url.includes("/alyzitron-uploads/"),
    });

    // Get video duration from metadata or YouTube validation
    let videoDuration = 0;

    if (isGCS) {
      // For GCS files, use metadata duration or default
      videoDuration = metadata?.duration || metadata?.videoDuration || 0;
      if (videoDuration <= 0) {
        console.log("GCS video has invalid duration:", videoDuration);
        logger.warn("Uploaded file duration is invalid or missing.", {
          data: { url: video_url, duration: videoDuration },
        });
        return NextResponse.json(
          {
            success: false,
            error: {
              type: "INVALID_VIDEO_DURATION",
              message:
                "Video duration is invalid or missing. Please provide a valid video.",
            },
          },
          { status: 400 }
        );
      }
      videoDuration = Math.ceil(videoDuration);
    } else if (isMaybeYouTube) {
      console.log("Validating YouTube URL:", video_url);
      try {
        const validationResult = await validateYouTubeVideo(video_url);
        console.log("YouTube validation result:", validationResult);

        if (!validationResult.valid) {
          logger.warn("YouTube URL validation failed.", {
            data: { url: video_url, error: validationResult.error },
          });
          return NextResponse.json(
            {
              success: false,
              error: {
                type: validationResult.error || "YOUTUBE_VALIDATION_FAILED",
                message: `YouTube video validation failed: ${validationResult.error}`,
              },
            },
            { status: 400 }
          );
        }

        if (!validationResult.duration || validationResult.duration <= 0) {
          logger.warn("YouTube video duration is invalid or missing.", {
            data: { url: video_url, duration: validationResult.duration },
          });
          return NextResponse.json(
            {
              success: false,
              error: {
                type: "INVALID_VIDEO_DURATION",
                message:
                  "Video duration is invalid or missing. Please provide a valid video.",
              },
            },
            { status: 400 }
          );
        }

        videoDuration = Math.ceil(validationResult.duration);
      } catch (youtubeError) {
        console.error("YouTube validation error:", youtubeError);
        return NextResponse.json(
          {
            success: false,
            error: {
              type: "YOUTUBE_API_ERROR",
              message: "Failed to validate YouTube video",
            },
          },
          { status: 400 }
        );
      }
    } else {
      // For other URLs, try to get duration from metadata
      videoDuration = metadata?.duration || metadata?.videoDuration || 0;
      if (videoDuration <= 0) {
        console.log("No valid duration found for video");
        videoDuration = 60; // Default fallback
      }
    }

    console.log("Determined video duration:", videoDuration, "seconds");

    // Check service limits
    const requestData = {
      video_url,
      context: parsedContext,
      videoDuration,
    };

    console.log("Checking service limits...");

    const limitCheck = await checkAlyzitronLimits(requestData);

    if (!limitCheck.success || !limitCheck.hasAccess) {
      console.log("Service limit check failed:", limitCheck);
      logger.warn("Service limit check failed", {
        data: {
          userId: session.userId,
          limitInfo: limitCheck.limitInfo,
          error: limitCheck.error,
        },
      });

      return createAlyzitronLimitResponse(limitCheck);
    }

    console.log("Service limits OK");

    // Increment usage
    const usageMinutes = Math.ceil(videoDuration / 60);
    console.log("Usage minutes to deduct:", usageMinutes);

    const usageResult = await incrementAlyzitronUsage(
      requestData,
      usageMinutes
    );

    if (!usageResult.success) {
      console.error("Failed to increment usage:", usageResult);
      logger.error("Failed to increment Alyzitron usage", {
        data: {
          userId: session.userId,
          error: usageResult.error,
        },
      });

      return NextResponse.json(
        {
          error: "Unable to process request. Please try again later.",
          success: false,
        },
        { status: 403 }
      );
    }

    console.log("Usage incremented successfully");

    // Format video URL for GCS
    const finalVideoUrl = isGCS ? getGcsUrl(video_url) : video_url;
    console.log("Final video URL:", finalVideoUrl);

    // Determine title
    let title: string;
    if (isGCS && metadata?.filename) {
      title = metadata.filename;
    } else if (isMaybeYouTube) {
      try {
        const oEmbedResponse = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(video_url)}&format=json`
        );
        if (oEmbedResponse.ok) {
          const oEmbedData = await oEmbedResponse.json();
          title = oEmbedData.title || video_url;
        } else {
          title = video_url;
        }
      } catch {
        title = video_url;
      }
    } else {
      title = video_url;
    }

    console.log("Determined title:", title);

    // Create final metadata using normalized function
    const finalMetadata = normalizeMetadata(
      metadata,
      isGCS,
      isMaybeYouTube,
      videoDuration,
      title
    );
    console.log("Final metadata:", finalMetadata);
    console.log("Creating task in MongoDB...");

    try {
      console.log("=== STARTING TASK CREATION ===");
      console.log("Creating task with:", {
        userId: session.userId,
        videoUrl: finalVideoUrl,
        videoDuration,
        usageMinutes,
        finalMetadata,
      });

      // 1. Create task in MongoDB
      const { analyses } = await getCollections();
      const taskId = new ObjectId();

      console.log("Generated taskId:", taskId.toString());

      const taskData = {
        _id: taskId,
        clerkUserId: session.userId,
        videoUrl: finalVideoUrl,
        context: parsedContext,
        metadata: finalMetadata,
        status: "listed",
        createdAt: new Date(),
        updatedAt: new Date(),
        taskId: taskId.toString(),
        videoDuration: videoDuration,
        usageMinutes: usageMinutes,
      };

      console.log("Inserting into MongoDB...");
      const insertResult = await analyses.insertOne(taskData);
      console.log("MongoDB insert result:", insertResult);

      // 2. Create RTDB entry
      console.log("Creating RTDB entry...");
      await AlyzitronRTDBManager.createTask(
        session.userId,
        taskId.toString(),
        finalMetadata.originalFilename,
        `Video analysis for ${finalMetadata.originalFilename}`
      );
      console.log("RTDB entry created");

      // 3. Call Processor
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const processorUrl = `${baseUrl}/api/services/alyzitron/processor`;

      console.log("Publishing to QStash:", processorUrl);
      console.log("QStash payload:", {
        taskId: taskId.toString(),
        userId: session.userId,
        videoUrl: finalVideoUrl,
        context: parsedContext,
        metadata: finalMetadata,
        videoDuration,
        usageMinutes,
      });

      // Publish to QStash
      await qstash.publishJSON({
        url: processorUrl,
        body: {
          taskId: taskId.toString(),
          userId: session.userId,
          videoUrl: finalVideoUrl,
          context: parsedContext,
          metadata: finalMetadata,
          videoDuration,
          usageMinutes,
        },
        retries: 1,
      });

      logger.info("Analysis task created and queued successfully", {
        data: {
          userId: session.userId,
          taskId: taskId.toString(),
        },
      });

      return NextResponse.json({
        success: true,
        taskId: taskId.toString(),
      });
    } catch (processingError) {
      console.error("=== TASK CREATION FAILED ===");
      console.error("Error:", processingError);
      console.error(
        "Error message:",
        processingError instanceof Error
          ? processingError.message
          : String(processingError)
      );
      console.error(
        "Stack:",
        processingError instanceof Error ? processingError.stack : "No stack"
      );
      logger.error("Analysis task creation failed", {
        data: {
          error:
            processingError instanceof Error
              ? processingError.message
              : String(processingError),
          userId: session.userId,
        },
      });

      // Clean up GCS file if it was an uploaded video
      if (isGCS && finalVideoUrl) {
        try {
          const gcsPath = finalVideoUrl.replace(
            `gs://${process.env.GCS_BUCKET_NAME}/`,
            ""
          );
          await GCSManager.deleteFile(gcsPath);
          logger.info("Cleaned up GCS file after task creation failure", {
            data: { gcsPath },
          });
        } catch (cleanupError) {
          logger.error("Failed to clean up GCS file", {
            data: {
              error:
                cleanupError instanceof Error
                  ? cleanupError.message
                  : String(cleanupError),
            },
          });
        }
      }

      // Refund usage if task creation failed
      try {
        await processRefund(
          "alyzitron",
          "analysis",
          session.userId,
          usageMinutes
        );
        logger.info("Credits refunded after task creation failure", {
          data: { userId: session.userId, minutes: usageMinutes },
        });
      } catch (refundError) {
        logger.error("Failed to refund credits", {
          data: {
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
          error: {
            type: "TASK_CREATION_ERROR",
            message: "Failed to queue analysis for processing",
          },
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Unexpected error in analyze endpoint:", error);
    logger.error("Request processing failed", {
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          type: "REQUEST_PROCESSING_ERROR",
          message: "Failed to process request",
          action: "Please try again later",
        },
      },
      { status: 500 }
    );
  }
}
