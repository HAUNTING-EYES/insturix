import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';
import {EASE} from '../anim';
import {Cursor, useCursorZoomCamera} from '../anim-ui';
import {StudioStage} from '../components/StudioStage';
import {InsturixLogo} from '../components/InsturixLogo';
import {SfxCue} from '../audio';

// "Production Floor" — the operation in one view. Reworked Lovable-style: NOT an edge-to-edge dense
// dashboard (12-icon rail + 5 columns + credits widget). Instead a FOCUSED 3-column board floating on
// the warm gold stage — big legible cards that DROP on the 136 BPM beat grid (landing glow), then the
// cursor clicks the in-progress card on a downbeat (pop) which hands off (zoom) into the editor.
const sans = theme.font.sans;
const mono = theme.font.mono;

const B = 26.4706; // frames per beat @60fps / 136 BPM
export const DASH_CLICK = Math.round(B * 4); // 106 — click lands on beat 4
// 5 cards drop on the beat grid (eighths). Order = column-major (Script×2, Edit×2, Publish×1).
const LANDS = [22, 31, 40, 52, 63];

export const DASH_SFX: SfxCue[] = [
  // (entrance whoosh removed — the value→dash zoom seam already accents the arrival)
  ...LANDS.map((at): SfxCue => ({name: 'tick', at, volume: 0.5})),
  {name: 'riser', at: 78, volume: 0.4},
  {name: 'click', at: DASH_CLICK, volume: 0.9},
  {name: 'impact', at: DASH_CLICK, volume: 0.7},
];

// geometry — 3 columns centred with generous margins (Lovable breathing room). The middle column's
// top card is the cursor target; its centre is the zoom focal handed to OneTakeFilm (≈ 960, 332).
const COL_W = 444;
const GAP = 38;
const BOARD_W = COL_W * 3 + GAP * 2; // 1408
const BOARD_LEFT = (1920 - BOARD_W) / 2; // 256
const BOARD_TOP = 372; // board vertically centred (header sits 128px above) — hero composition
const HEAD_H = 52;
const CARD_H = 132;
export const DASH_TARGET = {x: BOARD_LEFT + COL_W + GAP + COL_W / 2, y: BOARD_TOP + HEAD_H + CARD_H / 2}; // {960, 350}
const DASH_POINTS = [
  {x: 1320, y: 760, at: 66},
  {x: DASH_TARGET.x, y: DASH_TARGET.y, at: DASH_CLICK - 6},
  {x: DASH_TARGET.x, y: DASH_TARGET.y, at: DASH_CLICK, click: true},
];

type CardData = {t: string; qc?: number; ready?: boolean};
const STAGES: {label: string; color: string; cards: CardData[]}[] = [
  {label: 'Script', color: '#D4A652', cards: [{t: 'Q4 product launch — teaser'}, {t: 'Founder origin story'}]},
  {label: 'Edit', color: '#D46A5C', cards: [{t: 'Pricing explainer v2', qc: 72}, {t: 'Customer story — Acme'}]},
  {label: 'Publish', color: '#5EC97E', cards: [{t: 'Onboarding walkthrough', qc: 88, ready: true}]},
];

const qcColor = (n: number) => (n >= 75 ? theme.colors.success : n >= 50 ? theme.colors.gold : theme.colors.danger);

const Card: React.FC<{title: string; stageColor: string; qc?: number; ready?: boolean; land: number; isTarget?: boolean}> = ({
  title,
  stageColor,
  qc,
  ready,
  land,
  isTarget,
}) => {
  const frame = useCurrentFrame();
  const drop = interpolate(frame, [land - 14, land], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const op = interpolate(frame, [land - 14, land - 4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const landGlow = interpolate(frame, [land, land + 16], [0.6, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const hovered = isTarget && frame >= DASH_CLICK - 8;
  const clickPulse = isTarget ? interpolate(frame, [DASH_CLICK, DASH_CLICK + 4, DASH_CLICK + 20], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const y = (1 - drop) * -22 + (hovered ? -4 : 0);
  const scale = 1 + clickPulse * 0.05;
  const qcVal = qc !== undefined ? Math.round(interpolate(frame, [land, land + 18], [0, qc], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE})) : undefined;
  const active = clickPulse > 0.1 || hovered;

  return (
    <div
      style={{
        position: 'relative',
        height: CARD_H,
        boxSizing: 'border-box',
        background: theme.colors.raised,
        border: `1px solid ${active ? stageColor + 'cc' : theme.colors.border}`,
        borderRadius: 16,
        padding: 20,
        display: 'flex',
        gap: 16,
        transform: `translateY(${y}px) scale(${scale})`,
        opacity: op,
        boxShadow: landGlow > 0.02 ? `0 0 ${landGlow * 46}px ${stageColor}, 0 14px 40px rgba(0,0,0,0.5)` : '0 14px 40px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{width: 56, height: 56, borderRadius: 12, flexShrink: 0, background: `linear-gradient(135deg, ${stageColor}45, ${stageColor}12)`, border: `1px solid ${stageColor}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans, fontWeight: 800, fontSize: 24, color: stageColor}}>{title[0]}</div>
      <div style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column'}}>
        <div style={{fontFamily: sans, fontWeight: 600, fontSize: 19, color: theme.colors.textPrimary, lineHeight: 1.25, maxHeight: 48, overflow: 'hidden'}}>{title}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto'}}>
          <div style={{width: 24, height: 24, borderRadius: 12, background: `linear-gradient(135deg, ${theme.colors.gold}, ${theme.colors.danger})`, border: `1.5px solid ${theme.colors.raised}`}} />
          <span style={{fontFamily: mono, fontSize: 12.5, color: theme.colors.textMuted}}>3h ago</span>
        </div>
      </div>
      {ready ? (
        <div style={{position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 7, background: `${theme.colors.success}1c`, border: `1px solid ${theme.colors.success}44`}}>
          <span style={{color: theme.colors.success, fontSize: 12}}>✓</span>
          <span style={{fontFamily: mono, fontSize: 12, color: theme.colors.success, letterSpacing: '0.04em'}}>Ready</span>
        </div>
      ) : qcVal !== undefined && frame >= land ? (
        <div style={{position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 7, background: `${qcColor(qcVal)}1c`}}>
          <div style={{width: 6, height: 6, borderRadius: 3, background: qcColor(qcVal)}} />
          <span style={{fontFamily: mono, fontSize: 13, color: qcColor(qcVal)}}>QC {qcVal}</span>
        </div>
      ) : null}
    </div>
  );
};

export const DashboardScreen: React.FC<{withCursor?: boolean}> = ({withCursor = true}) => {
  const frame = useCurrentFrame();
  const titleOp = interpolate(frame, [2, 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  // magnifier-follow camera: tracks the cursor + zooms toward the card; NO recenter/release so it stays
  // aligned with the zoom-exit match cut (the dive continues straight into the editor).
  const camRaw = useCursorZoomCamera(DASH_POINTS, {zoom: 1.24, center: false, releaseAt: 99999, releaseEnd: 99999});
  const cam = withCursor ? camRaw : {};
  const boom = interpolate(frame, [DASH_CLICK, DASH_CLICK + 3, DASH_CLICK + 18], [0, 0.45, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  let idx = 0;

  return (
    <StudioStage>
      <div style={{position: 'absolute', inset: 0, ...cam}}>
      {/* header — just the mark + title + a single primary action. No 12-icon rail. */}
      <div style={{position: 'absolute', left: BOARD_LEFT, top: BOARD_TOP - 128, width: BOARD_W, display: 'flex', alignItems: 'center', opacity: titleOp}}>
        <div style={{width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 14}}><InsturixLogo size={44} color={theme.colors.gold} /></div>
        <div>
          <div style={{fontFamily: sans, fontSize: 30, fontWeight: 700, color: theme.colors.textPrimary, letterSpacing: '-0.02em'}}>Production Floor</div>
          <div style={{fontFamily: mono, fontSize: 13, color: theme.colors.textMuted, letterSpacing: '0.08em', marginTop: 3}}>EVERY VIDEO. ONE PIPELINE.</div>
        </div>
        <div style={{flex: 1}} />
        <div style={{display: 'flex', alignItems: 'center', gap: 9, padding: '11px 20px', borderRadius: 10, background: theme.colors.gold, color: theme.colors.canvas, fontFamily: sans, fontWeight: 800, fontSize: 15}}>
          <span style={{fontSize: 18, lineHeight: 1}}>+</span> New project
        </div>
      </div>

      {/* board */}
      <div style={{position: 'absolute', left: BOARD_LEFT, top: BOARD_TOP, width: BOARD_W, display: 'flex', gap: GAP}}>
        {STAGES.map((st, ci) => {
          const headOp = interpolate(frame, [4 + ci * 3, 16 + ci * 3], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          return (
            <div key={st.label} style={{width: COL_W}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 10, height: HEAD_H, opacity: headOp}}>
                <div style={{width: 4, height: 18, borderRadius: 2, background: st.color}} />
                <span style={{fontFamily: sans, fontSize: 18, fontWeight: 600, color: theme.colors.textPrimary}}>{st.label}</span>
                <span style={{fontFamily: mono, fontSize: 13, color: theme.colors.textDim}}>{st.cards.length}</span>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                {st.cards.map((c, ri) => {
                  const land = LANDS[idx] ?? 90;
                  idx += 1;
                  const isTarget = st.label === 'Edit' && ri === 0;
                  return <Card key={c.t} title={c.t} stageColor={st.color} qc={c.qc} ready={c.ready} land={land} isTarget={isTarget} />;
                })}
              </div>
            </div>
          );
        })}
      </div>

      {withCursor && <Cursor points={DASH_POINTS} />}
      </div>
      {withCursor && boom > 0.001 && <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at ${DASH_TARGET.x}px ${DASH_TARGET.y}px, rgba(212,166,82,${boom}), transparent 24%)`}} />}
    </StudioStage>
  );
};
