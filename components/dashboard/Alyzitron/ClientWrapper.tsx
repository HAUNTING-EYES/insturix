"use client";

import { useState, lazy, Suspense } from 'react';
import { useCredits } from '@/hooks/useCredits';
// Lazy load heavy components
const VideoUpload = lazy(() => import('./VideoUpload'));
const AlyzitronTaskHistory = lazy(() => import('./AlyzitronTaskHistory').then(mod => ({ default: mod.AlyzitronTaskHistory })));

/**
 * ClientWrapper (Alyzitron) — mirror Musitron/Clickatron minimal pattern
 * - Do NOT own/fetch a root history cache here.
 * - History is fetched only inside AlyzitronTaskHistory with ['alyzitron-tasks', page, limit].
 * - Use polling and react-query invalidation for real-time updates instead of RTDB.
 */
export function ClientWrapper() {
  const [activeAnalyses] = useState<Set<string>>(new Set());
  const { invalidateCredits } = useCredits();



  return (
    <div className="space-y-0">
      <Suspense fallback={
        <div className="px-0 py-16 animate-pulse">
          <div className="mx-auto mb-4 h-8 max-w-md rounded bg-[#131312]"></div>
          <div className="mx-auto h-12 max-w-xl rounded-[10px] bg-[#0F0F0E]"></div>
        </div>
      }>
        <VideoUpload
          onSubmit={() => {
            // No local cache mutation; polling and invalidation will refresh UI.
          }}
          onComplete={() => {
            // Invalidate credits on successful generation to refresh balance
            invalidateCredits();
            // History invalidation is handled by manual invalidation in useVideoAnalysis or polling.
          }}
          activeAnalyses={activeAnalyses}
        />
      </Suspense>
      
      <Suspense fallback={
        <div className="border-t border-[#1C1B19] py-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="mb-1.5 h-[60px] rounded-lg border border-[#1C1B19] bg-[#0F0F0E] animate-pulse">
            </div>
          ))}
        </div>
      }>
        <AlyzitronTaskHistory />
      </Suspense>
    </div>
  );
}
