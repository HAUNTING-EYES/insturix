import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from './brand';
import { Stage, Region, Bleed } from './stage';
import { FitHeadline } from './fit-text';
import { phases, progress, pulseAt, exitOut } from './choreo';

// ── word anchors (the ONLY hand-authored timing constants) ──────────────
const W_WE = 18;
const W_KEPT = 34;
const W_GRINDING = 52;   // STRESSED — strongest effort pulse
const PAUSE_A = 76;      // comma: slip-back window
const PAUSE_B = 98;
const W_BARELY = 100;    // STRESSED — pulse, then the largest slip-back
const W_MOVING = 128;
const MOVING_END = 166;  // last word ends; settle begins

// slope geometry (a spatial constant from casting, not a timing anchor)
const SLOPE_DEG = 22;

export const GlmScene: React.FC<{brand: Brand}> = ({brand}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width: W, height: H } = useVideoConfig();
  const ph = phases(durationInFrames, brand);

  // ── one scalar: eased pushes on the stressed words, decay in the gaps ──
  const seg = (from: number, to: number) => progress(frame, from, to);
  let p = 0;
  p += 0.05 * seg(W_WE, W_WE + 12);              // "we"       — small
  p += 0.07 * seg(W_KEPT, W_KEPT + 14);          // "kept"     — small
  p += 0.22 * seg(W_GRINDING, W_GRINDING + 22);  // "grinding" — strongest, slow ramp = weight
  p -= 0.05 * seg(PAUSE_A, PAUSE_B);             // slip-back inside the comma pause
  p += 0.14 * seg(W_BARELY, W_BARELY + 14);      // "barely"   — second pulse
  p -= 0.11 * seg(W_BARELY + 18, W_MOVING + 12); // largest slip-back, right after "barely"
  p += 0.05 * seg(W_MOVING + 22, MOVING_END);    // "moving"   — small final push
  p = Math.max(0, p);                            // net settles ~0.37 → non-completion

  // ── geometry along the incline ───────────────────────────────────────
  const theta = (SLOPE_DEG * Math.PI) / 180;
  const dirX = Math.cos(theta), dirY = -Math.sin(theta);  // up-slope unit
  const nX = -Math.sin(theta), nY = -Math.cos(theta);     // up-normal (resting side)
  const baseX = 0.20 * W, baseY = 0.68 * H;
  const L = 0.68 * W;
  const topX = baseX + L * dirX, topY = baseY + L * dirY;
  const slopeLen = Math.hypot(topX - baseX, topY - baseY);

  const rB = 0.075 * W;             // boulder — noticeably bigger than the figure
  const usable = L * 0.70;          // the summit is NEVER within reach
  const boulderDist = rB + 0.02 * W + p * usable;
  const figDist = Math.max(rB * 0.2, boulderDist - rB - 0.012 * W);

  const bcx = baseX + boulderDist * dirX + rB * nX;
  const bcy = baseY + boulderDist * dirY + rB * nY;
  const fcx = baseX + figDist * dirX;
  const fcy = baseY + figDist * dirY;

  // rolling ∝ distance travelled → rolls BACK during slip-backs
  const rollDeg = ((p * usable) / rB) * (180 / Math.PI);

  // ── weight & persistence: micro-strain, harder on the stressed words ──
  const e = brand.motion.energy;
  const effort =
    pulseAt(frame, W_GRINDING, 1) +
    0.8 * pulseAt(frame, W_BARELY, 1) +
    0.5 * pulseAt(frame, W_KEPT, 1);
  const strainDeg = (0.8 + 2.4 * effort) * e * Math.sin(frame * 0.9);
  const strainPx = H * 0.004 * e * Math.sin(frame * 0.62 + 1.1);
  const leanDeg = (SLOPE_DEG + 14) + strainDeg;   // leaning INTO the push

  // figure appears at "we"; slope strokes in just before it arrives
  const appear = progress(frame, W_WE, W_WE + 8);
  const drawn = progress(frame, 0, W_WE);

  // ── colours: brand tokens only ───────────────────────────────────────
  const ink = withAlpha(brand.colors.text, 0.92);
  const line = withAlpha(brand.colors.text, 0.40);
  const stoneFill = withAlpha(brand.colors.text, 0.14);
  const stoneEdge = withAlpha(brand.colors.text, 0.55);
  const mark = withAlpha(brand.colors.text, 0.42);
  const sw = H * 0.0042;

  const figW = 0.032 * W;
  const figH = 0.10 * H;
  const headR = 0.019 * W;

  return (
    <Stage brand={brand} backdrop={false}>
      <Bleed>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{position: 'absolute', inset: 0}}>
          {/* the incline — drawn first, during intro */}
          <line
            x1={baseX} y1={baseY} x2={topX} y2={topY}
            stroke={line} strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={slopeLen} strokeDashoffset={slopeLen * (1 - drawn)}
          />

          {/* the burden — heavy, rolls with net travel, rolls back on slips */}
          <g opacity={appear} transform={`rotate(${rollDeg} ${bcx} ${bcy})`}>
            <circle cx={bcx} cy={bcy} r={rB} fill={stoneFill} stroke={stoneEdge} strokeWidth={sw} />
            <line x1={bcx} y1={bcy} x2={bcx} y2={bcy - rB * 0.8} stroke={mark} strokeWidth={sw * 0.8} strokeLinecap="round" />
            <circle cx={bcx} cy={bcy - rB * 0.5} r={rB * 0.06} fill={mark} />
          </g>

          {/* the figure — leaning capsule + head, straining on every frame */}
          <g opacity={appear} transform={`translate(${fcx} ${fcy + strainPx}) rotate(${leanDeg})`}>
            <rect x={-figW / 2} y={-figH} width={figW} height={figH} rx={figW / 2} fill={ink} />
            <circle cx={0} cy={-figH - headR * 0.55} r={headR} fill={ink} />
          </g>
        </svg>
      </Bleed>

      <Region brand={brand} x={0.05} y={0.80} w={0.52} h={0.16} align="left" justify="end">
        <div style={exitOut(frame, ph, 'fade')}>
          <FitHeadline
            brand={brand}
            text="we kept grinding, barely moving"
            accentWords={["barely"]}
            size="l"
            kinetic="rise"
            startAt={W_WE}
            align="left"
          />
        </div>
      </Region>
    </Stage>
  );
};
