"use client";

import React, { useState, useEffect, forwardRef, useRef } from "react";
import { Loader2, AlertTriangle, Sparkles } from "lucide-react";
import {
  TransformWrapper,
  TransformComponent,
  ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { fetchImageWithCache } from "@/lib/frontend/services/clickatron-image-cache";

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
  /**
   * When false, disables zoom/pan controls and renders a plain image.
   * Useful for small thumbnails in galleries.
   */
  interactive?: boolean;
}

// Cache for storing object URLs to prevent unnecessary re-fetching
const urlCache = new Map<string, string>();

// Function to clear the URL cache (useful for testing or when needed)
export function clearUrlCache(): void {
  // Revoke all object URLs to prevent memory leaks
  urlCache.forEach((url) => {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  });
  urlCache.clear();
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
      interactive = true,
    },
    ref
  ) => {
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const currentImageRef = useRef<string | null>(null);

    useEffect(() => {
      console.log('ImageDisplay useEffect triggered', { status, imageRef, variationId });

      // If we're currently generating, show the generating UI immediately
      if (status === "generating") {
        // clear any existing image while generating and show loader
        setSignedUrl(null);
        setIsLoading(true);
        return;
      }

      // Clean up previous object URL
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }

      // If we don't have an imageRef, nothing to load
      if (!imageRef) {
        setSignedUrl(null);
        setIsLoading(false);
        return;
      }

      // If we're already loading or have loaded this image, don't fetch again
      if (currentImageRef.current === imageRef && signedUrl) {
        setIsLoading(false);
        return;
      }

      // Check if we have this image in our URL cache
      const cachedUrl = urlCache.get(imageRef);
      if (cachedUrl) {
        console.log('Using cached URL for', imageRef);
        setSignedUrl(cachedUrl);
        setIsLoading(false);
        currentImageRef.current = imageRef;
        return;
      }

      const fetchSignedUrl = async () => {
        if (status === "completed" && imageRef && imageRef.startsWith("https://storage.googleapis.com")) {
          console.log('Fetching signed URL for', imageRef);
          setIsLoading(true);
          try {
            // First check if we have a cached version of this image
            const cachedResponse = await fetchImageWithCache(imageRef);
            if (cachedResponse.ok) {
              // If we have a cached version, create an object URL for it
              const blob = await cachedResponse.blob();
              const newObjectUrl = URL.createObjectURL(blob);
              setObjectUrl(newObjectUrl);
              setSignedUrl(newObjectUrl);
              urlCache.set(imageRef, newObjectUrl); // Cache the URL
              currentImageRef.current = imageRef;
              return;
            }
            
            // If not in cache, fetch from the API as before
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
            urlCache.set(imageRef, data.signedUrl); // Cache the URL
            currentImageRef.current = imageRef;
          } catch (error) {
            console.error('Error fetching signed URL:', error);
            setSignedUrl(null);
          } finally {
            setIsLoading(false);
          }
        } else if (status === "completed" && imageRef) {
          // For non-GCS URLs, check cache first
          const loadImage = async () => {
            setIsLoading(true);
            try {
              const cachedResponse = await fetchImageWithCache(imageRef);
              if (cachedResponse.ok) {
                const blob = await cachedResponse.blob();
                const newObjectUrl = URL.createObjectURL(blob);
                setObjectUrl(newObjectUrl);
                setSignedUrl(newObjectUrl);
                urlCache.set(imageRef, newObjectUrl); // Cache the URL
                currentImageRef.current = imageRef;
                return;
              }
              // If not cached, use the direct URL
              setSignedUrl(imageRef);
              urlCache.set(imageRef, imageRef); // Cache the URL
              currentImageRef.current = imageRef;
            } catch (error) {
              console.error('Error loading image:', error);
              setSignedUrl(imageRef); // Fallback to direct URL
              urlCache.set(imageRef, imageRef); // Cache the URL
              currentImageRef.current = imageRef;
            } finally {
              setIsLoading(false);
            }
          };
          loadImage();
        } else {
          setSignedUrl(null);
          setIsLoading(false);
        }
      };

      fetchSignedUrl();
      
      // Clean up object URL when component unmounts
      return () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }, [imageRef, status]); // Removed variationId from dependencies

    if (isLoading) {
      return (
        <div
          className={`bg-gradient-to-br from-zinc-800/60 to-zinc-800/40 flex items-center justify-center rounded-xl border border-zinc-700/50 ${className}`}
        >
          {/* Ambient background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5 opacity-60 rounded-xl" />
          
          <div className="text-center relative z-10">
            {/* Enhanced loading animation */}
            <div className="relative mb-4">
              {/* Outer glow ring */}
              <div className="absolute inset-0 w-16 h-16 mx-auto rounded-full bg-purple-500/20 blur-lg animate-pulse" />
              
              {/* Main spinner */}
              <div className="relative w-16 h-16 mx-auto">
                <svg className="w-16 h-16 animate-spin" viewBox="0 0 64 64">
                  {/* Background circle */}
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    className="text-zinc-700/30"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    className="text-purple-400"
                    strokeDasharray="176"
                    strokeDashoffset="44"
                  />
                </svg>
                
                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-purple-400 animate-pulse" />
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="text-zinc-300 font-medium">
                {status === "generating" ? "Creating your thumbnail..." : "Loading image..."}
              </div>
              
              {status === "generating" && (
                <div className="text-zinc-500 text-sm">
                  AI is working its magic
                </div>
              )}
              
              {/* Progress bar for generation */}
              {status === "generating" && (
                <div className="mt-4 w-48 h-2 bg-zinc-700/50 rounded-full overflow-hidden mx-auto">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse" 
                       style={{ width: "60%", animation: 'pulse 2s infinite' }} />
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (status === "failed") {
      return (
        <div
          className={`bg-gradient-to-br from-red-900/20 to-red-800/10 border border-red-500/30 flex items-center justify-center rounded-xl ${className}`}
        >
          {/* Ambient background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-orange-500/5 opacity-40 rounded-xl" />
          
          <div className="text-center relative z-10 p-6">
            {/* Error icon with glow */}
            <div className="relative mb-4">
              <div className="absolute inset-0 w-12 h-12 mx-auto rounded-full bg-red-500/20 blur-lg" />
              <div className="relative w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center ring-1 ring-red-400/30">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="text-red-300 font-medium">Generation Failed</div>
              <div className="text-red-400/70 text-sm max-w-xs mx-auto">
                Something went wrong while creating your thumbnail
              </div>
              
              {/* Retry hint */}
              <div className="mt-4 text-xs text-red-500/60">
                Try adjusting your prompt or generating again
              </div>
            </div>
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
      filter: [
        status === 'generating' && imageRef ? 'blur(8px)' : '',
        `brightness(${fineTuning.brightness}%) contrast(${fineTuning.contrast}%) saturate(${fineTuning.saturation}%)`
      ].filter(Boolean).join(' '),
    };

    return (
      // If interactive is disabled, render a plain img to avoid zoom/pan controls
      (interactive ? (
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
              alt=""
              className={`${className} select-none`}
              style={imageStyle}
              draggable={false}
            />
          </TransformComponent>
        </TransformWrapper>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <img
            src={signedUrl}
            alt=""
            className={`${className} select-none`}
            style={imageStyle}
            draggable={false}
          />
        </div>
      ))
    );
  }
);

ImageDisplay.displayName = "ImageDisplay";
