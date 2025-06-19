"use client";

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { TaskNotificationPopup } from './TaskNotificationPopup';
import { useRtdb } from '@/providers/RtdbProvider';

export function TaskNotificationManager() {
  const { notifications, markAsRead, clearNotification } = useRtdb();
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  // Auto-dismiss notifications after 5 seconds with smooth animation
  useEffect(() => {
    const currentNotificationIds = new Set(notifications.map((n: any) => n.id));
    
    // Clean up timers for notifications that no longer exist first
    timersRef.current.forEach((timer, id) => {
      if (!currentNotificationIds.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    });

    notifications.forEach((notification: any) => {
      // For notifications that already have timers, reset them (this handles replaced notifications)
      if (timersRef.current.has(notification.id)) {
        clearTimeout(timersRef.current.get(notification.id)!);
        timersRef.current.delete(notification.id);
      }

      // Set timer for all unread notifications
      if (!notification.isRead && !dismissingIds.has(notification.id)) {
        const timer = setTimeout(() => {
          // Start dismissing animation
          setDismissingIds(prev => new Set([...prev, notification.id]));
          
          // Actually remove after animation completes
          setTimeout(() => {
            clearNotification(notification.id);
            timersRef.current.delete(notification.id);
            setDismissingIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(notification.id);
              return newSet;
            });
          }, 300); // Match the animation duration
        }, 5000);
        timersRef.current.set(notification.id, timer);
      }
    });

    return () => {
      // Cleanup all timers when component unmounts
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, [notifications, clearNotification, dismissingIds]);

  const handleClose = (notificationId: string) => {
    // Clear the auto-dismiss timer
    const timer = timersRef.current.get(notificationId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(notificationId);
    }
    // Clear notification immediately (manual close has immediate effect)
    clearNotification(notificationId);
  };

  // Show only the 5 most recent notifications
  const visibleNotifications = notifications.slice(0, 5);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col space-y-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {visibleNotifications.map((notification: any, index: number) => (
          <div
            key={notification.id}
            className="pointer-events-auto"
            style={{
              zIndex: 50 - index,
            }}
          >
            <TaskNotificationPopup
              notification={notification}
              onClose={() => handleClose(notification.id)}
              onMarkAsRead={() => markAsRead(notification.id)}
              isDismissing={dismissingIds.has(notification.id)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}