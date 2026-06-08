# Prompt Engineering Playbook

**Who this is for:** anyone improving an LLM prompt in any service (analysis, classification, creative briefs, scene parsing, motion graphics, agents).

**Why it exists:** prompts are code that regresses silently. A prompt that "looks fine" can swing wildly run-to-run and you won't notice until a user gets a bad video. This is the loop we used to take the transcript editor from a **37% failure rate to F1 = 1.000 across 10/10 seeds**. Follow it for every other service.

> Snapshot date: 2026-06-02. The "Service hit-list" at the bottom is a point-in-time map — re-check a file's current state before you start on it.

---

## The one rule

**Never tune a prompt by deploying and eyeballing the output.** Build a local eval harness that scores the prompt against a known-good answer, run it across multiple seeds, and only ship when the *worst* seed is good. Everything below is how to do that.

---

## Why your prompt needs this

Three failure modes, all invisible without an eval harness:

1. **Non-determinism.** `temperature: 0.0` is *not* deterministic on Gemini. The same prompt produced F1 from 0.70 to 1.00 across runs. In production that's the difference between a clean cut and a destroyed video, at random.
2. **Silent regression.** You "improve" the prompt for one case and quietly break three others. No test = no alarm.
3. **Overfitting to one input.** A prompt that's perfect on one video is untested on interviews, tutorials, ads, documentaries. (Rule 0: it has to work for all content types.)

Seed kills #1. The eval harness catches #2 and #3.

---

## The loop (do these in order)

### Step 0 — Freeze a ground truth
Pick a **real** input (not a toy) and a known-good output. For the transcript editor that's [`scripts/prompt-optimization/hank-green-test-data.json`](../scripts/prompt-optimization/hank-green-test-data.json): a real 2884-word vlog plus the "stable run" keep-ranges as the answer key.

- Use real data from a real project, cached to a JSON file so the harness is offline and fast.
- For subjective tasks (scene parsing), build the answer key by hand once — see [`scripts/dspy-eval/build_ground_truth.py`](../scripts/dspy-eval/build_ground_truth.py), which runs the prompt once then walks you through verifying each output.
- **Use more than one input.** One video is how you ship a prompt that only works on that video.

### Step 1 — Write a local eval harness
Copy [`scripts/prompt-optimization/eval-transcript-editor.mjs`](../scripts/prompt-optimization/eval-transcript-editor.mjs) and swap three things: the prompt builder, the ground-truth file, and the scorer. Skeleton at the bottom of this doc.

### Step 2 — Score against ground truth with real metrics
Don't score "looks good." Compute **precision, recall, F1** against the answer key. The transcript harness does this at the word level: build a Set of kept word-indices for the AI output and for ground truth, count true-positives / false-positives / false-negatives, derive precision/recall/F1 ([`eval-transcript-editor.mjs:84`](../scripts/prompt-optimization/eval-transcript-editor.mjs)). Add task-specific checks too (it also regex-checks that production meta-commentary got cut).

Pick the metric that matches the task:
- **Cut/keep, classification, extraction** → precision / recall / F1 against labels.
- **Structured output (scenes, recipes)** → a weighted composite over the fields that matter (see the scene parser's 6-dimension score).

### Step 3 — Set the seed, then run multi-seed
Add `seed` to `generationConfig`, then run seeds **1–10** and judge on the **minimum F1, not the max**.

```bash
# single seed
GEMINI_API_KEY=xxx node scripts/prompt-optimization/eval-<your-service>.mjs --seed=1
# all 10
GEMINI_API_KEY=xxx node scripts/prompt-optimization/eval-<your-service>.mjs --multi-seed
```

- A prompt that's 0.95 on one seed and 0.70 on another is **fragile — do not ship.**
- A prompt that's ≥0.90 on *every* seed is **robust — ship.**

### Step 4 — Iterate the prompt text (the craft rules below)
Change the prompt, re-run the harness (~30s), repeat. This is 10x faster than deploy-and-check (5+ min).

### Step 5 — Ship: pin the winning seed in the service
Once min-F1 ≥ 0.90, hardcode the seed and config into the production service. Reference: [`lib/editron/services/transcript-editor.ts:131`](../lib/editron/services/transcript-editor.ts).

---

## Prompt-craft rules (what actually moves the score)

These come straight from the runs that worked. They're in the auto-injected Rule 35 too.

1. **XML structure.** Delimit sections: `<role>`, `<task>`, `<rules>`, `<output_format>`, and the data in `<transcript>` / `<input_data>`. Clear boundaries beat prose.
2. **Data LAST.** Put the big input (transcript, script, document) at the **end**, after all instructions. If instructions come after a 2884-word blob, the model loses them.
3. **Rules, not examples.** Few-shot examples cause pattern-anchoring — the model mimics the example's shape and scale instead of learning the principle, and you risk leaking test data. Write explicit rules instead.
4. **Narrow the rules.** "ONLY CUT these 4 specific patterns" + "DO NOT CUT these 6 things" beats "remove unnecessary content." Vague rules get interpreted differently every run.
5. **Conservative default.** "When unsure, KEEP." Define the small set of things to *act on*, not the big set to *leave alone*. A user can always trim more; they can't un-cut.
6. **Chain-of-thought up front.** Tell the model what to think about before it answers: "First scan for X, then produce Y."

See the live prompt at [`transcript-editor.ts:68`](../lib/editron/services/transcript-editor.ts) for all six in one place.

---

## Two production patterns to copy

### Pattern A — single deterministic call (most services)
[`lib/editron/services/transcript-editor.ts:131`](../lib/editron/services/transcript-editor.ts):

```ts
const result = await model.generateContent({
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.0,
    seed: 1,            // pinned after eval picked it
  },
});
```

### Pattern B — seed-as-retry for fragile JSON (long / large-output prompts)
[`lib/editron/services/creative-brief.ts:234`](../lib/editron/services/creative-brief.ts) runs the same call across `[42, 7, 99]` and takes the first that parses. Big outputs (here, `maxOutputTokens: 65536`) truncate ~20% of the time on a given seed; a different seed takes a different completion path and usually parses clean. So seed buys you **determinism *and* a cheap retry that fixes truncation** without changing the prompt.

```ts
const seeds = [42, 7, 99];
for (const seed of seeds) {
  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
    generationConfig: { ...generationConfig, seed },
  });
  // parse; if empty/invalid JSON, continue to next seed
}
```

Use A by default. Use B when the output is large and JSON parse failures are real.

---

## The eval harness, copy-this skeleton

Generalized from [`eval-transcript-editor.mjs`](../scripts/prompt-optimization/eval-transcript-editor.mjs). Mirror **the same model + SDK your production service uses** (we use the native `@google/generative-ai` SDK via [`lib/editron/utils/gemini-model-factory.ts`](../lib/editron/utils/gemini-model-factory.ts) — your harness should match it, or you're testing a different thing than you ship).

```js
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genai.getGenerativeModel({ model: 'gemini-3.1-pro-preview' }); // match prod

const { input, groundTruth } = JSON.parse(fs.readFileSync('./your-test-data.json', 'utf-8'));

function buildPrompt(input) { /* mirror your service's buildPrompt exactly */ }

function score(aiOut, gt) {
  // TP/FP/FN -> precision, recall, f1. Add task-specific checks.
  return { f1, precision, recall };
}

async function runOnce(seed) {
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.0, seed },
  });
  return score(JSON.parse(result.response.text()), groundTruth);
}

// --multi-seed: loop 1..10, print the table, look at the MIN f1.
for (let s = 1; s <= 10; s++) console.log(s, (await runOnce(s)).f1);
```

---

## Gotchas we already paid for (don't re-pay)

1. **Make sure the seed actually reaches the API.** The deprecated Python `google.generativeai` SDK **silently drops `seed`** — [`eval_scene_parser.py:787`](../scripts/dspy-eval/eval_scene_parser.py) logs seeds 1-10 but sends identical calls, so its "multi-seed robustness" is meaningless. Our JS path *sets* seed in code; **verify once** that it's transmitted on the wire (log the request body or check your `@google/generative-ai` version) before you trust a "seeded" claim. If in doubt, migrate that harness to the new `google.genai` SDK, which supports seed natively.
2. **`temperature: 0` is not determinism.** Only seed is. Don't rely on low temperature alone.
3. **One video lies to you.** Score against several real inputs across content types. The methodology's own worst failure was "looked great on Hank Green, untested elsewhere."
4. **Keep harness and prod aligned.** Same model name, same SDK, same prompt builder, same seed. The transcript harness defaults single-run to seed 42 but prod pins seed 1 — that kind of drift means your eval isn't testing what ships. Pick one and match.
5. **Don't deploy to test.** 5+ min per cycle, and users see the breakage. Local harness is the point.
6. **Judge on min-F1, never max.** Cherry-picking the best seed is how fragile prompts ship.

---

## Service hit-list (where to apply this next)

Current state as of 2026-06-02. **Verify each file before starting** (grep the call site; state may have changed).

| Service | File | State | Action |
|---|---|---|---|
| Transcript editor | `lib/editron/services/transcript-editor.ts` | ✅ seeded (1) + eval harness + ground truth | Reference. Copy this. |
| Creative brief | `lib/editron/services/creative-brief.ts` | ✅ seeded (42) + retry `[42,7,99]` + `.mjs` eval | Good. Add more ground-truth inputs. |
| Aesthetic gate | `lib/editron/motion-graphics/engine/aesthetic-gate.ts` | ☑️ seeded (42) — *reported, verify* | Confirm seed transmits; add eval. |
| Scene parser | `lib/pipeline/llm-scene-parser.ts` + `scripts/dspy-eval/` | ⚠️ has eval + DSPy optimizer, but **seed not sent** (Python SDK) | Migrate eval to `google.genai` so seeds are real. |
| Five-track analysis | `lib/editron/services/five-track-analysis.ts` | ❌ no seed (multiple calls) | Classifier-like → high value. Add seed + eval. |
| Editorial intent detector | `lib/editron/services/editorial-intent-detector.ts` | ❌ no seed | Classification → seed + eval. |
| Holistic editor | `lib/editron/services/holistic-editor.ts` | ❌ no seed | Add seed + eval. |
| Motion graphics service | `lib/editron/services/motion-graphics-service.ts` | ❌ no seed | Add seed + eval. |
| Agent / chat tools | `lib/editron/agent/agent-graph.ts`, `tools.ts` | ❌ no seed | Interactive/creative — seed optional, decide per-case. |

> The unseeded rows come from a code-map sweep, not a line-by-line audit of each. Treat them as leads: open the file, confirm there's no `seed`, decide if the task needs determinism (parsers/classifiers yes; open-ended creative generation maybe not), then apply the loop.

---

## Definition of done (PR checklist)

Before merging a prompt change:

- [ ] Prompt uses XML structure, data-last, rules-not-examples, conservative default.
- [ ] `seed` set in `generationConfig` (and verified it transmits on the wire).
- [ ] Local eval harness exists and scores against a real ground truth.
- [ ] Ground truth covers **2+ content types**, not one video.
- [ ] `--multi-seed` (1–10) run; **min F1 ≥ 0.90** pasted into the PR.
- [ ] Winning seed pinned in the service; harness model/SDK matches production.
- [ ] No few-shot examples sneaking in.

---

## References

- Live prompt + seed: [`transcript-editor.ts`](../lib/editron/services/transcript-editor.ts)
- Seed-retry pattern: [`creative-brief.ts`](../lib/editron/services/creative-brief.ts)
- Canonical harness: [`eval-transcript-editor.mjs`](../scripts/prompt-optimization/eval-transcript-editor.mjs)
- Model factory (SDK + model names): [`gemini-model-factory.ts`](../lib/editron/utils/gemini-model-factory.ts)
- Ground-truth builder: [`build_ground_truth.py`](../scripts/dspy-eval/build_ground_truth.py)
- DSPy auto-optimizer (scene parser): [`scripts/dspy-eval/`](../scripts/dspy-eval/)
- Rule 35 (auto-injected into every session) is the short version of this doc.
