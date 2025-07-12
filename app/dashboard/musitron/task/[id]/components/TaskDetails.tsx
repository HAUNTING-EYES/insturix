"use client";

import React from "react";
import { useState } from "react";
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
  Music2,
  Loader2,
  PlayCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Types } from "mongoose";
import { IMusitronTask } from "@/schemas/Musitron";

interface TaskDetailsProps {
  task: IMusitronTask;
}

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

export function TaskDetails({ task }: TaskDetailsProps) {
  const router = useRouter();
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const displayTitle = task.options.title || `Music Task #${(task._id as Types.ObjectId).toString().slice(-6)}`;
  const audioUrl = task.gcsAudioLink;

  // Track if component is mounted
  const isMounted = React.useRef(true);

  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleDownload = async () => {
    if (!audioUrl) return;

    setDownloadLoading(true);
    try {
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `music-${task._id}.mp3`; // Assuming mp3 format
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      if (isMounted.current) setDownloadLoading(false);
    }
  };

  const getFileSize = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const bytes = parseInt(contentLength);
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
      }
      return 'Unknown size';
    } catch {
      return 'Unknown size';
    }
  };

  const [fileSize, setFileSize] = useState<string>('Calculating...');

  // Get file size when component mounts
  React.useEffect(() => {
    let cancelled = false;
    if (audioUrl) {
      getFileSize(audioUrl).then(size => {
        if (!cancelled && isMounted.current) setFileSize(size);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

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
            <h1 className="text-2xl font-semibold text-zinc-100">{displayTitle}</h1>
            <p className="text-sm text-zinc-400">Task Details</p>
          </div>
        </div>
        <Badge className={cn("whitespace-nowrap text-sm border-0", getStatusColor(task.status))}>
          {task.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Task Information */}
        <div className="space-y-6">
          {/* User Input */}
          <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-zinc-100">
                <FileText className="h-5 w-5 text-yellow-400" />
                User Input
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-300 capitalize">
                    Title
                  </label>
                  <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                    <p className="text-sm text-zinc-100 whitespace-pre-wrap">
                      {task.options.title}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-300 capitalize">
                    Mode
                  </label>
                  <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                    <p className="text-sm text-zinc-100 whitespace-pre-wrap">
                      {task.options.customMode ? "Custom Mode" : "Simple Mode"}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-300 capitalize">
                    Instrumental
                  </label>
                  <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                    <p className="text-sm text-zinc-100 whitespace-pre-wrap">
                      {task.options.instrumental ? "Yes" : "No"}
                    </p>
                  </div>
                </div>
                {task.options.songDescription && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-zinc-300 capitalize">
                      Song Description
                    </label>
                    <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                      <p className="text-sm text-zinc-100 whitespace-pre-wrap">
                        {task.options.songDescription}
                      </p>
                    </div>
                  </div>
                )}
                {task.options.style && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-zinc-300 capitalize">
                      Style
                    </label>
                    <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                      <p className="text-sm text-zinc-100 whitespace-pre-wrap">
                        {task.options.style}
                      </p>
                    </div>
                  </div>
                )}
                {task.options.lyrics && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-zinc-300 capitalize">
                      Lyrics
                    </label>
                    <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                      <p className="text-sm text-zinc-100 whitespace-pre-wrap">
                        {task.options.lyrics}
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
                <Hash className="h-5 w-5 text-yellow-400" />
                Task Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-zinc-300">Created</label>
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
                {task.status === 'complete' && (
                  <div>
                    <label className="text-sm font-medium text-zinc-300">Completed</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4 text-zinc-400" />
                      <span className="text-sm text-zinc-200">
                        {new Date(task.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-4 w-4 text-zinc-400" />
                      <span className="text-sm text-zinc-200">
                        {new Date(task.updatedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-300">Task ID</label>
                <div className="bg-zinc-900/50 p-2 rounded-lg border border-zinc-700 mt-1">
                  <code className="text-sm text-zinc-200 font-mono">{(task._id as Types.ObjectId).toString()}</code>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error Message */}
          {task.status === 'failed' && task.error && (
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

        {/* Right Column - Generated Music */}
        <div className="space-y-6">
          {task.status === 'complete' && audioUrl ? (
            <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-zinc-100">
                    <Music2 className="h-5 w-5 text-yellow-400" />
                    Generated Music
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={handleDownload}
                    disabled={downloadLoading}
                    className="bg-yellow-600 hover:bg-yellow-700"
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
                {/* Audio Player */}
                <div className="relative overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 flex items-center justify-center">
                  {!audioLoaded && !audioError && (
                    <div className="aspect-video flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-yellow-500" />
                    </div>
                  )}
                  {audioError && (
                    <div className="aspect-video flex items-center justify-center">
                      <p className="text-zinc-400 text-sm">Failed to load audio</p>
                    </div>
                  )}
                  <audio
                    controls
                    src={audioUrl}
                    className={cn(
                      "w-full transition-opacity duration-300",
                      audioLoaded ? "opacity-100" : "opacity-0"
                    )}
                    onCanPlayThrough={() => setAudioLoaded(true)}
                    onError={() => setAudioError(true)}
                  >
                    Your browser does not support the audio element.
                  </audio>
                </div>

                {/* File Information */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="text-zinc-400">File Size</label>
                      <p className="text-zinc-200">{fileSize}</p>
                    </div>
                    <div>
                      <label className="text-zinc-400">Format</label>
                      <p className="text-zinc-200">MP3</p> {/* Assuming MP3 */}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Music2 className="h-16 w-16 text-zinc-500 mb-4" />
                <p className="text-zinc-400 text-center mb-2">
                  {task.status === 'processing' ? 'Music is being generated...' : 
                   task.status === 'failed' ? 'Music generation failed' : 
                   'No music available'}
                </p>
                {task.status === 'processing' && (
                  <div className="flex items-center gap-2 text-sm text-yellow-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}