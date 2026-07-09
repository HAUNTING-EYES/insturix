import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';
import {Cursor, useCursorZoomCamera} from '../anim-ui';
import {StudioStage} from '../components/StudioStage';
import {SfxCue} from '../audio';

// "Content Calendar" (CalOS) — plan a month in seconds. A cadence (M/W/F) auto-fills the grid with
// idea pills; "AI plan" upgrades them (gray→cyan, real titles + trends); editorial review flips some
// green (approved); all on-brand, across platforms. Stages mirror the real lib/calos/stages.ts colors.
const sans = theme.font.sans;
const mono = theme.font.mono;

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const GRID_L = 302;
const GRID_T = 286;
const COL_W = 188;
const ROW_H = 124;
const ROWS = 5;

const AI_CLICK = 60; // click after the entrance settles
const TITLES = ['5 myths about cold brew', 'Behind the roastery', 'Single-origin, explained', 'Customer spotlight', 'Brewing guide · V60', 'Why freshness wins', 'Meet the founder', 'Sourcing in Ethiopia', 'Subscription perks', 'Latte-art reel', 'Q4 launch teaser', 'Sustainability report', 'Barista tips in 30s', 'Holiday gift sets', 'Behind the blend'];
const COLS = [1, 3, 5]; // Mon / Wed / Fri
const PLATS = ['in', 'IG', 'YT'];
const CHIPS = TITLES.map((title, i) => ({
  i,
  title,
  week: Math.floor(i / 3),
  col: COLS[i % 3],
  plat: PLATS[i % 3],
  dropAt: 64 + i * 2,
  enhanceAt: 104 + i * 2.4,
  approved: i % 3 === 0,
  approveAt: 154 + Math.floor(i / 3) * 7,
}));

export const CALENDAR_SFX: SfxCue[] = [
  {name: 'click', at: AI_CLICK, volume: 0.7},
  {name: 'riser', at: AI_CLICK + 2, volume: 0.35},
  ...CHIPS.filter((_, i) => i % 3 === 0).map((c): SfxCue => ({name: 'tick', at: c.dropAt, volume: 0.3})),
  {name: 'pop', at: 108, volume: 0.4},
  {name: 'success', at: 164, volume: 0.45},
];

const CURSOR_POINTS = [
  {x: 1380, y: 560, at: 44},
  {x: 1557, y: 168, at: 56}, // track to the AI-plan button
  {x: 1557, y: 168, at: AI_CLICK, click: true},
];

export const CalendarScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const head = interpolate(frame, [2, 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pressed = frame >= AI_CLICK && frame < AI_CLICK + 8;
  const caption = interpolate(frame, [174, 192], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cam = useCursorZoomCamera(CURSOR_POINTS, {zoom: 1.36, zoomInStart: 46, zoomInEnd: 60, releaseAt: 70, releaseEnd: 110});
  const boom = interpolate(frame, [AI_CLICK, AI_CLICK + 3, AI_CLICK + 18], [0, 0.45, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <StudioStage tint="rgba(92,204,184,0.07)" tintAt="90% 88%">
      <div style={{position: 'absolute', inset: 0, ...cam}}>
        {/* header */}
        <div style={{position: 'absolute', left: GRID_L, top: 150, width: COL_W * 7, display: 'flex', alignItems: 'center', opacity: head}}>
          <span style={{fontFamily: sans, fontSize: 28, fontWeight: 700, color: theme.colors.textPrimary, letterSpacing: '-0.02em'}}>Content Calendar</span>
          <div style={{marginLeft: 18, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 8, background: theme.colors.well, border: `1px solid ${theme.colors.border}`}}>
            <div style={{width: 6, height: 6, borderRadius: 3, background: theme.colors.gold}} />
            <span style={{fontFamily: mono, fontSize: 12, color: theme.colors.textSecondary}}>LinkedIn · IG · YT — 3×/week · M·W·F</span>
          </div>
          <div style={{flex: 1}} />
          <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 10, background: theme.colors.gold, color: theme.colors.canvas, fontFamily: sans, fontWeight: 800, fontSize: 16, transform: `scale(${pressed ? 0.95 : 1})`, boxShadow: pressed ? `0 0 24px ${theme.colors.gold}66` : 'none'}}>✦ AI plan</div>
        </div>

        {/* day-of-week row */}
        <div style={{position: 'absolute', left: GRID_L, top: 244, width: COL_W * 7, display: 'flex', opacity: head}}>
          {DOW.map((d) => (
            <div key={d} style={{width: COL_W, fontFamily: mono, fontSize: 12, letterSpacing: '0.1em', color: theme.colors.textDim}}>{d}</div>
          ))}
        </div>

        {/* grid cells */}
        {Array.from({length: ROWS * 7}).map((_, idx) => {
          const r = Math.floor(idx / 7);
          const c = idx % 7;
          const day = r * 7 + c + 1;
          return (
            <div key={idx} style={{position: 'absolute', left: GRID_L + c * COL_W, top: GRID_T + r * ROW_H, width: COL_W - 8, height: ROW_H - 8, borderRadius: 10, border: `1px solid ${theme.colors.border}`, background: 'rgba(15,15,14,0.5)', opacity: head}}>
              <div style={{position: 'absolute', top: 8, left: 10, fontFamily: mono, fontSize: 12, color: theme.colors.textDim}}>{day}</div>
            </div>
          );
        })}

        {/* content chips filling on cadence */}
        {CHIPS.map((ch) => {
          const drop = spring({frame: frame - ch.dropAt, fps, config: {damping: 16, mass: 0.5, stiffness: 200}});
          if (drop <= 0.001) return null;
          const enhanced = frame >= ch.enhanceAt;
          const isApproved = ch.approved && frame >= ch.approveAt;
          const titleOp = interpolate(frame, [ch.enhanceAt, ch.enhanceAt + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          const stageColor = isApproved ? theme.colors.success : enhanced ? theme.colors.cyan : theme.colors.textMuted;
          const x = GRID_L + ch.col * COL_W + 8;
          const y = GRID_T + ch.week * ROW_H + 34;
          return (
            <div
              key={ch.i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: COL_W - 24,
                opacity: Math.min(1, drop),
                transform: `scale(${interpolate(Math.min(1, drop), [0, 1], [0.8, 1])})`,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 9px',
                borderRadius: 7,
                background: `${stageColor}1c`,
                border: `1px solid ${stageColor}55`,
              }}
            >
              <div style={{width: 5, height: 5, borderRadius: 3, background: stageColor, flexShrink: 0}} />
              <span style={{flex: 1, minWidth: 0, fontFamily: sans, fontSize: 11.5, fontWeight: 500, color: enhanced ? theme.colors.textPrimary : theme.colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: enhanced ? titleOp : 1}}>
                {enhanced ? ch.title : '— idea —'}
              </span>
              {isApproved ? (
                <span style={{color: theme.colors.success, fontSize: 11, flexShrink: 0}}>✓</span>
              ) : (
                <span style={{fontFamily: mono, fontSize: 9, color: theme.colors.gold, flexShrink: 0}}>{ch.plat}</span>
              )}
            </div>
          );
        })}

        {/* caption */}
        <div style={{position: 'absolute', top: 962, width: '100%', textAlign: 'center', opacity: caption}}>
          <span style={{fontFamily: sans, fontSize: 24, fontWeight: 600, color: theme.colors.textPrimary}}>A month of content — <span style={{color: theme.colors.gold}}>planned, on-brand, on-trend.</span></span>
        </div>

        <Cursor points={CURSOR_POINTS} />
      </div>
      {boom > 0.001 && <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at 1557px 168px, rgba(212,166,82,${boom}), transparent 28%)`}} />}
    </StudioStage>
  );
};
