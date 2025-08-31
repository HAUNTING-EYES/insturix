"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Contrast, Droplets } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

interface CanvasControlsProps {
    brightness: number;
    contrast: number;
    saturation: number;
    onBrightnessChange: (value: number) => void;
    onContrastChange: (value: number) => void;
    onSaturationChange: (value: number) => void;
}

export const CanvasControls: React.FC<CanvasControlsProps> = ({
    brightness,
    contrast,
    saturation,
    onBrightnessChange,
    onContrastChange,
    onSaturationChange
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="absolute bottom-4 right-4 bg-zinc-900/80 backdrop-blur-md border border-zinc-700/80 rounded-lg p-4 w-64 shadow-lg"
        >
            <h3 className="text-sm font-semibold text-zinc-200 mb-4">Fine-tune Image</h3>
            <div className="space-y-6">
                <div className="space-y-3">
                    <Label className="flex items-center text-xs text-zinc-400">
                        <Sun className="w-4 h-4 mr-2" />
                        Brightness
                    </Label>
                    <Slider
                        value={[brightness]}
                        onValueChange={([val]) => onBrightnessChange(val)}
                        min={0}
                        max={200}
                        step={1}
                    />
                </div>
                <div className="space-y-3">
                    <Label className="flex items-center text-xs text-zinc-400">
                        <Contrast className="w-4 h-4 mr-2" />
                        Contrast
                    </Label>
                    <Slider
                        value={[contrast]}
                        onValueChange={([val]) => onContrastChange(val)}
                        min={0}
                        max={200}
                        step={1}
                    />
                </div>
                <div className="space-y-3">
                    <Label className="flex items-center text-xs text-zinc-400">
                        <Droplets className="w-4 h-4 mr-2" />
                        Saturation
                    </Label>
                    <Slider
                        value={[saturation]}
                        onValueChange={([val]) => onSaturationChange(val)}
                        min={0}
                        max={200}
                        step={1}
                    />
                </div>
            </div>
        </motion.div>
    );
};