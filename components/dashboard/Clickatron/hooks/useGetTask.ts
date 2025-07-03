import { useState, useEffect } from 'react';
import { IClickatronTask } from '@/schemas/Clickatron';

async function fetchTaskStatus(taskId: string): Promise<IClickatronTask> {
  const response = await fetch(`/api/services/clickatron/status/${taskId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch task status');
  }
  return response.json();
}

export function useGetTask(initialTask: IClickatronTask) {
  const [task, setTask] = useState<IClickatronTask>(initialTask);

  useEffect(() => {
    if (task.status === 'processing' || task.status === 'queued') {
      const interval = setInterval(async () => {
        try {
          const updatedTask = await fetchTaskStatus(task._id.toString());
          setTask(updatedTask);
          if (updatedTask.status === 'completed' || updatedTask.status === 'failed') {
            clearInterval(interval);
          }
        } catch (error) {
          console.error('Error fetching task status:', error);
          clearInterval(interval);
        }
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(interval);
    }
  }, [task._id, task.status]);

  return { task };
}