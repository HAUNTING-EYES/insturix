"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Contrast, Droplets, Settings, RotateCcw, Palette } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

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
    const handleReset = () => {
        onBrightnessChange(100);
        onContrastChange(100);
        onSaturationChange(100);
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="h-full flex flex-col"
        >
            {/* Header */}
            <div className="p-6 border-b border-zinc-700/50">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Palette className="w-5 h-5 text-purple-400" />
                        <h3 className="text-lg font-semibold text-zinc-200">Adjustments</h3>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleReset}
                        className="text-zinc-400 hover:text-zinc-200 h-8 px-2"
                    >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Reset
                    </Button>
                </div>
                <p className="text-xs text-zinc-500">Fine-tune your image appearance</p>
            </div>

            {/* Controls */}
            <div className="flex-1 p-6 space-y-8 overflow-y-auto">
                {/* Brightness */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="flex items-center text-sm font-medium text-zinc-300">
                            <Sun className="w-4 h-4 mr-2 text-yellow-400" />
                            Brightness
                        </Label>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-zinc-400 font-mono w-12 text-right">
                                {brightness}%
                            </span>
                        </div>
                    </div>
                    <div className="px-1">
                        <Slider
                            value={[brightness]}
                            onValueChange={([val]) => onBrightnessChange(val)}
                            min={0}
                            max={200}
                            step={1}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-zinc-600 mt-1">
                            <span>0%</span>
                            <span>100%</span>
                            <span>200%</span>
                        </div>
                    </div>
                </div>

                <Separator className="bg-zinc-700/50" />

                {/* Contrast */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="flex items-center text-sm font-medium text-zinc-300">
                            <Contrast className="w-4 h-4 mr-2 text-blue-400" />
                            Contrast
                        </Label>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-zinc-400 font-mono w-12 text-right">
                                {contrast}%
                            </span>
                        </div>
                    </div>
                    <div className="px-1">
                        <Slider
                            value={[contrast]}
                            onValueChange={([val]) => onContrastChange(val)}
                            min={0}
                            max={200}
                            step={1}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-zinc-600 mt-1">
                            <span>0%</span>
                            <span>100%</span>
                            <span>200%</span>
                        </div>
                    </div>
                </div>

                <Separator className="bg-zinc-700/50" />

                {/* Saturation */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="flex items-center text-sm font-medium text-zinc-300">
                            <Droplets className="w-4 h-4 mr-2 text-green-400" />
                            Saturation
                        </Label>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-zinc-400 font-mono w-12 text-right">
                                {saturation}%
                            </span>
                        </div>
                    </div>
                    <div className="px-1">
                        <Slider
                            value={[saturation]}
                            onValueChange={([val]) => onSaturationChange(val)}
                            min={0}
                            max={200}
                            step={1}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-zinc-600 mt-1">
                            <span>0%</span>
                            <span>100%</span>
                            <span>200%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Info */}
            <div className="p-4 border-t border-zinc-700/50 bg-zinc-800/30">
                <div className="text-xs text-zinc-500 text-center">
                    Changes apply in real-time
                </div>
            </div>
        </motion.div>
    );
};