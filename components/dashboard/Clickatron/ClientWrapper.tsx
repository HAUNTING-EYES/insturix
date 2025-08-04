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
 * ClientWrapper (Clickatron)
 * - Two react-query caches only:
 *   1) History:   ['clickatron-tasks'] (array of tasks)
 *   2) Analytics: ['clickatron-analytics']
 * - On generation success: invalidate analytics (usage/locks)
 * - On RTDB updates: handled by useTaskUpdater() which invalidates ['clickatron-tasks'] and analytics keys
 */
export function ClientWrapper({ initialTasks }: ClientWrapperProps) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [activeTasks, setActiveTasks] = useState<Set<string>>(new Set());

  // Convert mongoose documents to plain objects
  const initialTasksData: ClickatronTaskData[] = initialTasks.map(task => ({
    _id: task._id?.toString() || '',
    userId: task.clerkUserId,
    title: task.title,
    details: task.details,
    status: task.status,
    results: task.results,
    error_message: task.error_message,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
  }));

  // Unified History cache for Clickatron
  // IMPORTANT: Do not render stale SSR initialTasks that might be partial/old.
  // Show a loading skeleton until the first client fetch completes (to avoid flashing a single flawed failed task).
  const { data: tasksData = [] , isFetching, isLoading, isFetched } = useQuery<ClickatronTaskData[]>({
    queryKey: ['clickatron-tasks'],
    queryFn: async () => {
      const url = '/api/services/clickatron/history?page=1&limit=50&status=completed,failed,listed,queued,processing';
      const response = await fetch(url, { cache: 'no-store' as RequestCache });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error('Failed to fetch tasks, ' + text);
      }
      const result = await response.json().catch((e) => {
        throw e;
      });
      const list = Array.isArray(result?.data) ? result.data : result;
      const mapped = (list as any[]).map((task: any) => ({
        _id: task._id?.toString() || '',
        userId: task.clerkUserId ?? task.userId ?? '',
        title: (task.title ?? `Thumbnail #${(task._id?.toString() || '').slice(-6)}`),
        details: task.details ?? {},
        status: task.status,
        results: task.results,
        error_message: task.error_message,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
        completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
      }));
      return mapped;
    },
    // Avoid using SSR initialTasks which might be stale and cause the flash of a single failed item.
    initialData: undefined,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Initialize RTDB listener for real-time updates via the new hook
  useTaskUpdater();

  // Optimistic update helper for new/updated tasks
  const handleTaskUpdate = (taskId: string, task: Partial<ClickatronTaskData>) => {
    if (!taskId) return;
    queryClient.setQueryData<ClickatronTaskData[]>(['clickatron-tasks'], old => {
      const currentData = Array.isArray(old) ? old : [];
      const index = currentData.findIndex(t => t._id?.toString() === taskId);
      if (index === -1) {
        const optimisticTask: ClickatronTaskData = {
          _id: taskId,
          userId: user?.id || '',
          title: (task.title as string) ?? `Thumbnail #${taskId.slice(-6)}`,
          details: task.details ?? {},
          status: task.status || 'listed',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return [optimisticTask, ...currentData];
      }
      const updated = [...currentData];
      updated[index] = { ...updated[index], ...task, updatedAt: new Date() };
      return updated;
    });
  };

  // Track active tasks for UI hints
  useEffect(() => {
    const currentActive = new Set<string>();
    if (Array.isArray(tasksData)) {
      tasksData.forEach(t => {
        if (['listed', 'queued', 'processing'].includes(t.status)) {
          currentActive.add(t._id?.toString() || '');
        }
      });
    }
    setActiveTasks(currentActive);
  }, [tasksData]);

  // Normalize after first fetch completes
  useEffect(() => {
    if (!isFetched) return;
    queryClient.setQueryData<ClickatronTaskData[]>(['clickatron-tasks'], (old) => {
      const arr = Array.isArray(old) ? old : [];
      const normalized = arr.map(t => ({
        ...t,
        userId: t.userId ?? '',
        title: t.title ?? `Thumbnail #${(t._id || '').toString().slice(-6)}`,
        details: t.details ?? {},
      }));
      return normalized;
    });
    const snapshot = queryClient.getQueryData<ClickatronTaskData[]>(['clickatron-tasks']) || [];
  }, [queryClient, isFetched]);

  // On mount, aggressively invalidate and refetch history once to avoid stale single-item caches
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['clickatron-tasks'], exact: false });
    // Fire a manual prefetch to make sure first paint has a hydrated cache
    queryClient.prefetchQuery({
      queryKey: ['clickatron-tasks'],
      queryFn: async () => {
        const url = '/api/services/clickatron/history?page=1&limit=50&status=completed,failed,listed,queued,processing';
        const response = await fetch(url, { cache: 'no-store' as RequestCache });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error('Failed to prefetch tasks');
        }
        const result = await response.json();
        const list = Array.isArray(result?.data) ? result.data : result;
        const mapped = (list as any[]).map((task: any) => ({
          _id: task._id?.toString() || '',
          userId: task.clerkUserId ?? task.userId ?? '',
          title: (task.title ?? `Thumbnail #${(task._id?.toString() || '').slice(-6)}`),
          details: task.details ?? {},
          status: task.status,
          results: task.results,
          error_message: task.error_message,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
          completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
        }));
        return mapped;
      },
    }).then(() => {
      const snap = queryClient.getQueryData<ClickatronTaskData[]>(['clickatron-tasks']) || [];
    })
  }, [queryClient]);

  // Skeleton during first load to avoid stale flash
  if (!isFetched || isLoading || isFetching) {
    return (
      <div className="space-y-8">
        <div className="rounded-lg border border-zinc-800 bg-black/30 p-6">
          <div className="h-6 w-40 bg-zinc-800/70 rounded mb-4" />
          <div className="space-y-3">
            <div className="h-14 w-full bg-zinc-900/60 rounded" />
            <div className="h-14 w-full bg-zinc-900/60 rounded" />
            <div className="h-14 w-full bg-zinc-900/60 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PromptForm
        onSubmit={(taskId: string, task) => {
          // Optimistic update in history
          handleTaskUpdate(taskId, {
            title: task.title,
            details: task.details,
            status: 'processing',
          });
          // On generation: refresh analytics immediately
          console.debug('[Clickatron] Generation submitted, invalidating analytics');
          queryClient.invalidateQueries({ queryKey: ['clickatron-analytics'], exact: false });
        }}
        onComplete={async (taskId: string) => {
          if (!taskId || !user) return;
          try {
            console.debug('[Clickatron] Mark complete via RTDB', { taskId, userId: user.id });
            await ClickatronRTDBManager.updateTaskStatus(user.id, taskId, 'completed');
          } catch (error) {
            console.error('Failed to update clickatron task status to completed in RTDB', {
              taskId, error: error instanceof Error ? error.message : String(error)
            });
          }
        }}
        activeTasks={activeTasks}
      />
      <ClickatronTaskHistory />
    </div>
  );
}