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
    thumbnailPublicUrl?: string
  ) => {
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
      };

      const res = await fetch("/api/services/uploaderx/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Failed to upload to YouTube`);
      }
      
      if (!data.success) {
        throw new Error(data.error || "Failed to upload to YouTube");
      }

      return { success: true, youtubeUrl: data.youtubeUrl };
    } catch (error) {
      console.error("❌ YouTube upload error:", error);
      const errorMessage = error instanceof Error ? error.message : 'YouTube upload failed';
      return { success: false, error: errorMessage };
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
    pageId?: string
  ) => {
    try {
      const payload: FacebookPublishPayload = {
        gcsPath,
        videoUuid,
        title,
        description,
        pageId,
      };

      const res = await fetch("/api/services/uploaderx/facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Failed to upload to Facebook`);
      }

      if (!data.success) {
        throw new Error(data.error || "Failed to upload to Facebook");
      }

      return { success: true, facebookUrl: data.facebookUrl, pageName: data.pageName };
    } catch (error) {
      console.error("❌ Facebook upload error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Facebook upload failed';
      return { success: false, error: errorMessage };
    }
  }, []);

  const uploadToInstagram = useCallback(async (
    videoUuid: string,
    gcsPath: string,
    title?: string,
    description?: string,
    accountId?: string
  ) => {
    try {
      const payload: InstagramPublishPayload = {
        gcsPath,
        videoUuid,
        title,
        description,
        accountId,
      };

      const res = await fetch("/api/services/uploaderx/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Failed to upload to Instagram`);
      }

      if (!data.success) {
        throw new Error(data.error || "Failed to upload to Instagram");
      }

      return { success: true, instagramUrl: data.instagramUrl, accountUsername: data.accountUsername, mediaType: data.mediaType };
    } catch (error) {
      console.error("❌ Instagram upload error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Instagram upload failed';
      return { success: false, error: errorMessage };
    }
  }, []);

  const uploadToTwitter = useCallback(async (
    videoUuid?: string,
    gcsPath?: string,
    title?: string,
    description?: string,
    replySettings?: TwitterPublishPayload["replySettings"],
  ) => {
    try {
      const payload: TwitterPublishPayload = {
        gcsPath,
        videoUuid,
        title,
        description,
        replySettings,
      };

      const res = await fetch("/api/services/uploaderx/twitter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Failed to upload to Twitter`);
      }

      if (!data.success) {
        throw new Error(data.error || "Failed to upload to Twitter");
      }

      return { success: true, tweetUrl: data.tweetUrl, tweetId: data.tweetId, accountUsername: data.accountUsername };
    } catch (error) {
      console.error("❌ Twitter upload error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Twitter upload failed';
      return { success: false, error: errorMessage };
    }
  }, []);

  const uploadToLinkedIn = useCallback(async (
    videoUuid?: string,
    gcsPath?: string,
    title?: string,
    description?: string,
    postType?: 'personal' | 'organization',
    organizationId?: string
  ) => {
    try {
      const payload: LinkedInPublishPayload = {
        gcsPath,
        videoUuid,
        title,
        description,
        postType: postType || 'personal',
        organizationId,
      };

      const res = await fetch("/api/services/uploaderx/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Failed to upload to LinkedIn`);
      }

      if (!data.success) {
        throw new Error(data.error || "Failed to upload to LinkedIn");
      }

      return {
        success: true,
        postUrl: data.postUrl,
        postId: data.postId,
        mediaType: data.mediaType,
        postType: data.postType,
        organizationId: data.organizationId,
        organizationName: data.organizationName
      };
    } catch (error) {
      console.error("❌ LinkedIn upload error:", error);
      const errorMessage = error instanceof Error ? error.message : 'LinkedIn upload failed';
      return { success: false, error: errorMessage };
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
