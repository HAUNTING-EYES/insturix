"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IdeationStage } from './stages/IdeationStage';
import { CanvasStage } from './stages/CanvasStage';
import { StorageManager } from '@/lib/storage';


type WorkflowStage = 'ideation' | 'canvas';

interface TaskData {
  videoIdea: string;
  timestamp: number;
  stage: WorkflowStage;
  selectedDirection?: string;
  selectedPreset?: {
    id: string;
    name: string;
    aspectRatio: string;
    dimensions: string;
    promptText: string;
    placeholder: string;
  };
  referenceImage?: {
    name: string;
    size: number;
    type: string;
    data: string;
  } | null;
}

interface Clickatron2LabProps {
  taskId: string;
}

const stageTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.5, ease: "easeOut" } as any
};

export function Clickatron2Lab({ taskId }: Clickatron2LabProps) {
  const [taskData, setTaskData] = useState<TaskData | null>(null);
  const [currentStage, setCurrentStage] = useState<WorkflowStage>('ideation');
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Load task data from storage
    const loadTaskData = async () => {
      try {
        const data = await StorageManager.getItem(`clickatron2_${taskId}`);
        if (data) {
          setTaskData(data as TaskData);
          setCurrentStage(data.stage);
        } else {
          // If no data found, redirect back to main page
          router.push('/dashboard/clickatron2');
        }
      } catch (error) {
        console.error('Failed to load task data:', error);
        router.push('/dashboard/clickatron2');
      }
    };

    loadTaskData();
  }, [taskId, router]);

  const updateTaskData = async (updates: Partial<TaskData>) => {
    if (!taskData) return;
    
    const updatedData = { ...taskData, ...updates };
    setTaskData(updatedData);
    
    try {
      await StorageManager.setItem(`clickatron2_${taskId}`, updatedData);
    } catch (error) {
      console.error('Failed to update task data:', error);
    }
  };

  const handleStageComplete = async (stage: WorkflowStage, data: any) => {
    switch (stage) {
      case 'ideation':
        await updateTaskData({ 
          selectedDirection: data.selectedDirection,
          stage: 'canvas' 
        });
        setCurrentStage('canvas');
        break;
      case 'canvas':
        // Final stage - could save to history, etc.
        console.log('Canvas stage complete:', data);
        break;
    }
  };

  const handleGenerativeEdit = async (prompt: string, settings: any) => {
    setIsGenerating(true);
    // Simulate AI generation
    console.log('Generating with prompt:', prompt, 'settings:', settings);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsGenerating(false);
  };

  const handleBack = async () => {
    switch (currentStage) {
      case 'canvas':
        setCurrentStage('ideation');
        await updateTaskData({ stage: 'ideation' });
        break;
      default:
        router.push('/dashboard/clickatron2');
    }
  };

  if (!taskData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading creative lab...</p>
        </div>
      </div>
    );
  }

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
          {currentStage === 'ideation' ? 'Back to Home' : 'Previous Step'}
        </Button>
        
        <div className="flex-1">
          <h1 className="text-lg font-medium text-zinc-200 truncate">
            {taskData.videoIdea}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {(['ideation', 'canvas'] as const).map((stage, index) => (
              <div
                key={stage}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  currentStage === stage
                    ? 'bg-purple-500'
                    : index < (['ideation', 'canvas'] as const).indexOf(currentStage)
                    ? 'bg-purple-600/50'
                    : 'bg-zinc-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Stage Content */}
      <AnimatePresence mode="wait">
        {currentStage === 'ideation' && (
          <motion.div key="ideation" {...stageTransition}>
            <IdeationStage
              videoIdea={taskData.videoIdea}
              selectedPreset={taskData.selectedPreset}
              onComplete={(data) => handleStageComplete('ideation', data)}
            />
          </motion.div>
        )}
        
        {currentStage === 'canvas' && (
          <motion.div key="canvas" {...stageTransition}>
            <CanvasStage
              videoIdea={taskData.videoIdea}
              selectedDirection={taskData.selectedDirection!}
              selectedPreset={taskData.selectedPreset}
              referenceImage={taskData.referenceImage}
              onComplete={(data) => handleStageComplete('canvas', data)}
              onGenerativeEdit={handleGenerativeEdit}
              isGenerating={isGenerating}
            />
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
}