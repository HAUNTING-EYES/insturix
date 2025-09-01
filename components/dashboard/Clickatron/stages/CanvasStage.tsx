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
import { Settings } from "lucide-react";

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

// Helper function to get aspect ratio dimensions
const getAspectRatioDimensions = (aspectRatio: string, maxWidth: number, maxHeight: number) => {
  const [widthRatio, heightRatio] = aspectRatio.split(':').map(Number);
  const ratio = widthRatio / heightRatio;
  
  let width = maxWidth;
  let height = width / ratio;
  
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  
  return { width, height };
};

// Blank Canvas Component
const BlankCanvas: React.FC<{ aspectRatio: string }> = ({ aspectRatio }) => {
  const [dimensions, setDimensions] = useState({ width: 800, height: 450 });

  useEffect(() => {
    const updateDimensions = () => {
      const containerWidth = window.innerWidth - 400; // Approximate sidebar widths
      const containerHeight = window.innerHeight - 200; // Header and padding
      const { width, height } = getAspectRatioDimensions(
        aspectRatio, 
        Math.min(containerWidth * 0.8, 1200), 
        Math.min(containerHeight * 0.8, 800)
      );
      setDimensions({ width, height });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [aspectRatio]);

  return (
    <div 
      className="bg-zinc-800/30 border-2 border-dashed border-zinc-600/50 flex items-center justify-center rounded-lg transition-all duration-300"
      style={{ 
        width: `${dimensions.width}px`, 
        height: `${dimensions.height}px`,
        minWidth: '300px',
        minHeight: '200px'
      }}
    >
      <div className="text-center">
        <div className="text-zinc-400 text-lg mb-2">Create Image to Start</div>
        <div className="text-zinc-500/70 text-sm">Use the AI console below to generate your first image</div>
        <div className="text-zinc-600 text-xs mt-2">{aspectRatio} aspect ratio</div>
      </div>
    </div>
  );
};

export function CanvasStage({ videoIdea }: CanvasStageProps) {
  // All hooks must be called at the top level, before any early returns
  const { task, updateCanvas, syncCanvas, isSaving, saveError, lastSaved } =
    useClickatronStore();
  const [activeVariationId, setActiveVariationId] = useState<string | null>(
    null
  );
  const [galleryCollapsed, setGalleryCollapsed] = useState(false);
  const imageRef = useRef<ReactZoomPanPinchRef>(null);

  const canvas = task?.details.canvas;
  const variations = canvas?.variations || [];

  // Get aspect ratio from first variation, fallback to session aspect ratio
  const currentAspectRatio =
    variations.length > 0 && variations[0].aspectRatio
      ? variations[0].aspectRatio
      : task?.details.aspectRatio || "16:9";

  const [debouncedCanvas] = useDebounce(canvas, 1000);

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

  useEffect(() => {
    if (debouncedCanvas && task?._id) {
      syncCanvas(task._id, debouncedCanvas);
    }
  }, [debouncedCanvas, task?._id, syncCanvas]);

  const activeVariation = variations.find((v) => v.id === activeVariationId);

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

  const handleDeleteCanvas = (variationId: string) => {
    if (!canvas || variations.length <= 1) return; // Don't delete if it's the last variation
    
    const newCanvas = produce(canvas, (draft) => {
      const variationIndex = draft.variations.findIndex(v => v.id === variationId);
      if (variationIndex !== -1) {
        draft.variations.splice(variationIndex, 1);
      }
    });
    
    updateCanvas(newCanvas);
    
    // If we deleted the active variation, select another one
    if (activeVariationId === variationId) {
      const remainingVariations = newCanvas.variations;
      if (remainingVariations.length > 0) {
        setActiveVariationId(remainingVariations[0].id);
      }
    }
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
      {/* Left Sidebar - Variations Gallery */}
      <div className="relative z-10">
        <VariationsGallery
          variations={variations}
          activeVariationId={activeVariation.id}
          onVariationSelect={handleVariationSelect}
          onAddToCompare={() => {}}
          onNewCanvas={handleNewCanvas}
          onDuplicateCanvas={handleDuplicateCanvas}
          onDeleteCanvas={handleDeleteCanvas}
          isCollapsed={galleryCollapsed}
          onToggleCollapse={() => setGalleryCollapsed(!galleryCollapsed)}
        />
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top Header */}
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

        {/* Canvas Display Area */}
        <div className="flex-1 flex overflow-hidden relative bg-zinc-900/20">
          {/* Main Canvas Container */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden relative">
            {/* Canvas Actions - Top Center */}
            <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-20">
              <CanvasActions
                onZoomIn={() => imageRef.current?.zoomIn(0.3)}
                onZoomOut={() => imageRef.current?.zoomOut(0.3)}
                onResetZoom={() => imageRef.current?.resetTransform()}
                onDownload={() => console.log("Download")}
                onShare={() => console.log("Share")}
              />
            </div>

            {/* Image Display with proper sizing */}
            <div className="relative w-full h-full flex items-center justify-center">
              {activeVariation.status === 'blank' || !activeVariation.imageRef ? (
                // Blank canvas with proper aspect ratio
                <BlankCanvas aspectRatio={currentAspectRatio} />
              ) : (
                <ImageDisplay
                  ref={imageRef}
                  imageRef={activeVariation.imageRef}
                  status={activeVariation.status}
                  variationId={activeVariation.id}
                  fineTuning={activeVariation.fineTuning}
                  className="max-w-[90%] max-h-[90%] object-contain rounded-lg shadow-2xl"
                />
              )}
            </div>
          </div>

          {/* Right Sidebar - Fine-tuning Controls */}
          <div className="w-80 bg-zinc-900/95 backdrop-blur-xl border-l border-zinc-700/80 flex flex-col shadow-2xl">
            {activeVariation.fineTuning ? (
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
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-center text-zinc-500">
                  <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No adjustments available</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom AI Command Console */}
        <div className="relative z-30">
          <AICommandConsole
            onGenerate={handleAIGenerate}
            isGenerating={false}
            galleryCollapsed={galleryCollapsed}
            className="border-t border-zinc-800/80"
          />
        </div>
      </div>
    </motion.div>
  );
}
