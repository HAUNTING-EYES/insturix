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
  maximumCharacters?: number;
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

export type ThinkForgeDocumentAuthorityErrorCode =
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
  const targetCharacters = options.targetCharacters ?? config.charTarget;
  const maximumCharacters = options.maximumCharacters ?? config.charMax;
  const antiAiConstraints = getAntiAiConstraintBundle().promptGuidance;
  const platformHardRules = [
    platform === 'twitter'
      ? 'TWITTER/X HARD LIMIT:\n  - Write one publishable post unless the user explicitly asks for a thread.\n  - Stay under 280 characters including hashtags.'
      : undefined,
    platform === 'instagram'
      ? 'INSTAGRAM HARD RULE:\n  - Use 1-3 relevant emojis unless brand context forbids emojis.\n  - The CTA must appear before the hashtag line.'
      : undefined,
  ].filter(Boolean).join('\n\n');

  return `<output_format>
Write the ACTUAL publishable ${config.name} post. Not a brief. Not production notes. Not an outline.

LINE BREAK CONTRACT
  - The content string must start with one standalone hook line.
  - Insert a blank line immediately after the hook.
  - Never put the first body sentence on the hook line.
  - Use blank lines between paragraphs.

STEP 1 HOOK
  - The first line must be 10-180 characters and stand alone.
  - The first ${config.foldChars} characters must contain a grounded claim, supplied number, named entity, concrete audience pain, or concrete object from <input_data>.
  - Start with an audience, named product, supplied number, event, price, or concrete problem from <input_data>.
  - A supplied number alone is not a hook: pair it with the audience's concrete pain, workflow friction, or decision at stake.
  - Do not start with a broad category claim like "AI is...", "The future of...", "This is...", or "The world of...".
  - Never open with "In today's...", "Have you ever...", "Imagine...", "It's no secret...", or "Picture this...".

STEP 2 BODY
  - Write 2-4 short paragraphs. Each paragraph max 3 sentences.
  - Preserve supplied dates, times, prices, URLs, brand names, event names, product names, offers, audience labels, and taglines verbatim.
  - Do not paraphrase supplied offers: if <input_data> says "free teardown", the final content must say "free teardown".
  - Do not rewrite numeric phrases: if <input_data> says "12 qualified sales calls", do not write "Twelve calls" or drop adjacent qualifiers.
  - Never add illustrative numbers, percentages, multipliers, money amounts, deadlines, or rankings unless that exact number appears in <input_data>.
  - If no metric is supplied, create specificity through scene, audience pain, object detail, workflow friction, or decision tradeoff instead of inventing numbers.
  - No scene headings, no **Visual:** labels, no **Narration:** labels, no production notes.
  - Vary rhythm: mix short punch lines with longer explanation lines.

STEP 3 CTA
  - Write the CTA as its own line directly before hashtags.
  - The final non-hashtag line must contain a ? or one clear action verb: ask, apply, book, buy, call, claim, comment, contact, DM, donate, discover, download, join, learn more, message, register, reply, reserve, save, schedule, send, share, shop, sign up, tag, try, visit, watch, or the equivalent action verb in the user's language.
  - End the body with exactly one specific call-to-action tied to the brief.
  - Use the supplied action when present: register, sign up, donate, shop, book, apply, claim, DM, message, schedule, comment, share, or the supplied URL.
  - Never invent an outreach route. Do not ask readers to DM, message, contact, call, book, or schedule unless <input_data> supplies that route, a resource, or a URL.
  - If no supplied action, resource, or URL exists, close with a question that names a supplied audience, workflow, entity, or outcome.
  - Good pattern: "Comment with the workflow bottleneck your team most wants to remove."
  - Never use generic CTAs like "What do you think?", "Thoughts?", "Agree?", "Right?", or reflective statement endings.
  - The CTA must be in the last 3 non-hashtag lines.

STEP 4 HASHTAGS
  - Return ${config.hashtagRange} hashtags in the required hashtags array, not in content.
  - Every tag must begin with #, be unique, and be grounded in a supplied entity, audience, workflow, format, or outcome.
  - Do not use generic engagement tags or invent a campaign name. ThinkForge assembles the final hashtag line after validation.
  - If you run long, cut body copy before cutting the CTA or hashtags.

PLATFORM CONSTRAINTS (${config.name})
  - Target: ${targetCharacters} characters. Platform max: ${maximumCharacters}.
  - Do not undershoot the target range unless the platform hard limit requires it.
  - ${config.extraGuidance}
${platformHardRules ? `\n${platformHardRules}\n` : ''}
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
