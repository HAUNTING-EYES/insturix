export type AtomicVisualAtomKind =
  | 'salience'
  | 'motion-intensity'
  | 'motion-vector-x'
  | 'motion-vector-y'
  | 'motion-source'
  | 'shot-scale'
  | 'screen-busyness'
  | 'text-occupancy'
  | 'subject-presence'
  | 'subject-gaze'
  | 'subject-emotion'
  | 'subject-action'
  | 'luma'
  | 'contrast'
  | 'saturation'
  | 'color-temperature'
  | 'color-count'
  | 'edge-density'
  | 'object-count'
  | 'face-count'
  | 'main-subject-x'
  | 'main-subject-y'
  | 'main-subject-width'
  | 'main-subject-height'
  | 'text-box-count'
  | 'text-coverage'
  | 'negative-space-top'
  | 'negative-space-right'
  | 'negative-space-bottom'
  | 'negative-space-left'
  | 'legibility-risk';

export type AtomicAtomSource =
  | 'vjepa'
  | 'five-track'
  | 'derived-signal'
  | 'transcript'
  | 'audio-analysis'
  | 'brand'
  | 'layout-analysis'
  | 'edl'
  | 'decision-param'
  | 'keyframe'
  | 'audio-library';

export interface AtomicVisualAtom {
  kind: AtomicVisualAtomKind;
  key: string;
  value: number | string | boolean;
  strength: number;
  source: Extract<AtomicAtomSource, 'vjepa' | 'five-track' | 'derived-signal' | 'layout-analysis'>;
  renderPressure: 'open' | 'neutral' | 'protect';
}

export interface AtomicVisualContext {
  visualSignificance: number;
  motionIntensity: number;
  motionVectorX: number;
  motionVectorY: number;
  visualComplexity: number;
  textOnScreen: number;
  shotScale: number;
  facePresent: boolean;
  actionType?: string;
  motionType?: string;
  faceEmotion?: string;
  eyeContact: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  colorTemperature: number;
  colorCount: number;
  edgeDensity: number;
  objectCount: number;
  faceCount: number;
  mainSubjectX: number;
  mainSubjectY: number;
  mainSubjectWidth: number;
  mainSubjectHeight: number;
  textBoxCount: number;
  textCoverage: number;
  negativeSpaceTop: number;
  negativeSpaceRight: number;
  negativeSpaceBottom: number;
  negativeSpaceLeft: number;
  humanAttention: number;
  motionAttention: number;
  screenBusyness: number;
  legibilityRisk: number;
  recommendedDensity: 'open' | 'balanced' | 'restrained';
  atoms: AtomicVisualAtom[];
}

export type AtomicOverlayFamily =
  | 'motion-graphic'
  | 'video'
  | 'image'
  | 'html-scene'
  | 'html-sticker'
  | 'text'
  | 'sound'
  | 'shape'
  | 'sticker'
  | 'zoom'
  | 'transition'
  | 'sfx'
  | 'speed'
  | 'fade'
  | 'camera-shake'
  | 'caption';

export type AtomicOverlayAtomKind =
  | AtomicVisualAtomKind
  | 'temporal-anchor'
  | 'target-overlay'
  | 'motion-curve'
  | 'scale-delta'
  | 'focal-x'
  | 'focal-y'
  | 'direction-x'
  | 'direction-y'
  | 'blur'
  | 'exposure'
  | 'softness'
  | 'opacity-curve'
  | 'speed-curve'
  | 'transition-relation'
  | 'audio-hit'
  | 'speech-energy'
  | 'beat-strength'
  | 'word-importance'
  | 'emotion-arousal'
  | 'topic-shift'
  | 'rhythm-density'
  | 'content-signal'
  | 'brand-vibe'
  | 'screen-region'
  | 'safe-zone'
  | 'duration'
  | 'start-frame'
  | 'end-frame'
  | 'scene-index'
  | 'scene-type'
  | 'scene-title'
  | 'asset-id'
  | 'media-source'
  | 'content-channel'
  | 'text-content'
  | 'overlay-row'
  | 'position-x'
  | 'position-y'
  | 'size-width'
  | 'size-height'
  | 'opacity'
  | 'volume'
  | 'font-family'
  | 'font-size'
  | 'font-weight'
  | 'text-color'
  | 'background-color'
  | 'border-radius'
  | 'text-align'
  | 'line-height'
  | 'letter-spacing'
  | 'text-casing'
  | 'text-line-count'
  | 'text-word-count'
  | 'text-flow-direction'
  | 'text-wrap-unit'
  | 'text-row-strategy'
  | 'text-row-capacity'
  | 'text-target-row-count'
  | 'text-contrast-mode'
  | 'theme-primary-color'
  | 'theme-accent-color'
  | 'theme-text-color'
  | 'theme-muted-color'
  | 'theme-surface-color'
  | 'theme-heading-font'
  | 'theme-body-font'
  | 'theme-mono-font'
  | 'glyph-role'
  | 'glyph-start-ms'
  | 'glyph-end-ms'
  | 'glyph-confidence'
  | 'glyph-line-index'
  | 'glyph-display-scale'
  | 'glyph-font-role'
  | 'glyph-color-role'
  | 'glyph-highlight-mode'
  | 'emphasis-role'
  | 'caption-mode'
  | 'caption-words-per-group'
  | 'caption-max-words-per-line'
  | 'caption-show-previous'
  | 'caption-fade-previous'
  | 'highlight-color'
  | 'highlight-background-color'
  | 'highlight-scale'
  | 'highlight-effect'
  | 'highlight-animation'
  | 'media-start-frame'
  | 'playback-speed'
  | 'shape-kind'
  | 'sticker-category'
  | 'caption-word';

export interface AtomicOverlayAtom {
  kind: AtomicOverlayAtomKind;
  key: string;
  value: number | string | boolean;
  strength: number;
  source: AtomicAtomSource;
}

export type AtomicPlacementRegion =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'full-frame';

export interface AtomicPlacementBox {
  kind: 'avoid' | 'prefer';
  reason: 'main-subject' | 'face-attention' | 'text-occupancy' | 'negative-space' | 'opposite-subject';
  region: AtomicPlacementRegion;
  x: number;
  y: number;
  width: number;
  height: number;
  strength: number;
  source: Extract<AtomicAtomSource, 'vjepa' | 'five-track' | 'derived-signal' | 'layout-analysis'>;
}

export interface AtomicPlacementHints {
  version: 'placement-hints-v1';
  density: AtomicVisualContext['recommendedDensity'];
  legibilityRisk: number;
  screenBusyness: number;
  avoid: AtomicPlacementBox[];
  prefer: AtomicPlacementBox[];
  constraints: string[];
}

export type AtomicOverlayAnchorKind =
  | 'timeline-frame'
  | 'clip-boundary'
  | 'word'
  | 'beat'
  | 'overlay'
  | 'asset'
  | 'screen-region';

export type AtomicOverlayMotionAction =
  | 'none'
  | 'fade'
  | 'scale'
  | 'slide'
  | 'zoom'
  | 'transition'
  | 'speed-ramp'
  | 'shake'
  | 'audio-hit';

export type AtomicOverlayCurve =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'spring'
  | 'cut';

export interface AtomicOverlayEvidence {
  kind: AtomicOverlayAtomKind;
  key: string;
  value: number | string | boolean;
  strength: number;
  source: AtomicAtomSource;
}

export type AtomicTextGlyphRole =
  | 'word'
  | 'keyword'
  | 'statistic'
  | 'cta'
  | 'entity'
  | 'number'
  | 'punctuation'
  | 'filler'
  | 'unknown';

export type AtomicTextHierarchyRole =
  | 'caption'
  | 'subtitle'
  | 'headline'
  | 'body'
  | 'label'
  | 'emphasis';

export type AtomicTextCasing =
  | 'upper'
  | 'lower'
  | 'title'
  | 'mixed'
  | 'numeric'
  | 'empty';

export type AtomicTextFlowDirection =
  | 'left-to-right'
  | 'right-to-left'
  | 'center-out';

export type AtomicTextWrapUnit =
  | 'word'
  | 'line'
  | 'block';

export type AtomicTextRowStrategy =
  | 'single-word'
  | 'timed-fill'
  | 'progressive-line'
  | 'subtitle-band'
  | 'manual-lines'
  | 'balanced-block';

export type AtomicTextFontRole =
  | 'primary'
  | 'accent'
  | 'mono'
  | 'secondary';

export type AtomicTextColorRole =
  | 'primary'
  | 'accent'
  | 'contrast'
  | 'muted'
  | 'surface';

export type AtomicTextHighlightMode =
  | 'none'
  | 'fill'
  | 'underline'
  | 'glow'
  | 'scale'
  | 'pop';

export type AtomicTextContrastMode =
  | 'light-on-dark'
  | 'dark-on-light'
  | 'unknown';

export interface AtomicTextGlyph {
  index: number;
  text: string;
  role: AtomicTextGlyphRole;
  lineIndex: number;
  startMs?: number;
  endMs?: number;
  confidence?: number;
  emphasis?: {
    role: Exclude<AtomicTextGlyphRole, 'word' | 'punctuation' | 'unknown' | 'filler'>;
    source?: string;
  };
  visual?: {
    scale: number;
    fontRole: AtomicTextFontRole;
    colorRole: AtomicTextColorRole;
    highlightMode: AtomicTextHighlightMode;
  };
}

export interface AtomicTextLine {
  index: number;
  text: string;
  startGlyph: number;
  endGlyph: number;
  wordCount: number;
  charCount: number;
}

export interface AtomicTextForm {
  version: 'atomic-text-form-v1';
  channel: 'text' | 'caption';
  rawText: string;
  hierarchy: {
    role: AtomicTextHierarchyRole;
    level: 1 | 2 | 3;
    emphasisDensity: number;
  };
  casing: AtomicTextCasing;
  glyphs: AtomicTextGlyph[];
  lines: AtomicTextLine[];
  lineBreaks: number[];
  emphasis: AtomicTextGlyph[];
  typography: {
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string | number;
    color?: string;
    backgroundColor?: string;
    textAlign?: string;
    lineHeight?: string | number;
    letterSpacing?: string;
  };
  display?: {
    mode?: string;
    wordsPerGroup?: number;
    maxWordsPerLine?: number;
    showPreviousWords?: boolean;
    fadeOutPreviousWords?: boolean;
  };
  composition: {
    flowDirection: AtomicTextFlowDirection;
    wrapUnit: AtomicTextWrapUnit;
    rowStrategy: AtomicTextRowStrategy;
    rowCapacity?: number;
    targetRowCount: number;
    density: number;
    blockAspect: number;
  };
  colorPlan: {
    contrastMode: AtomicTextContrastMode;
    roles: {
      primary?: string;
      accent?: string;
      contrast?: string;
      muted?: string;
      surface?: string;
    };
  };
  fontPlan: {
    roles: {
      primary?: string;
      accent?: string;
      mono?: string;
      secondary?: string;
    };
  };
  highlight?: {
    color?: string;
    backgroundColor?: string;
    scale?: number;
    effect?: string;
    animation?: string;
  };
  motion: {
    entry: AtomicOverlayMotionAction;
    exit: AtomicOverlayMotionAction;
    curve: AtomicOverlayCurve;
    intensity: number;
  };
}

export interface AtomicOverlayForm {
  version: 'overlay-atomic-form-v1';
  family: AtomicOverlayFamily;
  intent: string;
  role: string;
  evidence: AtomicOverlayEvidence[];
  timing: {
    startFrame: number;
    durationFrames?: number;
    endFrame?: number;
    anchor: {
      kind: AtomicOverlayAnchorKind;
      frame: number;
      strength: number;
      evidence: string[];
    };
  };
  placement: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    region: AtomicPlacementRegion;
    preferredRegion?: AtomicPlacementRegion;
    avoidRegions: AtomicPlacementRegion[];
    constraints: string[];
  };
  motion: {
    entry: AtomicOverlayMotionAction;
    exit: AtomicOverlayMotionAction;
    curve: AtomicOverlayCurve;
    intensity: number;
    durationFrames?: number;
  };
  style: {
    opacity?: number;
    volume?: number;
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string | number;
    textColor?: string;
    backgroundColor?: string;
    borderRadius?: string;
  };
  content: {
    channel: AtomicOverlayFamily;
    text?: string;
    assetId?: string;
    mediaSource?: string;
  };
  text?: AtomicTextForm;
  constraints: string[];
  collisions: {
    risk: number;
    visualRisk: number;
    overlayRisk: number;
    reasons: string[];
  };
  compatibility: Record<string, number | string | boolean>;
}

export interface AtomicOverlayReceipt {
  version: 'overlay-atoms-v1';
  family: AtomicOverlayFamily;
  intent: string;
  frame: number;
  durationFrames?: number;
  source?: string;
  reason?: string;
  observeMode: true;
  visualContext: AtomicVisualContext;
  placementHints: AtomicPlacementHints;
  atoms: AtomicOverlayAtom[];
  form: AtomicOverlayForm;
  target?: Record<string, number | string | boolean | undefined>;
  payload?: Record<string, number | string | boolean | undefined>;
}

export function deriveAtomicVisualContext(signals: Record<string, unknown> = {}): AtomicVisualContext {
  const visualSignificance = signalNumber(signals, 'visual_significance', 'visual.significance', 'visualSignificance');
  const motionIntensity = signalNumber(signals, 'motion_intensity', 'visual.motion_intensity', 'motionIntensity');
  const motionVectorX = signalSignedNumber(signals, 'motion_vector_x', 'visual.motion_vector.x', 'subject_motion_x', 'camera_motion_x', 'motionVectorX');
  const motionVectorY = signalSignedNumber(signals, 'motion_vector_y', 'visual.motion_vector.y', 'subject_motion_y', 'camera_motion_y', 'motionVectorY');
  const visualComplexity = signalNumber(signals, 'visual_complexity', 'visual.complexity', 'visualComplexity');
  const textOnScreen = signalNumber(signals, 'text_on_screen', 'visual.text_on_screen', 'textOnScreen');
  const shotScale = signalNumber(signals, 'shot_scale', 'visual.shot_scale', 'shotScale');
  const facePresent = signalBoolean(signals, 'face_present', 'visual.face_present', 'facePresent');
  const actionType = signalString(signals, 'visual_action_type', 'visual.action_type', 'action_type', 'actionType');
  const motionType = signalString(signals, 'visual_motion_type', 'visual.motion_type', 'motion_type', 'motionType');
  const faceEmotion = signalString(signals, 'visual_face_emotion', 'visual.face_emotion', 'face_emotion', 'faceEmotion');
  const eyeContact = signalBoolean(signals, 'visual_eye_contact', 'visual.eye_contact', 'eye_contact', 'eyeContact');
  const brightness = signalNumber(signals, 'brightness', 'visual_brightness', 'visual.brightness');
  const contrast = signalNumber(signals, 'contrast', 'visual_contrast', 'visual.contrast');
  const saturation = signalNumber(signals, 'saturation', 'visual_saturation', 'visual.saturation');
  const colorTemperature = signalNumber(signals, 'color_temperature', 'visual_color_temperature', 'visual.color_temperature', 'colorTemperature');
  const colorCount = signalCount(signals, 'color_count', 'dominant_color_count', 'visual.color_count', 'colorCount', 'dominantColorCount');
  const edgeDensity = signalNumber(signals, 'edge_density', 'visual_edge_density', 'visual.edge_density', 'edgeDensity');
  const objectCount = signalCount(signals, 'object_count', 'subject_count', 'visual.object_count', 'objectCount', 'subjectCount');
  const faceCount = signalCount(signals, 'face_count', 'visual_face_count', 'visual.face_count', 'faceCount', 'visualFaceCount');
  const mainSubjectX = signalNumber(signals, 'main_subject_x', 'subject_x', 'visual.main_subject.x', 'mainSubjectX', 'subjectX');
  const mainSubjectY = signalNumber(signals, 'main_subject_y', 'subject_y', 'visual.main_subject.y', 'mainSubjectY', 'subjectY');
  const mainSubjectWidth = signalNumber(signals, 'main_subject_width', 'subject_width', 'visual.main_subject.width', 'mainSubjectWidth', 'subjectWidth');
  const mainSubjectHeight = signalNumber(signals, 'main_subject_height', 'subject_height', 'visual.main_subject.height', 'mainSubjectHeight', 'subjectHeight');
  const textBoxCount = signalCount(signals, 'text_box_count', 'visual_text_box_count', 'visual.text_box_count', 'textBoxCount', 'visualTextBoxCount');
  const textCoverage = signalNumber(signals, 'text_coverage', 'visual_text_coverage', 'visual.text_coverage', 'textCoverage', 'visualTextCoverage');
  const negativeSpaceTop = signalNumber(signals, 'negative_space_top', 'visual.negative_space.top', 'negativeSpaceTop');
  const negativeSpaceRight = signalNumber(signals, 'negative_space_right', 'visual.negative_space.right', 'negativeSpaceRight');
  const negativeSpaceBottom = signalNumber(signals, 'negative_space_bottom', 'visual.negative_space.bottom', 'negativeSpaceBottom');
  const negativeSpaceLeft = signalNumber(signals, 'negative_space_left', 'visual.negative_space.left', 'negativeSpaceLeft');
  const humanAttention = clamp01(
    (facePresent ? 0.42 : 0)
    + (eyeContact ? 0.28 : 0)
    + (faceEmotion && faceEmotion !== 'neutral' ? 0.18 : 0)
    + shotScale * 0.16
    + Math.min(faceCount, 2) * 0.08
  );
  const motionAttention = clamp01(
    motionIntensity * 0.7
    + (motionType === 'camera_moving' || motionType === 'both' ? 0.2 : 0)
    + (actionType && actionType !== 'still' && actionType !== 'talking' ? 0.12 : 0)
  );
  const screenBusyness = clamp01(Math.max(
    visualComplexity,
    textOnScreen * 0.82,
    textCoverage * 0.92,
    edgeDensity * 0.74,
    Math.min(objectCount / 8, 1) * 0.72,
    visualSignificance * 0.65,
    motionAttention * 0.58,
  ));
  const legibilityRisk = clamp01(Math.max(
    visualSignificance,
    motionIntensity * 0.9,
    visualComplexity * 0.85,
    textOnScreen * 0.8,
    textCoverage * 0.88,
    edgeDensity * 0.7,
    humanAttention * 0.9,
    screenBusyness * 0.88,
  ));

  const context = {
    visualSignificance,
    motionIntensity,
    motionVectorX,
    motionVectorY,
    visualComplexity,
    textOnScreen,
    shotScale,
    facePresent,
    actionType,
    motionType,
    faceEmotion,
    eyeContact,
    brightness,
    contrast,
    saturation,
    colorTemperature,
    colorCount,
    edgeDensity,
    objectCount,
    faceCount,
    mainSubjectX,
    mainSubjectY,
    mainSubjectWidth,
    mainSubjectHeight,
    textBoxCount,
    textCoverage,
    negativeSpaceTop,
    negativeSpaceRight,
    negativeSpaceBottom,
    negativeSpaceLeft,
    humanAttention,
    motionAttention,
    screenBusyness,
    legibilityRisk,
  };

  return {
    ...context,
    recommendedDensity: legibilityRisk >= 0.72 ? 'restrained'
      : legibilityRisk >= 0.42 ? 'balanced'
        : 'open',
    atoms: buildVisualAtoms(context),
  };
}

export function buildOverlayAtomicReceipt(input: {
  family: AtomicOverlayFamily;
  intent: string;
  frame: number;
  durationFrames?: number;
  source?: string;
  reason?: string;
  signals?: Record<string, unknown>;
  target?: AtomicOverlayReceipt['target'];
  payload?: AtomicOverlayReceipt['payload'];
  atoms?: AtomicOverlayAtom[];
  form?: AtomicOverlayForm;
}): AtomicOverlayReceipt {
  const visualContext = deriveAtomicVisualContext(input.signals ?? {});
  const placementHints = buildAtomicPlacementHints(visualContext);
  const atoms = [
    ...visualContext.atoms.map(visualToOverlayAtom),
    ...buildMomentAtoms(input.signals ?? {}, input.frame, input.durationFrames),
    ...(input.atoms ?? []),
  ];
  const form = input.form ?? buildAtomicOverlayForm({
    family: input.family,
    intent: input.intent,
    frame: input.frame,
    durationFrames: input.durationFrames,
    visualContext,
    placementHints,
    atoms,
    target: input.target,
    payload: input.payload,
  });

  return {
    version: 'overlay-atoms-v1',
    family: input.family,
    intent: input.intent,
    frame: input.frame,
    durationFrames: input.durationFrames,
    source: input.source,
    reason: input.reason,
    observeMode: true,
    visualContext,
    placementHints,
    atoms,
    form,
    target: input.target,
    payload: input.payload,
  };
}

function buildAtomicOverlayForm(input: {
  family: AtomicOverlayFamily;
  intent: string;
  frame: number;
  durationFrames?: number;
  visualContext: AtomicVisualContext;
  placementHints: AtomicPlacementHints;
  atoms: AtomicOverlayAtom[];
  target?: AtomicOverlayReceipt['target'];
  payload?: AtomicOverlayReceipt['payload'];
}): AtomicOverlayForm {
  const evidence = topEvidence(input.atoms);
  const visualRisk = clamp01(Math.max(
    input.visualContext.legibilityRisk,
    input.visualContext.screenBusyness,
    ...input.placementHints.avoid.map((box) => box.strength),
  ));
  const collisionReasons = [
    ...input.placementHints.constraints,
    ...input.placementHints.avoid.map((box) => `avoid-${box.reason}`),
  ].filter(uniqueString);
  const anchor = resolveAnchor(input.atoms, input.frame);
  const durationFrames = input.durationFrames;
  const region = formRegion(input.atoms, input.target, input.placementHints);
  const text = buildAtomicTextForm(input.family, input.atoms, input.visualContext);

  return {
    version: 'overlay-atomic-form-v1',
    family: input.family,
    intent: input.intent,
    role: roleForOverlay(input.family, input.intent),
    evidence,
    timing: {
      startFrame: input.frame,
      durationFrames,
      endFrame: durationFrames !== undefined ? input.frame + durationFrames : undefined,
      anchor,
    },
    placement: {
      x: numericValue(input.target?.x),
      y: numericValue(input.target?.y),
      width: numericValue(input.target?.width),
      height: numericValue(input.target?.height),
      region,
      preferredRegion: input.placementHints.prefer[0]?.region,
      avoidRegions: input.placementHints.avoid.map((box) => box.region).filter(uniqueRegion),
      constraints: input.placementHints.constraints,
    },
    motion: {
      entry: motionEntryForFamily(input.family, input.atoms),
      exit: motionExitForFamily(input.family, input.atoms),
      curve: curveForFamily(input.family, input.atoms),
      intensity: overlayIntensity(input.atoms, input.visualContext),
      durationFrames,
    },
    style: {
      opacity: numberAtom(input.atoms, 'opacity'),
      volume: numberAtom(input.atoms, 'volume'),
      fontFamily: stringAtom(input.atoms, 'font-family'),
      fontSize: stringAtom(input.atoms, 'font-size'),
      fontWeight: atomPrimitive(input.atoms, 'font-weight') as string | number | undefined,
      textColor: stringAtom(input.atoms, 'text-color'),
      backgroundColor: stringAtom(input.atoms, 'background-color'),
      borderRadius: stringAtom(input.atoms, 'border-radius'),
    },
    content: {
      channel: input.family,
      text: stringAtom(input.atoms, 'text-content'),
      assetId: stringAtom(input.atoms, 'asset-id') ?? stringValue(input.payload?.assetId),
      mediaSource: stringAtom(input.atoms, 'media-source'),
    },
    text,
    constraints: input.placementHints.constraints,
    collisions: {
      risk: visualRisk,
      visualRisk,
      overlayRisk: 0,
      reasons: collisionReasons,
    },
    compatibility: compactFormRecord(input.payload),
  };
}

export function buildAtomicPlacementHints(ctx: AtomicVisualContext): AtomicPlacementHints {
  const avoid: AtomicPlacementBox[] = [];
  const prefer: AtomicPlacementBox[] = [];

  if (ctx.mainSubjectWidth > 0 && ctx.mainSubjectHeight > 0) {
    const subject = rectFromTopLeft(
      ctx.mainSubjectX,
      ctx.mainSubjectY,
      Math.max(ctx.mainSubjectWidth, ctx.facePresent ? 0.22 : 0.12),
      Math.max(ctx.mainSubjectHeight, ctx.facePresent ? 0.28 : 0.12),
      0.08,
    );
    avoid.push(placementBox('avoid', ctx.facePresent ? 'face-attention' : 'main-subject', subject, clamp01(Math.max(
      ctx.humanAttention,
      ctx.visualSignificance * 0.8,
    )), ctx.facePresent ? 'vjepa' : 'five-track'));
  }

  if (ctx.textCoverage > 0.04 || ctx.textOnScreen > 0.45 || ctx.textBoxCount > 0) {
    const strength = clamp01(Math.max(ctx.textCoverage, ctx.textOnScreen, Math.min(ctx.textBoxCount / 4, 1)) * 0.9);
    avoid.push(placementBox('avoid', 'text-occupancy', {
      x: 0.12,
      y: 0.62,
      width: 0.76,
      height: 0.28,
    }, strength, 'five-track'));
  }

  pushNegativeSpacePreference(prefer, 'negative-space-top', ctx.negativeSpaceTop);
  pushNegativeSpacePreference(prefer, 'negative-space-right', ctx.negativeSpaceRight);
  pushNegativeSpacePreference(prefer, 'negative-space-bottom', ctx.negativeSpaceBottom);
  pushNegativeSpacePreference(prefer, 'negative-space-left', ctx.negativeSpaceLeft);

  if (prefer.length === 0 && ctx.mainSubjectWidth > 0) {
    const preferLeft = ctx.mainSubjectX >= 0.5;
    prefer.push(placementBox('prefer', 'opposite-subject', preferLeft ? sideRect('left') : sideRect('right'), 0.45, 'derived-signal'));
  }

  return {
    version: 'placement-hints-v1',
    density: ctx.recommendedDensity,
    legibilityRisk: ctx.legibilityRisk,
    screenBusyness: ctx.screenBusyness,
    avoid: avoid.sort((a, b) => b.strength - a.strength),
    prefer: prefer.sort((a, b) => b.strength - a.strength),
    constraints: placementConstraints(ctx),
  };
}

export function overlayAtom(
  kind: AtomicOverlayAtomKind,
  key: string,
  value: number | string | boolean,
  strength: number,
  source: AtomicAtomSource,
): AtomicOverlayAtom {
  return { kind, key, value, strength: clamp01(strength), source };
}

function buildVisualAtoms(ctx: Omit<AtomicVisualContext, 'recommendedDensity' | 'atoms'>): AtomicVisualAtom[] {
  const atoms: AtomicVisualAtom[] = [
    visualAtom('salience', 'visual.significance', ctx.visualSignificance, ctx.visualSignificance, 'vjepa'),
    visualAtom('motion-intensity', 'visual.motion_intensity', ctx.motionIntensity, ctx.motionAttention, 'vjepa'),
    visualAtom('motion-vector-x', 'visual.motion_vector.x', ctx.motionVectorX, Math.abs(ctx.motionVectorX), 'vjepa'),
    visualAtom('motion-vector-y', 'visual.motion_vector.y', ctx.motionVectorY, Math.abs(ctx.motionVectorY), 'vjepa'),
    visualAtom('shot-scale', 'visual.shot_scale', ctx.shotScale, ctx.shotScale, 'five-track'),
    visualAtom('screen-busyness', 'visual.screen_busyness', ctx.screenBusyness, ctx.screenBusyness, 'derived-signal'),
    visualAtom('text-occupancy', 'visual.text_on_screen', ctx.textOnScreen > 0.5, ctx.textOnScreen, 'five-track'),
    visualAtom('subject-presence', 'visual.face_present', ctx.facePresent, ctx.humanAttention, 'derived-signal'),
    visualAtom('subject-gaze', 'visual.eye_contact', ctx.eyeContact, ctx.eyeContact ? 1 : 0, 'vjepa'),
    visualAtom('luma', 'visual.brightness', ctx.brightness, ctx.brightness, 'five-track'),
    visualAtom('contrast', 'visual.contrast', ctx.contrast, ctx.contrast, 'five-track'),
    visualAtom('saturation', 'visual.saturation', ctx.saturation, ctx.saturation, 'five-track'),
    visualAtom('color-temperature', 'visual.color_temperature', ctx.colorTemperature, ctx.colorTemperature, 'five-track'),
    visualAtom('color-count', 'visual.color_count', ctx.colorCount, Math.min(ctx.colorCount / 8, 1), 'five-track'),
    visualAtom('edge-density', 'visual.edge_density', ctx.edgeDensity, ctx.edgeDensity, 'five-track'),
    visualAtom('object-count', 'visual.object_count', ctx.objectCount, Math.min(ctx.objectCount / 8, 1), 'five-track'),
    visualAtom('face-count', 'visual.face_count', ctx.faceCount, Math.min(ctx.faceCount / 3, 1), 'derived-signal'),
    visualAtom('main-subject-x', 'visual.main_subject.x', ctx.mainSubjectX, ctx.mainSubjectWidth > 0 ? 1 : 0, 'five-track'),
    visualAtom('main-subject-y', 'visual.main_subject.y', ctx.mainSubjectY, ctx.mainSubjectHeight > 0 ? 1 : 0, 'five-track'),
    visualAtom('main-subject-width', 'visual.main_subject.width', ctx.mainSubjectWidth, ctx.mainSubjectWidth, 'five-track'),
    visualAtom('main-subject-height', 'visual.main_subject.height', ctx.mainSubjectHeight, ctx.mainSubjectHeight, 'five-track'),
    visualAtom('text-box-count', 'visual.text_box_count', ctx.textBoxCount, Math.min(ctx.textBoxCount / 4, 1), 'five-track'),
    visualAtom('text-coverage', 'visual.text_coverage', ctx.textCoverage, ctx.textCoverage, 'five-track'),
    visualAtom('negative-space-top', 'visual.negative_space.top', ctx.negativeSpaceTop, ctx.negativeSpaceTop, 'layout-analysis'),
    visualAtom('negative-space-right', 'visual.negative_space.right', ctx.negativeSpaceRight, ctx.negativeSpaceRight, 'layout-analysis'),
    visualAtom('negative-space-bottom', 'visual.negative_space.bottom', ctx.negativeSpaceBottom, ctx.negativeSpaceBottom, 'layout-analysis'),
    visualAtom('negative-space-left', 'visual.negative_space.left', ctx.negativeSpaceLeft, ctx.negativeSpaceLeft, 'layout-analysis'),
    visualAtom('legibility-risk', 'visual.legibility_risk', ctx.legibilityRisk, ctx.legibilityRisk, 'derived-signal'),
  ];

  if (ctx.motionType) {
    atoms.push(visualAtom('motion-source', 'visual.motion_type', ctx.motionType, ctx.motionAttention, 'vjepa'));
  }
  if (ctx.actionType) {
    atoms.push(visualAtom('subject-action', 'visual.action_type', ctx.actionType, ctx.actionType === 'still' ? 0.2 : 0.7, 'vjepa'));
  }
  if (ctx.faceEmotion) {
    atoms.push(visualAtom('subject-emotion', 'visual.face_emotion', ctx.faceEmotion, ctx.faceEmotion === 'neutral' ? 0.3 : 0.8, 'vjepa'));
  }

  return atoms.filter((atom) => atom.strength > 0 || typeof atom.value === 'string' || atom.value === true);
}

function pushNegativeSpacePreference(
  hints: AtomicPlacementBox[],
  key: 'negative-space-top' | 'negative-space-right' | 'negative-space-bottom' | 'negative-space-left',
  strength: number,
): void {
  if (strength < 0.18) return;
  const side = key.replace('negative-space-', '') as 'top' | 'right' | 'bottom' | 'left';
  hints.push(placementBox('prefer', 'negative-space', sideRect(side), strength, 'layout-analysis'));
}

function placementConstraints(ctx: AtomicVisualContext): string[] {
  const constraints: string[] = [];
  if (ctx.recommendedDensity === 'restrained') constraints.push('reduce-overlay-density');
  if (ctx.motionIntensity >= 0.72) constraints.push('avoid-large-kinetic-overlays');
  if (ctx.humanAttention >= 0.55) constraints.push('protect-human-attention');
  if (ctx.textCoverage >= 0.18 || ctx.textOnScreen >= 0.6) constraints.push('protect-existing-text');
  if (ctx.screenBusyness >= 0.72) constraints.push('prefer-negative-space');
  return constraints;
}

function placementBox(
  kind: AtomicPlacementBox['kind'],
  reason: AtomicPlacementBox['reason'],
  rect: Pick<AtomicPlacementBox, 'x' | 'y' | 'width' | 'height'>,
  strength: number,
  source: AtomicPlacementBox['source'],
): AtomicPlacementBox {
  return {
    kind,
    reason,
    region: regionFromRect(rect),
    x: clamp01(rect.x),
    y: clamp01(rect.y),
    width: clamp01(rect.width),
    height: clamp01(rect.height),
    strength: clamp01(strength),
    source,
  };
}

function rectFromTopLeft(
  x: number,
  y: number,
  width: number,
  height: number,
  padding: number,
): Pick<AtomicPlacementBox, 'x' | 'y' | 'width' | 'height'> {
  const paddedWidth = clamp01(width + padding * 2);
  const paddedHeight = clamp01(height + padding * 2);
  return {
    x: clamp01(x - padding),
    y: clamp01(y - padding),
    width: paddedWidth,
    height: paddedHeight,
  };
}

function sideRect(side: 'top' | 'right' | 'bottom' | 'left'): Pick<AtomicPlacementBox, 'x' | 'y' | 'width' | 'height'> {
  switch (side) {
    case 'top':
      return { x: 0.16, y: 0.06, width: 0.68, height: 0.22 };
    case 'right':
      return { x: 0.68, y: 0.18, width: 0.24, height: 0.64 };
    case 'bottom':
      return { x: 0.16, y: 0.72, width: 0.68, height: 0.22 };
    case 'left':
    default:
      return { x: 0.08, y: 0.18, width: 0.24, height: 0.64 };
  }
}

function regionFromRect(rect: Pick<AtomicPlacementBox, 'x' | 'y' | 'width' | 'height'>): AtomicPlacementRegion {
  if (rect.width >= 0.9 && rect.height >= 0.9) return 'full-frame';
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const horizontal = centerX < 0.34 ? 'left' : centerX > 0.66 ? 'right' : 'center';
  const vertical = centerY < 0.34 ? 'top' : centerY > 0.66 ? 'bottom' : 'middle';
  return `${vertical}-${horizontal}` as AtomicPlacementRegion;
}

function buildMomentAtoms(
  signals: Record<string, unknown>,
  frame: number,
  durationFrames?: number,
): AtomicOverlayAtom[] {
  const atoms: AtomicOverlayAtom[] = [
    overlayAtom('start-frame', 'time.start_frame', frame, 1, 'edl'),
  ];

  if (durationFrames !== undefined) {
    atoms.push(
      overlayAtom('duration', 'time.duration_frames', durationFrames, durationFrames > 0 ? 1 : 0, 'edl'),
      overlayAtom('end-frame', 'time.end_frame', frame + durationFrames, durationFrames > 0 ? 1 : 0, 'edl'),
    );
  }

  pushSignalAtom(atoms, signals, 'speech-energy', 'audio.speech_energy', ['speech_energy', 'audio.speech_energy'], 'audio-analysis');
  pushSignalAtom(atoms, signals, 'beat-strength', 'audio.beat_strength', ['beat_strength', 'audio.beat_strength'], 'audio-analysis');
  pushSignalAtom(atoms, signals, 'word-importance', 'text.word_importance', ['word_importance', 'text.word_importance'], 'transcript');
  pushSignalAtom(atoms, signals, 'emotion-arousal', 'emotion.arousal', ['emotional_arousal', 'emotion_arousal', 'emotion.arousal'], 'transcript');
  pushSignalAtom(atoms, signals, 'topic-shift', 'narrative.topic_shift', ['topic_shift', 'narrative.topic_shift'], 'transcript');
  pushSignalAtom(atoms, signals, 'rhythm-density', 'rhythm.density', ['pacing_velocity', 'rhythm_density', 'rhythm.density'], 'derived-signal');

  const brandVibe = signalString(signals, 'brand_vibe', 'brand.vibe');
  if (brandVibe) atoms.push(overlayAtom('brand-vibe', 'brand.vibe', brandVibe, 1, 'brand'));

  const screenRegion = signalString(signals, 'screen_region', 'layout.screen_region');
  if (screenRegion) atoms.push(overlayAtom('screen-region', 'layout.screen_region', screenRegion, 1, 'layout-analysis'));

  const safeZone = signalString(signals, 'safe_zone', 'layout.safe_zone');
  if (safeZone) atoms.push(overlayAtom('safe-zone', 'layout.safe_zone', safeZone, 1, 'layout-analysis'));

  return atoms;
}

function pushSignalAtom(
  atoms: AtomicOverlayAtom[],
  signals: Record<string, unknown>,
  kind: AtomicOverlayAtomKind,
  key: string,
  signalKeys: string[],
  source: AtomicAtomSource,
): void {
  const value = signalMaybeNumber(signals, ...signalKeys);
  if (value === undefined) return;
  atoms.push(overlayAtom(kind, key, value, value, source));
}

function visualAtom(
  kind: AtomicVisualAtomKind,
  key: string,
  value: number | string | boolean,
  strength: number,
  source: AtomicVisualAtom['source'],
): AtomicVisualAtom {
  const clampedStrength = clamp01(strength);
  return {
    kind,
    key,
    value,
    strength: clampedStrength,
    source,
    renderPressure: clampedStrength >= 0.72 ? 'protect' : clampedStrength >= 0.38 ? 'neutral' : 'open',
  };
}

function visualToOverlayAtom(atom: AtomicVisualAtom): AtomicOverlayAtom {
  return {
    kind: atom.kind,
    key: atom.key,
    value: atom.value,
    strength: atom.strength,
    source: atom.source,
  };
}

function buildAtomicTextForm(
  family: AtomicOverlayFamily,
  atoms: AtomicOverlayAtom[],
  ctx: AtomicVisualContext,
): AtomicTextForm | undefined {
  if (family !== 'text' && family !== 'caption' && family !== 'motion-graphic') return undefined;

  const display = textDisplayFromAtoms(atoms);
  const rawText = stringAtom(atoms, 'text-content') ?? captionTextFromAtoms(atoms);
  const baseGlyphs = family === 'caption'
    ? captionGlyphsFromAtoms(atoms, display.maxWordsPerLine)
    : textGlyphsFromText(rawText);

  if (!rawText.trim() && baseGlyphs.length === 0) return undefined;

  const lines = buildTextLines(baseGlyphs, rawText);
  const typography = textTypographyFromAtoms(atoms);
  const highlight = textHighlightFromAtoms(atoms);
  const colorPlan = textColorPlanFromAtoms(atoms, typography, highlight);
  const fontPlan = textFontPlanFromAtoms(atoms, typography);
  const glyphs = baseGlyphs.map((glyph) => ({
    ...glyph,
    visual: glyphVisualFromAtoms(atoms, glyph, highlight),
  }));
  const emphasis = glyphs.filter((glyph) => glyph.emphasis || (
    glyph.role !== 'word' && glyph.role !== 'punctuation' && glyph.role !== 'unknown' && glyph.role !== 'filler'
  ));
  const emphasisDensity = glyphs.length === 0 ? 0 : clamp01(emphasis.length / glyphs.length);
  const composition = textCompositionFromAtoms(family, atoms, display, rawText, glyphs, lines);
  const motionIntensity = overlayIntensity(atoms, ctx);

  return {
    version: 'atomic-text-form-v1',
    channel: family === 'caption' ? 'caption' : 'text',
    rawText,
    hierarchy: {
      role: textHierarchyRole(family, rawText, typography.fontSize, emphasisDensity),
      level: textHierarchyLevel(rawText, typography.fontSize),
      emphasisDensity,
    },
    casing: textCasing(rawText),
    glyphs,
    lines,
    lineBreaks: lines.slice(0, -1).map((line) => line.endGlyph),
    emphasis,
    typography,
    display: family === 'caption' ? display : undefined,
    composition,
    colorPlan,
    fontPlan,
    highlight,
    motion: {
      entry: motionEntryForFamily(family, atoms),
      exit: motionExitForFamily(family, atoms),
      curve: curveForFamily(family, atoms),
      intensity: motionIntensity,
    },
  };
}

function captionGlyphsFromAtoms(
  atoms: AtomicOverlayAtom[],
  maxWordsPerLine?: number,
): AtomicTextGlyph[] {
  const glyphs: AtomicTextGlyph[] = [];
  for (const atom of atoms) {
    const match = /^caption\.word\.(\d+)$/.exec(atom.key);
    if (!match || typeof atom.value !== 'string') continue;

    const index = Number(match[1]);
    const emphasisRole = textRoleFromString(stringValue(atomValueByKey(atoms, `caption.word.${index}.emphasis_type`)));
    const role = textRoleFromString(stringValue(atomValueByKey(atoms, `caption.word.${index}.role`)))
      ?? emphasisRole
      ?? classifyGlyph(atom.value);
    const explicitLineIndex = numericValue(atomValueByKey(atoms, `caption.word.${index}.line_index`));
    const lineIndex = explicitLineIndex ?? (
      maxWordsPerLine && maxWordsPerLine > 0 ? Math.floor(index / maxWordsPerLine) : 0
    );
    const emphasis = isEmphasisGlyphRole(emphasisRole) ? {
      role: emphasisRole,
      source: stringValue(atomValueByKey(atoms, `caption.word.${index}.emphasis_source`)),
    } : undefined;

    glyphs.push({
      index,
      text: atom.value,
      role,
      lineIndex,
      startMs: numericValue(atomValueByKey(atoms, `caption.word.${index}.start_ms`)),
      endMs: numericValue(atomValueByKey(atoms, `caption.word.${index}.end_ms`)),
      confidence: numericValue(atomValueByKey(atoms, `caption.word.${index}.confidence`)),
      emphasis,
    });
  }
  return glyphs.sort((a, b) => a.index - b.index);
}

function textGlyphsFromText(text: string): AtomicTextGlyph[] {
  if (!text.trim()) return [];
  const glyphs: AtomicTextGlyph[] = [];
  const lines = text.split(/\r?\n/);
  let index = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const words = lines[lineIndex].split(/\s+/).filter(Boolean);
    for (const word of words) {
      glyphs.push({
        index,
        text: word,
        role: classifyGlyph(word),
        lineIndex,
      });
      index += 1;
    }
  }

  return glyphs;
}

function buildTextLines(glyphs: AtomicTextGlyph[], rawText: string): AtomicTextLine[] {
  if (glyphs.length === 0 && rawText.trim()) {
    return rawText.split(/\r?\n/).map((line, index) => ({
      index,
      text: line,
      startGlyph: 0,
      endGlyph: 0,
      wordCount: line.split(/\s+/).filter(Boolean).length,
      charCount: line.length,
    }));
  }

  const groups = new Map<number, AtomicTextGlyph[]>();
  for (const glyph of glyphs) {
    const group = groups.get(glyph.lineIndex) ?? [];
    group.push(glyph);
    groups.set(glyph.lineIndex, group);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, lineGlyphs]) => ({
      index,
      text: lineGlyphs.map((glyph) => glyph.text).join(' '),
      startGlyph: lineGlyphs[0]?.index ?? 0,
      endGlyph: lineGlyphs[lineGlyphs.length - 1]?.index ?? 0,
      wordCount: lineGlyphs.length,
      charCount: lineGlyphs.reduce((total, glyph) => total + glyph.text.length, Math.max(0, lineGlyphs.length - 1)),
    }));
}

function captionTextFromAtoms(atoms: AtomicOverlayAtom[]): string {
  return captionGlyphsFromAtoms(atoms)
    .map((glyph) => glyph.text)
    .join(' ');
}

function textTypographyFromAtoms(atoms: AtomicOverlayAtom[]): AtomicTextForm['typography'] {
  return {
    fontFamily: stringAtom(atoms, 'font-family'),
    fontSize: stringAtom(atoms, 'font-size'),
    fontWeight: atomPrimitive(atoms, 'font-weight') as string | number | undefined,
    color: stringAtom(atoms, 'text-color'),
    backgroundColor: stringAtom(atoms, 'background-color'),
    textAlign: stringAtom(atoms, 'text-align'),
    lineHeight: atomPrimitive(atoms, 'line-height') as string | number | undefined,
    letterSpacing: stringAtom(atoms, 'letter-spacing'),
  };
}

function textDisplayFromAtoms(atoms: AtomicOverlayAtom[]): NonNullable<AtomicTextForm['display']> {
  return {
    mode: stringAtom(atoms, 'caption-mode'),
    wordsPerGroup: numberAtom(atoms, 'caption-words-per-group'),
    maxWordsPerLine: numberAtom(atoms, 'caption-max-words-per-line'),
    showPreviousWords: booleanAtom(atoms, 'caption-show-previous'),
    fadeOutPreviousWords: booleanAtom(atoms, 'caption-fade-previous'),
  };
}

function textHighlightFromAtoms(atoms: AtomicOverlayAtom[]): AtomicTextForm['highlight'] | undefined {
  const highlight = {
    color: stringAtom(atoms, 'highlight-color'),
    backgroundColor: stringAtom(atoms, 'highlight-background-color'),
    scale: numberAtom(atoms, 'highlight-scale'),
    effect: stringAtom(atoms, 'highlight-effect'),
    animation: stringAtom(atoms, 'highlight-animation'),
  };
  return Object.values(highlight).some((value) => value !== undefined) ? highlight : undefined;
}

function textCompositionFromAtoms(
  family: AtomicOverlayFamily,
  atoms: AtomicOverlayAtom[],
  display: NonNullable<AtomicTextForm['display']>,
  rawText: string,
  glyphs: AtomicTextGlyph[],
  lines: AtomicTextLine[],
): AtomicTextForm['composition'] {
  const wordCount = glyphs.length || rawText.split(/\s+/).filter(Boolean).length;
  const inferredCapacity = family === 'caption'
    ? display.maxWordsPerLine
    : Math.max(1, Math.min(8, Math.ceil(wordCount / Math.max(1, lines.length || 1))));
  const rowCapacity = positiveInteger(numberAtom(atoms, 'text-row-capacity') ?? inferredCapacity, 1);
  const rowBasis = family === 'caption' ? display.wordsPerGroup ?? wordCount : wordCount;
  const targetRowCount = positiveInteger(
    numberAtom(atoms, 'text-target-row-count') ?? Math.ceil(rowBasis / Math.max(1, rowCapacity)),
    Math.max(1, lines.length || 1),
  );

  return {
    flowDirection: textFlowDirectionFromString(stringAtom(atoms, 'text-flow-direction')) ?? 'left-to-right',
    wrapUnit: textWrapUnitFromString(stringAtom(atoms, 'text-wrap-unit'))
      ?? defaultWrapUnit(family, display.mode, lines.length),
    rowStrategy: textRowStrategyFromString(stringAtom(atoms, 'text-row-strategy'))
      ?? defaultRowStrategy(family, display.mode, lines.length),
    rowCapacity,
    targetRowCount,
    density: clamp01(wordCount / Math.max(1, rowCapacity * targetRowCount)),
    blockAspect: rowCapacity / Math.max(1, targetRowCount),
  };
}

function textColorPlanFromAtoms(
  atoms: AtomicOverlayAtom[],
  typography: AtomicTextForm['typography'],
  highlight: AtomicTextForm['highlight'] | undefined,
): AtomicTextForm['colorPlan'] {
  const primary = stringAtom(atoms, 'theme-text-color') ?? typography.color;
  const accent = stringAtom(atoms, 'theme-accent-color') ?? highlight?.backgroundColor ?? highlight?.color;
  const contrast = highlight?.color ?? stringAtom(atoms, 'theme-primary-color') ?? primary;
  const surface = stringAtom(atoms, 'theme-surface-color') ?? typography.backgroundColor;
  const muted = stringAtom(atoms, 'theme-muted-color') ?? (primary ? colorWithAlpha(primary, 0.72) : undefined);

  return {
    contrastMode: textContrastModeFromString(stringAtom(atoms, 'text-contrast-mode'))
      ?? inferContrastMode(primary, surface),
    roles: {
      primary,
      accent,
      contrast,
      muted,
      surface,
    },
  };
}

function textFontPlanFromAtoms(
  atoms: AtomicOverlayAtom[],
  typography: AtomicTextForm['typography'],
): AtomicTextForm['fontPlan'] {
  const heading = stringAtom(atoms, 'theme-heading-font');
  const body = stringAtom(atoms, 'theme-body-font');
  const mono = stringAtom(atoms, 'theme-mono-font');
  const primary = typography.fontFamily ?? body ?? heading;

  return {
    roles: {
      primary,
      accent: heading ?? primary,
      mono,
      secondary: body ?? primary,
    },
  };
}

function glyphVisualFromAtoms(
  atoms: AtomicOverlayAtom[],
  glyph: AtomicTextGlyph,
  highlight: AtomicTextForm['highlight'] | undefined,
): NonNullable<AtomicTextGlyph['visual']> {
  const prefix = `caption.word.${glyph.index}`;
  const role = glyph.emphasis?.role ?? glyph.role;
  const scale = numberValueByKey(atoms, `${prefix}.display_scale`) ?? glyphScaleForRole(role, highlight);

  return {
    scale: clampRange(scale, 0.85, 1.8),
    fontRole: textFontRoleFromString(stringValue(atomValueByKey(atoms, `${prefix}.font_role`)))
      ?? fontRoleForGlyph(role),
    colorRole: textColorRoleFromString(stringValue(atomValueByKey(atoms, `${prefix}.color_role`)))
      ?? colorRoleForGlyph(role),
    highlightMode: textHighlightModeFromString(stringValue(atomValueByKey(atoms, `${prefix}.highlight_mode`)))
      ?? highlightModeForGlyph(role, highlight),
  };
}

function defaultWrapUnit(
  family: AtomicOverlayFamily,
  mode: string | undefined,
  lineCount: number,
): AtomicTextWrapUnit {
  if (family !== 'caption') return lineCount > 1 ? 'line' : 'block';
  if (mode === 'subtitle') return 'line';
  return 'word';
}

function defaultRowStrategy(
  family: AtomicOverlayFamily,
  mode: string | undefined,
  lineCount: number,
): AtomicTextRowStrategy {
  if (family !== 'caption') return lineCount > 1 ? 'manual-lines' : 'balanced-block';
  if (mode === 'word-by-word') return 'single-word';
  if (mode === 'subtitle') return 'subtitle-band';
  if (mode === 'karaoke') return 'progressive-line';
  return 'timed-fill';
}

function glyphScaleForRole(
  role: AtomicTextGlyphRole,
  highlight: AtomicTextForm['highlight'] | undefined,
): number {
  const highlightScale = highlight?.scale ?? 1.14;
  if (role === 'statistic' || role === 'number') return Math.max(highlightScale, 1.28);
  if (role === 'keyword' || role === 'entity') return Math.max(highlightScale, 1.18);
  if (role === 'cta') return Math.max(highlightScale, 1.14);
  return 1;
}

function fontRoleForGlyph(role: AtomicTextGlyphRole): AtomicTextFontRole {
  if (role === 'statistic' || role === 'number') return 'mono';
  if (role === 'keyword' || role === 'entity' || role === 'cta') return 'accent';
  if (role === 'filler') return 'secondary';
  return 'primary';
}

function colorRoleForGlyph(role: AtomicTextGlyphRole): AtomicTextColorRole {
  if (role === 'keyword' || role === 'entity' || role === 'statistic' || role === 'number' || role === 'cta') return 'accent';
  if (role === 'filler') return 'muted';
  return 'primary';
}

function highlightModeForGlyph(
  role: AtomicTextGlyphRole,
  highlight: AtomicTextForm['highlight'] | undefined,
): AtomicTextHighlightMode {
  if (role === 'filler' || role === 'word' || role === 'punctuation' || role === 'unknown') return 'none';
  if (highlight?.effect === 'underline') return 'underline';
  if (highlight?.effect === 'glow') return 'glow';
  if (highlight?.effect === 'pop') return 'pop';
  if (highlight?.effect === 'box') return 'fill';
  return 'scale';
}

function textFlowDirectionFromString(value?: string): AtomicTextFlowDirection | undefined {
  if (value === 'left-to-right' || value === 'right-to-left' || value === 'center-out') return value;
  return undefined;
}

function textWrapUnitFromString(value?: string): AtomicTextWrapUnit | undefined {
  if (value === 'word' || value === 'line' || value === 'block') return value;
  return undefined;
}

function textRowStrategyFromString(value?: string): AtomicTextRowStrategy | undefined {
  if (
    value === 'single-word'
    || value === 'timed-fill'
    || value === 'progressive-line'
    || value === 'subtitle-band'
    || value === 'manual-lines'
    || value === 'balanced-block'
  ) return value;
  return undefined;
}

function textFontRoleFromString(value?: string): AtomicTextFontRole | undefined {
  if (value === 'primary' || value === 'accent' || value === 'mono' || value === 'secondary') return value;
  return undefined;
}

function textColorRoleFromString(value?: string): AtomicTextColorRole | undefined {
  if (value === 'primary' || value === 'accent' || value === 'contrast' || value === 'muted' || value === 'surface') return value;
  return undefined;
}

function textHighlightModeFromString(value?: string): AtomicTextHighlightMode | undefined {
  if (value === 'none' || value === 'fill' || value === 'underline' || value === 'glow' || value === 'scale' || value === 'pop') return value;
  return undefined;
}

function textContrastModeFromString(value?: string): AtomicTextContrastMode | undefined {
  if (value === 'light-on-dark' || value === 'dark-on-light' || value === 'unknown') return value;
  return undefined;
}

function inferContrastMode(
  textColor: string | undefined,
  surfaceColor: string | undefined,
): AtomicTextContrastMode {
  const textLuma = colorLuma(textColor);
  const surfaceLuma = colorLuma(surfaceColor);
  if (textLuma === undefined && surfaceLuma === undefined) return 'unknown';
  if ((textLuma ?? 1) >= (surfaceLuma ?? 0.15)) return 'light-on-dark';
  return 'dark-on-light';
}

function colorWithAlpha(color: string, alpha: number): string {
  const rgb = colorToRgb(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clampRange(alpha, 0, 1)})`;
}

function colorLuma(color: string | undefined): number | undefined {
  const rgb = colorToRgb(color);
  if (!rgb) return undefined;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorToRgb(color: string | undefined): { r: number; g: number; b: number } | undefined {
  if (!color) return undefined;
  const normalized = color.trim().toLowerCase();
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const body = hex[1].length === 3
      ? hex[1].split('').map((char) => char + char).join('')
      : hex[1];
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
    };
  }
  const rgb = normalized.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!rgb) return undefined;
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
  };
}

function numberValueByKey(atoms: AtomicOverlayAtom[], key: string): number | undefined {
  return numericValue(atomValueByKey(atoms, key));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function textHierarchyRole(
  family: AtomicOverlayFamily,
  text: string,
  fontSize: string | undefined,
  emphasisDensity: number,
): AtomicTextHierarchyRole {
  if (family === 'caption') return text.split(/\s+/).filter(Boolean).length > 8 ? 'subtitle' : 'caption';
  const size = parseCssNumber(fontSize);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (emphasisDensity >= 0.35 || size >= 64 || words <= 4) return 'headline';
  if (size >= 42 || words <= 8) return 'emphasis';
  if (words <= 14) return 'label';
  return 'body';
}

function textHierarchyLevel(text: string, fontSize: string | undefined): 1 | 2 | 3 {
  const size = parseCssNumber(fontSize);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (size >= 64 || words <= 4) return 1;
  if (size >= 42 || words <= 10) return 2;
  return 3;
}

function textCasing(text: string): AtomicTextCasing {
  const letters = text.match(/[A-Za-z]+/g) ?? [];
  if (letters.length === 0) return /\d/.test(text) ? 'numeric' : 'empty';
  const upperCount = letters.filter((word) => word === word.toUpperCase()).length;
  const lowerCount = letters.filter((word) => word === word.toLowerCase()).length;
  const titleCount = letters.filter((word) => /^[A-Z][a-z]+$/.test(word)).length;
  if (upperCount === letters.length) return 'upper';
  if (lowerCount === letters.length) return 'lower';
  if (titleCount >= Math.max(1, letters.length - 1)) return 'title';
  return 'mixed';
}

function classifyGlyph(text: string): AtomicTextGlyphRole {
  const cleaned = text.trim();
  if (!cleaned) return 'unknown';
  if (/^[^\w]+$/.test(cleaned)) return 'punctuation';
  if (/\d/.test(cleaned)) return 'statistic';
  const lower = cleaned.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (CTA_WORDS.has(lower)) return 'cta';
  if (FILLER_WORDS.has(lower)) return 'filler';
  if (cleaned.length > 2 && cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned)) return 'keyword';
  return 'word';
}

function isEmphasisGlyphRole(
  role: AtomicTextGlyphRole | undefined,
): role is Exclude<AtomicTextGlyphRole, 'word' | 'punctuation' | 'unknown' | 'filler'> {
  return !!role && role !== 'word' && role !== 'punctuation' && role !== 'unknown' && role !== 'filler';
}

function textRoleFromString(value?: string): AtomicTextGlyphRole | undefined {
  if (!value) return undefined;
  if (value === 'keyword' || value === 'statistic' || value === 'cta' || value === 'entity' || value === 'number') return value;
  if (value === 'word' || value === 'punctuation' || value === 'filler' || value === 'unknown') return value;
  return undefined;
}

const CTA_WORDS = new Set([
  'buy',
  'click',
  'join',
  'subscribe',
  'follow',
  'start',
  'try',
  'download',
  'watch',
  'share',
  'learn',
]);

const FILLER_WORDS = new Set([
  'um',
  'uh',
  'like',
  'basically',
  'actually',
  'literally',
  'just',
  'really',
]);

function topEvidence(atoms: AtomicOverlayAtom[]): AtomicOverlayEvidence[] {
  const byKey = new Map<string, AtomicOverlayAtom>();
  for (const atom of atoms) {
    const current = byKey.get(atom.key);
    if (!current || atom.strength > current.strength) byKey.set(atom.key, atom);
  }
  return Array.from(byKey.values())
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 12)
    .map((atom) => ({
      kind: atom.kind,
      key: atom.key,
      value: atom.value,
      strength: atom.strength,
      source: atom.source,
    }));
}

function resolveAnchor(atoms: AtomicOverlayAtom[], frame: number): AtomicOverlayForm['timing']['anchor'] {
  const transition = strongestAtom(atoms, 'transition-relation');
  const word = strongestAtom(atoms, 'word-importance');
  const beat = strongestAtom(atoms, 'beat-strength');
  const region = strongestAtom(atoms, 'screen-region');
  const asset = strongestAtom(atoms, 'asset-id');

  if (transition && transition.strength >= 0.5) {
    return anchor('clip-boundary', frame, transition.strength, [transition.key]);
  }
  if (word && word.strength >= 0.62) {
    return anchor('word', frame, word.strength, [word.key]);
  }
  if (beat && beat.strength >= 0.58) {
    return anchor('beat', frame, beat.strength, [beat.key]);
  }
  if (region && region.strength >= 0.5) {
    return anchor('screen-region', frame, region.strength, [region.key]);
  }
  if (asset && asset.strength >= 0.5) {
    return anchor('asset', frame, asset.strength, [asset.key]);
  }
  return anchor('timeline-frame', frame, 1, ['time.start_frame']);
}

function anchor(
  kind: AtomicOverlayAnchorKind,
  frame: number,
  strength: number,
  evidence: string[],
): AtomicOverlayForm['timing']['anchor'] {
  return {
    kind,
    frame,
    strength: clamp01(strength),
    evidence,
  };
}

function formRegion(
  atoms: AtomicOverlayAtom[],
  target: AtomicOverlayReceipt['target'],
  placementHints: AtomicPlacementHints,
): AtomicPlacementRegion {
  const atomRegion = normalizePlacementRegion(stringAtom(atoms, 'screen-region'));
  if (atomRegion) return atomRegion;

  const x = numericValue(target?.x);
  const y = numericValue(target?.y);
  const width = numericValue(target?.width);
  const height = numericValue(target?.height);
  if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
    const isPixelBox = width > 1 || height > 1 || x > 1 || y > 1;
    return regionFromRect({
      x: isPixelBox ? x / 1920 : x,
      y: isPixelBox ? y / 1080 : y,
      width: isPixelBox ? width / 1920 : width,
      height: isPixelBox ? height / 1080 : height,
    });
  }

  return placementHints.prefer[0]?.region ?? 'full-frame';
}

function normalizePlacementRegion(value?: string): AtomicPlacementRegion | undefined {
  if (!value) return undefined;
  const parts = value.toLowerCase().split(/[\s_-]+/).filter(Boolean);
  if (parts.includes('full') || parts.includes('frame')) return 'full-frame';
  const verticalPart = parts.find((part) => part === 'top' || part === 'middle' || part === 'bottom' || part === 'center');
  const horizontalPart = parts.find((part) => part === 'left' || part === 'center' || part === 'right');
  const vertical = verticalPart === 'center' || verticalPart === undefined ? 'middle' : verticalPart;
  const horizontal = horizontalPart ?? 'center';
  const region = `${vertical}-${horizontal}`;
  return isPlacementRegion(region) ? region : undefined;
}

function isPlacementRegion(value: string): value is AtomicPlacementRegion {
  return value === 'top-left'
    || value === 'top-center'
    || value === 'top-right'
    || value === 'middle-left'
    || value === 'middle-center'
    || value === 'middle-right'
    || value === 'bottom-left'
    || value === 'bottom-center'
    || value === 'bottom-right'
    || value === 'full-frame';
}

function motionEntryForFamily(
  family: AtomicOverlayFamily,
  atoms: AtomicOverlayAtom[],
): AtomicOverlayMotionAction {
  if (strongestAtom(atoms, 'audio-hit')) return 'audio-hit';
  if (strongestAtom(atoms, 'speed-curve')) return 'speed-ramp';
  if (strongestAtom(atoms, 'opacity-curve')) return 'fade';
  if (strongestAtom(atoms, 'scale-delta')) return family === 'zoom' ? 'zoom' : 'scale';
  if (strongestAtom(atoms, 'direction-x') || strongestAtom(atoms, 'direction-y')) return 'slide';

  switch (family) {
    case 'zoom':
      return 'zoom';
    case 'transition':
      return 'transition';
    case 'speed':
      return 'speed-ramp';
    case 'fade':
      return 'fade';
    case 'camera-shake':
      return 'shake';
    case 'sfx':
    case 'sound':
      return 'audio-hit';
    case 'text':
    case 'caption':
    case 'motion-graphic':
      return 'fade';
    default:
      return 'none';
  }
}

function motionExitForFamily(
  family: AtomicOverlayFamily,
  atoms: AtomicOverlayAtom[],
): AtomicOverlayMotionAction {
  if (family === 'transition') return 'transition';
  if (family === 'speed') return 'speed-ramp';
  if (family === 'fade' || strongestAtom(atoms, 'opacity-curve')) return 'fade';
  if (family === 'camera-shake') return 'shake';
  return 'none';
}

function curveForFamily(
  family: AtomicOverlayFamily,
  atoms: AtomicOverlayAtom[],
): AtomicOverlayCurve {
  if (family === 'camera-shake' || strongestAtom(atoms, 'audio-hit')) return 'cut';
  if (family === 'speed' || strongestAtom(atoms, 'speed-curve')) return 'ease-in-out';
  if (family === 'zoom' || family === 'transition' || strongestAtom(atoms, 'scale-delta')) return 'ease-in-out';
  if (family === 'text' || family === 'caption' || family === 'motion-graphic') return 'spring';
  return 'linear';
}

function overlayIntensity(atoms: AtomicOverlayAtom[], ctx: AtomicVisualContext): number {
  const strongKinds = new Set<AtomicOverlayAtomKind>([
    'speech-energy',
    'beat-strength',
    'word-importance',
    'emotion-arousal',
    'topic-shift',
    'motion-intensity',
    'scale-delta',
    'speed-curve',
    'opacity-curve',
    'audio-hit',
    'blur',
    'exposure',
    'softness',
  ]);
  const atomStrength = atoms.reduce((max, atom) => (
    strongKinds.has(atom.kind) ? Math.max(max, atom.strength) : max
  ), 0);
  return clamp01(Math.max(atomStrength, ctx.visualSignificance * 0.72, ctx.motionAttention * 0.7));
}

function roleForOverlay(family: AtomicOverlayFamily, intent: string): string {
  switch (family) {
    case 'motion-graphic':
      return 'visual-explanation';
    case 'zoom':
      return 'attention-direction';
    case 'transition':
      return 'scene-relation';
    case 'sfx':
      return 'rhythm-punctuation';
    case 'sound':
      return 'audio-layer';
    case 'speed':
      return 'time-shaping';
    case 'fade':
      return 'visibility-shaping';
    case 'camera-shake':
      return 'impact-accent';
    case 'caption':
      return 'speech-legibility';
    case 'text':
      return 'readable-message';
    default:
      return intent || 'overlay';
  }
}

function strongestAtom(
  atoms: AtomicOverlayAtom[],
  kind: AtomicOverlayAtomKind,
): AtomicOverlayAtom | undefined {
  return atoms
    .filter((atom) => atom.kind === kind)
    .sort((a, b) => b.strength - a.strength)[0];
}

function numberAtom(atoms: AtomicOverlayAtom[], kind: AtomicOverlayAtomKind): number | undefined {
  return numericValue(atomPrimitive(atoms, kind));
}

function booleanAtom(atoms: AtomicOverlayAtom[], kind: AtomicOverlayAtomKind): boolean | undefined {
  const value = atomPrimitive(atoms, kind);
  return typeof value === 'boolean' ? value : undefined;
}

function stringAtom(atoms: AtomicOverlayAtom[], kind: AtomicOverlayAtomKind): string | undefined {
  return stringValue(atomPrimitive(atoms, kind));
}

function atomPrimitive(
  atoms: AtomicOverlayAtom[],
  kind: AtomicOverlayAtomKind,
): number | string | boolean | undefined {
  return strongestAtom(atoms, kind)?.value;
}

function atomValueByKey(atoms: AtomicOverlayAtom[], key: string): number | string | boolean | undefined {
  return atoms.find((atom) => atom.key === key)?.value;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return (typeof value === 'string' || typeof value === 'number') && String(value).trim()
    ? String(value)
    : undefined;
}

function parseCssNumber(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactFormRecord(
  record?: Record<string, number | string | boolean | undefined>,
): Record<string, number | string | boolean> {
  if (!record) return {};
  const compact: Record<string, number | string | boolean> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) compact[key] = value;
  }
  return compact;
}

function uniqueString(value: string, index: number, array: string[]): boolean {
  return array.indexOf(value) === index;
}

function uniqueRegion(value: AtomicPlacementRegion, index: number, array: AtomicPlacementRegion[]): boolean {
  return array.indexOf(value) === index;
}

function signalNumber(signals: Record<string, unknown>, ...keys: string[]): number {
  const value = signalMaybeNumber(signals, ...keys);
  return value ?? 0;
}

function signalSignedNumber(signals: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = signals[key];
    if (typeof value === 'number' && isFinite(value)) return clampSigned(value);
    if (typeof value === 'boolean') return value ? 1 : 0;
  }
  return 0;
}

function signalMaybeNumber(signals: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = signals[key];
    if (typeof value === 'number' && isFinite(value)) return clamp01(value);
    if (typeof value === 'boolean') return value ? 1 : 0;
  }
  return undefined;
}

function signalCount(signals: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = signals[key];
    if (typeof value === 'number' && isFinite(value)) return Math.max(0, value);
    if (Array.isArray(value)) return value.length;
  }
  return 0;
}

function signalBoolean(signals: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = signals[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && isFinite(value)) return value >= 0.5;
  }
  return false;
}

function signalString(signals: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = signals[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function clamp01(value: number): number {
  if (!isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampSigned(value: number): number {
  if (!isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}
