export type AtomicCaptionStyle =
  | 'tiktok'
  | 'minimal'
  | 'bold'
  | 'karaoke'
  | 'subtitle'
  | 'hormozi'
  | 'mrbeast'
  | 'ali-abdaal'
  | 'corporate';

export type AtomicCaptionDisplayMode =
  | 'word-by-word'
  | 'phrase'
  | 'karaoke'
  | 'subtitle'
  | 'instagram'
  | 'hormozi';

export type CaptionGenreParams = {
  formality?: number;
  energy_baseline?: number;
  pacing_tolerance?: number;
};

export type AtomicCaptionLayout = 'compact-lower' | 'balanced-lower' | 'subtitle-lower';
export type AtomicCaptionSurface = 'transparent-shadow' | 'active-word-pill' | 'subtitle-panel';

export type AtomicCaptionAesthetic = {
  layout: AtomicCaptionLayout;
  surface: AtomicCaptionSurface;
  widthFraction: number;
  maxWidthPx: number;
  heightFraction: number;
  minHeightPx: number;
  maxHeightPx: number;
  bottomMarginFraction: number;
  fontSizePx: number;
  lineHeight: number;
  emphasisScale: number;
  shadowStrength: number;
};

export type AtomicCaptionPresentationInput = {
  requestedStyle?: string;
  profileStyle?: string;
  displayMode?: string;
  wordsPerGroup?: number;
  genreParams?: CaptionGenreParams | null;
};

export type AtomicCaptionPresentation = {
  version: 'atomic-caption-form-v1';
  style: AtomicCaptionStyle;
  displayMode: AtomicCaptionDisplayMode;
  wordsPerGroup: number;
  source: 'signals' | 'strong-style-hint' | 'style-hint' | 'fallback';
  signals: {
    formality: number;
    energy: number;
    speakingRate: number;
  };
  aesthetic: AtomicCaptionAesthetic;
};

const STYLE_ALIASES: Record<string, AtomicCaptionStyle> = {
  creator: 'bold',
  fancy: 'bold',
  kinetic: 'bold',
  'word-by-word': 'bold',
  sentence: 'subtitle',
  key_phrases: 'bold',
  'key-phrases': 'bold',
  'keyword-highlight': 'bold',
  none: 'subtitle',
};

const SUPPORTED_STYLES = new Set<AtomicCaptionStyle>([
  'tiktok',
  'minimal',
  'bold',
  'karaoke',
  'subtitle',
  'hormozi',
  'mrbeast',
  'ali-abdaal',
  'corporate',
]);

const STRONG_STYLE_HINTS = new Set<AtomicCaptionStyle>([
  'tiktok',
  'hormozi',
  'mrbeast',
  'ali-abdaal',
  'corporate',
]);

const DISPLAY_ALIASES: Record<string, AtomicCaptionDisplayMode> = {
  'word-by-word': 'word-by-word',
  word_by_word: 'word-by-word',
  phrase: 'phrase',
  key_phrases: 'phrase',
  'key-phrases': 'phrase',
  karaoke: 'karaoke',
  subtitle: 'subtitle',
  sentence: 'subtitle',
  instagram: 'instagram',
  hormozi: 'hormozi',
};

const DISPLAY_BY_STYLE: Record<AtomicCaptionStyle, AtomicCaptionDisplayMode> = {
  tiktok: 'word-by-word',
  minimal: 'phrase',
  bold: 'phrase',
  karaoke: 'karaoke',
  subtitle: 'subtitle',
  hormozi: 'hormozi',
  mrbeast: 'hormozi',
  'ali-abdaal': 'karaoke',
  corporate: 'subtitle',
};

const WORDS_BY_MODE: Record<AtomicCaptionDisplayMode, number> = {
  'word-by-word': 1,
  phrase: 4,
  karaoke: 6,
  subtitle: 10,
  instagram: 4,
  hormozi: 3,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function normalizeStyle(style?: string): AtomicCaptionStyle | undefined {
  if (!style) return undefined;
  const normalized = style.trim().toLowerCase();
  const alias = STYLE_ALIASES[normalized];
  if (alias) return alias;
  return SUPPORTED_STYLES.has(normalized as AtomicCaptionStyle)
    ? normalized as AtomicCaptionStyle
    : undefined;
}

function normalizeDisplayMode(mode?: string): AtomicCaptionDisplayMode | undefined {
  if (!mode) return undefined;
  return DISPLAY_ALIASES[mode.trim().toLowerCase()];
}

function explicitModeFromStyleHint(style?: string): AtomicCaptionDisplayMode | undefined {
  if (!style) return undefined;
  const normalized = style.trim().toLowerCase();
  if (normalized === 'word-by-word' || normalized === 'word_by_word') return 'word-by-word';
  if (normalized === 'sentence') return 'subtitle';
  if (normalized === 'key_phrases' || normalized === 'key-phrases' || normalized === 'keyword-highlight') return 'phrase';
  return undefined;
}

function presentationFromSignals(
  genreParams?: CaptionGenreParams | null,
): Pick<AtomicCaptionPresentation, 'style' | 'displayMode' | 'wordsPerGroup' | 'signals'> | null {
  if (!genreParams) return null;

  const formality = clamp01(genreParams.formality ?? 0.5);
  const energy = clamp01(genreParams.energy_baseline ?? 0.5);
  const speakingRate = Math.max(100, 220 - ((genreParams.pacing_tolerance ?? 6) * 10));

  if (formality > 0.72 && speakingRate < 145) {
    return { style: 'subtitle', displayMode: 'subtitle', wordsPerGroup: 10, signals: { formality, energy, speakingRate } };
  }
  if (energy > 0.72 && speakingRate > 160) {
    return { style: 'hormozi', displayMode: 'hormozi', wordsPerGroup: 3, signals: { formality, energy, speakingRate } };
  }
  if (formality < 0.42 && energy > 0.45) {
    return { style: 'bold', displayMode: 'instagram', wordsPerGroup: 4, signals: { formality, energy, speakingRate } };
  }
  if (formality > 0.55) {
    return { style: 'minimal', displayMode: 'karaoke', wordsPerGroup: 6, signals: { formality, energy, speakingRate } };
  }
  if (formality < 0.42) {
    return { style: 'bold', displayMode: 'phrase', wordsPerGroup: 4, signals: { formality, energy, speakingRate } };
  }

  return { style: 'minimal', displayMode: 'phrase', wordsPerGroup: 4, signals: { formality, energy, speakingRate } };
}

function captionAesthetic(
  style: AtomicCaptionStyle,
  displayMode: AtomicCaptionDisplayMode,
  signals: AtomicCaptionPresentation['signals'],
): AtomicCaptionAesthetic {
  const highEnergy = signals.energy > 0.68 || displayMode === 'hormozi' || displayMode === 'instagram';
  const subtitlePanel = displayMode === 'subtitle' || displayMode === 'karaoke' || style === 'corporate';

  if (subtitlePanel) {
    return {
      layout: 'subtitle-lower',
      surface: 'subtitle-panel',
      widthFraction: 0.74,
      maxWidthPx: 1280,
      heightFraction: 0.12,
      minHeightPx: 96,
      maxHeightPx: 150,
      bottomMarginFraction: 0.10,
      fontSizePx: 34,
      lineHeight: 1.26,
      emphasisScale: 1.04,
      shadowStrength: 0.72,
    };
  }

  if (highEnergy) {
    return {
      layout: 'compact-lower',
      surface: 'active-word-pill',
      widthFraction: 0.64,
      maxWidthPx: 980,
      heightFraction: 0.11,
      minHeightPx: 96,
      maxHeightPx: 132,
      bottomMarginFraction: 0.115,
      fontSizePx: 46,
      lineHeight: 1.06,
      emphasisScale: 1.14,
      shadowStrength: 0.92,
    };
  }

  return {
    layout: 'balanced-lower',
    surface: 'transparent-shadow',
    widthFraction: 0.68,
    maxWidthPx: 1040,
    heightFraction: 0.105,
    minHeightPx: 92,
    maxHeightPx: 130,
    bottomMarginFraction: 0.115,
    fontSizePx: 40,
    lineHeight: 1.1,
    emphasisScale: 1.08,
    shadowStrength: 0.88,
  };
}

export function resolveAtomicCaptionPresentation(input: AtomicCaptionPresentationInput): AtomicCaptionPresentation {
  const requestedStyle = normalizeStyle(input.requestedStyle);
  const profileStyle = normalizeStyle(input.profileStyle);
  const explicitDisplay = normalizeDisplayMode(input.displayMode);
  const displayHint = explicitModeFromStyleHint(input.requestedStyle)
    ?? explicitModeFromStyleHint(input.profileStyle);
  const signalPresentation = presentationFromSignals(input.genreParams);
  const strongStyle = requestedStyle && STRONG_STYLE_HINTS.has(requestedStyle) ? requestedStyle : undefined;

  const style = strongStyle
    ?? signalPresentation?.style
    ?? requestedStyle
    ?? profileStyle
    ?? 'subtitle';
  const resolvedExplicitDisplay = resolveSafeExplicitDisplay(explicitDisplay, signalPresentation?.signals);
  const displayMode = resolvedExplicitDisplay
    ?? (strongStyle ? displayHint : undefined)
    ?? signalPresentation?.displayMode
    ?? displayHint
    ?? DISPLAY_BY_STYLE[style]
    ?? 'phrase';
  const wordsPerGroup = Math.max(1, Math.min(12, Math.round(
    input.wordsPerGroup
      ?? (resolvedExplicitDisplay ? WORDS_BY_MODE[resolvedExplicitDisplay] : undefined)
      ?? (strongStyle && displayHint ? WORDS_BY_MODE[displayHint] : undefined)
      ?? signalPresentation?.wordsPerGroup
      ?? (displayHint ? WORDS_BY_MODE[displayHint] : undefined)
      ?? WORDS_BY_MODE[displayMode]
      ?? 4,
  )));
  const fallbackSignals = signalPresentation?.signals ?? {
    formality: clamp01(input.genreParams?.formality ?? 0.5),
    energy: clamp01(input.genreParams?.energy_baseline ?? 0.5),
    speakingRate: Math.max(100, 220 - ((input.genreParams?.pacing_tolerance ?? 6) * 10)),
  };
  const aesthetic = captionAesthetic(style, displayMode, fallbackSignals);

  return {
    version: 'atomic-caption-form-v1',
    style,
    displayMode,
    wordsPerGroup,
    source: strongStyle
      ? 'strong-style-hint'
      : signalPresentation
        ? 'signals'
        : requestedStyle || profileStyle
          ? 'style-hint'
          : 'fallback',
    signals: fallbackSignals,
    aesthetic,
  };
}

function resolveSafeExplicitDisplay(
  explicitDisplay: AtomicCaptionDisplayMode | undefined,
  signals: AtomicCaptionPresentation['signals'] | undefined,
): AtomicCaptionDisplayMode | undefined {
  if (explicitDisplay !== 'word-by-word' || !signals) return explicitDisplay;
  const talkingHeadReadable =
    signals.formality >= 0.58 &&
    signals.energy < 0.68 &&
    signals.speakingRate < 155;
  return talkingHeadReadable ? undefined : explicitDisplay;
}
