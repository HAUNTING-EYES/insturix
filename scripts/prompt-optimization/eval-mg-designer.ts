/**
 * DESIGNER EVAL (design-then-code Phase 2, Rule 35 — the harness gates the prompt before any production wiring).
 *
 * Drives the VIDEO-LEVEL designer on tonight's four e2e moments as ONE video (comparison / list / concept /
 * magnitude — the exact cases whose free-form generations scored form 4-5) and scores each candidate DESIGNER
 * model on hard criteria:
 *   1. parses    — strict JSON → Zod contract
 *   2. validates — validateDesignPlan clean (form floor, coverage, grounding, lanes)
 *   3. variety   — >= 3 distinct form families across the 4 moments (the anti-monotony budget, checked not vibed)
 *   4. designed  — every moment carries form elements and/or imagery (belt over the validator's braces)
 * Plans are printed for eyeballing — the founder's eye remains the last gate on design QUALITY; this harness
 * gates STRUCTURE deterministically.
 *
 * Designers: gemini-3.1-pro (prod GEMINI_API_KEY) and GLM-5V (prod ZAI_API_KEY). Kimi K3 = designated fallback,
 * pending a key. Uncommitted (scripts/ rule).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(REPO, '.env.local') });

import {
  buildDesignerPrompt,
  buildDesignerParts,
  extractDesignPlanJson,
  type MgDesignerInput,
  type MgDesignerMoment,
  type MgDesignerPart,
} from '../../lib/editron/motion-graphics/codegen/design/designer-prompt';
import fs from 'fs';
import {
  mgVideoDesignPlanSchema,
  validateDesignPlan,
  MG_FORM_ELEMENTS,
  type MgDesignPlanMomentContext,
  type MgVideoDesignPlan,
} from '../../lib/editron/motion-graphics/codegen/design/design-plan';
import { resolveVideoStyle } from '../../lib/editron/motion-graphics/codegen/style/style-resolver';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';

const MOMENTS: MgDesignerMoment[] = [
  { momentId: 'm_comparison', factKind: 'comparison', sourceText: 'from eight minutes down to twenty seconds to edit one video', contentProps: [{ name: 'from', kind: 'number' }, { name: 'to', kind: 'number' }, { name: 'fromLabel', kind: 'text' }, { name: 'toLabel', kind: 'text' }, { name: 'unit', kind: 'text' }, { name: 'label', kind: 'text' }], tier: 'standard', salience: 0.65, room: 'center-right band, clear of subject (left), title (top-left), dashboard (top-right), caption (bottom)', durationFrames: 75 },
  { momentId: 'm_list', factKind: 'list', sourceText: 'three steps: script it, record it, publish it', contentProps: [{ name: 'items', kind: 'list' }, { name: 'label', kind: 'text' }], tier: 'standard', salience: 0.6, room: 'center-right band as above', durationFrames: 75 },
  { momentId: 'm_concept', factKind: 'concept', sourceText: 'onboarding is ten times faster', contentProps: [{ name: 'keyword', kind: 'text' }, { name: 'body', kind: 'text' }], tier: 'hero', salience: 0.9, room: 'center-right band as above', durationFrames: 75 },
  { momentId: 'm_magnitude', factKind: 'magnitude-stat', sourceText: 'over a million videos made', contentProps: [{ name: 'value', kind: 'number' }, { name: 'unit', kind: 'text' }, { name: 'label', kind: 'text' }], tier: 'subtle', salience: 0.3, room: 'center-right band as above', durationFrames: 75 },
];

const CONTEXTS: MgDesignPlanMomentContext[] = MOMENTS.map((m) => ({ momentId: m.momentId, factKind: m.factKind, contentProps: m.contentProps.map((p) => p.name) }));

const INPUT: MgDesignerInput = {
  intent: 'SaaS product walkthrough',
  videoStyle: resolveVideoStyle({ brandFont: INSTURIX.fontSans, intent: 'SaaS product walkthrough', videoSignals: { energy: 0.55, formality: 0.45 } }),
  brand: INSTURIX,
  moments: MOMENTS,
};

async function geminiDesign(prompt: string): Promise<string> {
  const model = process.env.MG_DESIGNER_GEMINI_MODEL?.trim() || 'gemini-3.1-pro-preview';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 16_384 } }),
  });
  if (!res.ok) throw new Error(`gemini HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  const finish = j.candidates?.[0]?.finishReason;
  if (finish && finish !== 'STOP') throw new Error(`gemini finishReason=${finish}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
}

async function glmDesign(prompt: string): Promise<string> {
  const baseUrl = process.env.ZAI_BASE_URL?.trim() || 'https://api.z.ai/api/paas/v4';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.ZAI_API_KEY}` },
    body: JSON.stringify({ model: 'glm-5v-turbo', messages: [{ role: 'user', content: prompt }], stream: false, do_sample: false, max_tokens: 16_384, response_format: { type: 'text' }, thinking: { type: 'enabled', clear_thinking: true } }),
  });
  if (!res.ok) throw new Error(`glm HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  return j.choices?.[0]?.message?.content ?? '';
}

/** MULTIMODAL designer session (the audit fix): moodboard anchors as LEVEL + a footage frame, then the video. */
async function geminiDesignMultimodal(_prompt: string): Promise<string> {
  const framesDir = process.env.MG_FRAMES_DIR?.trim();
  const footagePath = process.env.MG_FOOTAGE_FRAME?.trim();
  const moodboard = framesDir
    ? ['autoae-01-kinetic.jpg', 'autoae-04.jpg', 'iman-premium-cards.jpg', 'vox-tierb-map.jpg']
      .map((f) => path.join(framesDir, f)).filter((p) => fs.existsSync(p))
      .map((p) => ({ mimeType: 'image/jpeg', data: fs.readFileSync(p).toString('base64') }))
    : [];
  const footageFrames = footagePath && fs.existsSync(footagePath)
    ? [{ mimeType: footagePath.endsWith('.png') ? 'image/png' : 'image/jpeg', data: fs.readFileSync(footagePath).toString('base64') }]
    : [];
  const parts = buildDesignerParts(INPUT, { moodboard, footageFrames });
  const geminiParts = parts.map((p: MgDesignerPart) => p.kind === 'text' ? { text: p.text } : { inlineData: { mimeType: p.mimeType, data: p.data } });
  const model = process.env.MG_DESIGNER_GEMINI_MODEL?.trim() || 'gemini-3.1-pro-preview';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: geminiParts }], generationConfig: { temperature: 0, maxOutputTokens: 16_384 } }),
  });
  if (!res.ok) throw new Error(`gemini-mm HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  if (j.candidates?.[0]?.finishReason && j.candidates[0].finishReason !== 'STOP') throw new Error(`gemini-mm finish=${j.candidates[0].finishReason}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
}

async function kimiDesign(prompt: string): Promise<string> {
  const model = process.env.MG_DESIGNER_KIMI_MODEL?.trim() || 'moonshotai/kimi-k3';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 16_384 }),
  });
  if (!res.ok) throw new Error(`kimi HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  return j.choices?.[0]?.message?.content ?? '';
}

const FORM_SET = new Set<string>(MG_FORM_ELEMENTS);

function formFamilies(plan: MgVideoDesignPlan): Map<string, string[]> {
  const families = new Map<string, string[]>();
  for (const m of plan.moments) {
    const fams: string[] = [...new Set(m.elements.filter((e) => FORM_SET.has(e.kind)).map((e) => String(e.kind)))];
    if (m.imagery) fams.push(`imagery-${m.imagery.mode}`);
    families.set(m.momentId, fams);
  }
  return families;
}

async function evalDesigner(name: string, call: (prompt: string) => Promise<string>): Promise<void> {
  console.log(`\n══════ DESIGNER: ${name} ══════`);
  const prompt = buildDesignerPrompt(INPUT);
  let raw = '';
  try { raw = await call(prompt); }
  catch (e) { console.log(`  CALL THREW: ${(e as Error).message.slice(0, 160)}`); return; }

  let plan: MgVideoDesignPlan;
  try { plan = mgVideoDesignPlanSchema.parse(extractDesignPlanJson(raw)); }
  catch (firstError) {
    // ONE bounded retry with the exact contract errors as feedback — the production designer call's mechanism
    // (models occasionally overflow the string bounds; the contract, not the model, is the authority).
    console.log(`  … first parse failed (${(firstError as Error).message.slice(0, 120)}) → retry with contract feedback`);
    try {
      raw = await call(`${prompt}\n\n<previous_attempt_feedback>\nYour previous JSON violated the contract. Fix ONLY these violations and return the complete corrected JSON (no prose):\n${(firstError as Error).message.slice(0, 1500)}\n</previous_attempt_feedback>`);
      plan = mgVideoDesignPlanSchema.parse(extractDesignPlanJson(raw));
    } catch (e) { console.log(`  ✗ PARSE FAIL after retry: ${(e as Error).message.slice(0, 300)}`); return; }
  }
  console.log('  ✓ parses (strict Zod)');

  const v = validateDesignPlan(plan, CONTEXTS);
  console.log(v.ok ? '  ✓ validates (form floor, coverage, grounding, lanes)' : `  ✗ VALIDATE FAIL:\n    - ${v.problems.join('\n    - ')}`);

  const fams = formFamilies(plan);
  const distinct = new Set([...fams.values()].map((f) => f.sort().join('+')));
  console.log(`  form families: ${[...fams.entries()].map(([id, f]) => `${id.replace('m_', '')}=[${f.join(',')}]`).join('  ')}`);
  console.log(`  ${distinct.size >= 3 ? '✓' : '✗'} variety: ${distinct.size}/4 distinct form combinations (need >=3)`);

  console.log(`  brief: motif="${plan.brief.motifLanguage.slice(0, 90)}" | variety="${plan.brief.formVariety.slice(0, 90)}"`);
  for (const m of plan.moments) {
    console.log(`  · ${m.momentId} [${m.lane} → ${m.targetBar}] "${m.concept.slice(0, 110)}"`);
    console.log(`      elements: ${m.elements.map((e) => `${e.kind}(${e.role.slice(0, 28)})`).join(', ')}`);
    if (m.imagery) console.log(`      imagery(${m.imagery.mode}): "${m.imagery.scenePrompt.slice(0, 100)}"`);
    console.log(`      motion: ${m.motion.syncTo} · build="${m.motion.build.slice(0, 70)}"`);
  }
  console.log(v.ok && distinct.size >= 3 ? `  ── ${name}: STRUCTURALLY PASSES — eyeball the concepts for design quality.` : `  ── ${name}: FAILS the structural gate.`);
}

async function main() {
  console.log('MG DESIGNER EVAL — video-level design session on the 4 battle-test moments (one video)');
  if (process.env.GEMINI_API_KEY) await evalDesigner('gemini-3.1-pro-preview', geminiDesign);
  else console.log('\n(gemini skipped — no GEMINI_API_KEY)');
  if (process.env.GEMINI_API_KEY && (process.env.MG_FRAMES_DIR || process.env.MG_FOOTAGE_FRAME)) {
    await evalDesigner('gemini-3.1-pro MULTIMODAL (moodboard as LEVEL + footage)', geminiDesignMultimodal);
  } else console.log('\n(multimodal skipped — set MG_FRAMES_DIR / MG_FOOTAGE_FRAME)');
  if (process.env.ZAI_API_KEY) await evalDesigner('glm-5v-turbo', glmDesign);
  else console.log('\n(glm skipped — no ZAI_API_KEY)');
  if (process.env.OPENROUTER_API_KEY) await evalDesigner('moonshotai/kimi-k3', kimiDesign);
  else console.log('\n(kimi-k3 skipped — no OPENROUTER_API_KEY)');
}

main().catch((e) => { console.error(e); process.exit(1); });
