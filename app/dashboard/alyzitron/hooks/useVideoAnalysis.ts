import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@/app/api/services/alyzitron/utils/logger";
import { getActiveBrandIdFromStorage } from "@/components/dashboard/ActiveBrand/ActiveBrandProvider";
import {
  multipartUpload,
  type MultipartProgress,
  type MultipartResult,
} from "../utils/multipart-upload";

// ─── Types ────────────────────────────────────────────────────────

interface UploadState {
  progress: number;
  speed: number;
  remaining: number;
  partsCompleted?: number;
  partsTotal?: number;
  message?: string;
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

type UploadedMedia = {
  storageKey: string;
  publicUrl: string;
  storage: "gcs" | "r2";
  contentType: string;
};

// ─── Constants ────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB
const MAX_DURATION_SECONDS = 55 * 60; // 55 minutes

// ─── Hook ─────────────────────────────────────────────────────────

export function useVideoAnalysis() {
  const queryClient = useQueryClient();
  const [uploadStates, setUploadStates] = useState<
    Map<string, AnalysisUploadState>
  >(new Map());

  // ─── State Helpers ────────────────────────────────────────────

  const updateState = useCallback(
    (
      analysisId: string,
      updater: (current: AnalysisUploadState) => Partial<AnalysisUploadState>
    ) => {
      setUploadStates((prev) => {
        const newStates = new Map(prev);
        const current = newStates.get(analysisId) || {
          uploadState: null,
          analysisState: { status: "idle" as const, progress: 0 },
          abortController: null,
        };
        newStates.set(analysisId, { ...current, ...updater(current) });
        return newStates;
      });
    },
    []
  );

  const resetState = useCallback(
    (analysisId: string) => {
      updateState(analysisId, () => ({
        uploadState: null,
        analysisState: { status: "idle" as const, progress: 0 },
        abortController: null,
      }));
    },
    [updateState]
  );

  const cancelUpload = useCallback(
    (analysisId: string) => {
      const state = uploadStates.get(analysisId);
      if (state?.abortController) {
        state.abortController.abort();
        resetState(analysisId);
      }
    },
    [uploadStates, resetState]
  );

  // ─── Validation ───────────────────────────────────────────────

  const validateFile = useCallback(
    (file: File, analysisId: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Size check
        if (file.size > MAX_FILE_SIZE_BYTES) {
          updateState(analysisId, () => ({
            analysisState: {
              status: "failed",
              progress: 0,
              error: {
                message: "File size exceeds 1GB limit",
                action: "Please select a smaller video file",
              },
            },
          }));
          reject(new Error("File size exceeds 1GB limit"));
          return;
        }

        // Duration check
        const video = document.createElement("video");
        video.preload = "metadata";
        const url = URL.createObjectURL(file);

        video.onloadedmetadata = () => {
          const duration = Math.ceil(video.duration);
          URL.revokeObjectURL(url);

          if (duration > MAX_DURATION_SECONDS) {
            updateState(analysisId, () => ({
              analysisState: {
                status: "failed",
                progress: 0,
                error: {
                  message: "Video duration exceeds 55 minutes limit",
                  action: "Please select a shorter video",
                },
              },
            }));
            reject(new Error("Video duration exceeds 55 minutes limit"));
            return;
          }

          resolve();
        };

        video.onerror = () => {
          URL.revokeObjectURL(url);
          updateState(analysisId, () => ({
            analysisState: {
              status: "failed",
              progress: 0,
              error: {
                message: "Invalid video file",
                action: "Please select a valid video file",
              },
            },
          }));
          reject(new Error("Invalid video file"));
        };

        video.src = url;
      });
    },
    [updateState]
  );

  // ─── Upload (Multipart) ───────────────────────────────────────

  const performUpload = useCallback(
    async (
      file: File,
      analysisId: string,
      controller: AbortController
    ): Promise<UploadedMedia | null> => {
      try {
        logger.info("Starting multipart upload", {
          data: {
            filename: file.name,
            size: file.size,
            contentType: file.type,
          },
        });

        const result: MultipartResult = await multipartUpload(
          file,
          (progress: MultipartProgress) => {
            updateState(analysisId, () => ({
              uploadState: {
                progress: progress.progress,
                speed: progress.speed,
                remaining: progress.remaining,
                partsCompleted: progress.partsCompleted,
                partsTotal: progress.partsTotal,
                message: progress.message,
              },
            }));
          },
          controller.signal
        );

        logger.info("Multipart upload completed", {
          data: { storageKey: result.storageKey },
        });

        updateState(analysisId, () => ({
          analysisState: { status: "completed", progress: 100 },
        }));

        return {
          storageKey: result.storageKey,
          publicUrl: result.publicUrl,
          storage: result.storage,
          contentType: result.contentType,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Upload cancelled"
        ) {
          logger.info("Upload cancelled successfully");
          return null;
        }

        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        logger.error("Upload failed", {
          data: { error: errorMessage, filename: file.name },
        });

        updateState(analysisId, () => ({
          analysisState: {
            status: "failed",
            progress: 0,
            error: {
              message: "Failed to upload video",
              action: "Please try again or use a different video file",
            },
          },
        }));

        throw error;
      } finally {
        updateState(analysisId, () => ({ abortController: null }));
      }
    },
    [updateState]
  );

  // ─── Public: Upload File ──────────────────────────────────────

  const uploadFile = useCallback(
    async (
      file: File,
      analysisId: string
    ): Promise<UploadedMedia | null> => {
      // Validate first
      await validateFile(file, analysisId);

      // Set up abort controller and uploading state
      const controller = new AbortController();
      updateState(analysisId, () => ({
        abortController: controller,
        analysisState: { status: "uploading", progress: 0 },
      }));

      return performUpload(file, analysisId, controller);
    },
    [validateFile, performUpload, updateState]
  );

  // ─── Public: Upload Video (convenience wrapper) ───────────────

  const uploadVideo = useCallback(
    async (file: File, analysisId: string) => {
      try {
        const uploaded = await uploadFile(file, analysisId);
        return uploaded
          ? {
              ...uploaded,
              analysisId,
              videoUrl:
                uploaded.storage === "r2"
                  ? uploaded.publicUrl
                  : uploaded.storageKey,
            }
          : undefined;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        if (errorMessage === "Upload cancelled") return;

        logger.error("File upload process failed", {
          data: { error: errorMessage, filename: file.name },
        });

        updateState(analysisId, () => ({
          analysisState: {
            status: "idle",
            progress: 0,
            error: { message: errorMessage, action: "Please try again" },
          },
        }));

        throw error;
      }
    },
    [uploadFile, updateState]
  );

  // ─── Public: Start Analysis ───────────────────────────────────

  const startAnalysis = useCallback(
    async (
      videoUrl: string,
      analysisId: string,
      context: Record<string, any>,
      metadata?: {
        duration?: number;
        fileSize?: number;
        filename?: string;
        storage?: "gcs" | "r2";
        gcsPath?: string;
        publicUrl?: string;
        brandId?: string;
      },
      storage?: "gcs" | "r2"
    ) => {
      try {
        updateState(analysisId, () => ({
          analysisState: { status: "analyzing", progress: 0 },
        }));

        const activeBrandId = getActiveBrandIdFromStorage();
        const requestBrandId = activeBrandId?.trim() || undefined;
        const requestContext =
          requestBrandId && !context.brandId
            ? { ...context, brandId: requestBrandId }
            : context;
        const requestMetadata =
          metadata && requestBrandId && !metadata.brandId
            ? { ...metadata, brandId: requestBrandId }
            : metadata;

        const requestData = {
          video_url: videoUrl,
          context: requestContext,
          ...(requestBrandId && { brandId: requestBrandId }),
          ...(requestMetadata && { metadata: requestMetadata }),
          ...(storage && { storage }),
        };

        logger.info("Submitting analysis request", { data: requestData });

        const response = await fetch("/api/services/alyzitron/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestData),
        });

        const responseData = await response.json();

        if (!response.ok || !responseData.success) {
          throw new Error(
            responseData.error?.message || "Failed to initiate analysis"
          );
        }

        const newAnalysisData = {
          _id: responseData.taskId,
          estimatedTime: responseData.estimatedTime || 60,
        };

        logger.info("Analysis request submitted", {
          data: { analysis: newAnalysisData },
        });

        // Update tracking status (non-blocking)
        fetch("/api/services/alyzitron/gcs/track-upload", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadId: analysisId,
            analysisId: newAnalysisData._id,
            status: "analysis_started",
          }),
        }).catch((err) => {
          logger.warn("Failed to update upload tracking", {
            data: {
              error: err instanceof Error ? err.message : String(err),
            },
          });
        });

        // Invalidate caches
        queryClient.invalidateQueries({
          queryKey: ["alyzitron-tasks"],
          exact: false,
        });
        queryClient.invalidateQueries({
          queryKey: ["alyzitron-analytics"],
          exact: false,
        });

        resetState(analysisId);

        return {
          analysisId: newAnalysisData._id,
          estimatedTime: newAnalysisData.estimatedTime,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Analysis failed";
        logger.error("Analysis submission failed", {
          data: { error: errorMessage },
        });

        updateState(analysisId, () => ({
          analysisState: {
            status: "idle",
            progress: 0,
            error: {
              message: "Failed to start analysis",
              action: "Please try again",
            },
          },
        }));

        throw error;
      }
    },
    [resetState, queryClient, updateState]
  );

  // ─── Public: Delete Uploaded File ─────────────────────────────

  const deleteUploadedFile = useCallback(
    async (storageKey: string, storage?: "gcs" | "r2") => {
      try {
        const response = await fetch("/api/services/alyzitron/gcs/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storageKey, storage }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(
            error.error?.message || "Failed to delete file"
          );
        }

        // Delete tracking record
        await fetch("/api/services/alyzitron/gcs/track-upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storageKey }),
        });

        logger.info("File deleted successfully", {
          data: { storageKey },
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to delete file";
        logger.error("File deletion failed", {
          data: { error: errorMessage, storageKey },
        });
        throw error;
      }
    },
    []
  );

  // ─── Return ───────────────────────────────────────────────────

  return {
    uploadStates,
    uploadVideo,
    deleteUploadedFile,
    startAnalysis,
    cancelUpload,
    resetState,
  };
}
