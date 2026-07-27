import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {type Brand, withAlpha} from '../brand';
import {useCountUp} from '../../anim-ui';
import type {ScreenSpec, Body, KanbanColumn, Badge, CursorTarget} from './spec';

// SCREEN ENGINE — renders a ScreenSpec as a LIVE, brand-tokened product screen (the "product builds itself"
// quality of the hand-built screens, but GENERATED from a spec for any brand). Deterministic (useCurrentFrame
// only), brand tokens only. Phase 1 implements the `kanban` body (the dashboard bar); other bodies stubbed.
//
// Timing is anchored to absolute frames but scaled by brand.motion.energy, so a snappy brand builds faster.

const EASE = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const badgeColor = (brand: Brand, tone?: Badge['tone']): string =>
  tone === 'neutral' ? brand.colors.muted : brand.colors.accent; // gold-only house style; 'positive' == accent

// ─── brand-aware demo cursor (anim-ui's Cursor is gold-locked; this one uses the brand accent) ───
const DemoCursor: React.FC<{brand: Brand; points: {x: number; y: number; at: number; click?: boolean}[]}> = ({brand, points}) => {
  const frame = useCurrentFrame();
  if (!points.length) return null;
  let pos = {x: points[0].x, y: points[0].y};
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (frame >= a.at && frame <= b.at) {
      const t = interpolate(frame, [a.at, b.at], [0, 1], {easing: undefined, ...EASE});
      pos = {x: interpolate(t, [0, 1], [a.x, b.x]), y: interpolate(t, [0, 1], [a.y, b.y])};
    } else if (frame > b.at) pos = {x: b.x, y: b.y};
  }
  const click = points.find((p) => p.click && frame >= p.at && frame < p.at + 16);
  const ripple = click ? interpolate(frame, [click.at, click.at + 16], [0, 1], EASE) : 0;
  const press = click ? interpolate(frame, [click.at, click.at + 4, click.at + 10], [1, 0.86, 1], EASE) : 1;
  return (
    <div style={{position: 'absolute', left: pos.x, top: pos.y, zIndex: 50, pointerEvents: 'none', transform: `scale(${press})`}}>
      {ripple > 0 && ripple < 1 && (
        <div style={{position: 'absolute', left: -2, top: -2, width: 14 + ripple * 34, height: 14 + ripple * 34, marginLeft: -(7 + ripple * 17), marginTop: -(7 + ripple * 17), borderRadius: '50%', border: `2px solid ${brand.colors.accent}`, opacity: 1 - ripple}} />
      )}
      <svg width="26" height="26" viewBox="0 0 24 24" style={{display: 'block', marginLeft: -5, marginTop: -3, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'}}>
        <path d="M5 3l14 8-6 1.6L9.6 18z" fill={brand.colors.text} stroke={brand.colors.bg} strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const BadgePill: React.FC<{brand: Brand; badge: Badge; landed: boolean; land: number}> = ({brand, badge, landed, land}) => {
  const c = badgeColor(brand, badge.tone);
  const n = useCountUp(badge.value ?? 0, land, land + 18);
  if (!landed) return null;
  return (
    <div style={{position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 7, background: withAlpha(c, 0.11), border: `1px solid ${withAlpha(c, 0.28)}`}}>
      {badge.kind === 'status' ? <span style={{color: c, fontSize: 12}}>✓</span> : <div style={{width: 6, height: 6, borderRadius: 3, background: c}} />}
      <span style={{fontFamily: brand.fontSans, fontSize: 12.5, color: c, letterSpacing: '0.03em'}}>
        {badge.kind === 'score' ? `${badge.label ?? 'QC'} ${n}` : badge.label ?? (badge.kind === 'status' ? 'Ready' : 'Tag')}
      </span>
    </div>
  );
};

// ── Kanban geometry (centred board of N columns) ──
const kanbanLayout = (columns: KanbanColumn[], W: number, H: number) => {
  const n = Math.max(1, Math.min(4, columns.length));
  const COL_W = Math.min(460, (W * 0.82) / n - 30);
  const GAP = 38;
  const boardW = COL_W * n + GAP * (n - 1);
  const left = (W - boardW) / 2;
  const HEAD_H = 52;
  const CARD_H = 132;
  const CARD_GAP = 16;
  const top = 372;
  const cardRect = (ci: number, ri: number) => ({
    x: left + ci * (COL_W + GAP),
    y: top + HEAD_H + ri * (CARD_H + CARD_GAP),
    w: COL_W,
    h: CARD_H,
  });
  return {n, COL_W, GAP, boardW, left, top, HEAD_H, CARD_H, CARD_GAP, cardRect};
};

const Kanban: React.FC<{brand: Brand; body: Extract<Body, {type: 'kanban'}>; lands: number[]}> = ({brand, body, lands}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const L = kanbanLayout(body.columns, W, H);
  let idx = 0;
  return (
    <div style={{position: 'absolute', left: L.left, top: L.top, width: L.boardW, display: 'flex', gap: L.GAP}}>
      {body.columns.slice(0, 4).map((col, ci) => {
        const headOp = interpolate(frame, [4 + ci * 3, 16 + ci * 3], [0, 1], EASE);
        return (
          <div key={ci} style={{width: L.COL_W}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, height: L.HEAD_H, opacity: headOp}}>
              <div style={{width: 4, height: 18, borderRadius: 2, background: brand.colors.accent}} />
              <span style={{fontFamily: brand.fontSans, fontSize: 18, fontWeight: 600, color: brand.colors.text}}>{col.label}</span>
              <span style={{fontFamily: brand.fontSans, fontSize: 13, color: brand.colors.muted}}>{col.cards.length}</span>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: L.CARD_GAP}}>
              {col.cards.map((c, ri) => {
                const land = lands[idx] ?? 90;
                idx += 1;
                const drop = interpolate(frame, [land - 14, land], [0, 1], {easing: undefined, ...EASE});
                const op = interpolate(frame, [land - 14, land - 4], [0, 1], EASE);
                const glow = interpolate(frame, [land, land + 16], [0.55, 0], EASE);
                const glyph = c.glyph ?? c.title[0]?.toUpperCase() ?? '•';
                return (
                  <div
                    key={ri}
                    style={{
                      position: 'relative',
                      height: L.CARD_H,
                      boxSizing: 'border-box',
                      background: brand.colors.surface,
                      border: `1px solid ${brand.colors.border}`,
                      borderRadius: brand.shape.radius,
                      padding: 20,
                      display: 'flex',
                      gap: 16,
                      transform: `translateY(${(1 - drop) * -22}px)`,
                      opacity: op,
                      boxShadow: glow > 0.02 ? `0 0 ${glow * 44}px ${withAlpha(brand.colors.accent, 0.6)}, 0 14px 40px rgba(0,0,0,0.5)` : '0 14px 40px rgba(0,0,0,0.45)',
                    }}
                  >
                    <div style={{width: 56, height: 56, borderRadius: 12, flexShrink: 0, background: `linear-gradient(135deg, ${withAlpha(brand.colors.accent, 0.28)}, ${withAlpha(brand.colors.accent, 0.07)})`, border: `1px solid ${withAlpha(brand.colors.accent, 0.2)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: brand.fontSans, fontWeight: 800, fontSize: 24, color: brand.colors.accent}}>{glyph}</div>
                    <div style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column'}}>
                      <div style={{fontFamily: brand.fontSans, fontWeight: 600, fontSize: 19, color: brand.colors.text, lineHeight: 1.25, maxHeight: 48, overflow: 'hidden'}}>{c.title}</div>
                      <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto'}}>
                        <div style={{width: 22, height: 22, borderRadius: 11, background: `linear-gradient(135deg, ${brand.colors.accent}, ${withAlpha(brand.colors.accent, 0.4)})`, border: `1.5px solid ${brand.colors.surface}`}} />
                        <span style={{fontFamily: brand.fontSans, fontSize: 12.5, color: brand.colors.muted}}>{c.meta ?? '3h ago'}</span>
                      </div>
                    </div>
                    {c.badge && <BadgePill brand={brand} badge={c.badge} landed={frame >= land} land={land} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Resolve a semantic cursor target to pixels for the current body.
const resolveTarget = (t: CursorTarget, spec: ScreenSpec, W: number, H: number): {x: number; y: number} => {
  if ('region' in t) {
    if (t.region === 'primary-action') return {x: W * 0.86, y: 250};
    return {x: W * 0.5, y: H * 0.5};
  }
  if (spec.body.type === 'kanban') {
    const L = kanbanLayout(spec.body.columns, W, H);
    const r = L.cardRect(t.col, t.card);
    return {x: r.x + r.w / 2, y: r.y + r.h / 2};
  }
  return {x: W * 0.5, y: H * 0.5};
};

export const ScreenEngine: React.FC<{spec: ScreenSpec; brand: Brand}> = ({spec, brand}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const e = brand.motion.energy;

  // total cards → staggered land frames (snappier for higher-energy brands)
  const cardCount = spec.body.type === 'kanban' ? spec.body.columns.reduce((a, c) => a + c.cards.length, 0) : 0;
  const LAND_BASE = 18;
  const LAND_STEP = Math.round(interpolate(e, [0, 1], [11, 6]));
  const lands = Array.from({length: cardCount}, (_, i) => LAND_BASE + i * LAND_STEP);
  const lastLand = LAND_BASE + Math.max(0, cardCount - 1) * LAND_STEP;

  // cursor path: rest off-target → glide to the click target → click
  const targets = spec.demo?.cursor ?? [];
  const clickTarget = targets.find((t) => (t as {click?: boolean}).click) ?? targets[targets.length - 1];
  const cursorStart = lastLand + 12;
  const clickAt = cursorStart + 34;
  const points = clickTarget
    ? [
        {x: W * 0.7, y: H * 0.78, at: cursorStart},
        {...resolveTarget(clickTarget, spec, W, H), at: clickAt - 6},
        {...resolveTarget(clickTarget, spec, W, H), at: clickAt, click: true},
      ]
    : [];

  // subtle camera push toward the click on the click (the FILM's match cut owns the big scene-to-scene dive).
  const cam: React.CSSProperties = points.length && spec.demo?.camera !== 'none'
    ? (() => {
        const tp = resolveTarget(clickTarget!, spec, W, H);
        const z = interpolate(frame, [clickAt - 24, clickAt, clickAt + 40], [1, 1.08, 1.11], EASE);
        const p = clamp01((z - 1) / 0.11);
        return {transform: `translate(${(W / 2 - tp.x) * 0.12 * p}px, ${(H / 2 - tp.y) * 0.12 * p}px) scale(${z})`, transformOrigin: `${tp.x}px ${tp.y}px`, willChange: 'transform'};
      })()
    : {};

  const titleOp = interpolate(frame, [2, 14], [0, 1], EASE);
  const boardW = spec.body.type === 'kanban' ? kanbanLayout(spec.body.columns, W, H).boardW : W * 0.82;
  const boardLeft = (W - boardW) / 2;

  return (
    <AbsoluteFill style={{backgroundColor: brand.colors.bg, fontFamily: brand.fontSans, overflow: 'hidden'}}>
      {brand.decor.grid && (
        <AbsoluteFill style={{backgroundImage: `linear-gradient(${withAlpha(brand.colors.text, 0.02)} 1px, transparent 1px), linear-gradient(90deg, ${withAlpha(brand.colors.text, 0.02)} 1px, transparent 1px)`, backgroundSize: '72px 72px'}} />
      )}
      {brand.decor.glow && (
        <AbsoluteFill style={{background: `radial-gradient(50% 40% at 50% 12%, ${withAlpha(brand.colors.accent, 0.05)}, transparent 70%)`}} />
      )}
      <AbsoluteFill style={cam}>
        {/* header: mark + title + subtitle + one primary action */}
        <div style={{position: 'absolute', left: boardLeft, top: 372 - 128, width: boardW, display: 'flex', alignItems: 'center', opacity: titleOp}}>
          <div style={{width: 44, height: 44, borderRadius: brand.shape.radius, marginRight: 14, background: `linear-gradient(135deg, ${brand.colors.accent}, ${withAlpha(brand.colors.accent, 0.4)})`, boxShadow: `0 0 22px ${withAlpha(brand.colors.accent, 0.4)}`}} />
          <div>
            <div style={{fontFamily: brand.fontSans, fontSize: 30, fontWeight: 700, color: brand.colors.text, letterSpacing: '-0.02em'}}>{spec.shell.title}</div>
            {spec.shell.subtitle && <div style={{fontFamily: brand.fontSans, fontSize: 13, color: brand.colors.muted, letterSpacing: '0.08em', marginTop: 3}}>{spec.shell.subtitle}</div>}
          </div>
          <div style={{flex: 1}} />
          {spec.shell.primaryAction && (
            <div style={{display: 'flex', alignItems: 'center', gap: 9, padding: '11px 20px', borderRadius: 10, background: brand.colors.accent, color: brand.colors.accentText, fontFamily: brand.fontSans, fontWeight: 800, fontSize: 15}}>
              <span style={{fontSize: 18, lineHeight: 1}}>+</span> {spec.shell.primaryAction}
            </div>
          )}
        </div>

        {spec.body.type === 'kanban' && <Kanban brand={brand} body={spec.body} lands={lands} />}

        {points.length > 0 && <DemoCursor brand={brand} points={points} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
