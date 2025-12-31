import React from "react";
import { useCurrentFrame } from "remotion";
import { Caption, CaptionOverlay, HighlightEffect, HighlightAnimation } from "../../../types";
import { defaultCaptionStyles } from "./default-caption-styles";

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
 */
export const CaptionLayerContent: React.FC<CaptionLayerContentProps> = ({
  overlay,
}) => {
  const frame = useCurrentFrame();
  const frameMs = (frame / 30) * 1000;
  const styles = overlay.styles || defaultCaptionStyles;
  const highlight = styles.highlight || styles.highlightStyle || defaultCaptionStyles.highlight;

  // Find current caption based on frame timestamp
  const currentCaption = overlay.captions.find(
    (caption) => frameMs >= caption.startMs && frameMs <= caption.endMs
  );

  if (!currentCaption) return null;

  /**
   * Renders individual words with highlight animations and effects
   */
  const renderWords = (caption: Caption) => {
    return caption?.words?.map((word, index) => {
      const isHighlighted = frameMs >= word.startMs && frameMs <= word.endMs;
      // Calculate progress within the word's duration for smooth animations
      const wordDuration = word.endMs - word.startMs;
      const progress = isHighlighted
        ? (frameMs - word.startMs) / Math.max(wordDuration, 100)
        : 0;

      const effectStyles = getEffectStyles(highlight.effect, isHighlighted);
      const animationStyles = getAnimationStyles(highlight.animation, isHighlighted, progress);

      // Build the base transform
      let baseTransform = isHighlighted
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
            color: isHighlighted ? highlight.color : styles.color,
            backgroundColor: isHighlighted
              ? highlight.backgroundColor
              : "transparent",
            opacity: isHighlighted ? 1 : 0.85,
            transform: baseTransform,
            fontWeight: isHighlighted
              ? highlight.fontWeight || 600
              : styles.fontWeight || 400,
            textShadow: isHighlighted
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
      className="absolute inset-0 flex items-center justify-center p-4"
      style={{
        // Use background (gradient) if set, otherwise fall back to backgroundColor
        background: styles.background || styles.backgroundColor || undefined,
        backdropFilter: styles.backdropFilter,
        borderRadius: styles.borderRadius,
        padding: styles.padding,
      }}
    >
      <div
        className={`leading-relaxed tracking-wide ${styles.fontFamily}`}
        style={{
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          letterSpacing: styles.letterSpacing,
          lineHeight: styles.lineHeight,
          textAlign: styles.textAlign,
          whiteSpace: "pre-wrap",
          width: "100%",
          wordBreak: "break-word",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: styles.textAlign === "center" ? "center" : styles.textAlign === "right" ? "flex-end" : "flex-start",
          alignItems: "center",
          gap: "2px",
        }}
      >
        {renderWords(currentCaption)}
      </div>
    </div>
  );
};
