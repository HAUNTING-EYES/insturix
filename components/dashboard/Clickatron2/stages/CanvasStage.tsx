"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Download,
  Palette,
  Type,
  Move,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
} from "lucide-react";

interface CanvasStageProps {
  videoIdea: string;
  selectedDirection: string;
  selectedPreset?: {
    id: string;
    name: string;
    aspectRatio: string;
    dimensions: string;
  };
  referenceImage?: {
    name: string;
    data: string;
  } | null;
  onComplete: (data: { finalThumbnail: string }) => void;
  onGenerativeEdit: (prompt: string, settings: any) => void;
  isGenerating: boolean;
}

interface CanvasControls {
  brightness: number;
  contrast: number;
  saturation: number;
  textSize: number;
  textOpacity: number;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" } as any,
};

export function CanvasStage({
  videoIdea,
  selectedDirection,
  selectedPreset,
  referenceImage,
  onComplete,
  onGenerativeEdit,
  isGenerating,
}: CanvasStageProps) {
  const [controls, setControls] = useState<CanvasControls>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    textSize: 100,
    textOpacity: 100,
  });

  const [activeTab, setActiveTab] = useState<"adjust" | "text" | "effects">(
    "adjust"
  );

  const [thumbnailLoading, setThumbnailLoading] = useState(true);

  // Simulate thumbnail generation when component mounts
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setThumbnailLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const updateControl = (key: keyof CanvasControls, value: number) => {
    setControls((prev) => ({ ...prev, [key]: value }));
  };

  const resetControls = () => {
    setControls({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      textSize: 100,
      textOpacity: 100,
    });
  };

  const handleSave = () => {
    onComplete({ finalThumbnail: `${selectedDirection}_thumbnail` });
  };

  const canvasStyle = {
    filter: `brightness(${controls.brightness}%) contrast(${controls.contrast}%) saturate(${controls.saturation}%)`,
  };

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <Card className="bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80">
        <CardContent className="p-6 sm:p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full text-sm mb-4">
              <Sparkles className="h-4 w-4" />
              {selectedDirection} • Canvas
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-zinc-100 mb-3">
              Perfect your thumbnail
            </h2>
            <p className="text-zinc-400 text-lg">
              Fine-tune colors, text, and effects to make it uniquely yours
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Canvas Preview */}
            <div className="lg:col-span-2">
              <div className="bg-zinc-900/50 rounded-xl p-6">
                <div
                  className={`bg-zinc-800/50 rounded-lg overflow-hidden relative mx-auto ${
                    selectedPreset?.aspectRatio === "1:1"
                      ? "aspect-square max-w-md"
                      : selectedPreset?.aspectRatio === "9:16"
                        ? "aspect-[9/16] max-w-sm"
                        : "aspect-video" // 16:9 default
                  }`}
                  style={thumbnailLoading ? {} : canvasStyle}
                >
                  {thumbnailLoading ? (
                    /* Loading State */
                    <div className="w-full h-full bg-zinc-800/50 flex items-center justify-center">
                      <div className="text-center">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          className="inline-block mb-4"
                        >
                          <Sparkles className="h-8 w-8 text-purple-400" />
                        </motion.div>
                        <div className="text-zinc-300 font-medium">
                          Generating thumbnail...
                        </div>
                        <div className="text-zinc-500 text-sm mt-1">
                          {selectedDirection} style
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Generated thumbnail with applied effects */
                    <div className="w-full h-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center relative">
                      <div className="text-center">
                        <div className="text-4xl mb-4">🎬</div>
                        <div
                          className="text-white font-bold text-xl"
                          style={{
                            fontSize: `${controls.textSize}%`,
                            opacity: controls.textOpacity / 100,
                          }}
                        >
                          {videoIdea.length > 30
                            ? videoIdea.substring(0, 30) + "..."
                            : videoIdea}
                        </div>
                      </div>

                      {/* Overlay effects indicator */}
                      <div className="absolute top-4 left-4 text-xs text-white/70 bg-black/30 px-2 py-1 rounded">
                        {selectedDirection}
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex justify-center gap-3 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 text-zinc-300"
                    disabled={thumbnailLoading}
                  >
                    <Move className="h-4 w-4 mr-2" />
                    Reposition
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 text-zinc-300"
                    onClick={resetControls}
                    disabled={thumbnailLoading}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                </div>
              </div>
            </div>

            {/* Controls Panel */}
            <div className="space-y-6">
              {/* Tab Navigation */}
              <div className="flex bg-zinc-900/50 rounded-lg p-1">
                {[
                  { id: "adjust", label: "Adjust", icon: Palette },
                  { id: "text", label: "Text", icon: Type },
                  { id: "effects", label: "Effects", icon: Sparkles },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id as any)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm transition-colors ${
                      activeTab === id
                        ? "bg-purple-600 text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Control Content */}
              <div className={`space-y-6 ${thumbnailLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                {activeTab === "adjust" && (
                  <motion.div {...fadeIn} className="space-y-4">
                    <div>
                      <label className="text-sm text-zinc-300 mb-2 block">
                        Brightness
                      </label>
                      <Slider
                        value={[controls.brightness]}
                        onValueChange={([value]) =>
                          updateControl("brightness", value)
                        }
                        min={50}
                        max={150}
                        step={1}
                        className="w-full"
                      />
                      <div className="text-xs text-zinc-500 mt-1">
                        {controls.brightness}%
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-zinc-300 mb-2 block">
                        Contrast
                      </label>
                      <Slider
                        value={[controls.contrast]}
                        onValueChange={([value]) =>
                          updateControl("contrast", value)
                        }
                        min={50}
                        max={150}
                        step={1}
                        className="w-full"
                      />
                      <div className="text-xs text-zinc-500 mt-1">
                        {controls.contrast}%
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-zinc-300 mb-2 block">
                        Saturation
                      </label>
                      <Slider
                        value={[controls.saturation]}
                        onValueChange={([value]) =>
                          updateControl("saturation", value)
                        }
                        min={0}
                        max={200}
                        step={1}
                        className="w-full"
                      />
                      <div className="text-xs text-zinc-500 mt-1">
                        {controls.saturation}%
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === "text" && (
                  <motion.div {...fadeIn} className="space-y-4">
                    <div>
                      <label className="text-sm text-zinc-300 mb-2 block">
                        Text Size
                      </label>
                      <Slider
                        value={[controls.textSize]}
                        onValueChange={([value]) =>
                          updateControl("textSize", value)
                        }
                        min={50}
                        max={200}
                        step={5}
                        className="w-full"
                      />
                      <div className="text-xs text-zinc-500 mt-1">
                        {controls.textSize}%
                      </div>
                    </div>

                    <div>
                      <label className="text-sm text-zinc-300 mb-2 block">
                        Text Opacity
                      </label>
                      <Slider
                        value={[controls.textOpacity]}
                        onValueChange={([value]) =>
                          updateControl("textOpacity", value)
                        }
                        min={0}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                      <div className="text-xs text-zinc-500 mt-1">
                        {controls.textOpacity}%
                      </div>
                    </div>

                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-zinc-700 text-zinc-300"
                      >
                        <Type className="h-4 w-4 mr-2" />
                        Edit Text
                      </Button>
                    </div>
                  </motion.div>
                )}

                {activeTab === "effects" && (
                  <motion.div {...fadeIn} className="space-y-4">
                    <div className="text-center py-8 text-zinc-500">
                      <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Advanced effects coming soon</p>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-4 border-t border-zinc-800">
                <Button
                  onClick={handleSave}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={thumbnailLoading}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {thumbnailLoading ? 'Generating...' : 'Save Thumbnail'}
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 text-zinc-300"
                    disabled={thumbnailLoading}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 text-zinc-300"
                    disabled={thumbnailLoading}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
