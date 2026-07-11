/**
 * Local eval harness for the SaaS-explainer narration-led VO writer (Rule 35).
 *
 * TRUE INTEGRATION TEST: imports writeFlowingVoScript directly, so the eval uses the EXACT production prompt.
 * The narration-led path is flag-gated (SAAS_EXPLAINER_NARRATION_LED) and must NOT ship live until this passes.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-explainer-vo.ts
 *   GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-explainer-vo.ts --multi-seed   # seeds 1..8
 *
 * Scores STRUCTURAL adherence (coverage, word budget, CTA spoken, grounding). It does not judge prose quality —
 * eyeball a couple of printed scripts for flow. ~30s/run vs a 5-min deploy cycle.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import {
  writeFlowingVoScript,
  voWordBudget,
  type VoScriptBeat,
} from "../../lib/editron/saas-explainer/vo-script";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env.local") });

if (!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
  console.error("No GEMINI_API_KEY. Set it in .env.local (the live key is in Vercel dev env) or pass GEMINI_API_KEY=xxx.");
  process.exit(1);
}

const multiSeed = process.argv.includes("--multi-seed");
const SEEDS = multiSeed ? [1, 2, 3, 4, 5, 6, 7, 8] : [1];

// ── Fixtures: realistic director-beat sequences + grounding ────────────────────────────────────────────────
interface Fixture {
  name: string;
  totalDurationSec: number;
  beats: VoScriptBeat[];
  brandContextPrompt: string;
  productEvidencePrompt: string;
}

const FIXTURES: Fixture[] = [
  {
    name: "Approval-ops SaaS, 60s",
    totalDurationSec: 60,
    brandContextPrompt: "Brand: FlowDesk. Audience: agency operators. Voice: plain, confident, no hype.",
    productEvidencePrompt:
      "Product: FlowDesk routes client approvals into one lane. Verified facts: one named owner per approval; a single shared timeline; comment threads collapse into the timeline. No metrics available.",
    beats: [
      { index: 0, family: "hook", copyRole: "hook", durationSec: 5, directorNotes: ["Cold open on approval chaos"] },
      { index: 1, family: "problem", copyRole: "problem", durationSec: 12, directorNotes: ["Scattered threads"] },
      { index: 2, family: "feature_demo", copyRole: "feature_demo", durationSec: 14, directorNotes: ["One lane"] },
      { index: 3, family: "ui_proof", copyRole: "ui_proof", durationSec: 5, directorNotes: ["Timeline hold"] },
      { index: 4, family: "workflow_demo", copyRole: "workflow_demo", durationSec: 14, directorNotes: ["Owner assigned"] },
      { index: 5, family: "cta", copyRole: "cta", durationSec: 5, directorNotes: ["Brand close"] },
    ],
  },
  {
    name: "Analytics SaaS, 45s",
    totalDurationSec: 45,
    brandContextPrompt: "Brand: Pulse. Audience: B2B founders. Voice: sharp, specific.",
    productEvidencePrompt:
      "Product: Pulse turns raw product events into a weekly focus. Verified facts: connects to your event stream; one weekly digest; highlights the metric that moved. No customer names or percentages available.",
    beats: [
      { index: 0, family: "hook", copyRole: "hook", durationSec: 4, directorNotes: ["Noise of dashboards"] },
      { index: 1, family: "promise", copyRole: "promise", durationSec: 8, directorNotes: ["One focus"] },
      { index: 2, family: "feature_demo", copyRole: "feature_demo", durationSec: 15, directorNotes: ["Weekly digest"] },
      { index: 3, family: "ui_proof", copyRole: "ui_proof", durationSec: 5, directorNotes: ["Digest hold"] },
      { index: 4, family: "cta", copyRole: "cta", durationSec: 5, directorNotes: ["Sign up"] },
    ],
  },
];

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
// Numbers present in the grounding are fair game; any OTHER number in the VO is a likely fabrication.
function fabricatedNumbers(vo: string, grounding: string): string[] {
  const allowed = new Set(grounding.match(/\d+(?:\.\d+)?%?/g) ?? []);
  return (vo.match(/\d+(?:\.\d+)?%?/g) ?? []).filter((n) => !allowed.has(n));
}

async function scoreOne(fx: Fixture, seed: number) {
  const { lines } = await writeFlowingVoScript({
    beats: fx.beats,
    totalDurationSec: fx.totalDurationSec,
    brandContextPrompt: fx.brandContextPrompt,
    productEvidencePrompt: fx.productEvidencePrompt,
    seed,
  });
  const grounding = `${fx.brandContextPrompt}\n${fx.productEvidencePrompt}`;
  const spoken = lines.filter((l) => l.vo.trim());
  const totalWords = lines.reduce((n, l) => n + wordCount(l.vo), 0);
  const budget = voWordBudget(fx.totalDurationSec);
  const coverage = spoken.length / fx.beats.length;
  const cta = lines.find((l) => l.index === fx.beats[fx.beats.length - 1].index);
  const ctaSpoken = !!cta?.vo.trim();
  const allPresent = fx.beats.every((b) => lines.some((l) => l.index === b.index));
  const fabricated = lines.flatMap((l) => fabricatedNumbers(l.vo, grounding));
  const budgetErr = Math.abs(totalWords - budget) / budget;

  const pass = coverage >= 0.6 && coverage <= 1.0 && ctaSpoken && allPresent && fabricated.length === 0 && budgetErr <= 0.4;
  return { coverage, totalWords, budget, budgetErr, ctaSpoken, allPresent, fabricated, pass, lines };
}

async function main() {
  let passes = 0;
  let runs = 0;
  for (const fx of FIXTURES) {
    console.log(`\n=== ${fx.name} ===`);
    for (const seed of SEEDS) {
      runs++;
      try {
        const r = await scoreOne(fx, seed);
        if (r.pass) passes++;
        console.log(
          `seed ${seed}: ${r.pass ? "PASS" : "FAIL"} | coverage ${(r.coverage * 100).toFixed(0)}% | ` +
            `words ${r.totalWords}/${r.budget} (±${(r.budgetErr * 100).toFixed(0)}%) | cta=${r.ctaSpoken} | ` +
            `allBeats=${r.allPresent} | fabricated=[${r.fabricated.join(", ")}]`,
        );
        if (seed === SEEDS[0]) {
          console.log("  --- script ---");
          for (const l of r.lines) console.log(`  [${l.index}] ${l.vo || "(silent hold)"}`);
        }
      } catch (e) {
        console.log(`seed ${seed}: ERROR ${String(e)}`);
      }
    }
  }
  console.log(`\nOVERALL: ${passes}/${runs} runs passed. Rule 35 bar: aim for all seeds passing before flipping SAAS_EXPLAINER_NARRATION_LED=1.`);
  process.exit(passes === runs ? 0 : 1);
}

void main();
