import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { logger } from "../utils/logger";
import { validateYouTubeVideo } from "../utils/youtube";
import { GCSManager } from "../utils/gcs";
import { checkCredits } from "@/lib/services/creditsMiddleware";
import { getCollections } from "../utils/mongodb";
import { ObjectId } from "mongodb";
import { Client } from "@upstash/qstash";

function getGcsUrl(gcsPath: string): string {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) throw new Error("Server configuration error: GCS bucket name missing.");
  return `gs://${bucketName}/${gcsPath}`;
}

const qstashBaseUrl = process.env.QSTASH_URL || (process.env.APP_ENV === 'development' ? 'http://127.0.0.1:8080' : undefined);
const qstash = new Client({ token: process.env.QSTASH_TOKEN!, baseUrl: qstashBaseUrl });

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId, orgId } = session;
    const body = await request.json();
    const { video_url, context, metadata } = body;

    if (!video_url) return NextResponse.json({ error: "Missing required field: video_url" }, { status: 400 });

    const isGCS = video_url.startsWith("gs://") || video_url.includes("/alyzitron-uploads/");
    const isMaybeYouTube = !isGCS && (video_url.includes("youtube.com") || video_url.includes("youtu.be"));

    // Detect image by mimetype or extension
    const isImageFile = metadata?.mimeType?.startsWith('image/') || video_url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) !== null;

    let videoDuration = 0;

    // Validate duration ONLY if it's not an image
    if (!isImageFile) {
      if (isGCS) {
        videoDuration = metadata?.duration || metadata?.videoDuration || 0;
        if (videoDuration <= 0) return NextResponse.json({ success: false, error: { type: "INVALID_VIDEO_DURATION", message: "Video duration invalid." } }, { status: 400 });
        videoDuration = Math.ceil(videoDuration);
      } else if (isMaybeYouTube) {
        try {
          const validationResult = await validateYouTubeVideo(video_url);
          if (!validationResult.valid || !validationResult.duration || validationResult.duration <= 0) {
            return NextResponse.json({ success: false, error: { type: "INVALID_VIDEO", message: "Invalid YouTube video." } }, { status: 400 });
          }
          videoDuration = Math.ceil(validationResult.duration);
        } catch (e) {
          return NextResponse.json({ success: false, error: { type: "YOUTUBE_API_ERROR", message: "Failed to validate YouTube video" } }, { status: 400 });
        }
      } else {
        videoDuration = metadata?.duration || 60; // Fallback to 60s for external links like Insta/X
      }
    }

    const usageMinutes = isImageFile ? 1 : Math.ceil(videoDuration / 60);
    const creditCheck = await checkCredits(userId, 'alyzitron', 'video_analysis', { durationMinutes: usageMinutes });

    if (!creditCheck.allowed) return creditCheck.errorResponse;
    await creditCheck.deduct();

    const finalVideoUrl = isGCS ? getGcsUrl(video_url) : video_url;

    let analyses: any;
    let taskId = new ObjectId();

    try {
      const collections = await getCollections();
      analyses = collections.analyses;

      let createdByName = 'Unknown';
      if (orgId) {
        try {
          const client = await clerkClient();
          const user = await client.users.getUser(userId);
          createdByName = user.firstName ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}` : user.username || 'Unknown';
        } catch (e) { }
      }

      await analyses.insertOne({
        _id: taskId, taskId: taskId.toString(), clerkUserId: userId, orgId: orgId || undefined, createdByName,
        videoUrl: finalVideoUrl, context: context || {},
        metadata: { ...metadata, mimeType: isImageFile ? (metadata?.mimeType || 'image/jpeg') : (metadata?.mimeType || 'video/mp4') },
        status: "listed", unread: true, results: null, createdAt: new Date(), updatedAt: new Date(),
        videoDuration: isImageFile ? 0 : videoDuration, usageMinutes,
      });

      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      await qstash.publishJSON({
        url: `${baseUrl}/api/services/alyzitron/processor`,
        body: { taskId: taskId.toString(), userId, videoUrl: finalVideoUrl, context, metadata },
        retries: 3,
        timeout: 120,
        headers: { "Content-Type": "application/json" },
      });

      return NextResponse.json({ success: true, taskId: taskId.toString() });

    } catch (processingError) {
      console.error("ANALYZE_PROCESSING_ERROR:", processingError);
      if (analyses) await analyses.deleteOne({ _id: taskId }).catch(() => { });
      await creditCheck.refund('Task creation failed').catch(() => { });
      return NextResponse.json({ success: false, error: { type: "TASK_CREATION_ERROR", message: "Failed to queue analysis" } }, { status: 500 });
    }
  } catch (error) {
    console.error("ANALYZE_ROUTE_ERROR:", error);
    return NextResponse.json({ success: false, error: { type: "REQUEST_PROCESSING_ERROR", message: "Failed to process request" } }, { status: 500 });
  }
}
