import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';
import {EASE} from '../anim';
import {Cursor, useCursorZoomCamera, useTypewriter} from '../anim-ui';
import {StudioStage} from '../components/StudioStage';
import {SfxCue} from '../audio';

// "Edit" — the hero product moment, as a 5-step chat-to-edit story (founder storyboard):
// (01) editor loads with footage → (02) camera zooms into the chat input → (03) types
// "chat to edit, days of edit done in minutes" (cursor + camera tracking) → (04) moves to send,
// hits enter (boom) → (05) camera zooms out: the result IS the line, the timeline fills, "Ready".
const sans = theme.font.sans;
const mono = theme.font.mono;

const WIN_L = 210;
const WIN_T = 150;
const WIN_W = 1500;
const WIN_H = 780;
const TOPBAR = 60;
const ENTER = 112;
const PROMPT = 'chat to edit, days of edit done in minutes';

// chat input lives bottom-right of the AI panel
const INPUT_C = {x: 1500, y: 879};
const SEND_C = {x: 1673, y: 879}; // tip on the send (↑) button centre
const CURSOR_POINTS = [
  {x: 1380, y: 740, at: 46},
  {x: INPUT_C.x, y: INPUT_C.y, at: 56}, // (02/03) at the chat input, typing
  {x: INPUT_C.x, y: INPUT_C.y, at: 100},
  {x: SEND_C.x, y: SEND_C.y, at: 108}, // (04) move to send
  {x: SEND_C.x, y: SEND_C.y, at: ENTER, click: true}, // hit enter
];

// timeline rows — VIDEO/MUSIC present from the start; CAPTIONS/GRAPHICS added by the AI after enter.
const ROWS = [
  {label: 'VIDEO', color: '#A855F7', clips: [[0, 62], [64, 100]], at: 0},
  {label: 'MUSIC', color: '#10B981', clips: [[0, 100]], at: 0},
  {label: 'CAPTIONS', color: '#F97316', clips: [[6, 26], [30, 52], [60, 92]], at: ENTER + 14},
  {label: 'GRAPHICS', color: '#F59E0B', clips: [[10, 24], [70, 86]], at: ENTER + 30},
];
const PILLS = [
  {t: 'add_captions', at: ENTER + 14},
  {t: 'sync_to_beat_drops', at: ENTER + 28},
  {t: 'color_grade', at: ENTER + 42},
  {t: 'render_preview', at: ENTER + 56, running: true},
];

export const EDITRON_SFX: SfxCue[] = [
  {name: 'riser', at: 50, volume: 0.3}, // gentle swell as the camera dives into the chat bar (was a whoosh)
  {name: 'click', at: ENTER, volume: 0.7},
  {name: 'impact', at: ENTER, volume: 0.55},
  {name: 'tick', at: ENTER + 14, volume: 0.4},
  {name: 'tick', at: ENTER + 28, volume: 0.4},
  {name: 'tick', at: ENTER + 42, volume: 0.4},
  {name: 'riser', at: ENTER + 50, volume: 0.4},
  {name: 'success', at: ENTER + 72, volume: 0.55},
];

const RESULT_LINES = ['Chat to edit,', 'days of edit', 'done in minutes'];

export const EditronScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = useTypewriter(PROMPT, 56, 56);
  const playhead = 18 + ((frame / 3) % 60);
  const grade = interpolate(frame, [ENTER + 30, ENTER + 50], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const ready = frame >= ENTER + 72;
  const renderLabel = frame < ENTER + 4 ? 'Render' : frame < ENTER + 72 ? 'Rendering…' : '✓ Ready';

  const cam = useCursorZoomCamera(CURSOR_POINTS, {zoom: 1.5, zoomInStart: 50, zoomInEnd: 64, releaseAt: 120, releaseEnd: 166});
  const boom = interpolate(frame, [ENTER, ENTER + 3, ENTER + 18], [0, 0.5, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // preview: "Q4 — Launch" → the result line (after enter)
  const launchOp = interpolate(frame, [ENTER + 8, ENTER + 24], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const resultIn = interpolate(frame, [ENTER + 18, ENTER + 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});

  const sent = frame >= ENTER; // input clears, prompt sent

  return (
    <StudioStage tint="rgba(212,106,92,0.07)">
      <div style={{position: 'absolute', inset: 0, ...cam}}>
        <div style={{position: 'absolute', left: WIN_L, top: WIN_T, width: WIN_W, height: WIN_H, background: theme.colors.raised, border: `1px solid ${theme.colors.borderEmph}`, borderRadius: 18, boxShadow: '0 40px 120px rgba(0,0,0,0.6)', overflow: 'hidden', fontFamily: sans, display: 'flex', flexDirection: 'column'}}>
          {/* top bar */}
          <div style={{height: TOPBAR, flexShrink: 0, background: theme.colors.canvas, borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16}}>
            <div style={{display: 'flex', gap: 8}}>
              {[theme.colors.danger, theme.colors.gold, theme.colors.success].map((c) => <div key={c} style={{width: 11, height: 11, borderRadius: 6, background: c, opacity: 0.85}} />)}
            </div>
            <span style={{fontFamily: sans, fontSize: 16, fontWeight: 600, color: theme.colors.textPrimary, marginLeft: 8}}>Q4 product launch — teaser</span>
            <div style={{flex: 1}} />
            <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 9, background: ready ? theme.colors.success : theme.colors.gold, color: theme.colors.canvas, fontFamily: sans, fontWeight: 800, fontSize: 15}}>{renderLabel}</div>
          </div>

          <div style={{flex: 1, display: 'flex', minHeight: 0}}>
            {/* center: preview + transport + timeline */}
            <div style={{flex: 1, display: 'flex', flexDirection: 'column', padding: 22, gap: 16, minWidth: 0}}>
              <div style={{flex: 1, borderRadius: 12, background: '#161618', border: `1px solid ${theme.colors.borderEmph}`, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <div style={{position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '18px 18px'}} />
                <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 70% at 50% 45%, rgba(212,166,82,0.12), transparent 70%)', opacity: grade}} />
                {/* Q4 — Launch (before) */}
                <div style={{position: 'absolute', opacity: launchOp, textAlign: 'center'}}>
                  <div style={{fontFamily: mono, fontSize: 13, letterSpacing: '0.32em', color: theme.colors.textMuted, marginBottom: 14}}>PREVIEW</div>
                  <div style={{fontFamily: sans, fontWeight: 800, fontSize: 78, letterSpacing: '-0.03em', backgroundImage: theme.wordmarkGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Q4 — Launch</div>
                </div>
                {/* the RESULT (after enter) — the line itself */}
                {resultIn > 0.01 && (
                  <div style={{position: 'absolute', textAlign: 'center', opacity: resultIn, transform: `scale(${interpolate(resultIn, [0, 1], [0.92, 1])})`}}>
                    {RESULT_LINES.map((l, i) => (
                      <div key={l} style={{fontFamily: sans, fontWeight: 800, fontSize: 58, lineHeight: 1.08, letterSpacing: '-0.02em', backgroundImage: theme.wordmarkGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', opacity: interpolate(frame, [ENTER + 18 + i * 7, ENTER + 34 + i * 7], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>{l}</div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                <div style={{width: 34, height: 34, borderRadius: 8, background: theme.colors.well, border: `1px solid ${theme.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.textPrimary, fontSize: 13}}>▶</div>
                <span style={{fontFamily: mono, fontSize: 13, color: theme.colors.textMuted}}>00:08 / 00:30</span>
                <div style={{flex: 1}} />
                <span style={{fontFamily: mono, fontSize: 12, color: theme.colors.textMuted, padding: '5px 10px', background: theme.colors.well, borderRadius: 6}}>16:9</span>
              </div>

              <div style={{background: theme.colors.canvas, border: `1px solid ${theme.colors.border}`, borderRadius: 12, padding: 16, position: 'relative'}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                  {ROWS.map((row) => {
                    const rowOp = interpolate(frame, [row.at, row.at + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
                    return (
                      <div key={row.label} style={{display: 'flex', alignItems: 'center', gap: 14, opacity: rowOp}}>
                        <div style={{width: 84, fontFamily: mono, fontSize: 11, color: theme.colors.textDim, letterSpacing: '0.12em'}}>{row.label}</div>
                        <div style={{position: 'relative', flex: 1, height: 28}}>
                          {row.clips.map(([a, b], i) => {
                            const cIn = interpolate(frame, [row.at + i * 3, row.at + 12 + i * 3], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
                            return <div key={i} style={{position: 'absolute', left: `${a}%`, width: `${(b - a) * cIn}%`, top: 0, bottom: 0, borderRadius: 5, background: `${row.color}26`, border: `1px solid ${row.color}66`, opacity: cIn}} />;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{position: 'absolute', top: 10, bottom: 10, left: `calc(98px + ${playhead}% * 0.85)`, width: 2, background: theme.colors.gold, boxShadow: `0 0 8px ${theme.colors.gold}aa`}} />
              </div>
            </div>

            {/* right: AI chat */}
            <div style={{width: 392, flexShrink: 0, borderLeft: `1px solid ${theme.colors.border}`, background: theme.colors.canvas, display: 'flex', flexDirection: 'column', padding: 22}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18}}>
                <div style={{width: 8, height: 8, borderRadius: 4, background: theme.colors.success, boxShadow: `0 0 8px ${theme.colors.success}`}} />
                <span style={{fontFamily: mono, fontSize: 12, color: theme.colors.textMuted, letterSpacing: '0.2em', textTransform: 'uppercase'}}>AI Editor</span>
              </div>
              {/* sent prompt bubble (after enter) */}
              {sent && (
                <div style={{alignSelf: 'flex-end', maxWidth: '92%', padding: '12px 15px', borderRadius: '14px 14px 5px 14px', background: theme.colors.gold, color: theme.colors.canvas, fontFamily: sans, fontWeight: 500, fontSize: 15, lineHeight: 1.4, marginBottom: 16, opacity: interpolate(frame, [ENTER, ENTER + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>{PROMPT}</div>
              )}
              {/* pills stream */}
              <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                {PILLS.map((pill) => {
                  if (frame < pill.at) return null;
                  const enter = interpolate(frame, [pill.at, pill.at + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
                  const done = !pill.running;
                  return (
                    <div key={pill.t} style={{opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [12, 0])}px)`, display: 'flex', alignItems: 'center', gap: 11, padding: '12px 15px', borderRadius: 10, background: theme.colors.raised, border: `1px solid ${done ? theme.colors.border : 'rgba(212,166,82,0.35)'}`}}>
                      <span style={{color: done ? theme.colors.success : theme.colors.gold, fontSize: 15, fontWeight: 800}}>{done ? '✓' : '⟳'}</span>
                      <span style={{fontFamily: mono, fontSize: 14, color: done ? theme.colors.textSecondary : theme.colors.textPrimary}}>{pill.t}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{flex: 1}} />
              {/* the chat input — the typing target */}
              <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 11, background: theme.colors.well, border: `1px solid ${sent ? theme.colors.border : theme.colors.gold}`}}>
                <span style={{fontFamily: sans, fontSize: 15, color: sent ? theme.colors.textDim : theme.colors.textPrimary, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden'}}>
                  {sent ? 'Ask AI to edit your video…' : typed || 'Ask AI to edit your video…'}
                  {!sent && typed.length < PROMPT.length && <span style={{opacity: (frame % 16) < 8 ? 1 : 0}}>|</span>}
                </span>
                <div style={{width: 30, height: 30, borderRadius: 7, background: theme.colors.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.canvas, fontSize: 15, transform: `scale(${frame >= ENTER && frame < ENTER + 8 ? 0.92 : 1})`}}>↑</div>
              </div>
            </div>
          </div>
        </div>

        <Cursor points={CURSOR_POINTS} />
      </div>
      {boom > 0.001 && <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at ${SEND_C.x}px ${SEND_C.y}px, rgba(212,166,82,${boom}), transparent 26%)`}} />}
    </StudioStage>
  );
};
