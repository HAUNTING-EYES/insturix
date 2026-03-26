import React, {
  useCallback,
  useMemo,
  memo,
  useRef,
  useState,
  useEffect,
} from "react";
import { CaptionOverlay, Overlay, OverlayType } from "../../types";
import { useWaveformProcessor } from "../../hooks/use-waveform-processor";
import WaveformVisualizer from "../overlays/sounds/waveform-visualizer";
import { TimelineKeyframes } from "./timeline-keyframes";
import { TimelineKeyframeDiamonds } from "./timeline-keyframe-diamonds";
import { useSidebar } from "../../contexts/sidebar-context";
import { useEditorContext } from "../../contexts/editor-context";
import { TimelineItemHandle } from "./timeline-item-handle";
import { TimelineItemContextMenu } from "./timeline-item-context-menu";
import { TimelineItemLabel } from "./timeline-item-label";
import TimelineCaptionBlocks from "./timeline-caption-blocks";
import { useKeyframeContext } from "../../contexts/keyframe-context";

/**
 * TimelineItem Component
 *
 * A draggable, resizable item displayed on the video editor timeline. Each item represents
 * a clip, text overlay, or sound element in the video composition.
 *
 * Features:
 * - Draggable positioning
 * - Resizable handles on both ends
 * - Context menu for quick actions
 * - Touch support for mobile devices
 * - Visual feedback for selection and dragging states
 * - Color-coded by content type (text, clip, sound)
 *
 * @component
 */

// Add new interface for waveform data
interface WaveformData {
  peaks: number[];
  length: number;
}

export interface TimelineItemProps {
  /** The overlay item data to be rendered */
  item: Overlay;
  /** Whether any item is currently being dragged */
  isDragging: boolean;
  /** Reference to the item currently being dragged, if any */
  draggedItem: Overlay | null;
  /** Currently selected item in the timeline */
  selectedItem: { id: number } | null;
  /** Callback to update the selected item */
  setSelectedItem: (item: { id: number }) => void;
  /** Handler for mouse-based drag and resize operations */
  handleMouseDown: (
    action: "move" | "resize-start" | "resize-end",
    e: React.MouseEvent<HTMLDivElement>
  ) => void;
  /** Handler for touch-based drag and resize operations */
  handleTouchStart: (
    action: "move" | "resize-start" | "resize-end",
    e: React.TouchEvent<HTMLDivElement>
  ) => void;
  /** Total duration of the timeline in frames */
  totalDuration: number;
  /** Callback to delete an item */
  onDeleteItem: (id: number) => void;
  /** Callback to duplicate an item */
  onDuplicateItem: (id: number) => void;
  /** Callback to split an item at the current position */
  onSplitItem: (id: number) => void;
  /** Callback fired when hovering over an item */
  onHover: (itemId: number, position: number) => void;
  /** Callback fired when context menu state changes */
  onContextMenuChange: (open: boolean) => void;
  /** Waveform data for audio items */
  waveformData?: WaveformData;
  /** Current Frame of the video */
  currentFrame?: number;
  /** Zoom scale of the timeline */
  zoomScale: number;
  /** Callback when asset loading state changes */
  onAssetLoadingChange?: (overlayId: number, isLoading: boolean) => void;
  /** Live push offset percentage during drag */
  livePushOffsetPercent?: number;
}

/** Height of each timeline item in pixels */
export const TIMELINE_ITEM_HEIGHT = 40;

const TimelineItem: React.FC<TimelineItemProps> = ({
  item,
  isDragging,
  draggedItem,
  selectedItem,
  setSelectedItem,
  handleMouseDown,
  handleTouchStart,
  totalDuration,
  onDeleteItem,
  onDuplicateItem,
  onSplitItem,
  onHover,
  onContextMenuChange,
  currentFrame,
  zoomScale,
  onAssetLoadingChange,
  livePushOffsetPercent = 0, // Default to 0 if not provided
}) => {
  const waveformData = useWaveformProcessor(
    item.type === OverlayType.SOUND ? item.src : undefined,
    item.type === OverlayType.SOUND ? item.startFromSound : undefined,
    item.durationInFrames
  );

  const isSelected = selectedItem?.id === item.id;
  const itemRef = useRef<HTMLDivElement>(null);
  const { setActivePanel, setIsOpen } = useSidebar();
  const { changeOverlay: editorChangeOverlay } = useEditorContext();
  const keyframeContext = useKeyframeContext();

  // New state variables for touch interactions
  const [touchStartTime, setTouchStartTime] = useState<number | null>(null);
  const [touchStartPosition, setTouchStartPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isTouching, setIsTouching] = useState(false);
  const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Constants for touch interactions
  const LONG_PRESS_DURATION = 500; // milliseconds
  const TOUCH_MOVEMENT_THRESHOLD = 10; // pixels

  /**
   * Handles mouse and touch interactions with the timeline item
   * Prevents event bubbling and triggers appropriate handlers based on the action
   */
  const handleItemInteraction = (
    e: React.MouseEvent | React.TouchEvent,
    action: "click" | "mousedown" | "touchstart"
  ) => {
    e.stopPropagation();
    if (action === "click") {
      setSelectedItem({ id: item.id });
    } else if (action === "mousedown") {
      // Always select the item first before starting a drag operation
      if (!isSelected) {
        setSelectedItem({ id: item.id });
      }
      handleMouseDown("move", e as React.MouseEvent<HTMLDivElement>);
    } else if (action === "touchstart") {
      // Instead of immediately starting drag, we'll delay to distinguish between tap and drag
      const touchEvent = e as React.TouchEvent<HTMLDivElement>;
      const touch = touchEvent.touches[0];

      // Select the item on touch start (before determining if it's a drag)
      if (!isSelected) {
        setSelectedItem({ id: item.id });
      }

      // Record touch start time and position
      setTouchStartTime(Date.now());
      setTouchStartPosition({ x: touch.clientX, y: touch.clientY });
      setIsTouching(true);

      // Set timeout for long press (for potential context menu)
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
      }

      touchTimeoutRef.current = setTimeout(() => {
        // If still touching after delay, this might be a long press
        if (isTouching) {
          // Could trigger context menu here
          // For now, just provide visual feedback
          setIsTouching(false);
        }
      }, LONG_PRESS_DURATION);
    }
  };

  // Handle touch move to distinguish between tap and drag
  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!touchStartPosition) return;

      const touch = e.touches[0];
      const moveX = Math.abs(touch.clientX - touchStartPosition.x);
      const moveY = Math.abs(touch.clientY - touchStartPosition.y);

      // If moved beyond threshold, consider it a drag operation
      if (
        moveX > TOUCH_MOVEMENT_THRESHOLD ||
        moveY > TOUCH_MOVEMENT_THRESHOLD
      ) {
        // Clear the long press timeout
        if (touchTimeoutRef.current) {
          clearTimeout(touchTimeoutRef.current);
          touchTimeoutRef.current = null;
        }

        // Start the actual drag operation
        handleTouchStart("move", e);

        // Reset touch state
        setTouchStartTime(null);
        setTouchStartPosition(null);
        setIsTouching(false);
      }
    },
    [touchStartPosition, handleTouchStart]
  );

  // Handle touch end to detect taps
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();

      // Clear the long press timeout
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
        touchTimeoutRef.current = null;
      }

      // If touch start time exists and the duration is short, it's a tap
      if (touchStartTime && Date.now() - touchStartTime < LONG_PRESS_DURATION) {
        // This was a tap/click, so select the item
        setSelectedItem({ id: item.id });

        // Also open the sidebar panel if appropriate
        if (
          item.type === OverlayType.VIDEO ||
          item.type === OverlayType.TEXT ||
          item.type === OverlayType.SOUND ||
          item.type === OverlayType.CAPTION ||
          item.type === OverlayType.IMAGE
        ) {
          setActivePanel(item.type);
          setIsOpen(true);
        }
      }

      // Reset touch state
      setTouchStartTime(null);
      setTouchStartPosition(null);
      setIsTouching(false);
    },
    [
      touchStartTime,
      item.id,
      item.type,
      setSelectedItem,
      setActivePanel,
      setIsOpen,
    ]
  );

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Calculates and reports the hover position within the item
   * Used for showing precise position indicators while hovering
   */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!e.currentTarget) {
        console.warn("Current target is null or undefined");
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect) {
        console.warn("getBoundingClientRect returned null or undefined");
        return;
      }
      const relativeX = e.clientX - rect.left;
      const hoverPosition =
        item.from + (relativeX / rect.width) * item.durationInFrames;
      onHover(item.id, Math.round(hoverPosition));
    },
    [item, onHover]
  );

  /**
   * Returns Tailwind CSS classes for styling based on content type
   */
  const getItemClasses = (
    type: OverlayType,
    isHandle: boolean = false
  ): string => {
    switch (type) {
      case OverlayType.TEXT:
        return isHandle
          ? "bg-purple-500/40 dark:bg-purple-500/40"
          : "bg-purple-500/15 hover:bg-purple-500/25 dark:bg-purple-500/15 dark:hover:bg-purple-500/25 border-purple-500/30 dark:border-purple-500/40 text-purple-400 dark:text-purple-300";
      case OverlayType.VIDEO:
        return isHandle
          ? "bg-zinc-400/40 dark:bg-zinc-500/40"
          : "bg-zinc-300/15 hover:bg-zinc-300/25 dark:bg-zinc-700/15 dark:hover:bg-zinc-700/25 border-zinc-400/30 dark:border-zinc-600/40 text-zinc-600 dark:text-zinc-300";
      case OverlayType.SOUND:
        return isHandle
          ? "bg-orange-500/40 dark:bg-orange-500/40"
          : "bg-orange-500/15 hover:bg-orange-500/25 dark:bg-orange-500/15 dark:hover:bg-orange-500/25 border-orange-500/30 dark:border-orange-500/40 text-orange-500 dark:text-orange-400";
      case OverlayType.CAPTION:
        return isHandle
          ? "bg-zinc-400/40 dark:bg-zinc-500/40"
          : "bg-zinc-300/15 hover:bg-zinc-300/25 dark:bg-zinc-600/15 dark:hover:bg-zinc-600/25 border-zinc-400/30 dark:border-zinc-500/40 text-zinc-600 dark:text-zinc-400";
      case OverlayType.IMAGE:
        return isHandle
          ? "bg-emerald-500/40 dark:bg-emerald-500/40"
          : "bg-emerald-500/15 hover:bg-emerald-500/25 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 border-emerald-500/30 dark:border-emerald-500/40 text-emerald-500 dark:text-emerald-400";
      case OverlayType.STICKER:
        return isHandle
          ? "bg-rose-500/40 dark:bg-rose-500/40"
          : "bg-rose-500/15 hover:bg-rose-500/25 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 border-rose-500/30 dark:border-rose-500/40 text-rose-500 dark:text-rose-400";
      case OverlayType.HTML_SCENE:
        return isHandle
          ? "bg-cyan-500/40 dark:bg-cyan-500/40"
          : "bg-cyan-500/15 hover:bg-cyan-500/25 dark:bg-cyan-500/15 dark:hover:bg-cyan-500/25 border-cyan-500/30 dark:border-cyan-500/40 text-cyan-500 dark:text-cyan-400";
      case OverlayType.HTML_STICKER:
        return isHandle
          ? "bg-pink-500/40 dark:bg-pink-500/40"
          : "bg-pink-500/15 hover:bg-pink-500/25 dark:bg-pink-500/15 dark:hover:bg-pink-500/25 border-pink-500/30 dark:border-pink-500/40 text-pink-500 dark:text-pink-400";
      case OverlayType.TRANSITION:
        return isHandle
          ? "bg-amber-500/40 dark:bg-amber-500/40"
          : "bg-amber-500/20 hover:bg-amber-500/30 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 border-amber-500/40 dark:border-amber-500/50 text-amber-400 dark:text-amber-300";

      default:
        return isHandle
          ? "bg-zinc-400/40 dark:bg-zinc-500/40"
          : "bg-zinc-300/15 hover:bg-zinc-300/25 dark:bg-zinc-700/15 dark:hover:bg-zinc-700/25 border-zinc-400/30 dark:border-zinc-600/40 text-zinc-600 dark:text-zinc-300";
    }
  };

  const itemClasses = useMemo(() => getItemClasses(item.type), [item.type]);

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItem({ id: item.id });

    if (
      item.type === OverlayType.VIDEO ||
      item.type === OverlayType.TEXT ||
      item.type === OverlayType.SOUND ||
      item.type === OverlayType.CAPTION ||
      item.type === OverlayType.IMAGE ||
      item.type === OverlayType.HTML_SCENE ||
      item.type === OverlayType.HTML_STICKER
    ) {
      setActivePanel(item.type === OverlayType.HTML_STICKER ? OverlayType.HTML_SCENE : item.type);
      setIsOpen(true);
    }
  };

  const renderContent = () => {
    return (
      <>
        {item.type === OverlayType.IMAGE ? (
          <div className="h-full w-full flex items-center">
            <img
              src={item.src}
              alt=""
              draggable="false"
              onDragStart={(e) => e.preventDefault()}
              className="h-7 w-7 rounded-[1px] ml-6 w-auto object-cover"
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center px-2">
            <TimelineItemLabel item={item} isSelected={isSelected} />
          </div>
        )}
        {item.type === OverlayType.CAPTION && (
          <div className="relative h-full">
            <TimelineCaptionBlocks
              captions={(item as CaptionOverlay).captions}
              durationInFrames={item.durationInFrames}
              currentFrame={currentFrame ?? 0}
              startFrame={item.from}
              totalDuration={totalDuration}
            />
          </div>
        )}
        {item.type === OverlayType.SOUND && waveformData && (
          <div className="absolute inset-0">
            <WaveformVisualizer
              waveformData={waveformData}
              totalDuration={totalDuration}
              durationInFrames={item.durationInFrames}
            />
          </div>
        )}
        {item.type === OverlayType.VIDEO && (
          <TimelineKeyframes
            overlay={item}
            currentFrame={currentFrame ?? 0}
            zoomScale={zoomScale}
            onLoadingChange={(isLoading) =>
              onAssetLoadingChange?.(item.id, isLoading)
            }
          />
        )}
        {/* Keyframe animation diamonds — show for ANY overlay with keyframeTracks */}
        {item.keyframeTracks && item.keyframeTracks.length > 0 && (
          <TimelineKeyframeDiamonds
            overlay={item}
            itemWidth={100} // Percentage-based, actual width handled by CSS
          />
        )}
      </>
    );
  };

  return (
    <TimelineItemContextMenu
      onOpenChange={onContextMenuChange}
      onDeleteItem={(itemId) => {
        // Clear keyframe cache before deletion to prevent memory leaks
        // and ensure proper cleanup of video overlay keyframe data
        // NOTE: This breaks the current pattern slightly, but it's the only
        // way to clear the keyframe cache before deleting the item without
        // messing around with the useKeyframes context and providers
        if (item.type === OverlayType.VIDEO) {
          keyframeContext.clearKeyframes(String(itemId));
        }
        onDeleteItem(itemId);
      }}
      onDuplicateItem={onDuplicateItem}
      onSplitItem={onSplitItem}
      itemId={item.id}
    >
      <div
        ref={itemRef}
        className={`absolute inset-y-[0.9px] rounded-md shadow-md cursor-grab group 
        ${itemClasses} 
        ${isDragging && draggedItem?.id === item.id ? "opacity-50" : ""} 
        ${isTouching ? "scale-[0.98] opacity-80" : ""} 
        ${
          isSelected
            ? "border-2 border-black dark:border-white"
            : "border-[0px]"
        } 
        select-none pointer-events-auto overflow-hidden`}
        style={{
          left: `${(item.from / totalDuration) * 100}%`,
          width: `${(item.durationInFrames / totalDuration) * 100}%`,
          // Ensure transition tiles are at least 40px wide so they're clickable/resizable
          minWidth: item.type === OverlayType.TRANSITION ? 40 : undefined,
          zIndex: isDragging ? 1 : isSelected ? 35 : 30, // Increase z-index when selected
          // Apply transform immediately if pushed, otherwise use standard transition
          transition: `opacity 0.2s ${
            livePushOffsetPercent !== 0
              ? ", transform 0s"
              : ", transform 0.2s ease-out"
          }`,
          transform: `translateX(${livePushOffsetPercent}%)`, // Apply live push offset
        }}
        onMouseDown={(e) => {
          e.stopPropagation(); // Prevent event bubbling
          handleItemInteraction(e, "mousedown");
        }}
        onTouchStart={(e) => {
          e.stopPropagation(); // Prevent event bubbling
          handleItemInteraction(e, "touchstart");
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={(e) => {
          e.stopPropagation(); // Prevent event bubbling
          handleTouchEnd(e);
        }}
        onClick={(e) => {
          e.stopPropagation(); // Prevent event bubbling to timeline click handlers
          handleSelect(e);
        }}
        onMouseMove={handleMouseMove}
      >
        {renderContent()}
        <TimelineItemHandle
          position="left"
          isSelected={isSelected}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (!isSelected) {
              setSelectedItem({ id: item.id });
            }
            handleMouseDown("resize-start", e);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            if (!isSelected) {
              setSelectedItem({ id: item.id });
            }
            handleTouchStart("resize-start", e);
          }}
        />
        <TimelineItemHandle
          position="right"
          isSelected={isSelected}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (!isSelected) {
              setSelectedItem({ id: item.id });
            }
            handleMouseDown("resize-end", e);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            if (!isSelected) {
              setSelectedItem({ id: item.id });
            }
            handleTouchStart("resize-end", e);
          }}
        />

        {/* L-Cut / J-Cut audio boundary handles for sound overlays.
            J-Cut (blue, left): audio starts BEFORE the visual clip
            L-Cut (orange, right): audio continues AFTER the visual clip
            Drag handle to extend/retract the audio boundary. */}
        {item.type === OverlayType.SOUND && isSelected && (
          <>
            {/* J-Cut handle (left) — drag to make audio start before video */}
            <div
              className="absolute top-0 bottom-0 cursor-col-resize group/jcut"
              style={{ right: '100%', width: 12 }}
              title="Drag left to create J-Cut (audio starts before video)"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const startX = e.clientX;
                const currentAudioStart = (item as any).audioStartFrame ?? item.from;
                const parentEl = (e.target as HTMLElement).closest('[class*="absolute inset-y"]')?.parentElement;
                const parentWidth = parentEl?.clientWidth || 600;
                const framesPerPx = totalDuration / parentWidth;

                const handleMove = (moveE: MouseEvent) => {
                  const deltaX = moveE.clientX - startX;
                  const deltaFrames = Math.round(deltaX * framesPerPx);
                  const newAudioStart = Math.max(0, currentAudioStart + deltaFrames);
                  editorChangeOverlay(item.id, { audioStartFrame: Math.min(newAudioStart, item.from) } as any);
                };
                const handleUp = () => {
                  document.removeEventListener('mousemove', handleMove);
                  document.removeEventListener('mouseup', handleUp);
                };
                document.addEventListener('mousemove', handleMove);
                document.addEventListener('mouseup', handleUp);
              }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] bg-blue-500/60 group-hover/jcut:bg-blue-400 rounded-l transition-colors" />
            </div>

            {/* J-Cut extension visualization */}
            {(item as any).audioStartFrame !== undefined && (item as any).audioStartFrame < item.from && (
              <div
                className="absolute top-0 bottom-0 bg-blue-500/15 border-l-2 border-blue-500/40 rounded-l pointer-events-none"
                style={{
                  right: '100%',
                  width: `${(((item.from - (item as any).audioStartFrame) / totalDuration) * 100) / ((item.durationInFrames / totalDuration) * 100) * 100}%`,
                  minWidth: 4,
                }}
              />
            )}

            {/* L-Cut handle (right) — drag to make audio continue after video */}
            <div
              className="absolute top-0 bottom-0 cursor-col-resize group/lcut"
              style={{ left: '100%', width: 12 }}
              title="Drag right to create L-Cut (audio continues after video)"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const startX = e.clientX;
                const currentAudioEnd = (item as any).audioEndFrame ?? (item.from + item.durationInFrames);
                const parentEl = (e.target as HTMLElement).closest('[class*="absolute inset-y"]')?.parentElement;
                const parentWidth = parentEl?.clientWidth || 600;
                const framesPerPx = totalDuration / parentWidth;

                const handleMove = (moveE: MouseEvent) => {
                  const deltaX = moveE.clientX - startX;
                  const deltaFrames = Math.round(deltaX * framesPerPx);
                  const newAudioEnd = Math.max(item.from + item.durationInFrames, currentAudioEnd + deltaFrames);
                  editorChangeOverlay(item.id, { audioEndFrame: newAudioEnd } as any);
                };
                const handleUp = () => {
                  document.removeEventListener('mousemove', handleMove);
                  document.removeEventListener('mouseup', handleUp);
                };
                document.addEventListener('mousemove', handleMove);
                document.addEventListener('mouseup', handleUp);
              }}
            >
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] bg-orange-500/60 group-hover/lcut:bg-orange-400 rounded-r transition-colors" />
            </div>

            {/* L-Cut extension visualization */}
            {(item as any).audioEndFrame !== undefined && (item as any).audioEndFrame > (item.from + item.durationInFrames) && (
              <div
                className="absolute top-0 bottom-0 bg-orange-500/15 border-r-2 border-orange-500/40 rounded-r pointer-events-none"
                style={{
                  left: '100%',
                  width: `${((((item as any).audioEndFrame - item.from - item.durationInFrames) / totalDuration) * 100) / ((item.durationInFrames / totalDuration) * 100) * 100}%`,
                  minWidth: 4,
                }}
              />
            )}
          </>
        )}
      </div>
    </TimelineItemContextMenu>
  );
};

export default memo(TimelineItem);
