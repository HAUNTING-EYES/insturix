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

  // Responsive: On mobile, show music player first, on desktop keep original order
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="text-zinc-400 hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to History
          </Button>
          <div className="h-6 w-px bg-zinc-700"></div>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">
              {task.title || `Music #${task._id.slice(-6)}`}
            </h1>
            <p className="text-sm text-zinc-400">Task Details</p>
          </div>
        </div>
        <Badge
          className={cn(
            "whitespace-nowrap text-sm border-0",
            getStatusColor(task.status)
          )}
        >
          {task.status}
        </Badge>
      </div>

      {/* Responsive grid: music player first only on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Music Player: order-1 on mobile, order-2 on desktop */}
        <div className="order-1 lg:order-2 space-y-6 lg:space-y-0">
          {task.status === "completed" && task.gcs_url ? (
            <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-zinc-100">
                    <Music className="h-5 w-5 text-purple-400" />
                    Generated Music
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={handleDownload}
                    disabled={downloadLoading || !signedUrl}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {downloadLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Download
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Music Player */}
                <div className="relative overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 flex flex-col items-center">
                  {loadingUrl ? (
                    <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                  ) : audioError ? (
                    <p className="text-zinc-400 text-sm">
                      Failed to load audio file.
                    </p>
                  ) : (
                    signedUrl && (
                      <audio
                        controls
                        src={signedUrl}
                        className="w-full"
                        style={{ outline: "none" }}
                        {...{ type: getAudioContentType(task.gcs_url) }}
                      />
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Music className="h-16 w-16 text-zinc-500 mb-4" />
                <p className="text-zinc-400 text-center mb-2">
                  {task.status === "processing"
                    ? "Music is being generated..."
                    : task.status === "failed"
                    ? "Music generation failed"
                    : "No music available"}
                </p>
                {task.status === "processing" && (
                  <div className="flex items-center gap-2 text-sm text-purple-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        {/* Task Information: order-2 on mobile, order-1 on desktop */}
        <div className="order-2 lg:order-1 space-y-6">
          {/* User Input */}
          <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-zinc-100">
                <FileText className="h-5 w-5 text-purple-400" />
                User Input
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-300">
                    Style
                  </label>
                  <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                    <p className="text-sm text-zinc-100 whitespace-pre-wrap">
                      {task.style}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-300">
                    Instrumental Only
                  </label>
                  <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                    <p className="text-sm text-zinc-100 whitespace-pre-wrap">
                      {task.instrumental_only ? "Yes" : "No"}
                    </p>
                  </div>
                </div>
                {!task.instrumental_only && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-zinc-300">
                      Lyrics
                    </label>
                    <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                      <p className="text-sm text-zinc-100 whitespace-pre-wrap">
                        {task.lyrics || "N/A"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Task Metadata */}
          <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-zinc-100">
                <Hash className="h-5 w-5 text-purple-400" />
                Task Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-zinc-300">
                    Created
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4 text-zinc-400" />
                    <span className="text-sm text-zinc-200">
                      {new Date(task.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4 text-zinc-400" />
                    <span className="text-sm text-zinc-200">
                      {new Date(task.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
                {task.completedAt && (
                  <div>
                    <label className="text-sm font-medium text-zinc-300">
                      Completed
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4 text-zinc-400" />
                      <span className="text-sm text-zinc-200">
                        {new Date(task.completedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-4 w-4 text-zinc-400" />
                      <span className="text-sm text-zinc-200">
                        {new Date(task.completedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-300">
                  Task ID
                </label>
                <div className="bg-zinc-900/50 p-2 rounded-lg border border-zinc-700 mt-1">
                  <code className="text-sm text-zinc-200 font-mono">
                    {task._id}
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error Message */}
          {task.status === "failed" && task.error?.message && (
            <Card className="bg-red-500/10 border-red-500/20 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-200">
                  <AlertCircle className="h-5 w-5" />
                  Error Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-red-300">{task.error.message}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}