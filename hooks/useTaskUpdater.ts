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

            // If task is new or status has changed, update only that task's cache
            if (!previousTask || previousTask.status !== taskUpdate.status) {
              if (serviceName === "musitron") {
                // Refetch only the updated musitron task if you have a per-task query
                queryClient.refetchQueries({
                  queryKey: ['musitron-tasks', taskId],
                  exact: true,
                });
                // Refetch musitron analytics as well
                queryClient.refetchQueries({ queryKey: ['musitron-analytics'] });
              }
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