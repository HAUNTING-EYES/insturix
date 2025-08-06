"use client";

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { VideoUpload } from './VideoUpload';
import { useTaskUpdater } from '@/hooks/useTaskUpdater';
import { AlyzitronTaskHistory } from './AlyzitronTaskHistory';

/**
 * ClientWrapper (Alyzitron) — mirror Musitron/Clickatron minimal pattern
 * - Do NOT own/fetch a root history cache here.
 * - History is fetched only inside AlyzitronTaskHistory with ['alyzitron-tasks', page, limit].
 * - Keep RTDB listener active and invalidate analytics on generation.
 */
export function ClientWrapper() {
  const queryClient = useQueryClient();
  const [activeAnalyses] = useState<Set<string>>(new Set());

  // RTDB listener for instant updates
  useTaskUpdater();

  return (
    <div className="space-y-8">
      <VideoUpload
        onSubmit={() => {
          // No local cache mutation; RTDB will drive updates.
        }}
        onComplete={() => {
          // Invalidate analytics on successful generation to refresh limits/counters
          queryClient.invalidateQueries({ queryKey: ['alyzitron-analytics'], exact: false });
          // History invalidation is handled by RTDB via useTaskUpdater.
        }}
        activeAnalyses={activeAnalyses}
      />
      <AlyzitronTaskHistory />
    </div>
  );
}