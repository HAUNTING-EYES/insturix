import { momentBundleToSignalMap, type AtomicMomentBundle } from './moment-bundle';

export type AtomicSfxIntent =
  | 'silence'
  | 'impact-accent'
  | 'motion-accent'
  | 'tension-riser'
  | 'ui-punctuation'
  | 'ambient-bed'
  | 'foley-detail'
  | 'resolution-shimmer';

export type AtomicSfxCompatibilityToken =
  | 'none'
  | 'impact'
  | 'whoosh'
  | 'riser'
  | 'tick'
  | 'shimmer'
  | 'ambient'
  | 'foley';

export type AtomicSfxSyncAnchor =
  | 'keyword'
  | 'beat'
  | 'motion-peak'
  | 'transition'
  | 'mg-landing'
  | 'scene-bed';

export type AtomicSfxTexture =
  | 'clean-cinematic'
  | 'creator-punch'
  | 'soft-organic'
  | 'tech-ui'
  | 'ambient-natural'
  | 'luxury-subtle';

export type AtomicSfxFallbackPolicy =
  | 'silence'
  | 'library-first'
  | 'generated-candidate-allowed'
  | 'subtle-bed-only';

export type AtomicSfxEmotionalRole =
  | 'none'
  | 'punctuate'
  | 'lift'
  | 'build'
  | 'ground'
  | 'texture'
  | 'relief';

export interface AtomicSfxTiming {
  syncFrame: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  preRollFrames: number;
  attackFrames: number;
  tailFrames: number;
  sourceOffsetFrames: number;
  anchor: AtomicSfxSyncAnchor;
}

export interface AtomicSfxMix {
  volume: number;
  loudnessTarget: number;
  duckUnderSpeech: boolean;
  duckLevel: number;
  fadeInFrames: number;
  fadeOutFrames: number;
}

export interface AtomicSfxAssetPlan {
  primarySearchToken: AtomicSfxCompatibilityToken;
  queryTerms: string[];
  avoidTerms: string[];
  textureTerms: string[];
  maxDurationSec: number;
  sourcePreference: Array<'library' | 'generated'>;
  qualityFloor: number;
  fallbackPolicy: AtomicSfxFallbackPolicy;
}

export type AtomicSfxCandidateSource = 'library' | 'generated' | 'unknown';

export interface AtomicSfxAssetCandidate {
  durationMs?: number;
  source?: string;
  originalTitle?: string;
  title?: string;
  filename?: string;
  tags?: string[];
  providerId?: string;
  rating?: number;
}

export interface AtomicSfxPrimitiveAtoms {
  transient: {
    sharpness: number;
    attackFrames: number;
    onset: 'instant' | 'fast' | 'soft' | 'slow-build';
  };
  tail: {
    weight: number;
    tailFrames: number;
    release: 'dry' | 'short' | 'medium' | 'long-bed';
  };
  tone: {
    brightness: number;
    lowEndWeight: number;
    texture: AtomicSfxTexture;
    textureTerms: string[];
  };
  rhythm: {
    syncAnchor: AtomicSfxSyncAnchor;
    preRollFrames: number;
    sourceOffsetFrames: number;
    beatSnapStrength: number;
  };
  mix: {
    volume: number;
    duckUnderSpeech: boolean;
    duckLevel: number;
    mixPressure: number;
  };
  role: {
    intent: AtomicSfxIntent;
    emotionalRole: AtomicSfxEmotionalRole;
    compatibilityToken: AtomicSfxCompatibilityToken;
  };
  policy: {
    fallback: AtomicSfxFallbackPolicy;
    silenceAllowed: boolean;
    qualityFloor: number;
  };
}

export interface AtomicSfxCandidateEvaluation {
  accepted: boolean;
  decision: 'accept' | 'reject' | 'silence';
  score: number;
  qualityFloor: number;
  candidateSource: AtomicSfxCandidateSource;
  candidateTitle: string;
  matchedTerms: string[];
  avoidTermsHit: string[];
  durationOk: boolean;
  reasons: string[];
}

export interface AtomicSfxForm {
  version: 'atomic-sfx-form-v1';
  shouldPlace: boolean;
  intent: AtomicSfxIntent;
  compatibilityToken: AtomicSfxCompatibilityToken;
  texture: AtomicSfxTexture;
  intensity: number;
  restraint: number;
  mixPressure: number;
  transientSharpness: number;
  brightness: number;
  lowEndWeight: number;
  timing: AtomicSfxTiming;
  mix: AtomicSfxMix;
  asset: AtomicSfxAssetPlan;
  primitiveAtoms: AtomicSfxPrimitiveAtoms;
  evidenceAtomKeys: string[];
  reasons: string[];
  northstar: {
    sourceOfTruth: 'primitive-atoms';
    selectsAssets: false;
    callsExternalApis: false;
    compatibilityTokenOnly: true;
  };
}

export function evaluateAtomicSfxAssetCandidate(
  form: AtomicSfxForm,
  candidate: AtomicSfxAssetCandidate | null | undefined,
): AtomicSfxCandidateEvaluation {
  if (!form.shouldPlace || form.compatibilityToken === 'none') {
    return {
      accepted: false,
      decision: 'silence',
      score: 0,
      qualityFloor: form.asset.qualityFloor,
      candidateSource: 'unknown',
      candidateTitle: '',
      matchedTerms: [],
      avoidTermsHit: [],
      durationOk: true,
      reasons: ['form-resolved-silence'],
    };
  }

  if (!candidate) {
    return {
      accepted: false,
      decision: fallbackDecision(form),
      score: 0,
      qualityFloor: form.asset.qualityFloor,
      candidateSource: 'unknown',
      candidateTitle: '',
      matchedTerms: [],
      avoidTermsHit: [],
      durationOk: false,
      reasons: ['library-miss'],
    };
  }

  const candidateSource = normalizeCandidateSource(candidate.source);
  const candidateTitle = candidateTitleText(candidate);
  const searchText = candidateSearchText(candidate);
  const hasTitleEvidence = searchText.length > 0;
  const durationSec = typeof candidate.durationMs === 'number' && Number.isFinite(candidate.durationMs)
    ? candidate.durationMs / 1000
    : undefined;
  const durationOk = durationSec === undefined || durationSec <= form.asset.maxDurationSec + 1;
  const sourceOk = candidateSource === 'unknown'
    ? true
    : form.asset.sourcePreference.includes(candidateSource);
  const tokenMatches = hasTitleEvidence && tokenTitleMatches(form.compatibilityToken, searchText);
  const matchedTerms = hasTitleEvidence
    ? form.asset.queryTerms.filter((term) => termMatchesTitle(term, searchText))
    : [];
  const avoidTermsHit = hasTitleEvidence
    ? form.asset.avoidTerms.filter((term) => termMatchesTitle(term, searchText))
    : [];
  const textureTermsHit = hasTitleEvidence
    ? form.asset.textureTerms.filter((term) => termMatchesTitle(term, searchText))
    : [];

  let score = 0;
  if (sourceOk) score += 0.18;
  if (durationOk) score += 0.18;
  if (tokenMatches) score += 0.34;
  if (matchedTerms.length > 0) score += Math.min(0.2, matchedTerms.length * 0.08);
  if (textureTermsHit.length > 0) score += Math.min(0.12, textureTermsHit.length * 0.04);
  if (avoidTermsHit.length === 0) score += 0.16;
  if (!hasTitleEvidence) score += 0.22;
  if (!sourceOk) score -= 0.16;
  if (!durationOk) score -= 0.28;
  if (avoidTermsHit.length > 0) score -= Math.min(0.36, avoidTermsHit.length * 0.18);

  const effectiveFloor = effectiveAssetQualityFloor(form, candidateSource, hasTitleEvidence);
  const hardRejected = !durationOk
    || avoidTermsHit.length > 0
    || (hasTitleEvidence && !tokenMatches && matchedTerms.length === 0);
  const accepted = !hardRejected && score >= effectiveFloor;
  const reasons = [
    accepted ? 'candidate-accepted' : 'candidate-rejected',
    `score:${format2(clamp01(score))}`,
    `floor:${format2(effectiveFloor)}`,
    ...(effectiveFloor !== form.asset.qualityFloor ? [`base-floor:${format2(form.asset.qualityFloor)}`] : []),
    `source:${candidateSource}`,
    ...(hasTitleEvidence ? [] : ['metadata-light-candidate']),
    ...(tokenMatches ? ['token-match'] : []),
    ...(matchedTerms.length > 0 ? [`matched:${matchedTerms.join(',')}`] : []),
    ...(textureTermsHit.length > 0 ? [`texture:${textureTermsHit.join(',')}`] : []),
    ...(avoidTermsHit.length > 0 ? [`avoid-hit:${avoidTermsHit.join(',')}`] : []),
    ...(durationOk ? [] : [`duration-too-long:${durationSec?.toFixed(2) ?? 'unknown'}s`]),
    ...(sourceOk ? [] : ['source-not-preferred']),
    ...(!accepted ? [`fallback:${form.asset.fallbackPolicy}`] : []),
  ];

  return {
    accepted,
    decision: accepted ? 'accept' : fallbackDecision(form),
    score: clamp01(score),
    qualityFloor: effectiveFloor,
    candidateSource,
    candidateTitle,
    matchedTerms,
    avoidTermsHit,
    durationOk,
    reasons,
  };
}

export function resolveAtomicSfxForm(input: {
  signals?: Record<string, unknown>;
  params?: Record<string, unknown>;
  momentBundle?: AtomicMomentBundle;
  frame?: number;
  durationFrames?: number;
  sceneRemainingFrames?: number;
}): AtomicSfxForm {
  const signals = input.momentBundle
    ? { ...momentBundleToSignalMap(input.momentBundle), ...(input.signals ?? {}) }
    : input.signals ?? {};
  const params = input.params ?? {};
  const sceneRemainingFrames = Math.max(1, Math.round(input.sceneRemainingFrames ?? 90));
  const cue = [
    paramString(params, 'sfxCue'),
    paramString(params, 'sfxType'),
    paramString(params, 'audioDescription'),
    paramString(params, 'intent'),
  ].filter(Boolean).join(' ').toLowerCase();

  const speechEnergy = signalNumber(signals, 'speech_energy', 'speech.energy');
  const wordImportance = signalNumber(signals, 'word_importance', 'word.importance');
  const beatStrength = signalNumber(signals, 'beat_strength', 'audio.music_beat', 'beat.strength');
  const musicEnergy = signalNumber(signals, 'music_energy', 'audio.music_energy');
  const emotion = signalNumber(signals, 'emotion_intensity', 'emotional_arousal', 'speech.emotion_intensity');
  const topicShift = signalNumber(signals, 'topic_shift', 'composite.narrative_pressure', 'topic.shift');
  const cinematic = signalNumber(signals, 'cinematic_moment', 'composite.cinematic_moment');
  const visualSignificance = signalNumber(signals, 'visual_significance', 'visual.significance');
  const motionIntensity = signalNumber(signals, 'motion_intensity', 'visual.motion_intensity');
  const textPressure = Math.max(
    signalNumber(signals, 'text_on_screen', 'visual.text_on_screen'),
    signalNumber(signals, 'text_coverage', 'visual.text_coverage'),
  );
  const visualComplexity = signalNumber(signals, 'visual_complexity', 'visual.complexity');
  const faceAttention = Math.max(
    signalNumber(signals, 'face_present', 'visual.face_present'),
    signalNumber(signals, 'visual_eye_contact', 'visual.eye_contact', 'eye_contact'),
  );
  const activeOverlays = clamp01(signalRawNumber(
    signals,
    'active_overlay_count',
    'active_overlays_count',
    'structural.active_overlays_count',
  ) / 3);
  const brandRestraint = signalNumber(signals, 'brand.restraint', 'restraint');

  const intensity = clamp01(Math.max(
    wordImportance,
    speechEnergy * 0.92,
    beatStrength,
    musicEnergy * 0.76,
    emotion * 0.86,
    topicShift * 0.8,
    cinematic,
    visualSignificance * 0.78,
    motionIntensity * 0.74,
    cue ? 0.58 : 0,
  ));
  const mixPressure = clamp01(Math.max(
    speechEnergy * 0.72,
    textPressure * 0.54,
    visualComplexity * 0.46,
    faceAttention * 0.42,
    activeOverlays,
  ));
  const restraint = clamp01(Math.max(brandRestraint, mixPressure * 0.42, textPressure * 0.34));
  const compatibilityToken = resolveCompatibilityToken({
    cue,
    intensity,
    speechEnergy,
    wordImportance,
    beatStrength,
    topicShift,
    motionIntensity,
    cinematic,
    visualSignificance,
    restraint,
  });
  const explicitAnchor = paramAnchor(params);
  const anchor = explicitAnchor ?? resolveAnchor({
    compatibilityToken,
    beatStrength,
    wordImportance,
    motionIntensity,
    topicShift,
    cue,
  });
  const syncFrame = resolveSyncFrame({
    params,
    anchor,
    fallbackFrame: input.frame,
    bundleFrame: input.momentBundle?.rhythm.anchorFrame,
  });
  const shouldPlace = resolveShouldPlace({
    compatibilityToken,
    intensity,
    mixPressure,
    restraint,
    cue,
  });
  const intent = shouldPlace ? resolveIntent(compatibilityToken) : 'silence';
  const timing = resolveTiming({
    token: shouldPlace ? compatibilityToken : 'none',
    anchor,
    syncFrame,
    explicitDuration: input.durationFrames ?? paramNumber(params, 'durationFrames'),
    sceneRemainingFrames,
    intensity,
  });
  const texture = resolveTexture({
    token: shouldPlace ? compatibilityToken : 'none',
    cue,
    restraint,
    visualComplexity,
    emotion,
  });
  const transientSharpness = resolveTransientSharpness(shouldPlace ? compatibilityToken : 'none', intensity, restraint);
  const brightness = resolveBrightness(shouldPlace ? compatibilityToken : 'none', texture, emotion);
  const lowEndWeight = resolveLowEndWeight(shouldPlace ? compatibilityToken : 'none', beatStrength, cinematic);
  const mix = resolveMix({
    token: shouldPlace ? compatibilityToken : 'none',
    intensity,
    restraint,
    mixPressure,
    speechEnergy,
    transientSharpness,
    timing,
  });
  const asset = resolveAssetPlan({
    token: shouldPlace ? compatibilityToken : 'none',
    texture,
    cue,
    timing,
    intensity,
    restraint,
  });
  const primitiveAtoms = resolvePrimitiveAtoms({
    shouldPlace,
    intent,
    compatibilityToken: shouldPlace ? compatibilityToken : 'none',
    texture,
    intensity,
    beatStrength,
    timing,
    mix,
    asset,
    transientSharpness,
    brightness,
    lowEndWeight,
    mixPressure,
  });

  return {
    version: 'atomic-sfx-form-v1',
    shouldPlace,
    intent,
    compatibilityToken: shouldPlace ? compatibilityToken : 'none',
    texture,
    intensity,
    restraint,
    mixPressure,
    transientSharpness,
    brightness,
    lowEndWeight,
    timing,
    mix,
    asset,
    primitiveAtoms,
    evidenceAtomKeys: evidenceAtomKeys(input.momentBundle, signals),
    reasons: buildReasons({
      shouldPlace,
      compatibilityToken,
      anchor,
      intensity,
      restraint,
      mixPressure,
      cue,
    }),
    northstar: {
      sourceOfTruth: 'primitive-atoms',
      selectsAssets: false,
      callsExternalApis: false,
      compatibilityTokenOnly: true,
    },
  };
}

function resolveCompatibilityToken(input: {
  cue: string;
  intensity: number;
  speechEnergy: number;
  wordImportance: number;
  beatStrength: number;
  topicShift: number;
  motionIntensity: number;
  cinematic: number;
  visualSignificance: number;
  restraint: number;
}): AtomicSfxCompatibilityToken {
  const cue = input.cue;
  if (/\b(ambient|room tone|roomtone|traffic|wind|rain|ocean|waves|forest|crowd|chatter|hum|tone)\b/.test(cue)) return 'ambient';
  if (/\b(riser|rise|swell|build|reverse cymbal|cymbal)\b/.test(cue)) return 'riser';
  if (/\b(click|tick|ding|beep|blip|chime|notification|snap)\b/.test(cue)) return 'tick';
  if (/\b(shimmer|sparkle|shine|glint|magic|twinkle)\b/.test(cue)) return 'shimmer';
  if (/\b(whoosh|swoosh|swish|whip|sweep|swoop)\b/.test(cue)) return 'whoosh';
  if (/\b(footstep|rustle|cloth|paper|door|cup|glass|keyboard|typing|breath|gasp)\b/.test(cue)) return 'foley';
  if (/\b(impact|hit|boom|thud|slam|punch|drop|bass)\b/.test(cue)) return 'impact';

  if (input.motionIntensity >= 0.72 && input.restraint < 0.68) return 'whoosh';
  if (Math.max(input.beatStrength, input.cinematic, input.wordImportance, input.speechEnergy) >= 0.68) return 'impact';
  if (input.topicShift >= 0.72 && input.intensity < 0.56) return 'ambient';
  if (input.visualSignificance >= 0.64 && input.restraint < 0.52) return 'shimmer';
  return 'none';
}

function resolveAnchor(input: {
  compatibilityToken: AtomicSfxCompatibilityToken;
  beatStrength: number;
  wordImportance: number;
  motionIntensity: number;
  topicShift: number;
  cue: string;
}): AtomicSfxSyncAnchor {
  if (input.compatibilityToken === 'ambient') return 'scene-bed';
  if (/\b(mg|graphic|title|text|caption)\b/.test(input.cue)) return 'mg-landing';
  if (input.topicShift >= 0.72) return 'transition';
  if (input.motionIntensity >= Math.max(input.beatStrength, input.wordImportance, 0.62)) return 'motion-peak';
  if (input.beatStrength >= input.wordImportance) return 'beat';
  return 'keyword';
}

function resolveShouldPlace(input: {
  compatibilityToken: AtomicSfxCompatibilityToken;
  intensity: number;
  mixPressure: number;
  restraint: number;
  cue: string;
}): boolean {
  if (input.compatibilityToken === 'none') return false;
  const explicitCue = input.cue.length > 0;
  if (explicitCue && input.compatibilityToken === 'ambient') return true;
  if (input.mixPressure >= 0.92 && input.restraint >= 0.72) return false;
  const threshold = 0.38 + input.restraint * 0.18;
  return input.intensity >= threshold || explicitCue;
}

function resolveIntent(token: AtomicSfxCompatibilityToken): AtomicSfxIntent {
  switch (token) {
    case 'impact':
      return 'impact-accent';
    case 'whoosh':
      return 'motion-accent';
    case 'riser':
      return 'tension-riser';
    case 'tick':
      return 'ui-punctuation';
    case 'ambient':
      return 'ambient-bed';
    case 'foley':
      return 'foley-detail';
    case 'shimmer':
      return 'resolution-shimmer';
    case 'none':
      return 'silence';
  }
}

function resolveTiming(input: {
  token: AtomicSfxCompatibilityToken;
  anchor: AtomicSfxSyncAnchor;
  syncFrame: number;
  explicitDuration?: number;
  sceneRemainingFrames: number;
  intensity: number;
}): AtomicSfxTiming {
  const durationFrames = clampFrames(
    input.explicitDuration ?? defaultDurationFrames(input.token, input.sceneRemainingFrames, input.intensity),
    1,
    input.token === 'ambient' ? Math.max(30, input.sceneRemainingFrames) : 120,
  );
  const preRollFrames = preRollFor(input.token, input.intensity);
  const startFrame = Math.max(0, input.syncFrame - preRollFrames);
  const endFrame = Math.max(startFrame + 1, startFrame + durationFrames);
  const attackFrames = attackFor(input.token, input.intensity);
  const tailFrames = Math.max(1, Math.min(durationFrames, tailFor(input.token, input.intensity)));

  return {
    syncFrame: input.syncFrame,
    startFrame,
    endFrame,
    durationFrames,
    preRollFrames,
    attackFrames,
    tailFrames,
    sourceOffsetFrames: 0,
    anchor: input.anchor,
  };
}

function resolveSyncFrame(input: {
  params: Record<string, unknown>;
  anchor: AtomicSfxSyncAnchor;
  fallbackFrame?: number;
  bundleFrame?: number;
}): number {
  const anchorSpecificFrame = frameForAnchor(input.params, input.anchor);
  return Math.max(0, Math.round(
    anchorSpecificFrame
      ?? paramNumber(input.params, 'syncFrame')
      ?? paramNumber(input.params, 'anchorFrame')
      ?? input.fallbackFrame
      ?? paramNumber(input.params, 'frame')
      ?? input.bundleFrame
      ?? 0,
  ));
}

function frameForAnchor(
  params: Record<string, unknown>,
  anchor: AtomicSfxSyncAnchor,
): number | undefined {
  switch (anchor) {
    case 'transition':
      return firstFrameParam(params, ['transitionFrame', 'boundaryFrame', 'cutFrame']);
    case 'beat':
      return firstFrameParam(params, ['beatFrame', 'musicBeatFrame']);
    case 'motion-peak':
      return firstFrameParam(params, ['motionPeakFrame', 'visualPeakFrame']);
    case 'mg-landing':
      return firstFrameParam(params, ['mgLandingFrame', 'graphicLandingFrame', 'linkedOverlayFrame']);
    case 'keyword':
      return firstFrameParam(params, ['keywordFrame', 'wordFrame', 'phraseFrame']);
    case 'scene-bed':
      return firstFrameParam(params, ['sceneStartFrame']);
  }
}

function firstFrameParam(params: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = paramNumber(params, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function paramAnchor(params: Record<string, unknown>): AtomicSfxSyncAnchor | undefined {
  const value = paramString(params, 'sfxAnchor') ?? paramString(params, 'syncAnchor') ?? paramString(params, 'anchor');
  if (!value) return undefined;
  return SFX_SYNC_ANCHORS.has(value as AtomicSfxSyncAnchor)
    ? value as AtomicSfxSyncAnchor
    : undefined;
}

function resolveMix(input: {
  token: AtomicSfxCompatibilityToken;
  intensity: number;
  restraint: number;
  mixPressure: number;
  speechEnergy: number;
  transientSharpness: number;
  timing: AtomicSfxTiming;
}): AtomicSfxMix {
  const base = baseVolumeFor(input.token);
  const pressureTrim = input.mixPressure * 0.16 + input.restraint * 0.2;
  const volume = input.token === 'none'
    ? 0
    : clampRange(base * (0.78 + input.intensity * 0.42) - pressureTrim, 0.08, 0.58);
  const duckUnderSpeech = input.speechEnergy >= 0.54 && input.token !== 'ambient' && input.token !== 'none';

  return {
    volume,
    loudnessTarget: clampRange(0.24 + volume * 0.9 + input.transientSharpness * 0.12, 0, 0.78),
    duckUnderSpeech,
    duckLevel: duckUnderSpeech ? clampRange(0.62 + input.restraint * 0.18, 0.55, 0.82) : 1,
    fadeInFrames: input.token === 'ambient' || input.token === 'riser' ? Math.min(12, input.timing.attackFrames) : 0,
    fadeOutFrames: input.token === 'tick' || input.token === 'none' ? 0 : Math.min(12, input.timing.tailFrames),
  };
}

function resolveAssetPlan(input: {
  token: AtomicSfxCompatibilityToken;
  texture: AtomicSfxTexture;
  cue: string;
  timing: AtomicSfxTiming;
  intensity: number;
  restraint: number;
}): AtomicSfxAssetPlan {
  const queryTerms = queryTermsFor(input.token, input.texture, input.cue);
  return {
    primarySearchToken: input.token,
    queryTerms,
    textureTerms: textureTermsFor(input.texture),
    avoidTerms: avoidTermsFor(input.token, input.restraint),
    maxDurationSec: Math.max(1, Math.ceil(input.timing.durationFrames / 30)),
    sourcePreference: sourcePreferenceFor(input.token, input.intensity),
    qualityFloor: clampRange(0.56 + input.intensity * 0.16 + input.restraint * 0.08, 0.56, 0.82),
    fallbackPolicy: fallbackPolicyFor(input.token, input.restraint),
  };
}

function resolvePrimitiveAtoms(input: {
  shouldPlace: boolean;
  intent: AtomicSfxIntent;
  compatibilityToken: AtomicSfxCompatibilityToken;
  texture: AtomicSfxTexture;
  intensity: number;
  beatStrength: number;
  timing: AtomicSfxTiming;
  mix: AtomicSfxMix;
  asset: AtomicSfxAssetPlan;
  transientSharpness: number;
  brightness: number;
  lowEndWeight: number;
  mixPressure: number;
}): AtomicSfxPrimitiveAtoms {
  return {
    transient: {
      sharpness: input.transientSharpness,
      attackFrames: input.timing.attackFrames,
      onset: onsetFor(input.timing.attackFrames, input.transientSharpness),
    },
    tail: {
      weight: tailWeightFor(input.compatibilityToken, input.timing.tailFrames, input.timing.durationFrames),
      tailFrames: input.timing.tailFrames,
      release: releaseFor(input.compatibilityToken, input.timing.tailFrames),
    },
    tone: {
      brightness: input.brightness,
      lowEndWeight: input.lowEndWeight,
      texture: input.texture,
      textureTerms: input.asset.textureTerms,
    },
    rhythm: {
      syncAnchor: input.timing.anchor,
      preRollFrames: input.timing.preRollFrames,
      sourceOffsetFrames: input.timing.sourceOffsetFrames,
      beatSnapStrength: clamp01(input.beatStrength * (input.timing.anchor === 'beat' ? 1 : 0.48)),
    },
    mix: {
      volume: input.mix.volume,
      duckUnderSpeech: input.mix.duckUnderSpeech,
      duckLevel: input.mix.duckLevel,
      mixPressure: input.mixPressure,
    },
    role: {
      intent: input.intent,
      emotionalRole: emotionalRoleFor(input.intent, input.intensity),
      compatibilityToken: input.compatibilityToken,
    },
    policy: {
      fallback: input.asset.fallbackPolicy,
      silenceAllowed: !input.shouldPlace || input.asset.fallbackPolicy === 'silence',
      qualityFloor: input.asset.qualityFloor,
    },
  };
}

function resolveTexture(input: {
  token: AtomicSfxCompatibilityToken;
  cue: string;
  restraint: number;
  visualComplexity: number;
  emotion: number;
}): AtomicSfxTexture {
  if (input.restraint >= 0.72) return 'luxury-subtle';
  if (input.token === 'ambient') return 'ambient-natural';
  if (input.token === 'foley') return 'soft-organic';
  if (input.token === 'tick') return 'tech-ui';
  if (/\b(cinematic|film|bass|trailer)\b/.test(input.cue)) return 'clean-cinematic';
  if (input.emotion >= 0.74 && input.visualComplexity < 0.62) return 'creator-punch';
  return 'clean-cinematic';
}

function resolveTransientSharpness(token: AtomicSfxCompatibilityToken, intensity: number, restraint: number): number {
  const base = token === 'impact' ? 0.82
    : token === 'tick' ? 0.78
      : token === 'whoosh' ? 0.46
        : token === 'foley' ? 0.36
          : token === 'shimmer' ? 0.3
            : token === 'riser' ? 0.18
              : token === 'ambient' ? 0.08
                : 0;
  return clamp01(base + intensity * 0.14 - restraint * 0.16);
}

function resolveBrightness(token: AtomicSfxCompatibilityToken, texture: AtomicSfxTexture, emotion: number): number {
  const textureBoost = texture === 'tech-ui' || texture === 'creator-punch' ? 0.18 : 0;
  const base = token === 'shimmer' || token === 'tick' ? 0.68
    : token === 'whoosh' ? 0.48
      : token === 'impact' ? 0.34
        : token === 'ambient' ? 0.24
          : 0.38;
  return clamp01(base + textureBoost + emotion * 0.08);
}

function resolveLowEndWeight(token: AtomicSfxCompatibilityToken, beatStrength: number, cinematic: number): number {
  if (token !== 'impact') return token === 'riser' ? 0.22 : 0.08;
  return clamp01(0.38 + beatStrength * 0.34 + cinematic * 0.22);
}

function defaultDurationFrames(token: AtomicSfxCompatibilityToken, sceneRemainingFrames: number, intensity: number): number {
  switch (token) {
    case 'ambient':
      return Math.max(30, Math.min(sceneRemainingFrames, 180));
    case 'riser':
      return Math.round(42 + intensity * 24);
    case 'whoosh':
      return Math.round(14 + intensity * 8);
    case 'impact':
      return Math.round(10 + (1 - intensity) * 8);
    case 'tick':
      return 6;
    case 'shimmer':
      return Math.round(20 + intensity * 12);
    case 'foley':
      return Math.round(12 + intensity * 8);
    case 'none':
      return 1;
  }
}

function preRollFor(token: AtomicSfxCompatibilityToken, intensity: number): number {
  switch (token) {
    case 'riser':
      return Math.round(30 + intensity * 18);
    case 'whoosh':
      return Math.round(4 + intensity * 5);
    case 'impact':
      return Math.max(1, Math.round(3 - intensity));
    case 'shimmer':
      return 2;
    case 'foley':
      return 1;
    case 'ambient':
    case 'tick':
    case 'none':
      return 0;
  }
}

function attackFor(token: AtomicSfxCompatibilityToken, intensity: number): number {
  if (token === 'riser') return Math.round(18 + intensity * 8);
  if (token === 'ambient') return 12;
  if (token === 'whoosh') return 4;
  if (token === 'shimmer') return 5;
  return 1;
}

function tailFor(token: AtomicSfxCompatibilityToken, intensity: number): number {
  if (token === 'ambient') return 30;
  if (token === 'riser') return 8;
  if (token === 'impact') return Math.round(8 + (1 - intensity) * 8);
  if (token === 'shimmer') return 14;
  if (token === 'whoosh') return 10;
  return 4;
}

function baseVolumeFor(token: AtomicSfxCompatibilityToken): number {
  switch (token) {
    case 'impact':
      return 0.46;
    case 'whoosh':
      return 0.34;
    case 'riser':
      return 0.26;
    case 'tick':
      return 0.24;
    case 'shimmer':
      return 0.22;
    case 'ambient':
      return 0.16;
    case 'foley':
      return 0.3;
    case 'none':
      return 0;
  }
}

function queryTermsFor(token: AtomicSfxCompatibilityToken, texture: AtomicSfxTexture, cue: string): string[] {
  const terms = new Set<string>();
  if (token !== 'none') terms.add(token);
  if (texture === 'clean-cinematic') terms.add('cinematic');
  if (texture === 'creator-punch') terms.add('punchy');
  if (texture === 'luxury-subtle') terms.add('soft');
  if (texture === 'tech-ui') terms.add('digital');
  if (texture === 'ambient-natural') terms.add('room-tone');
  if (cue) {
    for (const word of cue.replace(/[^\w\s-]/g, ' ').split(/\s+/)) {
      if (word.length >= 4 && !SFX_STOP_WORDS.has(word)) terms.add(word);
      if (terms.size >= 5) break;
    }
  }
  if (terms.size === 0) terms.add('ambient');
  return [...terms].slice(0, 5);
}

function textureTermsFor(texture: AtomicSfxTexture): string[] {
  switch (texture) {
    case 'clean-cinematic':
      return ['clean', 'cinematic', 'smooth'];
    case 'creator-punch':
      return ['punchy', 'snap', 'impact'];
    case 'soft-organic':
      return ['soft', 'organic', 'natural'];
    case 'tech-ui':
      return ['digital', 'ui', 'interface'];
    case 'ambient-natural':
      return ['ambient', 'room', 'natural'];
    case 'luxury-subtle':
      return ['subtle', 'soft', 'minimal'];
  }
}

function avoidTermsFor(token: AtomicSfxCompatibilityToken, restraint: number): string[] {
  const terms = ['distorted', 'noisy', 'clipping', 'vocal'];
  if (restraint >= 0.55) terms.push('harsh', 'explosion', 'meme');
  if (token === 'ambient') terms.push('melody', 'music', 'speech');
  return terms;
}

function sourcePreferenceFor(token: AtomicSfxCompatibilityToken, intensity: number): Array<'library' | 'generated'> {
  if (token === 'none') return ['library'];
  if (token === 'ambient' && intensity < 0.72) return ['library', 'generated'];
  return ['library'];
}

function fallbackPolicyFor(token: AtomicSfxCompatibilityToken, restraint: number): AtomicSfxFallbackPolicy {
  if (token === 'none') return 'silence';
  if (restraint >= 0.74) return 'silence';
  if (token === 'ambient') return 'subtle-bed-only';
  if (token === 'riser') return 'generated-candidate-allowed';
  return 'library-first';
}

function effectiveAssetQualityFloor(
  form: AtomicSfxForm,
  candidateSource: AtomicSfxCandidateSource,
  hasTitleEvidence: boolean,
): number {
  let floor = form.asset.qualityFloor;
  if (!hasTitleEvidence) floor = Math.min(floor, 0.64);
  return floor;
}

function fallbackDecision(form: AtomicSfxForm): AtomicSfxCandidateEvaluation['decision'] {
  return form.asset.fallbackPolicy === 'silence'
    ? 'silence'
    : 'reject';
}

function onsetFor(attackFrames: number, sharpness: number): AtomicSfxPrimitiveAtoms['transient']['onset'] {
  if (attackFrames >= 12) return 'slow-build';
  if (sharpness >= 0.72) return 'instant';
  if (attackFrames <= 4) return 'fast';
  return 'soft';
}

function releaseFor(token: AtomicSfxCompatibilityToken, tailFrames: number): AtomicSfxPrimitiveAtoms['tail']['release'] {
  if (token === 'ambient') return 'long-bed';
  if (tailFrames >= 12) return 'medium';
  if (tailFrames >= 5) return 'short';
  return 'dry';
}

function tailWeightFor(token: AtomicSfxCompatibilityToken, tailFrames: number, durationFrames: number): number {
  if (token === 'ambient') return 1;
  return clamp01(tailFrames / Math.max(1, durationFrames));
}

function emotionalRoleFor(intent: AtomicSfxIntent, intensity: number): AtomicSfxEmotionalRole {
  switch (intent) {
    case 'impact-accent':
      return intensity >= 0.72 ? 'punctuate' : 'ground';
    case 'motion-accent':
      return 'lift';
    case 'tension-riser':
      return 'build';
    case 'ui-punctuation':
      return 'punctuate';
    case 'ambient-bed':
    case 'foley-detail':
      return 'texture';
    case 'resolution-shimmer':
      return 'relief';
    case 'silence':
      return 'none';
  }
}

function normalizeCandidateSource(source: string | undefined): AtomicSfxCandidateSource {
  if (!source) return 'unknown';
  const normalized = source.toLowerCase();
  if (normalized === 'generated' || normalized.includes('generated')) return 'generated';
  if (
    normalized === 'catalog'
    || normalized === 'freesound'
    || normalized === 'pixabay'
    || normalized.includes('library')
  ) return 'library';
  return 'unknown';
}

function candidateTitleText(candidate: AtomicSfxAssetCandidate): string {
  return [
    candidate.originalTitle,
    candidate.title,
    candidate.filename,
  ]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? '';
}

function candidateSearchText(candidate: AtomicSfxAssetCandidate): string {
  return [
    candidateTitleText(candidate),
    ...(candidate.tags ?? []),
    candidate.providerId,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function tokenTitleMatches(token: AtomicSfxCompatibilityToken, title: string): boolean {
  return TOKEN_TITLE_ALIASES[token].some((term) => termMatchesTitle(term, title));
}

function termMatchesTitle(term: string, title: string): boolean {
  if (!term || !title) return false;
  const normalized = term.toLowerCase().replace(/[-_]/g, ' ').trim();
  if (!normalized) return false;
  return new RegExp(`\\b${escapeRegExp(normalized)}`).test(title.replace(/[-_]/g, ' '));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function evidenceAtomKeys(bundle: AtomicMomentBundle | undefined, signals: Record<string, unknown>): string[] {
  if (bundle) {
    return [...bundle.primitiveAtoms, ...bundle.derivedAtoms]
      .sort((a, b) => b.strength - a.strength || a.key.localeCompare(b.key))
      .slice(0, 8)
      .map((atom) => atom.key);
  }
  return Object.entries(signals)
    .filter(([, value]) => typeof value === 'number' ? value > 0 : Boolean(value))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 8)
    .map(([key]) => key);
}

function buildReasons(input: {
  shouldPlace: boolean;
  compatibilityToken: AtomicSfxCompatibilityToken;
  anchor: AtomicSfxSyncAnchor;
  intensity: number;
  restraint: number;
  mixPressure: number;
  cue: string;
}): string[] {
  if (!input.shouldPlace) {
    return [
      input.compatibilityToken === 'none' ? 'no-sfx-token-from-atoms' : `suppressed:${input.compatibilityToken}`,
      `intensity:${format2(input.intensity)}`,
      `restraint:${format2(input.restraint)}`,
      `mix-pressure:${format2(input.mixPressure)}`,
    ];
  }

  return [
    `token:${input.compatibilityToken}`,
    `anchor:${input.anchor}`,
    `intensity:${format2(input.intensity)}`,
    `restraint:${format2(input.restraint)}`,
    ...(input.cue ? ['explicit-cue'] : []),
  ];
}

function signalNumber(source: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return clamp01(value);
    if (typeof value === 'boolean') return value ? 1 : 0;
  }
  return 0;
}

function signalRawNumber(source: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
    if (typeof value === 'boolean') return value ? 1 : 0;
  }
  return 0;
}

function paramNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function paramString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function clampFrames(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clamp01(value: number): number {
  return clampRange(value, 0, 1);
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function format2(value: number): string {
  return value.toFixed(2);
}

const SFX_STOP_WORDS = new Set([
  'sound',
  'sounds',
  'effect',
  'effects',
  'audio',
  'with',
  'from',
  'that',
  'this',
  'clean',
  'soft',
  'subtle',
  'loud',
  'quick',
]);

const SFX_SYNC_ANCHORS = new Set<AtomicSfxSyncAnchor>([
  'keyword',
  'beat',
  'motion-peak',
  'transition',
  'mg-landing',
  'scene-bed',
]);

const TOKEN_TITLE_ALIASES: Record<AtomicSfxCompatibilityToken, string[]> = {
  none: [],
  impact: ['impact', 'hit', 'boom', 'thud', 'slam', 'punch', 'drop', 'bass'],
  whoosh: ['whoosh', 'swoosh', 'swish', 'whip', 'sweep'],
  riser: ['riser', 'rise', 'swell', 'build', 'cymbal'],
  tick: ['tick', 'click', 'ding', 'beep', 'blip', 'chime', 'notification', 'snap'],
  shimmer: ['shimmer', 'sparkle', 'shine', 'glint', 'twinkle'],
  ambient: ['ambient', 'room', 'tone', 'traffic', 'wind', 'rain', 'ocean', 'forest', 'crowd', 'chatter', 'hum'],
  foley: ['foley', 'footstep', 'rustle', 'cloth', 'paper', 'door', 'cup', 'glass', 'keyboard', 'typing', 'breath'],
};
