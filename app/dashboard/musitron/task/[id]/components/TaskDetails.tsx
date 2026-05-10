// app/dashboard/musitron/task/[id]/components/TaskDetails.tsx
"use client";

import React, { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Calendar,
  FileText,
  Hash,
  AlertCircle,
  Music,
} from "lucide-react";

interface MusitronTask {
  _id: string;
  clerkUserId: string;
  title: string;
  style: string;
  instrumental_only: boolean;
  lyrics: string;
  status: "listed" | "processing" | "completed" | "failed";
  gcs_url?: string;
  error?: {
    code: string;
    message: string;
    action?: string;
  };
  unread: boolean;
  createdAt: string;
  updatedAt: string;
  refunded?: boolean;
  completedAt?: string;
}

interface TaskDetailsProps {
  task: MusitronTask;
  signedUrlApi?: string; // Optional override for signed url endpoint
}

import { Separator } from "@/components/ui/separator";



export function TaskDetails({ task, signedUrlApi }: TaskDetailsProps) {
  // Fetch signed URL for audio file
  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (!task.gcs_url || task.status !== "completed") return;
    };
    fetchSignedUrl();
  }, [task.gcs_url, task.status, signedUrlApi]);

  // Failed task UI (music player style, only error.action)
  if (task.status === "failed") {
    return (
      <Card className="w-full shadow-lg border border-zinc-300/30">
        <CardHeader className="flex flex-row items-center gap-3">
          <Music className="text-yellow-400" />
          <CardTitle className="flex-1 text-zinc-100">{task.title}</CardTitle>
          <span className="ml-2 text-zinc-500 font-semibold text-[14px]">Failed</span>
        </CardHeader>
        <Separator />
        <CardContent className="py-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <Calendar className="w-4 h-4" />
            <span>{new Date(task.createdAt).toLocaleString()}</span>
            <span className="mx-2">•</span>
            <FileText className="w-4 h-4" />
            <span>{task.style}</span>
          </div>
          {task.error?.message && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded px-4 py-3 text-red-400 font-medium">
              <AlertCircle className="w-5 h-5 mr-1 text-red-500 shrink-0 mt-0.5" />
              <span>{task.error.message}</span>
            </div>
          )}
          {task.error?.action && (
            <div className="flex items-center gap-2 bg-zinc-800/50 border border-zinc-700 rounded px-4 py-3 text-zinc-300 font-medium">
              <span className="text-zinc-400">Suggested Action:</span>
              <span>{task.error.action}</span>
            </div>
          )}
          {/* Lyrics */}
          {task.lyrics && (
            <div className="mt-4">
              <div className="text-[11px] text-zinc-400 mb-1 flex items-center gap-1">
                <FileText className="w-4 h-4" />
                Lyrics
              </div>
              <div className="whitespace-pre-line text-sm text-zinc-100 bg-zinc-900/60 rounded p-3 border border-zinc-800">
                {task.lyrics}
              </div>
            </div>
          )}
          {/* Task ID */}
          <div className="mt-4">
            <div className="text-[11px] text-zinc-400 mb-1 flex items-center gap-1">
              <Hash className="w-4 h-4" />
              Task ID
            </div>
            <div className="bg-zinc-900/50 p-2 rounded-lg border border-zinc-700">
              <code className="text-[11px] text-zinc-200 font-mono">{task._id}</code>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}