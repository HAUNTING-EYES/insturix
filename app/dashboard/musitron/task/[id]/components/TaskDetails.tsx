// app/dashboard/musitron/task/[id]/components/TaskDetails.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Download,
  Calendar,
  Clock,
  FileText,
  Hash,
  AlertCircle,
  Music,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const getStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-green-500/80 text-green-100";
    case "failed":
      return "bg-red-500/80 text-red-100";
    case "processing":
      return "bg-purple-500/80 text-purple-100";
    default:
      return "bg-zinc-500/80 text-zinc-100";
  }
};

import { Separator } from "@/components/ui/separator";


function getAudioContentType(url: string | undefined) {
  if (!url) return "audio/mpeg";
  if (url.endsWith(".wav")) return "audio/wav";
  if (url.endsWith(".ogg")) return "audio/ogg";
  if (url.endsWith(".mp3")) return "audio/mpeg";
  return "audio/mpeg";
}

function getAudioFileExtension(url: string | undefined) {
  if (!url) return "mp3";
  if (url.endsWith(".wav")) return "wav";
  if (url.endsWith(".ogg")) return "ogg";
  if (url.endsWith(".mp3")) return "mp3";
  return "mp3";
}

export function TaskDetails({ task, signedUrlApi }: TaskDetailsProps) {
  const router = useRouter();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [audioError, setAudioError] = useState(false);

  // Failed task UI (music player style, only error.action)
  if (task.status === "failed") {
    return (
      <Card className="w-full shadow-lg border border-zinc-300/30">
        <CardHeader className="flex flex-row items-center gap-3">
          <Music className="text-yellow-400" />
          <CardTitle className="flex-1 text-zinc-100">{task.title}</CardTitle>
          <span className="ml-2 text-zinc-500 font-semibold text-base">Failed</span>
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
          {task.error?.action && (
            <div className="flex items-center gap-2 bg-zinc-100 border border-zinc-200 rounded px-4 py-3 text-red-700 font-medium">
              <AlertCircle className="w-5 h-5 mr-2 text-red-500" />
              <span className="text-red-700">{task.error.action}</span>
            </div>
          )}
          {/* Lyrics */}
          {task.lyrics && (
            <div className="mt-4">
              <div className="text-xs text-zinc-400 mb-1 flex items-center gap-1">
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
            <div className="text-xs text-zinc-400 mb-1 flex items-center gap-1">
              <Hash className="w-4 h-4" />
              Task ID
            </div>
            <div className="bg-zinc-900/50 p-2 rounded-lg border border-zinc-700">
              <code className="text-xs text-zinc-200 font-mono">{task._id}</code>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fetch signed URL for audio file
  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (!task.gcs_url || task.status !== "completed") return;
      setLoadingUrl(true);
      setAudioError(false);
      try {
        const contentType = getAudioContentType(task.gcs_url);
        const endpoint =
          signedUrlApi ||
          "/api/services/musitron/gcs/sign";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: task.gcs_url.split("/").pop(),
            contentType,
            gcsUrl: task.gcs_url
          })
        });
        const data = await res.json();
        if (data.url) setSignedUrl(data.url);
        else setAudioError(true);
      } catch {
        setAudioError(true);
      } finally {
        setLoadingUrl(false);
      }
    };
    fetchSignedUrl();
  }, [task.gcs_url, task.status, signedUrlApi]);

  const handleDownload = async () => {
    if (!signedUrl) return;
    setDownloadLoading(true);
    try {
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      const ext = getAudioFileExtension(task.gcs_url);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${task.title || "music"}-${task._id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      // Optionally show error
    } finally {
      setDownloadLoading(false);
    }
  };
  return;
}