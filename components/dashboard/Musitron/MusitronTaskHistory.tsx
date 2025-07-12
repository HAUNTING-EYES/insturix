"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IMusitronTask } from "@/schemas/Musitron";
import { useMusitronTaskUpdater } from '@/hooks/useMusitronTaskUpdater';
import { Loader2,
  History,
  Music2,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Calendar,
  Type,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MusitronTaskHistoryProps {
  itemsPerPage?: number;
}

interface MusitronTaskDisplay {
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
  updatedAt: Date;
}

interface PaginatedTaskResponse {
  data: MusitronTaskDisplay[];
  pagination: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

const DEFAULT_ITEMS_PER_PAGE = 8;

const getStatusColor = (status: IMusitronTask['status']) => {
  switch (status) {
    case 'complete':
      return 'bg-green-500/80 text-green-100';
    case 'failed':
      return 'bg-red-500/80 text-red-100';
    case 'processing':
      return 'bg-yellow-500/80 text-yellow-100';
    case 'queued':
      return 'bg-blue-500/80 text-blue-100';
    default:
      return 'bg-zinc-500/80 text-zinc-100';
  }
};

interface MusitronTaskCardProps {
  task: MusitronTaskDisplay;
  onClick: () => void;
}

function MusitronTaskCard({ task, onClick }: MusitronTaskCardProps) {
  const displayTitle = task.options.title || `Music Task #${task._id?.toString().slice(-6)}`;
  const hasResults = task.status === 'complete' && task.gcsAudioLink;
  const isClickable = task.status === 'complete' || task.status === 'failed';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
    >
      <Card
        className={cn(
          "relative bg-black/40 border-zinc-800 backdrop-blur-xl transition-all duration-300",
          isClickable ? "cursor-pointer hover:bg-black/50" : "",
          task.status === 'processing' ? "ring-1 ring-yellow-500/30" : ""
        )}
        onClick={isClickable ? onClick : undefined}
      >
        <CardContent className="flex items-center p-4">
          {/* Music Icon Preview */}
          <div className="h-12 w-12 rounded-lg bg-black/40 flex items-center justify-center mr-4 overflow-hidden">
            <Music2
              className={cn(
                "h-6 w-6 text-zinc-400"
              )}
            />
          </div>

          {/* MusitronTask Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-medium text-zinc-100 truncate" title={displayTitle}>
                {displayTitle}
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(task.createdAt).toLocaleDateString()}
              </div>
              <div className="flex items-center gap-1">
                <Type className="h-3 w-3" />
                {task.options.customMode ? "Custom Mode" : "Simple Mode"}
              </div>
              {task.status === 'complete' && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(task.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>

          {/* Status and Action */}
          <div className="ml-4 flex items-center gap-4">
            <div className="text-right min-h-[40px] flex flex-col items-end justify-center">
              {(task.status === 'queued' || task.status === 'complete' || task.status === 'failed') && (
                <Badge className={cn("whitespace-nowrap text-xs border-0 mb-1", getStatusColor(task.status))}>
                  {task.status}
                </Badge>
              )}
              
              <AnimatePresence mode="wait" initial={false}>
                {task.status === 'processing' && (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 text-base text-yellow-300 font-semibold px-3 py-2 rounded-lg bg-yellow-900/20 shadow animate-pulse"
                  >
                    <Loader2 className="h-5 w-5 mr-2 animate-spin text-yellow-400" />
                    <span>Processing</span>
                  </motion.div>
                )}
                {task.status === 'queued' && (
                  <motion.div
                    key="queued"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-xs text-zinc-400"
                  >
                    Queued
                  </motion.div>
                )}
                {(task.status === 'complete' || task.status === 'failed') && (
                  <motion.div
                    key="completed-failed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2"
                  >
                    <ChevronRightIcon className="h-4 w-4 text-zinc-500" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function MusitronTaskHistory({ itemsPerPage = DEFAULT_ITEMS_PER_PAGE }: MusitronTaskHistoryProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  useMusitronTaskUpdater(); // Hook to handle RTDB updates

  // Query for ALL Musitron tasks (for in-progress filtering)
  const { data: allMusitronTasks } = useQuery<MusitronTaskDisplay[]>({
    queryKey: ['musitron-all-tasks'],
    queryFn: async () => {
      const response = await fetch('/api/services/musitron/history'); // Fetch all tasks
      if (!response.ok) throw new Error('Failed to fetch all Musitron tasks');
      const result: PaginatedTaskResponse = await response.json();
      return result.data || [];
    },
    enabled: true,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Use paginated API for completed/failed tasks
  const { data: paginatedData, isLoading } = useQuery<PaginatedTaskResponse>({
    queryKey: ['musitron-history', currentPage, itemsPerPage],
    queryFn: async () => {
      const response = await fetch(`/api/services/musitron/history?page=${currentPage}&limit=${itemsPerPage}&status=complete,failed`);
      if (!response.ok) throw new Error('Failed to fetch task history');
      return response.json();
    },
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  // In-progress tasks from the 'allMusitronTasks' query
  const inProgressStatuses: IMusitronTask['status'][] = ['queued', 'processing'];
  const inProgressTasks: MusitronTaskDisplay[] = ((Array.isArray(allMusitronTasks) ? allMusitronTasks : [])
    .filter(task => inProgressStatuses.includes(task.status)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(task => ({
      _id: task._id,
      userId: task.userId,
      status: task.status,
      gcsAudioLink: task.gcsAudioLink,
      createdAt: new Date(task.createdAt),
      options: task.options,
      error: task.error,
      refunded: task.refunded,
      updatedAt: new Date(task.updatedAt),
    }));

  const currentTasks = (paginatedData?.data || []).slice().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const totalPages = paginatedData?.pagination?.totalPages || 1;
  const totalItems = paginatedData?.pagination?.totalItems || 0;

  const processingTasksCount = inProgressTasks.length;

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handleTaskClick = (taskId: string) => {
    router.push(`/dashboard/musitron/task/${taskId}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-yellow-400" />
          <h2 className="text-lg sm:text-xl font-medium text-zinc-100">Task History</h2>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span className="px-2 py-1 bg-zinc-800/50 rounded-full text-xs">
              {totalItems} total
            </span>
            {processingTasksCount > 0 && (
              <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-xs animate-pulse">
                {processingTasksCount} processing
              </span>
            )}
          </div>
        </div>
      </div>

      {/* In Progress Section */}
      {inProgressTasks && inProgressTasks.length > 0 && (
        <div className="mb-6">
          <h3 className="text-md font-semibold text-yellow-300 mb-2">In Progress</h3>
          <div className="space-y-3 sm:space-y-4">
            {inProgressTasks.map((task: MusitronTaskDisplay) => (
              <MusitronTaskCard key={task._id} task={task} onClick={() => handleTaskClick(task._id)} />
            ))}
          </div>
        </div>
      )}

      {/* Completed Section */}
      <div className="space-y-3 sm:space-y-4 min-h-[400px] relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : currentTasks.length === 0 && inProgressTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 bg-black/20 py-24 px-6">
            <Music2 className="h-12 w-12 text-zinc-500 mb-4" />
            <p className="text-zinc-400 text-center mb-2">No music generated yet</p>
            <p className="text-zinc-500 text-sm text-center">
              Create your first music using the form above to see it appear here.
            </p>
          </div>
        ) : (
          <>
            <h3 className="text-md font-semibold text-yellow-300 mb-2">Completed</h3>
            {currentTasks.map((task) => (
              <MusitronTaskCard
                key={task._id}
                task={task}
                onClick={() => handleTaskClick(task._id)}
              />
            ))}

            {/* Empty state for current page */}
            {currentTasks.length === 0 && !isLoading && (
              <div className="text-center py-8 text-zinc-500">
                No tasks on this page.
              </div>
            )}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={currentPage === 1 || isLoading}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            <ChevronLeft className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">Previous</span>
          </Button>
          <span className="text-xs sm:text-sm text-zinc-400 order-1 sm:order-2 text-center">
            Page {currentPage} of {totalPages}
            <span className="hidden sm:inline"> ({totalItems} total)</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || isLoading}
            className="w-full sm:w-auto order-3"
          >
            <span className="text-xs sm:text-sm">Next</span>
            <ChevronRight className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}