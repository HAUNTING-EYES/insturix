/**
 * knob-parser LIVE eval (Rule 35: score against a real model before shipping the prompt).
 *
 * This runs the REAL prod path - buildKnobParserPrompt -> Gemini -> parseKnobResponse - over the
 * KNOB_CASES fixture and scores per-field precision/recall + hallucinations. It is OPT-IN: it runs
 * only when a Google API key AND RUN_LIVE_EVAL=1 are both set, so it never makes network calls in
 * normal CI (a live-LLM eval is a manual gate, not an automatic test). Run it:
 *   RUN_LIVE_EVAL=1 GEMINI_API_KEY=... npx vitest run tests/thinkforge/knob-parser-live-eval.test.ts
 *
 * The bar (handoff): ZERO hallucinations on the trap cases (a knob invented from vibe words is a
 * damage-8 failure), and per-field precision >= 0.9. Seed fixed (Rule 35: temperature 0 is not
 * deterministic on its own). Model = gemini-2.5-flash-lite (the extraction tier), throttled to the
 * free-tier RPM. LAST RESULT (2026-07-10): 14/14 cases, cleanCaseRate 1.00, 0 hallucinations,
 * every field precision=recall=1.00 (incl. Hinglish + all 5 vibe-only trap cases -> {}).
 */

import { generateText } from 'ai';
import { describe, expect, it } from 'vitest';

import { createThinkForgeModelForRoute } from '@/lib/thinkforge/agents/model-factory';
import { KNOB_CASES } from '@/lib/thinkforge/intake/knob-parser-cases';
import { KNOB_FIELDS, scoreKnobCases, tallyCase } from '@/lib/thinkforge/intake/knob-parser-eval';
import { buildKnobParserPrompt, parseKnobResponse, type RequestedKnobs } from '@/lib/thinkforge/intake/prompt-knob-parser';

const HAS_KEY = !!(
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY
);
/** Opt-in: only run when explicitly asked AND a key exists - never an automatic CI network call. */
const RUN_LIVE = HAS_KEY && process.env.RUN_LIVE_EVAL === '1';

const SEED = 7;
const PRECISION_BAR = 0.9;
/** flash-lite = the extraction/structural tier (factory's own note) + higher free-tier RPM. */
const EVAL_MODEL = 'gemini-2.5-flash-lite';
/** Space calls to stay under the free-tier RPM limit (a live eval, not a hot path). */
const THROTTLE_MS = 5_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!RUN_LIVE)('knob parser LIVE eval (Gemini)', () => {
  it('extracts stated knobs with zero trap hallucinations and high precision', async () => {
    const model = createThinkForgeModelForRoute({
      routePurpose: 'structural',
      privacyClass: 'business_confidential',
      modelName: EVAL_MODEL,
    });

    const pairs: { produced: RequestedKnobs; expected: RequestedKnobs; id: string }[] = [];
    for (let i = 0; i < KNOB_CASES.length; i++) {
      const c = KNOB_CASES[i];
      if (i > 0) await sleep(THROTTLE_MS);
      const { text } = await generateText({
        model,
        prompt: buildKnobParserPrompt(c.prompt),
        temperature: 0,
        seed: SEED,
      });
      pairs.push({ produced: parseKnobResponse(text), expected: c.expected, id: c.id });
    }

    const report = scoreKnobCases(pairs);

    // Full per-field report + every miss/hallucination, so a failing run is diagnosable.
    console.log('\n=== KNOB PARSER LIVE EVAL (Gemini, seed=' + SEED + ') ===');
    console.log(`cases=${report.cases} cleanCaseRate=${report.cleanCaseRate.toFixed(2)} ` +
      `hallucinations=${report.totalHallucinations} meanP=${report.meanPrecision.toFixed(2)} meanR=${report.meanRecall.toFixed(2)}`);
    for (const f of KNOB_FIELDS) {
      const s = report.perField[f];
      console.log(`  ${f}: P=${s.precision.toFixed(2)} R=${s.recall.toFixed(2)} (tp=${s.truePositives} fp=${s.falsePositives} fn=${s.falseNegatives} support=${s.support})`);
    }
    for (const p of pairs) {
      // Order-insensitive: only flag fields the scorer actually counts as wrong (fp/fn), not key order.
      const t = tallyCase(p.produced, p.expected);
      const wrong = KNOB_FIELDS.filter((f) => t[f].falsePositive || t[f].falseNegative);
      if (wrong.length > 0) {
        console.log(`  DIFF [${p.id}] fields=${wrong.join(',')} expected=${JSON.stringify(p.expected)} got=${JSON.stringify(p.produced)}`);
      }
    }

    // The bar.
    expect(report.totalHallucinations, 'invented a knob the user never stated').toBe(0);
    for (const f of KNOB_FIELDS) {
      expect(report.perField[f].precision, `precision on ${f}`).toBeGreaterThanOrEqual(PRECISION_BAR);
    }
  }, 180_000);
});
