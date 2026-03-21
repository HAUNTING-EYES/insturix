"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  RefreshCw,
  Check,
  X,
  Eye,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { useEditorContext } from "../../contexts/editor-context";
import { useToast } from "@/hooks/editron/use-toast";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Suggestion {
  id: string;
  type: "silence" | "filler" | "no_bgm" | "no_captions" | "audio_peaks";
  icon: string;
  title: string;
  description: string;
  actionPrompt: string;
  meta: Record<string, any>;
}

type SuggestionStatus = "pending" | "applying" | "applied" | "dismissed";

interface SuggestionState extends Suggestion {
  status: SuggestionStatus;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AISuggestionsPanel() {
  const { overlays, playerRef, saveProject } = useEditorContext();
  const { toast } = useToast();

  const projectId =
    typeof window !== "undefined"
      ? window.location.pathname.split("/").pop() || "default"
      : "default";

  const [suggestions, setSuggestions] = useState<SuggestionState[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [analyzedVideos, setAnalyzedVideos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const autoRanRef = useRef(false);

  /* ---- Fetch suggestions from the API ---- */
  const runAnalysis = useCallback(async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setError(null);

    // Force-save first so the API sees the latest state
    if (saveProject) {
      try {
        await saveProject();
      } catch {
        // non-critical
      }
    }

    try {
      const res = await fetch("/api/services/editron/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Analysis failed (${res.status})`);
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Analysis returned unsuccessful result");
      }

      const incoming: Suggestion[] = data.suggestions || [];
      setAnalyzedVideos(data.analyzedVideos || 0);

      // Filter out previously-dismissed suggestions by type
      const filtered = incoming.filter(
        (s) => !dismissedRef.current.has(s.type)
      );

      setSuggestions(
        filtered.map((s) => ({ ...s, status: "pending" as SuggestionStatus }))
      );
      setHasAnalyzed(true);

      if (filtered.length === 0 && incoming.length === 0) {
        toast({
          title: "Analysis complete",
          description: "No issues found -- your video looks great!",
        });
      }
    } catch (err: any) {
      console.error("[AISuggestionsPanel] analysis error:", err);
      setError(err.message);
      toast({
        title: "Analysis failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, projectId, saveProject, toast]);

  /* ---- Auto-run once when the panel mounts (project loaded) ---- */
  useEffect(() => {
    const hasVideos = overlays.some(
      (o: any) => o.type === "video" && o.assetId
    );
    if (hasVideos && !hasAnalyzed && !autoRanRef.current) {
      autoRanRef.current = true;
      runAnalysis();
    }
  }, [overlays, hasAnalyzed, runAnalysis]);

  /* ---- Accept a suggestion -> send prompt to AI chat ---- */
  const acceptSuggestion = useCallback(
    async (id: string) => {
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "applying" } : s))
      );

      const suggestion = suggestions.find((s) => s.id === id);
      if (!suggestion) return;

      try {
        // First, ensure a chat session exists
        const listRes = await fetch(
          `/api/services/editron/chat/sessions/list?projectId=${projectId}`
        );
        const listData = await listRes.json();

        let sessionId: string;

        if (listData.success && listData.sessions?.length > 0) {
          sessionId = listData.sessions[0].sessionId;
        } else {
          // Create a new session
          const createRes = await fetch(
            "/api/services/editron/chat/sessions/create",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId }),
            }
          );
          const createData = await createRes.json();
          if (!createData.success) throw new Error("Failed to create chat session");
          sessionId = createData.sessionId;
        }

        // Send the action prompt through the streaming chat API
        const chatRes = await fetch("/api/services/editron/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: suggestion.actionPrompt,
            projectId,
            sessionId,
          }),
        });

        if (!chatRes.ok) {
          const errData = await chatRes.json().catch(() => ({}));
          throw new Error(errData.error || `Chat request failed (${chatRes.status})`);
        }

        // Consume the stream to completion
        const reader = chatRes.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }

        setSuggestions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "applied" } : s))
        );

        toast({
          title: "Suggestion applied",
          description: suggestion.title,
        });
      } catch (err: any) {
        console.error("[AISuggestionsPanel] apply error:", err);
        // Reset to pending so user can retry
        setSuggestions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "pending" } : s))
        );
        toast({
          title: "Failed to apply suggestion",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    [suggestions, projectId, toast]
  );

  /* ---- Dismiss a suggestion ---- */
  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) {
        dismissedRef.current.add(target.type);
      }
      return prev.map((s) =>
        s.id === id ? { ...s, status: "dismissed" } : s
      );
    });
  }, []);

  /* ---- Preview: seek the player to the first occurrence ---- */
  const previewSuggestion = useCallback(
    (suggestion: SuggestionState) => {
      if (!playerRef?.current) return;

      const segments = suggestion.meta?.segments;
      if (segments && segments.length > 0) {
        const firstFrame = segments[0].startFrame;
        if (typeof firstFrame === "number") {
          playerRef.current.seekTo(firstFrame);
          toast({ title: "Seeked to first occurrence" });
        }
      }
    },
    [playerRef, toast]
  );

  /* ---- Helpers ---- */
  const pendingSuggestions = suggestions.filter(
    (s) => s.status !== "dismissed"
  );
  const appliedCount = suggestions.filter((s) => s.status === "applied").length;

  /* ---- Styles for suggestion type ---- */
  const typeColors: Record<string, string> = {
    silence:
      "border-l-amber-500 bg-amber-500/5 hover:bg-amber-500/10",
    filler:
      "border-l-blue-500 bg-blue-500/5 hover:bg-blue-500/10",
    no_bgm:
      "border-l-purple-500 bg-purple-500/5 hover:bg-purple-500/10",
    no_captions:
      "border-l-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10",
    audio_peaks:
      "border-l-red-500 bg-red-500/5 hover:bg-red-500/10",
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="flex flex-col h-full">
      {/* ---- Header bar ---- */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-medium text-foreground">
            AI Suggestions
          </span>
          {pendingSuggestions.length > 0 && (
            <span className="text-[10px] rounded-full bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 font-medium">
              {pendingSuggestions.filter((s) => s.status === "pending").length}
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={runAnalysis}
          disabled={isAnalyzing}
          className="h-7 gap-1 text-xs"
        >
          {isAnalyzing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {isAnalyzing ? "Analyzing..." : "Re-scan"}
        </Button>
      </div>

      {/* ---- Body ---- */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Loading state */}
          {isAnalyzing && !hasAnalyzed && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-yellow-500" />
              <p className="text-sm">Analyzing your video...</p>
              <p className="text-xs text-muted-foreground/70">
                Checking for silences, filler words, and more
              </p>
            </div>
          )}

          {/* Error state */}
          {error && !isAnalyzing && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-center">
              <p className="text-sm text-red-400 mb-2">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={runAnalysis}
                className="text-xs"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Empty state -- no videos */}
          {!isAnalyzing &&
            hasAnalyzed &&
            pendingSuggestions.length === 0 &&
            !error && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Check className="h-8 w-8 text-green-500" />
                <p className="text-sm font-medium text-foreground">
                  All clear!
                </p>
                <p className="text-xs text-center max-w-[200px]">
                  {appliedCount > 0
                    ? `${appliedCount} suggestion${appliedCount > 1 ? "s" : ""} applied.`
                    : "No issues found in your video."}{" "}
                  {analyzedVideos > 0 &&
                    `Scanned ${analyzedVideos} video${analyzedVideos > 1 ? "s" : ""}.`}
                </p>
              </div>
            )}

          {/* Not-yet-analyzed state */}
          {!isAnalyzing && !hasAnalyzed && !error && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Sparkles className="h-8 w-8 text-yellow-500/50" />
              <p className="text-sm text-center max-w-[220px]">
                Run AI analysis to get smart suggestions for improving your
                video.
              </p>
              <Button
                onClick={runAnalysis}
                size="sm"
                className="gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Analyze Video
              </Button>
            </div>
          )}

          {/* ---- Suggestion cards ---- */}
          {pendingSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              colorClass={typeColors[suggestion.type] || ""}
              onAccept={acceptSuggestion}
              onDismiss={dismissSuggestion}
              onPreview={previewSuggestion}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ================================================================ */
/*  SuggestionCard                                                    */
/* ================================================================ */

function SuggestionCard({
  suggestion,
  colorClass,
  onAccept,
  onDismiss,
  onPreview,
}: {
  suggestion: SuggestionState;
  colorClass: string;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onPreview: (s: SuggestionState) => void;
}) {
  const isApplying = suggestion.status === "applying";
  const isApplied = suggestion.status === "applied";
  const hasPreview =
    suggestion.meta?.segments && suggestion.meta.segments.length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/50 border-l-[3px] p-3 transition-colors",
        isApplied ? "opacity-60 border-l-green-500 bg-green-500/5" : colorClass
      )}
    >
      {/* Title row */}
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-base leading-none mt-0.5" role="img">
          {suggestion.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">
            {suggestion.title}
          </p>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground mb-3 pl-6">
        {suggestion.description}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-1.5 pl-6">
        {isApplied ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-500 font-medium">
            <Check className="h-3 w-3" /> Applied
          </span>
        ) : (
          <>
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
              disabled={isApplying}
              onClick={() => onAccept(suggestion.id)}
            >
              {isApplying ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  Accept
                </>
              )}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              disabled={isApplying}
              onClick={() => onDismiss(suggestion.id)}
            >
              <X className="h-3 w-3" />
              Dismiss
            </Button>

            {hasPreview && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                disabled={isApplying}
                onClick={() => onPreview(suggestion)}
              >
                <Eye className="h-3 w-3" />
                Preview
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
