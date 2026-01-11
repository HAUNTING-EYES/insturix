"use client";

import React, { useState, useRef, useEffect } from "react";
import { Trash2, Check, X } from "lucide-react";

interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SelectionToolProps {
  imageWidth: number;
  imageHeight: number;
  originalWidth?: number;
  originalHeight?: number;
  isActive: boolean;
  onSelectionComplete: (selection: SelectionBounds, maskDataUrl: string) => void;
  onCancel: () => void;
}

export const SelectionTool: React.FC<SelectionToolProps> = ({
  imageWidth,
  imageHeight,
  originalWidth,
  originalHeight,
  isActive,
  onSelectionComplete,
  onCancel,
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [selection, setSelection] = useState<SelectionBounds | null>(null);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Reset selection when tool becomes active
  useEffect(() => {
    if (isActive) {
      setSelection(null);
      setStartPoint(null);
      setIsDrawing(false);
    }
  }, [isActive]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isActive || selection) return; // Don't start new selection if one already exists

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Clamp to image bounds
    const clampedX = Math.max(0, Math.min(x, imageWidth));
    const clampedY = Math.max(0, Math.min(y, imageHeight));

    setStartPoint({ x: clampedX, y: clampedY });
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    // Clamp to image bounds
    const clampedX = Math.max(0, Math.min(currentX, imageWidth));
    const clampedY = Math.max(0, Math.min(currentY, imageHeight));

    // Calculate selection bounds
    const x = Math.min(startPoint.x, clampedX);
    const y = Math.min(startPoint.y, clampedY);
    const width = Math.abs(clampedX - startPoint.x);
    const height = Math.abs(clampedY - startPoint.y);

    setSelection({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
    }
  };

  // Touch event handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isActive || selection) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const clampedX = Math.max(0, Math.min(x, imageWidth));
    const clampedY = Math.max(0, Math.min(y, imageHeight));

    setStartPoint({ x: clampedX, y: clampedY });
    setIsDrawing(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const touch = e.touches[0];
    const currentX = touch.clientX - rect.left;
    const currentY = touch.clientY - rect.top;

    const clampedX = Math.max(0, Math.min(currentX, imageWidth));
    const clampedY = Math.max(0, Math.min(currentY, imageHeight));

    const x = Math.min(startPoint.x, clampedX);
    const y = Math.min(startPoint.y, clampedY);
    const width = Math.abs(clampedX - startPoint.x);
    const height = Math.abs(clampedY - startPoint.y);

    setSelection({ x, y, width, height });
  };

  const handleTouchEnd = () => {
    if (isDrawing) {
      setIsDrawing(false);
    }
  };

  const generateMask = (): string => {
    if (!selection) return "";

    // Determine output dimensions (default to display size if original not provided)
    const outputWidth = originalWidth || imageWidth;
    const outputHeight = originalHeight || imageHeight;

    // Calculate scale factor
    const scaleX = outputWidth / imageWidth;
    const scaleY = outputHeight / imageHeight;

    // Create canvas for mask
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    // Fill with black (0,0,0) - Masked Out Area
    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    // Fill selection with white (255,255,255) - Generation Area
    ctx.fillStyle = "rgb(255,255,255)";

    // Scale selection coordinates
    const scaledX = Math.round(selection.x * scaleX);
    const scaledY = Math.round(selection.y * scaleY);
    const scaledW = Math.round(selection.width * scaleX);
    const scaledH = Math.round(selection.height * scaleY);

    ctx.fillRect(scaledX, scaledY, scaledW, scaledH);

    // Guarantee no alpha channel (fully opaque)
    const imageData = ctx.getImageData(0, 0, outputWidth, outputHeight);
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i + 3] = 255; // alpha
    }
    ctx.putImageData(imageData, 0, 0);
    // Return as data URL
    return canvas.toDataURL("image/png");
  };

  const handleConfirm = () => {
    if (!selection || selection.width < 10 || selection.height < 10) return;

    const maskDataUrl = generateMask();
    onSelectionComplete(selection, maskDataUrl);
  };

  const handleClear = () => {
    setSelection(null);
    setStartPoint(null);
    setIsDrawing(false);
  };

  if (!isActive) return null;

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 z-[60]"
      style={{ width: imageWidth, height: imageHeight }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-black/30 pointer-events-none" />


      {/* Close button for the entire tool - MOVED TO TOP-LEFT TO AVOID OVERLAP */}
      <button
        onClick={onCancel}
        className="absolute top-4 left-4 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors z-[70]"
        title="Close Selection Tool"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Selection rectangle */}
      {selection && (
        <>
          {/* Selected area (clear) */}
          <div
            className="absolute border-2 border-blue-500 bg-transparent pointer-events-none"
            style={{
              left: selection.x,
              top: selection.y,
              width: selection.width,
              height: selection.height,
            }}
          >
            {/* Corner handles */}
            <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-full" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-500 rounded-full" />
            <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
          </div>

          {/* Action buttons */}
          <div
            className="absolute flex gap-2 mt-2 pointer-events-auto"
            style={{
              left: selection.x,
              top: selection.y + selection.height,
            }}
          >
            <button
              onClick={handleConfirm}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
              disabled={selection.width < 10 || selection.height < 10}
            >
              <Check className="w-4 h-4" />
              Confirm
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
            <button
              onClick={onCancel}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Instructions */}
      {!selection && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm pointer-events-none">
          Click and drag to select an area
        </div>
      )}
    </div>
  );
};
