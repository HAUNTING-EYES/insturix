import React from "react";
import { useCurrentFrame } from "remotion";
import { Caption, CaptionOverlay, CaptionWord, HighlightEffect, HighlightAnimation, CaptionDisplayConfig, DEFAULT_DISPLAY_CONFIGS } from "../../../types";
import { defaultCaptionStyles, defaultDisplayConfig } from "./default-caption-styles";

/**
 * Props for the CaptionLayerContent component
 */
interface CaptionLayerContentProps {
  overlay: CaptionOverlay;
}

/**
 * Get CSS for highlight effects
 */
const getEffectStyles = (effect: HighlightEffect, isActive: boolean): React.CSSProperties => {
  if (!isActive) return {};
  
  switch (effect) {
    case "glow":
      return {
        boxShadow: "0 0 20px currentColor, 0 0 40px currentColor",
      };
    case "box":
      return {
        // Box effect handled by backgroundColor
      };
    case "underline":
      return {
        textDecoration: "underline",
        textUnderlineOffset: "4px",
        textDecorationThickness: "3px",
      };
    case "pop":
      return {
        filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.4))",
      };
    default:
      return {};
  }
};

/**
 * Calculate frame-based animation values that sync with timeline
 * Returns inline styles instead of CSS animation classes
 */
const getAnimationStyles = (
  animation: HighlightAnimation,
  isActive: boolean,
  progress: number
): React.CSSProperties => {
  if (!isActive) return {};
  
  // Progress cycles from 0-1 based on word timing
  const cycleProgress = progress % 1;
  
  switch (animation) {
    case "bounce": {
      // Bounce animation: move up and down based on progress
      const bounceY = Math.sin(cycleProgress * Math.PI * 2) * -6; // -6px to 6px
      return {
        transform: `translateY(${bounceY}px)`,
      };
    }
    case "pulse": {
      // Pulse animation: scale in and out
      const pulseScale = 1 + Math.sin(cycleProgress * Math.PI * 2) * 0.08; // 0.92 to 1.08
      return {
        transform: `scale(${pulseScale})`,
      };
    }
    case "scale":
      // Scale handled by the main transform logic
      return {};
    default:
      return {};
  }
};

/**
 * CaptionLayerContent Component
 * Renders animated captions with word-by-word highlighting and customizable effects
 * Supports multiple display modes: word-by-word, phrase, karaoke, subtitle
 */
export const CaptionLayerContent: React.FC<CaptionLayerContentProps> = ({
  overlay,
}) => {
  const frame = useCurrentFrame();
  const frameMs = (frame / 30) * 1000;
  const styles = overlay.styles || defaultCaptionStyles;
  const highlight = styles.highlight || styles.highlightStyle || defaultCaptionStyles.highlight;
  const displayConfig = overlay.displayConfig || defaultDisplayConfig;

  // Find current caption based on frame timestamp
  const currentCaption = overlay.captions.find(
    (caption) => frameMs >= caption.startMs && frameMs <= caption.endMs
  );

  if (!currentCaption) return null;

  /**
   * Determines which words to display based on display mode
   */
  const getWordsToDisplay = (caption: Caption): { word: CaptionWord; state: "active" | "visible" | "faded" }[] => {
    const { mode, showPreviousWords, fadeOutPreviousWords } = displayConfig;
    const words = caption.words || [];
    
    // Find the currently active word index
    const activeWordIndex = words.findIndex(
      (word) => frameMs >= word.startMs && frameMs <= word.endMs
    );

    if (mode === "word-by-word") {
      // Only show the current word
      if (activeWordIndex === -1) return [];
      return [{ word: words[activeWordIndex], state: "active" }];
    }

    if (mode === "phrase") {
      // Show words around the active word based on wordsPerGroup
      const halfWindow = Math.floor(displayConfig.wordsPerGroup / 2);
      const start = Math.max(0, activeWordIndex - halfWindow);
      const end = Math.min(words.length, start + displayConfig.wordsPerGroup);
      
      return words.slice(start, end).map((word, i) => ({
        word,
        state: (start + i) === activeWordIndex ? "active" : "visible",
      }));
    }

    // karaoke and subtitle modes - show all words in the caption
    return words.map((word, index) => {
      const isActive = frameMs >= word.startMs && frameMs <= word.endMs;
      const isPast = frameMs > word.endMs;
      
      if (isActive) return { word, state: "active" as const };
      
      if (isPast && showPreviousWords) {
        return { word, state: fadeOutPreviousWords ? "faded" as const : "visible" as const };
      }
      
      // Future words - show but not highlighted
      return { word, state: "visible" as const };
    });
  };

  /**
   * Renders individual words with highlight animations and effects
   */
  const renderWords = (caption: Caption) => {
    const wordsToDisplay = getWordsToDisplay(caption);
    
    return wordsToDisplay.map(({ word, state }, index) => {
      const isActive = state === "active";
      const isFaded = state === "faded";
      
      // Calculate progress within the word's duration for smooth animations
      const wordDuration = word.endMs - word.startMs;
      const progress = isActive
        ? (frameMs - word.startMs) / Math.max(wordDuration, 100)
        : 0;

      const effectStyles = getEffectStyles(highlight.effect, isActive);
      const animationStyles = getAnimationStyles(highlight.animation, isActive, progress);

      // Build the base transform
      let baseTransform = isActive
        ? `scale(${1 + (highlight.scale - 1) * Math.min(progress * 3, 1)})`
        : "scale(1)";

      // Merge animation transform if present (for bounce/pulse)
      if (animationStyles.transform && highlight.animation !== "scale") {
        baseTransform = `${baseTransform} ${animationStyles.transform}`;
      }

      return (
        <span
          key={`${word.word}-${index}`}
          className={`inline-block ${styles.fontFamily}`}
          style={{
            color: isActive ? highlight.color : styles.color,
            backgroundColor: isActive
              ? highlight.backgroundColor
              : "transparent",
            opacity: isFaded ? 0.5 : (isActive ? 1 : 0.85),
            transform: baseTransform,
            fontWeight: isActive
              ? highlight.fontWeight || 600
              : styles.fontWeight || 400,
            textShadow: isActive
              ? highlight.textShadow
              : styles.textShadow,
            padding: highlight.padding || "4px 8px",
            borderRadius: highlight.borderRadius || "4px",
            margin: "0 2px",
            transition: "color 150ms, background-color 150ms, opacity 150ms",
            ...effectStyles,
          }}
        >
          {word.word}
        </span>
      );
    });
  };

  return (
    <div
      style={{
        // IMPORTANT: Using inline styles instead of Tailwind for Lambda compatibility
        // Tailwind classes may not load correctly in Lambda's headless Chrome
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: styles.padding || '16px',
        // Use background (gradient) if set, otherwise fall back to backgroundColor
        background: styles.background || styles.backgroundColor || undefined,
        backdropFilter: styles.backdropFilter,
        borderRadius: styles.borderRadius,
      }}
    >
      <div
        style={{
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          fontFamily: styles.fontFamily?.startsWith('font-') 
            ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            : styles.fontFamily,
          letterSpacing: styles.letterSpacing || '0.025em',
          lineHeight: styles.lineHeight,
          textAlign: styles.textAlign,
          whiteSpace: 'pre-wrap',
          width: '100%',
          wordBreak: 'break-word',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: styles.textAlign === 'center' ? 'center' : styles.textAlign === 'right' ? 'flex-end' : 'flex-start',
          alignItems: 'center',
          gap: '2px',
        }}
      >
        {renderWords(currentCaption)}
      </div>
    </div>
  );
};
