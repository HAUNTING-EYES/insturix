"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Check, Download, Edit } from 'lucide-react';

interface GalleryStageProps {
  videoIdea: string;
  selectedDirection: string;
  selectedPreset?: {
    id: string;
    name: string;
    aspectRatio: string;
    dimensions: string;
  };
  onComplete: (data: { selectedThumbnail: string }) => void;
}

interface ThumbnailVariation {
  id: string;
  url: string;
  title: string;
  description: string;
}

// Mock thumbnail generator
const generateThumbnails = (videoIdea: string, direction: string): ThumbnailVariation[] => {
  // This would be replaced with actual AI generation
  return [
    {
      id: 'thumb_1',
      url: '/api/placeholder/400/225',
      title: `${direction} - Variation A`,
      description: 'Bold text overlay with dynamic composition'
    },
    {
      id: 'thumb_2', 
      url: '/api/placeholder/400/225',
      title: `${direction} - Variation B`,
      description: 'Minimalist approach with focused subject'
    },
    {
      id: 'thumb_3',
      url: '/api/placeholder/400/225', 
      title: `${direction} - Variation C`,
      description: 'High contrast with dramatic lighting'
    },
    {
      id: 'thumb_4',
      url: '/api/placeholder/400/225',
      title: `${direction} - Variation D`, 
      description: 'Colorful and vibrant with multiple elements'
    }
  ];
};

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" } as any
};

const staggerChildren = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

export function GalleryStage({ videoIdea, selectedDirection, selectedPreset, onComplete }: GalleryStageProps) {
  const [thumbnails, setThumbnails] = useState<ThumbnailVariation[]>([]);
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate AI generation delay
    const timer = setTimeout(() => {
      const generatedThumbnails = generateThumbnails(videoIdea, selectedDirection);
      setThumbnails(generatedThumbnails);
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, [videoIdea, selectedDirection]);

  const handleThumbnailSelect = (thumbnailId: string) => {
    setSelectedThumbnail(thumbnailId);
  };

  const handleProceedToCanvas = () => {
    if (selectedThumbnail) {
      onComplete({ selectedThumbnail });
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80">
        <CardContent className="p-8 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-4"
          >
            <Sparkles className="h-8 w-8 text-purple-400" />
          </motion.div>
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">
            Generating thumbnails...
          </h2>
          <p className="text-zinc-400">
            Creating {selectedDirection.toLowerCase()} variations for "{videoIdea}"
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`bg-zinc-800/50 rounded-lg animate-pulse ${
                selectedPreset?.aspectRatio === '1:1' 
                  ? 'aspect-square'
                  : selectedPreset?.aspectRatio === '9:16'
                  ? 'aspect-[9/16]'
                  : 'aspect-video' // 16:9 default
              }`} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <Card className="bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80">
        <CardContent className="p-6 sm:p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full text-sm mb-4">
              <Sparkles className="h-4 w-4" />
              {selectedDirection} • {selectedPreset?.name || 'Thumbnail'}
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-zinc-100 mb-3">
              Choose your favorite
            </h2>
            <p className="text-zinc-400 text-lg">
              All variations are focused on your selected creative direction
            </p>
          </div>

          <motion.div 
            variants={staggerChildren}
            initial="initial"
            animate="animate"
            className="grid gap-6 sm:grid-cols-2"
          >
            {thumbnails.map((thumbnail) => (
              <motion.div key={thumbnail.id} variants={fadeIn}>
                <Card 
                  className={`group cursor-pointer transition-all duration-300 hover:scale-[1.02] ${
                    selectedThumbnail === thumbnail.id
                      ? 'bg-purple-500/20 border-purple-500/50 shadow-lg shadow-purple-500/20'
                      : 'bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700/80'
                  }`}
                  onClick={() => handleThumbnailSelect(thumbnail.id)}
                >
                  <CardContent className="p-4">
                    <div className={`relative bg-zinc-800/50 rounded-lg mb-4 overflow-hidden ${
                      selectedPreset?.aspectRatio === '1:1' 
                        ? 'aspect-square'
                        : selectedPreset?.aspectRatio === '9:16'
                        ? 'aspect-[9/16]'
                        : 'aspect-video' // 16:9 default
                    }`}>
                      {/* Mock thumbnail placeholder */}
                      <div className="w-full h-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-2xl mb-2">🎬</div>
                          <div className="text-xs text-zinc-300 font-medium">
                            {thumbnail.title}
                          </div>
                        </div>
                      </div>
                      
                      {/* Selection indicator */}
                      {selectedThumbnail === thumbnail.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-2 right-2 bg-purple-500 text-white rounded-full p-1"
                        >
                          <Check className="h-4 w-4" />
                        </motion.div>
                      )}
                    </div>
                    
                    <div>
                      <h3 className="font-medium text-zinc-200 text-sm mb-1">
                        {thumbnail.title}
                      </h3>
                      <p className="text-zinc-400 text-xs">
                        {thumbnail.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          {selectedThumbnail && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-center gap-4 mt-8"
            >
              <Button
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button
                onClick={handleProceedToCanvas}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Edit className="h-4 w-4 mr-2" />
                Refine in Canvas
              </Button>
            </motion.div>
          )}

          <div className="text-center mt-6">
            <p className="text-zinc-500 text-sm">
              Select a thumbnail to download or refine it further in the canvas
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}