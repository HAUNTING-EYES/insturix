import { getAntiAiConstraintBundle } from '../data/writing-graph-query';
import {
  createThinkForgeWriterContract,
  isThinkForgePostKind,
  normalizeThinkForgeDocumentContract,
  resolveExplicitThinkForgeDocumentRequest,
  resolveCarouselSlideCount,
  ThinkForgeDocumentContractSchema,
  type ThinkForgeDocumentContract,
  type ThinkForgeDocumentKind,
  type ThinkForgeWriterKind,
} from '../schemas/document-contract';

export interface DocumentRoleProfile {
  role: string;
  executionTest: string;
  outputFeeling: string;
  sectionGuidance: string;
}

interface PostOutputFormatOptions {
  targetCharacters?: number;
  targetWords?: number;
  maximumCharacters?: number;
  ctaMode?: 'none' | 'supplied_action' | 'soft' | 'hard' | 'urgent';
}

type ThinkForgeContentPath = 'post' | 'script';

interface ThinkForgeDocumentIntent {
  contentPath: ThinkForgeContentPath;
  documentType: ThinkForgeWriterKind;
  documentKind: ThinkForgeDocumentKind;
  outputKind: ThinkForgeWriterKind;
  contract: ThinkForgeDocumentContract;
  documentLabel: 'post' | 'script';
  source: 'content_contract' | 'legacy_document_type' | 'explicit_user_request';
}

type ThinkForgeDocumentIntentOrigin = 'user_request' | 'initial_draft_claim';

type ThinkForgeDocumentAuthorityErrorCode =
  | 'DOCUMENT_TYPE_REQUIRED'
  | 'DOCUMENT_TYPE_UNSUPPORTED'
  | 'DOCUMENT_TYPE_AMBIGUOUS';

export class ThinkForgeDocumentAuthorityError extends Error {
  constructor(
    readonly code: ThinkForgeDocumentAuthorityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ThinkForgeDocumentAuthorityError';
  }
}

function resolveAuthoritativeWriterContract(
  userPrompt: string,
  docType?: string,
  selectedContract?: ThinkForgeDocumentContract | null,
): { contract: ThinkForgeDocumentContract; source: ThinkForgeDocumentIntent['source'] } {
  if (selectedContract) {
    const contract = ThinkForgeDocumentContractSchema.parse(selectedContract);
    if (contract.outputKind === 'social_post' || contract.outputKind === 'carousel' || contract.outputKind === 'video_script') {
      return { contract, source: 'content_contract' };
    }
    throw new ThinkForgeDocumentAuthorityError(
      'DOCUMENT_TYPE_UNSUPPORTED',
      `The selected ${contract.artifactType} document is not handled by the post or script writer.`,
    );
  }

  const legacyContract = normalizeThinkForgeDocumentContract(docType);
  if (!legacyContract) {
    throw new ThinkForgeDocumentAuthorityError(
      'DOCUMENT_TYPE_REQUIRED',
      'Choose a post, carousel, or script document before generating content.',
    );
  }
  if (
    legacyContract.outputKind !== 'social_post'
    && legacyContract.outputKind !== 'carousel'
    && legacyContract.outputKind !== 'video_script'
  ) {
    throw new ThinkForgeDocumentAuthorityError(
      'DOCUMENT_TYPE_UNSUPPORTED',
      `The selected ${legacyContract.artifactType} document is not handled by the post or script writer.`,
    );
  }

  const contract = legacyContract.outputKind === 'carousel' && legacyContract.carouselSlideCount === undefined
    ? createThinkForgeWriterContract('carousel', { carouselSlideCount: resolveCarouselSlideCount(userPrompt) })
    : legacyContract;
  return { contract, source: 'legacy_document_type' };
}

export function resolveThinkForgeDocumentIntent(
  userPrompt: string,
  docType?: string,
  selectedContract?: ThinkForgeDocumentContract | null,
): ThinkForgeDocumentIntent {
  const { contract, source } = resolveAuthoritativeWriterContract(userPrompt, docType, selectedContract);
  const writerKind = contract.outputKind as ThinkForgeWriterKind;
  const contentPath = isThinkForgePostKind(writerKind) ? 'post' : 'script';
  return {
    contentPath,
    documentType: writerKind,
    documentKind: contract.documentKind,
    outputKind: writerKind,
    contract,
    documentLabel: contentPath === 'post' ? 'post' : 'script',
    source,
  };
}
export function resolveThinkForgeGenerationDocumentIntent(
  userPrompt: string,
  docType?: string,
  origin: ThinkForgeDocumentIntentOrigin = 'user_request',
  selectedContract?: ThinkForgeDocumentContract | null,
): ThinkForgeDocumentIntent {
  if (selectedContract) {
    return resolveThinkForgeDocumentIntent(userPrompt, docType, selectedContract);
  }
  if (origin === 'user_request') {
    const explicitRequest = resolveExplicitThinkForgeDocumentRequest(userPrompt);
    if (explicitRequest.status === 'unsupported') {
      throw new ThinkForgeDocumentAuthorityError(
        'DOCUMENT_TYPE_UNSUPPORTED',
        `ThinkForge does not yet have a production writer contract for ${explicitRequest.label}. Choose a post, carousel, or video script.`,
      );
    }
    if (explicitRequest.status === 'ambiguous') {
      throw new ThinkForgeDocumentAuthorityError(
        'DOCUMENT_TYPE_AMBIGUOUS',
        `Choose one output for this generation: ${explicitRequest.labels.join(', ')}.`,
      );
    }
    if (explicitRequest.status === 'supported') {
      const contract = explicitRequest.contract;
      const writerKind = contract.outputKind as ThinkForgeWriterKind;
      const contentPath = isThinkForgePostKind(writerKind) ? 'post' : 'script';
      return {
        contentPath,
        documentType: writerKind,
        documentKind: contract.documentKind,
        outputKind: writerKind,
        contract,
        documentLabel: contentPath === 'post' ? 'post' : 'script',
        source: 'explicit_user_request',
      };
    }
  }
  return resolveThinkForgeDocumentIntent(userPrompt, docType, selectedContract);
}

export function inferRoleFromContext(
  _projectSummary: string,
  _userPrompt: string,
  explicitDocType?: string,
): DocumentRoleProfile {
  const contract = normalizeThinkForgeDocumentContract(explicitDocType);

  if (contract?.outputKind === 'social_post' || contract?.outputKind === 'carousel') {
    return {
      role: 'a Senior Content Strategist and Copywriter',
      executionTest: 'A social media manager should be able to say: "I can publish this immediately - it fits the platform, hooks the audience, and drives the action I need."',
      outputFeeling: 'a polished, platform-ready post or article - not a brief, not a script, not an outline',
      sectionGuidance: '- Write the FINAL copy. Not a script. Not production notes. The actual words that will be published.\n- No scene headings. No **Visual:** or **Narration:** labels. This is TEXT content.\n- Use markdown for emphasis (**bold**, *italic*) but keep formatting minimal.\n- Match the platform voice: LinkedIn is professional-conversational, Twitter is punchy, Instagram is visual-first captions.',
    };
  }

  if (contract?.artifactType === 'character_bible') {
    return {
      role: 'a Senior Narrative Designer and Character Architect',
      executionTest: 'A writer should be able to say: "I know exactly who this character is and how they behave."',
      outputFeeling: 'a professional character bible, narrative profile, or story design document',
      sectionGuidance: '- Use sections like: Background, Motivation, Personality, Relationships, Arc, Key Quotes, Visual Description.',
    };
  }

  if (contract?.outputKind === 'video_script') {
    return {
      role: 'a Senior Creative Director and Video Scriptwriter',
      executionTest: 'A video editor should be able to say: "I know exactly what to show, say, and hear in every second."',
      outputFeeling: 'a professional video production script with scene-by-scene direction',
      sectionGuidance: `- This is a VIDEO SCRIPT. Follow the <output_format> block EXACTLY for per-scene structure.\n- Think like a director: for every line of narration, ask "what do I SHOW while these words are spoken?"\n- Each scene = one distinct visual moment. Two visuals = two scenes.\n- The VO text IS the product. Visual direction SERVES the narration.`,
    };
  }

  return {
    role: 'a Senior Creative Director and Production Strategist',
    executionTest: 'A creator should be able to say: "I know exactly what to make and how to execute it."',
    outputFeeling: 'a professional creative brief, production document, or strategy deck',
    sectionGuidance: '- Use natural section formats appropriate to the project type.\n- Frequently use labels like: "Purpose:", "Direction:", "Why this works:", "Note:".',
  };
}

type PlatformType = 'linkedin' | 'twitter' | 'instagram' | 'facebook' | 'generic';

interface PlatformConfig {
  name: string;
  charTarget: string;
  charMax: string;
  foldChars: number;
  hashtagRange: string;
  extraGuidance: string;
}

export const PLATFORM_CONFIGS: Record<PlatformType, PlatformConfig> = {
  linkedin: {
    name: 'LinkedIn',
    charTarget: '1,300-1,900',
    charMax: '3,000',
    foldChars: 210,
    hashtagRange: '3-5',
    extraGuidance: 'Professional-conversational tone. Line breaks for rhythm. One-liners for punch.',
  },
  twitter: {
    name: 'Twitter/X',
    charTarget: '200-280',
    charMax: '280',
    foldChars: 280,
    hashtagRange: '1-2',
    extraGuidance: 'Punchy, direct. Every word counts. Thread format if content exceeds 280 chars.',
  },
  instagram: {
    name: 'Instagram',
    charTarget: '1,000-2,200',
    charMax: '2,200',
    foldChars: 125,
    hashtagRange: '5-10',
    extraGuidance: 'Visual-first language. Emoji sparingly. Caption supports the image.',
  },
  facebook: {
    name: 'Facebook',
    charTarget: '400-800',
    charMax: '63,206',
    foldChars: 477,
    hashtagRange: '1-3',
    extraGuidance: 'Conversational. Can be longer but front-load the value.',
  },
  generic: {
    name: 'social media',
    charTarget: '1,300-1,900',
    charMax: '3,000',
    foldChars: 210,
    hashtagRange: '3-5',
    extraGuidance: 'Professional-conversational. Platform-agnostic but engagement-focused.',
  },
};

export function buildPostOutputFormat(
  platform: PlatformType,
  options: PostOutputFormatOptions = {},
): string {
  const config = PLATFORM_CONFIGS[platform];
  const antiAiConstraints = getAntiAiConstraintBundle().promptGuidance;
  const targetLength = options.targetCharacters !== undefined
    ? `Aim for ${options.targetCharacters} characters because the resolved brief explicitly requested it.`
    : options.targetWords !== undefined
      ? `Aim for ${options.targetWords} words because the resolved brief explicitly requested it.`
      : 'The brief has no explicit length target. Use only the space the supported idea needs.';
  const maximumLength = options.maximumCharacters !== undefined
    ? `The hard publishing maximum is ${options.maximumCharacters} characters including hashtags.`
    : 'No numeric publishing maximum is known for this surface; do not infer one.';
  const ctaRules = options.ctaMode === 'none' || options.ctaMode === undefined
    ? `CTA CONTRACT
  - Do not append a CTA merely because this is a social post.
  - End when the editorial thought is complete unless tf_untrusted_data explicitly supplies an action or postEditorialPlan selects a CTA.`
    : `CTA CONTRACT
  - postEditorialPlan.ctaMode is ${options.ctaMode}; execute postEditorialPlan.selectedCta.
  - Use only actions, offers, urgency, and destinations present in tf_untrusted_data.
  - Never invent a DM, booking, signup, purchase, contact, deadline, or scarcity route.`;

  return `<output_format>
Write the ACTUAL publishable ${config.name} post. Not a brief. Not production notes. Not an outline.

EDITORIAL FORM
  - Execute postEditorialPlan.selectedHook and postEditorialPlan.selectedStructure when present, including every listed anti-pattern.
  - If no hook technique is selected, open naturally with the most relevant source-backed idea; do not force a question, statistic, story, or provocation.
  - Let the selected structure and supported material determine paragraph count, sentence count, and line breaks.
  - Use blank lines where they improve reading rhythm; never pad the post to match a generic platform shape.
  - Preserve supplied dates, times, prices, URLs, brand names, event names, product names, offers, audience labels, and taglines verbatim.
  - Never add illustrative numbers, percentages, multipliers, money amounts, deadlines, rankings, causes, outcomes, or testimonials unless authorized sources support them.
  - If no metric is supplied, create specificity only through source-supplied scenes, audience pain, object details, workflow friction, or decision tradeoffs instead of inventing them or inventing numbers.
  - No scene headings, no **Visual:** labels, no **Narration:** labels, no production notes.

${ctaRules}

HASHTAG CONTRACT
  - Hashtags are optional. Return an empty hashtags array unless tf_untrusted_data explicitly requests them.
  - When requested, every tag must begin with #, be unique, and be grounded in a supplied entity, audience, workflow, format, or outcome.
  - Do not use generic engagement tags or invent a campaign name. ThinkForge assembles supplied tags after validation.

PLATFORM CONSTRAINTS (${config.name})
  - ${targetLength}
  - ${maximumLength}
  - ${config.extraGuidance}
CLICKATRON OUTPUT
  - Fill clickatron.singleImagePrompt or clickatron.carouselPrompts.
  - Include only source facts that can be conveyed visually: subject, environment, props, activity, mood, composition, lighting, and brand-safe visual style.
  - Ground each prompt in at least two supplied visual cues, including an action, object, environment, or workflow cue. Do not substitute generic office, team, or dashboard scenery for the actual concept.
  - Describe safe zones and visual hierarchy without supplying headlines, captions, dates, CTA copy, text-overlay instructions, logos, watermarks, or readable UI.
  - For carouselPrompts, each slide prompt must describe its distinct visual message; ThinkForge derives final editable copy from the post content downstream.

ANTI-AI CONSTRAINTS (from writing-knowledge graph)
${antiAiConstraints}
  Treat banned_phrase_list entries as literal forbidden substrings in final content.
  Before returning, scan the final content and rewrite any sentence violating these constraints.
</output_format>`;
}

export function detectPlatform(userPrompt: string, docType?: string, projectSummary?: string): PlatformType {
  const lower = userPrompt.toLowerCase();
  if (/\blinkedin\b/.test(lower)) return 'linkedin';
  if (/\btwitter\b|\btweet\b|\bx\s+post\b|\bx\s+thread\b/.test(lower)) return 'twitter';
  if (/\binstagram\b/.test(lower)) return 'instagram';
  if (/\bfacebook\b/.test(lower)) return 'facebook';
  const dt = (docType || '').toLowerCase();
  if (dt.includes('linkedin')) return 'linkedin';
  if (dt.includes('twitter') || dt.includes('tweet')) return 'twitter';
  if (dt.includes('instagram')) return 'instagram';
  if (dt.includes('facebook')) return 'facebook';
  const ps = (projectSummary || '').toLowerCase();
  if (/platform:\s*linkedin/i.test(ps)) return 'linkedin';
  if (/platform:\s*(twitter|x)/i.test(ps)) return 'twitter';
  if (/platform:\s*instagram/i.test(ps)) return 'instagram';
  if (/platform:\s*facebook/i.test(ps)) return 'facebook';
  if (/post|social/i.test(dt)) return 'linkedin';
  return 'generic';
}

export function detectContentPath(
  userPrompt: string,
  docType?: string,
  selectedContract?: ThinkForgeDocumentContract | null,
): 'post' | 'script' {
  return resolveThinkForgeDocumentIntent(userPrompt, docType, selectedContract).contentPath;
}
