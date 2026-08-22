'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import type { UploadState } from '@/lib/editron/client/upload-types';

interface UploadProgressBarProps {
  state: UploadState;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; barColor: string }> = {
  'compressing': { label: 'Compressing video…', color: 'text-blue-400', barColor: 'bg-blue-500' },
  'uploading-proxy': { label: 'Uploading preview…', color: 'text-blue-400', barColor: 'bg-blue-500' },
  'uploading-original': { label: 'Uploading full quality…', color: 'text-blue-400', barColor: 'bg-blue-500' },
  'swap-pending': { label: 'Finalizing…', color: 'text-yellow-400', barColor: 'bg-yellow-500' },
  'complete': { label: 'Upload complete', color: 'text-green-400', barColor: 'bg-green-500' },
  'paused': { label: 'Paused', color: 'text-yellow-400', barColor: 'bg-yellow-500' },
  'error': { label: 'Upload failed', color: 'text-red-400', barColor: 'bg-red-500' },
};

export function UploadProgressBar({ state, onPause, onResume, onCancel, onRetry }: UploadProgressBarProps) {
  if (state.status === 'idle' || state.status === 'complete') return null;

  const config = STATUS_CONFIG[state.status] ?? STATUS_CONFIG['uploading-original'];
  const progress = state.status === 'uploading-proxy' ? state.proxyProgress : state.originalProgress;
  const percent = progress?.percent ?? 0;

  return (
    <div className="w-full space-y-2 rounded-lg border border-gray-700 bg-gray-900/80 p-3">
      {/* Status line */}
      <div className="flex items-center justify-between text-sm">
        <span className={config.color}>{config.label}</span>
        {progress && (
          <span className="text-gray-400 text-xs">
            {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
            {progress.bytesPerSecond > 0 && ` · ${formatBytes(progress.bytesPerSecond)}/s`}
            {progress.estimatedSecondsRemaining > 0 && ` · ${formatEta(progress.estimatedSecondsRemaining)}`}
          </span>
        )}
      </div>

      {/* Bar */}
      <Progress value={percent} className="h-2" />

      {/* Error message */}
      {state.status === 'error' && state.error && (
        <p className="text-xs text-red-400 truncate">{state.error}</p>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        {state.status === 'uploading-original' && onPause && (
          <Button variant="ghost" size="sm" onClick={onPause} className="h-6 text-xs px-2">
            Pause
          </Button>
        )}
        {state.status === 'paused' && onResume && (
          <Button variant="ghost" size="sm" onClick={onResume} className="h-6 text-xs px-2">
            Resume
          </Button>
        )}
        {state.status === 'error' && onRetry && (
          <Button variant="ghost" size="sm" onClick={onRetry} className="h-6 text-xs px-2">
            Retry
          </Button>
        )}
        {state.status !== 'error' && onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-6 text-xs px-2 text-red-400">
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
