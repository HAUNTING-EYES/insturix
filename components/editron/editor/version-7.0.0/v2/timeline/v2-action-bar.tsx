'use client';

import { Scissors, Copy, Trash2 } from 'lucide-react';
import { Mono, Glyph } from '@/components/primitives';
import { OverlayType, type Overlay } from '../../types';
import { FPS } from '../../constants';

/* ═══ Editron editor v2 · timeline contextual action bar ═════════════
   The v6 selection bar (appears only when a clip is selected). Split /
   Duplicate / Delete wire to the REAL editor ops passed down from the
   timeline root (which get them from useEditorContext). No logic forked.
   Trim = the clip's drag handles (no button); Regenerate + the keyframe
   dock are a Phase 4b follow-up. */

const GLYPH: Partial<Record<OverlayType, string>> = {
  [OverlayType.TEXT]: 'Tx',
  [OverlayType.VIDEO]: 'Vd',
  [OverlayType.IMAGE]: 'Im',
  [OverlayType.CAPTION]: 'Cc',
  [OverlayType.SOUND]: 'Au',
  [OverlayType.SFX_LIBRARY]: 'Fx',
  [OverlayType.STICKER]: 'St',
  [OverlayType.SHAPE]: 'Sh',
  [OverlayType.HTML_SCENE]: 'Ht',
  [OverlayType.MOTION_GRAPHIC]: 'Mg',
  [OverlayType.GENERATED_SCENE]: 'Gn',
  [OverlayType.TRANSITION]: 'Tr',
  [OverlayType.LOTTIE]: 'Lt',
};

const actBtn =
  'inline-flex items-center gap-1.5 rounded-button border border-ds-subtle bg-surface-deeper px-2.5 py-1.5 text-[11.5px] font-semibold text-ds-secondary transition-colors hover:bg-surface-well focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/50 disabled:cursor-not-allowed disabled:opacity-40';

export function V2ActionBar({
  selected,
  canSplit,
  onSplit,
  onDuplicate,
  onDelete,
}: {
  selected: Overlay;
  canSplit: boolean;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const secs = (selected.durationInFrames / FPS).toFixed(1);

  return (
    <div className="flex h-[38px] shrink-0 items-center gap-2.5 border-b border-ds-subtle bg-surface-deeper px-3">
      <span className="rounded border border-gold/40 px-1.5 py-0.5">
        <Glyph active>{GLYPH[selected.type] ?? '••'}</Glyph>
      </span>
      <span className="text-[13px] font-bold text-ds-primary">{selected.type.replace(/-/g, ' ')}</span>
      <Mono size="8" className="text-ds-dim">{secs}s</Mono>

      <span className="mx-1 h-4 w-px bg-ds-subtle" />

      <button type="button" onClick={onSplit} disabled={!canSplit} title="Split at playhead" className={actBtn}>
        <Scissors size={13} /> Split
      </button>
      <button type="button" onClick={onDuplicate} title="Duplicate" className={actBtn}>
        <Copy size={13} /> Duplicate
      </button>

      <span className="flex-1" />

      <button
        type="button"
        onClick={onDelete}
        title="Delete"
        className="inline-flex items-center gap-1.5 rounded-button border border-status-danger/35 px-2.5 py-1.5 text-[11.5px] font-semibold text-status-danger transition-colors hover:bg-status-danger/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-status-danger/50"
      >
        <Trash2 size={13} /> Delete
      </button>
    </div>
  );
}
