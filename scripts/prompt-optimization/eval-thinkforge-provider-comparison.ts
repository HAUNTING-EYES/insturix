/**
 * ThinkForge provider comparison eval.
 *
 * Scope:
 * - Eval-only model calls for Gemini vs DeepSeek/OpenRouter.
 * - Fixed public/fake test cases.
 * - Low-temperature multi-run stability checks.
 * - No true seed claim for DeepSeek/OpenRouter.
 *
 * Usage:
 *   npx tsx scripts/prompt-optimization/eval-thinkforge-provider-comparison.ts
 *   npx tsx scripts/prompt-optimization/eval-thinkforge-provider-comparison.ts --providers=gemini,openrouter --runs=3
 *   npx tsx scripts/prompt-optimization/eval-thinkforge-provider-comparison.ts --case=sidecar_linkedin_carousel --show-output
 *   npx tsx scripts/prompt-optimization/eval-thinkforge-provider-comparison.ts --json-out=.artifacts/thinkforge-provider-scoreboard.json
 *   npx tsx scripts/prompt-optimization/eval-thinkforge-provider-comparison.ts --privacy-dry-run --providers=deepseek
 *
 * Optional cost env:
 *   EVAL_PRICE_GEMINI_INPUT_PER_1M=...
 *   EVAL_PRICE_GEMINI_OUTPUT_PER_1M=...
 *   EVAL_PRICE_DEEPSEEK_INPUT_PER_1M=...
 *   EVAL_PRICE_DEEPSEEK_OUTPUT_PER_1M=...
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { IdeasAgent } from '../../lib/thinkforge/agents/ideas-agent';
import { ScriptAuthorAgent, type ScriptAuthorInput } from '../../lib/thinkforge/agents/script-author-agent';
import type { NarrativeContract } from '../../lib/thinkforge/agents/script-contract-agent';
import type { ScriptOutline } from '../../lib/thinkforge/agents/script-outline-agent';
import type { ProjectContextData } from '../../lib/thinkforge/agents/types';
import type { RetrievedContext } from '../../lib/thinkforge/context';
import type {
  ClickatronCreativeSpec,
  ThinkForgeBlockExportMeta,
} from '../../lib/thinkforge/schemas/clickatron-creative-contract';
import { resolveContentSignalProfile, type ThinkForgeContentSignalProfile } from '../../lib/thinkforge/signals';
import {
  applyContentSignalProfileToClickatronExportMeta,
  appendClickatronCreativeSidecarInstruction,
  extractRequiredClickatronCreativeSidecar,
  stripClickatronCreativeSidecarText,
} from '../../lib/thinkforge/utils/clickatron-creative-sidecar';
import {
  buildEvalProviderConfig,
  defaultEvalModelForProvider,
  parseEvalProviders,
  runEvalPrompt,
  type EvalProvider,
  type EvalProviderConfig,
  type EvalRunResult,
} from './thinkforge-eval-provider-adapter';
import { prepareProviderPromptForRoute } from '../../lib/thinkforge/privacy/provider-privacy-gateway';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

type ScoreCategory =
  | 'output_quality'
  | 'schema_json_validity'
  | 'forbidden_term_obedience'
  | 'brand_voice_match'
  | 'clickatron_sidecar_completeness';

type EvalArea = 'author' | 'ideas' | 'clickatron_sidecar';

type FailureOwner = 'model_issue' | 'prompt_contract_issue' | 'eval_rubric_issue' | 'provider_issue';
type FailureSeverity = 'critical' | 'major' | 'minor';

interface CheckResult {
  category: ScoreCategory;
  name: string;
  pass: boolean;
  detail?: string;
  owner?: FailureOwner;
  severity?: FailureSeverity;
}

interface ScoreResult {
  passed: number;
  total: number;
  ratio: number;
  checks: CheckResult[];
  categoryRatios: Partial<Record<ScoreCategory, number>>;
  failureModes: string[];
}

interface ProviderRunRecord {
  caseId: string;
  caseName: string;
  area: EvalArea;
  provider: EvalProvider;
  model: string;
  runIndex: number;
  score: ScoreResult;
  latencyMs?: number;
  usage?: EvalRunResult['usage'];
  estimatedCostUsd?: number;
  costEstimateNote?: string;
  privacyAudit?: EvalRunResult['privacyAudit'];
  artifactPath?: string;
  error?: string;
}

interface ProviderPrivacyDryRunRecord {
  caseId: string;
  caseName: string;
  area: EvalArea;
  provider: EvalProvider;
  model: string;
  allowed: boolean;
  privacyClass: EvalRunResult['privacyAudit']['privacyClass'];
  blockReason?: string;
  redactions: string[];
  sourcePromptFingerprint: string;
  sentPromptFingerprint?: string;
  sourcePromptLength: number;
  sentPromptLength?: number;
}

interface IdeasResult {
  ideas?: Array<{
    id?: string;
    idea?: string;
    purpose?: string;
    style?: string;
    format?: string;
    platform?: string;
    tone?: string;
  }>;
}

interface FillerPattern {
  pattern: string;
  label: string;
}

interface LegacyAuthorCriteria {
  hasMusicDirection?: boolean;
  hasTimingBrackets?: boolean;
  minScenes?: number;
  maxScenes?: number;
  elementsPerScene?: string[];
  visualsAreActions?: boolean;
  noAiFiller?: boolean;
  hasSpecificDetails?: boolean;
  hasMoodReferences?: boolean;
  hasOnCameraLabel?: boolean;
  noSceneHeadings?: boolean;
  noVisualLabels?: boolean;
  noVOLabels?: boolean;
  hasHashtags?: boolean;
  charRange?: [number, number];
  hookBeforeFold?: boolean;
  hasCTA?: boolean;
  hashtagRange?: [number, number];
  hasEmoji?: boolean;
}

interface LegacyAuthorCase {
  id: string;
  name: string;
  documentType: string;
  projectSummary: string;
  userPrompt: string;
  systemBrief?: string;
  expectedFormat: 'video' | 'post';
  criteria: LegacyAuthorCriteria;
}

interface AuthorCase {
  id: string;
  name: string;
  documentType: string;
  input: ScriptAuthorInput;
  expected: {
    format: 'post' | 'script';
    requiredTerms: string[];
    brandVoiceTerms: string[];
    forbiddenTerms: string[];
    minLength: number;
    maxLength: number;
  };
}

interface IdeasCase {
  id: string;
  name: string;
  prompt: string;
  brandContext?: string;
  expected: {
    requiredTerms: string[];
    forbiddenTerms: string[];
    preferredPlatforms: string[];
  };
}

interface LegacyIdeasCriteria {
  platformsAreText?: boolean;
  platformsAreVideo?: boolean;
  formatsAreText?: boolean;
  formatsAreVideo?: boolean;
  allPlatformsValid?: boolean;
  ideasAreDiverse?: boolean;
  titlesAreSpecific?: boolean;
}

interface LegacyIdeasCase {
  id: string;
  name: string;
  prompt: string;
  expectedIntent: 'post' | 'video' | 'any';
  criteria: LegacyIdeasCriteria;
}

interface SidecarExpected {
  kind: ClickatronCreativeSpec['kind'];
  assetIntent: ClickatronCreativeSpec['assetIntent'];
  platform: ClickatronCreativeSpec['platform'];
  aspectRatio: string;
  textPolicy: ClickatronCreativeSpec['renderPlan']['textPolicy'];
  minTextLayers?: number;
  minSlides?: number;
  requiredCalendar?: Partial<NonNullable<ClickatronCreativeSpec['calendar']>>;
  requiredClaims: string[];
  brandVoiceTerms: string[];
  forbiddenVisibleTerms: string[];
  forbiddenUnsupportedTerms?: string[];
}

interface SidecarCase {
  id: string;
  name: string;
  documentType: string;
  projectSummary: string;
  systemBrief: string;
  userPrompt: string;
  project: ProjectContextData;
  brandId: string;
  sessionId: string;
  retrievedContext: RetrievedContext;
  outline: ScriptOutline;
  contract: NarrativeContract;
  expected: SidecarExpected;
}

interface EvalCase {
  id: string;
  name: string;
  area: EvalArea;
  buildPrompt: () => string;
  scoreOutput: (output: string) => ScoreResult;
}

const CATEGORIES: ScoreCategory[] = [
  'output_quality',
  'schema_json_validity',
  'forbidden_term_obedience',
  'brand_voice_match',
  'clickatron_sidecar_completeness',
];

const FILLER_DEFS: FillerPattern[] = JSON.parse(
  readFileSync(join(__dirname, '../../lib/thinkforge/data/ai-filler-patterns.json'), 'utf-8'),
);

const AI_FILLER = FILLER_DEFS.map((definition) => ({
  regex: new RegExp(definition.pattern, 'i'),
  label: definition.label,
}));

const VALID_IDEA_PLATFORMS = new Set([
  'YouTube',
  'Instagram',
  'TikTok',
  'LinkedIn',
  'Twitter/X',
  'Reddit',
  'Medium',
  'Blog',
  'Podcast',
  'Newsletter',
  'Facebook',
  'Pinterest',
  'Film Festival',
  'Internal',
  'Multi-platform',
]);

const TEXT_IDEA_PLATFORMS = new Set(['LinkedIn', 'Twitter/X', 'Medium', 'Blog', 'Newsletter', 'Reddit', 'Facebook']);
const VIDEO_IDEA_PLATFORMS = new Set(['YouTube', 'TikTok', 'Instagram']);
const LEGACY_VALID_IDEA_PLATFORMS = new Set([
  ...TEXT_IDEA_PLATFORMS,
  ...VIDEO_IDEA_PLATFORMS,
  'Podcast',
  'Pinterest',
]);
const VIDEO_FORMAT_WORDS = /\b(video|reel|skit|clip|film|vlog|duet|pov\b|storytime|explainer|tutorial|unboxing|reaction|review\s*video)\b/i;
const TEXT_FORMAT_WORDS = /\b(post|article|essay|thread|carousel|newsletter|listicle|guide|blog|case study|breakdown|hot take|story|opinion|anecdotal)\b/i;
const ACTIONABLE_IDEA_FORMAT_WORDS = /\b(post|carousel|newsletter|blog|article|essay|guide|e-?book|video|script|series|case study|thread|film|documentary|explainer|thought piece|calendar slot)\b/i;
const IDEA_PLATFORM_CONTRACT = `Platform contract:
- platform must be exactly one of: LinkedIn, Twitter/X, Medium, Blog, Newsletter, Reddit, Facebook, YouTube, TikTok, Instagram, Podcast, Pinterest.
- Return exactly one platform string per idea. Do not return domains, websites, slashed combos, "Company blog / LinkedIn", or "Multi-platform".
- If the request says post, write, article, blog, essay, thread, newsletter, or names a website/domain, use text platforms only: LinkedIn, Twitter/X, Medium, Blog, Newsletter, Reddit, or Facebook.
- If the request names TikTok, YouTube, reel, short, vlog, skit, or video, use video platforms only: TikTok, YouTube, or Instagram.
- If the request is generic business content, choose a concrete channel instead of "website" or "conference": LinkedIn, Blog, Newsletter, YouTube, or TikTok.
- format must be a concrete platform-ready deliverable such as LinkedIn post, carousel, newsletter section, blog article, guide, short video script, X thread, or case study.
- If the request mentions calendar, campaign, or series, preserve that planning language in at least the purpose or format for every idea.`;

const argv = process.argv.slice(2);
const providers = parseEvalProviders(readArg('providers'));
const runs = readPositiveIntArg('runs', 3);
const temperature = readNumberArg('temperature', 0.2);
const maxOutputTokens = readPositiveIntArg('max-output-tokens', 8192);
const caseFilter = readArg('case');
const showOutput = hasFlag('show-output');
const jsonOut = readArg('json-out');
const artifactDir = readArg('artifact-dir');
const saveArtifacts = !hasFlag('no-artifacts');
const saveAllArtifacts = hasFlag('all-artifacts');
const privacyDryRun = hasFlag('privacy-dry-run') || hasFlag('privacy-report');
const privacyDryRunStrict = hasFlag('privacy-dry-run-strict');
const decisionThreshold = readNumberArg('decision-threshold', 0.95);
const stabilityThreshold = readNumberArg('stability-threshold', 0.95);
const artifactRoot = saveArtifacts
  ? resolve(process.cwd(), artifactDir ?? join('.artifacts', 'thinkforge-provider-eval', timestampSlug()))
  : undefined;

ensurePromptBuilderKey(providers, privacyDryRun);

const authorAgent = new ScriptAuthorAgent();
const ideasAgent = new IdeasAgent({ temperature, maxTokens: maxOutputTokens });

const providerConfigs: EvalProviderConfig[] = providers.map((provider) => {
  const model = readArg(`model-${provider}`) ?? readArg('model');
  if (privacyDryRun) {
    return {
      provider,
      model: model ?? defaultEvalModelForProvider(provider),
      apiKey: 'privacy-dry-run',
      temperature,
      maxOutputTokens,
    };
  }

  return buildEvalProviderConfig({
    provider,
    model,
    temperature,
    maxOutputTokens,
  });
});

const AUTHOR_CASES: AuthorCase[] = [
  {
    id: 'author_linkedin_agency_post',
    name: 'Author output: LinkedIn agency post',
    documentType: 'post',
    input: {
      context: {
        projectSummary: 'ApprovalOps helps creative agencies reduce content approval delays.',
        systemBrief:
          'Brand DNA: warm expert, plainspoken, operational. Audience: agency founders and creative directors. Never use visible text: game-changing.',
      },
      project: {
        projectName: 'ApprovalOps Founder Post',
        platform: 'LinkedIn',
        format: 'post',
        purpose: 'educate agency founders',
        tone: 'warm expert',
        brandId: 'brand_approval_ops',
      },
      userPrompt:
        'Write a LinkedIn post for agency founders about reducing content approval time by 37% by naming one approval owner. Make it practical, not hype.',
      documentType: 'post',
      retrievedContext: {
        brandDNA: {
          voiceLock: 'warm, expert, plainspoken, operational',
          nicheMap: 'B2B agencies and creative operators',
          killList: ['game-changing'],
          hookArchetypes: ['metric-led opener', 'operational diagnosis'],
          structuralHabits: ['metric, root cause, practical fix, useful CTA'],
        },
        projectFacts: [
          {
            id: 'fact_approval_owner',
            title: 'Approval benchmark',
            summary: 'Naming one approval owner can reduce approval time by 37%.',
            tags: ['approval', 'workflow'],
          },
        ],
        globalFacts: [],
        semanticFacts: [],
        interactionPatterns: [],
      },
    },
    expected: {
      format: 'post',
      requiredTerms: ['37%', 'approval'],
      brandVoiceTerms: ['agency', 'workflow', 'owner'],
      forbiddenTerms: ['game-changing', 'revolutionary'],
      minLength: 400,
      maxLength: 3000,
    },
  },
  {
    id: 'author_film_house_script',
    name: 'Author output: film-house brand script',
    documentType: 'video_script',
    input: {
      context: {
        projectSummary:
          'Northstar Films is pitching a 90-second brand film for a craft coffee roaster with farm-to-cup sourcing.',
        systemBrief:
          'Brand DNA: cinematic, restrained, sensory, precise. Audience: specialty coffee buyers and hospitality partners. Avoid generic luxury language.',
      },
      project: {
        projectName: 'Oakridge Coffee Brand Film',
        platform: 'YouTube',
        format: 'brand film',
        purpose: 'pitch a production-ready brand film treatment',
        tone: 'cinematic restrained',
        brandId: 'brand_oakridge',
      },
      userPrompt:
        'Write a 90-second brand film script for Oakridge Coffee. It should feel cinematic and practical enough for a film house to shoot.',
      documentType: 'video_script',
      outline: {
        title: 'Oakridge Coffee Brand Film',
        sections: [
          { id: 'S1', title: 'Opening Texture', goal: 'Establish place and craft.', beat: 'Hook', level: 'act' },
          { id: 'S2', title: 'Human Process', goal: 'Show sourcing and roasting as human work.', beat: 'Bridge', level: 'act' },
          { id: 'S3', title: 'Closing Pour', goal: 'Land the brand promise quietly.', beat: 'Resolution', level: 'act' },
        ],
      },
      contract: {
        generation_mode: 'manual',
        narrator_voice: 'observational',
        medium: 'voiceover',
        tone: 'cinematic restrained',
        forbidden: ['generic luxury', 'world-class', 'elevate your senses'],
        allowed_metaphors: ['morning air', 'roasting heat'],
        style_notes: ['production-ready', 'shootable visuals', 'sensory but grounded'],
        metaphor_reuse_limit: 1,
        mode_a_usage: 'opening only',
        mode_b_usage: 'default direct script voice',
        mode_switch_rules: 'stay shootable and restrained',
      },
    },
    expected: {
      format: 'script',
      requiredTerms: ['coffee', 'roast'],
      brandVoiceTerms: ['farm', 'cup', 'morning'],
      forbiddenTerms: ['world-class', 'elevate your senses', 'generic luxury'],
      minLength: 500,
      maxLength: 5000,
    },
  },
  {
    id: 'author_calendar_linkedin_post',
    name: 'Author output: calendar-aware agency post',
    documentType: 'post',
    input: {
      context: {
        projectSummary:
          'ApprovalOps is planning a June content calendar for agency founders who lose launch-week time to slow client reviews.',
        systemBrief:
          'Brand DNA: warm expert, plainspoken, operational. Audience: agency owners and account leads. Avoid vague productivity hype.',
      },
      project: {
        projectName: 'June Approval Calendar',
        platform: 'LinkedIn',
        format: 'calendar post',
        purpose: 'seed a month-long education campaign',
        tone: 'calm operator',
        brandId: 'brand_approval_ops',
      },
      userPrompt:
        'Write one LinkedIn post from a June content calendar for agency founders. Topic: one approval owner before launch week. Mention June, calendar, approval, and one practical CTA.',
      documentType: 'post',
      retrievedContext: {
        brandDNA: {
          voiceLock: 'calm, operational, specific, founder-friendly',
          nicheMap: 'creative agencies and production teams',
          killList: ['synergy', 'game-changing'],
          hookArchetypes: ['calendar hook', 'launch-week pain point'],
          structuralHabits: ['calendar context, pain, practical fix, CTA'],
        },
        projectFacts: [
          {
            id: 'fact_launch_week',
            title: 'Launch-week bottleneck',
            summary: 'Approval ownership is the first calendar lever before launch week.',
            tags: ['calendar', 'approval'],
          },
        ],
        globalFacts: [],
        semanticFacts: [],
        interactionPatterns: [],
      },
    },
    expected: {
      format: 'post',
      requiredTerms: ['June', 'calendar', 'approval'],
      brandVoiceTerms: ['agency', 'owner', 'launch'],
      forbiddenTerms: ['synergy', 'game-changing'],
      minLength: 400,
      maxLength: 3000,
    },
  },
  {
    id: 'author_shoot_guidance_talking_head',
    name: 'Author output: shoot guidance talking-head script',
    documentType: 'video_script',
    input: {
      context: {
        projectSummary:
          'StudioPilot helps small film and content teams turn scripts into shootable founder videos with clear production notes.',
        systemBrief:
          'Brand DNA: practical, production-literate, calm. User setup: one camera, desk mic, small office, window key light from camera-left, no crew.',
      },
      project: {
        projectName: 'StudioPilot Founder Script',
        platform: 'YouTube',
        format: 'talking head',
        purpose: 'record a shootable founder education video',
        tone: 'calm practical',
        brandId: 'brand_studio_pilot',
      },
      userPrompt:
        'Write a 45-second talking-head script about why founders should script the first 5 seconds before filming. Include concise camera, light, framing, and emotion guidance for the one-camera office setup.',
      documentType: 'video_script',
      outline: {
        title: 'Founder First Five Seconds',
        sections: [
          { id: 'S1', title: 'Hook', goal: 'Explain the opening problem.', beat: 'Hook', level: 'act' },
          { id: 'S2', title: 'Fix', goal: 'Give the scripting habit.', beat: 'Solution', level: 'act' },
          { id: 'S3', title: 'Shoot Note', goal: 'Make the user easy to film.', beat: 'Solution', level: 'act' },
        ],
      },
      contract: {
        generation_mode: 'manual',
        narrator_voice: 'founder coach',
        medium: 'voiceover',
        tone: 'calm practical',
        forbidden: ['cinematic masterpiece', 'viral guarantee', 'game-changing'],
        allowed_metaphors: ['first frame', 'quiet room'],
        style_notes: ['shootable setup notes', 'camera and lighting guidance', 'no crew assumptions'],
        metaphor_reuse_limit: 1,
        mode_a_usage: 'opening only',
        mode_b_usage: 'direct coaching voice',
        mode_switch_rules: 'keep production guidance concrete',
      },
    },
    expected: {
      format: 'script',
      requiredTerms: ['camera', 'light', 'framing'],
      brandVoiceTerms: ['office', 'founder', 'emotion'],
      forbiddenTerms: ['cinematic masterpiece', 'viral guarantee', 'game-changing'],
      minLength: 500,
      maxLength: 4500,
    },
  },
];

const LEGACY_AUTHOR_CASES: LegacyAuthorCase[] = [
  {
    id: 'legacy_author_1_tiktok_product_ad',
    name: 'Legacy author: TikTok product ad',
    documentType: 'video_script',
    projectSummary: 'Insturix - AI-powered video editing platform that turns raw footage into polished content in minutes.',
    userPrompt: 'Create a 30-second TikTok product ad showing how Insturix saves time for freelance video editors.',
    expectedFormat: 'video',
    criteria: {
      hasMusicDirection: true,
      hasTimingBrackets: true,
      minScenes: 3,
      maxScenes: 6,
      elementsPerScene: ['VO', 'Visual', 'Audio', 'Text', 'Mood', 'Transition'],
      visualsAreActions: true,
      noAiFiller: true,
      hasSpecificDetails: true,
    },
  },
  {
    id: 'legacy_author_2_linkedin_post',
    name: 'Legacy author: LinkedIn post',
    documentType: 'post',
    projectSummary: 'Insturix - AI-powered video editing platform for creators and agencies.',
    userPrompt: 'Write a LinkedIn post about how AI is changing video production workflows for small agencies.',
    systemBrief:
      'Brand: Insturix. Voice: Professional but approachable, grounded in real workflow pain. Target: Agency owners and creative directors managing 5-15 person teams. Values: Efficiency without sacrificing creative quality.',
    expectedFormat: 'post',
    criteria: {
      noSceneHeadings: true,
      noVisualLabels: true,
      noVOLabels: true,
      hasHashtags: true,
      charRange: [800, 3000],
      noAiFiller: true,
      hasSpecificDetails: true,
      hookBeforeFold: true,
      hasCTA: true,
    },
  },
  {
    id: 'legacy_author_3_brand_film',
    name: 'Legacy author: Brand film',
    documentType: 'video_script',
    projectSummary: 'Oakridge Coffee Co. - craft roaster, farm-to-cup, Huila region Colombia.',
    userPrompt: 'Write a 2-minute brand film script for Oakridge Coffee. Warm, unhurried, Terrence Malick meets food photography.',
    systemBrief:
      'Brand: Oakridge Coffee Co. Voice: Warm, unhurried, sensory-rich. Origin story matters. Target: Specialty coffee enthusiasts, 28-45. Values: Craft, transparency, terroir.',
    expectedFormat: 'video',
    criteria: {
      hasMusicDirection: true,
      hasTimingBrackets: true,
      minScenes: 5,
      maxScenes: 10,
      elementsPerScene: ['VO', 'Visual', 'Audio', 'Mood', 'Transition'],
      visualsAreActions: true,
      noAiFiller: true,
      hasSpecificDetails: true,
      hasMoodReferences: true,
    },
  },
  {
    id: 'legacy_author_4_talking_head_video',
    name: 'Legacy author: Talking head video',
    documentType: 'video_script',
    projectSummary: 'Personal brand - solo content creator making YouTube videos about productivity.',
    userPrompt: 'Write a talking head video script about the 3 biggest time-wasters in remote work. Direct to camera, conversational.',
    expectedFormat: 'video',
    criteria: {
      hasTimingBrackets: true,
      minScenes: 3,
      maxScenes: 8,
      hasOnCameraLabel: true,
      noAiFiller: true,
      hasSpecificDetails: true,
    },
  },
  {
    id: 'legacy_author_5_technical_linkedin',
    name: 'Legacy author: Technical LinkedIn tool comparison',
    documentType: 'post',
    projectSummary: 'DevOps consulting firm specializing in CI/CD pipeline optimization.',
    userPrompt: 'Write a LinkedIn post comparing GitHub Actions vs GitLab CI for teams with 10-50 developers.',
    systemBrief:
      'Brand: PipelineOps. Voice: Technical but accessible, evidence-based, no vendor worship. Target: Engineering managers and DevOps leads.',
    expectedFormat: 'post',
    criteria: {
      noSceneHeadings: true,
      noVisualLabels: true,
      noVOLabels: true,
      hasHashtags: true,
      charRange: [800, 3000],
      noAiFiller: true,
      hasSpecificDetails: true,
      hookBeforeFold: true,
      hasCTA: true,
    },
  },
  {
    id: 'legacy_author_6_personal_story_linkedin',
    name: 'Legacy author: Personal story LinkedIn',
    documentType: 'post',
    projectSummary: 'Solo founder building a bootstrapped SaaS for restaurant inventory management.',
    userPrompt: 'Write a LinkedIn post about the career lesson I learned when my first startup failed after 18 months and $40K of savings.',
    systemBrief:
      'Brand: Personal brand of a founder. Voice: Honest, reflective, no toxic positivity. Target: Other founders and aspiring entrepreneurs.',
    expectedFormat: 'post',
    criteria: {
      noSceneHeadings: true,
      noVisualLabels: true,
      noVOLabels: true,
      hasHashtags: true,
      charRange: [800, 3000],
      noAiFiller: true,
      hasSpecificDetails: true,
      hookBeforeFold: true,
      hasCTA: true,
    },
  },
  {
    id: 'legacy_author_7_data_driven_linkedin',
    name: 'Legacy author: Data-driven LinkedIn',
    documentType: 'post',
    projectSummary: 'HR tech startup with employee engagement analytics platform.',
    userPrompt: 'Write a LinkedIn post analyzing the trend of return-to-office mandates using data on employee turnover and productivity.',
    systemBrief:
      'Brand: PulseMetrics. Voice: Data-first, contrarian where data supports it, never preachy. Target: HR leaders and CHROs at companies with 500+ employees.',
    expectedFormat: 'post',
    criteria: {
      noSceneHeadings: true,
      noVisualLabels: true,
      noVOLabels: true,
      hasHashtags: true,
      charRange: [800, 3000],
      noAiFiller: true,
      hasSpecificDetails: true,
      hookBeforeFold: true,
      hasCTA: true,
    },
  },
  {
    id: 'legacy_author_8_twitter_product_launch',
    name: 'Legacy author: Twitter/X product launch',
    documentType: 'post',
    projectSummary: 'SaaS startup launching a new AI writing tool for content marketers.',
    userPrompt:
      'Write a tweet announcing our new AI writing assistant that helps content marketers produce 3x more articles without sacrificing quality.',
    systemBrief:
      'Brand: ContentForge. Voice: Confident, direct, zero fluff. Target: Content marketers and heads of content.',
    expectedFormat: 'post',
    criteria: {
      charRange: [50, 400],
      noSceneHeadings: true,
      noVisualLabels: true,
      noVOLabels: true,
      noAiFiller: true,
      hashtagRange: [0, 3],
      hasSpecificDetails: true,
    },
  },
  {
    id: 'legacy_author_9_instagram_caption',
    name: 'Legacy author: Instagram caption product launch',
    documentType: 'post',
    projectSummary: 'DTC skincare brand focused on clean ingredients and sustainability.',
    userPrompt:
      'Write an Instagram caption for our new vitamin C serum launch photo. The product is a gold bottle on a marble surface with orange slices.',
    systemBrief:
      'Brand: GlowNaturals. Voice: Warm, inviting, clean beauty enthusiast. Target: Women 25-40 who care about ingredients and sustainability.',
    expectedFormat: 'post',
    criteria: {
      charRange: [200, 2200],
      noSceneHeadings: true,
      noVisualLabels: true,
      noVOLabels: true,
      noAiFiller: true,
      hasHashtags: true,
      hashtagRange: [3, 15],
      hasEmoji: true,
      hasCTA: true,
    },
  },
];

const IDEAS_CASES: IdeasCase[] = [
  {
    id: 'ideas_agency_campaign',
    name: 'Ideas agent: agency campaign concepts',
    prompt:
      'Generate 4 content ideas for ApprovalOps, a workflow platform for creative agencies. The campaign should help agency founders reduce approval delays without sounding like generic SaaS.',
    brandContext:
      'Brand voice: warm expert, plainspoken, operational. Audience: agency founders, creative directors, and account leads. Avoid: game-changing, revolutionary.',
    expected: {
      requiredTerms: ['approval', 'agency'],
      forbiddenTerms: ['game-changing', 'revolutionary'],
      preferredPlatforms: ['LinkedIn', 'Newsletter', 'Blog', 'Twitter/X', 'Instagram'],
    },
  },
  {
    id: 'ideas_public_trend_calendar',
    name: 'Ideas agent: public trend calendar repurposing',
    prompt:
      'Generate 4 content ideas for NimbusOps, a synthetic operations brand. Public trend: teams are joking that every app has an AI copilot button. Build ideas for a 6-week content calendar for agency operators using only public trend context and synthetic brand facts.',
    brandContext:
      'Brand voice: calm, operational, dry humor, useful. Audience: agencies and ops leads. Use only public trend context and synthetic brand facts.',
    expected: {
      requiredTerms: ['trend', 'calendar', 'agency'],
      forbiddenTerms: ['Brand Vault', 'voiceFingerprint', 'private client'],
      preferredPlatforms: ['LinkedIn', 'Newsletter', 'Blog', 'Twitter/X', 'Instagram'],
    },
  },
  {
    id: 'ideas_film_house_series',
    name: 'Ideas agent: film-house production series',
    prompt:
      'Generate 4 content ideas for StudioPilot, a film-house workflow brand. The campaign should help small production teams turn scripts into shootable videos with camera, lighting, and room constraints.',
    brandContext:
      'Brand voice: production-literate, precise, calm. Audience: film houses, creator studios, and content teams. Avoid: viral guarantee, cinematic masterpiece.',
    expected: {
      requiredTerms: ['camera', 'lighting'],
      forbiddenTerms: ['viral guarantee', 'cinematic masterpiece'],
      preferredPlatforms: ['LinkedIn', 'YouTube', 'Instagram', 'Newsletter'],
    },
  },
];

const LEGACY_IDEAS_CASES: LegacyIdeasCase[] = [
  {
    id: 'legacy_ideas_1_post_for_brand',
    name: 'Legacy ideas: Post for brand without platform',
    prompt: 'Create a post for insturix.com targeting creators who want to automate video editing',
    expectedIntent: 'post',
    criteria: {
      platformsAreText: true,
      formatsAreText: true,
      allPlatformsValid: true,
      ideasAreDiverse: true,
      titlesAreSpecific: true,
    },
  },
  {
    id: 'legacy_ideas_2_linkedin_explicit',
    name: 'Legacy ideas: LinkedIn post explicitly',
    prompt: 'Write a LinkedIn post about why most startups fail at hiring their first 10 employees',
    expectedIntent: 'post',
    criteria: {
      platformsAreText: true,
      formatsAreText: true,
      allPlatformsValid: true,
      titlesAreSpecific: true,
    },
  },
  {
    id: 'legacy_ideas_3_tiktok_explicit',
    name: 'Legacy ideas: TikTok video explicitly',
    prompt: 'Make a TikTok video about common gym mistakes beginners make',
    expectedIntent: 'video',
    criteria: {
      platformsAreVideo: true,
      formatsAreVideo: true,
      allPlatformsValid: true,
      titlesAreSpecific: true,
    },
  },
  {
    id: 'legacy_ideas_4_generic_content',
    name: 'Legacy ideas: Generic content without format hint',
    prompt: 'Content about the future of remote work for a tech startup audience',
    expectedIntent: 'any',
    criteria: {
      allPlatformsValid: true,
      ideasAreDiverse: true,
      titlesAreSpecific: true,
    },
  },
  {
    id: 'legacy_ideas_5_blog_article',
    name: 'Legacy ideas: Blog article request',
    prompt: 'Write a blog article about how AI is changing content creation in 2026',
    expectedIntent: 'post',
    criteria: {
      platformsAreText: true,
      formatsAreText: true,
      allPlatformsValid: true,
      titlesAreSpecific: true,
    },
  },
  {
    id: 'legacy_ideas_6_youtube_explainer',
    name: 'Legacy ideas: YouTube explainer request',
    prompt: 'Create a YouTube explainer about how compound interest actually works with real numbers',
    expectedIntent: 'video',
    criteria: {
      platformsAreVideo: true,
      formatsAreVideo: true,
      allPlatformsValid: true,
      titlesAreSpecific: true,
    },
  },
];

const SIDECAR_CASES: SidecarCase[] = [
  {
    id: 'sidecar_instagram_product_visual',
    name: 'Clickatron sidecar: Instagram product visual',
    documentType: 'post',
    projectSummary: 'GlowNaturals is a clean skincare brand launching a vitamin C serum.',
    systemBrief:
      'Brand DNA: warm, ingredient-aware, sensory, transparent. Audience: women 25-40 who care about ingredients and sustainability. Never use visible text: miracle, chemical-free.',
    userPrompt:
      'Write an Instagram caption and Clickatron-ready text + image post for our new vitamin C serum launch photo. The product is a gold bottle on marble with orange slices. Keep visual text short and never say miracle.',
    project: {
      projectName: 'Vitamin C Serum Launch',
      platform: 'Instagram',
      format: 'post',
      purpose: 'product launch',
      tone: 'warm expert',
      brandId: 'brand_glow',
    },
    brandId: 'brand_glow',
    sessionId: 'tf_eval_instagram_1',
    retrievedContext: {
      brandDNA: {
        voiceLock: 'warm, ingredient-aware, sensory, transparent',
        nicheMap: 'clean skincare buyers',
        killList: ['miracle', 'chemical-free'],
        hookArchetypes: ['sensory product hook'],
        structuralHabits: ['short caption, ingredient proof, soft CTA'],
      },
      projectFacts: [
        {
          id: 'fact_serum_1',
          title: 'Formula proof',
          summary: 'The serum uses 10% stabilized vitamin C and refillable glass packaging.',
          tags: ['product', 'sustainability'],
        },
      ],
      globalFacts: [],
      semanticFacts: [],
      interactionPatterns: [],
    },
    outline: {
      title: 'Vitamin C Launch Caption',
      sections: [
        { id: 'S1', title: 'Sensory Hook', goal: 'Open with the product moment.', beat: 'Hook', level: 'act' },
        { id: 'S2', title: 'Ingredient Proof', goal: 'Ground the claim in the formula and packaging.', beat: 'Solution', level: 'act' },
        { id: 'S3', title: 'Soft CTA', goal: 'Invite saves or comments without hype.', beat: 'CTA', level: 'act' },
      ],
    },
    contract: {
      generation_mode: 'manual',
      narrator_voice: 'strategist',
      medium: 'visual_manual',
      tone: 'warm',
      forbidden: ['miracle', 'chemical-free', 'generic beauty hype'],
      allowed_metaphors: ['morning light', 'fresh citrus'],
      style_notes: ['caption-first', 'specific ingredients', 'short visual text'],
      metaphor_reuse_limit: 1,
      mode_a_usage: 'opening only',
      mode_b_usage: 'default direct copywriting voice',
      mode_switch_rules: 'stay direct after the opener',
    },
    expected: {
      kind: 'single_post_visual',
      assetIntent: 'post_graphic',
      platform: 'instagram',
      aspectRatio: '4:5',
      textPolicy: 'editable_text_layers',
      minTextLayers: 1,
      requiredClaims: ['10%', 'refillable'],
      brandVoiceTerms: ['warm', 'ingredient', 'transparent'],
      forbiddenVisibleTerms: ['miracle', 'chemical-free'],
      forbiddenUnsupportedTerms: [
        'l-ascorbic',
        'pH',
        'ferulic',
        'peptides',
        'gentle enough',
        'daily use',
        'dropper',
        'scent',
        'orange zest',
        'moisturizer',
        'oxidize',
        'two weeks',
        'refill cartridge',
        'bright skin',
      ],
    },
  },
  {
    id: 'sidecar_linkedin_carousel',
    name: 'Clickatron sidecar: LinkedIn agency carousel',
    documentType: 'post',
    projectSummary: 'ApprovalOps helps creative agencies reduce content approval delays.',
    systemBrief:
      'Brand DNA: warm expert, plainspoken, operational. Audience: agency founders and creative directors. Never use visible text: game-changing.',
    userPrompt:
      'Create a LinkedIn carousel post for agency founders about reducing content approval time by 37%. Make it Clickatron-ready with 5 static slides and editable text layers. Never use game-changing.',
    project: {
      projectName: 'ApprovalOps Carousel',
      platform: 'LinkedIn',
      format: 'carousel post',
      purpose: 'educate agency founders',
      tone: 'warm expert',
      brandId: 'brand_approval_ops',
    },
    brandId: 'brand_approval_ops',
    sessionId: 'tf_eval_linkedin_1',
    retrievedContext: {
      brandDNA: {
        voiceLock: 'warm, expert, plainspoken',
        nicheMap: 'B2B agencies and creative operators',
        killList: ['game-changing'],
        hookArchetypes: ['contrarian opener', 'metric-led opener'],
        structuralHabits: ['metric, lesson, practical CTA'],
      },
      projectFacts: [
        {
          id: 'fact_approval_1',
          title: 'Approval benchmark',
          summary: 'Naming one approval owner can reduce approval time by 37%.',
          tags: ['approval', 'workflow'],
        },
      ],
      globalFacts: [],
      semanticFacts: [],
      interactionPatterns: [],
    },
    outline: {
      title: 'Approval Time Carousel',
      sections: [
        { id: 'S1', title: 'Metric Hook', goal: 'Lead with the 37% approval-time claim.', beat: 'Hook', level: 'act' },
        { id: 'S2', title: 'Root Cause', goal: 'Explain why approvals stall.', beat: 'Problem', level: 'act' },
        { id: 'S3', title: 'Fix Steps', goal: 'Give agency founders a simple operating fix.', beat: 'Solution', level: 'act' },
        { id: 'S4', title: 'CTA', goal: 'Invite a concrete reply.', beat: 'CTA', level: 'act' },
      ],
    },
    contract: {
      generation_mode: 'manual',
      narrator_voice: 'strategist',
      medium: 'slide_narration',
      tone: 'practical',
      forbidden: ['game-changing', 'vague transformation claims'],
      allowed_metaphors: ['traffic jam', 'handoff map'],
      style_notes: ['carousel-ready', 'specific workflow language', 'no hype'],
      metaphor_reuse_limit: 1,
      mode_a_usage: 'opening only',
      mode_b_usage: 'default operational voice',
      mode_switch_rules: 'stay practical and direct',
    },
    expected: {
      kind: 'carousel',
      assetIntent: 'carousel',
      platform: 'linkedin',
      aspectRatio: '1.91:1',
      textPolicy: 'editable_text_layers',
      minTextLayers: 1,
      minSlides: 5,
      requiredClaims: ['37%'],
      brandVoiceTerms: ['approval', 'agency', 'workflow'],
      forbiddenVisibleTerms: ['game-changing'],
    },
  },
  {
    id: 'sidecar_instagram_public_trend',
    name: 'Clickatron sidecar: Instagram public trend static post',
    documentType: 'post',
    projectSummary:
      'NimbusOps helps agency operators turn public workplace trends into practical planning rituals.',
    systemBrief:
      'Brand DNA: calm, operational, dry humor, useful. Audience: agency operators. Never use visible text: private client, Brand Vault.',
    userPrompt:
      'Write an Instagram caption and Clickatron-ready text + image post that repurposes this public trend: every app now has an AI copilot button. Angle it toward a Monday focus ritual for agencies. Include calendar metadata in the hidden JSON: campaignId trend_ai_copilot_june, calendarItemId item_monday_focus, seriesId series_public_trends. Never mention private client or Brand Vault.',
    project: {
      projectName: 'Public Trend Monday Focus',
      platform: 'Instagram',
      format: 'post',
      purpose: 'repurpose a public trend for a content calendar',
      tone: 'calm dry humor',
      brandId: 'brand_nimbus_ops',
    },
    brandId: 'brand_nimbus_ops',
    sessionId: 'tf_eval_trend_1',
    retrievedContext: {
      brandDNA: {
        voiceLock: 'calm, operational, dry humor, useful',
        nicheMap: 'agency operators and content teams',
        killList: ['private client', 'Brand Vault'],
        hookArchetypes: ['public trend hook', 'calendar hook'],
        structuralHabits: ['trend context, operational lesson, compact CTA'],
      },
      projectFacts: [
        {
          id: 'fact_public_trend_1',
          title: 'Public trend inbox',
          summary: 'Teams are joking that every app now has an AI copilot button.',
          tags: ['public trend', 'AI copilot'],
        },
        {
          id: 'fact_calendar_1',
          title: 'Calendar placement',
          summary: 'Schedule as the Monday focus item in the public trends series.',
          tags: ['calendar', 'series'],
        },
      ],
      globalFacts: [],
      semanticFacts: [],
      interactionPatterns: [],
    },
    outline: {
      title: 'Monday Focus Trend Post',
      sections: [
        { id: 'S1', title: 'Trend Hook', goal: 'Name the public trend without private data.', beat: 'Hook', level: 'act' },
        { id: 'S2', title: 'Operational Reframe', goal: 'Turn the meme into a useful agency planning point.', beat: 'Bridge', level: 'act' },
        { id: 'S3', title: 'CTA', goal: 'Invite a save or reply.', beat: 'CTA', level: 'act' },
      ],
    },
    contract: {
      generation_mode: 'manual',
      narrator_voice: 'operator',
      medium: 'visual_manual',
      tone: 'calm dry humor',
      forbidden: ['private client', 'Brand Vault', 'voiceFingerprint'],
      allowed_metaphors: ['button overload', 'Monday reset'],
      style_notes: ['public trend only', 'calendar-ready', 'short visual text'],
      metaphor_reuse_limit: 1,
      mode_a_usage: 'opening only',
      mode_b_usage: 'plain operational voice',
      mode_switch_rules: 'do not imply private trend data',
    },
    expected: {
      kind: 'single_post_visual',
      assetIntent: 'post_graphic',
      platform: 'instagram',
      aspectRatio: '4:5',
      textPolicy: 'editable_text_layers',
      minTextLayers: 1,
      requiredCalendar: {
        campaignId: 'trend_ai_copilot_june',
        calendarItemId: 'item_monday_focus',
        seriesId: 'series_public_trends',
      },
      requiredClaims: ['AI copilot', 'Monday'],
      brandVoiceTerms: ['agency', 'focus', 'calendar'],
      forbiddenVisibleTerms: ['private client', 'Brand Vault'],
    },
  },
  {
    id: 'sidecar_linkedin_calendar_carousel',
    name: 'Clickatron sidecar: LinkedIn calendar campaign carousel',
    documentType: 'post',
    projectSummary:
      'ApprovalOps is building a month-ahead LinkedIn carousel campaign for creative agencies ahead of launch weeks.',
    systemBrief:
      'Brand DNA: calm operator, specific, no hype. Audience: agency founders, creative directors, and account leads. Never use visible text: seamless, game-changing.',
    userPrompt:
      'Create a LinkedIn carousel post for a month-ahead content calendar. Topic: reducing approval delays before launch week by naming one approval owner. Make it Clickatron-ready with 4 static slides, editable text layers, and calendar metadata campaignId approval_calendar_june, contentCardId card_approval_owner, calendarItemId item_launch_week_owner. Never use seamless or game-changing.',
    project: {
      projectName: 'ApprovalOps Calendar Carousel',
      platform: 'LinkedIn',
      format: 'carousel post',
      purpose: 'educate agencies at calendar-planning scale',
      tone: 'calm operator',
      brandId: 'brand_approval_ops',
    },
    brandId: 'brand_approval_ops',
    sessionId: 'tf_eval_calendar_carousel_1',
    retrievedContext: {
      brandDNA: {
        voiceLock: 'calm, operational, specific, no hype',
        nicheMap: 'creative agencies and content operations teams',
        killList: ['seamless', 'game-changing'],
        hookArchetypes: ['calendar hook', 'metric-led opener'],
        structuralHabits: ['calendar context, root cause, owner assignment, CTA'],
      },
      projectFacts: [
        {
          id: 'fact_owner_1',
          title: 'Approval owner',
          summary: 'Naming one approval owner reduces launch-week ambiguity.',
          tags: ['approval', 'calendar'],
        },
        {
          id: 'fact_calendar_2',
          title: 'Month-ahead campaign',
          summary: 'The campaign is planned before launch week as a reusable content card.',
          tags: ['campaign', 'content card'],
        },
      ],
      globalFacts: [],
      semanticFacts: [],
      interactionPatterns: [],
    },
    outline: {
      title: 'Approval Owner Calendar Carousel',
      sections: [
        { id: 'S1', title: 'Calendar Hook', goal: 'Open with the month-ahead planning point.', beat: 'Hook', level: 'act' },
        { id: 'S2', title: 'Bottleneck', goal: 'Explain how approval ambiguity slows launch week.', beat: 'Problem', level: 'act' },
        { id: 'S3', title: 'Owner Fix', goal: 'Show the one-owner operating rule.', beat: 'Solution', level: 'act' },
        { id: 'S4', title: 'CTA', goal: 'Prompt a reply or save.', beat: 'CTA', level: 'act' },
      ],
    },
    contract: {
      generation_mode: 'manual',
      narrator_voice: 'operator',
      medium: 'slide_narration',
      tone: 'calm practical',
      forbidden: ['seamless', 'game-changing', 'vague transformation claims'],
      allowed_metaphors: ['handoff map'],
      style_notes: ['calendar metadata', 'carousel-ready', 'specific workflow language'],
      metaphor_reuse_limit: 1,
      mode_a_usage: 'opening only',
      mode_b_usage: 'default operational voice',
      mode_switch_rules: 'keep each slide concrete',
    },
    expected: {
      kind: 'carousel',
      assetIntent: 'carousel',
      platform: 'linkedin',
      aspectRatio: '1.91:1',
      textPolicy: 'editable_text_layers',
      minTextLayers: 1,
      minSlides: 4,
      requiredCalendar: {
        campaignId: 'approval_calendar_june',
        contentCardId: 'card_approval_owner',
        calendarItemId: 'item_launch_week_owner',
      },
      requiredClaims: ['approval owner'],
      brandVoiceTerms: ['calendar', 'agency', 'launch'],
      forbiddenVisibleTerms: ['seamless', 'game-changing'],
    },
  },
  {
    id: 'sidecar_blog_header_analysis_visual',
    name: 'Clickatron sidecar: blog header with analysis-ready claim',
    documentType: 'post',
    projectSummary:
      'SignalDesk publishes analysis-ready essays for agency leaders about creative operations and client review loops.',
    systemBrief:
      'Brand DNA: analytical, plainspoken, evidence-aware. Audience: agency leaders. Never use visible text: guaranteed ROI, magic framework.',
    userPrompt:
      'Write a short blog intro and Clickatron-ready blog header visual for an article about measuring content review loops before they slow launches. Include the terms analysis-ready and review loop. Use a grounded claim: teams should track revision count before approval time. Never say guaranteed ROI or magic framework.',
    project: {
      projectName: 'Review Loop Analysis Blog',
      platform: 'Blog',
      format: 'blog header',
      purpose: 'prepare content for later Alyzi-style analysis',
      tone: 'analytical plainspoken',
      brandId: 'brand_signaldesk',
    },
    brandId: 'brand_signaldesk',
    sessionId: 'tf_eval_blog_header_1',
    retrievedContext: {
      brandDNA: {
        voiceLock: 'analytical, plainspoken, evidence-aware',
        nicheMap: 'agency leaders and operations analysts',
        killList: ['guaranteed ROI', 'magic framework'],
        hookArchetypes: ['measurement hook', 'analysis hook'],
        structuralHabits: ['define metric, show use, invite analysis'],
      },
      projectFacts: [
        {
          id: 'fact_metric_1',
          title: 'Review-loop metric',
          summary: 'Track revision count before approval time to see where launch friction starts.',
          tags: ['analysis', 'review loop'],
        },
      ],
      globalFacts: [],
      semanticFacts: [],
      interactionPatterns: [],
    },
    outline: {
      title: 'Review Loop Analysis Header',
      sections: [
        { id: 'S1', title: 'Analysis Hook', goal: 'Open with the measurable review-loop issue.', beat: 'Hook', level: 'act' },
        { id: 'S2', title: 'Metric', goal: 'Name the revision-count metric.', beat: 'Solution', level: 'act' },
        { id: 'S3', title: 'CTA', goal: 'Invite later analysis.', beat: 'CTA', level: 'act' },
      ],
    },
    contract: {
      generation_mode: 'manual',
      narrator_voice: 'analyst',
      medium: 'visual_manual',
      tone: 'analytical plainspoken',
      forbidden: ['guaranteed ROI', 'magic framework', 'instant results'],
      allowed_metaphors: ['review loop', 'launch friction'],
      style_notes: ['analysis-ready', 'blog header', 'grounded metrics only'],
      metaphor_reuse_limit: 1,
      mode_a_usage: 'opening only',
      mode_b_usage: 'direct analyst voice',
      mode_switch_rules: 'avoid unsupported performance promises',
    },
    expected: {
      kind: 'single_post_visual',
      assetIntent: 'blog_header',
      platform: 'generic',
      aspectRatio: '1:1',
      textPolicy: 'editable_text_layers',
      minTextLayers: 1,
      requiredClaims: ['revision count', 'approval time'],
      brandVoiceTerms: ['analysis', 'review loop', 'launch'],
      forbiddenVisibleTerms: ['guaranteed ROI', 'magic framework'],
    },
  },
];

const evalCases = buildEvalCases().filter((testCase) => !caseFilter || testCase.id === caseFilter);

if (evalCases.length === 0) {
  console.error(`No eval case matched --case=${caseFilter}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

async function main() {
  if (privacyDryRun) {
    runPrivacyDryRun();
    return;
  }

  console.log('\nThinkForge Provider Comparison Eval');
  console.log('===================================');
  console.log(`Providers: ${providerConfigs.map((config) => `${config.provider}:${config.model}`).join(', ')}`);
  console.log(`Runs per case/provider: ${runs}`);
  console.log(`Temperature: ${temperature}`);
  console.log(`Artifacts: ${artifactRoot ? `${artifactRoot} (${saveAllArtifacts ? 'all runs' : 'failed runs only'})` : 'disabled'}`);
  console.log(`Decision thresholds: avg>=${formatPct(decisionThreshold)} min>=${formatPct(stabilityThreshold)}`);
  console.log('Seed: not claimed; this uses fixed cases + repeated low-temperature runs.\n');

  const records: ProviderRunRecord[] = [];

  for (const testCase of evalCases) {
    console.log(`${'-'.repeat(80)}`);
    console.log(`${testCase.id}: ${testCase.name}`);
    console.log(`${'-'.repeat(80)}`);
    const prompt = testCase.buildPrompt();

    for (const providerConfig of providerConfigs) {
      for (let runIndex = 1; runIndex <= runs; runIndex++) {
        process.stdout.write(`  ${providerConfig.provider} run ${runIndex}/${runs}... `);
        try {
          const modelRun = await runEvalPrompt(providerConfig, prompt);
          const score = testCase.scoreOutput(modelRun.output);
          const record: ProviderRunRecord = {
            caseId: testCase.id,
            caseName: testCase.name,
            area: testCase.area,
            provider: providerConfig.provider,
            model: providerConfig.model,
            runIndex,
            score,
            latencyMs: modelRun.latencyMs,
            usage: modelRun.usage,
            estimatedCostUsd: modelRun.estimatedCostUsd,
            costEstimateNote: modelRun.costEstimateNote,
            privacyAudit: modelRun.privacyAudit,
          };

          const failed = score.checks.filter((check) => !check.pass);
          if (artifactRoot && (failed.length > 0 || saveAllArtifacts)) {
            record.artifactPath = writeRunArtifact(record, modelRun.output);
          }
          records.push(record);

          const failedNames = failed.map((check) => `${check.name}${check.owner ? `[${check.owner}]` : ''}`);
          const usage = modelRun.usage?.totalTokens ? ` tokens=${modelRun.usage.totalTokens}` : ' tokens=n/a';
          const cost = modelRun.estimatedCostUsd !== undefined
            ? ` cost=$${modelRun.estimatedCostUsd.toFixed(6)}`
            : ` cost=${modelRun.costEstimateNote}`;
          const artifact = record.artifactPath ? ` artifact=${record.artifactPath}` : '';
          console.log(
            `${formatPct(score.ratio)} (${score.passed}/${score.total}) ${modelRun.latencyMs}ms${usage}${cost}${
              failedNames.length > 0 ? ` FAILED: ${failedNames.join(', ')}` : ' ok'
            }${artifact}`,
          );

          if (showOutput) {
            console.log(`\n--- OUTPUT ${providerConfig.provider} ${testCase.id} run ${runIndex} ---`);
            console.log(modelRun.output.slice(0, 3000));
            console.log('--- END OUTPUT ---\n');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const record: ProviderRunRecord = {
            caseId: testCase.id,
            caseName: testCase.name,
            area: testCase.area,
            provider: providerConfig.provider,
            model: providerConfig.model,
            runIndex,
            score: emptyFailedScore(message),
            error: message,
          };
          if (artifactRoot) {
            record.artifactPath = writeRunArtifact(record, '');
          }
          records.push(record);
          console.log(`ERROR: ${message}${record.artifactPath ? ` artifact=${record.artifactPath}` : ''}`);
        }
      }
    }
  }

  printScoreboard(records);
  const qualityGateFailed = printQualityGate(records);
  printDecisionGate(records);

  if (jsonOut) {
    const outPath = resolve(process.cwd(), jsonOut);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2));
    console.log(`\nWrote JSON scoreboard: ${outPath}`);
  }

  if (records.some((record) => record.error) || qualityGateFailed) {
    process.exitCode = 1;
  }
}

function runPrivacyDryRun() {
  console.log('\nThinkForge Provider Privacy Dry Run');
  console.log('===================================');
  console.log(`Providers: ${providerConfigs.map((config) => `${config.provider}:${config.model}`).join(', ')}`);
  console.log(`Cases: ${evalCases.length}`);
  console.log('External calls: disabled. This only builds prompts and runs the local privacy gateway.\n');

  const records = buildPrivacyDryRunRecords();
  printPrivacyDryRun(records);

  if (jsonOut) {
    const outPath = resolve(process.cwd(), jsonOut);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2));
    console.log(`\nWrote JSON privacy report: ${outPath}`);
  }

  if (privacyDryRunStrict && records.some((record) => !record.allowed)) {
    process.exitCode = 1;
  }
}

function buildPrivacyDryRunRecords(): ProviderPrivacyDryRunRecord[] {
  const records: ProviderPrivacyDryRunRecord[] = [];

  for (const testCase of evalCases) {
    const prompt = testCase.buildPrompt();
    for (const providerConfig of providerConfigs) {
      const decision = prepareProviderPromptForRoute({
        provider: providerConfig.provider,
        model: providerConfig.model,
        routePurpose: 'eval',
        prompt,
        fieldsSent: ['prompt'],
      });

      records.push({
        caseId: testCase.id,
        caseName: testCase.name,
        area: testCase.area,
        provider: providerConfig.provider,
        model: providerConfig.model,
        allowed: decision.allowed,
        privacyClass: decision.audit.privacyClass,
        blockReason: decision.audit.blockReason,
        redactions: decision.audit.redactions,
        sourcePromptFingerprint: decision.audit.sourcePromptFingerprint,
        sentPromptFingerprint: decision.audit.sentPromptFingerprint,
        sourcePromptLength: decision.audit.sourcePromptLength,
        sentPromptLength: decision.audit.sentPromptLength,
      });
    }
  }

  return records;
}

function printPrivacyDryRun(records: ProviderPrivacyDryRunRecord[]) {
  const byProvider = new Map<EvalProvider, ProviderPrivacyDryRunRecord[]>();
  for (const record of records) {
    const existing = byProvider.get(record.provider) ?? [];
    existing.push(record);
    byProvider.set(record.provider, existing);
  }

  for (const [provider, providerRecords] of byProvider) {
    const allowed = providerRecords.filter((record) => record.allowed).length;
    const blocked = providerRecords.length - allowed;
    console.log(`${provider}: allowed=${allowed} blocked=${blocked}`);
    for (const record of providerRecords) {
      const status = record.allowed ? 'ALLOW' : 'BLOCK';
      const reason = record.blockReason ? ` reason=${record.blockReason}` : '';
      const redactions = record.redactions.length > 0 ? ` redactions=${record.redactions.length}` : '';
      console.log(
        `  ${status} ${record.caseId} class=${record.privacyClass} prompt=${record.sourcePromptLength}${reason}${redactions}`,
      );
    }
  }
}

function buildEvalCases(): EvalCase[] {
  const authorCases: EvalCase[] = AUTHOR_CASES.map((testCase) => ({
    id: testCase.id,
    name: testCase.name,
    area: 'author',
    buildPrompt: () => authorAgent.buildPrompt(testCase.input),
    scoreOutput: (output) => scoreAuthorOutput(output, testCase),
  }));

  const legacyAuthorCases: EvalCase[] = LEGACY_AUTHOR_CASES.map((testCase) => ({
    id: testCase.id,
    name: testCase.name,
    area: 'author',
    buildPrompt: () => buildLegacyAuthorPrompt(testCase),
    scoreOutput: (output) => scoreLegacyAuthorOutput(output, testCase),
  }));

  const ideasCases: EvalCase[] = IDEAS_CASES.map((testCase) => ({
    id: testCase.id,
    name: testCase.name,
    area: 'ideas',
    buildPrompt: () => buildIdeasPrompt(testCase),
    scoreOutput: (output) => scoreIdeasOutput(output, testCase),
  }));

  const legacyIdeasCases: EvalCase[] = LEGACY_IDEAS_CASES.map((testCase) => ({
    id: testCase.id,
    name: testCase.name,
    area: 'ideas',
    buildPrompt: () => buildLegacyIdeasPrompt(testCase),
    scoreOutput: (output) => scoreLegacyIdeasOutput(output, testCase),
  }));

  const sidecarCases: EvalCase[] = SIDECAR_CASES.map((testCase) => ({
    id: testCase.id,
    name: testCase.name,
    area: 'clickatron_sidecar',
    buildPrompt: () => buildSidecarPrompt(testCase),
    scoreOutput: (output) => scoreSidecarOutput(output, testCase),
  }));

  return [...authorCases, ...legacyAuthorCases, ...ideasCases, ...legacyIdeasCases, ...sidecarCases];
}

function buildLegacyAuthorPrompt(testCase: LegacyAuthorCase): string {
  const input: ScriptAuthorInput = {
    context: {
      projectSummary: testCase.projectSummary,
      systemBrief: testCase.systemBrief,
    },
    userPrompt: testCase.userPrompt,
    documentType: testCase.documentType,
  };

  return authorAgent.buildPrompt(input);
}

function buildIdeasPrompt(testCase: IdeasCase): string {
  const prompt = ideasAgent.buildPrompt({
    context: {
      projectSummary: '',
      systemBrief: testCase.brandContext ?? '',
    },
    userPrompt: testCase.prompt,
  });

  return `${prompt}

Return ONLY valid JSON. Do not include markdown fences or commentary.
${IDEA_PLATFORM_CONTRACT}
JSON shape:
{
  "ideas": [
    {
      "id": "idea_1",
      "idea": "Specific title under 120 characters",
      "purpose": "Why this angle matters",
      "style": "Visual or editorial style",
      "format": "Actual deliverable format",
      "platform": "One platform",
      "tone": "white|red|black|yellow|green|blue"
    }
  ]
}`;
}

function buildLegacyIdeasPrompt(testCase: LegacyIdeasCase): string {
  const prompt = ideasAgent.buildPrompt({
    context: {
      projectSummary: '',
      systemBrief: '',
    },
    userPrompt: testCase.prompt,
  });

  return `${prompt}

Return ONLY valid JSON. Do not include markdown fences or commentary.
${IDEA_PLATFORM_CONTRACT}
JSON shape:
{
  "ideas": [
    {
      "id": "idea_1",
      "idea": "Specific title under 120 characters",
      "purpose": "Why this angle matters",
      "style": "Visual or editorial style",
      "format": "Actual deliverable format",
      "platform": "One platform",
      "tone": "white|red|black|yellow|green|blue"
    }
  ]
}`;
}

function buildSidecarPrompt(testCase: SidecarCase): string {
  const baseInput: ScriptAuthorInput = {
    context: {
      projectSummary: testCase.projectSummary,
      systemBrief: testCase.systemBrief,
    },
    project: testCase.project,
    sessionId: testCase.sessionId,
    brandId: testCase.brandId,
    retrievedContext: testCase.retrievedContext,
    userPrompt: testCase.userPrompt,
    documentType: testCase.documentType,
    outline: testCase.outline,
    contract: testCase.contract,
  };

  const profile = resolveContentSignalProfile({
    userPrompt: baseInput.userPrompt,
    project: baseInput.project,
    context: baseInput.context,
    documentType: baseInput.documentType,
    platform: baseInput.project?.platform,
    brandId: baseInput.brandId,
    sessionId: baseInput.sessionId,
    retrievedContext: baseInput.retrievedContext,
  });
  const sidecarInput = appendClickatronCreativeSidecarInstruction(baseInput, profile) as ScriptAuthorInput;

  const promptInput: ScriptAuthorInput = {
    ...sidecarInput,
    documentType: testCase.documentType,
    outline: testCase.outline,
    contract: testCase.contract,
    contentSignalProfile: profile,
  };

  return authorAgent.buildPrompt(promptInput);
}

function scoreLegacyAuthorOutput(output: string, testCase: LegacyAuthorCase): ScoreResult {
  const score = createScore();
  const trimmed = output.trim();
  const lines = output.split('\n');
  const criteria = testCase.criteria;

  if (testCase.expectedFormat === 'video') {
    if (criteria.hasMusicDirection) {
      score.check('output_quality', 'music_direction', /##\s*music\s*direction/i.test(output));
    }
    if (criteria.hasTimingBrackets) {
      const timingMatches = output.match(/##\s*\[\d+:\d+/g);
      score.check(
        'schema_json_validity',
        'timing_brackets',
        Boolean(timingMatches && timingMatches.length >= (criteria.minScenes ?? 3)),
        `timingHeaders=${timingMatches?.length ?? 0}`,
      );
    }

    const sceneHeaders = output.match(/##\s*\[?\d/g) ?? output.match(/##\s*scene\s*\d/gi) ?? [];
    if (criteria.minScenes) {
      score.check('output_quality', 'min_scenes', sceneHeaders.length >= criteria.minScenes, `scenes=${sceneHeaders.length}`);
    }
    if (criteria.maxScenes) {
      score.check('output_quality', 'max_scenes', sceneHeaders.length <= criteria.maxScenes, `scenes=${sceneHeaders.length}`);
    }

    if (criteria.elementsPerScene) {
      for (const element of criteria.elementsPerScene) {
        const matches = output.match(new RegExp(`\\*\\*${element}[^*]*\\*\\*`, 'gi')) ?? [];
        score.check('schema_json_validity', `element_${element.toLowerCase()}`, matches.length >= 1, `matches=${matches.length}`);
      }
    }

    if (criteria.visualsAreActions) {
      const visualLines = lines.filter((line) => /\*\*Visual/i.test(line));
      const feelingWords = /\b(feels?|looks?|seems?|appears?)\s+(worried|happy|sad|anxious|overwhelmed|excited)\b/i;
      score.check('output_quality', 'visuals_are_actions', !visualLines.some((line) => feelingWords.test(line)));
    }

    if (criteria.hasMoodReferences) {
      const moodLines = lines.filter((line) => /\*\*Mood/i.test(line));
      score.check('output_quality', 'mood_references', moodLines.length >= 2, `moodLines=${moodLines.length}`);
    }

    if (criteria.hasOnCameraLabel) {
      score.check('schema_json_validity', 'has_on_camera', /\*?\*?On[- ]Camera/i.test(output));
    }
  }

  if (testCase.expectedFormat === 'post') {
    if (criteria.noSceneHeadings) {
      score.check('schema_json_validity', 'no_scene_headings', !/##\s*scene\s*\d/i.test(output));
    }
    if (criteria.noVisualLabels) {
      score.check('schema_json_validity', 'no_visual_labels', !/\*\*Visual/i.test(output));
    }
    if (criteria.noVOLabels) {
      score.check('schema_json_validity', 'no_vo_labels', !/\*\*VO\b/i.test(output) && !/\*\*Narration/i.test(output));
    }
    if (criteria.hasHashtags) {
      score.check('output_quality', 'has_hashtags', /#\w+/i.test(output));
    }
    if (criteria.hashtagRange) {
      const hashtags = output.match(/#\w+/g) ?? [];
      score.check(
        'output_quality',
        'hashtag_range',
        hashtags.length >= criteria.hashtagRange[0] && hashtags.length <= criteria.hashtagRange[1],
        `hashtags=${hashtags.length}`,
      );
    }
    if (criteria.hasEmoji) {
      score.check(
        'output_quality',
        'has_emoji',
        /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/u.test(output),
      );
    }
    if (criteria.charRange) {
      score.check(
        'output_quality',
        'char_range',
        trimmed.length >= criteria.charRange[0] && trimmed.length <= criteria.charRange[1],
        `length=${trimmed.length}`,
      );
    }
    if (criteria.hookBeforeFold) {
      const firstLine = lines.find((line) => line.trim().length > 0) ?? '';
      score.check('output_quality', 'hook_before_fold', firstLine.length > 10 && firstLine.length < 250, `length=${firstLine.length}`);
    }
    if (criteria.hasCTA) {
      const nonEmpty = lines.filter((line) => line.trim().length > 0);
      const nonHashtag = nonEmpty.filter((line) => !/^#\w/.test(line.trim()));
      const lastContent = nonHashtag[nonHashtag.length - 1] ?? '';
      score.check('output_quality', 'has_cta', /\?/.test(lastContent) || /share|repost|tag|comment/i.test(lastContent));
    }
  }

  if (criteria.noAiFiller) {
    const fillerFound = AI_FILLER.filter((pattern) => pattern.regex.test(output));
    score.check('output_quality', 'no_ai_filler', fillerFound.length === 0, fillerFound.map((entry) => entry.label).join(', '));
  }

  if (criteria.hasSpecificDetails) {
    const hasNumbers =
      /\d+[-+~\s]*(second|minute|hour|day|week|month|year|%|dollar|\$|x\b)/i.test(output)
      || /\$\d+/.test(output)
      || /\d+[kKmM]\b/.test(output)
      || /\d+\s*[-–]\s*\d+/.test(output);
    const hasNames =
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(output)
      || /\b(MacBook|Chrome|Slack|iPhone)\b/.test(output)
      || /[A-Z][a-z]+[A-Z]/.test(output);
    score.check('output_quality', 'has_specific_details', hasNumbers || hasNames);
  }

  score.check('schema_json_validity', 'no_h1_title', !trimmed.startsWith('# '));

  return score.result();
}

function scoreAuthorOutput(output: string, testCase: AuthorCase): ScoreResult {
  const score = createScore();
  const trimmed = output.trim();
  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] ?? '';
  const lastContent = [...lines].reverse().find((line) => !line.startsWith('#')) ?? '';
  const fillerFound = AI_FILLER.filter((pattern) => pattern.regex.test(trimmed));

  score.check('output_quality', 'output_present', trimmed.length >= testCase.expected.minLength, `length=${trimmed.length}`);
  score.check('output_quality', 'output_not_too_long', trimmed.length <= testCase.expected.maxLength, `length=${trimmed.length}`);
  score.check('output_quality', 'no_ai_filler', fillerFound.length === 0, fillerFound.map((entry) => entry.label).join(', '));
  score.check('forbidden_term_obedience', 'forbidden_terms_absent', findTerms(trimmed, testCase.expected.forbiddenTerms).length === 0);
  score.check(
    'brand_voice_match',
    'required_terms_present',
    testCase.expected.requiredTerms.every((term) => containsTerm(trimmed, term)),
    missingTerms(trimmed, testCase.expected.requiredTerms).join(', '),
  );
  score.check(
    'brand_voice_match',
    'brand_voice_markers_present',
    atLeastTerms(trimmed, testCase.expected.brandVoiceTerms, 2),
    missingTerms(trimmed, testCase.expected.brandVoiceTerms).join(', '),
  );

  if (testCase.expected.format === 'post') {
    score.check('output_quality', 'post_has_hook_before_fold', firstLine.length >= 10 && firstLine.length <= 220);
    score.check('output_quality', 'post_has_cta', /\?/.test(lastContent) || /\b(comment|reply|save|share|send)\b/i.test(lastContent));
    score.check('schema_json_validity', 'no_script_labels_in_post', !/\*\*(VO|Visual|Audio|Mood|Transition)\b/i.test(trimmed));
  } else {
    const sceneCount = (trimmed.match(/##\s*(scene|\[\d|[0-9])/gi) ?? []).length;
    score.check('output_quality', 'script_has_multiple_beats', sceneCount >= 3, `scenes=${sceneCount}`);
    score.check('output_quality', 'script_has_visual_direction', /\*\*Visual/i.test(trimmed));
    score.check('output_quality', 'script_has_audio_or_mood_direction', /\*\*(Audio|Mood|Music)/i.test(trimmed));
    score.check('schema_json_validity', 'script_not_json_or_sidecar_only', !trimmed.startsWith('{') && !/THINKFORGE_CLICKATRON_EXPORT/i.test(trimmed));
  }

  return score.result();
}

function scoreLegacyIdeasOutput(output: string, testCase: LegacyIdeasCase): ScoreResult {
  const score = createScore();
  const parsed = extractJsonObject<IdeasResult>(output);
  const ideas = parsed?.ideas ?? [];
  const normalizedPlatforms = ideas.map((idea) => normalizeIdeaPlatform(idea.platform));
  const platformDetail = ideas
    .map((idea, index) => `${idea.platform ?? 'missing'}=>${normalizedPlatforms[index] ?? 'invalid'}`)
    .join(', ');

  score.check('schema_json_validity', 'valid_json_object', Boolean(parsed));
  score.check('schema_json_validity', 'returns_four_ideas', ideas.length === 4, `ideas=${ideas.length}`);

  if (testCase.criteria.allPlatformsValid) {
    score.check(
      'schema_json_validity',
      'all_platforms_valid',
      normalizedPlatforms.length > 0
        && normalizedPlatforms.every((platform) => Boolean(platform && LEGACY_VALID_IDEA_PLATFORMS.has(platform))),
      platformDetail,
    );
  }

  if (testCase.criteria.platformsAreText) {
    const textCount = normalizedPlatforms.filter((platform) => Boolean(platform && TEXT_IDEA_PLATFORMS.has(platform))).length;
    score.check('brand_voice_match', 'platforms_are_text', textCount >= 3, platformDetail);
  }

  if (testCase.criteria.platformsAreVideo) {
    const videoCount = normalizedPlatforms.filter((platform) => Boolean(platform && VIDEO_IDEA_PLATFORMS.has(platform))).length;
    score.check('brand_voice_match', 'platforms_are_video', videoCount >= 3, platformDetail);
  }

  if (testCase.criteria.formatsAreText) {
    const textFormats = ideas.filter((idea) => TEXT_FORMAT_WORDS.test(idea.format ?? '') && !VIDEO_FORMAT_WORDS.test(idea.format ?? '')).length;
    score.check('output_quality', 'formats_are_text', textFormats >= 3, ideas.map((idea) => idea.format ?? 'missing').join(', '));
  }

  if (testCase.criteria.formatsAreVideo) {
    const videoFormats = ideas.filter((idea) => VIDEO_FORMAT_WORDS.test(idea.format ?? '')).length;
    score.check('output_quality', 'formats_are_video', videoFormats >= 3, ideas.map((idea) => idea.format ?? 'missing').join(', '));
  }

  if (testCase.criteria.ideasAreDiverse) {
    const tones = new Set(ideas.map((idea) => idea.tone).filter(Boolean));
    score.check('output_quality', 'ideas_diverse', tones.size >= 3, `tones=${Array.from(tones).join(', ')}`);
  }

  if (testCase.criteria.titlesAreSpecific) {
    const specific = ideas.filter((idea) => {
      const title = idea.idea ?? '';
      return title.length > 20 && title.length <= 200;
    }).length;
    score.check('output_quality', 'titles_specific', specific >= 3, `specific=${specific}`);
  }

  return score.result();
}

function scoreIdeasOutput(output: string, testCase: IdeasCase): ScoreResult {
  const score = createScore();
  const parsed = extractJsonObject<IdeasResult>(output);
  const ideas = parsed?.ideas ?? [];
  const normalizedPlatforms = ideas.map((idea) => ({
    raw: idea.platform,
    normalized: normalizeIdeaPlatform(idea.platform),
  }));
  const platformDetail = normalizedPlatforms
    .map((entry) => `${entry.raw ?? 'missing'}=>${entry.normalized ?? 'invalid'}`)
    .join(', ');

  score.check('schema_json_validity', 'valid_json_object', Boolean(parsed));
  score.check('schema_json_validity', 'returns_four_ideas', ideas.length === 4, `ideas=${ideas.length}`);
  score.check(
    'schema_json_validity',
    'idea_fields_present',
    ideas.every((idea) => Boolean(idea.id && idea.idea && idea.purpose && idea.style && idea.format && idea.platform && idea.tone)),
  );
  score.check(
    'schema_json_validity',
    'platforms_valid',
    normalizedPlatforms.length > 0
      && normalizedPlatforms.every((entry) => Boolean(entry.normalized && VALID_IDEA_PLATFORMS.has(entry.normalized))),
    platformDetail,
  );

  const combined = JSON.stringify(parsed ?? output);
  score.check('output_quality', 'ideas_are_specific', ideas.filter((idea) => (idea.idea ?? '').length >= 20).length >= 3);
  score.check(
    'output_quality',
    'formats_are_actionable',
    ideas.filter((idea) => ACTIONABLE_IDEA_FORMAT_WORDS.test(idea.format ?? '')).length >= 3,
  );
  score.check('forbidden_term_obedience', 'forbidden_terms_absent', findTerms(combined, testCase.expected.forbiddenTerms).length === 0);
  score.check(
    'brand_voice_match',
    'brand_terms_present',
    testCase.expected.requiredTerms.every((term) => containsTerm(combined, term)),
    missingTerms(combined, testCase.expected.requiredTerms).join(', '),
  );
  score.check(
    'brand_voice_match',
    'preferred_platform_fit',
    normalizedPlatforms.filter((entry) => Boolean(entry.normalized && testCase.expected.preferredPlatforms.includes(entry.normalized))).length >= 2,
    platformDetail,
  );

  return score.result();
}

function scoreSidecarOutput(output: string, testCase: SidecarCase): ScoreResult {
  const score = createScore();
  const visible = stripClickatronCreativeSidecarText(output).trim();
  const baseInput: ScriptAuthorInput = {
    context: {
      projectSummary: testCase.projectSummary,
      systemBrief: testCase.systemBrief,
    },
    project: testCase.project,
    sessionId: testCase.sessionId,
    brandId: testCase.brandId,
    retrievedContext: testCase.retrievedContext,
    userPrompt: testCase.userPrompt,
    documentType: testCase.documentType,
  };
  const profile = resolveContentSignalProfile({
    userPrompt: baseInput.userPrompt,
    project: baseInput.project,
    context: baseInput.context,
    documentType: baseInput.documentType,
    platform: baseInput.project?.platform,
    brandId: baseInput.brandId,
    sessionId: baseInput.sessionId,
    retrievedContext: baseInput.retrievedContext,
  });

  let exportMeta: ThinkForgeBlockExportMeta | undefined;
  let extractionError: string | undefined;
  try {
    const extracted = extractRequiredClickatronCreativeSidecar(output);
    exportMeta = applyContentSignalProfileToClickatronExportMeta(extracted.exportMeta, baseInput, profile);
  } catch (error) {
    extractionError = error instanceof Error ? error.message : String(error);
  }

  scoreVisibleCopy(visible, testCase, score);
  scoreSidecar(exportMeta, extractionError, testCase, profile, score);
  return score.result();
}

function scoreVisibleCopy(visible: string, testCase: SidecarCase, score: ReturnType<typeof createScore>) {
  const lines = visible.split('\n').map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] ?? '';
  const lastContent = [...lines].reverse().find((line) => !line.startsWith('#')) ?? '';
  const fillerFound = AI_FILLER.filter((pattern) => pattern.regex.test(visible));
  const unsupportedTerms = findTerms(visible, testCase.expected.forbiddenUnsupportedTerms ?? []);

  score.check('output_quality', 'visible_copy_present', visible.length >= 120, `length=${visible.length}`);
  score.check('output_quality', 'visible_copy_has_hook', firstLine.length >= 10 && firstLine.length <= 220);
  score.check('output_quality', 'visible_copy_has_cta', /\?/.test(lastContent) || /\b(comment|reply|save|share|tag|send)\b/i.test(lastContent));
  score.check('output_quality', 'no_ai_filler', fillerFound.length === 0, fillerFound.map((entry) => entry.label).join(', '));
  score.check('schema_json_validity', 'no_sidecar_leak_in_visible_copy', !/THINKFORGE_CLICKATRON_EXPORT|clickatron_resolved_profile/i.test(visible));
  score.check('forbidden_term_obedience', 'forbidden_visible_terms_absent', !containsAny(visible, testCase.expected.forbiddenVisibleTerms));
  score.check('forbidden_term_obedience', 'unsupported_claim_terms_absent', unsupportedTerms.length === 0, unsupportedTerms.join(', '));
  score.check(
    'brand_voice_match',
    'required_claims_in_visible_copy',
    testCase.expected.requiredClaims.every((claim) => containsTerm(visible, claim)),
    missingTerms(visible, testCase.expected.requiredClaims).join(', '),
  );
}

function scoreSidecar(
  exportMeta: ThinkForgeBlockExportMeta | undefined,
  extractionError: string | undefined,
  testCase: SidecarCase,
  profile: ThinkForgeContentSignalProfile,
  score: ReturnType<typeof createScore>,
) {
  const spec = exportMeta?.clickatron;
  score.check('schema_json_validity', 'sidecar_present_and_parsed', Boolean(spec), extractionError);
  if (!spec) {
    addMissingSidecarChecks(score, testCase, extractionError);
    return;
  }

  const layerTexts = textLayerStrings(spec);
  const combinedLayerText = layerTexts.join(' ');
  const serialized = JSON.stringify(spec);
  const unsupportedTerms = findTerms(serialized, testCase.expected.forbiddenUnsupportedTerms ?? []);
  const slideCount = spec.renderPlan.slides?.length ?? 0;

  score.check('clickatron_sidecar_completeness', 'schema_version_1', spec.schemaVersion === 1);
  score.check('clickatron_sidecar_completeness', 'kind_matches_expected', spec.kind === testCase.expected.kind, `kind=${spec.kind}`);
  score.check(
    'clickatron_sidecar_completeness',
    'asset_intent_matches_expected',
    spec.assetIntent === testCase.expected.assetIntent,
    `assetIntent=${spec.assetIntent}`,
  );
  score.check('clickatron_sidecar_completeness', 'platform_matches_expected', spec.platform === testCase.expected.platform, `platform=${spec.platform}`);
  score.check(
    'clickatron_sidecar_completeness',
    'aspect_ratio_matches_expected',
    spec.aspectRatio === testCase.expected.aspectRatio
      && (!resolvedProfileAspectRatio(profile) || resolvedProfileAspectRatio(profile) === testCase.expected.aspectRatio),
    `aspectRatio=${spec.aspectRatio} profile=${resolvedProfileAspectRatio(profile) ?? 'missing'}`,
  );
  score.check(
    'clickatron_sidecar_completeness',
    'text_policy_matches_expected',
    spec.renderPlan.textPolicy === testCase.expected.textPolicy,
    `textPolicy=${spec.renderPlan.textPolicy}`,
  );
  score.check('clickatron_sidecar_completeness', 'image_prompt_specific', words(spec.renderPlan.imagePrompt).length >= 14);
  score.check('clickatron_sidecar_completeness', 'text_layers_present', layerTexts.length >= (testCase.expected.minTextLayers ?? 0), `layers=${layerTexts.length}`);
  score.check('clickatron_sidecar_completeness', 'brand_id_preserved', spec.brand?.brandId === testCase.brandId, `brandId=${spec.brand?.brandId ?? 'missing'}`);
  score.check(
    'clickatron_sidecar_completeness',
    'required_claims_preserved',
    testCase.expected.requiredClaims.every((claim) => containsTerm(serialized, claim)),
    missingTerms(serialized, testCase.expected.requiredClaims).join(', '),
  );
  if (testCase.expected.requiredCalendar) {
    for (const [field, expectedValue] of Object.entries(testCase.expected.requiredCalendar)) {
      score.check(
        'clickatron_sidecar_completeness',
        `calendar_${field}_preserved`,
        spec.calendar?.[field as keyof NonNullable<ClickatronCreativeSpec['calendar']>] === expectedValue,
        `${field}=${spec.calendar?.[field as keyof NonNullable<ClickatronCreativeSpec['calendar']>] ?? 'missing'}`,
      );
    }
  }
  score.check(
    'brand_voice_match',
    'brand_constraints_preserved',
    containsAny(spec.brand?.hardConstraints?.join(' ') ?? '', testCase.expected.forbiddenVisibleTerms),
  );
  score.check(
    'brand_voice_match',
    'brand_voice_terms_present',
    atLeastTerms(serialized, testCase.expected.brandVoiceTerms, Math.min(2, testCase.expected.brandVoiceTerms.length)),
    missingTerms(serialized, testCase.expected.brandVoiceTerms).join(', '),
  );
  score.check('forbidden_term_obedience', 'forbidden_terms_absent_from_text_layers', !containsAny(combinedLayerText, testCase.expected.forbiddenVisibleTerms));
  score.check('forbidden_term_obedience', 'unsupported_terms_absent_from_sidecar', unsupportedTerms.length === 0, unsupportedTerms.join(', '));

  if (testCase.expected.minSlides !== undefined) {
    score.check('clickatron_sidecar_completeness', 'carousel_slide_count', slideCount >= testCase.expected.minSlides, `slides=${slideCount}`);
    score.check(
      'clickatron_sidecar_completeness',
      'carousel_slides_have_prompts',
      spec.renderPlan.slides?.every((slide) => words(slide.imagePrompt).length >= 8) ?? false,
    );
  }
}

function addMissingSidecarChecks(
  score: ReturnType<typeof createScore>,
  testCase: SidecarCase,
  extractionError: string | undefined,
) {
  const detail = extractionError ?? 'missing Clickatron creative sidecar';
  const requiredChecks: Array<[ScoreCategory, string]> = [
    ['schema_json_validity', 'sidecar_json_required'],
    ['clickatron_sidecar_completeness', 'schema_version_1'],
    ['clickatron_sidecar_completeness', 'kind_matches_expected'],
    ['clickatron_sidecar_completeness', 'asset_intent_matches_expected'],
    ['clickatron_sidecar_completeness', 'platform_matches_expected'],
    ['clickatron_sidecar_completeness', 'aspect_ratio_matches_expected'],
    ['clickatron_sidecar_completeness', 'text_policy_matches_expected'],
    ['clickatron_sidecar_completeness', 'image_prompt_specific'],
    ['clickatron_sidecar_completeness', 'text_layers_present'],
    ['clickatron_sidecar_completeness', 'brand_id_preserved'],
    ['clickatron_sidecar_completeness', 'required_claims_preserved'],
    ['brand_voice_match', 'brand_constraints_preserved'],
  ];

  if (testCase.expected.minSlides !== undefined) {
    requiredChecks.push(
      ['clickatron_sidecar_completeness', 'carousel_slide_count'],
      ['clickatron_sidecar_completeness', 'carousel_slides_have_prompts'],
    );
  }

  for (const [category, name] of requiredChecks) {
    score.check(category, name, false, detail);
  }
}

function createScore() {
  const checks: CheckResult[] = [];

  return {
    check(category: ScoreCategory, name: string, pass: boolean, detail?: string) {
      checks.push({
        category,
        name,
        pass,
        detail: pass ? undefined : detail,
      });
    },
    result(): ScoreResult {
      const classifiedChecks = checks.map((check) => (
        check.pass ? check : { ...check, ...classifyFailure(check) }
      ));
      const total = classifiedChecks.length;
      const passed = classifiedChecks.filter((check) => check.pass).length;
      const categoryRatios: Partial<Record<ScoreCategory, number>> = {};

      for (const category of CATEGORIES) {
        const categoryChecks = classifiedChecks.filter((check) => check.category === category);
        if (categoryChecks.length > 0) {
          categoryRatios[category] = categoryChecks.filter((check) => check.pass).length / categoryChecks.length;
        }
      }

      return {
        passed,
        total,
        ratio: total > 0 ? passed / total : 0,
        checks: classifiedChecks,
        categoryRatios,
        failureModes: classifiedChecks
          .filter((check) => !check.pass)
          .map((check) => `${check.category}:${check.name}:${check.owner ?? 'unclassified'}`),
      };
    },
  };
}

function classifyFailure(check: CheckResult): Pick<CheckResult, 'owner' | 'severity'> {
  if (check.name === 'provider_call_succeeded') {
    return { owner: 'provider_issue', severity: 'critical' };
  }

  if (
    check.category === 'schema_json_validity'
    && (check.name === 'sidecar_present_and_parsed' || check.name === 'sidecar_json_required')
  ) {
    return { owner: 'prompt_contract_issue', severity: 'critical' };
  }

  if (check.category === 'clickatron_sidecar_completeness') {
    return { owner: 'prompt_contract_issue', severity: 'major' };
  }

  if (check.category === 'forbidden_term_obedience') {
    return { owner: 'model_issue', severity: 'critical' };
  }

  if (check.category === 'brand_voice_match') {
    return { owner: 'model_issue', severity: 'major' };
  }

  if (check.category === 'schema_json_validity' && check.name === 'platforms_valid') {
    return { owner: 'prompt_contract_issue', severity: 'major' };
  }

  if (check.category === 'schema_json_validity') {
    return { owner: 'prompt_contract_issue', severity: 'major' };
  }

  if (check.name === 'output_not_too_long') {
    return { owner: 'prompt_contract_issue', severity: 'major' };
  }

  if (check.name === 'no_ai_filler') {
    return { owner: 'model_issue', severity: 'minor' };
  }

  return { owner: 'model_issue', severity: 'major' };
}

function emptyFailedScore(message: string): ScoreResult {
  return {
    passed: 0,
    total: 1,
    ratio: 0,
    checks: [{
      category: 'output_quality',
      name: 'provider_call_succeeded',
      pass: false,
      detail: message,
      owner: 'provider_issue',
      severity: 'critical',
    }],
    categoryRatios: { output_quality: 0 },
    failureModes: ['provider_error:provider_issue'],
  };
}

function printScoreboard(records: ProviderRunRecord[]) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Scoreboard');
  console.log(`${'='.repeat(80)}`);

  const groups = groupRecords(records);
  for (const [key, group] of groups) {
    const [caseId, provider] = key.split('|');
    const successful = group.filter((record) => !record.error);
    const avgScore = average(group.map((record) => record.score.ratio));
    const minScore = Math.min(...group.map((record) => record.score.ratio));
    const avgLatency = average(successful.map((record) => record.latencyMs ?? 0));
    const estimatedCost = sum(successful.map((record) => record.estimatedCostUsd ?? 0));
    const costKnown = successful.some((record) => record.estimatedCostUsd !== undefined);
    const failures = topFailures(group);
    const owners = failureOwners(group);

    console.log(
      `${caseId} | ${provider} | avg=${formatPct(avgScore)} min=${formatPct(minScore)} latency=${Math.round(avgLatency)}ms cost=${
        costKnown ? `$${estimatedCost.toFixed(6)}` : 'n/a'
      } failures=${failures || 'none'} owners=${owners || 'none'}`,
    );
    for (const category of CATEGORIES) {
      const ratio = averageCategory(group, category);
      if (ratio !== undefined) {
        console.log(`  ${category}: ${formatPct(ratio)}`);
      }
    }
  }
}

function printQualityGate(records: ProviderRunRecord[]): boolean {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Absolute Quality Gate');
  console.log(`${'='.repeat(80)}`);
  console.log(`Rule: every provider/case group must avg>=${formatPct(decisionThreshold)} and min>=${formatPct(stabilityThreshold)}.\n`);

  let failed = false;
  const groups = groupRecords(records);
  for (const [key, group] of groups) {
    const [caseId, provider] = key.split('|');
    const avgScore = average(group.map((record) => record.score.ratio));
    const minScore = Math.min(...group.map((record) => record.score.ratio));
    const errors = group.filter((record) => record.error).length;
    const reasons = [
      avgScore < decisionThreshold ? `avg<${formatPct(decisionThreshold)}` : undefined,
      minScore < stabilityThreshold ? `min<${formatPct(stabilityThreshold)}` : undefined,
      errors > 0 ? `errors=${errors}` : undefined,
    ].filter(Boolean);
    const status = reasons.length === 0 ? 'PASS' : 'FAIL';
    if (status === 'FAIL') failed = true;
    console.log(
      `${caseId} | ${provider}: ${status} avg=${formatPct(avgScore)} min=${formatPct(minScore)}${
        reasons.length > 0 ? ` reasons=${reasons.join(';')}` : ''
      }`,
    );
  }

  return failed;
}

function printDecisionGate(records: ProviderRunRecord[]) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Decision Gate');
  console.log(`${'='.repeat(80)}`);
  console.log(
    `Rule: non-Gemini providers must avg>=${formatPct(decisionThreshold)}, min>=${formatPct(stabilityThreshold)}, `
    + 'match Gemini quality within 2pp, and avoid category regressions. Cost alone cannot pass.\n',
  );

  const caseIds = Array.from(new Set(records.map((record) => record.caseId)));
  for (const caseId of caseIds) {
    const gemini = records.filter((record) => record.caseId === caseId && record.provider === 'gemini');
    const geminiAvg = gemini.length > 0 ? average(gemini.map((record) => record.score.ratio)) : undefined;
    const geminiErrors = gemini.filter((record) => record.error).length;
    const competitors = Array.from(new Set(records.filter((record) => record.caseId === caseId && record.provider !== 'gemini').map((record) => record.provider)));

    for (const provider of competitors) {
      const challenger = records.filter((record) => record.caseId === caseId && record.provider === provider);
      if (geminiAvg === undefined || gemini.length === 0) {
        console.log(`${caseId} | ${provider}: INSUFFICIENT_BASELINE (no Gemini records)`);
        continue;
      }
      if (geminiErrors > 0) {
        const challengerAvg = average(challenger.map((record) => record.score.ratio));
        const challengerMin = Math.min(...challenger.map((record) => record.score.ratio));
        console.log(
          `${caseId} | ${provider}: INSUFFICIENT_BASELINE challenger=${formatPct(challengerAvg)} min=${formatPct(challengerMin)} `
          + `gemini=${formatPct(geminiAvg)} reasons=gemini_errors=${geminiErrors}`,
        );
        continue;
      }

      const challengerAvg = average(challenger.map((record) => record.score.ratio));
      const challengerMin = Math.min(...challenger.map((record) => record.score.ratio));
      const qualityMatches = challengerAvg + 0.02 >= geminiAvg;
      const categoryRegressions = CATEGORIES.filter((category) => {
        const baseline = averageCategory(gemini, category);
        const candidate = averageCategory(challenger, category);
        return baseline !== undefined && candidate !== undefined && candidate + 0.001 < baseline;
      });
      const errors = challenger.filter((record) => record.error).length;
      const lowQuality = challengerAvg < decisionThreshold;
      const unstable = challengerMin < stabilityThreshold;
      const reasons = [
        qualityMatches ? undefined : 'below_gemini',
        lowQuality ? `low_quality<${formatPct(decisionThreshold)}` : undefined,
        unstable ? `unstable_min<${formatPct(stabilityThreshold)}` : undefined,
        categoryRegressions.length > 0 ? `regressions=${categoryRegressions.join(',')}` : undefined,
        errors > 0 ? `errors=${errors}` : undefined,
      ].filter(Boolean);

      const status = reasons.length === 0 ? 'PASS' : 'FAIL';
      console.log(
        `${caseId} | ${provider}: ${status} challenger=${formatPct(challengerAvg)} min=${formatPct(challengerMin)} gemini=${formatPct(geminiAvg)}${
          reasons.length > 0 ? ` reasons=${reasons.join(';')}` : ''
        }`,
      );
    }
  }
}

function groupRecords(records: ProviderRunRecord[]): Map<string, ProviderRunRecord[]> {
  const groups = new Map<string, ProviderRunRecord[]>();
  for (const record of records) {
    const key = `${record.caseId}|${record.provider}`;
    const current = groups.get(key) ?? [];
    current.push(record);
    groups.set(key, current);
  }
  return groups;
}

function writeRunArtifact(record: ProviderRunRecord, output: string): string {
  if (!artifactRoot) {
    throw new Error('Cannot write eval artifact without artifactRoot');
  }

  const outPath = join(
    artifactRoot,
    `${safeFileSegment(record.caseId)}__${safeFileSegment(record.provider)}__run-${record.runIndex}.json`,
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      caseId: record.caseId,
      caseName: record.caseName,
      area: record.area,
      provider: record.provider,
      model: record.model,
      runIndex: record.runIndex,
      score: record.score,
      latencyMs: record.latencyMs,
      usage: record.usage,
      estimatedCostUsd: record.estimatedCostUsd,
      costEstimateNote: record.costEstimateNote,
      error: record.error,
      output,
    }, null, 2),
  );
  return outPath;
}

function topFailures(records: ProviderRunRecord[]): string {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const mode of record.score.failureModes) {
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => `${name}(${count})`)
    .join(', ');
}

function failureOwners(records: ProviderRunRecord[]): string {
  const counts = new Map<FailureOwner, number>();
  for (const record of records) {
    for (const check of record.score.checks) {
      if (!check.pass && check.owner) {
        counts.set(check.owner, (counts.get(check.owner) ?? 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([owner, count]) => `${owner}(${count})`)
    .join(', ');
}

function averageCategory(records: ProviderRunRecord[], category: ScoreCategory): number | undefined {
  const values = records
    .map((record) => record.score.categoryRatios[category])
    .filter((value): value is number => value !== undefined);
  return values.length > 0 ? average(values) : undefined;
}

function resolvedProfileAspectRatio(profile: ThinkForgeContentSignalProfile): string | undefined {
  const constraints = profile.profile.constraints.platform_constraints;
  const preferred = constraints?.preferredAspectRatio;
  const aspect = constraints?.aspectRatio;
  if (typeof preferred === 'string') return preferred;
  if (typeof aspect === 'string') return aspect;
  return undefined;
}

function normalizeIdeaPlatform(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  const aliases: Array<[string, RegExp]> = [
    ['LinkedIn', /\blinkedin\b/],
    ['Newsletter', /\b(newsletter|email)\b/],
    ['Blog', /\b(blog|article|website|web\s*site|site)\b|[a-z0-9.-]+\.(com|co|io|ai|app|dev)\b/],
    ['Instagram', /\binstagram\b/],
    ['Twitter/X', /\b(twitter|x\.com|\bx\b)\b/],
    ['YouTube', /\b(youtube|yt)\b/],
    ['TikTok', /\btiktok\b/],
    ['Reddit', /\breddit\b/],
    ['Medium', /\bmedium\b/],
    ['Podcast', /\bpodcast\b/],
    ['Facebook', /\bfacebook\b/],
    ['Pinterest', /\bpinterest\b/],
    ['Film Festival', /\b(film festival|festival)\b/],
    ['Internal', /\binternal\b/],
    ['Multi-platform', /\b(multi[- ]?platform|cross[- ]?platform|omnichannel|all channels)\b/],
  ];

  const match = aliases.find(([, pattern]) => pattern.test(lower));
  if (match) return match[0];

  const trimmed = value.trim();
  return VALID_IDEA_PLATFORMS.has(trimmed) ? trimmed : undefined;
}

function textLayerStrings(spec: ClickatronCreativeSpec): string[] {
  const topLevel = spec.renderPlan.textLayers?.map((layer) => layer.text) ?? [];
  const slideLayers = spec.renderPlan.slides?.flatMap((slide) => slide.textLayers?.map((layer) => layer.text) ?? []) ?? [];
  return [...topLevel, ...slideLayers];
}

function extractJsonObject<T>(output: string): T | undefined {
  const trimmed = output.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;

  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as T;
  } catch {
    return undefined;
  }
}

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
}

function containsAny(value: string, terms: string[]): boolean {
  return findTerms(value, terms).length > 0;
}

function containsTerm(value: string, term: string): boolean {
  return findTerms(value, [term]).length > 0;
}

function atLeastTerms(value: string, terms: string[], minCount: number): boolean {
  return terms.filter((term) => containsTerm(value, term)).length >= minCount;
}

function missingTerms(value: string, terms: string[]): string[] {
  return terms.filter((term) => !containsTerm(value, term));
}

function findTerms(value: string, terms: string[]): string[] {
  const lower = value.toLowerCase();
  return terms.filter((term) => {
    const normalized = term.toLowerCase();
    if (!/^[a-z0-9% /&-]+$/i.test(term)) return lower.includes(normalized);
    return termVariants(normalized).some((variant) => {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(lower);
    });
  });
}

function termVariants(term: string): string[] {
  if (!/^[a-z0-9]+$/.test(term)) return [term];
  const variants = new Set([term, `${term}s`, `${term}ed`, `${term}ing`, `${term}er`, `${term}ers`]);
  if (term.endsWith('y') && term.length > 1) {
    variants.add(`${term.slice(0, -1)}ies`);
  }
  return Array.from(variants);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeFileSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return argv.includes(`--${name}`);
}

function readPositiveIntArg(name: string, fallback: number): number {
  const raw = readArg(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function readNumberArg(name: string, fallback: number): number {
  const raw = readArg(name);
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${name} must be a number`);
  }
  return parsed;
}

function ensurePromptBuilderKey(selectedProviders: EvalProvider[], forcePromptBuilderOnly = false) {
  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  );
  if (!hasGeminiKey && (forcePromptBuilderOnly || !selectedProviders.includes('gemini'))) {
    process.env.GEMINI_API_KEY = 'thinkforge-eval-prompt-builder-only';
  }
}
