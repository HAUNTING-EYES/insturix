"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CanvasStage } from "./stages/CanvasStage";
import useClickatronStore from "@/stores/useCanvasStore";
import { useRouter } from "next/navigation";

interface ClickatronLabClientProps {
  initialData: {
    sessionId: string;
  };
}

const stageTransition = {
  initial: { opacity: 0, x: 0 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 0 },
  transition: { duration: 0.5, ease: "easeOut" } as any,
};

export function ClickatronLabClient({ initialData }: ClickatronLabClientProps) {
  const router = useRouter();
  const { task, loadSession } = useClickatronStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (initialData?.sessionId) {
      setIsLoading(true);
      loadSession(initialData.sessionId).finally(() => setIsLoading(false));
    }
  }, [initialData?.sessionId, loadSession]);

  const handleCanvasComplete = () => {
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

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div key="canvas" {...stageTransition}>
        <CanvasStage
          videoIdea={task.details.videoIdea}
          onComplete={handleCanvasComplete}
          isGenerating={false}
        />
      </motion.div>
    </div>
  );
}
