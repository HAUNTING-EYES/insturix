import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { logger } from "../utils/logger";
import { validateYouTubeVideo } from "../utils/youtube";
import { GCSManager } from "../utils/gcs";
import { checkCredits } from "@/lib/services/creditsMiddleware";
import { getCollections } from "../utils/mongodb";

import { ObjectId } from "mongodb";
import { Client } from "@upstash/qstash";
import { CreditsService } from "@/lib/services/creditsService";
import { getCreditCost } from "@/lib/config/creditCosts";
import { ContextValues } from "../types";
import { youtube } from "googleapis/build/src/apis/youtube";

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
const qstashBaseUrl = process.env.QSTASH_URL ||
  (process.env.APP_ENV === 'development' ? 'http://127.0.0.1:8080' : undefined);
const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
  baseUrl: qstashBaseUrl,
});

function normalizeContext(context: any): ContextValues {
  if (typeof context === "object" && context !== null) {
    return {
      familyFriendly:
        typeof context.familyFriendly === "boolean"
          ? context.familyFriendly
          : true,
      platform: context.platform || "Social Media",
      location: context.location || "Global",
      additionalDetails: context.additionalDetails || context.details || "",
    };
  }
  return {
    familyFriendly: true,
    platform: "Social Media",
    location: "Global",
    additionalDetails: "",
  };
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
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { userId, orgId } = session;
    const body = await request.json();
    const { video_url, context, metadata } = body;

    // Normalize context and metadata
    const parsedContext = normalizeContext(context);

    if (!video_url) {
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

    // Get video duration from metadata or YouTube validation
    let videoDuration = 0;

    if (isGCS) {
      // For GCS files, use metadata duration or default
      videoDuration = metadata?.duration || metadata?.videoDuration || 0;
      if (videoDuration <= 0) {
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
      try {
        const validationResult = await validateYouTubeVideo(video_url);
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
        videoDuration = 60; // Default fallback
      }
    }
    // Check service credits (Alyzitron uses duration-based billing)
    const usageMinutes = Math.ceil(videoDuration / 60);
    const creditCheck = await checkCredits(userId, 'alyzitron', 'video_analysis', {
      durationMinutes: usageMinutes
    });

    if (!creditCheck.allowed) {
      return creditCheck.errorResponse;
    }

    // Deduct credits early to ensure consistency
    await creditCheck.deduct();

    // Format video URL for GCS
    const finalVideoUrl = isGCS ? getGcsUrl(video_url) : video_url;

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

    // Create final metadata using normalized function
    const finalMetadata = normalizeMetadata(
      metadata,
      isGCS,
      isMaybeYouTube,
      videoDuration,
      title
    );

    // Prepare holders used for cleanup in catch block
    let analyses: any;
    let taskId: ObjectId | null = null;
    let insertResult: any = null;

    try {
      // 1. Create task in MongoDB
      const collections = await getCollections();
      analyses = collections.analyses;
      taskId = new ObjectId();

      // Get creator name for org context display
      let createdByName: string | undefined;
      if (orgId) {
        try {
          const client = await clerkClient();
          const user = await client.users.getUser(userId);
          createdByName = user.firstName 
            ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
            : user.username || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Unknown';
        } catch (e) {
          console.error('[Alyzitron] Failed to get user name:', e);
        }
      }

      const taskData = {
        _id: taskId,
        taskId: taskId.toString(),
        clerkUserId: userId,
        orgId: orgId || undefined,  // Store org context (undefined = personal)
        createdByName,  // Store creator name for org display
        videoUrl: finalVideoUrl,
        context: parsedContext,
        metadata: finalMetadata,
        status: "listed",
        unread: true,
        results: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        videoDuration: videoDuration,
        usageMinutes: usageMinutes,
      };

      insertResult = await analyses.insertOne(taskData);



      // 3. Call Processor
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const processorUrl = `${baseUrl}/api/services/alyzitron/processor`;

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
        retries: 3,
        headers: {
          "Content-Type": "application/json",
        },
      });

      logger.info("Analysis task created and queued successfully", {
        data: {
          userId,
          orgId: orgId || 'personal',
          taskId: taskId.toString(),
        },
      });

      return NextResponse.json({
        success: true,
        taskId: taskId.toString(),
      });
    } catch (processingError) {
      logger.error("Analysis task creation failed", {
        data: {
          error:
            processingError instanceof Error
              ? processingError.message
              : String(processingError),
          userId,
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

      // Remove MongoDB task if it was inserted but we failed to queue for processing
      try {
        if (analyses && taskId) {
          const deleteResult = await analyses.deleteOne({ _id: taskId });
          if (deleteResult.deletedCount) {
            logger.info("Deleted MongoDB task after task creation failure", {
              data: { taskId: taskId.toString() },
            });
          } else {
            logger.warn("No MongoDB task found to delete after failure", {
              data: { taskId: taskId?.toString() },
            });
          }
        }
      } catch (deleteError) {
        logger.error("Failed to delete MongoDB task after failure", {
          data: {
            error:
              deleteError instanceof Error
                ? deleteError.message
                : String(deleteError),
            taskId: taskId ? taskId.toString() : undefined,
          },
        });
      }

      // Refund credits if task creation failed
      try {
        await creditCheck.refund('Task creation failed');
        logger.info("Credits refunded after task creation failure", {
          data: { userId, minutes: usageMinutes },
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
