"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CanvasPresetSelector } from '../CanvasPresetSelector';

interface CanvasControlsProps {
    brightness: number;
    contrast: number;
    saturation: number;
    aspectRatio: string;
    isBlankVariation: boolean;
    onBrightnessChange: (value: number) => void;
    onContrastChange: (value: number) => void;
    onSaturationChange: (value: number) => void;
    onAspectRatioChange: (value: string) => void;
    onReset?: () => void;
    disabled?: boolean;
}

export const CanvasControls: React.FC<CanvasControlsProps> = ({
    brightness,
    contrast,
    saturation,
    aspectRatio,
    isBlankVariation,
    onBrightnessChange,
    onContrastChange,
    onSaturationChange,
    onAspectRatioChange,
    onReset,
    disabled = false
}) => {
    const handleReset = () => {
        onReset?.();
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="h-full flex flex-col bg-gradient-to-b from-zinc-900/90 to-zinc-900/70 backdrop-blur-xl"
        >
            {/* Header */}
            <div className="p-3 border-b border-zinc-700/30">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-zinc-200 tracking-tight">Fine Tuning</h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleReset}
                        disabled={disabled}
                        className="text-zinc-500 hover:text-zinc-300 h-6 px-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800/50 transition-all text-xs"
                    >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Reset
                    </Button>
                </div>
            </div>

            {/* Controls */}
            <div className="flex-1 p-3 space-y-4 overflow-y-auto">
                {/* Brightness */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-yellow-400/60" />
                            Brightness
                        </Label>
                        <span className="text-xs text-zinc-400 font-mono tabular-nums">
                            {brightness}%
                        </span>
                    </div>
                    <Slider
                        value={[brightness]}
                        onValueChange={([val]) => {
                            if (!disabled) {
                                onBrightnessChange(val);
                            }
                        }}
                        min={0}
                        max={200}
                        step={1}
                        disabled={disabled}
                        className="w-full"
                    />
                </div>

                <Separator className="bg-zinc-700/20" />

                {/* Contrast */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-blue-400/60" />
                            Contrast
                        </Label>
                        <span className="text-xs text-zinc-400 font-mono tabular-nums">
                            {contrast}%
                        </span>
                    </div>
                    <Slider
                        value={[contrast]}
                        onValueChange={([val]) => {
                            if (!disabled) {
                                onContrastChange(val);
                            }
                        }}
                        min={0}
                        max={200}
                        step={1}
                        disabled={disabled}
                        className="w-full"
                    />
                </div>

                <Separator className="bg-zinc-700/20" />

                {/* Saturation */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-green-400/60" />
                            Saturation
                        </Label>
                        <span className="text-xs text-zinc-400 font-mono tabular-nums">
                            {saturation}%
                        </span>
                    </div>
                    <Slider
                        value={[saturation]}
                        onValueChange={([val]) => {
                            if (!disabled) {
                                onSaturationChange(val);
                            }
                        }}
                        min={0}
                        max={200}
                        step={1}
                        disabled={disabled}
                        className="w-full"
                    />
                </div>
            </div>

            {/* Aspect Ratio - Only show for blank variations */}
            {isBlankVariation && (
                <>
                    <Separator className="bg-zinc-700/20" />
                    <div className="p-3 space-y-2">
                        <Label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-purple-400/60" />
                            Canvas Size
                        </Label>
                        <CanvasPresetSelector value={aspectRatio} onChange={onAspectRatioChange} />
                    </div>
                </>
            )}

            {/* Footer Info */}
            <div className="p-2 border-t border-zinc-700/20 bg-gradient-to-t from-zinc-800/10 to-transparent">
                <div className="text-xs text-zinc-500 text-center flex items-center justify-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
                    Real-time preview
                </div>
            </div>
        </motion.div>
    );
};