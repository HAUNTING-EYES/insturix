"use client";

import React, { useState } from 'react';
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History, Music2, ChevronRight as ChevronRightIcon, Calendar, Clock, Loader2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MusitronTask } from "@/app/api/services/musitron/types/shared";
import { useQuery } from "@tanstack/react-query";
import { useTaskUpdater } from "@/hooks/useTaskUpdater";

function MusitronTaskCard({ task }: { task: MusitronTask }) {
  const router = useRouter();
  const displayTitle = task.title || `Music Task #${task._id?.toString().slice(-6)}`;
  const isClickable = task.status === "completed" || task.status === "failed";
  const handleClick = () => {
    if (isClickable) {
      router.push(`/dashboard/musitron/task/${task._id}`);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Card
        className={cn(
          "relative bg-black/40 border-zinc-800 backdrop-blur-xl transition-all duration-300",
          isClickable ? "cursor-pointer hover:bg-black/50" : ""
        )}
        onClick={isClickable ? handleClick : undefined}
      >
        <CardContent className="flex items-center p-4">
          <div className="h-12 w-12 rounded-lg bg-black/40 flex items-center justify-center mr-4 overflow-hidden">
            <Music2 className="h-6 w-6 text-zinc-400" />
          </div>
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
              {task.status === 'completed' && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(task.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>
          <div className="ml-4 flex items-center gap-4">
            <div className="text-right min-h-[40px] flex flex-col items-end justify-center">
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
                {task.status === 'listed' && (
                  <motion.div
                    key="listed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-xs text-zinc-400"
                  >
                    Listed
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
                    <span className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Failed
                    </span>
                    <ChevronRightIcon className="h-4 w-4 text-zinc-400 opacity-60" />
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
                    <ChevronRightIcon className="h-4 w-4 text-zinc-400 opacity-60" />
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

export function MusitronTaskHistory() {
  useTaskUpdater();
  // Use SERVER pagination metadata to avoid capped totals
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;
  const IN_PROGRESS_STATUSES: MusitronTask["status"][] = ["listed", "processing"];

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["musitron-tasks", currentPage, ITEMS_PER_PAGE],
    queryFn: async () => {
      const response = await fetch(`/api/services/musitron/history?page=${currentPage}&limit=${ITEMS_PER_PAGE}`);
      if (!response.ok) throw new Error("Failed to fetch Musitron tasks");
      const result = await response.json();
      const list = Array.isArray(result?.data) ? result.data : [];
      const mapped: MusitronTask[] = (list as any[]).map((task: any) => ({
        ...task,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
        ...(task.completedAt ? { completedAt: new Date(task.completedAt) } : {}),
      }));
      return {
        items: mapped,
        pagination: {
          totalItems: Number(result?.pagination?.totalItems) || mapped.length,
          totalPages: Number(result?.pagination?.totalPages) || 1,
          currentPage: Number(result?.pagination?.currentPage) || currentPage,
          itemsPerPage: Number(result?.pagination?.itemsPerPage) || ITEMS_PER_PAGE,
          hasNext: Boolean(result?.pagination?.hasNext),
          hasPrev: Boolean(result?.pagination?.hasPrev),
        },
      };
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const tasksData: MusitronTask[] = Array.isArray(pageData?.items) ? pageData!.items : [];
  const pagination = pageData?.pagination || { totalItems: tasksData.length, totalPages: 1, currentPage, itemsPerPage: ITEMS_PER_PAGE };

  // In-progress tasks (from current page items)
  const inProgressTasks = tasksData.filter((t) => IN_PROGRESS_STATUSES.includes(t.status as any));

  // Completed/failed tasks (from current page items)
  const completedTasks = tasksData.filter((t) => t.status === "completed" || t.status === "failed");

  // Use server-provided totals for UI
  const totalPages = Math.max(1, Number(pagination.totalPages) || 1);
  const totalItems = Number(pagination.totalItems) || tasksData.length;

  const handlePreviousPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const handleNextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <History className="h-5 w-5 text-yellow-400" />
        <h2 className="text-lg sm:text-xl font-medium text-zinc-100">Task History</h2>
        <span className="px-2 py-1 bg-zinc-800/50 rounded-full text-xs text-zinc-400">
          {totalItems} total
        </span>
      </div>

      {/* In Progress Section */}
      {inProgressTasks.length > 0 && (
        <div className="mb-6">
          <h3 className="text-md font-semibold text-yellow-300 mb-2">In Progress</h3>
          <div className="space-y-3 sm:space-y-4">
            {inProgressTasks.map((task: MusitronTask) => (
              <MusitronTaskCard key={task._id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* Completed Section */}
      <div className="space-y-3 sm:space-y-4 min-h-[400px] relative">
        {completedTasks.length === 0 && inProgressTasks.length === 0 ? (
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
            {completedTasks.map((task: MusitronTask) => (
              <MusitronTaskCard key={task._id} task={task} />
            ))}
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