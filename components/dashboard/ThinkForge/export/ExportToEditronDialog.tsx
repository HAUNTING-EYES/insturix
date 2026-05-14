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
        className={`${maxWidth} bg-[#0F0F0E] border-[#282724] text-[#ECE9E1]`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#ECE9E1] font-sans">
            <Video className="h-5 w-5 text-[#5EC97E]" />
            Export to Editor
          </DialogTitle>
          <DialogDescription className="text-[#7A776E]">
            {stepDescription()}
          </DialogDescription>
        </DialogHeader>

        {/* Stage progress header */}
        <ExportStageHeader currentStage={step} />

        {/* Panel switcher */}
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
      </DialogContent>
    </Dialog>
  );
}
