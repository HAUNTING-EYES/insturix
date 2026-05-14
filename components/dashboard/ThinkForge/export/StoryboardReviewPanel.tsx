"use client";

import React from "react";
import { motion } from "framer-motion";
import { ImageIcon, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SceneCard } from "./SceneCard";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface StoryboardReviewPanelProps {
  pipeline: UseExportPipelineReturn;
}

export function StoryboardReviewPanel({ pipeline }: StoryboardReviewPanelProps) {
  const {
    storyboardScenes,
    generateVideos,
    setGenerateVideos,
    error,
    handlePhase3,
  } = pipeline;

  const generatedCount = storyboardScenes.filter(
    (s: any) => s.imageUrl,
  ).length;
  const failedCount = storyboardScenes.filter(
    (s: any) => !s.imageUrl,
  ).length;

  return (
    <motion.div
      key="review-storyboard"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="py-2 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <ImageIcon className="h-4 w-4 text-[#5EC97E]" />
        <p className="text-sm font-medium text-[#ECE9E1]">
          Review Storyboard ({generatedCount}/{storyboardScenes.length}{" "}
          generated)
        </p>
      </div>
      <p className="text-[11px] text-[#5F5E5A]">
        These images will be used as starting frames for AI video generation.
        Review them before proceeding.
      </p>

      {/* Scene grid */}
      <div className="grid grid-cols-3 gap-2 max-h-[360px] overflow-y-auto pr-1">
        {storyboardScenes.map((scene: any) => (
          <SceneCard
            key={scene.sceneIndex}
            scene={scene}
            pipeline={pipeline}
          />
        ))}
      </div>

      {/* Failed scenes warning */}
      {failedCount > 0 && (
        <p className="text-[11px] text-[#D4A652]">
          {failedCount} scene(s) failed to generate. Videos will only be created
          for successful scenes.
        </p>
      )}

      {error && <p className="text-sm text-[#D4A652]">{error}</p>}

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1C1B19]">
        <Button
          variant="ghost"
          onClick={() => {
            setGenerateVideos(false);
            handlePhase3();
          }}
          className="text-[#7A776E]"
        >
          Skip Videos & Finalize
        </Button>
        <Button
          onClick={() => handlePhase3()}
          className="bg-[#D4A652] hover:bg-[#D4A652]/90 text-[#0B0B0A] font-medium"
        >
          <ArrowRight className="h-4 w-4 mr-2" />
          {generateVideos
            ? `Generate ${generatedCount} Videos`
            : "Continue to Finalize"}
        </Button>
      </div>
    </motion.div>
  );
}
