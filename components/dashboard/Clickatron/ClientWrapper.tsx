"use client";

import { useQueryClient } from '@tanstack/react-query';
import { useTaskUpdater } from '@/hooks/useTaskUpdater';
import { ClickatronTaskHistory } from "./ClickatronTaskHistory";
import { PromptForm } from "./PromptForm";

/**
 * ClientWrapper (Clickatron) — simplified to mirror Musitron
 * - Do not own the history cache here.
 * - History is fetched in ClickatronTaskHistory with queryKey ['clickatron-tasks', page, limit].
 * - Keep only analytics invalidation on generation.
 * - No optimistic updates, no prefetch, no skeleton here.
 */
export function ClientWrapper() {
  const queryClient = useQueryClient();

  // Keep RTDB listener active globally on this page
  useTaskUpdater();

  return (
    <div className="space-y-8">
      <PromptForm
        onSubmit={() => {
          // On generation: refresh analytics immediately
          queryClient.invalidateQueries({ queryKey: ['clickatron-analytics'], exact: false });
        }}
      />
      <ClickatronTaskHistory />
    </div>
  );
}