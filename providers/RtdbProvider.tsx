"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onValue, ref, off } from 'firebase/database';
import { useAuth } from '@clerk/nextjs';
import { database } from '@/lib/firebase/config';
import { RTDBTaskData, TaskUpdate, TaskNotification, ServiceName } from '@/types/rtdb';

interface RtdbContextType {
  notifications: TaskNotification[];
  allTasks: Record<ServiceName, TaskUpdate[]>;
  markAsRead: (notificationId: string) => void;
  clearNotification: (notificationId: string) => void;
  clearNotificationsByTaskId: (taskId: string) => void;
  clearAllNotifications: () => void;
}

const RtdbContext = createContext<RtdbContextType | undefined>(undefined);

export function RtdbProvider({ children }: { children: React.ReactNode }) {
  const { userId, isSignedIn } = useAuth();
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [allTasks, setAllTasks] = useState<Record<ServiceName, TaskUpdate[]>>({
    alyzitron: [],
    editron: [],
    musitron: [],
    shield: [],
    thinkforge: [],
    socialize: [],
  });
  const previousTasksRef = useRef<Record<string, TaskUpdate>>({});
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      setNotifications([]);
      setAllTasks({
        alyzitron: [],
        editron: [],
        musitron: [],
        shield: [],
        thinkforge: [],
        socialize: [],
      });
      previousTasksRef.current = {};
      isInitialLoadRef.current = true;
      return;
    }

    const userTasksRef = ref(database, `/${userId}`);

    const listener = onValue(userTasksRef, (snapshot) => {
      const data = snapshot.val() as RTDBTaskData | null;
      const newNotifications: TaskNotification[] = [];
      const updatedTasks: Record<ServiceName, TaskUpdate[]> = {
        alyzitron: [],
        editron: [],
        musitron: [],
        shield: [],
        thinkforge: [],
        socialize: [],
      };
      const currentTasks: Record<string, TaskUpdate> = {};

      if (data) {
        Object.keys(data).forEach((service) => {
          const serviceName = service as ServiceName;
          const serviceTasks = data[serviceName];
          if (serviceTasks) {
            Object.values(serviceTasks).forEach((taskUpdate) => {
              if (!updatedTasks[serviceName]) {
                updatedTasks[serviceName] = [];
              }
              updatedTasks[serviceName].push(taskUpdate);
              currentTasks[taskUpdate.taskId] = taskUpdate;

              if (!isInitialLoadRef.current) {
                const previousTask = previousTasksRef.current[taskUpdate.taskId];
                const hasStatusChanged = !previousTask || previousTask.status !== taskUpdate.status;
                if (hasStatusChanged) {
                  newNotifications.push({
                    id: `${serviceName}-${taskUpdate.taskId}`,
                    taskUpdate,
                    serviceName,
                    timestamp: new Date().toISOString(),
                    isRead: false,
                  });
                }
              }
            });
          }
        });
      }

      Object.keys(updatedTasks).forEach(key => {
        const serviceKey = key as ServiceName;
        updatedTasks[serviceKey].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });

      setAllTasks(updatedTasks);
      previousTasksRef.current = currentTasks;

      if (!isInitialLoadRef.current && newNotifications.length > 0) {
        setNotifications((prevNotifications) => {
          const newNotificationTaskKeys = new Set(newNotifications.map(n => `${n.serviceName}-${n.taskUpdate.taskId}`));
          const filteredPrev = prevNotifications.filter(n =>
            !newNotificationTaskKeys.has(`${n.serviceName}-${n.taskUpdate.taskId}`)
          );
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
    setNotifications((prev) => prev.filter((n) => n.taskUpdate.taskId !== taskId));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const value: RtdbContextType = {
    notifications,
    allTasks,
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