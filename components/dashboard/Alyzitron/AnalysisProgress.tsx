"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CircleDot, PlayCircle, XCircle, ChevronRight } from 'lucide-react';
import { ProgressBar } from './ProgressBar';
import { formatTimeRemaining } from '@/utils/progress';
import { useRouter } from 'next/navigation';
import { useAnalysisState } from '@/hooks/useAnalysisState';

import { AnalysisStatus, VideoType } from '@/app/api/services/alyzitron/types';

interface AnalysisProgressProps {
  analysisId: string;
  taskId?: string;
  title?: string;
  type?: VideoType;
  status?: AnalysisStatus;
  progress?: number;
  estimatedTime?: number;
  queuePosition?: number;
  error?: {
    message?: string;
    action?: string;
  };
  onCancel?: (taskId: string) => void;
}

export function AnalysisProgress({
  analysisId,
  taskId: propTaskId,
  type: propType,
  status: propStatus,
  progress: propProgress,
  estimatedTime: propEstimatedTime,
  queuePosition: propQueuePosition,
  error: propError,
  onCancel
}: AnalysisProgressProps) {
  const router = useRouter();
  const { analysis } = useAnalysisState(analysisId);

  // Use props if available, fallback to analysis state
  const status = propStatus || analysis?.status;
  const progress = propProgress ?? analysis?.progress ?? 0;
  const estimatedTime = propEstimatedTime ?? analysis?.estimatedTime;
  const queuePosition = propQueuePosition ?? analysis?.queuePosition;
  const error = propError ?? analysis?.error;
  const taskId = propTaskId || analysis?.taskId;
  const type = propType || analysis?.type;

  if (!status) return null;

  const isActive = status === 'processing' || status === 'queued';
  const showQueue = status === 'queued' && typeof queuePosition === 'number';
  const canCancel = status === 'queued' && onCancel;
  const isCompleted = status === 'completed';
  
  const timeRemaining = estimatedTime && status === 'processing'
    ? formatTimeRemaining(estimatedTime * (1 - progress))
    : null;

  const handleCancel = () => {
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
          <ProgressBar progress={progress} />
        </div>
      )}

      <CardContent className="flex items-center p-4">
        <div className="h-12 w-12 rounded-lg bg-black/40 flex items-center justify-center mr-4">
          <PlayCircle className="h-6 w-6 text-zinc-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-zinc-100 truncate">
              {type || 'Video'} Analysis
            </h3>
            {isActive && (
              <CircleDot className="h-3 w-3 text-zinc-500 animate-pulse" />
            )}
          </div>
          <p className="text-sm text-zinc-500">ID: {analysisId}</p>
        </div>

        <div className="ml-4 flex items-center gap-4">
          <div className="text-right">
            {showQueue ? (
              <div className="space-y-1">
                <div className="bg-black/20 px-3 py-1 rounded-full">
                  <span className="text-sm text-zinc-400">
                    Queue Position: {queuePosition}
                  </span>
                </div>
                {estimatedTime && (
                  <div className="text-sm text-zinc-500">
                    Est. wait: {formatTimeRemaining(estimatedTime)}
                  </div>
                )}
              </div>
            ) : status === 'processing' ? (
              <>
                <div className="text-sm font-medium text-zinc-100">
                  {Math.round(progress * 100)}%
                </div>
                {timeRemaining && (
                  <div className="text-sm text-zinc-500">
                    ~{timeRemaining} remaining
                  </div>
                )}
              </>
            ) : status === 'completed' ? (
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-zinc-100 text-zinc-900 flex items-center justify-center font-medium">
                  ✓
                </div>
                <ChevronRight className="h-5 w-5 text-zinc-500" />
              </div>
            ) : status === 'failed' ? (
              <div className="text-right">
                <div className="text-sm font-medium text-red-400">Failed</div>
                {error?.message && (
                  <div className="text-sm text-zinc-500">{error.message}</div>
                )}
              </div>
            ) : null}
          </div>

          {canCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
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
  );
}