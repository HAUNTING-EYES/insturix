"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { CanvasActions } from "../canvas/CanvasActions";
import { VariationsGallery } from "../canvas/VariationsGallery";
import { AICommandConsole, ReferenceImage } from "../canvas/AICommandConsole";
import useClickatronStore from "@/stores/useCanvasStore";
import { ImageDisplay } from "../canvas/ImageDisplay";
import { SaveStatusIndicator } from "../canvas/SaveStatusIndicator";
import { useDebounce } from "use-debounce";
import { produce } from "immer";
import { CanvasControls } from "../canvas/CanvasControls";
import { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Settings } from "lucide-react";
import { pollVariationCompletion } from "@/lib/frontend/services/clickatron";
import { downloadImageWithFineTuning, getImageUrl } from "@/lib/frontend/services/clickatron-download";

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
const getAspectRatioDimensions = (
  aspectRatio: string,
  maxWidth: number,
  maxHeight: number
) => {
  const [widthRatio, heightRatio] = aspectRatio.split(":").map(Number);
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
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [aspectRatio]);

  return (
    <div
      className="bg-zinc-800/30 border-2 border-dashed border-zinc-600/50 flex items-center justify-center rounded-lg transition-all duration-300"
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        minWidth: "300px",
        minHeight: "200px",
      }}
    >
      <div className="text-center">
        <div className="text-zinc-400 text-lg mb-2">
          Create Variation to Start
        </div>
        <div className="text-zinc-500/70 text-sm">
          Use the AI console below to generate your first image
        </div>
        <div className="text-zinc-600 text-xs mt-2">
          {aspectRatio} aspect ratio
        </div>
      </div>
    </div>
  );
};

// No Variation Selected Component
const NoVariationSelected: React.FC<{ aspectRatio: string }> = ({
  aspectRatio,
}) => {
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
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [aspectRatio]);

  return (
    <div
      className="bg-zinc-800/20 border-2 border-dashed border-zinc-700/30 flex items-center justify-center rounded-lg transition-all duration-300"
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        minWidth: "300px",
        minHeight: "200px",
      }}
    >
      <div className="text-center">
        <div className="text-zinc-400 text-lg mb-2">Select a Variation</div>
        <div className="text-zinc-500/70 text-sm">
          Choose a variation from the gallery to view and edit
        </div>
        <div className="text-zinc-600 text-xs mt-2">
          {aspectRatio} aspect ratio
        </div>
      </div>
    </div>
  );
};

export function CanvasStage({ videoIdea }: CanvasStageProps) {
  // All hooks must be called at the top level, before any early returns
  const { task, updateCanvas, syncCanvas, isSaving, saveError, lastSaved, loadSession } =
    useClickatronStore();
  const [activeVariationId, setActiveVariationId] = useState<string | null>(
    null
  );
  const [galleryCollapsed, setGalleryCollapsed] = useState(false);
  const imageRef = useRef<ReactZoomPanPinchRef>(null);
  const lastSyncedCanvasRef = useRef<string | null>(null);
  const isInitialMount = useRef(true);
  const renderCount = useRef(0);
  const [localActiveVariation, setLocalActiveVariation] = useState(activeVariationId);

  // Debug: Track re-renders (only warn if excessive)
  renderCount.current += 1;
  if (renderCount.current > 50 && renderCount.current % 10 === 0) {
    console.warn("CanvasStage re-rendered", renderCount.current, "times - check for infinite loops");
  }

  const canvas = task?.details.canvas;
  // Ref to store the current canvas to prevent unnecessary re-renders
  const canvasRef = useRef(canvas);
  const variations = canvas?.variations || [];

  // Get aspect ratio from session
  const currentAspectRatio = task?.details.aspectRatio || "16:9";

  const [debouncedCanvas] = useDebounce(canvas, 1000);

  // Update canvasRef when canvas changes
  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  // Update local active variation when prop changes
  useEffect(() => {
    setLocalActiveVariation(activeVariationId);
  }, [activeVariationId]);

  // Update active variation if none is selected
  useEffect(() => {
    if (!localActiveVariation && variations.length > 0) {
      setLocalActiveVariation(variations[0].id);
      setActiveVariationId(variations[0].id);
    }
  }, [variations, localActiveVariation, setActiveVariationId]);

   // Autosave canvas - simplified approach
   useEffect(() => {
     // Skip on initial mount to prevent immediate sync
     if (isInitialMount.current) {
       isInitialMount.current = false;
       if (debouncedCanvas) {
         lastSyncedCanvasRef.current = JSON.stringify(debouncedCanvas);
       }
       return;
     }
 
     if (!debouncedCanvas || !task?._id || isSaving) {
       return;
     }
 
     const currentCanvasString = JSON.stringify(debouncedCanvas);
     const isDifferentFromLastSync = currentCanvasString !== lastSyncedCanvasRef.current;
          
     if (isDifferentFromLastSync) {
       console.log("🚀 TRIGGERING AUTOSAVE - Canvas has changed!", {
         taskId: task._id,
         variationsCount: debouncedCanvas.variations?.length
       });
       lastSyncedCanvasRef.current = currentCanvasString;
       syncCanvas(task._id, debouncedCanvas);
     }
   }, [debouncedCanvas, task?._id, isSaving]);

  const activeVariation = variations.find((v) => v.id === localActiveVariation);

  const handleVariationSelect = useCallback((variationId: string) => {
    setLocalActiveVariation(variationId);
    setActiveVariationId(variationId);
  }, [setActiveVariationId]);

  const handleAIGenerate = async (
    prompt: string,
    referenceImages?: ReferenceImage[],
    modelId?: string
  ) => {
    if (!canvas || !task?._id) return;

    const imageDataUrls = referenceImages?.map((img) => img.data) || [];
    
    // Generate idempotency key to prevent duplicate requests
    const idempotencyKey = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    try {
      // Use the passed modelId, or fall back to the active variation's modelId, or use default
      const selectedModelId = modelId || activeVariation?.modelId || "flux-kontext/dev";
      
      const response = await fetch(
        `/api/services/clickatron/session/${task._id}/variation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey
          },
          body: JSON.stringify({
            prompt,
            modelId: selectedModelId, // Include modelId in the request
            parentVariationId: activeVariationId, // Include parent for edit context
            fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
            referenceImages: imageDataUrls,
            metadata: { aspectRatio: currentAspectRatio },
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate variation");
      }

      const data = await response.json();
      console.log("Variation generation queued:", data);

      // Immediately set the new variation as active to prevent race conditions
      // The `loadSession` call will update its state in the background
      setActiveVariationId(data.variationId);

      // Start polling for completion, which will refresh the session state
      // Use the new updateVariation function in the store
      await pollVariationCompletion(
        task._id,
        data.variationId,
        loadSession,
        () => useClickatronStore.getState().task
      );

    } catch (error) {
      console.error("Error generating variation:", error);
      // Handle error appropriately in UI
    }
  };

  const handleNewVariation = useCallback(() => {
    if (!canvas) return;
    const now = new Date();
    const newVariation = {
      id: `new_variation_${Date.now()}`,
      prompt: "",
      status: "blank" as const,
      imageRef: "",
      aspectRatio: currentAspectRatio,
      fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
      createdAt: now,
      updatedAt: now,
      modelId: "flux-kontext/dev", // Default model for new variations
    };
    const newCanvas = produce(canvas, (draft) => {
      draft.variations.unshift(newVariation);
    });
    updateCanvas(newCanvas);
    setActiveVariationId(newVariation.id);
  }, [canvas, currentAspectRatio]);

  const handleDuplicateVariation = useCallback(
    (variationId: string) => {
      if (!canvas) return;

      const originalVariation = variations.find((v) => v.id === variationId);
      if (!originalVariation) return;

      const duplicatedVariation = {
        ...originalVariation,
        id: `dup_${Date.now()}`,
      };

      const newCanvas = produce(canvas, (draft) => {
        const originalIndex = draft.variations.findIndex(
          (v) => v.id === variationId
        );
        // Insert the duplicate right after the original
        draft.variations.splice(originalIndex + 1, 0, duplicatedVariation);
      });

      updateCanvas(newCanvas);
      setActiveVariationId(duplicatedVariation.id);
    },
    [canvas, variations] // Removed updateCanvas from deps
  );

  const handleDeleteVariation = useCallback(
    (variationId: string) => {
      if (!canvas) return;

      const newCanvas = produce(canvas, (draft) => {
        const variationIndex = draft.variations.findIndex(
          (v) => v.id === variationId
        );
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
        } else {
          // No variations left, set to null
          setActiveVariationId(null);
        }
      }
    },
    [canvas, activeVariationId] // Removed updateCanvas from deps
  );

  const handleFinetuningChange = useCallback((
    variationId: string,
    key: "brightness" | "contrast" | "saturation",
    value: number
  ) => {
    if (!canvasRef.current) {
      console.log(' handleFinetuningChange - no canvas ref');
      return;
    }

    // Only update if the value actually changed
    const currentVariation = canvasRef.current.variations.find((v) => v.id === variationId);
    if (currentVariation?.fineTuning?.[key] === value) {
      console.log(' handleFinetuningChange - value unchanged, skipping update', { variationId, key, value });
      return;
    }

    console.log(' handleFinetuningChange - updating', { variationId, key, value });

    const newCanvas = produce(canvasRef.current, (draft) => {
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
  }, [updateCanvas]); // Removed canvas from deps since we're using ref

  const handleManualSync = useCallback(() => {
    if (canvas && task?._id) {
      console.log('Manual sync triggered');
      syncCanvas(task._id, canvas);
    }
  }, [canvas, task?._id]);

  const handleDownload = useCallback(async () => {
    if (!activeVariation || !activeVariation.imageRef) {
      console.log("No active variation or image to download");
      return;
    }

    try {
      // Get the proper image URL (handling GCS signed URLs)
      const imageUrl = await getImageUrl(activeVariation.imageRef);
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `clickatron-variation-${timestamp}.png`;
      
      // Download with fine-tuning applied
      await downloadImageWithFineTuning(
        imageUrl,
        activeVariation.fineTuning,
        filename
      );
    } catch (error) {
      console.error("Error downloading image:", error);
      // TODO: Show user-friendly error message
    }
  }, [activeVariation]);

  if (!canvas) {
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
          activeVariationId={localActiveVariation}
          onVariationSelect={handleVariationSelect}
          onAddToCompare={() => {}}
          onNewVariation={handleNewVariation}
          onDuplicateVariation={handleDuplicateVariation}
          onDeleteVariation={handleDeleteVariation}
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
              saveError={saveError}
              lastSaved={lastSaved}
            />
            {process.env.NODE_ENV === 'development' && (
              <button 
                onClick={handleManualSync}
                className="text-xs bg-blue-600 text-white px-2 py-1 rounded mt-1"
              >
                Manual Sync (Debug)
              </button>
            )}

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
                onDownload={handleDownload}
                onShare={() => console.log("Share")}
              />
            </div>

            {/* Image Display with proper sizing */}
            <div className="relative w-full h-full flex items-center justify-center">
              {!activeVariation ? (
                // No variation selected
                <NoVariationSelected aspectRatio={currentAspectRatio} />
              ) : activeVariation.status === "blank" &&
                !activeVariation.imageRef ? (
                // Blank canvas with proper aspect ratio
                <BlankCanvas aspectRatio={currentAspectRatio} />
              ) : activeVariation.status === "failed" ? (
                // Failed variation - show error state with retry option
                <div
                  className="bg-red-900/20 border-2 border-dashed border-red-600/50 flex items-center justify-center rounded-lg transition-all duration-300"
                  style={{
                    width: `${800}px`,
                    height: `${450}px`,
                    minWidth: "300px",
                    minHeight: "200px",
                  }}
                >
                  <div className="text-center">
                    <div className="text-red-400 text-lg mb-2">
                      Generation Failed
                    </div>
                    <div className="text-red-500/70 text-sm mb-4">
                      Something went wrong while generating this variation
                    </div>
                    <button
                      onClick={() => handleAIGenerate(activeVariation.prompt)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
                    >
                      Retry Generation
                    </button>
                  </div>
                </div>
              ) : (
                <ImageDisplay
                  key={localActiveVariation}
                  ref={imageRef}
                  imageRef={activeVariation.imageRef}
                  status={activeVariation.status}
                  variationId={localActiveVariation!}
                  fineTuning={activeVariation.fineTuning}
                  className="max-w-[90%] max-h-[90%] object-contain rounded-lg shadow-2xl"
                />
              )}
            </div>
          </div>

          {/* Right Sidebar - Fine-tuning Controls */}
          <div className="w-80 bg-zinc-900/95 backdrop-blur-xl border-l border-zinc-700/80 flex flex-col shadow-2xl">
            {activeVariation?.fineTuning ? (
              <CanvasControls
                brightness={activeVariation.fineTuning.brightness}
                contrast={activeVariation.fineTuning.contrast}
                saturation={activeVariation.fineTuning.saturation}
                onBrightnessChange={(val) =>
                  handleFinetuningChange(localActiveVariation!, "brightness", val)
                }
                onContrastChange={(val) =>
                  handleFinetuningChange(localActiveVariation!, "contrast", val)
                }
                onSaturationChange={(val) =>
                  handleFinetuningChange(localActiveVariation!, "saturation", val)
                }
                disabled={!activeVariation}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-center text-zinc-500">
                  <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {!activeVariation
                      ? "Select a variation to adjust"
                      : "No adjustments available"}
                  </p>
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
            chatHistory={canvas?.chatHistory ?? []}
          />
        </div>
      </div>
    </motion.div>
  );
}
