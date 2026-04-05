import { GCSManager } from "@/app/api/services/alyzitron/utils/gcs";
import { logger } from "@/app/api/services/alyzitron/utils/logger";
import { Readable } from "stream";

// ---------------------------------------------------------------------------
// StreamToGCS Result
// ---------------------------------------------------------------------------
export interface StreamToGCSResult {
  gcsUri: string;
  signedUrl: string;
  bytesWritten: number;
}

// ---------------------------------------------------------------------------
// streamUrlToGCS
//
// Pipes a remote URL (e.g. Apify download link) directly into a GCS write
// stream. No local disk I/O — pure stream passthrough.
//
// This exists because Vertex AI (Gemini) requires gs:// URIs for multimodal
// video analysis. Deepgram can consume HTTPS directly, but Gemini cannot.
// ---------------------------------------------------------------------------
export async function streamUrlToGCS(
  sourceUrl: string,
  gcsPath: string,
  contentType: string = "video/mp4"
): Promise<StreamToGCSResult> {
  const bucket = GCSManager.getBucket();
  if (!bucket) throw new Error("GCS bucket not initialized");

  const startTime = Date.now();
  logger.info("[StreamToGCS] Starting stream passthrough", {
    data: { sourceUrl: sourceUrl.substring(0, 80) + "...", gcsPath },
  });

  // 1. Fetch the remote resource as a readable stream
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `[StreamToGCS] Failed to fetch source: ${response.status} ${response.statusText}`
    );
  }
  if (!response.body) {
    throw new Error("[StreamToGCS] Response has no body stream");
  }

  // 2. Create a GCS write stream
  const file = bucket.file(gcsPath);
  const gcsWriteStream = file.createWriteStream({
    metadata: {
      contentType,
      metadata: {
        "upload-source": "alyzitron-stream-bridge",
        "source-url-hash": Buffer.from(sourceUrl).toString("base64").substring(0, 32),
      },
    },
    resumable: false, // Non-resumable is faster for single-pass writes
  });

  // 3. Pipe fetch body → GCS using Node.js streams
  //    We convert the Web ReadableStream to a Node.js Readable
  const nodeReadable = Readable.fromWeb(response.body as any);

  let bytesWritten = 0;

  return new Promise<StreamToGCSResult>((resolve, reject) => {
    nodeReadable.on("data", (chunk: Buffer) => {
      bytesWritten += chunk.length;
    });

    nodeReadable.on("error", (err) => {
      logger.error("[StreamToGCS] Read stream error", { data: { error: err.message } });
      reject(err);
    });

    gcsWriteStream.on("error", (err) => {
      logger.error("[StreamToGCS] GCS write stream error", { data: { error: err.message } });
      reject(err);
    });

    gcsWriteStream.on("finish", async () => {
      const elapsed = Date.now() - startTime;
      const sizeMB = (bytesWritten / (1024 * 1024)).toFixed(2);
      logger.info(`[StreamToGCS] Complete: ${sizeMB}MB in ${elapsed}ms`, {
        data: { gcsPath, bytesWritten, elapsed },
      });

      try {
        const signedUrl = await GCSManager.getSignedReadUrl(gcsPath);
        const bucketName = process.env.GCS_BUCKET_NAME;

        resolve({
          gcsUri: `gs://${bucketName}/${gcsPath}`,
          signedUrl,
          bytesWritten,
        });
      } catch (err) {
        reject(err);
      }
    });

    // Pipe!
    nodeReadable.pipe(gcsWriteStream);
  });
}
