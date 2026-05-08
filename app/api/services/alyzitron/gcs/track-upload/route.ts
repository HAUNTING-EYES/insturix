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

    const body = await request.json();
    const { uploadId, filename, fileSize, contentType, storage, publicUrl } = body;
    // Accept both new `storageKey` and legacy `storagePath`
    const storageKey = body.storageKey || body.storagePath || body.gcsPath;

    if (!uploadId || !storageKey || !filename) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { uploadTracking } = await getCollections();

    const uploadRecord = {
      uploadId,
      userId,
      storageKey,
      gcsPath: storageKey, // Deprecated alias — kept for DB backward compat
      publicUrl,
      filename,
      fileSize: fileSize || 0,
      uploadedAt: new Date(),
      status: "uploaded",
      storage: storage === "r2" ? "r2" : "gcs",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      metadata: {
        contentType: contentType || "video/mp4",
        originalName: filename,
        storage: storage === "r2" ? "r2" : "gcs",
      },
    };

    await uploadTracking.insertOne(uploadRecord);

    logger.info("Upload tracked successfully", {
      data: { uploadId, storageKey, userId },
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
export async function PATCH(request: Request) {
  try {
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

    if (status === "analysis_started") {
      updateData.analysisStartedAt = new Date();
    }

    if (status === "analysis_completed") {
      updateData.analysisCompletedAt = new Date();
      updateData.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const query: any = {};
    if (uploadId) {
      query.uploadId = uploadId;
    } else if (analysisId) {
      query.analysisId = analysisId;
    }

    if (userId) {
      query.userId = userId;
    }

    const result = await uploadTracking.updateOne(query, { $set: updateData });

    if (result.matchedCount === 0) {
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

    const body = await request.json();
    // Accept both new `storageKey` and legacy `gcsPath`/`storagePath`
    const storageKey = body.storageKey || body.storagePath || body.gcsPath;

    if (!storageKey) {
      return NextResponse.json({ error: "Missing storageKey" }, { status: 400 });
    }

    const { uploadTracking } = await getCollections();

    // Search by both field names for backward compat with existing DB records
    const result = await uploadTracking.deleteOne({
      userId,
      $or: [{ storageKey }, { storagePath: storageKey }, { gcsPath: storageKey }],
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Upload tracking record not found" },
        { status: 404 }
      );
    }

    logger.info("Upload tracking record deleted successfully", {
      data: { storageKey, userId },
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
