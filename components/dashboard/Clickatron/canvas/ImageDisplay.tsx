"use client";

import React, { useState, useEffect } from "react";
import { getMockImageForVariation } from "@/lib/mock-images";
import { Loader2 } from "lucide-react";

interface ImageDisplayProps {
  imageRef?: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
  status?: 'generating' | 'completed' | 'failed';
  variationId?: string;
  fineTuning?: {
    brightness: number;
    contrast: number;
    saturation: number;
  }
}

export function ImageDisplay({
  imageRef,
  alt = "Generated image",
  className = "",
  fallback,
  status = 'completed',
  variationId,
  fineTuning = { brightness: 100, contrast: 100, saturation: 100 },
}: ImageDisplayProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (status === 'generating') {
      setIsLoading(true);
      setImageUrl(null);
      setError(false);
      return;
    }


    if (!imageRef) {
      setIsLoading(false);
      setError(true);
      return;
    }

    setImageUrl(imageRef);
    setIsLoading(false);
    
  }, [imageRef, status, variationId]);

  if (isLoading || status === 'generating') {
    return (
      <div className={`bg-zinc-800/50 flex items-center justify-center ${className}`}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400 mx-auto mb-2" />
          <div className="text-zinc-400 text-sm">Generating...</div>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className={`bg-red-900/20 border-2 border-red-500/30 flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="text-red-400 text-sm mb-2">Generation failed</div>
          <div className="text-red-300/70 text-xs">Try generating again</div>
        </div>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      fallback || (
        <div
          className={`bg-gradient-to-br from-purple-500/30 to-blue-500/30 ${className}`}
        />
      )
    );
  }

  const imageStyle: React.CSSProperties = {
    filter: `brightness(${fineTuning.brightness}%) contrast(${fineTuning.contrast}%) saturate(${fineTuning.saturation}%)`,
  };

  return (
    <img src={imageUrl} alt={alt} className={className} style={imageStyle} draggable={false} />
  );
}
