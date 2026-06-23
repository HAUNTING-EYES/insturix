import { BRAND_CONFIDENCE } from './brand-confidence';
import type { BrandSignalLearningWeight } from './brand-signal-edit-weighting';
import type { UnifiedBrand } from './brand-registry';

export type BrandSignalTrustLevel =
  | 'manual_user_entry'
  | 'uploaded_brand_guideline'
  | 'first_party_website'
  | 'connected_social_account'
  | 'public_social_page'
  | 'brand_api'
  | 'llm_inference'
  | 'fallback_default';

export type BrandSignalAuthorityClass =
  | 'brand_fact'
  | 'brand_constraint'
  | 'brand_preference'
  | 'voice_default'
  | 'process_default'
  | 'inferred_hint'
  | 'unsafe_or_untrusted';

export type BrandProofStyle =
  | 'testimonial'
  | 'metrics'
  | 'authority'
  | 'community'
  | 'demo'
  | 'editorial'
  | 'unknown';

export type BrandPaletteHarmony =
  | 'monochromatic'
  | 'analogous'
  | 'complementary'
  | 'split-complementary'
  | 'triadic'
  | 'tetradic'
  | 'unknown';

export interface BrandSignalEvidence {
  id: string;
  signalPath: string;
  sourceType: BrandSignalTrustLevel;
  sourceField?: string;
  sourceUrl?: string;
  excerpt?: string;
  confidence: number;
  trustLevel: BrandSignalTrustLevel;
  authorityClass: BrandSignalAuthorityClass;
  observedAt: string;
  extractor: string;
  fallbackReason?: string;
  learningWeight?: BrandSignalLearningWeight;
}

export interface BrandSignal<T> {
  value: T;
  confidence: number;
  trustLevel: BrandSignalTrustLevel;
  authorityClass: BrandSignalAuthorityClass;
  evidenceIds: string[];
  fallbackReason?: string;
}

export interface BrandSignalProfile {
  version: 1;
  brandId?: string;
  userId?: string;
  orgId?: string;
  generatedAt: string;
  identity: {
    brandName: BrandSignal<string>;
    industry?: BrandSignal<string>;
    category: BrandSignal<string>;
    audience: BrandSignal<string[]>;
    productServices?: BrandSignal<string[]>;
    proofStyle: BrandSignal<BrandProofStyle>;
  };
  assets?: {
    productImages: BrandSignal<string[]>;
    socialPreviewImages?: BrandSignal<string[]>;
  };
  palette: {
    primary?: BrandSignal<string>;
    accent?: BrandSignal<string>;
    neutrals: BrandSignal<string[]>;
    supporting: BrandSignal<string[]>;
    unsafeOnDark: BrandSignal<string[]>;
    unsafeOnLight: BrandSignal<string[]>;
    contrastBias: BrandSignal<number>;
    harmony: BrandSignal<BrandPaletteHarmony>;
  };
  typography: {
    raw?: BrandSignal<string>;
    category: BrandSignal<'serif' | 'sans' | 'slab' | 'mono' | 'display' | 'mixed' | 'unknown'>;
    casingBias: BrandSignal<'sentence' | 'title' | 'uppercase' | 'lowercase' | 'mixed' | 'unknown'>;
  };
  visual: Record<
    | 'minimalism'
    | 'densityTolerance'
    | 'dataVizAffinity'
    | 'expressiveness'
    | 'geometryTendency'
    | 'decorationTolerance'
    | 'cornerRadiusBias'
    | 'layoutSymmetry'
    | 'contrastPreference',
    BrandSignal<number>
  >;
  motion: Record<'motionEnergy' | 'overshootTolerance' | 'transitionSharpness' | 'rhythmRegularity', BrandSignal<number>>;
  voice: {
    assertiveness: BrandSignal<number>;
    warmth: BrandSignal<number>;
    jargonDensity: BrandSignal<number>;
    humor: BrandSignal<number>;
    defaultFormality: BrandSignal<number>;
    ctaDirectness: BrandSignal<number>;
    recurringPhrases: BrandSignal<string[]>;
    killList: BrandSignal<string[]>;
    hookArchetypes: BrandSignal<string[]>;
  };
  evidence: BrandSignalEvidence[];
}

export interface DeriveBrandSignalProfileOptions {
  generatedAt?: string;
  extractor?: string;
}

const DARK_SURFACE = '#0b0b0f';
const LIGHT_SURFACE = '#ffffff';

export function deriveBrandSignalProfile(
  brand: UnifiedBrand | null | undefined,
  options: DeriveBrandSignalProfileOptions = {},
): BrandSignalProfile {
  const evidence: BrandSignalEvidence[] = [];
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const extractor = options.extractor ?? 'brand-signal-profile.v1';

  const makeSignal = <T>(
    path: string,
    value: T,
    confidence: number,
    authorityClass: BrandSignalAuthorityClass,
    sourceField?: string,
    excerpt?: string,
    trustLevel: BrandSignalTrustLevel = 'manual_user_entry',
    fallbackReason?: string,
  ): BrandSignal<T> => {
    const id = `e${evidence.length + 1}_${path.replace(/[^a-z0-9]+/gi, '_')}`;
    evidence.push({
      id,
      signalPath: path,
      sourceType: trustLevel,
      sourceField,
      excerpt: excerpt ? sanitizeEvidenceExcerpt(excerpt) : undefined,
      confidence: clamp01(confidence),
      trustLevel,
      authorityClass,
      observedAt: generatedAt,
      extractor,
      fallbackReason,
    });
    return {
      value,
      confidence: clamp01(confidence),
      trustLevel,
      authorityClass,
      evidenceIds: [id],
      fallbackReason,
    };
  };

  const fallback = <T>(path: string, value: T, reason: string): BrandSignal<T> =>
    makeSignal(path, value, BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', undefined, reason, 'fallback_default', reason);

  if (!brand) {
    return buildFallbackProfile(makeSignal, fallback, generatedAt, evidence);
  }

  const colors = unique((brand.visual.colors ?? []).map(normalizeHexColor).filter(Boolean) as string[]);
  const styleText = [brand.visual.visualStyle, brand.visual.industry].filter(Boolean).join(' ');
  const voiceText = [
    brand.voice.voiceLock,
    brand.voice.nicheMap,
    ...brand.voice.hookArchetypes,
    ...brand.voice.structuralHabits,
  ].filter(Boolean).join(' ');

  const primary = colors[0];
  const accent = chooseAccent(colors);
  const neutrals = colors.filter((color) => saturation(color) < 0.12);
  const supporting = colors.filter((color) => color !== primary && color !== accent && !neutrals.includes(color));
  const unsafeOnDark = colors.filter((color) => contrastRatio(color, DARK_SURFACE) < 3);
  const unsafeOnLight = colors.filter((color) => contrastRatio(color, LIGHT_SURFACE) < 3);

  return {
    version: 1,
    brandId: brand.brandId,
    userId: brand.userId,
    orgId: brand.orgId,
    generatedAt,
    identity: {
      brandName: makeSignal('identity.brandName', brand.name, 1, 'brand_fact', 'name', brand.name),
      industry: brand.visual.industry
        ? makeSignal('identity.industry', brand.visual.industry, 0.85, 'brand_fact', 'visual.industry', brand.visual.industry)
        : undefined,
      category: brand.visual.industry
        ? makeSignal('identity.category', brand.visual.industry, BRAND_CONFIDENCE.ACTIONABLE_SIGNAL, 'inferred_hint', 'visual.industry', brand.visual.industry)
        : fallback('identity.category', 'unknown', 'No industry/category field available.'),
      audience: brand.voice.nicheMap
        ? makeSignal('identity.audience', [brand.voice.nicheMap], 0.7, 'brand_preference', 'voice.nicheMap', brand.voice.nicheMap)
        : fallback('identity.audience', [], 'No audience or niche map available.'),
      proofStyle: makeSignal('identity.proofStyle', inferProofStyle(styleText + ' ' + voiceText), styleText || voiceText ? 0.45 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'visual.visualStyle', styleText || voiceText || 'No proof-style evidence.'),
    },
    palette: {
      primary: primary ? makeSignal('palette.primary', primary, 0.9, 'brand_fact', 'visual.colors', primary) : undefined,
      accent: accent ? makeSignal('palette.accent', accent, 0.75, 'brand_preference', 'visual.colors', colors.join(', ')) : undefined,
      neutrals: makeSignal('palette.neutrals', neutrals, colors.length ? 0.65 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'visual.colors', colors.join(', ') || 'No colors.'),
      supporting: makeSignal('palette.supporting', supporting, colors.length ? 0.6 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'visual.colors', colors.join(', ') || 'No colors.'),
      unsafeOnDark: makeSignal('palette.unsafeOnDark', unsafeOnDark, colors.length ? 0.8 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'process_default', 'visual.colors', colors.join(', ') || 'No colors.'),
      unsafeOnLight: makeSignal('palette.unsafeOnLight', unsafeOnLight, colors.length ? 0.8 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'process_default', 'visual.colors', colors.join(', ') || 'No colors.'),
      contrastBias: makeSignal('palette.contrastBias', inferContrastBias(colors), colors.length ? BRAND_CONFIDENCE.ACTIONABLE_SIGNAL : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'visual.colors', colors.join(', ') || 'No colors.'),
      harmony: makeSignal('palette.harmony', inferHarmony(primary, accent), primary && accent ? 0.45 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'visual.colors', colors.join(', ') || 'Need at least two colors.'),
    },
    typography: {
      raw: brand.visual.typography ? makeSignal('typography.raw', brand.visual.typography, 0.8, 'brand_preference', 'visual.typography', brand.visual.typography) : undefined,
      category: makeSignal('typography.category', inferTypographyCategory(brand.visual.typography ?? ''), brand.visual.typography ? BRAND_CONFIDENCE.ACTIONABLE_SIGNAL : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'visual.typography', brand.visual.typography ?? 'No typography evidence.'),
      casingBias: makeSignal('typography.casingBias', inferCasingBias(brand.visual.typography ?? ''), brand.visual.typography ? 0.45 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'visual.typography', brand.visual.typography ?? 'No typography evidence.'),
    },
    visual: deriveVisualSignals(styleText, makeSignal),
    motion: deriveMotionSignals(styleText, makeSignal),
    voice: {
      assertiveness: makeSignal('voice.assertiveness', score(voiceText, ['bold', 'direct', 'confident', 'sharp'], ['soft', 'gentle']), voiceText ? 0.5 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'voice.voiceLock', voiceText || 'No voice evidence.', voiceText ? 'manual_user_entry' : 'fallback_default', voiceText ? undefined : 'No voice evidence.'),
      warmth: makeSignal('voice.warmth', score(voiceText, ['warm', 'friendly', 'human', 'community'], ['clinical', 'formal']), voiceText ? 0.5 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'voice.voiceLock', voiceText || 'No voice evidence.', voiceText ? 'manual_user_entry' : 'fallback_default', voiceText ? undefined : 'No voice evidence.'),
      jargonDensity: makeSignal('voice.jargonDensity', score(voiceText, ['technical', 'expert', 'b2b', 'developer'], ['simple', 'plain']), voiceText ? 0.5 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'voice.voiceLock', voiceText || 'No voice evidence.', voiceText ? 'manual_user_entry' : 'fallback_default', voiceText ? undefined : 'No voice evidence.'),
      humor: makeSignal('voice.humor', score(voiceText, ['funny', 'witty', 'playful', 'irreverent'], ['serious', 'formal']), voiceText ? 0.5 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'voice.voiceLock', voiceText || 'No voice evidence.', voiceText ? 'manual_user_entry' : 'fallback_default', voiceText ? undefined : 'No voice evidence.'),
      defaultFormality: makeSignal('voice.defaultFormality', score(voiceText, ['formal', 'professional', 'premium', 'enterprise'], ['casual', 'irreverent', 'playful']), voiceText ? 0.5 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'voice_default', 'voice.voiceLock', voiceText || 'No voice evidence.', voiceText ? 'manual_user_entry' : 'fallback_default', voiceText ? undefined : 'No voice evidence.'),
      ctaDirectness: makeSignal('voice.ctaDirectness', score(voiceText, ['direct', 'urgent', 'performance', 'sales'], ['soft', 'editorial']), voiceText ? 0.5 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'inferred_hint', 'voice.voiceLock', voiceText || 'No voice evidence.', voiceText ? 'manual_user_entry' : 'fallback_default', voiceText ? undefined : 'No voice evidence.'),
      recurringPhrases: makeSignal('voice.recurringPhrases', brand.voice.structuralHabits, brand.voice.structuralHabits.length ? 0.75 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'voice_default', 'voice.structuralHabits', brand.voice.structuralHabits.join(', ') || 'No recurring phrases.', brand.voice.structuralHabits.length ? 'manual_user_entry' : 'fallback_default', brand.voice.structuralHabits.length ? undefined : 'No recurring phrases.'),
      killList: makeSignal('voice.killList', brand.voice.killList, brand.voice.killList.length ? 0.95 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'brand_constraint', 'voice.killList', brand.voice.killList.join(', ') || 'No kill list.', brand.voice.killList.length ? 'manual_user_entry' : 'fallback_default', brand.voice.killList.length ? undefined : 'No kill list.'),
      hookArchetypes: makeSignal('voice.hookArchetypes', brand.voice.hookArchetypes, brand.voice.hookArchetypes.length ? 0.8 : BRAND_CONFIDENCE.FALLBACK_SIGNAL, 'voice_default', 'voice.hookArchetypes', brand.voice.hookArchetypes.join(', ') || 'No hook archetypes.', brand.voice.hookArchetypes.length ? 'manual_user_entry' : 'fallback_default', brand.voice.hookArchetypes.length ? undefined : 'No hook archetypes.'),
    },
    evidence,
  };
}

export function sanitizeEvidenceExcerpt(input: string, maxLength = 220): string {
  const cleaned = input.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...` : cleaned;
}

export function getBrandSignalEffectWeight(signal: BrandSignal<unknown>, minConfidence = BRAND_CONFIDENCE.ACTIONABLE_SIGNAL): number {
  if (signal.trustLevel === 'fallback_default' || signal.authorityClass === 'unsafe_or_untrusted') return 0;
  if (signal.confidence < minConfidence) return 0;
  const trustWeight = signal.trustLevel === 'manual_user_entry' || signal.trustLevel === 'uploaded_brand_guideline' ? 1 : 0.75;
  return clamp01(((signal.confidence - minConfidence) / (1 - minConfidence)) * trustWeight);
}

export function isBrandSignalActionable(signal: BrandSignal<unknown>, minConfidence = BRAND_CONFIDENCE.ACTIONABLE_SIGNAL): boolean {
  return getBrandSignalEffectWeight(signal, minConfidence) > 0;
}

function buildFallbackProfile(
  makeSignal: <T>(path: string, value: T, confidence: number, authorityClass: BrandSignalAuthorityClass, sourceField?: string, excerpt?: string, trustLevel?: BrandSignalTrustLevel, fallbackReason?: string) => BrandSignal<T>,
  fallback: <T>(path: string, value: T, reason: string) => BrandSignal<T>,
  generatedAt: string,
  evidence: BrandSignalEvidence[],
): BrandSignalProfile {
  const noBrand = 'No UnifiedBrand was provided.';
  return {
    version: 1,
    generatedAt,
    identity: { brandName: fallback('identity.brandName', 'Unknown Brand', noBrand), category: fallback('identity.category', 'unknown', noBrand), audience: fallback('identity.audience', [], noBrand), proofStyle: fallback('identity.proofStyle', 'unknown', noBrand) },
    palette: { neutrals: fallback('palette.neutrals', [], noBrand), supporting: fallback('palette.supporting', [], noBrand), unsafeOnDark: fallback('palette.unsafeOnDark', [], noBrand), unsafeOnLight: fallback('palette.unsafeOnLight', [], noBrand), contrastBias: fallback('palette.contrastBias', 0.5, noBrand), harmony: fallback('palette.harmony', 'unknown', noBrand) },
    typography: { category: fallback('typography.category', 'unknown', noBrand), casingBias: fallback('typography.casingBias', 'unknown', noBrand) },
    visual: deriveVisualSignals('', makeSignal),
    motion: deriveMotionSignals('', makeSignal),
    voice: { assertiveness: fallback('voice.assertiveness', 0.5, noBrand), warmth: fallback('voice.warmth', 0.5, noBrand), jargonDensity: fallback('voice.jargonDensity', 0.5, noBrand), humor: fallback('voice.humor', 0.2, noBrand), defaultFormality: fallback('voice.defaultFormality', 0.5, noBrand), ctaDirectness: fallback('voice.ctaDirectness', 0.5, noBrand), recurringPhrases: fallback('voice.recurringPhrases', [], noBrand), killList: fallback('voice.killList', [], noBrand), hookArchetypes: fallback('voice.hookArchetypes', [], noBrand) },
    evidence,
  };
}

function deriveVisualSignals(text: string, makeSignal: <T>(path: string, value: T, confidence: number, authorityClass: BrandSignalAuthorityClass, sourceField?: string, excerpt?: string, trustLevel?: BrandSignalTrustLevel, fallbackReason?: string) => BrandSignal<T>): BrandSignalProfile['visual'] {
  const confidence = text ? 0.5 : BRAND_CONFIDENCE.FALLBACK_SIGNAL;
  const excerpt = text || 'No visual style evidence.';
  const trustLevel = text ? 'manual_user_entry' : 'fallback_default';
  const fallbackReason = text ? undefined : 'No visual style evidence.';
  return {
    minimalism: makeSignal('visual.minimalism', score(text, ['minimal', 'clean', 'simple', 'premium', 'luxury'], ['loud', 'maximal', 'busy']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
    densityTolerance: makeSignal('visual.densityTolerance', score(text, ['dense', 'dashboard', 'data', 'technical', 'b2b'], ['minimal', 'simple']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
    dataVizAffinity: makeSignal('visual.dataVizAffinity', score(text, ['data', 'analytics', 'metrics', 'finance', 'dashboard', 'technical'], ['lifestyle', 'editorial']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
    expressiveness: makeSignal('visual.expressiveness', score(text, ['bold', 'playful', 'loud', 'creator', 'expressive'], ['restrained', 'minimal']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
    geometryTendency: makeSignal('visual.geometryTendency', score(text, ['geometric', 'sharp', 'technical', 'angular'], ['organic', 'soft']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
    decorationTolerance: makeSignal('visual.decorationTolerance', score(text, ['playful', 'layered', 'decorative', 'maximal'], ['flat', 'minimal', 'clean']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
    cornerRadiusBias: makeSignal('visual.cornerRadiusBias', score(text, ['soft', 'friendly', 'rounded', 'warm'], ['sharp', 'angular', 'technical']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
    layoutSymmetry: makeSignal('visual.layoutSymmetry', score(text, ['premium', 'corporate', 'formal', 'structured'], ['chaotic', 'playful']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
    contrastPreference: makeSignal('visual.contrastPreference', score(text, ['bold', 'high contrast', 'sharp'], ['soft', 'muted', 'subtle']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
  };
}

function deriveMotionSignals(text: string, makeSignal: <T>(path: string, value: T, confidence: number, authorityClass: BrandSignalAuthorityClass, sourceField?: string, excerpt?: string, trustLevel?: BrandSignalTrustLevel, fallbackReason?: string) => BrandSignal<T>): BrandSignalProfile['motion'] {
  const confidence = text ? 0.45 : BRAND_CONFIDENCE.FALLBACK_SIGNAL;
  const excerpt = text || 'No motion style evidence.';
  const trustLevel = text ? 'manual_user_entry' : 'fallback_default';
  const fallbackReason = text ? undefined : 'No motion style evidence.';
  return {
    motionEnergy: makeSignal('motion.motionEnergy', score(text, ['energetic', 'bold', 'playful', 'loud'], ['calm', 'minimal', 'restrained']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
    overshootTolerance: makeSignal('motion.overshootTolerance', score(text, ['playful', 'bouncy', 'creator'], ['premium', 'luxury', 'restrained']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
    transitionSharpness: makeSignal('motion.transitionSharpness', score(text, ['sharp', 'technical', 'bold'], ['soft', 'warm']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
    rhythmRegularity: makeSignal('motion.rhythmRegularity', score(text, ['corporate', 'technical', 'structured'], ['playful', 'chaotic']), confidence, 'inferred_hint', 'visual.visualStyle', excerpt, trustLevel, fallbackReason),
  };
}

function score(text: string, positive: string[], negative: string[]): number {
  const lower = text.toLowerCase();
  const pos = positive.filter((word) => lower.includes(word)).length;
  const neg = negative.filter((word) => lower.includes(word)).length;
  return clamp01(0.5 + pos * 0.15 - neg * 0.15);
}

function normalizeHexColor(value: string): string | undefined {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return undefined;
}

function chooseAccent(colors: string[]): string | undefined {
  return colors.filter((color) => contrastRatio(color, DARK_SURFACE) >= 3).sort((a, b) => saturation(b) - saturation(a))[0] ?? colors[1] ?? colors[0];
}

function inferProofStyle(text: string): BrandProofStyle {
  const lower = text.toLowerCase();
  if (/(metric|data|roi|analytics|dashboard)/.test(lower)) return 'metrics';
  if (/(testimonial|case study|customer)/.test(lower)) return 'testimonial';
  if (/(expert|authority|enterprise|compliance)/.test(lower)) return 'authority';
  if (/(community|creator|social)/.test(lower)) return 'community';
  if (/(demo|product|tutorial)/.test(lower)) return 'demo';
  if (/(editorial|media|journal)/.test(lower)) return 'editorial';
  return 'unknown';
}

function inferTypographyCategory(text: string): BrandSignalProfile['typography']['category']['value'] {
  const lower = text.toLowerCase();
  const matches = [
    lower.includes('serif') && 'serif',
    lower.includes('sans') && 'sans',
    lower.includes('mono') && 'mono',
    lower.includes('slab') && 'slab',
    lower.includes('display') && 'display',
  ].filter(Boolean);
  return matches.length > 1 ? 'mixed' : (matches[0] as BrandSignalProfile['typography']['category']['value']) || 'unknown';
}

function inferCasingBias(text: string): BrandSignalProfile['typography']['casingBias']['value'] {
  const lower = text.toLowerCase();
  if (lower.includes('uppercase') || lower.includes('all caps')) return 'uppercase';
  if (lower.includes('lowercase')) return 'lowercase';
  if (lower.includes('title case')) return 'title';
  if (lower.includes('sentence case')) return 'sentence';
  return 'unknown';
}

function inferContrastBias(colors: string[]): number {
  if (!colors.length) return 0.5;
  const avg = colors.reduce((sum, color) => sum + Math.max(contrastRatio(color, DARK_SURFACE), contrastRatio(color, LIGHT_SURFACE)), 0) / colors.length;
  return clamp01((avg - 1) / 10);
}

function inferHarmony(primary?: string, accent?: string): BrandPaletteHarmony {
  if (!primary || !accent || primary === accent) return 'unknown';
  const diff = hueDiff(hue(primary), hue(accent));
  if (diff < 25) return 'monochromatic';
  if (diff < 70) return 'analogous';
  if (diff > 150 && diff < 210) return 'complementary';
  if (diff > 130 && diff <= 150) return 'split-complementary';
  if (diff > 100 && diff < 130) return 'triadic';
  return 'unknown';
}

function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

function saturation(hex: string): number {
  const [, s] = hsl(hex);
  return s;
}

function hue(hex: string): number {
  return hsl(hex)[0];
}

function hueDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
