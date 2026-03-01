"use client";

import React, { useRef, useEffect, useState } from "react";
import { X } from "lucide-react";

export interface OverlayData {
  id: string;
  src: string;
  x: number; // left in px
  y: number; // top in px
  width: number;
  height: number;
}

interface ImageOverlayProps {
  data: OverlayData;
  containerWidth: number;
  containerHeight: number;
  isSelected?: boolean;
  onUpdate: (id: string, patch: Partial<OverlayData>) => void;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ImageOverlay({ data, containerWidth, containerHeight, isSelected = false, onUpdate, onSelect, onDelete }: ImageOverlayProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizingRef = useRef<{ startX: number; startY: number; origW: number; origH: number; origX: number; origY: number; corner: string } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingRef.current) {
        const dx = e.clientX - draggingRef.current.startX;
        const dy = e.clientY - draggingRef.current.startY;
        const nx = Math.max(0, Math.min(containerWidth - data.width, draggingRef.current.origX + dx));
        const ny = Math.max(0, Math.min(containerHeight - data.height, draggingRef.current.origY + dy));
        onUpdate(data.id, { x: nx, y: ny });
      } else if (resizingRef.current) {
        const r = resizingRef.current;
        const dx = e.clientX - r.startX;
        const dy = e.clientY - r.startY;
        let nw = r.origW;
        let nh = r.origH;
        let nx = r.origX;
        let ny = r.origY;
        // simple corner handling: bottom-right expands
        if (r.corner === "br") {
          nw = Math.max(24, r.origW + dx);
          nh = Math.max(24, r.origH + dy);
        } else if (r.corner === "bl") {
          nw = Math.max(24, r.origW - dx);
          nh = Math.max(24, r.origH + dy);
          nx = Math.max(0, Math.min(containerWidth - nw, r.origX + dx));
        } else if (r.corner === "tl") {
          nw = Math.max(24, r.origW - dx);
          nh = Math.max(24, r.origH - dy);
          nx = Math.max(0, Math.min(containerWidth - nw, r.origX + dx));
          ny = Math.max(0, Math.min(containerHeight - nh, r.origY + dy));
        } else if (r.corner === "tr") {
          nw = Math.max(24, r.origW + dx);
          nh = Math.max(24, r.origH - dy);
          ny = Math.max(0, Math.min(containerHeight - nh, r.origY + dy));
        }
        // Clamp to container
        if (nx + nw > containerWidth) nw = containerWidth - nx;
        if (ny + nh > containerHeight) nh = containerHeight - ny;
        onUpdate(data.id, { x: nx, y: ny, width: nw, height: nh });
      }
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
      resizingRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [containerWidth, containerHeight, data, onUpdate]);

  const startDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(data.id);
    draggingRef.current = { startX: e.clientX, startY: e.clientY, origX: data.x, origY: data.y };
  };

  const startResize = (e: React.MouseEvent, corner: string) => {
    e.stopPropagation();
    onSelect(data.id);
    resizingRef.current = { startX: e.clientX, startY: e.clientY, origW: data.width, origH: data.height, origX: data.x, origY: data.y, corner };
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(data.id);
  };

  return (
    <div
      ref={elRef}
      onMouseDown={(e) => { e.stopPropagation(); startDrag(e); }}
      className="absolute select-none pointer-events-auto"
      style={{ left: data.x, top: data.y, width: data.width, height: data.height, zIndex: isSelected ? 60 : 55 }}
    >
      <div className={`relative w-full h-full ${isSelected ? "outline outline-2 outline-blue-500" : ""}`}>
        <img src={data.src} alt="overlay" className="w-full h-full object-contain pointer-events-none" draggable={false} />
        {/* resize handles */}
        <div onMouseDown={(e) => startResize(e, "tl")} className="absolute -ml-2 -mt-2 left-0 top-0 w-4 h-4 bg-white border rounded cursor-nwse-resize" />
        <div onMouseDown={(e) => startResize(e, "tr")} className="absolute -mr-2 -mt-2 right-0 top-0 w-4 h-4 bg-white border rounded cursor-nesw-resize" />
        <div onMouseDown={(e) => startResize(e, "bl")} className="absolute -ml-2 -mb-2 left-0 bottom-0 w-4 h-4 bg-white border rounded cursor-nesw-resize" />
        <div onMouseDown={(e) => startResize(e, "br")} className="absolute -mr-2 -mb-2 right-0 bottom-0 w-4 h-4 bg-white border rounded cursor-nwse-resize" />
        
        {/* Delete button - only show when selected */}
        {isSelected && (
          <button
            onClick={handleDelete}
            className="absolute -mt-2 -mr-2 top-0 right-0 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg z-70"
            title="Delete image"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default ImageOverlay;
