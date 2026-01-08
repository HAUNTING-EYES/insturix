"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sparkles, Upload, ArrowRight, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextSelector } from "./ContextSelector";
import type { ContextValues } from "./ContextSelector";
import { useToast } from "@/hooks/use-toast";
import { useVideoAnalysis } from "@/app/dashboard/alyzitron/hooks/useVideoAnalysis";
import { Analysis } from "@/app/dashboard/alyzitron/types/analysis";

// Usage data will be passed as a prop from the parent component

type Source =
  | { type: "none" }
  | { type: "file"; file: File; duration: number }
  | {
      type: "link";
      url: string;
      preview?: {
        title: string;
        thumbnail: string;
        videoId: string;
        duration: number;
      };
    };

interface ImmersiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: Source;
  onSubmit: (analysisId: string, analysis: Analysis) => void;
  onComplete: (analysisId: string, analysis: Analysis) => void;
  uploadStates: Map<string, any>;
  usageData?: {
    minutesUsed: number;
    minutesCap: number | string;
    remaining: number | string;
  };
}

export const ImmersiveModal: React.FC<ImmersiveModalProps> = ({
  open,
  onOpenChange,
  source,
  onSubmit,
  onComplete,
  uploadStates,
  usageData,
}) => {
  // Modal manages its own state
  const [context, setContext] = useState<ContextValues>({
    niche: "",
    audience: "",
    tone: "",
    additionalDetails: "",
  });

  // Log context changes for debugging
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    progress: number;
    status: "idle" | "uploading" | "analyzing" | "completed" | "error";
    message?: string;
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [gcsPath, setGcsPath] = useState<string | null>(null);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [uploadCompleted, setUploadCompleted] = useState(false);
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);

  const { toast } = useToast();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const {
    uploadVideo,
    startAnalysis,
    cancelUpload,
    deleteUploadedFile,
    resetState,
  } = useVideoAnalysis();
  const prevOpenRef = useRef<boolean>(false);
  const isCleaningUpRef = useRef<boolean>(false);

  // YouTube URL validation and video ID extraction (moved from VideoUpload)
  const isYouTubeUrl = useCallback(
    (url: string): boolean =>
      /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/.test(url),
    []
  );

  const extractYouTubeVideoId = useCallback((url: string): string | null => {
    const regexes = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const r of regexes) {
      const m = url.match(r);
      if (m && m[1]) return m[1];
    }
    return null;
  }, []);

  // Note: Duration fetching is now handled by VideoUpload component
  // This function is kept for compatibility but doesn't fetch duration
  const fetchPreview = useCallback(
    async (url: string) => {
      const id = extractYouTubeVideoId(url);
      if (!id) {
        return {
          title: "Unknown Video",
          thumbnail: "",
          videoId: "",
          duration: 0,
        };
      }
      try {
        // Use our link-preview endpoint for robustness (title/image fallback)
        const res = await fetch(
          `/api/link-preview?url=${encodeURIComponent(url)}`
        );
        const meta = await res.json();
        const title = meta.title || "YouTube Video";
        const thumbnail =
          meta.image || `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;

        // Duration should be provided by VideoUpload component
        // Return 0 as fallback (should not be used in production)
        return { title, thumbnail, videoId: id, duration: 0 };
      } catch {
        return {
          title: "YouTube Video",
          thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
          videoId: id,
          duration: 0, // Duration should be provided by VideoUpload component
        };
      }
    },
    [extractYouTubeVideoId]
  );

  // Handle file upload only (for auto-upload when modal opens)
  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file) return;

      setIsProcessing(true);
      setError(null);

      // Create submission ID for tracking
      let submissionId = analysisId;
      if (!submissionId) {
        submissionId = crypto.randomUUID();
        setAnalysisId(submissionId);
      }

      try {
        // Start upload - show initial progress
        setUploadProgress({ progress: 0, status: "uploading" });

        // Simple progress updates without intervals
        setTimeout(
          () =>
            setUploadProgress((prev) =>
              prev?.status === "uploading" ? { ...prev, progress: 25 } : prev
            ),
          500
        );
        setTimeout(
          () =>
            setUploadProgress((prev) =>
              prev?.status === "uploading" ? { ...prev, progress: 50 } : prev
            ),
          1500
        );
        setTimeout(
          () =>
            setUploadProgress((prev) =>
              prev?.status === "uploading" ? { ...prev, progress: 75 } : prev
            ),
          3000
        );

        const uploadResult = await uploadVideo(file, submissionId);

        console.log("📤 Upload result:", uploadResult);

        // Store the gcsPath for potential deletion
        if (uploadResult?.gcsPath) {
          console.log("💾 Setting gcsPath:", uploadResult.gcsPath);
          setGcsPath(uploadResult.gcsPath);
        } else {
          console.warn("⚠️ No gcsPath in upload result:", uploadResult);
          // If upload was cancelled or failed, don't proceed
          if (!uploadResult) {
            console.log("🚫 Upload was cancelled or returned undefined");
            return;
          }
        }

        // Mark as completed
        setUploadProgress({ progress: 100, status: "completed" });
        setUploadCompleted(true);
        console.log("✅ Upload marked as completed");
      } catch (err) {
        let description = "Upload failed. Please try again.";

        if (err instanceof Error) {
          if (err.message === "Upload cancelled") {
            setIsProcessing(false);
            return;
          } else if (err.message.includes("Network Error")) {
            description =
              "Network error occurred. Please check your connection and try again.";
          }
        }

        // Cleanup client-side tracking for this failed submission
        try {
          if (submissionId) resetState(submissionId);
        } catch {
          // ignore if resetState unavailable or fails
        }
        setAnalysisId(null);
        setGcsPath(null);
        setUploadCompleted(false);
        setUploadProgress({ progress: 0, status: "error" });

        setError(description);
        toast({ title: "Upload Failed", description, variant: "destructive" });
      } finally {
        setIsProcessing(false);
      }
    },
    [analysisId, uploadVideo, resetState, toast]
  );

  // Handle analysis start (for when user clicks "Begin Analysis")
  const handleStartAnalysisOnly = useCallback(
    async (
      source: Source,
      context: ContextValues,
      onSubmit: (analysisId: string, analysis: Analysis) => void
    ) => {
      console.log("🔧 handleStartAnalysisOnly called with context:", context);
      if (!source.type) return;

      setIsProcessing(true);
      setError(null);

      // Use existing analysisId or create new one
      let submissionId = analysisId;
      if (!submissionId) {
        submissionId = crypto.randomUUID();
        setAnalysisId(submissionId);
      }

      try {
        let result;
        const contextForAnalysis = JSON.parse(JSON.stringify(context));
        console.log(
          "📋 Context being sent to startAnalysis:",
          contextForAnalysis
        );

        if (source.type === "file") {
          // File should already be uploaded, use the actual GCS path
          console.log("🔍 Checking gcsPath for file analysis:", {
            gcsPath,
            uploadCompleted,
          });
          if (!gcsPath) {
            console.error("❌ No gcsPath available for file analysis");
            throw new Error("File upload not completed. Please try again.");
          }
          
          // Prepare metadata for the file
          const metadata = {
            duration: source.duration > 0 ? source.duration : undefined,
            fileSize: source.file.size,
            filename: source.file.name,
          };
          
          const payload = {
            videoUrl: gcsPath,
            submissionId: submissionId,
            context: contextForAnalysis,
            sourceType: "file",
            metadata,
          };
          console.log(
            "🚀 Sending payload to analyze route (file):",
            JSON.stringify(payload, null, 2)
          );
          result = await startAnalysis(
            gcsPath,
            submissionId,
            contextForAnalysis,
            metadata
          );
        } else if (source.type === "link") {
          if (!isYouTubeUrl(source.url)) {
            toast({
              title: "Invalid URL",
              description: "Please paste a valid YouTube link.",
              variant: "destructive",
            });
            setIsProcessing(false);
            return;
          }
          const payload = {
            videoUrl: source.url,
            submissionId: submissionId,
            context: contextForAnalysis,
            sourceType: "link",
            preview: source.preview,
          };
          console.log(
            "🚀 Sending payload to analyze route (link):",
            JSON.stringify(payload, null, 2)
          );
          result = await startAnalysis(
            source.url,
            submissionId,
            contextForAnalysis
          );
        }

        if (result?.analysisId) {
          const title =
            source.type === "file"
              ? source.file.name
              : source.type === "link"
                ? source.preview?.title || source.url
                : "Unknown";
          const videoUrl =
            source.type === "link"
              ? source.url
              : source.type === "file"
                ? source.file.name
                : "";

          const analysisData: Analysis = {
            analysisId: result.analysisId,
            title,
            videoUrl,
            status: "queued",
            progress: 0,
            estimatedTime: result.estimatedTime || 60,
            queuePosition: 1,
          };

          console.log("🚀 Analysis started successfully, marking as started");
          setCreatedTaskId(result.analysisId);
          setAnalysisStarted(true);
          onSubmit(result.analysisId, analysisData);

          // Auto-close modal on analysis start, giving time to see the success notification
          setIsModalClosing(true);
          setTimeout(() => {
            onOpenChange(false);
            setIsModalClosing(false);
          }, 2000);
        }
      } catch (err) {
        console.error("❌ Analysis start failed:", err);
        let description = "Analysis failed to start. Please try again.";

        if (err instanceof Error) {
          console.error("❌ Error details:", {
            message: err.message,
            stack: err.stack,
          });

          if (
            err.message.includes("limit exceeded") ||
            err.message.includes("LIMIT_EXCEEDED")
          ) {
            let limitType: "total" | "long_video" | "general" = "general";
            if (err.message.includes("Total analyses limit exceeded"))
              limitType = "total";
            else if (err.message.includes("Long video limit exceeded"))
              limitType = "long_video";
            toast({
              title: "Limit Exceeded",
              description: `Your ${limitType} limit has been exceeded. Please upgrade your plan.`,
              variant: "destructive",
            });
            setIsProcessing(false);
            return;
          } else if (err.message.includes("Network Error")) {
            description =
              "Network error occurred. Please check your connection and try again.";
          } else {
            // Use the actual error message for better debugging
            description = err.message;
          }
        }

        setError(description);
        toast({
          title: "Analysis Failed",
          description,
          variant: "destructive",
        });

        // Don't auto-close on failure, let user read the error
        setIsProcessing(false);
      } finally {
        setIsProcessing(false);
      }
    },
    [analysisId, gcsPath, onOpenChange, uploadCompleted, isYouTubeUrl, startAnalysis, toast]
  );

  // Handle analysis completion
  const handleAnalysisComplete = useCallback(
    (
      analysisId: string,
      uploadStates: Map<string, any>,
      onComplete: (analysisId: string, analysis: Analysis) => void
    ) => {
      const currentUploadState = uploadStates.get(analysisId)?.uploadState;
      const currentAnalysisState = uploadStates.get(analysisId)
        ?.analysisState || { status: "idle" as const, progress: 0 };

      if (currentUploadState && currentAnalysisState.status === "completed") {
        const title =
          source.type === "file"
            ? source.file.name
            : source.type === "link"
              ? source.preview?.title || source.url
              : "";
        const videoUrl =
          source.type === "link"
            ? source.url
            : source.type === "file"
              ? source.file.name
              : "";
        const completedAnalysis: Analysis = {
          analysisId,
          title,
          videoUrl,
          status: "completed",
          progress: 1,
          estimatedTime: 0,
          queuePosition: 0,
        };

        onComplete(analysisId, completedAnalysis);

        // Reset modal state
        setAnalysisId(null);
        setGcsPath(null);
        setUploadProgress(null);
      }
    },
    [source]
  );

  // Create object URL for local file preview
  useEffect(() => {
    if (source.type === "file") {
      const url = URL.createObjectURL(source.file);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setPreviewUrl(null);
      };
    } else {
      setPreviewUrl(null);
    }
  }, [source]);

  // Auto-start upload when modal opens with a file
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (source.type === "file") {
        // Auto-start file upload when modal opens (upload only, not analysis)
        handleFileUpload(source.file);
      } else if (source.type === "link" && source.url && !source.preview) {
        // Fetch preview for YouTube URLs when modal opens
        const fetchYouTubePreview = async () => {
          try {
            // Update the source with preview data
            // Note: We can't directly modify the source prop, so this would need to be handled differently
            // For now, we'll just set the preview in state if needed
          } catch (error) {
            console.error("Failed to fetch preview:", error);
          }
        };
        fetchYouTubePreview();
      }
    }
    prevOpenRef.current = open;
  }, [open, source, handleFileUpload]);

  // Track upload progress from uploadStates
  useEffect(() => {
    if (analysisId && uploadStates) {
      const currentState = uploadStates.get(analysisId);

      if (currentState?.uploadState) {
        const { progress, status } = currentState.uploadState;
        setUploadProgress((prev) => {
          const newProgress = Math.round((progress || 0) * 100);
          const newStatus =
            status === "completed"
              ? "completed"
              : status === "error"
                ? "error"
                : "uploading";

          // Only update if values actually changed to prevent infinite loops
          if (
            !prev ||
            prev.progress !== newProgress ||
            prev.status !== newStatus
          ) {
            return { progress: newProgress, status: newStatus };
          }
          return prev;
        });
      } else if (currentState) {
        // Try alternative structure
        const progress =
          currentState.progress || currentState.uploadProgress || 0;
        const status =
          currentState.status || currentState.uploadStatus || "uploading";
        setUploadProgress((prev) => {
          const newProgress = Math.round(progress * 100);
          const newStatus =
            status === "completed"
              ? "completed"
              : status === "error"
                ? "error"
                : "uploading";

          // Only update if values actually changed
          if (
            !prev ||
            prev.progress !== newProgress ||
            prev.status !== newStatus
          ) {
            return { progress: newProgress, status: newStatus };
          }
          return prev;
        });
      }

      handleAnalysisComplete(analysisId, uploadStates, onComplete);
    }
  }, [
    analysisId,
    uploadStates,
    onComplete,
    fetchPreview,
    handleAnalysisComplete,
  ]);

  // Reset state when modal closes and cleanup uploaded files
  useEffect(() => {
    if (!open && gcsPath && !isCleaningUpRef.current) {
      console.log("📝 Modal is closing, checking cleanup conditions...");
      isCleaningUpRef.current = true;

      // If we have an uploaded file that hasn't started analysis, delete it
      if (source.type === "file" && uploadCompleted && !analysisStarted) {
        console.log("🗑️ Attempting to delete uploaded file:", gcsPath);
        deleteUploadedFile(gcsPath)
          .then(() => {
            console.log("✅ File and tracking record deleted successfully");
          })
          .catch((error) => {
            console.warn(
              "Failed to cleanup uploaded file on modal close:",
              error
            );
          })
          .finally(() => {
            // Always reset state after cleanup attempt
            setGcsPath(null);
            setAnalysisId(null);
            setAnalysisStarted(false);
            setUploadCompleted(false);
            setError(null);
            setUploadProgress(null);
            isCleaningUpRef.current = false;
          });
      } else {
        console.log("⏭️ Skipping file deletion:", {
          hasGcsPath: !!gcsPath,
          isFileType: source.type === "file",
          uploadCompleted,
          analysisStarted,
          reason:
            source.type !== "file"
              ? "Not a file upload"
              : !uploadCompleted
                ? "Upload not completed"
                : analysisStarted
                  ? "Analysis already started"
                  : "Unknown",
        });

        // Reset state only when no deletion is needed
        setCreatedTaskId(null);
        setAnalysisStarted(false);
        setUploadCompleted(false);
        setError(null);
        setUploadProgress(null);
        isCleaningUpRef.current = false;
      }
    } else if (!open && !gcsPath && !isCleaningUpRef.current) {
      // Reset state if modal is closed but no gcsPath to delete
      setGcsPath(null);
      setAnalysisId(null);
      setCreatedTaskId(null);
      setAnalysisStarted(false);
      setUploadCompleted(false);
      setError(null);
      setUploadProgress(null);
    }
  }, [
    open,
    gcsPath,
    source.type,
    uploadCompleted,
    analysisStarted,
    handleAnalysisComplete,
    deleteUploadedFile,
  ]);

  // Auto-hide success overlay after upload completion
  useEffect(() => {
    if (uploadProgress?.status === "completed") {
      const timer = setTimeout(() => {
        setUploadProgress((prev) =>
          prev ? { ...prev, status: "idle" as const } : null
        );
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [uploadProgress?.status, analysisId, deleteUploadedFile]);

  // Check if content is scrollable and show scroll indicator
  useEffect(() => {
    const checkScrollable = () => {
      const container = scrollContainerRef.current;
      if (container) {
        const isScrollable = container.scrollHeight > container.clientHeight;
        const isAtBottom =
          container.scrollTop + container.clientHeight >=
          container.scrollHeight - 10;
        setShowScrollIndicator(isScrollable && !isAtBottom);
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      checkScrollable();
      container.addEventListener("scroll", checkScrollable);
      window.addEventListener("resize", checkScrollable);

      return () => {
        container.removeEventListener("scroll", checkScrollable);
        window.removeEventListener("resize", checkScrollable);
      };
    }
  }, [open, source, context]);

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return "Unknown";
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0)
      return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const handleStartAnalysis = async () => {
    console.log("🚀 handleStartAnalysis called with context:", context);
    console.log("🔍 Current state:", {
      sourceType: source.type,
      gcsPath,
      uploadCompleted,
      analysisStarted,
      uploadProgress: uploadProgress?.status,
      isProcessing,
    });

    if (!source.type || !context.niche || !context.audience || !context.tone) {
      console.warn("❌ Missing required context fields:", {
        hasSource: !!source.type,
        hasNiche: !!context.niche,
        hasAudience: !!context.audience,
        hasTone: !!context.tone,
      });
      setError("Please fill all context fields");
      return;
    }

    // Start analysis only (file should already be uploaded)
    await handleStartAnalysisOnly(source, context, onSubmit);
  };

  const handleCancel = async () => {
    if (
      analysisId &&
      source.type === "file" &&
      uploadProgress?.status !== "completed"
    ) {
      try {
        // Cancel the upload first
        if (cancelUpload) {
          await cancelUpload(analysisId);
        }
      } catch (error) {
        console.warn("Failed to cancel upload:", error);
      }

      try {
        // Then try to delete the uploaded file
        if (deleteUploadedFile && gcsPath) {
          await deleteUploadedFile(gcsPath);
        }
      } catch (error) {
        // Silently handle file deletion errors - the file might not exist or the server might be unavailable
        console.warn("Failed to delete uploaded file during cancel:", error);
      }
    }
    onOpenChange(false);
  };

  // Calculate analysis cost in minutes
  const getAnalysisCost = () => {
    if (source.type === "file" && source.duration > 0) {
      return Math.ceil(source.duration / 60);
    } else if (
      source.type === "link" &&
      source.preview?.duration &&
      source.preview.duration > 0
    ) {
      return Math.ceil(source.preview.duration / 60);
    }
    // Return 0 for loading states (-1) or unknown durations
    return 0;
  };

  const analysisCost = getAnalysisCost();
  const remainingMinutes =
    typeof usageData?.remaining === "string"
      ? parseInt(usageData.remaining)
      : usageData?.remaining || 0;
  const hasInsufficientMinutes = analysisCost > remainingMinutes;

  const canSubmit =
    source.type !== "none" &&
    context.niche &&
    context.audience &&
    context.tone &&
    !hasInsufficientMinutes;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(newOpen) => {
          // If trying to close and it's a file that has been completely uploaded, show confirmation
          if (!newOpen && source.type === "file") {
            setShowCloseConfirmation(true);
            return;
          }

          // If trying to close but it's still processing (uploading/analyzing), prevent closing
          if (!newOpen && source.type === "file") {
            return; // Prevent closing while processing
          }

          // Allow closing in all other cases (link, file not completed, or not processing)
          onOpenChange(newOpen);
        }}
      >
        <DialogContent className="max-w-4xl w-[94vw] max-h-[88vh] p-0 rounded-2xl bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/70 shadow-[0_14px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/5">
          <div className="relative flex min-h-[360px] max-h-[88vh] flex-col">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="px-6 pt-5 pb-4 flex items-start justify-between shrink-0 border-b border-zinc-800/60 bg-gradient-to-b from-zinc-900/80 to-zinc-900/50 rounded-t-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 ring-1 ring-inset ring-blue-400/20">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                </div>
                <h3 className="text-zinc-100 font-semibold tracking-tight">
                  Review & Start Analysis
                </h3>
              </div>
            </motion.div>

            {/* Content */}
            <motion.div
              ref={scrollContainerRef}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
              className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-zinc-900/50 scrollbar-thumb-zinc-700/70 hover:scrollbar-thumb-zinc-600/80"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor:
                  "rgba(113, 113, 122, 0.7) rgba(24, 24, 27, 0.5)",
              }}
            >
              <div className="px-6 pt-5 pb-4">
                {/* Video Preview Section */}
                <div className="flex items-start gap-4 mb-6 p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/70 ring-1 ring-white/5">
                  <div className="relative w-[120px] h-[67.5px] flex-shrink-0 rounded-lg overflow-hidden border border-zinc-800/60 bg-zinc-900/50">
                    {source.type === "link" && source.preview?.thumbnail ? (
                      <div className="w-full h-full relative">
                        <Image
                          src={source.preview.thumbnail}
                          alt={source.preview.title || "Video thumbnail"}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : source.type === "file" && previewUrl ? (
                      <video
                        src={previewUrl}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
                        <Upload className="h-4 w-4" />
                      </div>
                    )}

                    {/* Upload progress overlay */}
                    <AnimatePresence mode="wait">
                      {source.type === "file" &&
                        uploadProgress?.status === "uploading" && (
                          <motion.div
                            key="uploading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center rounded-md"
                          >
                            {/* Futuristic circular progress indicator */}
                            <div className="relative w-14 h-14">
                              {/* Outer glow ring */}
                              <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-md animate-pulse"></div>

                              {/* Main progress ring */}
                              <svg
                                className="w-14 h-14 transform -rotate-90 relative z-10"
                                viewBox="0 0 56 56"
                              >
                                {/* Background track */}
                                <circle
                                  cx="28"
                                  cy="28"
                                  r="22"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  fill="none"
                                  className="text-zinc-700/50"
                                />

                                {/* Progress circle with gradient */}
                                <defs>
                                  <linearGradient
                                    id="progressGradient"
                                    x1="0%"
                                    y1="0%"
                                    x2="100%"
                                    y2="100%"
                                  >
                                    <stop offset="0%" stopColor="#3b82f6" />
                                    <stop offset="50%" stopColor="#06b6d4" />
                                    <stop offset="100%" stopColor="#8b5cf6" />
                                  </linearGradient>
                                  <filter id="glow">
                                    <feGaussianBlur
                                      stdDeviation="2"
                                      result="coloredBlur"
                                    />
                                    <feMerge>
                                      <feMergeNode in="coloredBlur" />
                                      <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                  </filter>
                                </defs>

                                <circle
                                  cx="28"
                                  cy="28"
                                  r="22"
                                  stroke="url(#progressGradient)"
                                  strokeWidth="4"
                                  fill="none"
                                  strokeDasharray={`${2 * Math.PI * 22}`}
                                  strokeDashoffset={`${2 * Math.PI * 22 * (1 - (uploadProgress?.progress ?? 0) / 100)}`}
                                  className="transition-all duration-700 ease-out drop-shadow-lg"
                                  strokeLinecap="round"
                                  filter="url(#glow)"
                                />

                                {/* Inner accent ring */}
                                <circle
                                  cx="28"
                                  cy="28"
                                  r="18"
                                  stroke="currentColor"
                                  strokeWidth="1"
                                  fill="none"
                                  className="text-blue-400/30"
                                />
                              </svg>

                              {/* Percentage text with futuristic styling */}
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xs font-bold text-white tracking-wider drop-shadow-lg">
                                  {Math.round(uploadProgress?.progress ?? 0)}%
                                </span>
                              </div>

                              {/* Rotating accent dots */}
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{
                                  duration: 3,
                                  repeat: Infinity,
                                  ease: "linear",
                                }}
                                className="absolute inset-0"
                              >
                                <div className="absolute top-0 left-1/2 w-1 h-1 bg-blue-400 rounded-full transform -translate-x-1/2 -translate-y-1"></div>
                                <div className="absolute bottom-0 left-1/2 w-1 h-1 bg-cyan-400 rounded-full transform -translate-x-1/2 translate-y-1"></div>
                              </motion.div>
                            </div>
                          </motion.div>
                        )}

                      {source.type === "file" &&
                        uploadProgress?.status === "completed" && (
                          <motion.div
                            key="completed"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="absolute inset-0 bg-green-500/20 backdrop-blur-sm flex items-center justify-center rounded-md"
                          >
                            <div className="flex flex-col items-center">
                              {/* Success checkmark */}
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{
                                  delay: 0.1,
                                  duration: 0.3,
                                  ease: "backOut",
                                }}
                                className="w-10 h-10 mb-2 rounded-full bg-green-500 flex items-center justify-center"
                              >
                                <svg
                                  className="w-5 h-5 text-white"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              </motion.div>
                              {/* Success text */}
                              <span className="text-[10px] text-green-200 font-medium">
                                Uploaded!
                              </span>
                            </div>
                          </motion.div>
                        )}
                    </AnimatePresence>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm text-zinc-200 font-medium truncate">
                      {source.type === "link"
                        ? source.preview?.title || "Loading..."
                        : source.type === "file"
                          ? source.file.name
                          : "—"}
                    </h4>

                    {/* Upload status */}
                    <AnimatePresence mode="wait">
                      {source.type === "file" && uploadProgress && (
                        <motion.p
                          key={uploadProgress.status}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs mt-1"
                        >
                          {uploadProgress.status === "uploading" && (
                            <span className="text-blue-400 font-medium">
                              Uploading...
                            </span>
                          )}
                          {uploadProgress.status === "completed" && (
                            <span className="text-green-400 font-medium">
                              ✓ Uploaded
                            </span>
                          )}
                          {uploadProgress.status === "error" && (
                            <span className="text-red-400 font-medium">
                              Upload failed
                            </span>
                          )}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <p className="text-xs text-zinc-500 mt-1">
                      {source.type === "file" && source.file
                        ? `${formatBytes(source.file.size)} • ${formatDuration(source.duration)}`
                        : source.type === "link"
                          ? "YouTube video"
                          : ""}
                    </p>
                  </div>
                </div>

                {/* Context Section */}
                <div className="space-y-4">
                  <ContextSelector
                    show={true}
                    value={context}
                    onChange={(newContext) => {
                      console.log(
                        "🔄 ContextSelector onChange called:",
                        newContext
                      );
                      setContext(newContext);
                    }}
                  />

                  {/* Usage Info */}
                  <div className="text-xs text-zinc-400 space-y-1 p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/40">
                    <div>
                      Monthly allowance:{" "}
                      <span className="text-zinc-200 font-medium">
                        {usageData?.remaining || "-"} /{" "}
                        {usageData?.minutesCap || "-"} minutes
                      </span>{" "}
                      remaining
                    </div>
                    <div className="text-blue-400">
                      This analysis will cost{" "}
                      <span className="text-blue-300 font-medium">
                        {getAnalysisCost()} minute{getAnalysisCost() !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Privacy Notice */}
                <div className="mt-6 text-xs text-zinc-500 space-y-1">
                  <p>
                    • We upload your video to generate analysis and suggestions
                  </p>
                  <p>• Your original file is never shared publicly</p>
                </div>
              </div>

              {/* Success Notification UI */}
              <AnimatePresence>
                {createdTaskId && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    className="absolute bottom-6 left-6 right-6 z-50"
                  >
                    <div className="bg-zinc-900/90 backdrop-blur-xl border border-blue-500/30 rounded-xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-1 ring-white/10 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center ring-1 ring-blue-500/30">
                          <Sparkles className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex flex-col">
                          <h4 className="text-sm font-bold text-white tracking-tight">
                            Analysis Initiated
                          </h4>
                          <p className="text-xs text-zinc-400">
                            Task ID: <span className="font-mono text-zinc-300">{createdTaskId.slice(0, 8)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20 uppercase tracking-tighter">
                          Queued
                        </span>
                        <div className="h-4 w-[1px] bg-zinc-800 mx-1"></div>
                        <motion.div 
                          animate={{ opacity: [1, 0.4, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="text-[10px] text-zinc-500 font-medium whitespace-nowrap"
                        >
                          Closing...
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Scroll Fade Indicator */}
            <AnimatePresence>
              {showScrollIndicator && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute bottom-16 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900/80 to-transparent pointer-events-none z-10"
                />
              )}
            </AnimatePresence>

            {/* Scroll Indicator */}
            <AnimatePresence>
              {showScrollIndicator && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-10"
                >
                  <div className="flex flex-col items-center gap-2 px-2 py-2 bg-zinc-800/90 backdrop-blur-sm rounded-full border border-zinc-700/50 shadow-lg">
                    <motion.div
                      animate={{ y: [0, 4, 0] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="text-zinc-400"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 14l-7 7m0 0l-7-7m7 7V3"
                        />
                      </svg>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Fixed Footer */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut", delay: 0.1 }}
              className="shrink-0 px-6 py-4 border-t border-zinc-800/60 bg-gradient-to-t from-zinc-900/90 to-zinc-900/70 backdrop-blur-sm rounded-b-2xl"
            >
              {error && (
                <div className="mb-4 p-3 rounded-lg border border-red-500/50 bg-red-500/10">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-xs space-y-1">
                  {(!context.niche || !context.audience || !context.tone) && (
                    <div className="text-red-400">
                      Please fill all required fields
                    </div>
                  )}
                  {hasInsufficientMinutes && (
                    <div className="text-orange-400 font-medium">
                      Not enough minutes left.
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {source.type === "file" &&
                  (uploadProgress?.status === "uploading" || isProcessing) ? (
                    <Button
                      variant="destructive"
                      onClick={handleCancel}
                      className="rounded-lg"
                    >
                      Cancel Upload
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={handleCancel}
                      className="text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/40 rounded-lg"
                    >
                      Cancel
                    </Button>
                  )}

                  <Button
                    onClick={handleStartAnalysis}
                    disabled={!canSubmit || isProcessing || isModalClosing}
                    className={`rounded-lg flex items-center gap-2 shadow-lg transition-all duration-200 ${
                      hasInsufficientMinutes
                        ? "bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:bg-orange-500/25 disabled:bg-orange-500/10 disabled:text-orange-400/60 disabled:border-orange-500/20"
                        : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
                    }`}
                    title={
                      hasInsufficientMinutes
                        ? `Need ${analysisCost} minutes but only ${remainingMinutes} remaining`
                        : !context.niche || !context.audience || !context.tone
                          ? "Please fill all required fields first"
                          : isModalClosing
                            ? "Modal is closing..."
                            : undefined
                    }
                  >
                    <span>
                      {hasInsufficientMinutes
                        ? "Usage Exhausted"
                        : source.type === "file"
                            ? uploadProgress?.status === "completed"
                              ? "Begin Analysis"
                              : isProcessing || isModalClosing
                                ? isProcessing ? "Uploading..." : "Closing..."
                                : "Start Analysis"
                            : isProcessing || isModalClosing
                              ? isProcessing ? "Starting..." : "Closing..."
                              : "Start Analysis"}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for closing with uploaded file */}
      <Dialog
        open={showCloseConfirmation}
        onOpenChange={setShowCloseConfirmation}
      >
        <DialogContent className="max-w-md p-0 rounded-xl bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/70 shadow-[0_14px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/5">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="p-6"
          >
            {/* Header with icon */}
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.3 }}
              className="flex items-center gap-3 mb-4"
            >
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800/50 ring-1 ring-inset ring-zinc-700/50">
                <Trash className="h-4 w-4 text-zinc-400" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-100 tracking-tight">
                Discard upload?
              </h3>
            </motion.div>

            {/* Content */}
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="mb-6"
            >
              <p className="text-sm text-zinc-400 leading-relaxed">
                Your file upload will be lost and you&apos;ll need to start
                over. Are you sure you want to continue?
              </p>
            </motion.div>

            {/* Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
              className="flex gap-3"
            >
              <Button
                variant="ghost"
                onClick={() => setShowCloseConfirmation(false)}
                className="flex-1 h-10 rounded-lg text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/40 transition-colors duration-200"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowCloseConfirmation(false);
                  onOpenChange(false);
                }}
                className="flex-1 h-10 rounded-lg bg-zinc-100 text-zinc-900 hover:bg-zinc-200 font-medium transition-colors duration-200"
              >
                Discard
              </Button>
            </motion.div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  );
};
