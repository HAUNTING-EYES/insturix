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
      <DialogContent className="max-w-lg bg-[#131312] border-[#282724] p-6">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-[#ECE9E1] flex items-center justify-between">
            Custom Color Grading
            <Button
              variant="ghost"
              size="sm"
              onClick={resetControls}
              className="text-[#7A776E] hover:text-[#ECE9E1]"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-h-80 overflow-y-auto pr-2 pb-4">
          {controlsConfig.map(({ key, label, min, max }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-[#B5B2A8]">{label}</label>
                <span className="text-[11px] text-[#7A776E] bg-[#1B1A18] px-2 py-0.5 rounded min-w-[32px] text-center">
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

        <div className="flex gap-3 pt-4 border-t border-[#1C1B19] mt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-[#282724] text-[#B5B2A8] hover:bg-[#1B1A18]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            className="flex-1 bg-[#D4A652] hover:bg-[#C49A48] text-[#0B0B0A]"
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}