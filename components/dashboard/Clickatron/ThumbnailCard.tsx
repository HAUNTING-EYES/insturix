"use client";

import { useState, useRef } from "react";
import { IClickatronTask } from "@/schemas/Clickatron";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Calendar,
  Type,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";

interface ThumbnailCardProps {
  task: IClickatronTask;
}

const getStatusColor = (status: IClickatronTask['status']) => {
  switch (status) {
    case 'completed':
      return 'bg-green-500/80 text-green-100';
    case 'failed':
      return 'bg-red-500/80 text-red-100';
    case 'processing':
      return 'bg-purple-500/80 text-purple-100 animate-pulse';
    case 'queued':
      return 'bg-yellow-500/80 text-yellow-100';
    default:
      return 'bg-zinc-500/80 text-zinc-100';
  }
};

export function ThumbnailCard({ task }: ThumbnailCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  if (!task) return null;

  const thumbnailUrl = task.results?.thumbnail.gcs_url
    ? `/api/services/clickatron/thumbnail/${encodeURIComponent(task.results.thumbnail.gcs_url.replace('https://storage.googleapis.com/clickatron/', ''))}`
    : null;

  // Parse the original user input details
  const getOriginalDetails = () => {
    try {
      // First try results.details (the actual user input)
      if (task.results?.details) {
        return JSON.parse(task.results.details);
      }
      
      // Handle new format where details is directly a JSON string
      if (typeof task.details === 'string') {
        return JSON.parse(task.details);
      }
      
      // Handle old format where details has a prompt property
      if (task.details?.prompt) {
        if (typeof task.details.prompt === 'string') {
          return JSON.parse(task.details.prompt);
        }
        return { prompt: task.details.prompt };
      }
      
      // If details is an object, return it directly
      if (typeof task.details === 'object' && task.details !== null) {
        return task.details;
      }
      
      return null;
    } catch (error) {
      // If parsing fails, create a fallback object
      const fallbackText = task.details?.prompt || task.details || 'No details available';
      return { prompt: typeof fallbackText === 'string' ? fallbackText : 'No details available' };
    }
  };

  const originalDetails = getOriginalDetails();
  const displayTitle = task.title || `Thumbnail #${task._id?.toString().slice(-6)}`;

  const handleDownload = async () => {
    if (!thumbnailUrl) return;
    
    try {
      const response = await fetch(thumbnailUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `thumbnail-${task._id}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const openImageViewer = () => {
    setIsImageViewerOpen(true);
  };

  const closeImageViewer = () => {
    setIsImageViewerOpen(false);
    setIsZoomed(false);
  };

  const toggleZoom = () => {
    setIsZoomed(!isZoomed);
  };

  return (
    <>
      <Card className={cn(
        "flex flex-col bg-black/40 border-zinc-800 backdrop-blur-xl transition-all duration-300 hover:bg-black/50 cursor-pointer",
        isExpanded && "ring-1 ring-purple-500/30"
      )} onClick={toggleExpand}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-medium leading-snug text-zinc-100 line-clamp-2">
                {displayTitle}
              </CardTitle>
              <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(task.createdAt).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-1">
                  <Type className="h-3 w-3" />
                  {originalDetails ? Object.keys(originalDetails).length : 0} fields
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={cn("whitespace-nowrap text-xs border-0", getStatusColor(task.status))}>
                {task.status}
              </Badge>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              )}
            </div>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0 space-y-4" onClick={(e) => e.stopPropagation()}>
            {/* Detailed Information */}
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-medium text-zinc-300 mb-2">Original User Input</h4>
                <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700 space-y-2">
                  {originalDetails ? (
                    <div className="space-y-2">
                      {Object.entries(originalDetails).map(([key, value]) => (
                        <div key={key} className="text-sm">
                          <span className="text-zinc-400 capitalize font-medium">
                            {key.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                          </span>
                          <p className="text-zinc-100 mt-1">
                            {typeof value === 'string' ? value : JSON.stringify(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-100">
                      {task.details?.prompt || 'No details available'}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-400">Created:</span>
                  <p className="text-zinc-200 mt-1">{new Date(task.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-zinc-400">Status:</span>
                  <p className="text-zinc-200 mt-1 capitalize">{task.status}</p>
                </div>
                {task.completedAt && (
                  <div>
                    <span className="text-zinc-400">Completed:</span>
                    <p className="text-zinc-200 mt-1">{new Date(task.completedAt).toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <span className="text-zinc-400">Task ID:</span>
                  <p className="text-zinc-200 mt-1 font-mono text-xs">
                    {task._id?.toString().slice(-8)}
                  </p>
                </div>
              </div>
            </div>

            {/* Thumbnail Section */}
            {task.status === 'completed' && thumbnailUrl && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-zinc-300">Generated Thumbnail</h4>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700/50"
                      onClick={openImageViewer}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700/50"
                      onClick={handleDownload}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
                
                {/* Lazy loaded thumbnail preview */}
                <div className="relative overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/50">
                  {!imageLoaded && !imageError && (
                    <div className="aspect-video flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                    </div>
                  )}
                  {imageError && (
                    <div className="aspect-video flex items-center justify-center">
                      <p className="text-zinc-400 text-sm">Failed to load image</p>
                    </div>
                  )}
                  <img
                    src={thumbnailUrl}
                    alt="Generated Thumbnail"
                    className={cn(
                      "w-full h-auto cursor-pointer transition-opacity duration-300 hover:opacity-80",
                      imageLoaded ? "opacity-100" : "opacity-0"
                    )}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageError(true)}
                    onClick={openImageViewer}
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            {/* Error Section */}
            {task.status === 'failed' && task.error_message && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <h4 className="text-xs font-medium text-red-200 mb-2">Error Details</h4>
                <p className="text-sm text-red-300">{task.error_message}</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Image Viewer Modal */}
      <Dialog open={isImageViewerOpen} onOpenChange={closeImageViewer}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] max-w-6xl w-full h-[90vh] bg-black/95 border border-zinc-800 p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg">
            <DialogTitle className="sr-only">Thumbnail Viewer for: {displayTitle}</DialogTitle>
            <div className="relative w-full h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-medium text-zinc-100">Thumbnail Viewer</h3>
                  <p className="text-sm text-zinc-400 line-clamp-1">{displayTitle}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700/50"
                    onClick={toggleZoom}
                  >
                    {isZoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700/50"
                    onClick={handleDownload}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <DialogPrimitive.Close className="rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none data-[state=open]:bg-neutral-100 data-[state=open]:text-neutral-500 dark:data-[state=open]:bg-neutral-800 dark:data-[state=open]:text-neutral-400">
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700/50"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </DialogPrimitive.Close>
                </div>
              </div>
  
                {/* Image Container */}
              <div className="flex-1 overflow-auto p-4">
                <div className="flex items-center justify-center min-h-full">
                  {thumbnailUrl && (
                    <img
                      ref={imageRef}
                      src={thumbnailUrl}
                      alt="Generated Thumbnail"
                      className={cn(
                        "max-w-full max-h-full object-contain transition-transform duration-300 cursor-pointer",
                        isZoomed ? "scale-150" : "scale-100"
                      )}
                      onClick={toggleZoom}
                    />
                  )}
                </div>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>
    </>
  );
}