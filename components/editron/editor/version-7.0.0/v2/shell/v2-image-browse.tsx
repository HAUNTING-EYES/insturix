'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Mono, inputClass } from '@/components/primitives';
import { cn } from '@/lib/utils';
import { useEditorContext } from '../../contexts/editor-context';
import { useTimelinePositioning } from '../../hooks/use-timeline-positioning';
import { useAspectRatio } from '../../hooks/use-aspect-ratio';
import { useTimeline } from '../../contexts/timeline-context';
import { Overlay, OverlayType } from '../../types';
import { usePexelsImages } from '../../hooks/use-pexels-images';

/* ═══ Editron editor v2 · Images (browse-only) ═══════════════════════
   v2-native re-skin of the real ImageOverlayPanel's BROWSE half — Pexels
   search + grid, add on click. Reuses the SAME hooks and the exact
   handleAddImage add-path (usePexelsImages → addOverlay); the details
   editor lives in the right props panel now, so no double editor. */

interface PexelsImage {
  id: number | string;
  src: { original: string; medium: string };
}

export function V2ImageBrowse() {
  const [q, setQ] = useState('');
  const { images, isLoading, fetchImages } = usePexelsImages();
  const { addOverlay, overlays, durationInFrames } = useEditorContext();
  const { findNextAvailablePosition } = useTimelinePositioning();
  const { getAspectRatioDimensions, calculateFitToFrameDimensions } = useAspectRatio();
  const { visibleRows } = useTimeline();

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) fetchImages(q);
  };

  // Add-path copied verbatim from image-overlay-panel.tsx handleAddImage.
  const add = (image: PexelsImage) => {
    const frame = getAspectRatioDimensions();
    const iw = (image as { width?: number }).width || 1920;
    const ih = (image as { height?: number }).height || 1080;
    const fitted = calculateFitToFrameDimensions(iw, ih);
    const left = (frame.width - fitted.width) / 2;
    const top = (frame.height - fitted.height) / 2;
    const { from, row } = findNextAvailablePosition(overlays, visibleRows, durationInFrames);
    const newOverlay: Overlay = {
      left, top, width: fitted.width, height: fitted.height, durationInFrames: 200, from,
      id: Date.now(), rotation: 0, row, isDragging: false, type: OverlayType.IMAGE,
      src: image.src.original,
      styles: { objectFit: 'cover', animation: { enter: 'fadeIn', exit: 'fadeOut' } },
    };
    addOverlay(newOverlay);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-2.5">
      <form onSubmit={search} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search images…" style={{ fontSize: 16 }} className={cn(inputClass, 'flex-1')} />
        <button type="submit" disabled={isLoading} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-button border border-ds-subtle bg-surface-deeper text-ds-secondary hover:bg-surface-well focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50">
          <Search size={15} />
        </button>
      </form>
      <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="text-center text-[10px] text-ds-faint hover:text-ds-muted">Powered by Pexels</a>

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-video animate-pulse rounded-md bg-surface-well" />)
        ) : images.length > 0 ? (
          images.map((image) => (
            <button key={image.id} type="button" onClick={() => add(image)} title="Add to timeline" className="group relative aspect-video overflow-hidden rounded-md border border-ds-subtle hover:border-gold/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src.medium} alt="" className="h-full w-full object-cover transition-opacity group-hover:opacity-70" />
            </button>
          ))
        ) : (
          <div className="col-span-2 flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Search size={28} className="text-ds-faint opacity-40" />
            <Mono size="9" className="text-ds-dim">No images yet</Mono>
            <p className="text-[11px] text-ds-faint">Search above to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
