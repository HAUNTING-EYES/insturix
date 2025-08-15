import { useState, useCallback } from "react";
import { useQueryClient } from '@tanstack/react-query';
import { logger } from "@/app/api/services/alyzitron/utils/logger";

interface UploadState {
  progress: number;
  speed: number;
  remaining: number;
}

interface AnalysisState {
  status: "idle" | "uploading" | "analyzing" | "completed" | "failed";
  progress: number;
  error?: {
    message: string;
    action?: string;
  };
}

interface AnalysisUploadState {
  uploadState: UploadState | null;
  analysisState: AnalysisState;
  abortController: AbortController | null;
}


export function useVideoAnalysis() {
  const queryClient = useQueryClient();

  // Track state for multiple analyses
  const [uploadStates, setUploadStates] = useState<
    Map<string, AnalysisUploadState>
  >(new Map());

  const resetState = useCallback((analysisId: string) => {
    setUploadStates((prev) => {
      const newStates = new Map(prev);
      newStates.set(analysisId, {
        uploadState: null,
        analysisState: {
          status: "idle",
          progress: 0,
        },
        abortController: null,
      });
      return newStates;
    });
  }, []);

  const cancelUpload = useCallback(
    (analysisId: string) => {
      const state = uploadStates.get(analysisId);
      if (state?.abortController) {
        state.abortController.abort();
        setUploadStates((prev) => {
          const newStates = new Map(prev);
          newStates.set(analysisId, {
            ...state,
            abortController: null,
            uploadState: null,
            analysisState: {
              status: "idle",
              progress: 0,
            },
          });
          return newStates;
        });
      }
    },
    [uploadStates]
  );

  const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB
  const MAX_DURATION_SECONDS = 55 * 60; // 55 minutes

  const performUpload = useCallback(
    async (file: File, analysisId: string, controller: AbortController): Promise<string> => {

      try {
        const signResponse = await fetch("/api/services/alyzitron/gcs/sign", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            fileSize: file.size,
          }),
        });

        if (!signResponse.ok) {
          const error = await signResponse.json();
          throw new Error(error.error?.message || "Failed to get upload URL");
        }

        const { url, gcsPath, contentType } = await signResponse.json();
        logger.info("Starting file upload", {
          data: {
            gcsPath,
            size: file.size,
            contentType,
          },
        });

        await new Promise((resolve, reject) => {
          const startTime = Date.now();
          const xhr = new XMLHttpRequest();

          controller.signal.addEventListener("abort", () => {
            xhr.abort();
            reject(new Error("Upload cancelled"));
          });

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = event.loaded / event.total;
              const speed = event.loaded / ((Date.now() - startTime) / 1000);
              const remaining = (file.size - event.loaded) / speed;

              setUploadStates((prev) => {
                const newStates = new Map(prev);
                const currentState = newStates.get(analysisId);
                if (currentState) {
                  newStates.set(analysisId, {
                    ...currentState,
                    uploadState: {
                      progress,
                      speed,
                      remaining,
                    },
                  });
                }
                return newStates;
              });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              logger.info("File upload completed successfully", {
                data: { gcsPath },
              });

              // Update state to show upload is completed
              setUploadStates((prev) => {
                const newStates = new Map(prev);
                const currentState = newStates.get(analysisId);
                if (currentState) {
                  newStates.set(analysisId, {
                    ...currentState,
                    analysisState: {
                      status: "completed",
                      progress: 100,
                    },
                  });
                }
                return newStates;
              });

              resolve(gcsPath);
            } else {
              const errorMessage = `Upload failed with status ${xhr.status}`;
              logger.error("Upload failed", {
                data: {
                  status: xhr.status,
                  statusText: xhr.statusText,
                  gcsPath,
                },
              });
              reject(new Error(errorMessage));
            }
          };

          xhr.onerror = () => {
            logger.error("Upload failed", {
              data: { gcsPath },
            });
            reject(new Error("Upload failed"));
          };

          xhr.onabort = () => {
            logger.info("Upload cancelled by user", {
              data: { gcsPath },
            });
            reject(new Error("Upload cancelled"));
          };

          xhr.open("PUT", url);
          xhr.setRequestHeader("Content-Type", contentType);
          xhr.send(file);
        });

        // Track successful upload
        try {
          await fetch('/api/services/alyzitron/gcs/track-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uploadId: analysisId,
              gcsPath,
              filename: file.name,
              fileSize: file.size,
              contentType: file.type,
            }),
          });
        } catch (trackingError) {
          logger.warn('Failed to track upload', {
            data: { error: trackingError instanceof Error ? trackingError.message : String(trackingError) },
          });
        }

        return gcsPath;
      } catch (error) {
        if (error instanceof Error && error.message === "Upload cancelled") {
          logger.info("Upload cancelled successfully");
          return "";
        }
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        logger.error("Upload process failed", {
          data: {
            error: errorMessage,
            filename: file.name,
          },
        });

        setUploadStates((prev) => {
          const newStates = new Map(prev);
          const currentState = newStates.get(analysisId);
          if (currentState) {
            newStates.set(analysisId, {
              ...currentState,
              analysisState: {
                status: "failed",
                progress: 0,
                error: {
                  message: "Failed to upload video",
                  action: "Please try again or use a different video file",
                },
              },
            });
          }
          return newStates;
        });

        throw error;
      } finally {
        setUploadStates((prev) => {
          const newStates = new Map(prev);
          const currentState = newStates.get(analysisId);
          if (currentState) {
            newStates.set(analysisId, {
              ...currentState,
              abortController: null,
            });
          }
          return newStates;
        });
      }
    },
    []
  );

  const uploadFile = useCallback(
    async (file: File, analysisId: string): Promise<string> => {
      // Validate file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setUploadStates((prev) => {
          const newStates = new Map(prev);
          const currentState = newStates.get(analysisId) || {
            uploadState: null,
            analysisState: { status: "idle", progress: 0 },
            abortController: null,
          };
          newStates.set(analysisId, {
            ...currentState,
            analysisState: {
              status: "failed",
              progress: 0,
              error: {
                message: "File size exceeds 1GB limit",
                action: "Please select a smaller video file",
              },
            },
          });
          return newStates;
        });
        throw new Error("File size exceeds 1GB limit");
      }

      // Validate video duration
      const video = document.createElement('video');
      video.preload = 'metadata';
      const url = URL.createObjectURL(file);

      return new Promise<string>((resolve, reject) => {
        video.onloadedmetadata = () => {
          const duration = Math.round(video.duration);
          URL.revokeObjectURL(url);

          if (duration > MAX_DURATION_SECONDS) {
            setUploadStates((prev) => {
              const newStates = new Map(prev);
              const currentState = newStates.get(analysisId) || {
                uploadState: null,
                analysisState: { status: "idle", progress: 0 },
                abortController: null,
              };
              newStates.set(analysisId, {
                ...currentState,
                analysisState: {
                  status: "failed",
                  progress: 0,
                  error: {
                    message: "Video duration exceeds 55 minutes limit",
                    action: "Please select a shorter video",
                  },
                },
              });
              return newStates;
            });
            reject(new Error("Video duration exceeds 55 minutes limit"));
            return;
          }

          // Duration is valid, proceed with upload
          const controller = new AbortController();

          setUploadStates((prev) => {
            const newStates = new Map(prev);
            const currentState = newStates.get(analysisId) || {
              uploadState: null,
              analysisState: { status: "idle", progress: 0 },
              abortController: null,
            };
            newStates.set(analysisId, {
              ...currentState,
              abortController: controller,
              analysisState: { status: "uploading", progress: 0 },
            });
            return newStates;
          });

          // Continue with upload logic
          void performUpload(file, analysisId, controller).then(resolve).catch(reject);
        };

        video.onerror = () => {
          URL.revokeObjectURL(url);
          setUploadStates((prev) => {
            const newStates = new Map(prev);
            const currentState = newStates.get(analysisId) || {
              uploadState: null,
              analysisState: { status: "idle", progress: 0 },
              abortController: null,
            };
            newStates.set(analysisId, {
              ...currentState,
              analysisState: {
                status: "failed",
                progress: 0,
                error: {
                  message: "Invalid video file",
                  action: "Please select a valid video file",
                },
              },
            });
            return newStates;
          });
          reject(new Error("Invalid video file"));
        };

        video.src = url;
      });
    },
    [MAX_DURATION_SECONDS, MAX_FILE_SIZE_BYTES, performUpload]
  );

  const startAnalysis = useCallback(
    async (
      videoUrl: string,
      analysisId: string,
      context: Record<string, any>,
      metadata?: {
        duration?: number;
        fileSize?: number;
        filename?: string;
      }
    ) => {
      try {
        setUploadStates((prev) => {
          const newStates = new Map(prev);
          const currentState = newStates.get(analysisId) || {
            uploadState: null,
            analysisState: { status: "idle", progress: 0 },
            abortController: null,
          };
          newStates.set(analysisId, {
            ...currentState,
            analysisState: {
              status: "analyzing",
              progress: 0,
            },
          });
          return newStates;
        });

        const requestData = {
          video_url: videoUrl,
          // Send context directly to match API expectations
          context: context,
          // Include metadata if provided
          ...(metadata && { metadata }),
        };

        logger.info("Submitting analysis request", {
          data: requestData,
        });

        const response = await fetch("/api/services/alyzitron/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestData),
        });

        const responseData = await response.json();

        if (!response.ok || !responseData.success) {
          const errorMessage = responseData.error?.message || "Failed to initiate analysis";
          throw new Error(errorMessage);
        }

        // The API returns taskId, not analysis object
        const newAnalysisData = {
          _id: responseData.taskId,
          estimatedTime: responseData.estimatedTime || 60, // Default estimated time
        };
        logger.info("Analysis request submitted successfully", {
          data: { analysis: newAnalysisData },
        });

        // Mark upload as used for analysis
        try {
          await fetch('/api/services/alyzitron/gcs/track-upload', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uploadId: analysisId,
              analysisId: newAnalysisData._id,
              status: 'analysis_started',
            }),
          });
        } catch (trackingError) {
          logger.warn('Failed to update upload tracking', {
            data: { error: trackingError instanceof Error ? trackingError.message : String(trackingError) },
          });
        }

        // Unified pattern: invalidate canonical caches; RTDB will update history pages
        queryClient.invalidateQueries({ queryKey: ['alyzitron-tasks'], exact: false });
        queryClient.invalidateQueries({ queryKey: ['alyzitron-analytics'], exact: false });

        resetState(analysisId);

        return {
          analysisId: newAnalysisData._id,
          estimatedTime: newAnalysisData.estimatedTime
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Analysis failed";
        logger.error("Analysis submission failed", {
          data: { error: errorMessage },
        });

        setUploadStates((prev) => {
          const newStates = new Map(prev);
          const currentState = newStates.get(analysisId);
          if (currentState) {
            newStates.set(analysisId, {
              ...currentState,
              analysisState: {
                status: "idle",
                progress: 0,
                error: {
                  message: "Failed to start analysis",
                  action: "Please try again",
                },
              },
            });
          }
          return newStates;
        });

        throw error;
      }
    },
    [resetState, queryClient]
  );

  const uploadVideo = useCallback(
    async (file: File, analysisId: string) => {
      try {
        const gcsPath = await uploadFile(file, analysisId);
        return gcsPath ? { gcsPath, analysisId } : undefined;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        if (errorMessage === "Upload cancelled") {
          return;
        }

        logger.error("File upload process failed", {
          data: {
            error: errorMessage,
            filename: file.name,
          },
        });

        setUploadStates((prev) => {
          const newStates = new Map(prev);
          const currentState = newStates.get(analysisId);
          if (currentState) {
            newStates.set(analysisId, {
              ...currentState,
              analysisState: {
                status: "idle",
                progress: 0,
                error: {
                  message: errorMessage,
                  action: "Please try again",
                },
              },
            });
          }
          return newStates;
        });

        throw error;
      }
    },
    [uploadFile]
  );


  const deleteUploadedFile = useCallback(
    async (gcsPath: string) => {
      console.log('🗑️ deleteUploadedFile called with:', gcsPath);

      try {
        console.log('📡 Making delete API request...');
        // Call API to delete the uploaded file
        const response = await fetch(`/api/services/alyzitron/gcs/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ gcsPath }),
        });

        console.log('📡 Delete API response:', {
          status: response.status,
          ok: response.ok,
        });

        if (!response.ok) {
          const error = await response.json();
          console.error('❌ Delete API error:', error);
          throw new Error(error.error?.message || 'Failed to delete file');
        }

        const result = await response.json();
        console.log('✅ Delete API success:', result);

        // Delete tracking record since file was cancelled
        console.log('📡 Making delete tracking record API request...');
        console.log('🔍 About to call tracking deletion for gcsPath:', gcsPath);
        try {
          const trackingResponse = await fetch('/api/services/alyzitron/gcs/track-upload', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gcsPath,
            }),
          });
          
          console.log('📡 Delete tracking API response:', {
            status: trackingResponse.status,
            ok: trackingResponse.ok,
          });

          if (!trackingResponse.ok) {
            const trackingError = await trackingResponse.json();
            console.error('❌ Delete tracking API error:', trackingError);
            throw new Error(trackingError.error?.message || 'Failed to delete tracking record');
          }

          const trackingResult = await trackingResponse.json();
          console.log('✅ Tracking record deleted:', trackingResult);
        } catch (trackingError) {
          console.error('❌ Failed to delete tracking record:', trackingError);
          logger.error('Failed to delete tracking record', {
            data: { error: trackingError instanceof Error ? trackingError.message : String(trackingError), gcsPath },
          });
          // Re-throw the error so the caller knows deletion failed
          throw trackingError;
        }

        logger.info('File deleted successfully', {
          data: { gcsPath },
        });

        // Note: We don't have analysisId here, so we can't reset specific state
        // This is fine for cleanup operations
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete file';
        console.error('❌ File deletion failed:', errorMessage);
        logger.error('File deletion failed', {
          data: { error: errorMessage, gcsPath },
        });
        throw error;
      }
    },
    []
  );

  return {
    uploadStates,
    uploadVideo,
    deleteUploadedFile,
    startAnalysis,
    cancelUpload,
    resetState,
  };
}
