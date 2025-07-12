"use client";

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onValue, ref, off } from 'firebase/database';
import { useAuth } from '@clerk/nextjs';
import { database } from '@/lib/firebase/config'; // Assuming this path is correct for client-side Firebase
import { RTDBTaskData, TaskUpdate, ServiceName } from '@/types/rtdb';

export function useMusitronTaskUpdater() {
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

    // Listen to the specific musitron-tasks path for the current user
    const userMusitronTasksRef = ref(database, `musitron-tasks/${userId}`);

    const listener = onValue(userMusitronTasksRef, (snapshot) => {
      const data = snapshot.val() as Record<string, TaskUpdate> | null;
      if (!data) return;

      const currentTasks: Record<string, TaskUpdate> = {};

      Object.entries(data).forEach(([taskId, taskUpdate]) => {
        currentTasks[taskId] = taskUpdate;
        const previousTask = previousTasksRef.current[taskId];

        // On initial load, we don't want to trigger updates
        if (isInitialLoadRef.current) {
          return;
        }

        // If task is new or status has changed, update the cache
        if (!previousTask || previousTask.status !== taskUpdate.status) {
          console.log(`Musitron task ${taskId} status changed to ${taskUpdate.status}. Updating cache.`);

          // Invalidate the specific query for this task to trigger a refetch
          queryClient.invalidateQueries({ queryKey: ['musitron-task', taskId] });

          // Also, invalidate the list queries to ensure lists are updated
          queryClient.invalidateQueries({ queryKey: ['musitron-history'] });
          queryClient.invalidateQueries({ queryKey: ['musitron-all-tasks'] });
        }
      });

      previousTasksRef.current = currentTasks;
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
      }
    });

    return () => {
      off(userMusitronTasksRef, 'value', listener);
    };
  }, [userId, isSignedIn, queryClient]);
}