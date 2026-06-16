// UNTRACKED Remotion composition (never git add scripts/). Self-contained — no editron imports, so
// the bundle has zero heavy deps. Scales a full-frame "video" card per an inputProps scale track so a
// pull-back (1.06 -> 1.0) reads as a real zoom-OUT and the old bug (1.0 -> 1.06) reads as a zoom-IN.
import React from 'react';
import { Composition, registerRoot, useCurrentFrame, interpolate, AbsoluteFill } from 'remotion';

type Kf = { frame: number; value: number };

const ZoomDemo: React.FC<{ track: Kf[]; label: string; accent: string }> = ({ track, label, accent }) => {
  const frame = useCurrentFrame();
  const frames = track.map((k) => k.frame);
  const values = track.map((k) => k.value);
  const scale = interpolate(frame, frames, values, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dir = values[values.length - 1] < values[0] ? 'OUT (pull back)' : values[values.length - 1] > values[0] ? 'IN (push)' : 'STATIC';

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden', fontFamily: 'Arial, sans-serif' }}>
      {/* The "video" — scaled around center; overflow:hidden crops when scale>1, exactly like a real zoom. */}
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
        <AbsoluteFill style={{
          background: 'repeating-linear-gradient(0deg,#10151f,#10151f 58px,#161d2b 58px,#161d2b 60px), repeating-linear-gradient(90deg,#10151f,#10151f 58px,#161d2b 58px,#161d2b 60px)',
          justifyContent: 'center', alignItems: 'center',
        }}>
          <div style={{ width: 320, height: 320, borderRadius: '50%', border: `12px solid ${accent}`, boxShadow: `0 0 80px ${accent}66`, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ color: '#fff', fontSize: 64, fontWeight: 800 }}>SUBJECT</div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>

      {/* Fixed HUD (NOT scaled) so the reader can see the numbers + direction. */}
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 40, pointerEvents: 'none' }}>
        <div style={{ color: accent, fontSize: 40, fontWeight: 800 }}>{label}</div>
        <div style={{ color: '#fff', fontSize: 30, fontFamily: 'monospace' }}>scale {scale.toFixed(3)}  ·  {dir}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Root: React.FC = () => (
  <Composition
    id="ZoomDemo"
    component={ZoomDemo as React.FC<Record<string, unknown>>}
    durationInFrames={60}
    fps={30}
    width={1280}
    height={720}
    defaultProps={{ track: [{ frame: 0, value: 1 }, { frame: 60, value: 1 }], label: 'ZOOM', accent: '#d4af37' }}
  />
);

registerRoot(Root);
