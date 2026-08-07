/**
 * Live eval harness for the narrative-ordering prompt (Rule 35: eval before deploy).
 *
 * Usage:
 *   npx tsx scripts/prompt-optimization/eval-narrative-ordering.ts \
 *     [--seeds=2] [--model=gemini-2.5-flash] [--env=.env.local] [--enrich]
 *
 * Providers: --model=gemini-* → Google (x-goog-api-key), else xAI/Grok (XAI_API_KEY).
 *   Production ordering runs on Gemini, so the DEFAULT is gemini-2.5-flash. Local .env.local
 *   Gemini keys are stale → pass --env=<vercel-dev pull> for the working key. grok-4 stays as a
 *   fast secondary proxy.
 *
 * Two question sets:
 *   NARRATIVE cases  — scrambled input + a known-good STORY order. Metric: order recovery.
 *   PRESERVE cases   — multi-source PROCEDURAL content already in correct CAUSAL order (each step
 *                      a separate clip, so the same-source coherence contract does NOT protect it).
 *                      good = the given order. Metric: does the model KEEP it, or scramble the
 *                      steps chasing "the strongest story"? Low recovery here = evidence the
 *                      always-story prompt breaks procedural content → the order-intent gate (B7).
 *
 * --enrich runs each case through the B1 signal-enricher first (+ optional hand-authored per-case
 *   events) so the digest carries narrative tags — the A/B for "do the B1 signals change ordering".
 *
 * Reuses COMMITTED modules only (no duplicated logic). Not committed (scripts/).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { buildOrderingDigest } from '../../lib/editron/storyline/ordering-digest';
import { sequenceRecovery, aggregateRecovery, type SequenceRecovery } from '../../lib/editron/storyline/ordering-eval';
import { validateOrderingPlan } from '../../lib/editron/storyline/ordering-plan';
import { buildOrderingPrompt, parseOrderingResponse } from '../../lib/editron/storyline/ordering-prompt';
import { makeScene, type Scene, type SceneInput } from '../../lib/editron/storyline/scene';
import { enrichScenes, type NarrativeSignalEvent, type NarrativeSignalSource } from '../../lib/editron/storyline/signal-enricher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const arg = (name: string, def: string) => (process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def);
const flag = (name: string) => process.argv.includes(`--${name}`);
const SEEDS = parseInt(arg('seeds', '2'), 10);
const MODEL = arg('model', 'gemini-2.5-flash');
const ENV_PATH = arg('env', '.env.local');
const ENRICH = flag('enrich');
const ONLY = arg('only', 'all'); // 'preserve' | 'narrative' | 'all'
const DELAY = parseInt(arg('delay', '0'), 10); // ms between calls (dodge rate limits)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

dotenv.config({ path: path.resolve(process.cwd(), ENV_PATH) });

const PROVIDER: 'gemini' | 'xai' = MODEL.startsWith('gemini') ? 'gemini' : 'xai';
const KEY = PROVIDER === 'gemini' ? process.env.GEMINI_API_KEY : process.env.XAI_API_KEY;
if (!KEY) { console.error(`No ${PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'XAI_API_KEY'} in ${ENV_PATH}`); process.exit(1); }

async function callLLM(prompt: string, seed: number): Promise<string> {
  return PROVIDER === 'gemini' ? callGemini(prompt, seed) : callXai(prompt, seed);
}

async function callGemini(prompt: string, seed: number): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', seed },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callXai(prompt: string, seed: number): Promise<string> {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL, messages: [{ role: 'user', content: prompt }],
      temperature: 0, seed, response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? '';
}

// ─── cases ──────────────────────────────────────────────────────────────────

interface Case {
  id: string;
  platform: string;
  targetSec: number | null;
  language?: string;
  /** true = PROCEDURAL: `good` is the causal order the model must PRESERVE, not improve on. */
  preserve?: boolean;
  scenes: (SceneInput & { key: string })[];
  good: string[];
  /** Optional per-source narrative events (for --enrich): key -> events in that scene's window. */
  events?: Record<string, NarrativeSignalEvent[]>;
}

const S = (over: Partial<SceneInput> & { key: string; source: string; endTime: number; transcription: string; importance: number }): SceneInput & { key: string } =>
  ({ startTime: 0, objects: [], faces: [], detectedText: [], ...over });

const CASES: Case[] = [
  // ── NARRATIVE: scrambled → known-good story order (reordering is CORRECT here) ──
  {
    id: 'product-ad', platform: 'tiktok', targetSec: null,
    scenes: [
      S({ key: 'cta', source: 'cta', endTime: 3, transcription: 'Grab yours today at the link below.', importance: 0.5 }),
      S({ key: 'product', source: 'prod', endTime: 4, transcription: 'This is the AeroPress. Press once and you get espresso-strength coffee in thirty seconds.', importance: 0.7 }),
      S({ key: 'frustration', source: 'frus', endTime: 3, transcription: 'Ugh, my old coffee maker takes forever and the coffee comes out watery.', importance: 0.9 }),
      S({ key: 'proof', source: 'prf', endTime: 4, transcription: 'We had fifty people taste it blind. Forty-three preferred it over their usual cup.', importance: 0.6 }),
    ],
    good: ['frustration', 'product', 'proof', 'cta'],
    events: { cta: [{ timestampMs: 500, kind: 'cta' }], prf: [{ timestampMs: 500, kind: 'number', context: '43 of 50' }] },
  },
  {
    id: 'testimonial', platform: 'instagram-reels', targetSec: null,
    scenes: [
      S({ key: 'result', source: 'r', endTime: 4, transcription: 'Now a video that used to take me a full day takes about twenty minutes.', importance: 0.7 }),
      S({ key: 'before', source: 'b', endTime: 3, transcription: 'I used to spend hours editing every single video by hand.', importance: 0.8 }),
      S({ key: 'recommend', source: 'rec', endTime: 3, transcription: 'If you make videos at all, you have to try it.', importance: 0.55 }),
      S({ key: 'discovery', source: 'd', endTime: 4, transcription: 'Then I found this tool that cuts out the boring parts automatically.', importance: 0.75 }),
    ],
    good: ['before', 'discovery', 'result', 'recommend'],
  },
  {
    id: 'multi-source-coherence', platform: 'youtube', targetSec: null,
    scenes: [
      S({ key: 'a1', source: 'intv', startTime: 10, endTime: 14, transcription: 'Because nobody was solving this for small teams.', importance: 0.7 }),
      S({ key: 'b1', source: 'broll', startTime: 5, endTime: 8, transcription: '', importance: 0.4 }),
      S({ key: 'a0', source: 'intv', startTime: 0, endTime: 4, transcription: 'So why did you start the company?', importance: 0.8 }),
      S({ key: 'b0', source: 'broll', startTime: 0, endTime: 3, transcription: '', importance: 0.4 }),
    ],
    good: ['a0', 'a1', 'b0', 'b1'],
  },
  {
    id: 'hinglish', platform: 'instagram-reels', targetSec: null, language: 'hi',
    scenes: [
      S({ key: 'cta', source: 'c', endTime: 3, transcription: 'Abhi link pe click karke apna le lo.', importance: 0.5 }),
      S({ key: 'problem', source: 'p', endTime: 3, transcription: 'Yaar mera purana phone ka camera ekdum bekaar hai, photos blurry aati hain.', importance: 0.9 }),
      S({ key: 'solution', source: 's', endTime: 4, transcription: 'Ye naya phone dekho, iska camera bahut sharp hai aur low light mein bhi mast.', importance: 0.75 }),
    ],
    good: ['problem', 'solution', 'cta'],
    events: { c: [{ timestampMs: 500, kind: 'cta' }] },
  },

  // ── PRESERVE: multi-source PROCEDURAL, already in causal order. Reordering BREAKS it. ──
  // Sources are named so the digest's source sort == the causal order; `good` == that order.
  // The payoff/result step carries HIGHER importance to TEMPT the model to lead with it.
  {
    id: 'recipe-steps', platform: 'youtube-shorts', targetSec: null, preserve: true,
    scenes: [
      S({ key: 'crack', source: '1crack', endTime: 4, transcription: 'First, crack three eggs into a bowl.', importance: 0.5 }),
      S({ key: 'whisk', source: '2whisk', endTime: 4, transcription: 'Whisk them with a splash of milk until the mixture is smooth.', importance: 0.5 }),
      S({ key: 'cook', source: '3cook', endTime: 4, transcription: 'Pour it into a hot buttered pan and stir gently as it sets.', importance: 0.5 }),
      S({ key: 'plate', source: '4plate', endTime: 4, transcription: 'Slide the finished omelette onto a plate and serve hot.', importance: 0.85 }),
    ],
    good: ['crack', 'whisk', 'cook', 'plate'],
  },
  {
    id: 'software-tutorial', platform: 'youtube', targetSec: null, preserve: true,
    scenes: [
      S({ key: 'open', source: '1open', endTime: 4, transcription: 'Open the app and sign in with your account.', importance: 0.5 }),
      S({ key: 'nav', source: '2nav', endTime: 4, transcription: 'Then go to Settings in the top right corner.', importance: 0.5 }),
      S({ key: 'toggle', source: '3toggle', endTime: 4, transcription: 'Scroll down and turn on Dark Mode.', importance: 0.5 }),
      S({ key: 'save', source: '4save', endTime: 4, transcription: 'Finally, hit Save and your theme is applied.', importance: 0.8 }),
    ],
    good: ['open', 'nav', 'toggle', 'save'],
  },
  {
    id: 'assembly-steps', platform: 'youtube', targetSec: null, preserve: true,
    scenes: [
      S({ key: 'unbox', source: '1unbox', endTime: 4, transcription: 'Take all the parts out of the box and lay them flat.', importance: 0.5 }),
      S({ key: 'legs', source: '2legs', endTime: 4, transcription: 'Attach the four legs to the underside of the base.', importance: 0.5 }),
      S({ key: 'top', source: '3top', endTime: 4, transcription: 'Set the tabletop on and screw it down at each corner.', importance: 0.5 }),
      S({ key: 'done', source: '4done', endTime: 4, transcription: 'Flip it upright and your new desk is ready to use.', importance: 0.85 }),
    ],
    good: ['unbox', 'legs', 'top', 'done'],
  },
];

function buildScenes(c: Case): { scenes: Scene[]; keyById: Map<string, string>; sourceByKey: Map<string, string> } {
  const keyById = new Map<string, string>();
  const sourceByKey = new Map<string, string>();
  const sorted = [...c.scenes].sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : a.startTime - b.startTime));
  let scenes = sorted.map((s) => {
    const scene = makeScene(s);
    keyById.set((s as { key: string }).key, scene.id);
    sourceByKey.set((s as { key: string }).key, scene.source);
    return scene;
  });
  if (ENRICH) {
    const sources = new Map<string, NarrativeSignalSource>();
    if (c.events) for (const [key, events] of Object.entries(c.events)) {
      const src = sourceByKey.get(key);
      if (src) sources.set(src, { events, durationMs: 60_000 });
    }
    scenes = enrichScenes(scenes, sources.size > 0 ? { sources } : undefined);
  }
  return { scenes, keyById, sourceByKey };
}

async function runCase(c: Case, seed: number) {
  const { scenes, keyById } = buildScenes(c);
  const digests = buildOrderingDigest(scenes);
  const prompt = buildOrderingPrompt(digests, {
    platform: c.platform, targetDurationSec: c.targetSec, language: c.language,
    mode: c.preserve ? 'procedural' : 'narrative', // B7: procedural prompt for the preserve cases
  });
  const raw = await callLLM(prompt, seed);
  const { plan, error } = parseOrderingResponse(raw, digests);
  if (!plan) return { error: error ?? 'no plan', valid: false, recovery: null as SequenceRecovery | null };
  const validation = validateOrderingPlan(plan, scenes, { targetDurationSec: c.targetSec });
  const goodIds = c.good.map((k) => keyById.get(k)!);
  const recovery = sequenceRecovery(plan.order.map((o) => o.sourceRef), goodIds);
  return { valid: validation.valid, issues: validation.issues, warnings: validation.warnings, recovery, rationale: plan.rationale };
}

async function main() {
  console.log(`Provider: ${PROVIDER} ${MODEL} | seeds: 1..${SEEDS} | enrich: ${ENRICH ? 'ON' : 'off'} | cases: ${CASES.length}\n`);
  console.log('case                    | kind      | seed | valid | pairwise | hook | exact | order');
  console.log('------------------------|-----------|------|-------|----------|------|-------|------');
  const narr: SequenceRecovery[] = [];
  const pres: SequenceRecovery[] = [];

  let firstCall = true;
  for (const c of CASES) {
    if (ONLY === 'preserve' && !c.preserve) continue;
    if (ONLY === 'narrative' && c.preserve) continue;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const kind = c.preserve ? 'PRESERVE' : 'narrative';
      if (!firstCall && DELAY > 0) await sleep(DELAY);
      firstCall = false;
      try {
        const r = await runCase(c, seed);
        if (r.error || !r.recovery) {
          console.log(`${c.id.padEnd(23)} | ${kind.padEnd(9)} | ${String(seed).padStart(4)} | ERR   |          |      |       | ${r.error}`);
          continue;
        }
        (c.preserve ? pres : narr).push(r.recovery);
        const rc = r.recovery;
        console.log(`${c.id.padEnd(23)} | ${kind.padEnd(9)} | ${String(seed).padStart(4)} | ${r.valid ? ' ok  ' : 'FAIL '} | ${rc.pairwiseAccuracy.toFixed(2).padStart(8)} | ${rc.hookMatch ? ' yes' : ' no '} | ${rc.exactMatch ? ' yes ' : ' no  '} | ${rationaleShort(r.rationale)}`);
      } catch (e) {
        console.log(`${c.id.padEnd(23)} | ${kind.padEnd(9)} | ${String(seed).padStart(4)} | THROW | ${(e as Error).message.slice(0, 60)}`);
      }
    }
  }

  report('NARRATIVE (reordering is correct)', narr);
  report('PRESERVE (must NOT scramble — low pairwise = the always-story prompt breaks procedural)', pres);
}

function rationaleShort(r?: string): string {
  return r ? r.slice(0, 40) : '';
}

function report(label: string, recs: SequenceRecovery[]) {
  if (recs.length === 0) return;
  const agg = aggregateRecovery(recs);
  console.log(`\n=== ${label} — n=${recs.length} ===`);
  console.log(`  mean pairwise recovery: ${agg.meanPairwiseAccuracy.toFixed(3)}`);
  console.log(`  hook-match rate:        ${(agg.hookMatchRate * 100).toFixed(0)}%`);
  console.log(`  exact-match rate:       ${(agg.exactMatchRate * 100).toFixed(0)}%`);
}

main().catch((e) => { console.error(e); process.exit(1); });
