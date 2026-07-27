import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {HERA, HERA_CANVAS} from './brand';
import {useTypewriter} from '../anim-ui';

// BESPOKE Hera product moment — the prompt→motion editor, building itself. The prompt typewrites, the orange
// send button clicks, and the dark canvas GENERATES the title animation the prompt asked for (kinetic chars,
// in orange). Reconstructed from hera.video's own product shots: white app frame, aspect/duration pills, a
// left tool rail, the orange-send prompt bar. Deterministic. Light theme (Hera markets on white).
const c = HERA.colors;
const sans = HERA.fontSans;
const PROMPT = 'A bold title animation in orange';
const RESULT = 'SHIP IT.';
const SEND_AT = 66;
const GEN_AT = 78;

const Icon: React.FC<{d: string; active?: boolean}> = ({d, active}) => (
  <div style={{width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? c.accent : 'transparent'}}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? c.accentText : c.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  </div>
);

export const HeraEditor: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inSpr = spring({frame, fps, config: {damping: 20, mass: 0.8, stiffness: 110}});
  const typed = useTypewriter(PROMPT, 8, 30);
  const caret = Math.floor(frame / 15) % 2 === 0;
  const sent = frame >= SEND_AT;
  const click = interpolate(frame, [SEND_AT, SEND_AT + 4, SEND_AT + 16], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  const FRAME_W = 1440;
  const FRAME_H = 830;
  const left = (1920 - FRAME_W) / 2;
  const top = (1080 - FRAME_H) / 2 - 6;

  // canvas generated title — chars reveal after "generate"
  const resultChars = Array.from(RESULT);

  return (
    <AbsoluteFill style={{backgroundColor: '#EDEDF0', fontFamily: sans}}>
      {/* soft backdrop */}
      <AbsoluteFill style={{background: 'radial-gradient(60% 50% at 50% 0%, rgba(245,80,30,0.06), transparent 60%)'}} />

      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: FRAME_W,
          height: FRAME_H,
          background: c.bg,
          borderRadius: 22,
          border: `1px solid ${c.border}`,
          boxShadow: '0 40px 120px rgba(11,18,32,0.18)',
          opacity: interpolate(frame, [0, 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          transform: `translateY(${(1 - inSpr) * 14}px)`,
          overflow: 'hidden',
        }}
      >
        {/* top bar: aspect + duration pills */}
        <div style={{display: 'flex', justifyContent: 'center', gap: 12, padding: '20px 0 0'}}>
          {['Widescreen 16:9', '15 seconds'].map((t) => (
            <div key={t} style={{display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, background: c.surface, border: `1px solid ${c.border}`, fontSize: 14.5, fontWeight: 500, color: c.text}}>
              {t}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.4" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </div>
          ))}
        </div>

        {/* left tool rail */}
        <div style={{position: 'absolute', left: 26, top: 250, display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: c.surface, borderRadius: 16, border: `1px solid ${c.border}`}}>
          <Icon d="M4 3l7 17 2.5-6.5L20 11z" active />
          <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <Icon d="M12 3l1.9 4.6L18 9l-4.1 1.4L12 15l-1.9-4.6L6 9l4.1-1.4z" />
          <Icon d="M3 10a8 8 0 1 1 2 5m-2 0v-5h5" />
        </div>

        {/* canvas — the generated animation renders here */}
        <div style={{position: 'absolute', left: 130, top: 108, width: FRAME_W - 200, height: 520, borderRadius: 16, background: HERA_CANVAS, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 88, overflow: 'hidden'}}>
          {frame >= GEN_AT ? (
            <div style={{display: 'flex'}}>
              {resultChars.map((ch, i) => {
                const at = GEN_AT + 6 + i * 5;
                const s = spring({frame: frame - at, fps, config: {damping: 12, mass: 0.5, stiffness: 180}});
                const o = Math.max(0, Math.min(1, s));
                return (
                  <span key={i} style={{display: 'inline-block', whiteSpace: 'pre', fontSize: 132, fontWeight: 800, letterSpacing: '-0.04em', color: c.accent, opacity: o, transform: `translateY(${(1 - o) * 40}px)`}}>
                    {ch}
                  </span>
                );
              })}
            </div>
          ) : (
            <span style={{fontSize: 20, color: 'rgba(255,255,255,0.32)', margin: '0 auto'}}>{sent ? 'Generating…' : ''}</span>
          )}
          {/* generating shimmer */}
          {sent && frame < GEN_AT + 10 && (
            <div style={{position: 'absolute', inset: 0, background: `linear-gradient(90deg, transparent, rgba(245,80,30,0.14), transparent)`, transform: `translateX(${interpolate(frame, [SEND_AT, GEN_AT + 10], [-800, 1400], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}px)`}} />
          )}
        </div>

        {/* prompt bar */}
        <div style={{position: 'absolute', left: 130, bottom: 40, width: FRAME_W - 200, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 22px', borderRadius: 16, background: c.bg, border: `1px solid ${c.border}`, boxShadow: '0 8px 30px rgba(11,18,32,0.08)'}}>
          <span style={{flex: 1, fontSize: 17, color: typed ? c.text : c.muted}}>
            {typed || 'Describe what you want to show'}
            {!sent && caret && <span style={{color: c.accent}}>|</span>}
          </span>
          <div style={{width: 40, height: 40, borderRadius: 20, background: c.surface, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="1.8" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
          </div>
          <div style={{width: 46, height: 46, borderRadius: 23, background: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 - click * 0.12})`, boxShadow: click > 0.05 ? `0 0 ${click * 34}px ${c.accent}` : 'none'}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.accentText} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </div>
        </div>
      </div>

      {/* cursor moving to send + click */}
      {frame >= SEND_AT - 22 && (
        <div style={{position: 'absolute', left: interpolate(frame, [SEND_AT - 22, SEND_AT], [left + FRAME_W - 400, left + FRAME_W - 84], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), top: interpolate(frame, [SEND_AT - 22, SEND_AT], [top + FRAME_H + 40, top + FRAME_H - 66], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), zIndex: 50}}>
          {click > 0.02 && click < 1 && <div style={{position: 'absolute', width: 14 + click * 32, height: 14 + click * 32, marginLeft: -(7 + click * 16), marginTop: -(7 + click * 16), borderRadius: '50%', border: `2px solid ${c.accent}`, opacity: 1 - click}} />}
          <svg width="26" height="26" viewBox="0 0 24 24" style={{filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))'}}><path d="M5 3l14 8-6 1.6L9.6 18z" fill={c.text} stroke="#fff" strokeWidth="1.1" strokeLinejoin="round" /></svg>
        </div>
      )}
    </AbsoluteFill>
  );
};
