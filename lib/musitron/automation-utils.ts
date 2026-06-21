import type { AutomationPoint, AutomationLane, DAWTrack } from "./daw-types";

export function interpolateValue(points: AutomationPoint[], time: number, defaultValue: number): number {
  if (points.length === 0) return defaultValue;
  if (points.length === 1) return points[0].value;

  const sorted = [...points].sort((a, b) => a.time - b.time);

  if (time <= sorted[0].time) return sorted[0].value;
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (time >= a.time && time <= b.time) {
      const dt = b.time - a.time;
      if (dt === 0) return a.value;
      const t = (time - a.time) / dt;
      return a.value + (b.value - a.value) * t;
    }
  }

  return defaultValue;
}

export function getTrackAutomationValues(
  track: DAWTrack,
  time: number,
): { gain: number | null; pan: number | null } {
  let gain: number | null = null;
  let pan: number | null = null;

  for (const lane of track.automationLanes) {
    if (lane.points.length === 0) continue;
    if (lane.param === "gain") {
      gain = interpolateValue(lane.points, time, track.mixer.gain);
    } else if (lane.param === "pan") {
      pan = interpolateValue(lane.points, time, track.mixer.pan);
    }
  }

  return { gain, pan };
}

export function clampAutomationValue(param: string, value: number): number {
  if (param === "gain") return Math.max(0, Math.min(4, value));
  if (param === "pan") return Math.max(-1, Math.min(1, value));
  return value;
}

export function getDefaultForParam(param: string): number {
  if (param === "gain") return 1;
  if (param === "pan") return 0;
  return 0;
}

export function getValueRange(param: string): [number, number] {
  if (param === "gain") return [0, 4];
  if (param === "pan") return [-1, 1];
  return [0, 1];
}
