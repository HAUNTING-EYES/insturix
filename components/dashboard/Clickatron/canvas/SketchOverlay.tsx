"use client";

import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react";

export type SketchTool = "pencil" | "eraser" | "text";

export const PENCIL_COLORS = {
  black: "#000000",
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
} as const;

export type PencilColor = keyof typeof PENCIL_COLORS;

export const ERASER_SIZES = {
  small: 8,
  medium: 20,
  large: 36,
} as const;

export type EraserSize = keyof typeof ERASER_SIZES;

export interface TextElement {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface SketchOverlayHandle {
  exportFlattenedCanvas: (baseImageUrl: string, imageOverlays?: Array<{ src: string; x: number; y: number; width: number; height: number }>) => Promise<string>;
  getAnnotations: () => { strokes: any[]; textElements: TextElement[] };
}

interface SketchOverlayProps {
  width: number;
  height: number;
  tool: SketchTool;
  pencilColor: PencilColor;
  eraserSize: EraserSize;
  isActive: boolean;
}

export const SketchOverlay = forwardRef<SketchOverlayHandle, SketchOverlayProps>(function SketchOverlay({
  width,
  height,
  tool,
  pencilColor,
  eraserSize,
  isActive,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [editingText, setEditingText] = useState<TextElement | null>(null);
  const [newTextAt, setNewTextAt] = useState<{ x: number; y: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ canvasX: number; canvasY: number; el: TextElement } | null>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const getCoordsFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const x = ((clientX - rect.left) / rect.width) * width;
      const y = ((clientY - rect.top) / rect.height) * height;
      return { x, y };
    },
    [width, height]
  );

  const getCoords = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0]?.clientX : (e as React.MouseEvent).clientX;
      const clientY = "touches" in e ? e.touches[0]?.clientY : (e as React.MouseEvent).clientY;
      if (clientX == null || clientY == null) return null;
      return getCoordsFromClient(clientX, clientY);
    },
    [getCoordsFromClient]
  );

  const toSameOriginImageUrl = useCallback((url: string): string => {
    if (!url) return "";
    if (url.startsWith("/")) return url;
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return `/api/services/clickatron/utils/image-proxy?url=${encodeURIComponent(
          url,
        )}`;
      }
    } catch {
      // ignore
    }
    return url;
  }, []);

  const redrawTextLayer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    textElements.forEach((te) => {
      ctx!.fillStyle = te.color;
      ctx!.font = "24px sans-serif";
      ctx!.fillText(te.text, te.x, te.y);
    });
  }, [textElements, width, height]);

  useEffect(() => {
    redrawTextLayer();
  }, [redrawTextLayer]);

  const handlePointerDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isActive) return;
      e.preventDefault();
      const coords = getCoords(e);
      if (!coords) return;

      if (tool === "text") {
        const m = canvasRef.current?.getContext("2d");
        if (m) {
          m.font = "24px sans-serif";
          for (let i = textElements.length - 1; i >= 0; i--) {
            const te = textElements[i];
            const mw = m.measureText(te.text);
            const h = 24;
            if (
              coords.x >= te.x &&
              coords.x <= te.x + mw.width &&
              coords.y >= te.y - h &&
              coords.y <= te.y + 4
            ) {
              setEditingText({ ...te });
              setNewTextAt(null);
              return;
            }
          }
        }
        setNewTextAt(coords);
        setEditingText(null);
        return;
      }

      setIsDrawing(true);
      lastPosRef.current = coords;

      const strokesCanvas = strokesRef.current;
      if (!strokesCanvas) return;
      const ctx = strokesCanvas.getContext("2d");
      if (!ctx) return;

      if (tool === "pencil") {
        ctx.strokeStyle = PENCIL_COLORS[pencilColor];
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalCompositeOperation = "source-over";
      } else if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(255,255,255,1)";
        ctx.lineWidth = ERASER_SIZES[eraserSize];
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    },
    [isActive, tool, pencilColor, eraserSize, getCoords, textElements]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isActive) return;
      if (dragStart) {
        const coords = getCoords(e);
        if (!coords) return;
        const dx = coords.x - dragStart.canvasX;
        const dy = coords.y - dragStart.canvasY;
        const newX = dragStart.el.x + dx;
        const newY = dragStart.el.y + dy;
        setTextElements((prev) =>
          prev.map((te) =>
            te.id === dragStart.el.id ? { ...te, x: newX, y: newY } : te
          )
        );
        setEditingText((prev) =>
          prev?.id === dragStart.el.id ? { ...prev, x: newX, y: newY } : prev
        );
        setDragStart({ ...dragStart, canvasX: coords.x, canvasY: coords.y, el: { ...dragStart.el, x: newX, y: newY } });
        return;
      }
      if (!isDrawing || tool === "text") return;
      e.preventDefault();
      const coords = getCoords(e);
      if (!coords) return;
      const last = lastPosRef.current;
      if (!last) return;

      const strokesCanvas = strokesRef.current;
      if (!strokesCanvas) return;
      const ctx = strokesCanvas.getContext("2d");
      if (!ctx) return;

      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      lastPosRef.current = coords;
    },
    [isActive, isDrawing, tool, getCoords, dragStart]
  );

  const handlePointerUp = useCallback(() => {
    if (dragStart) {
      setDragStart(null);
      return;
    }
    setIsDrawing(false);
    lastPosRef.current = null;
    const strokesCanvas = strokesRef.current;
    if (strokesCanvas) {
      const ctx = strokesCanvas.getContext("2d");
      if (ctx && tool === "eraser") {
        ctx.globalCompositeOperation = "source-over";
      }
    }
  }, [tool, dragStart]);

  useEffect(() => {
    const strokesCanvas = strokesRef.current;
    if (!strokesCanvas) return;
    const ctx = strokesCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
  }, [width, height]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getAnnotations: () => ({
      strokes: [], // Strokes are already on the strokesRef canvas
      textElements: textElements,
    }),
    exportFlattenedCanvas: async (
      baseImageUrl: string,
      imageOverlays?: Array<{ src: string; x: number; y: number; width: number; height: number }>
    ) => {
      return new Promise((resolve, reject) => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          const proxyBaseUrl = toSameOriginImageUrl(baseImageUrl);
          
          if (!proxyBaseUrl) {
            reject(new Error('Invalid base image URL'));
            return;
          }

          // Load and draw base image
          const baseImage = new Image();
          baseImage.crossOrigin = 'anonymous';

          baseImage.onload = () => {
            ctx.drawImage(baseImage, 0, 0, width, height);

            // Draw image overlays
            const drawOverlays = async () => {
              if (imageOverlays && imageOverlays.length > 0) {
                for (const overlay of imageOverlays) {
                  const overlayImg = new Image();
                  overlayImg.crossOrigin = 'anonymous';
                  
                  const proxyOverlayUrl = toSameOriginImageUrl(overlay.src);
                  
                  await new Promise((resolveOverlay, rejectOverlay) => {
                    overlayImg.onload = () => resolveOverlay(true);
                    overlayImg.onerror = () => rejectOverlay(new Error('Failed to load overlay image'));
                    overlayImg.src = proxyOverlayUrl;
                  });
                  ctx.drawImage(overlayImg, overlay.x, overlay.y, overlay.width, overlay.height);
                }
              }
            };

            drawOverlays().then(() => {
              // Draw strokes from strokesRef canvas
              const strokesCanvas = strokesRef.current;
              if (strokesCanvas) {
                ctx.drawImage(strokesCanvas, 0, 0);
              }

              // Draw text elements
              textElements.forEach((te) => {
                ctx.fillStyle = te.color;
                ctx.font = '24px sans-serif';
                ctx.fillText(te.text, te.x, te.y);
              });

              // Convert to data URL
              const dataUrl = canvas.toDataURL('image/png');
              resolve(dataUrl);
            }).catch(reject);
          };

          baseImage.onerror = (e) => {
            console.error('Failed to load base image:', proxyBaseUrl, e);
            reject(new Error('Failed to load base image. URL: ' + proxyBaseUrl));
          };
          baseImage.src = proxyBaseUrl;
        } catch (error) {
          reject(error);
        }
      });
    },
  }), [width, height, textElements]);

  const handleTextInputKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    isNew: boolean
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitText(isNew);
    }
    if (e.key === "Escape") {
      if (isNew) setNewTextAt(null);
      else setEditingText(null);
    }
  };

  const commitText = (isNew: boolean) => {
    const input = document.getElementById("sketch-text-input") as HTMLTextAreaElement;
    if (!input) return;
    const text = input.value.trim();
    const color = PENCIL_COLORS[pencilColor];
    if (isNew && newTextAt) {
      if (text) {
        setTextElements((prev) => [
          ...prev,
          {
            id: `t${Date.now()}`,
            x: newTextAt.x,
            y: newTextAt.y,
            text,
            color,
          },
        ]);
      }
      setNewTextAt(null);
    } else if (editingText) {
      if (text) {
        setTextElements((prev) =>
          prev.map((te) =>
            te.id === editingText.id ? { ...te, text, color } : te
          )
        );
      } else {
        setTextElements((prev) => prev.filter((te) => te.id !== editingText.id));
      }
      setEditingText(null);
    }
    input.value = "";
    input.blur();
  };

  const handleTextBlur = (isNew: boolean) => {
    const input = document.getElementById("sketch-text-input") as HTMLTextAreaElement;
    if (!input) return;
    const text = input.value.trim();
    if (text) {
      const color = PENCIL_COLORS[pencilColor];
      if (isNew && newTextAt) {
        setTextElements((prev) => [
          ...prev,
          {
            id: `t${Date.now()}`,
            x: newTextAt.x,
            y: newTextAt.y,
            text,
            color,
          },
        ]);
      } else if (editingText) {
        setTextElements((prev) =>
          prev.map((te) =>
            te.id === editingText.id ? { ...te, text, color } : te
          )
        );
      }
    } else if (editingText) {
      setTextElements((prev) => prev.filter((te) => te.id !== editingText.id));
    }
    setNewTextAt(null);
    setEditingText(null);
  };

  // Note: We keep the component mounted even when not active so that
  // annotations (strokes, text) are preserved when switching tools.
  // The canvas will be hidden via CSS when not active.
  // if (!isActive) return null;

  const textInputPos = newTextAt || (editingText ? { x: editingText.x, y: editingText.y } : null);

  return (
    <div
      className={`absolute inset-0 z-[45] touch-none ${
        isActive ? "pointer-events-auto" : "pointer-events-none"
      }`}
      style={{ width, height }}
    >
      <canvas
        ref={strokesRef}
        width={width}
        height={height}
        className="absolute inset-0"
        style={{ pointerEvents: "none" }}
      />
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={`absolute inset-0 cursor-crosshair ${isActive ? "pointer-events-auto" : "pointer-events-none"}`}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        onTouchCancel={handlePointerUp}
      />

      {textInputPos && tool === "text" && (
        <div
          className="absolute flex flex-col"
          style={{
            left: Math.max(0, Math.min(textInputPos.x, width - 100)),
            top: Math.max(0, Math.min(textInputPos.y - 28, height - 32)),
          }}
        >
          {editingText && (
            <div
              className="h-2 w-full cursor-move flex-shrink-0 rounded-t bg-white/30 hover:bg-white/50"
              onMouseDown={(e) => {
                e.preventDefault();
                const coords = getCoordsFromClient(e.clientX, e.clientY);
                if (coords) {
                  setDragStart({ canvasX: coords.x, canvasY: coords.y, el: editingText });
                }
              }}
              onTouchStart={(e) => {
                const t = e.touches[0];
                const coords = getCoordsFromClient(t.clientX, t.clientY);
                if (coords) {
                  setDragStart({ canvasX: coords.x, canvasY: coords.y, el: editingText });
                }
              }}
              title="Drag to reposition"
            />
          )}
          <textarea
            id="sketch-text-input"
            autoFocus
            placeholder="Type text..."
            defaultValue={editingText?.text ?? ""}
            onKeyDown={(e) => handleTextInputKeyDown(e, !!newTextAt)}
            onBlur={() => handleTextBlur(!!newTextAt)}
            className="block min-w-[80px] max-w-[280px] min-h-[28px] px-2 py-1 text-[14px] bg-black/60 border border-white/30 rounded focus:outline-none focus:ring-1 focus:ring-white/50 resize-none placeholder:text-zinc-400"
            style={{
              color: editingText?.color ?? PENCIL_COLORS[pencilColor],
              font: "24px sans-serif",
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
});
