"use client";

import { useQueryClient } from '@tanstack/react-query';
import { useState, lazy, Suspense } from 'react';
import { useTaskUpdater } from '@/hooks/useTaskUpdater';

// Lazy load heavy components
const VideoUpload = lazy(() => import('./VideoUpload').then(mod => ({ default: mod.VideoUpload })));
const AlyzitronTaskHistory = lazy(() => import('./AlyzitronTaskHistory').then(mod => ({ default: mod.AlyzitronTaskHistory })));

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
      <Suspense fallback={
        <div className="p-6 rounded-lg bg-white/[0.02] border border-white/[0.08] animate-pulse">
          <div className="h-6 bg-white/10 rounded mb-4"></div>
          <div className="h-32 bg-white/5 rounded"></div>
        </div>
      }>
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
      </Suspense>
      
      <Suspense fallback={
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] animate-pulse">
              <div className="h-4 bg-white/10 rounded mb-2"></div>
              <div className="h-16 bg-white/5 rounded"></div>
            </div>
          ))}
        </div>
      }>
        <AlyzitronTaskHistory />
      </Suspense>
    </div>
  );
}