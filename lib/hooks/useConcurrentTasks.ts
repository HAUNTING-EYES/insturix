"use client";

import { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { database } from '@/lib/firebase/config';
import { ref, onValue, off } from 'firebase/database';

interface ConcurrentTasksHook {
  concurrentCount: number;
  isLoading: boolean;
  error: string | null;
}

export function useConcurrentTasks(): ConcurrentTasksHook {
  const { user, isLoaded } = useUser();
  const [concurrentCount, setConcurrentCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listenerRef = useRef<any>(null);

  useEffect(() => {
    if (!isLoaded || !user?.id) {
      setIsLoading(false);
      return;
    }

    const userTasksRef = ref(database, `/${user.id}/alyzitron`);
    
    const unsubscribe = onValue(
      userTasksRef,
      (snapshot) => {
        try {
          if (!snapshot.exists()) {
            setConcurrentCount(0);
            setIsLoading(false);
            return;
          }

          const tasks = snapshot.val();
          let activeCount = 0;

          // Count tasks with status 'listed', 'queued', or 'processing'
          for (const taskId in tasks) {
            const task = tasks[taskId];
            if (
              task.status === 'listed' || 
              task.status === 'queued' || 
              task.status === 'processing'
            ) {
              activeCount++;
            }
          }

          setConcurrentCount(activeCount);
          setError(null);
          setIsLoading(false);
        } catch (err) {
          console.error('Error processing concurrent tasks:', err);
          setError(err instanceof Error ? err.message : 'Unknown error');
          setIsLoading(false);
        }
      },
      (error) => {
        console.error('Firebase RTDB error for concurrent tasks:', error);
        setError(error.message);
        setIsLoading(false);
      }
    );

    listenerRef.current = unsubscribe;

    // Cleanup listener on unmount
    return () => {
      if (listenerRef.current) {
        off(userTasksRef, 'value', listenerRef.current);
      }
    };
  }, [isLoaded, user?.id]);

  return {
    concurrentCount,
    isLoading,
    error
  };
}