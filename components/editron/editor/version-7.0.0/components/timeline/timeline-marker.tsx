import React, { useCallback, useMemo, useRef, useState } from "react";

/**
 * Props for the TimelineMarker component.
 */
interface TimelineMarkerProps {
  currentFrame: number;
  totalDuration: number;
  /** Called when user drags the marker to a new position */
  onSeek?: (frame: number) => void;
}

/**
 * TimelineMarker — the red playhead line on the timeline.
 * Now draggable: grab the triangle handle and drag to scrub.
 * Click-to-seek on the timeline still works independently.
 */
const TimelineMarker: React.FC<TimelineMarkerProps> = React.memo(
  ({ currentFrame, totalDuration, onSeek }) => {
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const markerPosition = useMemo(() => {
      const position = (currentFrame / totalDuration) * 100;
      return `${Math.round(position * 10000) / 10000}%`;
    }, [currentFrame, totalDuration]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);

      // Find the scrollable timeline container (has overflow-x-auto or the timeline-grid)
      // Walk up from the marker to find the element with actual scroll width
      let timelineEl = containerRef.current?.parentElement;
      while (timelineEl && timelineEl.scrollWidth <= timelineEl.clientWidth) {
        timelineEl = timelineEl.parentElement;
      }
      if (!timelineEl) timelineEl = containerRef.current?.parentElement;
      if (!timelineEl) return;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!timelineEl) return;
        const rect = timelineEl.getBoundingClientRect();
        // Account for scroll position — scrollLeft shifts the visible area
        const x = Math.max(0, moveEvent.clientX - rect.left + timelineEl.scrollLeft);
        const totalWidth = timelineEl.scrollWidth;
        const percent = Math.min(x / totalWidth, 1);
        const frame = Math.round(percent * totalDuration);
        onSeek?.(frame);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }, [totalDuration, onSeek]);

    return (
      <div
        ref={containerRef}
        className={`absolute top-0 w-[2px] bg-red-500/90 dark:bg-red-500 z-50 ${isDragging ? '' : ''}`}
        style={{
          left: markerPosition,
          transform: "translateX(-50%)",
          height: "calc(100% + 0px)",
          top: "0px",
          willChange: "transform, left",
          pointerEvents: "none", // Line itself doesn't capture events
        }}
      >
        {/* Draggable triangle handle at the top */}
        <div
          onMouseDown={handleMouseDown}
          className={`absolute top-[-2px] left-1/2 transform -translate-x-1/2 cursor-grab ${isDragging ? 'cursor-grabbing' : ''}`}
          style={{
            pointerEvents: "auto", // Handle IS interactive
            // Larger hit area for easier grabbing
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
