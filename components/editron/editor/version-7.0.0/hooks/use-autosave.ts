import { useCallback, useEffect, useRef, useState } from "react";
import { getUserId } from "../utils/user-id";
import { serializeEditorStateForSave } from "@/lib/editron/shared/project-save-payload";
import { bindAbortToPageLifecycle } from "../utils/request-lifecycle";
import type { ProjectRevisionV1 } from "@/lib/editron/services/project-service";

interface AutosaveOptions {
  /**
   * Interval in milliseconds between autosaves
   * @default 15000 (15 seconds) - increased for network operations
   */
  interval?: number;

  /**
   * When true, autosave is paused (e.g. during AI processing).
   * Prevents autosave from overwriting server-side changes made by the AI agent.
   */
  pauseAutosave?: boolean;

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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isProjectRevision(value: unknown): value is ProjectRevisionV1 {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as ProjectRevisionV1).schemaVersion === 1 &&
      Number.isSafeInteger((value as ProjectRevisionV1).value) &&
      (value as ProjectRevisionV1).value >= 0 &&
      typeof (value as ProjectRevisionV1).compatibilityUpdatedAt === "string" &&
      !Number.isNaN(
        new Date((value as ProjectRevisionV1).compatibilityUpdatedAt).getTime(),
      ),
  );
}

function projectRevisionFromLoadedProject(
  project: unknown,
): ProjectRevisionV1 | null {
  if (!project || typeof project !== "object") return null;
  const loadedProject = project as {
    projectRevision?: unknown;
    updatedAt?: unknown;
  };
  const revision = {
    schemaVersion: 1 as const,
    value: loadedProject.projectRevision,
    compatibilityUpdatedAt: loadedProject.updatedAt,
  };
  return isProjectRevision(revision) ? revision : null;
}

function mutationPayload(
  serializedState: string,
  expectedRevision: ProjectRevisionV1,
): string {
  return JSON.stringify({ ...JSON.parse(serializedState), expectedRevision });
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
  options: AutosaveOptions = {},
) => {
  const {
    interval = 15000,
    pauseAutosave = false,
    onLoad,
    onSave,
    onAutosaveDetected,
  } = options;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedStateRef = useRef<string>("");
  const hasLoadedRef = useRef(false);
  const checkedAutosaveProjectRef = useRef<string | null>(null);
  const loadControllerRef = useRef<AbortController | null>(null);
  const loadStateRef = useRef<() => Promise<unknown>>(async () => null);
  const revisionRef = useRef<ProjectRevisionV1 | null>(null);
  const [projectRevision, setProjectRevision] = useState<ProjectRevisionV1 | null>(null);
  const stateRef = useRef(state);
  const pauseAutosaveRef = useRef(pauseAutosave);
  const callbacksRef = useRef({ onLoad, onSave, onAutosaveDetected });

  stateRef.current = state;
  pauseAutosaveRef.current = pauseAutosave;
  callbacksRef.current = { onLoad, onSave, onAutosaveDetected };

  const userId = getUserId();
  const updateRevision = useCallback((revision: ProjectRevisionV1 | null) => {
    revisionRef.current = revision;
    setProjectRevision(revision);
  }, []);

  useEffect(() => {
    hasLoadedRef.current = false;
    lastSavedStateRef.current = "";
    updateRevision(null);
    checkedAutosaveProjectRef.current = null;
    loadControllerRef.current?.abort();
    loadControllerRef.current = null;

    return () => {
      loadControllerRef.current?.abort();
      loadControllerRef.current = null;
    };
  }, [projectId, updateRevision]);

  // Check for an existing autosave once per project.
  useEffect(() => {
    if (!projectId || checkedAutosaveProjectRef.current === projectId) return;
    const controller = new AbortController();
    const detachPageLifecycle = bindAbortToPageLifecycle(controller);

    const checkForAutosave = async () => {
      try {
        const response = await fetch(
          `/api/services/editron/projects/${projectId}`,
          {
            signal: controller.signal,
          },
        );
        if (response.ok) {
          const data = await response.json();
          const revision = data.success
            ? projectRevisionFromLoadedProject(data.project)
            : null;
          if (revision) {
            updateRevision(revision);
          }
          if (data.success && data.project?.lastAutosaveAt) {
            const timestamp = new Date(data.project.lastAutosaveAt).getTime();
            callbacksRef.current.onAutosaveDetected?.(timestamp);
          }
        }
        if (!controller.signal.aborted)
          checkedAutosaveProjectRef.current = projectId;
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        console.error("Failed to check for autosave:", error);
        checkedAutosaveProjectRef.current = projectId;
      } finally {
        detachPageLifecycle();
      }
    };

    void checkForAutosave();
    return () => {
      detachPageLifecycle();
      controller.abort();
    };
  }, [projectId, updateRevision]);
  // Set up autosave timer
  useEffect(() => {
    // Don't start autosave if projectId is not valid
    if (!projectId || !userId) return;
    const controller = new AbortController();
    const detachPageLifecycle = bindAbortToPageLifecycle(controller);

    const saveIfChanged = async () => {
      // CRITICAL: never autosave before the initial load completes.
      // The state at this point is the component's empty default (overlays: [])
      // which would overwrite whatever was stored in MongoDB.
      if (!hasLoadedRef.current) return;

      // CRITICAL: never autosave while AI is processing.
      // The AI agent modifies overlays directly in the DB. Autosaving during
      // this window would overwrite the AI's changes with stale client state.
      if (pauseAutosaveRef.current) return;

      const body = serializeEditorStateForSave(stateRef.current);
      if (!body) return;
      const expectedRevision = revisionRef.current;
      if (!expectedRevision) {
        await loadStateRef.current();
        return;
      }

      // Only save if state has changed since last save
      if (body !== lastSavedStateRef.current) {
        try {
          const response = await fetch(
            `/api/services/editron/projects/${projectId}/autosave`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: mutationPayload(body, expectedRevision),
              signal: controller.signal,
            },
          );

          if (response.ok) {
            const data = await response.json();
            if (!isProjectRevision(data.revision)) {
              throw new Error(
                "Autosave response omitted its ProjectRevisionV1 receipt.",
              );
            }
            updateRevision(data.revision);
            lastSavedStateRef.current = body;
            callbacksRef.current.onSave?.();
          } else if (response.status === 409) {
            await loadStateRef.current();
          } else {
            console.error("Autosave failed:", await response.text());
          }
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return;
          console.error("Autosave failed:", error);
        }
      }
    };

    // Set up interval for autosave
    timerRef.current = setInterval(saveIfChanged, interval);

    // Clean up timer on unmount
    return () => {
      detachPageLifecycle();
      controller.abort();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [projectId, userId, interval, updateRevision]);

  // Function to manually save state
  const saveState = useCallback(async () => {
    if (!userId) {
      console.error("User not authenticated");
      return false;
    }

    const controller = new AbortController();
    const detachPageLifecycle = bindAbortToPageLifecycle(controller);
    const body = serializeEditorStateForSave(stateRef.current);
    const expectedRevision = revisionRef.current;
    if (!body || !expectedRevision) {
      try {
        await loadStateRef.current();
      } finally {
        detachPageLifecycle();
      }
      return false;
    }
    try {
      const response = await fetch(
        `/api/services/editron/projects/${projectId}/save`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: mutationPayload(body, expectedRevision),
          signal: controller.signal,
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (!isProjectRevision(data.revision)) {
          throw new Error(
            "Manual save response omitted its ProjectRevisionV1 receipt.",
          );
        }
        updateRevision(data.revision);
        lastSavedStateRef.current = body;
        callbacksRef.current.onSave?.();
        return true;
      } else if (response.status === 409) {
        await loadStateRef.current();
        return false;
      } else {
        console.error("Manual save failed:", await response.text());
        return false;
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return false;
      console.error("Manual save failed:", error);
      return false;
    } finally {
      detachPageLifecycle();
    }
  }, [projectId, updateRevision, userId]);

  // Function to manually load state
  const loadState = useCallback(async () => {
    if (!userId) {
      console.error("User not authenticated");
      return null;
    }

    loadControllerRef.current?.abort();
    const controller = new AbortController();
    const detachPageLifecycle = bindAbortToPageLifecycle(controller);
    loadControllerRef.current = controller;
    hasLoadedRef.current = false;

    try {
      const response = await fetch(
        `/api/services/editron/projects/${projectId}`,
        {
          signal: controller.signal,
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.project) {
          const revision = projectRevisionFromLoadedProject(data.project);
          if (!revision) {
            throw new Error("PROJECT_LOAD_INVALID_REVISION");
          }
          updateRevision(revision);
          const loadedState = {
            overlays: data.project.overlays,
            aspectRatio: data.project.aspectRatio,
            playerDimensions: data.project.playerDimensions,
            fps: data.project.fps,
            durationInFrames: data.project.durationInFrames,
            // Must mirror editorState's keys or the snapshot compare always
            // diffs → autosave storm. Default [] when the project has none.
            markers: data.project.markers ?? [],
          };

          // Seed the last-saved snapshot so the very next autosave tick
          // does NOT see a diff and immediately overwrite.
          lastSavedStateRef.current = serializeEditorStateForSave(loadedState);

          // Mark initial load as done — autosave is now safe to run.
          hasLoadedRef.current = true;

          callbacksRef.current.onLoad?.(loadedState);
          return loadedState;
        }
      }
      if (response.status === 404) {
        throw new Error("PROJECT_NOT_FOUND");
      }
      if (!response.ok) {
        throw new Error(`PROJECT_LOAD_FAILED_${response.status}`);
      }
      throw new Error("PROJECT_LOAD_INVALID_RESPONSE");
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return null;
      if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
        throw error;
      }
      console.error("Load failed:", error);
      return null;
    } finally {
      detachPageLifecycle();
      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null;
      }
    }
  }, [projectId, updateRevision, userId]);

  loadStateRef.current = loadState;

  return {
    saveState,
    loadState,
    projectRevision,
  };
};
