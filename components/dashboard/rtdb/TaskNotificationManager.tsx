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
      // Only set timer for new notifications that don't already have one
      if (!notification.isRead && !dismissingIds.has(notification.id) && !timersRef.current.has(notification.id)) {
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
    // Start dismissing animation for manual close
    setDismissingIds(prev => new Set([...prev, notificationId]));
    setTimeout(() => {
      clearNotification(notificationId);
      setDismissingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(notificationId);
        return newSet;
      });
    }, 300); // Match the animation duration
  };

  // Show only unread notifications that haven't been dismissed
  const visibleNotifications = notifications
    .filter((notification: any) => !notification.isRead)
    .slice(0, 5);

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