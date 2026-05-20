/**
 * Local eval harness for ThinkForge ScriptAuthorAgent.
 *
 * TRUE INTEGRATION TEST: imports from agent classes directly.
 * No prompt drift -- eval uses the exact same buildPrompt() as production.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-author.ts
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-author.ts --seed=42
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-author.ts --multi-seed
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-author.ts --test-case=2
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-author.ts --log-techniques
 *
 * ~30s per run vs 5+ min deploy cycle. Rule 35 methodology.
 */

import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Agent imports -- TRUE UNIFICATION with production prompt
import { ScriptAuthorAgent } from '../../lib/thinkforge/agents/script-author-agent';
import type { ScriptAuthorInput } from '../../lib/thinkforge/agents/script-author-agent';
import { extractSignalsFromContext } from '../../lib/thinkforge/data/extract-signals';
import { selectAllTechniques } from '../../lib/thinkforge/data/writing-graph-query';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!API_KEY) {
  console.error('No GEMINI_API_KEY. Set in .env.local or pass via: GEMINI_API_KEY=xxx npx tsx ...');
  process.exit(1);
}

// ---- CLI Args --------------------------------------------------------

const seedArg = process.argv.find(a => a.startsWith('--seed='));
const seed = seedArg ? parseInt(seedArg.split('=')[1]) : 42;
const multiSeed = process.argv.includes('--multi-seed');
const testCaseArg = process.argv.find(a => a.startsWith('--test-case='));
const testCaseFilter = testCaseArg ? parseInt(testCaseArg.split('=')[1]) : null;
const logTechniques = process.argv.includes('--log-techniques');

// ---- AI Filler Patterns (single source of truth) ---------------------

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

// ---- Agent Instance --------------------------------------------------

const agent = new ScriptAuthorAgent();

// ---- Test Cases ------------------------------------------------------

interface TestCase {
  id: number;
  name: string;
  documentType: string;
  projectSummary: string;
  userPrompt: string;
  systemBrief?: string;
  expectedFormat: 'video' | 'post';
  criteria: Record<string, any>;
}

const TEST_CASES: TestCase[] = [
  {
    id: 1,
    name: 'TikTok product ad (30s)',
    documentType: 'video_script',
    projectSummary:
      'Insturix - AI-powered video editing platform that turns raw footage into polished content in minutes.',
    userPrompt:
      'Create a 30-second TikTok product ad showing how Insturix saves time for freelance video editors.',
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
    id: 2,
    name: 'LinkedIn post',
    documentType: 'post',
    projectSummary: 'Insturix - AI-powered video editing platform for creators and agencies.',
    userPrompt:
      'Write a LinkedIn post about how AI is changing video production workflows for small agencies.',
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
    id: 3,
    name: 'Brand film (2 min)',
    documentType: 'video_script',
    projectSummary:
      'Oakridge Coffee Co. -- craft roaster, farm-to-cup, Huila region Colombia.',
    userPrompt:
      'Write a 2-minute brand film script for Oakridge Coffee. Warm, unhurried, Terrence Malick meets food photography.',
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
    id: 4,
    name: 'Talking head video',
    documentType: 'video_script',
    projectSummary:
      'Personal brand - solo content creator making YouTube videos about productivity.',
    userPrompt:
      'Write a talking head video script about the 3 biggest time-wasters in remote work. Direct to camera, conversational.',
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
  // ---- Phase 5A: Diverse LinkedIn test cases ---
  {
    id: 5,
    name: 'Technical LinkedIn (tool comparison)',
    documentType: 'post',
    projectSummary: 'DevOps consulting firm specializing in CI/CD pipeline optimization.',
    userPrompt:
      'Write a LinkedIn post comparing GitHub Actions vs GitLab CI for teams with 10-50 developers.',
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
    id: 6,
    name: 'Personal story LinkedIn',
    documentType: 'post',
    projectSummary: 'Solo founder building a bootstrapped SaaS for restaurant inventory management.',
    userPrompt:
      'Write a LinkedIn post about the career lesson I learned when my first startup failed after 18 months and $40K of savings.',
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
    id: 7,
    name: 'Data-driven LinkedIn',
    documentType: 'post',
    projectSummary: 'HR tech startup with employee engagement analytics platform.',
    userPrompt:
      'Write a LinkedIn post analyzing the trend of return-to-office mandates using data on employee turnover and productivity.',
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
];

// ---- Regression Baselines --------------------------------------------
// Minimum acceptable multi-seed scores. Exit(1) on regression.
const REGRESSION_BASELINES: Record<number, number> = {
  1: 0.93, // TikTok: 93% (14 criteria, allows 1 stochastic failure)
  2: 0.90, // LinkedIn: 90% (10 criteria, achieved 100% on 2026-05-20)
  3: 0.93, // Brand film: 93% (14 criteria)
  4: 0.86, // Talking head: 86% (7 criteria, 1 stochastic filler failure)
  5: 0.90, // Technical LinkedIn: 90% (filler outliers: unlock, seamless, game-changer)
  6: 0.90, // Personal story LinkedIn: 90% (filler outlier: pivotal)
  7: 0.90, // Data-driven LinkedIn: 90% (hook + filler outliers)
};

// ---- Build Prompt via Agent ------------------------------------------

function buildPromptForTestCase(tc: TestCase): string {
  const input: ScriptAuthorInput = {
    context: {
      projectSummary: tc.projectSummary,
      systemBrief: tc.systemBrief,
    },
    userPrompt: tc.userPrompt,
    documentType: tc.documentType,
  };
  return agent.buildPrompt(input);
}

// ---- Technique Activation Check (Phase 1 GO/NO-GO) ------------------

function logTechniqueActivation(tc: TestCase): void {
  const signals = extractSignalsFromContext({
    documentType: tc.documentType,
    projectSummary: tc.projectSummary,
    userPrompt: tc.userPrompt,
  });

  console.log(`\n  [Technique Activation] Test ${tc.id}: ${tc.name}`);
  console.log(`    Document type: ${tc.documentType}`);
  console.log(`    Signals (${Object.keys(signals).length}):`);
  for (const [k, v] of Object.entries(signals)) {
    console.log(`      ${k}: ${v}`);
  }

  const techniqueMap = selectAllTechniques(signals, 2);
  if (techniqueMap.size === 0) {
    console.log(
      `    ⚠️  NO TECHNIQUES ACTIVATED -- writing knowledge block will be EMPTY`,
    );
    console.log(
      `    ⚠️  GO/NO-GO: This is root cause #5. Fix technique activation before format rewrite.`,
    );
  } else {
    console.log(`    Techniques activated (${techniqueMap.size} categories):`);
    techniqueMap.forEach((techs, category) => {
      for (const t of techs) {
        console.log(`      ${category}: ${t.id} (score: ${t.score.toFixed(2)})`);
      }
    });
    console.log(`    GO: Writing knowledge block will have content.`);
  }
}

// ---- Scoring ---------------------------------------------------------

interface ScoreResult {
  passed: number;
  total: number;
  ratio: number;
  checks: Record<string, boolean | string>;
}

function scoreOutput(output: string, tc: TestCase): ScoreResult {
  const checks: Record<string, boolean | string> = {};
  let passed = 0;
  let total = 0;

  function check(name: string, condition: boolean) {
    total++;
    checks[name] = condition;
    if (condition) passed++;
  }

  const c = tc.criteria;
  const lines = output.split('\n');

  // ---- Video-specific checks ----
  if (tc.expectedFormat === 'video') {
    if (c.hasMusicDirection) {
      check('music_direction', /##\s*music\s*direction/i.test(output));
    }
    if (c.hasTimingBrackets) {
      const timingMatches = output.match(/##\s*\[\d+:\d+/g);
      check(
        'timing_brackets',
        !!timingMatches && timingMatches.length >= (c.minScenes || 3),
      );
    }

    const sceneHeaders =
      output.match(/##\s*\[?\d/g) || output.match(/##\s*scene\s*\d/gi) || [];
    if (c.minScenes) check('min_scenes', sceneHeaders.length >= c.minScenes);
    if (c.maxScenes) check('max_scenes', sceneHeaders.length <= c.maxScenes);

    if (c.elementsPerScene) {
      for (const el of c.elementsPerScene) {
        const re = new RegExp(`\\*\\*${el}[^*]*\\*\\*`, 'gi');
        const matches = output.match(re) || [];
        check(`element_${el.toLowerCase()}`, matches.length >= 1);
      }
    }

    if (c.visualsAreActions) {
      const visualLines = lines.filter(l => /\*\*Visual/i.test(l));
      const feelingWords =
        /\b(feels?|looks?|seems?|appears?)\s+(worried|happy|sad|anxious|overwhelmed|excited)\b/i;
      check('visuals_are_actions', !visualLines.some(l => feelingWords.test(l)));
    }

    if (c.hasMoodReferences) {
      const moodLines = lines.filter(l => /\*\*Mood/i.test(l));
      check('mood_references', moodLines.length >= 2);
    }

    if (c.hasOnCameraLabel) {
      check('has_on_camera', /\*\*On-Camera/i.test(output));
    }
  }

  // ---- Post-specific checks ----
  if (tc.expectedFormat === 'post') {
    if (c.noSceneHeadings) {
      check('no_scene_headings', !/##\s*scene\s*\d/i.test(output));
    }
    if (c.noVisualLabels) {
      check('no_visual_labels', !/\*\*Visual/i.test(output));
    }
    if (c.noVOLabels) {
      check(
        'no_vo_labels',
        !/\*\*VO\b/i.test(output) && !/\*\*Narration/i.test(output),
      );
    }
    if (c.hasHashtags) {
      check('has_hashtags', /#\w+/i.test(output));
    }
    if (c.charRange) {
      const len = output.length;
      check('char_range', len >= c.charRange[0] && len <= c.charRange[1]);
    }
    if (c.hookBeforeFold) {
      const firstLine = lines.find(l => l.trim().length > 0) || '';
      check('hook_before_fold', firstLine.length > 10 && firstLine.length < 250);
    }
    if (c.hasCTA) {
      const nonEmpty = lines.filter(l => l.trim().length > 0);
      const nonHashtag = nonEmpty.filter(l => !/^#\w/.test(l.trim()));
      const lastContent = nonHashtag[nonHashtag.length - 1] || '';
      check('has_cta', /\?/.test(lastContent) || /share|repost|tag|comment/i.test(lastContent));
    }
  }

  // ---- Universal checks ----
  if (c.noAiFiller) {
    const fillerFound = AI_FILLER.filter(f => f.regex.test(output));
    check('no_ai_filler', fillerFound.length === 0);
    if (fillerFound.length > 0) {
      checks.filler_details = fillerFound.map(f => f.label).join(', ');
    }
  }

  if (c.hasSpecificDetails) {
    const hasNumbers =
      /\d+[-+~\s]*(second|minute|hour|day|week|month|year|%|dollar|\$|x\b)/i.test(output) ||
      /\$\d+/.test(output) || /\d+[kKmM]\b/.test(output) ||
      /\d+\s*[-–]\s*\d+/.test(output);
    const hasNames =
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(output) ||
      /\b(MacBook|Chrome|Slack|iPhone)\b/.test(output) ||
      /[A-Z][a-z]+[A-Z]/.test(output);
    check('has_specific_details', hasNumbers || hasNames);
  }

  check('no_h1_title', !output.startsWith('# '));

  return { passed, total, ratio: total > 0 ? passed / total : 0, checks };
}

// ---- Quality Score (Phase 3: separate track, not diluting structural) ---

interface QualityResult {
  passed: number;
  total: number;
  ratio: number;
  checks: Record<string, boolean | string>;
}

function scoreQuality(output: string, tc: TestCase): QualityResult {
  if (tc.expectedFormat !== 'post') return { passed: 0, total: 0, ratio: 0, checks: {} };

  const checks: Record<string, boolean | string> = {};
  let passed = 0;
  let total = 0;

  function check(name: string, condition: boolean) {
    total++;
    checks[name] = condition;
    if (condition) passed++;
  }

  const lines = output.split('\n');
  const firstLine = lines.find(l => l.trim().length > 0) || '';

  // hookSpecificity: first line has a specific claim, number, or named entity
  const hasNumber = /\d/.test(firstLine);
  const hasNamedEntity = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/.test(firstLine) &&
    !/^(The|This|That|Here|When|What|How|Why|I|We|You|My|Our|Your|In|On|At|For|And|But|So|If)\b/.test(firstLine.trim());
  check('hook_specificity', hasNumber || hasNamedEntity);

  // ctaActionability: CTA is specific, not "what do you think?" or "thoughts?"
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  const nonHashtag = nonEmpty.filter(l => !/^#\w/.test(l.trim()));
  const lastContent = (nonHashtag[nonHashtag.length - 1] || '').toLowerCase();
  const isGenericCTA = /what do you think\??$|thoughts\??$|agree\??$|right\??$/i.test(lastContent.trim());
  check('cta_actionability', /\?/.test(lastContent) && !isGenericCTA);

  // rhythmVariation: sentence length std dev > 15% of mean
  const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length >= 5) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const stdDev = Math.sqrt(lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length);
    const variation = mean > 0 ? stdDev / mean : 0;
    check('rhythm_variation', variation > 0.15);
  }

  // noClicheOpening: first sentence avoids common AI opener patterns
  const clicheOpeners = /^(in today'?s|have you ever|it'?s no secret|let me tell you|picture this|imagine|there'?s no denying)/i;
  check('no_cliche_opening', !clicheOpeners.test(firstLine.trim()));

  // paragraphDensity: average paragraph under 3 sentences
  const paragraphs = output.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  if (paragraphs.length >= 2) {
    const sentenceCounts = paragraphs.map(p => (p.match(/[.!?]+/g) || []).length);
    const avgSentences = sentenceCounts.reduce((a, b) => a + b, 0) / sentenceCounts.length;
    check('paragraph_density', avgSentences <= 3);
  }

  return { passed, total, ratio: total > 0 ? passed / total : 0, checks };
}

// ---- Run Gemini ------------------------------------------------------

interface RunResult {
  seed: number;
  output: string;
  scores: ScoreResult;
  quality: QualityResult;
  elapsed: number;
  error?: string;
}

async function runOnce(tc: TestCase, seedVal: number): Promise<RunResult> {
  const genai = new GoogleGenerativeAI(API_KEY!);
  const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = buildPromptForTestCase(tc);

  const config: Record<string, unknown> = {
    temperature: 0.7,
    maxOutputTokens: 4096,
  };
  if (seedVal !== undefined) config.seed = seedVal;

  const start = Date.now();
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: config as any,
  });
  const elapsed = Date.now() - start;

  const output = result.response.text();
  const scores = scoreOutput(output, tc);

  const quality = scoreQuality(output, tc);
  return { seed: seedVal, output, scores, quality, elapsed };
}

// ---- Main ------------------------------------------------------------

async function main() {
  const cases = testCaseFilter
    ? TEST_CASES.filter(tc => tc.id === testCaseFilter)
    : TEST_CASES;

  if (cases.length === 0) {
    console.error(`No test case with id=${testCaseFilter}`);
    process.exit(1);
  }

  // Phase 1: Technique activation check
  if (logTechniques) {
    console.log(
      '\n' +
        '='.repeat(70) +
        '\n  TECHNIQUE ACTIVATION CHECK (Phase 1 GO/NO-GO)\n' +
        '='.repeat(70),
    );
    for (const tc of cases) {
      logTechniqueActivation(tc);
    }
    console.log('');
  }

  const seeds = multiSeed ? [1, 2, 3, 5, 8, 13, 21, 34, 42, 55] : [seed];
  let regressionFailed = false;

  for (const tc of cases) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`TEST ${tc.id}: ${tc.name} (${tc.documentType})`);
    console.log(`${'='.repeat(70)}`);

    const results: RunResult[] = [];

    for (const s of seeds) {
      process.stdout.write(`  seed=${s}... `);
      try {
        const r = await runOnce(tc, s);
        results.push(r);

        const pct = (r.scores.ratio * 100).toFixed(0);
        const failedChecks = Object.entries(r.scores.checks)
          .filter(([, v]) => v === false)
          .map(([k]) => k);

        const qualityStr = r.quality.total > 0
          ? ` | Quality: ${(r.quality.ratio * 100).toFixed(0)}% (${r.quality.passed}/${r.quality.total})`
          : '';
        console.log(
          `${pct}% (${r.scores.passed}/${r.scores.total})${qualityStr} ${r.elapsed}ms${
            failedChecks.length > 0 ? ' FAILED: ' + failedChecks.join(', ') : ' ✓'
          }`,
        );

        if (multiSeed && failedChecks.length > 0) {
          if (r.scores.checks.filler_details) {
            console.log(`    filler: ${r.scores.checks.filler_details}`);
          }
        }
        if (!multiSeed) {
          console.log(
            `\n--- OUTPUT (first 1500 chars) ---\n${r.output.substring(0, 1500)}\n--- END ---`,
          );
          if (r.scores.checks.filler_details) {
            console.log(`  AI FILLER FOUND: ${r.scores.checks.filler_details}`);
          }
          if (r.quality.total > 0) {
            const qFailed = Object.entries(r.quality.checks)
              .filter(([, v]) => v === false)
              .map(([k]) => k);
            if (qFailed.length > 0) {
              console.log(`  QUALITY ISSUES: ${qFailed.join(', ')}`);
            }
          }
        }
      } catch (e: any) {
        console.log(`ERROR: ${e.message}`);
        results.push({
          seed: s,
          output: '',
          scores: { passed: 0, total: 1, ratio: 0, checks: {} },
          quality: { passed: 0, total: 0, ratio: 0, checks: {} },
          elapsed: 0,
          error: e.message,
        });
      }
    }

    if (multiSeed && results.length > 1) {
      const validResults = results.filter(r => !r.error);
      if (validResults.length > 0) {
        const scores = validResults.map(r => r.scores.ratio);
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

        console.log(`\n  MULTI-SEED SUMMARY:`);
        console.log(
          `    Min: ${(min * 100).toFixed(0)}%  Max: ${(max * 100).toFixed(0)}%  Avg: ${(avg * 100).toFixed(0)}%`,
        );
        console.log(`    Variance: ${((max - min) * 100).toFixed(0)}pp`);

        if (min < 0.7) console.log(`    ⚠️  Min score below 70% -- prompt needs work`);
        else if (min < 0.85)
          console.log(`    ⚠️  Min score below 85% -- prompt is fragile`);
        else console.log(`    ✅ Min score above 85% -- prompt is robust`);

        // Regression check
        const baseline = REGRESSION_BASELINES[tc.id];
        if (baseline !== undefined) {
          if (Math.round(min * 100) < Math.round(baseline * 100)) {
            console.log(
              `    🔴 REGRESSION: min ${(min * 100).toFixed(0)}% < baseline ${(baseline * 100).toFixed(0)}%`,
            );
            regressionFailed = true;
          } else {
            console.log(
              `    ✅ Regression passed (min ${(min * 100).toFixed(0)}% >= baseline ${(baseline * 100).toFixed(0)}%)`,
            );
          }
        }

        const failFreq: Record<string, number> = {};
        for (const r of validResults) {
          for (const [k, v] of Object.entries(r.scores.checks)) {
            if (v === false) failFreq[k] = (failFreq[k] || 0) + 1;
          }
        }
        if (Object.keys(failFreq).length > 0) {
          console.log(`    Most common failures:`);
          for (const [k, count] of Object.entries(failFreq).sort(
            (a, b) => b[1] - a[1],
          )) {
            console.log(`      ${k}: failed ${count}/${validResults.length} runs`);
          }
        }

        // Quality score summary (separate track, informational)
        const qualityResults = validResults.filter(r => r.quality.total > 0);
        if (qualityResults.length > 0) {
          const qScores = qualityResults.map(r => r.quality.ratio);
          const qMin = Math.min(...qScores);
          const qAvg = qScores.reduce((a, b) => a + b, 0) / qScores.length;
          console.log(`    Quality track: Min ${(qMin * 100).toFixed(0)}%  Avg ${(qAvg * 100).toFixed(0)}%`);
          const qFailFreq: Record<string, number> = {};
          for (const r of qualityResults) {
            for (const [k, v] of Object.entries(r.quality.checks)) {
              if (v === false) qFailFreq[k] = (qFailFreq[k] || 0) + 1;
            }
          }
          if (Object.keys(qFailFreq).length > 0) {
            console.log(`    Quality issues:`);
            for (const [k, count] of Object.entries(qFailFreq).sort((a, b) => b[1] - a[1])) {
              console.log(`      ${k}: ${count}/${qualityResults.length}`);
            }
          }
        }
      }
    }
  }

  if (regressionFailed) {
    console.error(
      '\n🔴 REGRESSION DETECTED -- one or more test cases fell below baseline. Exiting with error.',
    );
    process.exit(1);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
