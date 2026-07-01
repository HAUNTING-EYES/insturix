/**
 * P5 edit-mode eval: validates the flat writers' revise-existing-content path (editContext).
 *
 * Each scenario has a MEASURABLE effect so we can score deterministically:
 *   - facts_preserved: every supplied fact still appears in the revised output
 *   - change_applied:  the requested change is observable (scene added/removed, CTA/hashtags added)
 *   - structure_ok:    scripts keep scene headers + narration/visual labels; posts keep a CTA
 *   - no_filler:       no banned AI-filler phrase
 *   - content_changed: the revision actually differs from the original
 *
 * Usage: GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-thinkforge-edit.ts [--seeds=3]
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ScriptWriterAgent, type ScriptWriterInput } from '../../lib/thinkforge/agents/script-writer-agent';
import { PostWriterAgent, type PostWriterInput } from '../../lib/thinkforge/agents/post-writer-agent';
import { getAntiAiConstraintBundle } from '../../lib/thinkforge/data/writing-graph-query';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!API_KEY) { console.error('No GEMINI_API_KEY. Set it or pass GEMINI_API_KEY=xxx.'); process.exit(1); }

const seedArg = process.argv.find(a => a.startsWith('--seeds='));
const SEEDS = seedArg ? Math.max(1, parseInt(seedArg.split('=')[1] ?? '3', 10)) : 3;

const FILLER = getAntiAiConstraintBundle().fillerPatterns.map(p => ({ regex: new RegExp(p.pattern, 'i'), label: p.label }));

const SCRIPT_FIXTURE = `## Scene 1: The Hook
**Narration:** Acme Cold Brew Reserve launches June 20 at $12 a bottle.
**Visual:** A frosted bottle on a marble counter, condensation beading.

## Scene 2: The Problem
**Narration:** Most cold brew is watery and bitter by noon.
**Visual:** A sad desk coffee, ice fully melted.

## Scene 3: The Proof
**Narration:** Acme steeps for 18 hours in small batches.
**Visual:** Slow-drip steeping tanks in a sunlit roastery.`;

const POST_FIXTURE = `Your agency's video team is drowning in revision cycles.

Insturix automates footage logging, rough cuts, and audio sync so your editors focus on story. Maple Studios cut turnaround from 5 days to 2.

Try it free at insturix.com/trial.

#VideoEditing #AgencyLife`;

interface EditScenario {
  name: string;
  writer: 'script' | 'post';
  existingContent: string;
  instruction: string;
  facts: string[];              // must survive into the revision
  check: (revised: string, original: string) => { changeApplied: boolean; structureOk: boolean };
}

function countScenes(s: string): number {
  return (s.match(/^\s*#{1,3}\s+Scene\s+\d+/gim) || []).length;
}
function countHashtags(s: string): number {
  return (s.match(/#\w+/g) || []).length;
}

const SCENARIOS: EditScenario[] = [
  {
    name: 'Script: add a closing CTA scene',
    writer: 'script',
    existingContent: SCRIPT_FIXTURE,
    instruction: 'Add a final closing scene with a call to action to pre-order at acme.coffee/reserve.',
    facts: ['June 20', '$12', '18 hours', 'acme.coffee/reserve'],
    check: (revised, original) => ({
      changeApplied: countScenes(revised) > countScenes(original) && /acme\.coffee\/reserve/i.test(revised),
      structureOk: /^\s*#{1,3}\s+Scene\s+\d+/im.test(revised) && /\*\*\s*(narration|vo|voiceover)\b/i.test(revised) && /\*\*\s*visual\b/i.test(revised),
    }),
  },
  {
    name: 'Script: remove the second scene',
    writer: 'script',
    existingContent: SCRIPT_FIXTURE,
    instruction: 'Remove the second scene (The Problem) entirely. Keep the rest as-is.',
    facts: ['June 20', '$12', '18 hours'],
    check: (revised, original) => ({
      changeApplied: countScenes(revised) < countScenes(original) && !/watery and bitter/i.test(revised),
      structureOk: /^\s*#{1,3}\s+Scene\s+\d+/im.test(revised) && /\*\*\s*(narration|vo|voiceover)\b/i.test(revised),
    }),
  },
  {
    name: 'Post: add hashtags + a question CTA',
    writer: 'post',
    existingContent: POST_FIXTURE,
    instruction: 'Add two more relevant hashtags and end with a specific question as the CTA.',
    facts: ['insturix.com/trial', 'Maple Studios', '5 days to 2'],
    check: (revised) => ({
      changeApplied: countHashtags(revised) >= 4 && /\?/.test(revised),
      structureOk: /#\w+/.test(revised),
    }),
  },
];

function scoreRevision(s: EditScenario, revised: string): { score: number; fails: string[] } {
  const fails: string[] = [];
  let score = 0;
  const { changeApplied, structureOk } = s.check(revised, s.existingContent);
  const factsKept = s.facts.filter(f => revised.includes(f));
  const filler = FILLER.find(f => f.regex.test(revised));
  const changed = revised.trim() !== s.existingContent.trim();

  if (factsKept.length === s.facts.length) score++; else fails.push(`facts ${factsKept.length}/${s.facts.length}`);
  if (changeApplied) score++; else fails.push('change_not_applied');
  if (structureOk) score++; else fails.push('structure_broken');
  if (!filler) score++; else fails.push(`filler:${filler.label}`);
  if (changed) score++; else fails.push('no_change');
  return { score, fails };
}

async function run() {
  const scriptWriter = new ScriptWriterAgent();
  const postWriter = new PostWriterAgent();
  let total = 0, n = 0, perfect = 0;

  for (const s of SCENARIOS) {
    console.log(`\n=== ${s.name} ===`);
    for (let seed = 1; seed <= SEEDS; seed++) {
      try {
        const base = {
          context: { projectSummary: 'Brand content edit.', systemBrief: 'Voice: specific, no fluff. Never invent facts.' },
          userPrompt: s.instruction,
          editContext: { existingContent: s.existingContent, instruction: s.instruction },
        };
        const { result } = s.writer === 'script'
          ? await scriptWriter.runStructured(base as unknown as ScriptWriterInput, { temperature: 0.6 })
          : await postWriter.runStructured(base as unknown as PostWriterInput, { temperature: 0.6 });
        const revised = (result as { content: string }).content;
        const sc = scoreRevision(s, revised);
        total += sc.score; n++; if (sc.score === 5) perfect++;
        console.log(`  [seed ${seed}] ${sc.score}/5 ${sc.fails.join(', ')}`);
      } catch (e) {
        n++; console.log(`  [seed ${seed}] ERROR:`, e instanceof Error ? e.message.slice(0, 120) : e);
      }
    }
  }

  const avg = n ? total / n : 0;
  console.log(`\n=== P5 EDIT EVAL SUMMARY ===`);
  console.log(`avg ${avg.toFixed(2)}/5 over ${n} runs; perfect ${perfect}/${n}`);
  console.log(avg >= 4.0 ? 'VERDICT: edit mode is SOUND (>=4.0/5) — safe to wire the route' : 'VERDICT: edit mode NEEDS WORK (<4.0/5) — do not wire yet');
  process.exit(avg >= 4.0 ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
