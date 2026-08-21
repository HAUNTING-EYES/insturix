"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CanvasActions } from "../canvas/CanvasActions";
import { VariationsGallery } from "../canvas/VariationsGallery";
import { AICommandConsole } from "../canvas/AICommandConsole";
import { NewVariationConsole } from "../canvas/NewVariationConsole";
import { Input } from "@/components/ui/input";
import { Grid, Sliders, X, Loader2, Square, Pencil } from "lucide-react";
import useClickatronStore from "@/stores/useCanvasStore";
import { getActiveBrandIdFromStorage } from "@/components/dashboard/ActiveBrand/ActiveBrandProvider";
import { ImageDisplay } from "../canvas/ImageDisplay";
import { SaveStatusIndicator } from "../canvas/SaveStatusIndicator";
import { useDebounce } from "use-debounce";
import { produce } from "immer";
import { CanvasControls } from "../canvas/CanvasControls";
import { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Settings, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  downloadImageWithFineTuning,
  getImageUrl,
} from "@/lib/frontend/services/clickatron-download";
import { pollVariationCompletion } from "@/lib/frontend/services/clickatron";
import ImageOverlayManager, {
  type ImageOverlayManagerHandle,
} from "../canvas/ImageOverlayManager";
import { SketchOverlay, type SketchOverlayHandle, type SketchTool, type PencilColor, type EraserSize } from "../canvas/SketchOverlay";
import { SelectionTool } from "../canvas/SelectionTool";
import { GenerativeFillInline } from "../canvas/GenerativeFillInline";
import { SPREAD } from "@/lib/animation/presets";
import type { Variation } from "@/types/clickatron";

interface CanvasStageProps {
  videoIdea: string;
  onComplete: () => void;
  isGenerating: boolean;
}

// OLD: local fadeIn (y:20, 0.4s, 'easeOut')
// NEW: shared SPREAD.fadeUp (y:20, 0.5s, expo.out â€” brand easing)
const fadeIn = SPREAD.fadeUp;

// Helper function to get aspect ratio dimensions
const getAspectRatioDimensions = (
  aspectRatio: string,
  maxWidth: number,
  maxHeight: number,
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
        Math.min(containerHeight * 0.8, 800),
      );
      setDimensions({ width, height });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [aspectRatio]);

  return (
    <div
      className="bg-[#1B1A18]/30 border-2 border-dashed border-[#282724]/50 flex items-center justify-center rounded-lg transition-all duration-300"
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        minWidth: "300px",
        minHeight: "200px",
      }}
    >
      <div className="text-center">
        <div className="text-[#7A776E] text-lg mb-2">
          Create Variation to Start
        </div>
        <div className="text-[#7A776E]/70 text-sm">
          Use the AI console below to generate an image
        </div>
        <div className="text-[#282724] text-[11px] mt-2">
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
        Math.min(containerHeight * 0.8, 800),
      );
      setDimensions({ width, height });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [aspectRatio]);

  return (
    <div
      className="bg-[#1B1A18]/20 border-2 border-dashed border-[#282724]/30 flex items-center justify-center rounded-lg transition-all duration-300"
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        minWidth: "300px",
        minHeight: "200px",
      }}
    >
      <div className="text-center">
        <div className="text-[#7A776E] text-lg mb-2">Select a Variation</div>
        <div className="text-[#7A776E]/70 text-sm">
          Choose a variation from the gallery to view and edit
        </div>
        <div className="text-[#282724] text-[11px] mt-2">
          {aspectRatio} aspect ratio
        </div>
      </div>
    </div>
  );
};

export function CanvasStage({ videoIdea }: CanvasStageProps) {
  // All hooks must be called at the top level, before any early returns
  const { toast } = useToast();
  const {
    task,
    updateCanvas,
    syncCanvas,
    isSaving,
    saveError,
    lastSaved,
    loadSession,
    updateVariation,
  } = useClickatronStore();
  const [activeVariationId, setActiveVariationId] = useState<string | null>(
    null,
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [mobilePanel, setMobilePanel] = useState<
    "none" | "gallery" | "fine-tune"
  >("none");
  const [activeTool, setActiveTool] = useState<"sketch" | "image" | null>(null);
  const [sketchTool, setSketchTool] = useState<
    "pencil" | "eraser" | "text" | null
  >(null);
  const [pencilColor, setPencilColor] = useState<PencilColor>("black");
  const [eraserSize, setEraserSize] = useState<EraserSize>("medium");
  const [inputMode, setInputMode] = useState<"editCanvas" | "sketchToEdit">(
    "editCanvas",
  );
  const [selectedImageOverlayId, setSelectedImageOverlayId] = useState<
    string | null
  >(null);

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [imageContainerSize, setImageContainerSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });
  const [imageNaturalSize, setImageNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const [isSelectionActive, setIsSelectionActive] = useState(false);
  const [selectionMode, setSelectionMode] = useState<"rectangle" | "lasso">(
    "rectangle",
  );
  const [selectionBounds, setSelectionBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [selectionMaskDataUrl, setSelectionMaskDataUrl] = useState<string | null>(
    null,
  );
  const [inlinePromptPos, setInlinePromptPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isGenerativeFillGenerating, setIsGenerativeFillGenerating] =
    useState(false);

  const [newVariationCreating, setNewVariationCreating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const panelVariants = {
    hidden: { y: "100%", opacity: 0 },
    visible: { y: 0, opacity: 1 },
    exit: { y: "100%", opacity: 0 },
  };
  const imageRef = useRef<ReactZoomPanPinchRef>(null);
  const lastSyncedCanvasRef = useRef<string | null>(null);
  const isInitialMount = useRef(true);
  const renderCount = useRef(0);
  const [localActiveVariation, setLocalActiveVariation] =
    useState(activeVariationId);
  const [referenceImageCount, setReferenceImageCount] = useState<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingVariationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!imageContainerRef.current) return;

    const updateSize = () => {
      const rect = imageContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setImageContainerSize({
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      });
    };

    updateSize();
    const ro = new ResizeObserver(() => updateSize());
    ro.observe(imageContainerRef.current);
    window.addEventListener("resize", updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  // Debug: Track re-renders (only warn if excessive)
  renderCount.current += 1;
  if (renderCount.current > 50 && renderCount.current % 10 === 0) {
    console.warn(
      "CanvasStage re-rendered",
      renderCount.current,
      "times - check for infinite loops",
    );
  }

  const canvas = task?.details.canvas;
  // Ref to store the current canvas to prevent unnecessary re-renders
  const canvasRef = useRef(canvas);
  const variations = canvas?.variations || [];

  // Get aspect ratio from session
  const currentAspectRatio = task?.details.aspectRatio || "16:9";
  const [aspectRatio, setAspectRatio] = useState<string>(currentAspectRatio);

  const [debouncedCanvas] = useDebounce(canvas, 1000);

  // Image overlay manager ref to trigger file input from console
  const imageOverlayManagerRef = useRef<ImageOverlayManagerHandle>(null);
  const sketchOverlayRef = useRef<SketchOverlayHandle>(null);

  const handleAddOverlayImage = useCallback(() => {
    // Switch to image tool mode but keep sketch tool state
    // This preserves sketches and text annotations when adding overlay images
    setActiveTool("image");
    // Note: We do NOT set sketchTool to null here because that would
    // unmount SketchOverlay and lose all drawings/text annotations
    // Instead, SketchOverlay will remain mounted but with isActive={false}
    // Trigger the file input
    imageOverlayManagerRef.current?.triggerFileInput?.();
  }, []);

  // Wrapper for sketch tool changes - implements toggle behavior
  // Clicking same tool twice deselects it
  const handleSketchToolChange = useCallback((tool: "pencil" | "eraser" | "text") => {
    setSketchTool((prevTool) => {
      // If clicking the same active tool, deselect it
      if (prevTool === tool && activeTool === "sketch") {
        setActiveTool(null);
        return null;
      }
      // Otherwise, select the tool
      setActiveTool("sketch");
      return tool;
    });
    setSelectedImageOverlayId(null); // Deselect any image when switching to sketch tool
  }, [activeTool]);

  // Handle clicking outside canvas - deselect all tools
  // This is called when user clicks on UI controls outside the canvas area
  const handleCanvasClickOutside = useCallback(() => {
    setActiveTool(null);
    setSketchTool(null);
    setSelectedImageOverlayId(null);
  }, []);

  // Update canvasRef when canvas changes
  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  const markVariationPollingFailed = useCallback(
    (variationId: string, error: unknown, logLabel: string) => {
      if (error instanceof Error && error.message === "Polling aborted") return;
      console.error(logLabel, error);
      updateVariation(variationId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Image generation failed",
        updatedAt: new Date(),
      });
    },
    [updateVariation],
  );

  // Poll every generating variation until the backend writes a terminal state.
  useEffect(() => {
    if (!task?._id || variations.length === 0) return;

    const generatingVariations = variations.filter((v) => v.status === "generating");
    if (generatingVariations.length === 0) return;

    console.log(
      "Found generating variations, starting polling:",
      generatingVariations.map((v) => v.id),
    );

    if (!abortControllerRef.current || abortControllerRef.current.signal.aborted) {
      abortControllerRef.current = new AbortController();
    }

    generatingVariations.forEach((variation) => {
      if (pollingVariationIdsRef.current.has(variation.id)) return;
      pollingVariationIdsRef.current.add(variation.id);

      pollVariationCompletion(
        task._id!,
        variation.id,
        loadSession,
        () => useClickatronStore.getState().task,
        undefined,
        2000,
        abortControllerRef.current!.signal,
      )
        .catch((err) => {
          markVariationPollingFailed(variation.id, err, "Polling error:");
        })
        .finally(() => {
          pollingVariationIdsRef.current.delete(variation.id);
        });
    });
  }, [task?._id, variations, loadSession, markVariationPollingFailed]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        console.log("Aborting polling on unmount");
        abortControllerRef.current.abort();
        pollingVariationIdsRef.current.clear();
      }
    };
  }, []);

  // Update active variation if none is selected
 useEffect(() => {
    if (!localActiveVariation && variations.length > 0) {
      setLocalActiveVariation(variations[0].id);
      setActiveVariationId(variations[0].id);
    }
  }, [variations, localActiveVariation]);


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
    const isDifferentFromLastSync =
      currentCanvasString !== lastSyncedCanvasRef.current;

    if (isDifferentFromLastSync) {
      console.log("ðŸš€ TRIGGERING AUTOSAVE - Canvas has changed!", {
        taskId: task._id,
        variationsCount: debouncedCanvas.variations?.length,
      });
      lastSyncedCanvasRef.current = currentCanvasString;
      syncCanvas(task._id, debouncedCanvas);
    }
  }, [debouncedCanvas, task?._id, isSaving]);

  const activeVariation = variations.find((v) => v.id === localActiveVariation);

  // Update aspect ratio when active variation changes (only for blank variations)
  useEffect(() => {
    if (activeVariation && activeVariation.status === "blank") {
      setAspectRatio(activeVariation.aspectRatio);
    }
  }, [activeVariation]);

  const handleVariationSelect = useCallback(
    (variationId: string) => {
      // Deselect all tools and clear overlay images when switching to another variation
      handleCanvasClickOutside();
      imageOverlayManagerRef.current?.clearOverlays(); // Clear all overlay images
      setLocalActiveVariation(variationId);
      setActiveVariationId(variationId);
    },
    [setActiveVariationId, handleCanvasClickOutside],
  );

  const handleAIGenerate = async (
    prompt: string,
    referenceImages?: File[],
    modelId?: string,
  ) => {
    if (!canvas || !task?._id) return;

    // Check if the active variation is blank
    const isBlank = activeVariation?.status === "blank";
    const selectedModelId =
      modelId || activeVariation?.modelId || "fal-ai/flux-kontext/dev";

    const idempotencyKey = `gen_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 11)}`;

    // TEMP variation (client-only)
    const tempVariationId = `temp_gen_${Date.now()}`;
    const now = new Date();

    // Create TEMP loading variation immediately
    const tempVariation: Variation = {
      id: tempVariationId,
      prompt,
      status: "generating",
      imageRef: "",
      thumbnailRef: "",
      aspectRatio,
      fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
      createdAt: now,
      updatedAt: now,
      parentVariationId: localActiveVariation || undefined,
      modelId: selectedModelId,
      metadata: { isTemp: true },
    };

    const canvasWithTemp = produce(canvas, (draft) => {
      draft.variations.unshift(tempVariation);
    });

    updateCanvas(canvasWithTemp);
    setLocalActiveVariation(tempVariationId);
    setActiveVariationId(tempVariationId);
    setNewVariationCreating(true);

    try {
      // Call API
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("modelId", selectedModelId);
      formData.append("parentVariationId", localActiveVariation || "");
      formData.append(
        "fineTuning",
        JSON.stringify({ brightness: 100, contrast: 100, saturation: 100 }),
      );
      const generationBrandId = task.brandId || getActiveBrandIdFromStorage();
      const generationMetadata = {
        aspectRatio,
        ...(generationBrandId ? { sourceContext: { brandId: generationBrandId } } : {}),
      };
      formData.append("metadata", JSON.stringify(generationMetadata));
      formData.append("aspectRatio", aspectRatio);

      // If the active variation is blank, indicate that we want to update it
      if (isBlank && localActiveVariation) {
        formData.append("updateExistingBlank", "true");
      }

      // Append reference images
      referenceImages?.forEach((file, index) => {
        formData.append(`referenceImages`, file);
      });
      setNewVariationCreating(true);
      const response = await fetch(
        `/api/services/clickatron/session/${task._id}/variation`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error("Failed to generate variation");
      }

      const data = await response.json();

      // Replace TEMP variation with real backend variation
      if (data.variation) {
        const replacedCanvas = produce(canvasWithTemp, (draft) => {
          const index = draft.variations.findIndex(
            (v) => v.id === tempVariationId,
          );

          if (index !== -1) {
            draft.variations[index] = data.variation;
          } else {
            draft.variations.unshift(data.variation);
          }
        });

        updateCanvas(replacedCanvas);
        setLocalActiveVariation(data.variation.id);
        setActiveVariationId(data.variation.id);
      }

      const generatedVariationId = data.variationId || data.variation?.id;
      if (!generatedVariationId) {
        throw new Error("Clickatron generation did not return a variation ID");
      }

      // Poll for completion
      await pollVariationCompletion(
        task._id,
        generatedVariationId,
        loadSession,
        () => useClickatronStore.getState().task,
        () => {
          // Trigger a re-render of LimitDisplay components by updating a dummy state
          // This is a simple way to force components to re-fetch their data
          window.dispatchEvent(new CustomEvent("clickatron-usage-updated"));
        },
        2000,
        abortControllerRef.current?.signal,
      ).catch((err) => {
        markVariationPollingFailed(generatedVariationId, err, "Polling error in handleAIGenerate:");
      });
    } catch (error) {
      console.error("Error generating variation:", error);

      // Rollback TEMP variation on failure
      const rollbackCanvas = produce(canvas, (draft) => {
        draft.variations = draft.variations.filter(
          (v) => v.id !== tempVariationId,
        );
      });

      updateCanvas(rollbackCanvas);
      setLocalActiveVariation(localActiveVariation);
      setActiveVariationId(localActiveVariation);
      // The optimistic card just vanished — without this toast the failure is
      // completely silent (incl. insufficient credits / 4xx / 5xx).
      toast({
        title: "Generation failed",
        description:
          error instanceof Error && error.message
            ? error.message
            : "The variation could not be generated. Check your credits and try again.",
        variant: "destructive",
      });
    } finally {
      setNewVariationCreating(false);
    }
  };

  const handleSketchToEditSubmit = useCallback(async (modelId?: string) => {
    if (!task?._id || !activeVariation || !activeVariation.imageRef) {
      toast({
        title: "Error",
        description: "No active variation found",
        variant: "destructive",
      });
      return;
    }

    if (!sketchOverlayRef.current) {
      toast({
        title: "Error",
        description: "Sketch overlay not available",
        variant: "destructive",
      });
      return;
    }

    try {
      setNewVariationCreating(true);

      console.log('[SketchToEdit] Starting export with imageRef:', activeVariation.imageRef);

      // Get image overlays
      const overlays = imageOverlayManagerRef.current?.getOverlays() || [];
      console.log('[SketchToEdit] Overlays:', overlays.length);

      // Flatten the annotated canvas with base image, strokes, text, and overlays
      const annotatedImageDataUrl = await sketchOverlayRef.current.exportFlattenedCanvas(
        activeVariation.imageRef,
        overlays.map(o => ({ src: o.src, x: o.x, y: o.y, width: o.width, height: o.height }))
      );

      console.log('[SketchToEdit] Export successful, length:', annotatedImageDataUrl.length);

      // Convert data URL to blob
      const response = await fetch(annotatedImageDataUrl);
      const blob = await response.blob();
      const img2File = new File([blob], `sketch_${Date.now()}.png`, { type: 'image/png' });

      console.log('[SketchToEdit] Calling API with modelId:', modelId || activeVariation.modelId);

      // Call the sketch-to-edit API
      const formData = new FormData();
      formData.append('img2', img2File);
      formData.append('prompt', ''); // Empty prompt, using internal system prompt
      formData.append('modelId', modelId || activeVariation.modelId || 'fal-ai/flux-kontext/dev');
      formData.append('parentVariationId', activeVariation.id);

      const apiResponse = await fetch(`/api/services/clickatron/session/${task._id}/sketch-to-edit`, {
        method: 'POST',
        body: formData,
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        console.error('[SketchToEdit] API error:', errorData);
        throw new Error(errorData.error || 'Failed to submit sketch-to-edit');
      }

      const data = await apiResponse.json();
      console.log('[SketchToEdit] API response:', data);

      // Poll for completion
      try {
        await pollVariationCompletion(
          task._id,
          data.variationId,
          loadSession,
          () => useClickatronStore.getState().task,
          () => {
            window.dispatchEvent(new CustomEvent("clickatron-usage-updated"));
          },
          2000,
          abortControllerRef.current?.signal,
        );

        // Auto-select the new variation when processing completes
        console.log('[SketchToEdit] Processing complete, auto-selecting new variation:', data.variationId);
        setLocalActiveVariation(data.variationId);
        setActiveVariationId(data.variationId);
        
        // Clear all overlay images after successful generation
        imageOverlayManagerRef.current?.clearOverlays();

        // Show success toast only after successful generation
        toast({
          title: "Success",
          description: "Sketch-to-edit completed successfully",
        });
      } catch (pollError) {
        if (!(pollError instanceof Error) || pollError.message !== "Polling aborted") {
          markVariationPollingFailed(data.variationId, pollError, "Polling error in handleSketchToEditSubmit:");
          
          // Clear all overlay images after failed generation
          imageOverlayManagerRef.current?.clearOverlays();
          
          // Show error toast for generation failure
          toast({
            title: "Generation Failed",
            description: "Due to some issue, image generation failed. Please try again.",
            variant: "destructive",
          });
        }
      }

    } catch (error) {
      console.error("Error in handleSketchToEditSubmit:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit sketch-to-edit",
        variant: "destructive",
      });
    } finally {
      setNewVariationCreating(false);
    }
  }, [task?._id, activeVariation, loadSession, markVariationPollingFailed, toast]);

  const handleGenerativeFillToggle = useCallback(
    (mode?: "rectangle" | "lasso") => {
      if (!activeVariation?.imageRef || activeVariation.status !== "completed") {
        toast({
          title: "Error",
          description: "Select a completed image first",
          variant: "destructive",
        });
        return;
      }

      if (!mode) {
        setIsSelectionActive(false);
        setSelectionBounds(null);
        setSelectionMaskDataUrl(null);
        setInlinePromptPos(null);
        return;
      }

      setSelectionMode(mode);
      setIsSelectionActive(true);
      setSelectionBounds(null);
      setSelectionMaskDataUrl(null);
      setInlinePromptPos(null);
    },
    [activeVariation, toast],
  );

  const handleGenerativeFillGenerate = useCallback(
    async (prompt: string, modelId: string) => {
      if (!task?._id || !activeVariation?.id) return;
      if (!selectionBounds || !selectionMaskDataUrl) {
        toast({
          title: "Error",
          description: "Make a selection first",
          variant: "destructive",
        });
        return;
      }

      try {
        setIsGenerativeFillGenerating(true);

        const maskRes = await fetch(selectionMaskDataUrl);
        const maskBlob = await maskRes.blob();
        const maskFile = new File([maskBlob], `mask_${Date.now()}.png`, {
          type: "image/png",
        });

        const formData = new FormData();
        formData.append("prompt", prompt);
        formData.append("modelId", modelId);
        formData.append("variationId", activeVariation.id);
        formData.append("selectionBounds", JSON.stringify(selectionBounds));
        formData.append("mask", maskFile);

        const apiResponse = await fetch(
          `/api/services/clickatron/session/${task._id}/generative-fill`,
          { method: "POST", body: formData },
        );

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to submit generative fill");
        }

        const data = await apiResponse.json();

        setIsSelectionActive(false);
        setSelectionBounds(null);
        setSelectionMaskDataUrl(null);
        setInlinePromptPos(null);

        await pollVariationCompletion(
          task._id,
          data.variationId,
          loadSession,
          () => useClickatronStore.getState().task,
          () => window.dispatchEvent(new CustomEvent("clickatron-usage-updated")),
          2000,
          abortControllerRef.current?.signal,
        ).catch((pollError) => {
          markVariationPollingFailed(data.variationId, pollError, "Polling error in handleGenerativeFillGenerate:");
          throw pollError;
        });

        setLocalActiveVariation(data.variationId);
        setActiveVariationId(data.variationId);
      } catch (error) {
        console.error("Error in handleGenerativeFillGenerate:", error);
        toast({
          title: "Error",
          description:
            error instanceof Error ? error.message : "Generative fill failed",
          variant: "destructive",
        });
      } finally {
        setIsGenerativeFillGenerating(false);
      }
    },
    [
      task?._id,
      activeVariation?.id,
      selectionBounds,
      selectionMaskDataUrl,
      loadSession,
      markVariationPollingFailed,
      toast,
    ],
  );

  const handleUploadImage = useCallback(
    async (file: File) => {
      if (!canvas || !task?._id) return;

      const acceptedTypes = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
      ];
      if (!acceptedTypes.includes(file.type)) {
        toast({
          title: "Invalid format",
          description: "Please use PNG, JPG, JPEG, or WEBP",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum size is 5MB",
          variant: "destructive",
        });
        return;
      }

      const isBlank = activeVariation?.status === "blank";

      setIsUploadingImage(true);
      try {
        const formData = new FormData();
        formData.append("image", file);
        formData.append("aspectRatio", aspectRatio);
        if (isBlank && localActiveVariation) {
          formData.append("updateExistingBlank", "true");
          formData.append("parentVariationId", localActiveVariation);
        }

        const response = await fetch(
          `/api/services/clickatron/session/${task._id}/upload-image`,
          { method: "POST", body: formData }
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to upload image");
        }

        const data = await response.json();
        const uploadedVariation = data.variation as Variation;

        const newCanvas = produce(canvas, (draft) => {
          if (isBlank && localActiveVariation) {
            const idx = draft.variations.findIndex(
              (v) => v.id === localActiveVariation
            );
            if (idx !== -1) {
              draft.variations[idx] = uploadedVariation;
            } else {
              draft.variations.unshift(uploadedVariation);
            }
          } else {
            draft.variations.unshift(uploadedVariation);
          }
        });

        updateCanvas(newCanvas);
        setLocalActiveVariation(uploadedVariation.id);
        setActiveVariationId(uploadedVariation.id);
        toast({
          title: "Image uploaded",
          description: "Your image is ready for editing and variations.",
        });
      } catch (error) {
        console.error("Error uploading image:", error);
        toast({
          title: "Upload failed",
          description:
            error instanceof Error ? error.message : "Failed to upload image",
          variant: "destructive",
        });
      } finally {
        setIsUploadingImage(false);
      }
    },
    [
      canvas,
      task?._id,
      activeVariation?.status,
      localActiveVariation,
      aspectRatio,
      updateCanvas,
      toast,
    ]
  );

  const saveTitle = async (newTitle: string) => {
    if (!task?._id || !newTitle.trim()) return;

    try {
      const response = await fetch(
        `/api/services/clickatron/session/${task._id}/rename`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: newTitle.trim() }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to rename session");
      }

      const data = await response.json();

      // Update the task in the store with the new title
      if (task && task.details) {
        const updatedTask = {
          ...task,
          title: data.session.title,
        };
        // We need to update the task in the store
        // Since we don't have a direct method to update just the title,
        // we'll reload the session to get the updated data
        await loadSession(task._id);
      }
    } catch (error) {
      console.error("Error saving title:", error);
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
      aspectRatio: aspectRatio,
      fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
      createdAt: now,
      updatedAt: now,
      modelId: "fal-ai/flux-kontext/dev", // Default model for new variations
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
          (v) => v.id === variationId,
        );
        // Insert the duplicate right after the original
        draft.variations.splice(originalIndex + 1, 0, duplicatedVariation);
      });

      updateCanvas(newCanvas);
      setActiveVariationId(duplicatedVariation.id);
    },
    [canvas, variations], // Removed updateCanvas from deps
  );

  const handleDeleteVariation = useCallback(
    async (variationId: string) => {
      if (!canvas || !task?._id) return;

      try {
        const response = await fetch(
          `/api/services/clickatron/session/${task._id}/variation/${variationId}`,
          {
            method: "DELETE",
          },
        );

        if (!response.ok) {
          throw new Error("Failed to delete variation");
        }

        // Local update after successful API call
        const newCanvas = produce(canvas, (draft) => {
          const variationIndex = draft.variations.findIndex(
            (v) => v.id === variationId,
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
      } catch (error) {
        console.error("Error deleting variation:", error);
        // Optionally, still do local delete or show error toast
        // For now, local delete to maintain optimistic UI
        const newCanvas = produce(canvas, (draft) => {
          const variationIndex = draft.variations.findIndex(
            (v) => v.id === variationId,
          );
          if (variationIndex !== -1) {
            draft.variations.splice(variationIndex, 1);
          }
        });
        updateCanvas(newCanvas);
        if (activeVariationId === variationId) {
          const remainingVariations = newCanvas.variations;
          if (remainingVariations.length > 0) {
            setActiveVariationId(remainingVariations[0].id);
          } else {
            setActiveVariationId(null);
          }
        }
      }
    },
    [canvas, activeVariationId, task?._id], // Removed updateCanvas from deps
  );

  const handleFinetuningChange = useCallback(
    (
      variationId: string,
      key: "brightness" | "contrast" | "saturation",
      value: number,
    ) => {
      if (!canvasRef.current) {
        console.log(" handleFinetuningChange - no canvas ref");
        return;
      }

      // Only update if the value actually changed
      const currentVariation = canvasRef.current.variations.find(
        (v) => v.id === variationId,
      );
      if (currentVariation?.fineTuning?.[key] === value) {
        console.log(
          " handleFinetuningChange - value unchanged, skipping update",
          { variationId, key, value },
        );
        return;
      }

      console.log(" handleFinetuningChange - updating", {
        variationId,
        key,
        value,
      });

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
    },
    [updateCanvas],
  ); // Removed canvas from deps since we're using ref

  const handleCurvesChange = useCallback(
    (
      variationId: string,
      curves: any, // Using any to avoid import cycle or complex type here, validated in component
    ) => {
      if (!canvasRef.current) return;

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
          variation.fineTuning.curves = curves;
        }
      });
      updateCanvas(newCanvas);
    },
    [updateCanvas],
  );

  const handleResetFinetuning = useCallback(() => {
    if (!localActiveVariation || !canvasRef.current) {
      console.log("handleResetFinetuning - no active variation or canvas ref");
      return;
    }

    console.log("handleResetFinetuning - resetting to defaults", {
      localActiveVariation,
    });

    const newCanvas = produce(canvasRef.current, (draft) => {
      const variation = draft.variations.find(
        (v) => v.id === localActiveVariation,
      );
      if (variation) {
        variation.fineTuning = {
          brightness: 100,
          contrast: 100,
          saturation: 100,
          curves: undefined,
        };
      }
    });
    updateCanvas(newCanvas);
  }, [localActiveVariation, updateCanvas]);

  const handleAspectRatioChange = useCallback(
    (newAspectRatio: string) => {
      // Only update aspect ratio for blank variations
      if (activeVariation && activeVariation.status === "blank") {
        setAspectRatio(newAspectRatio);
      }
    },
    [activeVariation, setAspectRatio],
  );

  const handleManualSync = useCallback(() => {
    if (canvas && task?._id) {
      console.log("Manual sync triggered");
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
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `clickatron-variation-${timestamp}.png`;

      // Download with fine-tuning applied
      await downloadImageWithFineTuning(
        imageUrl,
        activeVariation.fineTuning,
        filename,
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4A652] mx-auto mb-4"></div>
          <p className="text-[#7A776E]">Loading Canvas...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      {...fadeIn}
      className="fixed inset-0 bg-[#0B0B0A] flex flex-row gap-0 overflow-hidden h-screen"
    >
      {/* Left Sidebar - Variations + AI Features + Tools */}
      <div
        className="hidden md:flex flex-col h-full flex-shrink-0 w-[260px] bg-[#131312] border-r border-[#282724]/80 relative z-10 overflow-y-auto"
        style={{ marginLeft: "64px" }}
      >
        {/* Variations Gallery */}
        <VariationsGallery
          variations={variations}
          activeVariationId={localActiveVariation}
          onVariationSelect={handleVariationSelect}
          onAddToCompare={() => {}}
          onNewVariation={handleNewVariation}
          onDuplicateVariation={handleDuplicateVariation}
          onDeleteVariation={handleDeleteVariation}
          className=""
        />

        {/* Divider */}
        <div className="mx-3 my-1 border-t border-[#282724]/60" />

        {/* AI Features */}
        <div className="px-3 py-3">
          <div className="text-[10px] font-medium text-[#D4A652] tracking-widest uppercase mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4A652]" />
            AI Features
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setInputMode("sketchToEdit");
                setActiveTool("sketch");
                setSketchTool("pencil");
              }}
              className={`flex flex-col items-start gap-1.5 p-3 rounded-lg border transition-all text-left ${
                inputMode === "sketchToEdit"
                  ? "border-[#D4A652]/30 bg-[#D4A652]/8"
                  : "border-[#282724] bg-[#0F0F0E] hover:border-[#454340]"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Pencil className="h-3.5 w-3.5 text-[#D4A652]" />
                <span className="text-[10px] font-medium tracking-wide text-[#D4A652] uppercase">Draw</span>
              </div>
              <span className="text-[11px] text-[#7A776E] leading-tight">Sketch to Edit</span>
              <span className="text-[9px] text-[#454340]">Draw on canvas to guide AI</span>
            </button>
            <button
              onClick={() => handleGenerativeFillToggle(undefined)}
              className={`flex flex-col items-start gap-1.5 p-3 rounded-lg border transition-all text-left ${
                isSelectionActive
                  ? "border-[#D4A652]/30 bg-[#D4A652]/8"
                  : "border-[#282724] bg-[#0F0F0E] hover:border-[#454340]"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Square className="h-3.5 w-3.5 text-[#D4A652]" />
                <span className="text-[10px] font-medium tracking-wide text-[#D4A652] uppercase">Beta</span>
              </div>
              <span className="text-[11px] text-[#7A776E] leading-tight">Gen Fill</span>
              <span className="text-[9px] text-[#454340]">Select region for AI fill</span>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-3 my-1 border-t border-[#282724]/60" />

        {/* Tools */}
        <div className="px-3 py-3">
          <div className="text-[10px] font-medium text-[#7A776E] tracking-widest uppercase mb-2">Tools</div>
          <div className="flex gap-1.5 flex-wrap">
            {([
              { tool: "pencil" as const, label: "Pencil", icon: "âœï¸" },
              { tool: "eraser" as const, label: "Eraser", icon: "â—¯" },
            ] as const).map(({ tool, label, icon }) => (
              <button
                key={tool}
                onClick={() => {
                  setInputMode("sketchToEdit");
                  setActiveTool("sketch");
                  setSketchTool(tool);
                }}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg border text-[10px] transition-all ${
                  sketchTool === tool && inputMode === "sketchToEdit"
                    ? "border-[#D4A652]/30 bg-[#D4A652]/8 text-[#ECE9E1]"
                    : "border-[#282724] bg-[#0F0F0E] text-[#7A776E] hover:border-[#454340]"
                }`}
              >
                <span className="text-sm">{icon}</span>
                {label}
              </button>
            ))}
          </div>

          {/* Size & Opacity */}
          {inputMode === "sketchToEdit" && (
            <div className="mt-3 space-y-2">
              <div className="text-[10px] font-medium text-[#7A776E] tracking-widest uppercase">Size & Opacity</div>
              <div className="flex items-center gap-1.5">
                {([8, 16, 24, 36] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setEraserSize(size === 8 ? "small" : size === 16 ? "small" : size === 24 ? "medium" : "large")}
                    className="w-6 h-6 rounded-full border border-[#282724] bg-[#0F0F0E] flex items-center justify-center hover:border-[#454340] transition-all"
                  >
                    <span className="rounded-full bg-[#ECE9E1]" style={{ width: size / 4, height: size / 4 }} />
                  </button>
                ))}
              </div>

              {/* Color palette */}
              <div className="text-[10px] font-medium text-[#7A776E] tracking-widest uppercase mt-2">Color</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  { color: "black" as const, hex: "#0B0B0A" },
                  { color: "red" as const, hex: "#D46A5C" },
                  { color: "blue" as const, hex: "#5CB8CC" },
                  { color: "green" as const, hex: "#5EC97E" },
                  { color: "yellow" as const, hex: "#D4A652" },
                ] as const).map(({ color, hex }) => (
                  <button
                    key={color}
                    onClick={() => setPencilColor(color)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      pencilColor === color ? "border-white scale-110" : "border-[#282724] hover:border-[#454340]"
                    }`}
                    style={{ background: hex }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative w-full">
          {/* Top Header */}
          <div className="p-4 border-b border-[#1C1B19]/80 bg-[#0B0B0A]/90 relative z-10 flex flex-col items-center gap-2">
            <div className="flex flex-col items-center pb-6 md:pb-0">
              {isEditingTitle ? (
                <Input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onBlur={() => {
                    saveTitle(editedTitle);
                    setIsEditingTitle(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      saveTitle(editedTitle);
                      setIsEditingTitle(false);
                    } else if (e.key === 'Escape') {
                      setEditedTitle(task?.title || videoIdea);
                      setIsEditingTitle(false);
                    }
                  }}
                  className="text-lg font-semibold text-[#ECE9E1] text-center"
                  autoFocus
                />
              ) : (
                <h2
                  className="text-lg font-semibold text-[#ECE9E1] cursor-pointer hover:bg-[#1B1A18]/50 rounded px-2 py-1 text-center"
                  onClick={() => {
                    setEditedTitle(task?.title || videoIdea);
                    setIsEditingTitle(true);
                  }}
                >
                  {task?.title || videoIdea}
                </h2>
              )}
              <SaveStatusIndicator
                isSaving={isSaving}
                saveError={saveError}
                lastSaved={lastSaved}
              />
            </div>
            {process.env.NODE_ENV === 'development' && (
              <button
                onClick={handleManualSync}
                className="text-[11px] bg-blue-600 text-white px-2 py-1 rounded mt-1"
              >
                Manual Sync (Debug)
              </button>
            )}
        {/* Mobile Bottom Navigation */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0B0A]/95 border-t border-[#1C1B19]/80 p-3 flex justify-between items-center h-16 gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobilePanel('gallery')}
            className={`p-3 h-12 w-12 bg-[#1B1A18]/50 hover:bg-[#282724]/70 shadow-lg rounded-full transition-all ${mobilePanel === 'gallery' ? 'bg-[#282724] text-white shadow-xl' : 'text-[#B5B2A8] hover:text-white'}`}
          >
            <Grid className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobilePanel('fine-tune')}
            className={`p-3 h-12 w-12 bg-[#1B1A18]/50 hover:bg-[#282724]/70 shadow-lg rounded-full transition-all ${mobilePanel === 'fine-tune' ? 'bg-[#282724] text-white shadow-xl' : 'text-[#B5B2A8] hover:text-white'}`}
          >
            <Sliders className="h-5 w-5" />
          </Button>
        </div>
  
        </div>
  
        {/* Canvas Display Area */}
        <div className="flex flex-1 overflow-hidden relative bg-[#131312]/20 h-full">
          {/* Main Canvas Container */}
          <div className="flex-1 flex items-center justify-center overflow-hidden relative h-full">
            {/* Canvas Actions - Top Center - Only show for completed variations */}
            {activeVariation?.status === "completed" && (
              <div
                className="absolute top-6 left-1/2 transform -translate-x-1/2 z-20"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCanvasClickOutside();
                }}
              >
                <CanvasActions
                  onZoomIn={() => imageRef.current?.zoomIn(0.3)}
                  onZoomOut={() => imageRef.current?.zoomOut(0.3)}
                  onResetZoom={() => imageRef.current?.resetTransform()}
                  onDownload={handleDownload}
                  onGenerativeFill={handleGenerativeFillToggle}
                  isGenerativeFillActive={isSelectionActive}
                  // onShare={() => console.log("Share")}
                />
              </div>
            )}

            {/* Image Display with proper sizing */}
            <div
              ref={imageContainerRef}
              className="relative w-full h-full flex items-center justify-center"
            >
              {!activeVariation ? (
                // No variation selected
                <NoVariationSelected aspectRatio={currentAspectRatio} />
              ) : activeVariation.status === "blank" &&
                !activeVariation.imageRef ? (
                // Blank canvas with proper aspect ratio
                <BlankCanvas aspectRatio={currentAspectRatio} />
              ) : activeVariation.status === "failed" ? (
                // Failed variation - Enhanced error state with retry option
                <div
                  className="bg-gradient-to-br from-red-900/20 to-red-800/10 border-2 border-dashed border-red-600/40 flex items-center justify-center rounded-xl transition-all duration-300 relative overflow-hidden"
                  style={{
                    width: `${800}px`,
                    height: `${450}px`,
                    minWidth: "300px",
                    minHeight: "200px",
                  }}
                >
                  {/* Ambient background gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-orange-500/5 opacity-40" />

                  <div className="text-center relative z-10 p-8">
                    {/* Error icon with enhanced styling */}
                    <div className="relative mb-6">
                      <div className="absolute inset-0 w-16 h-16 mx-auto rounded-full bg-red-500/20 blur-xl" />
                      <div className="relative w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center ring-2 ring-red-400/30">
                        <AlertTriangle className="h-8 w-8 text-red-400" />
                      </div>

                      <div className="space-y-4">
                        <div className="text-red-300 text-[18px] font-semibold">
                          Generation Failed
                        </div>
                        <div className="text-red-400/70 text-sm max-w-md mx-auto">
                          Something went wrong while generating this variation. This could be due to content policy restrictions or technical issues.
                        </div>

                        {/* Retry — a failed generation must never be a dead end. */}
                        {activeVariation.prompt ? (
                          <div className="mt-6">
                            <button
                              onClick={() => handleAIGenerate(activeVariation.prompt)}
                              disabled={newVariationCreating}
                              className="px-6 py-3 bg-[#D46A5C] hover:bg-[#c05c4f] disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all duration-200 shadow-lg"
                            >
                              {newVariationCreating ? "Retrying…" : "Try Again"}
                            </button>
                          </div>
                        ) : null}

                        <div className="mt-4 text-[11px] text-red-500/60">
                          Or adjust the prompt below and generate again
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <ImageDisplay
                    key={localActiveVariation}
                    ref={imageRef}
                    imageRef={activeVariation.imageRef}
                    status={activeVariation.status}
                    variationId={localActiveVariation!}
                    fineTuning={activeVariation.fineTuning}
                    aspectRatio={aspectRatio}
                    className="max-w-[90%] max-h-[90%] object-contain rounded-lg shadow-2xl"
                    onImageLoad={(dims) => setImageNaturalSize(dims)}
                    isFillGenerating={isGenerativeFillGenerating}
                  />

                  <SketchOverlay
                    ref={sketchOverlayRef}
                    width={Math.max(1, imageContainerSize.width)}
                    height={Math.max(1, imageContainerSize.height)}
                    tool={(sketchTool || "pencil") as SketchTool}
                    pencilColor={pencilColor}
                    eraserSize={eraserSize}
                    isActive={activeTool === "sketch" && inputMode === "sketchToEdit"}
                  />

                  <ImageOverlayManager
                    ref={imageOverlayManagerRef}
                    width={Math.max(1, imageContainerSize.width)}
                    height={Math.max(1, imageContainerSize.height)}
                    isActive={activeTool === "image" && inputMode === "sketchToEdit"}
                    onImageSelected={setSelectedImageOverlayId}
                    onImageAdded={() => setActiveTool("image")}
                  />

                  <SelectionTool
                    imageWidth={Math.max(1, imageContainerSize.width)}
                    imageHeight={Math.max(1, imageContainerSize.height)}
                    originalWidth={imageNaturalSize?.width}
                    originalHeight={imageNaturalSize?.height}
                    isActive={isSelectionActive}
                    selectionMode={selectionMode}
                    onSelectionModeChange={setSelectionMode}
                    onCancel={() => handleGenerativeFillToggle(undefined)}
                    onSelectionComplete={(sel, maskDataUrl, pos) => {
                      setSelectionBounds(sel);
                      setSelectionMaskDataUrl(maskDataUrl);
                      setInlinePromptPos(pos || null);
                    }}
                  />

                  {inlinePromptPos && selectionBounds && selectionMaskDataUrl && (
                    <GenerativeFillInline
                      position={inlinePromptPos}
                      isGenerating={isGenerativeFillGenerating}
                      imageWidth={Math.max(1, imageContainerSize.width)}
                      imageHeight={Math.max(1, imageContainerSize.height)}
                      onCancel={() => handleGenerativeFillToggle(undefined)}
                      onGenerate={handleGenerativeFillGenerate}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Panels - Toggled full-width sections below canvas */}
        {mobilePanel === "gallery" && (
          <div className="fixed inset-x-0 top-[6rem] bottom-20 z-30 border-t border-[#1C1B19]/80 bg-[#131312] md:hidden overflow-y-auto pt-4">
            <VariationsGallery
              variations={variations}
              activeVariationId={localActiveVariation}
              onVariationSelect={handleVariationSelect}
              onAddToCompare={() => {}}
              onNewVariation={handleNewVariation}
              onDuplicateVariation={handleDuplicateVariation}
              onDeleteVariation={handleDeleteVariation}
              mobile={true}
              onClose={() => setMobilePanel("none")}
              className="w-[90vw]"
            />
          </div>
        )}
        <AnimatePresence mode="wait">
          {mobilePanel === "fine-tune" && activeVariation?.fineTuning && (
            <motion.div
              key="controls"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="fixed inset-x-0 top-[6rem] bottom-20 z-30 border-t border-[#1C1B19]/80 bg-[#131312] md:hidden overflow-hidden flex flex-col max-h-[calc(100vh-10rem)]"
            >
              <div className="flex items-center justify-between p-4 border-b border-[#1C1B19]/80 bg-[#131312]/50">
                <h3 className="text-sm font-medium text-[#ECE9E1]">
                  Fine Tuning
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobilePanel("none")}
                  className="p-1 h-6 w-6 text-[#7A776E] hover:text-[#ECE9E1]"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                <CanvasControls
                  brightness={activeVariation.fineTuning.brightness}
                  contrast={activeVariation.fineTuning.contrast}
                  saturation={activeVariation.fineTuning.saturation}
                  curves={activeVariation.fineTuning.curves}
                  aspectRatio={aspectRatio}
                  isBlankVariation={activeVariation.status === "blank"}
                  onBrightnessChange={(val) =>
                    handleFinetuningChange(
                      localActiveVariation!,
                      "brightness",
                      val,
                    )
                  }
                  onContrastChange={(val) =>
                    handleFinetuningChange(
                      localActiveVariation!,
                      "contrast",
                      val,
                    )
                  }
                  onSaturationChange={(val) =>
                    handleFinetuningChange(
                      localActiveVariation!,
                      "saturation",
                      val,
                    )
                  }
                  onCurvesChange={(curves) =>
                    activeVariation &&
                    handleCurvesChange(activeVariation.id, curves)
                  }
                  onAspectRatioChange={handleAspectRatioChange}
                  onReset={handleResetFinetuning}
                  disabled={activeVariation?.status !== "completed"}
                  className="h-full flex-1"
                  mobile
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom AI Command Console — hidden only WHILE generating. It must stay
            visible on failed variations so the user can rewrite the prompt and
            recover; hiding it made every failure a dead end. */}
        {activeVariation?.status !== "generating" && (
          <div className="relative z-20 w-full flex-shrink-0">
            {activeVariation?.status === "blank" ? (
              <NewVariationConsole
                onGenerate={handleAIGenerate}
                isGenerating={newVariationCreating}
                className="border-t border-[#1C1B19]/80 mr-0 mx-auto"
                referenceImageCount={referenceImageCount}
                onReferenceImageCountChange={setReferenceImageCount}
              />
            ) : (
              <AICommandConsole
                onGenerate={handleAIGenerate}
                onSketchToEditSubmit={handleSketchToEditSubmit}
                isGenerating={newVariationCreating}
                className="border-t border-[#1C1B19]/80 mr-0 mx-auto"
                referenceImageCount={referenceImageCount}
                onReferenceImageCountChange={setReferenceImageCount}
                currentImageUrl={activeVariation?.imageRef || ''}
                onUploadImage={handleUploadImage}
                isUploadingImage={isUploadingImage}
                inputMode={inputMode}
                onInputModeChange={(mode) => {
                  setInputMode(mode);
                  if (mode === "sketchToEdit") {
                    setActiveTool("sketch");
                    setSketchTool((prev) => prev || "pencil");
                  } else {
                    setActiveTool(null);
                    setSketchTool(null);
                  }
                }}
                sketchTool={sketchTool || "pencil"}
                onSketchToolChange={handleSketchToolChange}
                pencilColor={pencilColor}
                onPencilColorChange={setPencilColor}
                eraserSize={eraserSize}
                onEraserSizeChange={setEraserSize}
                onAddOverlayImage={handleAddOverlayImage}
              />
            )}
          </div>
        )}
      </div>

      {/* Right Sidebar - Full height, next to main canvas */}
      <div className="hidden md:flex flex-col h-full flex-shrink-0 w-80 bg-[#131312] border-l border-[#282724]/80 shadow-2xl">
        {activeVariation?.fineTuning ? (
          <CanvasControls
            brightness={activeVariation.fineTuning.brightness}
            contrast={activeVariation.fineTuning.contrast}
            saturation={activeVariation.fineTuning.saturation}
            curves={activeVariation.fineTuning.curves}
            aspectRatio={aspectRatio}
            isBlankVariation={activeVariation.status === "blank"}
            onBrightnessChange={(val) =>
              handleFinetuningChange(localActiveVariation!, "brightness", val)
            }
            onContrastChange={(val) =>
              handleFinetuningChange(localActiveVariation!, "contrast", val)
            }
            onSaturationChange={(val) =>
              handleFinetuningChange(localActiveVariation!, "saturation", val)
            }
            onCurvesChange={(curves) =>
              activeVariation && handleCurvesChange(activeVariation.id, curves)
            }
            onAspectRatioChange={handleAspectRatioChange}
            onReset={handleResetFinetuning}
            disabled={activeVariation?.status !== "completed"}
            className="flex-1"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center text-[#7A776E]">
              <Settings className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p className="text-[11px]">
                {!activeVariation
                  ? "Select a variation to adjust"
                  : "No adjustments available"}
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
