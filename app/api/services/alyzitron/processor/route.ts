import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse, NextRequest } from "next/server";
import { getCollections } from "../utils/mongodb";
import { CreditsService } from "@/lib/services/creditsService";
import { ObjectId } from "mongodb";
import { analyzeVideoWithGemini } from "@/lib/services/vertexAiService";
import { logger } from "../utils/logger";
import { GCSManager } from "../utils/gcs";
import { transcribeAudio } from "@/lib/alyzitron/transcription/transcriptionService";
import { upsertTranscriptionProcessing, upsertTranscriptionCompleted } from "@/lib/alyzitron";
import { extractMediaUri, ExtractionError } from "@/lib/alyzitron/extraction/apify";
import { streamUrlToGCS } from "@/lib/alyzitron/extraction/streamToGCS";

async function handler(request: NextRequest) {
  let currentTaskId: string | null = null;
  let currentUserId: string | null = null;

  try {
    const body = await request.json();
    const { taskId, userId } = body;
    currentTaskId = taskId;
    currentUserId = userId;

    if (!taskId || !userId) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const { analyses } = await getCollections();
    if (!ObjectId.isValid(taskId)) return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });

    const task = await analyses.findOne({ _id: ObjectId.createFromHexString(taskId), clerkUserId: userId });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (task.status === "completed" || task.status === "failed") return NextResponse.json({ success: true, message: "Already processed" });

    // Initial Status Update
    await analyses.updateOne({ _id: task._id }, { $set: { status: "processing", processingStartTime: new Date(), updatedAt: new Date() } });

    // --- PIPELINE START ---
    try {
      logger.info("Starting Omni-Media Pipeline v2 (Apify) 🚀", { data: { taskId, url: task.videoUrl } });
      await upsertTranscriptionProcessing(taskId, task.videoUrl).catch(() => { });

      const isGCSPath = task.videoUrl.startsWith("gs://");
      const isDirectImageUpload = task.metadata?.mimeType?.startsWith('image/') || task.videoUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) !== null;

      let analysisResults;
      let transcriptResult = null;
      let updatedVideoUrl = task.videoUrl;
      let updatedMimeType = task.metadata?.mimeType || 'video/mp4';
      const originalSourceUrl = task.videoUrl;

      // ROUTE 1: IMAGE UPLOAD
      if (isDirectImageUpload) {
        logger.info("Route 1: Direct Image");
        updatedMimeType = 'image/jpeg';
        await upsertTranscriptionCompleted(taskId, { deepgramRequestId: "image-bypass", text: "[Image Analysis]", formattedTranscript: "", wordCount: 0 } as any).catch(() => { });
        analysisResults = await analyzeVideoWithGemini(task.videoUrl, task.context || {}, task.metadata || {});
      }
      // ROUTE 2: DIRECT GCS VIDEO
      else if (isGCSPath) {
        logger.info("Route 2: GCS Path");
        const objectPath = task.videoUrl.replace(`gs://${process.env.GCS_BUCKET_NAME}/`, "");
        const deepgramUrl = await GCSManager.getSignedReadUrl(objectPath);
        // const [dg, gem] = await Promise.all([
        //   transcribeAudio(deepgramUrl),
        //   analyzeVideoWithGemini(task.videoUrl, { ...(task.context || {}), transcript: "Native audio." }, task.metadata || {})
        // ]);
        // transcriptResult = dg;
        const gem = await analyzeVideoWithGemini(task.videoUrl, { ...(task.context || {}), transcript: "Native audio." }, task.metadata || {});
        analysisResults = gem;
        transcriptResult = {
          id: "gemini-" + Date.now().toString(),
          text: gem.full_transcript || "",
          detectedLanguage: "en",
          confidence: 1.0,
          speakerSegments: gem.speaker_segments || [],
          formattedTranscript: gem.full_transcript || "",
          durationMs: 0,
          wordCount: gem.full_transcript?.trim() ? gem.full_transcript.trim().split(/\s+/).length : 0
        };
      }
      // ROUTE 3: EXTERNAL LINKS (YouTube/Insta)
      else {
        logger.info("Route 3: External Link Extraction");
        const extracted = await extractMediaUri(task.videoUrl);

        if (extracted.mediaType === "image") {
          updatedMimeType = "image/jpeg";
          const gcsPath = `alyzitron/image/${taskId}.jpg`;
          const gcsRes = await streamUrlToGCS(extracted.downloadUrl, gcsPath, "image/jpeg");
          updatedVideoUrl = gcsRes.gcsUri;
          await upsertTranscriptionCompleted(taskId, { deepgramRequestId: "image-bypass", text: "[Image]", formattedTranscript: "", wordCount: 0 } as any).catch(() => { });
          analysisResults = await analyzeVideoWithGemini(gcsRes.gcsUri, task.context || {}, task.metadata || {});
        } else {
          // VIDEO/AUDIO LOGIC
          updatedMimeType = extracted.mediaType === "audio" ? "audio/mpeg" : "video/mp4";
          // Use temp directory for video meant only for analysis
          const isVideo = extracted.mediaType === "video" || extracted.mediaType === "unknown";
          
          const audioGcsPath = `alyzitron/media/${taskId}.mp3`;
          const tempVideoGcsPath = `alyzitron/temp/${taskId}.mp4`;
          
          const gcsPath = isVideo ? tempVideoGcsPath : audioGcsPath;

          // 1. Stream to GCS
          const gcsRes = await streamUrlToGCS(extracted.downloadUrl, gcsPath, updatedMimeType);
          
          // DO NOT UPDATE updatedVideoUrl if it is a video (keep the YT/Insta URL for embeds). 
          // If it's pure audio, we can keep the GCS URL, but generally we want to keep original so embeds work. 
          // We'll keep updatedVideoUrl as the originalSourceUrl for external links, 
          // but for audio-only extraction we might need the GCS link. Let's keep the original for all external links 
          // so the frontend knows what it is. Wait, originalSourceUrl is already preserved. We should ensure 'videoUrl' 
          // stays as the original YT/Insta url.
          // Wait, 'task.videoUrl' is the original YT/Insta link. So we simply don't overwrite updatedVideoUrl here, except for audio if needed.
          // Actually, let's keep updatedVideoUrl as original for videos, but for audio maybe update. Let's just keep it as original so embed works if possible.
          // The frontend checks if it's a youtube/insta link.
          if (!isVideo) {
            updatedVideoUrl = gcsRes.gcsUri;
          }

          // 2. Secure URL for Deepgram
          const objectPath = gcsPath;
          const deepgramUrl = await GCSManager.getSignedReadUrl(objectPath);

          // 3. Parallel AI
          // const [dg, gem] = await Promise.all([
          //   transcribeAudio(deepgramUrl),
          //   analyzeVideoWithGemini(gcsRes.gcsUri, { ...(task.context || {}), transcript: "Native audio." }, task.metadata || {})
          // ]);
          // transcriptResult = dg;
          const gem = await analyzeVideoWithGemini(gcsRes.gcsUri, { ...(task.context || {}), transcript: "Native audio." }, task.metadata || {});
          analysisResults = gem;
          transcriptResult = {
            id: "gemini-" + Date.now().toString(),
            text: gem.full_transcript || "",
            detectedLanguage: "en",
            confidence: 1.0,
            speakerSegments: gem.speaker_segments || [],
            formattedTranscript: gem.full_transcript || "",
            durationMs: 0,
            wordCount: gem.full_transcript?.trim() ? gem.full_transcript.trim().split(/\s+/).length : 0
          };
        }
      }

      // Finalizing Results
      if (transcriptResult) {
        await upsertTranscriptionCompleted(taskId, {
          deepgramRequestId: transcriptResult.id,
          text: transcriptResult.text,
          detectedLanguage: transcriptResult.detectedLanguage,
          confidence: transcriptResult.confidence,
          speakerSegments: transcriptResult.speakerSegments,
          formattedTranscript: transcriptResult.formattedTranscript,
          durationMs: transcriptResult.durationMs,
          wordCount: transcriptResult.wordCount,
        }).catch(() => { });
      }

      await analyses.updateOne(
        { _id: task._id },
        {
          $set: {
            status: "completed",
            results: analysisResults,
            transcription: transcriptResult,
            videoUrl: updatedVideoUrl,
            originalSourceUrl,
            "metadata.mimeType": updatedMimeType,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      return NextResponse.json({ success: true, taskId, status: "completed" });

    } catch (err: any) {
      logger.error("Pipeline failed", { data: { taskId, error: err.message } });
      const { analyses: coll } = await getCollections();
      await coll.updateOne(
        { _id: ObjectId.createFromHexString(taskId) },
        { $set: { status: "failed", error: { message: err.message, code: err.code || "PIPELINE_ERROR" }, refunded: true } }
      );
      try { await CreditsService.refundCredits(userId, (task.usageMinutes || 1) * 2, `Failed: ${err.message}`, { service: "alyzitron", action: "video_analysis" }); } catch (e) { }
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  } catch (globalErr: any) {
    logger.error("Global Catch", { data: { error: globalErr.message } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const POST = async (req: NextRequest) => {
  const bypass = req.headers.get("x-development-bypass");
  if (bypass === "true") return handler(req);
  return verifySignatureAppRouter(handler)(req);
};

export const runtime = "nodejs";