'use client';

/* ═══ Editron editor v2 · timeline ═══════════════════════════════════
   A re-skin of the real components/timeline/timeline.tsx. Every hook,
   handler, effect and DOM ref is reproduced VERBATIM — the measured
   timelineRef container, the playhead parent-traversal, the wheel-zoom
   listener and the header↔body scroll sync — so drag / trim / snap /
   zoom math is identical (never forked). Only the surrounding chrome is
   restyled to v2 tokens, plus the v6 additions the real timeline lacks:
   a controls bar, a contextual action bar, and named markers.

   The real TimelineGrid / TimelineItem subtree stays the engine (owns the
   drop math + per-type clip rendering); re-skinning clip visuals would
   mean touching live v1 or forking the drag DOM — deferred follow-up.
   // TODO(backend): named markers are local state here; lift to
   editor-context + project persistence (D4 keeps named markers). */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Mono } from '@/components/primitives';
import { useTimeline } from '../../contexts/timeline-context';
import { useTimelineDragAndDrop } from '../../hooks/use-timeline-drag-and-drop';
import { useTimelineEventHandlers } from '../../hooks/use-timeline-event-handlers';
import { useTimelineState } from '../../hooks/use-timeline-state';
import { useTimelineSnapping } from '../../hooks/use-timeline-snapping';
import { useAssetLoading } from '../../contexts/asset-loading-context';
import { useEditorContext } from '../../contexts/editor-context';
import { Overlay, OverlayType } from '../../types';
import GhostMarker from '../../components/timeline/ghost-marker';
import { V2TimelineGrid } from './v2-timeline-grid';
import TimelineMarker from '../../components/timeline/timeline-marker';
import TimeMarkers from '../../components/timeline/timeline-markers';
import { TimelineRowLabel } from '../../components/timeline/timeline-row-label';
import {
  ROW_HEIGHT,
  SHOW_LOADING_PROJECT_ALERT,
  SNAPPING_CONFIG,
  INITIAL_ROWS,
  MAX_ROWS,
} from '../../constants';
import { V2TimelineControls } from './v2-timeline-controls';
import { V2ActionBar } from './v2-action-bar';

interface V2TimelineProps {
  overlays: Overlay[];
  durationInFrames: number;
  selectedOverlayId: number | null;
  setSelectedOverlayId: (id: number | null) => void;
  currentFrame: number;
  onOverlayChange: (updatedOverlay: Overlay) => void;
  setCurrentFrame: (frame: number) => void;
  onTimelineClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onOverlayDelete: (id: number) => void;
  onOverlayDuplicate: (id: number) => void;
  onSplitOverlay: (id: number, splitPosition: number) => void;
  setOverlays: (overlays: Overlay[]) => void;
  playerRef: React.RefObject<any>;
}

export function V2Timeline({
  overlays,
  durationInFrames,
  selectedOverlayId,
  setSelectedOverlayId,
  currentFrame,
  onOverlayChange,
  setCurrentFrame,
  onTimelineClick,
  onOverlayDelete,
  onOverlayDuplicate,
  onSplitOverlay,
  setOverlays,
  playerRef,
}: V2TimelineProps) {
  const [lastKnownHoverInfo, setLastKnownHoverInfo] = useState<{ itemId: number; position: number } | null>(null);
  void lastKnownHoverInfo;

  const { visibleRows, setVisibleRows, timelineRef, zoomScale, handleWheelZoom } = useTimeline();

  // Ref for horizontal scroll sync (header ruler ↔ body track).
  const headerScrollRef = React.useRef<HTMLDivElement>(null);
  const handleTimelineScroll = useCallback(() => {
    if (timelineRef.current && headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = timelineRef.current.scrollLeft;
    }
  }, [timelineRef]);

  // v2 additions: real snap toggle + named markers (local, see header TODO).
  const [snapOn, setSnapOn] = useState(true);
  // Named markers live on the editor context (persisted via autosave, D4).
  const { markers = [], setMarkers } = useEditorContext();
  const addMarkerAtPlayhead = useCallback(() => {
    setMarkers?.([...markers, { id: crypto.randomUUID(), frame: currentFrame, label: `Marker ${markers.length + 1}` }]);
  }, [markers, setMarkers, currentFrame]);
  const deleteMarker = useCallback(
    (id: string) => setMarkers?.(markers.filter((m) => m.id !== id)),
    [markers, setMarkers],
  );

  // Ensure minimum rows when there are no overlays.
  useEffect(() => {
    if (overlays.length === 0 && visibleRows < INITIAL_ROWS) setVisibleRows(INITIAL_ROWS);
  }, [overlays.length, visibleRows, setVisibleRows]);

  // Auto-expand rows if content is added beyond current visible rows.
  useEffect(() => {
    if (overlays.length > 0) {
      const maxRowUsed = Math.max(...overlays.map((overlay) => overlay.row));
      if (maxRowUsed >= visibleRows) {
        const newVisibleRows = Math.min(maxRowUsed + 1, MAX_ROWS);
        if (newVisibleRows > visibleRows) setVisibleRows(newVisibleRows);
      }
    }
  }, [overlays, visibleRows, setVisibleRows]);

  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);

  const {
    isDragging,
    draggedItem,
    ghostElement,
    ghostMarkerPosition,
    livePushOffsets,
    dragInfo,
    handleDragStart: timelineStateHandleDragStart,
    updateGhostElement,
    resetDragState,
    setGhostMarkerPosition,
  } = useTimelineState(durationInFrames, visibleRows, timelineRef);

  const { handleDragStart, handleDrag, handleDragEnd } = useTimelineDragAndDrop({
    overlays,
    durationInFrames,
    onOverlayChange,
    updateGhostElement,
    resetDragState,
    timelineRef,
    dragInfo,
    maxRows: visibleRows,
  });

  const { handleMouseMove, handleTouchMove, handleTimelineMouseLeave } = useTimelineEventHandlers({
    handleDrag,
    handleDragEnd,
    isDragging,
    timelineRef,
    setGhostMarkerPosition,
  });

  const { alignmentLines, snappedGhostElement } = useTimelineSnapping({
    isDragging,
    ghostElement,
    draggedItem,
    dragInfo,
    overlays,
    durationInFrames,
    visibleRows,
    // Real snap toggle: threshold 0 disables snapping without forking the hook.
    snapThreshold: snapOn ? SNAPPING_CONFIG.thresholdFrames : 0,
  });

  const combinedHandleDragStart = useCallback(
    (overlay: Overlay, clientX: number, clientY: number, action: 'move' | 'resize-start' | 'resize-end') => {
      timelineStateHandleDragStart(overlay, clientX, clientY, action);
      handleDragStart(overlay, clientX, clientY, action);
    },
    [timelineStateHandleDragStart, handleDragStart],
  );

  const handleDeleteItem = useCallback((id: number) => onOverlayDelete(id), [onOverlayDelete]);
  const handleDuplicateItem = useCallback((id: number) => onOverlayDuplicate(id), [onOverlayDuplicate]);
  const handleItemHover = useCallback((itemId: number, hoverPosition: number) => {
    setLastKnownHoverInfo({ itemId, position: Math.round(hoverPosition) });
  }, []);

  const handleSplitItem = useCallback(
    (id: number) => {
      const overlay = overlays.find((o) => o.id === id);
      if (overlay && currentFrame > overlay.from && currentFrame < overlay.from + overlay.durationInFrames) {
        onSplitOverlay(id, currentFrame);
      }
    },
    [currentFrame, overlays, onSplitOverlay],
  );

  const handleContextMenuChange = useCallback((isOpen: boolean) => setIsContextMenuOpen(isOpen), []);

  const handleRemoveGap = useCallback(
    (rowIndex: number, gapStart: number, gapEnd: number) => {
      const overlaysToShift = overlays
        .filter((overlay) => overlay.row === rowIndex && overlay.from >= gapEnd)
        .sort((a, b) => a.from - b.from);
      if (overlaysToShift.length === 0) return;
      const firstOverlayAfterGap = overlaysToShift[0];
      const gapSize = firstOverlayAfterGap.from - gapStart;
      if (gapSize <= 0) return;
      const updates = overlaysToShift.map((overlay) => ({ ...overlay, from: overlay.from - gapSize }));
      updates.forEach((update) => onOverlayChange(update));
    },
    [overlays, onOverlayChange],
  );

  const handleReorderRows = (fromIndex: number, toIndex: number) => {
    const updatedOverlays = overlays.map((overlay) => {
      if (overlay.row === fromIndex) return { ...overlay, row: toIndex };
      if (overlay.row === toIndex) return { ...overlay, row: fromIndex };
      return overlay;
    });
    setOverlays(updatedOverlays);
  };

  const { addRowAfter, deleteRow: contextDeleteRow } = useTimeline();

  const handleAddRowAfter = useCallback(
    (rowIndex: number) => {
      addRowAfter(rowIndex);
      const updatedOverlays = overlays.map((overlay) =>
        overlay.row > rowIndex ? { ...overlay, row: overlay.row + 1 } : overlay,
      );
      setOverlays(updatedOverlays);
    },
    [overlays, setOverlays, addRowAfter],
  );

  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      contextDeleteRow(rowIndex);
      const updatedOverlays = overlays
        .filter((overlay) => overlay.row !== rowIndex)
        .map((overlay) => (overlay.row > rowIndex ? { ...overlay, row: overlay.row - 1 } : overlay));
      setOverlays(updatedOverlays);
    },
    [overlays, setOverlays, contextDeleteRow],
  );

  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null);
  const [isDraggingRow, setIsDraggingRow] = useState(false);

  const handleRowDragStart = (_e: React.DragEvent, rowIndex: number) => {
    setDraggedRowIndex(rowIndex);
    setIsDraggingRow(true);
  };
  const handleRowDragOver = (e: React.DragEvent, rowIndex: number) => {
    e.preventDefault();
    if (draggedRowIndex === null) return;
    setDragOverRowIndex(rowIndex);
  };
  const handleRowDrop = (targetIndex: number) => {
    if (draggedRowIndex === null) return;
    handleReorderRows(draggedRowIndex, targetIndex);
    setDraggedRowIndex(null);
    setDragOverRowIndex(null);
    setIsDraggingRow(false);
  };
  const handleRowDragEnd = () => {
    setDraggedRowIndex(null);
    setDragOverRowIndex(null);
    setIsDraggingRow(false);
  };

  // Wheel-zoom listener on the measured track container (passive:false).
  useEffect(() => {
    const element = timelineRef.current;
    if (!element) return;
    element.addEventListener('wheel', handleWheelZoom, { passive: false });
    return () => element.removeEventListener('wheel', handleWheelZoom);
  }, [handleWheelZoom, timelineRef]);

  const { isLoadingAssets, isInitialLoad, handleAssetLoadingChange, setInitialLoadComplete } = useAssetLoading();
  const [shouldShowInitialLoader, setShouldShowInitialLoader] = useState(false);

  useEffect(() => {
    const hasVideoOverlay = overlays.some((overlay) => overlay.type === OverlayType.VIDEO);
    if (!shouldShowInitialLoader && hasVideoOverlay && isInitialLoad) setShouldShowInitialLoader(true);
    if (overlays.length > 0 && !isLoadingAssets) setInitialLoadComplete();
  }, [overlays, isInitialLoad, isLoadingAssets, shouldShowInitialLoader, setInitialLoadComplete]);

  const rowsWithContent = useMemo(() => {
    const contentMap = new Set<number>();
    overlays.forEach((overlay) => contentMap.add(overlay.row));
    return contentMap;
  }, [overlays]);

  const selectedOverlay = useMemo(
    () => overlays.find((o) => o.id === selectedOverlayId) ?? null,
    [overlays, selectedOverlayId],
  );

  return (
    <div className="flex shrink-0 flex-col border-t border-ds-subtle bg-surface-raised">
      {/* Contextual action bar — only when a clip is selected. */}
      {selectedOverlay && (
        <V2ActionBar
          selected={selectedOverlay}
          canSplit={currentFrame > selectedOverlay.from && currentFrame < selectedOverlay.from + selectedOverlay.durationInFrames}
          onSplit={() => handleSplitItem(selectedOverlay.id)}
          onDuplicate={() => onOverlayDuplicate(selectedOverlay.id)}
          onDelete={() => {
            onOverlayDelete(selectedOverlay.id);
            setSelectedOverlayId(null);
          }}
        />
      )}

      {/* Controls bar. */}
      <V2TimelineControls
        overlayCount={overlays.length}
        snapOn={snapOn}
        onToggleSnap={() => setSnapOn((s) => !s)}
        onAddMarker={addMarkerAtPlayhead}
      />

      {/* Ruler header (LAYERS gutter + real TimeMarkers + named markers). */}
      <div className="flex border-b border-ds-subtle bg-surface-raised">
        <div className="hidden w-[70px] flex-shrink-0 border-l border-r border-ds-subtle bg-surface-canvas md:block">
          <div className="flex h-[22px] items-center justify-center">
            <Mono size="8" className="text-ds-muted">Layers</Mono>
          </div>
        </div>
        <div
          ref={headerScrollRef}
          className="scrollbar-hide flex-1 overflow-x-auto overflow-y-hidden"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="relative h-[22px]" style={{ width: `${100 * zoomScale}%`, minWidth: '100%' }}>
            <TimeMarkers
              durationInFrames={durationInFrames}
              handleTimelineClick={(clickPosition) => {
                const targetFrame = Math.round(clickPosition * durationInFrames);
                setCurrentFrame(targetFrame);
                if (playerRef && playerRef.current) playerRef.current.seekTo(targetFrame);
              }}
              zoomScale={zoomScale}
            />
            {markers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => deleteMarker(m.id)}
                title={`${m.label} — click to remove`}
                className="absolute bottom-0 top-0 z-10 flex items-center gap-1 focus-visible:outline-hidden"
                style={{ left: `${(m.frame / durationInFrames) * 100}%` }}
              >
                <span className="h-0 w-0 border-x-4 border-t-[5px] border-x-transparent border-t-gold" />
                <Mono size="7" className="whitespace-nowrap text-gold">{m.label}</Mono>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable content area. */}
      <div className="flex max-h-[400px] overflow-y-auto">
        {/* Row labels column. */}
        <div className="sticky left-0 z-10 hidden w-[70px] flex-shrink-0 border-l border-r border-ds-subtle bg-surface-canvas md:block">
          <div className="flex flex-col gap-2 pb-2 pt-2" style={{ height: `${visibleRows * ROW_HEIGHT}px` }}>
            {Array.from({ length: visibleRows }).map((_, rowIndex) => (
              <TimelineRowLabel
                key={`row-label-${rowIndex}`}
                rowIndex={rowIndex}
                canDelete={visibleRows > INITIAL_ROWS}
                canAdd={visibleRows < MAX_ROWS}
                onDeleteRow={handleDeleteRow}
                onAddRowAfter={handleAddRowAfter}
                isDraggingRow={isDraggingRow}
                draggedRowIndex={draggedRowIndex}
                dragOverRowIndex={dragOverRowIndex}
                onDragStart={handleRowDragStart}
                onDragEnd={handleRowDragEnd}
                onDragOver={handleRowDragOver}
                onDrop={handleRowDrop}
                hasContent={rowsWithContent.has(rowIndex)}
              />
            ))}
          </div>
        </div>

        {/* Timeline content. */}
        <div className="relative flex-1 pl-2 md:pl-0">
          <div
            ref={timelineRef}
            className="scrollbar-hide relative overflow-x-auto bg-surface-canvas pb-2 pr-2"
            style={{
              width: `${100 * zoomScale}%`,
              minWidth: '100%',
              height: `${visibleRows * ROW_HEIGHT}px`,
              willChange: 'width, transform',
              transform: 'translateZ(0)',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
            onScroll={handleTimelineScroll}
            onMouseMove={handleMouseMove}
            onTouchMove={handleTouchMove}
            onMouseUp={handleDragEnd}
            onTouchEnd={handleDragEnd}
            onMouseLeave={handleTimelineMouseLeave}
            onClick={onTimelineClick}
          >
            <div className="relative h-full">
              <TimelineMarker
                currentFrame={currentFrame}
                totalDuration={durationInFrames}
                onSeek={(frame: number) => {
                  if (playerRef?.current?.pause) playerRef.current.pause();
                  setCurrentFrame(frame);
                  if (playerRef?.current?.seekTo) playerRef.current.seekTo(frame);
                }}
                onSeekEnd={(frame: number) => {
                  setCurrentFrame(frame);
                  if (playerRef?.current?.seekTo) playerRef.current.seekTo(frame);
                }}
              />

              <GhostMarker position={ghostMarkerPosition} isDragging={isDragging} isContextMenuOpen={isContextMenuOpen} />

              <V2TimelineGrid
                overlays={overlays}
                currentFrame={currentFrame}
                isDragging={isDragging}
                draggedItem={draggedItem}
                selectedOverlayId={selectedOverlayId}
                setSelectedOverlayId={setSelectedOverlayId}
                handleDragStart={combinedHandleDragStart}
                totalDuration={durationInFrames}
                ghostElement={snappedGhostElement}
                livePushOffsets={livePushOffsets}
                onDeleteItem={handleDeleteItem}
                onDuplicateItem={handleDuplicateItem}
                onSplitItem={handleSplitItem}
                onHover={handleItemHover}
                onContextMenuChange={handleContextMenuChange}
                onRemoveGap={handleRemoveGap}
                zoomScale={zoomScale}
                draggedRowIndex={draggedRowIndex}
                dragOverRowIndex={dragOverRowIndex}
                onAssetLoadingChange={handleAssetLoadingChange}
                alignmentLines={alignmentLines}
                onOverlayChange={onOverlayChange}
              />

              {SHOW_LOADING_PROJECT_ALERT && isLoadingAssets && isInitialLoad && shouldShowInitialLoader && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-surface-canvas/60 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-card border border-ds-subtle bg-surface-deeper px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-ds-muted" />
                    <Mono size="8" className="text-ds-secondary">Loading project…</Mono>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
