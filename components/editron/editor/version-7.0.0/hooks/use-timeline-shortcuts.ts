import { useHotkeys } from "react-hotkeys-hook";
import { ZOOM_CONSTRAINTS } from "../constants";
import { Overlay } from "../types";

// Module-level clipboard for copy/paste across re-renders
let clipboardOverlay: Overlay | null = null;

interface UseTimelineShortcutsProps {
  handlePlayPause: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoomScale: number;
  setZoomScale: (scale: number) => void;
  /** Split the selected overlay at the current playhead position */
  onSplitAtPlayhead?: () => void;
  /** Duplicate the selected overlay */
  onDuplicateSelected?: () => void;
  /** Copy/paste support */
  onCopy?: () => Overlay | null;
  onPaste?: (overlay: Overlay) => void;
}

/**
 * A custom hook that sets up keyboard shortcuts for timeline controls
 *
 * Keyboard shortcuts:
 * - Alt + Space: Play/Pause
 * - Cmd/Ctrl + Z: Undo
 * - Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y: Redo
 * - Alt + Plus/=: Zoom in
 * - Alt + Minus/-: Zoom out
 *
 * @param {Object} props
 * @param {() => void} props.handlePlayPause - Function to toggle play/pause state
 * @param {() => void} props.undo - Function to handle undo operation
 * @param {() => void} props.redo - Function to handle redo operation
 * @param {boolean} props.canUndo - Whether undo operation is available
 * @param {boolean} props.canRedo - Whether redo operation is available
 * @param {number} props.zoomScale - Current zoom level
 * @param {(scale: number) => void} props.setZoomScale - Function to update zoom level
 */
export const useTimelineShortcuts = ({
  handlePlayPause,
  undo,
  redo,
  canUndo,
  canRedo,
  zoomScale,
  setZoomScale,
  onSplitAtPlayhead,
  onDuplicateSelected,
  onCopy,
  onPaste,
}: UseTimelineShortcutsProps) => {
  useHotkeys(
    "alt+space",
    (e) => {
      e.preventDefault();
      handlePlayPause();
    },
    { enableOnFormTags: true }
  );

  useHotkeys("meta+z, ctrl+z", (e) => {
    e.preventDefault();
    if (canUndo) undo();
  });

  useHotkeys("meta+shift+z, ctrl+shift+z, meta+y, ctrl+y", (e) => {
    e.preventDefault();
    if (canRedo) redo();
  });

  useHotkeys("alt+=, alt+plus", (e) => {
    e.preventDefault();
    const newScale = Math.min(
      zoomScale + ZOOM_CONSTRAINTS.step,
      ZOOM_CONSTRAINTS.max
    );
    setZoomScale(newScale);
  });

  useHotkeys(
    "alt+-, alt+minus",
    (e) => {
      e.preventDefault();
      const newScale = Math.max(
        zoomScale - ZOOM_CONSTRAINTS.step,
        ZOOM_CONSTRAINTS.min
      );
      setZoomScale(newScale);
    },
    {
      keydown: true,
      preventDefault: true,
    }
  );

  // Split selected overlay at playhead position
  useHotkeys(
    "s",
    (e) => {
      e.preventDefault();
      if (onSplitAtPlayhead) onSplitAtPlayhead();
    },
    { keydown: true }
  );

  // Duplicate selected overlay
  useHotkeys(
    "d, ctrl+d",
    (e) => {
      e.preventDefault();
      if (onDuplicateSelected) onDuplicateSelected();
    },
    { keydown: true }
  );

  // Copy selected overlay
  useHotkeys(
    "meta+c, ctrl+c",
    (e) => {
      e.preventDefault();
      if (onCopy) {
        const overlay = onCopy();
        if (overlay) {
          clipboardOverlay = { ...overlay };
        }
      }
    },
    { keydown: true }
  );

  // Paste copied overlay at playhead position
  useHotkeys(
    "meta+v, ctrl+v",
    (e) => {
      e.preventDefault();
      if (onPaste && clipboardOverlay) {
        onPaste(clipboardOverlay);
      }
    },
    { keydown: true }
  );
};
