"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CircleDot, PlayCircle, XCircle, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QueryClient } from '@tanstack/react-query'; // Import QueryClient type

import { AnalysisStatus, VideoType } from '@/app/api/services/alyzitron/types';
// Import the PaginatedResponse type (adjust path if necessary)
import type { PaginatedResponse } from './AnalysisList';

interface AnalysisError {
  code: string;
  message: string;
  action?: string;
}

interface AnalysisProgressProps {
  analysisId: string;
  taskId?: string;
  title?: string;
  type?: VideoType;
  status?: AnalysisStatus;
  queuePosition?: number;
  unread?: boolean;
  error?: AnalysisError;
  expectedDurationSeconds?: number;
  processingStartTime?: number; // timestamp in ms
  onCancel?: (taskId: string) => void;
  // Add props for cache update
  queryClient?: QueryClient;
  currentPage?: number;
  itemsPerPage?: number;
}

export function AnalysisProgress({
  analysisId,
  taskId,
  title,
  status,
  queuePosition,
  unread = false,
  error,
  expectedDurationSeconds = 60,
  processingStartTime,
  onCancel,
  // Destructure new props
  queryClient,
  currentPage,
  itemsPerPage
}: AnalysisProgressProps) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState<number>(expectedDurationSeconds);

  useEffect(() => {
    if (status !== 'processing') {
      return; // Skip countdown if not processing
    }

    const interval = setInterval(() => {
      const now = Date.now();

      if (!processingStartTime) {
        setTimeLeft(expectedDurationSeconds);
        return;
      }

      const elapsed = now - processingStartTime;
      const rawRemaining = (processingStartTime + expectedDurationSeconds * 1000 - now) / 1000;
      const remaining = Math.max(1, rawRemaining);

      setTimeLeft(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [processingStartTime, expectedDurationSeconds, status]);

  const isActive = status === 'processing' || status === 'queued';
  const canCancel = status === 'queued' && onCancel && taskId;
  const isCompleted = status === 'completed';

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canCancel && taskId) {
      onCancel(taskId);
    }
  };

  const handleClick = () => {
    if (isCompleted && queryClient && currentPage && itemsPerPage) {
      // Construct the query key for the current page
      const queryKey = ['analyses', { scope: 'completed', page: currentPage, limit: itemsPerPage }];

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

      // Mark the analysis as read on the backend (fire-and-forget)
      // Ensure this API endpoint exists and handles PATCH requests
      fetch(`/api/services/alyzitron/analyses/${analysisId}/read`, { method: 'PATCH' })

      // Navigate to the report page
      router.push(`/dashboard/alyzitron/report/${analysisId}`);
    } else if (isCompleted) {
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
          ${isCompleted ? 'cursor-pointer hover:bg-black/50 transition-colors duration-300' : ''}
        `}
        onClick={handleClick}
      >
        <CardContent className="flex items-center p-4">
          <div className="h-12 w-12 rounded-lg bg-black/40 flex items-center justify-center mr-4">
            <PlayCircle className="h-6 w-6 text-zinc-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-zinc-100 truncate" title={title || 'Analysis'}>
                {title || 'Analysis'}
              </h3>

            </div>
            <p className="text-sm text-zinc-500">ID: {analysisId}</p>
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
                    <span>Processing (~{Math.ceil(timeLeft)}s left)</span>
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
                    className="text-right"
                  >
                    <div className="text-sm font-medium text-red-400">Failed</div>
                    {error?.message && (
                      <div className="text-sm text-zinc-500">{error.message}</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {canCancel && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="text-zinc-400 hover:text-red-400"
              >
                <XCircle className="h-5 w-5" />
              </Button>
            )}
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