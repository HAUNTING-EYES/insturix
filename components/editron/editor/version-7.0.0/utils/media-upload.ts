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
}

export interface UploadMediaFileOptions {
  projectId?: string;
  uploadBatchId?: string;
  uploadBatchIntake?: UploadMediaBatchIntake;
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
  const [thumbnail, duration, dimensions, urlData] = await Promise.all([
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
    thumbnail: thumbnail || undefined,
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
    thumbnail: thumbnail || undefined,
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
  thumbnail?: string;
  duration?: number;
  dimensions?: { width: number; height: number };
}): Promise<{ assetId: string; url: string; type: 'video' | 'audio' | 'image'; filename: string; size: number; uploadBatchId?: string }> {
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

/**
 * Generates a thumbnail for image or video files.
 * Returns a data-URL string, or empty string for audio / on error.
 */
export const generateThumbnail = async (file: File): Promise<string> => {
  return new Promise((resolve) => {
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || "");
      reader.onerror = () => {
        console.error("Error reading image file");
        resolve("");
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";

      const timeoutId = setTimeout(() => {
        console.warn("Video thumbnail generation timed out");
        resolve("");
      }, 5000);

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration / 2);
      };

      video.onloadeddata = () => {
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg"));
        } catch (error) {
          console.error("Error generating video thumbnail:", error);
          resolve("");
        } finally {
          URL.revokeObjectURL(video.src);
        }
      };

      video.onerror = () => {
        clearTimeout(timeoutId);
        console.error("Error loading video for thumbnail");
        URL.revokeObjectURL(video.src);
        resolve("");
      };

      video.src = URL.createObjectURL(file);
    } else {
      resolve("");
    }
  });
};

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
