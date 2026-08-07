/**
 * MG codegen LATENCY probe. Measures the wall-clock of a single GLM-5V-turbo component-writing call under the
 * real production config (3 footage images + de-inflated prompt), and isolates the cost of `thinking` and images.
 * Answers: how long does ONE motion graphic actually take to generate, and what makes it slow?
 *   MG_EVAL_SCRATCH=<dir with footage + .env.zai> npx tsx scripts/prompt-optimization/mg-latency-probe.ts
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(REPO, '.env.local') });
const SCRATCH = process.env.MG_EVAL_SCRATCH!;
dotenv.config({ path: path.join(SCRATCH, '.env.zai') });

import { buildCodegenPrompt } from '../../lib/editron/motion-graphics/codegen/codegen-service';
import { INSTURIX } from '../../lib/editron/motion-graphics/codegen/kit/brand';
import type { MgMomentInput } from '../../lib/editron/motion-graphics/codegen/types';

const img = (f: string) => `data:image/jpeg;base64,${fs.readFileSync(path.join(SCRATCH, f)).toString('base64')}`;
const FRAMES = ['footage-a.jpg', 'footage-b.jpg', 'footage-c.jpg'].map(img);

const moment: MgMomentInput = {
  momentId: 'lat', brand: INSTURIX,
  candidate: {
    id: 'c', factKind: 'concept',
    sourceSpan: { text: 'onboarding is ten times faster', startMs: 0, endMs: 1200, source: 'voiceover-transcript' },
    content: { keyword: 'onboarding', body: 'ten times faster' }, evidenceKeys: ['x'], licenses: ['source-span'],
    salience: 0.6, rhetoricalRole: 'claim', hardGate: { passed: true, reasons: ['ok'], blockedBy: [] },
    scoreInputs: { structuralStrength: 0.6, salience: 0.6, evidenceStrength: 0.5, renderRisk: 0.2 },
  },
  window: { startFrame: 0, endFrame: 60, fps: 30 },
  expressiveness: { tier: 'subtle', intensity: 0.35, emphasisScale: 1 },
  placement: { region: 'full-frame', avoid: [], prefer: [{ x: 0.42, y: 0.46, width: 0.5, height: 0.3, reason: 'room' }] },
};

async function call(label: string, opts: { thinking: boolean; images: boolean }): Promise<void> {
  const baseUrl = process.env.ZAI_BASE_URL?.trim() || 'https://api.z.ai/api/paas/v4';
  const prompt = buildCodegenPrompt(moment);
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  if (opts.images) FRAMES.forEach((u, i) => { content.push({ type: 'text', text: `FRAME ${i + 1}` }); content.push({ type: 'image_url', image_url: { url: u } }); });
  content.push({ type: 'text', text: prompt });
  const body: Record<string, unknown> = {
    model: 'glm-5v-turbo', messages: [{ role: 'user', content: opts.images ? content : prompt }],
    stream: false, do_sample: false, max_tokens: 32_768, response_format: { type: 'text' },
  };
  if (opts.thinking) body.thinking = { type: 'enabled', clear_thinking: true };
  else body.thinking = { type: 'disabled' };

  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.ZAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: Record<string, number> };
  const ms = Date.now() - t0;
  const out = j.choices?.[0]?.message?.content ?? '';
  console.log(`${label.padEnd(28)} ${(ms / 1000).toFixed(1)}s  http:${res.status}  outChars:${out.length}  tokens:${JSON.stringify(j.usage ?? {})}`);
}

async function main() {
  console.log('MG codegen latency — glm-5v-turbo, one call each:\n');
  await call('thinking ON + 3 images', { thinking: true, images: true });
  await call('thinking OFF + 3 images', { thinking: false, images: true });
  await call('thinking OFF + no images', { thinking: false, images: false });
  console.log('\n(Production sends thinking ON + 3 images. If OFF is much faster, that is the lever.)');
}
main().catch((e) => { console.error(e); process.exit(1); });
