"use client";

import React, { useState } from 'react';
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { History, Music2, ChevronRight as ChevronRightIcon, Calendar, Type, Clock, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MusitronTaskDisplay {
  _id: string;
  status: 'listed' | 'processing' | 'complete' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  options: {
    customMode: boolean;
    title: string;
  };
}

const demoTasks: MusitronTaskDisplay[] = [
  {
    _id: "demo-listed",
    status: "listed",
    createdAt: new Date(),
    updatedAt: new Date(),
    options: { customMode: false, title: "Listed Demo Track" },
  },
  {
    _id: "demo-processing",
    status: "processing",
    createdAt: new Date(),
    updatedAt: new Date(),
    options: { customMode: true, title: "Processing Demo Track" },
  },
  {
    _id: "demo-complete",
    status: "complete",
    createdAt: new Date(),
    updatedAt: new Date(),
    options: { customMode: false, title: "Completed Demo Track" },
  },
  {
    _id: "demo-failed",
    status: "failed",
    createdAt: new Date(),
    updatedAt: new Date(),
    options: { customMode: true, title: "Failed Demo Track" },
  },
];

function MusitronTaskCard({ task }: { task: MusitronTaskDisplay }) {
  const router = useRouter();
  const displayTitle = task.options.title || `Music Task #${task._id?.toString().slice(-6)}`;
  const isClickable = task.status === "complete" || task.status === "failed";
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
                {task.status === 'complete' && (
                  <motion.div
                    key="complete"
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
  const [tasks] = useState<MusitronTaskDisplay[]>(demoTasks);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <History className="h-5 w-5 text-yellow-400" />
        <h2 className="text-lg sm:text-xl font-medium text-zinc-100">Task History</h2>
        <span className="px-2 py-1 bg-zinc-800/50 rounded-full text-xs text-zinc-400">
          {tasks.length} total
        </span>
      </div>
      <div className="space-y-3 sm:space-y-4 min-h-[400px] relative">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 bg-black/20 py-24 px-6">
            <Music2 className="h-12 w-12 text-zinc-500 mb-4" />
            <p className="text-zinc-400 text-center mb-2">No music generated yet</p>
            <p className="text-zinc-500 text-sm text-center">
              Create your first music using the form above to see it appear here.
            </p>
          </div>
        ) : (
          <>
            {tasks.map((task) => (
              <MusitronTaskCard key={task._id} task={task} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}