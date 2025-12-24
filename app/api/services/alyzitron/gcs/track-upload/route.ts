import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCollections } from "../../utils/mongodb";
import { logger } from "../../utils/logger";

// Track successful upload
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { uploadId, gcsPath, filename, fileSize, contentType } =
      await request.json();

    if (!uploadId || !gcsPath || !filename) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { uploadTracking } = await getCollections();

    const uploadRecord = {
      uploadId,
      userId,
      gcsPath,
      filename,
      fileSize: fileSize || 0,
      uploadedAt: new Date(),
      status: "uploaded",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      metadata: {
        contentType: contentType || "video/mp4",
        originalName: filename,
      },
    };

    await uploadTracking.insertOne(uploadRecord);

    logger.info("Upload tracked successfully", {
      data: { uploadId, gcsPath, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to track upload", {
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json(
      { error: "Failed to track upload" },
      { status: 500 }
    );
  }
}

// Update upload status (when analysis starts/completes)
// In track-upload/route.ts, update the PATCH function:

export async function PATCH(request: Request) {
  try {

    // Optional: Get user ID but don't require it
    const session = await auth();
    const userId = session?.userId;
    const body = await request.json();

    const { uploadId, analysisId, status } = body;

    if (!status) {
      return NextResponse.json(
        { error: "Missing required field: status" },
        { status: 400 }
      );
    }

    // If no uploadId and no analysisId, we can't proceed
    if (!uploadId && !analysisId) {
      return NextResponse.json(
        { error: "Missing uploadId or analysisId" },
        { status: 400 }
      );
    }

    const { uploadTracking } = await getCollections();

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (analysisId) {
      updateData.analysisId = analysisId;
    }

    // Track analysis start time
    if (status === "analysis_started") {
      updateData.analysisStartedAt = new Date();
    }

    // Track analysis completion time and extend expiration
    if (status === "analysis_completed") {
      updateData.analysisCompletedAt = new Date();
      updateData.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    }

    // Build query - try multiple approaches
    let query: any = {};

    // Priority 1: Find by uploadId (most specific)
    if (uploadId) {
      query.uploadId = uploadId;
    }
    // Priority 2: Find by analysisId (if uploadId not provided)
    else if (analysisId) {
      query.analysisId = analysisId;
    }

    // Optionally include userId if available (for better matching)
    if (userId) {
      query.userId = userId;
    }

    // Try to update
    const result = await uploadTracking.updateOne(query, { $set: updateData });

    // If no match, try creating a new record for YouTube links
    if (result.matchedCount === 0) {
      // For YouTube links, we might not have an upload record
      // Create a minimal record for tracking
      const newRecord: any = {
        uploadId: uploadId || `youtube-${analysisId || Date.now()}`,
        userId: userId || "unknown",
        status: status,
        createdAt: new Date(),
        updatedAt: new Date(),
        sourceType: "youtube_link",
        metadata: {
          isYouTube: true,
          analysisId: analysisId,
        },
      };

      if (analysisId) {
        newRecord.analysisId = analysisId;
      }

      const insertResult = await uploadTracking.insertOne(newRecord);
      return NextResponse.json({
        success: true,
        message: "Created new tracking record for YouTube link",
        recordId: insertResult.insertedId,
      });
    }
     logger.info("Upload status updated", {
      data: { uploadId, status, analysisId, userId },
    });

    return NextResponse.json({
      success: true,
      message: "Upload status updated successfully",
    });
  } catch (error) {
    logger.error("Upload tracking error", {
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Delete upload tracking record
export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { gcsPath } = await request.json();

    if (!gcsPath) {
      return NextResponse.json({ error: "Missing gcsPath" }, { status: 400 });
    }

    const { uploadTracking } = await getCollections();

    // Delete the upload tracking record
    const result = await uploadTracking.deleteOne({
      userId,
      gcsPath,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Upload tracking record not found" },
        { status: 404 }
      );
    }
     logger.info("Upload tracking record deleted successfully", {
      data: { gcsPath, userId },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete upload tracking record", {
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json(
      { error: "Failed to delete upload tracking record" },
      { status: 500 }
    );
  }
}
