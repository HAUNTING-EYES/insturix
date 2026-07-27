// craft-and-render.mjs — the single-worker explainer pipeline (U3 "craft loop as worker" + render).
//
// One Node worker makes one video: CRAFT (agent writes bespoke scenes, render→look→fix) → RENDER (per-video
// deploy + Lambda) → MP4. This is what the saas-explainer finalize route (Phase 2) enqueues. It runs the two
// PROVEN scripts as child processes (no risky JS→TS re-port) and prints the final MP4 URL as the last line.
//
// INPUTS (written by the caller before invoking — the director→plan mapping + brand feed):
//   out/plan.json            — the scene plan (director contract mapped to {fps, transitionFrames, scenes[]})
//   out/product-model.json   — the Brand Vault product model (brand tokens + product screens + aha flow)
//   public/product/*.png      — real brand screenshots from Brand Vault (optional; else scenes recreate UI)
//
// ENV: ANTHROPIC_API_KEY (craft) + AWS creds + REMOTION_LAMBDA_FUNCTION_NAME / REMOTION_AWS_REGION (render).
//
// RUN:  node scripts/craft-and-render.mjs <videoId>
// OUT:  a final line `EXPLAINER_MP4=<url>` the worker parses; non-zero exit on failure (fail loud).

import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';

const VIDEO_ID = (process.argv[2] || `v${process.pid}`).replace(/[^a-z0-9-]/gi, '').slice(0, 40);

if (!existsSync('out/plan.json')) { console.error('✗ out/plan.json missing — write the director plan first.'); process.exit(1); }

// run a child script, inheriting env + streaming its stdout/stderr; capture stdout so we can parse the MP4 url.
function run(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {stdio: ['ignore', 'pipe', 'inherit'], env: process.env});
    let out = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${script} exited ${code}`))));
  });
}

(async () => {
  console.log(`\n=== [1/3] VO + music prep (synth Ava + fit scene durations) ===`);
  await run('scripts/prep-audio.mjs'); // runs BEFORE craft: it rewrites out/plan.json durations to hold the VO

  console.log(`\n=== [2/3] CRAFT scenes for ${VIDEO_ID} ===`);
  await run('scripts/agent-craft.mjs');

  // Free health check: agent-craft (CRAFT_SMOKE=1) proved bundle+Chromium with no model calls — stop before the
  // paid Lambda render (which would cost $ and produce a garbage one-scene film).
  if (process.env.CRAFT_SMOKE === '1') { console.log('\nCRAFT_SMOKE — skipping Lambda render (health check only).'); process.exit(0); }

  console.log(`\n=== [3/3] RENDER on Lambda ===`);
  const renderOut = await run('scripts/lambda-render.mjs', [VIDEO_ID]);

  // lambda-render prints `✓ done → <url>` — lift the MP4 url out for the worker.
  const m = renderOut.match(/done\s*→\s*(https?:\/\/\S+\.mp4)/);
  if (!m) { console.error('✗ could not find the rendered MP4 url in render output.'); process.exit(1); }
  console.log(`\nEXPLAINER_MP4=${m[1]}`);
})().catch((e) => { console.error(e); process.exit(1); });
