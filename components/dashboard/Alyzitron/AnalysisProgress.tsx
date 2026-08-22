"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle, ChevronRight, AlertCircle, Instagram, Twitter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QueryClient } from '@tanstack/react-query';
import Image from 'next/image';

import type { AnalysisStatus, AnalysisResults } from '@/app/api/services/alyzitron/types'
import type { PaginatedResponse } from './AnalysisList';

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

  let authorInfo = createdByName && createdByName.toLowerCase() !== 'unknown' ? createdByName : null;
  if (!authorInfo && videoUrl) {
    if (isInstagramUrl) {
        const match = videoUrl.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
        if (match && match[1] && !['p', 'reel', 'tv'].includes(match[1])) {
            authorInfo = `@${match[1]}`;
        } else {
            authorInfo = 'Instagram';
        }
    } else if (isTwitterUrl) {
        const match = videoUrl.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
        if (match && match[1] && !['status'].includes(match[1])) {
            authorInfo = `@${match[1]}`;
        } else {
            authorInfo = 'X (Twitter)';
        }
    } else if (isYouTubeUrl) {
        authorInfo = 'YouTube';
    }
  }

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
  const isClickable = isCompleted || status === 'failed';

  // Calculate progress percentage
  const progressPercentage = status === 'processing'
    ? Math.min(100, Math.round(((expectedDurationSeconds - timeLeft) / expectedDurationSeconds) * 100))
    : status === 'queued' ? 10 : status === 'listed' ? 5 : 0;

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

  const score = results?.overall_score;
  const scoreColor =
    typeof score === 'number'
      ? score >= 85
        ? '#5EC97E'
        : score >= 70
          ? '#D4A652'
          : '#D46A5C'
      : '#7A776E';
  const sourceLabel = isYouTubeUrl ? 'YT' : isInstagramUrl ? 'IG' : isTwitterUrl ? 'X' : 'MP4';
  const statusLabel =
    status === 'listed'
      ? 'Watching'
      : status === 'queued'
        ? queuePosition != null
          ? `Queued #${queuePosition}`
          : 'Queued'
        : status === 'processing'
          ? timeLeft <= 5
            ? 'Judging'
            : 'Reading your brand'
          : status === 'failed'
            ? 'Failed'
            : `${sourceLabel}${metadata?.videoDuration ? ` · ${formatDuration(metadata.videoDuration)}` : ''}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
      onClick={handleClick}
      className={isClickable ? 'cursor-pointer' : 'cursor-default'}
    >
      <div
        className={`
          group relative grid grid-cols-[44px_1fr_auto] items-center gap-3.5 overflow-hidden rounded-lg border
          bg-[#0F0F0E] px-3.5 py-3 transition-colors duration-300
          ${unread ? 'border-[#D4A652]/40' : 'border-[#1C1B19]'}
          ${isClickable ? 'hover:border-[#282724]' : ''}
          ${status === 'failed' ? 'border-[#D46A5C]/30' : ''}
        `}
      >
        {/* Progress Background for Active Tasks */}
        {isActive && (
          <motion.div
            className="pointer-events-none absolute bottom-0 left-0 top-0 z-0 border-r border-[#D4A652]/35 bg-gradient-to-r from-transparent via-[#D4A652]/10 to-[#D4A652]/15"
            initial={{ width: '4%' }}
            animate={{ width: `${Math.max(progressPercentage, 8)}%` }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          />
        )}

        <div className="relative z-10 flex h-[34px] w-11 items-center justify-center overflow-hidden rounded bg-[#131312]">
          {youtubeVideoId ? (
            <Image
              src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`}
              alt={title || 'YouTube Video'}
              fill
              sizes="44px"
              className="object-cover opacity-80 transition-opacity group-hover:opacity-100"
              priority={false}
            />
          ) : isInstagramUrl ? (
            <Instagram className="h-5 w-5 text-[#D4A652]" />
          ) : isTwitterUrl ? (
            <Twitter className="h-5 w-5 text-[#D4A652]" />
          ) : (
            <PlayCircle className="h-5 w-5 text-[#7A776E]" />
          )}
        </div>

        <div className="relative z-10 min-w-0">
          <h3 className="truncate text-[13px] font-medium leading-snug text-[#ECE9E1]" title={title || 'Analysis'}>
            {title || 'Analysis'}
          </h3>
          <div className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[10px] text-[#5F5E5A]">
            {isActive && (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#D4A652]" />
            )}
            <span className={isActive ? 'text-[#D4A652]' : status === 'failed' ? 'text-[#D46A5C]' : 'text-[#5F5E5A]'}>
              {statusLabel}
            </span>
            {results?.overview && (
              <>
                <span className="text-[#454340]">·</span>
                <span className="truncate font-sans text-[11px] text-[#B5B2A8]" title={results.overview}>
                  {results.overview}
                </span>
              </>
            )}
            {!results?.overview && authorInfo && (
              <>
                <span className="text-[#454340]">·</span>
                <span className="truncate font-sans text-[11px] text-[#B5B2A8]">
                  {authorInfo}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="relative z-10 flex min-w-12 items-center justify-end">
          <AnimatePresence mode="wait" initial={false}>
            {isActive && (
              <motion.span
                key="active"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="font-mono text-[10px] font-medium text-[#D4A652]"
              >
                {Math.max(progressPercentage, 8)}%
              </motion.span>
            )}
            {status === 'completed' && typeof score === 'number' && (
              <motion.span
                key="score"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[3px] px-2.5 py-1 font-mono text-[11px] font-medium"
                style={{ color: scoreColor, backgroundColor: `${scoreColor}14` }}
              >
                {score}
              </motion.span>
            )}
            {status === 'completed' && typeof score !== 'number' && (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-[#5EC97E]">
                <span className="font-mono text-[10px]">done</span>
                <ChevronRight className="h-3.5 w-3.5 text-[#454340] transition-colors group-hover:text-[#B5B2A8]" />
              </motion.div>
            )}
            {status === 'failed' && (
              <motion.div key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-[#D46A5C]">
                <span className="font-mono text-[10px]">failed</span>
                <AlertCircle className="h-3.5 w-3.5" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {status === 'failed' && error?.message && (
        <p className="mt-1.5 rounded border border-[#D46A5C]/20 bg-[#D46A5C]/5 px-3 py-2 text-[11px] leading-relaxed text-[#D46A5C]/90">
          {error.message}
        </p>
      )}
    </motion.div>
  );
}
