import React, { useEffect, useRef } from "react";
import { Card, CardContent } from "../../../../../ui/card";
import { CaptionOverlay } from "../../../types";

/**
 * Props for the CaptionTimeline component
 * @interface CaptionTimelineProps
 * @property {CaptionOverlay} localOverlay - The current caption overlay being edited
 * @property {Function} setLocalOverlay - Function to update the caption overlay
 * @property {number} currentMs - Current playback position in milliseconds
 */
interface CaptionTimelineProps {
  localOverlay: CaptionOverlay;
  setLocalOverlay: (overlay: CaptionOverlay) => void;
  currentMs: number;
}

/**
 * Formats milliseconds into a readable time string (HH:MM:SS)
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string
 */
const formatTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${hours.toString().padStart(2, "0")}:${(minutes % 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};

/**
 * CaptionTimeline Component
 *
 * @component
 * @description
 * Provides an interface for editing and managing caption timing and content.
 * Features include:
 * - Auto-scrolling to active caption
 * - Real-time caption text editing
 * - Visual feedback for active/upcoming/past captions
 * - Automatic word timing distribution
 *
 * The component handles both the visual representation and editing
 * functionality for caption sequences.
 *
 * @example
 * ```tsx
 * <CaptionTimeline
 *   localOverlay={captionOverlay}
 *   setLocalOverlay={handleOverlayUpdate}
 *   currentMs={1000}
 * />
 * ```
 */
export const CaptionTimeline: React.FC<CaptionTimelineProps> = ({
  localOverlay,
  setLocalOverlay,
  currentMs,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCaptionRef = useRef<HTMLDivElement>(null);
  const lastScrolledCaptionIndex = useRef<number>(-1);

  // Improved scrolling logic
  useEffect(() => {
    if (
      !containerRef.current ||
      !activeCaptionRef.current ||
      !localOverlay?.captions
    )
      return;

    const activeIndex = localOverlay.captions.findIndex(
      (caption) => currentMs >= caption.startMs && currentMs < caption.endMs
    );

    // Only scroll if we've moved to a different caption
    if (
      activeIndex !== -1 &&
      activeIndex !== lastScrolledCaptionIndex.current
    ) {
      const container = containerRef.current;
      const activeElement = activeCaptionRef.current;

      const containerHeight = container.clientHeight;
      const elementTop = activeElement.offsetTop;
      const elementHeight = activeElement.clientHeight;

      // Calculate the ideal scroll position to center the element
      const scrollTo = elementTop - containerHeight / 2 + elementHeight / 2;

      container.scrollTo({
        top: scrollTo,
        behavior: "smooth",
      });

      lastScrolledCaptionIndex.current = activeIndex;
    }
  }, [currentMs, localOverlay?.captions]);

  const handleCaptionTextChange = (captionIndex: number, newText: string) => {
    if (!localOverlay?.captions) return;

    const newCaptions = [...localOverlay.captions];
    const currentCaption = newCaptions[captionIndex];

    const words = newText.split(/\s+/).filter((word) => word.length > 0);

    const captionDuration = currentCaption.endMs - currentCaption.startMs;
    const wordDuration = words.length > 0 ? captionDuration / words.length : 0;

    const newWords = words.map((word, idx) => ({
      word,
      startMs: Math.round(currentCaption.startMs + idx * wordDuration),
      endMs: Math.round(currentCaption.startMs + (idx + 1) * wordDuration),
      confidence: 1,
    }));

    newCaptions[captionIndex] = {
      ...currentCaption,
      text: newText,
      words: newWords,
    };

    setLocalOverlay({
      ...localOverlay,
      captions: newCaptions,
    });
  };

  return (
    <div
      className="space-y-2 max-h-screen overflow-y-auto scrollbar-none scrollbar-hide"
      ref={containerRef}
    >
      {localOverlay?.captions?.map((caption, index) => {
        const isActive =
          currentMs >= caption.startMs && currentMs < caption.endMs;
        const isUpcoming = currentMs < caption.startMs;
        const isPast = currentMs >= caption.endMs;

        return (
          <Card
            key={index}
            ref={isActive ? activeCaptionRef : undefined}
            className={`group transition-all duration-200 rounded-sm 
              ${
                isActive
                  ? "border-2 dark:bg-accent/20 dark:border-primary dark:ring-primary/20 bg-accent border-primary ring-2 ring-primary/30"
                  : isUpcoming || isPast
                  ? "border dark:bg-muted/40 dark:border-border bg-muted border-border opacity-75"
                  : "dark:bg-background dark:hover:bg-muted dark:border-border dark:hover:border-primary/40 bg-background hover:bg-muted/50 border-border hover:border-primary/30"
              }`}
          >
            <CardContent className="pl-3 pr-3 pt-3 space-y-2 pb-1 rounded-sm">
              <div className="flex justify-between items-center">
                <div className="text-[8px] text-muted-foreground flex gap-2 mx-2">
                  <span>Start: {formatTime(caption.startMs)}</span>
                </div>
                <div className="text-[8px] text-muted-foreground">
                  {caption.text.length} chars
                </div>
              </div>

              <textarea
                value={caption.text}
                onChange={(e) => handleCaptionTextChange(index, e.target.value)}
                className={`w-full rounded-sm p-2.5
                  text-sm focus:outline-none focus:ring-1 
                  focus:ring-primary/50 border resize-none min-h-[60px] transition-colors
                  placeholder:text-muted-foreground
                  ${
                    isActive
                      ? "dark:bg-muted/80 dark:text-foreground dark:border-primary bg-accent text-foreground border-primary ring-1 ring-primary/30"
                      : "dark:bg-background dark:text-foreground dark:border-border dark:hover:border-primary/40 bg-background text-foreground border-border hover:border-primary/30"
                  }
                `}
                placeholder="Enter caption text..."
                style={{
                  height: "auto",
                  overflow: "hidden",
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
