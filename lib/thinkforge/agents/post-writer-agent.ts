import { z } from 'zod';
import { detect } from 'tinyld';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { StructuredAgent, type AgentConfig } from './base-agent';
import type { AgentInput, AgentStructuredOutput } from './types';
import { buildPostOutputFormat } from './prompt-utils';
import {
  evaluateContentProfileCompliance,
  shouldAutoRepairContentProfileViolations,
  type ThinkForgeContentSignalProfile,
} from '../signals';
import { generateStructuredWithWritingContextCache } from '../services/gemini-writing-context-cache';
import {
  findDisallowedThinkForgeAiFiller,
  resolveThinkForgeBrandLanguagePolicy,
} from '../data/brand-language-policy';
import { formatTrendBriefForPrompt } from './trend-brief-context';
import type { ThinkForgeDocumentContract } from '../schemas/document-contract';
import { buildIsolatedPromptParts, type IsolatedPromptParts } from './prompt-boundary';
import type { SourceLedger } from '../provenance/source-ledger';
import { buildPostEditorialPlan, type PostEditorialPlan } from './post-editorial-plan';
import {
  assertThinkForgePostTargetFeasible,
  measureThinkForgePublishableText,
} from '../signals/publishing-constraints';
import {
  THINKFORGE_POST_HASHTAG_MAX,
  THINKFORGE_RESTRAINED_EMOJI_MAX,
} from '../schemas/authoring-request';
import {
  countUnicodeWords,
  hasUnicodeFactualMarker,
  isSubstantiveUnicodeToken,
  isUnicodeQuestion,
  normalizeUnicodeText,
  segmentUnicodeSentences,
  unicodeLexicalTokens,
} from '../text/unicode-text';

// Flat PostWriter Output Contract
export const PostWriterResultSchema = z.object({
  content: z.string().describe('The actual post body formatted for the platform, without the final hashtag line'),
  hashtags: z.array(z.string()).max(THINKFORGE_POST_HASHTAG_MAX).describe('Optional publishable hashtags requested by the brief, each beginning with #. Return an empty array when hashtags were not requested; do not put them in content.'),
  contentAnalysis: z.object({
    tone: z.string().describe('The dominant tone used (e.g., Professional, Edgy, Instructive)'),
    vibe: z.string().describe('The overarching vibe or mood of the piece'),
    theme: z.string().describe('The core theme or message being delivered'),
    qualityScore: z.number().min(0).max(100).describe('Self-evaluated quality score (0-100) based on specificity and engagement'),
    violations: z.array(z.string()).describe('List of platform or brand rule violations (ideally empty)'),
    claimSupport: z.array(z.object({
      sentence: z.string().min(1).max(1200).describe('One exact declarative sentence copied from content, excluding hashtags, questions, and pure action CTAs'),
      sourceRef: z.string().min(1).max(120).describe('An authorized source ID listed in tf_untrusted_data.claimSources'),
      sourceExcerpt: z.string().min(1).max(1200).optional().describe('Server-owned audit evidence resolved from sourceRef. Do not invent this field.'),
      relationship: z.enum(['verbatim', 'paraphrase', 'bounded_implication']).describe('How the sentence relates to the cited source excerpt'),
    })).optional().describe('Hidden factual-support ledger. Required for every factual sentence, and for every substantive declarative sentence when the editorial plan is source-only or evidence-thin.'),
  }),
  clickatron: z.object({
    singleImagePrompt: z.string().optional().describe('A visual-only prompt for one Clickatron raster background. Describe concrete scene, composition, props, lighting, style, mood, and safe zones. Never include readable copy, text-overlay instructions, logos, watermarks, or legible UI labels.'),
    carouselPrompts: z.array(z.string()).optional().describe('One visual-only raster-background prompt per carousel slide. Each prompt must describe a distinct grounded scene and consistent visual system without readable copy, text-overlay instructions, logos, watermarks, or legible UI labels.'),
  }),
  metadata: z.object({
    platform: z.string().describe('The targeted platform (linkedin, twitter, etc)'),
    charCount: z.number().describe('Estimated character count'),
  }),
});

export type PostWriterResult = z.infer<typeof PostWriterResultSchema>;

/**
 * Edit framing for the revise-existing-content path (P5). When present, the writer REVISES
 * `existingContent` per `instruction` and returns the COMPLETE revised post in the same
 * PostWriterResult shape. Opt-in: absent editContext = unchanged from-scratch behavior.
 */
interface PostWriterEditContext {
  existingContent: string;
  instruction: string;
  selection?: string;
  focusHint?: string;
}

export interface PostWriterInput extends AgentInput {
  project?: (NonNullable<AgentInput['project']> & { contentContract?: ThinkForgeDocumentContract }) | null;
  contentSignalProfile?: ThinkForgeContentSignalProfile;
  productionBrief?: ProductionBrief | null;
  sourceLedger?: SourceLedger | null;
  /** When set, switches the writer into edit/revise mode (see PostWriterEditContext). */
  editContext?: PostWriterEditContext;
}

const POST_CTA_PATTERN =
  /(?:\b(ask|apply|book|buy|call|claim|comment|contact|dm|donate|discover|download|get|join|learn more|message|register|reply|repost|reserve|save|schedule|send|share|shop|sign ?up|tag|try|visit|watch)\b|inscr[ií]bete|registrate|reg[ií]strate|[uú]nete|reserva|compra|visita|env[ií]a|manda|escr[ií]benos|comenta|comparte)/i;

const POST_CONTRACT_FAILURE_PREFIX = 'Post writer output failed publishable quality gate:';

const GENERIC_CTA_PATTERN =
  /\b(?:discover|learn more|follow for more|link in bio|don't miss out|join us)\b/i;

const SPECIFIC_CTA_ACTION_PATTERN =
  /(?:https?:\/\/|\b(?:apply|book|buy|call|claim|comment|contact|dm|donate|download|message|register|reply|reserve|schedule|send|shop|sign ?up|visit)\b)/i;

const GENERIC_VISUAL_HANDOFF_PATTERN =
  /\b(?:modern|bright|sleek|professional|calm)\s+(?:office|workspace|team|dashboard)\b/i;

const VISUAL_SAFE_SPACE_PATTERN =
  /\b(?:safe[-\s]?(?:zone|space)|negative\s+space|clear\s+space|espacio\s+(?:negativo|libre|seguro))\b/i;

const GENERIC_CTA_QUESTION_PATTERN =
  /\b(?:how\s+(?:is|are)|are\s+you|what(?:'s|\s+is)\s+your\s+(?:team|company|organization)|what\s+do\s+you\s+think|thoughts|agree|right|what(?:'s|\s+is)\s+the\s+(?:(?:single|one)\s+)?(?:biggest|main|primary)\s+(?:bottleneck|challenge|issue|problem))\b/i;

const CLICKATRON_COPY_INSTRUCTION_PATTERN =
  /(?:text[-\s]?overlays?|overlay\s+text|\b(?:labeled|labelled)\s+(?:['"][^'"]+['"]|[\p{L}\p{N}_-]+)|(?:['"][^'"]+['"]|\bq[1-4]\b)\s+(?:button|caption|column|field|headline|indicator|label|metric|title)|(?:display(?:ing|s)?|read(?:ing|s)?|say(?:ing|s)?|show(?:ing|s)?)\s+(?:a\s+|the\s+)?['"][^'"]+['"])/iu;

const CLICKATRON_BRAND_MARK_REQUEST_PATTERN =
  /\b(?:display(?:ing|s)?|fade(?:s|d|ing)?\s+to|featur(?:e|es|ing)|include(?:s|d|ing)?|render(?:s|ed|ing)?|show(?:ing|s)?|transition(?:s|ed|ing)?\s+to)\b[^.!?]{0,80}\b(?:logo|wordmark|watermark|website\s+url)\b/i;

const CLICKATRON_NEGATIVE_COPY_CONSTRAINT_PATTERN =
  /\b(?:avoid(?:ing)?|do\s+not\s+(?:add|display|draw|include|render|show)|free\s+of|no|without)\b[^.!?]{0,120}\b(?:copy|headlines?|labels?|legible\s+ui|logos?|numbers?|readable\s+text|text|watermarks?|wordmarks?)\b/gi;

const OUTREACH_CTA_PATTERN =
  /\b(?:dm|message|contact|call|book|schedule)\s+(?:us|me|our team|a demo|a call|time)\b/i;

const SUPPLIED_OUTREACH_ROUTE_PATTERN =
  /(?:https?:\/\/|\b(?:dm|message|contact|call|book|schedule)\b)/i;

const SOURCE_ONLY_CLAIM_FAMILIES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  {
    id: 'causal_expansion',
    pattern: /\b(?:because|therefore|thereby|consequently|as a result|means? that|so that|porque|por eso|como resultado|significa que|para que)\b/i,
  },
  {
    id: 'impact_expansion',
    pattern: /\b(?:(?:affect|impact|benefit|protect|save|prevent|solve)(?:s|ed|ing)?|afecta|beneficia|protege|salva|previene|resuelve)\b/i,
  },
  {
    id: 'outcome_expansion',
    pattern: /\b(?:(?:restore|transform|improve|reduce|increase)(?:s|d|ed|ing)?|restaura|transforma|mejora|reduce|aumenta)\b|\b(?:tangible|lasting|meaningful|real) difference\b/i,
  },
  {
    id: 'importance_expansion',
    pattern: /\b(?:vital|essential|crucial|urgent|urgently|esencial|urgente)\b/i,
  },
];

const SOURCE_ONLY_NON_FACTUAL_ACTION_PATTERN =
  /^(?:please\s+)?(?:save|share)\s+(?:this|the)\s+(?:post|caption|guide|date)\b|^(?:guarda|comparte)\s+(?:este|esta|el|la)\s+(?:post|publicacion|guia|fecha)\b/i;

const PURE_ACTION_SENTENCE_PATTERN =
  /^(?:please\s+)?(?:apply|ask|book|buy|call|claim|comment|compare|contact|dm|donate|download|get|join|keep|learn|map|message|pick|read|register|reply|repost|reserve|route|save|schedule|send|share|shop|sign\s+up|tag|try|visit|watch)\b|^(?:aplica|comenta|comparte|compara|consulta|descarga|envia|guarda|inscribete|mapea|pregunta|registra|reserva|visita)\b/i;

const BOUNDED_IMPLICATION_MARKER_PATTERN =
  /\b(?:according\s+to|based\s+on|boundary|compare|limited\s+to|measured|not\s+a\s+forecast|pilot|reference|reported|scope|within)\b|\b(?:comparar|limitad[oa]\s+a|medid[oa]|piloto|referencia|segun)\b/i;

const SOURCE_ONLY_ASSERTIVE_PREDICATE_PATTERN =
  /\b(?:is|are|was|were|will|would|can|could|means?|makes?|making|ensures?|ensuring|helps?|provides?|offers?|allows?|leads?|creates?|gives?|es|son|sera|seran|puede|pueden|significa|hace|garantiza|ayuda|permite|ofrece|crea)\b/i;

const THIN_EVIDENCE_EXPANSION_PATTERN =
  /\b(?:because|therefore|thereby|consequently|as a result|means? that|impact(?:s|ed|ing)?|benefit(?:s|ed|ing)?|help(?:s|ed|ing)?|transform(?:s|ed|ing)?|improv(?:e|es|ed|ing)|increas(?:e|es|ed|ing)|reduc(?:e|es|ed|ing)|streamlin(?:e|es|ed|ing)|optimiz(?:e|es|ed|ing)|maximiz(?:e|es|ed|ing)|recover(?:s|ed|ing)?|ensur(?:e|es|ed|ing)|enabl(?:e|es|ed|ing)|allow(?:s|ed|ing)?|driv(?:e|es|en|ing)|gain(?:s|ed|ing)?|automatically|more efficiently|can\s+(?:dedicate|focus|redirect|resolve|spend)|porque|por eso|como resultado|significa que|impacta|beneficia|ayuda|ayudan|transforma|mejora|aumenta|reduce|garantiza|permite|automaticamente|con mayor eficiencia|puede(?:n)?\s+(?:dedicar|centrar|redirigir|resolver))\b/i;

const POST_DESTINATION_PATTERN = /(?:https?:\/\/|www\.)?\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;

const HASHTAG_TOKEN_PATTERN = /#[\p{L}\p{M}\p{N}_]+/gu;
const HASHTAG_ONLY_LINE_PATTERN = /^(?:#[\p{L}\p{M}\p{N}_]+\s*)+$/u;
const POST_EMOJI_SEGMENT_PATTERN = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u;
const POST_GRAPHEME_SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' });

const POST_TOPIC_ANCHOR_STOP_WORDS = new Set([
  'about', 'after', 'aimed', 'and', 'before', 'brief', 'caption', 'concrete', 'create',
  'deadpan', 'dry', 'every', 'facebook', 'feel', 'for', 'give', 'helping', 'honest',
  'instagram', 'just', 'linkedin', 'list', 'listing', 'make', 'matter', 'one', 'post',
  'practical', 'prepare', 'should', 'social', 'target', 'that', 'the', 'their', 'them',
  'three', 'short', 'tone', 'twitter', 'why', 'with', 'write', 'your',
]);

const SOURCE_COVERAGE_STOP_WORDS = new Set([
  'about', 'after', 'also', 'before', 'brief', 'create', 'facebook', 'from', 'have',
  'instagram', 'into', 'just', 'linkedin', 'make', 'post', 'that', 'their', 'there',
  'these', 'they', 'this', 'those', 'through', 'with', 'write', 'your',
  'como', 'con', 'cada', 'desde', 'donde', 'escribe', 'esta', 'este', 'estos', 'estas',
  'hasta', 'para', 'pero', 'porque', 'sobre', 'tambien', 'todas', 'todos', 'una', 'unas',
  'unos',
]);

function resolvePostEditorialPlanForInput(input: PostWriterInput): PostEditorialPlan {
  return buildPostEditorialPlan({
    userPrompt: input.userPrompt,
    authoringRequest: input.authoringRequest,
    contentSignalProfile: input.contentSignalProfile,
    retrievedFactCount: (input.retrievedContext?.projectFacts.length ?? 0)
      + (input.retrievedContext?.globalFacts.length ?? 0),
  });
}

function requestedCarouselSlideCount(input: PostWriterInput): number | undefined {
  const authoritativeContract = input.authoringRequest?.contentContract;
  const compatibilityContract = input.project?.contentContract;
  if (
    authoritativeContract
    && compatibilityContract
    && (
      authoritativeContract.version !== compatibilityContract.version
      || authoritativeContract.documentKind !== compatibilityContract.documentKind
      || authoritativeContract.outputKind !== compatibilityContract.outputKind
      || authoritativeContract.artifactType !== compatibilityContract.artifactType
      || authoritativeContract.carouselSlideCount !== compatibilityContract.carouselSlideCount
    )
  ) {
    throw new Error('ThinkForge post writer received conflicting authoring and compatibility contracts');
  }
  const contract = authoritativeContract ?? compatibilityContract;
  return contract?.outputKind === 'carousel' ? contract.carouselSlideCount : undefined;
}

function normalizeHashtag(value: string): string | undefined {
  const normalized = value.trim();
  return /^#[\p{L}\p{M}\p{N}_]+$/u.test(normalized) ? normalized : undefined;
}

function validateHashtagPlan(values: readonly string[], source: string): string[] {
  const seen = new Set<string>();
  const hashtags: string[] = [];
  values.forEach((value, index) => {
    const hashtag = normalizeHashtag(value);
    if (!hashtag) {
      throw new Error(`${POST_CONTRACT_FAILURE_PREFIX} invalid_hashtag:${source}:${index + 1}`);
    }
    const key = hashtag.toLocaleLowerCase();
    if (seen.has(key)) {
      throw new Error(`${POST_CONTRACT_FAILURE_PREFIX} duplicate_hashtag:${source}:${index + 1}`);
    }
    seen.add(key);
    hashtags.push(hashtag);
  });
  return hashtags;
}

function sameHashtagPlan(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value.toLocaleLowerCase() === right[index]?.toLocaleLowerCase());
}

function sameExactHashtagPlan(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function extractTrailingHashtags(content: string): { body: string; hashtags: string[] } {
  const lines = content.trimEnd().split('\n');
  const hashtagLines: string[] = [];
  while (lines.length > 0 && HASHTAG_ONLY_LINE_PATTERN.test(lines.at(-1)?.trim() ?? '')) {
    hashtagLines.unshift(lines.pop() ?? '');
  }

  return {
    body: lines.join('\n').trimEnd(),
    hashtags: hashtagLines.flatMap((line) => line.match(HASHTAG_TOKEN_PATTERN) ?? []),
  };
}

function assemblePostHashtagPlan(
  result: PostWriterResult,
  editorialPlan: PostEditorialPlan,
): boolean {
  const originalContent = result.content;
  const originalHashtags = [...result.hashtags];
  const extracted = extractTrailingHashtags(result.content);
  const plannedHashtags = validateHashtagPlan(result.hashtags, 'structured_field');
  const trailingHashtags = validateHashtagPlan(extracted.hashtags, 'content_tail');
  const inlineHashtags = extracted.body.match(HASHTAG_TOKEN_PATTERN) ?? [];
  let hashtags: string[];

  if (editorialPlan.controlSource === 'authoring_request') {
    if (editorialPlan.hashtagMode === 'none') {
      if (inlineHashtags.length > 0) {
        throw new Error(`${POST_CONTRACT_FAILURE_PREFIX} hashtag_forbidden_in_body`);
      }
      hashtags = [];
    } else if (editorialPlan.hashtagMode === 'exact') {
      if (inlineHashtags.length > 0) {
        throw new Error(`${POST_CONTRACT_FAILURE_PREFIX} hashtag_embedded_in_body`);
      }
      hashtags = [...editorialPlan.requiredHashtags];
    } else {
      if (
        plannedHashtags.length > 0
        && trailingHashtags.length > 0
        && !sameHashtagPlan(plannedHashtags, trailingHashtags)
      ) {
        throw new Error(`${POST_CONTRACT_FAILURE_PREFIX} conflicting_hashtag_plans`);
      }
      hashtags = plannedHashtags.length > 0 ? plannedHashtags : trailingHashtags;
    }
  } else {
    if (
      plannedHashtags.length > 0
      && trailingHashtags.length > 0
      && !sameHashtagPlan(plannedHashtags, trailingHashtags)
    ) {
      throw new Error(`${POST_CONTRACT_FAILURE_PREFIX} conflicting_hashtag_plans`);
    }
    hashtags = plannedHashtags.length > 0 ? plannedHashtags : trailingHashtags;
  }

  result.hashtags = hashtags;
  result.content = hashtags.length > 0
    ? `${extracted.body}\n\n${hashtags.join(' ')}`
    : extracted.body;
  return result.content !== originalContent || !sameHashtagPlan(result.hashtags, originalHashtags);
}

function maximumPostCharacters(editorialPlan: PostEditorialPlan): number | undefined {
  const platformMaximum = editorialPlan.publishingConstraints.maxCharacters
    ?? editorialPlan.publishingConstraints.standardMaxCharacters;
  const editorialMaximum = editorialPlan.maximumBodyCharacters;
  if (platformMaximum === undefined) return editorialMaximum;
  if (editorialMaximum === undefined) return platformMaximum;
  return Math.min(platformMaximum, editorialMaximum);
}

const EXPLICIT_POST_LENGTH_TOLERANCE = 0.1;

interface PostLengthContract {
  targetCharacters?: number;
  minimumCharacters?: number;
  maximumCharacters?: number;
  targetWords?: number;
  minimumWords?: number;
  maximumWords?: number;
}

function resolvePostLengthContract(
  editorialPlan: PostEditorialPlan,
): PostLengthContract {
  const publishingMaximum = maximumPostCharacters(editorialPlan);
  const targetCharacters = editorialPlan.targetBodyCharacters;
  const targetWords = editorialPlan.targetBodyWords;

  return {
    ...(targetCharacters !== undefined ? {
      targetCharacters,
      minimumCharacters: Math.floor(targetCharacters * (1 - EXPLICIT_POST_LENGTH_TOLERANCE)),
      maximumCharacters: Math.ceil(targetCharacters * (1 + EXPLICIT_POST_LENGTH_TOLERANCE)),
    } : {}),
    ...(targetWords !== undefined ? {
      targetWords,
      minimumWords: Math.floor(targetWords * (1 - EXPLICIT_POST_LENGTH_TOLERANCE)),
      maximumWords: Math.ceil(targetWords * (1 + EXPLICIT_POST_LENGTH_TOLERANCE)),
    } : {}),
    ...(publishingMaximum !== undefined ? {
      maximumCharacters: targetCharacters === undefined
        ? publishingMaximum
        : Math.min(publishingMaximum, Math.ceil(targetCharacters * (1 + EXPLICIT_POST_LENGTH_TOLERANCE))),
    } : {}),
  };
}

function buildPostLengthContract(
  editorialPlan: PostEditorialPlan,
): string {
  const contract = resolvePostLengthContract(editorialPlan);
  const characterTarget = contract.targetCharacters === undefined
    ? ''
    : `- Explicit character target: ${contract.targetCharacters}; accepted band ${contract.minimumCharacters}-${contract.maximumCharacters}.`;
  const wordTarget = contract.targetWords === undefined
    ? ''
    : `- Explicit word target: ${contract.targetWords}; accepted band ${contract.minimumWords}-${contract.maximumWords}.`;

  return `<post_length_contract>
- Numeric bounds exist only for an explicit brief target or a verified publishing maximum.
${characterTarget}
${wordTarget}
${contract.maximumCharacters === undefined ? '- No numeric character maximum is asserted.' : `- Final body plus hashtags maximum: ${contract.maximumCharacters} characters.`}
- When no explicit target exists, use only the length justified by the supported idea. Never pad for a platform recommendation.
</post_length_contract>`;
}

type PostOutputPlatform = Parameters<typeof buildPostOutputFormat>[0];

function resolvePostOutputPlatform(editorialPlan: PostEditorialPlan): PostOutputPlatform {
  switch (editorialPlan.publishingConstraints.surface) {
    case 'linkedin_post':
      return 'linkedin';
    case 'x_post':
      return 'twitter';
    case 'instagram_feed':
    case 'instagram_reels':
      return 'instagram';
    case 'facebook_post':
      return 'facebook';
    default:
      return 'generic';
  }
}

function countPostEmoji(value: string): number {
  return [...POST_GRAPHEME_SEGMENTER.segment(value)]
    .filter((segment) => POST_EMOJI_SEGMENT_PATTERN.test(segment.segment))
    .length;
}

function assertPostEditorialPlanFeasible(editorialPlan: PostEditorialPlan): void {
  assertThinkForgePostTargetFeasible({
    ...(editorialPlan.targetBodyCharacters !== undefined
      ? { targetCharacters: editorialPlan.targetBodyCharacters }
      : {}),
    ...(editorialPlan.targetBodyWords !== undefined
      ? { targetWords: editorialPlan.targetBodyWords }
      : {}),
    ...(editorialPlan.hashtagMode === 'exact'
      ? { exactHashtags: editorialPlan.requiredHashtags }
      : {}),
    tolerance: EXPLICIT_POST_LENGTH_TOLERANCE,
  }, editorialPlan.publishingConstraints, editorialPlan.platform);
}

function getPublishableLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !HASHTAG_ONLY_LINE_PATTERN.test(line));
}

function getSuppliedPostContext(input: PostWriterInput): string {
  return [input.userPrompt, input.context.projectSummary, input.context.systemBrief]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
}

function requiredBriefClaims(input: PostWriterInput): string[] {
  return input.contentSignalProfile?.intent.proofPoints
    .map((point) => point.match(/^Required brief claim:\s*(.+)$/i)?.[1]?.trim())
    .filter((claim): claim is string => Boolean(claim)) ?? [];
}

function normalizeSourceText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/g, '')
    .toLocaleLowerCase();
}

interface PostExecutionAnchors {
  audience?: string;
  topicTerms: string[];
  visualBrief?: string;
}

function resolvePostExecutionAnchors(input: PostWriterInput): PostExecutionAnchors {
  const proofPoints = input.contentSignalProfile?.intent.proofPoints ?? [];
  const audience = proofPoints
    .map((point) => point.match(/^Required audience anchor:\s*(.+)$/i)?.[1]?.trim())
    .find((anchor): anchor is string => Boolean(anchor));
  const explicitTopicSegments = [...input.userPrompt.matchAll(
    /\b(?:offer|topic)\s*:\s*([^.!?\n]{3,240})/gi,
  )].map((match) => match[1] ?? '');
  const aboutSegment = input.userPrompt.match(/\babout\s+([^.!?\n]{3,240})/i)?.[1];
  const rankedSources: Array<{ value: string; weight: number }> = [
    { value: input.contentSignalProfile?.intent.angle ?? '', weight: 7 },
    ...requiredBriefClaims(input).map((value) => ({ value, weight: 6 })),
    ...explicitTopicSegments.map((value) => ({ value, weight: 5 })),
    ...(aboutSegment ? [{ value: aboutSegment, weight: 4 }] : []),
    { value: input.context.projectSummary ?? '', weight: 3 },
    { value: input.userPrompt, weight: 1 },
  ];
  const scores = new Map<string, { score: number; order: number; display: string }>();
  let order = 0;
  for (const source of rankedSources) {
    for (const token of normalizeSourceLanguage(source.value).match(/[\p{L}\p{N}]+/gu) ?? []) {
      if (/^\p{N}/u.test(token) || token.length < 3 || POST_TOPIC_ANCHOR_STOP_WORDS.has(token)) continue;
      const normalized = sourceCoverageToken(token);
      const current = scores.get(normalized);
      scores.set(normalized, {
        score: (current?.score ?? 0) + source.weight,
        order: current?.order ?? order++,
        display: current?.display ?? token,
      });
    }
  }
  const topicTerms = [...scores.entries()]
    .sort((left, right) => right[1].score - left[1].score || left[1].order - right[1].order)
    .slice(0, 8)
    .map(([, evidence]) => evidence.display);

  const visualBrief = cleanRequiredVisibleText(input.contentSignalProfile?.intent.angle ?? '');
  return { audience, topicTerms, ...(visualBrief ? { visualBrief } : {}) };
}

function containsNormalizedText(content: string, expected: string): boolean {
  return normalizeSourceText(content).includes(normalizeSourceText(expected));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countTopicTerms(content: string, terms: readonly string[]): number {
  const normalizedTokens = new Set(
    (normalizeSourceLanguage(content).match(/[\p{L}\p{N}]+/gu) ?? []).map(sourceCoverageToken),
  );
  return terms.filter((term) => normalizedTokens.has(sourceCoverageToken(term))).length;
}

function cleanRequiredVisibleText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function removeClickatronCopyInstructions(prompt: string): string {
  const sanitized = prompt
    .replace(/\btext[-\s]?overlays?\s*:\s*[^.!?]*(?:[.!?]|$)/gi, '')
    .replace(/\b(?:display(?:ing|s)?|read(?:ing|s)?|say(?:ing|s)?|show(?:ing|s)?)\s+(?:a\s+|the\s+)?(?:clear\s+|prominent\s+)?(['"])[^'"]+\1(?:\s+(?:button|caption|column|field|headline|indicator|label|metric|title))?/gi, 'showing an abstract, defocused interface element')
    .replace(/(['"])[^'"]+\1\s+(?:button|caption|column|field|headline|indicator|label|metric|title)/gi, 'an abstract interface element')
    .replace(/\b(?:a\s+)?(?:subtle\s+)?(?:['"][^'"]+['"]|\bq[1-4]\b)\s+indicator\b/gi, 'abstract timing cue')
    .replace(/\b(?:labeled|labelled)\s+(?:(['"])[^'"]+\1|[\p{L}\p{N}_-]+(?:\s+[\p{L}\p{N}_-]+){0,2})/giu, 'with no readable markings')
    .replace(CLICKATRON_BRAND_MARK_REQUEST_PATTERN, 'showing an abstract brand-safe shape')
    .replace(/https?:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi, '')
    .replace(/\b(?:text[-\s]?overlays?|overlay\s+text)\b/gi, 'text-safe negative space')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
  return /\b(?:no|without)\b[^.!?]{0,80}\b(?:labels?|legible\s+ui|readable\s+(?:copy|text)|text)\b/i.test(sanitized)
    ? sanitized
    : `${sanitized} No readable text, labels, numbers, logos, watermarks, or legible UI.`;
}

function clickatronPromptRequestsReadableCopy(prompt: string): boolean {
  const affirmativePrompt = prompt.replace(CLICKATRON_NEGATIVE_COPY_CONSTRAINT_PATTERN, '');
  return CLICKATRON_COPY_INSTRUCTION_PATTERN.test(affirmativePrompt)
    || CLICKATRON_BRAND_MARK_REQUEST_PATTERN.test(affirmativePrompt);
}

function reconcileClickatronVisualContract(
  result: PostWriterResult,
  input: PostWriterInput,
  editorialPlan: PostEditorialPlan,
): boolean {
  const anchors = resolvePostExecutionAnchors(input);
  let changed = false;
  const normalizePrompt = (prompt: string): string => {
    const sanitized = removeClickatronCopyInstructions(prompt);
    changed = changed || sanitized !== prompt;
    let grounded = sanitized;
    if (GENERIC_VISUAL_HANDOFF_PATTERN.test(sanitized)) {
      changed = true;
      grounded = sanitized.replace(
        GENERIC_VISUAL_HANDOFF_PATTERN,
        'source-grounded operational scene',
      ).trim();
    }
    if (
      input.contentSignalProfile
      && anchors.topicTerms.length >= 2
      && countTopicTerms(grounded, anchors.topicTerms) < 2
    ) {
      changed = true;
      const groundingClause = `Ground the scene in ${anchors.topicTerms.slice(0, 4).join(', ')} through concrete non-textual props, an observable workflow action, and the operational environment.`;
      grounded = `${grounded} ${groundingClause}`;
    }
    if (!editorialPlan.visualProofDirection || grounded.includes(editorialPlan.visualProofDirection)) return grounded;
    changed = true;
    return `${grounded} ${editorialPlan.visualProofDirection}`;
  };

  if (result.clickatron.singleImagePrompt) {
    result.clickatron.singleImagePrompt = normalizePrompt(result.clickatron.singleImagePrompt);
  }
  if (result.clickatron.carouselPrompts) {
    result.clickatron.carouselPrompts = result.clickatron.carouselPrompts.map(normalizePrompt);
  }

  return changed;
}

function contentWithoutRequiredSourceClaims(content: string, input: PostWriterInput): string {
  return requiredBriefClaims(input).reduce(
    (remaining, claim) => remaining.replace(new RegExp(escapeRegExp(claim), 'gi'), ''),
    content,
  );
}

function unsupportedSourceOnlyClaimFamilies(
  content: string,
  input: PostWriterInput,
  editorialPlan: PostEditorialPlan,
): string[] {
  if (editorialPlan.sourceBoundary !== 'source_only') return [];

  const suppliedContext = normalizeSourceLanguage(getSuppliedPostContext(input));
  const claimContent = segmentUnicodeSentences(content)
    .map((sentence) => normalizeSourceLanguage(sentence))
    .filter((sentence) => sentence.length > 0 && !SOURCE_ONLY_NON_FACTUAL_ACTION_PATTERN.test(sentence))
    .join('\n');
  return SOURCE_ONLY_CLAIM_FAMILIES
    .filter(({ pattern }) => pattern.test(claimContent) && !pattern.test(suppliedContext))
    .map(({ id }) => id);
}

function normalizeSourceLanguage(value: string): string {
  return normalizeUnicodeText(value);
}

function sourceCoverageToken(value: string): string {
  if (/^\p{N}/u.test(value)) return value;
  if (value.length > 6 && value.endsWith('ies')) return `${value.slice(0, -3)}y`;
  if (value.length > 6 && value.endsWith('ing')) return value.slice(0, -3);
  if (value.length > 5 && value.endsWith('ed')) return value.slice(0, -2);
  if (value.length > 5 && value.endsWith('es')) return value.slice(0, -2);
  if (value.length > 4 && value.endsWith('s')) return value.slice(0, -1);
  return value;
}

function sourceCoverageTokens(value: string): string[] {
  return [...new Set(
    unicodeLexicalTokens(value)
      .filter((token) => (
        isSubstantiveUnicodeToken(token)
        && !SOURCE_COVERAGE_STOP_WORDS.has(token)
      ))
      .map(sourceCoverageToken),
  )];
}

interface AuthorizedClaimSource {
  sourceRef: string;
  sourceText: string;
  sourceKind: string;
}

function normalizedClaimText(value: string): string {
  return normalizeSourceLanguage(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedExtractiveClaimText(value: string): string {
  return normalizedClaimText(value.replace(/^[\p{L}]{3,24},\s+/u, ''));
}

function requiredClaimMaterialAnchors(editorialPlan: PostEditorialPlan): string[] {
  const claimTokens = sourceCoverageTokens(editorialPlan.requiredClaim ?? '');
  const numericAnchors = claimTokens.filter((token) => /^\p{N}/u.test(token));
  if (numericAnchors.length > 0) return numericAnchors;

  return claimTokens.filter((token) => token.length >= 5);
}

function hasRequiredClaimMaterialAnchor(
  sentence: string,
  editorialPlan: PostEditorialPlan,
): boolean {
  const anchors = requiredClaimMaterialAnchors(editorialPlan);
  if (anchors.length === 0) return true;

  const sentenceTokens = new Set(sourceCoverageTokens(sentence));
  const requiredMatches = anchors.filter((anchor) => sentenceTokens.has(anchor)).length;
  const requiredMatchCount = anchors.some((anchor) => /^\p{N}/u.test(anchor))
    ? 1
    : Math.min(2, anchors.length);
  return requiredMatches >= requiredMatchCount;
}

function postContentSentences(content: string): string[] {
  return segmentUnicodeSentences(content)
    .filter((sentence) => sentence.length > 0 && !HASHTAG_ONLY_LINE_PATTERN.test(sentence));
}

function requiresComprehensiveClaimSupport(
  editorialPlan: PostEditorialPlan,
): boolean {
  return editorialPlan.sourceBoundary === 'source_only'
    || (editorialPlan.evidenceDensity === 'thin' && Boolean(editorialPlan.requiredClaim));
}

function sentenceOverlapsAuthorizedSource(
  sentence: string,
  sources: Map<string, string>,
): boolean {
  const sentenceTokens = new Set(sourceCoverageTokens(sentence));
  if (sentenceTokens.size === 0) return false;

  return [...sources.values()].some((source) => {
    const sourceTokens = new Set(sourceCoverageTokens(source));
    let overlap = 0;
    for (const token of sentenceTokens) {
      if (sourceTokens.has(token)) overlap += 1;
      if (overlap >= 2) return true;
    }
    return false;
  });
}

function claimBearingSentences(
  content: string,
  editorialPlan: PostEditorialPlan,
  sources: Map<string, string>,
): Array<{ sentence: string; index: number }> {
  const comprehensive = requiresComprehensiveClaimSupport(editorialPlan);
  return postContentSentences(content).flatMap((sentence, index) => {
    if (
      isUnicodeQuestion(sentence)
      || PURE_ACTION_SENTENCE_PATTERN.test(normalizeSourceLanguage(sentence))
    ) {
      return [];
    }

    const substantive = sourceCoverageTokens(sentence).length >= 2;
    const requiresEvidence = comprehensive
      || hasUnicodeFactualMarker(sentence)
      || sentenceOverlapsAuthorizedSource(sentence, sources);
    return substantive && requiresEvidence
      ? [{ sentence, index: index + 1 }]
      : [];
  });
}

function authorizedClaimSources(input: PostWriterInput): AuthorizedClaimSource[] {
  const sources = new Map<string, AuthorizedClaimSource>();
  const addSource = (sourceRef: string, sourceText: string | null | undefined, sourceKind: string) => {
    const text = sourceText?.trim();
    if (!text || sources.has(sourceRef)) return;
    sources.set(sourceRef, { sourceRef, sourceText: text, sourceKind });
  };

  const ledgerEntries = input.sourceLedger?.entries ?? [];
  if (ledgerEntries.length > 0) {
    for (const entry of ledgerEntries) {
      addSource(entry.referenceId, entry.summary, entry.kind);
    }
    return [...sources.values()];
  }

  // Compatibility for direct callers that have not supplied a canonical ledger.
  addSource('brief_user', input.userPrompt, 'user_brief');
  addSource('project_summary', input.context.projectSummary, 'project_summary');
  const retrievedFacts = [
    ...(input.retrievedContext?.projectFacts ?? []),
    ...(input.retrievedContext?.globalFacts ?? []),
  ];
  retrievedFacts.forEach((fact, index) => {
    addSource(`source_${index + 1}`, `${fact.title}\n${fact.summary}`, 'retrieved_fact');
  });
  return [...sources.values()];
}

function authorizedClaimSourceMap(input: PostWriterInput): Map<string, string> {
  return new Map(authorizedClaimSources(input).map((source) => [source.sourceRef, source.sourceText]));
}

function sourceExcerptForClaim(sourceText: string, sentence: string): string {
  if (sourceText.length <= 1_200) return sourceText;

  const sentenceTokens = new Set(sourceCoverageTokens(sentence));
  const candidates = segmentUnicodeSentences(sourceText);
  const bestCandidate = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      overlap: sourceCoverageTokens(candidate)
        .filter((token) => sentenceTokens.has(token)).length,
    }))
    .sort((left, right) => right.overlap - left.overlap || left.index - right.index)[0]?.candidate;
  return (bestCandidate ?? sourceText).slice(0, 1_200).trim();
}

function materializeServerOwnedClaimSupport(result: PostWriterResult, input: PostWriterInput): void {
  const claimSupport = result.contentAnalysis.claimSupport;
  if (!claimSupport?.length) return;

  const sources = authorizedClaimSourceMap(input);
  result.contentAnalysis.claimSupport = claimSupport.map((entry) => {
    const sourceText = sources.get(entry.sourceRef);
    if (!sourceText) return entry;
    return {
      ...entry,
      sourceExcerpt: sourceExcerptForClaim(sourceText, entry.sentence),
    };
  });
}

function claimSupportIssues(
  result: PostWriterResult,
  input: PostWriterInput,
  editorialPlan: PostEditorialPlan,
): string[] {
  const sources = authorizedClaimSourceMap(input);
  const claimSupport = result.contentAnalysis.claimSupport ?? [];
  const claimSentences = claimBearingSentences(result.content, editorialPlan, sources);
  if (claimSentences.length === 0 && claimSupport.length === 0) return [];
  const currentSentenceKeys = new Set(claimSentences.map(({ sentence }) => normalizedClaimText(sentence)));
  const staleEntries = claimSupport.some((entry) => !currentSentenceKeys.has(normalizedClaimText(entry.sentence)));
  const issues = staleEntries ? ['claim_support_stale_sentence'] : [];

  issues.push(...claimSentences.flatMap(({ sentence, index }) => {
    const matchingSupport = claimSupport.filter(
      (entry) => normalizedClaimText(entry.sentence) === normalizedClaimText(sentence),
    );
    const support = matchingSupport[0];
    if (!support) return [`claim_support_missing:${index}`];
    if (matchingSupport.length > 1) return [`claim_support_duplicate_sentence:${index}`];

    const source = sources.get(support.sourceRef);
    if (!source) return [`claim_support_invalid_source:${index}`];

    const normalizedSource = normalizedClaimText(source);
    const normalizedExcerpt = normalizedClaimText(support.sourceExcerpt ?? '');
    if (!normalizedExcerpt || !normalizedSource.includes(normalizedExcerpt)) {
      return [`claim_support_invalid_excerpt:${index}`];
    }

    const sentenceTokens = sourceCoverageTokens(sentence);
    const excerptTokens = new Set(sourceCoverageTokens(support.sourceExcerpt ?? ''));
    const overlap = sentenceTokens.filter((token) => excerptTokens.has(token)).length;
    const overlapRatio = sentenceTokens.length === 0 ? 0 : overlap / sentenceTokens.length;

    if (support.relationship === 'verbatim') {
      return normalizedExcerpt.includes(normalizedExtractiveClaimText(sentence))
        ? []
        : [`claim_support_low_overlap:${index}`];
    }

    if (
      editorialPlan.evidenceDensity === 'thin'
      && editorialPlan.sourceBoundary !== 'source_only'
      && support.relationship === 'paraphrase'
      && support.sourceRef === 'brief_user'
      && !hasRequiredClaimMaterialAnchor(sentence, editorialPlan)
    ) {
      return [`claim_support_missing_required_anchor:${index}`];
    }

    if (editorialPlan.sourceBoundary === 'source_only') {
      if (support.relationship === 'bounded_implication') {
        return [`claim_support_unbounded_implication:${index}`];
      }
      return overlapRatio >= 0.33 ? [] : [`claim_support_low_overlap:${index}`];
    }

    if (support.relationship === 'bounded_implication') {
      return overlapRatio >= 0.25 && BOUNDED_IMPLICATION_MARKER_PATTERN.test(sentence)
        ? []
        : [`claim_support_unbounded_implication:${index}`];
    }

    return overlapRatio >= 0.55 ? [] : [`claim_support_low_overlap:${index}`];
  }));
  return issues;
}

function outputLanguageIssue(content: string, input: PostWriterInput): string | undefined {
  const expected = input.contentSignalProfile?.profile.constraints.language
    ?.trim()
    .toLocaleLowerCase()
    .split(/[-_]/)[0];
  if (!expected) return undefined;

  const body = extractTrailingHashtags(content).body
    .replace(/https?:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi, ' ');
  const letterCount = body.match(/\p{L}/gu)?.length ?? 0;
  if (letterCount < 60) return undefined;

  const actual = detect(body).toLocaleLowerCase().split(/[-_]/)[0];
  return actual && actual !== expected
    ? `output_language_mismatch:${actual}/${expected}`
    : undefined;
}

function sourceOnlyEvidenceContext(input: PostWriterInput): string {
  return [
    input.userPrompt,
    input.context.projectSummary,
    ...(input.sourceLedger?.entries.map((entry) => `${entry.title} ${entry.summary}`) ?? []),
    ...(input.retrievedContext?.projectFacts.map((fact) => `${fact.title} ${fact.summary}`) ?? []),
    ...(input.retrievedContext?.globalFacts.map((fact) => `${fact.title} ${fact.summary}`) ?? []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join('\n');
}

function unsupportedSourceOnlySentenceIndexes(
  content: string,
  input: PostWriterInput,
  editorialPlan: PostEditorialPlan,
): number[] {
  if (editorialPlan.sourceBoundary !== 'source_only') return [];

  const sourceTokens = new Set(sourceCoverageTokens(sourceOnlyEvidenceContext(input)));
  const sentences = segmentUnicodeSentences(content)
    .filter((sentence) => sentence.length > 0 && !HASHTAG_ONLY_LINE_PATTERN.test(sentence));

  return sentences.flatMap((sentence, index) => {
    if (/https?:\/\/|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/i.test(sentence)) return [];
    const normalizedSentence = normalizeSourceLanguage(sentence);
    if (
      SOURCE_ONLY_NON_FACTUAL_ACTION_PATTERN.test(normalizedSentence)
      || !SOURCE_ONLY_ASSERTIVE_PREDICATE_PATTERN.test(normalizedSentence)
    ) {
      return [];
    }
    const sentenceTokens = sourceCoverageTokens(sentence);
    if (sentenceTokens.length < 4) return [];
    const supported = sentenceTokens.filter((token) => sourceTokens.has(token)).length;
    const anchorFloor = sentenceTokens.length >= 5 ? 3 : 2;
    return supported / sentenceTokens.length >= 0.55 || supported >= anchorFloor
      ? []
      : [index + 1];
  });
}

function unsupportedThinEvidenceSentenceIndexes(
  content: string,
  input: PostWriterInput,
  editorialPlan: PostEditorialPlan,
): number[] {
  if (
    editorialPlan.evidenceDensity !== 'thin'
    || editorialPlan.sourceBoundary === 'source_only'
    || !editorialPlan.requiredClaim
  ) {
    return [];
  }

  const sourceTokens = new Set(sourceCoverageTokens(sourceOnlyEvidenceContext(input)));
  return segmentUnicodeSentences(content)
    .filter((sentence) => sentence.length > 0 && !HASHTAG_ONLY_LINE_PATTERN.test(sentence))
    .flatMap((sentence, index) => {
      if (isUnicodeQuestion(sentence)) return [];
      if (!THIN_EVIDENCE_EXPANSION_PATTERN.test(normalizeSourceLanguage(sentence))) return [];
      const sentenceTokens = sourceCoverageTokens(sentence);
      if (sentenceTokens.length < 4) return [];
      const supported = sentenceTokens.filter((token) => sourceTokens.has(token)).length;
      return supported / sentenceTokens.length >= 0.55 ? [] : [index + 1];
    });
}

interface PostContractRepairDiagnostic {
  code: string;
  excerpt?: string;
}

function postContractRepairDiagnostics(
  result: PostWriterResult,
  failure: Error,
  editorialPlan: PostEditorialPlan,
): { contentCharacters: number; findings: PostContractRepairDiagnostic[] } {
  const failureCodes = failure.message
    .slice(POST_CONTRACT_FAILURE_PREFIX.length)
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
  const sentences = segmentUnicodeSentences(result.content)
    .filter((sentence) => sentence.length > 0 && !HASHTAG_ONLY_LINE_PATTERN.test(sentence));
  const hookExcerpt = getPublishableLines(result.content).slice(0, 2).join(' ');

  return {
    contentCharacters: measureThinkForgePublishableText(
      result.content,
      editorialPlan.publishingConstraints,
    ).characterCount,
    findings: failureCodes.map((code) => {
      const indexedSentence = code.match(
        /^(?:source_only_low_support_sentence|thin_evidence_unsupported_sentence|claim_support_missing|claim_support_duplicate_sentence|claim_support_invalid_source|claim_support_invalid_excerpt|claim_support_low_overlap|claim_support_missing_required_anchor|claim_support_unbounded_implication):(\d+)$/,
      );
      if (indexedSentence) {
        return {
          code,
          excerpt: sentences[Number(indexedSentence[1]) - 1],
        };
      }

      const claimFamily = code.match(/^source_only_unsupported_claim:(.+)$/)?.[1];
      if (claimFamily) {
        const familyPattern = SOURCE_ONLY_CLAIM_FAMILIES.find(({ id }) => id === claimFamily)?.pattern;
        return {
          code,
          ...(familyPattern
            ? { excerpt: sentences.find((sentence) => familyPattern.test(normalizeSourceLanguage(sentence))) }
            : {}),
        };
      }

      if (code.startsWith('hook_') || code === 'bare_required_claim_hook') {
        return { code, ...(hookExcerpt ? { excerpt: hookExcerpt } : {}) };
      }

      return { code };
    }),
  };
}

export function assertUsablePostWriterResult(
  result: PostWriterResult,
  input: PostWriterInput,
  editorialPlan: PostEditorialPlan = resolvePostEditorialPlanForInput(input),
): void {
  assertPostEditorialPlanFeasible(editorialPlan);
  const content = result.content.trim();
  const contentMeasurement = measureThinkForgePublishableText(
    content,
    editorialPlan.publishingConstraints,
  );
  const contentCharacters = contentMeasurement.characterCount;
  const lines = getPublishableLines(content);
  const ctaTail = lines.slice(-3).join('\n');
  const hookLine = lines[0] ?? '';
  const failures: string[] = [];
  const suppliedContext = getSuppliedPostContext(input);
  const executionAnchors = resolvePostExecutionAnchors(input);
  const requiredProofMarkers = editorialPlan.hookProofMarkers;
  const lengthContract = resolvePostLengthContract(editorialPlan);
  const wordCount = countUnicodeWords(content);
  const extractedHashtags = extractTrailingHashtags(content);
  const structuredHashtags = validateHashtagPlan(result.hashtags, 'structured_field');
  const trailingHashtags = validateHashtagPlan(extractedHashtags.hashtags, 'content_tail');
  const inlineHashtags = extractedHashtags.body.match(HASHTAG_TOKEN_PATTERN) ?? [];

  if (content.length === 0) failures.push('empty_content');
  if (lengthContract.minimumCharacters !== undefined && contentCharacters < lengthContract.minimumCharacters) {
    failures.push(`content_below_character_target:${contentCharacters}/${lengthContract.minimumCharacters}`);
  }
  if (lengthContract.maximumCharacters !== undefined && contentCharacters > lengthContract.maximumCharacters) {
    const failureCode = lengthContract.targetCharacters === undefined
      ? `content_over_${lengthContract.maximumCharacters}_chars`
      : `content_above_character_target:${contentCharacters}/${lengthContract.maximumCharacters}`;
    failures.push(failureCode);
  }
  if (!contentMeasurement.valid && contentCharacters <= (contentMeasurement.maximumCharacters ?? Infinity)) {
    failures.push('platform_text_invalid');
  }
  if (lengthContract.minimumWords !== undefined && wordCount < lengthContract.minimumWords) {
    failures.push(`content_below_word_target:${wordCount}/${lengthContract.minimumWords}`);
  }
  if (lengthContract.maximumWords !== undefined && wordCount > lengthContract.maximumWords) {
    failures.push(`content_above_word_target:${wordCount}/${lengthContract.maximumWords}`);
  }

  const ctaLine = lines.at(-1) ?? '';
  const ctaRequired = editorialPlan.ctaMode !== 'none';
  const hasCta = /[?]/.test(ctaLine)
    || POST_CTA_PATTERN.test(ctaLine)
    || Boolean(
      editorialPlan.requiredAction
      && containsNormalizedText(ctaTail, editorialPlan.requiredAction)
    )
    || Boolean(
      editorialPlan.requiredDestination
      && containsNormalizedText(ctaTail, editorialPlan.requiredDestination)
    );
  if (ctaRequired && !hasCta) failures.push('missing_required_cta');
  if (
    editorialPlan.controlSource === 'authoring_request'
    && editorialPlan.ctaMode === 'none'
    && hasCta
  ) {
    failures.push('cta_forbidden');
  }
  if (
    editorialPlan.requiredAction
    && !containsNormalizedText(ctaTail, editorialPlan.requiredAction)
  ) {
    failures.push('cta_missing_supplied_action');
  }
  const hasSourceSpecificCtaQuestion = Boolean(
    executionAnchors.audience
    && executionAnchors.topicTerms.length > 0
    && containsNormalizedText(ctaLine, executionAnchors.audience)
    && countTopicTerms(ctaLine, executionAnchors.topicTerms) > 0
  );
  if (hasCta && GENERIC_CTA_QUESTION_PATTERN.test(ctaLine) && !hasSourceSpecificCtaQuestion) {
    failures.push('generic_cta_question');
  }
  const explicitlyRequestedGenericCta = GENERIC_CTA_PATTERN.test(suppliedContext);
  if (
    hasCta
    && GENERIC_CTA_PATTERN.test(ctaLine)
    && !SPECIFIC_CTA_ACTION_PATTERN.test(ctaLine)
    && !explicitlyRequestedGenericCta
  ) {
    failures.push('generic_cta');
  }
  if (OUTREACH_CTA_PATTERN.test(ctaLine) && !SUPPLIED_OUTREACH_ROUTE_PATTERN.test(suppliedContext)) {
    failures.push('generic_cta');
  }
  if (!(result.clickatron?.singleImagePrompt || result.clickatron?.carouselPrompts?.length)) {
    failures.push('missing_clickatron_prompt');
  }
  const visualPrompts = [
    result.clickatron?.singleImagePrompt,
    ...(result.clickatron?.carouselPrompts ?? []),
  ].filter((prompt): prompt is string => typeof prompt === 'string' && prompt.trim().length > 0);
  if (visualPrompts.some((prompt) => GENERIC_VISUAL_HANDOFF_PATTERN.test(prompt))) {
    failures.push('generic_clickatron_visual');
  }
  if (visualPrompts.some(clickatronPromptRequestsReadableCopy)) {
    failures.push('clickatron_contains_copy_instruction');
  }
  if (visualPrompts.some((prompt) => !VISUAL_SAFE_SPACE_PATTERN.test(prompt))) {
    failures.push('missing_clickatron_safe_space');
  }
  if (requiredBriefClaims(input).some((claim) => normalizeSourceText(hookLine) === normalizeSourceText(claim))) {
    failures.push('bare_required_claim_hook');
  }
  if (
    editorialPlan.hookRequiresProof
    && requiredProofMarkers.length > 0
    && !requiredProofMarkers.some((marker) => hookLine.includes(marker))
  ) {
    failures.push('hook_missing_required_proof');
  }
  if (
    editorialPlan.requiredDestination
    && !containsNormalizedText(ctaTail, editorialPlan.requiredDestination)
  ) {
    failures.push('cta_missing_supplied_destination');
  }
  if (editorialPlan.controlSource === 'authoring_request') {
    if (editorialPlan.hashtagMode === 'none') {
      if (structuredHashtags.length > 0 || trailingHashtags.length > 0 || inlineHashtags.length > 0) {
        failures.push('hashtags_forbidden');
      }
    } else if (editorialPlan.hashtagMode === 'exact') {
      if (
        inlineHashtags.length > 0
        || !sameExactHashtagPlan(structuredHashtags, editorialPlan.requiredHashtags)
        || !sameExactHashtagPlan(trailingHashtags, editorialPlan.requiredHashtags)
      ) {
        failures.push('exact_hashtag_plan_mismatch');
      }
    }

    const emojiCount = countPostEmoji(content);
    if (editorialPlan.emojiMode === 'none' && emojiCount > 0) {
      failures.push(`emoji_forbidden:${emojiCount}`);
    }
    if (
      editorialPlan.emojiMode === 'restrained'
      && emojiCount > THINKFORGE_RESTRAINED_EMOJI_MAX
    ) {
      failures.push(`emoji_limit_exceeded:${emojiCount}/${THINKFORGE_RESTRAINED_EMOJI_MAX}`);
    }
  }
  const unsuppliedDestinations = (content.match(POST_DESTINATION_PATTERN) ?? [])
    .map((destination) => destination.replace(/[.,;:!?]+$/, ''))
    .filter((destination) => !containsNormalizedText(suppliedContext, destination));
  if (unsuppliedDestinations.length > 0) failures.push('unsupplied_destination');
  if (
    input.contentSignalProfile
    &&
    executionAnchors.topicTerms.length >= 2
    && visualPrompts.some((prompt) => countTopicTerms(prompt, executionAnchors.topicTerms) < 2)
  ) {
    failures.push('clickatron_missing_source_anchors');
  }
  failures.push(...unsupportedSourceOnlyClaimFamilies(content, input, editorialPlan)
    .map((family) => `source_only_unsupported_claim:${family}`));
  failures.push(...unsupportedSourceOnlySentenceIndexes(content, input, editorialPlan)
    .map((index) => `source_only_low_support_sentence:${index}`));
  failures.push(...unsupportedThinEvidenceSentenceIndexes(content, input, editorialPlan)
    .map((index) => `thin_evidence_unsupported_sentence:${index}`));
  failures.push(...claimSupportIssues(result, input, editorialPlan));
  const languageIssue = outputLanguageIssue(content, input);
  if (languageIssue) failures.push(languageIssue);
  const carouselSlideCount = requestedCarouselSlideCount(input);
  if (carouselSlideCount !== undefined) {
    const promptCount = result.clickatron?.carouselPrompts?.length ?? 0;
    if (promptCount !== carouselSlideCount) {
      failures.push(`carousel_prompt_count_mismatch:${promptCount}/${carouselSlideCount}`);
    }
    if (result.clickatron?.singleImagePrompt) failures.push('carousel_returned_single_image_prompt');
  }

  const brandLanguagePolicy = resolveThinkForgeBrandLanguagePolicy(
    input.retrievedContext?.brandAuthority?.profile
      ?? input.retrievedContext?.brandSignalProfile,
  );
  const filler = findDisallowedThinkForgeAiFiller(
    contentWithoutRequiredSourceClaims(content, input),
    brandLanguagePolicy,
  )[0];
  if (filler) failures.push(`banned_phrase:${filler.label}`);

  if (input.contentSignalProfile) {
    const profileCompliance = evaluateContentProfileCompliance(content, input.contentSignalProfile);
    if (shouldAutoRepairContentProfileViolations(profileCompliance.violations)) {
      failures.push(...profileCompliance.violations
        .filter((violation) => violation.severity === 'critical')
        .map((violation) => violation.id));
    }
  }

  if (failures.length > 0) {
    throw new Error(`Post writer output failed publishable quality gate: ${failures.join(', ')}`);
  }
}

function isRepairablePostContractError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith(POST_CONTRACT_FAILURE_PREFIX);
}

function buildPostContractRepairSystemInstruction(systemInstruction: string, failure: Error): string {
  return `${systemInstruction}

<post_contract_repair>
The previous structured output failed the production post contract:
${failure.message}

Return one complete replacement object using the same JSON schema. Preserve every supplied fact, the resolved brand voice, platform fit, selected writing techniques, and the intended Clickatron handoff. Repair the listed contract failures without adding unsupported claims or generic filler. Include a CTA only when postEditorialPlan.ctaMode requires one.

For generic_cta:
- Do not close with a vague invitation such as "Discover", "Learn more", "Follow for more", "Link in bio", or "Join us".
- If postEditorialPlan.ctaMode is none, remove the perfunctory CTA and end on the completed editorial thought.
- Otherwise use the selected CTA technique with a concrete action, resource, offer, or destination supplied by the brief.
- Do not invent offers, dates, URLs, or next steps that are absent from the supplied brief.

For missing_required_cta:
- Execute postEditorialPlan.selectedCta using only the supplied action, offer, urgency, or destination.
- Do not replace a missing CTA with a generic engagement question.

For cta_forbidden:
- Remove the closing action, invitation, engagement question, and destination. End on the completed editorial thought.

For cta_missing_supplied_action:
- Reproduce postEditorialPlan.requiredAction in the closing CTA without replacing it with a synonym or a generic engagement ask.

For generic_clickatron_visual:
- Replace stock office/team/dashboard language with a text-free scene based on at least two supplied workflow details, objects, audience cues, or outcomes.
- Keep real copy in the post content only; preserve visual safe space without invented UI, logos, or text.

For clickatron_contains_copy_instruction:
- Remove every instruction to render a headline, caption, indicator, label, watermark, or text overlay.
- Keep the described visual idea, but express chronology or category through text-free objects, composition, and lighting. Exact copy remains in editable Clickatron layers downstream.

For bare_required_claim_hook:
- Open with the supplied audience's concrete friction, stake, or decision; move the exact required claim into the next paragraph as evidence.

For hook_missing_required_proof:
- Keep the supplied audience and workflow context in the hook, and add one exact marker from postEditorialPlan.hookProofMarkers.
- Do not make the proof claim the entire hook. Name only the source-supplied workflow the proof measures; do not infer why it changes a broader decision or outcome.

For cta_missing_supplied_destination or unsupplied_destination:
- Preserve postEditorialPlan.requiredDestination exactly in the CTA. Remove every URL or domain that is not present in tf_untrusted_data. Never merge a person's name with a domain.

For invalid_hashtag, duplicate_hashtag, conflicting_hashtag_plans, hashtag_forbidden_in_body, hashtag_embedded_in_body, hashtags_forbidden, or exact_hashtag_plan_mismatch:
- Return hashtags only in the structured hashtags field. ThinkForge assembles the final hashtag line.
- If postEditorialPlan.hashtagMode is none, return an empty array and use no inline hashtags.
- If it is exact, return postEditorialPlan.requiredHashtags in the exact supplied spelling and order, with no additions.
- Otherwise return only valid, unique, source-grounded hashtags.

For emoji_forbidden or emoji_limit_exceeded:
- If postEditorialPlan.emojiMode is none, remove every emoji from visible copy.
- If it is restrained, use no more than ${THINKFORGE_RESTRAINED_EMOJI_MAX} emoji grapheme clusters in the complete post.

For generic_cta_question:
- Replace a status question with one question that asks the reader to name a concrete bottleneck, handoff, decision, or operating constraint from the brief.

For content_below_character_target or content_below_word_target:
- Expand only when the brief contains enough authorized material to satisfy its explicit target.
- Do not pad with summaries, repeated facts, generic advice, invented claims, CTAs, or hashtags.

For content_above_character_target, content_above_word_target, or content_over_N_chars:
- Trim repeated framing and the lowest-priority development detail until the post fits the platform maximum.
- Keep exact supplied facts and any explicitly required destination. Do not discard or alter a factual claim to save space.

For missing_clickatron_safe_space:
- State where generous text-safe negative space sits in the composition, while keeping the raster itself free of readable copy.

For clickatron_missing_source_anchors:
- Build the text-free visual around at least two real topic terms from tf_untrusted_data.postExecutionAnchors.topicTerms, using actual workflow objects, actions, or stakes instead of generic office, tablet, dashboard, or data-flow scenery.

For source_only_unsupported_claim or source_only_low_support_sentence:
- Rebuild the post in postEditorialPlan.developmentSequence order using only facts explicitly present in tf_untrusted_data.
- Remove every unsupplied cause, condition, consequence, beneficiary outcome, urgency claim, and impact claim. Naming a topic or event does not license assumptions about why it matters.
- Treat evaluative phrases such as "tangible difference", "perfect opportunity", "practical way", and their synonyms as claims. Remove them unless that evaluation is explicitly supplied.
- Treat every postEditorialPlan.forbiddenNarrativeExpansions entry as a binding prohibition. Do not paraphrase the prohibited idea.
- If the source has limited detail, return concise, useful copy. Never pad to a generic platform length.

For thin_evidence_unsupported_sentence:
- Remove unsupported benefits, causal claims, optimization language, and generalized outcomes.
- A supplied mechanism or measured pilot result does not authorize claims that it helps people work more efficiently, frees time, enables focus, or produces a broader operational outcome.
- Use the supplied facts, measured group, concrete workflow, offer, and action directly. Concision is better than padding.

For claim_support_missing, claim_support_invalid_source, claim_support_invalid_excerpt, claim_support_low_overlap, claim_support_missing_required_anchor, or claim_support_unbounded_implication:
- Rewrite the rejected sentence so it is directly supported by one authorized source, then replace its contentAnalysis.claimSupport entry.
- Copy sentence exactly from the repaired content. Use only a sourceRef present in tf_untrusted_data.claimSources.
- Do not generate sourceExcerpt. ThinkForge attaches server-owned audit evidence from the cited sourceRef. Never cite Brand Vault voice guidance as factual evidence.
- For thin evidence, a paraphrase cited to brief_user must name material proof from Required brief claim. Audience, season, topic, or product category alone cannot become a new pain, benefit, or outcome claim.
- For claim_support_unbounded_implication, delete the implication unless an authorized source explicitly states it. Replace it with a direct source-backed product/workflow definition or an explicit scope limitation, not another inferred benefit.
- Use bounded_implication only outside source_only mode, and only when the source gives a real basis for the implication and its boundary is explicit with wording such as "measured", "pilot", "limited to", "reference", "scope", or "not a forecast".
- If no authorized source supports the sentence, delete it. Reusing source nouns does not make an invented benefit, cause, or outcome supported.

For claim_support_stale_sentence or claim_support_duplicate_sentence:
- Rebuild contentAnalysis.claimSupport from the final content. Keep exactly one entry for every substantive declarative sentence and no entries for a sentence that is absent, a question, a hashtag, or a pure action CTA.

For banned_phrase:
- Replace the banned phrase inside the same structured response. Preserve supported facts and update the matching claimSupport sentence if wording changes.

For output_language_mismatch:
- Rewrite all visible content and hashtags in tf_untrusted_data.contentSignalProfile.constraints.language.
- Preserve supplied names, numbers, URLs, and official terms exactly. Clickatron visual prompts may remain in English.

REPAIR DIAGNOSTICS
- post_contract_repair_input.validatorDiagnostics identifies the exact rejected sentence or hook excerpt for each localized failure.
- Delete or rewrite every identified unsupported excerpt. Do not preserve the same prohibited meaning under different adjectives or verbs.

For profile_missing_required_brief_claim or profile_missing_required_audience_anchor:
- Copy the corresponding Required brief claim and Required audience anchor from tf_untrusted_data.contentSignalProfile exactly into natural post copy.
- Do not weaken, expand, or paraphrase an explicit factual claim while repairing it.
</post_contract_repair>`;
}

export class PostWriterAgent extends StructuredAgent<PostWriterResult> {
  protected schema = PostWriterResultSchema;

  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'post_writer',
      // Default to flash for core creative thinking
      modelName: config?.modelName ?? 'gemini-2.5-flash',
      maxTokens: config?.maxTokens ?? 8192,
      temperature: config?.temperature ?? 0.45,
    });
  }

  buildPrompt(input: PostWriterInput): string {
    const parts = this.buildPromptParts(input);
    return `${parts.systemInstruction}\n\n${parts.prompt}`;
  }

  buildPromptParts(input: PostWriterInput): IsolatedPromptParts {
    const { context, userPrompt, editContext, productionBrief } = input;
    const editorialPlan = resolvePostEditorialPlanForInput(input);
    const brandLanguagePolicy = resolveThinkForgeBrandLanguagePolicy(
      input.retrievedContext?.brandAuthority?.profile
        ?? input.retrievedContext?.brandSignalProfile,
    );
    assertPostEditorialPlanFeasible(editorialPlan);
    const outputPlatform = resolvePostOutputPlatform(editorialPlan);
    const outputFormat = buildPostOutputFormat(outputPlatform, {
      targetCharacters: editorialPlan.targetBodyCharacters,
      targetWords: editorialPlan.targetBodyWords,
      maximumCharacters: maximumPostCharacters(editorialPlan),
      ctaMode: editorialPlan.ctaMode,
    }).replaceAll('<input_data>', 'tf_untrusted_data');

    const trendBriefBlock = formatTrendBriefForPrompt(productionBrief);
    const trendBriefForData = `${trendBriefBlock ? `${trendBriefBlock}\n\n` : ''}`;
    const carouselSlideCount = requestedCarouselSlideCount(input);
    const carouselContractBlock = carouselSlideCount === undefined
      ? ''
      : `<carousel_contract>
- Return exactly ${carouselSlideCount} entries in clickatron.carouselPrompts, one per slide.
- Do not return clickatron.singleImagePrompt.
- Each slide must communicate a distinct grounded unit from tf_untrusted_data; never pad the count with invented claims.
</carousel_contract>\n\n`;
    const postLengthContract = buildPostLengthContract(editorialPlan);
    const postControlContract = editorialPlan.controlSource === 'authoring_request'
      ? `<post_control_contract>
- This is a server-owned contract compiled from the user's explicit intake controls.
- Target publishing surface: read postEditorialPlan.platform from tf_untrusted_data. Never infer it from userBrief or projectSummary.
- CTA mode: ${editorialPlan.ctaMode}. Use requiredAction and requiredDestination exactly when present. If mode is none, return no closing action or engagement question.
- Hashtag mode: ${editorialPlan.hashtagMode}. If none, return an empty hashtags array. If exact, return requiredHashtags in exact spelling and order. Never put hashtags inside content.
- Emoji mode: ${editorialPlan.emojiMode}. If none, use zero emoji. If restrained, use at most ${THINKFORGE_RESTRAINED_EMOJI_MAX} emoji grapheme clusters.
</post_control_contract>\n\n`
      : `<post_control_contract>
- This caller uses the named legacy compatibility contract. Do not invent a platform, CTA, hashtag quota, emoji quota, or numeric length rule beyond postEditorialPlan.
</post_control_contract>\n\n`;

    const systemInstruction = `<role>You are an elite platform-specific copywriter and content strategist.</role>
<task>${editContext
      ? 'REVISE the existing post per the requested change and return the COMPLETE revised post'
      : 'Write ONE final, publishable post for the selected publishing surface'}. Return JSON that matches the schema exactly.</task>

<rules>
SOURCE CATALOG
- tf_untrusted_data.claimSources is the sole authoritative catalog for visible factual claims and contentAnalysis.claimSupport. Each entry provides sourceRef and sourceText.
- Every factual sentence must trace to an exact phrase in sourceText for its cited sourceRef. Do not cite a sourceRef that is not in claimSources.
- When tf_untrusted_data.contentSignalProfile contains Required brief claim or Required audience anchor entries, include each one exactly in the post body.
- Preserve supplied dates, times, prices, URLs, brand names, event names, product names, offers, and taglines verbatim.
- Keep supplied formats when possible: "9am" stays "9am", "$40K" stays "$40K".
- Do not invent ingredients, study results, timelines, percentages, discounts, prices, guarantees, or performance claims.
- If proof is thin, make the writing specific through only source-supplied audience, workflow, product/category, timing, proof, and scope. Do not invent a pain point, scene, benefit, or operational outcome to create volume. A named audience or season is not evidence of its pain or business impact.

CLAIM-SUPPORT LEDGER
- Populate contentAnalysis.claimSupport for every factual sentence in every evidence mode.
- When postEditorialPlan.sourceBoundary is source_only, or evidenceDensity is thin and requiredClaim is present, add one entry for every substantive declarative sentence in content.
- Do not add entries for hashtags, questions, or pure action CTAs.
- sentence must be copied exactly from the final content. Return no claimSupport entries for a sentence that is absent from final content.
- sourceRef must be one of tf_untrusted_data.claimSources[].sourceRef. ThinkForge resolves sourceExcerpt from that authoritative sourceRef after generation; do not invent or summarize source excerpts.
- Use verbatim for copied claims; a short leading discourse label such as "Specifically," is allowed. When evidenceDensity is thin, a paraphrase cited to brief_user must carry material proof from Required brief claim. Audience, season, topic, or product category alone is not enough. Use bounded_implication only when the sentence explicitly states its measured scope or limitation.
- In source_only mode, bounded_implication is forbidden. If no source supports a sentence, remove the sentence.

OUTPUT LANGUAGE
- Write all visible content and hashtags in tf_untrusted_data.contentSignalProfile.constraints.language when supplied.
- Preserve official names, numbers, URLs, and terms that should not be translated. Clickatron visual prompts may remain in English.

BRAND VOICE
- tf_untrusted_data.brandContext is the accepted brand's binding writing direction. Follow its formality, directness, terminology, recurring phrases, and kill list.
- brandContext is a style directive, never factual evidence. It cannot establish a location, product, capability, offer, result, customer, or event detail unless that detail also appears in claimSources.
- Do not turn a precise, calm, or low-hype voice into generic product marketing. Never add capability, certainty, or outcome claims that the supplied evidence does not establish.

EDITORIAL PLAN
- tf_untrusted_data.postEditorialPlan is a server-owned feasibility contract. It outranks a writing technique that asks for an unavailable offer, proof, or length.
- Technique guidance defines editorial form only. Its examples, cited studies, sample numbers, brands, and outcomes are never claim sources and must not appear unless tf_untrusted_data.claimSources independently authorizes them.
- Follow postEditorialPlan.developmentSequence in order. It defines the allowed editorial progression, not merely a suggestion.
- When sourceBoundary is source_only, every stated cause, condition, consequence, beneficiary outcome, urgency claim, and impact claim must be explicitly present in tf_untrusted_data. A named topic, event, audience, or mission does not authorize related background knowledge.
- Every entry in forbiddenNarrativeExpansions is binding. Do not state or paraphrase those ideas in content, hashtags, contentAnalysis, or Clickatron prompts.
- When ctaMode is none, do not append a CTA. When it is not none, execute selectedCta using only supplied actions, offers, urgency, and destinations.
- When hookRequiresProof is true, put a supplied numeric or named proof marker in the hook together with the audience's supplied workflow context. Do not make the exact proof claim the entire hook. Never manufacture friction merely to frame the proof.
- Never present a beta, pilot, named-customer, or measured-group result as a universal audience outcome. Preserve its source-supplied scope in the hook and body.
- When evidenceDensity is thin, develop only a source-backed product/workflow definition, the supplied proof, and an explicit scope limitation when useful. Do not invent friction, features, automation, guarantees, accuracy claims, implications, or broad business outcomes to make the post longer.
- Follow visualProofDirection when it is present: make the proof tangible through a text-free physical scene, never through readable numbers, labels, or UI.

EXECUTION ANCHORS
- tf_untrusted_data.postExecutionAnchors is a server-resolved brief contract.
- Use a supplied audience naturally where it improves relevance; do not duplicate it mechanically in both the opening and closing.
- Every Clickatron prompt must contain at least two supplied topic terms through concrete visual objects, actions, or environment. Do not replace them with generic office, tablet, dashboard, or abstract data-flow scenery.

HOOK
- Execute postEditorialPlan.selectedHook when present. Otherwise open naturally with the most relevant source-backed idea rather than forcing a hook archetype.
- No cliche openers.

OUTPUT LENGTH
- tf_untrusted_data.contentSignalProfile.constraints.target_length is ThinkForge's server-resolved length intent.
- When it is measured in characters, use it as the writing target. It overrides a generic platform recommendation only when it reflects an explicit user length request or a concise-request intent.
${postLengthContract}

CTA
- A CTA is required only when postEditorialPlan.ctaMode is not none.
- Execute postEditorialPlan.selectedCta when present and use only supplied URLs or actions.
- When ctaMode is none, end on the completed editorial thought without a generic question or engagement command.
- When postEditorialPlan.requiredDestination is present, reproduce it exactly in the CTA. Do not rewrite, merge, punctuate inside, or infer a different domain.

ANTI-FILLER
- Obey the anti-filler list in <output_format> exactly.
- Prefer plain, concrete nouns and verbs over abstract business language.

VISUAL HANDOFF
- The clickatron field is part of the deliverable, not optional decoration.
- Image prompts must carry the same source facts as the post through scene, composition, props, lighting, style, mood, and layout.
- Keep every image prompt visual-only. Never include exact headlines, captions, dates, hashtags, CTA copy, "Text Overlay:" metadata, logos, watermarks, or readable UI labels.
- Exact copy remains in content and is derived into editable Clickatron text layers downstream.
- When a scene contains screens or interfaces, describe them as abstract or defocused shapes with no legible text or invented brand marks.
</rules>

${editContext ? `<edit_rules>
- Revise the existing post according to edit.instruction in tf_untrusted_data.
- Return the ENTIRE revised post in the content field, not a diff.
- Keep everything the change does not touch and preserve supplied facts verbatim.
</edit_rules>

` : ''}${carouselContractBlock}${postControlContract}${outputFormat}

Return your response strictly adhering to the JSON schema.`;

    return buildIsolatedPromptParts({
      systemInstruction: this.applyGlobalConstraints(systemInstruction),
      data: {
        projectSummary: context.projectSummary || null,
        brandContext: context.systemBrief || null,
        antiAiPolicy: brandLanguagePolicy,
        userBrief: userPrompt,
        claimSources: authorizedClaimSources(input),
        contentSignalProfile: input.contentSignalProfile ? {
          constraints: input.contentSignalProfile.profile.constraints,
          intent: input.contentSignalProfile.intent,
        } : null,
        postEditorialPlan: editorialPlan,
        postExecutionAnchors: resolvePostExecutionAnchors(input),
        trendBrief: trendBriefForData || null,
        edit: editContext
          ? {
              existingContent: editContext.existingContent || null,
              instruction: editContext.instruction,
              selection: editContext.selection || null,
              focusHint: editContext.focusHint || null,
            }
          : null,
      },
      fieldLimits: {
        projectSummary: 12_000,
        brandContext: 24_000,
        userBrief: 12_000,
        sourceText: 12_000,
        trendBrief: 16_000,
        existingContent: 24_000,
        instruction: 8_000,
        selection: 8_000,
        focusHint: 2_000,
      },
    });
  }
  async runStructured(
    input: PostWriterInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal,
  ): Promise<AgentStructuredOutput<PostWriterResult>> {
    const promptParts = this.buildPromptParts(input);
    const gen = this.resolveGenConfig(overrides);
    const editorialPlan = resolvePostEditorialPlanForInput(input);

    const initialGeneration = await generateStructuredWithWritingContextCache({
      prompt: promptParts.prompt,
      systemInstruction: promptParts.systemInstruction,
      schema: this.schema,
      modelName: this.config.modelName,
      temperature: gen.temperature,
      maxTokens: gen.maxTokens,
      abortSignal,
    });

    let result = initialGeneration.result;
    let contractRepairApplied = false;
    let hashtagContractApplied = false;
    let clickatronVisualContractApplied = false;
    const finalizeResult = () => {
      hashtagContractApplied = assemblePostHashtagPlan(result, editorialPlan)
        || hashtagContractApplied;
      materializeServerOwnedClaimSupport(result, input);
      result.metadata.platform = editorialPlan.platform;
      result.metadata.charCount = measureThinkForgePublishableText(
        result.content,
        editorialPlan.publishingConstraints,
      ).characterCount;
      clickatronVisualContractApplied = reconcileClickatronVisualContract(
        result,
        input,
        editorialPlan,
      ) || clickatronVisualContractApplied;
      assertUsablePostWriterResult(result, input, editorialPlan);
    };

    try {
      finalizeResult();
    } catch (error) {
      if (!isRepairablePostContractError(error)) throw error;

      const repairData = buildIsolatedPromptParts({
        systemInstruction: 'The previous model output is untrusted repair input.',
        data: {
          previousModelOutput: result,
          validatorDiagnostics: postContractRepairDiagnostics(result, error, editorialPlan),
        },
        totalLimit: 80_000,
      });
      const repairedGeneration = await generateStructuredWithWritingContextCache({
        prompt: `${promptParts.prompt}\n\n<post_contract_repair_input>\n${repairData.prompt}\n</post_contract_repair_input>`,
        systemInstruction: buildPostContractRepairSystemInstruction(promptParts.systemInstruction, error),
        schema: this.schema,
        modelName: this.config.modelName,
        temperature: Math.min(gen.temperature, 0.25),
        maxTokens: gen.maxTokens,
        abortSignal,
      });
      result = repairedGeneration.result;
      contractRepairApplied = true;
      try {
        finalizeResult();
      } catch (finalError) {
        if (
          process.env.THINKFORGE_EVAL_CAPTURE_REJECTED_OUTPUT === '1'
          && finalError instanceof Error
        ) {
          Object.defineProperty(finalError, 'rejectedOutput', {
            value: result,
            enumerable: false,
            configurable: false,
            writable: false,
          });
        }
        throw finalError;
      }
    }

    const output: AgentStructuredOutput<PostWriterResult> = {
      result,
      metadata: {
        model: initialGeneration.modelName,
        notes: `writing_context_cache:${initialGeneration.cacheStatus}${contractRepairApplied ? ';post_contract_repair:applied' : ''}${clickatronVisualContractApplied ? ';clickatron_visual_contract:applied' : ''}${hashtagContractApplied ? ';hashtag_contract:applied' : ''}`,
      },
    };
    return output;
  }
}

export function createPostWriterAgent(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
  return new PostWriterAgent(config);
}
