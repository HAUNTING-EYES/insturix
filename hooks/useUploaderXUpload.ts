import { useState, useCallback } from 'react';
import { useToast } from './use-toast';
import type {
  FacebookPublishPayload,
  InstagramPublishPayload,
  LinkedInPublishPayload,
  TwitterPublishPayload,
  YouTubePublishPayload,
} from '@/lib/uploaderx/platform-capabilities';
import type { VideoMetadata } from '@/lib/uploaderx/platform-rules';

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface UploadResult {
  success: boolean;
  gcsPath?: string;
  videoUuid?: string;
  publicUrl?: string;
  error?: string;
}

interface ThumbnailUploadResult {
  success: boolean;
  publicUrl?: string;
  gcsPath?: string;
  error?: string;
}

export type UploaderXPublishPlatform = "youtube" | "facebook" | "instagram" | "twitter" | "linkedin";

export interface UploaderXPublishReceipt {
  success: boolean;
  platform: UploaderXPublishPlatform;
  platformPostId?: string;
  platformUrl?: string;
  publishPath?: string;
  step?: string;
  mediaType?: string;
  postType?: string;
  accountName?: string;
  youtubeUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tweetUrl?: string;
  postUrl?: string;
  videoId?: string;
  tweetId?: string;
  postId?: string;
  pageName?: string;
  accountUsername?: string;
  organizationId?: string | null;
  organizationName?: string;
  error?: string;
  details?: unknown;
  [key: string]: unknown;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const result = stringValue(value);
    if (result) return result;
  }
  return undefined;
}

function normalizePublishSuccess(
  platform: UploaderXPublishPlatform,
  data: Record<string, unknown>
): UploaderXPublishReceipt {
  return {
    ...data,
    success: true,
    platform,
    platformPostId: firstString(data.platformPostId, data.videoId, data.tweetId, data.postId),
    platformUrl: firstString(data.platformUrl, data.youtubeUrl, data.facebookUrl, data.instagramUrl, data.tweetUrl, data.postUrl),
    publishPath: firstString(data.publishPath),
    step: firstString(data.step),
    mediaType: firstString(data.mediaType),
    postType: firstString(data.postType),
    accountName: firstString(data.pageName, data.accountUsername, data.organizationName),
  };
}

function normalizePublishFailure(
  platform: UploaderXPublishPlatform,
  data: Record<string, unknown>,
  fallbackError: string
): UploaderXPublishReceipt {
  return {
    success: false,
    platform,
    error: firstString(data.error) || fallbackError,
    publishPath: firstString(data.publishPath),
    step: firstString(data.step),
    details: data.details,
  };
}

async function updateProgressInRedis(uploadId: string, progress: number) {
  try {
    await fetch('/api/services/uploaderx/gcs/track-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId, progress }),
    });
  } catch (err) {
    console.warn('Failed to update progress in Redis:', err);
  }
}

export function useUploaderXUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const { toast } = useToast();

  const uploadVideo = useCallback(async (
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> => {
    if (!file) {
      return { success: false, error: 'No file provided' };
    }

    setIsUploading(true);
    setUploadProgress(null);

    try {
      // Step 1: Get signed URL from our API
      const signResponse = await fetch('/api/services/uploaderx/r2/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (!signResponse.ok) {
        const errorData = await signResponse.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { url: signedUrl, gcsPath, videoUuid, publicUrl } = await signResponse.json();
      // Step 2: Upload file directly to R2 using signed URL
      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },

      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to GCS');
      }

      // Step 3: Track the upload in our database
      const trackResponse = await fetch('/api/services/uploaderx/gcs/track-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uploadId: crypto.randomUUID(),
          gcsPath,
          filename: file.name,
          fileSize: file.size,
          contentType: file.type,
          videoUuid,
          publicUrl,
        }),
      });

      if (!trackResponse.ok) {
        console.warn('Failed to track upload, but file was uploaded successfully');
      }

      toast({
        title: 'Upload successful',
        description: 'Your video has been saved to Safe Storage.',
      });

      return {
        success: true,
        gcsPath,
        videoUuid,
        publicUrl,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      toast({
        title: 'Upload failed',
        description: errorMessage,
        variant: 'destructive',
      });

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [toast]);

  const uploadWithProgress = useCallback(async (
    file: File,
    onProgress?: (progress: UploadProgress) => void,
    metadata?: {
      title?: string;
      description?: string;
      tags?: string[];
      privacyStatus?: string;
      videoType?: string;
      videoMetadata?: VideoMetadata;
    }
  ): Promise<UploadResult> => {
    if (!file) {
      return { success: false, error: 'No file provided' };
    }

    setIsUploading(true);
    setUploadProgress({ loaded: 0, total: file.size, percentage: 0 });

    try {
      // Step 1: Get signed URL
      const signResponse = await fetch('/api/services/uploaderx/r2/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (!signResponse.ok) {
        const errorData = await signResponse.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { url: signedUrl, gcsPath, videoUuid, publicUrl } = await signResponse.json();
      const uploadId = crypto.randomUUID();
      // Initialize progress = 0 in Redis
      await updateProgressInRedis(uploadId, 0);
      // Step 2: Upload with progress tracking using XMLHttpRequest
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', async (event) => {
          if (event.lengthComputable) {
            const progress = {
              loaded: event.loaded,
              total: event.total,
              percentage: Math.round((event.loaded / event.total) * 100),
            };
            setUploadProgress(progress);
            onProgress?.(progress);
            await updateProgressInRedis(uploadId, progress.percentage);
          }
        });

        xhr.addEventListener('load', async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              // Track the upload
              await fetch('/api/services/uploaderx/gcs/track-upload', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  uploadId: crypto.randomUUID(),
                  gcsPath,
                  filename: file.name,
                  fileSize: file.size,
                  contentType: file.type,
                  videoUuid,
                  publicUrl,
                  metadata, // Pass metadata to backend
                }),
              });

              toast({
                title: 'Upload successful',
                description: 'Your video has been saved to Safe Storage.',
              });

              resolve({
                success: true,
                gcsPath,
                videoUuid,
                publicUrl,
              });
            } catch (trackError) {
              console.warn('Failed to track upload, but file was uploaded successfully');
              resolve({
                success: true,
                gcsPath,
                videoUuid,
                publicUrl,
              });
            }
          } else {
            const errorMessage = 'Failed to upload file to GCS';
            toast({
              title: 'Upload failed',
              description: errorMessage,
              variant: 'destructive',
            });
            resolve({
              success: false,
              error: errorMessage,
            });
          }
        });

        xhr.addEventListener('error', () => {
          const errorMessage = 'Upload failed due to network error';
          toast({
            title: 'Upload failed',
            description: errorMessage,
            variant: 'destructive',
          });
          resolve({
            success: false,
            error: errorMessage,
          });
        });
        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      toast({
        title: 'Upload failed',
        description: errorMessage,
        variant: 'destructive',
      });

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [toast]);

  const uploadToYouTube = useCallback(async (
    videoUuid: string,
    gcsPath: string,
    filename: string,
    title?: string,
    description?: string,
    privacyStatus?: string,
    categoryId?: string,
    publishAt?: string,
    thumbnailPublicUrl?: string,
    postType?: string,
    duration?: number
  ): Promise<UploaderXPublishReceipt> => {
    try {
      if (duration !== undefined && duration > 120) {
        // Phase 1: Start
        const startRes = await fetch("/api/services/uploaderx/youtube/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: "start",
            videoUuid,
            title,
            description,
            privacyStatus,
            categoryId,
            publishAt,
            postType,
          }),
        });
        const startData = await startRes.json();
        if (!startRes.ok || !startData.success) {
          throw new Error(startData.error || "Failed to start YouTube chunked upload");
        }

        const { uploadUrl, fileSize } = startData;

        // Phase 2: Transfer Loop
        let startOffset = 0;
        const chunkSize = 10 * 1024 * 1024; // 10MB Chunks
        let finalVideoId = "";

        while (startOffset < fileSize) {
          const transferRes = await fetch("/api/services/uploaderx/youtube/chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phase: "transfer",
              videoUuid,
              uploadUrl,
              startOffset,
              chunkSize,
            }),
          });
          const transferData = await transferRes.json();
          if (!transferRes.ok || !transferData.success) {
            throw new Error(transferData.error || "Failed to upload YouTube chunk");
          }

          if (transferData.finished) {
            finalVideoId = transferData.videoId;
            break;
          }
          startOffset = transferData.nextOffset;
        }

        // Phase 3: Finish
        const finishRes = await fetch("/api/services/uploaderx/youtube/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: "finish",
            videoUuid,
            videoId: finalVideoId,
            thumbnailPublicUrl,
            publishAt,
            postType,
          }),
        });
        const finishData = await finishRes.json();
        if (!finishRes.ok || !finishData.success) {
          throw new Error(finishData.error || "Failed to finalize YouTube chunked upload");
        }

        return normalizePublishSuccess("youtube", finishData);
      }

      const payload: YouTubePublishPayload = {
        gcsPath,
        filename,
        videoUuid,
        title,
        description,
        privacyStatus,
        categoryId,
        publishAt,
        thumbnailPublicUrl,
        postType,
      };

      const res = await fetch("/api/services/uploaderx/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      
      if (!res.ok) {
        return normalizePublishFailure("youtube", data, `HTTP ${res.status}: Failed to upload to YouTube`);
      }
      
      if (!data.success) {
        return normalizePublishFailure("youtube", data, "Failed to upload to YouTube");
      }

      return normalizePublishSuccess("youtube", data);
    } catch (error) {
      console.error("❌ YouTube upload error:", error);
      const errorMessage = error instanceof Error ? error.message : 'YouTube upload failed';
      return { success: false, platform: "youtube", error: errorMessage };
    }
  }, []);

  const uploadThumbnail = useCallback(async (file: File): Promise<ThumbnailUploadResult> => {
    const supportedTypes = new Set(["image/jpeg", "image/png"]);
    if (!supportedTypes.has(file.type)) {
      return { success: false, error: "YouTube thumbnails must be JPEG or PNG." };
    }

    if (file.size > 2 * 1024 * 1024) {
      return { success: false, error: "YouTube thumbnails must be 2MB or smaller." };
    }

    try {
      const signResponse = await fetch('/api/services/uploaderx/r2/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: `thumbnail-${file.name}`,
          contentType: file.type,
        }),
      });

      if (!signResponse.ok) {
        const errorData = await signResponse.json();
        throw new Error(errorData.error || 'Failed to get thumbnail upload URL');
      }

      const { url: signedUrl, gcsPath, publicUrl } = await signResponse.json();
      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload thumbnail');
      }

      return { success: true, gcsPath, publicUrl };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Thumbnail upload failed';
      return { success: false, error: errorMessage };
    }
  }, []);

  const uploadToFacebook = useCallback(async (
    videoUuid: string,
    gcsPath: string,
    title?: string,
    description?: string,
    pageId?: string,
    postType?: string,
    duration?: number,
    publishAt?: string
  ): Promise<UploaderXPublishReceipt> => {
    try {
      if (duration !== undefined && duration > 120) {
        // Phase 1: Start
        const startRes = await fetch("/api/services/uploaderx/facebook/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "start", videoUuid, postType, pageId }),
        });
        const startData = await startRes.json();
        if (!startRes.ok || !startData.success) {
          throw new Error(startData.error || "Failed to start Facebook chunked upload");
        }

        const { uploadSessionId, videoId, uploadUrl, fileSize } = startData;

        // Phase 2: Transfer Loop
        let startOffset = 0;
        const chunkSize = 10 * 1024 * 1024; // 10MB Chunks
        while (startOffset < fileSize) {
          const transferRes = await fetch("/api/services/uploaderx/facebook/chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phase: "transfer",
              videoUuid,
              postType,
              pageId,
              uploadSessionId,
              videoId,
              uploadUrl,
              startOffset,
              chunkSize,
            }),
          });
          const transferData = await transferRes.json();
          if (!transferRes.ok || !transferData.success) {
            throw new Error(transferData.error || "Failed to upload Facebook chunk");
          }
          startOffset = transferData.nextOffset;
        }

        // Phase 3: Finish
        const finishRes = await fetch("/api/services/uploaderx/facebook/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: "finish",
            videoUuid,
            postType,
            pageId,
            uploadSessionId,
            videoId,
            title,
            description,
            publishAt,
          }),
        });
        const finishData = await finishRes.json();
        if (!finishRes.ok || !finishData.success) {
          throw new Error(finishData.error || "Failed to finalize Facebook chunked upload");
        }

        return normalizePublishSuccess("facebook", finishData);
      }

      const payload: FacebookPublishPayload = {
        gcsPath,
        videoUuid,
        title,
        description,
        pageId,
        postType,
        publishAt,
      };

      const res = await fetch("/api/services/uploaderx/facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return normalizePublishFailure("facebook", data, `HTTP ${res.status}: Failed to upload to Facebook`);
      }

      if (!data.success) {
        return normalizePublishFailure("facebook", data, "Failed to upload to Facebook");
      }

      return normalizePublishSuccess("facebook", data);
    } catch (error) {
      console.error("❌ Facebook upload error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Facebook upload failed';
      return { success: false, platform: "facebook", error: errorMessage };
    }
  }, []);

  const uploadToInstagram = useCallback(async (
    videoUuid: string,
    gcsPath: string,
    title?: string,
    description?: string,
    accountId?: string,
    postType?: string,
    duration?: number
  ): Promise<UploaderXPublishReceipt> => {
    try {
      if (duration !== undefined && duration > 120) {
        // Phase 1: Start
        const startRes = await fetch("/api/services/uploaderx/instagram/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "start", videoUuid, postType, accountId, title, description }),
        });
        const startData = await startRes.json();
        if (!startRes.ok || !startData.success) {
          throw new Error(startData.error || "Failed to start Instagram chunked upload");
        }

        const { uploadSessionId, fileSize, useDirectUpload } = startData;

        // Phase 2: Transfer Loop
        let startOffset = 0;
        const chunkSize = 10 * 1024 * 1024; // 10MB Chunks
        while (startOffset < fileSize) {
          const transferRes = await fetch("/api/services/uploaderx/instagram/chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phase: "transfer",
              videoUuid,
              uploadSessionId,
              startOffset,
              chunkSize,
              useDirectUpload,
            }),
          });
          const transferData = await transferRes.json();
          if (!transferRes.ok || !transferData.success) {
            throw new Error(transferData.error || "Failed to upload Instagram chunk");
          }
          startOffset = transferData.nextOffset;
        }

        // Phase 3: Poll
        let containerStatus = "IN_PROGRESS";
        let attempts = 0;
        const maxAttempts = 60;
        while (containerStatus === "IN_PROGRESS" && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;

          const statusRes = await fetch("/api/services/uploaderx/instagram/chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phase: "poll", videoUuid, uploadSessionId }),
          });
          const statusData = await statusRes.json();
          if (!statusRes.ok || !statusData.success) {
            throw new Error(statusData.error || "Failed to query Instagram status");
          }
          containerStatus = statusData.statusCode;
          if (containerStatus === "ERROR") {
            throw new Error("Instagram Reel processing status is ERROR");
          }
        }

        if (containerStatus !== "FINISHED") {
          throw new Error("Instagram Reel processing timed out.");
        }

        // Phase 4: Publish
        const publishRes = await fetch("/api/services/uploaderx/instagram/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: "publish",
            videoUuid,
            uploadSessionId,
            accountId,
            title,
            description,
            postType,
            useDirectUpload,
          }),
        });
        const publishData = await publishRes.json();
        if (!publishRes.ok || !publishData.success) {
          throw new Error(publishData.error || "Failed to publish Instagram media container");
        }

        return normalizePublishSuccess("instagram", publishData);
      }

      const payload: InstagramPublishPayload = {
        gcsPath,
        videoUuid,
        title,
        description,
        accountId,
        postType,
      };

      const res = await fetch("/api/services/uploaderx/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return normalizePublishFailure("instagram", data, `HTTP ${res.status}: Failed to upload to Instagram`);
      }

      if (!data.success) {
        return normalizePublishFailure("instagram", data, "Failed to upload to Instagram");
      }

      return normalizePublishSuccess("instagram", data);
    } catch (error) {
      console.error("❌ Instagram upload error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Instagram upload failed';
      return { success: false, platform: "instagram", error: errorMessage };
    }
  }, []);

  const uploadToTwitter = useCallback(async (
    videoUuid?: string,
    gcsPath?: string,
    title?: string,
    description?: string,
    replySettings?: TwitterPublishPayload["replySettings"],
    postType?: string,
    duration?: number
  ): Promise<UploaderXPublishReceipt> => {
    try {
      if (duration !== undefined && duration > 120 && videoUuid) {
        // Phase 1: Start
        const startRes = await fetch("/api/services/uploaderx/twitter/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "start", videoUuid }),
        });
        const startData = await startRes.json();
        if (!startRes.ok || !startData.success) {
          throw new Error(startData.error || "Failed to start Twitter chunked upload");
        }

        const { mediaId, fileSize } = startData;

        // Phase 2: Transfer Loop
        let startOffset = 0;
        const chunkSize = 5 * 1024 * 1024; // 5MB Chunks (Twitter strict limit)
        let segmentIndex = 0;
        while (startOffset < fileSize) {
          const transferRes = await fetch("/api/services/uploaderx/twitter/chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phase: "transfer",
              videoUuid,
              mediaId,
              segmentIndex,
              startOffset,
              chunkSize,
            }),
          });
          const transferData = await transferRes.json();
          if (!transferRes.ok || !transferData.success) {
            throw new Error(transferData.error || "Failed to upload Twitter chunk");
          }
          startOffset = transferData.nextOffset;
          segmentIndex++;
        }

        // Phase 3: Finalize
        const finalizeRes = await fetch("/api/services/uploaderx/twitter/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "finalize", videoUuid, mediaId }),
        });
        const finalizeData = await finalizeRes.json();
        if (!finalizeRes.ok || !finalizeData.success) {
          throw new Error(finalizeData.error || "Failed to finalize Twitter chunked upload");
        }

        // Phase 4: Poll
        let xStatus = "in_progress";
        let attempts = 0;
        const maxAttempts = 60;
        while ((xStatus === "in_progress" || xStatus === "pending") && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;

          const statusRes = await fetch("/api/services/uploaderx/twitter/chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phase: "poll", videoUuid, mediaId }),
          });
          const statusData = await statusRes.json();
          if (!statusRes.ok || !statusData.success) {
            throw new Error(statusData.error || "Failed to query Twitter media status");
          }
          xStatus = statusData.state;
          if (xStatus === "failed") {
            throw new Error("Twitter video processing status is FAILED");
          }
        }

        if (xStatus !== "succeeded") {
          throw new Error("Twitter video processing timed out.");
        }

        // Phase 5: Publish
        const publishRes = await fetch("/api/services/uploaderx/twitter/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: "publish",
            videoUuid,
            mediaId,
            title,
            description,
            replySettings,
            postType,
          }),
        });
        const publishData = await publishRes.json();
        if (!publishRes.ok || !publishData.success) {
          throw new Error(publishData.error || "Failed to create tweet");
        }

        return normalizePublishSuccess("twitter", publishData);
      }

      const payload: TwitterPublishPayload = {
        gcsPath,
        videoUuid,
        title,
        description,
        replySettings,
        postType,
      };

      const res = await fetch("/api/services/uploaderx/twitter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return normalizePublishFailure("twitter", data, `HTTP ${res.status}: Failed to upload to Twitter`);
      }

      if (!data.success) {
        return normalizePublishFailure("twitter", data, "Failed to upload to Twitter");
      }

      return normalizePublishSuccess("twitter", data);
    } catch (error) {
      console.error("❌ Twitter upload error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Twitter upload failed';
      return { success: false, platform: "twitter", error: errorMessage };
    }
  }, []);

  const uploadToLinkedIn = useCallback(async (
    videoUuid?: string,
    gcsPath?: string,
    title?: string,
    description?: string,
    postType?: 'personal' | 'organization',
    organizationId?: string,
    videoPostType?: string,
    duration?: number
  ): Promise<UploaderXPublishReceipt> => {
    try {
      if (duration !== undefined && duration > 120 && videoUuid) {
        // Phase 1: Start
        const startRes = await fetch("/api/services/uploaderx/linkedin/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "start", videoUuid, postType, organizationId, videoPostType }),
        });
        const startData = await startRes.json();
        if (!startRes.ok || !startData.success) {
          throw new Error(startData.error || "Failed to start LinkedIn chunked upload");
        }

        const { videoUrn, uploadToken, uploadInstructions } = startData;

        // Phase 2: Transfer Loop
        const uploadedPartIds: string[] = [];
        for (const instruction of uploadInstructions) {
          const transferRes = await fetch("/api/services/uploaderx/linkedin/chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phase: "transfer",
              videoUuid,
              uploadUrl: instruction.uploadUrl,
              firstByte: Number(instruction.firstByte),
              lastByte: Number(instruction.lastByte),
            }),
          });
          const transferData = await transferRes.json();
          if (!transferRes.ok || !transferData.success) {
            throw new Error(transferData.error || "Failed to upload LinkedIn chunk");
          }
          uploadedPartIds.push(transferData.etag);
        }

        // Phase 3: Finish
        const finishRes = await fetch("/api/services/uploaderx/linkedin/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: "finish",
            videoUuid,
            videoUrn,
            uploadToken,
            uploadedPartIds,
            title,
            description,
            postType,
            organizationId,
            videoPostType,
          }),
        });
        const finishData = await finishRes.json();
        if (!finishRes.ok || !finishData.success) {
          throw new Error(finishData.error || "Failed to finalize LinkedIn chunked upload");
        }

        return normalizePublishSuccess("linkedin", finishData);
      }

      const payload: LinkedInPublishPayload = {
        gcsPath,
        videoUuid,
        title,
        description,
        postType: postType || 'personal',
        organizationId,
        videoPostType,
      };

      const res = await fetch("/api/services/uploaderx/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        return normalizePublishFailure("linkedin", data, `HTTP ${res.status}: Failed to upload to LinkedIn`);
      }

      if (!data.success) {
        return normalizePublishFailure("linkedin", data, "Failed to upload to LinkedIn");
      }

      return normalizePublishSuccess("linkedin", data);
    } catch (error) {
      console.error("❌ LinkedIn upload error:", error);
      const errorMessage = error instanceof Error ? error.message : 'LinkedIn upload failed';
      return { success: false, platform: "linkedin", error: errorMessage };
    }
  }, []);

  return {
    uploadVideo,
    uploadWithProgress,
    uploadThumbnail,
    uploadToYouTube,
    uploadToFacebook,
    uploadToInstagram,
    uploadToTwitter,
    uploadToLinkedIn,
    isUploading,
    uploadProgress,
  };
}
