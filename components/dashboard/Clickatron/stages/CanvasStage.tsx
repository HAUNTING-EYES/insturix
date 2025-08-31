"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CanvasActions } from '../canvas/CanvasActions';
import { VariationsGallery } from "../canvas/VariationsGallery";
import { AICommandConsole } from "../canvas/AICommandConsole";
import useClickatronStore from "@/stores/useCanvasStore";
import { ImageDisplay } from "../canvas/ImageDisplay";
import { SaveStatusIndicator } from "../canvas/SaveStatusIndicator";
import { useDebounce } from "use-debounce";
import { produce } from "immer";
import { CanvasControls } from '../canvas/CanvasControls';

interface CanvasStageProps {
  videoIdea: string;
  onComplete: () => void;
  isGenerating: boolean;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" } as any,
};

export function CanvasStage({
  videoIdea,
}: CanvasStageProps) {
  const { task, updateCanvas, syncCanvas } = useClickatronStore();
  const [activeVariationId, setActiveVariationId] = useState<string | null>(null);

  const canvas = task?.details.canvas;
  const variations = canvas?.variations || [];

  useEffect(() => {
    if (!activeVariationId && variations.length > 0) {
      setActiveVariationId(variations[0].id);
    }
  }, [variations, activeVariationId]);

  const activeVariation = variations.find(v => v.id === activeVariationId);

  const [debouncedCanvas] = useDebounce(canvas, 1000);
  useEffect(() => {
    if (debouncedCanvas && task?._id) {
      syncCanvas(task._id, debouncedCanvas);
    }
  }, [debouncedCanvas, task?._id, syncCanvas]);

  const handleVariationSelect = (variationId: string) => {
    setActiveVariationId(variationId);
  };
  
  const handleAIGenerate = (prompt: string) => {
      if(!canvas) return;

      const newVariation = {
        id: `var_${Date.now()}`,
        prompt,
        status: 'completed' as const,
        imageRef: `https://picsum.photos/1280/720?random=${Date.now()}`,
        fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
      };

      const newCanvas = produce(canvas, draft => {
          draft.variations.unshift(newVariation);
      });
      
      updateCanvas(newCanvas);
      setActiveVariationId(newVariation.id);
  }

  const handleNewCanvas = () => {
    if(!canvas) return;
    const newVariation = {
      id: `new_canvas_${Date.now()}`,
      prompt: "",
      status: 'completed' as const,
      imageRef: `https://picsum.photos/1280/720?random=${Date.now()}`,
      fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
    };
    const newCanvas = produce(canvas, draft => {
        draft.variations.unshift(newVariation);
    });
    updateCanvas(newCanvas);
    setActiveVariationId(newVariation.id);
  };

  const handleFinetuningChange = (
    variationId: string,
    key: 'brightness' | 'contrast' | 'saturation',
    value: number
  ) => {
    if (!canvas) return;

    const newCanvas = produce(canvas, draft => {
      const variation = draft.variations.find(v => v.id === variationId);
      if (variation) {
        if (!variation.fineTuning) {
          variation.fineTuning = { brightness: 100, contrast: 100, saturation: 100 };
        }
        variation.fineTuning[key] = value;
      }
    });
    updateCanvas(newCanvas);
  };

  if (!canvas || !activeVariation) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading Canvas...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      {...fadeIn}
      className="fixed inset-0 bg-zinc-950 flex overflow-hidden"
    >
      <div className="relative z-10">
        <VariationsGallery
          variations={variations}
          activeVariationId={activeVariation.id}
          onVariationSelect={handleVariationSelect}
          onAddToCompare={() => {}}
          onNewCanvas={handleNewCanvas}
          onDuplicateCanvas={() => {}}
          onDeleteCanvas={() => {}}
          isCollapsed={false}
          onToggleCollapse={() => {}}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm relative z-10">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-zinc-100 truncate">
              {videoIdea}
            </h2>
            <SaveStatusIndicator isSaving={false} saveError={null} lastSaved={new Date()} />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 pb-32 overflow-hidden relative">
            <ImageDisplay
                imageRef={activeVariation.imageRef}
                status={activeVariation.status}
                variationId={activeVariation.id}
                fineTuning={activeVariation.fineTuning}
            />
            <CanvasActions
                onZoomIn={() => console.log("Zoom In")}
                onZoomOut={() => console.log("Zoom Out")}
                onDownload={() => console.log("Download")}
                onShare={() => console.log("Share")}
            />
            {activeVariation.fineTuning && (
              <CanvasControls
                brightness={activeVariation.fineTuning.brightness}
                contrast={activeVariation.fineTuning.contrast}
                saturation={activeVariation.fineTuning.saturation}
                onBrightnessChange={(val) => handleFinetuningChange(activeVariation.id, 'brightness', val)}
                onContrastChange={(val) => handleFinetuningChange(activeVariation.id, 'contrast', val)}
                onSaturationChange={(val) => handleFinetuningChange(activeVariation.id, 'saturation', val)}
              />
            )}
        </div>
      </div>
      
      <div className="relative z-20">
        <AICommandConsole
          onGenerate={handleAIGenerate}
          isGenerating={false}
          galleryCollapsed={false}
        />
      </div>
    </motion.div>
  );
}
