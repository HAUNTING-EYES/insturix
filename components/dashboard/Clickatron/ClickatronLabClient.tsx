"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IdeationStage } from "./stages/IdeationStage";
import { CanvasStage } from "./stages/CanvasStage";
import { useCanvasStore, TaskData } from "@/stores/useCanvasStore";
import { useRouter } from "next/navigation";

type WorkflowStage = "ideation" | "canvas";

interface ClickatronLabClientProps {
  initialData: {
    sessionId: string;
  };
}

const stageTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.5, ease: "easeOut" } as any,
};

export function ClickatronLabClient({ initialData }: ClickatronLabClientProps) {
  const router = useRouter();
  
  // Zustand store selectors
  const taskData = useCanvasStore((state) => state.taskData);
  const variations = useCanvasStore((state) => state.variations);
  const fetchBackendSession = useCanvasStore((state) => state.fetchBackendSession);
  const updateTaskData = useCanvasStore((state) => state.updateTaskData);
  const createVariation = useCanvasStore((state) => state.createVariation);
  const isLoading = useCanvasStore((state) => state.isLoading);
  const loadError = useCanvasStore((state) => state.loadError);

  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchBackendSession(initialData.sessionId);
  }, [initialData.sessionId, fetchBackendSession]);

  // Generate initial variation when canvas stage is reached and no variations exist
  useEffect(() => {
    if (taskData?.stage === 'canvas' && taskData.selectedDirection && variations.length === 0 && !isGenerating) {
      console.log('Canvas opened, generating initial variation');
      setIsGenerating(true);
      createVariation({
        prompt: `Initial variation for ${taskData.videoIdea} with a ${taskData.selectedDirection} style.`,
      }).catch((error) => {
        console.error("Failed to generate initial variation:", error);
      }).finally(() => {
        setIsGenerating(false);
      });
    }
  }, [taskData?.stage, taskData?.selectedDirection, taskData?.videoIdea, variations.length, isGenerating, createVariation]);
  
  const handleIdeationComplete = useCallback(async (data: { selectedDirection: string }) => {
    if (!taskData) return;

    console.log('Ideation complete. Updating session with direction:', data.selectedDirection);
    await updateTaskData({ stage: 'canvas', selectedDirection: data.selectedDirection });
  }, [taskData, updateTaskData]);

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
    router.push('/dashboard/clickatron');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading Clickatron Lab...</p>
        </div>
      </div>
    );
  }
  
  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">Could not load session</h2>
          <p className="text-zinc-400 text-sm">The requested session could not be found or has expired.</p>
          <Button onClick={() => router.push('/dashboard/clickatron')} className="mt-4">
            Go back
          </Button>
        </div>
      </div>
    );
  }

  if (!taskData) {
    return null; // or a more specific loading/error state
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/dashboard/clickatron')}
          className="text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-medium text-zinc-200 truncate">
            {taskData.videoIdea}
          </h1>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {taskData.stage === "ideation" && (
          <motion.div key="ideation" {...stageTransition}>
            <IdeationStage
              videoIdea={taskData.videoIdea}
              selectedPreset={taskData.selectedPreset}
              onComplete={handleIdeationComplete}
            />
          </motion.div>
        )}
        
        {taskData.stage === "canvas" && taskData.selectedDirection && (
          <motion.div key="canvas" {...stageTransition}>
            <CanvasStage
              videoIdea={taskData.videoIdea}
              selectedPreset={taskData.selectedPreset}
              selectedDirection={taskData.selectedDirection}
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
