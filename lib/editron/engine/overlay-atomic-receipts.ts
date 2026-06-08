import {
  buildOverlayAtomicReceipt,
  overlayAtom,
  type AtomicOverlayAtom,
  type AtomicOverlayFamily,
  type AtomicOverlayForm,
  type AtomicOverlayReceipt,
} from "./atomic-overlay-core";
import { resolveMotionTokens, type BrandInputs, type ContentSignals, type MotionTokens } from "@/lib/editron/data/motion-theme-resolver";
import { momentBundleToSignalMap, type AtomicMomentBundle } from "@/lib/editron/services/moment-bundle";
import type { Caption, CaptionDisplayConfig, Overlay } from "@/components/editron/editor/version-7.0.0/types";

export interface AtomicOverlayReceiptOptions {
  source?: string;
  intent?: string;
  reason?: string;
  appendReceipt?: boolean;
  signals?: Record<string, unknown>;
  momentBundle?: AtomicMomentBundle;
  brand?: Partial<BrandInputs>;
}

type OverlayMetadata = Record<string, unknown> & {
  atomicOverlayReceipt?: AtomicOverlayReceipt;
  atomicOverlayReceipts?: unknown;
  atomicOverlayForm?: AtomicOverlayForm;
  atomicOverlayForms?: unknown;
  atomicMomentBundle?: unknown;
};

type CaptionDisplayAtomInput = Pick<
  CaptionDisplayConfig,
  "mode" | "wordsPerGroup" | "maxWordsPerLine" | "showPreviousWords" | "fadeOutPreviousWords"
>;

export function hasAtomicOverlayReceipt(overlay: Overlay): boolean {
  const metadata = overlayMetadata(overlay);
  return metadata?.atomicOverlayReceipt?.version === "overlay-atoms-v1"
    && metadata.atomicOverlayReceipt.form?.version === "overlay-atomic-form-v1"
    && metadata.atomicOverlayForm?.version === "overlay-atomic-form-v1";
}

export function ensureAtomicOverlayReceipt<T extends Overlay>(
  overlay: T,
  options: AtomicOverlayReceiptOptions = {},
): T {
  if (hasAtomicOverlayReceipt(overlay)) return overlay;
  return withAtomicOverlayReceipt(overlay, {
    appendReceipt: false,
    ...options,
  });
}

export function ensureLiveAtomicOverlayReceipt<T extends Overlay>(
  overlay: T,
  options: AtomicOverlayReceiptOptions = {},
): T {
  if (isAtomicOverlayReceiptCurrent(overlay)) return overlay;
  return withAtomicOverlayReceipt(overlay, {
    appendReceipt: false,
    ...options,
  });
}

export function isAtomicOverlayReceiptCurrent(overlay: Overlay): boolean {
  const metadata = overlayMetadata(overlay);
  const receipt = metadata?.atomicOverlayReceipt;
  if (!receipt || receipt.version !== "overlay-atoms-v1") return false;
  if (receipt.form?.version !== "overlay-atomic-form-v1") return false;
  if (metadata?.atomicOverlayForm?.version !== "overlay-atomic-form-v1") return false;
  const target = receipt.target ?? {};
  const payload = receipt.payload ?? {};
  const styleLike = overlayStyles(overlay);
  const text = overlayText(overlay).trim();

  return receipt.frame === overlay.from
    && receipt.durationFrames === overlay.durationInFrames
    && target.overlayId === overlay.id
    && target.row === overlay.row
    && target.x === overlay.left
    && target.y === overlay.top
    && target.width === overlay.width
    && target.height === overlay.height
    && payload.overlayType === String(overlay.type)
    && payload.assetId === overlay.assetId
    && optionalAtomMatches(receipt, "text-content", "content.text", text ? text.slice(0, 240) : undefined)
    && optionalAtomMatches(receipt, "opacity", "overlay.opacity", styleLike.opacity)
    && optionalAtomMatches(receipt, "volume", "audio.volume", styleLike.volume)
    && optionalAtomMatches(receipt, "font-family", "text.font_family", styleLike.fontFamily)
    && optionalAtomMatches(receipt, "font-size", "text.font_size", styleLike.fontSize)
    && optionalAtomMatches(receipt, "font-weight", "text.font_weight", styleLike.fontWeight)
    && optionalAtomMatches(receipt, "text-color", "text.color", styleLike.color)
    && optionalAtomMatches(receipt, "background-color", "style.background_color", styleLike.backgroundColor)
    && optionalAtomMatches(receipt, "border-radius", "style.border_radius", styleLike.borderRadius);
}

export function withAtomicOverlayReceipt<T extends Overlay>(
  overlay: T,
  options: AtomicOverlayReceiptOptions = {},
): T {
  const metadata = overlayMetadata(overlay);
  const existingReceipts = Array.isArray(metadata?.atomicOverlayReceipts)
    ? metadata.atomicOverlayReceipts
    : [];
  const existingForms = Array.isArray(metadata?.atomicOverlayForms)
    ? metadata.atomicOverlayForms
    : [];
  const family = overlayFamily(String(overlay.type));
  const momentBundle = options.momentBundle ?? atomicMomentBundleFromMetadata(metadata);
  const signalOverrides = overlaySignalOverrides(metadata, options, momentBundle);
  const brandInputs = compactRecord({
    ...(recordFromUnknown(metadata?.atomicOverlayBrand) ?? {}),
    ...(recordFromUnknown(metadata?.brandInputs) ?? {}),
    ...(recordFromUnknown(options.brand) ?? {}),
  }) as Partial<BrandInputs>;
  const hasThemeInputs = !!signalOverrides || Object.keys(brandInputs).length > 0;
  const signals = overlaySignals(overlay, signalOverrides);
  const receipt = buildOverlayAtomicReceipt({
    family,
    intent: options.intent ?? `overlay-${family}`,
    frame: overlay.from,
    durationFrames: overlay.durationInFrames,
    source: options.source ?? "overlay-system",
    reason: options.reason ?? "overlay created, transformed, or persisted",
    signals,
    target: {
      overlayId: overlay.id,
      row: overlay.row,
      x: overlay.left,
      y: overlay.top,
      width: overlay.width,
      height: overlay.height,
    },
    payload: {
      overlayType: String(overlay.type),
      assetId: overlay.assetId,
    },
    atoms: overlayAtoms(overlay, family, hasThemeInputs ? signals : undefined, brandInputs),
  });
  const nextReceipts = options.appendReceipt === false && existingReceipts.length > 0
    ? existingReceipts
    : [...existingReceipts, receipt];
  const nextForms = options.appendReceipt === false && existingForms.length > 0
    ? existingForms
    : [...existingForms, receipt.form];

  return {
    ...overlay,
    metadata: {
      ...(metadata ?? {}),
      ...(momentBundle ? { atomicMomentBundle: momentBundle } : {}),
      atomicOverlayReceipt: receipt,
      atomicOverlayReceipts: nextReceipts.length > 0 ? nextReceipts : [receipt],
      atomicOverlayForm: receipt.form,
      atomicOverlayForms: nextForms.length > 0 ? nextForms : [receipt.form],
      atomicPlanObserveMode: true,
    },
  } as T;
}

export function withAtomicOverlayUpdateReceipt<T extends Overlay>(
  overlay: T,
  updates: Partial<Overlay>,
  options: AtomicOverlayReceiptOptions = {},
): T {
  return withAtomicOverlayReceipt(mergeOverlayUpdates(overlay, updates) as T, options);
}

function overlayFamily(type: string): AtomicOverlayFamily {
  switch (type) {
    case "video":
      return "video";
    case "image":
      return "image";
    case "html-scene":
      return "html-scene";
    case "html-sticker":
      return "html-sticker";
    case "text":
      return "text";
    case "sound":
      return "sound";
    case "caption":
      return "caption";
    case "shape":
      return "shape";
    case "transition":
      return "transition";
    case "motion-graphic":
      return "motion-graphic";
    case "sticker":
    case "lottie":
    default:
      return "sticker";
  }
}

function overlaySignals(overlay: Overlay, overrides?: Record<string, unknown>): Record<string, unknown> {
  const text = overlayText(overlay);
  const hasText = text.trim().length > 0;
  const isVisual = String(overlay.type) !== "sound";
  return {
    text_on_screen: hasText ? 1 : 0,
    text_coverage: hasText ? Math.min(text.length / 900, 0.72) : 0,
    visual_complexity: isVisual ? 0.35 : 0,
    speech_energy: overlay.type === "sound" || overlay.type === "caption" ? 0.5 : 0,
    word_importance: hasText ? Math.min(text.split(/\s+/).filter(Boolean).length / 42, 1) : 0,
    screen_region: overlayRegion(overlay),
    safe_zone: overlayRegion(overlay),
    ...(overrides ?? {}),
  };
}

function overlayAtoms(
  overlay: Overlay,
  family: AtomicOverlayFamily,
  signals?: Record<string, unknown>,
  brandInputs: Partial<BrandInputs> = {},
): AtomicOverlayAtom[] {
  const atoms: AtomicOverlayAtom[] = [
    overlayAtom("content-channel", "overlay.family", family, 1, "edl"),
    overlayAtom("overlay-row", "overlay.row", overlay.row, 1, "layout-analysis"),
    overlayAtom("position-x", "overlay.x", overlay.left, 1, "layout-analysis"),
    overlayAtom("position-y", "overlay.y", overlay.top, 1, "layout-analysis"),
    overlayAtom("size-width", "overlay.width", overlay.width, 1, "layout-analysis"),
    overlayAtom("size-height", "overlay.height", overlay.height, 1, "layout-analysis"),
  ];
  const styleLike = overlayStyles(overlay);
  const text = overlayText(overlay);
  const displayConfig = String(overlay.type) === "caption" && "displayConfig" in overlay && isRecord(overlay.displayConfig)
    ? overlay.displayConfig as unknown as CaptionDisplayConfig
    : undefined;
  const themeTokens = text.trim() && signals ? resolveMotionTokens(contentSignalsFromSignals(signals), brandInputs) : undefined;
  const resolvedCaptionDisplay = String(overlay.type) === "caption"
    ? resolveCaptionDisplay(text, displayConfig, signals, themeTokens)
    : undefined;

  pushNumberAtom(atoms, "opacity", "overlay.opacity", styleLike.opacity, "decision-param");
  pushNumberAtom(atoms, "volume", "audio.volume", styleLike.volume, "decision-param");
  pushStringAtom(atoms, "font-family", "text.font_family", styleLike.fontFamily, "decision-param");
  pushStringAtom(atoms, "font-size", "text.font_size", styleLike.fontSize, "decision-param");
  pushStringAtom(atoms, "font-weight", "text.font_weight", styleLike.fontWeight, "decision-param");
  pushStringAtom(atoms, "text-color", "text.color", styleLike.color, "decision-param");
  pushStringAtom(atoms, "background-color", "style.background_color", styleLike.backgroundColor, "decision-param");
  pushStringAtom(atoms, "border-radius", "style.border_radius", styleLike.borderRadius, "decision-param");
  pushStringAtom(atoms, "text-align", "text.align", styleLike.textAlign, "decision-param");
  pushStringAtom(atoms, "line-height", "text.line_height", styleLike.lineHeight, "decision-param");
  pushStringAtom(atoms, "letter-spacing", "text.letter_spacing", styleLike.letterSpacing, "decision-param");

  if (overlay.assetId) atoms.push(overlayAtom("asset-id", "media.asset_id", overlay.assetId, 1, "edl"));
  if ("src" in overlay && overlay.src) atoms.push(overlayAtom("media-source", "media.src", overlay.src, 1, "edl"));
  if ("startFromSound" in overlay && overlay.startFromSound !== undefined) {
    atoms.push(overlayAtom("media-start-frame", "media.start_frame", overlay.startFromSound, 1, "decision-param"));
  }
  if ("audioStartFrame" in overlay && overlay.audioStartFrame !== undefined) {
    atoms.push(overlayAtom("media-start-frame", "media.audio_start_frame", overlay.audioStartFrame, 1, "decision-param"));
  }
  if ("audioEndFrame" in overlay && overlay.audioEndFrame !== undefined) {
    atoms.push(overlayAtom("end-frame", "media.audio_end_frame", overlay.audioEndFrame, 1, "decision-param"));
  }
  if ("videoStartTime" in overlay && overlay.videoStartTime !== undefined) {
    atoms.push(overlayAtom("media-start-frame", "media.start_frame", overlay.videoStartTime, 1, "decision-param"));
  }
  if ("speed" in overlay && typeof overlay.speed === "number") {
    atoms.push(overlayAtom("playback-speed", "video.speed", overlay.speed, Math.min(Math.abs(overlay.speed - 1), 1), "decision-param"));
  }
  if ("category" in overlay && overlay.category) {
    atoms.push(overlayAtom("sticker-category", "sticker.category", overlay.category, 1, "decision-param"));
  }
  if (String(overlay.type) === "shape" && "content" in overlay && typeof overlay.content === "string") {
    atoms.push(overlayAtom("shape-kind", "shape.kind", overlay.content, 1, "decision-param"));
  }
  if (text.trim()) {
    atoms.push(
      overlayAtom("text-content", "content.text", text.slice(0, 240), 1, "transcript"),
      overlayAtom("text-casing", "text.casing", detectTextCasing(text), 1, "derived-signal"),
      overlayAtom("text-line-count", "text.line_count", lineCount(text), 1, "derived-signal"),
      overlayAtom("text-word-count", "text.word_count", wordCount(text), 1, "derived-signal"),
      ...textThemeAtoms(themeTokens),
      ...textCompositionAtoms(family, text, styleLike, displayConfig, resolvedCaptionDisplay, signals, themeTokens),
    );
  }
  if (String(overlay.type) === "caption" && "captions" in overlay) {
    atoms.push(...captionDisplayAtoms(displayConfig, "decision-param", 0.72));
    atoms.push(...captionDisplayAtoms(resolvedCaptionDisplay, "derived-signal", 1));
    atoms.push(...captionHighlightAtoms(styleLike));
    atoms.push(...captionWordAtoms(overlay.captions, resolvedCaptionDisplay ?? displayConfig));
  }

  return atoms;
}

function captionDisplayAtoms(
  displayConfig?: CaptionDisplayAtomInput,
  source: AtomicOverlayAtom["source"] = "decision-param",
  strength = 1,
): AtomicOverlayAtom[] {
  if (!displayConfig) return [];
  return [
    overlayAtom("caption-mode", "caption.mode", displayConfig.mode, strength, source),
    overlayAtom("caption-words-per-group", "caption.words_per_group", displayConfig.wordsPerGroup, strength, source),
    overlayAtom("caption-max-words-per-line", "caption.max_words_per_line", displayConfig.maxWordsPerLine, strength, source),
    overlayAtom("caption-show-previous", "caption.show_previous_words", displayConfig.showPreviousWords, strength, source),
    overlayAtom("caption-fade-previous", "caption.fade_previous_words", displayConfig.fadeOutPreviousWords, strength, source),
  ];
}

function captionHighlightAtoms(styleLike: Record<string, unknown>): AtomicOverlayAtom[] {
  const highlight = isRecord(styleLike.highlight)
    ? styleLike.highlight
    : isRecord(styleLike.highlightStyle)
      ? styleLike.highlightStyle
      : undefined;
  if (!highlight) return [];
  const atoms: AtomicOverlayAtom[] = [];
  pushStringAtom(atoms, "highlight-color", "caption.highlight.color", highlight.color, "decision-param");
  pushStringAtom(atoms, "highlight-background-color", "caption.highlight.background_color", highlight.backgroundColor, "decision-param");
  pushNumberAtom(atoms, "highlight-scale", "caption.highlight.scale", highlight.scale, "decision-param");
  pushStringAtom(atoms, "highlight-effect", "caption.highlight.effect", highlight.effect, "decision-param");
  pushStringAtom(atoms, "highlight-animation", "caption.highlight.animation", highlight.animation, "decision-param");
  return atoms;
}

function resolveCaptionDisplay(
  text: string,
  displayConfig?: CaptionDisplayConfig,
  signals?: Record<string, unknown>,
  themeTokens?: MotionTokens,
): CaptionDisplayAtomInput | undefined {
  const words = wordCount(text);
  if (words === 0) return undefined;

  const baseMode = displayConfig?.mode ?? "phrase";
  const behaviorMode = baseMode === "instagram" || baseMode === "hormozi" ? "phrase" : baseMode;
  const energy = captionRhythmEnergy(signals);
  const pressure = captionScreenPressure(signals);
  const richTheme = themeTokens?.layout.density === "rich";
  const protectFrame = pressure >= 0.62;
  const punchyMoment = energy >= 0.72 || richTheme;
  const mode = behaviorMode === "subtitle" || behaviorMode === "karaoke" || behaviorMode === "word-by-word"
    ? behaviorMode
    : words <= 2 && energy >= 0.82 && pressure < 0.55
      ? "word-by-word"
      : "phrase";
  const maxWordsPerLine = resolvedCaptionMaxWordsPerLine({
    mode,
    words,
    displayConfig,
    protectFrame,
    punchyMoment,
  });
  const wordsPerGroup = resolvedCaptionWordsPerGroup({
    mode,
    words,
    maxWordsPerLine,
    displayConfig,
    protectFrame,
    punchyMoment,
  });

  return {
    mode,
    wordsPerGroup,
    maxWordsPerLine,
    showPreviousWords: resolvedCaptionShowPrevious(mode, displayConfig, protectFrame, energy),
    fadeOutPreviousWords: resolvedCaptionFadePrevious(mode, displayConfig, protectFrame, energy),
  };
}

function textCompositionAtoms(
  family: AtomicOverlayFamily,
  text: string,
  styleLike: Record<string, unknown>,
  displayConfig?: CaptionDisplayConfig,
  resolvedDisplayConfig?: CaptionDisplayAtomInput,
  signals?: Record<string, unknown>,
  themeTokens?: MotionTokens,
): AtomicOverlayAtom[] {
  const lines = lineCount(text);
  const words = wordCount(text);
  const display = resolvedDisplayConfig ?? displayConfig;
  const rowCapacity = resolvedRowCapacity(family, words, lines, display, signals, themeTokens);
  const targetRowCount = display
    ? Math.max(1, Math.ceil((display.wordsPerGroup || words || 1) / Math.max(1, rowCapacity)))
    : Math.max(1, lines);

  return [
    overlayAtom("text-flow-direction", "text.flow_direction", "left-to-right", 1, "layout-analysis"),
    overlayAtom("text-wrap-unit", "text.wrap_unit", textWrapUnit(family, display?.mode, lines), 1, "layout-analysis"),
    overlayAtom("text-row-strategy", "text.row_strategy", textRowStrategy(family, display?.mode, lines, signals, themeTokens), 1, "layout-analysis"),
    overlayAtom("text-row-capacity", "text.row_capacity", rowCapacity, 1, "layout-analysis"),
    overlayAtom("text-target-row-count", "text.target_row_count", targetRowCount, 1, "layout-analysis"),
    overlayAtom("text-contrast-mode", "text.contrast_mode", textContrastMode(styleLike.color, styleLike.backgroundColor), 1, "derived-signal"),
  ];
}

function textThemeAtoms(themeTokens?: MotionTokens): AtomicOverlayAtom[] {
  if (!themeTokens) return [];
  return [
    overlayAtom("theme-primary-color", "theme.color.primary", themeTokens.color.primary, 1, "brand"),
    overlayAtom("theme-accent-color", "theme.color.accent", themeTokens.color.accent, 1, "brand"),
    overlayAtom("theme-text-color", "theme.color.text_primary", themeTokens.color.textPrimary, 1, "brand"),
    overlayAtom("theme-muted-color", "theme.color.text_secondary", themeTokens.color.textSecondary, 1, "brand"),
    overlayAtom("theme-surface-color", "theme.color.surface_base", themeTokens.color.surfaceBase, 1, "brand"),
    overlayAtom("theme-heading-font", "theme.font.heading", themeTokens.typography.headingFamily, 1, "brand"),
    overlayAtom("theme-body-font", "theme.font.body", themeTokens.typography.bodyFamily, 1, "brand"),
    overlayAtom("theme-mono-font", "theme.font.mono", themeTokens.typography.monoFamily, 1, "brand"),
  ];
}

function captionWordAtoms(captions: Caption[], displayConfig?: CaptionDisplayAtomInput): AtomicOverlayAtom[] {
  const atoms: AtomicOverlayAtom[] = [];
  let index = 0;
  for (const caption of captions) {
    for (const word of caption.words) {
      if (index >= 40) return atoms;
      const role = word.emphasis?.type ?? classifyWordRole(word.word);
      const lineIndex = displayConfig?.maxWordsPerLine
        ? Math.floor(index / Math.max(1, displayConfig.maxWordsPerLine))
        : 0;
      atoms.push(
        overlayAtom("caption-word", `caption.word.${index}`, word.word, word.emphasis ? 1 : 0.55, "transcript"),
        overlayAtom("glyph-role", `caption.word.${index}.role`, role, word.emphasis ? 1 : 0.65, "transcript"),
        overlayAtom("glyph-start-ms", `caption.word.${index}.start_ms`, word.startMs, 1, "transcript"),
        overlayAtom("glyph-end-ms", `caption.word.${index}.end_ms`, word.endMs, 1, "transcript"),
        overlayAtom("glyph-confidence", `caption.word.${index}.confidence`, word.confidence, word.confidence, "transcript"),
        overlayAtom("glyph-line-index", `caption.word.${index}.line_index`, lineIndex, 1, "layout-analysis"),
        overlayAtom("glyph-display-scale", `caption.word.${index}.display_scale`, glyphDisplayScale(role), word.emphasis ? 1 : 0.7, "layout-analysis"),
        overlayAtom("glyph-font-role", `caption.word.${index}.font_role`, glyphFontRole(role), word.emphasis ? 1 : 0.7, "layout-analysis"),
        overlayAtom("glyph-color-role", `caption.word.${index}.color_role`, glyphColorRole(role), word.emphasis ? 1 : 0.7, "layout-analysis"),
        overlayAtom("glyph-highlight-mode", `caption.word.${index}.highlight_mode`, glyphHighlightMode(role), word.emphasis ? 1 : 0.7, "layout-analysis"),
      );
      if (word.emphasis) {
        atoms.push(
          overlayAtom("emphasis-role", `caption.word.${index}.emphasis_type`, word.emphasis.type, 1, "transcript"),
          overlayAtom("emphasis-role", `caption.word.${index}.emphasis_source`, word.emphasis.source, 1, "transcript"),
        );
      }
      index += 1;
    }
  }
  return atoms;
}

function estimateTextRowCapacity(words: number, lines: number): number {
  if (lines > 1) return Math.max(1, Math.ceil(words / lines));
  return Math.max(1, Math.min(8, Math.ceil(words / 2)));
}

function resolvedRowCapacity(
  family: AtomicOverlayFamily,
  words: number,
  lines: number,
  displayConfig?: CaptionDisplayAtomInput,
  signals?: Record<string, unknown>,
  themeTokens?: MotionTokens,
): number {
  const base = displayConfig?.maxWordsPerLine ?? estimateTextRowCapacity(words, lines);
  if (family !== "caption" || displayConfig?.mode === "subtitle" || displayConfig?.mode === "karaoke") {
    return base;
  }
  const energy = Math.max(
    numericSignal(signals, "speech_energy", "audio.speech_energy"),
    numericSignal(signals, "emotional_arousal", "emotion_arousal", "emotion.arousal"),
    numericSignal(signals, "pacing_velocity", "rhythm_density", "rhythm.density"),
  );
  const visualDependency = numericSignal(signals, "visual_dependency", "text_coverage", "visual.text_coverage");
  const richTheme = themeTokens?.layout.density === "rich";
  if (richTheme || energy >= 0.72 || visualDependency >= 0.62) {
    return Math.max(1, Math.min(base || 3, 3));
  }
  return base;
}

function resolvedCaptionMaxWordsPerLine(input: {
  mode: CaptionDisplayAtomInput["mode"];
  words: number;
  displayConfig?: CaptionDisplayConfig;
  protectFrame: boolean;
  punchyMoment: boolean;
}): number {
  if (input.mode === "word-by-word") return 1;
  if (input.mode === "subtitle") return Math.max(6, Math.min(input.displayConfig?.maxWordsPerLine ?? 10, 12));
  if (input.mode === "karaoke") return Math.max(4, Math.min(input.displayConfig?.maxWordsPerLine ?? 6, 8));

  const legacy = input.displayConfig?.maxWordsPerLine ?? estimateTextRowCapacity(input.words, 1);
  if (input.protectFrame) return Math.max(1, Math.min(legacy, 2));
  if (input.punchyMoment) return Math.max(1, Math.min(legacy, 3));
  return Math.max(1, Math.min(legacy, 4));
}

function resolvedCaptionWordsPerGroup(input: {
  mode: CaptionDisplayAtomInput["mode"];
  words: number;
  maxWordsPerLine: number;
  displayConfig?: CaptionDisplayConfig;
  protectFrame: boolean;
  punchyMoment: boolean;
}): number {
  if (input.mode === "word-by-word") return 1;
  if (input.mode === "subtitle") return Math.max(input.maxWordsPerLine, Math.min(input.displayConfig?.wordsPerGroup ?? 10, 12, input.words));
  if (input.mode === "karaoke") return Math.max(input.maxWordsPerLine, Math.min(input.displayConfig?.wordsPerGroup ?? 6, 8, input.words));

  const legacy = input.displayConfig?.wordsPerGroup ?? Math.min(input.words, 4);
  if (input.protectFrame) return Math.max(1, Math.min(legacy, 3, input.words));
  if (input.punchyMoment) return Math.max(1, Math.min(Math.max(legacy, input.maxWordsPerLine), 6, input.words));
  return Math.max(1, Math.min(legacy, 4, input.words));
}

function resolvedCaptionShowPrevious(
  mode: CaptionDisplayAtomInput["mode"],
  displayConfig: CaptionDisplayConfig | undefined,
  protectFrame: boolean,
  energy: number,
): boolean {
  if (mode === "word-by-word" || mode === "phrase") return false;
  if (protectFrame) return false;
  return displayConfig?.showPreviousWords ?? energy < 0.55;
}

function resolvedCaptionFadePrevious(
  mode: CaptionDisplayAtomInput["mode"],
  displayConfig: CaptionDisplayConfig | undefined,
  protectFrame: boolean,
  energy: number,
): boolean {
  if (mode === "word-by-word" || mode === "phrase") return protectFrame;
  if (protectFrame) return true;
  return displayConfig?.fadeOutPreviousWords ?? energy >= 0.55;
}

function textWrapUnit(
  family: AtomicOverlayFamily,
  mode: CaptionDisplayAtomInput["mode"] | undefined,
  lines: number,
): string {
  if (family !== "caption") return lines > 1 ? "line" : "block";
  if (mode === "subtitle") return "line";
  return "word";
}

function textRowStrategy(
  family: AtomicOverlayFamily,
  mode: CaptionDisplayAtomInput["mode"] | undefined,
  lines: number,
  signals?: Record<string, unknown>,
  themeTokens?: MotionTokens,
): string {
  if (family !== "caption") return lines > 1 ? "manual-lines" : "balanced-block";
  if (mode === "word-by-word") return "single-word";
  if (mode === "subtitle") return "subtitle-band";
  if (mode === "karaoke") return "progressive-line";
  const energy = Math.max(
    numericSignal(signals, "speech_energy", "audio.speech_energy"),
    numericSignal(signals, "emotional_arousal", "emotion_arousal", "emotion.arousal"),
    numericSignal(signals, "pacing_velocity", "rhythm_density", "rhythm.density"),
  );
  if (themeTokens?.layout.density === "rich" || energy >= 0.55) return "timed-fill";
  return "timed-fill";
}

function textContrastMode(textColor: unknown, backgroundColor: unknown): string {
  const textLuma = colorLuma(textColor);
  const surfaceLuma = colorLuma(backgroundColor);
  if (textLuma === undefined && surfaceLuma === undefined) return "unknown";
  return (textLuma ?? 1) >= (surfaceLuma ?? 0.15) ? "light-on-dark" : "dark-on-light";
}

function glyphDisplayScale(role: string): number {
  if (role === "statistic" || role === "number") return 1.32;
  if (role === "keyword" || role === "entity") return 1.22;
  if (role === "cta") return 1.16;
  return 1;
}

function glyphFontRole(role: string): string {
  if (role === "statistic" || role === "number") return "mono";
  if (role === "keyword" || role === "entity" || role === "cta") return "accent";
  if (role === "filler") return "secondary";
  return "primary";
}

function glyphColorRole(role: string): string {
  if (role === "keyword" || role === "entity" || role === "statistic" || role === "number" || role === "cta") return "accent";
  if (role === "filler") return "muted";
  return "primary";
}

function glyphHighlightMode(role: string): string {
  if (role === "keyword" || role === "entity" || role === "statistic" || role === "number") return "fill";
  if (role === "cta") return "underline";
  return "none";
}

function colorLuma(color: unknown): number | undefined {
  const rgb = colorToRgb(color);
  if (!rgb) return undefined;
  return 0.2126 * (rgb.r / 255) + 0.7152 * (rgb.g / 255) + 0.0722 * (rgb.b / 255);
}

function colorToRgb(color: unknown): { r: number; g: number; b: number } | undefined {
  if (typeof color !== "string") return undefined;
  const normalized = color.trim().toLowerCase();
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const body = hex[1].length === 3
      ? hex[1].split("").map((char) => char + char).join("")
      : hex[1];
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
    };
  }
  const rgb = normalized.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!rgb) return undefined;
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
  };
}

function overlayText(overlay: Overlay): string {
  if ("captions" in overlay) return overlay.captions.map((caption) => caption.text).join(" ");
  if ("content" in overlay && typeof overlay.content === "string") return overlay.content;
  if ("content" in overlay && isRecord(overlay.content)) {
    return Object.values(overlay.content).filter((value) => typeof value === "string").join(" ");
  }
  return "";
}

function overlayRegion(overlay: Overlay): string {
  const centerX = overlay.left + overlay.width / 2;
  const centerY = overlay.top + overlay.height / 2;
  const horizontal = centerX < 640 ? "left" : centerX > 1280 ? "right" : "center";
  const vertical = centerY < 360 ? "top" : centerY > 720 ? "bottom" : "middle";
  return `${vertical}-${horizontal}`;
}

function overlayMetadata(overlay: Overlay): OverlayMetadata | undefined {
  const maybeMetadata = (overlay as Overlay & { metadata?: unknown }).metadata;
  return isRecord(maybeMetadata) ? maybeMetadata as OverlayMetadata : undefined;
}

function overlayStyles(overlay: Overlay): Record<string, unknown> {
  const maybeStyles = (overlay as Overlay & { styles?: unknown }).styles;
  return isRecord(maybeStyles) ? maybeStyles : {};
}

function mergeOverlayUpdates(overlay: Overlay, updates: Partial<Overlay>): Overlay {
  const updateRecord = updates as Record<string, unknown>;
  const { styles, metadata, ...restUpdates } = updateRecord;
  const merged = {
    ...overlay,
    ...restUpdates,
  } as Overlay & { styles?: unknown; metadata?: unknown };

  if (isRecord(styles)) {
    merged.styles = {
      ...overlayStyles(overlay),
      ...styles,
    };
  }
  if (isRecord(metadata)) {
    merged.metadata = {
      ...(overlayMetadata(overlay) ?? {}),
      ...metadata,
    };
  }

  return merged as Overlay;
}

function pushNumberAtom(
  atoms: AtomicOverlayAtom[],
  kind: AtomicOverlayAtom["kind"],
  key: string,
  value: unknown,
  source: AtomicOverlayAtom["source"],
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  atoms.push(overlayAtom(kind, key, value, value, source));
}

function pushStringAtom(
  atoms: AtomicOverlayAtom[],
  kind: AtomicOverlayAtom["kind"],
  key: string,
  value: unknown,
  source: AtomicOverlayAtom["source"],
): void {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") return;
  atoms.push(overlayAtom(kind, key, String(value), 1, source));
}

function detectTextCasing(text: string): string {
  const letters = text.match(/[A-Za-z]+/g) ?? [];
  if (letters.length === 0) return /\d/.test(text) ? "numeric" : "empty";
  const upperCount = letters.filter((word) => word === word.toUpperCase()).length;
  const lowerCount = letters.filter((word) => word === word.toLowerCase()).length;
  const titleCount = letters.filter((word) => /^[A-Z][a-z]+$/.test(word)).length;
  if (upperCount === letters.length) return "upper";
  if (lowerCount === letters.length) return "lower";
  if (titleCount >= Math.max(1, letters.length - 1)) return "title";
  return "mixed";
}

function lineCount(text: string): number {
  return Math.max(1, text.split(/\r?\n/).length);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function captionRhythmEnergy(signals: Record<string, unknown> | undefined): number {
  return clamp01(Math.max(
    numericSignal(signals, "speech_energy", "audio.speech_energy"),
    numericSignal(signals, "emotional_arousal", "emotion_arousal", "emotion.arousal"),
    numericSignal(signals, "pacing_velocity", "rhythm_density", "rhythm.density"),
    numericSignal(signals, "beat_strength", "audio.beat_strength", "beat.strength"),
    numericSignal(signals, "word_importance", "text.word_importance"),
  ));
}

function captionScreenPressure(signals: Record<string, unknown> | undefined): number {
  const textBoxPressure = Math.min(numericSignal(signals, "text_box_count", "visual_text_box_count", "visual.text_box_count", "textBoxCount", "visualTextBoxCount") / 3, 1);
  const objectPressure = Math.min(numericSignal(signals, "object_count", "subject_count", "visual.object_count", "objectCount", "subjectCount") / 8, 1);
  const facePressure = Math.max(
    signalBoolean(signals, "face_present", "visual.face_present", "facePresent") ? 0.42 : 0,
    Math.min(numericSignal(signals, "face_count", "visual_face_count", "visual.face_count", "faceCount", "visualFaceCount") / 3, 1) * 0.5,
    signalBoolean(signals, "eye_contact", "visual_eye_contact", "visual.eye_contact", "eyeContact") ? 0.22 : 0,
  );
  const negativeSpaceRelief = Math.max(
    numericSignal(signals, "negative_space_top", "visual.negative_space.top", "negativeSpaceTop"),
    numericSignal(signals, "negative_space_right", "visual.negative_space.right", "negativeSpaceRight"),
    numericSignal(signals, "negative_space_bottom", "visual.negative_space.bottom", "negativeSpaceBottom"),
    numericSignal(signals, "negative_space_left", "visual.negative_space.left", "negativeSpaceLeft"),
  ) * 0.22;

  return clamp01(Math.max(
    numericSignal(signals, "visual.text_coverage", "visual_text_coverage", "textCoverage", "visualTextCoverage"),
    numericSignal(signals, "visual.text_on_screen", "textOnScreen", "visualTextOnScreen"),
    numericSignal(signals, "visual_complexity", "visual.complexity", "visualComplexity"),
    numericSignal(signals, "edge_density", "visual_edge_density", "visual.edge_density", "edgeDensity"),
    textBoxPressure,
    objectPressure,
    facePressure,
  ) - negativeSpaceRelief);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function contentSignalsFromSignals(signals: Record<string, unknown>): Partial<ContentSignals> {
  return compactRecord({
    formality: signalNumber(signals, "formality", "brand.formality"),
    enthusiasm: signalNumber(signals, "enthusiasm", "emotion.enthusiasm"),
    warmth: signalNumber(signals, "warmth", "emotion.warmth"),
    emotional_arousal: signalNumber(signals, "emotional_arousal", "emotion_arousal", "emotion.arousal"),
    pacing_velocity: signalNumber(signals, "pacing_velocity", "rhythm_density", "rhythm.density"),
    humor: signalNumber(signals, "humor"),
    visceral_impact: signalNumber(signals, "visceral_impact", "impact.visceral"),
    visual_dependency: signalNumber(signals, "visual_dependency", "text_coverage", "visual.text_coverage"),
    emotion_intensity: signalNumber(signals, "emotion_intensity", "speech.emotion_intensity"),
    pitch_variability: signalNumber(signals, "pitch_variability", "speech.pitch_variability"),
    speaking_rate_wpm: signalNumber(signals, "speaking_rate_wpm", "speech.speaking_rate_wpm"),
    silence_duration_ms: signalNumber(signals, "silence_duration_ms", "speech.silence_duration_ms"),
    face_present: signalBoolean(signals, "face_present", "visual.face_present"),
    music_energy: signalNumber(signals, "music_energy", "audio.music_energy"),
    music_section: signalString(signals, "music_section", "audio.music_section"),
    position_in_video: signalNumber(signals, "position_in_video", "structural.position_in_video"),
    narrative_pressure: signalNumber(signals, "narrative_pressure", "composite.narrative_pressure"),
    motion_intensity: signalNumber(signals, "motion_intensity", "visual.motion_intensity"),
    shot_scale: signalNumber(signals, "shot_scale", "visual.shot_scale"),
    face_emotion: signalString(signals, "face_emotion", "visual.face_emotion"),
    speech_energy: signalNumber(signals, "speech_energy", "audio.speech_energy"),
    stress_detected: signalBoolean(signals, "stress_detected", "speech.stress_detected"),
    time_since_last_cut: signalNumber(signals, "time_since_last_cut", "structural.time_since_last_cut"),
    cinematic_moment: signalNumber(signals, "cinematic_moment", "composite.cinematic_moment"),
  }) as Partial<ContentSignals>;
}

function numericSignal(signals: Record<string, unknown> | undefined, ...keys: string[]): number {
  return signals ? signalNumber(signals, ...keys) ?? 0 : 0;
}

function signalNumber(signals: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = signals[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function signalBoolean(signals: Record<string, unknown> | undefined, ...keys: string[]): boolean | undefined {
  if (!signals) return undefined;
  for (const key of keys) {
    const value = signals[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value > 0;
  }
  return undefined;
}

function signalString(signals: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = signals[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function classifyWordRole(word: string): "word" | "statistic" | "cta" | "filler" | "keyword" {
  if (/\d/.test(word)) return "statistic";
  const normalized = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (CTA_WORDS.has(normalized)) return "cta";
  if (FILLER_WORDS.has(normalized)) return "filler";
  if (word.length > 2 && word === word.toUpperCase() && /[A-Z]/.test(word)) return "keyword";
  return "word";
}

const CTA_WORDS = new Set([
  "buy",
  "click",
  "join",
  "subscribe",
  "follow",
  "start",
  "try",
  "download",
  "watch",
  "share",
  "learn",
]);

const FILLER_WORDS = new Set([
  "um",
  "uh",
  "like",
  "basically",
  "actually",
  "literally",
  "just",
  "really",
]);

function optionalAtomMatches(
  receipt: AtomicOverlayReceipt,
  kind: AtomicOverlayAtom["kind"],
  key: string,
  expected: unknown,
): boolean {
  if ((expected === undefined || expected === null || String(expected).trim() === "")) {
    return true;
  }
  const atom = receipt.atoms.find((candidate) => candidate.kind === kind && candidate.key === key);
  return atom?.value === expected || String(atom?.value) === String(expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function atomicMomentBundleFromMetadata(metadata: OverlayMetadata | undefined): AtomicMomentBundle | undefined {
  const candidate = metadata?.atomicMomentBundle;
  if (!isRecord(candidate) || candidate.version !== "moment-bundle-v1") return undefined;
  if (!Array.isArray(candidate.primitiveAtoms) || !Array.isArray(candidate.derivedAtoms)) return undefined;
  return candidate as unknown as AtomicMomentBundle;
}

function overlaySignalOverrides(
  metadata: OverlayMetadata | undefined,
  options: AtomicOverlayReceiptOptions,
  momentBundle?: AtomicMomentBundle,
): Record<string, unknown> | undefined {
  const merged = compactRecord({
    ...(momentBundle ? momentBundleToSignalMap(momentBundle) : {}),
    ...(recordFromUnknown(metadata?.rawSignals) ?? {}),
    ...(recordFromUnknown(metadata?.signals) ?? {}),
    ...(recordFromUnknown(metadata?.atomicOverlaySignals) ?? {}),
    ...(recordFromUnknown(options.signals) ?? {}),
  });
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}
