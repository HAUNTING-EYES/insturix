import React, { useCallback, useMemo, useRef, useState } from "react";

interface TimelineMarkerProps {
  currentFrame: number;
  totalDuration: number;
  /** Called continuously during drag (updates frame state for visual feedback) */
  onSeek?: (frame: number) => void;
  /** Called once on drag end (syncs player to final position) */
  onSeekEnd?: (frame: number) => void;
}

/**
 * TimelineMarker — the red playhead line on the timeline.
 * Draggable: grab the triangle handle and drag to scrub.
 * During drag: only updates frame state (fast, no player sync).
 * On release: syncs the player to the final position.
 */
const TimelineMarker: React.FC<TimelineMarkerProps> = React.memo(
  ({ currentFrame, totalDuration, onSeek, onSeekEnd }) => {
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const lastFrameRef = useRef(currentFrame);

    const markerPosition = useMemo(() => {
      const position = (currentFrame / totalDuration) * 100;
      return `${Math.round(position * 10000) / 10000}%`;
    }, [currentFrame, totalDuration]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);

      let timelineEl = containerRef.current?.parentElement;
      while (timelineEl && timelineEl.scrollWidth <= timelineEl.clientWidth) {
        timelineEl = timelineEl.parentElement;
      }
      if (!timelineEl) timelineEl = containerRef.current?.parentElement;
      if (!timelineEl) return;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!timelineEl) return;
        const rect = timelineEl.getBoundingClientRect();
        const x = Math.max(0, moveEvent.clientX - rect.left + timelineEl.scrollLeft);
        const totalWidth = timelineEl.scrollWidth;
        const percent = Math.min(x / totalWidth, 1);
        const frame = Math.round(percent * totalDuration);
        lastFrameRef.current = frame;
        onSeek?.(frame);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        // Sync player to final drag position
        onSeekEnd?.(lastFrameRef.current);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }, [totalDuration, onSeek, onSeekEnd]);

    return (
      <div
        ref={containerRef}
        className={`absolute top-0 w-[2px] bg-red-500/90 dark:bg-red-500 z-50`}
        style={{
          left: markerPosition,
          transform: "translateX(-50%)",
          height: "calc(100% + 0px)",
          top: "0px",
          willChange: "left",
          pointerEvents: "none",
        }}
      >
        {/* Draggable triangle handle at the top */}
        <div
          onMouseDown={handleMouseDown}
          className={`absolute top-[-2px] left-1/2 transform -translate-x-1/2 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            pointerEvents: "auto",
            width: 16,
            height: 14,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            zIndex: 60,
          }}
        >
          <div
            className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[10px]
              border-l-transparent border-r-transparent
              border-t-red-500/90 dark:border-t-red-500"
          />
        </div>
      </div>
    );
  }
);

TimelineMarker.displayName = "TimelineMarker";

export default TimelineMarker;
