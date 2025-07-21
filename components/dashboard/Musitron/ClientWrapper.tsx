"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { IMusitronTask } from "@/schemas/Musitron";
import { MusitronRTDBManager } from "@/lib/services/rtdb/musitron-rtdb";
import { useMusitronTaskUpdater } from '@/hooks/useMusitronTaskUpdater';
import MusicGenerator from "./MusicGenerator";
import { MusitronTaskHistory } from "./MusitronTaskHistory";

// Plain object type for client-side task management
type MusitronTaskData = {
  _id: string;
  userId: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  gcsAudioLink?: string;
  createdAt: Date;
  options: {
    customMode: boolean;
    title: string;
    instrumental: boolean;
    songDescription?: string;
    style?: string;
    lyrics?: string;
  };
  error?: {
    code: string;
    message: string;
  };
  refunded?: boolean;
  updatedAt: Date; // Add updatedAt for consistency
};

interface ClientWrapperProps {
  initialTasks: IMusitronTask[];
}

export function ClientWrapper({ initialTasks }: ClientWrapperProps) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [activeTasks, setActiveTasks] = useState<Set<string>>(new Set());

  // Convert mongoose documents to plain objects
  const initialTasksData: MusitronTaskData[] = initialTasks.map(task => ({
    _id: task._id?.toString() || '',
    userId: task.userId,
    status: task.status,
    gcsAudioLink: task.gcsAudioLink,
    createdAt: task.createdAt,
    options: task.options,
    error: task.error,
    refunded: task.refunded,
    updatedAt: task.updatedAt || new Date(), // Ensure updatedAt exists
  }));

  // Initialize and manage the 'musitron-tasks' query state
  const { data: tasksData = initialTasksData } = useQuery<MusitronTaskData[]>({
    queryKey: ['musitron-tasks'],
    queryFn: async () => {
      console.warn("Fetching musitron tasks directly in ClientWrapper, should be rare.");
      const response = await fetch('/api/services/musitron/history');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const data = await response.json();
      // Convert to plain objects
      return data.map((task: any) => ({
        _id: task._id?.toString() || '',
        userId: task.userId,
        status: task.status,
        gcsAudioLink: task.gcsAudioLink,
        createdAt: new Date(task.createdAt),
        options: task.options,
        error: task.error,
        refunded: task.refunded,
        updatedAt: new Date(task.updatedAt),
      }));
    },
    initialData: initialTasksData,
    staleTime: 1000 * 60 * 5, // Keep data fresh for 5 mins
    gcTime: 1000 * 60 * 10,  // Garbage collect after 10 mins
    refetchOnWindowFocus: false, // Avoid refetching on window focus
  });

  // Initialize RTDB listener for real-time updates via the new hook
  useMusitronTaskUpdater();

  const handleTaskUpdate = (taskId: string, task: Partial<MusitronTaskData>) => {
    if (!taskId) return;
    
    queryClient.setQueryData<MusitronTaskData[]>(['musitron-tasks'], old => {
      const currentData = old || [];
      const existingIndex = currentData.findIndex(t => t._id?.toString() === taskId);
      
      // Handle new task with optimistic update
      if (existingIndex === -1) {
        const optimisticTask: MusitronTaskData = {
          _id: taskId,
          userId: user?.id || '',
          status: task.status || 'queued',
          createdAt: new Date(),
          options: task.options || { customMode: false, title: 'New Music Task', instrumental: false },
          updatedAt: new Date(),
        };
        return [optimisticTask, ...currentData];
      }
      
      const existing = currentData[existingIndex];
      
      // Safe update of existing task
      const newData = [...currentData];
      newData[existingIndex] = {
        ...existing,
        ...task,
        updatedAt: new Date(),
      };
      
      return newData;
    });
  };

  // Effect to update activeTasks based on the query data
  useEffect(() => {
    const currentActive = new Set<string>();
    if (Array.isArray(tasksData)) {
      tasksData.forEach(t => {
        if (['queued', 'processing'].includes(t.status)) {
          currentActive.add(t._id?.toString() || '');
        }
      });
    }
    setActiveTasks(currentActive);
  }, [tasksData]);

  return (
    <div className="space-y-8">
      <MusicGenerator />
      <MusitronTaskHistory />
    </div>
  );
}