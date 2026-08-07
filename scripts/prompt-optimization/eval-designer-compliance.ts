/**
 * DESIGNER COMPLIANCE EVAL (Rule 35) — the systematic fix that replaces per-mistake prompt patching.
 *
 * WHAT IT IS: run the SYSTEM designer on real beat-sets (Hormozi VTT windows) × seeds, and score OBJECTIVE
 * rule-compliance + POSITIVE design signals. Report a scorecard. Run it BEFORE and AFTER any prompt change.
 *
 * WHY IT CANNOT RUIN DESIGNS (the founder's guardrail, by construction):
 *  - It NEVER scores aesthetics — that is the vision judge's job. It scores only what is objectively checkable:
 *    validity (validateDesignPlan), grounding (no bar/ring/plot without a numeric prop), motion (no static hold),
 *    form-floor (no lone-mark bare caption).
 *  - It ALSO tracks POSITIVE signals: licensing RATE (does the designer still license enough substantive beats),
 *    lane diversity, form variety. So a prompt change that "passes" compliance by declining everything or emitting
 *    bare/generic designs is CAUGHT — licensing/variety collapse, and the scorecard shows it.
 *  - It is a GUARDRAIL, not an auto-tuner: it measures, it does not rewrite prompts. A change ships only if it
 *    raises compliance WITHOUT dropping the positive signals below their baseline.
 *
 * Env: GEMINI_API_KEY (pro tier). MG_EVAL_VTT=<captions.vtt>. Optional: MG_EVAL_SEEDS (default 2), MG_EVAL_MODEL.
 * TEXT-ONLY (no footage frames) by design — grounding/motion/form compliance does not need pixels; placement does,
 * and placement is judged separately. Uncommitted (scripts/prompt-optimization rule).
 */
import fs from 'node:fs';

import { buildDesignerParts, extractDesignPlanJson, type MgDesignerMoment } from '../../lib/editron/motion-graphics/codegen/design/designer-prompt';
import { mgVideoDesignPlanSchema, validateDesignPlan, salvageDesignPlan, deriveNumericProps, type MgDesignPlanMomentContext } from '../../lib/editron/motion-graphics/codegen/design/design-plan';
import { computeMgDensityBudget } from '../../lib/editron/motion-graphics/codegen/design/density-budget';
import { resolveVideoStyle } from '../../lib/editron/motion-graphics/codegen/style/style-resolver';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';

const KEY = process.env.GEMINI_API_KEY?.trim();
if (!KEY) { console.error('missing GEMINI_API_KEY'); process.exit(1); }
const VTT = process.env.MG_EVAL_VTT?.trim();
if (!VTT) { console.error('missing MG_EVAL_VTT'); process.exit(1); }
const SEEDS = Math.max(1, Number(process.env.MG_EVAL_SEEDS) || 2);
const MODEL = process.env.MG_EVAL_MODEL?.trim() || 'gemini-3.1-pro-preview';
const FPS = 30;

// ── VTT → words (YouTube auto-caption inline word timings) ──
interface Word { word: string; ms: number }
function parseVtt(path: string): Word[] {
  const tsMs = (t: string) => { const m = t.match(/(\d+):(\d+):(\d+)\.(\d+)/)!; return ((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) * 1000 + (+m[4]); };
  const out: Word[] = []; let cueStart = 0;
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const cue = line.match(/^(\d+:\d+:\d+\.\d+)\s+-->/); if (cue) { cueStart = tsMs(cue[1]); continue; }
    if (!line.includes('<c>')) continue;
    const first = line.match(/^([^<\n]+?)(?=<\d)/); if (first?.[1]?.trim()) for (const w of first[1].trim().split(/\s+/)) out.push({ word: w, ms: cueStart });
    const re = /<(\d+:\d+:\d+\.\d+)><c>\s*([^<]+?)<\/c>/g; let m; while ((m = re.exec(line))) { const ms = tsMs(m[1]); for (const w of m[2].trim().split(/\s+/)) out.push({ word: w, ms }); }
  }
  const dedup: Word[] = []; for (const w of out) { const p = dedup[dedup.length - 1]; if (p && p.word === w.word && Math.abs(p.ms - w.ms) < 80) continue; dedup.push(w); }
  return dedup;
}
// window [startS, startS+durS) rebased to 0 → beats (sentence/800ms-pause split, <4-word merge — mirrors real-e2e)
function windowBeats(words: Word[], startS: number, durS: number): Array<{ id: string; text: string; startMs: number; endMs: number }> {
  const win = words.filter((w) => w.ms >= startS * 1000 && w.ms < (startS + durS) * 1000).map((w) => ({ word: w.word, ms: w.ms - startS * 1000 }));
  const groups: Array<Array<{ word: string; ms: number }>> = []; let cur: Array<{ word: string; ms: number }> = [];
  for (let i = 0; i < win.length; i++) { cur.push(win[i]); const end = /[.!?]["')\]]?$/.test(win[i].word); const pause = i + 1 < win.length ? win[i + 1].ms - win[i].ms >= 800 : false; if (end || pause) { groups.push(cur); cur = []; } }
  if (cur.length) groups.push(cur);
  const merged: Array<Array<{ word: string; ms: number }>> = []; for (const g of groups) { if (merged.length && g.length < 4) merged[merged.length - 1].push(...g); else merged.push(g); }
  return merged.map((g, i) => ({ id: `b${i}`, text: g.map((w) => w.word).join(' '), startMs: g[0].ms, endMs: g[g.length - 1].ms }));
}

async function gemini(parts: Array<{ text?: string } | { inlineData: unknown }>, seed: number): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.4, seed, maxOutputTokens: 65_536 } }),
    });
    if ((res.status === 429 || res.status === 503) && attempt < 3) { await res.text().catch(() => ''); await new Promise((r) => setTimeout(r, (attempt + 1) * 15_000)); continue; }
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const j = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
    const c = j.candidates?.[0]; if (c?.finishReason === 'MAX_TOKENS') throw new Error('MAX_TOKENS');
    return (c?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  }
}

const FORM = new Set(['bar', 'ring', 'plot', 'rule', 'dot', 'plate', 'reveal', 'particles', 'texture', 'motif']);
interface Score { window: string; seed: number; valid: boolean; salvagedKept: number; salvagedDropped: number; grounding: number; staticHold: number; bareForm: number; licensed: number; offered: number; lanes: Set<string>; forms: Set<string> }

async function evalWindow(startS: number, durS: number, seed: number, words: Word[]): Promise<Score> {
  const beats = windowBeats(words, startS, durS);
  const moments: MgDesignerMoment[] = beats.map((b) => ({ momentId: b.id, factKind: 'narrative', sourceText: b.text.slice(0, 300), contentProps: [{ name: 'line', kind: 'text' }], tier: 'standard', salience: 0.5, room: 'design in the clear negative space', durationFrames: Math.min(150, Math.round((Math.max(2500, b.endMs - b.startMs + 700) / 1000) * FPS)) }));
  const contexts: MgDesignPlanMomentContext[] = beats.map((b) => ({ momentId: b.id, factKind: 'narrative', contentProps: ['line'], numericProps: deriveNumericProps({ line: b.text }), startMs: b.startMs }));
  const budget = computeMgDensityBudget({ durationSec: durS, beatCount: beats.length, numericEvidenceCount: 0, brandMotionEnergy: INSTURIX.motion.energy });
  const videoStyle = resolveVideoStyle({ brandFont: INSTURIX.fontSans, videoSignals: { energy: 0.7 } });
  const parts = buildDesignerParts({ intent: undefined, videoStyle, brand: INSTURIX, moments, budget }, {});
  // wire MgDesignerPart[] → Gemini parts (strip the neutral `kind` tag the API rejects)
  const wired = parts.map((p) => (p.kind === 'image' ? { inlineData: { mimeType: p.mimeType, data: p.data } } : { text: p.text }));
  const text = await gemini(wired, seed);
  const plan = mgVideoDesignPlanSchema.parse(extractDesignPlanJson(text));
  const v0 = validateDesignPlan(plan, contexts, { maxMoments: budget.maxMoments });
  const salvaged = v0.ok ? { plan, dropped: [] as string[] } : (salvageDesignPlan(plan, contexts, { maxMoments: budget.maxMoments }) ?? { plan, dropped: [] as string[] });
  const p = salvaged.plan;
  const numByBeat = new Map(contexts.map((c) => [c.momentId, new Set(c.numericProps ?? [])]));
  let grounding = 0, staticHold = 0, bareForm = 0;
  for (const mp of p.moments) {
    const num = numByBeat.get(mp.momentId) ?? new Set<string>();
    if (mp.elements.some((e) => (e.kind === 'bar' || e.kind === 'ring' || e.kind === 'plot') && !e.dataProps.some((d) => num.has(d)))) grounding++;
    if (/\b(static|frozen|none|still)\b/i.test(mp.motion.hold)) staticHold++;
    const formEls = mp.elements.filter((e) => FORM.has(e.kind));
    if (!mp.imagery && formEls.length <= 1 && formEls.every((e) => e.kind === 'dot' || e.kind === 'rule')) bareForm++; // lone dot/rule beside text
  }
  return { window: `${startS}s`, seed, valid: v0.ok, salvagedKept: p.moments.length, salvagedDropped: salvaged.dropped.length, grounding, staticHold, bareForm, licensed: p.moments.length, offered: beats.length, lanes: new Set(p.moments.map((m) => m.lane)), forms: new Set(p.moments.flatMap((m) => m.elements.map((e) => e.kind))) };
}

async function main() {
  const words = parseVtt(VTT!);
  const totalS = Math.floor((words[words.length - 1]?.ms ?? 0) / 1000);
  // 3 windows spread across the talk (early / middle / late), 90s each — real, varied beat-sets
  const windows = [Math.min(1097, totalS - 200), Math.floor(totalS * 0.5), Math.floor(totalS * 0.75)].map((s) => Math.max(0, s));
  console.log(`[eval] ${words.length} words · ${totalS}s · windows @ ${windows.join('s, ')}s · ${SEEDS} seeds · model ${MODEL}\n`);
  const scores: Score[] = [];
  for (const startS of windows) for (let seed = 1; seed <= SEEDS; seed++) {
    try { const s = await evalWindow(startS, 90, seed, words); scores.push(s); console.log(`  ${s.window} seed${seed}: valid=${s.valid} kept=${s.salvagedKept}/${s.offered} salvage-dropped=${s.salvagedDropped} · grounding-viol=${s.grounding} static-hold=${s.staticHold} bare-form=${s.bareForm} · lanes=${[...s.lanes].join('/')} forms=${[...s.forms].join(',')}`); }
    catch (e) { console.log(`  ${startS}s seed${seed}: THREW ${e instanceof Error ? e.message : e}`); }
  }
  const n = scores.length || 1;
  const sum = (f: (s: Score) => number) => scores.reduce((a, s) => a + f(s), 0);
  console.log(`\n=== DESIGNER COMPLIANCE SCORECARD (n=${scores.length}) ===`);
  console.log(`  first-pass valid:    ${sum((s) => (s.valid ? 1 : 0))}/${n}  (${((sum((s) => (s.valid ? 1 : 0)) / n) * 100).toFixed(0)}%) — higher = fewer contract violations before salvage`);
  console.log(`  grounding violations: ${sum((s) => s.grounding)}   (bar/ring/plot with no numeric prop — must trend to 0 [Fix B.1])`);
  console.log(`  static holds:         ${sum((s) => s.staticHold)}   (hold=static/frozen — must trend to 0 [Fix B.3])`);
  console.log(`  bare-form designs:    ${sum((s) => s.bareForm)}   (lone dot/rule beside text — must trend to 0 [Fix B.3])`);
  console.log(`  --- POSITIVE (must NOT collapse — the anti-ruin guardrail) ---`);
  console.log(`  licensing rate:       ${(sum((s) => s.licensed) / Math.max(1, sum((s) => s.offered)) * 100).toFixed(0)}% of offered beats designed (too low = over-declining)`);
  console.log(`  lane diversity:       ${[...new Set(scores.flatMap((s) => [...s.lanes]))].join(', ') || 'none'}`);
  console.log(`  form vocabulary used: ${[...new Set(scores.flatMap((s) => [...s.forms]))].join(', ') || 'none'}`);
}
main().catch((e) => { console.error('FATAL', e instanceof Error ? e.message : e); process.exit(1); });
