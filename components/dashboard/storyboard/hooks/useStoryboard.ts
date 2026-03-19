"use client";

import { useState, useEffect, useCallback } from "react";
import type { Storyboard } from "@/lib/pipeline/schemas/storyboard";

/**
 * Hook for managing storyboard state with polling and mutations.
 * Uses native fetch + useState instead of React Query for simplicity.
 */
export function useStoryboard(storyboardId: string) {
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isVoiceoverGenerating, setIsVoiceoverGenerating] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);

  const BASE = `/api/services/pipeline/storyboard/${storyboardId}`;

  // Fetch storyboard data
  const fetchStoryboard = useCallback(async () => {
    try {
      const res = await fetch(BASE);
      const data = await res.json();
      if (data.success) {
        setStoryboard(data.storyboard);
        // Auto-select first scene if none selected
        if (data.storyboard.scenes?.length > 0 && selectedSceneIndex === null) {
          setSelectedSceneIndex(data.storyboard.scenes[0].sceneIndex);
        }
      } else {
        setError(data.error || "Failed to load storyboard");
      }
    } catch (e: any) {
      setError(e.message);
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
        }
      } catch (e) {
        console.error("Failed to approve scene:", e);
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
        }
      } catch (e) {
        console.error("Failed to reject scene:", e);
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
          setError(data.error);
        }
      } catch (e: any) {
        setError(e.message);
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
          setError(data.error);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsGenerating(false);
      }
    },
    [BASE, fetchStoryboard]
  );

  // Generate voiceover for all scenes
  const generateVoiceover = useCallback(
    async (voice: string = "aura-asteria-en") => {
      setIsVoiceoverGenerating(true);
      try {
        const res = await fetch(`${BASE}/voiceover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice }),
        });
        if (res.ok) {
          await fetchStoryboard();
        } else {
          const data = await res.json();
          setError(data.error);
        }
      } catch (e: any) {
        setError(e.message);
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
        const data = await res.json();
        if (data.success) {
          await fetchStoryboard();
          return data.summary;
        } else {
          setError(data.error);
          return null;
        }
      } catch (e: any) {
        setError(e.message);
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
        setError(data.error);
        return null;
      }
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setIsFinalizing(false);
    }
  }, [BASE]);

  return {
    storyboard,
    isLoading,
    error,
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
