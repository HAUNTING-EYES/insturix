"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IdeationStage } from "./stages/IdeationStage";
import { CanvasStage } from "./stages/CanvasStage";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useAutoSave } from "@/hooks/useAutoSave";

type WorkflowStage = "ideation" | "canvas";

interface ClickatronLabProps {
  taskId: string;
}

const stageTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.5, ease: "easeOut" } as any,
};

export function ClickatronLab({ taskId }: ClickatronLabProps) {
  const router = useRouter();

  // Zustand store
  const taskData = useCanvasStore((state) => state.taskData);
  const isLoading = useCanvasStore((state) => state.isLoading);
  const isGenerating = useCanvasStore((state) => state.isGenerating);
  const loadTaskData = useCanvasStore((state) => state.loadTaskData);
  const updateTaskData = useCanvasStore((state) => state.updateTaskData);
  const setIsGenerating = useCanvasStore((state) => state.setIsGenerating);
  const loadError = useCanvasStore((state) => state.loadError);
  
  // Backend sync methods
  const sessionId = useCanvasStore((state) => state.sessionId);
  const backendSynced = useCanvasStore((state) => state.backendSynced);
  const isDirty = useCanvasStore((state) => state.isDirty);
  const syncError = useCanvasStore((state) => state.syncError);
  const createBackendSession = useCanvasStore((state) => state.createBackendSession);
  const fetchBackendSession = useCanvasStore((state) => state.fetchBackendSession);
  const createVariation = useCanvasStore((state) => state.createVariation);
  const updateVariation = useCanvasStore((state) => state.updateVariation);
  const commitVariation = useCanvasStore((state) => state.commitVariation);
  const addVariation = useCanvasStore((state) => state.addVariation);
  const setActiveVariation = useCanvasStore((state) => state.setActiveVariation);

  // Auto-save hook
  useAutoSave(true);

  // Derive effective stage early so hook order is stable even during loading renders
  const hasDirection = !!taskData?.selectedDirection;
  const effectiveStage: WorkflowStage = hasDirection
    ? "canvas"
    : (taskData?.stage as WorkflowStage) || "ideation";

  // Removed mock starter variation seeding; backend variations are authoritative

  // Load task data on mount with backend integration
  useEffect(() => {
    const loadTaskWithBackend = async () => {
      useCanvasStore.getState().setIsLoading(true);
      
      try {
        // Check if taskId looks like a Mongo ObjectId (legacy task)
        const isLegacyTask = /^[a-f\d]{24}$/i.test(taskId);
        
        if (isLegacyTask) {
          // Try to fetch existing session from backend
          try {
            const session = await fetchBackendSession(taskId);
            useCanvasStore.getState().setSessionId(taskId);
            useCanvasStore.getState().setBackendSynced(true);
          } catch (error) {
            console.warn('Failed to fetch backend session, using local storage:', error);
            // Fall back to local loading
            await loadTaskData(taskId);
          }
        } else {
          // New session - create it in the backend
          try {
            const newSessionId = await createBackendSession({
              clerkUserId: '', // Will be set by auth
              videoIdea: 'New Session',
            });
            useCanvasStore.getState().setSessionId(newSessionId);
            useCanvasStore.getState().setBackendSynced(true);
          } catch (error) {
            console.warn('Failed to create backend session, using local storage:', error);
            // Fall back to local loading
            await loadTaskData(taskId);
          }
        }
      } catch (error) {
        console.error('Failed to load task:', error);
        useCanvasStore.getState().setSyncError('Failed to load task');
      } finally {
        useCanvasStore.getState().setIsLoading(false);
      }
    };
    
    loadTaskWithBackend();
  }, [taskId, loadTaskData, fetchBackendSession, createBackendSession]);

  const handleStageComplete = async (stage: WorkflowStage, data: any) => {
    switch (stage) {
      case "ideation":
        await updateTaskData({
          selectedDirection: data.selectedDirection,
          stage: "canvas",
        });
        // Persist workflow update to backend if session exists
        if (sessionId) {
          try {
            await fetch(`/api/services/clickatron/session/${sessionId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workflow: { selectedDirection: data.selectedDirection, stage: 'canvas' } }),
            });
          } catch (e) {
            console.error('Failed to persist workflow stage transition:', e);
          }
        }
        break;
      case "canvas":
        // Final stage - could save to history, etc.
        console.log("Canvas stage complete:", data);
        break;
    }
  };

  const handleGenerativeEdit = async (prompt: string, settings: any) => {
    if (!sessionId) {
      console.error('No session ID available for variation generation');
      return;
    }

    setIsGenerating(true);
    
    try {
      // Create variation via API
      const variationId = await createVariation({
        sessionId,
        prompt,
        fineTuning: settings,
      });
      
      // Optimistically add variation to store
      const newVariation = {
        id: variationId,
        prompt,
        timestamp: Date.now(),
        status: 'generating' as const,
        fineTuning: settings,
      };
      
      addVariation(newVariation);
      setActiveVariation(variationId);
      
      // Poll for completion (simple interval, no artificial delay beyond backend simulation)
      const start = Date.now();
      const poll = async () => {
        try {
          const response = await fetch(`/api/services/clickatron/session/${sessionId}/variation/${variationId}`);
          if (!response.ok) throw new Error('Status fetch failed');
          const data = await response.json();
          if (data.status === 'completed' || data.status === 'failed') {
            const updatedVariation = {
              ...newVariation,
              status: data.status,
              imageRef: data.imageRef,
            } as any;
            useCanvasStore.getState().removeVariation(variationId);
            addVariation(updatedVariation);
            setActiveVariation(variationId);
            setIsGenerating(false);
            return; // stop polling
          }
          // Continue polling every 1s, with a max timeout of 60s
          if (Date.now() - start < 60000) {
            setTimeout(poll, 1000);
          } else {
            console.warn('Variation generation timeout');
            setIsGenerating(false);
          }
        } catch (err) {
          console.error('Polling error:', err);
          setIsGenerating(false);
        }
      };
      poll();
      
    } catch (error) {
      console.error('Error creating variation:', error);
      setIsGenerating(false);
    }
  };

  const handleBack = async () => {
    if (!taskData) return;

    switch (taskData.stage) {
      case "canvas":
        await updateTaskData({ stage: "ideation" });
        break;
      default:
        router.push("/dashboard/clickatron");
    }
  };

  if (isLoading || !taskData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading creative lab...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    const messages: Record<string, { title: string; desc: string }> = {
      not_found: { title: 'Session Not Found', desc: 'This task does not exist or you do not have access.' },
      invalid: { title: 'Invalid Session Data', desc: 'Stored data is incomplete or corrupt.' },
      error: { title: 'Load Error', desc: 'An unexpected error occurred while loading the session.' },
    };
    const msg = messages[loadError] || messages.error;
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">{msg.title}</h2>
          <p className="text-zinc-400 mb-4">{msg.desc}</p>
          <Button onClick={() => router.push('/dashboard/clickatron')} variant="secondary" size="sm">Return Home</Button>
        </div>
      </div>
    );
  }
  console.log('Rendering stage (effective):', effectiveStage, 'raw stage:', taskData.stage, 'data:', taskData);

  return (
    <div className="space-y-6">
      {/* Header with back navigation */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {effectiveStage === "ideation" ? "Back to Home" : "Previous Step"}
        </Button>

        <div className="flex-1">
          <h1 className="text-lg font-medium text-zinc-200 truncate">
            {taskData.videoIdea}
          </h1>
          <div className="flex items-center gap-2 mt-1">
    {(["ideation", "canvas"] as const).map((stage, index) => (
              <div
                key={stage}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
      effectiveStage === stage
                    ? "bg-purple-500"
                    : index <
        (["ideation", "canvas"] as const).indexOf(
          effectiveStage
                        )
                      ? "bg-purple-600/50"
                      : "bg-zinc-700"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Stage Content */}
      <AnimatePresence mode="wait">
  {effectiveStage === "ideation" && (
          <motion.div key="ideation" {...stageTransition}>
            <IdeationStage
              videoIdea={taskData.videoIdea}
              selectedPreset={taskData.selectedPreset}
              sessionId={sessionId}
              onComplete={(data) => handleStageComplete("ideation", data)}
            />
          </motion.div>
        )}
  {effectiveStage === "canvas" && taskData.selectedDirection && (
          <motion.div key="canvas" {...stageTransition}>
            <CanvasStage
              videoIdea={taskData.videoIdea}
              selectedDirection={taskData.selectedDirection!}
              selectedPreset={taskData.selectedPreset}
              referenceImage={taskData.referenceImage}
              onComplete={(data) => handleStageComplete("canvas", data)}
              onGenerativeEdit={handleGenerativeEdit}
              isGenerating={isGenerating}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
