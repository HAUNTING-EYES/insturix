"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Storyboard } from "@/lib/pipeline/schemas/storyboard";

/**
 * Hook for managing storyboard state with polling and mutations.
 * Uses native fetch + useState instead of React Query for simplicity.
 *
 * Error model (2026-08 audit): `error` is FATAL — the storyboard could not be
 * loaded and there is nothing to render. `actionError` is NON-FATAL — a
 * mutation (regenerate/voiceover/videos/finalize, incl. insufficient credits)
 * or a background poll failed while a loaded storyboard is on screen. The two
 * used to share one state, so any mutation failure unmounted the entire
 * workspace into a dead-end "Go Back" screen with no recovery.
 */
export function useStoryboard(storyboardId: string) {
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isVoiceoverGenerating, setIsVoiceoverGenerating] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);

  const BASE = `/api/services/pipeline/storyboard/${storyboardId}`;

  // Fetch storyboard data. A failure BEFORE first load is fatal; a failure of
  // a background poll AFTER load must not nuke the on-screen workspace.
  const fetchStoryboard = useCallback(async () => {
    try {
      const res = await fetch(BASE);
      const data = await res.json();
      if (data.success) {
        hasLoadedRef.current = true;
        setError(null);
        setStoryboard(data.storyboard);
        // Auto-select first scene if none selected
        if (data.storyboard.scenes?.length > 0 && selectedSceneIndex === null) {
          setSelectedSceneIndex(data.storyboard.scenes[0].sceneIndex);
        }
      } else {
        const msg = data.error || "Failed to load storyboard";
        if (hasLoadedRef.current) setActionError(msg); else setError(msg);
      }
    } catch (e: any) {
      if (hasLoadedRef.current) setActionError(e.message); else setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [BASE, selectedSceneIndex]);

  // Initial fetch
  useEffect(() => {
    fetchStoryboard();
  }, []);

  // Poll while any scene is generating
  useEffect(() => {
    const hasGenerating = storyboard?.scenes?.some(
      (s) => s.status === "generating"
    );
    const voiceoverGenerating =
      storyboard?.voiceoverConfig?.status === "generating";

    if (!hasGenerating && !voiceoverGenerating) return;

    const interval = setInterval(fetchStoryboard, 3000);
    return () => clearInterval(interval);
  }, [storyboard, fetchStoryboard]);

  // Approve a scene
  const approveScene = useCallback(
    async (sceneIndex: number) => {
      try {
        const res = await fetch(`${BASE}/scene/${sceneIndex}/approve`, {
          method: "POST",
        });
        if (res.ok) {
          await fetchStoryboard();
        } else {
          const data = await res.json().catch(() => ({}));
          setActionError(data.error || `Approve failed (${res.status})`);
        }
      } catch (e: any) {
        setActionError(`Approve failed: ${e.message}`);
      }
    },
    [BASE, fetchStoryboard]
  );

  // Reject a scene
  const rejectScene = useCallback(
    async (sceneIndex: number) => {
      try {
        const res = await fetch(`${BASE}/scene/${sceneIndex}/reject`, {
          method: "POST",
        });
        if (res.ok) {
          await fetchStoryboard();
        } else {
          const data = await res.json().catch(() => ({}));
          setActionError(data.error || `Reject failed (${res.status})`);
        }
      } catch (e: any) {
        setActionError(`Reject failed: ${e.message}`);
      }
    },
    [BASE, fetchStoryboard]
  );

  // Regenerate a scene with feedback (context-aware)
  const regenerateScene = useCallback(
    async (sceneIndex: number, feedback?: string) => {
      setIsRegenerating(true);
      try {
        const res = await fetch(
          `${BASE}/scene/${sceneIndex}/regenerate-with-context`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feedback }),
          }
        );
        if (res.ok) {
          await fetchStoryboard();
        } else {
          const data = await res.json();
          setActionError(data.error);
        }
      } catch (e: any) {
        setActionError(e.message);
      } finally {
        setIsRegenerating(false);
      }
    },
    [BASE, fetchStoryboard]
  );

  // Generate the next scene in sequential flow
  const generateNextScene = useCallback(
    async (sceneIndex: number) => {
      setIsGenerating(true);
      try {
        const res = await fetch(`${BASE}/generate-sequential`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneIndex }),
        });
        if (res.ok) {
          setSelectedSceneIndex(sceneIndex);
          await fetchStoryboard();
        } else {
          const data = await res.json();
          setActionError(data.error);
        }
      } catch (e: any) {
        setActionError(e.message);
      } finally {
        setIsGenerating(false);
      }
    },
    [BASE, fetchStoryboard]
  );

  // Generate voiceover for all scenes
  const generateVoiceover = useCallback(
    async (voice: string = "aura-asteria-en", contentType?: string) => {
      setIsVoiceoverGenerating(true);
      try {
        const res = await fetch(`${BASE}/voiceover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice, contentType }),
        });
        if (res.ok) {
          await fetchStoryboard();
        } else {
          const data = await res.json();
          setActionError(data.error);
        }
      } catch (e: any) {
        setActionError(e.message);
      } finally {
        setIsVoiceoverGenerating(false);
      }
    },
    [BASE, fetchStoryboard]
  );

  // Generate AI video clips for approved scenes
  const generateVideos = useCallback(
    async (provider?: 'fal-ai' | 'kie-ai') => {
      setIsVideoGenerating(true);
      try {
        const res = await fetch(`${BASE}/generate-videos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.success) {
          await fetchStoryboard();
          return data.summary;
        } else {
          // H9 FIX: Include HTTP status and response details in error for debugging
          const errorDetail = [
            data.error || 'Video generation failed',
            res.status !== 200 ? `(HTTP ${res.status})` : '',
            data.batchId ? `[batch: ${data.batchId}]` : '',
            data.partialFailure ? '(partial failure)' : '',
          ].filter(Boolean).join(' ');
          setActionError(errorDetail);
          return null;
        }
      } catch (e: any) {
        setActionError(`Video generation request failed: ${e.message}`);
        return null;
      } finally {
        setIsVideoGenerating(false);
      }
    },
    [BASE, fetchStoryboard]
  );

  // Finalize storyboard into Editron project
  const finalizeToEditron = useCallback(async () => {
    setIsFinalizing(true);
    try {
      const res = await fetch(`${BASE}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        return { projectId: data.projectId };
      } else {
        setActionError(data.error);
        return null;
      }
    } catch (e: any) {
      setActionError(e.message);
      return null;
    } finally {
      setIsFinalizing(false);
    }
  }, [BASE]);

  return {
    storyboard,
    isLoading,
    error,
    actionError,
    clearActionError: () => setActionError(null),
    selectedSceneIndex,
    setSelectedSceneIndex,
    approveScene,
    rejectScene,
    regenerateScene,
    generateNextScene,
    generateVoiceover,
    generateVideos,
    finalizeToEditron,
    isGenerating,
    isRegenerating,
    isVoiceoverGenerating,
    isVideoGenerating,
    isFinalizing,
    refetch: fetchStoryboard,
  };
}
