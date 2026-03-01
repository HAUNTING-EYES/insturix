"use client";

import React, { useState, useEffect, forwardRef, useRef, useMemo } from "react";
import { Loader2, AlertTriangle, Sparkles, Plus } from "lucide-react";
import {
  TransformWrapper,
  TransformComponent,
  ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { fetchImageWithCache } from "@/lib/frontend/services/clickatron-image-cache";
import { ColorCurves, CurvePoint } from "@/types/clickatron";

// Helper function to get aspect ratio dimensions
const getAspectRatioDimensions = (
  aspectRatio: string,
  maxWidth: number,
  maxHeight: number,
) => {
  const [widthRatio, heightRatio] = aspectRatio.split(":").map(Number);
  const ratio = widthRatio / heightRatio;

  let width = maxWidth;
  let height = width / ratio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }

  return { width, height };
};

interface ImageDisplayProps {
  imageRef?: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
  prompt?: string;
  status?: "generating" | "completed" | "failed" | "blank";
  variationId?: string;
  fineTuning?: {
    brightness: number;
    contrast: number;
    saturation: number;
    curves?: ColorCurves;
  };
  aspectRatio?: string;
  /**
   * When false, disables zoom/pan controls and renders a plain image.
   * Useful for small thumbnails in galleries.
   */
  interactive?: boolean;
  /**
   * Optional explicit width for the image
   */
  width?: number;
  /**
   * Optional explicit height for the image
   */
  height?: number;
  /**
   * Callback when image loads with natural dimensions
   */
  onImageLoad?: (dimensions: { width: number; height: number }) => void;
  isFillGenerating?: boolean;
}

// Cache for storing object URLs to prevent unnecessary re-fetching
// Helper for truncating long prompts
const truncatePrompt = (str: string, length: number = 100) => {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
};

export const ImageDisplay = forwardRef<ReactZoomPanPinchRef, ImageDisplayProps>(
  (
    {
      imageRef,
      alt = "Generated image",
      prompt,
      aspectRatio,
      className = "",
      fallback,
      status = "completed",
      variationId,
      fineTuning = { brightness: 100, contrast: 100, saturation: 100 },
      interactive = true,
      width: explicitWidth,
      height: explicitHeight,
      onImageLoad,
      isFillGenerating = false,
    },
    ref,
  ) => {
    const [proxyUrl, setProxyUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 800, height: 450 });
    const currentImageRef = useRef<string | null>(null);

    // Inject custom styles for flow animations (single hook, placed early)
    useEffect(() => {
      if (typeof document !== "undefined") {
        let styleSheet = document.getElementById("flow-animations");
        if (!styleSheet) {
          styleSheet = document.createElement("style");
          styleSheet.id = "flow-animations";
          const animationStyles = `
            @keyframes gentle-flow {
              0%, 100% {
                transform: translate(0, 0) scale(1);
                background-position: 0% 0%;
              }
              50% {
                transform: translate(15px, -15px) scale(1.1);
                background-position: 100% 100%;
              }
            }
            @keyframes gentle-flow-reverse {
              0%, 100% {
                transform: translate(0, 0) scale(1);
                background-position: 100% 100%;
              }
              50% {
                transform: translate(-15px, 15px) scale(1.1);
                background-position: 0% 0%;
              }
            }
            .react-transform-wrapper {
              height: 100% !important;
            }
          `;
          styleSheet.textContent = animationStyles;
          document.head.appendChild(styleSheet);
        }
      }
    }, []);

    // Calculate dimensions based on aspectRatio or use explicit props
    useEffect(() => {
      if (explicitWidth && explicitHeight) {
        setDimensions({ width: explicitWidth, height: explicitHeight });
        return;
      }

      if (aspectRatio) {
        const updateDimensions = () => {
          const containerWidth = Math.min(window.innerWidth - 400, 1200); // Account for sidebars
          const containerHeight = Math.min(window.innerHeight - 200, 800); // Account for header/footer
          const { width, height } = getAspectRatioDimensions(
            aspectRatio,
            containerWidth * 0.8,
            containerHeight * 0.8,
          );
          setDimensions({ width, height });
        };

        updateDimensions();
        window.addEventListener("resize", updateDimensions);
        return () => window.removeEventListener("resize", updateDimensions);
      }
    }, [aspectRatio, explicitWidth, explicitHeight]);

    // Construct proxy URL for imageRef
    useEffect(() => {
      if (imageRef) {
        let proxyUrlPath = imageRef;
        if (imageRef.startsWith("https://storage.googleapis.com/")) {
          // Extract path within bucket for proxy
          const pathAfterDomain = imageRef.substring(
            "https://storage.googleapis.com/".length,
          );
          const pathSegments = pathAfterDomain.split("/");
          const pathWithinBucket = pathSegments.slice(1).join("/");
          proxyUrlPath = pathWithinBucket.split("?")[0]; // Remove query params
        }
        const encodedPath = encodeURIComponent(proxyUrlPath);
        setProxyUrl(`/api/proxy/image?path=${encodedPath}`);
        currentImageRef.current = imageRef;
        setIsLoading(status === "generating"); // Show loading for generating, hide for completed
        setImageLoaded(false); // Reset image loaded state when image changes
      } else {
        setProxyUrl(null);
        setIsLoading(false);
        setImageLoaded(false);
      }
    }, [imageRef, status]);

    // Generate SVG table values from curve points
    const getCurveTableValues = (points: CurvePoint[] | undefined) => {
      if (!points || points.length < 2) return "0 1"; // Linear default

      // Sort points by x
      const sortedPoints = [...points].sort((a, b) => a.x - b.x);

      // Generate lookup table (256 values)
      const values = [];
      for (let i = 0; i < 256; i++) {
        const x = i / 255;

        // Find segment
        let p0 = sortedPoints[0];
        let p1 = sortedPoints[1];

        for (let j = 0; j < sortedPoints.length - 1; j++) {
          if (x >= sortedPoints[j].x && x <= sortedPoints[j + 1].x) {
            p0 = sortedPoints[j];
            p1 = sortedPoints[j + 1];
            break;
          }
        }

        // Linear interpolation for now (matching editor visualization)
        // Can be upgraded to spline if editor uses spline
        const t = (x - p0.x) / (p1.x - p0.x || 1);
        const y = p0.y + t * (p1.y - p0.y);

        values.push(Math.max(0, Math.min(1, y)));
      }

      return values.join(" ");
    };

    // Combine master curve with channel curves
    const getChannelValues = (
      channelPoints: CurvePoint[] | undefined,
      masterPoints: CurvePoint[] | undefined,
    ) => {
      // This is a simplification. True combination requires applying master curve to RGB,
      // but SVG filters apply them in parallel or sequentially.
      // A common way is to chain filters, but here we can try to combine them mathematically
      // or just apply channel curves if master is default, etc.
      // Better approach for SVG:
      // Use feComponentTransfer for R, G, B channels.
      // Master curve affects all channels. We can't easily combine two table lookups in one feComponentTransfer primitive
      // without complex math or multiple filter primitives.
      // Let's use two feComponentTransfer primitives: one for channels, one for master.

      return getCurveTableValues(channelPoints);
    };

    const masterValues = useMemo(
      () => getCurveTableValues(fineTuning.curves?.master),
      [fineTuning.curves?.master],
    );
    const redValues = useMemo(
      () => getCurveTableValues(fineTuning.curves?.red),
      [fineTuning.curves?.red],
    );
    const greenValues = useMemo(
      () => getCurveTableValues(fineTuning.curves?.green),
      [fineTuning.curves?.green],
    );
    const blueValues = useMemo(
      () => getCurveTableValues(fineTuning.curves?.blue),
      [fineTuning.curves?.blue],
    );

    const filterId = `curves-${variationId || "default"}`;

    // Style object for maintaining aspect ratio based on calculated dimensions
    const aspectRatioStyle: React.CSSProperties = aspectRatio
      ? {
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          maxWidth: "100%",
          aspectRatio: aspectRatio.replace(":", "/"),
        }
      : {};

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
                {status === "generating"
                  ? "Creating your thumbnail..."
                  : "Loading image..."}
              </div>

              {status === "generating" && (
                <div className="text-zinc-500 text-sm">
                  AI is working its magic
                </div>
              )}

              {/* Progress bar for generation */}
              {status === "generating" && (
                <div className="mt-4 w-48 h-2 bg-zinc-700/50 rounded-full overflow-hidden mx-auto">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse"
                    style={{ width: "60%", animation: "pulse 2s infinite" }}
                  />
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

    if (status === "blank" && !proxyUrl) {
      return (
        <div
          className={`bg-zinc-800/30 border-2 border-dashed border-zinc-600/50 flex items-center justify-center rounded-lg transition-all duration-300 ${className}`}
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            minWidth: "300px",
            minHeight: "200px",
          }}
        >
          <div className="text-center">
            <div className="text-zinc-400 text-lg mb-2">
              Create Variation to Start
            </div>
            <div className="text-zinc-500/70 text-sm">
              Use the AI console below to generate an image
            </div>
            <div className="text-zinc-600 text-xs mt-2">
              {aspectRatio} aspect ratio
            </div>
          </div>
        </div>
      );
    }

    const imageStyle: React.CSSProperties = {
      filter: [
        status === "generating" && imageRef ? "blur(16px)" : "",
        `brightness(${fineTuning.brightness}%) contrast(${fineTuning.contrast}%) saturate(${fineTuning.saturation}%)`,
        `url(#${filterId})`,
      ]
        .filter(Boolean)
        .join(" "),
      width: "100%",
      height: "100%",
      objectFit: status === "generating" ? "cover" : "contain",
    };

    // For generating without imageRef (new variation), show generating placeholder
    if (status === "generating" && !imageRef) {
      return (
        <div
          className={`relative bg-gradient-to-br from-zinc-800/60 to-zinc-800/40 flex items-center justify-center rounded-lg border border-zinc-600/50 overflow-hidden ${className}`}
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            minWidth: "300px",
            minHeight: "200px",
          }}
        >
          {/* Ambient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5 opacity-60" />

          {/* Loading indicator - centered */}
          <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 flex items-center justify-center">
              <svg className="w-16 h-16 animate-spin" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  className="text-zinc-600/30"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  className="text-purple-400"
                  strokeDasharray="63"
                  strokeDashoffset="16"
                />
              </svg>
            </div>
            <div className="text-center space-y-1">
              <div className="text-zinc-300 font-medium">
                Creating your thumbnail...
              </div>
              <div className="text-zinc-500 text-sm">
                AI is working its magic
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative w-full h-full flex items-center justify-center">
        {/* SVG Filters for Curves */}
        <svg className="absolute w-0 h-0">
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB">
              {/* Channel Curves */}
              <feComponentTransfer>
                <feFuncR type="table" tableValues={redValues} />
                <feFuncG type="table" tableValues={greenValues} />
                <feFuncB type="table" tableValues={blueValues} />
              </feComponentTransfer>
              {/* Master Curve (applied to all channels equally) */}
              <feComponentTransfer>
                <feFuncR type="table" tableValues={masterValues} />
                <feFuncG type="table" tableValues={masterValues} />
                <feFuncB type="table" tableValues={masterValues} />
              </feComponentTransfer>
            </filter>
          </defs>
        </svg>

        {/* Main image container with overlay inside for proper positioning */}
        {/* If interactive is disabled, render a plain img to avoid zoom/pan controls */}
        {interactive ? (
          <TransformWrapper
            ref={ref}
            initialScale={1}
            minScale={0.1}
            maxScale={5}
            centerOnInit={true}
            limitToBounds={false}
            panning={{ disabled: status === "generating" || isFillGenerating }}
            wheel={{
              disabled: status === "generating" || isFillGenerating,
              step: 0.1,
            }}
            doubleClick={{
              disabled: status === "generating" || isFillGenerating,
              mode: "zoomIn",
              step: 0.3,
            }}
            onInit={(r) => {
              setTimeout(() => r.resetTransform(), 100);
            }}
          >
            <TransformComponent
              wrapperClass="relative flex items-center justify-center"
              contentClass="flex items-center justify-center"
              wrapperStyle={{ width: "100%", height: "100%" }}
            >
              <div className="relative w-full h-full" style={aspectRatioStyle}>
                {/* Gradient placeholder - shows immediately */}
                {!imageLoaded && (
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-zinc-800/80 via-zinc-700/60 to-zinc-800/80 animate-pulse" />
                )}
                {/* Blurred image placeholder - shows once image starts loading */}
                {!imageLoaded && proxyUrl && (
                  <img
                    src={proxyUrl}
                    alt={alt}
                    className={`${className} select-none rounded-lg`}
                    style={{
                      ...imageStyle,
                      ...aspectRatioStyle,
                      objectFit: "cover",
                      filter: "blur(20px) brightness(0.6) saturate(1.2)",
                      transform: "scale(1.05)",
                      opacity: 0.8,
                    }}
                    aria-hidden="true"
                  />
                )}
                {/* Actual sharp image */}
                <img
                  src={proxyUrl ?? undefined}
                  alt={alt}
                  loading="eager"
                  decoding="sync"
                  fetchPriority="high"
                  className={`${className} select-none rounded-lg relative z-10`}
                  style={{
                    ...imageStyle,
                    ...aspectRatioStyle,
                    opacity: imageLoaded ? 1 : 0,
                    filter: imageLoaded
                      ? imageStyle.filter || ""
                      : `${imageStyle.filter || ""} blur(12px)`,
                    transition: "opacity 500ms ease, filter 500ms ease",
                  }}
                  onLoad={(e) => {
                    setImageLoaded(true);
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.filter = imageStyle.filter || "";
                    const img = e.currentTarget;
                    if (onImageLoad && img.naturalWidth && img.naturalHeight) {
                      onImageLoad({
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                      });
                    }
                  }}
                  draggable={false}
                />
              </div>
            </TransformComponent>
          </TransformWrapper>
        ) : (
          <div
            className="relative w-full h-full flex items-center justify-center"
            style={aspectRatioStyle}
          >
            {/* Gradient placeholder - shows immediately */}
            {!imageLoaded && (
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-zinc-800/80 via-zinc-700/60 to-zinc-800/80 animate-pulse" />
            )}
            {/* Blurred image placeholder - shows once image starts loading */}
            {!imageLoaded && proxyUrl && (
              <img
                src={proxyUrl}
                alt=""
                className="absolute inset-0 rounded-lg"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: "blur(20px) brightness(0.6) saturate(1.2)",
                  transform: "scale(1.05)",
                  opacity: 0.8,
                }}
                aria-hidden="true"
              />
            )}
            {/* Actual sharp image */}
            <img
              src={proxyUrl ?? undefined}
              alt={alt}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className={`${className} select-none rounded-lg relative z-10`}
              style={{
                ...imageStyle,
                width: "100%",
                height: "100%",
                opacity: imageLoaded ? 1 : 0,
                filter: imageLoaded
                  ? imageStyle.filter || ""
                  : `${imageStyle.filter || ""} blur(12px)`,
                transition: "opacity 500ms ease, filter 500ms ease",
              }}
              onLoad={(e) => {
                setImageLoaded(true);
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.filter = imageStyle.filter || "";
                const img = e.currentTarget;
                if (onImageLoad && img.naturalWidth && img.naturalHeight) {
                  onImageLoad({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                  });
                }
              }}
              draggable={false}
            />
          </div>
        )}

        {/* Generative Fill Loading Overlay */}
        {isFillGenerating && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] rounded-lg pointer-events-none">
            <div className="text-center">
              {/* Spinning loader */}
              <div className="relative mb-4">
                <div className="absolute inset-0 w-16 h-16 mx-auto rounded-full bg-purple-500/30 blur-xl animate-pulse" />
                <div className="relative w-16 h-16 mx-auto">
                  <svg className="w-16 h-16 animate-spin" viewBox="0 0 64 64">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      className="text-zinc-700/30"
                    />
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
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="h-7 w-7 text-purple-400 animate-pulse" />
                  </div>
                </div>
              </div>

              {/* Text */}
              <div className="space-y-1">
                <p className="text-white text-lg font-semibold">
                  Generative Fill
                </p>
                <p className="text-zinc-300 text-sm">
                  AI is filling your selection...
                </p>
              </div>

              {/* Progress bar */}
              <div className="mt-4 w-48 h-2 bg-zinc-700/50 rounded-full overflow-hidden mx-auto">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-full"
                  style={{
                    width: "70%",
                    animation: "pulse 2s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Generating overlay - show for variations with status generating */}
        {status === "generating" && !isFillGenerating && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Base subtle tint for better visibility */}
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 via-cyan-500/5 to-yellow-500/5"></div>

            {/* Animated pastel mesh gradient overlay - increased opacity for visibility */}
            {/* Layer 1: Pink to turquoise flow */}
            <div
              className="absolute inset-0 opacity-20 bg-[length:200%_200%] bg-[radial-gradient(circle_at_20%_80%,#ffb3ba40_0%,#a7e6ff40_50%,transparent_100%)] animate-[gentle-flow_4s_ease-in-out_infinite]"
              style={{ animationDelay: "0s", backgroundPosition: "0% 0%" }}
            ></div>
            {/* Layer 2: Cyan to yellow mesh */}
            <div
              className="absolute inset-0 opacity-25 bg-[length:250%_250%] bg-[radial-gradient(circle_at_80%_20%,#b5f2ff50_0%,#fff3cd50_50%,transparent_100%)] animate-[gentle-flow-reverse_5s_ease-in-out_infinite]"
              style={{ animationDelay: "1s", backgroundPosition: "100% 100%" }}
            ></div>
            {/* Layer 3: Lavender to pink blend */}
            <div
              className="absolute inset-0 opacity-15 bg-[length:180%_180%] bg-[radial-gradient(ellipse_at_40%_60%,#e6e6fa30_0%,#ffb3ba30_50%,#a7e6ff30_100%)] animate-[gentle-flow_3s_ease-in-out_infinite]"
              style={{ animationDelay: "2s", backgroundPosition: "50% 50%" }}
            ></div>
            {/* Layer 4: Turquoise to cyan wave */}
            <div className="absolute inset-0 opacity-20 bg-[linear-gradient(135deg,#a7e6ff40_0%,#b5f2ff40_30%,#fff3cd40_60%,transparent_100%)] animate-shimmer bg-[length:300%_300%]"></div>
            {/* Subtle noise for AI texture */}
            <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.1%22%3E%3Ccircle cx=%2230%22 cy=%2230%22 r=%221%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] animate-pulse"></div>

            {/* Generating text overlay with enhanced visibility */}
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center bg-black/50 backdrop-blur-md rounded-2xl px-8 py-4 border border-white/30 shadow-2xl relative">
                <div className="absolute inset-0 bg-gradient-to-r from-pink-400/20 via-cyan-400/20 to-yellow-400/20 rounded-2xl blur animate-pulse"></div>
                <div className="relative text-white font-semibold text-xl mb-1">
                  Generating...
                </div>
                <div className="relative text-white/90 text-sm">
                  {imageRef
                    ? "AI weaving magic into your edit"
                    : "Creating your thumbnail..."}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Prompt Overlay */}
        {status === "completed" && prompt && !isFillGenerating && (
          <div className="absolute bottom-0 left-0 right-0 p-4 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-xl max-w-2xl mx-auto pointer-events-auto">
              <div className="text-xs text-zinc-400 font-medium mb-1 uppercase tracking-wider">
                Prompt
              </div>
              <p className="text-sm text-white/90 leading-relaxed line-clamp-3">
                {prompt}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  },
);

ImageDisplay.displayName = "ImageDisplay";
