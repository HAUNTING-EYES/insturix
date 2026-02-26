import { Overlay } from "../types";

export const useTimelinePositioning = () => {
  /**
   * Finds the next available position for a new overlay in a multi-row timeline
   * @param existingOverlays - Array of current overlays in the timeline
   * @param visibleRows - Number of rows currently visible in the timeline
   * @param totalDuration - Total duration of the timeline in frames
   * @returns Object containing the starting position (from) and row number
   */
  const findNextAvailablePosition = (
    existingOverlays: Overlay[],
    visibleRows: number,
    totalDuration: number
  ): { from: number; row: number } => {
    // If no overlays exist, start at the beginning
    if (existingOverlays.length === 0) {
      return { from: 0, row: 0 };
    }

    const sortedOverlays = [...existingOverlays].sort(
      (a, b) => a.from - b.from
    );

    // Find the earliest available position across all rows
    let bestPosition = { from: totalDuration, row: 0 };

    // Check each visible row
    for (let row = 0; row < visibleRows; row++) {
      const overlaysInRow = sortedOverlays.filter(
        (overlay) => overlay.row === row
      );

      // If row is empty, we can place at the start
      if (overlaysInRow.length === 0) {
        return { from: 0, row };
      }

      let lastEndTime = 0;

      // Check gaps between overlays in this row
      for (const overlay of overlaysInRow) {
        if (overlay.from - lastEndTime >= 1) {
          // Found a potential gap
          const potentialPosition = lastEndTime;

          // Check if this gap overlaps with any overlay in other rows
          const isOverlapping = sortedOverlays.some(
            (other) =>
              other.row !== row &&
              potentialPosition < other.from + other.durationInFrames &&
              other.from < potentialPosition + 1
          );

          if (!isOverlapping && potentialPosition < bestPosition.from) {
            bestPosition = { from: potentialPosition, row };
          }
        }
        lastEndTime = Math.max(
          lastEndTime,
          overlay.from + overlay.durationInFrames
        );
      }

      // Check position after the last overlay in this row
      const isOverlapping = sortedOverlays.some(
        (other) =>
          other.row !== row &&
          lastEndTime < other.from + other.durationInFrames &&
          other.from < lastEndTime + 1
      );

      if (!isOverlapping && lastEndTime < bestPosition.from) {
        bestPosition = { from: lastEndTime, row };
      }
    }

    // If we found a valid position, use it
    if (bestPosition.from < totalDuration) {
      return bestPosition;
    }

    // If no better position found, find the row with the earliest end time
    const rowEndTimes = new Array(visibleRows).fill(0);
    sortedOverlays.forEach((overlay) => {
      if (overlay.row < visibleRows) {
        rowEndTimes[overlay.row] = Math.max(
          rowEndTimes[overlay.row],
          overlay.from + overlay.durationInFrames
        );
      }
    });

    const earliestRow = rowEndTimes.reduce(
      (minRow, endTime, index) =>
        endTime < rowEndTimes[minRow] ? index : minRow,
      0
    );

    return {
      from: rowEndTimes[earliestRow],
      row: earliestRow,
    };
  };

  /**
   * Creates a new top layer and shifts all existing layers down
   * @param existingOverlays - Array of current overlays in the timeline
   * @param updateOverlays - Function to update all overlays with new row positions
   * @returns Object containing the starting position (from: 0) and new top row number (0)
   */
  const createNewTopLayer = (
    existingOverlays: Overlay[],
    updateOverlays: (overlays: Overlay[]) => void
  ): { from: number; row: number } => {
    // Shift all existing overlays down by 1 row
    const shiftedOverlays = existingOverlays.map((overlay) => {
      const currentRow = Number.isFinite(overlay.row) ? overlay.row : 0;
      return {
        ...overlay,
        row: Math.max(0, currentRow) + 1,
      };
    });
    
    // Update all overlays with new row positions
    updateOverlays(shiftedOverlays);
    
    // Return position for new caption in the top row (0)
    return { from: 0, row: 0 };
  };

  return { findNextAvailablePosition, createNewTopLayer };
};
