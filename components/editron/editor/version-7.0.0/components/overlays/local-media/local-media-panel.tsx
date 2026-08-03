"use client";

import { useEditorContext } from "../../../contexts/editor-context";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { useAspectRatio } from "../../../hooks/use-aspect-ratio";
import { useTimeline } from "../../../contexts/timeline-context";
import { Overlay, OverlayType } from "../../../types";
import { LocalMediaGallery } from "../../local-media/local-media-gallery";
import { getMediaDimensionsFromUrl } from "../../../utils/media-upload";
import { FPS } from "../../../constants";
import {
  UploadedAudioAssignmentDialog,
  useUploadedAudioAssignment,
} from "../sounds/uploaded-audio-assignment-dialog";

/**
 * LocalMediaPanel Component
 *
 * A panel that allows users to:
 * 1. Upload their own media assets (videos, images, audio)
 * 2. View and manage uploaded assets across all projects
 * 3. Add uploaded assets to the timeline
 * 
 * Assets are stored in the cloud and shared across all projects.
 */
export const LocalMediaPanel: React.FC = () => {
  const { addOverlay, overlays, durationInFrames } = useEditorContext();
  const { findNextAvailablePosition } = useTimelinePositioning();
  const { getAspectRatioDimensions, calculateFitToFrameDimensions } = useAspectRatio();
  const { visibleRows } = useTimeline();
  const uploadedAudioAssignment = useUploadedAudioAssignment();
  const { requestAssignment: requestUploadedAudioAssignment } = uploadedAudioAssignment;

  /**
   * Add a media file to the timeline
   * Calculates overlay dimensions to match media aspect ratio, centered in frame
   */
  const handleAddToTimeline = async (file: any) => {
    const frameDimensions = getAspectRatioDimensions();
    
    // Calculate dimensions that preserve media aspect ratio and fit in frame
    let width: number, height: number, left: number, top: number;
    
    // Get dimensions from file or extract from URL if not available
    let mediaDimensions = file.dimensions;
    
    if (!mediaDimensions && file.path && (file.type === 'video' || file.type === 'image')) {
      mediaDimensions = await getMediaDimensionsFromUrl(file.path, file.type);
    }
    
    if (mediaDimensions?.width && mediaDimensions?.height) {
      // Use actual media dimensions to calculate fitted size
      const fitted = calculateFitToFrameDimensions(
        mediaDimensions.width,
        mediaDimensions.height
      );
      width = fitted.width;
      height = fitted.height;
      // Center the overlay in the canvas
      left = (frameDimensions.width - fitted.width) / 2;
      top = (frameDimensions.height - fitted.height) / 2;
    } else {
      // Fallback to frame dimensions if media dimensions not available
      width = frameDimensions.width;
      height = frameDimensions.height;
      left = 0;
      top = 0;
    }
    
    const { from, row } = findNextAvailablePosition(
      overlays,
      visibleRows,
      durationInFrames
    );

    if (file.type === "audio") {
      requestUploadedAudioAssignment(
        {
          assetId: file.assetId,
          name: file.name,
        },
        {
          from,
          durationInFrames: file.duration ? Math.round(file.duration * FPS) : 200,
          requestedRow: row,
          startFromSound: 0,
        },
      );
      return;
    }

    let newOverlay: Overlay;

    if (file.type === "video") {
      newOverlay = {
        left,
        top,
        width,
        height,
        durationInFrames: file.duration ? Math.round(file.duration * FPS) : 200,
        from,
        id: Date.now(),
        rotation: 0,
        row,
        isDragging: false,
        type: OverlayType.VIDEO,
        assetId: file.assetId,
        content: file.thumbnail || "",
        src: file.path,
        videoStartTime: 0,
        styles: {
          opacity: 1,
          zIndex: 100,
          transform: "none",
          objectFit: "cover", // Keep as cover so user can crop if needed
        },
      };
    } else if (file.type === "image") {
      newOverlay = {
        left,
        top,
        width,
        height,
        durationInFrames: 200,
        from,
        id: Date.now(),
        rotation: 0,
        row,
        isDragging: false,
        type: OverlayType.IMAGE,
        assetId: file.assetId,
        src: file.path,
        content: file.path,
        styles: {
          objectFit: "cover", // Keep as cover so user can crop if needed
          animation: {
            enter: "fadeIn",
            exit: "fadeOut",
          },
        },
      };
    } else {
      return; // Unsupported file type
    }

    addOverlay(newOverlay);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-transparent dark:bg-transparent h-full">
      <UploadedAudioAssignmentDialog controller={uploadedAudioAssignment} />
      <LocalMediaGallery onSelectMedia={handleAddToTimeline} />
    </div>
  );
};

export default LocalMediaPanel;
