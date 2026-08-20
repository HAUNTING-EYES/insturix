"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon, Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import useClickatronStore from "@/stores/useCanvasStore";
import {
  buildThinkToClickContext,
  buildVisibleContentClickatronCreativeSpec,
  findClickatronCreativeSpecInBlocks,
  MAX_CAROUSEL_SLIDES,
  MIN_CAROUSEL_SLIDES,
  type ThinkToClickContext,
} from "@/lib/thinkforge/clickatron-context";
import {
  buildThinkToClickHandoffState,
  type ThinkToClickHandoffState,
  type ThinkToClickUserVisualChoices,
} from "@/lib/thinkforge/clickatron-handoff-state";
import { buildClickatronSessionFormData } from "@/lib/thinkforge/clickatron-session-payload";
import type { ThinkForgeBlock } from "@/lib/thinkforge/schemas/thinkforge-block";
import { ClickatronHandoffPanel } from "./ClickatronHandoffPanel";

interface ClickatronHandoffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: unknown[];
  sessionId?: string;
  scriptId?: string;
  title?: string;
}

export function ClickatronHandoffDialog({
  open,
  onOpenChange,
  blocks,
  sessionId,
  scriptId,
  title,
}: ClickatronHandoffDialogProps) {
  const createClickatronSession = useClickatronStore((state) => state.createSession);
  const [visualChoices, setVisualChoices] = useState<ThinkToClickUserVisualChoices>({});
  const [resolvedContext, setResolvedContext] = useState<ThinkToClickContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const setVisualChoice = useCallback((key: keyof ThinkToClickUserVisualChoices, value: string) => {
    setVisualChoices((prev) => ({
      ...prev,
      [key]: value.trim() || undefined,
    }));
  }, []);

  const localContext = useMemo<ThinkToClickContext | null>(() => {
    if (!sessionId) return null;
    try {
      const typedBlocks = blocks as ThinkForgeBlock[];
      const creativeSpec = findClickatronCreativeSpecInBlocks(typedBlocks)
        || buildVisibleContentClickatronCreativeSpec({
          sessionId,
          scriptId,
          blocks: typedBlocks,
          userVisualChoices: visualChoices,
          title,
          aspectRatio: visualChoices.aspectRatio,
        });
      return buildThinkToClickContext({
        sessionId,
        scriptId,
        creativeSpec,
        blocks: typedBlocks,
        userVisualChoices: visualChoices,
        title,
        aspectRatio: visualChoices.aspectRatio,
      });
    } catch {
      return null;
    }
  }, [blocks, scriptId, sessionId, title, visualChoices]);

  const resolveContext = useCallback(async (operation: "preview" | "commit" = "preview"): Promise<ThinkToClickContext | null> => {
    if (!sessionId) {
      setResolvedContext(null);
      setError("Cannot start Clickatron: ThinkForge session context is missing.");
      return null;
    }

    setContextLoading(true);
    setResolvedContext(null);
    setError("");
    try {
      const contextRes = await fetch("/api/services/thinkforge/clickatron-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          scriptId,
          operation,
          title,
          kind: visualChoices.kind,
          platform: visualChoices.platform,
          aspectRatio: visualChoices.aspectRatio,
          visualMode: visualChoices.visualMode,
          textDensity: visualChoices.textDensity,
          vibe: visualChoices.vibe,
          imageStyle: visualChoices.imageStyle,
          notes: visualChoices.notes,
          slideCount: visualChoices.slideCount,
          approvedVisualPlan: visualChoices.approvedVisualPlan,
          logoTreatment: visualChoices.logoTreatment,
          logoPlacement: visualChoices.logoPlacement,
          logoScale: visualChoices.logoScale,
        }),
      });
      const contextData = await contextRes.json().catch(() => ({}));
      if (!contextRes.ok || !contextData.context) {
        throw new Error(contextData.error || `Failed to resolve ThinkForge context (${contextRes.status})`);
      }
      const context = contextData.context as ThinkToClickContext;
      setResolvedContext(context);
      return context;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resolve ThinkForge context.";
      setResolvedContext(null);
      setError(message);
      return null;
    } finally {
      setContextLoading(false);
    }
  }, [scriptId, sessionId, title, visualChoices]);

  useEffect(() => {
    if (!open) {
      setResolvedContext(null);
      setError("");
      return;
    }
    void resolveContext();
  }, [open, resolveContext]);

  const handoffState = useMemo<ThinkToClickHandoffState | null>(() => {
    const context = resolvedContext || localContext;
    if (!context) return null;
    try {
      return buildThinkToClickHandoffState({
        context,
        blocks: blocks as ThinkForgeBlock[],
        userVisualChoices: visualChoices,
      });
    } catch {
      return null;
    }
  }, [blocks, localContext, resolvedContext, visualChoices]);

  const canSend = Boolean(handoffState?.canSendToClickatron) && !contextLoading && !creating;

  const handleSend = async () => {
    setCreating(true);
    setError("");
    try {
      const context = await resolveContext("commit");
      if (!context) {
        return;
      }

      const latestState = buildThinkToClickHandoffState({
        context,
        blocks: blocks as ThinkForgeBlock[],
        userVisualChoices: visualChoices,
      });
      if (!latestState.canSendToClickatron) {
        const needsInput = latestState.requiredUserInput.length > 0
          ? ` Needs: ${latestState.requiredUserInput.join(", ")}.`
          : "";
        throw new Error(`${latestState.display.statusLabel}: ${latestState.display.readinessCopy}${needsInput}`);
      }

      const result = await createClickatronSession(buildClickatronSessionFormData(latestState));
      if (!result?.sessionId) {
        throw new Error("Clickatron session was not returned.");
      }

      window.location.href = `/dashboard/clickatron/lab/${result.sessionId}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Clickatron handoff failed: ${message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[88vh] overflow-y-auto text-[#ECE9E1] rounded-md sm:max-w-[680px]"
        style={{ background: "#131312", borderColor: "#282724" }}
      >
        <DialogHeader className="border-b px-4 py-3" style={{ borderColor: "#1C1B19" }}>
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 shrink-0 text-[#5CB8CC]" />
            <DialogTitle className="text-[14px] font-semibold text-[#ECE9E1]">
              Send to Clickatron
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Create a Clickatron session from the current ThinkForge script.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-4 py-4">
          {(visualChoices.kind || handoffState?.display.kind) === "carousel" && (
            <div className="flex items-center justify-between gap-3 border-b border-[#282724] pb-3">
              <label htmlFor="thinkforge-carousel-slide-count" className="text-[10px] font-semibold uppercase text-[#8B887F]">
                Slides
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="thinkforge-carousel-slide-count"
                  type="number"
                  min={MIN_CAROUSEL_SLIDES}
                  max={MAX_CAROUSEL_SLIDES}
                  step={1}
                  value={visualChoices.slideCount ?? handoffState?.display.slideCount ?? ""}
                  onChange={(event) => setVisualChoice("slideCount", event.target.value)}
                  className="h-8 w-16 rounded-[4px] border border-[#34322E] bg-[#0F0F0E] px-2 text-center text-[12px] text-[#ECE9E1] outline-none focus:border-[#D4A652]"
                  aria-label="Carousel slide count"
                />
                <button
                  type="button"
                  onClick={() => setVisualChoice("slideCount", "")}
                  className={`h-8 rounded-[4px] border px-3 text-[10px] font-semibold uppercase transition-colors ${
                    visualChoices.slideCount === undefined
                      ? "border-[#D4A652] text-[#D4A652]"
                      : "border-[#34322E] text-[#8B887F] hover:text-[#ECE9E1]"
                  }`}
                >
                  Auto
                </button>
              </div>
            </div>
          )}

          <ClickatronHandoffPanel
            handoffState={handoffState}
            visualChoices={visualChoices}
            setVisualChoice={setVisualChoice}
          />

          {contextLoading && (
            <p className="text-[11px] text-[#7A776E]">Checking handoff...</p>
          )}

          {error && (
            <p className="rounded border border-[#5A2828] bg-[#2A1111] px-3 py-2 text-[11px] leading-relaxed text-[#E06C75]">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => { void handleSend(); }}
            disabled={!canSend}
            className="flex w-full items-center justify-center gap-2 rounded-[4px] px-4 py-2.5 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: canSend ? "#D4A652" : "#2A2926",
              color: canSend ? "#0B0B0A" : "#7A776E",
            }}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {creating
              ? "Creating Session"
              : canSend
                ? (visualChoices.kind || handoffState?.display.kind) === "carousel" ? "Send Carousel" : "Send Post"
                : handoffState?.display.statusLabel || "Handoff unavailable"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
