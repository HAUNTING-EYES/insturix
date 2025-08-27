"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Palette, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
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
  isDisabled?: boolean;
}

const colorLooks: ColorLook[] = [
  {
    id: 'vibrant',
    name: 'Vibrant',
    preview: 'linear-gradient(45deg, #ff6b6b, #4ecdc4)',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    preview: 'linear-gradient(45deg, #2c3e50, #34495e)',
  },
  {
    id: 'warm',
    name: 'Warm',
    preview: 'linear-gradient(45deg, #f39c12, #e67e22)',
  },
  {
    id: 'cool',
    name: 'Cool',
    preview: 'linear-gradient(45deg, #3498db, #9b59b6)',
  },
  {
    id: 'vintage',
    name: 'Vintage',
    preview: 'linear-gradient(45deg, #d35400, #c0392b)',
  },
  {
    id: 'monochrome',
    name: 'Mono',
    preview: 'linear-gradient(45deg, #2c3e50, #95a5a6)',
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
        {/* Color Grading - Moved to top */}
        <div className="space-y-4">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Color Grading
          </h4>
          
          <div className="grid grid-cols-2 gap-2">
            {colorLooks.map((look) => (
              <button
                key={look.id}
                onClick={() => onColorLookApply(look.id)}
                className="
                  group relative aspect-square rounded-lg overflow-hidden
                  border border-zinc-700 hover:border-zinc-600
                  transition-all duration-200 hover:scale-105
                "
              >
                <div
                  className="w-full h-full"
                  style={{ background: look.preview }}
                />
                <div className="
                  absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100
                  transition-opacity duration-200 flex items-center justify-center
                ">
                  <span className="text-white text-xs font-medium">
                    {look.name}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Custom Color Grading */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCustomGrading(true)}
            className="w-full border-zinc-700 text-zinc-300 justify-start"
            disabled={isDisabled}
          >
            Custom Color Grading
          </Button>
        </div>

        {/* Adjustment Sliders */}
        <div className="space-y-4">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Adjustments
          </h4>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-zinc-300">Brightness</label>
                <span className="text-xs text-zinc-500">{controls.brightness}%</span>
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
                <span className="text-xs text-zinc-500">{controls.contrast}%</span>
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
                <span className="text-xs text-zinc-500">{controls.saturation}%</span>
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

        {/* Quick Actions */}
        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Quick Actions
          </h4>
          
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full border-zinc-700 text-zinc-300 justify-start"
              disabled={isDisabled}
            >
              Auto Enhance
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full border-zinc-700 text-zinc-300 justify-start"
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