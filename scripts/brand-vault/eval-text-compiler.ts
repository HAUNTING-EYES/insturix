/**
 * Live eval for the Brand Vault text-evidence compiler prompt (Rule 35).
 *
 * Runs the REAL Gemini compiler against brand-archetype fixtures across seeds
 * 1-10 and checks:
 *  - the one-off YouTube transcript line is NEVER emitted as a recurring phrase
 *  - a genuinely repeated tagline IS captured
 *  - product/services + audience are extracted for non-SaaS archetypes
 *    (nonprofit, local service) — i.e. the prompt is not overfit to B2B SaaS
 *
 * Run:
 *   node --env-file=.env.local --import tsx scripts/brand-vault/eval-text-compiler.ts
 */

import { createBrandVaultGeminiTextEvidenceCompiler } from '../../lib/shared/brand-vault-text-evidence-compiler';
import type { BrandVaultTextEvidenceCompilerInput } from '../../lib/shared/brand-vault-draft-orchestrator';

const NOW = '2026-06-20T00:00:00.000Z';
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const apiKey =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
if (!apiKey) {
  console.error('No Gemini key in env (GEMINI_API_KEY / GOOGLE_API_KEY). Run with --env-file=.env.local');
  process.exit(2);
}

interface Fixture {
  name: string;
  archetype: string;
  input: BrandVaultTextEvidenceCompilerInput;
  recurringMustExclude: string[];
  recurringShouldInclude: string[];
  mustHaveSignals: string[];
}

function input(over: {
  brandId: string;
  companyName: string;
  url: string;
  html: string;
  crawl?: { url: string; html: string }[];
  social?: BrandVaultTextEvidenceCompilerInput['sourceEvidence'];
}): BrandVaultTextEvidenceCompilerInput {
  return {
    jobId: `eval_${over.brandId}`,
    input: { userId: 'eval_user', brandId: over.brandId, websiteUrl: over.url, companyName: over.companyName },
    website: { normalizedUrl: over.url, html: over.html, fetchedAt: NOW },
    crawlSnapshots: (over.crawl ?? []).map((c) => ({ normalizedUrl: c.url, html: c.html, fetchedAt: NOW })),
    sourceEvidence: over.social ?? [],
    existingCandidates: [],
    observedAt: NOW,
  };
}

const fixtures: Fixture[] = [
  {
    name: 'creator-one-off-transcript',
    archetype: 'creator / finance YouTuber',
    input: input({
      brandId: 'eval_creator',
      companyName: 'Wealthwise',
      url: 'https://wealthwise.example/',
      html: `<html><head><title>Wealthwise</title></head><body>
        <header><span class="tag">Money, made simple.</span></header>
        <h1>Personal finance for everyday people</h1>
        <p>Weekly videos and a free newsletter on budgeting and investing.</p>
        <footer>Money, made simple.</footer></body></html>`,
      social: [
        {
          kind: 'social_post',
          platform: 'youtube',
          url: 'https://youtube.com/watch?v=evalone',
          name: 'YouTube video',
          note: 'Public fallback transcript for Brand Vault draft review.',
          text: 'How scammers drain small business accounts',
          media: {
            transcript:
              'Welcome back to the channel. Today we are talking about fraud. This is how businesses get robbed: a single weak password and no two factor. Let me show you the three steps to lock it down.',
          },
          metrics: { engagementCount: 1200 },
          evidenceOrigin: 'public_fallback',
        },
      ],
    }),
    recurringMustExclude: ['this is how businesses get robbed', 'how businesses get robbed', 'a single weak password'],
    recurringShouldInclude: ['money, made simple'],
    mustHaveSignals: ['identity.audience'],
  },
  {
    name: 'dtc-recurring-tagline',
    archetype: 'e-commerce / DTC mattress',
    input: input({
      brandId: 'eval_dtc',
      companyName: 'Nimbus',
      url: 'https://nimbus.example/',
      html: `<html><head><title>Nimbus</title></head><body>
        <header><span class="slogan">Sleep better, live better.</span></header>
        <h1>Organic latex and memory-foam mattresses</h1>
        <p>Shop our bed-in-a-box mattresses and bedding.</p>
        <footer>Sleep better, live better.</footer></body></html>`,
      crawl: [
        {
          url: 'https://nimbus.example/mattresses',
          html: '<html><body><h2>Sleep better, live better.</h2><p>Latex mattresses, memory-foam mattresses, pillows.</p></body></html>',
        },
      ],
    }),
    recurringMustExclude: [],
    recurringShouldInclude: ['sleep better, live better'],
    mustHaveSignals: ['identity.productServices'],
  },
  {
    name: 'nonprofit',
    archetype: 'nonprofit / literacy',
    input: input({
      brandId: 'eval_nonprofit',
      companyName: 'ReadUp',
      url: 'https://readup.example/',
      html: `<html><head><title>ReadUp</title></head><body>
        <h1>After-school reading programs for under-resourced kids</h1>
        <p>Our tutoring and literacy programs have served 12,000 students across 40 schools.</p>
        <a href="/donate">Donate</a></body></html>`,
    }),
    recurringMustExclude: [],
    recurringShouldInclude: [],
    mustHaveSignals: ['identity.productServices', 'identity.audience'],
  },
  {
    name: 'local-service',
    archetype: 'local service / plumbing',
    input: input({
      brandId: 'eval_local',
      companyName: 'RapidFlow Plumbing',
      url: 'https://rapidflow.example/',
      html: `<html><head><title>RapidFlow Plumbing</title></head><body>
        <h1>Emergency plumbing repair and drain cleaning for local homeowners</h1>
        <p>Same-day water heater installation. Trusted by 800+ neighbors. Read our reviews.</p></body></html>`,
    }),
    recurringMustExclude: [],
    recurringShouldInclude: [],
    mustHaveSignals: ['identity.productServices', 'identity.audience'],
  },
];

function lc(values: string[]): string[] {
  return values.map((v) => v.toLowerCase());
}

async function main() {
  let allPass = true;
  for (const fx of fixtures) {
    console.log(`\n=== ${fx.name}  (${fx.archetype}) ===`);
    const recurringSeenBySeed: string[][] = [];
    const signalsBySeed: string[][] = [];
    let errors = 0;

    for (const seed of SEEDS) {
      const compiler = createBrandVaultGeminiTextEvidenceCompiler({ apiKey, seed });
      try {
        const result = await compiler(fx.input);
        const recurring = lc(
          result.candidates
            .filter((c) => c.signalPath === 'voice.recurringPhrases')
            .flatMap((c) => (Array.isArray(c.normalizedValue) ? (c.normalizedValue as string[]) : [])),
        );
        const signals = result.candidates.map((c) => c.signalPath);
        recurringSeenBySeed.push(recurring);
        signalsBySeed.push(signals);
        console.log(`  seed ${seed}: recurring=[${recurring.join(' | ')}]  signals=${[...new Set(signals)].join(',')}`);
      } catch (e) {
        errors += 1;
        console.log(`  seed ${seed}: ERROR ${String(e).slice(0, 120)}`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    const ran = recurringSeenBySeed.length;
    const excludeViolations = recurringSeenBySeed.filter((recurring) =>
      fx.recurringMustExclude.some((bad) => recurring.some((p) => p.includes(bad.toLowerCase()))),
    ).length;
    const includeHits = fx.recurringShouldInclude.length
      ? recurringSeenBySeed.filter((recurring) =>
          fx.recurringShouldInclude.every((want) => recurring.some((p) => p.includes(want.toLowerCase()))),
        ).length
      : ran;
    const signalHits = signalsBySeed.filter((signals) =>
      fx.mustHaveSignals.every((s) => signals.includes(s)),
    ).length;

    const majority = Math.ceil(ran / 2);
    const passExclude = excludeViolations === 0;
    const passInclude = !fx.recurringShouldInclude.length || includeHits >= majority;
    const passSignals = signalHits >= majority;
    const pass = ran > 0 && passExclude && passInclude && passSignals;
    allPass = allPass && pass;

    console.log(
      `  -> exclude-violations=${excludeViolations}/${ran} (want 0)  include-hits=${includeHits}/${ran}  signal-hits=${signalHits}/${ran}  errors=${errors}  ${pass ? 'PASS' : 'FAIL'}`,
    );
  }

  console.log(`\n==== ${allPass ? 'ALL FIXTURES PASS' : 'SOME FIXTURES FAILED'} ====`);
  process.exit(allPass ? 0 : 1);
}

void main();
