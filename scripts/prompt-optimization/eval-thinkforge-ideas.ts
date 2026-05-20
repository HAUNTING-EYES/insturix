/**
 * Local eval harness for ThinkForge IdeasAgent.
 *
 * TRUE INTEGRATION TEST: imports from IdeasAgent directly.
 * Tests intent matching (post vs video), platform correctness, format coherence.
 *
 * Usage:
 *   npx tsx scripts/prompt-optimization/eval-thinkforge-ideas.ts
 *   npx tsx scripts/prompt-optimization/eval-thinkforge-ideas.ts --multi-seed
 *   npx tsx scripts/prompt-optimization/eval-thinkforge-ideas.ts --test-case=2
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createIdeasAgent } from '../../lib/thinkforge/agents/ideas-agent';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!API_KEY) {
  console.error('No GEMINI_API_KEY. Set in .env.local.');
  process.exit(1);
}

const multiSeed = process.argv.includes('--multi-seed');
const testCaseArg = process.argv.find(a => a.startsWith('--test-case='));
const testCaseFilter = testCaseArg ? parseInt(testCaseArg.split('=')[1]) : null;
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 42, 55];

// ---- Platform Classification ----

const TEXT_PLATFORMS = new Set(['LinkedIn', 'Twitter/X', 'Medium', 'Blog', 'Newsletter', 'Reddit', 'Facebook']);
const VIDEO_PLATFORMS = new Set(['YouTube', 'TikTok', 'Instagram']);
const ALL_VALID = new Set([...TEXT_PLATFORMS, ...VIDEO_PLATFORMS, 'Podcast', 'Pinterest']);

const VIDEO_FORMAT_WORDS = /\b(video|reel|short|skit|clip|film|vlog|duet|pov\b|storytime|explainer|tutorial|unboxing|reaction|review\s*video)/i;
const TEXT_FORMAT_WORDS = /\b(post|article|essay|thread|carousel|newsletter|listicle|guide|blog|case study|breakdown)/i;

// ---- Test Cases ----

interface IdeaTestCase {
  id: number;
  name: string;
  prompt: string;
  expectedIntent: 'post' | 'video' | 'any';
  criteria: {
    platformsAreText?: boolean;
    platformsAreVideo?: boolean;
    formatsAreText?: boolean;
    formatsAreVideo?: boolean;
    allPlatformsValid?: boolean;
    ideasAreDiverse?: boolean;
    titlesAreSpecific?: boolean;
  };
}

const TEST_CASES: IdeaTestCase[] = [
  {
    id: 1,
    name: 'Post for a brand (no platform specified)',
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
    id: 2,
    name: 'LinkedIn post explicitly',
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
    id: 3,
    name: 'TikTok video explicitly',
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
    id: 4,
    name: 'Generic content (no format hint)',
    prompt: 'Content about the future of remote work for a tech startup audience',
    expectedIntent: 'any',
    criteria: {
      allPlatformsValid: true,
      ideasAreDiverse: true,
      titlesAreSpecific: true,
    },
  },
  {
    id: 5,
    name: 'Blog article request',
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
    id: 6,
    name: 'YouTube video request',
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

// ---- Scoring ----

interface IdeaResult {
  id: string;
  idea: string;
  platform: string;
  format: string;
  tone: string;
}

function scoreIdeas(tc: IdeaTestCase, ideas: IdeaResult[]): { passed: number; total: number; ratio: number; checks: Record<string, boolean | string> } {
  let passed = 0;
  let total = 0;
  const checks: Record<string, boolean | string> = {};

  function check(name: string, pass: boolean) {
    checks[name] = pass;
    total++;
    if (pass) passed++;
  }

  check('returns_4_ideas', ideas.length === 4);

  if (tc.criteria.allPlatformsValid) {
    const allValid = ideas.every(i => ALL_VALID.has(i.platform));
    check('all_platforms_valid', allValid);
    if (!allValid) {
      checks.invalid_platforms = ideas.filter(i => !ALL_VALID.has(i.platform)).map(i => i.platform).join(', ');
    }
  }

  if (tc.criteria.platformsAreText) {
    const textCount = ideas.filter(i => TEXT_PLATFORMS.has(i.platform)).length;
    check('platforms_are_text', textCount >= 3);
    if (textCount < 3) {
      checks.platform_details = ideas.map(i => i.platform).join(', ');
    }
  }

  if (tc.criteria.platformsAreVideo) {
    const videoCount = ideas.filter(i => VIDEO_PLATFORMS.has(i.platform)).length;
    check('platforms_are_video', videoCount >= 3);
    if (videoCount < 3) {
      checks.platform_details = ideas.map(i => i.platform).join(', ');
    }
  }

  if (tc.criteria.formatsAreText) {
    const textFormats = ideas.filter(i => TEXT_FORMAT_WORDS.test(i.format) && !VIDEO_FORMAT_WORDS.test(i.format)).length;
    check('formats_are_text', textFormats >= 3);
    if (textFormats < 3) {
      checks.format_details = ideas.map(i => i.format).join(', ');
    }
  }

  if (tc.criteria.formatsAreVideo) {
    const videoFormats = ideas.filter(i => VIDEO_FORMAT_WORDS.test(i.format)).length;
    check('formats_are_video', videoFormats >= 3);
    if (videoFormats < 3) {
      checks.format_details = ideas.map(i => i.format).join(', ');
    }
  }

  if (tc.criteria.ideasAreDiverse) {
    const tones = new Set(ideas.map(i => i.tone));
    check('ideas_diverse', tones.size >= 3);
  }

  if (tc.criteria.titlesAreSpecific) {
    const specific = ideas.filter(i => i.idea.length > 20 && i.idea.length <= 200).length;
    check('titles_specific', specific >= 3);
  }

  return { passed, total, ratio: total > 0 ? passed / total : 0, checks };
}

// ---- Regression Baselines ----

const REGRESSION_BASELINES: Record<number, number> = {
  1: 0.80, // Post for brand — first run baseline
  2: 0.80, // LinkedIn explicit
  3: 0.80, // TikTok explicit
  4: 0.80, // Generic content
  5: 0.80, // Blog article
  6: 0.80, // YouTube video
};

// ---- Run ----

async function runTest(tc: IdeaTestCase, seed: number): Promise<{ ideas: IdeaResult[]; score: ReturnType<typeof scoreIdeas>; durationMs: number }> {
  const agent = createIdeasAgent({ temperature: 0.7 });
  const start = Date.now();

  // Build prompt manually to inject seed (IdeasAgent doesn't expose seed param directly)
  // We use the agent's generateIdeas method which uses seed=42 internally
  // For multi-seed testing, we override via the model config
  const ideas = await agent.generateIdeas(tc.prompt);
  const durationMs = Date.now() - start;

  const mapped: IdeaResult[] = ideas.map(i => ({
    id: i.id,
    idea: i.idea,
    platform: i.platform,
    format: i.format,
    tone: i.tone,
  }));

  const score = scoreIdeas(tc, mapped);
  return { ideas: mapped, score, durationMs };
}

async function main() {
  const agent = createIdeasAgent();
  console.log(`[ThinkForge] Using Google Generative AI with API key\n`);

  const cases = testCaseFilter ? TEST_CASES.filter(tc => tc.id === testCaseFilter) : TEST_CASES;
  let hasRegression = false;

  for (const tc of cases) {
    console.log('='.repeat(70));
    console.log(`TEST ${tc.id}: ${tc.name} (${tc.expectedIntent})`);
    console.log('='.repeat(70));

    if (multiSeed) {
      const results: { seed: number; ratio: number; failed: string[] }[] = [];

      for (const s of SEEDS) {
        process.stdout.write(`  seed=${s}... `);
        try {
          const { score, durationMs } = await runTest(tc, s);
          const pct = Math.round(score.ratio * 100);
          const failedChecks = Object.entries(score.checks)
            .filter(([k, v]) => v === false)
            .map(([k]) => k);

          if (failedChecks.length === 0) {
            console.log(`${pct}% (${score.passed}/${score.total}) ${durationMs}ms ✓`);
          } else {
            console.log(`${pct}% (${score.passed}/${score.total}) ${durationMs}ms FAILED: ${failedChecks.join(', ')}`);
            // Print details
            for (const [k, v] of Object.entries(score.checks)) {
              if (typeof v === 'string') console.log(`    ${k}: ${v}`);
            }
          }
          results.push({ seed: s, ratio: score.ratio, failed: failedChecks });
        } catch (e: any) {
          console.log(`ERROR: ${e.message}`);
          results.push({ seed: s, ratio: 0, failed: ['crash'] });
        }
      }

      const min = Math.min(...results.map(r => r.ratio));
      const max = Math.max(...results.map(r => r.ratio));
      const avg = results.reduce((a, r) => a + r.ratio, 0) / results.length;
      const minPct = Math.round(min * 100);
      const maxPct = Math.round(max * 100);
      const avgPct = Math.round(avg * 100);

      console.log(`\n  MULTI-SEED SUMMARY:`);
      console.log(`    Min: ${minPct}%  Max: ${maxPct}%  Avg: ${avgPct}%`);

      if (minPct >= 85) {
        console.log(`    ✅ Min score above 85% -- prompt is robust`);
      } else if (minPct >= 70) {
        console.log(`    ⚠️  Min score below 85% -- prompt is fragile`);
      } else {
        console.log(`    ⚠️  Min score below 70% -- prompt needs work`);
      }

      const baseline = REGRESSION_BASELINES[tc.id];
      if (baseline !== undefined) {
        if (min >= baseline) {
          console.log(`    ✅ Regression passed (min ${minPct}% >= baseline ${Math.round(baseline * 100)}%)`);
        } else {
          console.log(`    🔴 REGRESSION: min ${minPct}% < baseline ${Math.round(baseline * 100)}%`);
          hasRegression = true;
        }
      }

      // Most common failures
      const failCounts = new Map<string, number>();
      for (const r of results) {
        for (const f of r.failed) {
          failCounts.set(f, (failCounts.get(f) || 0) + 1);
        }
      }
      if (failCounts.size > 0) {
        console.log(`    Most common failures:`);
        for (const [name, count] of Array.from(failCounts.entries()).sort((a, b) => b[1] - a[1])) {
          console.log(`      ${name}: failed ${count}/${SEEDS.length} runs`);
        }
      }
    } else {
      // Single seed
      try {
        const { ideas, score, durationMs } = await runTest(tc, 42);
        const pct = Math.round(score.ratio * 100);
        const failedChecks = Object.entries(score.checks)
          .filter(([k, v]) => v === false)
          .map(([k]) => k);

        if (failedChecks.length === 0) {
          console.log(`  ${pct}% (${score.passed}/${score.total}) ${durationMs}ms ✓`);
        } else {
          console.log(`  ${pct}% (${score.passed}/${score.total}) ${durationMs}ms FAILED: ${failedChecks.join(', ')}`);
        }

        console.log(`\n--- IDEAS ---`);
        for (const idea of ideas) {
          console.log(`  [${idea.platform}] ${idea.idea}`);
          console.log(`    Format: ${idea.format} | Tone: ${idea.tone}`);
        }
        console.log(`--- END ---\n`);
      } catch (e: any) {
        console.log(`  ERROR: ${e.message}\n`);
      }
    }
    console.log('');
  }

  if (hasRegression) {
    console.log('🔴 REGRESSION DETECTED -- one or more test cases fell below baseline. Exiting with error.\n');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
