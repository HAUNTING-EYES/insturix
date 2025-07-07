"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, CheckCircle, AlertCircle, Loader, Eye } from 'lucide-react';
import { TaskNotification } from '@/types/rtdb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface TaskNotificationPopupProps {
  notification: TaskNotification;
  onClose: () => void;
  onMarkAsRead: () => void;
  isDismissing?: boolean;
}

const statusConfig = {
  listed: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-100', label: 'Listed' },
  queued: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-100', label: 'Queued' },
  processing: { icon: Loader, color: 'text-orange-500', bg: 'bg-orange-100', label: 'Processing' },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100', label: 'Failed' },
};

export function TaskNotificationPopup({
  notification,
  onClose,
  onMarkAsRead,
  isDismissing = false,
}: TaskNotificationPopupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const router = useRouter();
  const { taskUpdate, serviceName } = notification;
  const config = statusConfig[taskUpdate.status];
  const StatusIcon = config.icon;

  const isClickable = (serviceName === 'alyzitron' || serviceName === 'clickatron') &&
    (taskUpdate.status === 'completed' || taskUpdate.status === 'failed');

  const handleClick = () => {
    if (!isClickable) return;
    
    if (!notification.isRead) {
      onMarkAsRead();
    }
    
    // Navigate to the appropriate service page
    if (serviceName === 'alyzitron') {
      const url = `/dashboard/${serviceName}/report/${notification.taskId}`;
      router.push(url);
    } else if (serviceName === 'clickatron') {
      const url = `/dashboard/${serviceName}`;
      router.push(url);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 300, scale: 0.8 }}
      animate={{
        opacity: isDismissing ? 0 : 1,
        x: isDismissing ? 300 : 0,
        scale: isDismissing ? 0.8 : 1
      }}
      exit={{ opacity: 0, x: 300, scale: 0.8 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="w-80 max-w-sm"
    >
      <Card
        className={`
          p-4 bg-black/90 backdrop-blur-xl border-zinc-800 transition-all duration-200
          ${notification.isRead ? 'opacity-70' : 'opacity-100'}
          ${isClickable ? 'cursor-pointer hover:scale-105 hover:bg-black/95' : 'cursor-default'}
        `}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        onClick={handleClick}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className={`p-2 rounded-full ${config.bg}`}>
              <StatusIcon 
                className={`h-4 w-4 ${config.color} ${taskUpdate.status === 'processing' ? 'animate-spin' : ''}`} 
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs capitalize">
                  {serviceName}
                </Badge>
                <Badge variant={taskUpdate.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                  {config.label}
                </Badge>
              </div>
              <p className="text-sm font-medium text-zinc-100 mt-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">
                {taskUpdate.title || `Task ${notification.taskId.slice(0, 8)}`}
              </p>
              <p className="text-xs text-zinc-400">
                {formatTime(notification.timestamp)}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onClose();
            }}
            className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-100 shrink-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 pt-3 border-t border-zinc-800"
            >
              {taskUpdate.description && (
                <p className="text-xs text-zinc-300 mb-2">
                  {taskUpdate.description}
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {isClickable ? 'Click to view details' : 'Details unavailable'}
                </span>
                {isClickable && <Eye className="h-3 w-3 text-zinc-500" />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}