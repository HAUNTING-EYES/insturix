"use client";

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onValue, ref, off } from 'firebase/database';
import { useAuth } from '@clerk/nextjs';
import { database } from '@/lib/firebase/config';
import { RTDBTaskData, TaskUpdate, ServiceName } from '@/types/rtdb';

/**
 * useTaskUpdater
 * Listens to RTDB changes for the signed-in user and invalidates react-query caches.
 *
 * Rules (uniform across services):
 * - Exactly two react-query caches per service:
 *   1) history:   ['<service>-tasks', ...optionalParams]
 *   2) analytics: ['<service>-analytics']
 * - On task generation (handled by the form's success): refetch analytics for that service
 * - On RTDB task status change: refetch BOTH history and analytics for that service
 * - No frequent polling; we rely on RTDB signal + on-demand refetch
 */
export function useTaskUpdater() {
  const { userId, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const isInitialLoadRef = useRef(true);
  const previousTasksRef = useRef<Record<string, TaskUpdate>>({});

  useEffect(() => {
    if (!isSignedIn || !userId) {
      isInitialLoadRef.current = true;
      previousTasksRef.current = {};
      return;
    }

    const userTasksRef = ref(database, `/${userId}`);

    const listener = onValue(userTasksRef, (snapshot) => {
      const data = snapshot.val() as RTDBTaskData | null;
      if (!data) return;

      const currentTasks: Record<string, TaskUpdate> = {};

      Object.keys(data).forEach((service) => {
        const serviceName = service as ServiceName;
        const serviceTasks = data[serviceName];
        if (!serviceTasks) return;

        Object.entries(serviceTasks).forEach(([taskId, taskUpdate]) => {
          currentTasks[taskId] = taskUpdate;
          const previousTask = previousTasksRef.current[taskId];

          // Skip initial hydration
          if (isInitialLoadRef.current) return;

          const statusChanged = !previousTask || previousTask.status !== taskUpdate.status;
          if (!statusChanged) return;

          // Normalize: two caches per service
          // musitron
          if (serviceName === 'musitron') {
            // Invalidate history: our MusitronTaskHistory uses key ["musitron-tasks", page, limit]
            // We cannot know page/limit here, so invalidate all queries starting with this key root.
            queryClient.invalidateQueries({ queryKey: ['musitron-tasks'], exact: false });
            queryClient.invalidateQueries({ queryKey: ['musitron-analytics'], exact: false });
          }

          // clickatron
          if (serviceName === 'clickatron') {
            queryClient.invalidateQueries({ queryKey: ['clickatron-tasks'], exact: false });
            queryClient.invalidateQueries({ queryKey: ['clickatron-analytics'], exact: false });
            // Backward-compat: some existing code uses ['clickatronStats']
            queryClient.invalidateQueries({ queryKey: ['clickatronStats'], exact: false });
          }

          // alyzitron
          if (serviceName === 'alyzitron') {
            queryClient.invalidateQueries({ queryKey: ['alyzitron-tasks'], exact: false });
            queryClient.invalidateQueries({ queryKey: ['alyzitron-analytics'], exact: false });
            // Backward-compat: existing keys
            queryClient.invalidateQueries({ queryKey: ['analyses'], exact: false });
            queryClient.invalidateQueries({ queryKey: ['alyzitron-all-analyses'], exact: false });
          }
        });
      });

      previousTasksRef.current = currentTasks;
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
      }
    });

    return () => {
      off(userTasksRef, 'value', listener);
    };
  }, [userId, isSignedIn, queryClient]);
}