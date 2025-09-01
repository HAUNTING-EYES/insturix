"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { CanvasActions } from "../canvas/CanvasActions";
import { VariationsGallery } from "../canvas/VariationsGallery";
import { AICommandConsole } from "../canvas/AICommandConsole";
import useClickatronStore from "@/stores/useCanvasStore";
import { ImageDisplay } from "../canvas/ImageDisplay";
import { SaveStatusIndicator } from "../canvas/SaveStatusIndicator";
import { useDebounce } from "use-debounce";
import { produce } from "immer";
import { CanvasControls } from "../canvas/CanvasControls";
import { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

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

export function CanvasStage({ videoIdea }: CanvasStageProps) {
  const { task, updateCanvas, syncCanvas, isSaving, saveError, lastSaved } =
    useClickatronStore();
  const [activeVariationId, setActiveVariationId] = useState<string | null>(
    null
  );
  const imageRef = useRef<ReactZoomPanPinchRef>(null);

  const canvas = task?.details.canvas;
  const variations = canvas?.variations || [];

  // Get aspect ratio from first variation, fallback to session aspect ratio
  const currentAspectRatio =
    variations.length > 0 && variations[0].aspectRatio
      ? variations[0].aspectRatio
      : task?.details.aspectRatio || "16:9";

  // Ensure all variations have aspectRatio field (migration for existing data)
  useEffect(() => {
    if (canvas && variations.length > 0) {
      const needsMigration = variations.some(v => !v.aspectRatio);
      if (needsMigration) {
        const migratedCanvas = produce(canvas, draft => {
          draft.variations.forEach(variation => {
            if (!variation.aspectRatio) {
              variation.aspectRatio = task?.details.aspectRatio || "16:9";
            }
          });
        });
        updateCanvas(migratedCanvas);
      }
    }
  }, [canvas, variations, task?.details.aspectRatio, updateCanvas]);

  useEffect(() => {
    if (!activeVariationId && variations.length > 0) {
      setActiveVariationId(variations[0].id);
    }
  }, [variations, activeVariationId]);

  const activeVariation = variations.find((v) => v.id === activeVariationId);

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
    if (!canvas) return;

    // Check if active variation is blank - if so, update it instead of creating new one
    if (activeVariation && activeVariation.status === "blank") {
      const newCanvas = produce(canvas, (draft) => {
        const variation = draft.variations.find(
          (v) => v.id === activeVariation.id
        );
        if (variation) {
          variation.prompt = prompt;
          variation.status = "completed";
          variation.imageRef = `https://picsum.photos/1280/720?random=${Date.now()}`;
        }
      });
      updateCanvas(newCanvas);
    } else {
      // Create new variation
      const newVariation = {
        id: `var_${Date.now()}`,
        prompt,
        status: "completed" as const,
        imageRef: `https://picsum.photos/1280/720?random=${Date.now()}`,
        aspectRatio: currentAspectRatio, // Use current aspect ratio
        fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
      };

      const newCanvas = produce(canvas, (draft) => {
        draft.variations.unshift(newVariation);
      });

      updateCanvas(newCanvas);
      setActiveVariationId(newVariation.id);
    }
  };

  const handleNewCanvas = () => {
    if (!canvas) return;
    const newVariation = {
      id: `new_canvas_${Date.now()}`,
      prompt: "", // Empty prompt for blank variations
      status: "blank" as const, // New variations start as blank
      imageRef: "", // Empty image for blank variations
      aspectRatio: currentAspectRatio, // Use current aspect ratio
      fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
    };
    const newCanvas = produce(canvas, (draft) => {
      draft.variations.unshift(newVariation);
    });
    updateCanvas(newCanvas);
    setActiveVariationId(newVariation.id);
  };

  const handleDuplicateCanvas = (variationId: string) => {
    if (!canvas) return;
    
    const originalVariation = variations.find(v => v.id === variationId);
    if (!originalVariation) return;

    const duplicatedVariation = {
      ...originalVariation,
      id: `dup_${Date.now()}`,
    };

    const newCanvas = produce(canvas, (draft) => {
      const originalIndex = draft.variations.findIndex(v => v.id === variationId);
      // Insert the duplicate right after the original
      draft.variations.splice(originalIndex + 1, 0, duplicatedVariation);
    });
    
    updateCanvas(newCanvas);
    setActiveVariationId(duplicatedVariation.id);
  };

  const handleFinetuningChange = (
    variationId: string,
    key: "brightness" | "contrast" | "saturation",
    value: number
  ) => {
    if (!canvas) return;

    const newCanvas = produce(canvas, (draft) => {
      const variation = draft.variations.find((v) => v.id === variationId);
      if (variation) {
        if (!variation.fineTuning) {
          variation.fineTuning = {
            brightness: 100,
            contrast: 100,
            saturation: 100,
          };
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
            <SaveStatusIndicator
              isSaving={isSaving}
              saveError={saveError ? new Error(saveError) : null}
              lastSaved={lastSaved}
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 pb-32 overflow-hidden relative">
          <ImageDisplay
            ref={imageRef}
            imageRef={activeVariation.imageRef}
            status={activeVariation.status}
            variationId={activeVariation.id}
            fineTuning={activeVariation.fineTuning}
          />
          <CanvasActions
            onZoomIn={() => imageRef.current?.zoomIn()}
            onZoomOut={() => imageRef.current?.zoomOut()}
            onDownload={() => console.log("Download")}
            onShare={() => console.log("Share")}
          />
        </div>
      </div>

      <div className="relative z-20 w-80 bg-zinc-900/80 backdrop-blur-md border-l border-zinc-700/80 p-4 flex flex-col gap-4">
        <AICommandConsole
          onGenerate={handleAIGenerate}
          isGenerating={false}
          galleryCollapsed={false}
        />
        {activeVariation.fineTuning && (
          <CanvasControls
            brightness={activeVariation.fineTuning.brightness}
            contrast={activeVariation.fineTuning.contrast}
            saturation={activeVariation.fineTuning.saturation}
            onBrightnessChange={(val) =>
              handleFinetuningChange(activeVariation.id, "brightness", val)
            }
            onContrastChange={(val) =>
              handleFinetuningChange(activeVariation.id, "contrast", val)
            }
            onSaturationChange={(val) =>
              handleFinetuningChange(activeVariation.id, "saturation", val)
            }
          />
        )}
      </div>
    </motion.div>
  );
}
