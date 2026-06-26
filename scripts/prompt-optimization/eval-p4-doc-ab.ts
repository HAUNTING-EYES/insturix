/**
 * P4 doc-benefit A/B: does the writing-knowledge cache doc actually improve ScriptWriter output?
 *   WITH-DOC   = ScriptWriterAgent.runStructured (P4 cache path; loads creative-content-knowledge.md)
 *   WITHOUT-DOC = direct generateObject with the same buildPrompt + schema (no doc) — the harness pattern
 * Same prompts, N samples each, scored deterministically, averaged.
 * Usage: GEMINI_API_KEY=xxx npx tsx scripts/prompt-optimization/eval-p4-doc-ab.ts [--samples=3]
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateObject } from 'ai';
import {
  ScriptWriterAgent,
  ScriptWriterResultSchema,
  type ScriptWriterInput,
  type ScriptWriterResult,
} from '../../lib/thinkforge/agents/script-writer-agent';
import { createThinkForgeModel } from '../../lib/thinkforge/agents/model-factory';
import { getAntiAiConstraintBundle } from '../../lib/thinkforge/data/writing-graph-query';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!API_KEY) { console.error('No GEMINI_API_KEY. Set it or pass GEMINI_API_KEY=xxx.'); process.exit(1); }

const samplesArg = process.argv.find(a => a.startsWith('--samples='));
const SAMPLES = samplesArg ? Math.max(1, parseInt(samplesArg.split('=')[1] ?? '3', 10)) : 3;

const FILLER = getAntiAiConstraintBundle().fillerPatterns.map(p => ({ regex: new RegExp(p.pattern, 'i'), label: p.label }));

interface Case { name: string; input: ScriptWriterInput; facts: string[]; }
const CASES: Case[] = [
  {
    name: 'Product launch (grounding-heavy)',
    facts: ['Acme Coffee', 'Cold Brew Reserve', 'June 20', '$12'],
    input: {
      context: {
        projectSummary: 'Acme Coffee, a specialty roaster, launches a limited cold brew.',
        systemBrief: 'Brand: Acme Coffee. Voice: warm, specific, no fluff. Never invent dates, prices, or names.',
      },
      userPrompt: 'Write a 30-second video script for Acme Coffee launching "Cold Brew Reserve" on June 20 at $12 a bottle. 3-4 scenes.',
      project: { format: 'video_script', platform: 'instagram' },
    } as unknown as ScriptWriterInput,
  },
  {
    name: 'How-to tutorial',
    facts: ['Stripe', 'webhook', 'endpoint'],
    input: {
      context: {
        projectSummary: 'A developer-tools brand teaches Stripe integration.',
        systemBrief: 'Voice: clear, technical, no filler. Preserve exact technical terms.',
      },
      userPrompt: 'Write a 45-second tutorial script: how to set up a Stripe webhook endpoint in 3 steps.',
      project: { format: 'video_script', platform: 'youtube' },
    } as unknown as ScriptWriterInput,
  },
];

function scoreScript(content: string, scenePrompts: string[], facts: string[]): { score: number; fails: string[] } {
  const fails: string[] = [];
  let score = 0;
  if (/^##\s*Scene/im.test(content) && /narration:/i.test(content) && /visual:/i.test(content)) score++; else fails.push('weak-structure');
  const generic = /^(cinematic|modern|professional|dynamic|stunning|beautiful)\b.{0,25}$/i;
  if (scenePrompts.length > 0 && scenePrompts.every(p => p.trim().length > 30 && !generic.test(p.trim()))) score++; else fails.push('generic/missing-scenePrompts');
  const f = FILLER.find(x => x.regex.test(content));
  if (!f) score++; else fails.push(`filler:${f.label}`);
  const kept = facts.filter(x => content.includes(x));
  if (kept.length === facts.length) score++; else fails.push(`facts ${kept.length}/${facts.length}`);
  if (content.trim().length > 200) score++; else fails.push('too-short');
  return { score, fails };
}

async function run() {
  const model = createThinkForgeModel('gemini-2.5-flash');
  const agent = new ScriptWriterAgent();
  const agg = { withDoc: { total: 0, n: 0, cacheEngaged: 0, fellBack: 0 }, noDoc: { total: 0, n: 0 } };

  for (const c of CASES) {
    console.log(`\n=== ${c.name} ===`);
    for (let s = 1; s <= SAMPLES; s++) {
      try {
        const { result, metadata } = await agent.runStructured(c.input, { temperature: 0.7 });
        const sc = scoreScript(result.content, result.visualMetadata.scenePrompts, c.facts);
        const notes = String((metadata as { notes?: string })?.notes || '');
        const engaged = /writing_context_cache:(hit|created)/.test(notes);
        const fellBack = !/writing_context_cache:/.test(notes);
        agg.withDoc.total += sc.score; agg.withDoc.n++;
        if (engaged) agg.withDoc.cacheEngaged++;
        if (fellBack) agg.withDoc.fellBack++;
        console.log(`  [WITH-DOC ${s}] ${sc.score}/5 (${notes || 'fellback-to-base'}) ${sc.fails.join(', ')}`);
      } catch (e) { console.log(`  [WITH-DOC ${s}] ERROR:`, e instanceof Error ? e.message.slice(0, 140) : e); }

      try {
        const prompt = agent.buildPrompt(c.input);
        const { object } = await generateObject({ model, schema: ScriptWriterResultSchema, prompt, temperature: 0.7, seed: 40 + s } as Parameters<typeof generateObject>[0]);
        const r = object as ScriptWriterResult;
        const sc = scoreScript(r.content, r.visualMetadata.scenePrompts, c.facts);
        agg.noDoc.total += sc.score; agg.noDoc.n++;
        console.log(`  [NO-DOC   ${s}] ${sc.score}/5 ${sc.fails.join(', ')}`);
      } catch (e) { console.log(`  [NO-DOC   ${s}] ERROR:`, e instanceof Error ? e.message.slice(0, 140) : e); }
    }
  }

  const wAvg = agg.withDoc.n ? agg.withDoc.total / agg.withDoc.n : 0;
  const nAvg = agg.noDoc.n ? agg.noDoc.total / agg.noDoc.n : 0;
  const delta = wAvg - nAvg;
  console.log('\n=== P4 DOC A/B SUMMARY ===');
  console.log(`WITH-DOC avg: ${wAvg.toFixed(2)}/5 (n=${agg.withDoc.n}); cache engaged ${agg.withDoc.cacheEngaged}/${agg.withDoc.n}; fell back to base ${agg.withDoc.fellBack}/${agg.withDoc.n}`);
  console.log(`NO-DOC   avg: ${nAvg.toFixed(2)}/5 (n=${agg.noDoc.n})`);
  console.log(`DELTA (with - without): ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`);
  console.log(delta > 0.3 ? 'VERDICT: DOC HELPS — keep P4' : delta < -0.3 ? 'VERDICT: DOC HURTS — revert P4' : 'VERDICT: NO MEANINGFUL DIFFERENCE — P4 not worth the cache complexity');
}

run().catch(e => { console.error(e); process.exit(1); });
