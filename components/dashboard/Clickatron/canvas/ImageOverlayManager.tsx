"use client";

import React, { useRef, useState, forwardRef, useImperativeHandle, useCallback } from "react";
import ImageOverlay, { OverlayData } from "./ImageOverlay";

export interface ImageOverlayManagerHandle {
  triggerFileInput: () => void;
  getOverlays: () => Array<{ id: string; src: string; x: number; y: number; width: number; height: number }>;
  clearOverlays: () => void;
}

interface Props {
  width: number;
  height: number;
  onImageAdded?: (id: string) => void;
  onImageSelected?: (id: string | null) => void;
}

export const ImageOverlayManager = forwardRef<ImageOverlayManagerHandle, Props>(function ImageOverlayManager({ width, height, onImageAdded, onImageSelected }, ref) {
  const [overlays, setOverlays] = useState<OverlayData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(ref, () => ({
    triggerFileInput: () => {
      fileRef.current?.click();
    },
    getOverlays: () => overlays,
    clearOverlays: () => {
      setOverlays([]);
      setSelectedId(null);
      onImageSelected?.(null);
    },
  }));

  const handleFile = useCallback((file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const w = Math.min(240, width * 0.6);
      const h = Math.min(240, height * 0.6);
      const newOverlay = { id, src, x: Math.max(8, (width - w) / 2), y: Math.max(8, (height - h) / 2), width: w, height: h };
      setOverlays((s) => [...s, newOverlay]);
      setSelectedId(id);
      // Call the callback to notify parent that an image was added
      onImageAdded?.(id);
    };
    reader.readAsDataURL(file);
  }, [width, height, onImageAdded]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
    if (e.target) e.target.value = "";
  };

  const updateOverlay = (id: string, patch: Partial<OverlayData>) => {
    setOverlays((prev) => prev.map(o => o.id === id ? { ...o, ...patch } : o));
  };

  const handleSelectImage = (id: string) => {
    setSelectedId(id);
    onImageSelected?.(id);
  };

  const handleDeselectImage = () => {
    setSelectedId(null);
    onImageSelected?.(null);
  };

  const handleDeleteImage = (id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      onImageSelected?.(null);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div style={{ width, height }} className="relative mx-auto pointer-events-none">
        {overlays.map((ov) => (
          <div key={ov.id} className="absolute" style={{ left: 0, top: 0 }}>
            <ImageOverlay
              data={ov}
              containerWidth={width}
              containerHeight={height}
              isSelected={selectedId === ov.id}
              onUpdate={updateOverlay}
              onSelect={handleSelectImage}
              onDelete={handleDeleteImage}
            />
          </div>
        ))}
      </div>

      <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
    </div>
  );
});

export default ImageOverlayManager;
