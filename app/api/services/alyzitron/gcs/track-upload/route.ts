import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { getCollections } from "../../utils/mongodb";
import { logger } from "../../utils/logger";
import {
  AlyzitronStorageOwnershipError,
  buildAlyzitronPublicUrl,
  requireAlyzitronOwnedStorageKey,
} from "../../utils/storage-ownership";

const ALLOWED_UPLOAD_STATUSES = new Set([
  "uploaded",
  "queued",
  "analysis_started",
  "analysis_completed",
  "failed",
  "deleted",
]);

function isObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

async function userOwnsAnalysis(analysisId: string, userId: string): Promise<boolean> {
  const { analyses } = await getCollections();
  const taskQuery = { taskId: analysisId, clerkUserId: userId };
  const query = isObjectId(analysisId)
    ? { $or: [{ _id: ObjectId.createFromHexString(analysisId), clerkUserId: userId }, taskQuery] }
    : taskQuery;

  return Boolean(await analyses.findOne(query, { projection: { _id: 1 } }));
}

function parseFileSize(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

// Track successful upload
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { uploadId, filename, fileSize, contentType, storage } = body;
    const storageKey = requireAlyzitronOwnedStorageKey(userId, body.storageKey || body.storagePath || body.gcsPath);
    const storageBackend = storage === "gcs" ? "gcs" : "r2";
    const publicUrl = buildAlyzitronPublicUrl(storageKey, storageBackend);

    if (!uploadId || !filename) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { uploadTracking } = await getCollections();
    const now = new Date();

    const uploadRecord = {
      uploadId,
      userId,
      storageKey,
      gcsPath: storageKey,
      publicUrl,
      filename,
      fileSize: parseFileSize(fileSize),
      uploadedAt: now,
      updatedAt: now,
      status: "uploaded",
      storage: storageBackend,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        contentType: contentType || "video/mp4",
        originalName: filename,
        storage: storageBackend,
      },
    };

    await uploadTracking.updateOne(
      { uploadId, userId },
      { $set: uploadRecord, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    logger.info("Upload tracked successfully", {
      data: { uploadId, storageKey, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AlyzitronStorageOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logger.error("Failed to track upload", {
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json(
      { error: "Failed to track upload" },
      { status: 500 }
    );
  }
}

// Update upload status when analysis starts/completes
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    const userId = session?.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { uploadId, analysisId, status } = body;

    if (!status) {
      return NextResponse.json(
        { error: "Missing required field: status" },
        { status: 400 }
      );
    }

    if (!ALLOWED_UPLOAD_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "Invalid upload status" },
        { status: 400 }
      );
    }

    if (!uploadId && !analysisId) {
      return NextResponse.json(
        { error: "Missing uploadId or analysisId" },
        { status: 400 }
      );
    }

    if (analysisId && !(await userOwnsAnalysis(analysisId, userId))) {
      return NextResponse.json(
        { error: "Analysis not found" },
        { status: 404 }
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

    const query: any = { userId };
    if (uploadId) {
      query.uploadId = uploadId;
    } else {
      query.analysisId = analysisId;
    }

    const result = await uploadTracking.updateOne(query, { $set: updateData });

    if (result.matchedCount === 0) {
      if (!analysisId) {
        return NextResponse.json(
          { error: "Upload tracking record not found" },
          { status: 404 }
        );
      }

      const now = new Date();
      const newRecord: any = {
        uploadId: uploadId || `youtube-${analysisId || Date.now()}`,
        userId,
        analysisId,
        status,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        sourceType: "youtube_link",
        metadata: {
          isYouTube: true,
          analysisId,
        },
      };

      const insertResult = await uploadTracking.insertOne(newRecord);
      return NextResponse.json({
        success: true,
        message: "Created new tracking record for owned analysis",
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
    const storageKey = requireAlyzitronOwnedStorageKey(userId, body.storageKey || body.storagePath || body.gcsPath);

    const { uploadTracking } = await getCollections();
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
    if (error instanceof AlyzitronStorageOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logger.error("Failed to delete upload tracking record", {
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json(
      { error: "Failed to delete upload tracking record" },
      { status: 500 }
    );
  }
}
