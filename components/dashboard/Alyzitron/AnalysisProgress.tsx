"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { CircleDot, PlayCircle, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QueryClient } from '@tanstack/react-query';
import Image from 'next/image';

import type { AnalysisStatus } from '@/app/api/services/alyzitron/types'
import type { PaginatedResponse } from './AnalysisList';

interface AnalysisError {
  code: string;
  message: string;
  action?: string;
}

interface AnalysisProgressProps {
  analysisId: string;
  title?: string;
  status?: AnalysisStatus;
  queuePosition?: number;
  unread?: boolean;
  error?: AnalysisError;
  expectedDurationSeconds?: number;
  processingStartTime?: number; // timestamp in ms
  queryClient?: QueryClient;
  currentPage?: number;
  itemsPerPage?: number;
  videoUrl?: string;
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
  videoUrl
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

  // Helper function to calculate remaining time
  const calculateRemainingTime = (startTime: number | undefined | string, duration: number): number => {
    if (typeof startTime === 'string') {
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

  const isActive = status === 'processing' || status === 'queued';
  const isCompleted = status === 'completed';


  const handleClick = () => {
    // Allow both completed and failed analyses to be clickable
    if ((isCompleted || status === 'failed') && queryClient && currentPage && itemsPerPage) {
      // Construct the query key for the current page
      const queryKey = ['analyses', { scope: 'finished', page: currentPage, limit: itemsPerPage }];

      // Optimistically update the cache
      queryClient.setQueryData<PaginatedResponse>(queryKey, (oldData) => {
        if (!oldData) return undefined;

        // Find the analysis and update its 'unread' status
        const newData = oldData.data.map(analysis =>
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
          relative bg-black/40 border-zinc-800 backdrop-blur-xl
          ${isActive ? 'ring-1 ring-zinc-700' : ''}
          ${(isCompleted || status === 'failed') ? 'cursor-pointer hover:bg-black/50 transition-colors duration-300' : ''}
        `}
        onClick={handleClick}
      >
        <CardContent className="flex items-center p-4">
          <div className="h-12 w-12 rounded-lg bg-black/40 flex items-center justify-center mr-4 overflow-hidden">
            {youtubeVideoId ? (
              <div className="relative h-12 w-12">
                <Image
                  src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`}
                  alt={title || 'YouTube Video'}
                  fill
                  sizes="48px"
                  className="object-cover rounded-lg"
                  priority={false}
                />
              </div>
            ) : null}
            <PlayCircle
              className={`h-6 w-6 text-zinc-400 ${youtubeVideoId ? 'hidden' : ''}`}
              style={{ display: youtubeVideoId ? 'none' : 'block' }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-zinc-100 truncate" title={title || 'Analysis'}>
                {title || 'Analysis'}
              </h3>

            </div>
            <p className="text-sm text-zinc-500 truncate max-w-full overflow-hidden">ID: {analysisId}</p>
          </div>

          <div className="ml-4 flex items-center gap-4">
            <div className="text-right min-h-[40px] flex flex-col items-end justify-center">
              <AnimatePresence mode="wait" initial={false}>
                {status === 'queued' && (
                  <motion.div
                    key="queued"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-sm text-zinc-400"
                  >
                    {queuePosition != null ? `Queue: #${queuePosition}` : 'Queued'}
                  </motion.div>
                )}
                {status === 'processing' && (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2 text-sm text-zinc-200"
                  >
                    <CircleDot className="h-4 w-4 animate-pulse text-zinc-300" />
                    {timeLeft <= 1 ? (
                      <span>Finishing up...</span>
                    ) : (
                      // <span>Processing (~{timeLeft}s left)</span> //Disabled cuz meaningless rn
                      <span>Processing</span>
                    )}
                  </motion.div>
                )}
                {status === 'completed' && (
                  <motion.div
                    key="completed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2"
                  >
                    <div className={`h-10 w-10 rounded-lg ${unread ? 'bg-white text-black':'text-white'} flex items-center justify-center`}>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        className="h-6 w-6"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <ChevronRight className="h-5 w-5 text-zinc-500" />
                  </motion.div>
                )}
                {status === 'failed' && (
                  <motion.div
                    key="failed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2"
                  >
                    <div className="text-right">
                      <div className="text-sm font-medium text-red-400">Failed</div>
                      {error?.code && (
                        <div className="text-sm text-zinc-500">{error.code}</div>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-zinc-500" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </CardContent>

        {error?.action && (
          <div className="px-4 pb-4 -mt-2">
            <p className="text-sm text-zinc-400">{error.action}</p>
          </div>
        )}
      </Card>
    </motion.div>
  );
}