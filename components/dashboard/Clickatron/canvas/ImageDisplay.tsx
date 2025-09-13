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
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
      console.log('ImageDisplay useEffect triggered', { status, imageRef, variationId });
      const fetchSignedUrl = async () => {
        if (status === "completed" && imageRef && imageRef.startsWith("https://storage.googleapis.com")) {
          console.log('Fetching signed URL for', imageRef);
          setIsLoading(true);
          try {
            const response = await fetch('/api/services/clickatron/utils/get-signed-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gcsUrl: imageRef }),
            });
            console.log('Signed URL response status:', response.status);
            if (!response.ok) throw new Error('Failed to get signed URL');
            const data = await response.json();
            console.log('Signed URL received:', data.signedUrl);
            setSignedUrl(data.signedUrl);
          } catch (error) {
            console.error('Error fetching signed URL:', error);
            setSignedUrl(null);
          } finally {
            setIsLoading(false);
          }
        } else if (status === "completed" && imageRef) {
          setSignedUrl(imageRef);
          setIsLoading(false);
        } else {
          setSignedUrl(null);
          setIsLoading(false);
        }
      };

      fetchSignedUrl();
    }, [imageRef, status, variationId]);

    if (isLoading) {
      return (
        <div
          className={`bg-zinc-800/50 flex items-center justify-center ${className}`}
        >
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400 mx-auto mb-2" />
            <div className="text-zinc-400 text-sm">
              {status === "generating" ? "Generating..." : "Loading image..."}
            </div>
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

    if (status === "blank" || !signedUrl) {
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
        onInit={(r) => {
          setTimeout(() => r.resetTransform(), 100);
        }}
      >
        <TransformComponent
          wrapperClass="w-full h-full flex items-center justify-center"
          contentClass="flex items-center justify-center"
        >
          <img
            src={signedUrl}
            alt={alt}
            className={`${className} select-none`}
            style={imageStyle}
            draggable={false}
          />
        </TransformComponent>
      </TransformWrapper>
    );
  }
);

ImageDisplay.displayName = "ImageDisplay";
