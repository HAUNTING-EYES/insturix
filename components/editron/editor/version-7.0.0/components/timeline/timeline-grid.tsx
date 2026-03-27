/**
 * TimelineGrid Component
 * Renders a grid-based timeline view for managing overlay items across multiple rows.
 * Supports drag and drop, resizing, and various item management operations.
 */

import React, { useMemo, useCallback, useState } from "react";
import { ROW_HEIGHT } from "../../constants";
import { useTimeline } from "../../contexts/timeline-context";
import { useEditorContext } from "../../contexts/editor-context";
import { Overlay } from "../../types";
import GapIndicator from "./timeline-gap-indicator";
import TimelineItem from "./timeline-item";
import ContextualActionBar from "./contextual-action-bar";
import { SNAPPING_CONFIG } from "../../constants";

/**
 * Props for the TimelineGrid component
 * @interface TimelineGridProps
 */
interface TimelineGridProps {
  /** Array of overlay items to display in the timeline */
  overlays: Overlay[];
  /** Indicates if an item is currently being dragged */
  isDragging: boolean;
  /** The overlay item currently being dragged, if any */
  draggedItem: Overlay | null;
  /** ID of the currently selected overlay */
  selectedOverlayId: number | null;
  /** Callback to update the selected overlay ID */
  setSelectedOverlayId: (id: number | null) => void;
  /** Callback triggered when dragging starts */
  handleDragStart: (
    overlay: Overlay,
    clientX: number,
    clientY: number,
    action: "move" | "resize-start" | "resize-end"
  ) => void;
  /** Total duration of the timeline in seconds */
  totalDuration: number;
  /** Visual element showing drag preview (snapped) */
  ghostElement: {
    left: number; // Position from left as percentage
    width: number; // Width as percentage
    top: number; // Vertical position
  } | null;
  /** Live push offsets during drag (from useTimelineState) */
  livePushOffsets: Map<number, number>; // <itemId, pushDistanceInFrames>
  /** Callback to delete an overlay item */
  onDeleteItem: (id: number) => void;
  /** Callback to duplicate an overlay item */
  onDuplicateItem: (id: number) => void;
  /** Callback to split an overlay item at current position */
  onSplitItem: (id: number) => void;
  /** Callback when hovering over an item */
  onHover: (itemId: number, position: number) => void;
  /** Callback when context menu state changes */
  onContextMenuChange: (open: boolean) => void;
  /** Callback to remove gap between items */
  onRemoveGap?: (rowIndex: number, gapStart: number, gapEnd: number) => void; // Revert signature
  /** Current frame of the timeline */
  currentFrame: number;
  /** Zoom scale of the timeline */
  zoomScale: number;
  /** Callback when rows are reordered */
  onReorderRows?: (fromIndex: number, toIndex: number) => void;
  /** Index of the row being dragged */
  draggedRowIndex: number | null;
  /** Index of the row being hovered over */
  dragOverRowIndex: number | null;
  /** Callback when asset loading state changes */
  onAssetLoadingChange?: (overlayId: number, isLoading: boolean) => void;
  /** Array of calculated frame positions for alignment lines */
  alignmentLines: number[];
  /** Callback when an overlay is modified (used by contextual action bar) */
  onOverlayChange?: (overlay: Overlay) => void;
  /** Beat marker positions as frame numbers (from beat detection) */
  beatMarkers?: { frame: number; strength: number; isDownbeat: boolean }[];
  /** Whether beat markers are visible */
  showBeatMarkers?: boolean;
}

/**
 * TimelineGrid component that displays overlay items in a row-based timeline view
 */
const TimelineGrid: React.FC<TimelineGridProps> = ({
  overlays,
  isDragging,
  draggedItem,
  selectedOverlayId,
  setSelectedOverlayId,
  handleDragStart,
  totalDuration,
  ghostElement,
  livePushOffsets,
  onDeleteItem,
  onDuplicateItem,
  onSplitItem,
  onHover,
  onContextMenuChange,
  onRemoveGap,
  currentFrame,
  zoomScale,
  draggedRowIndex,
  dragOverRowIndex,
  onAssetLoadingChange,
  alignmentLines,
  onOverlayChange,
  beatMarkers,
  showBeatMarkers,
}) => {
  const { visibleRows } = useTimeline();
  const { projectId, setOverlays } = useEditorContext();

  // Create a memoized selectedItem object
  const selectedItem = useMemo(
    () => (selectedOverlayId !== null ? { id: selectedOverlayId } : null),
    [selectedOverlayId]
  );

  // Find the full selected overlay for the contextual action bar
  const selectedOverlay = useMemo(
    () =>
      selectedOverlayId !== null
        ? overlays.find((o) => o.id === selectedOverlayId) ?? null
        : null,
    [selectedOverlayId, overlays]
  );

  /**
   * Finds gaps between overlay items in a single timeline row
   * @param rowItems - Array of Overlay items in the current row
   * @returns Array of gap objects, each containing start and end times
   *
   * @example
   * // For a row with items: [0-30], [50-80], [100-120]
   * // Returns: [{start: 30, end: 50}, {start: 80, end: 100}]
   *
   * @description
   * This function identifies empty spaces (gaps) between overlay items in a timeline row:
   * 1. Converts each item into start and end time points
   * 2. Sorts all time points chronologically
   * 3. Identifies three types of gaps:
   *    - Gaps at the start (if first item doesn't start at 0)
   *    - Gaps between items
   *    - Gaps at the end are not included as they're considered infinite
   */
  const findGapsInRow = (rowItems: Overlay[]) => {
    if (rowItems.length === 0) return [];

    const timePoints = rowItems
      .flatMap((item) => [
        { time: item.from, type: "start" },
        { time: item.from + item.durationInFrames, type: "end" },
      ])
      .sort((a, b) => a.time - b.time);

    // Handle special case: if no items start at 0, add a gap from 0
    const gaps: { start: number; end: number }[] = [];

    // Handle gap at the start
    if (timePoints.length > 0 && timePoints[0].time > 0) {
      gaps.push({ start: 0, end: timePoints[0].time });
    }

    // Handle gaps between items
    for (let i = 0; i < timePoints.length - 1; i++) {
      const currentPoint = timePoints[i];
      const nextPoint = timePoints[i + 1];

      if (
        currentPoint.type === "end" &&
        nextPoint.type === "start" &&
        nextPoint.time > currentPoint.time
      ) {
        gaps.push({ start: currentPoint.time, end: nextPoint.time });
      }
    }

    return gaps;
  };

  // Status banner for async operations (transition drop, etc.)
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  // Handle transition drop from sidebar panel
  const handleTransitionDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    const transitionData = e.dataTransfer.getData('application/editron-transition');
    if (!transitionData) return;

    e.preventDefault();
    try {
      const { type, name } = JSON.parse(transitionData);
      setActionStatus(`Applying ${name || type} transition...`);

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
      const dropFrame = Math.round((x / e.currentTarget.scrollWidth) * totalDuration);

      // Find the video overlay boundary closest to the drop position
      const videoOverlays = overlays
        .filter(o => o.type === 'video')
        .sort((a, b) => a.from - b.from);

      let bestOverlayId: number | null = null;
      let bestDistance = Infinity;

      for (const vo of videoOverlays) {
        const endFrame = vo.from + vo.durationInFrames;
        const dist = Math.abs(endFrame - dropFrame);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestOverlayId = vo.id;
        }
      }

      if (!bestOverlayId || !projectId) {
        setActionStatus(null);
        return;
      }

      // Call the tool-call API to add transition after this overlay
      const res = await fetch('/api/services/editron/chat/tool-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          toolName: 'add_transition',
          params: { type, afterOverlayId: bestOverlayId },
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.status === 'success') {
        setActionStatus('Transition applied!');
        // Re-fetch updated project overlays instead of reloading the page
        const projRes = await fetch(`/api/services/editron/projects/${projectId}`);
        const projData = await projRes.json().catch(() => null);
        if (projData?.project?.overlays) {
          setOverlays(projData.project.overlays);
        }
      } else {
        setActionStatus(`Failed: ${data.message || 'Unknown error'}`);
        console.error('[TransitionDrop] Tool error:', data.message);
      }
    } catch (err) {
      setActionStatus('Transition drop failed');
      console.error('[TransitionDrop] Drop failed:', err);
    }
    // Clear status after 2.5s
    setTimeout(() => setActionStatus(null), 2500);
  }, [overlays, totalDuration, projectId, setOverlays]);

  return (
    <div
      className="relative overflow-x-auto overflow-y-hidden bg-[hsl(var(--background))] h-full"
      style={{ height: `${visibleRows * ROW_HEIGHT}px` }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/editron-transition')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={handleTransitionDrop}
    >
      {/* Action status banner (transition drop, etc.) */}
      {actionStatus && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-[100] px-3 py-1.5 rounded-b-md bg-emerald-600 text-white text-xs font-medium shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          {actionStatus}
        </div>
      )}
      {/* Container for Rows and Alignment Lines */}
      <div className="absolute inset-0 flex flex-col gap-2 pt-2 pb-2">
        {/* Render Alignment Lines - Conditionally visible and higher contrast */}
        {isDragging &&
          SNAPPING_CONFIG.enableVerticalSnapping &&
          alignmentLines.map((frame) => (
            <div
              key={`align-${frame}`}
              className="absolute top-0 bottom-0 w-px border-r border-dashed border-zinc-500 dark:border-zinc-20 z-40 pointer-events-none"
              style={{
                left: `${(frame / totalDuration) * 100}%`,
                height: "100%", // Ensure line spans full grid height
              }}
              aria-hidden="true"
            />
          ))}

        {/* Beat markers — visible when beat detection is active */}
        {showBeatMarkers &&
          beatMarkers?.map((beat, i) => (
            <div
              key={`beat-${i}`}
              className={`absolute top-0 bottom-0 w-px pointer-events-none z-30 ${
                beat.isDownbeat
                  ? "border-r border-solid border-orange-400/80"
                  : "border-r border-dotted border-orange-300/40"
              }`}
              style={{
                left: `${(beat.frame / totalDuration) * 100}%`,
                height: "100%",
                opacity: 0.3 + beat.strength * 0.7,
              }}
              aria-hidden="true"
            />
          ))}

        {/* Render Rows (existing code) */}
        {Array.from({ length: visibleRows }).map((_, rowIndex) => {
          const rowItems = overlays.filter(
            (overlay) => overlay.row === rowIndex
          );
          const gaps = findGapsInRow(rowItems);

          // Debug log for first row gaps
          if (rowIndex === 0) {
            console.log("First row items:", rowItems);
            console.log("First row gaps:", gaps);
            console.log("isDragging state:", isDragging);
          }

          return (
            <div
              key={rowIndex}
              className={`flex-1 bg-[hsl(var(--background))] relative
                  border-b border-[hsl(var(--border))]/20
                  transition-all duration-200 ease-in-out
                  hover:bg-[hsl(var(--muted))]
                  ${
                    dragOverRowIndex === rowIndex
                      ? "border-2 border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
                      : ""
                  }
                  ${draggedRowIndex === rowIndex ? "opacity-50" : ""}
                  ${
                    selectedOverlayId && overlays.some((o) => o.row === rowIndex)
                      ? "shadow-sm"
                      : ""
                  }`}
            >
              {rowItems.map((overlay) => {
                // Calculate the live push offset percentage for this specific item
                const pushOffsetFrames = livePushOffsets.get(overlay.id) || 0;
                const livePushOffsetPercent =
                  totalDuration > 0
                    ? (pushOffsetFrames / totalDuration) * 100
                    : 0;

                return (
                  <TimelineItem
                    key={overlay.id}
                    item={overlay}
                    isDragging={isDragging}
                    draggedItem={draggedItem}
                    selectedItem={selectedItem}
                    setSelectedItem={(item) => setSelectedOverlayId(item.id)}
                    handleMouseDown={(action, e) =>
                      handleDragStart(overlay, e.clientX, e.clientY, action)
                    }
                    handleTouchStart={(action, e) => {
                      const touch = e.touches[0];
                      handleDragStart(
                        overlay,
                        touch.clientX,
                        touch.clientY,
                        action
                      );
                    }}
                    totalDuration={totalDuration}
                    onDeleteItem={onDeleteItem}
                    onDuplicateItem={onDuplicateItem}
                    onSplitItem={onSplitItem}
                    onHover={onHover}
                    onContextMenuChange={onContextMenuChange}
                    currentFrame={currentFrame}
                    zoomScale={zoomScale}
                    onAssetLoadingChange={onAssetLoadingChange}
                    livePushOffsetPercent={livePushOffsetPercent}
                  />
                );
              })}

              {/* Contextual action bar for the selected item in this row */}
              {!isDragging &&
                selectedOverlay &&
                selectedOverlay.row === rowIndex && (
                  <ContextualActionBar
                    item={selectedOverlay}
                    totalDuration={totalDuration}
                    onDelete={onDeleteItem}
                    onDuplicate={onDuplicateItem}
                    onSplit={onSplitItem}
                    onOverlayChange={onOverlayChange}
                  />
                )}

              {/* Gap indicators */}
              {!isDragging &&
                gaps.map((gap, gapIndex) => (
                  <GapIndicator
                    key={`gap-${rowIndex}-${gapIndex}`}
                    gap={gap}
                    rowIndex={rowIndex}
                    totalDuration={totalDuration}
                    onRemoveGap={onRemoveGap}
                  />
                ))}

              {/* Ghost element with updated colors */}
              {ghostElement &&
                Math.floor(ghostElement.top / (100 / visibleRows)) ===
                  rowIndex && (
                  <div
                    className="absolute inset-y-[0.9px] rounded-md border-[hsl(var(--border))] border-2 bg-[hsl(var(--accent))] pointer-events-none shadow-md"
                    style={{
                      left: `${ghostElement.left}%`,
                      width: `${Math.max(ghostElement.width, 1)}%`,
                      zIndex: 50,
                    }}
                  />
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TimelineGrid;
