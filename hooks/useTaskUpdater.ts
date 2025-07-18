"use client";

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onValue, ref, off } from 'firebase/database';
import { useAuth } from '@clerk/nextjs';
import { database } from '@/lib/firebase/config';
import { RTDBTaskData, TaskUpdate, ServiceName } from '@/types/rtdb';

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
        if (serviceTasks) {
          Object.entries(serviceTasks).forEach(([taskId, taskUpdate]) => {
            currentTasks[taskId] = taskUpdate;
            const previousTask = previousTasksRef.current[taskId];

            // On initial load, we don't want to trigger updates
            if (isInitialLoadRef.current) {
              return;
            }

            // If task is new or status has changed, update the cache
            if (!previousTask || previousTask.status !== taskUpdate.status) {
              console.log(`Task ${taskId} status changed to ${taskUpdate.status}. Updating cache.`);

              // Invalidate the specific query for this task to trigger a refetch
              queryClient.invalidateQueries({ queryKey: ['clickatron-task', taskId] });
              queryClient.invalidateQueries({ queryKey: ['alyzitron-analysis', taskId] });

              // Also, invalidate the list queries to ensure lists are updated
              queryClient.invalidateQueries({ queryKey: ['clickatron-history'] });
              queryClient.invalidateQueries({ queryKey: ['analyses'] }); // For InProgressAnalyses
              queryClient.invalidateQueries({ queryKey: ['analyses', { scope: 'finished' }] }); // For AnalysisList pagination
              queryClient.invalidateQueries({ queryKey: ['clickatron-all-tasks'] });
              queryClient.invalidateQueries({ queryKey: ['alyzitron-all-analyses'] });
              queryClient.invalidateQueries({ queryKey: ['alyzitron-history'], exact: false });
              
              // Invalidate stats queries to refresh analytics
              queryClient.invalidateQueries({ queryKey: ['clickatronStats'] });
              queryClient.invalidateQueries({ queryKey: ['alyzitronStats'] });
            }
          });
        }
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