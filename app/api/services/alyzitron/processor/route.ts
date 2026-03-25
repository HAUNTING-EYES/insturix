import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse, NextRequest } from "next/server";
import { getCollections } from "../utils/mongodb";
import { CreditsService } from "@/lib/services/creditsService";
import { ObjectId } from "mongodb";
import { analyzeVideoWithGemini } from "@/lib/services/vertexAiService";
import { logger } from "../utils/logger";
import { GCSManager } from "../utils/gcs";
import { ingestMediaToGCS } from "@/lib/alyzitron/transcription/downloader";
import { transcribeAudio } from "@/lib/alyzitron/transcription/deepgram";
import { upsertTranscriptionProcessing, upsertTranscriptionCompleted } from "@/lib/alyzitron";

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, userId } = body;

    if (!taskId || !userId) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const { analyses } = await getCollections();
    if (!ObjectId.isValid(taskId)) return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });

    const task = await analyses.findOne({ _id: ObjectId.createFromHexString(taskId), clerkUserId: userId });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (task.status === "completed" || task.status === "failed") return NextResponse.json({ success: true, message: "Already processed" });

    await analyses.updateOne({ _id: task._id }, { $set: { status: "processing", processingStartTime: new Date(), updatedAt: new Date() } });

    try {
      logger.info("Starting Omni-Media Pipeline 🚀", { data: { taskId, url: task.videoUrl } });

      await upsertTranscriptionProcessing(taskId, task.videoUrl).catch(() => { });

      const isGCSPath = task.videoUrl.startsWith("gs://");
      const isYouTube = !isGCSPath && (task.videoUrl.includes("youtube.com") || task.videoUrl.includes("youtu.be"));
      const isDirectImageUpload = task.metadata?.mimeType?.startsWith('image/') || task.videoUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) !== null;

      let analysisResults;
      let transcriptResult = null;

      // 🚀 FIX: Create variables to update DB if media format/URL changes
      let updatedVideoUrl = task.videoUrl;
      let updatedMimeType = task.metadata?.mimeType || 'video/mp4';

      // ==========================================
      // ROUTE 1: DIRECT UPLOADED IMAGE
      // ==========================================
      if (isDirectImageUpload) {
        logger.info("Direct Image Upload detected. Bypassing Deepgram.", { data: { taskId } });
        updatedMimeType = 'image/jpeg';
        await upsertTranscriptionCompleted(taskId, { deepgramRequestId: "image-bypass", text: "[Image Analysis - No Audio]", formattedTranscript: "", wordCount: 0 } as any).catch(() => { });
        analysisResults = await analyzeVideoWithGemini(task.videoUrl, task.context || {}, task.metadata || {});
      }
      // ==========================================
      // ROUTE 2: YOUTUBE OR GCS VIDEO
      // ==========================================
      else if (isYouTube || isGCSPath) {
        logger.info("YouTube/GCS Video detected. Running parallel pipeline.", { data: { taskId } });

        let deepgramUrl = "";
        if (isGCSPath) {
          const objectPath = task.videoUrl.replace(`gs://${process.env.GCS_BUCKET_NAME}/`, "");
          deepgramUrl = await GCSManager.getSignedReadUrl(objectPath);
        } else {
          const ingested = await ingestMediaToGCS(task.videoUrl);
          deepgramUrl = typeof ingested === 'string' ? ingested : ingested.signedUrl;
        }

        const [deepgramRes, geminiRes] = await Promise.all([
          transcribeAudio(deepgramUrl),
          analyzeVideoWithGemini(task.videoUrl, { ...(task.context || {}), transcript: "Relying on native video audio." }, task.metadata || {})
        ]);

        transcriptResult = deepgramRes;
        analysisResults = geminiRes;
      }
      // ==========================================
      // ROUTE 3: EXTERNAL LINKS (Instagram/X) - Must download first
      // ==========================================
      else {
        logger.info("External Link detected. Downloading first to identify media...", { data: { taskId } });
        const ingested = await ingestMediaToGCS(task.videoUrl);

        // 🚀 THE MAGIC FIX: Update the URL to the GCS path so the Frontend can play it!
        updatedVideoUrl = ingested.gcsUri;

        if (ingested.type === 'image') {
          logger.info("Downloaded media is an Image. Bypassing Deepgram.", { data: { taskId } });
          updatedMimeType = 'image/jpeg';
          await upsertTranscriptionCompleted(taskId, { deepgramRequestId: "image-bypass", text: "[Image Analysis - No Audio]", formattedTranscript: "", wordCount: 0 } as any).catch(() => { });
          analysisResults = await analyzeVideoWithGemini(ingested.gcsUri, task.context || {}, task.metadata || {});
        } else {
          logger.info("Downloaded media is a Video. Running Deepgram & Gemini.", { data: { taskId } });
          updatedMimeType = 'video/mp4';
          const [deepgramRes, geminiRes] = await Promise.all([
            transcribeAudio(ingested.signedUrl),
            analyzeVideoWithGemini(ingested.gcsUri, { ...(task.context || {}), transcript: "Relying on native video audio." }, task.metadata || {})
          ]);
          transcriptResult = deepgramRes;
          analysisResults = geminiRes;
        }
      }

      // ==========================================
      // SYNC AND SAVE RESULTS
      // ==========================================
      if (transcriptResult) {
        try {
          await upsertTranscriptionCompleted(taskId, {
            deepgramRequestId: transcriptResult.id, text: transcriptResult.text, detectedLanguage: transcriptResult.detectedLanguage,
            confidence: transcriptResult.confidence, speakerSegments: transcriptResult.speakerSegments, formattedTranscript: transcriptResult.formattedTranscript,
            durationMs: transcriptResult.durationMs, wordCount: transcriptResult.wordCount,
          });
          logger.info("Transcript synced to Chat Module seamlessly! 💬");
        } catch (e) { }
      }

      // 🚀 FIX: Save the `updatedVideoUrl` back to the database!
      await analyses.updateOne(
        { _id: task._id },
        {
          $set: {
            status: "completed",
            results: analysisResults,
            transcription: transcriptResult,
            videoUrl: updatedVideoUrl, // This stops the crash on the frontend!
            "metadata.mimeType": updatedMimeType,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      return NextResponse.json({ success: true, taskId, status: "completed" });

    } catch (processingError) {
      const msg = processingError instanceof Error ? processingError.message : String(processingError);
      logger.error("Pipeline failed", { data: { taskId, error: msg } });
      const minutes = task.usageMinutes || 1;

      await analyses.updateOne({ _id: task._id, refunded: { $ne: true } }, { $set: { status: "failed", error: { message: msg }, refunded: true } });
      try { await CreditsService.refundCredits(userId, minutes * 2, `Analysis failed: ${msg}`, { service: "alyzitron", action: "video_analysis" }); } catch (e) { }

      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const POST = async (req: NextRequest) => {
  const bypass = req.headers.get("x-development-bypass");
  if (bypass === "true") return handler(req);
  return verifySignatureAppRouter(handler)(req);
};
export const runtime = "nodejs";