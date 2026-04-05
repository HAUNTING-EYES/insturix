import { logger } from "@/app/api/services/alyzitron/utils/logger";

// ---------------------------------------------------------------------------
// Apify REST API Client — uses fetch() directly to avoid apify-client's
// dynamic import() calls that break Turbopack/Next.js bundling.
// ---------------------------------------------------------------------------

const APIFY_BASE_URL = "https://api.apify.com/v2";

function getToken(): string {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error("APIFY_API_KEY is not set");
  return token.trim();
}

// ---------------------------------------------------------------------------
// Custom Error
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------
export interface ExtractionResult {
  downloadUrl: string;
  mediaType: "audio" | "video" | "image";
  platform: "youtube" | "instagram" | "twitter" | "other";
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------
function detectPlatform(url: string): ExtractionResult["platform"] {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  return "other";
}

// ---------------------------------------------------------------------------
// Actor selection — lightweight downloaders, NOT full scrapers.
// ---------------------------------------------------------------------------
const ACTOR_MAP: Record<string, string> = {
  youtube: "epctex/youtube-video-downloader",
  instagram: "apify/instagram-reel-scraper",
  twitter: "quacker/twitter-url-scraper",
  other: "streamers/youtube-scraper",
};

// ---------------------------------------------------------------------------
// Exponential backoff with jitter for 429 rate-limit errors
// ---------------------------------------------------------------------------
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isRateLimited =
        err?.statusCode === 429 ||
        err?.message?.includes("rate-limit") ||
        err?.code === "RATE_LIMITED";

      if (!isRateLimited || attempt === maxRetries) throw err;

      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      logger.warn(`Rate limited by Apify. Retrying in ${Math.round(delay)}ms...`, {
        data: { attempt: attempt + 1, maxRetries },
      });
      await sleep(delay);
    }
  }
  throw new Error("Unreachable");
}

// ---------------------------------------------------------------------------
// Apify REST API helpers
// ---------------------------------------------------------------------------

/** Run an Actor synchronously and return the run object */
async function runActorSync(
  actorId: string,
  input: Record<string, unknown>,
  waitSecs = 120
): Promise<any> {
  const token = getToken();
  const url = `${APIFY_BASE_URL}/acts/${encodeURIComponent(actorId)}/runs?waitForFinish=${waitSecs}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (res.status === 429) {
    throw new ExtractionError("RATE_LIMITED", "Apify rate limit exceeded");
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new ExtractionError(
      "ACTOR_FAILED",
      `Actor ${actorId} call failed: ${res.status} ${res.statusText} - ${errBody.substring(0, 200)}`
    );
  }

  return res.json();
}

/** Fetch dataset items from a completed run */
async function getDatasetItems(datasetId: string): Promise<any[]> {
  const token = getToken();
  const url = `${APIFY_BASE_URL}/datasets/${datasetId}/items?format=json`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new ExtractionError(
      "ACTOR_FAILED",
      `Failed to fetch dataset items: ${res.status} ${res.statusText}`
    );
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// extractMediaUri
// ---------------------------------------------------------------------------
export async function extractMediaUri(url: string): Promise<ExtractionResult> {
  const platform = detectPlatform(url);
  const actorId = ACTOR_MAP[platform];

  logger.info(`[Apify] Extracting media from ${platform}`, { data: { url, actorId } });

  const startTime = Date.now();

  try {
    const items = await withRetry(async () => {
      // Run Actor synchronously via REST API
      const run = await runActorSync(actorId, buildActorInput(platform, url));

      if (!run?.data?.status || run.data.status !== "SUCCEEDED") {
        const status = run?.data?.status || "unknown";
        throw new ExtractionError(
          "ACTOR_FAILED",
          `Actor ${actorId} finished with status: ${status}`
        );
      }

      const datasetId = run.data.defaultDatasetId;
      if (!datasetId) {
        throw new ExtractionError("NO_MEDIA_FOUND", "Actor run has no dataset ID.");
      }

      const datasetItems = await getDatasetItems(datasetId);
      if (!datasetItems || datasetItems.length === 0) {
        throw new ExtractionError("NO_MEDIA_FOUND", "Actor returned no dataset items.");
      }

      return datasetItems;
    });

    const downloadUrl = extractDownloadUrl(items, platform);
    const mediaType = inferMediaType(downloadUrl, platform);
    const elapsed = Date.now() - startTime;

    logger.info(`[Apify] Extraction complete in ${elapsed}ms`, {
      data: { platform, mediaType, elapsed },
    });

    return { downloadUrl, mediaType, platform };
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    logger.error(`[Apify] Extraction failed after ${elapsed}ms`, {
      data: { platform, error: err.message },
    });

    if (err instanceof ExtractionError) throw err;

    if (err?.message?.includes("private") || err?.message?.includes("not found")) {
      throw new ExtractionError("PRIVATE_CONTENT", `Content is private or unavailable: ${url}`);
    }
    if (err?.message?.includes("timeout")) {
      throw new ExtractionError("EXTRACTION_TIMEOUT", `Extraction timed out for: ${url}`);
    }

    throw new ExtractionError("ACTOR_FAILED", err.message || "Unknown extraction error");
  }
}

// ---------------------------------------------------------------------------
// Actor input builders
// ---------------------------------------------------------------------------
function buildActorInput(platform: string, url: string): Record<string, unknown> {
  switch (platform) {
    case "youtube":
      return { startUrls: [{ url }] };
    case "instagram":
      return { directUrls: [url] };
    case "twitter":
      return { urls: [url] };
    default:
      return { startUrls: [url] };
  }
}

// ---------------------------------------------------------------------------
// Extract the download URL from dataset items.
// ---------------------------------------------------------------------------
function extractDownloadUrl(items: Record<string, any>[], platform: string): string {
  const item = items[0];

  const candidates = [
    item?.downloadUrl,
    item?.downloadedVideo,
    item?.videoUrl,
    item?.video_url,
    item?.mediaUrl,
    item?.media_url,
    item?.url,
    item?.directUrl,
    item?.media?.[0]?.url,
    item?.media?.[0]?.videoUrl,
    item?.videos?.[0]?.url,
  ];

  const downloadUrl = candidates.find(
    (u) => typeof u === "string" && u.startsWith("http")
  );

  if (!downloadUrl) {
    throw new ExtractionError(
      "NO_MEDIA_FOUND",
      `Could not find download URL in Actor response for ${platform}. Keys: ${Object.keys(item).join(", ")}`
    );
  }

  return downloadUrl;
}

// ---------------------------------------------------------------------------
// Infer media type
// ---------------------------------------------------------------------------
function inferMediaType(
  url: string,
  platform: string
): ExtractionResult["mediaType"] {
  const lowered = url.toLowerCase();
  const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

  if (imageExts.some((ext) => lowered.includes(ext))) return "image";
  if (lowered.includes(".m4a") || lowered.includes(".mp3") || lowered.includes(".wav"))
    return "audio";
  if (platform === "youtube" && (lowered.includes("audio") || lowered.includes(".m4a")))
    return "audio";

  return "video";
}
