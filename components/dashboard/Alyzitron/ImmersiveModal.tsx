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

// Mock usage data - in a real app, this would come from an API
const mockUsage = { minutesUsed: 48, minutesCap: 60 };

type Source =
  | { type: "none" }
  | { type: "file"; file: File; duration: number }
  | {
      type: "link";
      url: string;
      preview?: { title: string; thumbnail: string; videoId: string; duration: number };
    };

interface ImmersiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: Source;
  onSubmit: (analysisId: string, analysis: Analysis) => void;
  onComplete: (analysisId: string, analysis: Analysis) => void;
  uploadStates: Map<string, any>;
}

export const ImmersiveModal: React.FC<ImmersiveModalProps> = ({
  open,
  onOpenChange,
  source,
  onSubmit,
  onComplete,
  uploadStates,
}) => {
  // Modal manages its own state
  const [context, setContext] = useState<ContextValues>({
    niche: "",
    audience: "",
    tone: "",
  });
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
  const [uploadCompleted, setUploadCompleted] = useState(false);
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);

  const { toast } = useToast();
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
  const isYouTubeUrl = useCallback((url: string): boolean =>
    /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/.test(url), []);

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
        return { title: "Unknown Video", thumbnail: "", videoId: "", duration: 0 };
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
          console.warn("⚠️ No gcsPath in upload result");
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
        if (source.type === "file") {
          // File should already be uploaded, start analysis
          result = await startAnalysis(
            "file://" + submissionId,
            submissionId,
            JSON.parse(JSON.stringify(context))
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
          result = await startAnalysis(
            source.url,
            submissionId,
            JSON.parse(JSON.stringify(context))
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
          setAnalysisStarted(true);
          onSubmit(result.analysisId, analysisData);
        }
      } catch (err) {
        let description = "Analysis failed to start. Please try again.";

        if (err instanceof Error) {
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
          }
        }

        setError(description);
        toast({
          title: "Analysis Failed",
          description,
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [analysisId, isYouTubeUrl, startAnalysis, toast]
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
  }, [analysisId, uploadStates, onComplete, fetchPreview, handleAnalysisComplete]);

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
        setGcsPath(null);
        setAnalysisId(null);
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
      setAnalysisStarted(false);
      setUploadCompleted(false);
      setError(null);
      setUploadProgress(null);
    }
  }, [open, gcsPath, source.type, uploadCompleted, analysisStarted, handleAnalysisComplete, deleteUploadedFile]);

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
    if (!source.type || !context.niche || !context.audience || !context.tone) {
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

  const canSubmit =
    source.type !== "none" && context.niche && context.audience && context.tone;

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

            {/* Scroll area */}
            <div className="px-6 pb-6 pt-5 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
                className="w-full"
              >
                <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 ring-1 ring-white/5 p-4 md:p-5 flex flex-col gap-4">
                  {/* Preview / Thumbnail */}
                  <div className="flex items-start gap-3 relative">
                    <div className="relative w-[120px] h-[67.5px] flex-shrink-0 rounded-md overflow-hidden border border-zinc-800/60 bg-zinc-900/50">
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
                      <p className="text-[13px] text-zinc-200 leading-snug truncate">
                        {source.type === "link"
                          ? source.preview?.title || "Loading..."
                          : source.type === "file"
                            ? source.file.name
                            : "—"}
                      </p>

                      {/* Upload status text below title */}
                      <AnimatePresence mode="wait">
                        {source.type === "file" && uploadProgress && (
                          <motion.p
                            key={uploadProgress.status}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
                            className="text-[11px] mt-1"
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

                      <p className="text-[12px] text-zinc-500 mt-1">
                        {source.type === "file" && source.file
                          ? `${formatBytes(source.file.size)} • ${formatDuration(source.duration)}`
                          : source.type === "link"
                            ? "Link preview"
                            : ""}
                      </p>
                    </div>
                  </div>

                  {/* Context and Controls */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="mt-4">
                      <div className="rounded-md border border-zinc-800/60 bg-zinc-900/40 p-3">
                        <p className="text-xs uppercase tracking-wider text-zinc-400/80">
                          Context
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-1">
                          Tune the analysis for audience, tone and niche.
                        </p>

                        <div className="mt-3">
                          <ContextSelector
                            show={true}
                            value={context}
                            onChange={setContext}
                          />
                        </div>

{/* Usage meter (subtle near Begin Analysis) */}
<div className="mt-4 text-xs text-zinc-400 space-y-1">
  <div>
    Monthly analysis allowance:{" "}
    <span className="text-zinc-200 font-medium">
      {mockUsage.minutesUsed} / {mockUsage.minutesCap} minutes
    </span>{" "}
    remaining.
  </div>
  <div className="text-blue-400">
    This analysis will cost{" "}
    <span className="text-blue-300 font-medium">
      {source.type === "file" && source.duration === -1
        ? "-"
        : source.type === "file" && source.duration > 0
          ? Math.ceil(source.duration / 60)
          : source.type === "link" && source.preview?.duration === -1
            ? "-"
            : source.type === "link" && source.preview?.duration && source.preview.duration > 0
              ? Math.ceil(source.preview.duration / 60)
              : "0"
      }{" "}
      minute{source.type === "file" && source.duration === -1 ? "" :
             source.type === "file" && source.duration > 0 && Math.ceil(source.duration / 60) !== 1 ? "s" :
             source.type === "link" && source.preview?.duration === -1 ? "" :
             source.type === "link" && source.preview?.duration && source.preview.duration > 0 && Math.ceil(source.preview.duration / 60) !== 1 ? "s" : ""}
    </span>{" "}
    of your allowance.
  </div>
</div>
                        <div className="mt-4 border-t border-zinc-800/60 pt-4 flex items-center justify-between">
                          <p className="text-[11px] text-zinc-500">
                            This helps the AI better understand your content&apos;s
                            context.
                            {(!context.niche ||
                              !context.audience ||
                              !context.tone) && (
                              <>
                                <br />
                                <span className="text-red-400 ml-1">
                                  • Please fill all fields
                                </span>
                              </>
                            )}
                          </p>

                          <div className="flex items-center gap-3">
                            {source.type === "file" &&
                            (uploadProgress?.status === "uploading" ||
                              isProcessing) ? (
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
                              disabled={!canSubmit || isProcessing}
                              className="rounded-lg bg-zinc-100 text-zinc-900 hover:bg-zinc-200 shadow-sm ring-1 ring-inset ring-white/5 disabled:opacity-60 flex items-center gap-2 px-4 py-2"
                            >
                              <span>
                                {source.type === "file"
                                  ? uploadProgress?.status === "completed"
                                    ? "Begin Analysis"
                                    : isProcessing
                                      ? "Uploading..."
                                      : "Start Analysis"
                                  : isProcessing
                                    ? "Starting..."
                                    : "Start Analysis"}
                              </span>
                              <ArrowRight className="h-4 w-4 text-zinc-700" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {error && (
                      <div className="mt-4 p-3 rounded-md border border-red-500/50 bg-red-500/10">
                        <p className="text-[12px] text-red-400">{error}</p>
                      </div>
                    )}

                    <div className="mt-4 text-[12px] text-zinc-500 pb-4">
                      <ul className="list-disc pl-5 space-y-1">
                        <li>
                          We upload parts of your video to generate a concise
                          analysis and creative suggestions.
                        </li>
                        <li>Your original file is never shared publicly.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
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
                Your file upload will be lost and you&apos;ll need to start over. Are
                you sure you want to continue?
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
