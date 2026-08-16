import type { AssembledContext, ProjectContextData } from '../agents/types';
import { detect, langName, supportedLanguages, toISO2 } from 'tinyld';
import type { RetrievedContext, SemanticFact } from '../context/fetchContextSources';
import { extractSignalsFromContext } from '../data/extract-signals';
import { brandSignalProfileToCreativeSignalDefaults } from '../../shared/brand-to-creative-signals';
import {
  ThinkForgeDocumentContractSchema,
  normalizeThinkForgeDocumentContract,
  type ThinkForgeDocumentContract,
} from '../schemas/document-contract';
import {
  ThinkForgeAuthoringRequestSchema,
  describeThinkForgePlatformSurface,
  type ThinkForgeAuthoringRequest,
} from '../schemas/authoring-request';
import type {
  ContentSignalProfile,
  ContentConstraints,
  CreativeSignals,
  CTAType,
  InferenceMetadata,
  OutputFormat,
} from '../../shared/signals';
import { computeDerivedSignals, validateSignals } from '../../shared/signals';
import { resolveThinkForgePublishingConstraints } from './publishing-constraints';

type BrandDNA = RetrievedContext['brandDNA'];
type SignalSource = InferenceMetadata['source'];

export interface ResolveContentSignalProfileInput {
  userPrompt: string;
  authoringRequest?: ThinkForgeAuthoringRequest | null;
  contentContract?: ThinkForgeDocumentContract | null;
  documentType?: string;
  medium?: string;
  platform?: string;
  brandId?: string;
  sessionId?: string;
  project?: ProjectContextData | null;
  context?: AssembledContext | null;
  retrievedContext?: RetrievedContext | null;
  signalOverrides?: Partial<CreativeSignals>;
}

export interface ResolvedCreativeIntent {
  outputFormat: OutputFormat;
  platform?: string;
  audience?: string;
  goal: string;
  angle: string;
  tone?: string;
  proofPoints: string[];
  forbiddenTerms: string[];
  structuralHints: string[];
  visualNeeds: string[];
  clickatron: {
    requested: boolean;
    assetIntent: 'none' | 'static_image' | 'storyboard' | 'thumbnail';
    rationale: string[];
  };
}

export interface ThinkForgeContentSignalProfile {
  profile: ContentSignalProfile;
  intent: ResolvedCreativeIntent;
  sources: {
    brandId?: string;
    sessionId?: string;
    projectName?: string;
    brandContextPresent: boolean;
    brandVaultProfilePresent: boolean;
    projectFactsUsed: number;
    globalFactsUsed: number;
    interactionPatternsUsed: number;
  };
  warnings: string[];
}

const OUTPUT_FORMAT_ALIASES: Array<[RegExp, OutputFormat]> = [
  [/\b(script|reels?|tiktok|youtube|ugc|commercial)\b|\bshort[-\s]?form\b|\bbrand[-\s]?film\b/i, 'video_script'],
  [/linkedin|twitter|x\.com|instagram|facebook|social|post|thread/i, 'social_post'],
  [/\bvideo\b/i, 'video_script'],
  [/caption/i, 'caption'],
  [/blog|article/i, 'blog_article'],
  [/newsletter/i, 'newsletter'],
  [/email/i, 'email'],
  [/ad\s*copy|advert|landing ad/i, 'ad_copy'],
  [/presentation|deck|slide/i, 'presentation_script'],
  [/podcast/i, 'podcast_script'],
  [/product\s*description|pdp/i, 'product_description'],
  [/case\s*study/i, 'case_study'],
  [/press\s*release/i, 'press_release'],
  [/landing\s*page|homepage|hero section/i, 'landing_page'],
  [/whitepaper|white paper/i, 'whitepaper'],
];

const PLATFORM_ALIASES: Array<[RegExp, string]> = [
  [/\byoutube(?:[-\s]+)?shorts?\b|\byt[-\s]+shorts?\b/i, 'YouTube Shorts'],
  [/\binstagram(?:[-\s]+)?reels?\b|\big(?:[-\s]+)?reels?\b|\breels?\b/i, 'Instagram Reels'],
  [/linkedin/i, 'LinkedIn'],
  [/\btiktok\b/i, 'TikTok'],
  [/\byoutube\b/i, 'YouTube'],
  [/instagram/i, 'Instagram'],
  [/\bx\b|twitter/i, 'X'],
  [/facebook/i, 'Facebook'],
  [/reddit/i, 'Reddit'],
  [/website|landing page/i, 'Website'],
  [/email/i, 'Email'],
];

const NATIVE_LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  arabic: 'ar',
  bengali: 'bn',
  deutsch: 'de',
  english: 'en',
  espanol: 'es',
  francais: 'fr',
  hindi: 'hi',
  italiano: 'it',
  japanese: 'ja',
  korean: 'ko',
  mandarin: 'zh',
  nederlands: 'nl',
  portuguese: 'pt',
  portugues: 'pt',
  punjabi: 'pa',
  russian: 'ru',
  tamil: 'ta',
  telugu: 'te',
  urdu: 'ur',
};

const SUPPORTED_LANGUAGE_CODES = new Set(
  supportedLanguages.map((language) => toISO2(language).toLocaleLowerCase()),
);

const EXPLICIT_LANGUAGE_ALIASES = [...new Map([
  ...supportedLanguages.map((language) => [
    normalizeLanguageInstruction(langName(language)),
    toISO2(language).toLocaleLowerCase(),
  ] as const),
  ...Object.entries(NATIVE_LANGUAGE_ALIASES),
]).entries()]
  .filter(([alias]) => alias.length >= 3)
  .sort(([left], [right]) => right.length - left.length);

export function resolveContentSignalProfile(
  input: ResolveContentSignalProfileInput,
): ThinkForgeContentSignalProfile {
  const authoringRequest = input.authoringRequest
    ? ThinkForgeAuthoringRequestSchema.parse(input.authoringRequest)
    : null;
  if (authoringRequest && input.contentContract) {
    const contentContract = ThinkForgeDocumentContractSchema.parse(input.contentContract);
    if (JSON.stringify(authoringRequest.contentContract) !== JSON.stringify(contentContract)) {
      throw new Error('Content signal resolution received conflicting authoring and document contracts');
    }
  }
  const context = input.context;
  const project = input.project;
  const retrieved = input.retrievedContext;
  const brandDNA = retrieved?.brandDNA;
  const combinedText = [
    input.userPrompt,
    input.documentType,
    input.medium,
    input.platform,
    project?.format,
    project?.platform,
    project?.purpose,
    project?.tone,
    context?.projectSummary,
  ].filter(Boolean).join(' ');

  const outputFormat = inferOutputFormat(input, combinedText);
  const platform = inferPlatform(input, combinedText);
  const extractionDocumentType = toExtractionDocumentType(outputFormat, input.documentType ?? input.medium);
  const metadata: Record<string, InferenceMetadata> = {};

  const formatSignals = extractSignalsFromContext({
    documentType: extractionDocumentType,
    medium: input.medium,
  });
  const promptSignals = extractSignalsFromContext({
    documentType: extractionDocumentType,
    medium: input.medium,
    projectSummary: context?.projectSummary ?? projectSummary(project),
    userPrompt: input.userPrompt,
  });

  const signals: Partial<CreativeSignals> = {};
  for (const [key, value] of typedSignalEntries(formatSignals)) {
    setSignal(signals, metadata, key, value, 'format_default', 0.72, outputFormat);
  }

  applyBrandVaultSignalDefaults(signals, metadata, retrieved?.brandSignalProfile);

  for (const [key, value] of typedSignalEntries(promptSignals)) {
    if (value !== formatSignals[key]) {
      setSignal(signals, metadata, key, value, 'brief_extraction', 0.78, 'user_prompt');
    }
  }

  applyBrandSignalHints(signals, metadata, brandDNA);
  applyProjectSignalHints(signals, metadata, project, context);
  applyUserSignalHints(signals, metadata, input.userPrompt);

  for (const [key, value] of typedSignalEntries(input.signalOverrides ?? {})) {
    setSignal(signals, metadata, key, value, 'user_explicit', 0.95, 'signal_override', true);
  }

  const validation = validateSignals(signals);
  const warnings = [...validation.warnings];
  for (const error of validation.errors) {
    warnings.push(error);
  }

  const resolvedSignals = validation.clamped;
  const profile: ContentSignalProfile = {
    constraints: buildConstraints(
      outputFormat,
      combinedText,
      input.userPrompt,
      platform,
      input.brandId,
    ),
    signals: resolvedSignals,
    derived: computeDerivedSignals(resolvedSignals),
    _inference_metadata: metadata,
  };

  return {
    profile,
    intent: {
      outputFormat,
      platform,
      audience: inferAudience(input, brandDNA, platform),
      goal: inferGoal(combinedText, outputFormat),
      angle: inferAngle(input.userPrompt, project),
      tone: inferTone(input, brandDNA),
      proofPoints: collectProofPoints(input, combinedText),
      forbiddenTerms: collectForbiddenTerms(brandDNA, context?.systemBrief),
      structuralHints: collectStructuralHints(brandDNA, project),
      visualNeeds: collectVisualNeeds(outputFormat, platform, combinedText),
      clickatron: inferClickatronNeed(outputFormat, platform, combinedText),
    },
    sources: {
      brandId: input.brandId,
      sessionId: input.sessionId,
      projectName: project?.projectName,
      brandContextPresent: hasBrandContext(brandDNA),
      brandVaultProfilePresent: Boolean(retrieved?.brandSignalProfile),
      projectFactsUsed: retrieved?.projectFacts.length ?? 0,
      globalFactsUsed: retrieved?.globalFacts.length ?? 0,
      interactionPatternsUsed: retrieved?.interactionPatterns.length ?? 0,
    },
    warnings,
  };
}

export function formatContentSignalProfileForPrompt(
  resolved: ThinkForgeContentSignalProfile,
): string {
  return [
    '<content_signal_profile>',
    JSON.stringify({
      constraints: resolved.profile.constraints,
      intent: resolved.intent,
      signals: resolved.profile.signals,
      derived: resolved.profile.derived,
      provenance: resolved.profile._inference_metadata,
      warnings: resolved.warnings,
    }, null, 2),
    '</content_signal_profile>',
  ].join('\n');
}

function inferOutputFormat(
  input: ResolveContentSignalProfileInput,
  combinedText: string,
): OutputFormat {
  if (input.authoringRequest) {
    return outputFormatFromDocumentContract(
      ThinkForgeAuthoringRequestSchema.parse(input.authoringRequest).contentContract,
    );
  }
  if (input.contentContract) {
    return outputFormatFromDocumentContract(
      ThinkForgeDocumentContractSchema.parse(input.contentContract),
    );
  }

  const explicitContract = [input.documentType, input.medium, input.project?.format]
    .map((value) => normalizeThinkForgeDocumentContract(value))
    .find((contract): contract is ThinkForgeDocumentContract => Boolean(contract));

  if (explicitContract) {
    return outputFormatFromDocumentContract(explicitContract);
  }

  for (const [pattern, format] of OUTPUT_FORMAT_ALIASES) {
    if (pattern.test(combinedText)) return format;
  }

  throw new Error('Content signal resolution requires an explicit document contract or supported document type.');
}

function outputFormatFromDocumentContract(contract: ThinkForgeDocumentContract): OutputFormat {
  if (contract.outputKind === 'video_script') return 'video_script';
  if (contract.outputKind === 'social_post' || contract.outputKind === 'carousel') {
    return 'social_post';
  }

  if (contract.artifactType === 'research_brief') return 'whitepaper';
  if (contract.artifactType === 'interview_questions') return 'podcast_script';
  if (contract.artifactType === 'score_direction') return 'presentation_script';
  return 'whitepaper';
}

function inferPlatform(input: ResolveContentSignalProfileInput, combinedText: string): string | undefined {
  if (input.authoringRequest) {
    return describeThinkForgePlatformSurface(
      ThinkForgeAuthoringRequestSchema.parse(input.authoringRequest).platformSurface,
    );
  }
  const direct = input.platform || input.project?.platform;
  if (direct?.trim()) return normalizePlatform(direct);

  for (const [pattern, platform] of PLATFORM_ALIASES) {
    if (pattern.test(combinedText)) return platform;
  }
  return undefined;
}

function normalizePlatform(value: string): string {
  for (const [pattern, platform] of PLATFORM_ALIASES) {
    if (pattern.test(value)) return platform;
  }
  return value.trim();
}

function toExtractionDocumentType(outputFormat: OutputFormat, explicit?: string): string {
  if (outputFormat === 'social_post' || outputFormat === 'caption') return 'post';
  if (outputFormat === 'video_script') return 'script';
  if (outputFormat === 'blog_article') return 'article';
  if (explicit?.trim()) return explicit.trim().toLowerCase().replace(/\s+/g, '_');
  return outputFormat;
}

function buildConstraints(
  outputFormat: OutputFormat,
  text: string,
  userPrompt: string,
  platform?: string,
  brandId?: string,
): ContentConstraints {
  const targetLength = inferTargetLength(outputFormat, text, platform);
  return {
    ...(targetLength ? { target_length: targetLength } : {}),
    output_format: outputFormat,
    language: inferContentLanguage(userPrompt),
    brand_voice_id: brandId,
    cta_type: inferCTAType(text),
    platform_constraints: platform
      ? resolveThinkForgePublishingConstraints(platform, outputFormat)
      : undefined,
  };
}

function normalizeLanguageInstruction(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeLanguageAlias(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

function explicitRequestedLanguage(userPrompt: string): string | undefined {
  const normalized = normalizeLanguageInstruction(userPrompt);
  const explicitCode = normalized.match(/\b(?:language|lang|idioma)\s+(?:is\s+)?([a-z]{2,3})\b/)?.[1];
  if (explicitCode && SUPPORTED_LANGUAGE_CODES.has(explicitCode)) return explicitCode;

  for (const [alias, language] of EXPLICIT_LANGUAGE_ALIASES) {
    const escapedAlias = escapeLanguageAlias(alias);
    const contextualRequest = new RegExp(
      `\\b(?:in|into|en|em|auf|dans|language|lang|idioma)\\s+(?:the\\s+)?${escapedAlias}\\b|\\b${escapedAlias}(?:[-\\s]+language)\\b`,
      'i',
    );
    if (contextualRequest.test(normalized)) return language;
  }

  return undefined;
}

function inferContentLanguage(userPrompt: string): string {
  const explicitLanguage = explicitRequestedLanguage(userPrompt);
  if (explicitLanguage) return explicitLanguage;

  const detectedLanguage = detect(userPrompt).toLocaleLowerCase();
  return SUPPORTED_LANGUAGE_CODES.has(detectedLanguage) ? detectedLanguage : 'en';
}

function inferTargetLength(
  outputFormat: OutputFormat,
  text: string,
  platform?: string,
): ContentConstraints['target_length'] | undefined {
  const duration = text.match(/(\d+(?:\.\d+)?)\s*[-\s]*\s*(seconds?|secs?|s|minutes?|mins?|hours?|hrs?|h)\b/i);
  if (duration) {
    const amount = Number(duration[1]);
    const multiplier = /^(?:hours?|hrs?|h)$/i.test(duration[2])
      ? 3_600
      : /^(?:minutes?|mins?)$/i.test(duration[2])
        ? 60
        : 1;
    const seconds = Math.round(amount * multiplier);
    if (seconds > 0) return { value: seconds, unit: 'seconds' };
  }

  const words = text.match(/(\d{2,5})\s*words?\b/i);
  if (words) return { value: Number(words[1]), unit: 'words' };

  const characters = text.match(/(\d{2,5})\s*(characters?|chars?)\b/i);
  if (characters) return { value: Number(characters[1]), unit: 'characters' };

  if (outputFormat === 'social_post' && /\b(?:short|concise)\b/i.test(text)) {
    return { value: /^(?:x|twitter)$/i.test(platform?.trim() ?? '') ? 220 : 600, unit: 'characters' };
  }

  return undefined;
}

function inferCTAType(text: string): CTAType {
  if (/urgent|limited|last chance|deadline|act now/i.test(text)) return 'urgent';
  if (/buy|book|sign up|subscribe|download|convert|purchase|demo/i.test(text)) return 'hard';
  if (/learn more|comment|reply|follow|share|save/i.test(text)) return 'soft';
  return 'none';
}

function applyBrandSignalHints(
  signals: Partial<CreativeSignals>,
  metadata: Record<string, InferenceMetadata>,
  brandDNA?: BrandDNA,
): void {
  if (!brandDNA) return;
  const text = [
    brandDNA.voiceLock,
    brandDNA.nicheMap,
    ...(brandDNA.hookArchetypes ?? []),
    ...(brandDNA.structuralHabits ?? []),
  ].filter(Boolean).join(' ');
  applyTextSignalHints(signals, metadata, text, 'brand_dna', 'brand_dna', 0.84);
}
function applyBrandVaultSignalDefaults(
  signals: Partial<CreativeSignals>,
  metadata: Record<string, InferenceMetadata>,
  profile?: RetrievedContext['brandSignalProfile'],
): void {
  if (!profile) return;
  const mapped = brandSignalProfileToCreativeSignalDefaults(profile);
  for (const [key, value] of typedSignalEntries(mapped.signals)) {
    const sourceMetadata = mapped._inference_metadata[String(key)];
    setSignal(
      signals,
      metadata,
      key,
      value,
      sourceMetadata?.source ?? 'brand_dna',
      sourceMetadata?.confidence ?? 0.7,
      sourceMetadata?.resolvedFrom ?? 'brand_vault',
      sourceMetadata?.wasLocked ?? false,
    );
  }
}

function applyProjectSignalHints(
  signals: Partial<CreativeSignals>,
  metadata: Record<string, InferenceMetadata>,
  project?: ProjectContextData | null,
  context?: AssembledContext | null,
): void {
  const text = [
    project?.purpose,
    project?.style,
    project?.tone,
    context?.projectSummary,
  ].filter(Boolean).join(' ');
  applyTextSignalHints(signals, metadata, text, 'campaign_lock', 'project_context', 0.8);
}

function applyUserSignalHints(
  signals: Partial<CreativeSignals>,
  metadata: Record<string, InferenceMetadata>,
  userPrompt: string,
): void {
  applyTextSignalHints(signals, metadata, userPrompt, 'user_explicit', 'user_prompt', 0.9);
}

function applyTextSignalHints(
  signals: Partial<CreativeSignals>,
  metadata: Record<string, InferenceMetadata>,
  text: string,
  source: SignalSource,
  resolvedFrom: string,
  confidence: number,
): void {
  if (!text.trim()) return;

  if (/formal|corporate|enterprise|institutional|polished/i.test(text)) {
    setSignal(signals, metadata, 'formality', 0.58, source, confidence, resolvedFrom);
  }
  if (/casual|conversational|plainspoken|human|chill|direct/i.test(text)) {
    setSignal(signals, metadata, 'formality', -0.35, source, confidence, resolvedFrom);
  }
  if (/warm|friendly|approachable|empathetic|supportive/i.test(text)) {
    setSignal(signals, metadata, 'warmth', 0.74, source, confidence, resolvedFrom);
  }
  if (/witty|funny|humou?r|playful|meme|joke/i.test(text)) {
    setSignal(signals, metadata, 'humor', 0.62, source, confidence, resolvedFrom);
    setSignal(signals, metadata, 'entertainment_intent', 0.72, source, confidence, resolvedFrom);
  }
  if (/expert|authority|credible|trusted|technical|specialist/i.test(text)) {
    setSignal(signals, metadata, 'ethos_load', 0.76, source, confidence, resolvedFrom);
    setSignal(signals, metadata, 'certainty', 0.78, source, confidence, resolvedFrom);
    setSignal(signals, metadata, 'epistemic_stance', 'teacher', source, confidence, resolvedFrom);
  }
  if (/teach|educate|explain|guide|tutorial|how[-\s]?to/i.test(text)) {
    setSignal(signals, metadata, 'education_intent', 0.78, source, confidence, resolvedFrom);
    setSignal(signals, metadata, 'behavioral_utility', 0.76, source, confidence, resolvedFrom);
  }
  if (/story|journey|case study|before and after|transformation/i.test(text)) {
    setSignal(signals, metadata, 'narrative_transportation', 0.74, source, confidence, resolvedFrom);
    setSignal(signals, metadata, 'tension_arc', 0.66, source, confidence, resolvedFrom);
  }
  if (/bold|provocative|contrarian|hot take|myth|mistake/i.test(text)) {
    setSignal(signals, metadata, 'power_dynamic', 'provoke', source, confidence, resolvedFrom);
    setSignal(signals, metadata, 'pivot_intensity', 0.68, source, confidence, resolvedFrom);
    setSignal(signals, metadata, 'novelty', 0.72, source, confidence, resolvedFrom);
  }
  if (/data|research|study|stat|metric|proof|evidence/i.test(text)) {
    setSignal(signals, metadata, 'logos_load', 0.76, source, confidence, resolvedFrom);
    setSignal(signals, metadata, 'specificity_grain', 0.74, source, confidence, resolvedFrom);
  }
  if (/urgent|launch|deadline|trend|trending|news|meme/i.test(text)) {
    setSignal(signals, metadata, 'kairos_pressure', 0.78, source, confidence, resolvedFrom);
    setSignal(signals, metadata, 'temporal_relevance_decay', 0.22, source, confidence, resolvedFrom);
  }
}

function inferAudience(
  input: ResolveContentSignalProfileInput,
  brandDNA?: BrandDNA,
  platform?: string,
): string | undefined {
  const explicitAudience = extractExplicitAudience(input.userPrompt);
  if (explicitAudience) return explicitAudience;
  const promptAudience = input.userPrompt.match(
    /\bfor\s+(.+?)(?=\s+(?:about|to|that|who|with|using|on)\b|[,.!?]|$)/i,
  )?.[1]?.trim();
  if (promptAudience) return promptAudience;
  if (input.project?.purpose) return input.project.purpose;
  if (brandDNA?.nicheMap) return brandDNA.nicheMap;
  if (platform) return `${platform} audience`;
  return undefined;
}

function inferGoal(text: string, outputFormat: OutputFormat): string {
  if (/sell|convert|buy|demo|lead|book/i.test(text)) return 'conversion';
  if (/teach|educate|explain|how[-\s]?to|tutorial/i.test(text)) return 'education';
  if (/announce|launch|release|new/i.test(text)) return 'announcement';
  if (/awareness|brand|authority|thought leadership|credibility/i.test(text)) return 'authority building';
  if (/engage|comment|share|community|conversation/i.test(text)) return 'engagement';
  if (outputFormat === 'ad_copy' || outputFormat === 'landing_page') return 'conversion';
  if (outputFormat === 'video_script') return 'attention and retention';
  return 'clear communication';
}

function inferAngle(userPrompt: string, project?: ProjectContextData | null): string {
  const about = userPrompt.match(/\babout\s+([^.!?]{5,140})/i)?.[1]?.trim();
  if (about) return about;
  if (project?.idea) return project.idea;
  return truncate(userPrompt.trim(), 160) || 'user-provided brief';
}

function inferTone(
  input: ResolveContentSignalProfileInput,
  brandDNA?: BrandDNA,
): string | undefined {
  if (input.project?.tone) return input.project.tone;
  if (input.project?.style) return input.project.style;
  if (brandDNA?.voiceLock) return brandDNA.voiceLock;
  return undefined;
}

function collectProofPoints(
  input: ResolveContentSignalProfileInput,
  combinedText: string,
): string[] {
  const metricMatches = combinedText.match(
    /(?:\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?x\b|\$\d[\d,]*(?:\.\d+)?[kKmMbB]?)/g,
  ) ?? [];
  const metricPoints = metricMatches.map((metric) => `Metric mentioned in brief: ${metric}`);
  const quantifiedClaims = extractQuantifiedBriefClaims(input.userPrompt)
    .map((claim) => `Required brief claim: ${claim}`);
  const explicitClaims = extractExplicitBriefClaims(input.userPrompt)
    .map((claim) => `Required brief claim: ${claim}`);
  const explicitAudience = extractExplicitAudience(input.userPrompt);
  const audienceAnchors = explicitAudience
    ? [`Required audience anchor: ${explicitAudience}`]
    : [];
  const facts = [
    ...(input.retrievedContext?.projectFacts ?? []),
    ...(input.retrievedContext?.globalFacts ?? []),
  ].slice(0, 5).map(formatFact);
  return unique([
    ...metricPoints,
    ...quantifiedClaims,
    ...explicitClaims,
    ...audienceAnchors,
    ...facts,
  ]).slice(0, 6);
}

function extractQuantifiedBriefClaims(userPrompt: string): string[] {
  return unique(
    userPrompt
      .split(/(?<=[.!?])\s+|\n+/)
      .map((sentence) => sentence
        .trim()
        .replace(/^(?:pilot detail|result|evidence|proof)\s*:\s*/i, '')
        .replace(/^(?:mention|include|cite|state|highlight|call\s+out)\s+(?:that\s+)?/i, '')
        .replace(/[.!?]+$/, ''))
      .filter((sentence) => (
        sentence.length >= 4
        && !/^(?:compose|create|draft|generate|make|produce|write)\b/i.test(sentence)
        && /(?:\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?x\b)/i.test(sentence)
      )),
  );
}

function extractExplicitAudience(userPrompt: string): string | undefined {
  return userPrompt.match(
    /\b(?:target(?:\s+audience)?|audience)\s*(?::|is\b)?\s*([^.!?\n]{2,160})/i,
  )?.[1]?.trim();
}

function extractExplicitBriefClaims(userPrompt: string): string[] {
  const claims: string[] = [];
  const directivePattern = /\b(?:mention|include|cite|state|highlight|call\s+out)\s+(?:that\s+)?([^.!?\n]{4,260})/gi;

  for (const match of userPrompt.matchAll(directivePattern)) {
    const claim = match[1]?.trim();
    if (!claim || !/(?:\d|https?:\/\/|\$)/.test(claim)) continue;
    claims.push(claim);
  }

  return unique(claims);
}

function formatFact(fact: SemanticFact): string {
  return `${fact.title}: ${fact.summary}`;
}

function collectForbiddenTerms(brandDNA?: BrandDNA, systemBrief?: string): string[] {
  const fromBrand = brandDNA?.killList ?? [];
  const fromBrief = systemBrief?.match(/Never mention:\s*([^\n]+)/i)?.[1]
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
  return unique([...fromBrand, ...fromBrief]);
}

function collectStructuralHints(
  brandDNA?: BrandDNA,
  project?: ProjectContextData | null,
): string[] {
  return unique([
    ...(brandDNA?.hookArchetypes ?? []),
    ...(brandDNA?.structuralHabits ?? []),
    project?.style,
  ].filter(Boolean) as string[]);
}

function collectVisualNeeds(
  outputFormat: OutputFormat,
  platform: string | undefined,
  text: string,
): string[] {
  const needs: string[] = [];
  if (outputFormat === 'video_script') needs.push('scene beats', 'camera/visual direction');
  if (outputFormat === 'social_post' && /image|visual|graphic|carousel|static|poster/i.test(text)) {
    needs.push('static visual concept');
  }
  if (/thumbnail/i.test(text)) needs.push('thumbnail concept');
  if (/lighting|camera|room|shoot|on[-\s]?camera/i.test(text)) needs.push('production setup guidance');
  if (platform) needs.push(`${platform} format fit`);
  return unique(needs);
}

function inferClickatronNeed(
  outputFormat: OutputFormat,
  platform: string | undefined,
  text: string,
): ResolvedCreativeIntent['clickatron'] {
  const rationale: string[] = [];
  const explicit = /clickatron|image|visual|graphic|thumbnail|poster|carousel|static|text\s*\+\s*image/i.test(text);
  if (explicit) rationale.push('brief requests visual/static creative support');
  if (outputFormat === 'social_post' && explicit) rationale.push('social post can produce a static creative');
  if (outputFormat === 'video_script' && /storyboard|shot list|thumbnail/i.test(text)) {
    rationale.push('video script requests visual planning asset');
  }
  if (platform && /instagram|youtube|tiktok/i.test(platform) && explicit) {
    rationale.push(`${platform} benefits from platform-shaped creative assets`);
  }

  const requested = rationale.length > 0;
  const assetIntent = !requested
    ? 'none'
    : /thumbnail/i.test(text)
      ? 'thumbnail'
      : outputFormat === 'video_script'
        ? 'storyboard'
        : 'static_image';

  return { requested, assetIntent, rationale };
}

function projectSummary(project?: ProjectContextData | null): string | undefined {
  if (!project) return undefined;
  return [
    project.projectName,
    project.idea,
    project.purpose,
    project.style,
    project.format,
    project.platform,
    project.tone,
  ].filter(Boolean).join(' ');
}

function hasBrandContext(brandDNA?: BrandDNA): boolean {
  return Boolean(
    brandDNA?.voiceLock ||
    brandDNA?.nicheMap ||
    brandDNA?.killList?.length ||
    brandDNA?.hookArchetypes?.length ||
    brandDNA?.structuralHabits?.length,
  );
}

function typedSignalEntries(
  signals: Partial<CreativeSignals>,
): Array<[keyof CreativeSignals, CreativeSignals[keyof CreativeSignals]]> {
  return Object.entries(signals) as Array<[keyof CreativeSignals, CreativeSignals[keyof CreativeSignals]]>;
}

function setSignal<K extends keyof CreativeSignals>(
  signals: Partial<CreativeSignals>,
  metadata: Record<string, InferenceMetadata>,
  key: K,
  value: CreativeSignals[K],
  source: SignalSource,
  confidence: number,
  resolvedFrom: string,
  wasLocked = false,
): void {
  if (value === undefined || value === null) return;
  signals[key] = value;
  metadata[String(key)] = {
    source,
    confidence,
    resolvedFrom,
    wasLocked,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value;
}
