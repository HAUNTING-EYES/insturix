"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { IClickatronTask } from "@/schemas/Clickatron";
import { ClickatronRTDBManager } from "@/lib/services/rtdb/clickatron-rtdb";
import { useTaskUpdater } from '@/hooks/useTaskUpdater';
import { ClickatronTaskHistory } from "./ClickatronTaskHistory";
import { PromptForm } from "./PromptForm";

// Plain object type for client-side task management
type ClickatronTaskData = {
  _id: string;
  userId: string;
  title?: string;
  details: any;
  status: 'listed' | 'queued' | 'processing' | 'completed' | 'failed';
  results?: {
    thumbnail: {
      prompt: string;
      gcs_url: string;
    };
    details?: string;
  };
  error_message?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
};

interface ClientWrapperProps {
  initialTasks: IClickatronTask[];
}

/**
 * ClientWrapper (Clickatron) — simplified to mirror Musitron
 * - Do not own the history cache here.
 * - History is fetched in ClickatronTaskHistory with queryKey ['clickatron-tasks', page, limit].
 * - Keep only analytics invalidation on generation.
 * - No optimistic updates, no prefetch, no skeleton here.
 */
export function ClientWrapper({ initialTasks }: ClientWrapperProps) {
  const queryClient = useQueryClient();

  // Keep RTDB listener active globally on this page
  useTaskUpdater();

  return (
    <div className="space-y-8">
      <PromptForm
        onSubmit={(_taskId: string) => {
          // On generation: refresh analytics immediately
          queryClient.invalidateQueries({ queryKey: ['clickatron-analytics'], exact: false });
        }}
      />
      <ClickatronTaskHistory />
    </div>
  );
}