"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IClickatronTask } from "@/schemas/Clickatron";
import { useTaskUpdater } from '@/hooks/useTaskUpdater'; // Import the new hook
import { Loader2,
  History,
  FileImage,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Calendar,
  Type,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClickatronTaskHistoryProps {
  itemsPerPage?: number;
}

interface ClickatronTaskDisplay {
  _id: string; // Ensure _id is always a string for frontend display
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
}

interface PaginatedTaskResponse {
  data: ClickatronTaskDisplay[];
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

const getStatusColor = (status: IClickatronTask['status']) => {
  switch (status) {
    case 'completed':
      return 'bg-green-500/80 text-green-100';
    case 'failed':
      return 'bg-red-500/80 text-red-100';
    case 'processing':
      return 'bg-purple-500/80 text-purple-100';
    case 'queued':
      return 'bg-yellow-500/80 text-yellow-100';
    default:
      return 'bg-zinc-500/80 text-zinc-100';
  }
};

interface ClickatronTaskCardProps {
  task: ClickatronTaskDisplay;
  onClick: () => void;
}

function ClickatronTaskCard({ task, onClick }: ClickatronTaskCardProps) {
  const getOriginalDetails = () => {
    try {
      if (task.results?.details) {
        return JSON.parse(task.results.details);
      }
      if (typeof task.details === 'string') {
        return JSON.parse(task.details);
      }
      if (task.details?.prompt) {
        if (typeof task.details.prompt === 'string') {
          return JSON.parse(task.details.prompt);
        }
        return { prompt: task.details.prompt };
      }
      if (typeof task.details === 'object' && task.details !== null) {
        return task.details;
      }
      return null;
    } catch (error) {
      const fallbackText = task.details?.prompt || task.details || 'No details available';
      return { prompt: typeof fallbackText === 'string' ? fallbackText : 'No details available' };
    }
  };

  const originalDetails = getOriginalDetails();
  const displayTitle = task.title || `Thumbnail #${task._id?.toString().slice(-6)}`;
  const hasResults = task.status === 'completed' && task.results?.thumbnail?.gcs_url;
  const isClickable = task.status === 'completed' || task.status === 'failed';

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
          task.status === 'processing' ? "ring-1 ring-purple-500/30" : ""
        )}
        onClick={isClickable ? onClick : undefined}
      >
        <CardContent className="flex items-center p-4">
          {/* Thumbnail Preview */}
          <div className="h-12 w-12 rounded-lg bg-black/40 flex items-center justify-center mr-4 overflow-hidden">
            {hasResults ? (
              <img
                src={`/api/services/clickatron/thumbnail/${encodeURIComponent(task.results!.thumbnail.gcs_url.replace('https://storage.googleapis.com/clickatron/', ''))}`}
                alt="Thumbnail"
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <FileImage
              className={cn(
                "h-6 w-6 text-zinc-400",
                hasResults ? "hidden" : ""
              )}
              style={{ display: hasResults ? 'none' : 'block' }}
            />
          </div>

          {/* ClickatronTask Info */}
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
                {originalDetails ? Object.keys(originalDetails).length : 0} fields
              </div>
              {task.completedAt && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>

          {/* Status and Action */}
          <div className="ml-4 flex items-center gap-4">
            <div className="text-right min-h-[40px] flex flex-col items-end justify-center">
              {(task.status === 'queued' || task.status === 'listed') && (
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
                    className="flex items-center gap-3 text-base text-purple-300 font-semibold px-3 py-2 rounded-lg bg-purple-900/20 shadow animate-pulse"
                  >
                    <Loader2 className="h-5 w-5 mr-2 animate-spin text-purple-400" />
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
                {task.status === 'completed' && (
                  <motion.div
                    key="completed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2"
                  >
                    <ChevronRightIcon className="h-4 w-4 text-zinc-500" />
                  </motion.div>
                )}
                {task.status === 'failed' && (
                  <motion.div
                    key="failed"
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

export function ClickatronTaskHistory({ itemsPerPage = DEFAULT_ITEMS_PER_PAGE }: ClickatronTaskHistoryProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  useTaskUpdater(); // New hook to handle RTDB updates

  // Query for ALL Clickatron tasks (for in-progress filtering)
  const { data: allClickatronTasks } = useQuery<ClickatronTaskDisplay[]>({
    queryKey: ['clickatron-all-tasks'],
    queryFn: async () => {
      const response = await fetch('/api/services/clickatron/history'); // Fetch all tasks
      if (!response.ok) throw new Error('Failed to fetch all Clickatron tasks');
      const result: PaginatedTaskResponse = await response.json();
      return result.data || [];
    },
    enabled: true, // Ensure it subscribes to cache changes
    staleTime: Infinity, // Prevent automatic refetches, rely on RTDB updates
    gcTime: 1000 * 60 * 10, // Standard garbage collection
    refetchOnWindowFocus: false, // Prevent refetching on window focus
    refetchOnMount: false, // Prevent refetching on mount
    refetchOnReconnect: false, // Prevent refetching on reconnect
  });

  // Use paginated API for completed/failed tasks
  const { data: paginatedData, isLoading } = useQuery<PaginatedTaskResponse>({
    queryKey: ['clickatron-history', currentPage, itemsPerPage],
    queryFn: async () => {
      const response = await fetch(`/api/services/clickatron/history?page=${currentPage}&limit=${itemsPerPage}&status=completed,failed`);
      if (!response.ok) throw new Error('Failed to fetch task history');
      return response.json();
    },
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 5, // Keep data fresh for 5 mins
    gcTime: 1000 * 60 * 10,  // Garbage collect after 10 mins
    refetchOnWindowFocus: false,
  });

  // In-progress tasks from the 'allClickatronTasks' query
  const inProgressStatuses: IClickatronTask['status'][] = ['listed', 'queued', 'processing'];
  const inProgressTasks: ClickatronTaskDisplay[] = ((Array.isArray(allClickatronTasks) ? allClickatronTasks : [])
    .filter(task => inProgressStatuses.includes(task.status)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(task => ({
      _id: task._id, // _id is already present in ClickatronTaskDisplay
      userId: task.userId,
      title: task.title,
      details: task.details,
      status: task.status,
      results: task.results,
      error_message: task.error_message,
      createdAt: new Date(task.createdAt),
      updatedAt: new Date(task.updatedAt),
      completedAt: task.completedAt,
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
    router.push(`/dashboard/clickatron/task/${taskId}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-purple-400" />
          <h2 className="text-lg sm:text-xl font-medium text-zinc-100">Task History</h2>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span className="px-2 py-1 bg-zinc-800/50 rounded-full text-xs">
              {totalItems} total
            </span>
            {processingTasksCount > 0 && (
              <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded-full text-xs animate-pulse">
                {processingTasksCount} processing
              </span>
            )}
          </div>
        </div>
      </div>

      {/* In Progress Section */}
      {inProgressTasks && inProgressTasks.length > 0 && (
        <div className="mb-6">
          <h3 className="text-md font-semibold text-purple-300 mb-2">In Progress</h3>
          <div className="space-y-3 sm:space-y-4">
            {inProgressTasks.map((task: ClickatronTaskDisplay) => (
              <ClickatronTaskCard key={task._id} task={task} onClick={() => handleTaskClick(task._id)} />
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
        ) : currentTasks.length === 0 && inProgressTasks.length === 0 ? ( // Modified condition
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 bg-black/20 py-24 px-6">
            <FileImage className="h-12 w-12 text-zinc-500 mb-4" />
            <p className="text-zinc-400 text-center mb-2">No thumbnails generated yet</p>
            <p className="text-zinc-500 text-sm text-center">
              Create your first thumbnail using the form above to see it appear here.
            </p>
          </div>
        ) : (
          <>
            <h3 className="text-md font-semibold text-purple-300 mb-2">Completed</h3>
            {currentTasks.map((task) => (
              <ClickatronTaskCard
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