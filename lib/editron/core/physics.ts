/**
 * Editron Physics Engine
 * 
 * Core logic for:
 * 1. Smart Row Packing (find available row for new overlay)
 * 2. Collision Detection (check if time range on row is free)
 * 3. Coordinate Resolution (convert % to px)
 */
// Re-export OverlayType for use in physics (avoids @/ path issues in tests)
// This mirrors the enum from components/editron/editor/version-7.0.0/types.ts
// Using 'as const' object instead of TS enum for Node ESM compatibility
export const OverlayType = {
  TEXT: "text",
  IMAGE: "image",
  SHAPE: "shape",
  VIDEO: "video",
  SOUND: "sound",
  CAPTION: "caption",
  LOCAL_DIR: "local-dir",
  STICKER: "sticker",
  TEMPLATE: "template",
  AI_CHAT: "ai-chat",
  HTML_SCENE: "html-scene",
} as const;
export type OverlayType = typeof OverlayType[keyof typeof OverlayType];

// Types for the Physics Engine
export interface TimeRange {
  from: number;       // Start frame
  duration: number;   // Duration in frames
}

export interface OverlayPlacement {
  row: number;
  from: number;
  durationInFrames: number;
  left: number;      // Resolved px
  top: number;       // Resolved px
  width: number;     // Resolved px
  height: number;    // Resolved px
}

export interface ExistingOverlay {
  id: number;
  row: number;
  from: number;
  durationInFrames: number;
  type: OverlayType;
}

export interface CanvasDimensions {
  width: number;
  height: number;
}

/**
 * Check if two time ranges overlap
 */
export function doRangesOverlap(
  a: { from: number; duration: number },
  b: { from: number; duration: number }
): boolean {
  const aEnd = a.from + a.duration;
  const bEnd = b.from + b.duration;
  // Overlap if NOT (a ends before b starts OR b ends before a starts)
  return !(aEnd <= b.from || bEnd <= a.from);
}

/**
 * Check if a specific row has a collision at the given time range
 */
export function hasCollisionOnRow(
  row: number,
  timeRange: TimeRange,
  existingOverlays: ExistingOverlay[]
): boolean {
  return existingOverlays.some(overlay => 
    overlay.row === row && 
    doRangesOverlap(
      { from: timeRange.from, duration: timeRange.duration },
      { from: overlay.from, duration: overlay.durationInFrames }
    )
  );
}

/**
 * Overlay types that belong in the background (higher row numbers = lower z-index).
 * In our z-index model: row 0 = z-index 100 (front), higher rows = further back.
 * So background content should go to HIGHER row numbers.
 */
const BACKGROUND_TYPES: readonly string[] = [
  OverlayType.VIDEO,
  OverlayType.SOUND,
] as const;

/**
 * Find the best available row for a new overlay.
 *
 * Z-index model: row 0 = z-index 100 (TOP), higher rows = further back.
 *
 * Logic (like DaVinci Resolve / Premiere):
 * - Video/Audio → Background: Pack at HIGH row numbers (behind everything)
 * - Text/Stickers/Images/Captions/HTML → Foreground: Pack at LOW row numbers (on top)
 *
 * This ensures stickers, text, and captions always appear ABOVE videos.
 *
 * @param type - The type of overlay being added
 * @param timeRange - The time range the overlay will occupy
 * @param existingOverlays - Current overlays in the project
 * @param forceRow - Optional: Force a specific row (manual override)
 * @returns The best row number
 */
export function findBestRow(
  type: OverlayType,
  timeRange: TimeRange,
  existingOverlays: ExistingOverlay[],
  forceRow?: number
): number {
  // If forceRow is specified, respect user override
  if (forceRow !== undefined) {
    return forceRow;
  }

  // Find max row currently in use
  const maxUsedRow = existingOverlays.length > 0
    ? Math.max(...existingOverlays.map(o => o.row))
    : -1; // -1 means no overlays yet

  const isBackground = BACKGROUND_TYPES.includes(type);

  if (isBackground) {
    // BACKGROUND (video/audio): Pack from high rows downward.
    // Start at a guaranteed "back" row and search for a free slot.
    // Minimum background row = max(2, maxUsedRow) to leave room for foreground.
    const startRow = Math.max(2, maxUsedRow + 1);
    for (let row = startRow; row >= 0; row--) {
      if (!hasCollisionOnRow(row, timeRange, existingOverlays)) {
        // Ensure we don't go below row 2 if there's foreground content on 0/1
        const hasLowRowForeground = existingOverlays.some(
          o => o.row <= 1 && !BACKGROUND_TYPES.includes(o.type)
        );
        if (row <= 1 && hasLowRowForeground) continue;
        return row;
      }
    }
    // Fallback: next row after max (deepest background)
    return maxUsedRow + 1;
  } else {
    // FOREGROUND (text/sticker/image/caption/html): Pack from row 0 upward.
    // Row 0 = highest z-index = most visible.
    for (let row = 0; row <= maxUsedRow + 1; row++) {
      if (!hasCollisionOnRow(row, timeRange, existingOverlays)) {
        return row;
      }
    }
    // Fallback: next row after max
    return maxUsedRow + 1;
  }
}

/**
 * Resolve a position value (can be number, percentage string, or undefined)
 * to a pixel value based on canvas dimensions.
 * 
 * @param value - The value to resolve (e.g., 100, "50%", "center")
 * @param canvasSize - The canvas dimension (width or height)
 * @param elementSize - The element's size in the same dimension
 * @param defaultValue - Default if value is undefined
 */
export function resolvePosition(
  value: number | string | undefined,
  canvasSize: number,
  elementSize: number,
  defaultValue: number
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === 'number') {
    return value;
  }

  // Handle percentage strings
  if (typeof value === 'string') {
    if (value === 'center') {
      return (canvasSize - elementSize) / 2;
    }
    
    if (value.endsWith('%')) {
      const percent = parseFloat(value) / 100;
      // Percentage is relative to canvas, returns center position
      // So 50% means center of element is at 50% of canvas
      return (percent * canvasSize) - (elementSize / 2);
    }

    // Try parsing as number
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }

  return defaultValue;
}

/**
 * Resolve a size value (can be number, percentage string, or undefined)
 */
export function resolveSize(
  value: number | string | undefined,
  canvasSize: number,
  defaultValue: number
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.endsWith('%')) {
      const percent = parseFloat(value) / 100;
      return percent * canvasSize;
    }

    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }

  return defaultValue;
}

/**
 * Resolve all coordinates from flexible input to pixel values
 */
export function resolveCoordinates(
  input: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
  },
  canvas: CanvasDimensions,
  defaults: { width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  // Resolve sizes first (needed for position calculation)
  const width = resolveSize(input.width, canvas.width, defaults.width);
  const height = resolveSize(input.height, canvas.height, defaults.height);

  // Resolve positions (centered by default)
  const left = resolvePosition(input.x, canvas.width, width, (canvas.width - width) / 2);
  const top = resolvePosition(input.y, canvas.height, height, (canvas.height - height) / 2);

  return { left, top, width, height };
}

/**
 * Get default element size based on type
 */
export function getDefaultSize(type: OverlayType): { width: number; height: number } {
  switch (type) {
    case OverlayType.TEXT:
      return { width: 600, height: 100 };
    case OverlayType.IMAGE:
      return { width: 400, height: 400 };
    case OverlayType.VIDEO:
      return { width: 1920, height: 1080 };
    case OverlayType.SHAPE:
      return { width: 200, height: 200 };
    case OverlayType.STICKER:
      return { width: 150, height: 150 };
    case OverlayType.CAPTION:
      return { width: 800, height: 100 };
    default:
      return { width: 400, height: 300 };
  }
}
