"use client";

import React, { useState, useRef, useCallback, lazy } from "react";

const SegmentExtractorLazy = lazy(() => import("../asset-library/segment-extractor"));
import { useLocalMedia } from "../../contexts/local-media-context";
import { formatBytes, formatDuration } from "../../utils/format-utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Trash2, Image, Video, Music, Search, Tag, ImageIcon, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * User Media Gallery Component
 *
 * Displays the user's uploaded media assets and provides functionality to:
 * - Upload new media assets
 * - Filter media by type (image, video, audio)
 * - Preview media assets
 * - Delete media assets
 * - Add media to the timeline
 * 
 * Assets are stored in the cloud (GCS + MongoDB) and shared across all projects.
 */
export function LocalMediaGallery({
  onSelectMedia,
}: {
  onSelectMedia?: (mediaFile: any) => void;
}) {
  const { localMediaFiles, addMediaFile, removeMediaFile, isLoading } =
    useLocalMedia();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Semantic search with debounce
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch('/api/services/editron/media/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.trim(), limit: 20 }),
        });
        const data = await res.json();
        if (data.success && data.results) {
          setSearchResults(data.results);
        }
      } catch (err) {
        console.error('[AssetSearch] Failed:', err);
      } finally {
        setSearching(false);
      }
    }, 400); // 400ms debounce
  }, []);

  // Filter media files based on active tab
  const filteredMedia = localMediaFiles.filter((file) => {
    if (activeTab === "all") return true;
    return file.type === activeTab;
  });

  // Handle file upload
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      try {
        setUploadError(null);
        await addMediaFile(files[0]);
        // Reset the input value to allow uploading the same file again
        event.target.value = "";
      } catch (error) {
        console.error("Error uploading file:", error);
        setUploadError("Failed to upload file. Please try again.");
        event.target.value = "";
      }
    }
  };

  // Handle upload button click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Handle media selection
  const handleMediaSelect = (file: any) => {
    setSelectedFile(file);
    setPreviewOpen(true);
  };

  // Add media to timeline
  const handleAddToTimeline = () => {
    if (selectedFile && onSelectMedia) {
      onSelectMedia(selectedFile);
      setPreviewOpen(false);
    }
  };

  // Render preview content based on file type
  const renderPreviewContent = () => {
    if (!selectedFile) return null;

    const commonClasses =
      "max-h-[50vh] w-full object-contain rounded-lg shadow-sm";

    switch (selectedFile.type) {
      case "image":
        return (
          <div className="relative bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
            <img
              src={selectedFile.path}
              alt={selectedFile.name}
              className={`${commonClasses} object-contain`}
            />
          </div>
        );
      case "video":
        return (
          <div className="relative bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
            <video
              src={selectedFile.path}
              controls
              className={commonClasses}
              controlsList="nodownload"
              playsInline
            />
          </div>
        );
      case "audio":
        return (
          <div className="flex flex-col items-center space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-900/30 rounded-full flex items-center justify-center">
              <Music className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
            </div>
            <audio
              src={
                selectedFile.path.startsWith("http")
                  ? selectedFile.path
                  : `${window.location.origin}${selectedFile.path}`
              }
              controls
              className="w-[280px] max-w-full"
              controlsList="nodownload"
            />
          </div>
        );
      default:
        return (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Unsupported file type
          </div>
        );
    }
  };

  // Render media item
  const renderMediaItem = (file: any) => {
    return (
      <div
        key={file.id}
        className="relative group/item border dark:border-gray-700 border-gray-200 rounded-md overflow-hidden cursor-pointer
          hover:border-zinc-500 dark:hover:border-zinc-400 transition-all
          bg-white dark:bg-gray-800/80 shadow-sm hover:shadow-md"
        draggable
        onDragStart={(e) => {
          // Encode asset data for timeline drop
          e.dataTransfer.setData('application/editron-asset', JSON.stringify({
            assetId: file.assetId || file.id,
            type: file.type,
            name: file.name,
            path: file.path,
            thumbnail: file.thumbnail,
            duration: file.duration,
            dimensions: file.dimensions,
            size: file.size,
          }));
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => handleMediaSelect(file)}
      >
        {/* Thumbnail */}
        <div className="aspect-video relative">
          {file.type === "image" && (
            <img
              src={file.thumbnail || file.path}
              alt={file.name}
              className="w-full h-full object-cover bg-gray-50 dark:bg-gray-900"
            />
          )}
          {file.type === "video" && (
            <>
              <img
                src={file.thumbnail}
                alt={file.name}
                className="w-full h-full object-cover bg-gray-50 dark:bg-gray-900"
              />
              <div className="absolute bottom-1.5 right-1.5 bg-black/75 dark:bg-black/90 text-white text-xs px-1.5 py-0.5 rounded-md">
                {formatDuration(file.duration)}
              </div>
            </>
          )}
          {file.type === "audio" && (
            <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <Music className="w-10 h-10 text-gray-400 dark:text-gray-500" />
            </div>
          )}
        </div>

        {/* Media info */}
        <div className="p-2.5">
          <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
            {file.name}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatBytes(file.size)}
            </p>
            {file.score != null && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                {Math.round(file.score * 100)}%
              </span>
            )}
          </div>
          {/* Tags */}
          {file.tags?.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-1">
              {file.tags.slice(0, 3).map((tag: string) => (
                <span key={tag} className="text-[9px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                  {tag}
                </span>
              ))}
              {file.tags.length > 3 && (
                <span className="text-[9px] text-zinc-400">+{file.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* Delete button */}
        <button
          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 
            text-white p-1.5 rounded-full opacity-0 group-hover/item:opacity-100 transition-all duration-200 
            shadow-sm hover:shadow-md transform hover:scale-105"
          onClick={(e) => {
            e.stopPropagation();
            removeMediaFile(file.id);
          }}
          title="Delete media"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm">My Assets</h2>
        <div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={handleUploadClick}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload
          </Button>
          <input
            ref={fileInputRef}
            id="file-upload"
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            accept="image/*,video/*,audio/*"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Semantic Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search assets... (e.g. 'close-up of product')"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
        />
        {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-muted-foreground" />}
      </div>

      {uploadError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
          {uploadError}
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col"
      >
        <TabsList className="w-full grid grid-cols-4 bg-muted/50 backdrop-blur-sm rounded-sm border border-border gap-1">
          <TabsTrigger
            value="all"
            className="data-[state=active]:bg-accent data-[state=active]:text-foreground 
            rounded-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <span className="flex items-center gap-2 text-xs">All</span>
          </TabsTrigger>
          <TabsTrigger
            value="images"
            className="data-[state=active]:bg-accent data-[state=active]:text-foreground 
            rounded-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <span className="flex items-center gap-2 text-xs">
              <Image className="w-3 h-3" />
              Images
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="videos"
            className="data-[state=active]:bg-accent data-[state=active]:text-foreground 
            rounded-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <span className="flex items-center gap-2 text-xs">
              <Video className="w-3 h-3" />
              Videos
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="audio"
            className="data-[state=active]:bg-accent data-[state=active]:text-foreground 
            rounded-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <span className="flex items-center gap-2 text-xs">
              <Music className="w-3 h-3" />
              Audio
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="flex-1 overflow-y-auto p-0">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-sm text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <p>Loading media files...</p>
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Upload className="w-4 h-4 text-gray-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">No assets yet</p>
                <p className="text-xs text-gray-500">
                  Upload your first asset to get started
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUploadClick}
                className="text-xs"
              >
                Upload Asset
              </Button>
            </div>
          ) : searchResults ? (
            <div>
              <div className="text-[10px] text-muted-foreground mb-2 px-1">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                {searchResults.map((r: any) => renderMediaItem({
                  ...r,
                  id: r.assetId,
                  name: r.filename,
                  path: r.url,
                }))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
              {filteredMedia.map(renderMediaItem)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Media Preview Dialog — with Segment Extraction for video/audio */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl rounded-xl p-6 sm:p-8">
          <DialogHeader className="mb-3">
            <DialogTitle className="text-sm">{selectedFile?.name}</DialogTitle>
            <DialogDescription className="text-xs">
              {selectedFile?.type} • {formatBytes(selectedFile?.size)}
              {selectedFile?.duration ? ` • ${formatDuration(selectedFile.duration)}` : ''}
            </DialogDescription>
          </DialogHeader>

          {/* Show segment extractor for video/audio, normal preview for images */}
          {selectedFile?.duration && (selectedFile?.type === 'video' || selectedFile?.type === 'audio') ? (
            <React.Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
              <SegmentExtractorLazy
                asset={{
                  assetId: selectedFile.assetId || selectedFile.id,
                  name: selectedFile.name,
                  type: selectedFile.type,
                  path: selectedFile.path,
                  duration: selectedFile.duration,
                  thumbnail: selectedFile.thumbnail,
                }}
                onClose={() => setPreviewOpen(false)}
              />
            </React.Suspense>
          ) : (
            <div className="flex justify-center">{renderPreviewContent()}</div>
          )}

          <div className="flex justify-end mt-3 gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button variant="default" size="sm" onClick={handleAddToTimeline}>
              Add Full Asset to Timeline
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
