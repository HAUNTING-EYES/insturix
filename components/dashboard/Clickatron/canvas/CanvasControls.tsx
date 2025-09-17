"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Contrast, Droplets, Settings, RotateCcw, Palette } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    disabled = false
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
                        disabled={disabled}
                        className="text-zinc-400 hover:text-zinc-200 h-8 px-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                            onValueChange={([val]) => {
                                console.log('Brightness changed:', val);
                                !disabled && onBrightnessChange(val);
                            }}
                            min={0}
                            max={200}
                            step={1}
                            disabled={disabled}
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
                            onValueChange={([val]) => {
                                console.log('Contrast changed:', val);
                                !disabled && onContrastChange(val);
                            }}
                            min={0}
                            max={200}
                            step={1}
                            disabled={disabled}
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
                            onValueChange={([val]) => {
                                console.log('Saturation changed:', val);
                                !disabled && onSaturationChange(val);
                            }}
                            min={0}
                            max={200}
                            step={1}
                            disabled={disabled}
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

            <Separator className="bg-zinc-700/50" />

            {/* Aspect Ratio - Only show for blank variations */}
            {isBlankVariation && (
                <div className="space-y-4">
                    <Label className="flex items-center text-sm font-medium text-zinc-300">
                        <Settings className="w-4 h-4 mr-2 text-purple-400" />
                        Aspect Ratio
                    </Label>
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
            )}

            {/* Footer Info */}
            <div className="p-4 border-t border-zinc-700/50 bg-zinc-800/30">
                <div className="text-xs text-zinc-500 text-center">
                    Changes apply in real-time
                </div>
            </div>
        </motion.div>
    );
};