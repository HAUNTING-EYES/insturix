'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ROW_HEIGHT, SNAPPING_CONFIG, FPS } from '../../constants';
import { useTimeline } from '../../contexts/timeline-context';
import { useEditorContext } from '../../contexts/editor-context';
import { Overlay } from '../../types';
import GapIndicator from '../../components/timeline/timeline-gap-indicator';
import V2TimelineItem from './v2-timeline-item';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import {
  BackgroundMusicAssignmentDialog,
  useBackgroundMusicAssignment,
} from '../../components/overlays/sounds/background-music-assignment-dialog';
import {
  UploadedAudioAssignmentDialog,
  useUploadedAudioAssignment,
} from '../../components/overlays/sounds/uploaded-audio-assignment-dialog';

/* ═══ Editron editor v2 · timeline grid ══════════════════════════════
   Presentational twin of components/timeline/timeline-grid.tsx. Reuses
   the real drop logic (asset + transition drops), gap detection, ghost,
   alignment lines — only the container/row/ghost visuals are token-
   swapped and clips render as V2TimelineItem (v6 look). The per-row
   ContextualActionBar is dropped: v2-timeline has its own action bar at
   the top. No drag/drop logic forked. */

interface V2TimelineGridProps {
  overlays: Overlay[];
  isDragging: boolean;
  draggedItem: Overlay | null;
  selectedOverlayId: number | null;
  setSelectedOverlayId: (id: number | null) => void;
  handleDragStart: (overlay: Overlay, clientX: number, clientY: number, action: 'move' | 'resize-start' | 'resize-end') => void;
  totalDuration: number;
  ghostElement: { left: number; width: number; top: number } | null;
  livePushOffsets: Map<number, number>;
  onDeleteItem: (id: number) => void;
  onDuplicateItem: (id: number) => void;
  onSplitItem: (id: number) => void;
  onHover: (itemId: number, position: number) => void;
  onContextMenuChange: (open: boolean) => void;
  onRemoveGap?: (rowIndex: number, gapStart: number, gapEnd: number) => void;
  currentFrame: number;
  zoomScale: number;
  draggedRowIndex: number | null;
  dragOverRowIndex: number | null;
  onAssetLoadingChange?: (overlayId: number, isLoading: boolean) => void;
  alignmentLines: number[];
  onOverlayChange?: (overlay: Overlay) => void;
}

export function V2TimelineGrid({
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
}: V2TimelineGridProps) {
  const { visibleRows } = useTimeline();
  const { projectId, setOverlays, addOverlay } = useEditorContext();
  const backgroundMusicAssignment = useBackgroundMusicAssignment();
  const { requestAssignment: requestBackgroundMusicAssignment } = backgroundMusicAssignment;
  const uploadedAudioAssignment = useUploadedAudioAssignment();
  const { requestAssignment: requestUploadedAudioAssignment } = uploadedAudioAssignment;

  const selectedItem = useMemo(
    () => (selectedOverlayId !== null ? { id: selectedOverlayId } : null),
    [selectedOverlayId],
  );

  const findGapsInRow = (rowItems: Overlay[]) => {
    if (rowItems.length === 0) return [];
    const timePoints = rowItems
      .flatMap((item) => [
        { time: item.from, type: 'start' },
        { time: item.from + item.durationInFrames, type: 'end' },
      ])
      .sort((a, b) => a.time - b.time);
    const gaps: { start: number; end: number }[] = [];
    if (timePoints.length > 0 && timePoints[0].time > 0) {
      gaps.push({ start: 0, end: timePoints[0].time });
    }
    for (let i = 0; i < timePoints.length - 1; i++) {
      const currentPoint = timePoints[i];
      const nextPoint = timePoints[i + 1];
      if (currentPoint.type === 'end' && nextPoint.type === 'start' && nextPoint.time > currentPoint.time) {
        gaps.push({ start: currentPoint.time, end: nextPoint.time });
      }
    }
    return gaps;
  };

  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const handleTransitionDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      const transitionData = e.dataTransfer.getData('application/editron-transition');
      if (!transitionData) return;
      e.preventDefault();
      try {
        const { type, name } = JSON.parse(transitionData);
        setActionStatus(`Applying ${name || type} transition...`);
        const rect = e.currentTarget.getBoundingClientRect();
        void rect;
        const x = e.clientX - e.currentTarget.getBoundingClientRect().left + e.currentTarget.scrollLeft;
        const dropFrame = Math.round((x / e.currentTarget.scrollWidth) * totalDuration);
        const videoOverlays = overlays.filter((o) => o.type === 'video').sort((a, b) => a.from - b.from);
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
        const res = await fetch('/api/services/editron/chat/tool-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, toolName: 'add_transition', params: { type, afterOverlayId: bestOverlayId } }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.status === 'success') {
          setActionStatus('Transition applied!');
          const projRes = await fetch(`/api/services/editron/projects/${projectId}`);
          const projData = await projRes.json().catch(() => null);
          if (projData?.project?.overlays) setOverlays(projData.project.overlays);
        } else {
          setActionStatus(`Failed: ${data.message || 'Unknown error'}`);
        }
      } catch {
        setActionStatus('Transition drop failed');
      }
      setTimeout(() => setActionStatus(null), 2500);
    },
    [overlays, totalDuration, projectId, setOverlays],
  );

  const handleAssetDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const assetData = e.dataTransfer.getData('application/editron-asset');
      if (!assetData) return;
      e.preventDefault();
      try {
        const asset = JSON.parse(assetData);
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
        const y = e.clientY - rect.top;
        const dropFrame = Math.round((x / e.currentTarget.scrollWidth) * totalDuration);
        const targetRow = Math.max(0, Math.min(visibleRows - 1, Math.floor(y / ROW_HEIGHT)));
        const fps = FPS;
        const durationFrames = asset.duration ? Math.round(asset.duration * fps) : 150;
        const segmentStart = asset.segmentStart || 0;
        const segmentEnd = asset.segmentEnd || undefined;
        const segmentDuration = segmentEnd ? Math.round((segmentEnd - segmentStart) * fps) : durationFrames;
        if (asset.type === 'audio' && targetRow === ROW.BGM) {
          const opened = requestBackgroundMusicAssignment({
            assetId: asset.assetId,
            name: asset.name,
          });
          setActionStatus(opened ? 'Confirm music rights to continue' : 'Background music unavailable');
          setTimeout(() => setActionStatus(null), 2000);
          return;
        }

        if (asset.type === 'audio') {
          const opened = requestUploadedAudioAssignment(
            {
              assetId: asset.assetId,
              name: asset.name,
            },
            {
              from: dropFrame,
              durationInFrames: segmentDuration,
              requestedRow: targetRow,
              startFromSound: Math.round(segmentStart * fps),
            },
          );
          setActionStatus(
            opened ? 'Choose an audio role and confirm rights' : 'Audio unavailable',
          );
          setTimeout(() => setActionStatus(null), 2000);
          return;
        }

        let newOverlay: any;
        if (asset.type === 'video') {
          newOverlay = {
            id: Date.now(), type: 'video', from: dropFrame, durationInFrames: segmentDuration, row: targetRow,
            left: 0, top: 0, width: asset.dimensions?.width || 1920, height: asset.dimensions?.height || 1080,
            isDragging: false, rotation: 0, assetId: asset.assetId, src: asset.path, content: asset.thumbnail || '',
            videoStartTime: Math.round(segmentStart * fps), styles: { opacity: 1, objectFit: 'cover' },
          };
        } else if (asset.type === 'image') {
          newOverlay = {
            id: Date.now(), type: 'image', from: dropFrame, durationInFrames: 150, row: targetRow,
            left: 0, top: 0, width: asset.dimensions?.width || 1920, height: asset.dimensions?.height || 1080,
            isDragging: false, rotation: 0, assetId: asset.assetId, src: asset.path, content: asset.path,
            styles: { objectFit: 'cover' },
          };
        }
        if (newOverlay) {
          addOverlay(newOverlay);
          setActionStatus(`Added ${asset.name} to timeline`);
          setTimeout(() => setActionStatus(null), 2000);
        }
      } catch {
        setActionStatus('Failed to add asset');
        setTimeout(() => setActionStatus(null), 2500);
      }
    },
    [
      totalDuration,
      visibleRows,
      addOverlay,
      requestBackgroundMusicAssignment,
      requestUploadedAudioAssignment,
    ],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (e.dataTransfer.types.includes('application/editron-transition')) handleTransitionDrop(e);
      else if (e.dataTransfer.types.includes('application/editron-asset')) handleAssetDrop(e);
    },
    [handleTransitionDrop, handleAssetDrop],
  );

  return (
    <div
      className="relative h-full overflow-x-auto overflow-y-hidden bg-surface-canvas"
      style={{ height: `${visibleRows * ROW_HEIGHT}px` }}
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes('application/editron-transition') ||
          e.dataTransfer.types.includes('application/editron-asset')
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={handleDrop}
    >
      <BackgroundMusicAssignmentDialog controller={backgroundMusicAssignment} />
      <UploadedAudioAssignmentDialog controller={uploadedAudioAssignment} />
      {actionStatus && (
        // Failure strings must not wear the success color — "Failed: …" used to
        // render on the same green chip as confirmations.
        <div className={cn(
          'absolute left-1/2 top-0 z-[100] -translate-x-1/2 rounded-b-md px-3 py-1.5 text-[11px] font-medium shadow-lg',
          /fail/i.test(actionStatus) ? 'bg-status-danger text-white' : 'bg-status-success text-[#0B0B0A]',
        )}>
          {actionStatus}
        </div>
      )}
      <div className="absolute inset-0 flex flex-col gap-2 pb-2 pt-2">
        {isDragging &&
          SNAPPING_CONFIG.enableVerticalSnapping &&
          alignmentLines.map((frame) => (
            <div
              key={`align-${frame}`}
              className="pointer-events-none absolute bottom-0 top-0 z-40 w-px border-r border-dashed border-gold/40"
              style={{ left: `${(frame / totalDuration) * 100}%`, height: '100%' }}
              aria-hidden="true"
            />
          ))}

        {Array.from({ length: visibleRows }).map((_, rowIndex) => {
          const rowItems = overlays.filter((overlay) => overlay.row === rowIndex);
          const gaps = findGapsInRow(rowItems);
          return (
            <div
              key={rowIndex}
              className={`relative flex-1 border-b border-ds-subtle/40 bg-surface-canvas transition-colors duration-200 hover:bg-surface-raised ${
                dragOverRowIndex === rowIndex ? 'border-2 border-ds-emphasis bg-surface-raised' : ''
              } ${draggedRowIndex === rowIndex ? 'opacity-50' : ''}`}
            >
              {rowItems.map((overlay) => {
                const pushOffsetFrames = livePushOffsets.get(overlay.id) || 0;
                const livePushOffsetPercent = totalDuration > 0 ? (pushOffsetFrames / totalDuration) * 100 : 0;
                return (
                  <V2TimelineItem
                    key={overlay.id}
                    item={overlay}
                    isDragging={isDragging}
                    draggedItem={draggedItem}
                    selectedItem={selectedItem}
                    setSelectedItem={(it) => setSelectedOverlayId(it.id)}
                    handleMouseDown={(action, e) => handleDragStart(overlay, e.clientX, e.clientY, action)}
                    handleTouchStart={(action, e) => {
                      const touch = e.touches[0];
                      handleDragStart(overlay, touch.clientX, touch.clientY, action);
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

              {ghostElement && Math.floor(ghostElement.top / (100 / visibleRows)) === rowIndex && (
                <div
                  className="pointer-events-none absolute inset-y-[0.9px] rounded-md border-2 border-gold bg-gold/20"
                  style={{ left: `${ghostElement.left}%`, width: `${Math.max(ghostElement.width, 1)}%`, zIndex: 50 }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
