"use client";

import React, { useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Analysis } from '@/app/dashboard/alyzitron/hooks/useAnalysisState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Upload, Link2, X } from 'lucide-react';
import { useVideoAnalysis } from '@/app/dashboard/alyzitron/hooks/useVideoAnalysis';
import { UploadProgress } from './UploadProgress';
import { formatFileSize } from '@/app/dashboard/alyzitron/utils/progress';
import { useToast } from '@/hooks/use-toast';

interface VideoUploadProps {
  onSubmit: (analysisId: string, analysis: Analysis) => void;
  onComplete: (analysisId: string, analysis: Analysis) => void;
  activeAnalyses: Set<string>;
}

import { VideoType } from "@/app/api/services/alyzitron/types";

const VIDEO_TYPES: { label: string; value: VideoType }[] = [
  { label: "Short Form", value: "SHORT_FORM" },
  { label: "Educational", value: "EDUCATIONAL" },
  { label: "Entertainment", value: "ENTERTAINMENT" },
  { label: "Music", value: "MUSIC" },
  { label: "Product Review", value: "PRODUCT_REVIEW" },
  { label: "Vlog", value: "VLOG" },
];

interface UploadState {
  file: File | null;
  url: string;
  duration: number;
}

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB
const MAX_DURATION_SECONDS = 55 * 60; // 55 minutes

export function VideoUpload({ onSubmit, onComplete }: VideoUploadProps) {
  const [uploadState, setUploadState] = useState<UploadState>({ file: null, url: '', duration: 0 });
  const [selectedType, setSelectedType] = useState<VideoType | ''>('');
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);
  const { toast } = useToast();

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
    setSelectedType('');
    setCurrentAnalysisId(null);
  }, []);

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

  const handleSubmit = useCallback(async () => {
    if (!selectedType || (!uploadState.file && !uploadState.url)) return;

    // Frontend URL format validation
    if (uploadState.url && !isValidYoutubeUrl(uploadState.url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid YouTube video URL.",
        variant: "destructive",
      });
      return;
    }

    const submissionId = crypto.randomUUID();
    
    try {
      let result;
      if (uploadState.file) {
        result = await analyzeFile(
          uploadState.file,
          selectedType,
          submissionId,
          {
            additional_details: JSON.stringify({
              videoDuration: uploadState.duration
            })
          }
        );
        if (!result) return;
      } else if (uploadState.url) {
        result = await submitAnalysis(uploadState.url, selectedType, submissionId);
      }

      if (result?.analysisId) {
        setCurrentAnalysisId(result.analysisId);
        onSubmit(result.analysisId, {
          analysisId: result.analysisId,
          taskId: result.taskId,
          type: selectedType,
          title: uploadState.file?.name || uploadState.url,
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

      if (err instanceof Error) {
        // Specific backend errors (assuming backend returns these messages)
        if (err.message.includes('INVALID_YOUTUBE_URL')) {
          description = "The provided YouTube URL is invalid or not accessible.";
        } else if (err.message.includes('YOUTUBE_VIDEO_TOO_LONG')) {
          description = `YouTube video duration cannot exceed ${MAX_DURATION_SECONDS / 60} minutes.`;
        } else if (err.message.includes('YOUTUBE_VIDEO_PRIVATE')) {
          description = "The YouTube video is private or unlisted.";
        } else if (err.message.includes('Failed to create analysis')) {
          // Existing server offline check
          description = "Alyzitron Server is offline. Please try again later.";
        } else if (err.message === 'Upload cancelled') {
          // Ignore cancellation errors for toast
          return;
        } else {
          // Generic error
          console.error('Submission failed:', err);
        }
      } else {
        // Non-Error object thrown
        console.error('Submission failed with non-Error object:', err);
        description = "An unknown error occurred. Please try again.";
      }

      toast({
        title: title,
        description: description,
        variant: "destructive",
      });
      // Optionally reset state if submission fails definitively
      // resetUploadState();
    }
  }, [uploadState, selectedType, analyzeFile, submitAnalysis, onSubmit, toast]); // Added toast dependency

  const clearFile = () => {
    setUploadState(prev => ({ ...prev, file: null }));
  };

  const handleUrlChange = (url: string) => {
    // Basic check: Clear file if URL is entered
    setUploadState({ file: null, url, duration: 0 });
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

  // Handle completed analysis
  useEffect(() => {
    if (currentAnalysisId && currentAnalysisState?.status === 'completed') {
      onComplete(currentAnalysisId, {
        analysisId: currentAnalysisId,
        taskId: '', // Already stored in ClientWrapper
        type: selectedType,
        title: uploadState.file?.name || uploadState.url,
        videoUrl: uploadState.url || uploadState.file?.name || '',
        status: 'completed',
        progress: 1,
      });
      resetUploadState();
    }
  }, [currentAnalysisId, currentAnalysisState?.status, onComplete, resetUploadState, selectedType, uploadState]);

  return (
    <Card className="relative bg-black/40 border-zinc-800 backdrop-blur-xl">
      <CardContent className="relative pt-6">
        <div className="mb-6">
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-black/20">
              <TabsTrigger
                value="upload"
                className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Video
              </TabsTrigger>
              <TabsTrigger
                value="link"
                className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900"
              >
                <Link2 className="mr-2 h-4 w-4" />
                Video Link
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-6">
              <div className={`
                relative border border-dashed rounded-lg p-10 text-center
                ${uploadState.file
                  ? 'border-zinc-700 bg-black/20'
                  : 'border-zinc-800 hover:border-zinc-700 transition-colors duration-300 group'
                }
              `}>
                {uploadState.file ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Upload className="h-8 w-8 text-zinc-500 mr-3" />
                      <div className="text-left">
                        <p className="text-zinc-300 font-medium">{uploadState.file.name}</p>
                        <p className="text-zinc-500 text-sm">
                          {formatFileSize(uploadState.file.size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={clearFile}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="h-5 w-5" />
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
                      <Upload className="h-12 w-12 mb-4 text-zinc-700 group-hover:text-zinc-500 transition-colors duration-300" />
                      <p className="text-zinc-500 group-hover:text-zinc-400 transition-colors duration-300 max-w-md mx-auto">
                        Upload your video file or drag and drop here
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
              <Input
                type="url"
                placeholder="Enter YouTube URL"
                className="bg-black/20 border-zinc-800 focus:border-zinc-700 h-12"
                value={uploadState.url}
                onChange={(e) => handleUrlChange(e.target.value)}
              />
            </TabsContent>
          </Tabs>

          {/* Video Type Selection */}
          <div className="mt-8">
            <label className="block text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">
              Content Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {VIDEO_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  className={`
                    px-4 py-3 rounded-lg text-sm font-medium tracking-wide transition-all duration-300
                    ${selectedType === type.value
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'bg-black/20 text-zinc-400 hover:bg-black/40 hover:text-zinc-300'
                    }
                  `}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div className="mt-8">
            <Button
              size="lg"
              className={`
                w-full h-14 text-base font-medium tracking-wide
                ${!(uploadState.file || uploadState.url) || !selectedType
                  ? 'bg-zinc-800 text-zinc-500'
                  : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
                }
                transition-all duration-300
              `}
              onClick={handleSubmit}
              disabled={!(uploadState.file || uploadState.url) || !selectedType}
            >
              {currentUploadState && currentAnalysisId ? (
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
                    {currentAnalysisState?.status === 'uploading' ? 'Uploading...' : 'Analyzing...'}
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
    </Card>
  );
}
