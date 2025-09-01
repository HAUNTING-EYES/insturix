"use client";

import React, { useState, useEffect, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import {
  TransformWrapper,
  TransformComponent,
  ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";

interface ImageDisplayProps {
  imageRef?: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
  status?: "generating" | "completed" | "failed" | "blank";
  variationId?: string;
  fineTuning?: {
    brightness: number;
    contrast: number;
    saturation: number;
  };
}

export const ImageDisplay = forwardRef<ReactZoomPanPinchRef, ImageDisplayProps>(
  (
    {
      imageRef,
      alt = "Generated image",
      className = "",
      fallback,
      status = "completed",
      variationId,
      fineTuning = { brightness: 100, contrast: 100, saturation: 100 },
    },
    ref
  ) => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
      if (status === "generating") {
        setIsLoading(true);
        setImageUrl(null);
        setError(false);
        return;
      }

      if (status === "blank" || !imageRef || imageRef.trim() === "") {
        setIsLoading(false);
        setImageUrl(null);
        setError(false);
        return;
      }

      setImageUrl(imageRef);
      setIsLoading(false);
    }, [imageRef, status, variationId]);

    if (isLoading || status === "generating") {
      return (
        <div
          className={`bg-zinc-800/50 flex items-center justify-center ${className}`}
        >
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400 mx-auto mb-2" />
            <div className="text-zinc-400 text-sm">Generating...</div>
          </div>
        </div>
      );
    }

    if (status === "failed") {
      return (
        <div
          className={`bg-red-900/20 border-2 border-red-500/30 flex items-center justify-center ${className}`}
        >
          <div className="text-center">
            <div className="text-red-400 text-sm mb-2">Generation failed</div>
            <div className="text-red-300/70 text-xs">Try generating again</div>
          </div>
        </div>
      );
    }

    if (
      status === "blank" ||
      (!imageUrl && !isLoading && status === "completed")
    ) {
      return (
        <div
          className={`bg-zinc-800/30 border-2 border-dashed border-zinc-600/50 flex items-center justify-center ${className}`}
        >
          <div className="text-center">
            <div className="text-zinc-400 text-sm mb-2">
              Create Image to Start
            </div>
            <div className="text-zinc-500/70 text-xs">
              Use the AI console to generate your first image
            </div>
          </div>
        </div>
      );
    }

    if (error || (!imageUrl && status === "completed")) {
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
      <TransformWrapper
        ref={ref}
        initialScale={1}
        minScale={0.1}
        maxScale={5}
        centerOnInit={true}
        limitToBounds={false}
        panning={{ disabled: false }}
        wheel={{ step: 0.1 }}
        doubleClick={{ disabled: false, mode: "zoomIn", step: 0.3 }}
        onInit={(ref) => {
          // Ensure image fits in container on initial load
          setTimeout(() => {
            ref.resetTransform();
          }, 100);
        }}
      >
        <TransformComponent
          wrapperClass="w-full h-full flex items-center justify-center"
          contentClass="flex items-center justify-center"
        >
          <img
            src={imageUrl || undefined}
            alt={alt}
            className={`${className} select-none`}
            style={imageStyle}
            draggable={false}
            onLoad={() => {
              // Reset zoom to fit image in container on load
              if (ref && "current" in ref && ref.current) {
                setTimeout(() => {
                  ref.current?.resetTransform();
                }, 50);
              }
            }}
          />
        </TransformComponent>
      </TransformWrapper>
    );
  }
);

ImageDisplay.displayName = "ImageDisplay";
