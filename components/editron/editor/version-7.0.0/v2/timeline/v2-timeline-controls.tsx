'use client';

import { Magnet, Plus, ZoomIn, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mono } from '@/components/primitives';
import { useTimeline } from '../../contexts/timeline-context';
import { ZOOM_CONSTRAINTS } from '../../constants';

/* ═══ Editron editor v2 · timeline controls bar ══════════════════════
   The v6 controls strip. Zoom + add-row drive the REAL timeline context
   (useTimeline: zoomScale/setZoomScale, addRow, visibleRows). Snap is a
   real toggle owned by the timeline root — it feeds the snapping hook's
   threshold (on = SNAPPING_CONFIG.thresholdFrames, off = 0). Add-marker
   drops a named marker at the playhead. */

const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-button border border-ds-subtle bg-surface-deeper text-ds-secondary transition-colors hover:bg-surface-well focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/50';

export function V2TimelineControls({
  overlayCount,
  snapOn,
  onToggleSnap,
  onAddMarker,
}: {
  overlayCount: number;
  snapOn: boolean;
  onToggleSnap: () => void;
  onAddMarker: () => void;
}) {
  const { zoomScale, setZoomScale, visibleRows, addRow } = useTimeline();

  return (
    <div className="flex h-[38px] shrink-0 items-center gap-3 border-b border-ds-subtle bg-surface-raised px-3.5">
      <button
        type="button"
        onClick={onToggleSnap}
        title={snapOn ? 'Snapping on' : 'Snapping off'}
        className={cn(iconBtn, snapOn && 'border-gold/40 text-gold')}
      >
        <Magnet size={15} />
      </button>
      <button type="button" onClick={onAddMarker} title="Add marker at playhead" className={iconBtn}>
        <MapPin size={15} />
      </button>

      <span className="h-4 w-px bg-ds-subtle" />
      <Mono size="9" className="text-ds-muted">{overlayCount} overlays · {visibleRows} rows</Mono>

      <span className="flex-1" />

      <ZoomIn size={14} className="text-ds-muted" />
      <input
        type="range"
        min={ZOOM_CONSTRAINTS.min}
        max={ZOOM_CONSTRAINTS.max}
        step={ZOOM_CONSTRAINTS.step}
        value={zoomScale}
        onChange={(e) => setZoomScale(Number(e.target.value))}
        title={`Zoom ${zoomScale.toFixed(1)}×`}
        className="w-[90px] accent-gold"
      />
      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1.5 rounded-button border border-ds-subtle bg-surface-deeper px-2.5 py-1.5 text-[11.5px] font-bold text-ds-secondary transition-colors hover:bg-surface-well focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/50"
      >
        <Plus size={13} /> Row
      </button>
    </div>
  );
}
