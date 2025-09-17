"use client";

import React, { useState, useEffect, forwardRef, useRef } from "react";
import { Loader2 } from "lucide-react";
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
          className={`bg-zinc-800/50 flex items-center justify-center ${className}`}
        >
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400 mx-auto mb-2" />
            <div className="text-zinc-400 text-sm">
              {status === "generating" ? "Generating..." : "Loading image..."}
            </div>
            {status === "generating" && (
              <div className="mt-2 w-32 h-1.5 bg-zinc-700 rounded-full overflow-hidden mx-auto">
                <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: "60%" }}></div>
              </div>
            )}
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
              alt={alt}
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
            alt={alt}
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
