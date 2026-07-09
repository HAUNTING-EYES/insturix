import React from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from './theme';

// "Product builds itself" toolkit — per-element motion primitives so screens animate meaningfully
// (cause→effect), not just zoom/pop. All deterministic on useCurrentFrame.
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Animate a number from `from`→`to` between [start,end] (eased). */
export const useCountUp = (to: number, start: number, end: number, from = 0): number => {
  const frame = useCurrentFrame();
  return Math.round(
    interpolate(frame, [start, end], [from, to], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE})
  );
};

/** Reveal `text` character-by-character, starting at `start`, at `cps` chars/second. */
export const useTypewriter = (text: string, start: number, cps = 26): string => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const n = Math.min(text.length, Math.max(0, Math.floor(((frame - start) / fps) * cps)));
  return text.slice(0, n);
};

/** clip-path wipe reveal between [start,end]. dir = where the reveal grows TO. */
export const useReveal = (start: number, end: number, dir: 'up' | 'down' | 'right' | 'left' = 'up'): string => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const h = (1 - p) * 100;
  if (dir === 'up') return `inset(0 0 ${h}% 0)`;
  if (dir === 'down') return `inset(${h}% 0 0 0)`;
  if (dir === 'right') return `inset(0 ${h}% 0 0)`;
  return `inset(0 0 0 ${h}%)`;
};

/** SVG path that draws itself on (stroke-dashoffset) between [start,end]. `length` = path length estimate. */
export const DrawPath: React.FC<{d: string; start: number; end: number; length?: number; stroke?: string; width?: number; fill?: string}> = ({
  d,
  start,
  end,
  length = 1000,
  stroke = theme.colors.gold,
  width = 2,
  fill = 'none',
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  return (
    <path
      d={d}
      fill={fill}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={length}
      strokeDashoffset={length * (1 - p)}
    />
  );
};

/** A subtle "camera" that trails the cursor's focus: the world eases so the active point drifts toward
 *  centre, plus a gentle push-in. Apply to a wrapper holding the UI + cursor so they move together (the
 *  camera moves; the cursor still travels relative to the UI). Lagged + ramped from neutral so the open
 *  isn't pre-panned. Keep `amount`/`zoom` subtle — this is life, not a dolly. */
export const useCursorCamera = (
  points: {x: number; y: number; at: number}[],
  opts: {amount?: number; zoom?: number; lag?: number; rampIn?: number} = {}
): React.CSSProperties => {
  const frame = useCurrentFrame();
  const {amount = 0.16, zoom = 1.06, lag = 9, rampIn = 26} = opts;
  if (!points.length) return {};
  const f = frame - lag; // camera trails the pointer
  let x = points[0].x;
  let y = points[0].y;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (f >= a.at && f <= b.at) {
      const t = interpolate(f, [a.at, b.at], [0, 1], {easing: EASE});
      x = interpolate(t, [0, 1], [a.x, b.x]);
      y = interpolate(t, [0, 1], [a.y, b.y]);
    } else if (f > b.at) {
      x = b.x;
      y = b.y;
    }
  }
  const ramp = interpolate(frame, [0, rampIn], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const tx = (960 - x) * amount * ramp;
  const ty = (540 - y) * amount * ramp;
  const z = 1 + (zoom - 1) * ramp;
  return {transform: `translate(${tx}px, ${ty}px) scale(${z})`, transformOrigin: '50% 50%', willChange: 'transform'};
};

/** Dramatic "screen-recording" camera: zoom in TIGHT on the cursor and track it as it moves, PUNCH on
 *  click ("boom"), then pull back out to reveal the result. Apply to a wrapper holding the UI + cursor.
 *  transformOrigin follows the pointer, so the world magnifies around the mouse. */
export const useCursorZoomCamera = (
  points: {x: number; y: number; at: number; click?: boolean}[],
  opts: {zoom?: number; zoomInStart?: number; zoomInEnd?: number; releaseAt?: number; releaseEnd?: number; punch?: number; lag?: number; center?: boolean} = {}
): React.CSSProperties => {
  const frame = useCurrentFrame();
  if (!points.length) return {};
  const click = points.find((p) => p.click) ?? points[points.length - 1];
  const clickAt = click.at;
  const {zoom = 1.42, punch = 0.12, lag = 4, center = true} = opts;
  const zoomInStart = opts.zoomInStart ?? points[0].at;
  const zoomInEnd = opts.zoomInEnd ?? clickAt; // reach full zoom here (snap in early, then hold tight)
  const releaseAt = opts.releaseAt ?? clickAt + 28;
  const releaseEnd = opts.releaseEnd ?? releaseAt + 26;

  // pointer position (same interp as <Cursor>), lagged so the camera trails slightly
  const f = frame - lag;
  let x = points[0].x;
  let y = points[0].y;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (f >= a.at && f <= b.at) {
      const t = interpolate(f, [a.at, b.at], [0, 1], {easing: EASE});
      x = interpolate(t, [0, 1], [a.x, b.x]);
      y = interpolate(t, [0, 1], [a.y, b.y]);
    } else if (f > b.at) {
      x = b.x;
      y = b.y;
    }
  }

  let z: number;
  if (frame <= clickAt) {
    z = interpolate(frame, [zoomInStart, zoomInEnd], [1, zoom], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  } else if (frame < releaseAt) {
    z = zoom + interpolate(frame, [clickAt, clickAt + 4, clickAt + 15], [0, punch * zoom, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}); // boom
  } else {
    z = interpolate(frame, [releaseAt, releaseEnd], [zoom, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  }
  // keep the cursor near frame-centre (a touch high) while zoomed — the world slides behind it.
  // ramp the centring with the zoom so the open/close stay neutral.
  const prog = Math.max(0, Math.min(1, (z - 1) / (zoom - 1)));
  const tx = center ? (960 - x) * prog : 0;
  const ty = center ? (480 - y) * prog : 0;
  return {transform: `translate(${tx}px, ${ty}px) scale(${z})`, transformOrigin: `${x}px ${y}px`, willChange: 'transform'};
};

/** A mock pointer that eases between waypoints and ripples on click frames. */
export type CursorPoint = {x: number; y: number; at: number; click?: boolean};
export const Cursor: React.FC<{points: CursorPoint[]; hideAfter?: number}> = ({points, hideAfter}) => {
  const frame = useCurrentFrame();
  if (hideAfter !== undefined && frame > hideAfter) return null;
  if (!points.length) return null;

  let pos = {x: points[0].x, y: points[0].y};
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (frame >= a.at && frame <= b.at) {
      const t = interpolate(frame, [a.at, b.at], [0, 1], {easing: EASE});
      pos = {x: interpolate(t, [0, 1], [a.x, b.x]), y: interpolate(t, [0, 1], [a.y, b.y])};
    } else if (frame > b.at) {
      pos = {x: b.x, y: b.y};
    }
  }

  const click = points.find((p) => p.click && frame >= p.at && frame < p.at + 16);
  const ripple = click ? interpolate(frame, [click.at, click.at + 16], [0, 1], {extrapolateRight: 'clamp'}) : 0;
  const press = click ? interpolate(frame, [click.at, click.at + 4, click.at + 10], [1, 0.86, 1], {extrapolateRight: 'clamp'}) : 1;

  return (
    <div style={{position: 'absolute', left: pos.x, top: pos.y, zIndex: 50, pointerEvents: 'none', transform: `scale(${press})`}}>
      {ripple > 0 && ripple < 1 && (
        <div
          style={{
            position: 'absolute',
            left: -2,
            top: -2,
            width: 14 + ripple * 34,
            height: 14 + ripple * 34,
            marginLeft: -(7 + ripple * 17),
            marginTop: -(7 + ripple * 17),
            borderRadius: '50%',
            border: `2px solid ${theme.colors.gold}`,
            opacity: 1 - ripple,
          }}
        />
      )}
      <svg width="26" height="26" viewBox="0 0 24 24" style={{display: 'block', marginLeft: -5, marginTop: -3, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'}}>
        <path d="M5 3l14 8-6 1.6L9.6 18z" fill="#ECE9E1" stroke="#0B0B0A" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    </div>
  );
};
