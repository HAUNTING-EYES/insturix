"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CircleDot, PlayCircle, XCircle, ChevronRight } from 'lucide-react';
import { ProgressBar } from './ProgressBar';
// Removed formatTimeRemaining as progress is now estimated differently
import { useRouter } from 'next/navigation';
// Removed useAnalysisState hook

import { AnalysisStatus, VideoType } from '@/app/api/services/alyzitron/types';

// Define error structure inline based on usage in AnalysisList
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
  progress?: number;
  queuePosition?: number; // Display queue position if available
  // expectedWaitSeconds removed
  error?: AnalysisError;
  onCancel?: (taskId: string) => void;
}

export function AnalysisProgress({
  // Destructure props directly, removing duplicate analysisId
  analysisId,
  taskId,
  title,
  status,
  progress = 0,
  queuePosition,
  // expectedWaitSeconds removed
  error,
  onCancel
}: AnalysisProgressProps) {
  const router = useRouter();
  // Removed useAnalysisState hook and merging logic

  // State rendering functions
  // Removed formatSeconds helper

  const renderQueuedState = () => (
    <motion.div
      key="queued"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="text-right"
    >
      <div className="space-y-1">
        <div className="bg-black/20 px-3 py-1 rounded-full inline-block">
          <span className="text-sm text-zinc-400">
            {/* Display queue position if available, otherwise just 'Queued' */}
            {queuePosition != null ? `Queue: #${queuePosition}` : 'Queued'}
          </span>
        </div>
      </div>
    </motion.div>
  );

  const renderProcessingState = () => (
    <motion.div
      key="processing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="text-sm font-medium text-zinc-100"
    >
      {Math.round(progress * 100)}%
    </motion.div>
  );

  const renderCompletedState = () => (
    <motion.div
      key="completed"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-2"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }} // Slight delay for the icon animation
        className="h-10 w-10 rounded-lg bg-gradient-to-tr from-green-500 to-emerald-400 text-white flex items-center justify-center"
      >
        <motion.svg
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }} // Delay path animation
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="h-6 w-6"
        >
          <motion.path d="M20 6L9 17l-5-5" />
        </motion.svg>
      </motion.div>
      <ChevronRight className="h-5 w-5 text-zinc-500" />
    </motion.div>
  );

  const renderErrorState = () => (
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
  );

  if (!status) return null;

  // Simplified state management
  const isActive = status === 'processing' || status === 'queued'; // Based on passed status
  // Allow cancel if status is queued or processing (simulated or real) and handler exists
  const canCancel = (status === 'queued' || status === 'processing') && onCancel && taskId;
  const isCompleted = status === 'completed';

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canCancel && taskId) {
      onCancel(taskId);
    }
  };

  const handleClick = () => {
    if (isCompleted) {
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
        {status === 'processing' && (
          <div className="absolute top-0 left-0 right-0">
            <ProgressBar
              progress={progress}
              status={status}
              expectedDurationSeconds={30} // Default duration matches AnalysisList.tsx
            />
          </div>
        )}

        <CardContent className="flex items-center p-4">
          <div className="h-12 w-12 rounded-lg bg-black/40 flex items-center justify-center mr-4">
            <PlayCircle className="h-6 w-6 text-zinc-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {/* Ensure title is displayed, fallback if necessary */}
              <h3 className="text-sm font-medium text-zinc-100 truncate" title={title || 'Analysis'}>
                {title || 'Analysis'}
              </h3>
              {isActive && (
                <CircleDot className="h-3 w-3 text-zinc-500 animate-pulse" />
              )}
            </div>
            <p className="text-sm text-zinc-500">ID: {analysisId}</p>
          </div>

          <div className="ml-4 flex items-center gap-4">
            <div className="text-right min-h-[40px] flex items-center justify-end"> {/* Added min-height and flex for layout consistency */}
              <AnimatePresence mode="wait" initial={false}> {/* Disable initial animation for presence */}
                {status === 'queued' && renderQueuedState()} {/* Render queued state based on status */}
                {status === 'processing' && renderProcessingState()}
                {status === 'completed' && renderCompletedState()}
                {status === 'failed' && renderErrorState()}
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