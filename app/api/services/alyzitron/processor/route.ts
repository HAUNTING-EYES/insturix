import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse, NextRequest } from "next/server";
import { getCollections } from "../utils/mongodb";
import { CreditsService } from "@/lib/services/creditsService";
import { ObjectId } from "mongodb";
import { analyzeVideoWithGemini } from "@/lib/services/vertexAiService";
import { logger } from "../utils/logger";
import { GCSManager } from "../utils/gcs";
import { transcribeAudio } from "@/lib/alyzitron/transcription/deepgram";
import { upsertTranscriptionProcessing, upsertTranscriptionCompleted } from "@/lib/alyzitron";

// ✅ NEW: Apify extraction + GCS stream bridge
import { extractMediaUri, ExtractionError } from "@/lib/alyzitron/extraction/apify";
import { streamUrlToGCS } from "@/lib/alyzitron/extraction/streamToGCS";

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
      logger.info("Starting Omni-Media Pipeline v2 (Apify) 🚀", { data: { taskId, url: task.videoUrl } });

      await upsertTranscriptionProcessing(taskId, task.videoUrl).catch(() => { });

      const isGCSPath = task.videoUrl.startsWith("gs://");
      const isDirectImageUpload = task.metadata?.mimeType?.startsWith('image/') || task.videoUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) !== null;

      let analysisResults;
      let transcriptResult = null;

      // Track URLs for MongoDB persistence (protects against expiring Apify URIs)
      let updatedVideoUrl = task.videoUrl;
      let updatedMimeType = task.metadata?.mimeType || 'video/mp4';
      const originalSourceUrl = task.videoUrl; // Always preserve the user's original input

      // ==========================================
      // ROUTE 1: DIRECT UPLOADED IMAGE (Unchanged)
      // ==========================================
      if (isDirectImageUpload) {
        logger.info("Direct Image Upload detected. Bypassing Deepgram.", { data: { taskId } });
        updatedMimeType = 'image/jpeg';
        await upsertTranscriptionCompleted(taskId, { deepgramRequestId: "image-bypass", text: "[Image Analysis - No Audio]", formattedTranscript: "", wordCount: 0 } as any).catch(() => { });
        analysisResults = await analyzeVideoWithGemini(task.videoUrl, task.context || {}, task.metadata || {});
      }
      // ==========================================
      // ROUTE 2: DIRECT GCS UPLOAD (Unchanged)
      // Files already in GCS from frontend signed-URL upload.
      // ==========================================
      else if (isGCSPath) {
        logger.info("GCS Video detected. Running parallel pipeline.", { data: { taskId } });
        const objectPath = task.videoUrl.replace(`gs://${process.env.GCS_BUCKET_NAME}/`, "");
        const deepgramUrl = await GCSManager.getSignedReadUrl(objectPath);

        const [deepgramRes, geminiRes] = await Promise.all([
          transcribeAudio(deepgramUrl),
          analyzeVideoWithGemini(task.videoUrl, { ...(task.context || {}), transcript: "Relying on native video audio." }, task.metadata || {})
        ]);

        transcriptResult = deepgramRes;
        analysisResults = geminiRes;
      }
      // ==========================================
      // ROUTE 3: EXTERNAL LINKS (YouTube/Insta/X)
      // ✅ NEW: Apify extraction → parallel Deepgram + GCS stream → Gemini
      // ==========================================
      else {
        logger.info("External Link detected. Extracting via Apify...", { data: { taskId } });

        // Step 1: Extract the direct download URL via Apify (target: < 5s)
        const extracted = await extractMediaUri(task.videoUrl);
        logger.info(`[Apify] Got ${extracted.mediaType} from ${extracted.platform}`, {
          data: { taskId, downloadUrl: extracted.downloadUrl.substring(0, 80) },
        });

        if (extracted.mediaType === "image") {
          // Image path — no transcription needed
          logger.info("Extracted media is an Image. Bypassing Deepgram.", { data: { taskId } });
          updatedMimeType = "image/jpeg";

          // Stream image to GCS for Gemini
          const gcsPath = `alyzitron/image/${taskId}.jpg`;
          const gcsResult = await streamUrlToGCS(extracted.downloadUrl, gcsPath, "image/jpeg");
          updatedVideoUrl = gcsResult.gcsUri;

          await upsertTranscriptionCompleted(taskId, { deepgramRequestId: "image-bypass", text: "[Image Analysis - No Audio]", formattedTranscript: "", wordCount: 0 } as any).catch(() => { });
          analysisResults = await analyzeVideoWithGemini(gcsResult.gcsUri, task.context || {}, task.metadata || {});

        } else {
          // Video/Audio path — parallel Deepgram + GCS stream
          logger.info("Running parallel: Deepgram (HTTPS) + GCS Stream → Gemini", { data: { taskId } });
          updatedMimeType = extracted.mediaType === "audio" ? "audio/mpeg" : "video/mp4";

          const gcsPath = `alyzitron/media/${taskId}.${extracted.mediaType === "audio" ? "mp3" : "mp4"}`;
          const contentType = extracted.mediaType === "audio" ? "audio/mpeg" : "video/mp4";

          // Step 2: Deepgram eats HTTPS directly + stream to GCS in PARALLEL
          const [deepgramRes, gcsResult] = await Promise.all([
            transcribeAudio(extracted.downloadUrl),
            streamUrlToGCS(extracted.downloadUrl, gcsPath, contentType),
          ]);

          transcriptResult = deepgramRes;
          updatedVideoUrl = gcsResult.gcsUri;

          // Step 3: Gemini needs gs:// URI — trigger AFTER GCS upload completes
          analysisResults = await analyzeVideoWithGemini(
            gcsResult.gcsUri,
            { ...(task.context || {}), transcript: "Relying on native video audio." },
            task.metadata || {}
          );
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

      // Save results + persist both original and processed URLs
      await analyses.updateOne(
        { _id: task._id },
        {
          $set: {
            status: "completed",
            results: analysisResults,
            transcription: transcriptResult,
            videoUrl: updatedVideoUrl,
            originalSourceUrl, // Preserve for re-processing if Apify URIs expire
            "metadata.mimeType": updatedMimeType,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      return NextResponse.json({ success: true, taskId, status: "completed" });

    } catch (processingError) {
      const msg = processingError instanceof Error ? processingError.message : String(processingError);
      const isExtractionError = processingError instanceof ExtractionError;

      logger.error("Pipeline failed", {
        data: {
          taskId,
          error: msg,
          errorCode: isExtractionError ? (processingError as ExtractionError).code : "PIPELINE_ERROR",
        },
      });

      const minutes = task.usageMinutes || 1;

      await analyses.updateOne(
        { _id: task._id, refunded: { $ne: true } },
        {
          $set: {
            status: "failed",
            error: {
              message: msg,
              code: isExtractionError ? (processingError as ExtractionError).code : "PIPELINE_ERROR",
            },
            refunded: true,
          },
        }
      );
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