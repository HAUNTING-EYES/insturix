import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMerriweather } from "@remotion/google-fonts/Merriweather";
import { loadFont as loadRobotoMono } from "@remotion/google-fonts/RobotoMono";
import { loadFont as loadVT323 } from "@remotion/google-fonts/VT323";
import { loadFont as loadLeagueSpartan } from "@remotion/google-fonts/LeagueSpartan";
import { loadFont as loadBungeeInline } from "@remotion/google-fonts/BungeeInline";
import { Caption, CaptionOverlay, CaptionWord, HighlightEffect, HighlightAnimation, CaptionDisplayConfig, DEFAULT_DISPLAY_CONFIGS } from "../../../types";
import { defaultCaptionStyles, defaultDisplayConfig } from "./default-caption-styles";
import type { AtomicOverlayForm, AtomicTextGlyphRole } from "@/lib/editron/engine/atomic-overlay-core";

const { fontFamily: interFontFamily } = loadInter("normal", {
  weights: ["700"],
});

const { fontFamily: merriweatherFontFamily } = loadMerriweather("normal", {
  weights: ["700"],
  subsets: ["latin"],
});

const { fontFamily: robotoMonoFontFamily } = loadRobotoMono("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

const { fontFamily: vt323FontFamily } = loadVT323("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

const { fontFamily: leagueSpartanFontFamily } = loadLeagueSpartan("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

const { fontFamily: bungeeInlineFontFamily } = loadBungeeInline("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

export function getCaptionFontFamily(fontClass?: string): string {
  switch (fontClass) {
    case "font-sans":
    case "Inter":
      return interFontFamily;
    case "font-serif":
    case "Merriweather":
      return merriweatherFontFamily;
    case "font-mono":
    case "Roboto Mono":
      return robotoMonoFontFamily;
    case "font-retro":
    case "VT323":
      return vt323FontFamily;
    case "font-league-spartan":
    case "League Spartan":
      return leagueSpartanFontFamily;
    case "font-bungee-inline":
    case "Bungee Inline":
      return bungeeInlineFontFamily;
    default:
      return fontClass || interFontFamily;
  }
}

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

function normalizeFontSize(fontSize: string | number | undefined): string {
  if (typeof fontSize === "number") return `${fontSize}px`;
  if (!fontSize) return "32px";
  if (/^\d+(\.\d+)?$/.test(fontSize)) return `${fontSize}px`;
  return fontSize;
}

type AtomicTextForm = NonNullable<AtomicOverlayForm["text"]>;

type DisplayWord = {
  word: CaptionWord;
  state: "active" | "visible" | "faded";
  globalIndex: number;
};

const CAPTION_MODES = new Set(Object.keys(DEFAULT_DISPLAY_CONFIGS));
const HIGHLIGHT_EFFECTS = new Set<HighlightEffect>(["none", "glow", "box", "underline", "pop"]);
const HIGHLIGHT_ANIMATIONS = new Set<HighlightAnimation>(["none", "bounce", "pulse", "scale"]);

function getAtomicOverlayForm(overlay: CaptionOverlay): AtomicOverlayForm | undefined {
  const metadata = (overlay as CaptionOverlay & { metadata?: { atomicOverlayForm?: unknown; atomicOverlayReceipt?: { form?: unknown } } }).metadata;
  const direct = metadata?.atomicOverlayForm;
  if (isAtomicOverlayForm(direct)) return direct;
  const receiptForm = metadata?.atomicOverlayReceipt?.form;
  return isAtomicOverlayForm(receiptForm) ? receiptForm : undefined;
}

function isAtomicOverlayForm(value: unknown): value is AtomicOverlayForm {
  return typeof value === "object"
    && value !== null
    && (value as Partial<AtomicOverlayForm>).version === "overlay-atomic-form-v1";
}

function mergeAtomicDisplayConfig(
  base: CaptionDisplayConfig,
  atomicDisplay?: AtomicTextForm["display"],
): CaptionDisplayConfig {
  if (!atomicDisplay) return base;
  return {
    ...base,
    mode: isCaptionMode(atomicDisplay.mode) ? atomicDisplay.mode : base.mode,
    wordsPerGroup: atomicDisplay.wordsPerGroup ?? base.wordsPerGroup,
    maxWordsPerLine: atomicDisplay.maxWordsPerLine ?? base.maxWordsPerLine,
    showPreviousWords: atomicDisplay.showPreviousWords ?? base.showPreviousWords,
    fadeOutPreviousWords: atomicDisplay.fadeOutPreviousWords ?? base.fadeOutPreviousWords,
  };
}

function isCaptionMode(value: unknown): value is CaptionDisplayConfig["mode"] {
  return typeof value === "string" && CAPTION_MODES.has(value);
}

function asHighlightEffect(value: unknown): HighlightEffect {
  return typeof value === "string" && HIGHLIGHT_EFFECTS.has(value as HighlightEffect)
    ? value as HighlightEffect
    : "none";
}

function asHighlightAnimation(value: unknown): HighlightAnimation {
  return typeof value === "string" && HIGHLIGHT_ANIMATIONS.has(value as HighlightAnimation)
    ? value as HighlightAnimation
    : "none";
}

function atomicMotionStyles(
  form: AtomicOverlayForm | undefined,
  frame: number,
  durationInFrames: number,
): React.CSSProperties {
  if (!form?.text) return {};
  const entryFrames = Math.max(1, Math.min(12, Math.round((form.text.motion.intensity || 0.5) * 14)));
  const exitFrames = Math.max(1, Math.min(12, Math.round(entryFrames * 0.8)));
  const entry = interpolate(frame, [0, entryFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exit = interpolate(frame, [Math.max(0, durationInFrames - exitFrames), durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(entry, exit);
  const y = interpolate(entry, [0, 1], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return {
    opacity,
    transform: `translateY(${y}px)`,
  };
}

function roleAccentColor(role: AtomicTextGlyphRole, fallback: string): string | undefined {
  if (role === "statistic" || role === "number") return "#86efac";
  if (role === "cta") return "#7dd3fc";
  if (role === "keyword" || role === "entity") return fallback;
  return undefined;
}

function atomicGlyphColor(
  atomicText: AtomicTextForm | undefined,
  glyph: AtomicTextForm["glyphs"][number] | undefined,
  fallback: string,
): string | undefined {
  const role = glyph?.visual?.colorRole;
  if (!role || !atomicText?.colorPlan) return undefined;
  if (role === "accent") return atomicText.colorPlan.roles.accent || fallback;
  if (role === "contrast") return atomicText.colorPlan.roles.contrast || fallback;
  if (role === "muted") return atomicText.colorPlan.roles.muted || fallback;
  if (role === "surface") return atomicText.colorPlan.roles.surface || fallback;
  return atomicText.colorPlan.roles.primary || fallback;
}

function atomicGlyphFontFamily(
  atomicText: AtomicTextForm | undefined,
  glyph: AtomicTextForm["glyphs"][number] | undefined,
): string | undefined {
  const role = glyph?.visual?.fontRole;
  if (!role) return undefined;
  const fonts = atomicText?.fontPlan?.roles;
  if (role === "accent") return getCaptionFontFamily(fonts?.accent ?? fonts?.primary);
  if (role === "mono") return fonts?.mono ?? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
  if (role === "secondary") return fonts?.secondary ? getCaptionFontFamily(fonts.secondary) : 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  return fonts?.primary ? getCaptionFontFamily(fonts.primary) : undefined;
}

function shouldBreakAfter(
  words: DisplayWord[],
  index: number,
  config: CaptionDisplayConfig,
  atomicText?: AtomicTextForm,
): boolean {
  const current = words[index];
  const next = words[index + 1];
  if (!current || !next) return false;
  const currentGlyph = atomicText?.glyphs.find((glyph) => glyph.index === current.globalIndex);
  const nextGlyph = atomicText?.glyphs.find((glyph) => glyph.index === next.globalIndex);
  if (currentGlyph && nextGlyph && currentGlyph.lineIndex !== nextGlyph.lineIndex) return true;
  const rowCapacity = atomicText?.composition.rowCapacity ?? config.maxWordsPerLine;
  return rowCapacity > 0 && (index + 1) % rowCapacity === 0;
}

/**
 * CaptionLayerContent Component
 * Renders animated captions with word-by-word highlighting and customizable effects
 * Supports multiple display modes: word-by-word, phrase, karaoke, subtitle
 */
export const CaptionLayerContent: React.FC<CaptionLayerContentProps> = ({
  overlay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frameMs = (frame / fps) * 1000;
  const styles = overlay.styles || defaultCaptionStyles;
  const atomicForm = getAtomicOverlayForm(overlay);
  const atomicText = atomicForm?.text;
  const highlight = {
    ...(styles.highlight || styles.highlightStyle || defaultCaptionStyles.highlight),
    ...(atomicText?.highlight ?? {}),
  };
  const displayConfig = mergeAtomicDisplayConfig(overlay.displayConfig || defaultDisplayConfig, atomicText?.display);
  const motionStyles = atomicMotionStyles(atomicForm, frame, overlay.durationInFrames);

  // Find current caption based on frame timestamp
  const currentCaption = overlay.captions.find(
    (caption) => frameMs >= caption.startMs && frameMs <= caption.endMs
  );

  if (!currentCaption) return null;

  /**
   * Determines which words to display based on display mode
   */
  const getWordsToDisplay = (caption: Caption): DisplayWord[] => {
    const { mode, showPreviousWords, fadeOutPreviousWords } = displayConfig;
    const words = caption.words || [];
    const captionWordOffset = overlay.captions
      .slice(0, overlay.captions.indexOf(caption))
      .reduce((sum, item) => sum + (item.words?.length ?? 0), 0);
    
    if (words.length === 0) return [];
    // Find the active word. ponytail: between words (1335 gaps here, up to 5s) no word is "exactly"
    // active — hold the last-started word instead of blanking, so captions don't flicker out
    // (was: `return []` on -1 -> caption blank ~32% of the time on this project).
    let activeWordIndex = words.findIndex(
      (word) => frameMs >= word.startMs && frameMs <= word.endMs
    );
    if (activeWordIndex === -1) {
      for (let i = 0; i < words.length && words[i].startMs <= frameMs; i++) activeWordIndex = i;
      if (activeWordIndex === -1) activeWordIndex = 0; // before the first word -> show the first
    }

    if (mode === "word-by-word") {
      // Only show the current word
      return [{ word: words[activeWordIndex], state: "active", globalIndex: captionWordOffset + activeWordIndex }];
    }

    if (mode === "phrase" || mode === "instagram" || mode === "hormozi") {
      const halfWindow = Math.floor(displayConfig.wordsPerGroup / 2);
      const start = Math.max(0, activeWordIndex - halfWindow);
      const end = Math.min(words.length, start + displayConfig.wordsPerGroup);

      return words.slice(start, end).map((word, i) => ({
        word,
        state: (start + i) === activeWordIndex ? "active" : "visible",
        globalIndex: captionWordOffset + start + i,
      }));
    }

    // karaoke and subtitle modes - show all words in the caption
    return words.map((word, index) => {
      const isActive = frameMs >= word.startMs && frameMs <= word.endMs;
      const isPast = frameMs > word.endMs;
      
      if (isActive) return { word, state: "active" as const, globalIndex: captionWordOffset + index };
      
      if (isPast && showPreviousWords) {
        return { word, state: fadeOutPreviousWords ? "faded" as const : "visible" as const, globalIndex: captionWordOffset + index };
      }
      
      // Future words - show but not highlighted
      return { word, state: "visible" as const, globalIndex: captionWordOffset + index };
    });
  };

  /**
   * Renders individual words with highlight animations and effects
   */
  const renderWords = (caption: Caption) => {
    const wordsToDisplay = getWordsToDisplay(caption);
    
    return wordsToDisplay.map(({ word, state, globalIndex }, index) => {
      const isActive = state === "active";
      const isFaded = state === "faded";
      const atomicGlyph = atomicText?.glyphs.find((glyph) => glyph.index === globalIndex);
      const glyphRole = atomicGlyph?.emphasis?.role ?? atomicGlyph?.role ?? word.emphasis?.type ?? "word";
      // Registry per-role colour (e.g. Hormozi keyword #FFD93D) wins; then atomic-glyph colour; then the
      // built-in role accents. Drives the "coloured-bold per word" look from the picked style's row.
      const registryRoleColor = styles.roles?.[glyphRole as "keyword" | "statistic" | "cta" | "entity"]?.color;
      const roleColor = registryRoleColor ?? atomicGlyphColor(atomicText, atomicGlyph, highlight.color) ?? roleAccentColor(glyphRole, highlight.color);
      const glyphScale = atomicGlyph?.visual?.scale ?? 1;
      const glyphFontFamily = atomicGlyphFontFamily(atomicText, atomicGlyph);
      
      // Calculate progress within the word's duration for smooth animations
      const wordDuration = word.endMs - word.startMs;
      const progress = isActive
        ? (frameMs - word.startMs) / Math.max(wordDuration, 100)
        : 0;

      const highlightEffect = asHighlightEffect(highlight.effect);
      const highlightAnimation = asHighlightAnimation(highlight.animation);
      const effectStyles = getEffectStyles(highlightEffect, isActive);
      const animationStyles = getAnimationStyles(highlightAnimation, isActive, progress);

      // Build the base transform: spring or linear scale on active word
      const wordStartFrame = Math.round((word.startMs / 1000) * fps);
      const framesSinceWordStart = frame - wordStartFrame;

      let scaleValue = 1;
      if (isActive && displayConfig.useSpringScale && framesSinceWordStart >= 0) {
        const springProgress = spring({
          frame: framesSinceWordStart,
          fps,
          config: {
            damping: displayConfig.springDamping ?? 10,
            mass: displayConfig.springMass ?? 0.5,
          },
        });
        scaleValue = 1 + (highlight.scale - 1) * springProgress;
      } else if (isActive) {
        scaleValue = 1 + (highlight.scale - 1) * Math.min(progress * 3, 1);
      }
      scaleValue *= glyphScale;

      let baseTransform = `scale(${scaleValue})`;

      // Merge animation transform if present (for bounce/pulse)
      if (animationStyles.transform && highlightAnimation !== "scale") {
        baseTransform = `${baseTransform} ${animationStyles.transform}`;
      }

      const hasEmphasis = !!word.emphasis || (glyphRole !== "word" && glyphRole !== "punctuation" && glyphRole !== "unknown" && glyphRole !== "filler");
      const readablePanelMode = displayConfig.mode === "karaoke" || displayConfig.mode === "subtitle";
      const emphasisWeight = hasEmphasis ? 700 : (styles.fontWeight || 400);
      const emphasisScale = hasEmphasis && !isActive ? `scale(${glyphScale})` : baseTransform;
      const emphasisBorder = hasEmphasis && !isActive && atomicGlyph?.visual?.highlightMode === "underline"
        ? { borderBottom: `2px solid ${roleColor || highlight.color || styles.color}` }
        : {};
      const emphasisBackground = hasEmphasis && !isActive && atomicGlyph?.visual?.highlightMode === "fill"
        ? highlight.backgroundColor
        : "transparent";
      const emphasisTextColor = emphasisBackground !== "transparent"
        ? atomicText?.colorPlan.roles.contrast || highlight.color
        : roleColor || styles.color;
      const lineBreak = shouldBreakAfter(wordsToDisplay, index, displayConfig, atomicText);

      return (
        <React.Fragment key={`${word.word}-${globalIndex}-${index}`}>
          <span
            className={`inline-block ${styles.fontFamily}`}
            style={{
              color: isActive ? highlight.color : emphasisTextColor,
              backgroundColor: isActive
                ? highlight.backgroundColor
                : emphasisBackground,
              opacity: isFaded
                ? (readablePanelMode ? 0.72 : 0.5)
                : 1,
              transform: isActive ? baseTransform : emphasisScale,
              fontWeight: isActive
                ? highlight.fontWeight || 600
                : emphasisWeight,
              fontFamily: glyphFontFamily,
              textShadow: isActive
                ? highlight.textShadow
                : styles.textShadow,
              padding: highlight.padding || "4px 8px",
              borderRadius: highlight.borderRadius || "4px",
              margin: "0 2px",
              transition: "color 150ms, background-color 150ms, opacity 150ms",
              // MrBeast-style outline — only when the picked style ships a stroke. paintOrder keeps the
              // fill full (stroke drawn behind), so the letterforms don't thin out.
              ...(styles.stroke ? { WebkitTextStroke: `${styles.stroke.widthPx}px ${styles.stroke.color}`, paintOrder: "stroke fill" } : {}),
              ...effectStyles,
              ...emphasisBorder,
            }}
          >
            {word.word}
          </span>
          {lineBreak ? <span style={{ flexBasis: "100%", height: 0 }} /> : null}
        </React.Fragment>
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
        ...motionStyles,
      }}
    >
      <div
        style={{
          // Scale font size proportionally when user resizes the caption box.
          // Base font size was designed for a default box height (~150px).
          // If box is resized, scale the font proportionally.
          fontSize: (() => {
            const basePx = parseFloat(normalizeFontSize(styles.fontSize));
            const defaultHeight = 150; // Default caption box height from calculatePosition
            const currentHeight = overlay.height || defaultHeight;
            const scale = Math.max(0.5, Math.min(3, currentHeight / defaultHeight));
            return `${Math.round(basePx * scale)}px`;
          })(),
          fontWeight: styles.fontWeight,
          fontFamily: getCaptionFontFamily(styles.fontFamily),
          letterSpacing: styles.letterSpacing || '0.025em',
          lineHeight: styles.lineHeight,
          textAlign: styles.textAlign,
          textTransform: styles.textTransform,
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
