"use client";

// UI Components
import { SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./components/sidebar/app-sidebar";
import { Editor } from "./components/core/editor";
import { SidebarProvider as UISidebarProvider } from "@/components/ui/sidebar";
import { SidebarProvider as EditorSidebarProvider } from "./contexts/sidebar-context";

// Context Providers
import { EditorProvider } from "./contexts/editor-context";

// Custom Hooks
import { useOverlays } from "./hooks/use-overlays";
import { useVideoPlayer } from "./hooks/use-video-player";
import { useTimelineClick } from "./hooks/use-timeline-click";
import { useAspectRatio } from "./hooks/use-aspect-ratio";
import { useCompositionDuration } from "./hooks/use-composition-duration";
import { useHistory } from "./hooks/use-history";

// Types
import { Overlay } from "./types";
import { useRendering } from "./hooks/use-rendering";
import {
  AUTO_SAVE_INTERVAL,
  DEFAULT_OVERLAYS,
  FPS,
  RENDER_TYPE,
} from "./constants";
import { TimelineProvider } from "./contexts/timeline-context";

// Autosave Components
import { AutosaveRecoveryDialog } from "./components/autosave/autosave-recovery-dialog";
import { AutosaveStatus } from "./components/autosave/autosave-status";
import { AIToolsDebugPanel } from "./components/debug/ai-tools-debug-panel";
import { useState, useEffect } from "react";
import { useAutosave } from "./hooks/use-autosave";
import { LocalMediaProvider } from "./contexts/local-media-context";
import { KeyframeProvider } from "./contexts/keyframe-context";
import { AssetLoadingProvider } from "./contexts/asset-loading-context";
import { AIActivityOverlay } from "./components/ai-activity-overlay";

export default function ReactVideoEditor({ projectId }: { projectId: string }) {
  // Autosave state
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [autosaveTimestamp, setAutosaveTimestamp] = useState<number | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isAIProcessing, setIsAIProcessing] = useState(false);

  // Overlay management hooks
  const {
    overlays,
    setOverlays,
    selectedOverlayId,
    setSelectedOverlayId,
    changeOverlay,
    addOverlay,
    deleteOverlay,
    duplicateOverlay,
    splitOverlay,
    deleteOverlaysByRow,
    updateOverlayStyles,
    resetOverlays,
  } = useOverlays(DEFAULT_OVERLAYS);

  // Video player controls and state
  const { isPlaying, currentFrame, playerRef, togglePlayPause, formatTime } =
    useVideoPlayer();

  // Composition duration calculations
  const { durationInFrames, durationInSeconds } =
    useCompositionDuration(overlays);

  // Aspect ratio and player dimension management
  const {
    aspectRatio,
    setAspectRatio,
    playerDimensions,
    updatePlayerDimensions,
    getAspectRatioDimensions,
  } = useAspectRatio();

  // Event handlers
  const handleOverlayChange = (updatedOverlay: Overlay) => {
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  const { width: compositionWidth, height: compositionHeight } =
    getAspectRatioDimensions();

  const handleTimelineClick = useTimelineClick(playerRef, durationInFrames);

  const inputProps = {
    overlays,
    durationInFrames,
    fps: FPS,
    width: compositionWidth,
    height: compositionHeight,
    src: "",
  };

  const { renderMedia, state } = useRendering(
    "TestComponent",
    inputProps,
    RENDER_TYPE,
    projectId // Enable resume-on-refresh
  );

  // Replace history management code with hook
  const { undo, redo, canUndo, canRedo } = useHistory(overlays, setOverlays);

  // AI activity tracking for real-time overlay
  const [aiActions, setAIActions] = useState<Array<{
    id: string;
    toolName: string;
    friendlyName: string;
    status: 'running' | 'done';
    startedAt: number;
  }>>([]);

  // Create the editor state object to be saved
  const editorState = {
    overlays,
    aspectRatio,
    playerDimensions: getAspectRatioDimensions(),
    fps: FPS,
    durationInFrames,
  };

  // Implment load state
  const { saveState, loadState } = useAutosave(projectId, editorState, {
    interval: AUTO_SAVE_INTERVAL,
    onSave: () => {
      setIsSaving(false);
      setLastSaveTime(Date.now());
    },
    onLoad: (loadedState) => {
      console.log("Applying loaded state to editor:", loadedState);
      if (loadedState) {
        // Apply loaded state to editor
        setOverlays(loadedState.overlays || []);
        if (loadedState.aspectRatio) setAspectRatio(loadedState.aspectRatio);
        if (loadedState.playerDimensions)
          updatePlayerDimensions(
            loadedState.playerDimensions.width,
            loadedState.playerDimensions.height
          );
      }
    },
    onAutosaveDetected: (timestamp) => {
      // Autosave detection is now handled by automatic load on mount
      // This callback is kept for backward compatibility but not used
      console.log("Autosave detected at:", new Date(timestamp));
    },
  });

  // Mark initial load as complete after component mounts
  useEffect(() => {
    setInitialLoadComplete(true);
  }, []);

  // Load project state on mount
  useEffect(() => {
    const loadProjectState = async () => {
      try {
        const loadedState = await loadState();
        if (loadedState) {
          console.log("Loaded project state from MongoDB:", loadedState);
          // State will be applied via onLoad callback
        } else {
          console.log("No saved state found, using default overlays");
        }
      } catch (error) {
        console.error("Error loading project state:", error);
      }
    };

    loadProjectState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // Only run when projectId changes (loadState is stable)

  // Handle recovery dialog actions
  const handleRecoverAutosave = async () => {
    const loadedState = await loadState();
    console.log("loadedState", loadedState);
    setShowRecoveryDialog(false);
  };

  const handleDiscardAutosave = () => {
    setShowRecoveryDialog(false);
  };

  // Manual save function for use in keyboard shortcuts or save button
  const handleManualSave = async () => {
    setIsSaving(true);
    await saveState();
  };

  // Set up keyboard shortcut for manual save (Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleManualSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editorState]);

  // Combine all editor context values
  const editorContextValue = {
    // Overlay management
    overlays,
    setOverlays,
    selectedOverlayId,
    setSelectedOverlayId,
    changeOverlay,
    handleOverlayChange,
    addOverlay,
    deleteOverlay,
    duplicateOverlay,
    splitOverlay,
    resetOverlays,

    // Player controls
    isPlaying,
    currentFrame,
    playerRef,
    togglePlayPause,
    formatTime,
    handleTimelineClick,
    playbackRate,
    setPlaybackRate,

    // Dimensions and duration
    aspectRatio,
    setAspectRatio,
    playerDimensions,
    updatePlayerDimensions,
    getAspectRatioDimensions,
    durationInFrames,
    durationInSeconds,

    // Add renderType to the context
    renderType: RENDER_TYPE,
    projectId,
    renderMedia,
    state,

    deleteOverlaysByRow,

    // History management
    undo,
    redo,
    canUndo,
    canRedo,

    // New style management
    updateOverlayStyles,

    // Autosave
    saveProject: handleManualSave,

    // Debugging
    getProjectState: () => ({
      overlays,
      aspectRatio,
      playerDimensions,
      durationInFrames,
      fps: FPS,
    }),

    // AI Processing State
    isAIProcessing,
    setIsAIProcessing,

    // AI Activity Tracking (for real-time overlay)
    aiActions,
    setAIActions,
  };

  return (
    <UISidebarProvider defaultOpen={false} className="relative isolate h-[calc(100vh-4rem)] w-full overflow-hidden">
      <EditorSidebarProvider>
        <KeyframeProvider>
          <TimelineProvider>
            <EditorProvider value={editorContextValue}>
              <LocalMediaProvider>
                <AssetLoadingProvider>
                  <AppSidebar />
                  <SidebarInset className="relative">
                    <Editor />
                    {/* AI Activity Overlay — shows real-time tool execution */}
                    <AIActivityOverlay />
                  </SidebarInset>

                  {/* Autosave Status Indicator */}
                  <AutosaveStatus
                    isSaving={isSaving}
                    lastSaveTime={lastSaveTime}
                  />

                  {/* Autosave Recovery Dialog */}
                  {showRecoveryDialog && autosaveTimestamp && (
                    <AutosaveRecoveryDialog
                      projectId={projectId}
                      timestamp={autosaveTimestamp}
                      onRecover={handleRecoverAutosave}
                      onDiscard={handleDiscardAutosave}
                      onClose={() => setShowRecoveryDialog(false)}
                    />
                  )}

                  {/* AI Tools Debug Panel (Development) */}
                  {process.env.NODE_ENV === "development" && (
                    <AIToolsDebugPanel />
                  )}


                </AssetLoadingProvider>
              </LocalMediaProvider>
            </EditorProvider>
          </TimelineProvider>
        </KeyframeProvider>
      </EditorSidebarProvider>
    </UISidebarProvider>
  );
}
