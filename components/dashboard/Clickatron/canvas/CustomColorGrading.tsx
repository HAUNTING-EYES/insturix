"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ColorGradingControls {
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  vibrance: number;
  clarity: number;
}

interface CustomColorGradingProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (controls: ColorGradingControls) => void;
}

const defaultControls: ColorGradingControls = {
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  clarity: 0,
};

export function CustomColorGrading({
  isOpen,
  onClose,
  onApply,
}: CustomColorGradingProps) {
  const [controls, setControls] = useState<ColorGradingControls>(defaultControls);

  const updateControl = (key: keyof ColorGradingControls, value: number) => {
    setControls(prev => ({ ...prev, [key]: value }));
  };

  const resetControls = () => {
    setControls(defaultControls);
  };

  const handleApply = () => {
    onApply(controls);
    onClose();
  };

  const controlsConfig = [
    { key: 'highlights' as const, label: 'Highlights', min: -100, max: 100 },
    { key: 'shadows' as const, label: 'Shadows', min: -100, max: 100 },
    { key: 'whites' as const, label: 'Whites', min: -100, max: 100 },
    { key: 'blacks' as const, label: 'Blacks', min: -100, max: 100 },
    { key: 'temperature' as const, label: 'Temperature', min: -100, max: 100 },
    { key: 'tint' as const, label: 'Tint', min: -100, max: 100 },
    { key: 'vibrance' as const, label: 'Vibrance', min: -100, max: 100 },
    { key: 'clarity' as const, label: 'Clarity', min: -100, max: 100 },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-zinc-900 border-zinc-700 p-6">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-zinc-100 flex items-center justify-between">
            Custom Color Grading
            <Button
              variant="ghost"
              size="sm"
              onClick={resetControls}
              className="text-zinc-400 hover:text-zinc-200"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-h-80 overflow-y-auto pr-2 pb-4">
          {controlsConfig.map(({ key, label, min, max }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-zinc-300">{label}</label>
                <span className="text-[11px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded min-w-[32px] text-center">
                  {controls[key] > 0 ? '+' : ''}{controls[key]}
                </span>
              </div>
              <Slider
                value={[controls[key]]}
                onValueChange={([value]) => updateControl(key, value)}
                min={min}
                max={max}
                step={1}
                className="w-full"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-4 border-t border-zinc-800 mt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}