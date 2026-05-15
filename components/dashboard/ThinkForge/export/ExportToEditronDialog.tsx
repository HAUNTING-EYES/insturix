"use client";

import React from "react";
import { AnimatePresence } from "framer-motion";
import { Video } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useExportPipeline } from "./hooks/useExportPipeline";
import { isProcessingStage } from "./types";
import { ExportStageHeader } from "./ExportStageHeader";
import { ExportConfigPanel } from "./ExportConfigPanel";
import { ProfileSelectionPanel } from "./ProfileSelectionPanel";
import { ReferenceImagePanel } from "./ReferenceImagePanel";
import { StoryboardReviewPanel } from "./StoryboardReviewPanel";
import { PipelineProgressPanel } from "./PipelineProgressPanel";
import { ExportCompletePanel } from "./ExportCompletePanel";

/* ── Film Strip sprocket pattern (left/right edges of dialog) ── */
const sprocketStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 18,
  zIndex: 20,
  pointerEvents: "none",
  background:
    "repeating-linear-gradient(to bottom, transparent 0px, transparent 8px, #1B1A18 8px, #1B1A18 14px, transparent 14px, transparent 22px)",
};

interface ExportToEditronDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: any[];
  plainText?: string;
  sessionId?: string;
  scriptId?: string;
}

export function ExportToEditronDialog({
  open,
  onOpenChange,
  blocks,
  plainText,
  sessionId,
  scriptId,
}: ExportToEditronDialogProps) {
  const pipeline = useExportPipeline(
    { blocks, plainText, sessionId, scriptId },
    open,
    onOpenChange,
  );

  const { step, stepDescription, handleClose } = pipeline;

  // Wider dialog for reference review step
  const maxWidth =
    step === "reviewing-references"
      ? "sm:max-w-[600px]"
      : "sm:max-w-[520px]";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={`${maxWidth} text-[#ECE9E1] p-0 overflow-visible`}
        style={{
          background: "#131312",
          borderColor: "#282724",
          borderRadius: 4,
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onPointerDownOutside={(e) => {
          // Prevent closing when clicking the scrollbar
          const target = e.target as HTMLElement;
          if (target.closest("[data-radix-scroll-area-viewport]") || target.tagName === "HTML") {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          // Also prevent close on interact-outside for scrollbar
          const target = e.target as HTMLElement;
          if (target.closest("[data-radix-scroll-area-viewport]") || target.tagName === "HTML") {
            e.preventDefault();
          }
        }}
      >
        {/* Left sprocket strip */}
        <div
          style={{
            ...sprocketStyle,
            left: 0,
            borderRight: "1px solid #1C1B19",
          }}
        />
        {/* Right sprocket strip */}
        <div
          style={{
            ...sprocketStyle,
            right: 0,
            borderLeft: "1px solid #1C1B19",
          }}
        />

        {/* Custom scrollbar styles */}
        <style dangerouslySetInnerHTML={{ __html: `
          .export-scroll::-webkit-scrollbar { width: 4px; }
          .export-scroll::-webkit-scrollbar-track { background: transparent; }
          .export-scroll::-webkit-scrollbar-thumb { background: #282724; border-radius: 4px; }
          .export-scroll::-webkit-scrollbar-thumb:hover { background: #D4A652; }
          .export-scroll { scrollbar-width: thin; scrollbar-color: #282724 transparent; }
        `}} />

        {/* Film inner content (inset from sprockets) */}
        <div style={{ margin: "0 18px", position: "relative", zIndex: 10 }}>
          <DialogHeader
            className="flex flex-row items-center gap-2.5 border-b px-4 py-2.5 sticky top-0 z-20"
            style={{ borderColor: "#1C1B19", background: "#131312" }}
          >
            <Video className="h-[18px] w-[18px] text-[#B5B2A8] shrink-0" />
            <DialogTitle
              className="text-[15px] font-semibold text-[#ECE9E1] font-sans"
              style={{ lineHeight: 1.3 }}
            >
              Export to Editor
            </DialogTitle>
            <DialogDescription className="sr-only">
              {stepDescription()}
            </DialogDescription>
          </DialogHeader>

          {/* Visible subtitle below header */}
          <p
            className="text-[11px] px-4 sticky top-[48px] z-20"
            style={{ color: "#7A776E", background: "#131312", paddingBottom: 2 }}
          >
            {stepDescription()}
          </p>

          {/* Film Strip Pipeline Bar */}
          <div className="sticky top-[66px] z-20" style={{ background: "#131312" }}>
            <ExportStageHeader currentStage={step} />
          </div>

          {/* Body — scrollable content */}
          <div className="px-4 pb-3 pt-1">
            <AnimatePresence mode="wait">
              {step === "configure" && (
                <ExportConfigPanel
                  pipeline={pipeline}
                  blocksCount={blocks.length}
                />
              )}

              {step === "profile-selection" && (
                <ProfileSelectionPanel pipeline={pipeline} />
              )}

              {step === "reviewing-references" && (
                <ReferenceImagePanel pipeline={pipeline} />
              )}

              {step === "reviewing-storyboard" && (
                <StoryboardReviewPanel pipeline={pipeline} />
              )}

              {isProcessingStage(step) && (
                <PipelineProgressPanel pipeline={pipeline} />
              )}

              {step === "done" && (
                <ExportCompletePanel pipeline={pipeline} />
              )}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
