"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { EditorImportAnimation } from "../EditronImportAnimation";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface PipelineProgressPanelProps {
  pipeline: UseExportPipelineReturn;
}

/** Inline step indicator for the progress list */
function StepIndicator({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      {done ? (
        <Check className="h-3.5 w-3.5 text-[#5EC97E] shrink-0" />
      ) : active ? (
        <Loader2 className="h-3.5 w-3.5 text-[#D4A652] animate-spin shrink-0" />
      ) : (
        <div className="h-3.5 w-3.5 rounded-full border border-[#282724] shrink-0" />
      )}
      <span
        className={
          done
            ? "text-[#5F5E5A] line-through"
            : active
              ? "text-[#ECE9E1] font-medium"
              : "text-[#5F5E5A]"
        }
      >
        {label}
      </span>
    </div>
  );
}

export function PipelineProgressPanel({ pipeline }: PipelineProgressPanelProps) {
  const {
    step,
    scenes,
    generateStoryboard,
    generateVideos,
    videoProgress,
    detectedProfile,
    selectedProfileId,
    directorProgress,
    error,
  } = pipeline;

  // Determine the animation step to pass to EditorImportAnimation
  const animStep =
    step === "exporting" || step === "finalizing"
      ? "exporting"
      : "storyboard";

  // Step description text
  const descriptionText = (() => {
    switch (step) {
      case "exporting":
        return "Parsing scenes and building timeline...";
      case "extracting-subjects":
        return "AI is identifying characters, locations, and key subjects...";
      case "generating-references":
        return "Generating reference images for visual consistency...";
      case "storyboard":
        return `Generating storyboard images for ${scenes.length} scenes...`;
      case "generating-videos":
        return "Animating storyboard images into video clips — this takes a few minutes...";
      case "generating-voiceover":
        return "Generating AI voiceover narration...";
      case "finalizing":
        return "Assembling your video project with music & voiceover...";
      case "directing":
        return `Applying edit profile: ${detectedProfile?.name || "auto"}...`;
      default:
        return "";
    }
  })();

  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="py-2 space-y-4"
    >
      {/* Timeline animation */}
      <EditorImportAnimation
        sceneCount={scenes.length || 4}
        step={animStep}
      />

      {/* Step progress indicator list */}
      <div className="space-y-2">
        <StepIndicator
          label="Parse scenes"
          active={step === "exporting"}
          done={step !== "exporting"}
        />
        {generateStoryboard && (
          <>
            <StepIndicator
              label="Extract key subjects"
              active={step === "extracting-subjects"}
              done={
                ![
                  "exporting",
                  "extracting-subjects",
                ].includes(step)
              }
            />
            <StepIndicator
              label="Generate reference images"
              active={step === "generating-references"}
              done={
                ![
                  "exporting",
                  "extracting-subjects",
                  "generating-references",
                ].includes(step)
              }
            />
            <StepIndicator
              label="Generate storyboard images"
              active={step === "storyboard"}
              done={[
                "reviewing-storyboard",
                "generating-videos",
                "generating-voiceover",
                "finalizing",
                "done",
              ].includes(step)}
            />
          </>
        )}
        {generateStoryboard && generateVideos && (
          <StepIndicator
            label={
              step === "generating-videos" && videoProgress.total > 0
                ? `Generating video clips (${videoProgress.done}/${videoProgress.total})`
                : "Generate AI video clips"
            }
            active={step === "generating-videos"}
            done={["generating-voiceover", "finalizing", "done"].includes(step)}
          />
        )}
        <StepIndicator
          label="Generate AI voiceover"
          active={step === "generating-voiceover"}
          done={["finalizing", "directing", "done"].includes(step)}
        />
        <StepIndicator
          label="Create Editor project"
          active={step === "finalizing"}
          done={["directing", "done"].includes(step)}
        />
        {selectedProfileId && (
          <StepIndicator
            label="Apply edit profile"
            active={step === "directing"}
            done={step === "done"}
          />
        )}
      </div>

      {/* Description text */}
      <p className="text-[11px] text-[#5F5E5A] text-center">
        {descriptionText}
      </p>

      {/* Director progress detail */}
      {step === "directing" && directorProgress.desc && (
        <p className="text-[11px] text-[#7A776E] text-center">
          {directorProgress.desc}
        </p>
      )}

      {error && (
        <p className="text-[11px] text-[#D4A652] text-center mt-1">{error}</p>
      )}
    </motion.div>
  );
}
