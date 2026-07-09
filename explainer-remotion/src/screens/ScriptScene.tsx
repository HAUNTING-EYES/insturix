import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';
import {EASE} from '../anim';
import {Cursor, useCursorZoomCamera, useTypewriter} from '../anim-ui';
import {StudioStage} from '../components/StudioStage';
import {MonoLabel} from '../components/MonoLabel';
import {SfxCue} from '../audio';

// "Script" — idea → production-ready script (ThinkForge). A prompt is typed, the cursor hits "Write",
// and a structured script builds itself: acts with hooks, pacing, and a CTA — on-brand from the Vault.
// Copy: "Start with a prompt. Get a production-ready script." Continuity: the scanned coffee brand.
const sans = theme.font.sans;

const WRITE_AT = 80; // click after the entrance settles + the prompt types
const ACTS = [
  {label: 'HOOK', time: '0:00', line: '"Your morning ritual, upgraded."', dir: 'Cold open — macro pour, steam curling.', at: 92, color: theme.colors.gold},
  {label: 'BUILD', time: '0:08', line: '"Single-origin beans. Roasted the day they ship."', dir: 'Beans tumble. Hands wrap the warm mug.', at: 110, color: theme.colors.textMuted},
  {label: 'CTA', time: '0:24', line: '"Taste the difference."', dir: 'Logo reveal — meridian.coffee', at: 128, color: theme.colors.gold},
];

export const SCRIPT_SFX: SfxCue[] = [
  {name: 'click', at: WRITE_AT, volume: 0.7},
  {name: 'riser', at: WRITE_AT, volume: 0.35},
  ...ACTS.map((a): SfxCue => ({name: 'tick', at: a.at, volume: 0.4})),
];

const CURSOR_POINTS = [
  {x: 870, y: 182, at: 50}, // at the prompt input while it types
  {x: 870, y: 182, at: 72},
  {x: 1276, y: 182, at: 78}, // track to the Write-script button
  {x: 1276, y: 182, at: WRITE_AT, click: true},
];

const PANEL_L = 430;
const PANEL_W = 1060;

export const ScriptScene: React.FC = () => {
  const frame = useCurrentFrame();
  const prompt = useTypewriter('Launch video for our coffee brand', 50, 72);
  const eyebrow = interpolate(frame, [2, 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pressed = frame >= WRITE_AT && frame < WRITE_AT + 8;
  const panel = interpolate(frame, [WRITE_AT + 4, WRITE_AT + 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const caption = interpolate(frame, [146, 162], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cam = useCursorZoomCamera(CURSOR_POINTS, {zoom: 1.45, zoomInStart: 50, zoomInEnd: 64, releaseAt: 90, releaseEnd: 130});
  const boom = interpolate(frame, [WRITE_AT, WRITE_AT + 3, WRITE_AT + 18], [0, 0.42, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <StudioStage>
      <div style={{position: 'absolute', inset: 0, ...cam}}>
        {/* eyebrow */}
        <div style={{position: 'absolute', top: 96, width: '100%', textAlign: 'center', opacity: eyebrow}}>
          <MonoLabel size={14} tracking={0.32} color={theme.colors.gold}>Script · from a prompt</MonoLabel>
        </div>

        {/* prompt bar */}
        <div style={{position: 'absolute', top: 150, left: 560, width: 800, height: 64, display: 'flex', gap: 12, opacity: eyebrow}}>
          <div style={{flex: 1, display: 'flex', alignItems: 'center', padding: '0 22px', borderRadius: 12, background: theme.colors.well, border: `1px solid ${theme.colors.border}`, fontFamily: sans, fontSize: 20, color: theme.colors.textPrimary}}>
            {prompt}
            {prompt.length < 33 && <span style={{opacity: (frame % 16) < 8 ? 1 : 0}}>|</span>}
          </div>
          <div style={{width: 168, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, background: theme.colors.gold, color: theme.colors.canvas, fontFamily: sans, fontWeight: 800, fontSize: 17, transform: `scale(${pressed ? 0.95 : 1})`, boxShadow: pressed ? `0 0 24px ${theme.colors.gold}66` : 'none'}}>✦ Write script</div>
        </div>

        {/* script document building itself */}
        <div
          style={{
            position: 'absolute',
            left: PANEL_L,
            top: 300,
            width: PANEL_W,
            opacity: panel,
            transform: `translateY(${(1 - panel) * 22}px)`,
            background: theme.colors.raised,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 18,
            padding: '30px 38px',
            boxShadow: '0 30px 90px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', marginBottom: 20}}>
            <span style={{fontFamily: sans, fontSize: 22, fontWeight: 700, color: theme.colors.textPrimary}}>Q4 Launch · :30</span>
            <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 8, background: `${theme.colors.success}1a`, border: `1px solid ${theme.colors.success}44`}}>
              <span style={{color: theme.colors.success, fontSize: 13}}>✓</span>
              <span style={{fontFamily: theme.font.mono, fontSize: 12, color: theme.colors.success, letterSpacing: '0.06em'}}>on-brand · Vault</span>
            </div>
          </div>
          <div style={{height: 1, background: theme.colors.border, marginBottom: 24}} />
          <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
            {ACTS.map((a) => {
              const op = interpolate(frame, [a.at, a.at + 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
              return (
                <div key={a.label} style={{opacity: op, transform: `translateX(${(1 - op) * -16}px)`, display: 'flex', gap: 22}}>
                  <div style={{width: 120, flexShrink: 0, paddingTop: 4}}>
                    <div style={{fontFamily: theme.font.mono, fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: a.color}}>{a.label}</div>
                    <div style={{fontFamily: theme.font.mono, fontSize: 12, color: theme.colors.textDim, marginTop: 4}}>{a.time}</div>
                  </div>
                  <div style={{flex: 1}}>
                    <div style={{fontFamily: sans, fontSize: 23, fontWeight: 600, color: theme.colors.textPrimary, lineHeight: 1.35}}>{a.line}</div>
                    <div style={{fontFamily: sans, fontSize: 16, color: theme.colors.textMuted, marginTop: 6}}>{a.dir}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{position: 'absolute', top: 880, width: '100%', textAlign: 'center', opacity: caption}}>
          <span style={{fontFamily: sans, fontSize: 24, fontWeight: 600, color: theme.colors.textPrimary}}>Start with a prompt. <span style={{color: theme.colors.gold}}>Get a production-ready script.</span></span>
        </div>

        <Cursor points={CURSOR_POINTS} />
      </div>
      {boom > 0.001 && <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at 1276px 182px, rgba(212,166,82,${boom}), transparent 26%)`}} />}
    </StudioStage>
  );
};
