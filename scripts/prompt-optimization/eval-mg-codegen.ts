/**
 * MG Codegen prompt eval (Rule 35 gate). Feeds real licensed FACTS (SemanticMgCandidate + context) through the
 * COMMITTED buildCodegenPrompt → a model → scanCode. Question: does the type-free, grounded prompt reliably
 * produce scan-passing, compile-ready, faithful (no baked literals) components BEFORE the seam wires it live?
 *
 * Runs on grok-4 (XAI_API_KEY in .env.local) — NOT Claude (guard the creds; prod uses Claude).
 * Uncommitted (scripts/); reuses the committed modules, zero duplicated logic.
 *   npx tsx scripts/prompt-optimization/eval-mg-codegen.ts [--model=grok-4] [--seeds=1]
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { buildCodegenPrompt, applyImportPreamble } from '../../lib/editron/motion-graphics/codegen/codegen-service';
import { scanCode } from '../../lib/editron/motion-graphics/codegen/scan';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';
import type { MgMomentInput } from '../../lib/editron/motion-graphics/codegen/types';
import type { SemanticMgCandidate, SemanticMgFactKind } from '../../lib/editron/motion-graphics/engine/semantic-mg-candidates';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const KEY = process.env.XAI_API_KEY;
if (!KEY) { console.error('No XAI_API_KEY in .env.local'); process.exit(1); }
const arg = (n: string, d: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const MODEL = arg('model', 'grok-4');
const SEEDS = parseInt(arg('seeds', '1'), 10);
const OUT_DIR = path.resolve(__dirname, '../../../.mg-eval-out'); // gitignored scratch, outside the tree
fs.mkdirSync(OUT_DIR, { recursive: true });

async function callLLM(prompt: string, seed: number): Promise<string> {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0, seed }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? '';
}

/** Strip markdown fences / prose — keep just the component source. */
function extractCode(raw: string): string {
  const fence = raw.match(/```(?:tsx?|typescript|jsx?)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : raw;
  return body.trim();
}

function candidate(factKind: SemanticMgFactKind, content: Record<string, unknown>, sourceText: string): SemanticMgCandidate {
  return {
    id: `smg_${factKind}`,
    factKind,
    sourceSpan: { text: sourceText, startMs: 0, endMs: 1200, source: 'voiceover-transcript' },
    content,
    evidenceKeys: ['part:v:primary-value'],
    licenses: ['source-span'],
    salience: 0.62,
    rhetoricalRole: 'claim',
    hardGate: { passed: true, reasons: ['licensed-by-content-facts'], blockedBy: [] },
    scoreInputs: { structuralStrength: 0.62, salience: 0.62, evidenceStrength: 0.5, renderRisk: 0.2 },
  };
}

function moment(id: string, cand: SemanticMgCandidate): MgMomentInput {
  return {
    momentId: id,
    candidate: cand,
    brand: INSTURIX,
    window: { startFrame: 0, endFrame: 90, fps: 30 },
    anchors: { wordFrames: [12, 40], landingFrame: 40 },
    expressiveness: { tier: 'hero', intensity: 0.8, emphasisScale: 1.3 },
    placement: {
      region: 'bottom-center',
      avoid: [{ x: 0.28, y: 0.1, width: 0.44, height: 0.6, reason: 'main-subject' }],
      prefer: [{ x: 0, y: 0.72, width: 1, height: 0.28, reason: 'negative-space' }],
    },
  };
}

// bakedGuard = distinctive literals that MUST NOT appear in the code (the component reads them from `data`).
const CASES: { id: string; input: MgMomentInput; bakedGuard: string[] }[] = [
  { id: 'percent', input: moment('p', candidate('bounded-stat', { value: 43, unit: '%', label: 'preferred it in a blind test' }, '43 of 50 preferred it')), bakedGuard: ['43'] },
  { id: 'comparison', input: moment('c', candidate('comparison', { from: 480, to: 20, fromLabel: 'Before', toLabel: 'After', unit: 's', label: 'to edit one video' }, 'from 8 minutes to 20 seconds')), bakedGuard: ['480'] },
  { id: 'big-number', input: moment('b', candidate('magnitude-stat', { value: 1000000, unit: '+', label: 'videos made' }, 'over a million videos')), bakedGuard: ['1000000'] },
  { id: 'concept', input: moment('k', candidate('concept', { keyword: 'onboarding', body: 'ten times faster' }, 'onboarding is ten times faster')), bakedGuard: [] },
];

async function main() {
  console.log(`MG codegen prompt eval — ${MODEL}, ${CASES.length} cases × ${SEEDS} seed(s)\n`);
  let pass = 0; let total = 0; let ready = 0; let clean = 0; let declines = 0;
  for (const c of CASES) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      total++;
      const prompt = buildCodegenPrompt(c.input);
      let code = '';
      try { code = extractCode(await callLLM(prompt, seed)); } catch (e) { console.log(`${c.id.padEnd(11)} s${seed}  THROW ${(e as Error).message.slice(0, 60)}`); continue; }
      if (/^DECLINE:/.test(code.trim())) { declines++; console.log(`${c.id.padEnd(11)} s${seed}  DECLINED → ${code.trim().slice(0, 70)}`); continue; }
      const scan = scanCode(code);
      const artifact = applyImportPreamble(code);
      const compileReady = /^import React from 'react';/.test(artifact) && artifact.includes('./kit/choreo') && scanCode(artifact).ok;
      const parametric = /data\.\w+/.test(code);
      const baked = c.bakedGuard.filter((v) => new RegExp(`(?<![\\d.])${v}(?![\\d.])`).test(code)); // distinctive literal baked in?
      fs.writeFileSync(path.join(OUT_DIR, `${c.id}-s${seed}.tsx`), artifact);
      if (scan.ok) pass++;
      if (compileReady) ready++;
      if (baked.length === 0) clean++;
      console.log(`${c.id.padEnd(11)} s${seed}  scan:${scan.ok ? 'PASS' : 'FAIL'}  imports:${compileReady ? 'ok' : 'MISSING'}  parametric:${parametric ? 'y' : 'n'}  grounded:${baked.length === 0 ? 'y' : `BAKED ${baked.join(',')}`}  ${scan.ok ? `(${code.length}b)` : `→ ${scan.reason}`}`);
    }
  }
  console.log(`\n=== scan-pass ${pass}/${total} | compile-ready ${ready}/${total} | grounded(no-baked-literal) ${clean}/${total} | declines ${declines} ===`);
  console.log('(Rule 35 gate: high scan-pass + grounded — the prompt must produce faithful, compile-ready components.)');
}

main().catch((e) => { console.error(e); process.exit(1); });
