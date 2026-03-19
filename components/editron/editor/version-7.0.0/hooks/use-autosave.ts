import { useEffect, useRef, useState } from "react";
import { getUserId } from "../utils/user-id";

interface AutosaveOptions {
  /**
   * Interval in milliseconds between autosaves
   * @default 15000 (15 seconds) - increased for network operations
   */
  interval?: number;

  /**
   * Function to call when an autosave is loaded
   */
  onLoad?: (data: any) => void;

  /**
   * Function to call when an autosave is saved
   */
  onSave?: () => void;

  /**
   * Function to call when an autosave is detected on initial load
   */
  onAutosaveDetected?: (timestamp: number) => void;
}

/**
 * Hook for automatically saving editor state to MongoDB via API
 *
 * @param projectId Unique identifier for the project
 * @param state Current state to be saved
 * @param options Configuration options for autosave behavior
 * @returns Object with functions to manually save and load state
 */
export const useAutosave = (
  projectId: string,
  state: any,
  options: AutosaveOptions = {}
) => {
  const { interval = 15000, onLoad, onSave, onAutosaveDetected } = options;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedStateRef = useRef<string>("");
  const [hasCheckedForAutosave, setHasCheckedForAutosave] = useState(false);
  const hasLoadedRef = useRef(false);

  const userId = getUserId();

  // Check for existing autosave on mount, but only once
  useEffect(() => {
    const checkForAutosave = async () => {
      if (hasCheckedForAutosave) return;

      try {
        // Load project to check for autosave
        const response = await fetch(`/api/services/editron/projects/${projectId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.project?.lastAutosaveAt) {
            const timestamp = new Date(data.project.lastAutosaveAt).getTime();
            if (onAutosaveDetected) {
              onAutosaveDetected(timestamp);
            }
          }
        }
        setHasCheckedForAutosave(true);
      } catch (error) {
        console.error("Failed to check for autosave:", error);
        setHasCheckedForAutosave(true);
      }
    };

    if (projectId) {
      checkForAutosave();
    }
  }, [projectId, onAutosaveDetected, hasCheckedForAutosave]);

  // Set up autosave timer
  useEffect(() => {
    // Don't start autosave if projectId is not valid
    if (!projectId || !userId) return;

    const saveIfChanged = async () => {
      // Don't autosave until the initial load has completed,
      // otherwise we overwrite imported data with empty overlays.
      if (!hasLoadedRef.current) return;

      const body = JSON.stringify(state);
      if (!body) return;

      // Only save if state has changed since last save
      if (body !== lastSavedStateRef.current) {
        try {
          const response = await fetch(`/api/services/editron/projects/${projectId}/autosave`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body,
          });

          if (response.ok) {
            lastSavedStateRef.current = body;
            if (onSave) onSave();
          } else {
            console.error("Autosave failed:", await response.text());
          }
        } catch (error) {
          console.error("Autosave failed:", error);
        }
      }
    };

    // Set up interval for autosave
    timerRef.current = setInterval(saveIfChanged, interval);

    // Clean up timer on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [projectId, userId, state, interval, onSave]);

  // Function to manually save state
  const saveState = async () => {
    if (!userId) {
      console.error("User not authenticated");
      return false;
    }

    try {
      const response = await fetch(`/api/services/editron/projects/${projectId}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      });

      if (response.ok) {
        lastSavedStateRef.current = JSON.stringify(state);
        if (onSave) onSave();
        return true;
      } else {
        console.error("Manual save failed:", await response.text());
        return false;
      }
    } catch (error) {
      console.error("Manual save failed:", error);
      return false;
    }
  };

  // Function to manually load state
  const loadState = async () => {
    if (!userId) {
      console.error("User not authenticated");
      return null;
    }

    try {
      const response = await fetch(`/api/services/editron/projects/${projectId}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.project) {
          const loadedState = {
            overlays: data.project.overlays,
            aspectRatio: data.project.aspectRatio,
            playerDimensions: data.project.playerDimensions,
            fps: data.project.fps,
            durationInFrames: data.project.durationInFrames,
          };
          
          hasLoadedRef.current = true;
          // Snapshot current state so the first autosave doesn't
          // overwrite with the same data we just loaded.
          lastSavedStateRef.current = JSON.stringify(loadedState);
          if (onLoad) {
            onLoad(loadedState);
          }
          return loadedState;
        }
      } else if (response.status === 404) {
        hasLoadedRef.current = true;
        // Project not found - throw error to be handled by caller
        throw new Error('PROJECT_NOT_FOUND');
      }
      hasLoadedRef.current = true;
      return null;
    } catch (error) {
      hasLoadedRef.current = true;
      // Re-throw PROJECT_NOT_FOUND errors
      if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
        throw error;
      }
      console.error("Load failed:", error);
      return null;
    }
  };

  return {
    saveState,
    loadState,
  };
};
