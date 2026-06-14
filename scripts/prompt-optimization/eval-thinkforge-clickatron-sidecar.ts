/**
 * Local eval harness for ThinkForge -> Clickatron creative sidecar output.
 *
 * Rule 35 methodology:
 * - Pick a deterministic seed.
 * - Use production prompt builders and sidecar helpers.
 * - Score the visible copy and hidden Clickatron export contract before editing prompts.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-clickatron-sidecar.ts
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-clickatron-sidecar.ts --seed=42
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-clickatron-sidecar.ts --multi-seed
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-clickatron-sidecar.ts --test-case=2
 *   DEEPSEEK_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-clickatron-sidecar.ts --provider=deepseek
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

import { ScriptAuthorAgent, type ScriptAuthorInput } from '../../lib/thinkforge/agents/script-author-agent';
import type { NarrativeContract } from '../../lib/thinkforge/agents/script-contract-agent';
import type { ScriptOutline } from '../../lib/thinkforge/agents/script-outline-agent';
import type { AgentInput, ProjectContextData } from '../../lib/thinkforge/agents/types';
import type { RetrievedContext } from '../../lib/thinkforge/context';
import {
  applyContentSignalProfileToClickatronExportMeta,
  appendClickatronCreativeSidecarInstruction,
  extractRequiredClickatronCreativeSidecar,
  stripClickatronCreativeSidecarText,
} from '../../lib/thinkforge/utils/clickatron-creative-sidecar';
import { resolveContentSignalProfile, type ThinkForgeContentSignalProfile } from '../../lib/thinkforge/signals';
import type {
  ClickatronCreativeSpec,
  ThinkForgeBlockExportMeta,
} from '../../lib/thinkforge/schemas/clickatron-creative-contract';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

type EvalProvider = 'gemini' | 'deepseek';

const providerArg = process.argv.find((arg) => arg.startsWith('--provider='));
const provider = (providerArg ? providerArg.split('=')[1] : 'gemini') as EvalProvider;
const modelArg = process.argv.find((arg) => arg.startsWith('--model='));
const modelName = modelArg?.split('=')[1] ?? (provider === 'deepseek' ? 'deepseek-v4-pro' : 'gemini-2.5-flash');
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;

if (provider !== 'gemini' && provider !== 'deepseek') {
  console.error('Invalid --provider. Use --provider=gemini or --provider=deepseek.');
  process.exit(1);
}

if (provider === 'gemini' && !geminiApiKey) {
  console.error('No GEMINI_API_KEY. Set in .env.local or pass via: GEMINI_API_KEY=xxx npx tsx ...');
  process.exit(1);
}

if (provider === 'deepseek' && !deepseekApiKey) {
  console.error('No DEEPSEEK_API_KEY. Set it in the shell environment for this eval run.');
  process.exit(1);
}

if (provider === 'deepseek' && !geminiApiKey) {
  // ScriptAuthorAgent constructs a model in its constructor, but this eval only
  // uses buildPrompt(). Provide a placeholder so no Google key is needed.
  process.env.GEMINI_API_KEY = 'deepseek-eval-prompt-builder-only';
}

const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
const seed = seedArg ? Number.parseInt(seedArg.split('=')[1] ?? '42', 10) : 42;
const multiSeed = process.argv.includes('--multi-seed');
const testCaseArg = process.argv.find((arg) => arg.startsWith('--test-case='));
const testCaseFilter = testCaseArg ? Number.parseInt(testCaseArg.split('=')[1] ?? '', 10) : null;
const showOutput = process.argv.includes('--show-output');

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 42, 55];

interface ModelRunResult {
  output: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    promptCacheHitTokens?: number;
    promptCacheMissTokens?: number;
  };
}

interface FillerPattern {
  pattern: string;
  label: string;
}

const FILLER_DEFS: FillerPattern[] = JSON.parse(
  readFileSync(join(__dirname, '../../lib/thinkforge/data/ai-filler-patterns.json'), 'utf-8'),
);

const AI_FILLER = FILLER_DEFS.map((definition) => ({
  regex: new RegExp(definition.pattern, 'i'),
  label: definition.label,
}));

interface ExpectedSidecar {
  kind: ClickatronCreativeSpec['kind'];
  assetIntent: ClickatronCreativeSpec['assetIntent'];
  platform: ClickatronCreativeSpec['platform'];
  aspectRatio: string;
  textPolicy: ClickatronCreativeSpec['renderPlan']['textPolicy'];
  minTextLayers?: number;
  minSlides?: number;
  requiredClaims: string[];
  forbiddenVisibleTerms: string[];
  forbiddenUnsupportedTerms?: string[];
}

interface TestCase {
  id: number;
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
  expected: ExpectedSidecar;
}

const TEST_CASES: TestCase[] = [
  {
    id: 1,
    name: 'Instagram product launch visual',
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
      forbiddenVisibleTerms: ['miracle', 'chemical-free'],
      forbiddenUnsupportedTerms: [
        'l-ascorbic',
        'orange-brown',
        'absorbs in seconds',
        'under SPF',
        'pilling',
        'sun damage',
        'within weeks',
        'pH',
        'ferulic',
        'peptides',
        'gentle enough',
        'daily use',
        'dropper',
        'scent',
        'smells',
        'orange zest',
        'one pump',
        'moisturizer',
        'price',
        'splurge',
        'oxidize',
        'two weeks',
        'refill cartridge',
        'lower price',
        'refill system',
        'does the work',
        'bright skin',
        'try this',
      ],
    },
  },
  {
    id: 2,
    name: 'LinkedIn agency carousel',
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
      forbiddenVisibleTerms: ['game-changing'],
    },
  },
];

const authorAgent = new ScriptAuthorAgent();

function buildAuthorInput(tc: TestCase): {
  input: ScriptAuthorInput;
  baseInput: ScriptAuthorInput;
  profile: ThinkForgeContentSignalProfile;
} {
  const baseInput: ScriptAuthorInput = {
    context: {
      projectSummary: tc.projectSummary,
      systemBrief: tc.systemBrief,
    },
    project: tc.project,
    sessionId: tc.sessionId,
    brandId: tc.brandId,
    retrievedContext: tc.retrievedContext,
    userPrompt: tc.userPrompt,
    documentType: tc.documentType,
    outline: tc.outline,
    contract: tc.contract,
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
  return {
    input: {
      ...sidecarInput,
      documentType: tc.documentType,
      outline: tc.outline,
      contract: tc.contract,
      contentSignalProfile: profile,
    },
    baseInput,
    profile,
  };
}

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
}

function containsAny(value: string, terms: string[]): boolean {
  return findTerms(value, terms).length > 0;
}

function findTerms(value: string, terms: string[]): string[] {
  const lower = value.toLowerCase();
  return terms.filter((term) => {
    const normalized = term.toLowerCase();
    if (!/^[a-z0-9% -]+$/i.test(term)) return lower.includes(normalized);
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(lower);
  });
}

function createScore() {
  const checks: Record<string, boolean | string> = {};
  let passed = 0;
  let total = 0;
  return {
    check(name: string, pass: boolean, detail?: string) {
      total++;
      checks[name] = pass ? true : detail ?? false;
      if (pass) passed++;
    },
    result() {
      return { passed, total, ratio: total > 0 ? passed / total : 0, checks };
    },
  };
}

function scoreVisibleCopy(visible: string, tc: TestCase, score: ReturnType<typeof createScore>) {
  const fillerFound = AI_FILLER.filter((pattern) => pattern.regex.test(visible));
  const nonEmptyLines = visible.split('\n').map((line) => line.trim()).filter(Boolean);
  const firstLine = nonEmptyLines[0] ?? '';
  const lastContent = [...nonEmptyLines].reverse().find((line) => !line.startsWith('#')) ?? '';

  score.check('visible_copy_present', visible.trim().length >= 120);
  score.check('no_sidecar_leak_in_visible_copy', !/THINKFORGE_CLICKATRON_EXPORT|clickatron_resolved_profile/i.test(visible));
  score.check('no_forbidden_terms_in_visible_copy', !containsAny(visible, tc.expected.forbiddenVisibleTerms));
  const unsupportedVisibleTerms = findTerms(visible, tc.expected.forbiddenUnsupportedTerms ?? []);
  score.check(
    'no_unsupported_factual_claims_in_visible_copy',
    unsupportedVisibleTerms.length === 0,
    unsupportedVisibleTerms.join(', '),
  );
  score.check('no_ai_filler_in_visible_copy', fillerFound.length === 0, fillerFound.map((entry) => entry.label).join(', '));
  score.check('platform_copy_has_hook', firstLine.length >= 10 && firstLine.length <= 220);
  score.check('platform_copy_has_cta', /\?/.test(lastContent) || /\b(comment|reply|save|share|tag|send)\b/i.test(lastContent));

  if (tc.expected.platform === 'instagram') {
    const hashtagCount = visible.match(/#\w+/g)?.length ?? 0;
    score.check('instagram_has_hashtags', hashtagCount >= 3 && hashtagCount <= 15, `hashtags=${hashtagCount}`);
  }
}

function textLayerStrings(spec: ClickatronCreativeSpec): string[] {
  const topLevel = spec.renderPlan.textLayers?.map((layer) => layer.text) ?? [];
  const slideLayers = spec.renderPlan.slides?.flatMap((slide) => slide.textLayers?.map((layer) => layer.text) ?? []) ?? [];
  return [...topLevel, ...slideLayers];
}

function scoreSidecar(exportMeta: ThinkForgeBlockExportMeta | undefined, tc: TestCase, score: ReturnType<typeof createScore>) {
  const spec = exportMeta?.clickatron;
  score.check('sidecar_present_and_parsed', Boolean(spec));
  if (!spec) return;

  const layerTexts = textLayerStrings(spec);
  const combinedTextLayers = layerTexts.join(' ');
  const promptWords = words(spec.renderPlan.imagePrompt);
  const hasUsefulPrompt = promptWords.length >= 14;

  score.check('schema_version_1', spec.schemaVersion === 1);
  score.check('kind_matches_expected', spec.kind === tc.expected.kind, `kind=${spec.kind}`);
  score.check('asset_intent_matches_expected', spec.assetIntent === tc.expected.assetIntent, `assetIntent=${spec.assetIntent}`);
  score.check('platform_matches_expected', spec.platform === tc.expected.platform, `platform=${spec.platform}`);
  score.check('aspect_ratio_matches_expected', spec.aspectRatio === tc.expected.aspectRatio, `aspectRatio=${spec.aspectRatio}`);
  score.check('text_policy_matches_expected', spec.renderPlan.textPolicy === tc.expected.textPolicy, `textPolicy=${spec.renderPlan.textPolicy}`);
  score.check('source_is_thinkforge', spec.source.sourceService === 'thinkforge', `sourceService=${spec.source.sourceService ?? 'missing'}`);
  score.check('source_uses_auto_block_id', spec.source.sourceBlockIds.includes('AUTO'));
  score.check('image_prompt_is_specific', hasUsefulPrompt);
  score.check('validation_ready_or_needs_input', spec.validation.status === 'ready' || spec.validation.status === 'needs_user_input', `status=${spec.validation.status}`);
  score.check('brand_id_preserved', spec.brand?.brandId === tc.brandId, `brandId=${spec.brand?.brandId ?? 'missing'}`);
  score.check('brand_constraints_preserved', containsAny(spec.brand?.hardConstraints?.join(' ') ?? '', tc.expected.forbiddenVisibleTerms));
  score.check('required_claims_preserved', tc.expected.requiredClaims.every((claim) => containsAny(JSON.stringify(spec), [claim])));
  const unsupportedSidecarTerms = findTerms(JSON.stringify(spec), tc.expected.forbiddenUnsupportedTerms ?? []);
  score.check(
    'no_unsupported_factual_claims_in_sidecar',
    unsupportedSidecarTerms.length === 0,
    unsupportedSidecarTerms.join(', '),
  );
  score.check('text_layers_present', layerTexts.length >= (tc.expected.minTextLayers ?? 0), `layers=${layerTexts.length}`);
  score.check('forbidden_terms_absent_from_text_layers', !containsAny(combinedTextLayers, tc.expected.forbiddenVisibleTerms));

  if (tc.expected.minSlides !== undefined) {
    const slideCount = spec.renderPlan.slides?.length ?? 0;
    const slidesHavePrompts = spec.renderPlan.slides?.every((slide) => words(slide.imagePrompt).length >= 8) ?? false;
    score.check('carousel_slide_count', slideCount >= tc.expected.minSlides, `slides=${slideCount}`);
    score.check('carousel_slides_have_image_prompts', slidesHavePrompts);
  }
}

async function runGeminiPrompt(prompt: string, seedVal: number): Promise<ModelRunResult> {
  const genai = new GoogleGenerativeAI(geminiApiKey!);
  const model = genai.getGenerativeModel({ model: modelName });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      seed: seedVal,
    } as any,
  });
  return { output: result.response.text() };
}

async function runDeepSeekPrompt(prompt: string): Promise<ModelRunResult> {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekApiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      thinking: { type: 'disabled' },
      temperature: 0.7,
      max_tokens: 4096,
      user_id: 'thinkforge_eval',
    }),
  });

  const body = await response.json().catch(() => undefined) as any;
  if (!response.ok) {
    const message = body?.error?.message ?? body?.message ?? response.statusText;
    throw new Error(`DeepSeek request failed (${response.status}): ${message}`);
  }

  const output = body?.choices?.[0]?.message?.content;
  if (typeof output !== 'string' || output.trim().length === 0) {
    throw new Error('DeepSeek response did not include message.content');
  }

  return {
    output,
    usage: body?.usage
      ? {
          promptTokens: body.usage.prompt_tokens,
          completionTokens: body.usage.completion_tokens,
          totalTokens: body.usage.total_tokens,
          promptCacheHitTokens: body.usage.prompt_cache_hit_tokens,
          promptCacheMissTokens: body.usage.prompt_cache_miss_tokens,
        }
      : undefined,
  };
}

async function runPrompt(prompt: string, seedVal: number): Promise<ModelRunResult> {
  if (provider === 'deepseek') {
    return runDeepSeekPrompt(prompt);
  }
  return runGeminiPrompt(prompt, seedVal);
}

async function runOnce(tc: TestCase, seedVal: number) {
  const { input, baseInput, profile } = buildAuthorInput(tc);
  const prompt = authorAgent.buildPrompt(input);

  const start = Date.now();
  const modelRun = await runPrompt(prompt, seedVal);
  const elapsed = Date.now() - start;
  const output = modelRun.output;

  let visible = stripClickatronCreativeSidecarText(output).trim();
  let exportMeta: ThinkForgeBlockExportMeta | undefined;
  let error: string | undefined;
  try {
    const extracted = extractRequiredClickatronCreativeSidecar(output);
    visible = extracted.visibleMarkdown.trim();
    exportMeta = applyContentSignalProfileToClickatronExportMeta(extracted.exportMeta, baseInput as AgentInput, profile);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const score = createScore();
  scoreVisibleCopy(visible, tc, score);
  scoreSidecar(exportMeta, tc, score);
  const scores = score.result();
  return { seed: seedVal, elapsed, output, visible, exportMeta, error, scores, usage: modelRun.usage };
}

async function main() {
  const cases = testCaseFilter ? TEST_CASES.filter((tc) => tc.id === testCaseFilter) : TEST_CASES;
  if (cases.length === 0) {
    console.error(`No test case with id=${testCaseFilter}`);
    process.exit(1);
  }

  let failed = false;
  const seeds = multiSeed ? SEEDS : [seed];

  for (const tc of cases) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(`TEST ${tc.id}: ${tc.name}`);
    console.log(`Provider: ${provider}  Model: ${modelName}${provider === 'deepseek' ? '  Seed: not supported by API' : ''}`);
    console.log(`${'='.repeat(72)}`);

    const results = [];
    for (const seedVal of seeds) {
      process.stdout.write(`  seed=${seedVal}... `);
      try {
        const run = await runOnce(tc, seedVal);
        results.push(run);
        const failedChecks = Object.entries(run.scores.checks)
          .filter(([, value]) => value !== true)
          .map(([name]) => name);
        const usage = run.usage
          ? ` tokens=${run.usage.totalTokens ?? 'n/a'}`
          : '';

        console.log(
          `${(run.scores.ratio * 100).toFixed(0)}% (${run.scores.passed}/${run.scores.total}) ${run.elapsed}ms${usage}${
            run.error ? ` ERROR: ${run.error}` : failedChecks.length > 0 ? ` FAILED: ${failedChecks.join(', ')}` : ' ok'
          }`,
        );

        if (!multiSeed && (showOutput || run.error || failedChecks.length > 0)) {
          console.log(`\n--- VISIBLE COPY (first 1200 chars) ---\n${run.visible.slice(0, 1200)}\n--- END ---`);
          if (showOutput && run.error) {
            const sidecarIndex = run.output.search(/THINKFORGE_CLICKATRON_EXPORT/i);
            const rawExcerpt = sidecarIndex >= 0
              ? run.output.slice(Math.max(0, sidecarIndex - 120), sidecarIndex + 2600)
              : run.output.slice(-2600);
            console.log(`\n--- RAW OUTPUT AROUND SIDECAR ---\n${rawExcerpt}\n--- END RAW ---`);
          }
          if (showOutput && run.exportMeta) {
            console.log(`\n--- CLICKATRON SIDECAR ---\n${JSON.stringify(run.exportMeta.clickatron, null, 2)}\n--- END ---`);
          }
        }
      } catch (err) {
        failed = true;
        const message = err instanceof Error ? err.message : String(err);
        console.log(`CRASH: ${message}`);
      }
    }

    if (multiSeed && results.length > 0) {
      const ratios = results.map((run) => run.scores.ratio);
      const min = Math.min(...ratios);
      const max = Math.max(...ratios);
      const avg = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
      console.log(`\n  MULTI-SEED SUMMARY:`);
      console.log(`    Min: ${(min * 100).toFixed(0)}%  Max: ${(max * 100).toFixed(0)}%  Avg: ${(avg * 100).toFixed(0)}%`);
      console.log(`    Variance: ${((max - min) * 100).toFixed(0)}pp`);
      if (min < 0.85) failed = true;
    } else if (results.some((run) => run.scores.ratio < 0.85 || run.error)) {
      failed = true;
    }
  }

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
