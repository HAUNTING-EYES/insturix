import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { TextOverlay } from "../../../types";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMerriweather } from "@remotion/google-fonts/Merriweather";
import { loadFont as loadRobotoMono } from "@remotion/google-fonts/RobotoMono";
import { loadFont as loadVT323 } from "@remotion/google-fonts/VT323";
import { loadFont as loadLeagueSpartan } from "@remotion/google-fonts/LeagueSpartan";
import { loadFont as loadBungeeInline } from "@remotion/google-fonts/BungeeInline";
import { animationTemplates } from "../../../templates/animation-templates";
import type { AtomicOverlayForm, AtomicTextGlyph, AtomicTextGlyphRole } from "@/lib/editron/engine/atomic-overlay-core";

// Updated font loading with specific weights and subsets
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

interface TextLayerContentProps {
  overlay: TextOverlay;
}

// Font family mapping function
const getFontFamily = (fontClass?: string) => {
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
};

type AtomicTextForm = NonNullable<AtomicOverlayForm["text"]>;

function getAtomicOverlayForm(overlay: TextOverlay): AtomicOverlayForm | undefined {
  const metadata = (overlay as TextOverlay & { metadata?: { atomicOverlayForm?: unknown; atomicOverlayReceipt?: { form?: unknown } } }).metadata;
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

function normalizeFontSize(fontSize: string | number | undefined): string {
  if (typeof fontSize === "number") return `${fontSize}px`;
  if (!fontSize) return "32px";
  if (/^\d+(\.\d+)?$/.test(fontSize)) return `${fontSize}px`;
  return fontSize;
}

function normalizeTextAlign(textAlign: string | undefined): React.CSSProperties["textAlign"] {
  if (textAlign === "left" || textAlign === "center" || textAlign === "right" || textAlign === "justify") {
    return textAlign;
  }
  return undefined;
}

function atomicMotionStyles(
  form: AtomicOverlayForm | undefined,
  frame: number,
  durationInFrames: number,
): React.CSSProperties {
  if (!form?.text) return {};
  const duration = Math.max(1, durationInFrames);
  const intensity = form.text.motion.intensity || 0.5;
  const entryFrames = Math.max(1, Math.min(14, Math.round(intensity * 16)));
  const exitFrames = Math.max(1, Math.min(12, Math.round(entryFrames * 0.75)));
  const entry = interpolate(frame, [0, entryFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exit = interpolate(frame, [Math.max(0, duration - exitFrames), duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(entry, exit);
  const y = interpolate(entry, [0, 1], [6 + intensity * 8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return {
    opacity,
    transform: `translateY(${y}px)`,
  };
}

function mergeMotionStyles(
  base: React.CSSProperties,
  atomic: React.CSSProperties,
): React.CSSProperties {
  const merged: React.CSSProperties = {
    ...base,
    ...atomic,
  };
  if (base.transform && atomic.transform) {
    merged.transform = `${base.transform} ${atomic.transform}`;
  }
  if (typeof base.opacity === "number" && typeof atomic.opacity === "number") {
    merged.opacity = base.opacity * atomic.opacity;
  }
  return merged;
}

function roleAccentColor(role: AtomicTextGlyphRole, fallback?: string): string | undefined {
  if (role === "statistic" || role === "number") return "#86efac";
  if (role === "cta") return "#7dd3fc";
  if (role === "keyword" || role === "entity") return fallback;
  return undefined;
}

function atomicColorForGlyph(
  atomicText: AtomicTextForm | undefined,
  glyph: AtomicTextGlyph,
  fallback: string | undefined,
): string | undefined {
  if (!glyph.visual || !atomicText?.colorPlan) return undefined;
  if (glyph.visual.colorRole === "accent") return atomicText.colorPlan.roles.accent || fallback;
  if (glyph.visual.colorRole === "contrast") return atomicText.colorPlan.roles.contrast || fallback;
  if (glyph.visual.colorRole === "muted") return atomicText.colorPlan.roles.muted || fallback;
  if (glyph.visual.colorRole === "surface") return atomicText.colorPlan.roles.surface || fallback;
  return atomicText.colorPlan.roles.primary || fallback;
}

function atomicFontForGlyph(
  atomicText: AtomicTextForm | undefined,
  glyph: AtomicTextGlyph,
): string | undefined {
  const fonts = atomicText?.fontPlan?.roles;
  if (glyph.visual?.fontRole === "mono") return fonts?.mono ?? robotoMonoFontFamily;
  if (glyph.visual?.fontRole === "accent") return fonts?.accent ?? leagueSpartanFontFamily;
  if (glyph.visual?.fontRole === "secondary") return fonts?.secondary;
  return fonts?.primary;
}

function glyphStyle(
  atomicText: AtomicTextForm | undefined,
  glyph: AtomicTextGlyph,
  baseColor: string | undefined,
  baseWeight: string | number | undefined,
): React.CSSProperties {
  const role = glyph.emphasis?.role ?? glyph.role;
  const isEmphasis = role !== "word" && role !== "punctuation" && role !== "unknown" && role !== "filler";
  const numericWeight = typeof baseWeight === "number" ? baseWeight : Number.parseInt(String(baseWeight ?? 400), 10);
  const scale = glyph.visual?.scale ?? 1;

  return {
    color: atomicColorForGlyph(atomicText, glyph, baseColor) || roleAccentColor(role, baseColor) || baseColor,
    display: scale !== 1 ? "inline-block" : undefined,
    fontFamily: atomicFontForGlyph(atomicText, glyph),
    fontSize: scale !== 1 ? `${scale}em` : undefined,
    fontWeight: isEmphasis && Number.isFinite(numericWeight)
      ? Math.max(numericWeight, 700)
      : baseWeight,
    textDecoration: glyph.visual?.highlightMode === "underline" || role === "cta" ? "underline" : undefined,
    textUnderlineOffset: glyph.visual?.highlightMode === "underline" || role === "cta" ? "0.14em" : undefined,
  };
}

function renderAtomicText(
  atomicText: AtomicTextForm | undefined,
  fallbackContent: string,
  baseColor: string | undefined,
  baseWeight: string | number | undefined,
): React.ReactNode {
  if (!atomicText?.lines.length) return fallbackContent;

  return atomicText.lines.map((line, lineIndex) => {
    const glyphs = atomicText.glyphs.filter((glyph) => glyph.lineIndex === line.index);
    const lineContent = glyphs.length > 0
      ? glyphs.map((glyph, glyphIndex) => (
          <React.Fragment key={`${line.index}-${glyph.index}-${glyph.text}`}>
            <span style={glyphStyle(atomicText, glyph, baseColor, baseWeight)}>{glyph.text}</span>
            {glyphIndex < glyphs.length - 1 ? " " : null}
          </React.Fragment>
        ))
      : line.text;

    return (
      <React.Fragment key={`${line.index}-${line.text}`}>
        {lineContent}
        {lineIndex < atomicText.lines.length - 1 ? <br /> : null}
      </React.Fragment>
    );
  });
}

export const TextLayerContent: React.FC<TextLayerContentProps> = ({
  overlay,
}) => {
  const frame = useCurrentFrame();
  const atomicForm = getAtomicOverlayForm(overlay);
  const atomicText = atomicForm?.text;

  // Calculate if we're in the exit phase (last 30 frames)
  const isExitPhase = frame >= overlay.durationInFrames - 30;

  // Apply enter animation only during entry phase
  const enterAnimation =
    !isExitPhase && overlay.styles.animation?.enter
      ? animationTemplates[overlay.styles.animation.enter]?.enter(
          frame,
          overlay.durationInFrames
        )
      : {};

  // Apply exit animation only during exit phase
  const exitAnimation =
    isExitPhase && overlay.styles.animation?.exit
      ? animationTemplates[overlay.styles.animation.exit]?.exit(
          frame,
          overlay.durationInFrames
        )
      : {};

  const timelineAnimation = isExitPhase ? exitAnimation : enterAnimation;
  const atomicMotion = atomicMotionStyles(atomicForm, frame, overlay.durationInFrames);
  const textAlign = normalizeTextAlign(atomicText?.typography.textAlign ?? overlay.styles.textAlign);
  const fontSize = normalizeFontSize(atomicText?.typography.fontSize ?? overlay.styles.fontSize ?? 32);
  const fontWeight = atomicText?.typography.fontWeight ?? overlay.styles.fontWeight;
  const color = atomicText?.typography.color ?? overlay.styles.color;
  const backgroundColor = atomicText?.typography.backgroundColor ?? overlay.styles.backgroundColor;
  const lineHeight = atomicText?.typography.lineHeight ?? overlay.styles.lineHeight ?? "1.4";
  const letterSpacing = atomicText?.typography.letterSpacing ?? overlay.styles.letterSpacing;
  const fontFamily = atomicText?.typography.fontFamily ?? overlay.styles.fontFamily;

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center", // Center vertically
    textAlign,
    justifyContent:
      textAlign === "center"
        ? "center"
        : textAlign === "right"
        ? "flex-end"
        : "flex-start",
    overflow: "visible", // Don't clip text
    ...mergeMotionStyles(timelineAnimation, atomicMotion),
  };

  const { ...restStyles } = overlay.styles;
  const textStyle: React.CSSProperties = {
    ...restStyles,
    animation: undefined,
    fontSize,
    fontWeight,
    color,
    backgroundColor,
    fontFamily: getFontFamily(fontFamily),
    maxWidth: "100%",
    wordWrap: "break-word",
    whiteSpace: "pre-wrap",
    lineHeight,
    letterSpacing,
    textAlign,
    padding: "0.1em",
    ...timelineAnimation,
  };

  return (
    <div style={containerStyle}>
      <div style={textStyle}>
        {renderAtomicText(atomicText, overlay.content, color, fontWeight)}
      </div>
    </div>
  );
};
