"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IdeationStage } from "./stages/IdeationStage";
import { CanvasStage } from "./stages/CanvasStage";
import { InitialTaskData } from './ClickatronLayout';
import { useCanvasStore } from "@/stores/useCanvasStore";

type WorkflowStage = "ideation" | "canvas";

interface ClickatronLabProps {
  initialTaskData: InitialTaskData;
  onReset: () => void;
}

const stageTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.5, ease: "easeOut" } as any,
};

export function ClickatronLab({ initialTaskData, onReset }: ClickatronLabProps) {
  const [stage, setStage] = useState<WorkflowStage>("ideation");
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const createVariation = useCanvasStore.getState().createVariation;

  const handleIdeationComplete = useCallback(async (data: { selectedDirection: string }) => {
    console.log('Ideation complete. Transitioning to canvas with direction:', data.selectedDirection);
    setSelectedDirection(data.selectedDirection);
    setStage("canvas");

    // Automatically trigger the first variation generation
    setIsGenerating(true);
    try {
      await createVariation({
        prompt: `Initial variation for ${initialTaskData.videoIdea} with a ${data.selectedDirection} style.`,
      });
    } catch (error) {
      console.error("Failed to generate initial variation:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [initialTaskData.videoIdea, createVariation]);

  const handleGenerativeEdit = async (prompt: string, settings: any) => {
    setIsGenerating(true);
    try {
      await createVariation({ prompt, ...settings });
    } catch (error) {
      console.error("Failed to generate variation:", error);
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleCanvasComplete = (data: { finalThumbnail: string }) => {
    console.log("Canvas complete, final thumbnail:", data.finalThumbnail);
    // Potentially call onReset or navigate away
    onReset();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-zinc-400">Initializing canvas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Start
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-medium text-zinc-200 truncate">
            {initialTaskData.videoIdea}
          </h1>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {stage === "ideation" && (
          <motion.div key="ideation" {...stageTransition}>
            <IdeationStage
              videoIdea={initialTaskData.videoIdea}
              selectedPreset={initialTaskData.selectedPreset}
              onComplete={handleIdeationComplete}
            />
          </motion.div>
        )}
        
        {stage === "canvas" && selectedDirection && (
          <motion.div key="canvas" {...stageTransition}>
            <CanvasStage
              videoIdea={initialTaskData.videoIdea}
              selectedPreset={initialTaskData.selectedPreset}
              selectedDirection={selectedDirection}
              onGenerativeEdit={handleGenerativeEdit}
              onComplete={handleCanvasComplete}
              isGenerating={isGenerating}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
