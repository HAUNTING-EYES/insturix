/**
 * THE HONEST REAL-FOOTAGE E2E — P3.5 DOOR EDITION (founder paradigm correction, 2026-07-18).
 * ⛔ NO-ASSIST RULE: every creative decision is the SYSTEM's — Claude-authored code here is BYTES-PLUMBING ONLY.
 *
 * THE DOOR (beats, not facts): video file → Grok STT (production protocol, verbatim shape) → deterministic
 * BEAT segmentation (every clause reaches the designer — mechanical sentence/pause splitting, zero curation) →
 * extractMotionGraphicSemanticFacts DEMOTED TO ENRICHER (licensed facts attach verified props to overlapping
 * beats; unenriched beats flow as factKind 'narrative') → computeMgDensityBudget (deterministic: user pref
 * [absent here → auto] + brand energy + video evidence + duration) → video-level designSession sees EVERY beat
 * with its real footage frame and LICENSES within the budget (declines the rest with reasons) → per licensed
 * moment: coder (buildCoderParts, backdrop generated if the design asks; cutaways render via the system's own
 * motion-backdrop generator) → scan → render (ONE bounded crash-repair, production parity) → floors → ARMED
 * judge (+ real anchors) → one best-of revision → composited at the real timestamp. Gallery for the founder.
 *
 * CANVAS IS NATIVE: ffprobe derives W×H from the source aspect (vertical clips render vertical — the P4-noted
 * harness squash is dead). Duration feeds the budget.
 *
 * HONEST LIMITATION (recorded, not hidden): V-JEPA/placement boxes need the Modal endpoint (worker infra) —
 * locally placement is full-frame with the designer/coder seeing the REAL frames multimodally instead. Narrative
 * beats carry a NEUTRAL 0.5 salience prior (no ledger score exists for plain speech; production audio/visual
 * signals sharpen this at P5) — the DESIGNER's licensing is the creative act, not this constant.
 *
 * Env: GEMINI_API_KEY + XAI_API_KEY via shell. MG_REAL_VIDEO=<path>. MG_REAL_OUT=<dir>. MG_FRAMES_DIR=<anchors>.
 * Uncommitted (scripts/ rule).
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
for (const k of ['GEMINI_API_KEY', 'XAI_API_KEY']) if (!process.env[k]) { console.error(`missing ${k}`); process.exit(1); }
const VIDEO = process.env.MG_REAL_VIDEO!;
const OUT = process.env.MG_REAL_OUT || path.join(REPO, '.mg-render-tmp', 'real-e2e');
fs.mkdirSync(OUT, { recursive: true });

import { extractMotionGraphicSemanticFacts } from '../../lib/editron/services/mg-semantic-fact-extractor';
import { selectSemanticMgCandidate, type SemanticMgCandidate } from '../../lib/editron/motion-graphics/engine/semantic-mg-candidates';
import { buildMgMomentInput } from '../../lib/editron/motion-graphics/codegen/moment-input';
import { applyImportPreamble } from '../../lib/editron/motion-graphics/codegen/codegen-service';
import { computeMgDensityBudget } from '../../lib/editron/motion-graphics/codegen/design/density-budget';
import { computeMgMotionIntensity } from '../../lib/editron/motion-graphics/codegen/design/motion-intensity';
import { buildDesignerParts, extractDesignPlanJson, type MgDesignerMoment } from '../../lib/editron/motion-graphics/codegen/design/designer-prompt';
import { designOutputMode, mgVideoDesignPlanSchema, validateDesignPlan, salvageDesignPlan, deriveNumericProps, type MgVideoDesignPlan } from '../../lib/editron/motion-graphics/codegen/design/design-plan';
import { buildCoderParts, type MgCoderPart } from '../../lib/editron/motion-graphics/codegen/design/coder-prompt';
import { resolveVideoStyle } from '../../lib/editron/motion-graphics/codegen/style/style-resolver';
import { JUDGE_PROMPT } from '../../lib/editron/motion-graphics/codegen/prompt';
import { scanCode } from '../../lib/editron/motion-graphics/codegen/scan';
import { renderMomentToWebpFrames, cleanupWorkspace } from '../../lib/editron/motion-graphics/codegen/render/frame-renderer';
import { mgRenderSanityGate, mgMotionPresenceGate } from '../../lib/editron/motion-graphics/codegen/mg-placement-gate';
import { generateStillBackdrop, generateMotionBackdrop } from '../../lib/editron/motion-graphics/codegen/design/imagery-client';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';
import { phases } from '../../lib/editron/motion-graphics/codegen/kit/choreo';
import type { MgMomentInput, MgVisualEvidence } from '../../lib/editron/motion-graphics/codegen/types';

const FPS = 30;
const JUDGE_THRESHOLD = 7.5;
let W = 1280, H = 720; // overwritten from the source aspect in main() before any use

function ffmpeg(args: string[]): void { execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' }); }

/** Native canvas from the SOURCE aspect (long side 1280, even dims) + duration for the budget. */
function probeVideo(p: string): { width: number; height: number; durationSec: number } {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-show_entries', 'format=duration', '-of', 'json', p]).toString();
  const j = JSON.parse(out) as { streams?: Array<{ width?: number; height?: number }>; format?: { duration?: string } };
  const st = j.streams?.[0]; const dur = Number(j.format?.duration);
  if (!st?.width || !st?.height || !Number.isFinite(dur) || dur <= 0) throw new Error(`ffprobe failed on ${p}`);
  const scale = 1280 / Math.max(st.width, st.height);
  const even = (v: number) => Math.max(2, Math.round((v * scale) / 2) * 2);
  return { width: even(st.width), height: even(st.height), durationSec: dur };
}

// ─── 1. The SYSTEM's transcription (production Grok STT protocol, verbatim shape) ───
interface Word { word: string; startMs: number; endMs: number }
async function grokStt(videoPath: string): Promise<Word[]> {
  // Transcript cache: the SYSTEM's own prior STT output for this clip (same file, same production protocol) —
  // kills re-uploads across runs and the transient-5xx failure class (run-4: "Auth context expired").
  const cachePath = path.join(OUT, 'transcript.json');
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as { words?: Word[] };
    if (cached.words?.length) { console.log(`[stt] cached transcript (${cached.words.length} words) — reusing the system's own prior output`); return cached.words; }
  }
  const buf = fs.readFileSync(videoPath);
  console.log(`[stt] Grok STT (production protocol) on ${(buf.length / 1024 / 1024).toFixed(1)}MB …`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const fd = new FormData();
    fd.append('language', 'en');
    fd.append('format', 'true');
    fd.append('diarize', 'true');
    fd.append('file', new Blob([buf], { type: 'video/mp4' }), path.basename(videoPath));
    const res = await fetch('https://api.x.ai/v1/stt', { method: 'POST', headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` }, body: fd });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // retry transient classes: rate limits AND server-side 5xx (run-4: 500 "Auth context expired")
      if ((res.status === 429 || res.status >= 500 || body.includes('429')) && attempt < 2) { await new Promise((r) => setTimeout(r, (attempt + 1) * 5000)); continue; }
      throw new Error(`Grok STT ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json() as { words?: Array<{ text?: string; start?: number; end?: number }>; text?: string };
    const words = (data.words ?? []).map((w) => ({ word: w.text || '', startMs: Math.round((w.start || 0) * 1000), endMs: Math.round((w.end || 0) * 1000) }));
    if (!words.length) throw new Error('Grok STT returned 0 words');
    console.log(`[stt] ${words.length} words · "${words.slice(0, 12).map((w) => w.word).join(' ')}…"`);
    fs.writeFileSync(path.join(OUT, 'transcript.json'), JSON.stringify({ words, text: data.text }, null, 2));
    return words;
  }
  throw new Error('unreachable');
}

// ─── 2. Deterministic BEAT segmentation (mechanical, zero curation — the door's input) ───
// Sentence-enders are orthographic boundaries; the 800ms pause floor is the plumbing threshold for a spoken
// clause break; <4-word fragments merge forward as degenerate cleanup. No content-based selection happens here.
interface Beat { id: string; text: string; startMs: number; endMs: number; words: Word[]; candidate?: SemanticMgCandidate; factKind: string }
function splitBeats(words: Word[]): Beat[] {
  const raw: Word[][] = []; let cur: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const sentenceEnd = /[.!?]["')\]]?$/.test(words[i].word);
    const longPause = i + 1 < words.length ? words[i + 1].startMs - words[i].endMs >= 800 : false;
    if (sentenceEnd || longPause) { raw.push(cur); cur = []; }
  }
  if (cur.length) raw.push(cur);
  const merged: Word[][] = [];
  for (const group of raw) {
    if (merged.length && group.length < 4) merged[merged.length - 1].push(...group);
    else merged.push(group);
  }
  return merged.map((g, i) => ({
    id: `b${i}`, text: g.map((w) => w.word).join(' '), startMs: g[0].startMs, endMs: g[g.length - 1].endMs, words: g, factKind: 'narrative',
  }));
}

/** Neutral narrative candidate — plumbing shape only. 0.5 everywhere = NEUTRAL PRIOR (no ledger score exists
 *  for plain speech); the DESIGNER's license is the creative decision, recorded in hardGate.reasons.
 *  content.line = the beat's VERBATIM spoken words (run-3 evidence: without a grounded text channel the coder
 *  honestly DECLINEs all narrative typography — verbatim speech is grounded, same class as the quote fact). */
function narrativeCandidate(beat: Beat): SemanticMgCandidate {
  return {
    id: `${beat.id}-narrative`, factKind: 'narrative',
    sourceSpan: { text: beat.text, startMs: beat.startMs, endMs: beat.endMs },
    content: { line: beat.text }, evidenceKeys: [], licenses: ['source-span'], salience: 0.5,
    hardGate: { passed: true, reasons: ['designer-licensed (P3.5 door)'], blockedBy: [] },
    scoreInputs: { structuralStrength: 0.5, salience: 0.5, evidenceStrength: 0.5, renderRisk: 0.5 },
  };
}

// ─── frame plumbing (bytes only) ───
async function frameAt(ms: number, name: string): Promise<Buffer> {
  const p = path.join(OUT, name);
  ffmpeg(['-ss', String(ms / 1000), '-i', VIDEO, '-frames:v', '1', '-vf', `scale=${W}:${H}`, p]);
  return sharp(fs.readFileSync(p)).jpeg({ quality: 82 }).toBuffer();
}
const dataUrl = (b: Buffer) => `data:image/jpeg;base64,${b.toString('base64')}`;

// ─── model calls (writer=gemini both-steps: the proven production designer/coder pair) ───
/** Bounded 429/503 backoff — the same retry discipline grokStt already carries (rate limits killed a full
 *  4-clip run on 2026-07-18; a designer call must not die on a quota blip). Honors Retry-After when sent. */
async function fetchWithBackoff(url: string, init: RequestInit, tag: string): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, init);
    if ((res.status === 429 || res.status === 503) && i < 3) {
      const ra = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 120_000) : [15_000, 30_000, 60_000][i];
      await res.text().catch(() => '');
      console.log(`[${tag}] HTTP ${res.status} — backoff ${Math.round(waitMs / 1000)}s (attempt ${i + 1}/4)`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    return res;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gemini(parts: any[], maxTokens: number, model = 'gemini-3.1-pro-preview'): Promise<string> {
  const res = await fetchWithBackoff(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, maxOutputTokens: maxTokens } }),
  }, 'gemini');
  if (!res.ok) throw new Error(`gemini HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  const finish = j.candidates?.[0]?.finishReason;
  if (finish && finish !== 'STOP') throw new Error(`gemini finishReason=${finish}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  const fence = content.trim().match(/^```(?:tsx|typescript|jsx|javascript|json)?\s*([\s\S]*?)\s*```$/i);
  return (fence?.[1] ?? content).trim();
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wire = (parts: MgCoderPart[]): any[] => parts.map((p) => p.kind === 'text' ? { text: p.text } : { inlineData: { mimeType: p.mimeType, data: p.data } });

const JUDGE_SCHEMA = { type: 'OBJECT', properties: { faithful: { type: 'BOOLEAN' }, hierarchy: { type: 'NUMBER' }, typography: { type: 'NUMBER' }, color: { type: 'NUMBER' }, composition: { type: 'NUMBER' }, motion: { type: 'NUMBER' }, form: { type: 'NUMBER' }, score: { type: 'NUMBER' }, issues: { type: 'ARRAY', items: { type: 'STRING' } }, reasoning: { type: 'STRING' } }, required: ['faithful', 'hierarchy', 'typography', 'color', 'composition', 'motion', 'form', 'score', 'issues', 'reasoning'] };
const ANCHOR_FILES = ['autoae-01-kinetic.jpg', 'autoae-04.jpg', 'iman-premium-cards.jpg', 'vox-tierb-map.jpg', 'iman-scorecard.jpg', 'iman-step-type.jpg'];

async function judge(images: Buffer[], moment: MgMomentInput, opaque: boolean, cutaway = false): Promise<Record<string, unknown>> {
  const fact = JSON.stringify({ factKind: moment.candidate.factKind, content: moment.candidate.content, sourceText: moment.candidate.sourceSpan.text }).slice(0, 4000);
  const framesDir = process.env.MG_FRAMES_DIR?.trim();
  const anchors = framesDir ? ANCHOR_FILES.map((f) => path.join(framesDir, f)).filter((p) => fs.existsSync(p)) : [];
  // Run-3 evidence: the kit rubric zeroed a genuinely premium cinematic cutaway (brand-token colour law +
  // kit-form expectations applied to a photographic scene). A cutaway is judged as CINEMATOGRAPHY.
  const opaqueBlock = cutaway
    ? '\n\nOUTPUT MODE: WORDLESS CINEMATIC CUTAWAY (sanctioned, full-frame) — a generated B-roll scene replacing footage for this beat. Judge it as cinematography, not as a kit graphic: subject relevance to the spoken beat, composition, grade/light quality, and living motion. The brand-token colour law does NOT apply to photographic scenes — judge palette as HARMONY with the brand direction instead. Kit-form expectations (marks, type structure) do not apply: there is intentionally NO type, and `form` scores the scene design itself. Fabricated READABLE text, logos, or watermarks in the scene remain an automatic reject. Do NOT penalize footage occlusion.'
    : opaque ? '\n\nOUTPUT MODE: full-frame illustrated cutaway SCENE (sanctioned) — do NOT penalize footage occlusion.' : '';
  const refBlock = anchors.length ? `\n\nREFERENCE STILLS — THE FORM BAR: the first ${anchors.length} images are genuine professional motion-graphic stills; score \`form\` by whether the candidate belongs alongside them. Never require imitation.` : '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: `${JUDGE_PROMPT}${refBlock}${opaqueBlock}\n\nLICENSED FACT JSON:\n${fact}` }];
  anchors.forEach((p, i) => { parts.push({ text: `REFERENCE STILL ${i + 1}` }); parts.push({ inlineData: { mimeType: 'image/jpeg', data: fs.readFileSync(p).toString('base64') } }); });
  images.forEach((img, i) => { parts.push({ text: `JUDGE IMAGE ${i + 1}` }); parts.push({ inlineData: { mimeType: 'image/png', data: img.toString('base64') } }); });
  const res = await fetchWithBackoff(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: JUDGE_SCHEMA, temperature: 0, maxOutputTokens: 8192 } }),
  }, 'judge');
  if (!res.ok) throw new Error(`judge HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse(((await res.json()) as any).candidates?.[0]?.content?.parts?.[0]?.text ?? '{}');
}

async function main() {
  const t0 = Date.now();
  const probe = probeVideo(VIDEO);
  W = probe.width; H = probe.height;
  console.log(`[probe] ${probe.width}x${probe.height} native canvas · ${probe.durationSec.toFixed(1)}s`);

  // 1. SYSTEM transcription → 2. mechanical beats
  const words = await grokStt(VIDEO);
  const beats = splitBeats(words);
  console.log(`[beats] ${beats.length} transcript beats (every clause reaches the designer)`);

  // 3. ENRICHER (demoted extractor): licensed facts attach verified props to their overlapping beat
  const facts = extractMotionGraphicSemanticFacts({ tokens: words, maxFacts: 6 });
  const licensedFacts = facts.filter((f) => f.licensed);
  fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
  for (const f of licensedFacts) {
    const sel = selectSemanticMgCandidate(f.ledger);
    const cand = sel.selectedCandidate;
    if (!cand) continue;
    const fs0 = f.sourceSpan.startMs ?? 0; const fe = f.sourceSpan.endMs ?? fs0;
    let best: Beat | undefined; let bestOv = 0;
    for (const b of beats) {
      const ov = Math.min(b.endMs, fe) - Math.max(b.startMs, fs0);
      if (ov > bestOv) { bestOv = ov; best = b; }
    }
    if (best && !best.candidate) { best.candidate = cand; best.factKind = f.factKind; }
  }
  console.log(`[enrich] ${licensedFacts.length} licensed facts attached to beats (${beats.filter((b) => b.candidate).length} enriched, ${beats.length - beats.filter((b) => b.candidate).length} narrative)`);

  // 3.5 VIDEO ENERGY from measured speech rate (deterministic; the full analysis stack's energy replaces
  // this at P5-1). Conversational speech ≈ 120–150 wpm (standard range); promo delivery 180+. Map 110→0,
  // 200→1. ⚠ derived from standard speech-rate ranges — calibrated downstream by judge + founder eyeball.
  const wpm = words.length / (probe.durationSec / 60);
  const videoEnergy = Math.max(0, Math.min(1, (wpm - 110) / 90));
  console.log(`[signals] speech ${wpm.toFixed(0)} wpm → videoEnergy ${videoEnergy.toFixed(2)} (analysis-stack energy replaces this at P5-1)`);

  // 3.6 USER DIAL (the project's motionGraphics preference; env here, real project prefs at P5-1)
  const prefMode = process.env.MG_USER_MODE?.trim() as 'off' | 'auto' | 'prefer' | undefined;
  const prefIntensity = process.env.MG_USER_INTENSITY?.trim() ? Number(process.env.MG_USER_INTENSITY) : undefined;
  const preference = prefMode || prefIntensity !== undefined
    ? { mode: prefMode ?? ('auto' as const), ...(prefIntensity !== undefined ? { intensity: prefIntensity } : {}) }
    : undefined;
  if (preference) console.log(`[user] motionGraphics preference: mode=${preference.mode}${prefIntensity !== undefined ? ` intensity=${prefIntensity}` : ''}`);

  // 4. DENSITY BUDGET (deterministic: user dial × evidence × brand energy × duration)
  const budget = computeMgDensityBudget({
    durationSec: probe.durationSec, beatCount: beats.length,
    numericEvidenceCount: licensedFacts.length, brandMotionEnergy: INSTURIX.motion.energy,
    preference,
  });
  console.log(`[budget] ${budget.maxMoments} moments max — ${budget.rationale}`);
  if (budget.maxMoments === 0) { console.log('SYSTEM VERDICT: zero budget — stands (no-assist rule).'); return; }

  // MOTION INTENSITY (deterministic, brand×video×user): the resolved liveness the coder binds for every hold +
  // entrance. videoEnergy = measured speech rate (above); user dial from env; P5-1 swaps in the analysis
  // stack's energy + the project's real preference.
  const motion = computeMgMotionIntensity({ brandMotionEnergy: INSTURIX.motion.energy, videoEnergy, preference });
  console.log(`[motion] intensity ${motion.intensity.toFixed(3)} — ${motion.rationale}`);

  // 5. SYSTEM design session: EVERY beat, its real frame, the budget — the designer licenses
  const durFOf = (b: Beat) => Math.min(150, Math.round((Math.max(2500, b.endMs - b.startMs + 700) / 1000) * FPS));
  const designerMoments: MgDesignerMoment[] = beats.map((b) => ({
    momentId: b.id, factKind: b.factKind, sourceText: b.text.slice(0, 300),
    contentProps: b.candidate
      ? Object.entries(b.candidate.content).map(([name, v]) => ({ name, kind: Array.isArray(v) ? 'list' : typeof v === 'number' ? 'number' : 'text' }))
      : [{ name: 'line', kind: 'text' }], // the narrative beat's verbatim spoken words (grounded text channel)
    tier: b.candidate ? (b.candidate.salience > 0.75 ? 'hero' : b.candidate.salience > 0.45 ? 'standard' : 'subtle') : 'standard',
    salience: b.candidate?.salience ?? 0.5, // neutral prior for narrative (header note)
    room: 'see the footage frames — place in their real negative space', durationFrames: durFOf(b),
  }));
  const frameBeats = beats.length <= 12 ? beats : Array.from({ length: 12 }, (_, i) => beats[Math.floor((i * beats.length) / 12)]);
  const beatFrames: Array<{ mimeType: string; data: string }> = [];
  for (const b of frameBeats) beatFrames.push({ mimeType: 'image/jpeg', data: (await frameAt((b.startMs + b.endMs) / 2, `beat-${b.id}.jpg`)).toString('base64') });
  const videoStyle = resolveVideoStyle({ brandFont: INSTURIX.fontSans, videoSignals: { energy: videoEnergy } });
  const designerParts = buildDesignerParts({ intent: undefined, videoStyle, brand: INSTURIX, moments: designerMoments, budget }, { footageFrames: beatFrames });
  const last = designerParts[designerParts.length - 1] as { kind: 'text'; text: string };
  last.text += `\n(footage frames correspond in order to beats: ${frameBeats.map((b) => b.id).join(', ')})`;
  console.log('[design] video-level session (all beats, budget-licensed, multimodal) …');
  const contexts = beats.map((b) => ({
    momentId: b.id,
    factKind: b.factKind,
    contentProps: b.candidate ? Object.keys(b.candidate.content) : ['line'],
    numericProps: b.candidate ? deriveNumericProps(b.candidate.content) : [],
    startMs: b.startMs, // enables the cutaway-spacing rule (≥60s apart)
  }));
  let planText = await gemini(wire(designerParts as MgCoderPart[]), 65_536);
  let plan: MgVideoDesignPlan = mgVideoDesignPlanSchema.parse(extractDesignPlanJson(planText));
  let problems = validateDesignPlan(plan, contexts, { maxMoments: budget.maxMoments }).problems;
  if (problems.length) {
    console.log(`[design] contract violations → one retry:\n  - ${problems.join('\n  - ')}`);
    planText = await gemini([...wire(designerParts as MgCoderPart[]), { text: `\n<previous_attempt_feedback>\nYour plan violated the contract:\n- ${problems.join('\n- ')}\nReturn the FULL corrected JSON plan.\n</previous_attempt_feedback>` }], 65_536);
    const p2 = mgVideoDesignPlanSchema.parse(extractDesignPlanJson(planText));
    problems = validateDesignPlan(p2, contexts, { maxMoments: budget.maxMoments }).problems;
    if (problems.length) {
      // Fix A (production behaviour): salvage the valid moments instead of voiding the whole design.
      const salvaged = salvageDesignPlan(p2, contexts, { maxMoments: budget.maxMoments });
      if (!salvaged || salvaged.plan.moments.length === 0) throw new Error(`design failed after retry + salvage:\n- ${problems.join('\n- ')}`);
      console.log(`[design] SALVAGED (Fix A): kept ${salvaged.plan.moments.length}, dropped ${salvaged.dropped.length} [${salvaged.dropped.join(', ')}]`);
      plan = salvaged.plan;
    } else plan = p2;
  }
  console.log(`[design] brief motif="${plan.brief.motifLanguage.slice(0, 70)}" · licensed ${plan.moments.length}/${beats.length} beats (budget ${budget.maxMoments})`);
  for (const mp of plan.moments) console.log(`  · LICENSED ${mp.momentId} [${mp.lane} → ${mp.targetBar}] "${mp.concept.slice(0, 90)}"`);
  for (const d of plan.declined ?? []) console.log(`  · declined ${d.momentId}: ${d.reason.slice(0, 80)}`);
  fs.writeFileSync(path.join(OUT, 'design-plan.json'), JSON.stringify(plan, null, 2));
  if (!plan.moments.length) { console.log('SYSTEM VERDICT: designer licensed zero beats — that verdict stands (no-assist rule).'); return; }

  // 6. Per LICENSED moment: input assembly → coder → render (1 crash-repair) → floors → armed judge (+1 best-of revision)
  const summary: string[] = [];
  for (const mp of plan.moments) {
    const beat = beats.find((b) => b.id === mp.momentId)!;
    const cand = beat.candidate ?? narrativeCandidate(beat);
    const s = beat.startMs; const durF = durFOf(beat); const durMs = (durF / FPS) * 1000;
    const wf = words.filter((w) => w.startMs >= s && w.startMs < s + durMs).map((w) => Math.round(((w.startMs - s) / 1000) * FPS)).filter((f2) => f2 < durF);
    // clamp to the clip's real end (run-3 regression: unclamped ctx-c seeked past EOF and ffmpeg threw)
    const lastMs = Math.max(0, probe.durationSec * 1000 - 100);
    const [a, b2, c] = await Promise.all([frameAt(Math.min(s, lastMs), `${mp.momentId}-ctx-a.jpg`), frameAt(Math.min(s + durMs / 2, lastMs), `${mp.momentId}-ctx-b.jpg`), frameAt(Math.min(s + durMs, lastMs), `${mp.momentId}-ctx-c.jpg`)]);
    const ve: MgVisualEvidence = { space: 'edited-canvas', canvas: { width: W, height: H }, frames: [
      { role: 'context-before', coordinate: { kind: 'edited-timeline', timelineFrame: 0 }, imageDataUrl: dataUrl(a) },
      { role: 'anchor', coordinate: { kind: 'edited-timeline', timelineFrame: Math.round(durF / 2) }, imageDataUrl: dataUrl(b2) },
      { role: 'context-after', coordinate: { kind: 'edited-timeline', timelineFrame: durF - 1 }, imageDataUrl: dataUrl(c) },
    ] };
    const tier = cand.salience > 0.75 ? 'hero' : cand.salience > 0.45 ? 'standard' : 'subtle';
    const input = buildMgMomentInput({
      momentId: mp.momentId, candidate: cand, brand: INSTURIX,
      window: { startFrame: 0, endFrame: durF, fps: FPS },
      expression: { qualityTier: tier, relevanceScore: Math.max(0.01, Math.min(1, cand.salience)), typography: { emphasisScale: 1.1 } },
      placement: { placementHints: { avoid: [], prefer: [] } }, // no V-JEPA locally — the designer/coder SEE the real frames instead
      anchors: wf.length ? { wordFrames: wf, landingFrame: wf[wf.length - 1] } : undefined,
      visualEvidence: ve,
    });
    console.log(`[${mp.momentId}] ${beat.factKind} @${(s / 1000).toFixed(1)}s "${beat.text.slice(0, 70)}" [${mp.lane}]`);

    // CUTAWAY LANE — the system's own motion-backdrop generator IS the render (P1 pass-through law)
    if (mp.lane === 'cutaway-scene') {
      if (!mp.imagery) { summary.push(`${mp.momentId} [cutaway] @${(s / 1000).toFixed(1)}s: NO IMAGERY (contract should have caught)`); continue; }
      try {
        const mb = await generateMotionBackdrop(mp.imagery, { brand: INSTURIX, canvas: { width: W, height: H } });
        const clipPath = path.join(OUT, `${mp.momentId}-cutaway.mp4`);
        fs.writeFileSync(clipPath, mb.bytes);
        const comps: Buffer[] = [];
        for (const [k, at] of (['0.2', '1.0', '1.8'] as const).entries()) {
          const fp = path.join(OUT, `${mp.momentId}-${['intro', 'build', 'settled'][k]}.png`);
          ffmpeg(['-ss', at, '-i', clipPath, '-frames:v', '1', '-vf', `scale=${W}:${H}`, fp]);
          comps.push(fs.readFileSync(fp));
        }
        let j: Record<string, unknown>;
        try { j = await judge(comps, input, true, true); }
        catch (e) { summary.push(`${mp.momentId} [cutaway] @${(s / 1000).toFixed(1)}s: UNJUDGED (clip saved): ${String((e as Error).message).slice(0, 60)}`); continue; }
        const score = (j.faithful === true ? (typeof j.score === 'number' ? j.score : 0) : 0);
        summary.push(`${mp.momentId} [cutaway] @${(s / 1000).toFixed(1)}s: ${score >= JUDGE_THRESHOLD ? 'GENERATED' : 'BELOW GATE'} @ ${score}`);
      } catch (e) { summary.push(`${mp.momentId} [cutaway] @${(s / 1000).toFixed(1)}s: BACKDROP: ${String((e as Error).message).slice(0, 90)}`); }
      continue;
    }

    let assets: Record<string, Uint8Array> | undefined; let extraData: Record<string, unknown> = {};
    if (mp.lane === 'illustrated-overlay' && mp.imagery) {
      try {
        if (mp.imagery.mode === 'motion') {
          const mb = await generateMotionBackdrop(mp.imagery, { brand: INSTURIX, canvas: { width: W, height: H } });
          assets = { 'backdrop.mp4': mb.bytes }; extraData = { backdropSrc: 'backdrop.mp4' };
        } else {
          const bd = await generateStillBackdrop(mp.imagery, { brand: INSTURIX, canvas: { width: W, height: H } });
          assets = { 'backdrop.jpg': bd.bytes }; extraData = { backdropSrc: 'backdrop.jpg' };
        }
      } catch (e) { console.log(`[${mp.momentId}] backdrop gen failed (${String((e as Error).message).slice(0, 80)}) — moment falls to kit-only`); }
    }
    const opaque = designOutputMode(mp, input.placement.region) === 'opaque-scene' && !!assets;
    const renderData = { ...(cand.content as Record<string, unknown>), wordFrames: wf, motionIntensity: motion.intensity, ...extraData };
    const coderInput = { plan: mp, brief: plan.brief, moment: input };
    const anchorFrame = b2.toString('base64');
    const coderParts = buildCoderParts(coderInput, extraData.backdropSrc ? { mimeType: 'image/jpeg', data: assets && 'backdrop.jpg' in (assets) ? Buffer.from(assets['backdrop.jpg']).toString('base64') : anchorFrame } : undefined);
    const sess = extraData.backdropSrc ? coderParts : [...coderParts.slice(0, 1), { kind: 'text' as const, text: 'FOOTAGE FRAME (the real canvas this composes over):' }, { kind: 'image' as const, mimeType: 'image/jpeg', data: anchorFrame }, ...coderParts.slice(1)];

    const attempt = async (feedback?: string): Promise<{ verdict: string; score?: number; issues?: string }> => {
      const generate = async (fb?: string): Promise<string> =>
        gemini(wire(fb ? [...sess.slice(0, -1), { kind: 'text', text: (sess[sess.length - 1] as { text: string }).text + fb }] as MgCoderPart[] : sess as MgCoderPart[]), 32_768);
      let raw: string;
      try { raw = await generate(feedback); }
      catch (e) { return { verdict: `WRITER: ${String((e as Error).message).slice(0, 90)}` }; }
      if (/^DECLINE:/.test(raw.trim())) return { verdict: `DECLINED: ${raw.trim().slice(0, 90)}` };
      let artifact = applyImportPreamble(raw);
      let scan = scanCode(artifact);
      if (!scan.ok) return { verdict: `SCAN: ${scan.reason?.slice(0, 90)}` };
      fs.writeFileSync(path.join(OUT, `${mp.momentId}.tsx`), artifact);
      let render;
      try { render = await renderMomentToWebpFrames({ componentSource: artifact, brand: INSTURIX, data: renderData, assets, width: W, height: H, fps: FPS, durationInFrames: durF }, { expectOpaque: opaque }); }
      catch (e) {
        // ONE bounded crash-repair — production parity (codegen-service licenses a bounded model repair)
        const err = String((e as Error).message).slice(0, 300);
        fs.writeFileSync(path.join(OUT, `${mp.momentId}-crashed.tsx`), artifact); // specimen for the scan rule (P4)
        console.log(`  render crashed → one repair: ${err.slice(0, 90)}`);
        try {
          raw = await generate(`${feedback ?? ''}\n\n<previous_attempt_feedback>\nYour component CRASHED at render time: ${err}\nFix ONLY the crash cause and return the full corrected component.\n</previous_attempt_feedback>`);
          if (/^DECLINE:/.test(raw.trim())) return { verdict: `DECLINED: ${raw.trim().slice(0, 90)}` };
          artifact = applyImportPreamble(raw);
          scan = scanCode(artifact);
          if (!scan.ok) return { verdict: `SCAN(repair): ${scan.reason?.slice(0, 90)}` };
          fs.writeFileSync(path.join(OUT, `${mp.momentId}.tsx`), artifact);
          render = await renderMomentToWebpFrames({ componentSource: artifact, brand: INSTURIX, data: renderData, assets, width: W, height: H, fps: FPS, durationInFrames: durF }, { expectOpaque: opaque });
        } catch (e2) { return { verdict: `RENDER: ${String((e2 as Error).message).slice(0, 110)}` }; }
      }
      try {
        const ph = phases(render.count, INSTURIX);
        const settledIdx = Math.min(render.count - 1, Math.round(ph.resolve + (render.count - ph.resolve) * 0.35));
        const frames = render.files.map((f) => fs.readFileSync(path.join(render.webpDir, f)));
        const sanity = await mgRenderSanityGate(frames[settledIdx], undefined, { expectOpaque: opaque });
        const motion = await mgMotionPresenceGate(frames);
        if (!sanity.pass) return { verdict: `FLOOR sanity: ${sanity.reasons.join(';').slice(0, 90)}` };
        if (!motion.pass) return { verdict: `FLOOR motion: ${motion.reasons.join(';').slice(0, 90)}` };
        const idxs = [Math.round(ph.intro), Math.round(ph.build), settledIdx];
        const comps: Buffer[] = [];
        for (const [k, fi] of idxs.entries()) {
          const overlay = await sharp(frames[Math.max(0, Math.min(render.count - 1, fi))]).resize(W, H, { fit: 'fill' }).png().toBuffer();
          const comp = opaque ? await sharp(overlay).png().toBuffer() : await sharp(b2).resize(W, H, { fit: 'cover' }).composite([{ input: overlay }]).png().toBuffer();
          fs.writeFileSync(path.join(OUT, `${mp.momentId}-${['intro', 'build', 'settled'][k]}.png`), comp);
          comps.push(comp);
        }
        // A judge failure must never lose a RENDERED moment (MrBeast b2 died to quota exhaustion here):
        // the frames are saved — record UNJUDGED and keep the clip alive.
        let j: Record<string, unknown>;
        try { j = await judge(comps, input, opaque); }
        catch (e) { return { verdict: `UNJUDGED (render saved): ${String((e as Error).message).slice(0, 60)}` }; }
        const score = (j.faithful === true ? (typeof j.score === 'number' ? j.score : 0) : 0);
        return { verdict: score >= JUDGE_THRESHOLD ? `GENERATED @ ${score}` : `BELOW GATE @ ${score}`, score, issues: Array.isArray(j.issues) ? (j.issues as string[]).join('; ').slice(0, 160) : '' };
      } finally { await cleanupWorkspace(render.workspaceDir).catch(() => undefined); }
    };
    let a1 = await attempt();
    console.log(`  attempt 1: ${a1.verdict}${a1.issues ? ` | ${a1.issues}` : ''}`);
    // Floor kills get a second chance too (P4 run-2: 3 moments died on the motion floor with NO revision —
    // the floor verdict returns before judging, so the issues-gated revision never fired).
    const floorFail = a1.verdict.startsWith('FLOOR');
    if ((a1.verdict.startsWith('BELOW GATE') && a1.issues) || floorFail) {
      const fb = floorFail
        ? `A deterministic floor rejected your render: ${a1.verdict}. The build phase must VISIBLY animate — entrances span frames (enter/stagger/Reveal with at + dur from phases), the composition progresses between the intro and settled thirds, and the settled hold keeps subtle ambient life. KEEP the design; fix ONLY the motion.`
        : `A design reviewer scored your output ${a1.score}/10. Issues: ${a1.issues}. KEEP EVERYTHING THAT WORKED; change ONLY what is named. Return the full component.`;
      const a2 = await attempt(`\n\n<previous_attempt_feedback>\n${fb}\n</previous_attempt_feedback>`);
      console.log(`  attempt 2: ${a2.verdict}${a2.issues ? ` | ${a2.issues}` : ''}`);
      if ((a2.score ?? 0) > (a1.score ?? 0)) a1 = a2; // best-of (the P4 fix, live here)
    }
    summary.push(`${mp.momentId} [${mp.lane}] @${(s / 1000).toFixed(1)}s "${beat.text.slice(0, 50)}": ${a1.verdict}`);
  }

  console.log(`\n=== REAL-FOOTAGE E2E SUMMARY (${((Date.now() - t0) / 60000).toFixed(1)} min · ${W}x${H} · budget ${plan.moments.length}/${budget.maxMoments}) — the SYSTEM made every decision ===`);
  for (const s of summary) console.log(`  ${s}`);
  console.log(`gallery → ${OUT}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('THREW:', String(e?.message || e).slice(0, 500)); process.exit(1); });
