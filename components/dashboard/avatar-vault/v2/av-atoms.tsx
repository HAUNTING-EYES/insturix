'use client';

import React from 'react';
import { C, EASE, MONO, SANS, initialsOf } from './av-tokens';

/* ═══ Avatar Vault v2 · atoms ═════════════════════════════════════════
   Presentational primitives ported 1:1 from the founder's avatar-vault.jsx,
   typed. No data logic. */

export const Mono = ({
  children, s = 9.5, c = C.muted, st,
}: {
  children: React.ReactNode; s?: number; c?: string; st?: React.CSSProperties;
}) => (
  <span style={{ fontFamily: MONO, fontSize: s, letterSpacing: '0.1em', textTransform: 'uppercase', color: c, ...st }}>
    {children}
  </span>
);

export type BtnVariant = 'primary' | 'ghost' | 'danger';

export function Btn({
  children, variant = 'ghost', size = 'md', onClick, style, disabled, title,
}: {
  children: React.ReactNode;
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  style?: React.CSSProperties;
  disabled?: boolean;
  title?: string;
}) {
  const V = {
    primary: { bg: C.gold, fg: '#241B08', bd: C.gold },
    ghost: { bg: C.surface, fg: C.soft, bd: C.border },
    danger: { bg: 'transparent', fg: C.coral, bd: 'rgba(212,106,92,.4)' },
  }[variant];
  const pad = size === 'sm' ? '7px 12px' : size === 'lg' ? '12px 22px' : '9px 16px';
  const fs = size === 'sm' ? 12 : 13;
  return (
    <button
      className="av-fr"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer', padding: pad, fontSize: fs, fontWeight: 700, fontFamily: SANS,
        background: V.bg, color: V.fg, border: `1px solid ${V.bd}`, borderRadius: 8, display: 'inline-flex',
        alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1, transition: `all .18s ${EASE}`, whiteSpace: 'nowrap', ...style,
      }}
    >
      {children}
    </button>
  );
}

export const inp: React.CSSProperties = {
  width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7,
  padding: '10px 12px', color: C.text, fontSize: 13.5, outline: 'none', fontFamily: SANS,
};

export const Field = ({
  label, hint, children,
}: {
  label: string; hint?: string; children: React.ReactNode;
}) => (
  <label style={{ display: 'block' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <Mono s={9} c={C.muted}>{label}</Mono>
      {hint && <Mono s={8.5} c={C.faint}>{hint}</Mono>}
    </div>
    {children}
  </label>
);

/** Portrait — real image when present, else the stylised silhouette + initials. */
export function Portrait({ name, size = 56, url }: { name: string; size?: number; url?: string | null }) {
  const initials = initialsOf(name);
  return (
    <div style={{ width: size, height: size, borderRadius: size > 100 ? 14 : 10, background: C.well, border: `1px solid ${C.bs}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <>
          <svg width={size} height={size} viewBox="0 0 56 56" style={{ position: 'absolute', opacity: 0.5 }}>
            <circle cx="28" cy="21" r="9" fill="none" stroke={C.faint} strokeWidth="1.5" />
            <path d="M12 48 C12 37 20 33 28 33 C36 33 44 37 44 48" fill="none" stroke={C.faint} strokeWidth="1.5" />
          </svg>
          <span style={{ position: 'relative', fontFamily: MONO, fontSize: size > 100 ? 22 : 13, fontWeight: 700, color: C.gold, letterSpacing: '0.04em' }}>{initials}</span>
        </>
      )}
    </div>
  );
}

export function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className="av-fr" onClick={onClick} aria-pressed={on} style={{ cursor: 'pointer', width: 38, height: 22, borderRadius: 12, border: `1px solid ${on ? C.gold : C.border}`, background: on ? 'rgba(212,166,82,.2)' : C.bg, position: 'relative', transition: `all .2s ${EASE}`, flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: on ? C.gold : C.dim, transition: `left .2s ${EASE}` }} />
    </button>
  );
}

export function Seg<T extends string>({ opts, val, on }: { opts: Array<[T, string]>; val: T; on: (v: T) => void }) {
  return (
    <div style={{ display: 'inline-flex', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 3, flexWrap: 'wrap' }}>
      {opts.map(([k, l]) => {
        const a = val === k;
        return (
          <button key={k} className="av-fr" onClick={() => on(k)} style={{ cursor: 'pointer', border: 'none', borderRadius: 5, padding: '7px 12px', fontFamily: MONO, fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', background: a ? C.gold : 'transparent', color: a ? '#241B08' : C.muted, fontWeight: a ? 700 : 400 }}>{l}</button>
        );
      })}
    </div>
  );
}

/** Upload drop-zone. `busy` shows an uploading state; `filled` = has an asset. */
export function Drop({
  label, big, filled, busy, onClick, imageUrl,
}: {
  label: string; big?: boolean; filled?: boolean; busy?: boolean; onClick?: () => void; imageUrl?: string;
}) {
  const showThumb = Boolean(filled && imageUrl && !busy);
  return (
    <button className="av-fr" onClick={onClick} disabled={busy} style={{ position: 'relative', overflow: 'hidden', cursor: busy ? 'wait' : 'pointer', width: '100%', height: big ? 180 : 92, borderRadius: 10, border: `1.5px dashed ${filled ? C.gold : C.bs}`, background: filled ? 'rgba(212,166,82,.05)' : C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: filled ? C.gold : C.muted }}>
      {showThumb ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={`${label} preview`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <span style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5 }}>✓ Replace</span>
        </>
      ) : (
        <>
          <span style={{ fontSize: big ? 26 : 18 }}>{busy ? '…' : filled ? '✓' : '↥'}</span>
          <Mono s={9} c={filled ? C.gold : C.muted}>{busy ? 'Uploading' : filled ? 'Uploaded' : label}</Mono>
        </>
      )}
    </button>
  );
}
