'use client';

import React from 'react';
import { C, EASE, MONO, SANS, platGlyph, platLabel, stageLabel, stageTick } from './calos-view-model';
import type { CalItem } from './calos-view-model';

/* ═══ CalOS v3 · shared atoms ═════════════════════════════════════════
   Presentational primitives ported 1:1 from the founder's calos-v3.jsx,
   typed and de-duplicated. No data logic lives here. */

export const Mono = ({
  children, s = 9.5, c = C.muted, st,
}: {
  children: React.ReactNode; s?: number; c?: string; st?: React.CSSProperties;
}) => (
  <span style={{ fontFamily: MONO, fontSize: s, letterSpacing: '0.1em', textTransform: 'uppercase', color: c, ...st }}>
    {children}
  </span>
);

export const Glyph = ({ p, act }: { p: string; act?: boolean }) => (
  <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em', color: act ? C.gold : C.muted, flexShrink: 0 }}>
    {platGlyph(p)}
  </span>
);

export function StatusMark({ stage }: { stage: string }) {
  if (stage === 'approved' || stage === 'published') {
    return <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, flexShrink: 0 }} />;
  }
  if (stage === 'in_review') {
    return <span style={{ width: 6, height: 6, borderRadius: '50%', border: `1.5px solid ${C.gold}`, flexShrink: 0 }} />;
  }
  if (stage === 'changes_requested') {
    return <span style={{ width: 6, height: 6, borderRadius: '50%', border: `1.5px solid ${C.coral}`, flexShrink: 0 }} />;
  }
  return null;
}

export type BtnVariant = 'primary' | 'approve' | 'danger' | 'ghost';

export function Btn({
  children, variant = 'ghost', size = 'md', onClick, style, title, active, disabled,
}: {
  children: React.ReactNode;
  variant?: BtnVariant;
  size?: 'sm' | 'md';
  onClick?: () => void;
  style?: React.CSSProperties;
  title?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const V = {
    primary: { bg: C.gold, fg: '#241B08', bd: C.gold },
    approve: { bg: 'transparent', fg: C.green, bd: 'rgba(94,201,126,.4)' },
    danger: { bg: 'transparent', fg: C.coral, bd: 'rgba(212,106,92,.4)' },
    ghost: {
      bg: active ? 'rgba(212,166,82,.1)' : C.surface,
      fg: active ? C.gold : C.soft,
      bd: active ? 'rgba(212,166,82,.4)' : C.border,
    },
  }[variant];
  const pad = size === 'sm' ? '6px 10px' : '8px 13px';
  const fs = size === 'sm' ? 11 : 12.5;
  return (
    <button
      className="calos-fr"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        padding: pad, fontSize: fs, fontWeight: 700, fontFamily: SANS,
        background: V.bg, color: V.fg, border: `1px solid ${V.bd}`, borderRadius: 7,
        display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        transition: `all .18s ${EASE}`, ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Chip({
  d, onClick, compact, draggable, onDragStart,
}: {
  d: CalItem;
  onClick?: (e: React.MouseEvent) => void;
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <button
      className="calos-fr calos-chip"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      title={`${d.title} · ${platLabel(d.platform)} · ${stageLabel(d.stage)} · ${d.score}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, width: '100%', textAlign: 'left',
        cursor: 'pointer', background: C.surface, border: `1px solid ${C.border}`,
        borderLeft: `2px solid ${stageTick(d.stage)}`, borderRadius: 4,
        padding: compact ? '2px 5px' : '4px 6px', transition: `all .15s ${EASE}`,
      }}
    >
      <Glyph p={d.platform} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.title}
      </span>
      <StatusMark stage={d.stage} />
    </button>
  );
}

export function Sheet({
  title, onClose, children, w = 560, sub,
}: {
  title: string; onClose: () => void; children: React.ReactNode; w?: number; sub?: string;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 59 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div
          className="calos-ns"
          style={{ width: `min(${w}px,100%)`, maxHeight: '92vh', overflowY: 'auto', background: C.raised, border: `1px solid ${C.bs}`, borderRadius: 14 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 18px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.raised, zIndex: 2 }}>
            <div>
              <Mono s={10} c={C.gold}>{title}</Mono>
              {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{sub}</div>}
            </div>
            <button className="calos-fr" onClick={onClose} style={{ cursor: 'pointer', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, color: C.soft }}>
              ✕
            </button>
          </div>
          <div style={{ padding: 18 }}>{children}</div>
        </div>
      </div>
    </>
  );
}

export function Confirm({
  title, msg, confirmLabel, onConfirm, onClose,
}: {
  title: string; msg: string; confirmLabel: string; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose} w={420}>
      <div style={{ fontSize: 14, color: C.soft, lineHeight: 1.55, marginBottom: 20 }}>{msg}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn size="sm" onClick={onClose}>Cancel</Btn>
        <Btn size="sm" variant="danger" onClick={onConfirm}>{confirmLabel}</Btn>
      </div>
    </Sheet>
  );
}

export const inpS: React.CSSProperties = {
  width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
  padding: '9px 11px', color: C.text, fontSize: 13.5, outline: 'none', fontFamily: SANS,
};
