'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

/**
 * Video Regeneration Banner
 *
 * Persistent top-of-editor banner that shows during video regeneration.
 * Listens for 'editron:video-regen-start' custom events from the AI chat panel.
 * Polls the batch status endpoint and shows per-scene progress.
 * Auto-dismisses after completion (with delay for user to see success).
 */

interface RegenJob {
  batchId: string;
  storyboardId: string;
  sceneIndices: number[];
  status: 'polling' | 'complete' | 'failed';
  completed: number;
  total: number;
  failedScenes: number[];
  startedAt: number;
}

export const VideoRegenBanner: React.FC<{
  projectId?: string;
  onOverlaysRefresh?: () => void;
}> = ({ projectId, onOverlaysRefresh }) => {
  const [jobs, setJobs] = useState<RegenJob[]>([]);
  const pollRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Listen for regen start events from AI chat
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const { batchId, storyboardId, sceneIndices } = e.detail;
      if (!batchId || !storyboardId) return;

      setJobs(prev => {
        // Don't add duplicate
        if (prev.some(j => j.batchId === batchId)) return prev;
        return [...prev, {
          batchId,
          storyboardId,
          sceneIndices: sceneIndices || [],
          status: 'polling',
          completed: 0,
          total: sceneIndices?.length || 1,
          failedScenes: [],
          startedAt: Date.now(),
        }];
      });
    };

    window.addEventListener('editron:video-regen-start', handler as EventListener);
    return () => window.removeEventListener('editron:video-regen-start', handler as EventListener);
  }, []);

  // Poll each active job
  const pollJob = useCallback(async (job: RegenJob) => {
    try {
      const res = await fetch(
        `/api/services/pipeline/storyboard/${job.storyboardId}/generate-videos/status?batchId=${job.batchId}`,
      );
      if (!res.ok) return;
      const data = await res.json();

      setJobs(prev => prev.map(j => {
        if (j.batchId !== job.batchId) return j;
        const failed = (data.scenes || []).filter((s: any) => s.status === 'failed').map((s: any) => s.sceneIndex);
        return {
          ...j,
          completed: data.completed || 0,
          total: data.totalScenes || j.total,
          failedScenes: failed,
          status: data.isComplete
            ? (data.completed > 0 ? 'complete' : 'failed')
            : 'polling',
        };
      }));

      if (data.isComplete) {
        // Stop polling
        const timer = pollRefs.current.get(job.batchId);
        if (timer) clearInterval(timer);
        pollRefs.current.delete(job.batchId);

        // Refresh overlays to show the new video
        if (data.completed > 0 && onOverlaysRefresh) {
          onOverlaysRefresh();
        }

        // Auto-dismiss after 8 seconds
        setTimeout(() => {
          setJobs(prev => prev.filter(j => j.batchId !== job.batchId));
        }, 8000);
      }
    } catch {
      // Silent poll failure — will retry
    }
  }, [onOverlaysRefresh]);

  // Start polling for new jobs
  useEffect(() => {
    for (const job of jobs) {
      if (job.status === 'polling' && !pollRefs.current.has(job.batchId)) {
        // Poll immediately, then every 8s
        pollJob(job);
        const timer = setInterval(() => pollJob(job), 8000);
        pollRefs.current.set(job.batchId, timer);

        // Auto-timeout after 5 minutes
        setTimeout(() => {
          const t = pollRefs.current.get(job.batchId);
          if (t) {
            clearInterval(t);
            pollRefs.current.delete(job.batchId);
          }
          setJobs(prev => prev.map(j =>
            j.batchId === job.batchId && j.status === 'polling'
              ? { ...j, status: 'failed' }
              : j,
          ));
        }, 5 * 60 * 1000);
      }
    }
  }, [jobs, pollJob]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollRefs.current.forEach(timer => clearInterval(timer));
      pollRefs.current.clear();
    };
  }, []);

  if (jobs.length === 0) return null;

  return (
    <div className="w-full z-50">
      {jobs.map(job => {
        const elapsed = Math.round((Date.now() - job.startedAt) / 1000);
        const elapsedStr = elapsed > 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;

        return (
          <div
            key={job.batchId}
            className={`flex items-center gap-3 px-4 py-2 text-xs font-medium ${
              job.status === 'complete'
                ? 'bg-emerald-500/15 text-emerald-400 border-b border-emerald-500/20'
                : job.status === 'failed'
                ? 'bg-red-500/15 text-red-400 border-b border-red-500/20'
                : 'bg-blue-500/15 text-blue-300 border-b border-blue-500/20'
            }`}
          >
            {job.status === 'polling' && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                <span>
                  Regenerating video{job.sceneIndices.length > 1 ? 's' : ''}{' '}
                  {job.sceneIndices.length > 0 && `(scene${job.sceneIndices.length > 1 ? 's' : ''} ${job.sceneIndices.map(i => i + 1).join(', ')})`}
                  {' '}— {job.completed}/{job.total} done · {elapsedStr}
                </span>
                <div className="flex-1 max-w-[200px] h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full transition-all duration-500"
                    style={{ width: `${(job.completed / job.total) * 100}%` }}
                  />
                </div>
              </>
            )}
            {job.status === 'complete' && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Video regeneration complete! Timeline updated.</span>
              </>
            )}
            {job.status === 'failed' && (
              <>
                <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Video regeneration failed
                  {job.failedScenes.length > 0 && ` (scene${job.failedScenes.length > 1 ? 's' : ''} ${job.failedScenes.map(i => i + 1).join(', ')})`}
                  . Try again via chat.
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Fire this from the AI chat panel when a video regen starts.
 * The banner component listens for this event.
 */
export function emitVideoRegenStart(batchId: string, storyboardId: string, sceneIndices: number[]) {
  window.dispatchEvent(new CustomEvent('editron:video-regen-start', {
    detail: { batchId, storyboardId, sceneIndices },
  }));
}

export default VideoRegenBanner;
