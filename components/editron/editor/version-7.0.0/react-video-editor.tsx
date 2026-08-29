"use client";

// UI Components
import { SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./components/sidebar/app-sidebar";
import { Editor } from "./components/core/editor";
import { V2Editor } from "./v2/v2-editor";
import { VideoRegenBanner } from "./components/core/video-regen-banner";
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
import { Overlay, NamedMarker } from "./types";
import { useRendering } from "./hooks/use-rendering";
import {
  AUTO_SAVE_INTERVAL,
  DEFAULT_OVERLAYS,
  FPS,
  RENDER_TYPE,
} from "./constants";
import { TimelineProvider } from "./contexts/timeline-context";

// Autosave Components
import { AutosaveStatus } from "./components/autosave/autosave-status";
import { AIToolsDebugPanel } from "./components/debug/ai-tools-debug-panel";
import { useState, useEffect, useMemo } from "react";
import { useAutosave } from "./hooks/use-autosave";
import { LocalMediaProvider } from "./contexts/local-media-context";
import { KeyframeProvider } from "./contexts/keyframe-context";
import { AssetLoadingProvider } from "./contexts/asset-loading-context";
import { NativeVideoAudioRightsDialog } from "./components/rendering/native-video-audio-rights-dialog";
import {
  confirmAndReloadExportAudioRights,
  findUnverifiedNativeAudioAssetIds,
  findUnverifiedUploadedExportAudioAssetIds,
} from "./utils/native-video-audio-rights-client";
import type { RenderMusicDeliveryMode } from "@/lib/editron/services/render-delivery-manifest";
import { useCallback } from "react";

export default function ReactVideoEditor({ projectId, variant = "v1" }: { projectId: string; variant?: "v1" | "v2" }) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [markers, setMarkers] = useState<NamedMarker[]>([]);
  const [pendingRightsRenderMode, setPendingRightsRenderMode] =
    useState<RenderMusicDeliveryMode | null>(null);
  const [resumeRightsRenderMode, setResumeRightsRenderMode] =
    useState<RenderMusicDeliveryMode | null>(null);

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
  const { isPlaying, currentFrame, playerRef, togglePlayPause, formatTime, seekTo } =
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

  const inputProps = useMemo(() => ({
    overlays,
    durationInFrames,
    fps: FPS,
    width: compositionWidth,
    height: compositionHeight,
    src: "",
  }), [overlays, durationInFrames, compositionWidth, compositionHeight]);

  const { renderMedia, state, cancelRender } = useRendering(
    "TestComponent",
    inputProps,
    RENDER_TYPE,
    projectId // Enable resume-on-refresh
  );
  const unverifiedNativeAudioAssetIds = useMemo(
    () => findUnverifiedNativeAudioAssetIds(overlays),
    [overlays],
  );
  const unverifiedUploadedAudioAssetIds = useMemo(
    () => findUnverifiedUploadedExportAudioAssetIds(overlays),
    [overlays],
  );
  const unverifiedExportAudioCount =
    unverifiedNativeAudioAssetIds.length + unverifiedUploadedAudioAssetIds.length;
  const requestRender = useCallback(async (
    musicDeliveryMode: RenderMusicDeliveryMode = "embedded",
  ) => {
    if (unverifiedExportAudioCount > 0) {
      setPendingRightsRenderMode(musicDeliveryMode);
      return;
    }
    await renderMedia(musicDeliveryMode);
  }, [renderMedia, unverifiedExportAudioCount]);
  const confirmExportAudioRights = useCallback(async () => {
    if (!pendingRightsRenderMode) return;
    const refreshedOverlays = await confirmAndReloadExportAudioRights({
      projectId,
      confirmNativeVideoAudio: unverifiedNativeAudioAssetIds.length > 0,
      confirmUploadedExportAudio: unverifiedUploadedAudioAssetIds.length > 0,
    });
    setOverlays(refreshedOverlays);
    setResumeRightsRenderMode(pendingRightsRenderMode);
    setPendingRightsRenderMode(null);
  }, [
    pendingRightsRenderMode,
    projectId,
    setOverlays,
    unverifiedNativeAudioAssetIds.length,
    unverifiedUploadedAudioAssetIds.length,
  ]);

  useEffect(() => {
    if (
      !resumeRightsRenderMode
      || unverifiedExportAudioCount > 0
    ) {
      return;
    }
    const musicDeliveryMode = resumeRightsRenderMode;
    setResumeRightsRenderMode(null);
    void renderMedia(musicDeliveryMode);
  }, [
    renderMedia,
    resumeRightsRenderMode,
    unverifiedExportAudioCount,
  ]);

  // Replace history management code with hook
  const { undo, redo, canUndo, canRedo } = useHistory(overlays, setOverlays);

  // Create the editor state object to be saved
  // IMPORTANT: must include the same keys as loadState returns (fps, durationInFrames)
  // otherwise JSON.stringify snapshot comparison always fails → unnecessary autosaves
  const editorState = {
    overlays,
    aspectRatio,
    playerDimensions: getAspectRatioDimensions(),
    fps: FPS,
    durationInFrames,
    markers,
  };

  // Implment load state
  const { saveState, loadState, projectRevision } = useAutosave(projectId, editorState, {
    interval: AUTO_SAVE_INTERVAL,
    pauseAutosave: isAIProcessing,
    onSave: () => {
      setIsSaving(false);
      setLastSaveTime(Date.now());
    },
    onLoad: (loadedState) => {
      if (loadedState) {
        // Apply loaded state to editor
        setOverlays(loadedState.overlays || []);
        if (loadedState.aspectRatio) setAspectRatio(loadedState.aspectRatio);
        if (loadedState.playerDimensions)
          updatePlayerDimensions(
            loadedState.playerDimensions.width,
            loadedState.playerDimensions.height
          );
        if (Array.isArray(loadedState.markers)) setMarkers(loadedState.markers);
      }
    },
  });

  // Load project state on mount
  useEffect(() => {
    const loadProjectState = async () => {
      try {
        await loadState();
      } catch (error) {
        console.error("Error loading project state:", error);
      }
    };

    loadProjectState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // Only run when projectId changes (loadState is stable)

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
    seekTo,
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
    projectRevision,
    renderMedia: requestRender,
    cancelRender,
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
      markers,
    }),

    // AI Processing State
    isAIProcessing,
    setIsAIProcessing,
    aiActions: [],

    // Named timeline markers (D4) + autosave load for the v2 recovery modal.
    markers,
    setMarkers,
    loadState,
  };

  return (
    <UISidebarProvider defaultOpen={false} className="relative isolate h-[calc(100vh-4rem)] w-full overflow-hidden">
      <EditorSidebarProvider>
        <KeyframeProvider>
          <TimelineProvider>
            <EditorProvider value={editorContextValue}>
              <LocalMediaProvider>
                <AssetLoadingProvider>
                  {variant !== "v2" && <AppSidebar />}
                  <SidebarInset className="relative">
                    <VideoRegenBanner
                      projectId={projectId}
                      onOverlaysRefresh={async () => {
                        try {
                          const res = await fetch(`/api/services/editron/projects/${projectId}`);
                          if (res.ok) {
                            const data = await res.json();
                            if (data?.project?.overlays) setOverlays(data.project.overlays);
                          }
                        } catch {}
                      }}
                    />
                    {variant === "v2" ? <V2Editor saveState={{ isSaving, lastSaveTime }} /> : <Editor />}
                    {/* AI Processing Overlay */}
                    <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm transition-opacity duration-300 ${isAIProcessing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                      <div className="flex flex-col items-center gap-4 rounded-lg bg-card p-8 shadow-lg border border-border">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        <p className="text-lg font-medium text-foreground">Editron is editing...</p>
                      </div>
                    </div>
                  </SidebarInset>

                  {/* Autosave Status Indicator — v1 only. In v2 the header's
                      save pill is wired to the same state; showing both meant
                      two (previously contradictory) save UIs at once. */}
                  {variant !== "v2" && (
                    <AutosaveStatus
                      isSaving={isSaving}
                      lastSaveTime={lastSaveTime}
                    />
                  )}

                  <NativeVideoAudioRightsDialog
                    open={pendingRightsRenderMode !== null}
                    sourceCount={unverifiedExportAudioCount}
                    onCancel={() => setPendingRightsRenderMode(null)}
                    onConfirm={confirmExportAudioRights}
                  />

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
