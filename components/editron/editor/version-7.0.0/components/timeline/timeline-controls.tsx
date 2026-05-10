import React, { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Plus,
  Minus,
  ZoomOut,
  ZoomIn,
  Settings,
  Undo2,
  Redo2,
  Loader2,
  SquareSquare,
  Maximize,
  Minimize,
} from "lucide-react";
import { useEditorContext } from "../../contexts/editor-context";
import { useTimeline } from "../../contexts/timeline-context";
import {
  MAX_ROWS,
  INITIAL_ROWS,
  ZOOM_CONSTRAINTS,
  SHOW_LOADING_PROJECT_ALERT,
} from "../../constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTimelineShortcuts } from "../../hooks/use-timeline-shortcuts";
import { Overlay } from "../../types";
import { useAssetLoading } from "../../contexts/asset-loading-context";
import { useKeyframeContext } from "../../contexts/keyframe-context";
import { Separator } from "@/components/ui/separator";

// Types
type AspectRatioOption = "16:9" | "9:16" | "1:1" | "4:5";

/**
 * Props for the TimelineControls component.
 * @interface TimelineControlsProps
 */
interface TimelineControlsProps {
  /** Indicates whether the timeline is currently playing */
  isPlaying: boolean;
  /** Function to toggle between play and pause states */
  togglePlayPause: () => void;
  /** The current frame number in the timeline */
  currentFrame: number;
  /** The total duration of the timeline in frames */
  totalDuration: number;
  /** Function to format frame numbers into a time string */
  formatTime: (frames: number) => string;
}

/**
 * TimelineControls component provides video playback controls and aspect ratio selection.
 * It displays:
 * - Play/Pause button
 * - Current time / Total duration
 * - Aspect ratio selector (hidden on mobile)
 *
 * @component
 * @param {TimelineControlsProps} props - Component props
 * @returns {React.ReactElement} Rendered TimelineControls component
 *
 * @example
 * ```tsx
 * <TimelineControls
 *   isPlaying={isPlaying}
 *   togglePlayPause={handlePlayPause}
 *   currentFrame={currentFrame}
 *   totalDuration={duration}
 *   formatTime={formatTimeFunction}
 * />
 * ```
 */
export const TimelineControls: React.FC<TimelineControlsProps> = ({
  isPlaying,
  togglePlayPause,
  currentFrame,
  totalDuration,
  formatTime,
}) => {
  // Context
  const {
    aspectRatio,
    setAspectRatio,
    deleteOverlaysByRow,
    undo,
    redo,
    canUndo,
    canRedo,
    playbackRate,
    setPlaybackRate,
    selectedOverlayId,
    splitOverlay,
    duplicateOverlay,
    overlays,
    addOverlay,
  } = useEditorContext();

  const { visibleRows, addRow, removeRow, zoomScale, setZoomScale } =
    useTimeline();

  // Add this hook to enable shortcuts
  useTimelineShortcuts({
    handlePlayPause: () => {
      togglePlayPause();
    },
    undo,
    redo,
    canUndo,
    canRedo,
    zoomScale,
    setZoomScale,
    onSplitAtPlayhead: () => {
      if (selectedOverlayId == null) return;
      const overlay = overlays.find((o) => o.id === selectedOverlayId);
      if (!overlay) return;
      // Only split if playhead is within the overlay's range
      if (currentFrame > overlay.from && currentFrame < overlay.from + overlay.durationInFrames) {
        splitOverlay(selectedOverlayId, currentFrame);
      }
    },
    onDuplicateSelected: () => {
      if (selectedOverlayId != null) {
        duplicateOverlay(selectedOverlayId);
      }
    },
    onCopy: () => {
      if (selectedOverlayId == null) return null;
      return overlays.find((o) => o.id === selectedOverlayId) ?? null;
    },
    onPaste: (overlay: Overlay) => {
      addOverlay({
        ...overlay,
        id: Date.now(),
        from: currentFrame,
      });
    },
  });

  const { isLoadingAssets } = useAssetLoading();

  const { clearAllKeyframes } = useKeyframeContext();

  // Keep track of previous frame to detect resets
  const prevFrameRef = React.useRef(currentFrame);
  const isPlayingRef = React.useRef(isPlaying);

  useEffect(() => {
    // Only update the ref when isPlaying changes
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    // Only run the check if we're actually playing
    if (isPlayingRef.current) {
      // Detect when frame suddenly drops to 0 from near the end
      if (prevFrameRef.current > totalDuration - 2 && currentFrame === 0) {
        togglePlayPause();
      }
    }

    prevFrameRef.current = currentFrame;
  }, [currentFrame, totalDuration, togglePlayPause]); // Removed isPlaying from dependencies

  // Handlers
  const handlePlayPause = () => {
    togglePlayPause();
  };

  const handleAspectRatioChange = (value: string) => {
    setAspectRatio(value as AspectRatioOption);
  };

  const handleRemoveRow = () => {
    // Delete overlays on the last row before removing it
    deleteOverlaysByRow(visibleRows - 1);
    removeRow();
  };

  const handleSliderChange = useCallback(
    (value: number[]) => {
      setZoomScale(value[0] / 100);
    },
    [setZoomScale]
  );

  // Add state for dropdown
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // Fullscreen toggle for the video preview
  const handleFullscreen = useCallback(() => {
    const container = document.getElementById('remotion-player-container');
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Listen for fullscreen exit (e.g. pressing Escape)
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleReset = () => {
    clearAllKeyframes();
    setDropdownOpen(false);
  };

  // Handlers for zoom buttons
  const handleZoomOut = () => {
    const newScale = Math.max(
      ZOOM_CONSTRAINTS.min,
      zoomScale - ZOOM_CONSTRAINTS.step
    );
    setZoomScale(newScale);
  };

  const handleZoomIn = () => {
    const newScale = Math.min(
      ZOOM_CONSTRAINTS.max,
      zoomScale + ZOOM_CONSTRAINTS.step
    );
    setZoomScale(newScale);
  };

  // Handler for reset zoom button
  const handleResetZoom = () => {
    setZoomScale(ZOOM_CONSTRAINTS.min);
  };

  return (
  <div className="flex justify-between items-center border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] px-3 py-3 backdrop-blur-sm border-l">
      {/* Left section: Undo/Redo & Loading */}
      <div className="flex items-center gap-1 flex-1 justify-start">
        <TooltipProvider delayDuration={50}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={undo}
                disabled={!canUndo}
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-foreground dark:text-foreground hover:text-foreground dark:hover:text-foreground hover:bg-muted/50 dark:hover:bg-muted/50"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={5}
              className="bg-popover text-popover-foreground text-[11px] px-2 py-1 rounded-md z-[9999] border border-border"
              align="start"
            >
              <div className="flex items-center gap-1">
                <span className="text-popover-foreground">Undo</span>
                <kbd className="px-1 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground rounded-md border border-border">
                  ⌘Z
                </kbd>
              </div>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={redo}
                disabled={!canRedo}
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-foreground dark:text-foreground hover:text-foreground dark:hover:text-foreground hover:bg-muted/50 dark:hover:bg-muted/50"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={5}
              className="bg-popover text-popover-foreground text-[11px] px-2 py-1 rounded-md z-[9999] border border-border"
              align="start"
            >
              <div className="flex items-center gap-1">
                <span className="text-popover-foreground">Redo</span>
                <kbd className="px-1 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground rounded-md border border-border">
                  ⌘Y
                </kbd>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Loading Indicator - Moved here and simplified */}
        {!SHOW_LOADING_PROJECT_ALERT && isLoadingAssets && (
          <div className="flex items-center gap-2 px-2 py-1 bg-zinc-50/90 dark:bg-zinc-900/20 rounded-md ml-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-600 dark:text-zinc-400" />
            <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              Loading...
            </span>
          </div>
        )}
      </div>

      {/* Center section: Play/Pause control and time display */}
      <div className="flex items-center justify-center gap-2 flex-grow">
        {/* Playback Speed Control */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:flex border h-7 p-3 text-[11px] text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground hover:bg-transparent"
            >
              {playbackRate}x
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-[100px] bg-popover border border-border"
            align="center"
          >
            {[0.25, 0.5, 1, 1.5, 2].map((speed) => (
              <DropdownMenuItem
                key={speed}
                onClick={() => setPlaybackRate(speed)}
                className={`text-[11px] py-1.5 ${
                  playbackRate === speed
                    ? "text-foreground font-medium bg-accent"
                    : "text-muted-foreground"
                }`}
              >
                {speed}x
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipProvider delayDuration={50}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handlePlayPause}
                size="sm"
                variant="default"
                className="h-7 bg-muted hover:bg-accent dark:bg-muted dark:hover:bg-accent"
              >
                {isPlaying ? (
                  <Pause className="h-3 w-3 text-foreground dark:text-white" />
                ) : (
                  <Play className="h-3 w-3 text-foreground dark:text-white" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={5}
              className="bg-sidebar text-sidebar-foreground text-[11px] px-2 py-1 rounded-md z-[9999] border border-sidebar-border"
              align="center"
            >
              <div className="flex items-center gap-1">
                <span className="text-sidebar-foreground">
                  {isPlaying ? "Pause" : "Play"}
                </span>
                <kbd className="px-1 py-0.5 text-[10px] font-mono bg-sidebar-primary text-sidebar-primary-foreground rounded-md border border-sidebar-border">
                  ⌥ Space
                </kbd>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex items-center space-x-1">
          <span className="text-[11px] font-medium text-foreground dark:text-foreground tabular-nums">
            {formatTime(currentFrame)}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground dark:text-muted-foreground">
            /
          </span>
          <span className="text-[11px] font-medium text-muted-foreground dark:text-muted-foreground tabular-nums">
            {formatTime(totalDuration)}
          </span>
        </div>
      </div>
      {/* Right section: Zoom, Reset Zoom & Settings menu */}
      <div className="flex items-center gap-3 flex-1 justify-end">
        {/* Zoom Slider - Refined UI with Icons */}
        <div className="hidden sm:flex items-center gap-1 w-40">
          <TooltipProvider delayDuration={50}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleZoomOut}
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground dark:text-muted-foreground hover:bg-muted/50 dark:hover:bg-muted/50"
                  disabled={zoomScale <= ZOOM_CONSTRAINTS.min}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                sideOffset={5}
                className="bg-sidebar text-sidebar-foreground text-[11px] px-2 py-1 rounded-md z-[9999] border border-sidebar-border"
                align="center"
              >
                <span className="text-sidebar-foreground">
                  Zoom Out
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Slider
            value={[zoomScale * 100]}
            onValueChange={handleSliderChange}
            min={ZOOM_CONSTRAINTS.min * 100}
            max={ZOOM_CONSTRAINTS.max * 100}
            step={ZOOM_CONSTRAINTS.step * 100}
            className="w-full"
            aria-label="Timeline Zoom"
          />
          <TooltipProvider delayDuration={50}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleZoomIn}
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground dark:text-muted-foreground hover:bg-muted/50 dark:hover:bg-muted/50"
                  disabled={zoomScale >= ZOOM_CONSTRAINTS.max}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                sideOffset={5}
                className="bg-sidebar text-sidebar-foreground text-[11px] px-2 py-1 rounded-md z-[9999] border border-sidebar-border"
                align="center"
              >
                <span className="text-sidebar-foreground">
                  Zoom In
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Reset Zoom Button (Replaces Export Button) */}
        <TooltipProvider delayDuration={50}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleResetZoom}
                variant="ghost"
                size="icon"
                className="hidden sm:block h-7 w-7 text-foreground dark:text-foreground hover:text-foreground dark:hover:text-foreground hover:bg-muted/50 dark:hover:bg-muted/50 transition-colors rounded-md"
              >
                <SquareSquare className="h-3.5 w-3.5 m-auto" />
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={5}
              className="bg-sidebar text-sidebar-foreground text-[11px] px-2 py-1 rounded-md z-[9999] border border-sidebar-border"
              align="end"
            >
              <span className="text-sidebar-foreground">
                Reset Zoom
              </span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Fullscreen Toggle */}
        <TooltipProvider delayDuration={50}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleFullscreen}
                variant="ghost"
                size="icon"
                className="hidden sm:block h-7 w-7 text-foreground dark:text-foreground hover:text-foreground dark:hover:text-foreground hover:bg-muted/50 dark:hover:bg-muted/50 transition-colors rounded-md"
              >
                {isFullscreen ? (
                  <Minimize className="h-3.5 w-3.5 m-auto" />
                ) : (
                  <Maximize className="h-3.5 w-3.5 m-auto" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={5}
              className="bg-sidebar text-sidebar-foreground text-[11px] px-2 py-1 rounded-md z-[9999] border border-sidebar-border"
              align="end"
            >
              <span className="text-sidebar-foreground">
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Preview'}
              </span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator orientation="vertical" className="h-7" />

        {/* Settings Dropdown */}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-700 dark:text-zinc-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-colors rounded-md"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-60 bg-sidebar border border-sidebar-border"
            side="top"
            align="end"
            sideOffset={8}
            collisionPadding={16}
            avoidCollisions={false}
          >
            <DropdownMenuLabel className="text-[11px] text-sidebar-foreground">
              Timeline Settings
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-sidebar-border" />

            {/* Row Controls */}
            <div className="px-2 py-2 space-y-1">
              <Label className="text-[11px] text-sidebar-accent-foreground">
                Rows
              </Label>
              <div className="flex gap-1 pt-1">
                <Button
                  onClick={handleRemoveRow}
                  disabled={visibleRows <= INITIAL_ROWS}
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 bg-sidebar-accent border-sidebar-border hover:bg-sidebar-accent/80"
                >
                  <Minus className="h-4 w-4 text-sidebar-accent-foreground" />
                </Button>
                <span className="flex items-center justify-center w-12 text-[11px] text-sidebar-accent-foreground">
                  {visibleRows}/{MAX_ROWS}
                </span>
                <Button
                  onClick={addRow}
                  disabled={visibleRows >= MAX_ROWS}
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 bg-sidebar-accent border-sidebar-border hover:bg-sidebar-accent/80"
                >
                  <Plus className="h-4 w-4 text-sidebar-accent-foreground" />
                </Button>
              </div>
            </div>
            <DropdownMenuSeparator className="bg-sidebar-border" />

            {/* Aspect Ratio */}
            <div className="px-2 py-2 space-y-1">
              <Label className="text-[11px] text-sidebar-accent-foreground">
                Aspect Ratio
              </Label>
              <div className="grid grid-cols-3 gap-1 pt-1">
                {["16:9", "9:16", "4:5", "1:1"].map((ratio) => (
                  <Button
                    key={ratio}
                    onClick={() => handleAspectRatioChange(ratio)}
                    size="sm"
                    variant={aspectRatio === ratio ? "default" : "outline"}
                    className={`h-8 transition-colors ${
                      aspectRatio === ratio
                        ? "bg-sidebar-primary hover:bg-sidebar-primary/90 text-sidebar-primary-foreground border-0"
                        : "bg-sidebar-accent border-sidebar-border hover:bg-sidebar-accent/80 text-sidebar-accent-foreground"
                    }`}
                  >
                    {ratio}
                  </Button>
                ))}
              </div>
            </div>

            <DropdownMenuSeparator className="bg-sidebar-border" />

            {/* Reset Timeline */}
            <div className="px-2 py-2">
              <Button
                onClick={handleReset}
                variant="outline"
                size="sm"
                className="w-full text-sidebar-foreground hover:text-sidebar-foreground
                  bg-sidebar-accent hover:bg-sidebar-accent/80
                  border-sidebar-border"
              >
                Reset Timeline
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
