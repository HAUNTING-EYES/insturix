import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { useEditorContext } from "../../../contexts/editor-context";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";

import { usePexelsVideos } from "../../../hooks/use-pexels-video";
import { useAspectRatio } from "../../../hooks/use-aspect-ratio";
import { useTimeline } from "../../../contexts/timeline-context";
import { ClipOverlay, Overlay, OverlayType } from "../../../types";
import { VideoDetails } from "./video-details";

interface PexelsVideoFile {
  quality: string;
  link: string;
}

interface PexelsVideo {
  id: number | string;
  image: string;
  video_files: PexelsVideoFile[];
}

/**
 * VideoOverlayPanel is a component that provides video search and management functionality.
 * It allows users to:
 * - Search and browse videos from the Pexels API
 * - Add videos to the timeline as overlays
 * - Manage video properties when a video overlay is selected
 *
 * The component has two main states:
 * 1. Search/Browse mode: Shows a search input and grid of video thumbnails
 * 2. Edit mode: Shows video details panel when a video overlay is selected
 *
 * @component
 * @example
 * ```tsx
 * <VideoOverlayPanel />
 * ```
 */
export const VideoOverlayPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const { videos, isLoading, fetchVideos } = usePexelsVideos();
  const {
    addOverlay,
    overlays,
    durationInFrames,
    selectedOverlayId,
    changeOverlay,
  } = useEditorContext();
  const { findNextAvailablePosition } = useTimelinePositioning();
  const { getAspectRatioDimensions } = useAspectRatio();
  const { visibleRows } = useTimeline();
  const [localOverlay, setLocalOverlay] = useState<Overlay | null>(null);

  useEffect(() => {
    if (selectedOverlayId === null) {
      setLocalOverlay(null);
      return;
    }

    const selectedOverlay = overlays.find(
      (overlay) => overlay.id === selectedOverlayId
    );

    if (selectedOverlay?.type === OverlayType.VIDEO) {
      setLocalOverlay(selectedOverlay);
    }
  }, [selectedOverlayId, overlays]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      fetchVideos(searchQuery);
    }
  };

  const handleAddClip = async (video: PexelsVideo) => {
    try {
      const { width, height } = getAspectRatioDimensions();

      const { from, row } = findNextAvailablePosition(
        overlays,
        visibleRows,
        durationInFrames
      );

      // Find the best quality video file (prioritize UHD > HD > SD)
      const videoFile =
        video.video_files.find(
          (file: PexelsVideoFile) => file.quality === "uhd"
        ) ||
        video.video_files.find(
          (file: PexelsVideoFile) => file.quality === "hd"
        ) ||
        video.video_files.find(
          (file: PexelsVideoFile) => file.quality === "sd"
        ) ||
        video.video_files[0]; // Fallback to first file if no matches

      if (!videoFile?.link) {
        console.error('No video file link found');
        return;
      }

      // Create a public asset record for the Pexels video
      const response = await fetch('/api/services/editron/assets/create-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicUrl: videoFile.link,
          type: 'video',
          filename: `pexels-video-${video.id}.mp4`,
          userId: 'default-user', // TODO: Get actual userId from auth context
          thumbnail: video.image,
          dimensions: { width, height },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create asset record');
      }

      const { assetId } = await response.json();

      const newOverlay: Overlay = {
        left: 0,
        top: 0,
        width,
        height,
        durationInFrames: 200,
        from,
        id: Date.now(),
        rotation: 0,
        row,
        isDragging: false,
        type: OverlayType.VIDEO,
        content: video.image,
        src: videoFile.link, // Set src to the actual video URL for VideoLayerContent
        assetId, // Keep assetId for tracking
        videoStartTime: 0,
        styles: {
          opacity: 1,
          zIndex: 100,
          transform: "none",
          objectFit: "cover",
        },
      };

      addOverlay(newOverlay);
    } catch (error) {
      console.error('Error adding video to timeline:', error);
      // TODO: Show error toast to user
    }
  };

  const handleUpdateOverlay = (updatedOverlay: Overlay) => {
    setLocalOverlay(updatedOverlay);
    changeOverlay(updatedOverlay.id, updatedOverlay);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-background h-full">
      {!localOverlay ? (
        <>
          <div className="space-y-3">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                placeholder="Search videos..."
                value={searchQuery}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                onChange={(e) => setSearchQuery(e.target.value)}
                // NOTE: Stops zooming in on input focus on iPhone
                style={{ fontSize: "16px" }}
              />
              <Button
                type="submit"
                variant="default"
                disabled={isLoading}
                className="bg-muted hover:bg-accent text-foreground border-border"
              >
                <Search className="h-4 w-4" />
              </Button>
            </form>
            
            <div className="flex items-center justify-center">
              <a
                href="https://www.pexels.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground/80 transition-colors"
              >
                Powered by Pexels
              </a>
            </div>
          </div>

          <div className="columns-2 sm:columns-2 gap-3 space-y-3">
            {isLoading ? (
              Array.from({ length: 16 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="relative aspect-video w-full bg-gray-200 dark:bg-gray-800 animate-pulse rounded-sm break-inside-avoid mb-3"
                />
              ))
            ) : videos.length > 0 ? (
              videos.map((video) => (
                <button
                  key={video.id}
                  className="relative block w-full cursor-pointer border border-transparent rounded-md overflow-hidden break-inside-avoid mb-3"
                  onClick={() => handleAddClip(video)}
                >
                  <div className="relative">
                    <img
                      src={video.image}
                      alt={`Video thumbnail ${video.id}`}
                      className="w-full h-auto rounded-sm object-cover hover:opacity-60 transition-opacity duration-200"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition-opacity duration-200" />
                  </div>
                </button>
              ))
            ) : null}
          </div>
          
          {!isLoading && videos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-3">
              <Search className="h-12 w-12 opacity-20" />
              <div className="space-y-1">
                <p className="text-sm font-medium">No videos yet</p>
                <p className="text-xs opacity-70">Search for videos above to get started</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <VideoDetails
          localOverlay={localOverlay as ClipOverlay}
          setLocalOverlay={handleUpdateOverlay}
        />
      )}
    </div>
  );
};
