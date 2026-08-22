"use client";

import React, { useState, useMemo } from "react";
import { Wand2, Loader2, X } from "lucide-react";
import { getAvailableModels } from "@/lib/config/clickatron-models";

interface GenerativeFillPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (prompt: string, modelId: string, negativePrompt: string, guidanceScale: number, numInferenceSteps: number) => Promise<void>;
  isGenerating: boolean;
}

export const GenerativeFillPanel: React.FC<GenerativeFillPanelProps> = ({
  isOpen,
  onClose,
  onGenerate,
  isGenerating,
}) => {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [numInferenceSteps, setNumInferenceSteps] = useState(28);
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  // Get available inpainting models
  const availableModels = useMemo(() => {
    return getAvailableModels("generativeFill");
  }, []);

  // Set default model when models are loaded
  React.useEffect(() => {
    if (availableModels.length > 0 && !selectedModelId) {
      // Default to Seedream 5.0 Lite (first in the list - most reliable)
      const defaultModel = availableModels.find(m => m.id === "fal-ai/bytedance/seedream/v5/lite/edit") ||
        availableModels[0];
      setSelectedModelId(defaultModel.id);
    }
  }, [availableModels, selectedModelId]);

  const handleGenerate = async () => {
    if (!prompt.trim() || !selectedModelId || isGenerating) return;
    try {
      await onGenerate(
        prompt.trim(),
        selectedModelId,
        negativePrompt.trim(),
        guidanceScale,
        numInferenceSteps
      );
      setPrompt("");
      setNegativePrompt("");
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0F0F0E]">
      <div className="bg-[#131312] border border-[#1C1B19] rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-[#B5B2A8]" />
            <h2 className="text-lg font-semibold text-white">Generative Fill</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#7A776E] hover:text-white transition-colors"
            disabled={isGenerating}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Model Selector */}
          <div>
            <label className="block text-sm font-medium text-[#B5B2A8] mb-2">
              Model
            </label>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              disabled={isGenerating}
              className="w-full px-4 py-2.5 bg-[#1B1A18] border border-[#1C1B19] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#282724] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-[#7A776E]">
              Select the AI model to fill the selected area
            </p>
          </div>

          {/* Prompt Input */}
          <div>
            <label className="block text-sm font-medium text-[#B5B2A8] mb-2">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
              placeholder="Describe what you want to generate in the selected area..."
              rows={4}
              className="w-full px-4 py-3 bg-[#1B1A18] border border-[#1C1B19] rounded-lg text-white placeholder-[#7A776E] focus:outline-none focus:ring-2 focus:ring-[#282724] resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="mt-1.5 text-[11px] text-[#7A776E]">Describe what you want to fill the selection with</p>
          </div>
          {/* Negative Prompt Input */}
          <div>
            <label className="block text-sm font-medium text-[#B5B2A8] mb-2">Negative Prompt (optional)</label>
            <input
              type="text"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              disabled={isGenerating}
              placeholder="What should the AI avoid? (e.g. blurry, distorted)"
              className="w-full px-4 py-2 bg-[#1B1A18] border border-[#1C1B19] rounded-lg text-white placeholder-[#7A776E] focus:outline-none focus:ring-2 focus:ring-[#282724] disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Guidance Scale and Inference Steps Hidden but preserved in state */}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || !selectedModelId || isGenerating}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  Generate Fill
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-3 bg-muted text-muted-foreground font-medium rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
