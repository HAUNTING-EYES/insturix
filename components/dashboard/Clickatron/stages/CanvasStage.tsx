"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { VariationsGallery } from "../canvas/VariationsGallery";
import { AICommandConsole } from "../canvas/AICommandConsole";
import { FineTuningPanel } from "../canvas/FineTuningPanel";
import { CanvasControls } from "../canvas/CanvasControls";
import {
  useCanvasStore,
  useVariations,
  useActiveVariation,
  useFineTuningControls,
  useGalleryCollapsed,
  useZoomLevel,
  usePanOffset,
  useCanUndo,
  useCanRedo,
  type Variation,
} from "@/stores/useCanvasStore";
import { useGenerateImage } from "@/hooks/useAIGeneration";
import { ImageDisplay } from "../canvas/ImageDisplay";

interface CanvasStageProps {
  videoIdea: string;
  selectedDirection: string;
  selectedPreset?: {
    id: string;
    name: string;
    aspectRatio: string;
    dimensions: string;
  };
  referenceImage?: {
    name: string;
    size: number;
    type: string;
    imageId: string; // Reference to image in IndexedDB
  } | null;
  onComplete: (data: { finalThumbnail: string }) => void;
  onGenerativeEdit: (prompt: string, settings: any) => void;
  isGenerating: boolean;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" } as any,
};

export function CanvasStage({
  videoIdea,
  selectedDirection,
  selectedPreset,
  onComplete,
  onGenerativeEdit,
  isGenerating,
}: CanvasStageProps) {
  // Zustand store selectors
  const variations = useVariations();
  const activeVariation = useActiveVariation();
  const fineTuningControls = useFineTuningControls();
  const galleryCollapsed = useGalleryCollapsed();
  const zoomLevel = useZoomLevel();
  const panOffset = usePanOffset();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  // Store actions
  const addVariation = useCanvasStore((state) => state.addVariation);
  const removeVariation = useCanvasStore((state) => state.removeVariation);
  const setActiveVariation = useCanvasStore(
    (state) => state.setActiveVariation
  );
  const duplicateVariation = useCanvasStore(
    (state) => state.duplicateVariation
  );
  const updateFineTuning = useCanvasStore((state) => state.updateFineTuning);
  const resetFineTuning = useCanvasStore((state) => state.resetFineTuning);
  const setGalleryCollapsed = useCanvasStore(
    (state) => state.setGalleryCollapsed
  );
  const setZoomLevel = useCanvasStore((state) => state.setZoomLevel);
  const setPanOffset = useCanvasStore((state) => state.setPanOffset);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);

  // Local state for UI interactions
  const [thumbnailLoading, setThumbnailLoading] = useState(true);
  const [clearConsoleTrigger, setClearConsoleTrigger] = useState(0);
  const [setPromptData, setSetPromptData] = useState<
    | {
        prompt: string;
        referenceImages?: any[];
        trigger: number;
      }
    | undefined
  >();

  // Pan/drag state for zoomed images
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // AI generation hook
  const generateImageMutation = useGenerateImage();

  // Track if we've initialized to prevent duplicate variations
  const initializedRef = useRef(false);

  // Initialize variations if empty (only when we have selectedDirection and haven't initialized yet)
  // Note: On refresh, the store's loadTaskData will create mock variations, so this mainly handles
  // the case when navigating from ideation to canvas for the first time
  useEffect(() => {
    if (!initializedRef.current && variations.length === 0 && selectedDirection) {
      console.log('Initializing first variation with prompt:', selectedDirection);
      const initialVariation: Variation = {
        id: `initial_${Date.now()}`, // Make ID unique
        prompt: selectedDirection,
        timestamp: Date.now(),
      };
      addVariation(initialVariation);
      initializedRef.current = true;
    }
  }, [variations.length, selectedDirection, addVariation]);

  // Simulate initial thumbnail generation
  useEffect(() => {
    const timer = setTimeout(() => {
      setThumbnailLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Handlers
  const handleVariationSelect = (variationId: string) => {
    setActiveVariation(variationId);
  };

  const handleGenerateMoreLike = (variationId: string) => {
    // Generate 4 new variations based on the selected one
    const baseVariation = variations.find((v) => v.id === variationId);
    if (!baseVariation) return;

    const newVariations = Array.from({ length: 4 }, (_, i) => ({
      id: `${variationId}_variant_${i + 1}_${Date.now()}`,
      prompt: `${baseVariation.prompt} (variant ${i + 1})`,
      timestamp: Date.now() + i,
    }));

    // Add all new variations
    newVariations.forEach((variation) => addVariation(variation));
  };

  const handleAddToCompare = (variationId: string) => {
    console.log("Add to compare:", variationId);
    // TODO: Implement comparison feature
  };

  const handleNewCanvas = () => {
    // Create a new blank canvas
    const newVariation: Variation = {
      id: `new_canvas_${Date.now()}`,
      prompt: "",
      timestamp: Date.now(),
    };

    // Add to variations and make it active
    addVariation(newVariation);

    // Reset fine-tuning controls
    resetFineTuning();

    // Clear AI Command Console
    setClearConsoleTrigger((prev) => prev + 1);
  };

  const handleDuplicateCanvas = (variationId: string) => {
    const originalVariation = variations.find((v) => v.id === variationId);
    if (!originalVariation) return;

    // Use store's duplicate function
    duplicateVariation(variationId);

    // Populate AI Command Console with original prompt and reference images
    setSetPromptData({
      prompt: originalVariation.prompt,
      referenceImages: originalVariation.referenceImages,
      trigger: Date.now(),
    });
  };

  const handleDeleteCanvas = (variationId: string) => {
    removeVariation(variationId);
  };

  const handleAIGenerate = async (prompt: string, referenceImages?: any[]) => {
    // Create new variation
    const newVariation: Variation = {
      id: `generated_${Date.now()}`,
      prompt: prompt,
      timestamp: Date.now(),
    };

    // Add to variations and make it active
    addVariation(newVariation);

    // Call the parent handler
    onGenerativeEdit(prompt, { referenceImages });
  };

  const handleFineTuningChange = (
    key: keyof import("@/stores/useCanvasStore").FineTuningControls,
    value: number
  ) => {
    updateFineTuning(key, value);
  };

  const handleFineTuningReset = () => {
    resetFineTuning();
  };

  const handleColorLookApply = (lookId: string) => {
    console.log("Apply color look:", lookId);
    // TODO: Implement color look application
  };

  const handleUndo = () => {
    undo();
  };

  const handleRedo = () => {
    redo();
  };

  const handleZoomIn = () => {
    setZoomLevel(Math.min(zoomLevel + 25, 200));
  };

  const handleZoomOut = () => {
    setZoomLevel(Math.max(zoomLevel - 25, 25));
  };

  const handleDownload = () => {
    console.log("Download current variation");
    // TODO: Implement download
  };

  const handleSave = () => {
    onComplete({ finalThumbnail: activeVariation?.id || "" });
  };

  // Pan/drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 100) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 100) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Reset pan when zoom changes
  useEffect(() => {
    if (zoomLevel <= 100) {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [zoomLevel, setPanOffset]);

  // Canvas styling with fine-tuning applied
  const canvasStyle = {
    filter: `brightness(${fineTuningControls.brightness}%) contrast(${fineTuningControls.contrast}%) saturate(${fineTuningControls.saturation}%)`,
    transform: `scale(${zoomLevel / 100}) translate(${panOffset.x}px, ${panOffset.y}px)`,
    cursor: zoomLevel > 100 ? (isDragging ? "grabbing" : "grab") : "default",
  };

  return (
    <motion.div
      {...fadeIn}
      className="fixed inset-0 bg-zinc-950 flex overflow-hidden"
    >
      {/* Left Sidebar - Variations Gallery */}
      <div className="relative z-10">
        <VariationsGallery
          variations={variations}
          activeVariationId={activeVariation?.id || null}
          onVariationSelect={handleVariationSelect}
          onAddToCompare={handleAddToCompare}
          onNewCanvas={handleNewCanvas}
          onDuplicateCanvas={handleDuplicateCanvas}
          onDeleteCanvas={handleDeleteCanvas}
          isCollapsed={galleryCollapsed}
          onToggleCollapse={() => setGalleryCollapsed(!galleryCollapsed)}
        />
      </div>

      {/* Center - Main Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Canvas Header */}
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm relative z-10">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full text-sm mb-2">
              <Sparkles className="h-4 w-4" />
              Clickatron Canvas
            </div>
            <h2 className="text-lg font-semibold text-zinc-100 truncate">
              {videoIdea}
            </h2>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 pb-32 overflow-hidden relative">
          {/* Canvas Controls - Higher z-index to stay above zoomed content */}
          {!thumbnailLoading && (
            <div className="relative z-30">
              <CanvasControls
                onUndo={handleUndo}
                onRedo={handleRedo}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onDownload={handleDownload}
                onSave={() =>
                  onComplete({ finalThumbnail: activeVariation?.id || "" })
                }
                canUndo={canUndo}
                canRedo={canRedo}
                zoomLevel={zoomLevel}
                isDisabled={isGenerating}
              />
            </div>
          )}

          <div
            className={`
              bg-zinc-800/50 rounded-lg overflow-hidden relative
              transition-all duration-300 ease-out shadow-2xl select-none
              ${
                selectedPreset?.aspectRatio === "1:1"
                  ? "aspect-square w-full max-w-lg"
                  : selectedPreset?.aspectRatio === "9:16"
                    ? "aspect-[9/16] w-full max-w-md"
                    : "aspect-video w-full max-w-4xl" // 16:9 default - much larger
              }
            `}
            style={thumbnailLoading ? {} : canvasStyle}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {thumbnailLoading ? (
              /* Loading State */
              <div className="w-full h-full bg-zinc-800/50 flex items-center justify-center">
                <div className="text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="inline-block mb-4"
                  >
                    <Sparkles className="h-8 w-8 text-purple-400" />
                  </motion.div>
                  <div className="text-zinc-300 font-medium">
                    Generating canvas...
                  </div>
                  <div className="text-zinc-500 text-sm mt-1">
                    {selectedDirection} style
                  </div>
                </div>
              </div>
            ) : (
              /* Generated Canvas */
              <div className="w-full h-full relative">
                {activeVariation?.id?.startsWith("new_canvas_") &&
                activeVariation?.prompt === "" ? (
                  /* Blank Canvas State */
                  <div className="w-full h-full bg-zinc-800/30 flex items-center justify-center border-2 border-dashed border-zinc-600/50 rounded-lg">
                    <div className="text-center">
                      <div className="text-zinc-400 text-lg mb-2">
                        Blank Canvas
                      </div>
                      <div className="text-zinc-500 text-sm">
                        Use the AI Command Console below to generate content
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Generated Image */
                  <ImageDisplay
                    imageId={activeVariation?.imageId}
                    className="w-full h-full object-cover"
                    fallback={
                      <img
                        src="https://picsum.photos/1920/1080?random=1"
                        alt="Generated thumbnail"
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    }
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Fine-Tuning Panel */}
      <div className="relative z-10">
        <FineTuningPanel
          controls={fineTuningControls}
          onControlChange={handleFineTuningChange}
          onReset={handleFineTuningReset}
          onColorLookApply={handleColorLookApply}
          isDisabled={thumbnailLoading || isGenerating}
        />
      </div>

      {/* Bottom - AI Command Console */}
      <div className="relative z-20">
        <AICommandConsole
          onGenerate={handleAIGenerate}
          isGenerating={isGenerating}
          galleryCollapsed={galleryCollapsed}
          clearTrigger={clearConsoleTrigger}
          setPromptData={setPromptData}
        />
      </div>
    </motion.div>
  );
}
