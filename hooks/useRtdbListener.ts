import { useEffect, useState, useRef } from 'react';
import { onValue, ref, off } from 'firebase/database';
import { useAuth } from '@clerk/nextjs';
import { database } from '@/lib/firebase/config';
import { RTDBTaskData, TaskUpdate, TaskNotification, ServiceName } from '@/types/rtdb';
import { v4 as uuidv4 } from 'uuid';

export function useRtdbListener() {
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
              // Add to all tasks list for the specific service
              if (!updatedTasks[serviceName]) {
                updatedTasks[serviceName] = [];
              }
              updatedTasks[serviceName].push(taskUpdate);
              currentTasks[taskUpdate.taskId] = taskUpdate;

              // Only create notifications for status changes (not initial load)
              if (!isInitialLoadRef.current) {
                const previousTask = previousTasksRef.current[taskUpdate.taskId];
                const hasStatusChanged = !previousTask || previousTask.status !== taskUpdate.status;
                
                if (hasStatusChanged) {
                  newNotifications.push({
                    id: `${serviceName}-${taskUpdate.taskId}`, // Use predictable ID to replace duplicates
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
      
      // Sort tasks by updatedAt in descending order for each service
      Object.keys(updatedTasks).forEach(key => {
        const serviceKey = key as ServiceName;
        updatedTasks[serviceKey].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
      
      setAllTasks(updatedTasks);
      previousTasksRef.current = currentTasks;
      
      // Only add notifications if not initial load
      if (!isInitialLoadRef.current && newNotifications.length > 0) {
        setNotifications((prevNotifications) => {
          // Remove any existing notifications for the same tasks
          const newNotificationTaskKeys = new Set(newNotifications.map(n => `${n.serviceName}-${n.taskUpdate.taskId}`));
          const filteredPrev = prevNotifications.filter(n =>
            !newNotificationTaskKeys.has(`${n.serviceName}-${n.taskUpdate.taskId}`)
          );
          // Add new notifications at the top
          return [...newNotifications, ...filteredPrev].slice(0, 20);
        });
      }
      
      // After first load, set initial load to false
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

  return { notifications, allTasks, markAsRead, clearNotification, clearNotificationsByTaskId, clearAllNotifications };
}