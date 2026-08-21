import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse, NextRequest } from "next/server";
import { getCollections } from "../utils/mongodb";
import { CreditsService } from "@/lib/services/creditsService";
import { getCreditCost } from "@/lib/config/creditCosts";
import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from "@/lib/financials/provider-cost-events";
import { ObjectId } from "mongodb";
import { analyzeVideoWithGemini } from "@/lib/services/vertexAiService";
import { logger } from "../utils/logger";
import { upsertTranscriptionProcessing, upsertTranscriptionCompleted } from "@/lib/alyzitron";
import { extractMediaUri, ExtractionError } from "@/lib/alyzitron/extraction/apify";
import { uploadUrlToGeminiFileAPI } from "@/lib/services/geminiFileService";
import {
  buildAlyzitronAnalysisContext,
  resolveAlyzitronBrandContext,
} from "@/lib/alyzitron/services/brand-vault-context";
import { normalizeAlyzitronAnalysisResults } from "@/lib/alyzitron/analysis-results";
import {
  inferAlyzitronMediaSourceKind,
  resolveAlyzitronContentIntent,
} from "@/lib/alyzitron/analysis-intent";
import type { AlyzitronIntentResolution, AlyzitronMediaSourceKind } from "../types";

const ALYZITRON_ANALYSIS_PROVIDER = "gemini";
const ALYZITRON_ANALYSIS_OPERATION = "video_analysis";
const ALYZITRON_ANALYSIS_ROUTE = "/api/services/alyzitron/processor";

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}


function storageBackendToMediaSourceKind(value: unknown): AlyzitronMediaSourceKind | undefined {
  const backend = cleanString(value);
  if (backend === "youtube") return "youtube_url";
  if (backend === "external") return "external_url";
  if (backend === "gcs" || backend === "r2") return backend;
  return undefined;
}

function buildIntentMetadata(
  intentResolution: AlyzitronIntentResolution,
  mediaSourceKind?: AlyzitronMediaSourceKind,
): Record<string, unknown> {
  return {
    ...(mediaSourceKind ? { mediaSourceKind } : {}),
    contentIntent: intentResolution.contentIntent,
    intentSource: intentResolution.source,
    intentConfidence: intentResolution.confidence,
    intentRationale: intentResolution.rationale,
    userConfirmedIntent: intentResolution.userConfirmed,
    intentResolution,
  };
}

function buildIntentCompletionFields(
  intentResolution: AlyzitronIntentResolution,
  mediaSourceKind?: AlyzitronMediaSourceKind,
): Record<string, unknown> {
  return {
    ...(mediaSourceKind ? { mediaSourceKind, "metadata.mediaSourceKind": mediaSourceKind } : {}),
    contentIntent: intentResolution.contentIntent,
    intentResolution,
    "metadata.contentIntent": intentResolution.contentIntent,
    "metadata.intentSource": intentResolution.source,
    "metadata.intentConfidence": intentResolution.confidence,
    "metadata.intentRationale": intentResolution.rationale,
    "metadata.userConfirmedIntent": intentResolution.userConfirmed,
    "metadata.intentResolution": intentResolution,
  };
}

type AlyzitronGeminiAnalysisCostDraft = {
  model?: string;
  mediaSeconds?: number;
  mediaMinutes?: number;
  outputTokens?: number;
  totalTokens?: number;
  functionMs?: number;
  responseChars?: number;
  mimeType?: string;
  mediaSourceKind?: AlyzitronMediaSourceKind;
  usedAudioTrack?: boolean;
  filePartCount?: number;
  resultMode?: string;
};

function estimateTokensFromUnknown(value: unknown): number | undefined {
  try {
    const serialized = JSON.stringify(value ?? {});
    return Math.max(1, Math.ceil(serialized.length / 4));
  } catch {
    return undefined;
  }
}

function getAnalysisResultMode(result: any): string {
  if (result?.parseError) return "parse_error";
  if (result?.truncated) return "truncated";
  if (result?.extractedFromText) return "extracted_from_text";
  return "structured_json";
}

async function recordAlyzitronGeminiAnalysisCost(input: AlyzitronGeminiAnalysisCostDraft & {
  status: ProviderCostEventStatus;
  userId: string;
  orgId?: string;
  taskId: string;
  creditTransactionId?: string;
  chargedCredits?: number;
  error?: unknown;
}) {
  await recordProviderCostEvent({
    idempotencyKey:
      input.status === "success" && input.creditTransactionId
        ? `alyzitron:analysis:${input.taskId}:${input.creditTransactionId}`
        : undefined,
    status: input.status,
    userId: input.userId,
    orgId: input.orgId,
    taskId: input.taskId,
    assetId: input.taskId,
    creditTransactionId: input.creditTransactionId,
    service: "alyzitron",
    action: "video_analysis",
    route: ALYZITRON_ANALYSIS_ROUTE,
    provider: ALYZITRON_ANALYSIS_PROVIDER,
    model: input.model,
    operation: ALYZITRON_ANALYSIS_OPERATION,
    chargedCredits: input.chargedCredits,
    units: {
      requestCount: 1,
      mediaSeconds: input.mediaSeconds,
      mediaMinutes: input.mediaMinutes,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
      functionMs: input.functionMs,
    },
    metadata: {
      mediaSourceKind: input.mediaSourceKind,
      mimeType: input.mimeType,
      usedAudioTrack: input.usedAudioTrack,
      filePartCount: input.filePartCount,
      resultMode: input.resultMode,
      responseChars: input.responseChars,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}

async function handler(request: NextRequest) {
  let currentTaskId: string | null = null;
  let currentUserId: string | null = null;

  try {
    const body = await request.json();
    const { taskId, editronProjectId } = body;
    currentTaskId = taskId;

    if (!taskId) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const { analyses } = await getCollections();
    if (!ObjectId.isValid(taskId)) return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });

    const task = await analyses.findOne({ _id: ObjectId.createFromHexString(taskId) });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const userId = cleanString(task.clerkUserId);
    if (!userId) return NextResponse.json({ error: "Task owner missing" }, { status: 400 });
    currentUserId = userId;
    if (task.status === "completed" || task.status === "failed") return NextResponse.json({ success: true, message: "Already processed" });

    const taskBrandId =
      cleanString(body.brandId) ??
      cleanString(task.brandId) ??
      cleanString(asRecord(task.context)?.brandId) ??
      cleanString(asRecord(task.metadata)?.brandId);
    const taskContext = asRecord(task.context);
    const taskMetadata = asRecord(task.metadata);
    const mediaSourceKind = inferAlyzitronMediaSourceKind({
      mediaSourceKind:
        body.mediaSourceKind ??
        task.mediaSourceKind ??
        taskMetadata?.mediaSourceKind ??
        storageBackendToMediaSourceKind(taskMetadata?.storageBackend ?? taskMetadata?.storage),
      videoUrl: task.videoUrl,
      metadata: task.metadata,
    });
    const intentResolution = resolveAlyzitronContentIntent({
      userSelectedIntent: body.userSelectedIntent,
      contentIntent:
        body.contentIntent ??
        body.content_intent ??
        task.contentIntent ??
        taskMetadata?.contentIntent ??
        taskContext?.contentIntent,
      intentSource: body.intentSource ?? taskMetadata?.intentSource ?? taskContext?.intentSource,
      userConfirmedIntent: body.userConfirmedIntent ?? taskMetadata?.userConfirmedIntent ?? taskContext?.userConfirmedIntent,
      intentResolution: body.intentResolution ?? task.intentResolution ?? taskMetadata?.intentResolution ?? taskContext?.intentResolution,
      mediaSourceKind,
      videoUrl: task.videoUrl,
      brandId: taskBrandId,
      editronProjectId: editronProjectId ?? task.editronProjectId,
      metadata: task.metadata,
      context: task.context,
    });
    const intentMetadata = buildIntentMetadata(intentResolution, mediaSourceKind);
    const intentCompletionFields = buildIntentCompletionFields(intentResolution, mediaSourceKind);
    const brandContext = await resolveAlyzitronBrandContext({
      userId,
      orgId: cleanString(task.orgId) ?? null,
      brandId: taskBrandId,
    });
    const analysisContext = buildAlyzitronAnalysisContext(task.context || {}, brandContext, intentResolution);
    const analysisMetadata = {
      ...(task.metadata || {}),
      ...(taskBrandId ? { brandId: taskBrandId } : {}),
      ...(brandContext.source !== "none" ? { brandContextSource: brandContext.source } : {}),
      ...intentMetadata,
    };
    const brandCompletionFields = {
      ...(taskBrandId ? { brandId: taskBrandId, "metadata.brandId": taskBrandId } : {}),
      ...(brandContext.source !== "none"
        ? { brandContextSource: brandContext.source, "metadata.brandContextSource": brandContext.source }
        : {}),
    };
    let analysisCreditTransactionId: string | undefined;
    let analysisChargedCredits: number | undefined;
    let geminiAnalysisCostDraft: AlyzitronGeminiAnalysisCostDraft | null = null;
    let geminiAnalysisCostRecorded = false;

    const recordPendingGeminiAnalysisCost = async (status: ProviderCostEventStatus, error?: unknown) => {
      if (!geminiAnalysisCostDraft || geminiAnalysisCostRecorded) return;
      await recordAlyzitronGeminiAnalysisCost({
        ...geminiAnalysisCostDraft,
        status,
        userId,
        orgId: cleanString(task.orgId),
        taskId,
        creditTransactionId: analysisCreditTransactionId,
        chargedCredits: status === "success" ? analysisChargedCredits : undefined,
        error,
      });
      geminiAnalysisCostRecorded = true;
    };
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
      const taskBilling = asRecord(task.billing);
      analysisCreditTransactionId = cleanString(taskBilling?.creditTransactionId);
      analysisChargedCredits = cleanNumber(taskBilling?.chargedCredits);
      const analysisUsageMinutes = cleanNumber(taskBilling?.usageMinutes) ?? cleanNumber(task.usageMinutes) ?? 1;
      const analysisMediaSeconds = isDirectImageUpload
        ? 0
        : (cleanNumber(task.videoDuration) ?? analysisUsageMinutes * 60);
      const geminiFileCostContext = {
        userId,
        orgId: cleanString(task.orgId),
        taskId,
        mediaSourceKind,
        route: ALYZITRON_ANALYSIS_ROUTE,
      };
      const runGeminiAnalysis = async (
        mediaUri: string,
        context: any,
        metadata: any,
        modelOverride?: string,
        audioUri?: string,
      ) => {
        const startedAt = Date.now();
        const draftBase: AlyzitronGeminiAnalysisCostDraft = {
          model: modelOverride || "gemini-2.5-flash",
          mediaSeconds: analysisMediaSeconds,
          mediaMinutes: analysisUsageMinutes,
          mimeType: updatedMimeType,
          mediaSourceKind,
          usedAudioTrack: Boolean(audioUri),
          filePartCount: audioUri ? 2 : 1,
        };

        try {
          const result = await analyzeVideoWithGemini(mediaUri, context, metadata, modelOverride, audioUri);
          const outputTokens = estimateTokensFromUnknown(result);
          geminiAnalysisCostDraft = {
            ...draftBase,
            model: cleanString(result?.modelUsed) ?? draftBase.model,
            outputTokens,
            totalTokens: outputTokens,
            functionMs: Date.now() - startedAt,
            responseChars: JSON.stringify(result ?? {}).length,
            resultMode: getAnalysisResultMode(result),
          };
          return result;
        } catch (err) {
          geminiAnalysisCostDraft = {
            ...draftBase,
            functionMs: Date.now() - startedAt,
            resultMode: "provider_error",
          };
          await recordPendingGeminiAnalysisCost("failed", err);
          throw err;
        }
      };

      // ROUTE 1: IMAGE UPLOAD
      if (isDirectImageUpload) {
        logger.info("Route 1: Direct Image");
        updatedMimeType = 'image/jpeg';
        await upsertTranscriptionCompleted(taskId, { deepgramRequestId: "image-bypass", text: "[Image Analysis]", formattedTranscript: "", wordCount: 0 } as any).catch(() => { });
        analysisResults = await runGeminiAnalysis(task.videoUrl, analysisContext, analysisMetadata);
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
        const { fileUri } = await uploadUrlToGeminiFileAPI(downloadUrl, updatedMimeType, `task-${taskId}`, geminiFileCostContext);

        logger.info("Starting Gemini Analysis for R2 Path");
        const gem = await runGeminiAnalysis(fileUri, { ...analysisContext, transcript: "Native audio." }, analysisMetadata);
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

          const gem = await runGeminiAnalysis(task.videoUrl, { ...analysisContext, transcript: "Native audio." }, analysisMetadata);
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

            const { fileUri } = await uploadUrlToGeminiFileAPI(extracted.downloadUrl, "image/jpeg", `task-${taskId}`, geminiFileCostContext);
            updatedVideoUrl = extracted.downloadUrl;
            await upsertTranscriptionCompleted(taskId, { deepgramRequestId: "image-bypass", text: "[Image]", formattedTranscript: "", wordCount: 0 } as any).catch(() => { });
            analysisResults = await runGeminiAnalysis(fileUri, analysisContext, analysisMetadata);

          } else {
            // VIDEO/AUDIO LOGIC
            updatedMimeType = extracted.mediaType === "audio" ? "audio/mpeg" : "video/mp4";

            logger.info("Uploading extracted media to Gemini File API");
            const { fileUri: videoFileUri } = await uploadUrlToGeminiFileAPI(extracted.downloadUrl, updatedMimeType, `task-${taskId}-video`, geminiFileCostContext);

            let audioFileUri: string | undefined;
            if (extracted.audioUrl) {
              logger.info("Separate audio track detected, uploading audio to Gemini File API");
              const { fileUri: uploadedAudioUri } = await uploadUrlToGeminiFileAPI(extracted.audioUrl, 'audio/mpeg', `task-${taskId}-audio`, geminiFileCostContext);
              audioFileUri = uploadedAudioUri;
              logger.info("Audio upload complete", { data: { audioFileUri } });
            }

            updatedVideoUrl = task.videoUrl; // Ensure we keep original external URL for embed

            logger.info("Starting Gemini Analysis" + (audioFileUri ? " (dual-file: video + audio)" : ""));
            const gem = await runGeminiAnalysis(videoFileUri, { ...analysisContext, transcript: "Native audio." }, analysisMetadata, undefined, audioFileUri);
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

      if (analysisResults?.parseError) {
        const parseError = new Error("Alyzitron analysis returned invalid JSON. Please retry the analysis.");
        await recordPendingGeminiAnalysisCost("failed", parseError);
        throw parseError;
      }

      const normalizedResults = normalizeAlyzitronAnalysisResults(analysisResults);
      if (!normalizedResults) {
        const emptyResultError = new Error("Alyzitron analysis returned no usable results.");
        await recordPendingGeminiAnalysisCost("failed", emptyResultError);
        throw emptyResultError;
      }
      analysisResults = normalizedResults;

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
            ...brandCompletionFields,
            ...intentCompletionFields,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      await recordPendingGeminiAnalysisCost("success");

      // Write analysis results back to Editron project (fail-open)
      if (editronProjectId && analysisResults) {
        try {
          const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
          const editronDb = await getDatabase();
          await editronDb.collection(COLLECTIONS.PROJECTS).updateOne(
            { projectId: editronProjectId, userId },
            {
              $set: {
                alyzitronAnalysis: {
                  taskId,
                  overallScore: analysisResults.overall_score ?? null,
                  category: analysisResults.category ?? null,
                  strengths: analysisResults.strengths ?? [],
                  weaknesses: analysisResults.weaknesses ?? [],
                  contentIntent: intentResolution.contentIntent,
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
            contentIntent: intentResolution.contentIntent,
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
      await recordPendingGeminiAnalysisCost("failed", err).catch(() => { });
      try {
        await CreditsService.refundCredits(
          userId,
          analysisChargedCredits ?? getCreditCost("alyzitron", "video_analysis", { durationMinutes: task.usageMinutes || 1 }),
          `Failed: ${err.message}`,
          {
            service: "alyzitron",
            action: "video_analysis",
            originalTransactionId: analysisCreditTransactionId,
          }
        );
      } catch (e) { }
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  } catch (globalErr: any) {
    logger.error("Global Catch", { data: { error: globalErr.message } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const POST = async (req: NextRequest) => {
  const bypass = req.headers.get("x-development-bypass");
  const isDevelopment = process.env.NODE_ENV === "development" || process.env.APP_ENV === "development";
  if (bypass === "true" && isDevelopment) return handler(req);
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY) {
    return NextResponse.json({ error: "Worker signing is not configured" }, { status: 503 });
  }
  return verifySignatureAppRouter(handler)(req);
};

export const runtime = "nodejs";
