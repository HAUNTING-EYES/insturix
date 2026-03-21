import { useState, useCallback, useEffect, useRef } from "react";
import { Overlay } from "../types";

interface HistoryState {
  past: Overlay[][];
  present: Overlay[];
  future: Overlay[][];
}

// Debounce delay for grouping rapid changes into single history entries
const HISTORY_DEBOUNCE_MS = 150;

// Maximum number of undo history entries to prevent memory leaks
const MAX_HISTORY_LENGTH = 50;

export function useHistory(
  overlays: Overlay[],
  setOverlays: (overlays: Overlay[]) => void
) {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: overlays,
    future: [],
  });

  // Ref to track if we're currently applying undo/redo to prevent recording
  const isApplyingHistoryRef = useRef(false);
  // Ref for debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to store the state before the current batch of changes started
  const batchStartStateRef = useRef<Overlay[] | null>(null);

  useEffect(() => {
    // Don't record history if this change was from undo/redo
    if (isApplyingHistoryRef.current) {
      return;
    }

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // If this is the start of a new batch, save the starting state
    if (batchStartStateRef.current === null) {
      setHistory((prev) => {
        batchStartStateRef.current = prev.present;
        return prev;
      });
    }

    // Debounce the history recording
    debounceTimerRef.current = setTimeout(() => {
      setHistory((prev) => {
        // Use the batch start state as the "past" entry
        const stateToSave = batchStartStateRef.current ?? prev.present;
        batchStartStateRef.current = null;

        // Skip if nothing actually changed
        if (stateToSave === overlays) return prev;

        const newPast = [...prev.past, stateToSave];
        // Cap history length to prevent memory leaks
        if (newPast.length > MAX_HISTORY_LENGTH) {
          newPast.shift();
        }

        return {
          past: newPast,
          present: overlays,
          future: [],
        };
      });
    }, HISTORY_DEBOUNCE_MS);

    // Update the present immediately for UI responsiveness
    setHistory((prev) => ({
      ...prev,
      present: overlays,
    }));

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [overlays]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;

      const newPast = prev.past.slice(0, -1);
      const newPresent = prev.past[prev.past.length - 1];

      // Mark that we're applying history to prevent recording
      isApplyingHistoryRef.current = true;
      setOverlays(newPresent);
      // Reset on next tick
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);

      return {
        past: newPast,
        present: newPresent,
        future: [prev.present, ...prev.future],
      };
    });
  }, [setOverlays]);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;

      const newFuture = prev.future.slice(1);
      const newPresent = prev.future[0];

      // Mark that we're applying history to prevent recording
      isApplyingHistoryRef.current = true;
      setOverlays(newPresent);
      // Reset on next tick
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);

      return {
        past: [...prev.past, prev.present],
        present: newPresent,
        future: newFuture,
      };
    });
  }, [setOverlays]);

  return {
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
