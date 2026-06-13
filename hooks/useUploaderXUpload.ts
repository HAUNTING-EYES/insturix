import { useState, useCallback } from 'react';
import { useToast } from './use-toast';
import type {
  FacebookPublishPayload,
  InstagramPublishPayload,
  LinkedInPublishPayload,
  TwitterPublishPayload,
  YouTubePublishPayload,
} from '@/lib/uploaderx/platform-capabilities';

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
    postType?: string
  ): Promise<UploaderXPublishReceipt> => {
    try {
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
    postType?: string
  ): Promise<UploaderXPublishReceipt> => {
    try {
      const payload: FacebookPublishPayload = {
        gcsPath,
        videoUuid,
        title,
        description,
        pageId,
        postType,
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
    postType?: string
  ): Promise<UploaderXPublishReceipt> => {
    try {
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
    postType?: string
  ): Promise<UploaderXPublishReceipt> => {
    try {
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
    videoPostType?: string
  ): Promise<UploaderXPublishReceipt> => {
    try {
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
