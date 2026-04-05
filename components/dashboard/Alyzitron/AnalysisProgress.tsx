"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { CircleDot, PlayCircle, ChevronRight, RefreshCw, AlertCircle, Instagram, Twitter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QueryClient } from '@tanstack/react-query';
import Image from 'next/image';

import type { AnalysisStatus, AnalysisResults } from '@/app/api/services/alyzitron/types'

interface AnalysisError {
  code?: string;
  message: string;
  action?: string;
  timestamp?: Date;
}

interface AnalysisProgressProps {
  analysisId: string;
  title?: string;
  status?: AnalysisStatus;
  queuePosition?: number;
  unread?: boolean;
  error?: AnalysisError;
  expectedDurationSeconds?: number;
  processingStartTime?: number | Date; // timestamp in ms or Date object
  queryClient?: QueryClient;
  currentPage?: number;
  itemsPerPage?: number;
  videoUrl?: string;
  metadata?: {
    videoDuration?: number;
    videoSize?: number;
  };
  results?: AnalysisResults | null;
  createdByName?: string;
  onClick?: () => void;
}

export function AnalysisProgress({
  analysisId,
  title,
  status,
  queuePosition,
  unread = false,
  error,
  expectedDurationSeconds = 60,
  processingStartTime,
  queryClient,
  currentPage,
  itemsPerPage,
  videoUrl,
  metadata,
  createdByName,
  results,
  onClick
}: AnalysisProgressProps) {
  const router = useRouter();
  
  // Extract YouTube video ID from URL
  const extractYouTubeVideoId = (url: string): string | null => {
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
  };

  // Check if videoUrl is a YouTube URL and get video ID
  const isYouTubeUrl = videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'));
  const youtubeVideoId = isYouTubeUrl ? extractYouTubeVideoId(videoUrl) : null;
  const isInstagramUrl = videoUrl && videoUrl.includes('instagram.com');
  const isTwitterUrl = videoUrl && (videoUrl.includes('twitter.com') || videoUrl.includes('x.com'));

  // Helper function to calculate remaining time
  const calculateRemainingTime = (startTime: number | Date | undefined | string, duration: number): number => {
    if (startTime instanceof Date) {
      startTime = startTime.getTime();
    } else if (typeof startTime === 'string') {
      startTime = Date.parse(startTime);
    }

    if (typeof startTime !== 'number' || isNaN(startTime) || typeof duration !== 'number') {
      // Return a default/fallback or indicate an error state if needed
      // For now, returning duration might be a safe fallback, or 0 if processing hasn't started
      return duration > 0 ? duration : 0;
    }

    const endTime = startTime + duration * 1000;
    const now = Date.now();
    const remaining = Math.max(0, Math.round((endTime - now) / 1000));
    return remaining;
  };

  const [timeLeft, setTimeLeft] = useState<number>(() =>
    calculateRemainingTime(processingStartTime, expectedDurationSeconds)
  );

  useEffect(() => {
    // Update initial time when props change, especially after status becomes 'processing'
    setTimeLeft(calculateRemainingTime(processingStartTime, expectedDurationSeconds));

    if (status !== 'processing') {
      return;
    }

    // Set up the interval only when processing
    const interval = setInterval(() => {
      setTimeLeft( () => {
        const newRemaining = calculateRemainingTime(processingStartTime, expectedDurationSeconds);
        // Stop interval if time runs out (or goes slightly negative due to rounding/timing)
        if (newRemaining <= 0) {
          clearInterval(interval);
          // Optionally trigger a refresh or status update here if needed
          return 0; // Ensure it doesn't display negative
        }
        return newRemaining;
      });
    }, 1000);

    // Cleanup function
    return () => clearInterval(interval);

  }, [processingStartTime, expectedDurationSeconds, status]);

  const isActive = status === 'processing' || status === 'queued' || status === 'listed';
  const isCompleted = status === 'completed';

  // Calculate progress percentage
  const progressPercentage = status === 'processing' 
    ? Math.min(100, Math.round(((expectedDurationSeconds - timeLeft) / expectedDurationSeconds) * 100))
    : status === 'queued' ? 10 : status === 'listed' ? 5 : 0;

  // Format bytes to readable size
  const formatBytes = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Format seconds to duration
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };


  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    // Allow both completed and failed analyses to be clickable
    if ((isCompleted || status === 'failed') && queryClient && currentPage && itemsPerPage) {
      // Construct the query key for the current page
      const queryKey = ['analyses', { scope: 'finished', page: currentPage, limit: itemsPerPage }];

      // Optimistically update the cache
      queryClient.setQueryData<PaginatedResponse>(queryKey, (oldData: PaginatedResponse | undefined) => {
        if (!oldData) return undefined;

        // Find the analysis and update its 'unread' status
        const newData = oldData.data.map((analysis: any) =>
          analysis._id === analysisId ? { ...analysis, unread: false } : analysis
        );

        return {
          ...oldData,
          data: newData,
        };
      });

      // Navigate to the report page
      router.push(`/dashboard/alyzitron/report/${analysisId}`);
    } else if (isCompleted || status === 'failed') {
      // Fallback if props are missing (shouldn't happen ideally)
      router.push(`/dashboard/alyzitron/report/${analysisId}`);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
    >
      <Card
        className={`
          relative bg-black/40 border-zinc-800 backdrop-blur-xl group overflow-hidden
          ${isActive ? 'ring-1 ring-white/10' : ''}
          ${(isCompleted || status === 'failed') ? 'cursor-pointer hover:bg-zinc-900/40 transition-all duration-300' : ''}
        `}
        onClick={handleClick}
      >
        {/* Progress Background for Active Tasks */}
        {isActive && (
          <motion.div 
            className="absolute inset-0 bg-white/[0.02] origin-left z-0"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: progressPercentage / 100 }}
            transition={{ duration: 0.5 }}
          />
        )}
        <CardContent className="flex items-center p-4">
          <div className="h-12 w-12 rounded-lg bg-zinc-900/80 flex items-center justify-center mr-4 overflow-hidden border border-zinc-800 group-hover:border-zinc-700 transition-colors relative z-10">
            {youtubeVideoId ? (
              <div className="relative h-12 w-12">
                <Image
                  src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`}
                  alt={title || 'YouTube Video'}
                  fill
                  sizes="48px"
                  className="object-cover rounded-lg opacity-80 group-hover:opacity-100 transition-opacity"
                  priority={false}
                />
              </div>
            ) : isInstagramUrl ? (
                <Instagram className="h-6 w-6 text-pink-500 group-hover:text-pink-400 transition-colors" />
            ) : isTwitterUrl ? (
                <Twitter className="h-6 w-6 text-sky-500 group-hover:text-sky-400 transition-colors" />
            ) : (
               <PlayCircle className="h-6 w-6 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            )}
          </div>

          <div className="flex-1 min-w-0 relative z-10">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors" title={title || 'Analysis'}>
                {title || 'Analysis'}
              </h3>
            </div>
            {results?.overview && (
              <p className="text-xs text-zinc-400 mt-1 line-clamp-1 group-hover:text-zinc-300 transition-colors" title={results.overview}>
                {results.overview}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              {metadata?.videoDuration && (
                <p className="text-[10px] text-zinc-500">{formatDuration(metadata.videoDuration)}</p>
              )}
              {createdByName && (
                <div className="flex items-center gap-1 ml-1 pl-2 border-l border-zinc-800">
                  <span className="text-[9px] text-zinc-600 font-medium uppercase tracking-tighter">BY</span>
                  <span className="text-[10px] text-zinc-400 font-bold truncate max-w-[80px]">
                    {createdByName}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="ml-4 flex items-center gap-4">
            <div className="text-right min-h-[40px] flex flex-col items-end justify-center">
              <AnimatePresence mode="wait" initial={false}>
                {status === 'listed' && (
                  <motion.div
                    key="listed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-xs font-medium text-amber-500/80"
                  >
                    <CircleDot className="h-3 w-3 animate-pulse" />
                    <span>Initializing...</span>
                  </motion.div>
                )}
                {status === 'queued' && (
                  <motion.div
                    key="queued"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-end"
                  >
                    <span className="text-xs font-medium text-purple-400 flex items-center gap-1.5">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      In Queue {queuePosition != null ? `#${queuePosition}` : ''}
                    </span>
                  </motion.div>
                )}
                {status === 'processing' && (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-end gap-1"
                  >
                    <span className="text-xs font-medium text-blue-400 flex items-center gap-1.5">
                      <CircleDot className="h-3 w-3 animate-pulse" />
                      {timeLeft <= 5 ? 'Wrapping up...' : 'Processing...'}
                    </span>
                    <div className="w-24 h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-blue-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                  </motion.div>
                )}
                {status === 'completed' && (
                  <motion.div
                    key="completed"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-3"
                  >
                    <div className={`h-8 w-8 rounded-full ${unread ? 'bg-indigo-500 text-white' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'} flex items-center justify-center shadow-lg shadow-emerald-500/10`}>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        className="h-4 w-4"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  </motion.div>
                )}
                {status === 'failed' && (
                  <motion.div
                    key="failed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3"
                  >
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-bold text-rose-500 uppercase tracking-wider">Failed</span>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center">
                       <AlertCircle className="h-4 w-4" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </CardContent>

        {status === 'failed' && error?.message && (
          <div className="px-4 pb-4 -mt-2 relative z-10">
            <p className="text-[11px] text-rose-400/80 leading-relaxed bg-rose-500/5 border border-rose-500/10 rounded p-2 italic flex items-center gap-2">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {error.message}
            </p>
          </div>
        )}
      </Card>
    </motion.div>
  );
}