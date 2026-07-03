import type { SignalSnapshot } from './signal-registry';

export type MomentAtomChannel =
  | 'speech'
  | 'audio'
  | 'transcript'
  | 'visual'
  | 'motion'
  | 'frame'
  | 'screen'
  | 'structure'
  | 'overlay'
  | 'brand'
  | 'system';

export type MomentAtomLevel = 'primitive' | 'derived';

export interface MomentAtom {
  channel: MomentAtomChannel;
  key: string;
  value: number | string | boolean;
  strength: number;
  source: 'signal' | 'event' | 'overlay' | 'derived' | 'brand';
  level?: MomentAtomLevel;
}

export interface MomentSignalKeySpec {
  key: string;
  channel: MomentAtomChannel;
  source?: MomentAtom['source'];
  level?: MomentAtomLevel;
}

export interface MomentRhythm {
  anchorFrame: number;
  attackFrames: number;
  holdFrames: number;
  releaseFrames: number;
  speechPeak: number;
  beatStrength: number;
  motionPulse: number;
}

export interface MomentScreenContext {
  busyness: number;
  legibilityRisk: number;
  humanAttention: number;
  visualSalience: number;
  motionPressure: number;
  negativeSpace: {
    region: 'top' | 'right' | 'bottom' | 'left' | 'none';
    strength: number;
  };
  subject?: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  motionVector: {
    x: number;
    y: number;
    magnitude: number;
  };
}

export interface MomentConstraints {
  avoidFaces: boolean;
  avoidOnScreenText: boolean;
  reduceOverlayDensity: boolean;
  preferNegativeSpace: boolean;
  preserveLegibility: boolean;
  restraint: number;
}

export interface MomentFamilyIntents {
  motionGraphic: number;
  captionEmphasis: number;
  frameMovement: number;
  transition: number;
  sfx: number;
  pacing: number;
}

export interface AtomicMomentBundle {
  version: 'moment-bundle-v1';
  frame: number;
  timestampMs: number;
  sourceFrame: number | null;
  sourceTimestampMs: number | null;
  primitiveAtoms: MomentAtom[];
  derivedAtoms: MomentAtom[];
  rhythm: MomentRhythm;
  screen: MomentScreenContext;
  constraints: MomentConstraints;
  familyIntents: MomentFamilyIntents;
  northstar: {
    sourceOfTruth: 'primitive-atoms';
    generatesLegacyPresetLabels: false;
  };
}

export interface BuildAtomicMomentBundleInput {
  frame: number;
  fps: number;
  snapshot?: SignalSnapshot | Record<string, unknown>;
  sourceFrame?: number | null;
  sourceTimestampMs?: number | null;
  eventAtoms?: MomentAtom[];
  overlayAtoms?: MomentAtom[];
}

export const MOMENT_SIGNAL_KEYS: MomentSignalKeySpec[] = [
  { key: 'speech.energy', channel: 'speech', level: 'primitive' },
  { key: 'speech.energy_delta', channel: 'speech', level: 'primitive' },
  { key: 'speech.emotion_intensity', channel: 'speech', level: 'primitive' },
  { key: 'speech.emotional_valence', channel: 'speech', level: 'primitive' },
  { key: 'speech.pitch_variability', channel: 'speech', level: 'primitive' },
  { key: 'speech.speaking_rate_wpm', channel: 'speech', level: 'primitive' },
  { key: 'speech.silence_normalized', channel: 'speech', level: 'primitive' },
  { key: 'audio.music_beat', channel: 'audio', level: 'primitive' },
  { key: 'audio.music_energy', channel: 'audio', level: 'primitive' },
  { key: 'audio.bpm', channel: 'audio', level: 'primitive' },
  { key: 'visual.significance', channel: 'visual', level: 'primitive' },
  { key: 'visual.motion_intensity', channel: 'visual', level: 'primitive' },
  { key: 'visual.motion_intensity_sustained', channel: 'visual', level: 'primitive' },
  { key: 'visual.action_type', channel: 'visual', level: 'primitive' },
  { key: 'visual.motion_type', channel: 'visual', level: 'primitive' },
  { key: 'visual.face_present', channel: 'visual', level: 'primitive' },
  { key: 'visual.face_emotion', channel: 'visual', level: 'primitive' },
  { key: 'visual.eye_contact', channel: 'visual', level: 'primitive' },
  { key: 'visual.shot_scale', channel: 'visual', level: 'primitive' },
  { key: 'visual.motion_vector.x', channel: 'visual', level: 'primitive' },
  { key: 'visual.motion_vector.y', channel: 'visual', level: 'primitive' },
  { key: 'visual.main_subject.x', channel: 'visual', level: 'primitive' },
  { key: 'visual.main_subject.y', channel: 'visual', level: 'primitive' },
  { key: 'visual.main_subject.width', channel: 'visual', level: 'primitive' },
  { key: 'visual.main_subject.height', channel: 'visual', level: 'primitive' },
  { key: 'visual.text_coverage', channel: 'screen', level: 'primitive' },
  { key: 'visual.text_box_count', channel: 'screen', level: 'primitive' },
  { key: 'visual.object_count', channel: 'visual', level: 'primitive' },
  { key: 'visual.face_count', channel: 'visual', level: 'primitive' },
  { key: 'visual.negative_space.top', channel: 'screen', level: 'primitive' },
  { key: 'visual.negative_space.right', channel: 'screen', level: 'primitive' },
  { key: 'visual.negative_space.bottom', channel: 'screen', level: 'primitive' },
  { key: 'visual.negative_space.left', channel: 'screen', level: 'primitive' },
  { key: 'visual.text_on_screen', channel: 'screen', level: 'primitive' },
  { key: 'visual.complexity', channel: 'screen', level: 'primitive' },
  { key: 'visual.perception.status', channel: 'system', level: 'primitive' },
  { key: 'visual.perception.primary_mode', channel: 'visual', level: 'primitive' },
  { key: 'visual.perception.dominant_action_type', channel: 'visual', level: 'primitive' },
  { key: 'visual.perception.dominant_motion_type', channel: 'motion', level: 'primitive' },
  { key: 'visual.perception.preferred_overlay_region', channel: 'screen', level: 'primitive' },
  { key: 'visual.perception.placement_trust', channel: 'screen', level: 'primitive' },
  { key: 'visual.perception.visual_explainability', channel: 'structure', level: 'primitive' },
  { key: 'visual.perception.subject_presence_ratio', channel: 'visual', level: 'primitive' },
  { key: 'visual.perception.face_presence_ratio', channel: 'visual', level: 'primitive' },
  { key: 'visual.perception.text_presence_ratio', channel: 'screen', level: 'primitive' },
  { key: 'visual.perception.motion_presence_ratio', channel: 'motion', level: 'primitive' },
  { key: 'visual.perception.screen_clutter_ratio', channel: 'screen', level: 'primitive' },
  { key: 'visual.perception.avg_viewer_value', channel: 'visual', level: 'primitive' },
  { key: 'visual.perception.avg_cut_eligibility', channel: 'structure', level: 'primitive' },
  { key: 'visual.perception.avg_coverage_trust', channel: 'system', level: 'primitive' },
  { key: 'visual.perception.avg_text_coverage', channel: 'screen', level: 'primitive' },
  { key: 'visual.perception.avg_object_count', channel: 'visual', level: 'primitive' },
  { key: 'visual.perception.avg_face_count', channel: 'visual', level: 'primitive' },
  { key: 'visual.perception.negative_space.top', channel: 'screen', level: 'primitive' },
  { key: 'visual.perception.negative_space.right', channel: 'screen', level: 'primitive' },
  { key: 'visual.perception.negative_space.bottom', channel: 'screen', level: 'primitive' },
  { key: 'visual.perception.negative_space.left', channel: 'screen', level: 'primitive' },
  { key: 'composite.cinematic_moment', channel: 'structure', level: 'derived' },
  { key: 'composite.narrative_pressure', channel: 'structure', level: 'derived' },
  { key: 'composite.montage_mode', channel: 'structure', level: 'derived' },
  { key: 'structural.position_in_video', channel: 'structure', level: 'derived' },
  { key: 'structural.active_overlays_count', channel: 'overlay', level: 'derived' },
  { key: 'structural.time_since_last_cut', channel: 'structure', level: 'derived' },
];

export const MOMENT_PRIMITIVE_SIGNAL_KEYS = new Set(
  MOMENT_SIGNAL_KEYS.filter((signal) => signal.level === 'primitive').map((signal) => signal.key),
);

const LEGACY_PRESET_KEYS = new Set([
  'zoomType',
  'transitionType',
  'graphicType',
  'captionStyle',
  'recipeId',
  'preset',
  'templateId',
]);

export function buildAtomicMomentBundle(input: BuildAtomicMomentBundleInput): AtomicMomentBundle {
  const primitiveAtoms = buildMomentAtomsFromSnapshot(input.snapshot)
    .filter((atom) => atom.level === 'primitive');
  const eventAtoms = (input.eventAtoms ?? []).map((atom) => ({ ...atom, level: atom.level ?? 'derived' as const }));
  const overlayAtoms = (input.overlayAtoms ?? []).map((atom) => ({ ...atom, level: atom.level ?? 'derived' as const }));
  const signal = signalReader(input.snapshot);
  const screen = buildMomentScreenContext(signal);
  const derivedAtoms = [
    ...deriveMomentAtoms(signal, screen),
    ...eventAtoms,
    ...overlayAtoms,
  ].sort(sortAtoms);
  const rhythm = buildMomentRhythm(input.frame, signal, screen);
  const constraints = buildMomentConstraints(signal, screen);
  const familyIntents = buildMomentFamilyIntents(signal, screen, rhythm, constraints);

  return {
    version: 'moment-bundle-v1',
    frame: input.frame,
    timestampMs: (input.frame / Math.max(1, input.fps)) * 1000,
    sourceFrame: input.sourceFrame ?? null,
    sourceTimestampMs: input.sourceTimestampMs ?? (input.sourceFrame == null ? null : (input.sourceFrame / Math.max(1, input.fps)) * 1000),
    primitiveAtoms: primitiveAtoms.sort(sortAtoms),
    derivedAtoms,
    rhythm,
    screen,
    constraints,
    familyIntents,
    northstar: {
      sourceOfTruth: 'primitive-atoms',
      generatesLegacyPresetLabels: false,
    },
  };
}

export function buildMomentAtomsFromSnapshot(snapshot: SignalSnapshot | Record<string, unknown> | undefined): MomentAtom[] {
  if (!snapshot) return [];
  const atoms: MomentAtom[] = [];
  for (const signal of MOMENT_SIGNAL_KEYS) {
    const value = snapshot[signal.key];
    if (!isAtomValue(value)) continue;
    atoms.push({
      channel: signal.channel,
      key: signal.key,
      value,
      strength: atomStrength(value),
      source: signal.source ?? 'signal',
      level: signal.level,
    });
  }
  return atoms.sort(sortAtoms);
}

export function bundleHasLegacyPresetLabels(bundle: AtomicMomentBundle): boolean {
  const atoms = [...bundle.primitiveAtoms, ...bundle.derivedAtoms];
  return atoms.some((atom) => LEGACY_PRESET_KEYS.has(atom.key) || LEGACY_PRESET_KEYS.has(String(atom.value)));
}

const MOMENT_BUNDLE_SIGNAL_ALIASES: Record<string, string[]> = {
  'speech.energy': ['speech_energy'],
  'speech.emotion_intensity': ['emotion_intensity', 'emotional_arousal'],
  'speech.emotional_valence': ['emotional_valence'],
  'audio.music_beat': ['beat_strength', 'music_beat'],
  'audio.music_energy': ['music_energy'],
  'visual.significance': ['visual_significance'],
  'visual.motion_intensity': ['motion_intensity'],
  'visual.motion_vector.x': ['motion_vector_x'],
  'visual.motion_vector.y': ['motion_vector_y'],
  'visual.face_present': ['face_present'],
  'visual.eye_contact': ['visual_eye_contact', 'eye_contact'],
  'visual.shot_scale': ['shot_scale'],
  'visual.main_subject.x': ['main_subject_x'],
  'visual.main_subject.y': ['main_subject_y'],
  'visual.main_subject.width': ['main_subject_width'],
  'visual.main_subject.height': ['main_subject_height'],
  'visual.text_coverage': ['text_coverage'],
  'visual.text_box_count': ['text_box_count'],
  'visual.object_count': ['object_count'],
  'visual.face_count': ['face_count'],
  'visual.text_on_screen': ['text_on_screen'],
  'visual.complexity': ['visual_complexity'],
  'composite.narrative_pressure': ['topic_shift'],
  'moment.speech_peak': ['speech_energy'],
  'moment.beat_accent': ['beat_strength'],
  'moment.visual_salience': ['visual_significance'],
  'moment.screen_busyness': ['visual_complexity'],
  'moment.human_attention': ['face_present', 'visual_eye_contact'],
  'moment.motion_pressure': ['motion_intensity'],
};

export function momentBundleToSignalMap(bundle: AtomicMomentBundle): Record<string, unknown> {
  const signals: Record<string, unknown> = {};

  for (const atom of [...bundle.primitiveAtoms, ...bundle.derivedAtoms]) {
    setBundleSignal(signals, atom.key, atom.value);
    for (const alias of MOMENT_BUNDLE_SIGNAL_ALIASES[atom.key] ?? []) {
      setBundleSignal(signals, alias, atom.value);
    }
  }

  setBundleSignal(signals, 'speech_energy', bundle.rhythm.speechPeak);
  setBundleSignal(signals, 'beat_strength', bundle.rhythm.beatStrength);
  setBundleSignal(signals, 'motion_intensity', bundle.rhythm.motionPulse);
  setBundleSignal(signals, 'visual_significance', bundle.screen.visualSalience);
  setBundleSignal(signals, 'visual_complexity', bundle.screen.busyness);
  setBundleSignal(signals, 'text_coverage', bundle.screen.legibilityRisk);
  setBundleSignal(signals, 'text_on_screen', bundle.constraints.avoidOnScreenText ? Math.max(0.5, bundle.screen.legibilityRisk) : bundle.screen.legibilityRisk);
  setBundleSignal(signals, 'face_present', bundle.constraints.avoidFaces ? Math.max(0.5, bundle.screen.humanAttention) : bundle.screen.humanAttention);
  setBundleSignal(signals, 'visual_eye_contact', bundle.screen.humanAttention);
  setBundleSignal(signals, 'motion_vector_x', bundle.screen.motionVector.x);
  setBundleSignal(signals, 'motion_vector_y', bundle.screen.motionVector.y);
  setBundleSignal(signals, 'word_importance', Math.max(bundle.familyIntents.captionEmphasis, bundle.familyIntents.motionGraphic));
  setBundleSignal(signals, 'topic_shift', bundle.familyIntents.transition);

  if (bundle.screen.subject) {
    setBundleSignal(signals, 'main_subject_x', bundle.screen.subject.x);
    setBundleSignal(signals, 'main_subject_y', bundle.screen.subject.y);
    setBundleSignal(signals, 'main_subject_width', bundle.screen.subject.width ?? 0);
    setBundleSignal(signals, 'main_subject_height', bundle.screen.subject.height ?? 0);
  }

  return signals;
}

function setBundleSignal(target: Record<string, unknown>, key: string, value: unknown): void {
  if (target[key] != null || !isAtomValue(value)) return;
  target[key] = value;
}

function deriveMomentAtoms(
  signal: ReturnType<typeof signalReader>,
  screen: MomentScreenContext,
): MomentAtom[] {
  const speechPeak = Math.max(signal.number('speech.energy'), signal.number('speech.energy_delta'));
  const emotion = signal.number('speech.emotion_intensity');
  const beat = Math.max(signal.number('audio.music_beat'), signal.number('audio.music_energy') * 0.65);
  const cinematic = signal.number('composite.cinematic_moment');
  const narrativePressure = signal.number('composite.narrative_pressure');
  const atoms: MomentAtom[] = [];

  pushDerived(atoms, 'speech', 'moment.speech_peak', speechPeak, 'derived');
  pushDerived(atoms, 'speech', 'moment.emotion_pressure', emotion, 'derived');
  pushDerived(atoms, 'audio', 'moment.beat_accent', beat, 'derived');
  pushDerived(atoms, 'visual', 'moment.visual_salience', screen.visualSalience, 'derived');
  pushDerived(atoms, 'screen', 'moment.screen_busyness', screen.busyness, 'derived');
  pushDerived(atoms, 'visual', 'moment.human_attention', screen.humanAttention, 'derived');
  pushDerived(atoms, 'motion', 'moment.motion_pressure', screen.motionPressure, 'derived');
  pushDerived(atoms, 'structure', 'moment.cinematic_pressure', Math.max(cinematic, narrativePressure), 'derived');

  if (screen.negativeSpace.region !== 'none') {
    atoms.push({
      channel: 'screen',
      key: 'moment.negative_space_region',
      value: screen.negativeSpace.region,
      strength: screen.negativeSpace.strength,
      source: 'derived',
      level: 'derived',
    });
  }

  return atoms.filter((atom) => atom.strength > 0).sort(sortAtoms);
}

function buildMomentRhythm(
  frame: number,
  signal: ReturnType<typeof signalReader>,
  screen: MomentScreenContext,
): MomentRhythm {
  const speechPeak = Math.max(signal.number('speech.energy'), signal.number('speech.energy_delta'));
  const beatStrength = Math.max(signal.number('audio.music_beat'), signal.number('audio.music_energy') * 0.65);
  const motionPulse = Math.max(screen.motionPressure, signal.number('visual.motion_intensity_sustained') * 0.75);
  const intensity = clamp01(Math.max(speechPeak, beatStrength, motionPulse, signal.number('composite.cinematic_moment')));

  return {
    anchorFrame: frame,
    attackFrames: Math.round(lerp(4, 14, 1 - intensity)),
    holdFrames: Math.round(lerp(10, 24, intensity)),
    releaseFrames: Math.round(lerp(6, 18, 1 - Math.max(beatStrength, motionPulse))),
    speechPeak,
    beatStrength,
    motionPulse,
  };
}

function buildMomentScreenContext(signal: ReturnType<typeof signalReader>): MomentScreenContext {
  const perceptionAvailable = signal.string('visual.perception.status') === 'available';
  const perceptionTextPressure = perceptionAvailable
    ? Math.max(signal.number('visual.perception.avg_text_coverage'), signal.number('visual.perception.text_presence_ratio'))
    : 0;
  const textCoverage = perceptionFallback(signal.number('visual.text_coverage'), perceptionTextPressure, 0.75);
  const textBoxPressure = clamp01(signal.number('visual.text_box_count') / 4);
  const objectPressure = perceptionFallback(
    clamp01(signal.number('visual.object_count') / 8),
    perceptionAvailable ? clamp01(signal.number('visual.perception.avg_object_count') / 8) : 0,
    0.65,
  );
  const complexity = signal.number('visual.complexity');
  const perceptionClutter = perceptionAvailable ? signal.number('visual.perception.screen_clutter_ratio') : 0;
  const faceCount = perceptionFallback(
    clamp01(signal.number('visual.face_count') / 3),
    perceptionAvailable ? Math.max(signal.number('visual.perception.face_presence_ratio'), clamp01(signal.number('visual.perception.avg_face_count') / 3)) : 0,
    0.75,
  );
  const facePresent = Math.max(signal.number('visual.face_present'), faceCount);
  const eyeContact = signal.number('visual.eye_contact');
  const perceptionViewerValue = perceptionAvailable ? signal.number('visual.perception.avg_viewer_value') : 0;
  const visualSalience = Math.max(signal.number('visual.significance'), signal.number('composite.cinematic_moment') * 0.8, perceptionViewerValue * 0.75);
  const motionX = signal.signedNumber('visual.motion_vector.x');
  const motionY = signal.signedNumber('visual.motion_vector.y');
  const motionMagnitude = clamp01(Math.hypot(motionX, motionY));
  const motionPressure = Math.max(
    perceptionFallback(signal.number('visual.motion_intensity'), perceptionAvailable ? signal.number('visual.perception.motion_presence_ratio') : 0, 0.7),
    motionMagnitude,
  );
  const negativeSpace = strongestNegativeSpace(signal);

  return {
    busyness: clamp01(Math.max(textCoverage, textBoxPressure, objectPressure, complexity, perceptionClutter * 0.8)),
    legibilityRisk: clamp01(Math.max(textCoverage, textBoxPressure, complexity * 0.75)),
    humanAttention: clamp01(Math.max(facePresent, eyeContact)),
    visualSalience,
    motionPressure,
    negativeSpace,
    subject: subjectFromSignal(signal),
    motionVector: {
      x: motionX,
      y: motionY,
      magnitude: motionMagnitude,
    },
  };
}

function buildMomentConstraints(
  signal: ReturnType<typeof signalReader>,
  screen: MomentScreenContext,
): MomentConstraints {
  const brandRestraint = signal.number('brand.restraint');
  const restraint = clamp01(Math.max(brandRestraint, screen.busyness * 0.55, screen.humanAttention * 0.35));

  return {
    avoidFaces: screen.humanAttention >= 0.45,
    avoidOnScreenText: screen.legibilityRisk >= 0.32,
    reduceOverlayDensity: Math.max(screen.busyness, screen.motionPressure * 0.75) >= 0.62,
    preferNegativeSpace: screen.negativeSpace.strength >= 0.35,
    preserveLegibility: screen.legibilityRisk >= 0.2,
    restraint,
  };
}

function buildMomentFamilyIntents(
  signal: ReturnType<typeof signalReader>,
  screen: MomentScreenContext,
  rhythm: MomentRhythm,
  constraints: MomentConstraints,
): MomentFamilyIntents {
  const speechImportance = Math.max(
    rhythm.speechPeak,
    signal.number('speech.emotion_intensity') * 0.9,
    signal.number('composite.narrative_pressure'),
  );
  const beatOrImpact = Math.max(rhythm.beatStrength, signal.number('composite.cinematic_moment'));
  const densityPenalty = constraints.reduceOverlayDensity ? 0.7 : 1;
  const legibilityPenalty = constraints.preserveLegibility ? 0.82 : 1;

  return {
    motionGraphic: clamp01(Math.max(speechImportance, screen.visualSalience * 0.75) * densityPenalty * legibilityPenalty),
    captionEmphasis: clamp01(speechImportance * legibilityPenalty),
    frameMovement: clamp01(Math.max(speechImportance * 0.7, screen.visualSalience, rhythm.motionPulse) * (screen.motionPressure > 0.8 ? 0.72 : 1)),
    transition: clamp01(Math.max(signal.number('composite.narrative_pressure'), beatOrImpact * 0.75) * densityPenalty),
    sfx: clamp01(Math.max(beatOrImpact, speechImportance * 0.72) * (constraints.restraint > 0.7 ? 0.62 : 1)),
    pacing: clamp01(Math.max(beatOrImpact, speechImportance, rhythm.motionPulse)),
  };
}

function signalReader(snapshot: SignalSnapshot | Record<string, unknown> | undefined) {
  const source = snapshot ?? {};
  return {
    number: (...keys: string[]) => {
      for (const key of keys) {
        const value = source[key];
        if (typeof value === 'number' && Number.isFinite(value)) return clamp01(value);
        if (typeof value === 'boolean') return value ? 1 : 0;
      }
      return 0;
    },
    signedNumber: (...keys: string[]) => {
      for (const key of keys) {
        const value = source[key];
        if (typeof value === 'number' && Number.isFinite(value)) return signed(value);
        if (typeof value === 'boolean') return value ? 1 : 0;
      }
      return 0;
    },
    string: (...keys: string[]) => {
      for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim().length > 0) return value;
      }
      return '';
    },
  };
}

function strongestNegativeSpace(signal: ReturnType<typeof signalReader>): MomentScreenContext['negativeSpace'] {
  const regions = [
    ['top', signal.number('visual.negative_space.top')],
    ['right', signal.number('visual.negative_space.right')],
    ['bottom', signal.number('visual.negative_space.bottom')],
    ['left', signal.number('visual.negative_space.left')],
  ] as const;
  const [region, strength] = regions.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best);
  if (strength > 0) return { region, strength };

  return strongestTrustedPerceptionNegativeSpace(signal);
}

function strongestTrustedPerceptionNegativeSpace(signal: ReturnType<typeof signalReader>): MomentScreenContext['negativeSpace'] {
  if (signal.string('visual.perception.placement_trust') !== 'trusted') {
    return { region: 'none', strength: 0 };
  }
  const regions = [
    ['top', signal.number('visual.perception.negative_space.top')],
    ['right', signal.number('visual.perception.negative_space.right')],
    ['bottom', signal.number('visual.perception.negative_space.bottom')],
    ['left', signal.number('visual.perception.negative_space.left')],
  ] as const;
  const [region, strength] = regions.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best);
  return strength > 0 ? { region, strength } : { region: 'none', strength: 0 };
}

function perceptionFallback(primary: number, fallback: number, confidence: number): number {
  if (primary > 0) return primary;
  return clamp01(fallback * confidence);
}

function subjectFromSignal(signal: ReturnType<typeof signalReader>): MomentScreenContext['subject'] {
  const x = signal.number('visual.main_subject.x');
  const y = signal.number('visual.main_subject.y');
  if (x === 0 && y === 0) return undefined;
  const width = signal.number('visual.main_subject.width');
  const height = signal.number('visual.main_subject.height');
  return {
    x,
    y,
    ...(width > 0 ? { width } : {}),
    ...(height > 0 ? { height } : {}),
  };
}

function pushDerived(
  atoms: MomentAtom[],
  channel: MomentAtomChannel,
  key: string,
  value: number,
  source: MomentAtom['source'],
): void {
  const strength = clamp01(value);
  if (strength <= 0) return;
  atoms.push({
    channel,
    key,
    value: strength,
    strength,
    source,
    level: 'derived',
  });
}

function isAtomValue(value: unknown): value is number | string | boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  return typeof value === 'boolean';
}

function atomStrength(value: number | string | boolean): number {
  if (typeof value === 'number') return clamp01(Math.abs(value));
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 1;
}

function signed(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sortAtoms(a: MomentAtom, b: MomentAtom): number {
  return b.strength - a.strength || a.channel.localeCompare(b.channel) || a.key.localeCompare(b.key);
}
