"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRtdb } from '@/providers/RtdbProvider';
import { IClickatronTask } from "@/schemas/Clickatron";
import { ClickatronRTDBManager } from "@/lib/services/clickatron-rtdb";
import { TaskHistory } from "./TaskHistory";
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

export function ClientWrapper({ initialTasks }: ClientWrapperProps) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [activeTasks, setActiveTasks] = useState<Set<string>>(new Set());

  // Convert mongoose documents to plain objects
  const initialTasksData: ClickatronTaskData[] = initialTasks.map(task => ({
    _id: task._id?.toString() || '',
    userId: task.userId,
    title: task.title,
    details: task.details,
    status: task.status,
    results: task.results,
    error_message: task.error_message,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
  }));

  // Initialize and manage the 'clickatron-tasks' query state
  const { data: tasksData = initialTasksData } = useQuery<ClickatronTaskData[]>({
    queryKey: ['clickatron-tasks'],
    queryFn: async () => {
      // This function ideally shouldn't be called often if initialData is provided
      // and updates happen via setQueryData/RTDB. Fetch only if necessary.
      console.warn("Fetching clickatron tasks directly in ClientWrapper, should be rare.");
      const response = await fetch('/api/services/clickatron/history');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const data = await response.json();
      // Convert to plain objects
      return data.map((task: any) => ({
        _id: task._id?.toString() || '',
        userId: task.userId,
        title: task.title,
        details: task.details,
        status: task.status,
        results: task.results,
        error_message: task.error_message,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
        completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
      }));
    },
    initialData: initialTasksData,
    staleTime: 1000 * 60 * 5, // Keep data fresh for 5 mins
    gcTime: 1000 * 60 * 10,  // Garbage collect after 10 mins
    refetchOnWindowFocus: false, // Avoid refetching on window focus
  });

  // Initialize RTDB listener for real-time updates
  const { allTasks } = useRtdb();
  const clickatronTasks = allTasks.clickatron || [];

  // Sync RTDB data with our tasks query data
  useEffect(() => {
    if (clickatronTasks.length === 0) return;

    queryClient.setQueryData<ClickatronTaskData[]>(['clickatron-tasks'], (old) => {
      const currentData = Array.isArray(old) ? old : Array.isArray(initialTasksData) ? initialTasksData : [];
      
      // Create a map of existing tasks by taskId for quick lookup
      const taskMap = new Map<string, ClickatronTaskData>();
      currentData.forEach(task => {
        if (task._id) {
          taskMap.set(task._id.toString(), task);
        }
      });

      // Update existing tasks with RTDB data
      clickatronTasks.forEach(rtdbTask => {
        const existingTask = taskMap.get(rtdbTask.taskId);
        if (existingTask) {
          // Update status from RTDB
          if (existingTask.status !== rtdbTask.status) {
            taskMap.set(rtdbTask.taskId, {
              ...existingTask,
              status: rtdbTask.status as ClickatronTaskData['status'],
              updatedAt: new Date(rtdbTask.updatedAt),
            });
          }
        }
      });

      // Convert back to array and sort by updatedAt
      const updatedTasks = Array.from(taskMap.values())
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return updatedTasks;
    });
  }, [clickatronTasks, queryClient, initialTasksData]);

  const handleTaskUpdate = (taskId: string, task: Partial<ClickatronTaskData>) => {
    if (!taskId) return;
    
    queryClient.setQueryData<ClickatronTaskData[]>(['clickatron-tasks'], old => {
      const currentData = old || [];
      const existingIndex = currentData.findIndex(t => t._id?.toString() === taskId);
      
      // Handle new task with optimistic update
      if (existingIndex === -1) {
        const optimisticTask: ClickatronTaskData = {
          _id: taskId,
          userId: user?.id || '',
          title: task.title || '',
          details: task.details || '',
          status: task.status || 'listed',
          createdAt: new Date(),
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
    // Ensure tasksData is an array before iterating
    if (Array.isArray(tasksData)) {
      tasksData.forEach(t => {
        if (['listed', 'queued', 'processing'].includes(t.status)) {
          currentActive.add(t._id?.toString() || '');
        }
      });
    }
    setActiveTasks(currentActive);
  }, [tasksData]);

  return (
    <div className="space-y-8">
      <PromptForm
        onSubmit={(taskId: string, task) => {
          // Optimistic update via handleTaskUpdate
          handleTaskUpdate(taskId, {
            title: task.title,
            details: task.details,
            status: 'processing', // Start as processing
          });
        }}
        onComplete={async (taskId: string, task) => {
          if (!taskId || !user) return;

          // Update RTDB with completed status
          try {
            await ClickatronRTDBManager.updateTaskStatus(user.id, taskId, 'completed');
            console.log('Clickatron task status updated to completed in RTDB', { taskId });
          } catch (error) {
            console.error('Failed to update clickatron task status to completed in RTDB', {
              taskId, error: error instanceof Error ? error.message : String(error)
            });
          }
        }}
        activeTasks={activeTasks}
      />
      <TaskHistory tasks={tasksData as any} />
    </div>
  );
}