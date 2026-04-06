import { useState, useCallback } from 'react';
import { useToast } from './use-toast';

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
      const signResponse = await fetch('/api/services/uploaderx/gcs/sign', {
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
      console.log("✅ Signed URL data received:", { gcsPath, videoUuid, publicUrl });
      // Step 2: Upload file directly to GCS using signed URL
      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },

      });
      console.log('✅ Upload successful!');

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
      const signResponse = await fetch('/api/services/uploaderx/gcs/sign', {
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
        console.log('Uploading to:', signedUrl);

        xhr.open('PUT', signedUrl);
        // xhr.setRequestHeader('Content-Type', file.type);
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
    privacyStatus?: string
  ) => {
    try {
      console.log("🎬 Starting YouTube upload:", { videoUuid, gcsPath, title });
      
      const res = await fetch("/api/services/uploaderx/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcsPath,
          filename,
          videoUuid,
          title,
          description,
          privacyStatus
        }),
      });

      const data = await res.json();
      console.log("🎬 YouTube response:", data);
      
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

  const uploadToFacebook = useCallback(async (
    videoUuid: string,
    gcsPath: string,
    title?: string,
    description?: string,
    pageId?: string
  ) => {
    try {
      console.log("🔵 Starting Facebook upload:", { videoUuid, gcsPath, title, pageId });

      const res = await fetch("/api/services/uploaderx/facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcsPath,
          videoUuid,
          title,
          description,
          pageId,
        }),
      });

      const data = await res.json();
      console.log("🔵 Facebook response:", data);

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
      console.log("🟣 Starting Instagram upload:", { videoUuid, gcsPath, title, accountId });

      const res = await fetch("/api/services/uploaderx/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcsPath,
          videoUuid,
          title,
          description,
          accountId,
        }),
      });

      const data = await res.json();
      console.log("🟣 Instagram response:", data);

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

  return {
    uploadVideo,
    uploadWithProgress,
    uploadToYouTube,
    uploadToFacebook,
    uploadToInstagram,
    isUploading,
    uploadProgress,
  };
}
