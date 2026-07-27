/**
 * Media Upload Utility
 *
 * Uploads media files to GCS using signed URLs (bypasses API body size limits).
 * Flow:
 *   1. Request a signed upload URL from the server
 *   2. PUT the file directly to GCS
 *   3. Register the asset metadata on the server
 *
 * Also provides helpers for thumbnails, duration, and dimensions.
 */

import type { EditorialPreferences } from '@/lib/editron/production-brief/editorial-preferences';
import type { NativeVideoAudioRightsAttestation } from '@/lib/editron/services/native-video-audio-rights';

export interface UploadedMedia {
  assetId: string;
  url: string;
  type: 'video' | 'audio' | 'image';
  filename: string;
  size: number;
  uploadBatchId?: string;
  duration?: number;
  thumbnail?: string;
  dimensions?: { width: number; height: number };
}

export interface UploadMediaBatchIntake {
  aspectRatio?: string;
  platform?: string;
  userIntent?: string;
  script?: string;
  captionStyle?: string;
  transitionPreference?: string;
  zoomBehavior?: string;
  motionGraphics?: string;
  pacingFeel?: string;
  musicPreference?: string;
  editorialPreferences?: EditorialPreferences;
}

export interface UploadMediaFileOptions {
  projectId?: string;
  uploadBatchId?: string;
  uploadBatchIntake?: UploadMediaBatchIntake;
  sourceMediaRightsAttestation?: NativeVideoAudioRightsAttestation;
}

export interface UploadMediaBatchResult {
  uploadBatchId: string;
  uploaded: UploadedMedia[];
  failed: Array<{ filename: string; error: string }>;
}

export type MediaUploadAssetReadiness =
  | 'uploaded'
  | 'queued'
  | 'analyzing'
  | 'ready'
  | 'failed'
  | 'skipped';

export type MediaUploadBatchReadiness =
  | 'empty'
  | 'uploaded'
  | 'analyzing'
  | 'ready'
  | 'needs_attention';

export type SemanticVisualReadiness =
  | 'not-required'
  | 'ready'
  | 'pending'
  | 'retryable'
  | 'failed';

export interface MediaUploadBatchAssetStatus {
  assetId: string;
  filename: string;
  type: 'video' | 'audio' | 'image';
  size: number;
  duration?: number;
  dimensions?: { width: number; height: number };
  thumbnail?: string;
  uploadedAt?: string | Date | null;
  analysisStatus?: string | null;
  analysisError?: string | null;
  analysisSkipReason?: string | null;
  deepAnalysisStatus?: string | null;
  deepAnalysisVersion?: number | null;
  deepAnalysisTargetVersion?: number | null;
  deepAnalysisRetryVersion?: number | null;
  deepAnalysisRetryCount?: number | null;
  semanticVisualReadiness: SemanticVisualReadiness;
  readiness: MediaUploadAssetReadiness;
  blockingReason: string | null;
  needsAttention: boolean;
}

export interface MediaUploadBatchStatus {
  uploadBatchId: string;
  exists: boolean;
  projectId?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  status: MediaUploadBatchReadiness;
  canCreateProject: boolean;
  counts: Record<MediaUploadAssetReadiness, number> & { total: number };
  assets: MediaUploadBatchAssetStatus[];
}

export interface CreateProjectFromMediaUploadBatchOptions extends UploadMediaBatchIntake {
  title?: string;
  brandId?: string;
  targetDurationSec?: number | string | null;
}

export interface CreateProjectFromMediaUploadBatchResult {
  projectId: string;
  status: 'processing' | 'complete' | 'existing';
  storylinePlan?: {
    source?: string;
    planApplied?: boolean;
    fallbackReason?: string;
    rationale?: string;
    clipCount?: number;
  };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determine media category from MIME type */
function resolveFileType(mimeType: string): 'video' | 'image' | 'audio' {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  throw new Error('Unsupported file type');
}

/** Safely parse a JSON response, returning null if the body isn't valid JSON */
async function safeJsonParse(response: Response): Promise<any | null> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Extract a human-readable error from an API response */
async function extractResponseError(response: Response, fallback: string): Promise<string> {
  const data = await safeJsonParse(response);
  return data?.error || `${fallback} (HTTP ${response.status})`;
}

// ---------------------------------------------------------------------------
// Core upload flow
// ---------------------------------------------------------------------------

/**
 * Uploads a file to GCS via signed URL and registers its metadata.
 */
export const uploadMediaFile = async (
  file: File,
  optionsOrProjectId?: string | UploadMediaFileOptions
): Promise<UploadedMedia> => {
  const options =
    typeof optionsOrProjectId === 'string'
      ? { projectId: optionsOrProjectId }
      : (optionsOrProjectId ?? {});
  const fileType = resolveFileType(file.type);

  // Gather local metadata in parallel with the signed URL request
  const [thumbnailDataUrl, duration, dimensions, urlData] = await Promise.all([
    generateThumbnail(file),
    getMediaDuration(file),
    getMediaDimensions(file),
    requestSignedUploadUrl(file.name, file.type),
  ]);

  // Upload the raw file directly to GCS
  const gcsResponse = await fetch(urlData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!gcsResponse.ok) {
    throw new Error(`Direct upload to storage failed (HTTP ${gcsResponse.status})`);
  }

  // Register asset metadata on the server
  const registered = await registerAssetMetadata({
    assetId: urlData.assetId,
    gcsPath: urlData.gcsPath,
    readUrl: urlData.readUrl,
    readUrlExpiresAt: urlData.readUrlExpiresAt,
    filename: file.name,
    contentType: file.type,
    size: file.size,
    type: fileType,
    projectId: options.projectId,
    uploadBatchId: options.uploadBatchId,
    uploadBatchIntake: options.uploadBatchIntake,
    sourceMediaRightsAttestation: options.sourceMediaRightsAttestation,
    thumbnail: thumbnailDataUrl || undefined,
    duration,
    dimensions,
  });

  return {
    assetId: registered.assetId,
    url: registered.url,
    type: registered.type,
    filename: registered.filename,
    size: registered.size,
    uploadBatchId: registered.uploadBatchId,
    duration,
    thumbnail: registered.thumbnail,
    dimensions,
  };
};

export async function uploadMediaFiles(
  files: File[],
  options: UploadMediaFileOptions = {}
): Promise<UploadMediaBatchResult> {
  const uploadBatchId = options.uploadBatchId ?? createUploadBatchId();
  const uploaded: UploadedMedia[] = [];
  const failed: UploadMediaBatchResult['failed'] = [];

  for (const file of files) {
    try {
      const media = await uploadMediaFile(file, { ...options, uploadBatchId });
      uploaded.push(media);
    } catch (error) {
      failed.push({
        filename: file.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { uploadBatchId, uploaded, failed };
}

export async function getMediaUploadBatchStatus(
  uploadBatchId: string
): Promise<MediaUploadBatchStatus> {
  const trimmed = uploadBatchId.trim();
  if (!trimmed) throw new Error('uploadBatchId is required');

  const response = await fetch(
    `/api/services/editron/media/batches/${encodeURIComponent(trimmed)}`
  );

  if (!response.ok) {
    const msg = await extractResponseError(response, 'Failed to load upload batch');
    throw new Error(msg);
  }

  const data = await response.json();
  if (!data?.success || !data.batch) {
    throw new Error(data?.error || 'Failed to load upload batch');
  }

  return data.batch;
}

export async function createProjectFromMediaUploadBatch(
  uploadBatchId: string,
  options: CreateProjectFromMediaUploadBatchOptions = {}
): Promise<CreateProjectFromMediaUploadBatchResult> {
  const trimmed = uploadBatchId.trim();
  if (!trimmed) throw new Error('uploadBatchId is required');

  const response = await fetch('/api/services/editron/auto-edit/from-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadBatchId: trimmed, ...options }),
  });

  if (!response.ok) {
    const msg = await extractResponseError(response, 'Failed to create project from upload batch');
    throw new Error(msg);
  }

  const data = await response.json();
  if (!data?.success || !data.projectId) {
    throw new Error(data?.error || 'Failed to create project from upload batch');
  }

  return {
    projectId: data.projectId,
    status: data.status || 'processing',
    storylinePlan: data.storylinePlan,
  };
}
function createUploadBatchId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `upload_batch_${random}`;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

interface SignedUrlResponse {
  uploadUrl: string;
  assetId: string;
  gcsPath: string;
  readUrl: string;
  readUrlExpiresAt: string;
}

async function requestSignedUploadUrl(
  filename: string,
  contentType: string
): Promise<SignedUrlResponse> {
  const response = await fetch('/api/services/editron/media/upload/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType }),
  });

  if (!response.ok) {
    const msg = await extractResponseError(response, 'Failed to get upload URL');
    throw new Error(msg);
  }

  const data = await response.json();
  return data;
}

async function registerAssetMetadata(meta: {
  assetId: string;
  gcsPath: string;
  readUrl: string;
  readUrlExpiresAt: string;
  filename: string;
  contentType: string;
  size: number;
  type: 'video' | 'audio' | 'image';
  projectId?: string;
  uploadBatchId?: string;
  uploadBatchIntake?: UploadMediaBatchIntake;
  sourceMediaRightsAttestation?: NativeVideoAudioRightsAttestation;
  thumbnail?: string;
  duration?: number;
  dimensions?: { width: number; height: number };
}): Promise<{ assetId: string; url: string; type: 'video' | 'audio' | 'image'; filename: string; size: number; uploadBatchId?: string; thumbnail?: string }> {
  const response = await fetch('/api/services/editron/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });

  if (!response.ok) {
    const msg = await extractResponseError(response, 'Failed to register asset');
    throw new Error(msg);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Thumbnail generation
// ---------------------------------------------------------------------------

const THUMBNAIL_MAX_EDGE = 480;
const THUMBNAIL_MIN_EDGE = 120;
const THUMBNAIL_MAX_BYTES = 160 * 1024;
const THUMBNAIL_TIMEOUT_MS = 8_000;

/**
 * Generates a bounded preview for image or video files. The data URL exists only
 * long enough to cross the registration request; the server re-encodes it and
 * persists a cloud URL instead of storing this payload in Mongo.
 */
export const generateThumbnail = async (file: File): Promise<string> => {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return "";

  const objectUrl = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const image = await loadThumbnailImage(objectUrl);
      return await encodeBoundedThumbnail(image, image.naturalWidth, image.naturalHeight);
    }

    const video = await loadThumbnailVideoFrame(objectUrl);
    return await encodeBoundedThumbnail(video, video.videoWidth, video.videoHeight);
  } catch (error) {
    console.warn("Thumbnail generation skipped:", error instanceof Error ? error.message : error);
    return "";
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

function loadThumbnailImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeoutId = setTimeout(() => reject(new Error("Image thumbnail generation timed out")), THUMBNAIL_TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timeoutId);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error("Image could not be decoded for thumbnail generation"));
    };
    image.src = src;
  });
}

function loadThumbnailVideoFrame(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (error) {
        reject(error);
      } else {
        resolve(video);
      }
    };
    timeoutId = setTimeout(
      () => finish(new Error("Video thumbnail generation timed out")),
      THUMBNAIL_TIMEOUT_MS,
    );

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onerror = () => finish(new Error("Video could not be decoded for thumbnail generation"));
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) {
        finish(new Error("Video has no usable dimensions"));
        return;
      }
      const seekFrame = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(1, video.duration / 2)
        : 0;
      if (seekFrame <= 0) {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          finish();
        } else {
          video.onloadeddata = () => finish();
        }
      } else {
        video.onseeked = () => finish();
        video.currentTime = seekFrame;
      }
    };
    video.src = src;
  });
}

async function encodeBoundedThumbnail(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): Promise<string> {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Media has no usable thumbnail dimensions");
  }

  const initialScale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  let canvas = drawThumbnailCanvas(
    source,
    Math.max(1, Math.round(sourceWidth * initialScale)),
    Math.max(1, Math.round(sourceHeight * initialScale)),
  );

  for (let resizePass = 0; resizePass < 4; resizePass += 1) {
    const encoded = await encodeThumbnailCanvas(canvas);
    if (encoded && encoded.size <= THUMBNAIL_MAX_BYTES) {
      return await blobToDataUrl(encoded);
    }

    if (Math.max(canvas.width, canvas.height) <= THUMBNAIL_MIN_EDGE) break;
    const nextWidth = Math.max(1, Math.round(canvas.width * 0.72));
    const nextHeight = Math.max(1, Math.round(canvas.height * 0.72));
    canvas = drawThumbnailCanvas(canvas, nextWidth, nextHeight);
  }

  throw new Error(`Thumbnail could not be encoded below ${THUMBNAIL_MAX_BYTES} bytes`);
}

function drawThumbnailCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is unavailable for thumbnail generation");
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function encodeThumbnailCanvas(canvas: HTMLCanvasElement): Promise<Blob | null> {
  let smallest: Blob | null = null;
  for (const quality of [0.76, 0.62, 0.48]) {
    for (const type of ["image/webp", "image/jpeg"]) {
      const blob = await canvasToBlob(canvas, type, quality);
      if (blob && (!smallest || blob.size < smallest.size)) smallest = blob;
      if (blob && blob.size <= THUMBNAIL_MAX_BYTES) return blob;
    }
  }
  return smallest;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Thumbnail could not be serialized"));
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

/**
 * Gets the duration of an audio or video file.
 */
export const getMediaDuration = async (
  file: File
): Promise<number | undefined> => {
  if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
    return undefined;
  }

  return new Promise((resolve) => {
    const media = file.type.startsWith("audio/")
      ? document.createElement("audio")
      : document.createElement("video");

    const timeoutId = setTimeout(() => {
      console.warn("Media duration detection timed out");
      URL.revokeObjectURL(media.src);
      resolve(undefined);
    }, 5000);

    media.preload = "metadata";
    media.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      resolve(media.duration);
      URL.revokeObjectURL(media.src);
    };
    media.onerror = () => {
      clearTimeout(timeoutId);
      console.error("Error getting media duration");
      URL.revokeObjectURL(media.src);
      resolve(undefined);
    };
    media.src = URL.createObjectURL(file);
  });
};

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

/**
 * Gets the dimensions of a media file (video or image).
 */
export const getMediaDimensions = async (
  file: File
): Promise<{ width: number; height: number } | undefined> => {
  const url = URL.createObjectURL(file);
  try {
    return await getMediaDimensionsFromUrl(
      url,
      file.type.startsWith("video/") ? "video" : "image"
    );
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Gets the dimensions of a media file from its URL.
 */
export const getMediaDimensionsFromUrl = async (
  url: string,
  type: "video" | "image"
): Promise<{ width: number; height: number } | undefined> => {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.warn("[getMediaDimensionsFromUrl] Timed out");
      resolve(undefined);
    }, 10000);

    if (type === "video") {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        clearTimeout(timeoutId);
        resolve({ width: video.videoWidth, height: video.videoHeight });
      };

      video.onerror = () => {
        clearTimeout(timeoutId);
        console.error("[getMediaDimensionsFromUrl] Error loading video");
        resolve(undefined);
      };

      video.src = url;
    } else if (type === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        clearTimeout(timeoutId);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        console.error("[getMediaDimensionsFromUrl] Error loading image");
        resolve(undefined);
      };

      img.src = url;
    } else {
      clearTimeout(timeoutId);
      resolve(undefined);
    }
  });
};

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Deletes a media file from the server.
 */
export const deleteMediaFile = async (
  userId: string,
  filePath: string
): Promise<boolean> => {
  try {
    const response = await fetch("/api/media/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, filePath }),
    });

    if (!response.ok) {
      const msg = await extractResponseError(response, "Failed to delete file");
      throw new Error(msg);
    }

    return true;
  } catch (error) {
    console.error("Error deleting media file:", error);
    return false;
  }
};
