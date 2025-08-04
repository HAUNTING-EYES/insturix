import { useState, useCallback } from "react";
import { useQueryClient } from '@tanstack/react-query';
import { logger } from "@/app/api/services/alyzitron/utils/logger";
import { useAnalytics } from "@/components/dashboard/Alyzitron/AnalyticsProvider";

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

interface AnalysisMetadata {
  title?: string;
  description?: string;
  niche?: string;
  target_audience?: string;
  additional_details?: string;
}

interface AnalysisUploadState {
  uploadState: UploadState | null;
  analysisState: AnalysisState;
  abortController: AbortController | null;
}


export function useVideoAnalysis() {
  const queryClient = useQueryClient();
  const { fetchStats } = useAnalytics();
  
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

  const uploadFile = useCallback(
    async (file: File, analysisId: string): Promise<string> => {
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

  const submitAnalysis = useCallback(
    async (
      videoUrl: string,
      analysisId: string,
      metadata?: AnalysisMetadata
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
              additional_details: metadata?.additional_details || JSON.stringify({}),
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

          // Immediately add the new analysis to the cache
          queryClient.setQueryData(['alyzitron-analyses'], (old: any) => {
              const currentData = Array.isArray(old) ? old : [];
              // Add to the beginning of the array
              const updatedData = [newAnalysisData, ...currentData];
              return updatedData;
          });

          // Update analytics overview after task creation
          fetchStats();

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
    [resetState, queryClient, fetchStats]
  );

  const analyzeFile = useCallback(
    async (
      file: File,
      analysisId: string,
      metadata?: AnalysisMetadata
    ) => {
      try {
        const gcsPath = await uploadFile(file, analysisId);

        if (gcsPath) {
          return await submitAnalysis(
            gcsPath,
            analysisId,
            metadata
          );
        }

        return;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Analysis failed";

        if (errorMessage === "Upload cancelled") {
          return;
        }

        logger.error("File analysis process failed", {
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
    [uploadFile, submitAnalysis]
  );


  return {
    uploadStates,
    analyzeFile,
    submitAnalysis,
    cancelUpload,
    resetState,
  };
}
