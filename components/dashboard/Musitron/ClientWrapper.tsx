"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import type { MusitronTask } from "@/app/api/services/musitron/types/shared";

import { MusitronRTDBManager } from "@/lib/services/rtdb/musitron-rtdb";
import { useMusitronTaskUpdater } from '@/hooks/useMusitronTaskUpdater';
import MusicGenerator from "./MusicGenerator";
import { MusitronTaskHistory } from "./MusitronTaskHistory";

interface ClientWrapperProps {}

export function ClientWrapper({}: ClientWrapperProps) {
  // No initialTasks, no cache seeding
  const queryClient = useQueryClient();
  const { user } = useUser();

  // Removed all references to initialTasks and initialTasksData

  // Initialize RTDB listener for real-time updates via the new hook
  useMusitronTaskUpdater();

  const handleTaskUpdate = (taskId: string, task: Partial<MusitronTask>) => {
    if (!taskId) return;
    
    queryClient.setQueryData<MusitronTask[]>(['musitron-tasks'], old => {
      const currentData = old || [];
      const existingIndex = currentData.findIndex(t => t._id?.toString() === taskId);
      
      // Handle new task with optimistic update
      if (existingIndex === -1) {
        const optimisticTask: MusitronTask = {
          _id: taskId,
          clerkUserId: user?.id || '',
          title: task.title || 'New Music Task',
          style: task.style || '',
          instrumental_only: typeof task.instrumental_only === 'boolean' ? task.instrumental_only : false,
          lyrics: task.lyrics || '',
          status: task.status || 'listed',
          gcs_url: task.gcs_url,
          error: task.error,
          unread: typeof task.unread === 'boolean' ? task.unread : true,
          createdAt: new Date(),
          updatedAt: new Date(),
          refunded: task.refunded,
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

  return (
    <div className="space-y-8">
      <MusicGenerator />
      <MusitronTaskHistory />
    </div>
  );
}