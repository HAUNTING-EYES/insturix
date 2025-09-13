"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IdeationStage } from "./stages/IdeationStage";
import { CanvasStage } from "./stages/CanvasStage";
import useClickatronStore from "@/stores/useCanvasStore";
import { useRouter } from "next/navigation";
import { Idea } from "@/types/clickatron";

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
  const { task, loadSession, selectIdea } = useClickatronStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (initialData?.sessionId) {
      setIsLoading(true);
      loadSession(initialData.sessionId).finally(() => setIsLoading(false));
    }
  }, [initialData?.sessionId, loadSession]);

  const handleIdeationComplete = useCallback(async (idea: Idea, modelId?: string) => {
    if (!task?._id) return;
    await selectIdea(task._id, idea, modelId);
  }, [task?._id, selectIdea]);

  const handleCanvasComplete = useCallback(() => {
    router.push('/dashboard/clickatron');
  }, [router]);

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

  if (!task) {
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
  
  const currentStage = task.details.canvas ? 'canvas' : 'ideation';

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
            {task.details.videoIdea}
          </h1>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {currentStage === "ideation" && (
            <motion.div key="ideation" {...stageTransition}>
            <IdeationStage
              ideas={task.details.ideas || []}
              onSelectIdea={handleIdeationComplete}
            />
          </motion.div>
        )}

        {currentStage === "canvas" && (
          <motion.div key="canvas" {...stageTransition}>
            <CanvasStage
              videoIdea={task.details.videoIdea}
              onComplete={handleCanvasComplete}
              isGenerating={false}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
