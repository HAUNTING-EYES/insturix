"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Wand2, Loader2, Send, X, Layers } from "lucide-react";
import { getAvailableModels } from "@/lib/config/clickatron-models";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GenerativeFillInlineProps {
  position: { x: number; y: number };
  onGenerate: (prompt: string, modelId: string) => Promise<void>;
  onCancel: () => void;
  isGenerating: boolean;
  imageWidth: number;
  imageHeight: number;
}

export const GenerativeFillInline: React.FC<GenerativeFillInlineProps> = ({
  position,
  onGenerate,
  onCancel,
  isGenerating,
  imageWidth,
  imageHeight,
}) => {
  const [prompt, setPrompt] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get available inpainting models
  const availableModels = useMemo(() => {
    return getAvailableModels("generativeFill");
  }, []);

  // Set default model when models are loaded
  useEffect(() => {
    if (availableModels.length > 0 && !selectedModelId) {
      // Default to Seedream 5.0 Lite
      const defaultModel =
        availableModels.find((m) => m.id === "fal-ai/bytedance/seedream/v5/lite/edit") ||
        availableModels[0];
      setSelectedModelId(defaultModel.id);
    }
  }, [availableModels, selectedModelId]);

  const handleGenerate = async () => {
    if (!prompt.trim() || !selectedModelId || isGenerating) return;
    try {
      console.log('[GenerativeFillInline] Generating with model:', selectedModelId, 'prompt:', prompt.trim());
      await onGenerate(prompt.trim(), selectedModelId);
      setPrompt("");
    } catch (error) {
      console.error("Failed to generate:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  // Close model menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsModelMenuOpen(false);
      }
    };

    if (isModelMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isModelMenuOpen]);

  // Calculate position to ensure it stays within bounds
  const calculatePosition = () => {
    const boxWidth = 400; // Approximate width of the inline box
    const boxHeight = 120; // Approximate height
    const padding = 16;

    // Center the box horizontally on the position
    let left = position.x - boxWidth / 2;
    let top = position.y + 16; // Default: below the selection

    // Check if box would go beyond right edge
    if (left + boxWidth > imageWidth - padding) {
      left = Math.max(padding, imageWidth - boxWidth - padding);
    }

    // Check if box would go beyond left edge
    if (left < padding) {
      left = padding;
    }

    // Check if box would go beyond bottom edge
    if (top + boxHeight > imageHeight - padding) {
      // Position above the selection instead
      top = Math.max(padding, position.y - boxHeight - 8);
    }

    return { left, top };
  };

  const pos = calculatePosition();

  return (
    <div
      ref={containerRef}
      className="absolute z-[200] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-3 flex flex-col gap-2 min-w-[380px]"
      style={{
        left: `${pos.left}px`,
        top: `${pos.top}px`,
      }}
    >
      {/* Top row: Prompt input + Model icon + Send button */}
      <div className="flex items-center gap-2">
        {/* Prompt Input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            placeholder="Describe what to generate..."
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            autoFocus
          />
        </div>

        {/* Model Selector Icon */}
        <DropdownMenu open={isModelMenuOpen} onOpenChange={setIsModelMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center w-9 h-9 bg-zinc-800 border border-zinc-700 rounded-md hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isGenerating}
              title={`Model: ${selectedModelId || "Select model"}`}
            >
              <Layers className="w-4 h-4 text-purple-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-zinc-900 border border-zinc-700"
          >
            {availableModels.map((model) => (
              <DropdownMenuItem
                key={model.id}
                onClick={() => {
                  setSelectedModelId(model.id);
                  setIsModelMenuOpen(false);
                }}
                className={`flex items-center gap-2 cursor-pointer ${
                  model.id === selectedModelId
                    ? 'bg-blue-900/30'
                    : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                <Layers
                  className={`w-4 h-4 ${
                    model.id === selectedModelId
                      ? "text-purple-400"
                      : "text-zinc-500"
                  }`}
                />
                <span className={`text-sm ${
                  model.id === selectedModelId
                    ? "text-blue-400"
                    : ""
                }`}>{model.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Send Button */}
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || !selectedModelId || isGenerating}
          className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Generate"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Send className="w-4 h-4 text-white" />
          )}
        </button>

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          disabled={isGenerating}
          className="flex items-center justify-center w-8 h-9 bg-zinc-800 border border-zinc-700 rounded-md hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Cancel"
        >
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>
    </div>
  );
};
