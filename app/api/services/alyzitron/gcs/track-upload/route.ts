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
    console.log("=== 📝 UPLOAD TRACKING PATCH ===");

    // Optional: Get user ID but don't require it
    const session = await auth();
    const userId = session?.userId;

    console.log("User ID from auth:", userId);

    const body = await request.json();
    console.log("Request body:", body);

    const { uploadId, gcsPath, analysisId, status } = body;

    if (!status || (!uploadId && !gcsPath)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { uploadTracking } = await getCollections();

    const updateData: any = { status };

    if (analysisId) {
      updateData.analysisId = analysisId;
    }

    if (status === "analysis_completed") {
      updateData.analysisCompletedAt = new Date();
      updateData.expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    }

    // Build query - try multiple approaches
    const query: any = {};

    // Option 1: Use userId if available
    if (userId) {
      query.userId = userId;
    }

    // Option 2: Try uploadId first
    if (uploadId) {
      query.uploadId = uploadId;
    }
    // Option 3: Fallback to gcsPath
    else if (gcsPath) {
      query.gcsPath = gcsPath;
    }

    console.log("Query for update:", query);

    const result = await uploadTracking.updateOne(query, { $set: updateData });

    console.log("Update result:", {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });

    if (result.matchedCount === 0) {
      // Try without userId if that was included
      if (userId) {
        console.log("Trying without userId constraint...");
        const queryWithoutUser: any = {};
        if (uploadId) queryWithoutUser.uploadId = uploadId;
        else if (gcsPath) queryWithoutUser.gcsPath = gcsPath;

        const retryResult = await uploadTracking.updateOne(queryWithoutUser, {
          $set: updateData,
        });
        console.log("Retry result:", retryResult);

        if (retryResult.matchedCount === 0) {
          return NextResponse.json(
            { error: "Upload record not found" },
            { status: 404 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Upload record not found" },
          { status: 404 }
        );
      }
    }

    logger.info("Upload status updated", {
      data: { uploadId, status, analysisId, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Upload tracking error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Delete upload tracking record
export async function DELETE(request: Request) {
  try {
    console.log("🗑️ DELETE request received for track-upload");
    const { userId } = await auth();
    if (!userId) {
      console.log("❌ Unauthorized DELETE request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { gcsPath } = await request.json();

    if (!gcsPath) {
      console.log("❌ Missing gcsPath in DELETE request");
      return NextResponse.json({ error: "Missing gcsPath" }, { status: 400 });
    }

    const { uploadTracking } = await getCollections();

    // Delete the upload tracking record
    const result = await uploadTracking.deleteOne({
      userId,
      gcsPath,
    });

    if (result.deletedCount === 0) {
      console.log("❌ Upload tracking record not found for deletion");
      return NextResponse.json(
        { error: "Upload tracking record not found" },
        { status: 404 }
      );
    }

    logger.info("Upload tracking record deleted successfully", {
      data: { gcsPath, userId },
    });

    console.log("✅ Upload tracking record deleted successfully");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Failed to delete upload tracking record:", error);
    logger.error("Failed to delete upload tracking record", {
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json(
      { error: "Failed to delete upload tracking record" },
      { status: 500 }
    );
  }
}
