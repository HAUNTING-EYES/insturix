"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Monitor, 
  Smartphone, 
  FileImage, 
  Settings,
  Check,
  Sparkles
} from 'lucide-react';

export interface CanvasPreset {
  id: string;
  name: string;
  description: string;
  aspectRatio: string;
  dimensions: string;
  icon: React.ComponentType<{ className?: string }>;
  promptText: string;
  placeholder: string;
}

const presets: CanvasPreset[] = [
  {
    id: 'auto',
    name: 'Auto Detect',
    description: 'AI picks the best format',
    aspectRatio: 'Auto',
    dimensions: 'Smart',
    icon: Sparkles,
    promptText: "What are you creating?",
    placeholder: "e.g., A video about Indian chai and its craze"
  },
  {
    id: 'youtube-thumbnail',
    name: 'YouTube Thumbnail',
    description: 'Perfect for video thumbnails',
    aspectRatio: '16:9',
    dimensions: '1280×720',
    icon: Monitor,
    promptText: "What's your video about?",
    placeholder: "e.g., A video about Indian chai and its craze"
  },
  {
    id: 'social-post',
    name: 'Social Media Post',
    description: 'Instagram, Twitter, Facebook',
    aspectRatio: '1:1',
    dimensions: '1080×1080',
    icon: Smartphone,
    promptText: "What's your post concept?",
    placeholder: "e.g., Motivational quote about morning routines"
  },
  {
    id: 'poster-portrait',
    name: 'Poster / Portrait',
    description: 'Vertical format for posters',
    aspectRatio: '9:16',
    dimensions: '1080×1920',
    icon: FileImage,
    promptText: "Describe the poster's theme",
    placeholder: "e.g., Movie poster for a sci-fi thriller"
  },
  {
    id: 'custom',
    name: 'Custom Size',
    description: 'Define your own dimensions',
    aspectRatio: 'Custom',
    dimensions: 'Variable',
    icon: Settings,
    promptText: "What are you creating?",
    placeholder: "e.g., Banner for website header"
  }
];

interface CanvasPresetSelectorProps {
  selectedPreset: string;
  onPresetChange: (preset: CanvasPreset) => void;
}

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" } as any
};

export function CanvasPresetSelector({ selectedPreset, onPresetChange }: CanvasPresetSelectorProps) {
  return (
    <motion.div {...fadeIn} className="mb-6">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-zinc-100 mb-2">
          What are you creating?
        </h3>
        <p className="text-sm text-zinc-400">
          Choose a format to get started with the right dimensions
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {presets.map((preset) => {
          const Icon = preset.icon;
          const isSelected = selectedPreset === preset.id;
          
          return (
            <motion.div
              key={preset.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15 }}
            >
              <Card 
                className={`cursor-pointer transition-all duration-200 ${
                  isSelected 
                    ? 'bg-purple-600/20 border-purple-500/50 shadow-lg shadow-purple-500/10' 
                    : 'bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700/80 hover:bg-zinc-900/60'
                }`}
                onClick={() => onPresetChange(preset)}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2 rounded-lg ${
                      isSelected 
                        ? 'bg-purple-500/20 text-purple-400' 
                        : 'bg-zinc-800/50 text-zinc-400'
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="bg-purple-500 text-white rounded-full p-1"
                      >
                        <Check className="h-3 w-3" />
                      </motion.div>
                    )}
                  </div>
                  
                  <div>
                    <h4 className={`font-medium text-xs sm:text-sm mb-1 ${
                      isSelected ? 'text-purple-100' : 'text-zinc-200'
                    }`}>
                      {preset.name}
                    </h4>
                    <p className="text-xs text-zinc-500 mb-2 hidden sm:block">
                      {preset.description}
                    </p>
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-mono text-xs ${
                        isSelected ? 'text-purple-300' : 'text-zinc-400'
                      }`}>
                        {preset.aspectRatio}
                      </span>
                      <span className="text-zinc-500 text-xs hidden sm:inline">
                        {preset.dimensions}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

export { presets };