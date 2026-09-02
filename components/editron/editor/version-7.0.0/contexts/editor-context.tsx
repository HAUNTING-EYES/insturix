import React, { createContext, useContext, ReactNode } from "react";
import { Overlay, AspectRatio, CaptionStyles, NamedMarker } from "../types";
import type { RenderMusicDeliveryMode } from "@/lib/editron/services/render-delivery-manifest";
import type { ProjectRevisionV1 } from "@/lib/editron/services/project-service";

// Define the shape of the context
interface EditorContextProps {
  // Overlay Management
  overlays: Overlay[]; // Array of all overlays in the editor
  selectedOverlayId: number | null; // Currently selected overlay's ID
  setSelectedOverlayId: any; // Function to select an overlay
  changeOverlay: (
    // Function to update overlay properties
    id: number,
    updater: Partial<Overlay> | ((overlay: Overlay) => Overlay)
  ) => void;
  setOverlays: (overlays: Overlay[]) => void;

  // Player State
  isPlaying: boolean; // Current playback state
  currentFrame: number; // Current frame position in the video
  playerRef: React.RefObject<any>; // Reference to the video player component
  playbackRate: number; // Current playback speed multiplier
  setPlaybackRate: (rate: number) => void; // Update playback speed

  // Player Controls
  togglePlayPause: () => void; // Toggle play/pause state
  formatTime: (frame: number) => string; // Convert frame number to timestamp
  seekTo: (frame: number) => void; // Seek to a specific frame (updates both state AND player)
  handleTimelineClick: (e: React.MouseEvent<HTMLDivElement>) => void; // Handle timeline scrubbing

  // Overlay Operations
  handleOverlayChange: (updatedOverlay: Overlay) => void; // Handle changes to overlay properties
  addOverlay: (overlay: Overlay) => void; // Add new overlay
  deleteOverlay: (id: number) => void; // Remove overlay
  duplicateOverlay: (id: number) => void; // Clone existing overlay
  splitOverlay: (id: number, splitPosition: number) => void; // Split overlay at given position

  // Video Dimensions and Aspect Ratio
  aspectRatio: AspectRatio; // Current aspect ratio setting
  setAspectRatio: (ratio: AspectRatio) => void; // Update aspect ratio
  playerDimensions: { width: number; height: number }; // Current player dimensions
  updatePlayerDimensions: (width: number, height: number) => void; // Update player size
  getAspectRatioDimensions: () => { width: number; height: number }; // Calculate dimensions based on ratio

  // Video Properties
  durationInFrames: number; // Total number of frames
  durationInSeconds: number; // Total duration in seconds
  renderMedia: (musicDeliveryMode?: RenderMusicDeliveryMode) => Promise<void>; // Trigger media rendering
  cancelRender: () => void; // Cancel in-progress render
  state: any; // General state object with proper typing

  // Timeline
  deleteOverlaysByRow: (row: number) => void; // Delete overlays by row

  // Add these new history-related props
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // New style management prop
  updateOverlayStyles: (
    overlayId: number,
    styles: Partial<CaptionStyles>
  ) => void;

  // New resetOverlays prop
  resetOverlays: () => void;

  // Autosave functionality
  saveProject?: () => Promise<void>; // Manual save function

  // Add renderType to the context
  renderType: "ssr" | "lambda";

  // Project ID for render history
  projectId?: string;
  projectRevision: ProjectRevisionV1 | null;

  // Debugging
  getProjectState: () => any;

  // AI Processing State
  isAIProcessing: boolean;
  setIsAIProcessing: (isProcessing: boolean) => void;
  aiActions: Array<{ id: string; toolName: string; status: 'running' | 'done' }>;

  // Named timeline markers (D4) — optional; provided by react-video-editor.
  markers?: NamedMarker[];
  setMarkers?: (markers: NamedMarker[]) => void;

  // Autosave load (used by the v2 recovery modal) — optional.
  loadState?: () => Promise<any>;
}

// Create the context with undefined as default value
const EditorContext = createContext<EditorContextProps | undefined>(undefined);

// Provider component that wraps parts of the app that need access to the context
export const EditorProvider: React.FC<{
  value: EditorContextProps;
  children: ReactNode;
}> = ({ value, children }) => {
  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
};

// Custom hook that components can use to access the context
// Throws an error if used outside of EditorProvider
export const useEditorContext = (): EditorContextProps => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditorContext must be used within an EditorProvider");
  }
  return context;
};
