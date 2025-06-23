import { useState, useCallback } from "react";
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

interface AnalysisMetadata {
  title?: string;
  description?: string;
  niche?: string;
  target_audience?: string;
  additional_details?: string;
}

export function useVideoAnalysis() {
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    status: "idle",
    progress: 0,
  });

  const resetState = useCallback(() => {
    setUploadState(null);
    setAnalysisState({
      status: "idle",
      progress: 0,
    });
  }, []);

  const uploadFile = useCallback(async (file: File): Promise<string> => {
    try {
      setAnalysisState({ status: "uploading", progress: 0 });

      // Get signed URL
      logger.info("Requesting signed URL for upload");
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
        throw new Error(error.message || "Failed to get upload URL"); // Directly access message property
      }

      const { url, gcsPath, contentType } = await signResponse.json();
      logger.info("Starting file upload", {
        data: {
          gcsPath,
          size: file.size,
          contentType,
        },
      });

      // Upload file
      const uploadResponse = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Length": file.size.toString(),
          Origin: window.location.origin,
        },
        body: file,
        mode: "cors",
        credentials: "include",
      });

      if (!uploadResponse.ok) {
        const errorMessage = `Upload failed with status ${uploadResponse.status}: ${uploadResponse.statusText}`;
        logger.error("Upload failed", {
          data: {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            gcsPath,
          },
        });
        throw new Error(errorMessage);
      }

      logger.info("File upload completed successfully", {
        data: { gcsPath },
      });

      return gcsPath;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      logger.error("Upload process failed", {
        data: {
          error: errorMessage,
          filename: file.name,
        },
      });

      setAnalysisState({
        status: "failed",
        progress: 0,
        error: {
          message: "Failed to upload video",
          action: "Please try again or use a different video file",
        },
      });

      throw error;
    } finally {
      setUploadState(null);
    }
  }, []);

  const submitAnalysis = useCallback(
    async (
      videoUrl: string,
      videoType: string,
      metadata?: AnalysisMetadata
    ) => {
      try {
        setAnalysisState({
          status: "analyzing",
          progress: 0,
        });

        // Format request according to API documentation
        const requestData = {
          type: videoType,
          video_url: videoUrl,
          ...metadata, // These fields already match the API format
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

        if (!response.ok) {
          const error = await response.json();
          throw new Error(
            error.message || "Failed to initiate analysis" // Directly access message property
          );
        }

        const { analysisId, taskId, estimatedTime } = await response.json();
        logger.info("Analysis request submitted successfully", {
          data: { analysisId, taskId, estimatedTime },
        });

        // Reset state immediately after successful submission
        resetState();

        return { analysisId, taskId, estimatedTime };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Analysis failed";
        logger.error("Analysis submission failed", {
          data: { error: errorMessage },
        });

        setAnalysisState({
          status: "idle", // Reset to idle on error
          progress: 0,
          error: {
            message: "Failed to start analysis",
            action: "Please try again",
          },
        });

        throw error;
      }
    },
    [resetState]
  );

  const analyzeFile = useCallback(
    async (file: File, videoType: string, metadata?: AnalysisMetadata) => {
      try {
        // Upload file first
        const gcsPath = await uploadFile(file);

        // Submit for analysis with metadata
        return await submitAnalysis(gcsPath, videoType, {
          title: file.name,
          ...metadata,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Analysis failed";
        logger.error("File analysis process failed", {
          data: {
            error: errorMessage,
            filename: file.name,
          },
        });

        // Reset to idle state on error
        setAnalysisState({
          status: "idle",
          progress: 0,
          error: {
            message: errorMessage,
            action: "Please try again",
          },
        });

        throw error;
      }
    },
    [uploadFile, submitAnalysis]
  );

  const cancelAnalysis = useCallback(async (taskId: string) => {
    try {
      logger.info("Canceling analysis", { data: { taskId } });

      const response = await fetch("/api/services/alyzitron/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to cancel analysis"); // Directly access message property
      }

      logger.info("Analysis canceled successfully", { data: { taskId } });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to cancel analysis";
      logger.error("Analysis cancellation failed", {
        data: { error: errorMessage, taskId },
      });
      throw error;
    }
  }, []);

  return {
    uploadState,
    analysisState,
    analyzeFile,
    submitAnalysis,
    cancelAnalysis,
    resetState,
  };
}
