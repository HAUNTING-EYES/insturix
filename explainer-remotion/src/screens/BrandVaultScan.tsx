import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';
import {EASE} from '../anim';
import {Cursor, useCursorZoomCamera, useTypewriter} from '../anim-ui';
import {StudioStage} from '../components/StudioStage';
import {MonoLabel} from '../components/MonoLabel';
import {SfxCue} from '../audio';

// "Brand Vault" — the brain. Paste a brand → a scan sweep → everything the brand IS materializes,
// evidence-first: palette, logo, typography, AUDIENCE PSYCHOGRAPHICS, and voice. (Sets up "every tool
// shares one brain" — the next beat wires this vault to all six rooms.) Camera trails the Scan click.
const sans = theme.font.sans;
const mono = theme.font.mono;

const SCAN_AT = 86; // sequence starts after the ~46f crossfade entrance so step 1 reads on a settled scene
const SWEEP = [SCAN_AT, SCAN_AT + 30] as const;
// each signal card lands as the sweep passes its row (cause → effect), on the beat grid.
const LANDS = {palette: 100, logo: 108, type: 116, audience: 126, voice: 136};

export const BRANDVAULT_SFX: SfxCue[] = [
  {name: 'click', at: SCAN_AT, volume: 0.7},
  {name: 'riser', at: SCAN_AT, volume: 0.4},
  {name: 'tick', at: LANDS.palette, volume: 0.4},
  {name: 'tick', at: LANDS.logo, volume: 0.4},
  {name: 'tick', at: LANDS.type, volume: 0.4},
  {name: 'tick', at: LANDS.audience, volume: 0.45},
  {name: 'pop', at: LANDS.voice, volume: 0.4},
];

const CURSOR_POINTS = [
  {x: 820, y: 182, at: 48}, // (01) at the input while it types the brand — held so the typing reads
  {x: 820, y: 182, at: 74},
  {x: 1290, y: 182, at: 82}, // (02) swift track to Scan
  {x: 1290, y: 182, at: SCAN_AT, click: true},
];

const PALETTE = ['#2A1A12', '#6B4226', '#A9743F', '#D9B382', '#F2E6D0'];
const AUDIENCE = ['Specialty-coffee lovers', 'Design-conscious', 'Urban · 25–40', 'Sustainability-minded'];
const VOICE: [string, number][] = [['Warm', 0.85], ['Confident', 0.72], ['Editorial', 0.6]];

const Card: React.FC<{x: number; y: number; w: number; h: number; land: number; label: string; children: React.ReactNode}> = ({x, y, w, h, land, label, children}) => {
  const frame = useCurrentFrame();
  const drop = interpolate(frame, [land - 12, land], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const op = interpolate(frame, [land - 12, land - 3], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const glow = interpolate(frame, [land, land + 16], [0.55, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        boxSizing: 'border-box',
        opacity: op,
        transform: `translateY(${(1 - drop) * 20}px) scale(${0.96 + 0.04 * drop})`,
        background: theme.colors.raised,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 16,
        padding: 20,
        boxShadow: glow > 0.02 ? `0 0 ${glow * 40}px rgba(212,166,82,0.5), 0 16px 44px rgba(0,0,0,0.45)` : '0 16px 44px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14}}>
        <div style={{width: 5, height: 5, borderRadius: 3, background: theme.colors.gold}} />
        <span style={{fontFamily: mono, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: theme.colors.textMuted}}>{label}</span>
        <span style={{marginLeft: 'auto', fontFamily: mono, fontSize: 10.5, color: theme.colors.textDim, letterSpacing: '0.08em'}}>✓ website</span>
      </div>
      {children}
    </div>
  );
};

export const BrandVaultScan: React.FC = () => {
  const frame = useCurrentFrame();
  const url = useTypewriter('meridian.coffee', 48, 34);
  const eyebrow = interpolate(frame, [2, 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const sweepY = interpolate(frame, SWEEP, [150, 880], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const sweepOp = interpolate(frame, [SWEEP[0], (SWEEP[0] + SWEEP[1]) / 2, SWEEP[1]], [0, 0.9, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pressed = frame >= SCAN_AT && frame < SCAN_AT + 8;
  const caption = interpolate(frame, [LANDS.voice + 8, LANDS.voice + 24], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cam = useCursorZoomCamera(CURSOR_POINTS, {zoom: 1.62, zoomInStart: 46, zoomInEnd: 60, releaseAt: 96, releaseEnd: 134}); // (01) snap-zoom in → hold tight through typing → (03) pull back as it loads
  const boom = interpolate(frame, [SCAN_AT, SCAN_AT + 3, SCAN_AT + 18], [0, 0.5, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <StudioStage>
      <AbsoluteCam cam={cam}>
        {/* eyebrow */}
        <div style={{position: 'absolute', top: 92, width: '100%', textAlign: 'center', opacity: eyebrow}}>
          <MonoLabel size={14} tracking={0.32} color={theme.colors.gold}>Brand Vault · scanning</MonoLabel>
        </div>

        {/* scan bar */}
        <div style={{position: 'absolute', top: 150, left: 560, width: 800, height: 64, display: 'flex', gap: 12, opacity: eyebrow}}>
          <div style={{flex: 1, display: 'flex', alignItems: 'center', padding: '0 22px', borderRadius: 12, background: theme.colors.well, border: `1px solid ${theme.colors.border}`, fontFamily: mono, fontSize: 20, color: theme.colors.textPrimary}}>
            {url}
            {url.length < 15 && <span style={{opacity: (frame % 16) < 8 ? 1 : 0}}>|</span>}
          </div>
          <div style={{width: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: theme.colors.gold, color: theme.colors.canvas, fontFamily: sans, fontWeight: 800, fontSize: 18, transform: `scale(${pressed ? 0.95 : 1})`, boxShadow: pressed ? `0 0 24px ${theme.colors.gold}66` : 'none'}}>Scan</div>
        </div>

        {/* scan sweep line */}
        {sweepOp > 0.01 && (
          <div style={{position: 'absolute', left: 200, right: 200, top: sweepY, height: 2, background: theme.colors.gold, opacity: sweepOp, boxShadow: `0 0 18px ${theme.colors.gold}`}} />
        )}

        {/* signal bento — palette / logo / type / audience / voice */}
        <Card x={230} y={300} w={700} h={236} land={LANDS.palette} label="Palette">
          <div style={{display: 'flex', gap: 12, flex: 1, alignItems: 'stretch'}}>
            {PALETTE.map((c, i) => {
              const sIn = interpolate(frame, [LANDS.palette + i * 3, LANDS.palette + 10 + i * 3], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
              return <div key={c} style={{flex: 1, borderRadius: 10, background: c, border: '1px solid rgba(255,255,255,0.06)', opacity: sIn, transform: `translateY(${(1 - sIn) * 14}px)`}} />;
            })}
          </div>
        </Card>

        <Card x={950} y={300} w={330} h={236} land={LANDS.logo} label="Logo">
          <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div style={{width: 96, height: 96, borderRadius: 48, background: theme.wordmarkGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans, fontWeight: 800, fontSize: 46, color: theme.colors.canvas}}>M</div>
          </div>
        </Card>

        <Card x={1300} y={300} w={390} h={236} land={LANDS.type} label="Typography">
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
            <div style={{fontFamily: sans, fontWeight: 800, fontSize: 84, lineHeight: 0.9, color: theme.colors.textPrimary, letterSpacing: '-0.03em'}}>Aa</div>
            <div style={{fontFamily: mono, fontSize: 14, color: theme.colors.textMuted, marginTop: 10}}>Display · Mono</div>
          </div>
        </Card>

        <Card x={230} y={560} w={880} h={236} land={LANDS.audience} label="Audience psychographics">
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'center', flex: 1}}>
            {AUDIENCE.map((a, i) => {
              const cIn = interpolate(frame, [LANDS.audience + i * 4, LANDS.audience + 12 + i * 4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
              return (
                <span key={a} style={{padding: '11px 18px', borderRadius: 999, background: theme.colors.well, border: `1px solid ${theme.colors.purple}44`, fontFamily: sans, fontSize: 18, color: theme.colors.textSecondary, opacity: cIn, transform: `scale(${interpolate(cIn, [0, 1], [0.8, 1])})`}}>{a}</span>
              );
            })}
          </div>
        </Card>

        <Card x={1130} y={560} w={560} h={236} land={LANDS.voice} label="Voice">
          <div style={{display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center', flex: 1}}>
            {VOICE.map(([name, v], i) => {
              const w = interpolate(frame, [LANDS.voice + i * 4, LANDS.voice + 16 + i * 4], [0, v], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
              return (
                <div key={name} style={{display: 'flex', alignItems: 'center', gap: 14}}>
                  <span style={{width: 110, fontFamily: sans, fontSize: 17, color: theme.colors.textSecondary}}>{name}</span>
                  <div style={{flex: 1, height: 7, borderRadius: 4, background: theme.colors.well, overflow: 'hidden'}}>
                    <div style={{height: '100%', width: `${w * 100}%`, borderRadius: 4, background: theme.wordmarkGradient}} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* caption */}
        <div style={{position: 'absolute', top: 838, width: '100%', textAlign: 'center', opacity: caption}}>
          <span style={{fontFamily: sans, fontSize: 24, fontWeight: 600, color: theme.colors.textPrimary}}>Everything your brand is — <span style={{color: theme.colors.gold}}>in one vault.</span></span>
        </div>

        <Cursor points={CURSOR_POINTS} />
      </AbsoluteCam>
      {boom > 0.001 && <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at 1290px 182px, rgba(212,166,82,${boom}), transparent 30%)`}} />}
    </StudioStage>
  );
};

// small helper: wraps children in a camera-transformed full-frame layer (keeps StudioStage glow fixed).
const AbsoluteCam: React.FC<{cam: React.CSSProperties; children: React.ReactNode}> = ({cam, children}) => (
  <div style={{position: 'absolute', inset: 0, ...cam}}>{children}</div>
);
