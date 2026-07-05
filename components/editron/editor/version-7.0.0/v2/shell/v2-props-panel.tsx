'use client';

import { Trash2 } from 'lucide-react';
import { Mono, Glyph } from '@/components/primitives';
import { useEditorContext } from '../../contexts/editor-context';
import { OverlayType, type Overlay } from '../../types';
import { KeyframeInspectorPanel } from '../../components/overlays/shared/keyframe-inspector-panel';

/* ═══ Editron editor v2 · properties panel (264px) ═══════════════════
   The v6 right-hand properties column. Owns the one thing v1 never
   surfaces panel-side: the shared Transform block (position / rotation /
   opacity) + the real Animation keyframe inspector.

   Strategy A (no fork): the per-TYPE detail editors (text content, video
   trim, caption look, …) stay in the tool panel, where v1 already renders
   them on selection. This panel is type-agnostic. Position/rotation write
   the uniform BaseOverlay number fields; opacity writes styles.opacity via
   changeOverlay's callback form (NOT updateOverlayStyles — that is
   caption-only). Scale has no base field (keyframe-track only), so it is
   shown read-only and animated through the inspector below. */

const GLYPH: Partial<Record<OverlayType, string>> = {
  [OverlayType.TEXT]: 'Tx',
  [OverlayType.VIDEO]: 'Vd',
  [OverlayType.IMAGE]: 'Im',
  [OverlayType.CAPTION]: 'Cc',
  [OverlayType.SOUND]: 'Au',
  [OverlayType.STICKER]: 'St',
  [OverlayType.SHAPE]: 'Sh',
  [OverlayType.HTML_SCENE]: 'Ht',
  [OverlayType.MOTION_GRAPHIC]: 'Mg',
  [OverlayType.GENERATED_SCENE]: 'Gn',
  [OverlayType.TRANSITION]: 'Tr',
  [OverlayType.TEMPLATE]: 'Tm',
  [OverlayType.LOTTIE]: 'Lt',
};

/** Editable transform tile. Uncontrolled + keyed on value so it re-syncs
    when the selection changes but does not fire changeOverlay per keystroke
    (which would spam undo history) — commit is on blur / Enter. */
function NumField({ label, value, onCommit }: { label: string; value: number; onCommit: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1 rounded-md border border-ds-subtle bg-surface-canvas px-2.5 py-1.5">
      <Mono size="7" className="text-ds-dim">{label}</Mono>
      <input
        type="number"
        key={value}
        defaultValue={Math.round(value)}
        onBlur={(e) => onCommit(Number(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-full bg-transparent font-mono text-[12px] text-ds-primary outline-hidden"
      />
    </label>
  );
}

export function V2PropsPanel() {
  const { overlays, selectedOverlayId, changeOverlay, deleteOverlay, setSelectedOverlayId } = useEditorContext();
  const sel = overlays.find((o) => o.id === selectedOverlayId) ?? null;

  if (!sel) {
    return (
      <div className="flex w-[264px] shrink-0 items-center justify-center border-l border-ds-subtle bg-surface-canvas p-4">
        <Mono size="10" className="text-ds-dim">Select an overlay</Mono>
      </div>
    );
  }

  const opacity = (sel as Overlay & { styles?: { opacity?: number } }).styles?.opacity ?? 1;
  const hasScaleTrack = !!sel.keyframeTracks?.some((t) => t.property === 'scale');

  const setField = (patch: Partial<Overlay>) => changeOverlay(sel.id, patch);
  const setOpacity = (v: number) =>
    changeOverlay(sel.id, (o) => {
      const cur = (o as Overlay & { styles?: Record<string, unknown> }).styles ?? {};
      return { ...o, styles: { ...cur, opacity: v } } as Overlay;
    });

  return (
    <div className="flex w-[264px] shrink-0 flex-col overflow-y-auto border-l border-ds-subtle bg-surface-canvas p-4">
      {/* Type header */}
      <div className="mb-3.5 flex items-center gap-2">
        <span className="rounded border border-gold/40 px-1.5 py-0.5">
          <Glyph active>{GLYPH[sel.type] ?? '••'}</Glyph>
        </span>
        <Mono size="10" className="text-gold">{sel.type.replace(/-/g, ' ')} overlay</Mono>
      </div>

      {/* Transform */}
      <Mono size="8" className="mb-2 block text-ds-secondary">Transform</Mono>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Pos X" value={sel.left} onCommit={(n) => setField({ left: n })} />
        <NumField label="Pos Y" value={sel.top} onCommit={(n) => setField({ top: n })} />
        <div className="flex flex-col gap-1 rounded-md border border-ds-subtle bg-surface-canvas px-2.5 py-1.5">
          <Mono size="7" className="text-ds-dim">Scale</Mono>
          <span className="font-mono text-[12px] text-ds-muted">{hasScaleTrack ? 'keyframed' : '100%'}</span>
        </div>
        <NumField label="Rotation°" value={sel.rotation} onCommit={(n) => setField({ rotation: n })} />
      </div>

      {/* Opacity */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <Mono size="7" className="text-ds-dim">Opacity</Mono>
          <span className="font-mono text-[10px] text-ds-muted">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full accent-gold"
        />
      </div>

      <div className="my-3.5 h-px bg-ds-subtle" />

      {/* Real animation keyframe inspector — reused as-is (self-collapsing). */}
      <KeyframeInspectorPanel overlay={sel} />

      <span className="flex-1" />

      <button
        type="button"
        onClick={() => { deleteOverlay(sel.id); setSelectedOverlayId(null); }}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-button border border-status-danger/40 py-2 text-[12.5px] font-bold text-status-danger transition-colors hover:bg-status-danger/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-status-danger/50"
      >
        <Trash2 size={14} /> Delete overlay
      </button>
    </div>
  );
}
