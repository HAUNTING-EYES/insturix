/**
 * Local eval harness for the LIVE ThinkForge writers: PostWriterAgent + ScriptWriterAgent.
 *
 * WHY THIS EXISTS:
 *   Commit ee216913 ("flatten architecture") made PostWriterAgent / ScriptWriterAgent the live
 *   generation path (chat-service.ts:852/882) but shipped NO eval for them. The existing
 *   eval-thinkforge-author.ts tests the LEGACY ScriptAuthorAgent, which now only runs on the
 *   blueprint + block-edit paths. This harness covers the agents that actually generate your
 *   content today, so quality can be measured at scale before any prompt hardening or re-wiring.
 *
 * TRUE INTEGRATION TEST: unifies on the production prompt + production schema.
 *   - Prompt    = agent.buildPrompt(input)            (the EXACT production prompt, no drift)
 *   - Schema    = PostWriterResultSchema / ScriptWriterResultSchema (the EXACT production schema)
 *   - Model     = createThinkForgeModel('gemini-2.5-flash') via generateObject (the EXACT call)
 *   - Routing   = detectContentPath(userPrompt, docType) (the EXACT production router)
 *   The ONLY intentional deviation from runStructured() is the seed: base-agent hardcodes seed=42,
 *   which makes multi-seed robustness testing impossible, so we replicate the generateObject call
 *   with a varying seed. The structured-failure fallback in base-agent is not replicated; a parse
 *   failure is recorded as an error for that seed (itself a signal).
 *
 * Usage:
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-writers.ts
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-writers.ts --seed=42
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-writers.ts --multi-seed
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-writers.ts --test-case=2
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-writers.ts --writer=post
 *   GEMINI_API_KEY=dummy npx tsx scripts/prompt-optimization/eval-thinkforge-writers.ts --dry-run
 *     (--dry-run prints the built prompt + routing, makes ZERO network calls — offline verification)
 *
 * ~30s per run vs 5+ min deploy cycle. Rule 35 methodology.
 */

import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateObject } from 'ai';
import dotenv from 'dotenv';

// Agent imports -- TRUE UNIFICATION with the production prompt + schema.
import {
  PostWriterAgent,
  PostWriterResultSchema,
  type PostWriterResult,
  type PostWriterInput,
} from '../../lib/thinkforge/agents/post-writer-agent';
import {
  ScriptWriterAgent,
  ScriptWriterResultSchema,
  type ScriptWriterResult,
  type ScriptWriterInput,
} from '../../lib/thinkforge/agents/script-writer-agent';
import { detectContentPath } from '../../lib/thinkforge/agents/prompt-utils';
import { createThinkForgeModel } from '../../lib/thinkforge/agents/model-factory';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

// ---- CLI Args --------------------------------------------------------

const seedArg = process.argv.find(a => a.startsWith('--seed='));
const seed = seedArg ? parseInt(seedArg.split('=')[1]) : 42;
const multiSeed = process.argv.includes('--multi-seed');
const testCaseArg = process.argv.find(a => a.startsWith('--test-case='));
const testCaseFilter = testCaseArg ? parseInt(testCaseArg.split('=')[1]) : null;
const writerArg = process.argv.find(a => a.startsWith('--writer='));
const writerFilter = writerArg ? writerArg.split('=')[1] : null; // 'post' | 'script'
const dryRun = process.argv.includes('--dry-run');

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!API_KEY) {
  console.error('No GEMINI_API_KEY. Set in .env.local or pass via: GEMINI_API_KEY=xxx npx tsx ...');
  console.error('(For an offline prompt-assembly check with no network: GEMINI_API_KEY=dummy ... --dry-run)');
  process.exit(1);
}

// ---- AI Filler Patterns (single source of truth, shared with author eval) ---

interface FillerPattern {
  pattern: string;
  label: string;
}

const FILLER_DEFS: FillerPattern[] = JSON.parse(
  readFileSync(join(__dirname, '../../lib/thinkforge/data/ai-filler-patterns.json'), 'utf-8'),
);

const AI_FILLER = FILLER_DEFS.map(d => ({
  regex: new RegExp(d.pattern, 'i'),
  label: d.label,
}));

// ---- Test Cases ------------------------------------------------------
// `grounding` = facts that MUST survive into the output (the writers' core promise is factual
// completeness). Each is a case-insensitive substring; coverage is scored continuously.

type WriterPath = 'post' | 'script';

interface TestCase {
  id: number;
  name: string;
  documentType: string;
  projectSummary: string;
  userPrompt: string;
  systemBrief?: string;
  expectedPath: WriterPath;
  grounding?: string[];
  criteria: Record<string, any>;
}

const TEST_CASES: TestCase[] = [
  {
    id: 1,
    name: 'LinkedIn thought-leadership post',
    documentType: 'post',
    projectSummary: 'Insturix - AI-powered video editing platform for creators and agencies.',
    userPrompt:
      'Write a LinkedIn post about how AI is changing video production workflows for small agencies.',
    systemBrief:
      'Brand: Insturix. Voice: Professional but approachable, grounded in real workflow pain. Target: Agency owners and creative directors managing 5-15 person teams.',
    expectedPath: 'post',
    criteria: {
      noSceneHeadings: true, noVisualLabels: true, noVOLabels: true,
      hasHashtags: true, charRange: [800, 3000], noAiFiller: true,
      hasSpecificDetails: true, hookBeforeFold: true, hasCTA: true,
    },
  },
  {
    id: 2,
    name: 'Event promo post (grounding-heavy)',
    documentType: 'post',
    projectSummary: 'RedCross community chapter running a local blood donation drive.',
    userPrompt:
      'Write a Facebook post promoting our blood donation drive on June 15 at City Hall from 9am to 4pm. Free t-shirts for donors. Walk-ins welcome, or register at redcross.org/donate.',
    systemBrief: 'Brand: RedCross local chapter. Voice: Warm, urgent, community-minded.',
    expectedPath: 'post',
    grounding: ['June 15', 'City Hall', '9am', '4pm', 't-shirt', 'redcross.org/donate'],
    criteria: {
      noSceneHeadings: true, noVisualLabels: true, noAiFiller: true,
      hasCTA: true, charRange: [200, 3000], groundingFloor: 0.8,
    },
  },
  {
    id: 3,
    name: 'Twitter/X product launch',
    documentType: 'post',
    projectSummary: 'SaaS startup launching an AI writing tool for content marketers.',
    userPrompt:
      'Write a tweet announcing ContentForge, our new AI writing assistant that helps content marketers produce 3x more articles without sacrificing quality. Launching March 3.',
    systemBrief: 'Brand: ContentForge. Voice: Confident, direct, zero fluff.',
    expectedPath: 'post',
    grounding: ['ContentForge', '3x', 'March 3'],
    criteria: {
      charRange: [50, 400], noSceneHeadings: true, noVisualLabels: true,
      noAiFiller: true, hashtagRange: [0, 3], hasSpecificDetails: true,
      groundingFloor: 0.66,
    },
  },
  {
    id: 4,
    name: 'Instagram caption (product launch)',
    documentType: 'post',
    projectSummary: 'DTC skincare brand focused on clean ingredients and sustainability.',
    userPrompt:
      'Write an Instagram caption for our new vitamin C serum launch. Gold bottle on marble with orange slices. $38, launching this Friday.',
    systemBrief: 'Brand: GlowNaturals. Voice: Warm, inviting, clean beauty enthusiast.',
    expectedPath: 'post',
    grounding: ['vitamin C', '$38'],
    criteria: {
      charRange: [150, 2200], noSceneHeadings: true, noVisualLabels: true,
      noAiFiller: true, hasHashtags: true, hashtagRange: [3, 15], hasCTA: true,
      groundingFloor: 0.5,
    },
  },
  {
    id: 5,
    name: 'TikTok product ad script (30s)',
    documentType: 'video_script',
    projectSummary:
      'Insturix - AI-powered video editing platform that turns raw footage into polished content in minutes.',
    userPrompt:
      'Create a 30-second TikTok product ad showing how Insturix saves time for freelance video editors.',
    expectedPath: 'script',
    grounding: ['Insturix'],
    criteria: {
      minScenes: 3, maxScenes: 8, hasNarration: true, hasVisual: true,
      noAiFiller: true, hasSpecificDetails: true, scenePromptsMatchScenes: true,
    },
  },
  {
    id: 6,
    name: 'Brand film script (2 min)',
    documentType: 'video_script',
    projectSummary: 'Oakridge Coffee Co. -- craft roaster, farm-to-cup, Huila region Colombia.',
    userPrompt:
      'Write a 2-minute brand film script for Oakridge Coffee. Warm, unhurried, Terrence Malick meets food photography.',
    systemBrief:
      'Brand: Oakridge Coffee Co. Voice: Warm, unhurried, sensory-rich. Values: Craft, transparency, terroir.',
    expectedPath: 'script',
    grounding: ['Oakridge', 'Huila'],
    criteria: {
      minScenes: 4, maxScenes: 12, hasNarration: true, hasVisual: true,
      noAiFiller: true, hasSpecificDetails: true, scenePromptsMatchScenes: true,
    },
  },
  {
    id: 7,
    name: 'YouTube explainer script',
    documentType: 'video_script',
    projectSummary: 'Personal brand - solo creator making YouTube videos that explain tech simply.',
    userPrompt:
      'Write a 5-minute YouTube script explaining how quantum computing works for a general audience. Include visual direction.',
    expectedPath: 'script',
    criteria: {
      minScenes: 4, maxScenes: 14, hasNarration: true, hasVisual: true,
      noAiFiller: true, hasSpecificDetails: true, scenePromptsMatchScenes: true,
    },
  },
  {
    id: 8,
    name: 'Personal-story LinkedIn post',
    documentType: 'post',
    projectSummary: 'Solo founder building a bootstrapped SaaS for restaurant inventory management.',
    userPrompt:
      'Write a LinkedIn post about the career lesson I learned when my first startup failed after 18 months and $40K of savings.',
    systemBrief: 'Brand: Personal brand of a founder. Voice: Honest, reflective, no toxic positivity.',
    expectedPath: 'post',
    grounding: ['18 months', '$40K'],
    criteria: {
      noSceneHeadings: true, noVisualLabels: true, noVOLabels: true,
      hasHashtags: true, charRange: [800, 3000], noAiFiller: true,
      hookBeforeFold: true, hasCTA: true, groundingFloor: 0.5,
    },
  },
];

// ---- Regression Baselines --------------------------------------------
// EMPTY by design (Rule 31: no fabricated numbers). Populate AFTER the first real --multi-seed run
// using the printed "Min" per case. Until then, the harness reports scores but gates nothing.
const REGRESSION_BASELINES: Record<number, number> = {
  // 1: 0.90,  // <- example; fill from real multi-seed output
};

// ---- Scoring: structure + filler + specificity -----------------------

interface ScoreResult {
  passed: number;
  total: number;
  ratio: number;
  checks: Record<string, boolean | string>;
}

function makeScorer() {
  const checks: Record<string, boolean | string> = {};
  let passed = 0;
  let total = 0;
  function check(name: string, condition: boolean) {
    total++;
    checks[name] = condition;
    if (condition) passed++;
  }
  return {
    check,
    result: (): ScoreResult => ({ passed, total, ratio: total > 0 ? passed / total : 0, checks }),
    checks,
  };
}

function countScenes(content: string): number {
  const headers = content.match(/^#{1,3}\s*(scene\s*\d|\[?\d+[:.)])/gim) || content.match(/^#{1,3}\s*scene\b/gim) || [];
  return headers.length;
}

function scoreStructural(content: string, tc: TestCase): ScoreResult {
  const s = makeScorer();
  const c = tc.criteria;
  const lines = content.split('\n');

  if (tc.expectedPath === 'post') {
    if (c.noSceneHeadings) s.check('no_scene_headings', !/#{1,3}\s*scene\s*\d/i.test(content));
    if (c.noVisualLabels) s.check('no_visual_labels', !/\*\*Visual/i.test(content));
    if (c.noVOLabels) s.check('no_vo_labels', !/\*\*VO\b/i.test(content) && !/\*\*Narration/i.test(content));
    if (c.hasHashtags) s.check('has_hashtags', /#\w+/.test(content));
    if (c.hashtagRange) {
      const tags = content.match(/#\w+/g) || [];
      s.check('hashtag_range', tags.length >= c.hashtagRange[0] && tags.length <= c.hashtagRange[1]);
    }
    if (c.charRange) {
      const len = content.length;
      s.check('char_range', len >= c.charRange[0] && len <= c.charRange[1]);
    }
    if (c.hookBeforeFold) {
      const firstLine = lines.find(l => l.trim().length > 0) || '';
      s.check('hook_before_fold', firstLine.length > 10 && firstLine.length < 250);
    }
    if (c.hasCTA) {
      const nonEmpty = lines.filter(l => l.trim().length > 0).filter(l => !/^#\w/.test(l.trim()));
      const last = nonEmpty[nonEmpty.length - 1] || '';
      s.check('has_cta', /\?/.test(last) || /share|repost|tag|comment|register|sign ?up|join|donate|shop|learn more/i.test(last));
    }
  }

  if (tc.expectedPath === 'script') {
    const sceneCount = countScenes(content);
    if (c.minScenes) s.check('min_scenes', sceneCount >= c.minScenes);
    if (c.maxScenes) s.check('max_scenes', sceneCount <= c.maxScenes);
    if (c.hasNarration) s.check('has_narration', /\*\*\s*(narration|vo|voiceover)\b/i.test(content));
    if (c.hasVisual) s.check('has_visual', /\*\*\s*visual\b/i.test(content));
  }

  // Universal
  if (c.noAiFiller) {
    const found = AI_FILLER.filter(f => f.regex.test(content));
    s.check('no_ai_filler', found.length === 0);
    if (found.length > 0) s.checks.filler_details = found.map(f => f.label).join(', ');
  }
  if (c.hasSpecificDetails) {
    const hasNumbers = /\d+[-+~\s]*(second|minute|hour|day|week|month|year|%|\$|x\b)/i.test(content) ||
      /\$\d+/.test(content) || /\d+[kKmM]\b/.test(content) || /\d+\s*[-–]\s*\d+/.test(content);
    const hasNames = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(content) || /[A-Z][a-z]+[A-Z]/.test(content);
    s.check('has_specific_details', hasNumbers || hasNames);
  }
  s.check('no_h1_title', !content.startsWith('# '));

  return s.result();
}

// ---- Scoring: grounding (must-appear facts survive into the output) --

interface GroundingResult { coverage: number; present: string[]; missing: string[]; total: number; }

function scoreGrounding(content: string, scenePromptsBlob: string, tc: TestCase): GroundingResult {
  const facts = tc.grounding || [];
  if (facts.length === 0) return { coverage: 1, present: [], missing: [], total: 0 };
  const haystack = `${content}\n${scenePromptsBlob}`.toLowerCase().replace(/\s+/g, ' ');
  const present: string[] = [];
  const missing: string[] = [];
  for (const f of facts) {
    const needle = f.toLowerCase().replace(/\s+/g, ' ');
    if (haystack.includes(needle)) present.push(f); else missing.push(f);
  }
  return { coverage: present.length / facts.length, present, missing, total: facts.length };
}

// ---- Scoring: structured JSON fields (these writers return typed objects) ----

function scoreStructuredFields(
  result: PostWriterResult | ScriptWriterResult,
  tc: TestCase,
): ScoreResult {
  const s = makeScorer();

  // qualityScore present + in range (self-report; informational but should be well-formed)
  const qs = (result as any)?.contentAnalysis?.qualityScore;
  s.check('quality_score_wellformed', typeof qs === 'number' && qs >= 0 && qs <= 100);

  if (tc.expectedPath === 'post') {
    const r = result as PostWriterResult;
    s.check('violations_empty', Array.isArray(r.contentAnalysis?.violations) && r.contentAnalysis.violations.length === 0);
    s.check('clickatron_prompts_present',
      !!(r.clickatron?.singleImagePrompt || (r.clickatron?.carouselPrompts && r.clickatron.carouselPrompts.length > 0)));
    s.check('platform_metadata_present', typeof r.metadata?.platform === 'string' && r.metadata.platform.length > 0);
  } else {
    const r = result as ScriptWriterResult;
    s.check('scene_prompts_present', Array.isArray(r.visualMetadata?.scenePrompts) && r.visualMetadata.scenePrompts.length > 0);
    if (tc.criteria.scenePromptsMatchScenes) {
      const sceneCount = countScenes(r.content);
      const promptCount = r.visualMetadata?.scenePrompts?.length || 0;
      // 1:1 mapping is the contract; allow ±1 for header-detection slack.
      s.check('scene_prompts_match_scenes', sceneCount > 0 && Math.abs(promptCount - sceneCount) <= 1);
    }
    s.check('motion_info_present', typeof r.visualMetadata?.motionInfo === 'string' && r.visualMetadata.motionInfo.length > 0);
  }

  return s.result();
}

// ---- Scoring: quality track (prose craft, post-only, informational) --

function scoreQuality(content: string, tc: TestCase): ScoreResult {
  const s = makeScorer();
  if (tc.expectedPath !== 'post') return s.result();

  const lines = content.split('\n');
  const firstLine = lines.find(l => l.trim().length > 0) || '';

  const hasNumber = /\d/.test(firstLine);
  const hasNamedEntity = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/.test(firstLine) &&
    !/^(The|This|That|Here|When|What|How|Why|I|We|You|My|Our|Your|In|On|At|For|And|But|So|If)\b/.test(firstLine.trim());
  s.check('hook_specificity', hasNumber || hasNamedEntity);

  const nonEmpty = lines.filter(l => l.trim().length > 0).filter(l => !/^#\w/.test(l.trim()));
  const last = (nonEmpty[nonEmpty.length - 1] || '').toLowerCase();
  const generic = /what do you think\??$|thoughts\??$|agree\??$|right\??$/i.test(last.trim());
  s.check('cta_actionability', (/\?/.test(last) && !generic) || /register|sign ?up|donate|shop|join|learn more/i.test(last));

  const sentences = content.split(/[.!?]+/).filter(x => x.trim().length > 10);
  if (sentences.length >= 5) {
    const lengths = sentences.map(x => x.trim().split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const stdDev = Math.sqrt(lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length);
    s.check('rhythm_variation', (mean > 0 ? stdDev / mean : 0) > 0.15);
  }

  const cliche = /^(in today'?s|have you ever|it'?s no secret|let me tell you|picture this|imagine|there'?s no denying)/i;
  s.check('no_cliche_opening', !cliche.test(firstLine.trim()));

  return s.result();
}

// ---- Build input (production-shaped AgentInput) ----------------------

function buildInput(tc: TestCase): PostWriterInput | ScriptWriterInput {
  return {
    context: {
      projectSummary: tc.projectSummary,
      systemBrief: tc.systemBrief,
    },
    userPrompt: tc.userPrompt,
  };
}

// ---- Run one (prompt unified, schema unified, seed-controlled) -------

interface RunResult {
  seed: number;
  path: WriterPath;
  routedCorrectly: boolean;
  content: string;
  structural: ScoreResult;
  structured: ScoreResult;
  quality: ScoreResult;
  grounding: GroundingResult;
  combinedRatio: number;
  elapsed: number;
  error?: string;
}

async function runOnce(tc: TestCase, seedVal: number): Promise<RunResult> {
  const routedPath = detectContentPath(tc.userPrompt, tc.documentType);
  const routedCorrectly = routedPath === tc.expectedPath;
  const input = buildInput(tc);

  const start = Date.now();
  let content = '';
  let result: PostWriterResult | ScriptWriterResult;
  let scenePromptsBlob = '';

  const model = createThinkForgeModel('gemini-2.5-flash');

  if (routedPath === 'post') {
    const agent = new PostWriterAgent();
    const prompt = agent.buildPrompt(input as PostWriterInput);
    const { object } = await generateObject({
      model, schema: PostWriterResultSchema, prompt, temperature: 0.7,
      seed: seedVal,
      // @ts-expect-error - Vercel AI SDK version mismatch on maxTokens (same as base-agent.ts)
      maxTokens: 8192,
    });
    result = object;
    content = object.content;
    scenePromptsBlob = [object.clickatron?.singleImagePrompt, ...(object.clickatron?.carouselPrompts || [])]
      .filter(Boolean).join('\n');
  } else {
    const agent = new ScriptWriterAgent();
    const prompt = agent.buildPrompt(input as ScriptWriterInput);
    const { object } = await generateObject({
      model, schema: ScriptWriterResultSchema, prompt, temperature: 0.7,
      seed: seedVal,
      // @ts-expect-error - Vercel AI SDK version mismatch on maxTokens (same as base-agent.ts)
      maxTokens: 8192,
    });
    result = object;
    content = object.content;
    scenePromptsBlob = (object.visualMetadata?.scenePrompts || []).join('\n');
  }
  const elapsed = Date.now() - start;

  const structural = scoreStructural(content, tc);
  const structured = scoreStructuredFields(result, tc);
  const quality = scoreQuality(content, tc);
  const grounding = scoreGrounding(content, scenePromptsBlob, tc);

  // Combined structural ratio folds in routing + a grounding floor (if the case sets one).
  const groundingFloor = tc.criteria.groundingFloor as number | undefined;
  const structPassed = structural.passed
    + (routedCorrectly ? 1 : 0)
    + structured.passed
    + (groundingFloor !== undefined ? (grounding.coverage >= groundingFloor ? 1 : 0) : 0);
  const structTotal = structural.total + 1 + structured.total + (groundingFloor !== undefined ? 1 : 0);

  return {
    seed: seedVal, path: routedPath, routedCorrectly, content,
    structural, structured, quality, grounding,
    combinedRatio: structTotal > 0 ? structPassed / structTotal : 0,
    elapsed,
  };
}

// ---- Dry run: print prompt + routing, no network ---------------------

function dryRunCase(tc: TestCase): void {
  const routedPath = detectContentPath(tc.userPrompt, tc.documentType);
  const input = buildInput(tc);
  const prompt = routedPath === 'post'
    ? new PostWriterAgent().buildPrompt(input as PostWriterInput)
    : new ScriptWriterAgent().buildPrompt(input as ScriptWriterInput);

  console.log(`\n${'='.repeat(72)}`);
  console.log(`TEST ${tc.id}: ${tc.name}`);
  console.log(`  docType=${tc.documentType}  routed=${routedPath}  expected=${tc.expectedPath}  ` +
    `${routedPath === tc.expectedPath ? '✓ routing OK' : '🔴 ROUTING MISMATCH'}`);
  if (tc.grounding?.length) console.log(`  grounding facts (${tc.grounding.length}): ${tc.grounding.join(' | ')}`);
  console.log(`${'='.repeat(72)}`);
  console.log(prompt);
}

// ---- Main ------------------------------------------------------------

async function main() {
  let cases = TEST_CASES;
  if (testCaseFilter) cases = cases.filter(tc => tc.id === testCaseFilter);
  if (writerFilter) cases = cases.filter(tc => tc.expectedPath === writerFilter);

  if (cases.length === 0) {
    console.error(`No test cases match (test-case=${testCaseFilter}, writer=${writerFilter}).`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('\nDRY RUN — building production prompts, NO network calls.\n');
    for (const tc of cases) dryRunCase(tc);
    const mismatches = cases.filter(tc => detectContentPath(tc.userPrompt, tc.documentType) !== tc.expectedPath);
    console.log(`\nDry run complete. ${cases.length} prompt(s) assembled. ` +
      `Routing: ${cases.length - mismatches.length}/${cases.length} correct.`);
    if (mismatches.length > 0) process.exit(1);
    return;
  }

  const seeds = multiSeed ? [1, 2, 3, 5, 8, 13, 21, 34, 42, 55] : [seed];
  let regressionFailed = false;

  for (const tc of cases) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(`TEST ${tc.id}: ${tc.name} (${tc.documentType} → ${tc.expectedPath} writer)`);
    console.log(`${'='.repeat(72)}`);

    const results: RunResult[] = [];

    for (const sv of seeds) {
      process.stdout.write(`  seed=${sv}... `);
      try {
        const r = await runOnce(tc, sv);
        results.push(r);
        const pct = (r.combinedRatio * 100).toFixed(0);
        const gpct = r.grounding.total > 0 ? ` | ground ${(r.grounding.coverage * 100).toFixed(0)}%` : '';
        const qpct = r.quality.total > 0 ? ` | quality ${(r.quality.ratio * 100).toFixed(0)}%` : '';
        const fails = [
          ...Object.entries(r.structural.checks).filter(([, v]) => v === false).map(([k]) => k),
          ...Object.entries(r.structured.checks).filter(([, v]) => v === false).map(([k]) => k),
          ...(r.routedCorrectly ? [] : ['routing']),
        ];
        console.log(`${pct}%${gpct}${qpct} ${r.elapsed}ms${fails.length ? ' FAILED: ' + fails.join(', ') : ' ✓'}`);
        if (r.grounding.missing.length > 0) console.log(`    missing facts: ${r.grounding.missing.join(' | ')}`);
        if (r.structural.checks.filler_details) console.log(`    filler: ${r.structural.checks.filler_details}`);
        if (!multiSeed) {
          console.log(`\n--- CONTENT (first 1200 chars) ---\n${r.content.substring(0, 1200)}\n--- END ---`);
        }
      } catch (e: any) {
        console.log(`ERROR: ${e.message}`);
        results.push({
          seed: sv, path: tc.expectedPath, routedCorrectly: false, content: '',
          structural: { passed: 0, total: 1, ratio: 0, checks: {} },
          structured: { passed: 0, total: 0, ratio: 0, checks: {} },
          quality: { passed: 0, total: 0, ratio: 0, checks: {} },
          grounding: { coverage: 0, present: [], missing: tc.grounding || [], total: (tc.grounding || []).length },
          combinedRatio: 0, elapsed: 0, error: e.message,
        });
      }
    }

    if (multiSeed && results.length > 1) {
      const valid = results.filter(r => !r.error);
      if (valid.length > 0) {
        const ratios = valid.map(r => r.combinedRatio);
        const min = Math.min(...ratios), max = Math.max(...ratios);
        const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        console.log(`\n  MULTI-SEED SUMMARY:`);
        console.log(`    Min ${(min * 100).toFixed(0)}%  Max ${(max * 100).toFixed(0)}%  Avg ${(avg * 100).toFixed(0)}%  Variance ${((max - min) * 100).toFixed(0)}pp`);
        if (min < 0.7) console.log(`    ⚠️  Min < 70% -- prompt needs work`);
        else if (min < 0.85) console.log(`    ⚠️  Min < 85% -- prompt is fragile`);
        else console.log(`    ✅ Min >= 85% -- prompt is robust`);

        if (valid.some(r => r.grounding.total > 0)) {
          const gMin = Math.min(...valid.filter(r => r.grounding.total > 0).map(r => r.grounding.coverage));
          console.log(`    Grounding: worst-seed coverage ${(gMin * 100).toFixed(0)}%`);
        }

        const failFreq: Record<string, number> = {};
        for (const r of valid) {
          for (const [k, v] of [...Object.entries(r.structural.checks), ...Object.entries(r.structured.checks)]) {
            if (v === false) failFreq[k] = (failFreq[k] || 0) + 1;
          }
          if (!r.routedCorrectly) failFreq['routing'] = (failFreq['routing'] || 0) + 1;
        }
        if (Object.keys(failFreq).length > 0) {
          console.log(`    Most common failures:`);
          for (const [k, n] of Object.entries(failFreq).sort((a, b) => b[1] - a[1])) {
            console.log(`      ${k}: ${n}/${valid.length}`);
          }
        }

        const baseline = REGRESSION_BASELINES[tc.id];
        if (baseline !== undefined) {
          if (Math.round(min * 100) < Math.round(baseline * 100)) {
            console.log(`    🔴 REGRESSION: min ${(min * 100).toFixed(0)}% < baseline ${(baseline * 100).toFixed(0)}%`);
            regressionFailed = true;
          } else {
            console.log(`    ✅ Regression passed (min ${(min * 100).toFixed(0)}% >= baseline ${(baseline * 100).toFixed(0)}%)`);
          }
        } else {
          console.log(`    (no baseline set for case ${tc.id} — set REGRESSION_BASELINES[${tc.id}] = ${(min).toFixed(2)} after reviewing this run)`);
        }
      }
    }
  }

  if (regressionFailed) {
    console.error('\n🔴 REGRESSION DETECTED — one or more cases fell below baseline. Exiting non-zero.');
    process.exit(1);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
