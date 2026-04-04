import { ApifyClient } from "apify-client";
import { logger } from "@/app/api/services/alyzitron/utils/logger";

// ---------------------------------------------------------------------------
// Apify Client — lazily instantiated, reused across calls.
// ---------------------------------------------------------------------------
let _client: ApifyClient | null = null;

function getClient(): ApifyClient {
  if (!_client) {
    const token = process.env.APIFY_API_KEY;
    if (!token) throw new Error("APIFY_API_KEY is not set");
    _client = new ApifyClient({ token });
  }
  return _client;
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
// These use internal APIs / yt-dlp cloud, no DOM rendering → fast.
// ---------------------------------------------------------------------------
const ACTOR_MAP: Record<string, string> = {
  youtube: "bernardo/youtube-download",
  instagram: "apify/instagram-reel-scraper",
  twitter: "quacker/twitter-url-scraper",
  other: "apify/video-downloader",
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
        err?.type === "rate-limit-exceeded";

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
// extractMediaUri
//
// Triggers a lightweight Apify Actor to extract a direct download URL.
// Uses synchronous Actor runs (waitForFinish) to hit < 5s for simple links.
// ---------------------------------------------------------------------------
export async function extractMediaUri(url: string): Promise<ExtractionResult> {
  const client = getClient();
  const platform = detectPlatform(url);
  const actorId = ACTOR_MAP[platform];

  logger.info(`[Apify] Extracting media from ${platform}`, { data: { url, actorId } });

  const startTime = Date.now();

  try {
    const result = await withRetry(async () => {
      // Run the Actor synchronously — waits up to 120s for completion.
      const run = await client.actor(actorId).call(
        buildActorInput(platform, url),
        {
          waitSecs: 120,
          memory: 256, // Lightweight — no browser needed
        }
      );

      if (!run || run.status !== "SUCCEEDED") {
        throw new ExtractionError(
          "ACTOR_FAILED",
          `Actor ${actorId} finished with status: ${run?.status || "unknown"}`
        );
      }

      // Fetch dataset items
      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      if (!items || items.length === 0) {
        throw new ExtractionError("NO_MEDIA_FOUND", "Actor returned no dataset items.");
      }

      return items;
    });

    // Extract the download URL from dataset items
    const downloadUrl = extractDownloadUrl(result, platform);
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

    // Map known Apify error types to our custom errors
    if (err instanceof ExtractionError) throw err;

    if (err?.type === "record-not-found" || err?.message?.includes("private")) {
      throw new ExtractionError("PRIVATE_CONTENT", `Content is private or unavailable: ${url}`);
    }
    if (err?.type === "invalid-value") {
      throw new ExtractionError("UNSUPPORTED_PLATFORM", `Invalid or unsupported URL: ${url}`);
    }
    if (err?.statusCode === 408 || err?.message?.includes("timeout")) {
      throw new ExtractionError("EXTRACTION_TIMEOUT", `Extraction timed out for: ${url}`);
    }

    throw new ExtractionError("ACTOR_FAILED", err.message || "Unknown extraction error");
  }
}

// ---------------------------------------------------------------------------
// Actor input builders — each actor expects different input shapes.
// ---------------------------------------------------------------------------
function buildActorInput(platform: string, url: string): Record<string, unknown> {
  switch (platform) {
    case "youtube":
      return {
        urls: [url],
        downloadVideo: true,
        quality: "highest",
      };
    case "instagram":
      return {
        directUrls: [url],
      };
    case "twitter":
      return {
        urls: [url],
        includeMedia: true,
      };
    default:
      return {
        urls: [url],
      };
  }
}

// ---------------------------------------------------------------------------
// Extract the download URL from dataset items.
// Each Actor returns data in slightly different shapes.
// ---------------------------------------------------------------------------
function extractDownloadUrl(items: Record<string, any>[], platform: string): string {
  const item = items[0];

  // Try common field names across Actors
  const candidates = [
    item?.downloadUrl,
    item?.videoUrl,
    item?.video_url,
    item?.mediaUrl,
    item?.media_url,
    item?.url,
    item?.directUrl,
    // Nested media arrays (common in social media actors)
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
// Infer media type from the URL and platform context.
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

  // YouTube extraction in audio mode
  if (platform === "youtube" && (lowered.includes("audio") || lowered.includes(".m4a")))
    return "audio";

  return "video";
}
