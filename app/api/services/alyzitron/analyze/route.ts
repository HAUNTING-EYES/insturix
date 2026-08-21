import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { logger } from "../utils/logger";
import { validateYouTubeVideo } from "../utils/youtube";
import { checkCredits } from "@/lib/services/creditsMiddleware";
import { getCreditCost } from "@/lib/config/creditCosts";
import { getCollections } from "../utils/mongodb";
import { ObjectId } from "mongodb";
import { Client } from "@upstash/qstash";
import { projectService } from "@/lib/editron/services/project-service";
import {
  AlyzitronBrandContextError,
  buildAlyzitronAnalysisContext,
  resolveAlyzitronBrandContext,
  resolveAlyzitronTaskBrandId,
} from "@/lib/alyzitron/services/brand-vault-context";
import {
  inferAlyzitronMediaSourceKind,
  resolveAlyzitronContentIntent,
} from "@/lib/alyzitron/analysis-intent";
import type { AlyzitronIntentResolution, AlyzitronMediaSourceKind } from "../types";
import {
  AlyzitronStorageOwnershipError,
  buildAlyzitronPublicUrl,
  requireAlyzitronOwnedStorageKey,
} from "../utils/storage-ownership";

type AlyzitronStorageBackend = 'gcs' | 'r2' | 'youtube' | 'external';
function getGcsUrl(gcsPath: string): string {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) throw new Error("Server configuration error: GCS bucket name missing.");
  return `gs://${bucketName}/${gcsPath}`;
}

function detectStorageBackend(url: string): AlyzitronStorageBackend {
  if (url.includes('r2.cloudflarestorage.com')) return 'r2';
  if (process.env.R2_PUBLIC_BASE_URL && url.startsWith(process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, ''))) return 'r2';
  if (url.startsWith('gs://')) return 'gcs';
  if (url.includes('/alyzitron-uploads/')) return 'r2';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  return 'external';
}

function storageBackendToMediaSourceKind(backend: string): AlyzitronMediaSourceKind | undefined {
  if (backend === 'youtube') return 'youtube_url';
  if (backend === 'external') return 'external_url';
  if (backend === 'gcs' || backend === 'r2') return backend;
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

class AlyzitronMediaSourceError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AlyzitronMediaSourceError";
  }
}

const ALLOWED_EXTERNAL_MEDIA_HOSTS = new Set([
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
]);

function hostMatches(host: string, allowedHost: string): boolean {
  return host === allowedHost || host.endsWith(`.${allowedHost}`);
}

function normalizeAllowedExternalMediaUrl(value: string, backend: AlyzitronStorageBackend): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AlyzitronMediaSourceError("Invalid media URL");
  }

  if (url.protocol !== "https:") {
    throw new AlyzitronMediaSourceError("Media URL must use HTTPS");
  }

  const host = url.hostname.toLowerCase();
  const isYouTube = backend === "youtube" || hostMatches(host, "youtube.com") || host === "youtu.be";
  if (isYouTube) {
    return url.toString();
  }

  if (![...ALLOWED_EXTERNAL_MEDIA_HOSTS].some((allowedHost) => hostMatches(host, allowedHost))) {
    throw new AlyzitronMediaSourceError("Unsupported external media provider");
  }

  return url.toString();
}

async function requireTrackedAlyzitronUpload(userId: string, storageKey: string): Promise<void> {
  const { uploadTracking } = await getCollections();
  const uploadRecord = await uploadTracking.findOne({
    userId,
    $or: [{ storageKey }, { storagePath: storageKey }, { gcsPath: storageKey }],
  });

  if (!uploadRecord) {
    throw new AlyzitronMediaSourceError("Uploaded media is not registered to this user", 404);
  }
}

async function resolveAlyzitronMediaSource(
  userId: string,
  rawVideoUrl: string,
  backend: AlyzitronStorageBackend,
): Promise<{ backend: AlyzitronStorageBackend; finalVideoUrl: string }> {
  if (backend === "gcs" || backend === "r2") {
    const storageKey = requireAlyzitronOwnedStorageKey(userId, rawVideoUrl);
    await requireTrackedAlyzitronUpload(userId, storageKey);
    return {
      backend,
      finalVideoUrl: backend === "gcs" ? getGcsUrl(storageKey) : buildAlyzitronPublicUrl(storageKey, "r2"),
    };
  }

  return {
    backend,
    finalVideoUrl: normalizeAllowedExternalMediaUrl(rawVideoUrl, backend),
  };
}
const qstashBaseUrl = process.env.QSTASH_URL || (process.env.APP_ENV === 'development' ? 'http://127.0.0.1:8080' : undefined);
const qstash = new Client({ token: process.env.QSTASH_TOKEN!, baseUrl: qstashBaseUrl });

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId, orgId } = session;
    const body = await request.json();
    const { video_url, context, metadata, storage, editronProjectId, brandId } = body;

    if (typeof video_url !== "string" || !video_url.trim()) return NextResponse.json({ error: "Missing required field: video_url" }, { status: 400 });

    const backend = (storage || detectStorageBackend(video_url)) as AlyzitronStorageBackend;
    const mediaSourceKind = inferAlyzitronMediaSourceKind({
      mediaSourceKind: body.mediaSourceKind ?? metadata?.mediaSourceKind ?? storageBackendToMediaSourceKind(backend),
      videoUrl: video_url,
      metadata,
    });
    const taskBrandId = await resolveAlyzitronTaskBrandId({
      userId,
      orgId,
      editronProjectId,
      bodyBrandId: brandId,
      context,
      metadata,
    });

    let brandContext = null;
    try {
      brandContext = await resolveAlyzitronBrandContext({ userId, orgId: orgId ?? null, brandId: taskBrandId });
    } catch (error) {
      if (error instanceof AlyzitronBrandContextError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              type: error.code,
              message: `Select an approved brand before running brand-aware Alyzitron analysis for ${error.brandId}.`,
            },
          },
          { status: 400 },
        );
      }
      throw error;
    }

    const contextContentIntent = typeof context?.contentIntent === 'string' && context.contentIntent.trim()
      ? context.contentIntent
      : undefined;
    const intentResolution = resolveAlyzitronContentIntent({
      userSelectedIntent: body.userSelectedIntent ?? contextContentIntent,
      contentIntent: body.contentIntent ?? body.content_intent ?? contextContentIntent,
      intentSource: body.intentSource ?? (contextContentIntent ? 'user_selected' : undefined),
      userConfirmedIntent: body.userConfirmedIntent ?? (contextContentIntent ? true : undefined),
      intentResolution: body.intentResolution,
      mediaSourceKind,
      videoUrl: video_url,
      brandId: taskBrandId,
      editronProjectId,
      metadata,
      context,
      userText: body.userText ?? body.prompt,
    });
    const intentMetadata = buildIntentMetadata(intentResolution, mediaSourceKind);
    const analysisContext = buildAlyzitronAnalysisContext(context || {}, brandContext, intentResolution);
    const isGCS = backend === 'gcs';
    const isR2 = backend === 'r2';
    const isMaybeYouTube = backend === 'youtube';

    // Detect image by mimetype or extension
    const isImageFile = metadata?.mimeType?.startsWith('image/') || video_url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) !== null;

    let videoDuration = 0;

    // Validate duration ONLY if it's not an image
    if (!isImageFile) {
      if (isGCS || isR2) {
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
        } catch {
          return NextResponse.json({ success: false, error: { type: "YOUTUBE_API_ERROR", message: "Failed to validate YouTube video" } }, { status: 400 });
        }
      } else {
        videoDuration = metadata?.duration || 60; // Fallback to 60s for external links like Insta/X
      }
    }

    let finalVideoUrl: string;
    try {
      const resolvedMediaSource = await resolveAlyzitronMediaSource(userId, video_url, backend);
      finalVideoUrl = resolvedMediaSource.finalVideoUrl;
    } catch (mediaError) {
      if (mediaError instanceof AlyzitronStorageOwnershipError || mediaError instanceof AlyzitronMediaSourceError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              type: "INVALID_MEDIA_SOURCE",
              message: mediaError.message,
            },
          },
          { status: mediaError instanceof AlyzitronStorageOwnershipError ? mediaError.status : mediaError.status },
        );
      }
      throw mediaError;
    }

    const usageMinutes = isImageFile ? 1 : Math.ceil(videoDuration / 60);
    const analysisChargedCredits = getCreditCost('alyzitron', 'video_analysis', { durationMinutes: usageMinutes });
    const creditCheck = await checkCredits(userId, 'alyzitron', 'video_analysis', { durationMinutes: usageMinutes });

    if (!creditCheck.allowed) return creditCheck.errorResponse;
    const analysisDeduct = await creditCheck.deduct();

    let analyses: any;
    const taskId = new ObjectId();

    try {
      const collections = await getCollections();
      analyses = collections.analyses;

      let createdByName = 'Unknown';
      if (orgId) {
        try {
          const client = await clerkClient();
          const user = await client.users.getUser(userId);
          createdByName = user.firstName ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}` : user.username || 'Unknown';
        } catch { }
      }

      await analyses.insertOne({
        _id: taskId,
        taskId: taskId.toString(),
        clerkUserId: userId,
        orgId: orgId || undefined,
        createdByName,
        videoUrl: finalVideoUrl,
        context: analysisContext,
        metadata: {
          ...metadata,
          mimeType: isImageFile ? (metadata?.mimeType || 'image/jpeg') : (metadata?.mimeType || 'video/mp4'),
          storage: backend,
          storageBackend: backend,
          ...intentMetadata,
          ...(taskBrandId ? { brandId: taskBrandId } : {}),
          ...(brandContext?.source && brandContext.source !== 'none' ? { brandContextSource: brandContext.source } : {}),
        },
        ...(taskBrandId ? { brandId: taskBrandId } : {}),
        ...(mediaSourceKind ? { mediaSourceKind } : {}),
        contentIntent: intentResolution.contentIntent,
        intentResolution,
        ...(brandContext?.source && brandContext.source !== 'none' ? { brandContextSource: brandContext.source } : {}),
        status: "listed",
        unread: true,
        results: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        videoDuration: isImageFile ? 0 : videoDuration,
        usageMinutes,
        billing: {
          service: 'alyzitron',
          action: 'video_analysis',
          creditTransactionId: analysisDeduct.transactionId,
          chargedCredits: analysisChargedCredits,
          usageMinutes,
        },
        ...(editronProjectId ? { editronProjectId } : {}),
      });

      // If triggered from Editron, move project to "analyze" stage (fail-open)
      if (editronProjectId) {
        try {
          await projectService.updateProjectMetadata(editronProjectId, { pipelineStage: 'analyze' });
          console.log(`[Alyzitron] Project ${editronProjectId} moved to analyze stage`);
        } catch (stageErr: any) {
          console.error(`[Alyzitron] Failed to update project stage (non-blocking): ${stageErr.message}`);
        }
      }

      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      await qstash.publishJSON({
        url: `${baseUrl}/api/services/alyzitron/processor`,
        body: {
          taskId: taskId.toString(),
          userId,
          videoUrl: finalVideoUrl,
          context: analysisContext,
          metadata: {
            ...metadata,
            storage: backend,
            storageBackend: backend,
            ...intentMetadata,
            ...(taskBrandId ? { brandId: taskBrandId } : {}),
            ...(brandContext?.source && brandContext.source !== 'none' ? { brandContextSource: brandContext.source } : {}),
          },
          ...(taskBrandId ? { brandId: taskBrandId } : {}),
          ...(mediaSourceKind ? { mediaSourceKind } : {}),
          contentIntent: intentResolution.contentIntent,
          intentResolution,
          ...(editronProjectId ? { editronProjectId } : {}),
        },
        retries: 3,
        timeout: 120,
        headers: { "Content-Type": "application/json" },
      });

      logger.info('Queued Alyzitron analysis', {
        data: {
          taskId: taskId.toString(),
          userId,
          backend,
          videoDuration,
          isImageFile,
          contentIntent: intentResolution.contentIntent
        }
      });

      return NextResponse.json({ success: true, taskId: taskId.toString(), intentResolution });

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
