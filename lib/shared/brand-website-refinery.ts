import type {
  BrandSignal,
  BrandSignalEvidence,
  BrandSignalProfile,
} from './brand-signal-profile';
import { sanitizeEvidenceExcerpt } from './brand-signal-profile';
import {
  createBrandSignalProfileDraft,
  type BrandSignalLifecycleOptions,
} from './brand-signal-lifecycle';
import type {
  BrandEvidenceCandidate,
  BrandWebsiteDraftInput,
  BrandWebsiteDraftResult,
  BrandWebsiteSignalProfileResult,
  BrandWebsiteSnapshot,
  FallbackSignal,
  FetchWebsiteBrandSnapshotOptions,
  MakeSignal,
  SignalSource,
} from './brand-website-refinery-types';
export type {
  BrandEvidenceCandidate,
  BrandEvidenceCandidateAuthority,
  BrandEvidenceCandidateSourceType,
  BrandRefineryJob,
  BrandWebsiteDraftInput,
  BrandWebsiteDraftResult,
  BrandWebsiteSignalProfileResult,
  BrandWebsiteSnapshot,
  FetchWebsiteBrandSnapshotOptions,
} from './brand-website-refinery-types';
import {
  chooseAccent,
  clamp01,
  contrastRatio,
  candidateOnly,
  DARK_SURFACE,
  domainBrand,
  firstDefined,
  inferAudience,
  inferCasingBias,
  inferCategory,
  inferContrastBias,
  inferHarmony,
  inferHookArchetypes,
  inferProofStyle,
  inferRecurringPhrases,
  inferTypographyCategory,
  LIGHT_SURFACE,
  nextEvidenceId,
  normalizeBrandWebsiteUrl,
  parseWebsiteHtml,
  saturation,
  score,
  source,
  stringifyExcerpt,
  titleBrand,
  uniqueText,
} from './brand-website-refinery-utils';
export { normalizeBrandWebsiteUrl } from './brand-website-refinery-utils';

export async function fetchWebsiteBrandSnapshot(
  websiteUrl: string,
  options: FetchWebsiteBrandSnapshotOptions = {},
): Promise<BrandWebsiteSnapshot> {
  const normalizedUrl = normalizeBrandWebsiteUrl(websiteUrl);
  const fetchFn = options.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

  try {
    const response = await fetchFn(normalizedUrl, {
      signal: controller.signal,
      headers: {
        'user-agent': options.userAgent ?? 'InsturixBrandVault/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Website fetch failed with HTTP ${response.status}.`);
    }

    return {
      normalizedUrl: normalizeBrandWebsiteUrl(response.url || normalizedUrl),
      html: await response.text(),
      fetchedAt: options.now ?? new Date().toISOString(),
      contentType: response.headers.get('content-type') ?? undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createWebsiteBrandSignalProfile(input: BrandWebsiteDraftInput): BrandWebsiteSignalProfileResult {
  const normalizedUrl = normalizeBrandWebsiteUrl(input.websiteUrl);
  const observedAt = input.fetchedAt ?? new Date().toISOString();
  const extractor = input.extractor ?? 'brand-website-refinery.v1';
  const parsed = parseWebsiteHtml({ ...input, websiteUrl: normalizedUrl });
  const evidence: BrandSignalEvidence[] = [];
  const candidates: BrandEvidenceCandidate[] = [];
  const makeSignal = createSignalFactory({ input, normalizedUrl, observedAt, extractor, evidence, candidates });
  const fallback = createFallbackFactory({ observedAt, extractor, evidence });

  const brandName = firstDefined(input.companyName, parsed.schemaName, parsed.siteName, titleBrand(parsed.title), domainBrand(parsed.host));
  const description = firstDefined(parsed.schemaDescription, parsed.metaDescription, parsed.headings[0], parsed.title, domainBrand(parsed.host));
  const textForInference = uniqueText([
    description,
    parsed.schemaDescription,
    parsed.metaDescription,
    parsed.bodyText,
    ...parsed.headings,
    ...parsed.ctas,
    ...parsed.proofSnippets,
  ]).join('. ');
  const primary = parsed.colors.find((color) => saturation(color) >= 0.08) ?? parsed.colors[0];
  const accent = chooseAccent(parsed.colors, primary);
  const neutrals = parsed.colors.filter((color) => saturation(color) < 0.12);
  const supporting = parsed.colors.filter((color) => color !== primary && color !== accent && !neutrals.includes(color));
  const unsafeOnDark = parsed.colors.filter((color) => contrastRatio(color, DARK_SURFACE) < 3);
  const unsafeOnLight = parsed.colors.filter((color) => contrastRatio(color, LIGHT_SURFACE) < 3);
  const rawTypography = parsed.fonts.join(', ');

  const profile: BrandSignalProfile = {
    version: 1,
    brandId: input.brandId,
    userId: input.userId,
    generatedAt: observedAt,
    identity: {
      brandName: makeSignal('identity.brandName', brandName, {
        candidateSourceType: input.companyName ? 'manual_user' : parsed.schemaName ? 'json_ld' : 'website_metadata',
        sourceField: input.companyName ? 'companyName' : parsed.schemaName ? 'jsonLd.name' : 'metadata.siteName',
        rawValue: brandName,
        normalizedValue: brandName,
        confidence: input.companyName ? 0.95 : parsed.schemaName || parsed.siteName ? 0.86 : 0.62,
        authorityClass: 'brand_fact',
        trustLevel: input.companyName ? 'manual_user_entry' : 'first_party_website',
      }),
      industry: parsed.schemaTypes.length
        ? makeSignal('identity.industry', parsed.schemaTypes[0], source('json_ld', 'jsonLd.@type', parsed.schemaTypes, parsed.schemaTypes[0], 0.68, 'brand_fact'))
        : undefined,
      category: makeSignal('identity.category', inferCategory(textForInference), source('website_metadata', 'website.copy', textForInference, textForInference, description ? 0.58 : 0.35, 'inferred_hint')),
      audience: makeSignal('identity.audience', inferAudience(textForInference), source('website', 'website.copy', textForInference, textForInference, textForInference ? 0.5 : 0.2, 'inferred_hint')),
      proofStyle: makeSignal('identity.proofStyle', inferProofStyle(textForInference), source('website', 'website.proofSnippets', parsed.proofSnippets, textForInference, parsed.proofSnippets.length ? 0.62 : 0.42, 'inferred_hint')),
    },
    palette: {
      primary: primary ? makeSignal('palette.primary', primary, source('css', 'css.colors', parsed.colors, primary, 0.76, 'brand_fact')) : undefined,
      accent: accent ? makeSignal('palette.accent', accent, source('css', 'css.colors', parsed.colors, accent, 0.66, 'brand_preference')) : undefined,
      neutrals: parsed.colors.length ? makeSignal('palette.neutrals', neutrals, source('css', 'css.colors', parsed.colors, neutrals, 0.58, 'inferred_hint')) : fallback('palette.neutrals', [], 'No website color evidence.'),
      supporting: parsed.colors.length ? makeSignal('palette.supporting', supporting, source('css', 'css.colors', parsed.colors, supporting, 0.55, 'inferred_hint')) : fallback('palette.supporting', [], 'No website color evidence.'),
      unsafeOnDark: parsed.colors.length ? makeSignal('palette.unsafeOnDark', unsafeOnDark, source('css', 'css.colors', parsed.colors, unsafeOnDark, 0.76, 'process_default')) : fallback('palette.unsafeOnDark', [], 'No website color evidence.'),
      unsafeOnLight: parsed.colors.length ? makeSignal('palette.unsafeOnLight', unsafeOnLight, source('css', 'css.colors', parsed.colors, unsafeOnLight, 0.76, 'process_default')) : fallback('palette.unsafeOnLight', [], 'No website color evidence.'),
      contrastBias: parsed.colors.length ? makeSignal('palette.contrastBias', inferContrastBias(parsed.colors), source('css', 'css.colors', parsed.colors, parsed.colors, 0.52, 'inferred_hint')) : fallback('palette.contrastBias', 0.5, 'No website color evidence.'),
      harmony: primary && accent ? makeSignal('palette.harmony', inferHarmony(primary, accent), source('css', 'css.colors', parsed.colors, parsed.colors, 0.45, 'inferred_hint')) : fallback('palette.harmony', 'unknown', 'Need at least two website colors.'),
    },
    typography: {
      raw: rawTypography ? makeSignal('typography.raw', rawTypography, source('css', 'css.fontFamily', parsed.fonts, rawTypography, 0.64, 'brand_preference')) : undefined,
      category: rawTypography ? makeSignal('typography.category', inferTypographyCategory(rawTypography), source('css', 'css.fontFamily', parsed.fonts, rawTypography, 0.5, 'inferred_hint')) : fallback('typography.category', 'unknown', 'No website typography evidence.'),
      casingBias: parsed.headings.length ? makeSignal('typography.casingBias', inferCasingBias(parsed.headings), source('website', 'website.headings', parsed.headings, parsed.headings, 0.45, 'inferred_hint')) : fallback('typography.casingBias', 'unknown', 'No heading evidence.'),
    },
    visual: makeVisualSignals(textForInference, makeSignal, fallback),
    motion: makeMotionSignals(textForInference, makeSignal, fallback),
    voice: {
      assertiveness: makeSignal('voice.assertiveness', score(textForInference, ['bold', 'direct', 'guarantee', 'fast'], ['gentle', 'soft']), source('website', 'website.copy', textForInference, textForInference, 0.48, 'inferred_hint')),
      warmth: makeSignal('voice.warmth', score(textForInference, ['human', 'friendly', 'community', 'together'], ['enterprise-grade', 'compliance']), source('website', 'website.copy', textForInference, textForInference, 0.48, 'inferred_hint')),
      jargonDensity: makeSignal('voice.jargonDensity', score(textForInference, ['api', 'workflow', 'automation', 'analytics', 'infrastructure'], ['simple', 'easy']), source('website', 'website.copy', textForInference, textForInference, 0.48, 'inferred_hint')),
      humor: makeSignal('voice.humor', score(textForInference, ['fun', 'playful', 'witty'], ['serious', 'trusted']), source('website', 'website.copy', textForInference, textForInference, 0.42, 'inferred_hint')),
      defaultFormality: makeSignal('voice.defaultFormality', score(textForInference, ['enterprise', 'professional', 'trusted', 'secure'], ['casual', 'playful']), source('website', 'website.copy', textForInference, textForInference, 0.48, 'voice_default')),
      ctaDirectness: makeSignal('voice.ctaDirectness', parsed.ctas.length ? score(parsed.ctas.join(' '), ['start', 'get', 'book', 'buy', 'request'], ['learn', 'explore']) : 0.5, source('website', 'website.ctas', parsed.ctas, parsed.ctas, parsed.ctas.length ? 0.62 : 0.2, 'inferred_hint')),
      recurringPhrases: makeSignal('voice.recurringPhrases', inferRecurringPhrases(parsed.headings, parsed.ctas), source('website', 'website.headingsAndCtas', [...parsed.headings, ...parsed.ctas], [...parsed.headings, ...parsed.ctas], 0.55, 'voice_default')),
      killList: fallback('voice.killList', [], 'Website scan cannot infer prohibited brand phrases without human review.'),
      hookArchetypes: makeSignal('voice.hookArchetypes', inferHookArchetypes(parsed.headings), source('website', 'website.headings', parsed.headings, parsed.headings, parsed.headings.length ? 0.45 : 0.2, 'inferred_hint')),
    },
    evidence,
  };

  for (const logo of parsed.logoCandidates) {
    candidates.push(candidateOnly('assets.logoCandidates', logo, 'logo_asset', 'website.logo', normalizedUrl, observedAt, extractor, input));
  }

  return { profile, candidates, normalizedUrl, warnings: parsed.colors.length ? [] : ['No website colors were detected.'] };
}

export function createWebsiteBrandSignalProfileDraft(
  input: BrandWebsiteDraftInput,
  options: BrandSignalLifecycleOptions = {},
): BrandWebsiteDraftResult {
  const result = createWebsiteBrandSignalProfile(input);
  return {
    ...result,
    record: createBrandSignalProfileDraft(result.profile, options),
  };
}

function createSignalFactory(args: {
  input: BrandWebsiteDraftInput;
  normalizedUrl: string;
  observedAt: string;
  extractor: string;
  evidence: BrandSignalEvidence[];
  candidates: BrandEvidenceCandidate[];
}): MakeSignal {
  return <T>(path: string, value: T, item: SignalSource): BrandSignal<T> => {
    const id = nextEvidenceId(args.evidence.length, path);
    const trustLevel = item.trustLevel ?? 'first_party_website';
    const confidence = clamp01(item.confidence);
    const excerpt = item.excerpt ?? stringifyExcerpt(item.normalizedValue);
    args.evidence.push({
      id,
      signalPath: path,
      sourceType: trustLevel,
      sourceField: item.sourceField,
      excerpt: excerpt ? sanitizeEvidenceExcerpt(excerpt) : undefined,
      confidence,
      trustLevel,
      authorityClass: item.authorityClass,
      observedAt: args.observedAt,
      extractor: args.extractor,
    });
    args.candidates.push({
      id: `candidate_${id}`,
      brandId: args.input.brandId,
      jobId: args.input.jobId,
      sourceType: item.candidateSourceType,
      sourceUrl: args.normalizedUrl,
      sourceField: item.sourceField,
      signalPath: path,
      rawValue: item.rawValue,
      normalizedValue: item.normalizedValue,
      excerpt: excerpt ? sanitizeEvidenceExcerpt(excerpt) : undefined,
      confidence,
      authorityClass: item.trustLevel === 'uploaded_brand_guideline' ? 'official' : 'owned',
      observedAt: args.observedAt,
      extractorId: args.extractor,
    });
    return { value, confidence, trustLevel, authorityClass: item.authorityClass, evidenceIds: [id] };
  };
}

function createFallbackFactory(args: {
  observedAt: string;
  extractor: string;
  evidence: BrandSignalEvidence[];
}): FallbackSignal {
  return <T>(path: string, value: T, reason: string): BrandSignal<T> => {
    const id = nextEvidenceId(args.evidence.length, path);
    args.evidence.push({
      id,
      signalPath: path,
      sourceType: 'fallback_default',
      sourceField: 'fallback',
      excerpt: sanitizeEvidenceExcerpt(reason),
      confidence: 0.15,
      trustLevel: 'fallback_default',
      authorityClass: 'inferred_hint',
      observedAt: args.observedAt,
      extractor: args.extractor,
      fallbackReason: reason,
    });
    return {
      value,
      confidence: 0.15,
      trustLevel: 'fallback_default',
      authorityClass: 'inferred_hint',
      evidenceIds: [id],
      fallbackReason: reason,
    };
  };
}

function makeVisualSignals(
  text: string,
  makeSignal: MakeSignal,
  fallback: FallbackSignal,
): BrandSignalProfile['visual'] {
  if (!text) {
    return {
      minimalism: fallback('visual.minimalism', 0.5, 'No website visual evidence.'),
      densityTolerance: fallback('visual.densityTolerance', 0.5, 'No website visual evidence.'),
      dataVizAffinity: fallback('visual.dataVizAffinity', 0.5, 'No website visual evidence.'),
      expressiveness: fallback('visual.expressiveness', 0.5, 'No website visual evidence.'),
      geometryTendency: fallback('visual.geometryTendency', 0.5, 'No website visual evidence.'),
      decorationTolerance: fallback('visual.decorationTolerance', 0.5, 'No website visual evidence.'),
      cornerRadiusBias: fallback('visual.cornerRadiusBias', 0.5, 'No website visual evidence.'),
      layoutSymmetry: fallback('visual.layoutSymmetry', 0.5, 'No website visual evidence.'),
      contrastPreference: fallback('visual.contrastPreference', 0.5, 'No website visual evidence.'),
    };
  }
  const visualSource = (value: number): SignalSource => ({
    candidateSourceType: 'website',
    sourceField: 'website.copy',
    rawValue: text,
    normalizedValue: value,
    excerpt: text,
    confidence: 0.43,
    authorityClass: 'inferred_hint',
  });
  return {
    minimalism: makeSignal('visual.minimalism', score(text, ['minimal', 'clean', 'simple', 'premium'], ['busy', 'maximal']), visualSource(0)),
    densityTolerance: makeSignal('visual.densityTolerance', score(text, ['dashboard', 'data', 'analytics', 'platform'], ['simple', 'minimal']), visualSource(0)),
    dataVizAffinity: makeSignal('visual.dataVizAffinity', score(text, ['data', 'analytics', 'metrics', 'reporting'], ['lifestyle']), visualSource(0)),
    expressiveness: makeSignal('visual.expressiveness', score(text, ['bold', 'creative', 'playful'], ['restrained', 'compliance']), visualSource(0)),
    geometryTendency: makeSignal('visual.geometryTendency', score(text, ['system', 'technical', 'structured'], ['organic', 'handmade']), visualSource(0)),
    decorationTolerance: makeSignal('visual.decorationTolerance', score(text, ['playful', 'creative', 'immersive'], ['simple', 'clean']), visualSource(0)),
    cornerRadiusBias: makeSignal('visual.cornerRadiusBias', score(text, ['friendly', 'easy', 'human'], ['sharp', 'enterprise']), visualSource(0)),
    layoutSymmetry: makeSignal('visual.layoutSymmetry', score(text, ['trusted', 'enterprise', 'professional'], ['playful', 'experimental']), visualSource(0)),
    contrastPreference: makeSignal('visual.contrastPreference', score(text, ['bold', 'stand out', 'high impact'], ['subtle', 'calm']), visualSource(0)),
  };
}

function makeMotionSignals(
  text: string,
  makeSignal: MakeSignal,
  fallback: FallbackSignal,
): BrandSignalProfile['motion'] {
  if (!text) {
    return {
      motionEnergy: fallback('motion.motionEnergy', 0.5, 'No website motion evidence.'),
      overshootTolerance: fallback('motion.overshootTolerance', 0.5, 'No website motion evidence.'),
      transitionSharpness: fallback('motion.transitionSharpness', 0.5, 'No website motion evidence.'),
      rhythmRegularity: fallback('motion.rhythmRegularity', 0.5, 'No website motion evidence.'),
    };
  }
  const motionSource = (value: number): SignalSource => ({
    candidateSourceType: 'website',
    sourceField: 'website.copy',
    rawValue: text,
    normalizedValue: value,
    excerpt: text,
    confidence: 0.32,
    authorityClass: 'inferred_hint',
  });
  return {
    motionEnergy: makeSignal('motion.motionEnergy', score(text, ['fast', 'dynamic', 'bold'], ['calm', 'stable']), motionSource(0)),
    overshootTolerance: makeSignal('motion.overshootTolerance', score(text, ['playful', 'fun', 'creator'], ['premium', 'trusted']), motionSource(0)),
    transitionSharpness: makeSignal('motion.transitionSharpness', score(text, ['fast', 'sharp', 'precision'], ['soft', 'warm']), motionSource(0)),
    rhythmRegularity: makeSignal('motion.rhythmRegularity', score(text, ['system', 'workflow', 'consistent'], ['experimental', 'playful']), motionSource(0)),
  };
}
