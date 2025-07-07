"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onValue, ref, off } from 'firebase/database';
import { useAuth } from '@clerk/nextjs';
import { database } from '@/lib/firebase/config';
import { RTDBTaskData, TaskUpdate, TaskNotification, ServiceName } from '@/types/rtdb';

interface RtdbContextType {
  notifications: TaskNotification[];
  markAsRead: (notificationId: string) => void;
  clearNotification: (notificationId: string) => void;
  clearNotificationsByTaskId: (taskId: string) => void;
  clearAllNotifications: () => void;
}

const RtdbContext = createContext<RtdbContextType | undefined>(undefined);

export function RtdbProvider({ children }: { children: React.ReactNode }) {
  const { userId, isSignedIn } = useAuth();
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  // The rest of the state and logic for `allTasks` is now handled by `useTaskUpdater` and react-query
  const previousTasksRef = useRef<Record<string, TaskUpdate>>({});
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      setNotifications([]);
      previousTasksRef.current = {};
      isInitialLoadRef.current = true;
      return;
    }

    const userTasksRef = ref(database, `/${userId}`);

    const listener = onValue(userTasksRef, (snapshot) => {
      const data = snapshot.val() as RTDBTaskData | null;
      const newNotifications: TaskNotification[] = [];
      const currentTasks: Record<string, TaskUpdate> = {};

      if (data) {
        Object.entries(data).forEach(([serviceName, serviceTasks]) => {
          if (serviceTasks) {
            Object.entries(serviceTasks).forEach(([taskId, taskUpdate]) => {
              currentTasks[taskId] = taskUpdate;

              const previousTask = previousTasksRef.current[taskId];
              const hasStatusChanged = !previousTask || previousTask.status !== taskUpdate.status;

              if (!isInitialLoadRef.current && hasStatusChanged) {
                newNotifications.push({
                  id: `${serviceName}-${taskId}`,
                  taskId: taskId,
                  taskUpdate: taskUpdate,
                  serviceName: serviceName as ServiceName,
                  timestamp: new Date().toISOString(),
                  isRead: false,
                });
              }
            });
          }
        });
      }

      previousTasksRef.current = currentTasks;

      if (!isInitialLoadRef.current && newNotifications.length > 0) {
        setNotifications((prevNotifications) => {
          const newNotificationTaskKeys = new Set(newNotifications.map(n => n.id));
          const filteredPrev = prevNotifications.filter(n => !newNotificationTaskKeys.has(n.id));
          return [...newNotifications, ...filteredPrev].slice(0, 20);
        });
      }

      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
      }
    });

    return () => {
      off(userTasksRef, 'value', listener);
    };
  }, [userId, isSignedIn]);

  const markAsRead = (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
  };

  const clearNotification = (notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  };

  const clearNotificationsByTaskId = (taskId: string) => {
    setNotifications((prev) => prev.filter((n) => n.taskId !== taskId));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const value: RtdbContextType = {
    notifications,
    markAsRead,
    clearNotification,
    clearNotificationsByTaskId,
    clearAllNotifications,
  };

  return (
    <RtdbContext.Provider value={value}>
      {children}
    </RtdbContext.Provider>
  );
}

export function useRtdb() {
  const context = useContext(RtdbContext);
  if (context === undefined) {
    throw new Error('useRtdb must be used within a RtdbProvider');
  }
  return context;
}