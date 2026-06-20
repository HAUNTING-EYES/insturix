"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { DAWProject, DAWRegion, AutomationPoint, AutomationParam, MIDINote, MIDIRegion, SynthPatch } from "@/lib/musitron/daw-types";
import { createDefaultTrack, createMIDIRegion } from "@/lib/musitron/daw-types";

interface TransportState {
  playing: boolean;
  recording: boolean;
  position: number;
  seekVersion: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
}

interface DAWState {
  project: DAWProject | null;
  transport: TransportState;
  selectedTrackId: string | null;
  selectedRegionId: string | null;
  undoPast: DAWProject[];
  undoFuture: DAWProject[];
  _coalesceKey: string;
  snapEnabled: boolean;
  zoom: number;
  scrollX: number;
}

type DAWAction =
  | { type: "LOAD_PROJECT"; project: DAWProject }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "STOP" }
  | { type: "SEEK"; position: number }
  | { type: "TICK"; position: number }
  | { type: "SET_BPM"; bpm: number }
  | { type: "TOGGLE_LOOP" }
  | { type: "SET_ZOOM"; zoom: number }
  | { type: "SET_SCROLL_X"; scrollX: number }
  | { type: "SELECT_TRACK"; trackId: string | null }
  | { type: "ADD_TRACK"; name?: string }
  | { type: "REMOVE_TRACK"; trackId: string }
  | { type: "TOGGLE_MUTE"; trackId: string }
  | { type: "TOGGLE_SOLO"; trackId: string }
  | { type: "SET_TRACK_GAIN"; trackId: string; gain: number }
  | { type: "SET_TRACK_PAN"; trackId: string; pan: number }
  | { type: "ADD_REGION"; trackId: string; region: DAWRegion }
  | { type: "REMOVE_REGION"; trackId: string; regionId: string }
  | { type: "MOVE_REGION"; trackId: string; regionId: string; startTime: number }
  | { type: "TRIM_REGION"; trackId: string; regionId: string; startTime: number; sourceOffset: number; duration: number }
  | { type: "SPLIT_REGION"; trackId: string; regionId: string; splitTime: number }
  | { type: "SELECT_REGION"; regionId: string | null }
  | { type: "SET_MASTER_GAIN"; gain: number }
  | { type: "ADD_AUTOMATION_LANE"; trackId: string; param: AutomationParam }
  | { type: "REMOVE_AUTOMATION_LANE"; trackId: string; laneId: string }
  | { type: "TOGGLE_AUTOMATION_LANE"; trackId: string; laneId: string }
  | { type: "ADD_AUTOMATION_POINT"; trackId: string; laneId: string; point: AutomationPoint }
  | { type: "MOVE_AUTOMATION_POINT"; trackId: string; laneId: string; pointId: string; time: number; value: number }
  | { type: "REMOVE_AUTOMATION_POINT"; trackId: string; laneId: string; pointId: string }
  | { type: "TOGGLE_SNAP" }
  | { type: "SET_LOOP_REGION"; start: number; end: number }
  | { type: "DUPLICATE_REGION"; trackId: string; regionId: string }
  | { type: "ADD_EFFECT"; trackId: string; effect: import("@/lib/musitron/daw-types").TrackEffect }
  | { type: "REMOVE_EFFECT"; trackId: string; effectId: string }
  | { type: "UPDATE_EFFECT_PARAM"; trackId: string; effectId: string; param: string; value: number }
  | { type: "TOGGLE_EFFECT_BYPASS"; trackId: string; effectId: string }
  | { type: "ADD_MIDI_TRACK"; name?: string }
  | { type: "ADD_MIDI_REGION"; trackId: string; region: MIDIRegion }
  | { type: "REMOVE_MIDI_REGION"; trackId: string; regionId: string }
  | { type: "ADD_MIDI_NOTE"; trackId: string; regionId: string; note: MIDINote }
  | { type: "REMOVE_MIDI_NOTE"; trackId: string; regionId: string; noteId: string }
  | { type: "MOVE_MIDI_NOTE"; trackId: string; regionId: string; noteId: string; pitch: number; startBeat: number }
  | { type: "RESIZE_MIDI_NOTE"; trackId: string; regionId: string; noteId: string; durationBeats: number }
  | { type: "SET_SYNTH_PATCH"; trackId: string; patch: SynthPatch }
  | { type: "UNDO" }
  | { type: "REDO" };

interface DAWContextValue {
  state: DAWState;
  dispatch: React.Dispatch<DAWAction>;
  positionRef: React.RefObject<number>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (position: number) => void;
  addTrack: (name?: string) => void;
  removeTrack: (trackId: string) => void;
  toggleMute: (trackId: string) => void;
  toggleSolo: (trackId: string) => void;
  selectTrack: (trackId: string | null) => void;
  setZoom: (zoom: number) => void;
  setBPM: (bpm: number) => void;
  addRegionToTrack: (trackId: string, region: DAWRegion) => void;
  toggleSnap: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function snapToGrid(time: number, bpm: number): number {
  const beatSec = 60 / bpm;
  return Math.round(time / beatSec) * beatSec;
}

const initialTransport: TransportState = {
  playing: false,
  recording: false,
  position: 0,
  seekVersion: 0,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0,
};

const initialState: DAWState = {
  project: null,
  transport: initialTransport,
  selectedTrackId: null,
  selectedRegionId: null,
  undoPast: [],
  undoFuture: [],
  _coalesceKey: "",
  snapEnabled: true,
  zoom: 50,
  scrollX: 0,
};

const MAX_HISTORY = 50;

const HISTORY_ACTIONS: ReadonlySet<string> = new Set([
  "SET_BPM", "ADD_TRACK", "REMOVE_TRACK", "TOGGLE_MUTE", "TOGGLE_SOLO",
  "SET_TRACK_GAIN", "SET_TRACK_PAN", "ADD_REGION", "REMOVE_REGION",
  "MOVE_REGION", "TRIM_REGION", "SPLIT_REGION", "SET_MASTER_GAIN",
  "ADD_AUTOMATION_LANE", "REMOVE_AUTOMATION_LANE",
  "ADD_AUTOMATION_POINT", "MOVE_AUTOMATION_POINT", "REMOVE_AUTOMATION_POINT",
  "DUPLICATE_REGION",
  "ADD_EFFECT", "REMOVE_EFFECT", "UPDATE_EFFECT_PARAM", "TOGGLE_EFFECT_BYPASS",
  "ADD_MIDI_TRACK", "ADD_MIDI_REGION", "REMOVE_MIDI_REGION",
  "ADD_MIDI_NOTE", "REMOVE_MIDI_NOTE", "MOVE_MIDI_NOTE", "RESIZE_MIDI_NOTE",
  "SET_SYNTH_PATCH",
]);

function coalesceKey(action: DAWAction): string {
  if (action.type === "MOVE_REGION" || action.type === "TRIM_REGION") {
    return `${action.type}:${action.regionId}`;
  }
  if (action.type === "MOVE_AUTOMATION_POINT") {
    return `${action.type}:${action.laneId}:${action.pointId}`;
  }
  if (action.type === "UPDATE_EFFECT_PARAM") {
    return `${action.type}:${action.effectId}:${action.param}`;
  }
  if (action.type === "MOVE_MIDI_NOTE") {
    return `${action.type}:${action.regionId}:${action.noteId}`;
  }
  if (action.type === "RESIZE_MIDI_NOTE") {
    return `${action.type}:${action.regionId}:${action.noteId}`;
  }
  return "";
}

function coreReducer(state: DAWState, action: DAWAction): DAWState {
  switch (action.type) {
    case "LOAD_PROJECT":
      return {
        ...state,
        project: action.project,
        transport: initialTransport,
        selectedTrackId: action.project.tracks[0]?.id ?? null,
        selectedRegionId: null,
      };

    case "PLAY":
      return { ...state, transport: { ...state.transport, playing: true } };

    case "PAUSE":
      return { ...state, transport: { ...state.transport, playing: false } };

    case "STOP":
      return { ...state, transport: { ...state.transport, playing: false, position: 0, seekVersion: state.transport.seekVersion + 1 } };

    case "SEEK":
      return { ...state, transport: { ...state.transport, position: Math.max(0, action.position), seekVersion: state.transport.seekVersion + 1 } };

    case "TICK":
      if (!state.transport.playing) return state;
      return { ...state, transport: { ...state.transport, position: action.position } };

    case "SET_BPM": {
      if (!state.project) return state;
      return { ...state, project: { ...state.project, bpm: action.bpm } };
    }

    case "TOGGLE_LOOP":
      return { ...state, transport: { ...state.transport, loopEnabled: !state.transport.loopEnabled } };

    case "SET_ZOOM":
      return { ...state, zoom: Math.max(10, Math.min(500, action.zoom)) };

    case "SET_SCROLL_X":
      return { ...state, scrollX: Math.max(0, action.scrollX) };

    case "SELECT_TRACK":
      return { ...state, selectedTrackId: action.trackId };

    case "ADD_TRACK": {
      if (!state.project) return state;
      const count = state.project.tracks.length;
      const track = createDefaultTrack(`track-${Date.now()}`, action.name || `Track ${count + 1}`, count);
      return {
        ...state,
        project: { ...state.project, tracks: [...state.project.tracks, track], updatedAt: new Date() },
        selectedTrackId: track.id,
      };
    }

    case "REMOVE_TRACK": {
      if (!state.project || state.project.tracks.length <= 1) return state;
      const remaining = state.project.tracks
        .filter((t) => t.id !== action.trackId)
        .map((t, i) => ({ ...t, order: i }));
      return {
        ...state,
        project: { ...state.project, tracks: remaining, updatedAt: new Date() },
        selectedTrackId: state.selectedTrackId === action.trackId ? remaining[0]?.id ?? null : state.selectedTrackId,
      };
    }

    case "TOGGLE_MUTE": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId ? { ...t, mixer: { ...t.mixer, mute: !t.mixer.mute } } : t
          ),
        },
      };
    }

    case "TOGGLE_SOLO": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId ? { ...t, mixer: { ...t.mixer, solo: !t.mixer.solo } } : t
          ),
        },
      };
    }

    case "SET_TRACK_GAIN": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId ? { ...t, mixer: { ...t.mixer, gain: action.gain } } : t
          ),
        },
      };
    }

    case "SET_TRACK_PAN": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId ? { ...t, mixer: { ...t.mixer, pan: action.pan } } : t
          ),
        },
      };
    }

    case "ADD_REGION": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId ? { ...t, regions: [...t.regions, action.region] } : t
          ),
        },
      };
    }

    case "REMOVE_REGION": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId ? { ...t, regions: t.regions.filter((r) => r.id !== action.regionId) } : t
          ),
        },
      };
    }

    case "MOVE_REGION": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  regions: t.regions.map((r) =>
                    r.id === action.regionId ? { ...r, startTime: Math.max(0, action.startTime) } : r
                  ),
                }
              : t
          ),
        },
      };
    }

    case "TRIM_REGION": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  regions: t.regions.map((r) =>
                    r.id === action.regionId
                      ? {
                          ...r,
                          startTime: Math.max(0, action.startTime),
                          sourceOffset: Math.max(0, action.sourceOffset),
                          duration: Math.max(0.01, action.duration),
                        }
                      : r
                  ),
                }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "SPLIT_REGION": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) => {
            if (t.id !== action.trackId) return t;
            const region = t.regions.find((r) => r.id === action.regionId);
            if (!region) return t;

            const splitOffset = action.splitTime - region.startTime;
            if (splitOffset <= 0.01 || splitOffset >= region.duration - 0.01) return t;

            const left: DAWRegion = {
              ...region,
              duration: splitOffset,
            };
            const right: DAWRegion = {
              ...region,
              id: `region-${Date.now()}`,
              name: `${region.name} (R)`,
              startTime: action.splitTime,
              sourceOffset: region.sourceOffset + splitOffset,
              duration: region.duration - splitOffset,
            };

            return {
              ...t,
              regions: t.regions.flatMap((r) => (r.id === action.regionId ? [left, right] : [r])),
            };
          }),
          updatedAt: new Date(),
        },
      };
    }

    case "SELECT_REGION":
      return { ...state, selectedRegionId: action.regionId };

    case "SET_MASTER_GAIN": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          masterBus: { ...state.project.masterBus, gain: action.gain },
        },
      };
    }

    case "ADD_AUTOMATION_LANE": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) => {
            if (t.id !== action.trackId) return t;
            if (t.automationLanes.some((l) => l.param === action.param)) return t;
            return {
              ...t,
              automationLanes: [
                ...t.automationLanes,
                { id: `auto-${Date.now()}`, param: action.param, points: [], visible: true },
              ],
            };
          }),
          updatedAt: new Date(),
        },
      };
    }

    case "REMOVE_AUTOMATION_LANE": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? { ...t, automationLanes: t.automationLanes.filter((l) => l.id !== action.laneId) }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "TOGGLE_AUTOMATION_LANE": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  automationLanes: t.automationLanes.map((l) =>
                    l.id === action.laneId ? { ...l, visible: !l.visible } : l
                  ),
                }
              : t
          ),
        },
      };
    }

    case "ADD_AUTOMATION_POINT": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  automationLanes: t.automationLanes.map((l) =>
                    l.id === action.laneId
                      ? { ...l, points: [...l.points, action.point].sort((a, b) => a.time - b.time) }
                      : l
                  ),
                }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "MOVE_AUTOMATION_POINT": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  automationLanes: t.automationLanes.map((l) =>
                    l.id === action.laneId
                      ? {
                          ...l,
                          points: l.points
                            .map((p) =>
                              p.id === action.pointId
                                ? { ...p, time: Math.max(0, action.time), value: action.value }
                                : p
                            )
                            .sort((a, b) => a.time - b.time),
                        }
                      : l
                  ),
                }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "REMOVE_AUTOMATION_POINT": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  automationLanes: t.automationLanes.map((l) =>
                    l.id === action.laneId
                      ? { ...l, points: l.points.filter((p) => p.id !== action.pointId) }
                      : l
                  ),
                }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "TOGGLE_SNAP":
      return { ...state, snapEnabled: !state.snapEnabled };

    case "SET_LOOP_REGION": {
      const s = Math.max(0, Math.min(action.start, action.end));
      const e = Math.max(action.start, action.end);
      return { ...state, transport: { ...state.transport, loopStart: s, loopEnd: e } };
    }

    case "DUPLICATE_REGION": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) => {
            if (t.id !== action.trackId) return t;
            const region = t.regions.find((r) => r.id === action.regionId);
            if (!region) return t;
            const dup: DAWRegion = {
              ...region,
              id: `region-${Date.now()}`,
              name: `${region.name} (copy)`,
              startTime: region.startTime + region.duration,
            };
            return { ...t, regions: [...t.regions, dup] };
          }),
          updatedAt: new Date(),
        },
      };
    }

    case "ADD_EFFECT": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? { ...t, effects: [...t.effects, action.effect] }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "REMOVE_EFFECT": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? { ...t, effects: t.effects.filter((fx) => fx.id !== action.effectId) }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "UPDATE_EFFECT_PARAM": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  effects: t.effects.map((fx) =>
                    fx.id === action.effectId
                      ? { ...fx, params: { ...fx.params, [action.param]: action.value } }
                      : fx
                  ),
                }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "TOGGLE_EFFECT_BYPASS": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  effects: t.effects.map((fx) =>
                    fx.id === action.effectId ? { ...fx, bypassed: !fx.bypassed } : fx
                  ),
                }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "ADD_MIDI_TRACK": {
      if (!state.project) return state;
      const order = state.project.tracks.length;
      const bpm = state.project.bpm ?? 120;
      const barsCount = 8;
      const regionDuration = (barsCount * 4 * 60) / bpm;
      const defaultRegion = createMIDIRegion("Pattern 1", 0, regionDuration);
      const newTrack = {
        ...createDefaultTrack(
          `track-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          action.name ?? `MIDI ${order + 1}`,
          order,
          "midi"
        ),
        midiRegions: [defaultRegion],
      };
      return {
        ...state,
        project: {
          ...state.project,
          tracks: [...state.project.tracks, newTrack],
          updatedAt: new Date(),
        },
        selectedTrackId: newTrack.id,
      };
    }

    case "ADD_MIDI_REGION": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? { ...t, midiRegions: [...t.midiRegions, action.region] }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "REMOVE_MIDI_REGION": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? { ...t, midiRegions: t.midiRegions.filter((r) => r.id !== action.regionId) }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "ADD_MIDI_NOTE": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  midiRegions: t.midiRegions.map((r) =>
                    r.id === action.regionId
                      ? { ...r, notes: [...r.notes, action.note] }
                      : r
                  ),
                }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "REMOVE_MIDI_NOTE": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  midiRegions: t.midiRegions.map((r) =>
                    r.id === action.regionId
                      ? { ...r, notes: r.notes.filter((n) => n.id !== action.noteId) }
                      : r
                  ),
                }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "MOVE_MIDI_NOTE": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  midiRegions: t.midiRegions.map((r) =>
                    r.id === action.regionId
                      ? {
                          ...r,
                          notes: r.notes.map((n) =>
                            n.id === action.noteId
                              ? { ...n, pitch: Math.max(0, Math.min(127, action.pitch)), startBeat: Math.max(0, action.startBeat) }
                              : n
                          ),
                        }
                      : r
                  ),
                }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "RESIZE_MIDI_NOTE": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  midiRegions: t.midiRegions.map((r) =>
                    r.id === action.regionId
                      ? {
                          ...r,
                          notes: r.notes.map((n) =>
                            n.id === action.noteId
                              ? { ...n, durationBeats: Math.max(0.125, action.durationBeats) }
                              : n
                          ),
                        }
                      : r
                  ),
                }
              : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    case "SET_SYNTH_PATCH": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          tracks: state.project.tracks.map((t) =>
            t.id === action.trackId ? { ...t, synthPatch: action.patch } : t
          ),
          updatedAt: new Date(),
        },
      };
    }

    default:
      return state;
  }
}

function dawReducer(state: DAWState, action: DAWAction): DAWState {
  if (action.type === "UNDO") {
    if (state.undoPast.length === 0 || !state.project) return state;
    const prev = state.undoPast[state.undoPast.length - 1];
    return {
      ...state,
      project: prev,
      undoPast: state.undoPast.slice(0, -1),
      undoFuture: [state.project, ...state.undoFuture],
      _coalesceKey: "",
    };
  }

  if (action.type === "REDO") {
    if (state.undoFuture.length === 0 || !state.project) return state;
    const nxt = state.undoFuture[0];
    return {
      ...state,
      project: nxt,
      undoPast: [...state.undoPast, state.project],
      undoFuture: state.undoFuture.slice(1),
      _coalesceKey: "",
    };
  }

  const result = coreReducer(state, action);

  if (action.type === "LOAD_PROJECT") {
    return { ...result, undoPast: [], undoFuture: [], _coalesceKey: "" };
  }

  if (action.type === "SELECT_REGION" && state._coalesceKey) {
    return { ...result, _coalesceKey: "" };
  }

  if (HISTORY_ACTIONS.has(action.type) && state.project && result.project && result.project !== state.project) {
    const key = coalesceKey(action);
    if (key && state._coalesceKey === key) {
      return { ...result, undoFuture: [] };
    }
    const past = [...state.undoPast, state.project];
    return {
      ...result,
      undoPast: past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past,
      undoFuture: [],
      _coalesceKey: key,
    };
  }

  return result;
}

const DAWCtx = createContext<DAWContextValue | null>(null);

export function DAWProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(dawReducer, initialState);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const startPosRef = useRef<number>(0);
  const positionRef = useRef<number>(0);
  const loopRef = useRef({ enabled: false, start: 0, end: 0 });

  useEffect(() => {
    loopRef.current = {
      enabled: state.transport.loopEnabled,
      start: state.transport.loopStart,
      end: state.transport.loopEnd,
    };
  }, [state.transport.loopEnabled, state.transport.loopStart, state.transport.loopEnd]);

  useEffect(() => {
    if (!state.transport.playing) return;

    startTimeRef.current = performance.now();
    startPosRef.current = positionRef.current;

    const tick = () => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      let pos = startPosRef.current + elapsed;
      const loop = loopRef.current;
      if (loop.enabled && loop.end > loop.start && pos >= loop.end) {
        const loopLen = loop.end - loop.start;
        pos = loop.start + ((pos - loop.start) % loopLen);
        startTimeRef.current = performance.now();
        startPosRef.current = pos;
      }
      positionRef.current = pos;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const intervalId = setInterval(() => {
      dispatch({ type: "TICK", position: positionRef.current });
    }, 200);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(intervalId);
    };
  }, [state.transport.playing]);

  useEffect(() => {
    if (!state.transport.playing) {
      positionRef.current = state.transport.position;
    }
  }, [state.transport.position, state.transport.playing]);

  useEffect(() => {
    positionRef.current = state.transport.position;
    if (state.transport.playing) {
      startTimeRef.current = performance.now();
      startPosRef.current = state.transport.position;
    }
  }, [state.transport.seekVersion]);

  const play = useCallback(() => dispatch({ type: "PLAY" }), []);
  const pause = useCallback(() => dispatch({ type: "PAUSE" }), []);
  const stop = useCallback(() => dispatch({ type: "STOP" }), []);
  const seek = useCallback((p: number) => dispatch({ type: "SEEK", position: p }), []);
  const addTrack = useCallback((n?: string) => dispatch({ type: "ADD_TRACK", name: n }), []);
  const removeTrack = useCallback((id: string) => dispatch({ type: "REMOVE_TRACK", trackId: id }), []);
  const toggleMute = useCallback((id: string) => dispatch({ type: "TOGGLE_MUTE", trackId: id }), []);
  const toggleSolo = useCallback((id: string) => dispatch({ type: "TOGGLE_SOLO", trackId: id }), []);
  const selectTrack = useCallback((id: string | null) => dispatch({ type: "SELECT_TRACK", trackId: id }), []);
  const setZoom = useCallback((z: number) => dispatch({ type: "SET_ZOOM", zoom: z }), []);
  const setBPM = useCallback((b: number) => dispatch({ type: "SET_BPM", bpm: b }), []);
  const addRegionToTrack = useCallback(
    (trackId: string, region: DAWRegion) => dispatch({ type: "ADD_REGION", trackId, region }),
    []
  );
  const toggleSnap = useCallback(() => dispatch({ type: "TOGGLE_SNAP" }), []);
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const canUndo = state.undoPast.length > 0;
  const canRedo = state.undoFuture.length > 0;

  const ctxValue = useMemo(() => ({
    state,
    dispatch,
    positionRef,
    play,
    pause,
    stop,
    seek,
    addTrack,
    removeTrack,
    toggleMute,
    toggleSolo,
    selectTrack,
    setZoom,
    setBPM,
    addRegionToTrack,
    toggleSnap,
    undo,
    redo,
    canUndo,
    canRedo,
  }), [state, canUndo, canRedo, positionRef, play, pause, stop, seek, addTrack, removeTrack, toggleMute, toggleSolo, selectTrack, setZoom, setBPM, addRegionToTrack, toggleSnap, undo, redo]);

  return (
    <DAWCtx.Provider value={ctxValue}>
      {children}
    </DAWCtx.Provider>
  );
}

export function useDAW(): DAWContextValue {
  const ctx = useContext(DAWCtx);
  if (!ctx) throw new Error("useDAW must be used within a DAWProvider");
  return ctx;
}
