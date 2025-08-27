"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { VariationsGallery } from "../canvas/VariationsGallery";
import { AICommandConsole } from "../canvas/AICommandConsole";
import { FineTuningPanel } from "../canvas/FineTuningPanel";
import { CanvasControls } from "../canvas/CanvasControls";

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
    data: string;
  } | null;
  onComplete: (data: { finalThumbnail: string }) => void;
  onGenerativeEdit: (prompt: string, settings: any) => void;
  isGenerating: boolean;
}

interface Variation {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: number;
  isActive?: boolean;
}

interface FineTuningControls {
  brightness: number;
  contrast: number;
  saturation: number;
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
  referenceImage,
  onComplete,
  onGenerativeEdit,
  isGenerating,
}: CanvasStageProps) {
  // State management
  const [thumbnailLoading, setThumbnailLoading] = useState(true);
  const [galleryCollapsed, setGalleryCollapsed] = useState(false);
  const [activeVariationId, setActiveVariationId] = useState("initial");
  const [zoomLevel, setZoomLevel] = useState(100);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [history, setHistory] = useState<string[]>(["initial"]);

  // Pan/drag state for zoomed images
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Mock variations data - in real app, this would come from API
  const [variations, setVariations] = useState<Variation[]>([
    {
      id: "initial",
      imageUrl: "",
      prompt: selectedDirection,
      timestamp: Date.now(),
      isActive: true,
    },
  ]);

  // Fine-tuning controls
  const [fineTuningControls, setFineTuningControls] =
    useState<FineTuningControls>({
      brightness: 100,
      contrast: 100,
      saturation: 100,
    });

  // Simulate initial thumbnail generation
  useEffect(() => {
    const timer = setTimeout(() => {
      setThumbnailLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Handlers
  const handleVariationSelect = (variationId: string) => {
    setActiveVariationId(variationId);
    // Add to history if not already there
    if (!history.includes(variationId)) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(variationId);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const handleGenerateMoreLike = (variationId: string) => {
    // Generate 4 new variations based on the selected one
    const baseVariation = variations.find((v) => v.id === variationId);
    if (!baseVariation) return;

    const newVariations = Array.from({ length: 4 }, (_, i) => ({
      id: `${variationId}_variant_${i + 1}_${Date.now()}`,
      imageUrl: "",
      prompt: `${baseVariation.prompt} (variant ${i + 1})`,
      timestamp: Date.now() + i,
    }));

    setVariations((prev) => [...newVariations, ...prev]);
  };

  const handleAddToCompare = (variationId: string) => {
    console.log("Add to compare:", variationId);
    // TODO: Implement comparison feature
  };

  const handleAIGenerate = async (prompt: string, referenceImages?: any[]) => {
    // Create new variation
    const newVariation: Variation = {
      id: `generated_${Date.now()}`,
      imageUrl: "",
      prompt: prompt,
      timestamp: Date.now(),
    };

    // Add to variations and make it active
    setVariations((prev) => [newVariation, ...prev]);
    setActiveVariationId(newVariation.id);

    // Call the parent handler
    onGenerativeEdit(prompt, { referenceImages });
  };

  const handleFineTuningChange = (
    key: keyof FineTuningControls,
    value: number
  ) => {
    setFineTuningControls((prev) => ({ ...prev, [key]: value }));
  };

  const handleFineTuningReset = () => {
    setFineTuningControls({
      brightness: 100,
      contrast: 100,
      saturation: 100,
    });
  };

  const handleColorLookApply = (lookId: string) => {
    console.log("Apply color look:", lookId);
    // TODO: Implement color look application
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setActiveVariationId(history[newIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setActiveVariationId(history[newIndex]);
    }
  };

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 25, 25));
  };

  const handleDownload = () => {
    console.log("Download current variation");
    // TODO: Implement download
  };

  const handleSave = () => {
    onComplete({ finalThumbnail: activeVariationId });
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
  }, [zoomLevel]);

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
          activeVariationId={activeVariationId}
          onVariationSelect={handleVariationSelect}
          onGenerateMoreLike={handleGenerateMoreLike}
          onAddToCompare={handleAddToCompare}
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
            <p className="text-zinc-400 text-sm mt-1">
              {selectedDirection} • {selectedPreset?.name || "16:9 Thumbnail"}
            </p>
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
                onSave={handleSave}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < history.length - 1}
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
                <img
                  src="https://picsum.photos/1920/1080?random=1"
                  alt="Generated thumbnail"
                  className="w-full h-full object-cover"
                  draggable={false}
                />

                {/* Active variation indicator */}
                <div className="absolute top-4 left-4 text-xs text-white/70 bg-black/50 backdrop-blur-sm px-2 py-1 rounded">
                  {variations.find((v) => v.id === activeVariationId)?.prompt ||
                    selectedDirection}
                </div>

                {/* Zoom level indicator */}
                {zoomLevel !== 100 && (
                  <div className="absolute top-4 right-4 text-xs text-white/70 bg-black/50 backdrop-blur-sm px-2 py-1 rounded">
                    {zoomLevel}%
                  </div>
                )}

                {/* Pan instruction for zoomed images */}
                {zoomLevel > 100 && (
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-xs text-white/50 bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full">
                    Click and drag to pan
                  </div>
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
        />
      </div>
    </motion.div>
  );
}
