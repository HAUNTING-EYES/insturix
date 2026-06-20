import { z } from "zod";

export type TrackType = "audio" | "midi" | "bus" | "master";

export interface DAWRegion {
  id: string;
  name: string;
  sourceUrl: string;
  sourceGcsPath?: string;
  sourceTaskId?: string;
  startTime: number;
  duration: number;
  sourceOffset: number;
  sourceDuration: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  color?: string;
  locked?: boolean;
  muted?: boolean;
}

export interface TrackMixerState {
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

export type AutomationParam = "gain" | "pan";

export interface AutomationPoint {
  id: string;
  time: number;
  value: number;
}

export interface AutomationLane {
  id: string;
  param: AutomationParam;
  points: AutomationPoint[];
  visible: boolean;
}

export interface TrackEffect {
  id: string;
  type: string;
  params: Record<string, number>;
  bypassed: boolean;
  order: number;
}

export interface DAWTrack {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  mixer: TrackMixerState;
  effects: TrackEffect[];
  regions: DAWRegion[];
  midiRegions: MIDIRegion[];
  synthPatch: SynthPatch;
  automationLanes: AutomationLane[];
  order: number;
  height: number;
  armed: boolean;
}

export interface MasterBus {
  gain: number;
  effects: TrackEffect[];
}

export interface ProjectMarker {
  id: string;
  name: string;
  time: number;
  color?: string;
  type: "marker" | "loop-start" | "loop-end";
}

export interface DAWProject {
  _id?: string;
  clerkUserId: string;
  orgId?: string;
  name: string;
  bpm: number;
  timeSignature: [number, number];
  sampleRate: number;
  tracks: DAWTrack[];
  masterBus: MasterBus;
  markers: ProjectMarker[];
  duration: number;
  createdAt: Date;
  updatedAt: Date;
}

// --- MIDI types ---

export interface MIDINote {
  id: string;
  pitch: number;
  velocity: number;
  startBeat: number;
  durationBeats: number;
}

export interface MIDIRegion {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  notes: MIDINote[];
  color?: string;
  muted?: boolean;
}

export type OscWaveform = "sine" | "sawtooth" | "square" | "triangle";

export interface SynthPatch {
  id: string;
  name: string;
  osc1Wave: OscWaveform;
  osc1Detune: number;
  osc2Wave: OscWaveform;
  osc2Detune: number;
  osc2Mix: number;
  filterFreq: number;
  filterQ: number;
  envAttack: number;
  envDecay: number;
  envSustain: number;
  envRelease: number;
}

export const DEFAULT_SYNTH_PATCH: SynthPatch = {
  id: "default",
  name: "Init Patch",
  osc1Wave: "sawtooth",
  osc1Detune: 0,
  osc2Wave: "square",
  osc2Detune: -7,
  osc2Mix: 0.3,
  filterFreq: 2000,
  filterQ: 1,
  envAttack: 0.01,
  envDecay: 0.2,
  envSustain: 0.6,
  envRelease: 0.3,
};

export const SYNTH_PRESETS: SynthPatch[] = [
  { ...DEFAULT_SYNTH_PATCH },
  {
    id: "bass",
    name: "Sub Bass",
    osc1Wave: "sine",
    osc1Detune: 0,
    osc2Wave: "square",
    osc2Detune: 0,
    osc2Mix: 0.15,
    filterFreq: 400,
    filterQ: 2,
    envAttack: 0.005,
    envDecay: 0.1,
    envSustain: 0.8,
    envRelease: 0.1,
  },
  {
    id: "pad",
    name: "Soft Pad",
    osc1Wave: "sawtooth",
    osc1Detune: 5,
    osc2Wave: "sawtooth",
    osc2Detune: -5,
    osc2Mix: 0.5,
    filterFreq: 1200,
    filterQ: 0.5,
    envAttack: 0.4,
    envDecay: 0.3,
    envSustain: 0.7,
    envRelease: 1.0,
  },
  {
    id: "lead",
    name: "Square Lead",
    osc1Wave: "square",
    osc1Detune: 0,
    osc2Wave: "sawtooth",
    osc2Detune: 12,
    osc2Mix: 0.25,
    filterFreq: 3000,
    filterQ: 3,
    envAttack: 0.005,
    envDecay: 0.15,
    envSustain: 0.5,
    envRelease: 0.2,
  },
  {
    id: "pluck",
    name: "Pluck",
    osc1Wave: "triangle",
    osc1Detune: 0,
    osc2Wave: "square",
    osc2Detune: 0,
    osc2Mix: 0.4,
    filterFreq: 5000,
    filterQ: 1,
    envAttack: 0.001,
    envDecay: 0.15,
    envSustain: 0.0,
    envRelease: 0.15,
  },
];

export function midiNoteToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export function createMIDINote(pitch: number, startBeat: number, durationBeats: number, velocity = 100): MIDINote {
  return {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    pitch,
    velocity,
    startBeat,
    durationBeats,
  };
}

export function createMIDIRegion(name: string, startTime: number, duration: number): MIDIRegion {
  return {
    id: `midi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    startTime,
    duration,
    notes: [],
  };
}

// --- Effect types ---

export type EffectType = "eq" | "compressor" | "delay" | "reverb";

export const EFFECT_DEFAULTS: Record<EffectType, Record<string, number>> = {
  eq: { lowGain: 0, midGain: 0, highGain: 0 },
  compressor: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 30 },
  delay: { time: 0.3, feedback: 0.3, mix: 0.3 },
  reverb: { decay: 2, mix: 0.2 },
};

export const EFFECT_PARAM_RANGES: Record<string, [number, number]> = {
  lowGain: [-12, 12], midGain: [-12, 12], highGain: [-12, 12],
  threshold: [-100, 0], ratio: [1, 20], attack: [0, 1], release: [0, 1], knee: [0, 40],
  time: [0.01, 2], feedback: [0, 0.95], mix: [0, 1], decay: [0.1, 10],
};

export function createEffect(type: EffectType, order: number): TrackEffect {
  return {
    id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    params: { ...EFFECT_DEFAULTS[type] },
    bypassed: false,
    order,
  };
}

export const DEFAULT_MIXER_STATE: TrackMixerState = {
  gain: 1,
  pan: 0,
  mute: false,
  solo: false,
};

export const DEFAULT_MASTER_BUS: MasterBus = {
  gain: 1,
  effects: [],
};

const TRACK_COLORS = [
  "#E85D75", "#D4A652", "#4CAF50", "#42A5F5",
  "#AB47BC", "#FF7043", "#26A69A", "#5C6BC0",
] as const;

export function getTrackColor(index: number): string {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}

export function createDefaultTrack(
  id: string,
  name: string,
  order: number,
  type: TrackType = "audio"
): DAWTrack {
  return {
    id,
    name,
    type,
    color: getTrackColor(order),
    mixer: { ...DEFAULT_MIXER_STATE },
    effects: [],
    regions: [],
    midiRegions: [],
    synthPatch: { ...DEFAULT_SYNTH_PATCH },
    automationLanes: [],
    order,
    height: 80,
    armed: false,
  };
}

export function createDefaultProject(
  clerkUserId: string,
  name: string,
  orgId?: string
): Omit<DAWProject, "_id"> {
  return {
    clerkUserId,
    ...(orgId ? { orgId } : {}),
    name,
    bpm: 120,
    timeSignature: [4, 4],
    sampleRate: 44100,
    tracks: [createDefaultTrack("track-1", "Track 1", 0)],
    masterBus: { ...DEFAULT_MASTER_BUS },
    markers: [],
    duration: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// --- Zod schemas for API validation ---

const regionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceUrl: z.string(),
  sourceGcsPath: z.string().optional(),
  sourceTaskId: z.string().optional(),
  startTime: z.number().min(0),
  duration: z.number().min(0),
  sourceOffset: z.number().min(0),
  sourceDuration: z.number().min(0),
  gain: z.number().min(0).max(4),
  fadeIn: z.number().min(0),
  fadeOut: z.number().min(0),
  color: z.string().optional(),
  locked: z.boolean().optional(),
  muted: z.boolean().optional(),
});

const effectSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  params: z.record(z.string(), z.number()),
  bypassed: z.boolean(),
  order: z.number().int().min(0),
});

const mixerStateSchema = z.object({
  gain: z.number().min(0).max(4),
  pan: z.number().min(-1).max(1),
  mute: z.boolean(),
  solo: z.boolean(),
});

const automationPointSchema = z.object({
  id: z.string().min(1),
  time: z.number().min(0),
  value: z.number(),
});

const automationLaneSchema = z.object({
  id: z.string().min(1),
  param: z.enum(["gain", "pan"]),
  points: z.array(automationPointSchema),
  visible: z.boolean(),
});

const midiNoteSchema = z.object({
  id: z.string().min(1),
  pitch: z.number().int().min(0).max(127),
  velocity: z.number().int().min(0).max(127),
  startBeat: z.number().min(0),
  durationBeats: z.number().min(0),
});

const midiRegionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  startTime: z.number().min(0),
  duration: z.number().min(0),
  notes: z.array(midiNoteSchema),
  color: z.string().optional(),
  muted: z.boolean().optional(),
});

const synthPatchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  osc1Wave: z.enum(["sine", "sawtooth", "square", "triangle"]),
  osc1Detune: z.number(),
  osc2Wave: z.enum(["sine", "sawtooth", "square", "triangle"]),
  osc2Detune: z.number(),
  osc2Mix: z.number().min(0).max(1),
  filterFreq: z.number().min(20).max(20000),
  filterQ: z.number().min(0).max(30),
  envAttack: z.number().min(0).max(10),
  envDecay: z.number().min(0).max(10),
  envSustain: z.number().min(0).max(1),
  envRelease: z.number().min(0).max(10),
});

const trackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64),
  type: z.enum(["audio", "midi", "bus", "master"]),
  color: z.string(),
  mixer: mixerStateSchema,
  effects: z.array(effectSchema),
  regions: z.array(regionSchema),
  midiRegions: z.array(midiRegionSchema).optional(),
  synthPatch: synthPatchSchema.optional(),
  automationLanes: z.array(automationLaneSchema).optional(),
  order: z.number().int().min(0),
  height: z.number().int().min(40).max(300),
  armed: z.boolean(),
});

const masterBusSchema = z.object({
  gain: z.number().min(0).max(4),
  effects: z.array(effectSchema),
});

const markerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64),
  time: z.number().min(0),
  color: z.string().optional(),
  type: z.enum(["marker", "loop-start", "loop-end"]),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(128),
  bpm: z.number().min(20).max(300).optional(),
  timeSignature: z.tuple([z.number().int().min(1).max(16), z.number().int().min(1).max(16)]).optional(),
  sampleRate: z.enum(["44100", "48000", "96000"]).transform(Number).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  bpm: z.number().min(20).max(300).optional(),
  timeSignature: z.tuple([z.number().int().min(1).max(16), z.number().int().min(1).max(16)]).optional(),
  tracks: z.array(trackSchema).optional(),
  masterBus: masterBusSchema.optional(),
  markers: z.array(markerSchema).optional(),
  duration: z.number().min(0).optional(),
});
