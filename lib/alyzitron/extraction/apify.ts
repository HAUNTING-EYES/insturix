import { logger } from "@/app/api/services/alyzitron/utils/logger";

const APIFY_BASE_URL = "https://api.apify.com/v2";

export type ExtractionErrorCode =
  | "PRIVATE_CONTENT"
  | "UNSUPPORTED_PLATFORM"
  | "RATE_LIMITED"
  | "EXTRACTION_TIMEOUT"
  | "NO_MEDIA_FOUND"
  | "ACTOR_FAILED";

export class ExtractionError extends Error {
  code: ExtractionErrorCode;
  constructor(code: ExtractionErrorCode, message: string) {
    super(message);
    this.name = "ExtractionError";
    this.code = code;
  }
}

const FREE_ACTOR_MAP: Record<string, string> = {
  youtube: "apify~youtube-scraper",        // Fixed: / -> ~
  instagram: "apify~instagram-scraper",    // Fixed: / -> ~
  other: "pato~youtube-video-downloader"   // Fixed: / -> ~
};

export async function extractMediaUri(url: string): Promise<any> {
  const token = process.env.APIFY_API_KEY?.trim();
  const platform = url.includes("youtube") ? "youtube" : url.includes("instagram") ? "instagram" : "other";
  const actorId = FREE_ACTOR_MAP[platform];
  const startTime = Date.now();

  // 1. Initial Validation Log
  if (!token) {
    logger.error("[Apify] CRITICAL: APIFY_API_KEY is missing from environment variables.");
    throw new ExtractionError("ACTOR_FAILED", "Server configuration error: Missing API Key.");
  }

  let cleanUrl = url.trim();
  if (platform === "youtube" && cleanUrl.includes("/shorts/")) {
    cleanUrl = cleanUrl.replace("/shorts/", "/watch?v=");
  }

  const input = platform === "instagram"
    ? { directUrls: [cleanUrl], resultsLimit: 1, resultsType: "details" }
    : { startUrls: [{ url: cleanUrl }], maxResults: 1, downloadVideo: true };

  logger.info(`[Apify] 🚀 Starting Extraction Pipeline`, {
    data: { platform, actorId, input, url: cleanUrl }
  });

  try {
    // STEP 1: START ACTOR
    const startRes = await fetch(`${APIFY_BASE_URL}/acts/${actorId}/runs?waitForFinish=0`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(input),
    });

    const startBody = await startRes.json();

    if (!startRes.ok) {
      // Detailed error logging for Step 1
      logger.error(`[Apify] ❌ Actor failed to start!`, {
        data: {
          httpStatus: startRes.status,
          errorType: startBody.error?.type,
          errorMessage: startBody.error?.message,
          actorId
        }
      });
      throw new ExtractionError("ACTOR_FAILED", `Apify Start Error (${startRes.status}): ${startBody.error?.message}`);
    }

    const run = startBody.data;
    logger.info(`[Apify] ✅ Actor started successfully. RunID: ${run.id}`);

    // STEP 2: POLLING LOOP
    let runResult;
    for (let i = 1; i <= 30; i++) {
      const pollStart = Date.now();
      await new Promise(r => setTimeout(r, 2000));

      const pollRes = await fetch(`${APIFY_BASE_URL}/actor-runs/${run.id}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      const pollBody = await pollRes.json();
      const status = pollBody.data?.status;

      logger.info(`[Apify] ⏳ Polling Attempt ${i}/30...`, {
        data: { runId: run.id, status, duration: `${Date.now() - pollStart}ms` }
      });

      if (status === "SUCCEEDED") {
        runResult = pollBody.data;
        logger.info(`[Apify] 🎉 Actor run SUCCEEDED in ${Date.now() - startTime}ms`);
        break;
      }

      if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
        logger.error(`[Apify] ❌ Actor run failed during polling!`, { data: { status, runId: run.id } });
        throw new Error(`Actor run ended with status: ${status}`);
      }
    }

    if (!runResult) {
      throw new ExtractionError("EXTRACTION_TIMEOUT", "Actor did not finish within 60 seconds.");
    }

    // STEP 3: DATASET EXTRACTION
    logger.info(`[Apify] 📥 Fetching items from Dataset: ${runResult.defaultDatasetId}`);
    const itemsRes = await fetch(`${APIFY_BASE_URL}/datasets/${runResult.defaultDatasetId}/items?clean=true`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    const items = await itemsRes.json();

    if (!items || items.length === 0) {
      logger.error(`[Apify] ❌ Dataset is empty! No media was found.`, { data: { datasetId: runResult.defaultDatasetId } });
      throw new ExtractionError("NO_MEDIA_FOUND", "Actor finished but returned no results.");
    }

    const item = items[0];
    const downloadUrl = item?.downloadUrl || item?.downloadedVideo || item?.videoUrl || item?.mediaUrl || item?.url;

    // Log the structure of the first item to see what keys we got
    logger.info(`[Apify] 🔍 Analyzing dataset item...`, {
      data: { availableKeys: Object.keys(item), foundUrl: !!downloadUrl }
    });

    if (!downloadUrl) {
      throw new ExtractionError("NO_MEDIA_FOUND", `Media URL missing in dataset. Available keys: ${Object.keys(item).join(", ")}`);
    }

    const totalTime = Date.now() - startTime;
    logger.info(`[Apify] ✨ Extraction successful!`, {
      data: { platform, totalTime: `${totalTime}ms`, downloadUrl }
    });

    // Infer media type from URL
    const lowered = downloadUrl.toLowerCase();
    const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    const audioExts = [".m4a", ".mp3", ".wav", ".ogg"];
    const mediaType = imageExts.some(ext => lowered.includes(ext))
      ? "image"
      : audioExts.some(ext => lowered.includes(ext))
        ? "audio"
        : "video";

    return { downloadUrl, platform, mediaType };
  } catch (err: any) {
    const totalTime = Date.now() - startTime;
    logger.error(`[Apify] 💥 Pipeline CRASHED after ${totalTime}ms`, {
      data: { error: err.message, stack: err.stack?.split('\n')[1] }
    });
    throw err;
  }
}