/**
 * Shorthand Command Parser for Editron Timeline
 *
 * Parses short text commands typed into the contextual action bar
 * and returns structured command objects that can be executed
 * against the selected overlay. All parsing is local regex-based
 * with zero LLM calls for recognized commands.
 */

import { Overlay, OverlayType } from "../types";

// ---------------------------------------------------------------------------
// Command result types
// ---------------------------------------------------------------------------

export type CommandResultStatus = "success" | "error" | "ai-fallback";

export interface CommandResult {
  status: CommandResultStatus;
  /** Human-readable message shown as toast */
  message: string;
  /** Updated overlay (if the command mutated it) */
  updatedOverlay?: Overlay;
  /** Action to dispatch externally (delete, duplicate, split, etc.) */
  action?:
    | "delete"
    | "duplicate"
    | "split"
    | "open-caption"
    | "ai-fallback";
  /** For ai-fallback, the contextual prompt to send to AI chat */
  aiPrompt?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a number between min and max */
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** Parse a seconds string like "2s", "2.5s", "2" into a frame count at given fps */
const parseSeconds = (raw: string, fps: number): number | null => {
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*s?$/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * fps);
};

/** Parse a speed multiplier like "2x", "0.5x" */
const parseSpeedMultiplier = (raw: string): number | null => {
  const m = raw.match(/^(\d+(?:\.\d+)?)x?$/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return v > 0 ? v : null;
};

// ---------------------------------------------------------------------------
// Named CSS colours accepted by the `color` command (subset)
// ---------------------------------------------------------------------------
const CSS_COLORS = new Set([
  "red", "blue", "green", "yellow", "orange", "purple", "pink", "white",
  "black", "gray", "grey", "cyan", "magenta", "lime", "teal", "navy",
  "maroon", "olive", "aqua", "fuchsia", "silver", "gold", "coral",
  "salmon", "tomato", "turquoise", "violet", "indigo", "crimson",
]);

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * Parse and execute a shorthand command against the given overlay.
 *
 * @param input  Raw user input string
 * @param overlay  The currently selected overlay
 * @param fps  Project frames-per-second (default 30)
 * @returns A CommandResult describing what happened
 */
export function parseAndExecuteCommand(
  input: string,
  overlay: Overlay,
  fps = 30,
): CommandResult {
  const cmd = input.trim().toLowerCase();

  if (!cmd) {
    return { status: "error", message: "Empty command" };
  }

  // ------ Volume commands ------

  if (cmd === "louder") {
    return adjustVolume(overlay, 0.2);
  }
  if (cmd === "quieter") {
    return adjustVolume(overlay, -0.2);
  }
  if (cmd === "mute") {
    return setVolume(overlay, 0);
  }
  if (cmd === "unmute") {
    return setVolume(overlay, 1);
  }

  // ------ Fade commands ------

  if (/^fade\s*in$/.test(cmd)) {
    return applyFade(overlay, "in");
  }
  if (/^fade\s*out$/.test(cmd)) {
    return applyFade(overlay, "out");
  }

  // ------ Speed commands ------

  const speedMatch = cmd.match(/^speed\s+(.+)$/);
  if (speedMatch) {
    const multiplier = parseSpeedMultiplier(speedMatch[1].trim());
    if (multiplier !== null) {
      return setSpeed(overlay, multiplier);
    }
    return { status: "error", message: `Invalid speed value: ${speedMatch[1]}` };
  }
  if (cmd === "slow") {
    return setSpeed(overlay, 0.5);
  }
  if (cmd === "fast") {
    return setSpeed(overlay, 2);
  }

  // ------ Trim commands ------

  const trimStartMatch = cmd.match(/^trim\s+start\s+(.+)$/);
  if (trimStartMatch) {
    const frames = parseSeconds(trimStartMatch[1].trim(), fps);
    if (frames !== null && frames > 0) {
      return trimStart(overlay, frames);
    }
    return { status: "error", message: `Invalid trim duration: ${trimStartMatch[1]}` };
  }

  const trimEndMatch = cmd.match(/^trim\s+end\s+(.+)$/);
  if (trimEndMatch) {
    const frames = parseSeconds(trimEndMatch[1].trim(), fps);
    if (frames !== null && frames > 0) {
      return trimEnd(overlay, frames);
    }
    return { status: "error", message: `Invalid trim duration: ${trimEndMatch[1]}` };
  }

  // ------ Split ------

  if (/^split(\s+here)?$/.test(cmd)) {
    return { status: "success", message: "Split at playhead", action: "split" };
  }

  // ------ Delete / Remove ------

  if (cmd === "delete" || cmd === "remove") {
    return { status: "success", message: "Deleted overlay", action: "delete" };
  }

  // ------ Duplicate / Copy ------

  if (cmd === "duplicate" || cmd === "copy") {
    return { status: "success", message: "Duplicated overlay", action: "duplicate" };
  }

  // ------ Move to ------

  const moveMatch = cmd.match(/^move\s+to\s+(.+)$/);
  if (moveMatch) {
    const frames = parseSeconds(moveMatch[1].trim(), fps);
    if (frames !== null && frames >= 0) {
      return moveOverlay(overlay, frames);
    }
    return { status: "error", message: `Invalid position: ${moveMatch[1]}` };
  }

  // ------ Color (text overlays) ------

  const colorMatch = cmd.match(/^colou?r\s+(.+)$/);
  if (colorMatch) {
    const colorVal = colorMatch[1].trim();
    if (/^#[0-9a-f]{3,8}$/i.test(colorVal) || CSS_COLORS.has(colorVal)) {
      return setColor(overlay, colorVal);
    }
    return { status: "error", message: `Unrecognised colour: ${colorVal}` };
  }

  // ------ Font size (text overlays) ------

  const fontSizeMatch = cmd.match(/^font\s*size\s+(\d+)$/);
  if (fontSizeMatch) {
    const size = parseInt(fontSizeMatch[1], 10);
    if (size > 0 && size <= 999) {
      return setFontSize(overlay, size);
    }
    return { status: "error", message: `Invalid font size: ${fontSizeMatch[1]}` };
  }

  // ------ Caption ------

  if (/^(add\s+)?caption$/.test(cmd)) {
    return { status: "success", message: "Opening caption panel", action: "open-caption" };
  }

  // ------ Fallback to AI ------

  return buildAIFallback(input, overlay, fps);
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

function adjustVolume(overlay: Overlay, delta: number): CommandResult {
  if (
    overlay.type !== OverlayType.VIDEO &&
    overlay.type !== OverlayType.SOUND
  ) {
    return { status: "error", message: "Volume only applies to video/audio clips" };
  }
  const current = (overlay.styles as any)?.volume ?? 1;
  const next = clamp(Math.round((current + delta) * 100) / 100, 0, 2);
  const updated = {
    ...overlay,
    styles: { ...overlay.styles, volume: next },
  } as Overlay;
  return {
    status: "success",
    message: `Volume set to ${Math.round(next * 100)}%`,
    updatedOverlay: updated,
  };
}

function setVolume(overlay: Overlay, vol: number): CommandResult {
  if (
    overlay.type !== OverlayType.VIDEO &&
    overlay.type !== OverlayType.SOUND
  ) {
    return { status: "error", message: "Volume only applies to video/audio clips" };
  }
  const updated = {
    ...overlay,
    styles: { ...overlay.styles, volume: vol },
  } as Overlay;
  return {
    status: "success",
    message: vol === 0 ? "Muted" : `Volume set to ${Math.round(vol * 100)}%`,
    updatedOverlay: updated,
  };
}

function applyFade(overlay: Overlay, direction: "in" | "out"): CommandResult {
  const existing = (overlay.styles as any) ?? {};
  const fadeStyles =
    direction === "in"
      ? { fadeIn: true, fadeInDuration: 0.5 }
      : { fadeOut: true, fadeOutDuration: 0.5 };
  const updated = {
    ...overlay,
    styles: { ...existing, ...fadeStyles },
  } as Overlay;
  return {
    status: "success",
    message: `Applied fade ${direction}`,
    updatedOverlay: updated,
  };
}

function setSpeed(overlay: Overlay, multiplier: number): CommandResult {
  if (
    overlay.type !== OverlayType.VIDEO &&
    overlay.type !== OverlayType.SOUND
  ) {
    return { status: "error", message: "Speed only applies to video/audio clips" };
  }
  const updated = {
    ...overlay,
    styles: { ...(overlay.styles as any), playbackRate: multiplier },
  } as Overlay;
  return {
    status: "success",
    message: `Playback speed set to ${multiplier}x`,
    updatedOverlay: updated,
  };
}

function trimStart(overlay: Overlay, frames: number): CommandResult {
  if (frames >= overlay.durationInFrames) {
    return { status: "error", message: "Trim amount exceeds clip duration" };
  }
  const updated: Overlay = {
    ...overlay,
    from: overlay.from + frames,
    durationInFrames: overlay.durationInFrames - frames,
  };
  return {
    status: "success",
    message: `Trimmed ${frames} frames from start`,
    updatedOverlay: updated,
  };
}

function trimEnd(overlay: Overlay, frames: number): CommandResult {
  if (frames >= overlay.durationInFrames) {
    return { status: "error", message: "Trim amount exceeds clip duration" };
  }
  const updated: Overlay = {
    ...overlay,
    durationInFrames: overlay.durationInFrames - frames,
  };
  return {
    status: "success",
    message: `Trimmed ${frames} frames from end`,
    updatedOverlay: updated,
  };
}

function moveOverlay(overlay: Overlay, toFrame: number): CommandResult {
  const updated: Overlay = {
    ...overlay,
    from: toFrame,
  };
  return {
    status: "success",
    message: `Moved to frame ${toFrame}`,
    updatedOverlay: updated,
  };
}

function setColor(overlay: Overlay, color: string): CommandResult {
  if (overlay.type !== OverlayType.TEXT) {
    return { status: "error", message: "Color command only applies to text overlays" };
  }
  const updated = {
    ...overlay,
    styles: { ...(overlay.styles as any), color },
  } as Overlay;
  return {
    status: "success",
    message: `Text colour set to ${color}`,
    updatedOverlay: updated,
  };
}

function setFontSize(overlay: Overlay, size: number): CommandResult {
  if (overlay.type !== OverlayType.TEXT) {
    return { status: "error", message: "Font size command only applies to text overlays" };
  }
  const updated = {
    ...overlay,
    styles: { ...(overlay.styles as any), fontSize: size },
  } as Overlay;
  return {
    status: "success",
    message: `Font size set to ${size}px`,
    updatedOverlay: updated,
  };
}

// ---------------------------------------------------------------------------
// AI fallback
// ---------------------------------------------------------------------------

function buildAIFallback(
  rawInput: string,
  overlay: Overlay,
  fps: number,
): CommandResult {
  const typeName = overlay.type || "unknown";
  const name =
    (overlay as any).name ||
    (overlay as any).content ||
    (overlay as any).text ||
    `overlay #${overlay.id}`;
  const timeSec = (overlay.from / fps).toFixed(1);

  const prompt = `For the selected ${typeName} overlay '${name}' at ${timeSec}s: ${rawInput}`;

  return {
    status: "ai-fallback",
    message: "Sending to AI assistant...",
    action: "ai-fallback",
    aiPrompt: prompt,
  };
}
