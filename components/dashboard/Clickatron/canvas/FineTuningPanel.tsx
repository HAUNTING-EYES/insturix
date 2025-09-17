"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Palette, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomColorGrading } from './CustomColorGrading';

interface FineTuningControls {
  brightness: number;
  contrast: number;
  saturation: number;
}

interface ColorLook {
  id: string;
  name: string;
  preview: string; // CSS gradient or color
}

interface FineTuningPanelProps {
  controls: FineTuningControls;
  onControlChange: (key: keyof FineTuningControls, value: number) => void;
  onReset: () => void;
  onColorLookApply: (lookId: string) => void;
  aspectRatio: string;
  onAspectRatioChange: (value: string) => void;
  isDisabled?: boolean;
}

const colorLooks: ColorLook[] = [
  {
    id: 'vibrant',
    name: 'Vibrant',
    preview: 'linear-gradient(135deg, #ff6b6b, #4ecdc4)',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    preview: 'linear-gradient(135deg, #1a1a2e, #16213e)',
  },
  {
    id: 'warm',
    name: 'Warm',
    preview: 'linear-gradient(135deg, #ff9a56, #ff6b35)',
  },
  {
    id: 'cool',
    name: 'Cool',
    preview: 'linear-gradient(135deg, #667eea, #764ba2)',
  },
  {
    id: 'vintage',
    name: 'Vintage',
    preview: 'linear-gradient(135deg, #d4a574, #b8860b)',
  },
  {
    id: 'monochrome',
    name: 'Mono',
    preview: 'linear-gradient(135deg, #434343, #000000)',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    preview: 'linear-gradient(135deg, #ff7e5f, #feb47b)',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    preview: 'linear-gradient(135deg, #2193b0, #6dd5ed)',
  },
];

const fadeIn = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.3, ease: "easeOut" } as any,
};

export function FineTuningPanel({
  controls,
  onControlChange,
  onReset,
  onColorLookApply,
  aspectRatio,
  onAspectRatioChange,
  isDisabled = false,
}: FineTuningPanelProps) {
  const [showCustomGrading, setShowCustomGrading] = useState(false);

  const handleCustomGradingApply = (gradingControls: any) => {
    console.log('Apply custom grading:', gradingControls);
    // TODO: Implement custom grading application
  };
  return (
    <motion.div
      {...fadeIn}
      className="w-80 bg-zinc-900/50 border-l border-zinc-800/80 flex flex-col h-full pb-32"
    >
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-medium text-zinc-200">Fine-Tuning</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={isDisabled}
          className="text-zinc-400 hover:text-zinc-200 p-1"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-6 ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Basic Adjustments - Most commonly used */}
        <div className="space-y-4">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Basic Adjustments
          </h4>
          
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-zinc-300">Brightness</label>
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                  {controls.brightness}%
                </span>
              </div>
              <Slider
                value={[controls.brightness]}
                onValueChange={([value]) => onControlChange('brightness', value)}
                min={50}
                max={150}
                step={1}
                className="w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-zinc-300">Contrast</label>
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                  {controls.contrast}%
                </span>
              </div>
              <Slider
                value={[controls.contrast]}
                onValueChange={([value]) => onControlChange('contrast', value)}
                min={50}
                max={150}
                step={1}
                className="w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-zinc-300">Saturation</label>
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                  {controls.saturation}%
                </span>
              </div>
              <Slider
                value={[controls.saturation]}
                onValueChange={([value]) => onControlChange('saturation', value)}
                min={0}
                max={200}
                step={1}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-4">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Aspect Ratio
          </h4>
          
          <Select value={aspectRatio} onValueChange={onAspectRatioChange}>
            <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-zinc-200">
              <SelectValue placeholder="Select aspect ratio" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              <SelectItem value="16:9">YouTube Thumbnail (16:9)</SelectItem>
              <SelectItem value="9:16">Reels/TikTok (9:16)</SelectItem>
              <SelectItem value="1:1">Instagram Post (1:1)</SelectItem>
              <SelectItem value="4:5">Instagram Portrait (4:5)</SelectItem>
              <SelectItem value="21:9">Ultrawide Banner (21:9)</SelectItem>
              <SelectItem value="4:3">Standard Photo (4:3)</SelectItem>
              <SelectItem value="3:2">Print Photo (3:2)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Color Styles - Changed to pills */}
        <div className="space-y-4">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Color Styles
          </h4>
          
          <div className="flex flex-wrap gap-1.5">
            {colorLooks.map((look) => (
              <button
                key={look.id}
                onClick={() => onColorLookApply(look.id)}
                className="
                  group relative px-2.5 py-1 rounded-full text-xs font-medium
                  border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50
                  transition-all duration-200 hover:scale-105
                  flex items-center gap-1.5 min-w-0 bg-zinc-900/50
                "
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-zinc-600"
                  style={{ background: look.preview }}
                />
                <span className="text-zinc-300 group-hover:text-zinc-100 truncate">
                  {look.name}
                </span>
              </button>
            ))}
          </div>

          {/* Custom Color Grading */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCustomGrading(true)}
            className="w-full border-zinc-700 text-zinc-300 justify-start hover:bg-zinc-800"
            disabled={isDisabled}
          >
            <Palette className="h-4 w-4 mr-2" />
            Advanced Color Grading
          </Button>
        </div>

        {/* Quick Enhancement Tools */}
        <div className="space-y-3 pt-2 border-t border-zinc-800">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Enhancement Tools
          </h4>
          
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
              disabled={isDisabled}
            >
              Auto Enhance
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
              disabled={isDisabled}
            >
              Match Colors
            </Button>
          </div>
        </div>
      </div>

      {/* Custom Color Grading Modal */}
      <CustomColorGrading
        isOpen={showCustomGrading}
        onClose={() => setShowCustomGrading(false)}
        onApply={handleCustomGradingApply}
      />
    </motion.div>
  );
}