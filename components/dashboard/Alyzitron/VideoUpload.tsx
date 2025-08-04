"use client";

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Analysis } from '@/app/dashboard/alyzitron/types/analysis';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Upload, Link2, X, Loader2 } from 'lucide-react';
import { useVideoAnalysis } from '@/app/dashboard/alyzitron/hooks/useVideoAnalysis';
import { UploadProgress } from './UploadProgress';
import { formatFileSize } from '@/app/dashboard/alyzitron/utils/progress';
import { useToast } from '@/hooks/use-toast';
import { UsageLimitPopup } from './UsageLimitPopup';

interface VideoUploadProps {
  onSubmit: (analysisId: string, analysis: Analysis) => void;
  onComplete: (analysisId: string, analysis: Analysis) => void;
  activeAnalyses: Set<string>;
}


interface UploadState {
  file: File | null;
  url: string;
  duration: number;
}

interface YouTubePreview {
  title: string;
  thumbnail: string;
  videoId: string;
  loading: boolean;
  error: string | null;
}

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB
const MAX_DURATION_SECONDS = 55 * 60; // 55 minutes
const YOUTUBE_PREVIEW_DEBOUNCE_MS = 1000; // 1 second debounce

export function VideoUpload({ onSubmit, onComplete }: VideoUploadProps) {
  const [uploadState, setUploadState] = useState<UploadState>({ file: null, url: '', duration: 0 });
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);
  const [youtubePreview, setYoutubePreview] = useState<YouTubePreview | null>(null);
  const [limitPopup, setLimitPopup] = useState<{
    isOpen: boolean;
    limitType: 'total' | 'long_video' | 'general';
    currentUsage?: number;
    maxUsage?: number;
    savedFormData?: {
      uploadState: UploadState;
      youtubePreview: YouTubePreview | null;
    };
  }>({
    isOpen: false,
    limitType: 'general'
  });
  const { toast } = useToast();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const {
    uploadStates,
    analyzeFile,
    submitAnalysis,
    cancelUpload
  } = useVideoAnalysis();

  const currentUploadState = currentAnalysisId ? uploadStates.get(currentAnalysisId)?.uploadState : null;
  const currentAnalysisState = currentAnalysisId ? uploadStates.get(currentAnalysisId)?.analysisState || { status: 'idle' as const, progress: 0 } : null;

  const resetUploadState = useCallback(() => {
    setUploadState({ file: null, url: '', duration: 0 });
    setCurrentAnalysisId(null);
    setYoutubePreview(null);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  // Extract YouTube video ID from URL
  const extractYouTubeVideoId = useCallback((url: string): string | null => {
    const regexes = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const regex of regexes) {
      const match = url.match(regex);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }, []);

  // Fetch YouTube video preview
  const fetchYouTubePreview = useCallback(async (url: string) => {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      setYoutubePreview(null);
      return;
    }

    setYoutubePreview(prev => ({
      title: '',
      thumbnail: '',
      videoId,
      loading: true,
      error: null
    }));

    try {
      // Use YouTube oEmbed API for title, and construct thumbnail URL
      const oEmbedResponse = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      );

      if (!oEmbedResponse.ok) {
        throw new Error('Failed to fetch video info');
      }

      const oEmbedData = await oEmbedResponse.json();
      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      setYoutubePreview({
        title: oEmbedData.title || 'YouTube Video',
        thumbnail,
        videoId,
        loading: false,
        error: null
      });
    } catch (error) {
      console.error('Error fetching YouTube preview:', error);
      setYoutubePreview({
        title: '',
        thumbnail: '',
        videoId,
        loading: false,
        error: 'Failed to load video preview'
      });
    }
  }, [extractYouTubeVideoId]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast({
          title: "File Too Large",
          description: `File size cannot exceed ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`,
          variant: "destructive",
        });
        event.target.value = ''; // Clear the input
        return;
      }

      // Check video duration
      const video = document.createElement('video');
      video.preload = 'metadata';

      try {
        const duration = await new Promise<number>((resolve, reject) => {
          video.onloadedmetadata = () => {
            resolve(Math.round(video.duration));
          };
          video.onerror = (e) => {
            console.error("Error loading video metadata:", e);
            reject(new Error("Could not read video metadata."));
          };
          video.src = URL.createObjectURL(file);
        });

        URL.revokeObjectURL(video.src); // Clean up object URL

        if (duration > MAX_DURATION_SECONDS) {
          toast({
            title: "Video Too Long",
            description: `Video duration cannot exceed ${MAX_DURATION_SECONDS / 60} minutes.`,
            variant: "destructive",
          });
          event.target.value = ''; // Clear the input
          return;
        }

        setUploadState({ file, url: '', duration });

      } catch (error) {
        console.error("Error processing video file:", error);
        toast({
          title: "Error Processing File",
          description: error instanceof Error ? error.message : "An unknown error occurred while reading the video file.",
          variant: "destructive",
        });
        event.target.value = ''; // Clear the input
        if (video.src) URL.revokeObjectURL(video.src); // Ensure cleanup on error
      }
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (!uploadState.file && !uploadState.url) return;

    setIsSubmitting(true); // Prevent double tap only
    
    // Store form data for potential restoration on limit errors
    const savedUploadState = { ...uploadState };
    const savedYoutubePreview = youtubePreview;

    // Frontend URL format validation (don't reset form for validation errors)
    if (uploadState.url && !isValidYoutubeUrl(uploadState.url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid YouTube video URL.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    const submissionId = crypto.randomUUID();
    // Set current analysis id immediately so progress overlay can show as soon as upload starts
    setCurrentAnalysisId(submissionId);
    
    try {
      let result;
      if (uploadState.file) {
        result = await analyzeFile(
          uploadState.file,
          submissionId,
          { additional_details: JSON.stringify({}) }
        );
        if (!result) {
          setIsSubmitting(false);
          return;
        }
      } else if (uploadState.url) {
        result = await submitAnalysis(
          uploadState.url,
          submissionId,
          { additional_details: JSON.stringify({}) }
        );
      }

      if (result?.analysisId) {
        // Keep form state until completion so overlay continues to have context;
        // only swap to the definitive analysis id returned by backend.
        setCurrentAnalysisId(result.analysisId);
        onSubmit(result.analysisId, {
          analysisId: result.analysisId,
          title: uploadState.file?.name || youtubePreview?.title || uploadState.url,
          videoUrl: uploadState.url || uploadState.file?.name || '',
          status: 'queued',
          progress: 0,
          estimatedTime: result.estimatedTime || 60,
          queuePosition: 1,
        });
      }
    } catch (err) {
      let title = "Submission Failed";
      let description = "An unexpected error occurred. Please try again.";
      let shouldResetForm = false; // Control whether to reset form on error
      let shouldRestoreForm = false; // Control whether to restore form data

      if (err instanceof Error) {
        // Check for limit exceeded errors
        if (err.message.includes('limit exceeded') || err.message.includes('LIMIT_EXCEEDED')) {
          let limitType: 'total' | 'long_video' | 'general' = 'general';
          let currentUsage: number | undefined;
          let maxUsage: number | undefined;
          
          if (err.message.includes('Total analyses limit exceeded')) {
            limitType = 'total';
          } else if (err.message.includes('Long video limit exceeded')) {
            limitType = 'long_video';
          }
          
          setLimitPopup({
            isOpen: true,
            limitType,
            currentUsage,
            maxUsage,
            savedFormData: {
              uploadState: savedUploadState,
              youtubePreview: savedYoutubePreview
            }
          });
          
          setIsSubmitting(false);
          return; // Don't show toast, popup will handle it
        }
        // Other specific backend errors
        else if (err.message.includes('INVALID_YOUTUBE_URL')) {
          description = "The provided YouTube URL is invalid or not accessible.";
          shouldResetForm = true;
        } else if (err.message.includes('YOUTUBE_VIDEO_TOO_LONG')) {
          description = `YouTube video duration cannot exceed ${MAX_DURATION_SECONDS / 60} minutes.`;
          shouldResetForm = true;
        } else if (err.message.includes('YOUTUBE_VIDEO_PRIVATE')) {
          description = "The YouTube video is private or unlisted.";
          shouldResetForm = true;
        } else if (err.message.includes('Failed to create analysis')) {
          description = "Alyzitron Server is offline. Please try again later.";
          shouldRestoreForm = true; // Keep form for server errors
        } else if (err.message === 'Upload cancelled') {
          // Ignore cancellation errors for toast
          setIsSubmitting(false);
          return;
        } else if (err.message.includes('DATABASE_ERROR') || err.message.includes('Database Error')) {
          description = "Alyzitron Server is currently experiencing technical difficulties. Please try again later.";
          shouldRestoreForm = true;
        } else {
          // Generic error
          console.error('Submission failed:', err);
          shouldRestoreForm = true; // Keep form for unknown errors
        }
      } else {
        // Non-Error object thrown
        console.error('Submission failed with non-Error object:', err);
        description = "An unknown error occurred. Please try again.";
        shouldRestoreForm = true;
      }

      // Restore form data if it's a limit error or server issue
      if (shouldRestoreForm) {
        setUploadState(savedUploadState);
        setYoutubePreview(savedYoutubePreview);
      } else if (shouldResetForm) {
        resetUploadState();
      }

      toast({
        title: title,
        description: description,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [uploadState, analyzeFile, submitAnalysis, onSubmit, toast, isSubmitting, resetUploadState, youtubePreview]);

  const clearFile = () => {
    setUploadState(prev => ({ ...prev, file: null }));
  };

  const handleUrlChange = (url: string) => {
    // Basic check: Clear file if URL is entered
    setUploadState({ file: null, url, duration: 0 });
    
    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Clear preview if URL is empty
    if (!url.trim()) {
      setYoutubePreview(null);
      return;
    }
    
    // Debounce YouTube preview fetch
    debounceRef.current = setTimeout(() => {
      if (isValidYoutubeUrl(url)) {
        fetchYouTubePreview(url);
      } else {
        setYoutubePreview(null);
      }
    }, YOUTUBE_PREVIEW_DEBOUNCE_MS);
  };

  const isValidYoutubeUrl = (url: string): boolean => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return youtubeRegex.test(url);
  };

  const handleCancel = async () => {
    if (currentAnalysisId) {
      cancelUpload(currentAnalysisId);
      resetUploadState();
    }
  };

  // Handle popup close with form restoration
  const handlePopupClose = useCallback(() => {
    const savedData = limitPopup.savedFormData;
    if (savedData) {
      setUploadState(savedData.uploadState);
      setYoutubePreview(savedData.youtubePreview);
    }
    setLimitPopup(prev => ({ ...prev, isOpen: false, savedFormData: undefined }));
  }, [limitPopup.savedFormData]);

  // Handle completed analysis
  useEffect(() => {
    if (currentAnalysisId && currentAnalysisState?.status === 'completed') {
      onComplete(currentAnalysisId, {
        analysisId: currentAnalysisId,
        title: uploadState.file?.name || youtubePreview?.title || uploadState.url,
        videoUrl: uploadState.url || uploadState.file?.name || '',
        status: 'completed',
        progress: 1,
      });
      resetUploadState();
    }
  }, [currentAnalysisId, currentAnalysisState?.status, onComplete, resetUploadState, uploadState]);

  return (
    <Card className="relative bg-black/40 border-zinc-800 backdrop-blur-xl">
      <CardContent className="relative p-4 sm:p-6">
        <div className="mb-4 sm:mb-6">
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-black/20 h-10 sm:h-11">
              <TabsTrigger
                value="upload"
                className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900 text-xs sm:text-sm"
              >
                <Upload className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Upload Video</span>
                <span className="sm:hidden">Upload</span>
              </TabsTrigger>
              <TabsTrigger
                value="link"
                className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900 text-xs sm:text-sm"
              >
                <Link2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Video Link</span>
                <span className="sm:hidden">Link</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-4 sm:mt-6">
              <div className={`
                relative border border-dashed rounded-lg p-4 sm:p-6 lg:p-10 text-center
                ${uploadState.file
                  ? 'border-zinc-700 bg-black/20'
                  : 'border-zinc-800 hover:border-zinc-700 transition-colors duration-300 group'
                }
              `}>
                {uploadState.file ? (
                  <div className="flex items-center justify-between flex-wrap sm:flex-nowrap gap-2">
                    <div className="flex items-center min-w-0 flex-1">
                      <Upload className="h-6 w-6 sm:h-8 sm:w-8 text-zinc-500 mr-2 sm:mr-3 flex-shrink-0" />
                      <div className="text-left min-w-0 flex-1">
                        <p className="text-zinc-300 font-medium text-sm sm:text-base truncate">{uploadState.file.name}</p>
                        <p className="text-zinc-500 text-xs sm:text-sm">
                          {formatFileSize(uploadState.file.size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={clearFile}
                      className="text-zinc-500 hover:text-zinc-300 flex-shrink-0"
                    >
                      <X className="h-4 w-4 sm:h-5 sm:w-5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      type="file"
                      className="hidden"
                      id="video-upload"
                      accept="video/*"
                      onChange={handleFileChange}
                    />
                    <label
                      htmlFor="video-upload"
                      className="flex flex-col items-center cursor-pointer"
                    >
                      <Upload className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 mb-3 sm:mb-4 text-zinc-700 group-hover:text-zinc-500 transition-colors duration-300" />
                      <p className="text-zinc-500 group-hover:text-zinc-400 transition-colors duration-300 max-w-md mx-auto text-sm sm:text-base px-2">
                        <span className="hidden sm:inline">Upload your video file or drag and drop here</span>
                        <span className="sm:hidden">Upload video file</span>
                      </p>
                    </label>
                  </>
                )}

                {/* Progress Overlay */}
                <AnimatePresence>
                  {currentUploadState && currentAnalysisId && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg"
                    >
                      <UploadProgress
                        uploadState={currentUploadState}
                        onCancel={handleCancel}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </TabsContent>

            <TabsContent value="link" className="mt-6">
              <div className="space-y-4">
                <Input
                  type="url"
                  placeholder="Enter YouTube URL"
                  className="bg-black/20 border-zinc-800 focus:border-zinc-700 h-12"
                  value={uploadState.url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                />
                
                {/* YouTube Preview */}
                {youtubePreview && (
                  <div className="border border-zinc-800 rounded-lg bg-black/20 p-4">
                    {youtubePreview.loading && (
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                        <span className="text-sm text-zinc-400">Loading video preview...</span>
                      </div>
                    )}
                    
                    {youtubePreview.error && (
                      <div className="text-sm text-red-400">
                        {youtubePreview.error}
                      </div>
                    )}
                    
                    {!youtubePreview.loading && !youtubePreview.error && youtubePreview.title && (
                      <div className="flex gap-4">
                        <div className="relative w-32 h-18 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
                          <img
                            src={youtubePreview.thumbnail}
                            alt={youtubePreview.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to lower quality thumbnail
                              const target = e.target as HTMLImageElement;
                              if (!target.src.includes('hqdefault')) {
                                target.src = `https://img.youtube.com/vi/${youtubePreview.videoId}/hqdefault.jpg`;
                              }
                            }}
                          />
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center">
                              <div className="w-0 h-0 border-l-[6px] border-l-black border-y-[4px] border-y-transparent ml-0.5" />
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-zinc-200 line-clamp-2 leading-relaxed">
                            {youtubePreview.title}
                          </h3>
                          <p className="text-xs text-zinc-500 mt-1">
                            YouTube Video
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Video Type Selection */}
          {/* Submit Button */}
          <div className="mt-8">
            <Button
              size="lg"
              className={`
                w-full h-14 text-base font-medium tracking-wide
                ${!(uploadState.file || uploadState.url)
                  ? 'bg-zinc-800 text-zinc-500'
                  : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
                }
                transition-all duration-300
              `}
              onClick={handleSubmit}
              disabled={!(uploadState.file || uploadState.url) || isSubmitting || !!(currentUploadState && currentAnalysisId)}
            >
              {isSubmitting || (currentUploadState && currentAnalysisId) ? (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>
                    {currentAnalysisState?.status === 'uploading' ? 'Uploading...' :
                     currentUploadState && currentAnalysisId ? 'Analyzing...' :
                     'Initializing...'}
                  </span>
                </div>
              ) : (
                "Begin Analysis"
              )}
            </Button>
          </div>

          {/* Error Display */}
          {currentAnalysisState?.error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-500 text-sm">
                {currentAnalysisState.error.message}
              </p>
              {currentAnalysisState.error.action && (
                <p className="text-red-400 text-sm mt-1">
                  {currentAnalysisState.error.action}
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>

      {/* Usage Limit Popup */}
      <UsageLimitPopup
        isOpen={limitPopup.isOpen}
        onClose={handlePopupClose}
        limitType={limitPopup.limitType}
        currentUsage={limitPopup.currentUsage}
        maxUsage={limitPopup.maxUsage}
      />
    </Card>
  );
}
