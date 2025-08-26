"use client";

import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  Monitor,
  Smartphone,
  FileImage,
  Settings,
  Sparkles,
} from "lucide-react";

export interface CanvasPreset {
  id: string;
  name: string;
  description: string;
  aspectRatio: string;
  dimensions: string;
  icon: React.ComponentType<{ className?: string }>;
  promptText: string;
  placeholder: string;
  isRecommended?: boolean;
}

const presets: CanvasPreset[] = [
  {
    id: "auto",
    name: "Automatic",
    description: "Auto-detect best format",
    aspectRatio: "Auto",
    dimensions: "Optimized",
    icon: Sparkles,
    promptText: "What are you creating?",
    placeholder: "Describe your idea and we'll handle the rest",
    isRecommended: true,
  },
  {
    id: "youtube-thumbnail",
    name: "YouTube",
    description: "Video thumbnails",
    aspectRatio: "16:9",
    dimensions: "1280×720",
    icon: Monitor,
    promptText: "What's your video about?",
    placeholder: "e.g., A cooking tutorial for beginners",
  },
  {
    id: "social-post",
    name: "Social Post",
    description: "Instagram, Twitter, Facebook",
    aspectRatio: "1:1",
    dimensions: "1080×1080",
    icon: Smartphone,
    promptText: "What's your post about?",
    placeholder: "e.g., Motivational quote for Monday",
  },
  {
    id: "poster-portrait",
    name: "Poster",
    description: "Vertical posters & stories",
    aspectRatio: "9:16",
    dimensions: "1080×1920",
    icon: FileImage,
    promptText: "Describe your poster",
    placeholder: "e.g., Event announcement poster",
  },
  {
    id: "custom",
    name: "Custom",
    description: "Your own dimensions",
    aspectRatio: "Custom",
    dimensions: "Variable",
    icon: Settings,
    promptText: "What are you creating?",
    placeholder: "e.g., Website banner or custom graphic",
  },
];

interface CanvasPresetSelectorProps {
  selectedPreset: string;
  onPresetChange: (preset: CanvasPreset) => void;
  customAspectRatio?: { width: number; height: number };
  onCustomAspectRatioChange?: (aspectRatio: {
    width: number;
    height: number;
  }) => void;
}

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" } as any,
};

const staggerChildren = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const cardVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};

export function CanvasPresetSelector({
  selectedPreset,
  onPresetChange,
  customAspectRatio,
  onCustomAspectRatioChange,
}: CanvasPresetSelectorProps) {
  const [showCustomInputs, setShowCustomInputs] = React.useState(false);
  const [aspectWidth, setAspectWidth] = React.useState(
    customAspectRatio?.width || 16
  );
  const [aspectHeight, setAspectHeight] = React.useState(
    customAspectRatio?.height || 9
  );

  const handlePresetChange = (preset: CanvasPreset) => {
    onPresetChange(preset);
    if (preset.id === "custom") {
      setShowCustomInputs(true);
    } else {
      setShowCustomInputs(false);
    }
  };

  const handleCustomAspectRatioUpdate = () => {
    if (onCustomAspectRatioChange) {
      onCustomAspectRatioChange({ width: aspectWidth, height: aspectHeight });
    }
  };

  React.useEffect(() => {
    if (selectedPreset === "custom") {
      setShowCustomInputs(true);
    }
  }, [selectedPreset]);

  React.useEffect(() => {
    if (showCustomInputs) {
      handleCustomAspectRatioUpdate();
    }
  }, [aspectWidth, aspectHeight, showCustomInputs]);

  return (
    <motion.div {...fadeIn} className="mb-4">
      {/* Mobile Dropdown */}
      <div className="block sm:hidden">
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Format
        </label>
        <select
          value={selectedPreset}
          onChange={(e) => {
            const preset = presets.find((p) => p.id === e.target.value);
            if (preset) handlePresetChange(preset);
          }}
          className="w-full p-3 bg-zinc-900/60 border border-zinc-800/60 rounded-lg text-zinc-100 focus:border-zinc-700 focus:outline-none"
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} ({preset.aspectRatio})
            </option>
          ))}
        </select>
      </div>

      {/* Desktop Grid */}
      <div className="hidden sm:block">
        <div className="mb-3 text-center">
          <h3 className="text-base font-medium text-zinc-200 mb-1">
            Choose Your Format
          </h3>
        </div>

        <motion.div
          className="grid grid-cols-5 gap-2 items-stretch"
          variants={staggerChildren}
          initial="initial"
          animate="animate"
        >
          {presets.map((preset) => {
            const Icon = preset.icon;
            const isSelected = selectedPreset === preset.id;

            return (
              <motion.div
                key={preset.id}
                variants={cardVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <Card
                  className={`cursor-pointer transition-all duration-150 h-full ${
                    isSelected
                      ? "bg-purple-600/20 border-purple-500/50"
                      : "bg-zinc-900/40 border-zinc-800/50 hover:border-zinc-700/70"
                  }`}
                  onClick={() => handlePresetChange(preset)}
                >
                  <CardContent className="p-3 h-full">
                    <div className="text-center h-full flex flex-col justify-between">
                      <div className="flex flex-col items-center">
                        <div
                          className={`inline-flex p-2 rounded-lg mb-2 ${
                            isSelected
                              ? "bg-purple-500/20 text-purple-400"
                              : "bg-zinc-800/50 text-zinc-400"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>

                        <h4
                          className={`font-medium text-xs mb-1 ${
                            isSelected ? "text-purple-100" : "text-zinc-200"
                          }`}
                        >
                          {preset.name}
                        </h4>

                        <p className="text-xs text-zinc-500 mb-2 leading-tight">
                          {preset.description}
                        </p>
                      </div>

                      <div
                        className={`text-xs px-2 py-1 rounded font-mono ${
                          isSelected
                            ? "bg-purple-500/20 text-purple-300"
                            : "bg-zinc-800/50 text-zinc-400"
                        }`}
                      >
                        {preset.aspectRatio}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Custom Aspect Ratio Input */}
      {showCustomInputs && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3 p-3 bg-zinc-900/40 border border-zinc-800/50 rounded-lg"
        >
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Custom Aspect Ratio
          </label>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                type="number"
                value={aspectWidth}
                onChange={(e) => setAspectWidth(Number(e.target.value))}
                className="w-full p-2 bg-zinc-800/50 border border-zinc-700/50 rounded text-zinc-100 text-sm focus:border-zinc-600 focus:outline-none text-center"
                min="1"
                max="100"
                placeholder="16"
              />
            </div>
            <span className="text-zinc-400 font-mono">:</span>
            <div className="flex-1">
              <input
                type="number"
                value={aspectHeight}
                onChange={(e) => setAspectHeight(Number(e.target.value))}
                className="w-full p-2 bg-zinc-800/50 border border-zinc-700/50 rounded text-zinc-100 text-sm focus:border-zinc-600 focus:outline-none text-center"
                min="1"
                max="100"
                placeholder="9"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-2 text-center">
            Ratio: {aspectWidth}:{aspectHeight} (
            {(aspectWidth / aspectHeight).toFixed(2)}:1)
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

export { presets };
