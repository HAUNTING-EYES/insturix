"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Trash2, Check, X, Square, Pencil } from "lucide-react";

interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type SelectionMode = "rectangle" | "lasso";

interface SelectionToolProps {
  imageWidth: number;
  imageHeight: number;
  originalWidth?: number;
  originalHeight?: number;
  isActive: boolean;
  onSelectionComplete: (selection: SelectionBounds, maskDataUrl: string) => void;
  onCancel: () => void;
}

const MIN_RECT_SIZE = 10;
const MIN_LASSO_POINTS = 3;
const MIN_LASSO_BOUNDING_AREA = 400;
const LASSO_POINT_THROTTLE_MS = 8;

export const SelectionTool: React.FC<SelectionToolProps> = ({
  imageWidth,
  imageHeight,
  originalWidth,
  originalHeight,
  isActive,
  onSelectionComplete,
  onCancel,
}) => {
  const [mode, setMode] = useState<SelectionMode>("rectangle");
  const [isDrawing, setIsDrawing] = useState(false);
  const [selection, setSelection] = useState<SelectionBounds | null>(null);
  const [lassoPoints, setLassoPoints] = useState<{ x: number; y: number }[]>([]);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(
    null
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastPointTimeRef = useRef<number>(0);

  const getCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return {
        x: Math.max(0, Math.min(x, imageWidth)),
        y: Math.max(0, Math.min(y, imageHeight)),
      };
    },
    [imageWidth, imageHeight]
  );

  // Reset selection when tool becomes active or mode changes
  useEffect(() => {
    if (isActive) {
      setSelection(null);
      setLassoPoints([]);
      setStartPoint(null);
      setIsDrawing(false);
    }
  }, [isActive, mode]);

  // --- Rectangle handlers ---
  const handleRectMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isActive || (selection && mode === "rectangle")) return;
    const coords = getCoords(e.clientX, e.clientY);
    if (!coords) return;
    setStartPoint(coords);
    setIsDrawing(true);
  };

  const handleRectMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint || mode !== "rectangle") return;
    const coords = getCoords(e.clientX, e.clientY);
    if (!coords) return;
    const x = Math.min(startPoint.x, coords.x);
    const y = Math.min(startPoint.y, coords.y);
    const width = Math.abs(coords.x - startPoint.x);
    const height = Math.abs(coords.y - startPoint.y);
    setSelection({ x, y, width, height });
  };

  const handleRectMouseUp = () => {
    if (isDrawing) setIsDrawing(false);
  };

  // --- Lasso handlers ---
  const handleLassoMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isActive || (lassoPoints.length > 0 && !isDrawing)) return;
    const coords = getCoords(e.clientX, e.clientY);
    if (!coords) return;
    if (lassoPoints.length === 0) {
      setLassoPoints([coords]);
      setStartPoint(coords);
      setIsDrawing(true);
      lastPointTimeRef.current = Date.now();
    }
  };

  const handleLassoMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || lassoPoints.length === 0 || mode !== "lasso") return;
    const now = Date.now();
    if (now - lastPointTimeRef.current < LASSO_POINT_THROTTLE_MS) return;
    lastPointTimeRef.current = now;

    const coords = getCoords(e.clientX, e.clientY);
    if (!coords) return;

    const last = lassoPoints[lassoPoints.length - 1];
    const dist = Math.hypot(coords.x - last.x, coords.y - last.y);
    if (dist < 2) return; // Skip if too close to previous point

    setLassoPoints((prev) => [...prev, coords]);
  };

  const handleLassoMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || lassoPoints.length < 2 || mode !== "lasso") return;
    const coords = getCoords(e.clientX, e.clientY);
    if (!coords || !startPoint) return;

    // Auto-close: if near start point, finalize without adding point
    const distToStart = Math.hypot(
      coords.x - startPoint.x,
      coords.y - startPoint.y
    );
    const shouldClose = distToStart < 20;

    if (shouldClose) {
      setIsDrawing(false);
      const bounds = computeLassoBounds(lassoPoints);
      setSelection(bounds);
    } else {
      const finalPoints = [...lassoPoints, coords];
      setLassoPoints(finalPoints);
      setIsDrawing(false);
      const bounds = computeLassoBounds(finalPoints);
      setSelection(bounds);
    }
  };

  // Touch handlers (unified)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (mode === "rectangle") {
      const coords = getCoords(touch.clientX, touch.clientY);
      if (!coords || !isActive || (selection && mode === "rectangle")) return;
      setStartPoint(coords);
      setIsDrawing(true);
    } else {
      const coords = getCoords(touch.clientX, touch.clientY);
      if (!coords || !isActive || (lassoPoints.length > 0 && !isDrawing)) return;
      if (lassoPoints.length === 0) {
        setLassoPoints([coords]);
        setStartPoint(coords);
        setIsDrawing(true);
        lastPointTimeRef.current = Date.now();
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (mode === "rectangle") {
      if (!isDrawing || !startPoint) return;
      const coords = getCoords(touch.clientX, touch.clientY);
      if (!coords) return;
      const x = Math.min(startPoint.x, coords.x);
      const y = Math.min(startPoint.y, coords.y);
      const width = Math.abs(coords.x - startPoint.x);
      const height = Math.abs(coords.y - startPoint.y);
      setSelection({ x, y, width, height });
    } else {
      if (!isDrawing || lassoPoints.length === 0) return;
      const now = Date.now();
      if (now - lastPointTimeRef.current < LASSO_POINT_THROTTLE_MS) return;
      lastPointTimeRef.current = now;
      const coords = getCoords(touch.clientX, touch.clientY);
      if (!coords) return;
      const last = lassoPoints[lassoPoints.length - 1];
      const dist = Math.hypot(coords.x - last.x, coords.y - last.y);
      if (dist < 2) return;
      setLassoPoints((prev) => [...prev, coords]);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (mode === "rectangle") {
      if (isDrawing) setIsDrawing(false);
    } else {
      if (!isDrawing || lassoPoints.length < 2) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const coords = getCoords(touch.clientX, touch.clientY);
      if (!coords || !startPoint) return;
      const distToStart = Math.hypot(coords.x - startPoint.x, coords.y - startPoint.y);
      const finalPoints =
        distToStart < 20 ? lassoPoints : [...lassoPoints, coords];
      setIsDrawing(false);
      const bounds = computeLassoBounds(finalPoints);
      setSelection(bounds);
      setLassoPoints(finalPoints);
    }
  };

  const computeLassoBounds = (
    points: { x: number; y: number }[]
  ): SelectionBounds => {
    if (points.length === 0)
      return { x: 0, y: 0, width: 0, height: 0 };
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.max(0, Math.min(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxX = Math.min(imageWidth, Math.max(...xs));
    const maxY = Math.min(imageHeight, Math.max(...ys));
    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
  };

  const generateMask = (): string => {
    const outputWidth = originalWidth || imageWidth;
    const outputHeight = originalHeight || imageHeight;
    const scaleX = outputWidth / imageWidth;
    const scaleY = outputHeight / imageHeight;

    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillRect(0, 0, outputWidth, outputHeight);
    ctx.fillStyle = "rgb(255,255,255)";

    if (mode === "rectangle" && selection) {
      const sx = Math.round(selection.x * scaleX);
      const sy = Math.round(selection.y * scaleY);
      const sw = Math.round(selection.width * scaleX);
      const sh = Math.round(selection.height * scaleY);
      ctx.fillRect(sx, sy, sw, sh);
    } else if (mode === "lasso" && lassoPoints.length >= 3) {
      const pts = lassoPoints.map((p) => ({
        x: Math.round(p.x * scaleX),
        y: Math.round(p.y * scaleY),
      }));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
      ctx.fill();
    }

    const imageData = ctx.getImageData(0, 0, outputWidth, outputHeight);
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  };

  const getEffectiveSelection = (): SelectionBounds | null => {
    if (mode === "rectangle") return selection;
    if (mode === "lasso" && lassoPoints.length >= 3) {
      return computeLassoBounds(lassoPoints);
    }
    return null;
  };

  const isValidSelection = (): boolean => {
    const sel = getEffectiveSelection();
    if (!sel) return false;
    if (mode === "rectangle") {
      return sel.width >= MIN_RECT_SIZE && sel.height >= MIN_RECT_SIZE;
    }
    const area = sel.width * sel.height;
    return (
      lassoPoints.length >= MIN_LASSO_POINTS &&
      area >= MIN_LASSO_BOUNDING_AREA
    );
  };

  const handleConfirm = () => {
    if (!isValidSelection()) return;
    const sel = getEffectiveSelection();
    if (!sel) return;
    const maskDataUrl = generateMask();
    onSelectionComplete(sel, maskDataUrl);
  };

  const handleClear = () => {
    setSelection(null);
    setLassoPoints([]);
    setStartPoint(null);
    setIsDrawing(false);
  };

  const hasSelection = mode === "rectangle" ? !!selection : lassoPoints.length >= 3;
  const effectiveBounds = getEffectiveSelection();

  const handleMouseDown =
    mode === "rectangle" ? handleRectMouseDown : handleLassoMouseDown;
  const handleMouseMove =
    mode === "rectangle" ? handleRectMouseMove : handleLassoMouseMove;

  const handleMouseUpOrLeave = (e?: React.MouseEvent<HTMLDivElement>) => {
    if (mode === "rectangle") {
      handleRectMouseUp();
    } else if (isDrawing && lassoPoints.length >= 2) {
      const coords = e ? getCoords(e.clientX, e.clientY) : null;
      const finalPoints =
        coords &&
        startPoint &&
        Math.hypot(coords.x - startPoint.x, coords.y - startPoint.y) >= 20
          ? [...lassoPoints, coords]
          : lassoPoints;
      if (finalPoints.length >= 3) {
        setLassoPoints(finalPoints);
        setSelection(computeLassoBounds(finalPoints));
      }
      setIsDrawing(false);
    }
  };

  if (!isActive) return null;

  const pathD =
    lassoPoints.length >= 2
      ? lassoPoints
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
          .join(" ") + (lassoPoints.length >= 3 ? " Z" : "")
      : "";

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 z-[60] touch-none"
      style={{ width: imageWidth, height: imageHeight }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={(e) => handleMouseUpOrLeave(e)}
      onMouseLeave={() => handleMouseUpOrLeave()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="absolute inset-0 bg-black/30 pointer-events-none" />

      {/* Tool selector */}
      <div className="absolute top-4 left-20 flex gap-1 p-1 bg-black/60 rounded-lg z-[70]">
        <button
          onClick={() => {
            handleClear();
            setMode("rectangle");
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
            mode === "rectangle"
              ? "bg-blue-600 text-white"
              : "text-zinc-300 hover:bg-zinc-700/80"
          }`}
          title="Rectangle Select"
        >
          <Square className="w-4 h-4" />
          Rectangle
        </button>
        <button
          onClick={() => {
            handleClear();
            setMode("lasso");
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
            mode === "lasso"
              ? "bg-blue-600 text-white"
              : "text-zinc-300 hover:bg-zinc-700/80"
          }`}
          title="Lasso Select"
        >
          <Pencil className="w-4 h-4" />
          Lasso
        </button>
      </div>

      <button
        onClick={onCancel}
        className="absolute top-4 left-4 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors z-[70]"
        title="Close Selection Tool"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Rectangle selection */}
      {mode === "rectangle" && selection && (
        <>
          <div
            className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
            style={{
              left: selection.x,
              top: selection.y,
              width: selection.width,
              height: selection.height,
            }}
          >
            <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-full" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-500 rounded-full" />
            <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
          </div>

          <div
            className="absolute flex gap-2 mt-2 pointer-events-auto"
            style={{
              left: selection.x,
              top: selection.y + selection.height,
            }}
          >
            <button
              onClick={handleConfirm}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={selection.width < MIN_RECT_SIZE || selection.height < MIN_RECT_SIZE}
            >
              <Check className="w-4 h-4" />
              Confirm
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-600 text-white text-sm rounded-md hover:bg-zinc-700 transition-colors"
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

      {/* Lasso path (live drawing) */}
      {mode === "lasso" && lassoPoints.length >= 2 && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={imageWidth}
          height={imageHeight}
        >
          <path
            d={pathD}
            fill={hasSelection ? "rgba(59, 130, 246, 0.2)" : "none"}
            stroke="rgb(59, 130, 246)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Lasso action buttons */}
      {mode === "lasso" && hasSelection && effectiveBounds && (
        <div
          className="absolute flex gap-2 mt-2 pointer-events-auto"
          style={{
            left: effectiveBounds.x,
            top: Math.min(
              effectiveBounds.y + effectiveBounds.height + 8,
              imageHeight - 48
            ),
          }}
        >
          <button
            onClick={handleConfirm}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!isValidSelection()}
          >
            <Check className="w-4 h-4" />
            Confirm
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1 px-3 py-1.5 bg-zinc-600 text-white text-sm rounded-md hover:bg-zinc-700 transition-colors"
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
      )}

      {/* Instructions - below tool bar to avoid overlap */}
      {!hasSelection && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm pointer-events-none">
          {mode === "rectangle"
            ? "Click and drag to select an area"
            : "Draw a free-form shape - release to close"}
        </div>
      )}
    </div>
  );
};
