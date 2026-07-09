import {useCurrentFrame} from 'remotion';
import {BEAT} from './timing';

// Deterministic beat driver from the 136 BPM grid. Because every scene starts on a beat,
// the sequence-local frame stays phase-aligned to the global beat — so these pulses fire on
// the music without needing to sample the waveform (that's done in Background for ambient energy).
export const useBeatGrid = (): {phase: number; pulse: number; downbeat: number} => {
  const frame = useCurrentFrame();
  const phase = (frame % BEAT) / BEAT; // 0..1 within a beat
  const pulse = Math.pow(1 - phase, 2.2); // sharp decay each beat
  const barPhase = (frame % (BEAT * 4)) / (BEAT * 4);
  const downbeat = Math.pow(1 - barPhase, 3); // bigger hit each bar (downbeat)
  return {phase, pulse, downbeat};
};
