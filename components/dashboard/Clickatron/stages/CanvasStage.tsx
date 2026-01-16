"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CanvasActions } from "../canvas/CanvasActions";
import { VariationsGallery } from "../canvas/VariationsGallery";
import { AICommandConsole } from "../canvas/AICommandConsole";
import { NewVariationConsole } from "../canvas/NewVariationConsole";
import { Input } from "@/components/ui/input";
import { Grid, Sliders, X } from "lucide-react";
import useClickatronStore from "@/stores/useCanvasStore";
import { ImageDisplay } from "../canvas/ImageDisplay";
import { SaveStatusIndicator } from "../canvas/SaveStatusIndicator";
import { SelectionTool } from "../canvas/SelectionTool";
import { GenerativeFillPanel } from "../canvas/GenerativeFillPanel";
import { useDebounce } from "use-debounce";
import { produce } from "immer";
import { CanvasControls } from "../canvas/CanvasControls";
import { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Settings, AlertTriangle } from "lucide-react";
import { downloadImageWithFineTuning, getImageUrl } from "@/lib/frontend/services/clickatron-download";
import { pollVariationCompletion } from "@/lib/frontend/services/clickatron";
import { GENERATIVE_FILL_SYSTEM_PROMPT } from "@/lib/config/clickatron-models";
import { Variation } from "@/types/clickatron";

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
          Use the AI console below to generate an image
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
  const { task, updateCanvas, syncCanvas, isSaving, saveError, lastSaved, loadSession, updateVariation } =
    useClickatronStore();
  const [activeVariationId, setActiveVariationId] = useState<string | null>(
    null
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [mobilePanel, setMobilePanel] = useState<'none' | 'gallery' | 'fine-tune'>('none');

  const panelVariants = {
    hidden: { y: '100%', opacity: 0 },
    visible: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0 }
  };
  const imageRef = useRef<ReactZoomPanPinchRef>(null);
  const lastSyncedCanvasRef = useRef<string | null>(null);
  const isInitialMount = useRef(true);
  const renderCount = useRef(0);
  const [localActiveVariation, setLocalActiveVariation] = useState(activeVariationId);
  const [referenceImageCount, setReferenceImageCount] = useState<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isGenerativeFillMode, setIsGenerativeFillMode] = useState(false);
  const [selectionBounds, setSelectionBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [isFillGenerating, setIsFillGenerating] = useState(false);
  const [isFillPanelOpen, setIsFillPanelOpen] = useState(false);
  const [imageNaturalDimensions, setImageNaturalDimensions] = useState<{ width: number; height: number } | null>(null);
  const [newVariationCreating, setNewVariationCreating] = useState<boolean>(false);

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
  const [aspectRatio, setAspectRatio] = useState<string>(currentAspectRatio);

  const [debouncedCanvas] = useDebounce(canvas, 1000);

  // Update canvasRef when canvas changes
  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  // Check for generating variations on component mount and start polling
  useEffect(() => {
    if (task?._id && variations.length > 0) {
      const generatingVariations = variations.filter(v => v.status === 'generating');
      if (generatingVariations.length > 0) {
        console.log('Found generating variations on mount, starting polling:', generatingVariations.map(v => v.id));
        abortControllerRef.current = new AbortController();
        generatingVariations.forEach(variation => {
          pollVariationCompletion(
            task._id!,
            variation.id,
            loadSession,
            () => useClickatronStore.getState().task,
            undefined,
            2000,
            abortControllerRef.current!.signal
          ).catch(err => {
            if (err.message !== 'Polling aborted') {
              console.error('Polling error:', err);
            }
          });
        });
      }
    }
  }, []); // Empty dependency array to run only once on mount

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        console.log('Aborting polling on unmount');
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Update active variation if none is selected
  useEffect(() => {
    if (!localActiveVariation && variations.length > 0) {
      setLocalActiveVariation(variations[0].id);
      setActiveVariationId(variations[0].id); // Keep both states in sync
    }
  }, [variations, localActiveVariation]);

  // Measure container dimensions for precise alignment
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (!containerRef.current) return;
      setContainerDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight
      });
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // Calculate synchronized image dimensions
  const imageDisplayDimensions = useMemo(() => {
    if (!containerDimensions.width || !containerDimensions.height) return null;
    // Use 0.95 factor to leave a small margin (similar to previous max-w-[90%])
    return getAspectRatioDimensions(aspectRatio, containerDimensions.width * 0.95, containerDimensions.height * 0.95);
  }, [aspectRatio, containerDimensions]);


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

  // Update aspect ratio when active variation changes (only for blank variations)
  useEffect(() => {
    if (activeVariation && activeVariation.status === "blank") {
      setAspectRatio(activeVariation.aspectRatio);
    }
  }, [activeVariation]);

  const handleVariationSelect = useCallback((variationId: string) => {
    setLocalActiveVariation(variationId);
    setActiveVariationId(variationId);
  }, [setActiveVariationId]);

  const handleAIGenerate = async (
    prompt: string,
    referenceImages?: File[],
    modelId?: string
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
      formData.append("fineTuning", JSON.stringify({ brightness: 100, contrast: 100, saturation: 100 }));
      formData.append("metadata", JSON.stringify({ aspectRatio: aspectRatio }));
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
            "Idempotency-Key": idempotencyKey
          },
          body: formData,
        }
      );
  
      if (!response.ok) {
        throw new Error("Failed to generate variation");
      }
  
      const data = await response.json();
  
      // Replace TEMP variation with real backend variation
      if (data.variation) {
        const replacedCanvas = produce(canvasWithTemp, (draft) => {
          const index = draft.variations.findIndex(
            (v) => v.id === tempVariationId
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
  
      // Poll for completion
      await pollVariationCompletion(
        task._id,
        data.variationId,
        loadSession,
        () => useClickatronStore.getState().task,
        () => {
          // Trigger a re-render of LimitDisplay components by updating a dummy state
          // This is a simple way to force components to re-fetch their data
          window.dispatchEvent(new CustomEvent('clickatron-usage-updated'));
        },
        2000,
        abortControllerRef.current?.signal
      ).catch(err => {
        if (err.message !== 'Polling aborted') {
          console.error('Polling error in handleAIGenerate:', err);
        }
      });

    } catch (error) {
      console.error("Error generating variation:", error);
  
      // Rollback TEMP variation on failure
      const rollbackCanvas = produce(canvas, (draft) => {
        draft.variations = draft.variations.filter(
          (v) => v.id !== tempVariationId
        );
      });
  
      updateCanvas(rollbackCanvas);
      setLocalActiveVariation(localActiveVariation);
      setActiveVariationId(localActiveVariation);
    } finally {
      setNewVariationCreating(false);
    }
  };

  const saveTitle = async (newTitle: string) => {
    if (!task?._id || !newTitle.trim()) return;

    try {
      const response = await fetch(`/api/services/clickatron/session/${task._id}/rename`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newTitle.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to rename session');
      }

      const data = await response.json();

      // Update the task in the store with the new title
      if (task && task.details) {
        const updatedTask = {
          ...task,
          title: data.session.title
        };
        // We need to update the task in the store
        // Since we don't have a direct method to update just the title,
        // we'll reload the session to get the updated data
        await loadSession(task._id);
      }
    } catch (error) {
      console.error('Error saving title:', error);
    }
  };

  // Handle Generative Fill generate action
  const handleGenerativeFillGenerate = async (prompt: string, modelId: string) => {
    // Use localActiveVariation as fallback if global activeVariationId is missing
    const effectiveVariationId = activeVariationId || localActiveVariation;

    if (!task?._id || !effectiveVariationId || !selectionBounds || !maskDataUrl) {
      const errorMsg = `Missing data: Task=${!!task?._id}, Var=${!!effectiveVariationId}, Sel=${!!selectionBounds}, MaskLength=${maskDataUrl?.length || 0}`;
      console.error(errorMsg);
      alert("Error: " + errorMsg + ". Please try refreshing the page or re-selecting the area.");
      return;
    }

    // Capture current selection data before closing the UI
    const currentSelectionBounds = selectionBounds;
    const currentMaskDataUrl = maskDataUrl;

    // Close the UI immediately to allow uninterrupted work
    setIsFillPanelOpen(false);
    setIsGenerativeFillMode(false);
    setSelectionBounds(null);
    setMaskDataUrl(null);
    setIsFillGenerating(true);

    // Background processing
    (async () => {
      let newVariationId: string | null = null;
      
      try {
        const idempotencyKey = `fill_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        const formData = new FormData();
        const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${prompt}`;
        formData.append('prompt', fullPrompt);
        formData.append('modelId', modelId);
        formData.append('variationId', effectiveVariationId);
        formData.append('selectionBounds', JSON.stringify(currentSelectionBounds));
        formData.append('fineTuning', JSON.stringify({ brightness: 100, contrast: 100, saturation: 100 }));
        formData.append('metadata', JSON.stringify({ aspectRatio }));

        // Convert data URL to Blob
        const res = await fetch(currentMaskDataUrl);
        const maskBlob = await res.blob();
        formData.append('mask', new File([maskBlob], 'mask.png', { type: 'image/png' }));

        const response = await fetch(`/api/services/clickatron/session/${task._id}/generative-fill`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || errorData.message || 'Failed to queue generative fill';
          const errorDetails = errorData.details ? JSON.stringify(errorData.details) : '';
          console.error('Server error details:', errorData);
          throw new Error(`${errorMessage} ${errorDetails}`);
        }

        const data = await response.json();
        newVariationId = data.variationId;

        // IMMEDIATELY create optimistic variation to eliminate gap
        if (newVariationId && canvas) {
          const now = new Date();
          const optimisticVariation: Variation = {
            id: newVariationId,
            prompt: fullPrompt,
            status: "generating",
            imageRef: activeVariation?.imageRef ?? "",
            thumbnailRef: activeVariation?.thumbnailRef ?? "",
            aspectRatio,
            fineTuning: {
              brightness: 100,
              contrast: 100,
              saturation: 100,
            },
            createdAt: now,
            updatedAt: now,
            parentVariationId: effectiveVariationId,
            modelId,
            metadata: { type: "generative-fill" },
          };

          const optimisticCanvas = produce(canvas, (draft) => {
            // Check if variation already exists
            const existingIndex = draft.variations.findIndex(v => v.id === newVariationId);
            if (existingIndex !== -1) {
              // Update existing
              draft.variations[existingIndex] = optimisticVariation;
            } else {
              // Add new variation at the top
              draft.variations.unshift(optimisticVariation);
            }
          });

          updateCanvas(optimisticCanvas);
          
          // Set as active variation IMMEDIATELY
          setLocalActiveVariation(newVariationId);
          setActiveVariationId(newVariationId);
          
          // Stop the fill generating loader immediately since we now show the variation
          setIsFillGenerating(false);
        }
        
        // Start polling for completion in background
        if (newVariationId) {
          await pollVariationCompletion(
            task._id!,
            newVariationId,
            loadSession,
            () => useClickatronStore.getState().task,
            () => window.dispatchEvent(new CustomEvent('clickatron-usage-updated')),
            2000,
            abortControllerRef.current?.signal
          ).catch(err => {
            if (err.message !== 'Polling aborted') {
              console.error('Polling error in handleGenerativeFillGenerate:', err);
            }
          });
        }
      } catch (err) {
        console.error('Generative fill background task failed:', err);

        // Remove the optimistic variation if it was created
        if (newVariationId && canvas) {
          const rollbackCanvas = produce(canvas, (draft) => {
            draft.variations = draft.variations.filter(
              (v) => v.id !== newVariationId
            );
          });
      
          updateCanvas(rollbackCanvas);
          
          // Restore previous active variation
          setLocalActiveVariation(effectiveVariationId);
          setActiveVariationId(effectiveVariationId);
        }

        // Show error
        alert(err instanceof Error ? err.message : String(err));
      } finally {
        // Ensure loader is stopped
        setIsFillGenerating(false);
      }
    })();
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
      fineTuning: { brightness: 10, contrast: 100, saturation: 100 },
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
    async (variationId: string) => {
      if (!canvas || !task?._id) return;

      try {
        const response = await fetch(`/api/services/clickatron/session/${task._id}/variation/${variationId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete variation');
        }

        // Local update after successful API call
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
      } catch (error) {
        console.error('Error deleting variation:', error);
        // Optionally, still do local delete or show error toast
        // For now, local delete to maintain optimistic UI
        const newCanvas = produce(canvas, (draft) => {
          const variationIndex = draft.variations.findIndex(
            (v) => v.id === variationId
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
    [canvas, activeVariationId, task?._id] // Removed updateCanvas from deps
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

  const handleCurvesChange = useCallback((
    variationId: string,
    curves: any // Using any to avoid import cycle or complex type here, validated in component
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
  }, [updateCanvas]);

  const handleResetFinetuning = useCallback(() => {
    if (!localActiveVariation || !canvasRef.current) {
      console.log('handleResetFinetuning - no active variation or canvas ref');
      return;
    }

    console.log('handleResetFinetuning - resetting to defaults', { localActiveVariation });

    const newCanvas = produce(canvasRef.current, (draft) => {
      const variation = draft.variations.find((v) => v.id === localActiveVariation);
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

  const handleAspectRatioChange = useCallback((newAspectRatio: string) => {
    // Only update aspect ratio for blank variations
    if (activeVariation && activeVariation.status === "blank") {
      setAspectRatio(newAspectRatio);
    }
  }, [activeVariation, setAspectRatio]);

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
      className="fixed inset-0 bg-zinc-950 flex flex-row gap-0 overflow-hidden h-screen"
    >
      {/* Left Sidebar - Variations Gallery - Hidden on mobile */}
      <div className="hidden md:flex flex-col h-full flex-shrink-0 w-80 bg-zinc-900/95 border-r border-zinc-700/80 relative z-10" style={{ marginLeft: "64px" }}>
        <VariationsGallery
          variations={variations}
          activeVariationId={localActiveVariation}
          onVariationSelect={handleVariationSelect}
          onAddToCompare={() => { }}
          onNewVariation={handleNewVariation}
          onDuplicateVariation={handleDuplicateVariation}
          onDeleteVariation={handleDeleteVariation}
          className="flex-1"
        />
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative w-full">
        {/* Top Header */}
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm relative z-10 flex flex-col items-center gap-2">
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
                className="text-lg font-semibold text-zinc-100 text-center"
                autoFocus
              />
            ) : (
              <h2
                className="text-lg font-semibold text-zinc-100 cursor-pointer hover:bg-zinc-800/50 rounded px-2 py-1 text-center"
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
              className="text-xs bg-blue-600 text-white px-2 py-1 rounded mt-1"
            >
              Manual Sync (Debug)
            </button>
          )}
          {/* Mobile Bottom Navigation */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 p-3 flex justify-between items-center h-16 gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobilePanel('gallery')}
              className={`p-3 h-12 w-12 bg-zinc-800/50 hover:bg-zinc-700/70 shadow-lg rounded-full transition-all ${mobilePanel === 'gallery' ? 'bg-zinc-700 text-white shadow-xl' : 'text-zinc-300 hover:text-white'}`}
            >
              <Grid className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobilePanel('fine-tune')}
              className={`p-3 h-12 w-12 bg-zinc-800/50 hover:bg-zinc-700/70 shadow-lg rounded-full transition-all ${mobilePanel === 'fine-tune' ? 'bg-zinc-700 text-white shadow-xl' : 'text-zinc-300 hover:text-white'}`}
            >
              <Sliders className="h-5 w-5" />
            </Button>
          </div>

        </div>

        {/* Canvas Display Area */}
        <div className="flex flex-1 overflow-hidden relative bg-zinc-900/20 h-full">
          {/* Main Canvas Container */}
          <div className="flex-1 flex items-center justify-center overflow-hidden relative h-full">
            {/* Canvas Actions - Top Center - Only show for completed variations */}
            {activeVariation?.status === "completed" && (
              <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-20">
                <CanvasActions
                  onZoomIn={() => imageRef.current?.zoomIn(0.3)}
                  onZoomOut={() => imageRef.current?.zoomOut(0.3)}
                  onResetZoom={() => imageRef.current?.resetTransform()}
                  onDownload={handleDownload}
                // onShare={() => console.log("Share")}
                />
              </div>
            )}

            {/* Image Display with proper sizing */}
            <div
              ref={containerRef}
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
                  className="bg-gradient-to-br from-red-900/20 to-red-80/10 border-2 border-dashed border-red-60/40 flex items-center justify-center rounded-xl transition-all duration-300 relative overflow-hidden"
                  style={{
                    width: `${800}px`,
                    height: `${450}px`,
                    minWidth: "300px",
                    minHeight: "200px",
                  }}
                >
                  {/* Ambient background gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-red-50/5 to-orange-500/5 opacity-40" />

                  <div className="text-center relative z-10 p-8">
                    {/* Error icon with enhanced styling */}
                    <div className="relative mb-6">
                      <div className="absolute inset-0 w-16 h-16 mx-auto rounded-full bg-red-500/20 blur-xl" />
                      <div className="relative w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center ring-2 ring-red-400/30">
                        <AlertTriangle className="h-8 w-8 text-red-400" />
                      </div>

                      <div className="space-y-4">
                        <div className="text-red-300 text-xl font-semibold">
                          Generation Failed
                        </div>
                        <div className="text-red-400/70 text-sm max-w-md mx-auto">
                          {activeVariation.error || "Something went wrong while generating this variation. This could be due to content policy restrictions or technical issues."}
                        </div>

                        {/* Retry button */}
                        {/* <div className="mt-6">
                          <button
                            onClick={() => handleAIGenerate(activeVariation.prompt)}
                            className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl text-sm font-medium transition-all duration-200 shadow-lg"
                          >
                            Try Again
                          </button>
                        </div> */}

                        <div className="mt-4 text-xs text-red-50/60">
                          Consider adjusting your prompt or trying different settings
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div 
                  className="relative"
                  style={imageDisplayDimensions ? {
                    width: `${imageDisplayDimensions.width}px`,
                    height: `${imageDisplayDimensions.height}px`,
                  } : undefined}
                >
                  {/* Generative Fill toggle */}
                  {activeVariation.status === 'completed' && (
                    <div className="absolute top-4 right-4 z-[40]">
                      <Button
                        variant="default"
                        size="sm"
                         onClick={() => {
                          setIsGenerativeFillMode((prev) => !prev);
                          setSelectionBounds(null);
                          setMaskDataUrl(null);
                        }}
                        className={`${isGenerativeFillMode
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-purple-600 hover:bg-purple-700'
                          } shadow-lg`}
                      >
                        ✨ Generative Fill
                      </Button>
                    </div>
                  )}

                  <ImageDisplay
                    key={localActiveVariation}
                    ref={imageRef}
                    imageRef={activeVariation.imageRef}
                    prompt={activeVariation.prompt}
                    status={activeVariation.status}
                    variationId={localActiveVariation!}
                    fineTuning={activeVariation.fineTuning}
                    aspectRatio={aspectRatio}
                    className="object-contain rounded-lg shadow-2xl"
                    width={imageDisplayDimensions?.width}
                    height={imageDisplayDimensions?.height}
                    interactive={!isGenerativeFillMode}
                    onImageLoad={setImageNaturalDimensions}
                    isFillGenerating={isFillGenerating}
                  />

                  {/* Selection overlay */}
                  {isGenerativeFillMode && activeVariation.status === 'completed' && imageDisplayDimensions && (
                    <div className="absolute inset-0 pointer-events-none z-[50]">
                      <div 
                        className={`absolute ${isFillPanelOpen ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'} transition-opacity duration-200`}
                        style={{
                        width: `${imageDisplayDimensions.width}px`,
                        height: `${imageDisplayDimensions.height}px`,
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)'
                      }}>
                        <SelectionTool
                          imageWidth={imageDisplayDimensions.width}
                          imageHeight={imageDisplayDimensions.height}
                          originalWidth={imageNaturalDimensions?.width}
                          originalHeight={imageNaturalDimensions?.height}
                          isActive={!isFillPanelOpen}
                          onSelectionComplete={(sel, maskUrl) => {
                            setSelectionBounds(sel);
                            setMaskDataUrl(maskUrl);
                            setIsFillPanelOpen(true);
                          }}
                          onCancel={() => {
                            setIsGenerativeFillMode(false);
                            setSelectionBounds(null);
                            setMaskDataUrl(null);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Mobile Panels - Toggled full-width sections below canvas */}
        {mobilePanel === 'gallery' && (
          <div className="fixed inset-x-0 top-[6rem] bottom-20 z-30 border-t border-zinc-800/80 bg-zinc-900 md:hidden overflow-y-auto pt-4">
            <VariationsGallery
              variations={variations}
              activeVariationId={localActiveVariation}
              onVariationSelect={handleVariationSelect}
              onAddToCompare={() => { }}
              onNewVariation={handleNewVariation}
              onDuplicateVariation={handleDuplicateVariation}
              onDeleteVariation={handleDeleteVariation}
              mobile={true}
              onClose={() => setMobilePanel('none')}
              className="w-[90vw]"
            />
          </div>
        )}
        <AnimatePresence mode="wait">
          {mobilePanel === 'fine-tune' && activeVariation?.fineTuning && (
            <motion.div
              key="controls"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="fixed inset-x-0 top-[6rem] bottom-20 z-30 border-t border-zinc-800/80 bg-zinc-900 md:hidden overflow-hidden flex flex-col max-h-[calc(100vh-10rem)]"
            >
              <div className="flex items-center justify-between p-4 border-b border-zinc-800/80 bg-zinc-900/50">
                <h3 className="text-sm font-medium text-zinc-200">Fine Tuning</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobilePanel('none')}
                  className="p-1 h-6 w-6 text-zinc-400 hover:text-zinc-200"
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
                  className="h-full flex-1"
                  mobile
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom AI Command Console - Hide for generating and failed variations */}
        {activeVariation?.status !== "generating" && activeVariation?.status !== "failed" && (
          <div className="relative z-20 w-full flex-shrink-0">
            {activeVariation?.status === "blank" ? (
              <NewVariationConsole
                onGenerate={handleAIGenerate}
                isGenerating={newVariationCreating}
                className="border-t border-zinc-800/80 mr-0 mx-auto"
                referenceImageCount={referenceImageCount}
                onReferenceImageCountChange={setReferenceImageCount}
              />
            ) : (
              <AICommandConsole
                onGenerate={handleAIGenerate}
                isGenerating={newVariationCreating}
                className="border-t border-zinc-800/80 mr-0 mx-auto"
                referenceImageCount={referenceImageCount}
                onReferenceImageCountChange={setReferenceImageCount}
                currentImageUrl={activeVariation?.imageRef || ''}
              />
            )}
          </div>
        )}
      </div>

      {/* Right Sidebar - Full height, next to main canvas */}
      <div className="hidden md:flex flex-col h-full flex-shrink-0 w-80 bg-zinc-900/95 backdrop-blur-xl border-l border-zinc-700/80 shadow-2xl">
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
            <div className="text-center text-zinc-500">
              <Settings className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p className="text-xs">
                {!activeVariation
                  ? "Select a variation to adjust"
                  : "No adjustments available"}
              </p>
            </div>
          </div>
        )}
      </div>
      <GenerativeFillPanel
        isOpen={isFillPanelOpen}
        onClose={() => setIsFillPanelOpen(false)}
        onGenerate={handleGenerativeFillGenerate}
        isGenerating={isFillGenerating}
      />
    </motion.div>
  );
}
