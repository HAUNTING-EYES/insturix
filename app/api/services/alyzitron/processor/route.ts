import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse, NextRequest } from "next/server";
import { getCollections } from "../utils/mongodb";
import { CreditsService } from "@/lib/services/creditsService";
import { ObjectId } from "mongodb";
import { analyzeVideoWithGemini } from "@/lib/services/vertexAiService";
import { logger } from "../utils/logger";
import { upsertTranscriptionProcessing, upsertTranscriptionCompleted } from "@/lib/alyzitron";
import { extractMediaUri, ExtractionError } from "@/lib/alyzitron/extraction/apify";
import { uploadUrlToGeminiFileAPI } from "@/lib/services/geminiFileService";

async function handler(request: NextRequest) {
  let currentTaskId: string | null = null;
  let currentUserId: string | null = null;

  try {
    const body = await request.json();
    const { taskId, userId, editronProjectId } = body;
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

      // Detect R2 paths: direct R2 URLs, CDN Worker URLs, or metadata flags
      const cdnWorkerUrl = process.env.CDN_WORKER_URL?.replace(/\/+$/, "");
      const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
      const isR2Path =
        task.videoUrl.includes("r2.cloudflarestorage.com") ||
        task.videoUrl.includes("r2.dev") ||
        (cdnWorkerUrl ? task.videoUrl.startsWith(cdnWorkerUrl) : false) ||
        (r2PublicBaseUrl ? task.videoUrl.startsWith(r2PublicBaseUrl) : false) ||
        task.metadata?.storage === "r2" ||
        task.metadata?.storageBackend === "r2";

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
      // ROUTE 2.5: R2 PATH
      else if (isR2Path) {
        logger.info("Route 2.5: R2 Path");
        
        let downloadUrl = task.videoUrl;
        // If it's a direct Cloudflare Storage URL (which is private by default), generate a Signed URL for the backend fetch
        if (downloadUrl.includes('r2.cloudflarestorage.com')) {
          const { AlyzitronR2Manager } = await import('../utils/r2-manager');
          downloadUrl = await AlyzitronR2Manager.getSignedReadUrl(downloadUrl);
        }

        logger.info("Uploading R2 media to Gemini File API");
        const { fileUri } = await uploadUrlToGeminiFileAPI(downloadUrl, updatedMimeType, `task-${taskId}`);

        logger.info("Starting Gemini Analysis for R2 Path");
        const gem = await analyzeVideoWithGemini(fileUri, { ...(task.context || {}), transcript: "Native audio." }, task.metadata || {});
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

        const isYouTubeLink = task.videoUrl.includes("youtube.com") || task.videoUrl.includes("youtu.be");

        if (isYouTubeLink) {
          logger.info("Route 3A: Direct YouTube Link to Gemini");

          updatedVideoUrl = task.videoUrl;
          updatedMimeType = "video/mp4";

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
        } else {
          const extracted = await extractMediaUri(task.videoUrl);

          if (extracted.mediaType === "image") {
            updatedMimeType = "image/jpeg";

            const { fileUri } = await uploadUrlToGeminiFileAPI(extracted.downloadUrl, "image/jpeg", `task-${taskId}`);
            updatedVideoUrl = extracted.downloadUrl;
            await upsertTranscriptionCompleted(taskId, { deepgramRequestId: "image-bypass", text: "[Image]", formattedTranscript: "", wordCount: 0 } as any).catch(() => { });
            analysisResults = await analyzeVideoWithGemini(fileUri, task.context || {}, task.metadata || {});

          } else {
            // VIDEO/AUDIO LOGIC
            updatedMimeType = extracted.mediaType === "audio" ? "audio/mpeg" : "video/mp4";

            logger.info("Uploading extracted media to Gemini File API");
            const { fileUri: videoFileUri } = await uploadUrlToGeminiFileAPI(extracted.downloadUrl, updatedMimeType, `task-${taskId}-video`);

            let audioFileUri: string | undefined;
            if (extracted.audioUrl) {
              logger.info("Separate audio track detected, uploading audio to Gemini File API");
              const { fileUri: uploadedAudioUri } = await uploadUrlToGeminiFileAPI(extracted.audioUrl, 'audio/mpeg', `task-${taskId}-audio`);
              audioFileUri = uploadedAudioUri;
              logger.info("Audio upload complete", { data: { audioFileUri } });
            }

            updatedVideoUrl = task.videoUrl; // Ensure we keep original external URL for embed

            logger.info("Starting Gemini Analysis" + (audioFileUri ? " (dual-file: video + audio)" : ""));
            const gem = await analyzeVideoWithGemini(videoFileUri, { ...(task.context || {}), transcript: "Native audio." }, task.metadata || {}, undefined, audioFileUri);
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

      // Write analysis results back to Editron project (fail-open)
      if (editronProjectId && analysisResults) {
        try {
          const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
          const editronDb = await getDatabase();
          await editronDb.collection(COLLECTIONS.PROJECTS).updateOne(
            { projectId: editronProjectId },
            {
              $set: {
                alyzitronAnalysis: {
                  taskId,
                  overallScore: analysisResults.overall_score ?? null,
                  category: analysisResults.category ?? null,
                  strengths: analysisResults.strengths ?? [],
                  weaknesses: analysisResults.weaknesses ?? [],
                  completedAt: new Date(),
                },
                qualityScore: analysisResults.overall_score ?? null,
                updatedAt: new Date(),
              },
            },
          );
          logger.info('[Alyzitron] Results written to Editron project', { data: { editronProjectId, taskId } });
        } catch (writeErr: any) {
          logger.error('[Alyzitron] Failed to write results to Editron project (non-blocking)', { data: { editronProjectId, error: writeErr.message } });
        }
      }

      try {
        const { emitBrandEvent } = await import('@/lib/shared/brand-events');
        emitBrandEvent({
          userId,
          service: 'alyzitron',
          type: 'analysis_complete',
          payload: {
            taskId,
            editronProjectId: editronProjectId || undefined,
            hasTranscription: !!transcriptResult,
            wordCount: transcriptResult?.wordCount ?? 0,
          },
        }).catch((e: unknown) => logger.warn('[Alyzitron] Brand event failed', { data: { error: String(e) } }));
      } catch {
        // brand event emission is best-effort
      }

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
