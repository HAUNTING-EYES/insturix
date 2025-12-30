/**
 * AI Tools Placement Resolver
 * 
 * This module provides intelligent track placement logic for the AI tools.
 * It handles both explicit row placement (with overlap detection) and 
 * constraint-based placement (e.g., "place above row 2", "place between rows 1 and 3").
 * 
 * KEY CONCEPTS:
 * 
 * 1. **Explicit Row Placement**:
 *    - User/LLM specifies exact row number
 *    - System checks for temporal overlaps
 *    - Returns error if overlap detected
 * 
 * 2. **Constraint-Based Placement**:
 *    - aboveRow: Finds first available row above target
 *    - belowRow: Finds first available row below target
 *    - betweenRows: Finds available row in range
 *    - Creates new row if needed (within MAX_ROWS limit)
 * 
 * 3. **Overlap Detection**:
 *    - Two tracks overlap if their time ranges intersect
 *    - Overlap if: (start1 < end2) AND (start2 < end1)
 *    - Same row overlaps are errors for explicit placement
 *    - Different row overlaps are allowed
 */

import { Overlay } from "./types";
import { MAX_ROWS, INITIAL_ROWS } from "./constants";

/**
 * Placement constraints - at most one should be specified
 */
export interface PlacementConstraints {
  /** Place track above this row number (searches upward from row-1) */
  aboveRow?: number;
  
  /** Place track below this row number (searches downward from row+1) */
  belowRow?: number;
  
  /** Place track between these row numbers (inclusive range) */
  betweenRows?: [number, number];
}

/**
 * Result of placement resolution
 */
export interface PlacementResult {
  /** Resolved row number to place the track on */
  row: number;
  
  /** Whether a new row needs to be created */
  needsNewRow: boolean;
  
  /** Optional message about the placement decision */
  message?: string;
}

/**
 * Error codes for placement failures
 */
export enum PlacementErrorCode {
  OVERLAP = "OVERLAP",
  NO_SPACE = "NO_SPACE",
  INVALID_CONSTRAINT = "INVALID_CONSTRAINT",
  MAX_ROWS_REACHED = "MAX_ROWS_REACHED",
}

/**
 * Placement error with code and message
 */
export class PlacementError extends Error {
  constructor(
    public code: PlacementErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PlacementError";
  }
}

/**
 * Check if two time ranges overlap
 * Ranges overlap if: (start1 < end2) AND (start2 < end1)
 */
function timeRangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean {
  return start1 < end2 && start2 < end1;
}

/**
 * Find overlapping tracks on a specific row within a time range
 */
function findOverlapsOnRow(
  overlays: Overlay[],
  row: number,
  start: number,
  duration: number
): Overlay[] {
  const end = start + duration;
  
  return overlays.filter((overlay) => {
    if (overlay.row !== row) return false;
    
    const overlayEnd = overlay.from + overlay.durationInFrames;
    return timeRangesOverlap(start, end, overlay.from, overlayEnd);
  });
}

/**
 * Check if a row is available (no overlaps) for the given time range
 */
function isRowAvailable(
  overlays: Overlay[],
  row: number,
  start: number,
  duration: number
): boolean {
  return findOverlapsOnRow(overlays, row, start, duration).length === 0;
}

/**
 * Validate that placement constraints are valid
 */
function validateConstraints(
  constraints: PlacementConstraints
): PlacementError | null {
  const { aboveRow, belowRow, betweenRows } = constraints;
  
  // Check that only one constraint is specified
  const constraintCount = [aboveRow, belowRow, betweenRows].filter(
    (c) => c !== undefined
  ).length;
  
  if (constraintCount > 1) {
    return new PlacementError(
      PlacementErrorCode.INVALID_CONSTRAINT,
      "Only one placement constraint can be specified (aboveRow, belowRow, or betweenRows)"
    );
  }
  
  // Validate aboveRow
  if (aboveRow !== undefined && aboveRow < 0) {
    return new PlacementError(
      PlacementErrorCode.INVALID_CONSTRAINT,
      `aboveRow must be >= 0, got ${aboveRow}`
    );
  }
  
  // Validate belowRow
  if (belowRow !== undefined && belowRow < 0) {
    return new PlacementError(
      PlacementErrorCode.INVALID_CONSTRAINT,
      `belowRow must be >= 0, got ${belowRow}`
    );
  }
  
  // Validate betweenRows
  if (betweenRows !== undefined) {
    const [min, max] = betweenRows;
    
    if (min < 0 || max < 0) {
      return new PlacementError(
        PlacementErrorCode.INVALID_CONSTRAINT,
        `betweenRows range must have non-negative values, got [${min}, ${max}]`
      );
    }
    
    if (min > max) {
      return new PlacementError(
        PlacementErrorCode.INVALID_CONSTRAINT,
        `betweenRows range [${min}, ${max}] is invalid: min must be <= max`
      );
    }
  }
  
  return null;
}

/**
 * Find the current maximum row number in use
 */
function getMaxUsedRow(overlays: Overlay[]): number {
  if (overlays.length === 0) return -1;
  return Math.max(...overlays.map((o) => o.row));
}

/**
 * Resolve placement using "aboveRow" constraint
 * Searches upward from (targetRow - 1) to 0
 */
function resolveAboveRow(
  overlays: Overlay[],
  targetRow: number,
  start: number,
  duration: number,
  currentMaxRow: number
): PlacementResult {
  // Search upward from targetRow - 1 to 0
  for (let row = targetRow - 1; row >= 0; row--) {
    if (isRowAvailable(overlays, row, start, duration)) {
      return {
        row,
        needsNewRow: false,
        message: `Placed on row ${row} (above row ${targetRow})`,
      };
    }
  }
  
  // No space found above - try to create new row above
  // This means inserting at row 0 and shifting everything down
  if (currentMaxRow + 1 >= MAX_ROWS) {
    throw new PlacementError(
      PlacementErrorCode.MAX_ROWS_REACHED,
      `Cannot create new row above ${targetRow}: maximum ${MAX_ROWS} rows reached`
    );
  }
  
  return {
    row: 0,
    needsNewRow: true,
    message: `Creating new row 0 (above row ${targetRow}, shifting existing rows down)`,
  };
}

/**
 * Resolve placement using "belowRow" constraint
 * Searches downward from (targetRow + 1) to MAX_ROWS
 */
function resolveBelowRow(
  overlays: Overlay[],
  targetRow: number,
  start: number,
  duration: number,
  currentMaxRow: number
): PlacementResult {
  // Search downward from targetRow + 1
  for (let row = targetRow + 1; row < MAX_ROWS; row++) {
    if (isRowAvailable(overlays, row, start, duration)) {
      const needsNewRow = row > currentMaxRow;
      return {
        row,
        needsNewRow,
        message: needsNewRow
          ? `Creating new row ${row} (below row ${targetRow})`
          : `Placed on row ${row} (below row ${targetRow})`,
      };
    }
  }
  
  throw new PlacementError(
    PlacementErrorCode.NO_SPACE,
    `No available space below row ${targetRow} within maximum ${MAX_ROWS} rows`
  );
}

/**
 * Resolve placement using "betweenRows" constraint
 * Searches within the inclusive range [min, max]
 */
function resolveBetweenRows(
  overlays: Overlay[],
  range: [number, number],
  start: number,
  duration: number,
  currentMaxRow: number
): PlacementResult {
  const [minRow, maxRow] = range;
  
  // Validate range doesn't exceed MAX_ROWS
  if (maxRow >= MAX_ROWS) {
    throw new PlacementError(
      PlacementErrorCode.INVALID_CONSTRAINT,
      `betweenRows range [${minRow}, ${maxRow}] exceeds maximum ${MAX_ROWS} rows`
    );
  }
  
  // Search within range for available row
  for (let row = minRow; row <= maxRow; row++) {
    if (isRowAvailable(overlays, row, start, duration)) {
      const needsNewRow = row > currentMaxRow;
      return {
        row,
        needsNewRow,
        message: needsNewRow
          ? `Creating new row ${row} (between rows ${minRow}-${maxRow})`
          : `Placed on row ${row} (between rows ${minRow}-${maxRow})`,
      };
    }
  }
  
  throw new PlacementError(
    PlacementErrorCode.NO_SPACE,
    `No available space between rows ${minRow} and ${maxRow} for the specified time range`
  );
}

/**
 * Main placement resolver function
 * 
 * @param overlays - Current overlay state
 * @param row - Explicit row number (if specified)
 * @param start - Start frame of new track
 * @param duration - Duration in frames of new track
 * @param constraints - Optional placement constraints (aboveRow, belowRow, or betweenRows)
 * @returns PlacementResult with resolved row and metadata
 * @throws PlacementError if placement cannot be satisfied
 */
export function resolveTrackPlacement(
  overlays: Overlay[],
  row: number | undefined,
  start: number,
  duration: number,
  constraints?: PlacementConstraints
): PlacementResult {
  const currentMaxRow = getMaxUsedRow(overlays);
  
  // CASE 1: Explicit row placement (no constraints)
  if (row !== undefined && !constraints) {
    // Validate row is within bounds
    if (row < 0 || row >= MAX_ROWS) {
      throw new PlacementError(
        PlacementErrorCode.INVALID_CONSTRAINT,
        `Row ${row} is out of bounds. Must be between 0 and ${MAX_ROWS - 1}`
      );
    }
    
    // Check for overlaps on the specified row
    const overlaps = findOverlapsOnRow(overlays, row, start, duration);
    
    if (overlaps.length > 0) {
      const overlappingTracks = overlaps
        .map((o, i) => `Track ${i + 1}: frames ${o.from}-${o.from + o.durationInFrames}`)
        .join(", ");
      
      throw new PlacementError(
        PlacementErrorCode.OVERLAP,
        `Row ${row} has overlapping tracks in the time range ${start}-${start + duration}. ` +
          `Overlapping: ${overlappingTracks}. ` +
          `Use placement constraints (aboveRow, belowRow, betweenRows) to find available space automatically.`
      );
    }
    
    const needsNewRow = row > currentMaxRow;
    return {
      row,
      needsNewRow,
      message: needsNewRow
        ? `Creating new row ${row} (explicit placement)`
        : `Placed on row ${row} (explicit placement)`,
    };
  }
  
  // CASE 2: Constraint-based placement
  if (constraints) {
    // Validate constraints
    const validationError = validateConstraints(constraints);
    if (validationError) {
      throw validationError;
    }
    
    const { aboveRow, belowRow, betweenRows } = constraints;
    
    // Handle aboveRow constraint
    if (aboveRow !== undefined) {
      return resolveAboveRow(overlays, aboveRow, start, duration, currentMaxRow);
    }
    
    // Handle belowRow constraint
    if (belowRow !== undefined) {
      return resolveBelowRow(overlays, belowRow, start, duration, currentMaxRow);
    }
    
    // Handle betweenRows constraint
    if (betweenRows !== undefined) {
      return resolveBetweenRows(overlays, betweenRows, start, duration, currentMaxRow);
    }
  }
  
  // CASE 3: No row or constraints specified - use default behavior
  // Place on first available row, or create new row if needed
  for (let searchRow = 0; searchRow < MAX_ROWS; searchRow++) {
    if (isRowAvailable(overlays, searchRow, start, duration)) {
      const needsNewRow = searchRow > currentMaxRow;
      return {
        row: searchRow,
        needsNewRow,
        message: needsNewRow
          ? `Creating new row ${searchRow} (auto-placement)`
          : `Placed on row ${searchRow} (auto-placement)`,
      };
    }
  }
  
  throw new PlacementError(
    PlacementErrorCode.NO_SPACE,
    `No available space found in any row (maximum ${MAX_ROWS} rows). ` +
      `All rows have overlapping content in time range ${start}-${start + duration}.`
  );
}
